/**
 * Tipologia Worker
 *
 * Worker responsável por classificar estabelecimentos em tipologias PepsiCo
 * usando IA com TODAS as informações coletadas no pipeline:
 * - Dados do Google Places (rating, reviews, tipo)
 * - Análises de fotos (ambiente, branding, público)
 * - Dados da Receita Federal (razão social, CNPJ)
 * - Localização e contexto geográfico
 *
 * 🎯 Tipologias PepsiCo (76 tipos):
 * - F1, F2, H1, H2, H3, etc.
 */

import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { tipologiaQueue } from '../queues/queue.config';
import Anthropic from '@anthropic-ai/sdk';
import { getAllTipologias, getTipologia } from '../config/tipologia-mapping';

const prisma = new PrismaClient();

interface TipologiaJobData {
  clienteId: string;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Processar job de classificação de tipologia
tipologiaQueue.process('classify-tipologia', async (job: Job<TipologiaJobData>) => {
  const { clienteId } = job.data;

  console.log(`\n🏷️  ===== INICIANDO CLASSIFICAÇÃO DE TIPOLOGIA =====`);
  console.log(`   Cliente ID: ${clienteId}`);

  try {
    // Buscar TODAS as informações do cliente
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
    });

    if (!cliente) {
      throw new Error(`Cliente ${clienteId} não encontrado`);
    }

    console.log(`   Cliente: ${cliente.nome}`);
    console.log(`   Cidade: ${cliente.cidade}, ${cliente.estado}`);

    // Verificar se tem dados mínimos para classificar
    if (!cliente.placeId) {
      console.warn(`⚠️  Cliente sem dados do Google Places - tipologia limitada`);
    }

    // Montar contexto completo para a IA
    const contexto = montarContextoCompleto(cliente);

    const temFotos = (cliente.totalFotosDisponiveis || 0) > 0;
    const temPlaces = !!cliente.placeId;

    console.log(`\n📊 Contexto montado:`);
    console.log(`   - Google Places: ${temPlaces ? '✅ Sim' : '❌ Não'}`);
    console.log(`   - Fotos disponíveis: ${cliente.totalFotosDisponiveis || 0} ${temFotos ? '✅' : '⚠️  (confiança reduzida)'}`);
    console.log(`   - Rating: ${cliente.rating || 'N/A'}`);
    console.log(`   - Tipo Places: ${cliente.tipoEstabelecimento || 'N/A'}`);

    if (!temFotos && !temPlaces) {
      console.log(`   ⚠️  ATENÇÃO: Cliente sem fotos e sem Places - classificação baseada apenas em dados básicos`);
    } else if (!temFotos) {
      console.log(`   ℹ️  Cliente sem fotos - classificação baseada em Google Places e dados da Receita`);
    }

    // Chamar IA para classificar
    console.log(`\n🤖 Chamando Claude para classificar tipologia...`);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      temperature: 0.3, // Mais determinístico
      messages: [
        {
          role: 'user',
          content: criarPromptTipologia(contexto),
        },
      ],
    });

    const resultado = extrairTipologia(response);

    console.log(`\n✅ Tipologia classificada:`);
    console.log(`   Código: ${resultado.codigo}`);
    console.log(`   Nome: ${resultado.nome}`);
    console.log(`   Confiança: ${resultado.confianca}%`);
    console.log(`   Justificativa: ${resultado.justificativa}`);

    // Salvar no banco
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        tipologia: resultado.codigo,
        tipologiaNome: resultado.nome,
        tipologiaConfianca: resultado.confianca,
        tipologiaJustificativa: resultado.justificativa,
        tipologiaProcessadoEm: new Date(),
      },
    });

    console.log(`======================================\n`);

    return {
      success: true,
      clienteId,
      tipologia: resultado.codigo,
      confianca: resultado.confianca,
    };
  } catch (error: any) {
    console.error(`❌ Erro ao classificar tipologia:`, error);

    // Marcar como erro no banco
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        tipologiaErro: error.message,
      },
    });

    throw error;
  }
});

/**
 * Monta contexto completo do cliente para a IA
 */
function montarContextoCompleto(cliente: any): string {
  const partes: string[] = [];

  // 1. Informações básicas
  partes.push(`**Nome**: ${cliente.nome}`);
  partes.push(`**Razão Social**: ${cliente.razaoSocial || 'N/A'}`);
  partes.push(`**Cidade**: ${cliente.cidade}, ${cliente.estado}`);

  // 2. Google Places
  if (cliente.placeId) {
    partes.push(`\n**Google Places**:`);
    partes.push(`- Tipo: ${cliente.tipoEstabelecimento || 'N/A'}`);
    partes.push(`- Rating: ${cliente.rating || 'N/A'}/5`);
    partes.push(`- Total Avaliações: ${cliente.totalAvaliacoes || 0}`);
    partes.push(`- Website: ${cliente.websitePlace ? 'Sim' : 'Não'}`);
  }

  // 3. Análises de fotos (Sprint 2)
  if (cliente.ambienteEstabelecimento || cliente.publicoAlvo || cliente.presencaBranding) {
    partes.push(`\n**Análise de Fotos** (${cliente.totalFotosDisponiveis || 0} fotos):`);

    if (cliente.ambienteEstabelecimento) {
      partes.push(`- Ambiente: ${cliente.ambienteEstabelecimento}`);
    }
    if (cliente.publicoAlvo) {
      partes.push(`- Público: ${cliente.publicoAlvo}`);
    }
    if (cliente.presencaBranding) {
      partes.push(`- Presença de Branding: ${cliente.presencaBranding ? 'Sim' : 'Não'}`);
    }
    if (cliente.qualidadeSinalizacao) {
      partes.push(`- Qualidade Sinalização: ${cliente.qualidadeSinalizacao}`);
    }
    if (cliente.nivelProfissionalizacao) {
      partes.push(`- Nível Profissionalização: ${cliente.nivelProfissionalizacao}`);
    }
  }

  // 4. Scoring/Potencial
  if (cliente.potencialCategoria) {
    partes.push(`\n**Potencial Digital**: ${cliente.potencialCategoria}`);
  }

  return partes.join('\n');
}

/**
 * Cria prompt para classificar tipologia
 */
function criarPromptTipologia(contexto: string): string {
  return `Você é um especialista em classificação de pontos de venda (PDVs) para a PepsiCo.

Sua tarefa é classificar o estabelecimento abaixo em UMA das 76 tipologias PepsiCo.

**DADOS DO ESTABELECIMENTO:**
${contexto}

**TIPOLOGIAS DISPONÍVEIS:**
${getAllTipologias().map(t => `- ${t.codigo}: ${t.nome} (${t.descricao || ''})`).join('\n')}

**INSTRUÇÕES:**
1. Analise TODAS as informações disponíveis
2. Escolha a tipologia que MELHOR se encaixa
3. Se houver dúvida entre 2 tipologias, escolha a mais específica
4. Retorne EXATAMENTE no formato JSON:

{
  "codigo": "código da tipologia (ex: F1, H3)",
  "nome": "nome completo da tipologia",
  "confianca": número de 0-100,
  "justificativa": "explicação breve (1-2 frases)"
}

IMPORTANTE: Retorne APENAS o JSON, sem texto adicional.`;
}

/**
 * Extrai tipologia da resposta da IA
 */
function extrairTipologia(response: any): {
  codigo: string;
  nome: string;
  confianca: number;
  justificativa: string;
} {
  try {
    const textContent = response.content.find((c: any) => c.type === 'text');
    if (!textContent) {
      throw new Error('Resposta da IA sem conteúdo texto');
    }

    const text = textContent.text.trim();

    // Extrair JSON da resposta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Resposta da IA não contém JSON válido');
    }

    const resultado = JSON.parse(jsonMatch[0]);

    // Validar campos obrigatórios
    if (!resultado.codigo || !resultado.nome || resultado.confianca === undefined) {
      throw new Error('JSON da IA está incompleto');
    }

    return {
      codigo: resultado.codigo,
      nome: resultado.nome,
      confianca: Math.round(resultado.confianca),
      justificativa: resultado.justificativa || '',
    };
  } catch (error: any) {
    console.error('Erro ao extrair tipologia:', error);

    // Fallback: tentar pegar qualquer tipologia mencionada
    const textContent = response.content.find((c: any) => c.type === 'text');
    const text = textContent?.text || '';

    // Procurar código de tipologia (F1, H3, etc)
    const codigoMatch = text.match(/([A-Z]\d+)/);

    if (codigoMatch) {
      const codigo = codigoMatch[1];
      const tipologia = getTipologia(codigo);

      if (tipologia) {
        return {
          codigo: tipologia.codigo,
          nome: tipologia.nome,
          confianca: 50,
          justificativa: 'Classificação com baixa confiança - erro ao processar resposta da IA',
        };
      }
    }

    // Fallback final: tipologia genérica
    return {
      codigo: 'OUTROS',
      nome: 'Outros',
      confianca: 30,
      justificativa: 'Não foi possível classificar com confiança',
    };
  }
}

console.log('👷 Worker de Tipologia iniciado');

export default tipologiaQueue;

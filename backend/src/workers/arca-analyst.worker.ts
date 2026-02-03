/**
 * Arca Analyst Worker
 *
 * Agente de IA que valida e analisa cadastros de forma holistica.
 * Substitui o worker de tipologia com uma analise mais completa.
 *
 * PRINCIPIO FUNDAMENTAL:
 * - O unico dado confiavel da planilha e o CNPJ/CPF
 * - Todo o restante deve ser validado por fontes externas
 * - O agente cruza TODAS as fontes e da seu veredito
 */

import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { tipologiaQueue } from '../queues/queue.config';
import { dataSourceService, ContextoArcaAnalyst } from '../services/data-source.service';
import Anthropic from '@anthropic-ai/sdk';

const prisma = new PrismaClient();

interface ArcaAnalystJobData {
  clienteId: string;
  loteId?: string;
}

interface VereditoArca {
  // Veredito geral
  status: 'APROVADO' | 'APROVADO_COM_RESSALVAS' | 'REPROVADO' | 'REQUER_REVISAO';
  confiancaGeral: number; // 0-100

  // Analise de dados
  dadosConfiados: string[];
  dadosNaoConfiados: string[];
  divergenciasEncontradas: string[];

  // Alertas
  alertasCriticos: string[];
  alertasSecundarios: string[];

  // Recomendacoes
  recomendacoes: string[];

  // Resumo executivo
  resumoExecutivo: string;

  // Tipologia (mantido para compatibilidade)
  tipologia?: string;
  tipologiaNome?: string;
  tipologiaConfianca?: number;
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Processar job de analise Arca
tipologiaQueue.process('classify-tipologia', async (job: Job<ArcaAnalystJobData>) => {
  const { clienteId, loteId } = job.data;

  console.log(`\n🦅 ===== ARCA ANALYST - INICIANDO ANALISE =====`);
  console.log(`   Cliente ID: ${clienteId}`);

  try {
    // 1. Obter contexto completo de fontes
    const contexto = await dataSourceService.buildSourceMap(clienteId);

    console.log(`   Documento Ancora: ${contexto.cliente.documentoAncora}`);
    console.log(`   Tipo: ${contexto.cliente.tipoDocumento}`);
    console.log(`   Score de Fontes: ${contexto.resumo.scoreGeral}%`);
    console.log(`   Fontes Validadas: ${contexto.resumo.fontesValidadas.join(', ') || 'Nenhuma'}`);

    // 2. Buscar dados adicionais do cliente
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      include: { fotos: true },
    });

    if (!cliente) {
      throw new Error(`Cliente ${clienteId} nao encontrado`);
    }

    // 3. Chamar IA para analise holistica
    console.log(`\n🤖 Chamando Claude para analise holistica...`);

    const prompt = criarPromptArcaAnalyst(contexto, cliente);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 2048,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const veredito = extrairVeredito(response);

    console.log(`\n✅ VEREDITO ARCA ANALYST:`);
    console.log(`   Status: ${veredito.status}`);
    console.log(`   Confianca Geral: ${veredito.confiancaGeral}%`);
    console.log(`   Alertas Criticos: ${veredito.alertasCriticos.length}`);
    console.log(`   Resumo: ${veredito.resumoExecutivo.slice(0, 100)}...`);

    // 4. Salvar no banco
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        // Campos do Arca Analyst
        arcaStatus: veredito.status,
        arcaConfianca: veredito.confiancaGeral,
        arcaResumo: veredito.resumoExecutivo,
        arcaAlertasCriticos: JSON.stringify(veredito.alertasCriticos),
        arcaAlertasSecundarios: JSON.stringify(veredito.alertasSecundarios),
        arcaRecomendacoes: JSON.stringify(veredito.recomendacoes),
        arcaDivergencias: JSON.stringify(veredito.divergenciasEncontradas),
        arcaProcessadoEm: new Date(),

        // Manter compatibilidade com tipologia
        tipologia: veredito.tipologia || null,
        tipologiaNome: veredito.tipologiaNome || null,
        tipologiaConfianca: veredito.tipologiaConfianca || null,
        tipologiaJustificativa: veredito.resumoExecutivo,
        tipologiaProcessadoEm: new Date(),
      },
    });

    console.log(`======================================\n`);

    return {
      success: true,
      clienteId,
      status: veredito.status,
      confianca: veredito.confiancaGeral,
    };
  } catch (error: any) {
    console.error(`❌ Erro no Arca Analyst:`, error);

    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        arcaStatus: 'ERRO',
        arcaResumo: error.message,
        tipologiaErro: error.message,
      },
    });

    throw error;
  }
});

/**
 * Cria prompt para o Arca Analyst
 */
function criarPromptArcaAnalyst(contexto: ContextoArcaAnalyst, cliente: any): string {
  const mapa = contexto.mapaFontes;
  const resumo = contexto.resumo;

  // Formatar mapa de fontes
  const fontesFormatadas = Object.entries(mapa)
    .map(([campo, info]) => {
      const divergencia = info.divergencia ? ` ⚠️ ${info.divergencia}` : '';
      return `- ${info.label}: ${info.valor || 'N/A'} [Fonte: ${info.fonte}, Confiança: ${info.confianca}%]${divergencia}`;
    })
    .join('\n');

  // Formatar dados da planilha original
  const planilhaOriginal = `
- Nome: ${contexto.dadosPlanilha.nome || 'N/A'}
- Endereco: ${contexto.dadosPlanilha.endereco || 'N/A'}
- Telefone: ${contexto.dadosPlanilha.telefone || 'N/A'}
- Cidade: ${contexto.dadosPlanilha.cidade || 'N/A'}
- Estado: ${contexto.dadosPlanilha.estado || 'N/A'}`;

  // Formatar dados validados
  const dadosValidadosFormatados = [];

  if (contexto.dadosValidados.cnpja) {
    dadosValidadosFormatados.push(`
**CNPJA (Receita Federal):**
- Razao Social: ${contexto.dadosValidados.cnpja.razaoSocial || 'N/A'}
- Nome Fantasia: ${contexto.dadosValidados.cnpja.nomeFantasia || 'N/A'}
- Situacao: ${contexto.dadosValidados.cnpja.situacao || 'N/A'}
- Endereco: ${contexto.dadosValidados.cnpja.endereco || 'N/A'}
- Simples Nacional: ${contexto.dadosValidados.cnpja.simplesNacional ? 'Sim' : 'Nao'}
- MEI: ${contexto.dadosValidados.cnpja.meiOptante ? 'Sim' : 'Nao'}
- Porte: ${contexto.dadosValidados.cnpja.porteEmpresa || 'N/A'}`);
  }

  if (contexto.dadosValidados.googlePlaces) {
    dadosValidadosFormatados.push(`
**Google Places:**
- Rating: ${contexto.dadosValidados.googlePlaces.rating || 'N/A'}/5
- Avaliacoes: ${contexto.dadosValidados.googlePlaces.totalAvaliacoes || 0}
- Telefone: ${contexto.dadosValidados.googlePlaces.telefone || 'N/A'}
- Website: ${contexto.dadosValidados.googlePlaces.website || 'N/A'}
- Tipo: ${contexto.dadosValidados.googlePlaces.tipoEstabelecimento || 'N/A'}`);
  }

  if (contexto.dadosValidados.claudeVision) {
    dadosValidadosFormatados.push(`
**Analise Visual (IA):**
- Publico Alvo: ${contexto.dadosValidados.claudeVision.publicoAlvo || 'N/A'}
- Ambiente: ${contexto.dadosValidados.claudeVision.ambienteEstabelecimento || 'N/A'}
- Profissionalizacao: ${contexto.dadosValidados.claudeVision.nivelProfissionalizacao || 'N/A'}
- Branding: ${contexto.dadosValidados.claudeVision.presencaBranding ? 'Presente' : 'Ausente'}`);
  }

  return `Voce e o ARCA ANALYST, um agente especialista em validacao e analise de cadastros comerciais.

## PRINCIPIO FUNDAMENTAL
O UNICO dado confiavel da planilha e o CNPJ/CPF (documento ancora).
Todo o restante (nome, endereco, telefone) deve ser validado por fontes externas.
Dados da planilha que NAO foram validados tem confianca de apenas 30%.

## DADOS DO CADASTRO

**Documento Ancora (unico dado confiavel da planilha):**
${contexto.cliente.tipoDocumento}: ${contexto.cliente.documentoAncora}

**Dados ORIGINAIS da Planilha (NAO CONFIAVEIS sem validacao):**
${planilhaOriginal}

**Score de Confiabilidade Atual:** ${resumo.scoreGeral}%
**Classificacao:** ${resumo.classificacao}
**Fontes Validadas:** ${resumo.fontesValidadas.join(', ') || 'Nenhuma'}

## MAPA DE FONTES (origem de cada dado)
${fontesFormatadas}

## DADOS VALIDADOS POR FONTES EXTERNAS
${dadosValidadosFormatados.join('\n') || 'Nenhum dado validado por fonte externa'}

## ALERTAS JA IDENTIFICADOS
${resumo.alertas.length > 0 ? resumo.alertas.join('\n') : 'Nenhum alerta'}

## DIVERGENCIAS JA IDENTIFICADAS
${resumo.divergencias.length > 0 ? resumo.divergencias.join('\n') : 'Nenhuma divergencia'}

## SUA TAREFA
Analise TODAS as informacoes acima e forneca seu veredito no formato JSON:

{
  "status": "APROVADO" | "APROVADO_COM_RESSALVAS" | "REPROVADO" | "REQUER_REVISAO",
  "confiancaGeral": numero 0-100,
  "dadosConfiados": ["lista de dados que podem ser confiados"],
  "dadosNaoConfiados": ["lista de dados sem validacao externa"],
  "divergenciasEncontradas": ["divergencias entre fontes"],
  "alertasCriticos": ["problemas graves que impedem aprovacao"],
  "alertasSecundarios": ["problemas menores para atencao"],
  "recomendacoes": ["acoes sugeridas para melhorar o cadastro"],
  "resumoExecutivo": "Resumo de 2-3 frases do veredito",
  "tipologia": "codigo tipologia PepsiCo se aplicavel (F1, H3, etc)",
  "tipologiaNome": "nome da tipologia",
  "tipologiaConfianca": numero 0-100
}

## CRITERIOS DE DECISAO
- **APROVADO**: Score >= 80%, sem alertas criticos, dados principais validados
- **APROVADO_COM_RESSALVAS**: Score 60-79%, alguns dados nao validados mas sem divergencias graves
- **REQUER_REVISAO**: Score 40-59%, divergencias encontradas que precisam verificacao humana
- **REPROVADO**: Score < 40%, alertas criticos (situacao inativa na Receita, divergencias graves, etc)

Retorne APENAS o JSON, sem texto adicional.`;
}

/**
 * Extrai veredito da resposta da IA
 */
function extrairVeredito(response: any): VereditoArca {
  try {
    const textContent = response.content.find((c: any) => c.type === 'text');
    if (!textContent) {
      throw new Error('Resposta da IA sem conteudo texto');
    }

    const text = textContent.text.trim();

    // Extrair JSON da resposta
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Resposta da IA nao contem JSON valido');
    }

    const resultado = JSON.parse(jsonMatch[0]);

    return {
      status: resultado.status || 'REQUER_REVISAO',
      confiancaGeral: Math.round(resultado.confiancaGeral || 50),
      dadosConfiados: resultado.dadosConfiados || [],
      dadosNaoConfiados: resultado.dadosNaoConfiados || [],
      divergenciasEncontradas: resultado.divergenciasEncontradas || [],
      alertasCriticos: resultado.alertasCriticos || [],
      alertasSecundarios: resultado.alertasSecundarios || [],
      recomendacoes: resultado.recomendacoes || [],
      resumoExecutivo: resultado.resumoExecutivo || 'Analise inconclusiva',
      tipologia: resultado.tipologia,
      tipologiaNome: resultado.tipologiaNome,
      tipologiaConfianca: resultado.tipologiaConfianca,
    };
  } catch (error: any) {
    console.error('Erro ao extrair veredito:', error);

    return {
      status: 'REQUER_REVISAO',
      confiancaGeral: 40,
      dadosConfiados: [],
      dadosNaoConfiados: [],
      divergenciasEncontradas: [],
      alertasCriticos: ['Erro ao processar analise da IA'],
      alertasSecundarios: [],
      recomendacoes: ['Revisar cadastro manualmente'],
      resumoExecutivo: 'Erro ao processar analise. Requer revisao manual.',
    };
  }
}

console.log('🦅 Worker Arca Analyst iniciado');

export default tipologiaQueue;

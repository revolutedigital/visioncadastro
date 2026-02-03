import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { normalizationQueue, geocodingQueue } from '../queues/queue.config';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { localNormalizerService } from '../services/local-normalizer.service';

const prisma = new PrismaClient();

interface NormalizationJobData {
  clienteId: string;
  loteId?: string;
}

interface NormalizationJobResult {
  success: boolean;
  clienteId: string;
  nome: string;
  enderecoNormalizado?: string;
  cidadeNormalizada?: string;
  estadoNormalizado?: string;
  confianca?: number;
  fonte?: string;
  error?: string;
}

interface NormalizationIAResult {
  endereco: string;
  cidade: string;
  estado: string;
  alteracoes: string[];
}

interface CrossValidationResult {
  enderecoFinal: string;
  cidadeFinal: string;
  estadoFinal: string;
  confianca: number;
  fonte: 'consenso' | 'claude' | 'chatgpt' | 'regex' | 'maioria';
  detalhes: {
    claude?: NormalizationIAResult;
    chatgpt?: NormalizationIAResult;
    regex: {
      endereco: string;
      cidade: string;
      estado: string;
    };
    similaridadeClaudeChatgpt: number;
    similaridadeClaudeRegex: number;
    similaridadeChatgptRegex: number;
    alucinacaoDetectada: boolean;
    divergencias: string[];
  };
}

/**
 * Normalização Worker - CRUZAMENTO TRIPLO
 *
 * Etapa entre Receita Federal e Geocoding
 * Usa 3 fontes para máxima confiabilidade:
 * 1. Claude IA (Anthropic) - Inteligente, pago
 * 2. ChatGPT (OpenAI) - Inteligente, pago
 * 3. Regex Local - Regras fixas, GRÁTIS
 *
 * Confiança:
 * - 100%: 3 fontes concordam (>90% similaridade)
 * - 90%: 2 fontes concordam (Claude + ChatGPT ou Claude + Regex)
 * - 70%: Apenas 1 fonte ou alta divergência
 * - 50%: Fallback para Regex (detectou alucinação)
 */
// Concurrency 5 = normaliza 5 endereços em paralelo
normalizationQueue.process(5, async (job: Job<NormalizationJobData>): Promise<NormalizationJobResult> => {
  const { clienteId, loteId } = job.data;

  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: {
        id: true,
        nome: true,
        endereco: true,
        cidade: true,
        estado: true,
        enderecoReceita: true,
      },
    });

    if (!cliente) {
      throw new Error(`Cliente ${clienteId} não encontrado`);
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 NORMALIZAÇÃO TRIPLA: ${cliente.nome}`);
    console.log(`${'='.repeat(60)}`);

    const enderecoOriginal = cliente.enderecoReceita || cliente.endereco || '';
    const cidadeOriginal = cliente.cidade || '';
    const estadoOriginal = cliente.estado || '';

    console.log(`📍 Endereço original: ${enderecoOriginal || '(VAZIO)'}`);
    console.log(`🏙️  Cidade original: ${cidadeOriginal || '(VAZIO)'}`);
    console.log(`🗺️  Estado original: ${estadoOriginal || '(VAZIO)'}`);
    console.log(`   - enderecoReceita (CNPJA): "${cliente.enderecoReceita || '(NULL)'}"`);
    console.log(`   - endereco (planilha): "${cliente.endereco || '(NULL)'}"`);

    // ===== TRATAMENTO DE ENDEREÇO VAZIO =====
    if (!enderecoOriginal.trim()) {
      console.warn(`⚠️  ENDEREÇO VAZIO para ${cliente.nome}!`);
      console.warn(`   - Não há endereço na planilha E CNPJA não retornou endereço`);
      console.warn(`   - Marcando como INCOMPLETO e encadeando para geocoding mesmo assim`);

      // Salvar status de dados incompletos
      await prisma.cliente.update({
        where: { id: clienteId },
        data: {
          normalizacaoStatus: 'INCOMPLETO',
          normalizacaoProcessadoEm: new Date(),
          normalizacaoErro: 'Endereço vazio - dados insuficientes para normalização',
          // Manter cidade/estado se existirem
          cidadeNormalizada: cidadeOriginal || null,
          estadoNormalizado: estadoOriginal || null,
          normalizacaoConfianca: 0,
          normalizacaoFonte: 'nenhuma',
        },
      });

      // Encadear para geocoding mesmo assim (vai usar cidade/estado se tiver)
      await geocodingQueue.add(
        { clienteId, loteId },
        { delay: 100 }
      );

      return {
        success: false,
        clienteId,
        nome: cliente.nome,
        error: 'Endereço vazio - dados insuficientes',
      };
    }

    // Executar as 3 normalizações em paralelo
    console.log(`\n🎯 ===== VISION AI - CRUZAMENTO TRIPLO =====`);

    const [claudeResult, chatgptResult, regexResult] = await Promise.all([
      normalizarComClaude(enderecoOriginal, cidadeOriginal, estadoOriginal),
      normalizarComChatGPT(enderecoOriginal, cidadeOriginal, estadoOriginal),
      normalizarComRegex(enderecoOriginal, cidadeOriginal, estadoOriginal),
    ]);

    // Log dos resultados individuais
    console.log(`\n📊 Resultados individuais:`);
    if (claudeResult) {
      console.log(`   🤖 Claude:  "${claudeResult.endereco}" | "${claudeResult.cidade}" | "${claudeResult.estado}"`);
    } else {
      console.log(`   🤖 Claude:  ❌ Falhou`);
    }
    if (chatgptResult) {
      console.log(`   💬 ChatGPT: "${chatgptResult.endereco}" | "${chatgptResult.cidade}" | "${chatgptResult.estado}"`);
    } else {
      console.log(`   💬 ChatGPT: ❌ Falhou`);
    }
    console.log(`   📏 Regex:   "${regexResult.endereco}" | "${regexResult.cidade}" | "${regexResult.estado}"`);

    // Validação cruzada
    const crossValidation = validarCruzamento(claudeResult, chatgptResult, regexResult);

    // Log do resultado final
    console.log(`\n🎯 Resultado da validação cruzada:`);
    console.log(`   Confiança: ${crossValidation.confianca}%`);
    console.log(`   Fonte: ${crossValidation.fonte.toUpperCase()}`);
    console.log(`   Endereço final: "${crossValidation.enderecoFinal}"`);
    console.log(`   Cidade final: "${crossValidation.cidadeFinal}"`);
    console.log(`   Estado final: "${crossValidation.estadoFinal}"`);

    if (crossValidation.detalhes.alucinacaoDetectada) {
      console.warn(`   ⚠️  ALUCINAÇÃO DETECTADA! Usando fonte mais confiável.`);
    }

    if (crossValidation.detalhes.divergencias.length > 0) {
      console.log(`\n   📋 Divergências:`);
      crossValidation.detalhes.divergencias.forEach(d => console.log(`      - ${d}`));
    }

    console.log(`   📈 Similaridades:`);
    console.log(`      Claude ↔ ChatGPT: ${crossValidation.detalhes.similaridadeClaudeChatgpt.toFixed(0)}%`);
    console.log(`      Claude ↔ Regex:   ${crossValidation.detalhes.similaridadeClaudeRegex.toFixed(0)}%`);
    console.log(`      ChatGPT ↔ Regex:  ${crossValidation.detalhes.similaridadeChatgptRegex.toFixed(0)}%`);

    // Atualizar banco
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        enderecoNormalizado: crossValidation.enderecoFinal,
        cidadeNormalizada: crossValidation.cidadeFinal,
        estadoNormalizado: crossValidation.estadoFinal,
        alteracoesNormalizacao: JSON.stringify({
          fonte: crossValidation.fonte,
          divergencias: crossValidation.detalhes.divergencias,
          similaridades: {
            claudeChatgpt: crossValidation.detalhes.similaridadeClaudeChatgpt,
            claudeRegex: crossValidation.detalhes.similaridadeClaudeRegex,
            chatgptRegex: crossValidation.detalhes.similaridadeChatgptRegex,
          },
          alucinacao: crossValidation.detalhes.alucinacaoDetectada,
        }),
        normalizacaoConfianca: crossValidation.confianca,
        normalizacaoFonte: crossValidation.fonte,
        normalizacaoStatus: 'SUCESSO',
        normalizacaoProcessadoEm: new Date(),
      },
    });

    // Atualizar lote
    if (loteId) {
      await prisma.processamentoLote.update({
        where: { id: loteId },
        data: {
          processados: { increment: 1 },
          sucesso: { increment: 1 },
        },
      });
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ NORMALIZAÇÃO TRIPLA CONCLUÍDA: ${cliente.nome}`);
    console.log(`   Confiança: ${crossValidation.confianca}% (${crossValidation.fonte})`);
    console.log(`${'='.repeat(60)}\n`);

    // Encadear para geocoding
    await geocodingQueue.add(
      { clienteId, loteId },
      { delay: 100 }
    );

    return {
      success: true,
      clienteId,
      nome: cliente.nome,
      enderecoNormalizado: crossValidation.enderecoFinal,
      cidadeNormalizada: crossValidation.cidadeFinal,
      estadoNormalizado: crossValidation.estadoFinal,
      confianca: crossValidation.confianca,
      fonte: crossValidation.fonte,
    };
  } catch (error: any) {
    console.error(`❌ Erro ao normalizar cliente ${clienteId}:`, error.message);

    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        normalizacaoStatus: 'FALHA',
        normalizacaoProcessadoEm: new Date(),
        normalizacaoErro: error.message,
      },
    });

    if (loteId) {
      await prisma.processamentoLote.update({
        where: { id: loteId },
        data: {
          processados: { increment: 1 },
          falhas: { increment: 1 },
        },
      });
    }

    return {
      success: false,
      clienteId,
      nome: 'ERRO',
      error: error.message,
    };
  }
});

/**
 * Normaliza com Claude (Anthropic)
 */
async function normalizarComClaude(
  endereco: string,
  cidade: string,
  estado: string
): Promise<NormalizationIAResult | null> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.warn('⚠️  ANTHROPIC_API_KEY não configurada - pulando Claude');
      return null;
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const prompt = buildNormalizationPrompt(endereco, cidade, estado);

    console.log(`🤖 [1/3] Chamando Claude IA...`);

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Resposta inesperada do Claude');
    }

    return parseIAResponse(content.text);
  } catch (error: any) {
    console.error(`❌ Erro no Claude: ${error.message}`);
    return null;
  }
}

/**
 * Normaliza com ChatGPT (OpenAI)
 */
async function normalizarComChatGPT(
  endereco: string,
  cidade: string,
  estado: string
): Promise<NormalizationIAResult | null> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      console.warn('⚠️  OPENAI_API_KEY não configurada - pulando ChatGPT');
      return null;
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = buildNormalizationPrompt(endereco, cidade, estado);

    console.log(`💬 [2/3] Chamando ChatGPT...`);

    const response = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      max_tokens: 500,
      temperature: 0,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Resposta vazia do ChatGPT');
    }

    return parseIAResponse(content);
  } catch (error: any) {
    console.error(`❌ Erro no ChatGPT: ${error.message}`);
    return null;
  }
}

/**
 * Normaliza com Regex Local (GRÁTIS!)
 */
function normalizarComRegex(
  endereco: string,
  cidade: string,
  estado: string
): { endereco: string; cidade: string; estado: string } {
  console.log(`📏 [3/3] Normalizando com Regex...`);

  const enderecoResult = localNormalizerService.normalize(endereco);

  // Normalizar cidade (Title Case + acentos básicos)
  let cidadeNorm = cidade
    .toLowerCase()
    .replace(/\b\w/g, l => l.toUpperCase())
    .replace(/\bSao\b/gi, 'São')
    .replace(/\bGoiania\b/gi, 'Goiânia')
    .replace(/\bBrasilia\b/gi, 'Brasília')
    .replace(/\bCuritiba\b/gi, 'Curitiba')
    .replace(/\bUberlandia\b/gi, 'Uberlândia')
    .replace(/\bFlorianopolis\b/gi, 'Florianópolis')
    .replace(/\bBelem\b/gi, 'Belém')
    .replace(/\bMaceio\b/gi, 'Maceió')
    .replace(/\bMarilia\b/gi, 'Marília')
    .replace(/\bVitoria\b/gi, 'Vitória')
    .replace(/\bLondrina\b/gi, 'Londrina')
    .replace(/\bS Paulo\b/gi, 'São Paulo')
    .replace(/\bS\. Paulo\b/gi, 'São Paulo')
    .trim();

  // Normalizar estado para sigla
  const estadoMap: Record<string, string> = {
    'acre': 'AC', 'alagoas': 'AL', 'amapa': 'AP', 'amazonas': 'AM',
    'bahia': 'BA', 'ceara': 'CE', 'distrito federal': 'DF', 'espirito santo': 'ES',
    'goias': 'GO', 'maranhao': 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS',
    'minas gerais': 'MG', 'para': 'PA', 'paraiba': 'PB', 'parana': 'PR',
    'pernambuco': 'PE', 'piaui': 'PI', 'rio de janeiro': 'RJ', 'rio grande do norte': 'RN',
    'rio grande do sul': 'RS', 'rondonia': 'RO', 'roraima': 'RR', 'santa catarina': 'SC',
    'sao paulo': 'SP', 'sergipe': 'SE', 'tocantins': 'TO',
  };

  let estadoNorm = estado.trim().toUpperCase();
  const estadoLower = estado.toLowerCase().trim();
  if (estadoMap[estadoLower]) {
    estadoNorm = estadoMap[estadoLower];
  } else if (estado.length === 2) {
    estadoNorm = estado.toUpperCase();
  }

  return {
    endereco: enderecoResult.normalizado,
    cidade: cidadeNorm,
    estado: estadoNorm,
  };
}

/**
 * Prompt padrão para normalização - MASTERIZADO
 * Expansões completas para melhor geocodificação
 */
function buildNormalizationPrompt(endereco: string, cidade: string, estado: string): string {
  return `Você é um especialista em normalização de endereços brasileiros para geocodificação.

OBJETIVO: Expandir TODAS as abreviações para palavras completas (melhora precisão do Google Maps).

REGRAS OBRIGATÓRIAS - ENDEREÇO:
1. Logradouros (SEMPRE expandir por extenso):
   - R./R → Rua
   - Av./AV → Avenida
   - Pç./PC → Praça
   - Trav./TRV → Travessa
   - Al./AL → Alameda
   - Rod./ROD → Rodovia
   - Est./EST → Estrada
   - Lg./LG → Largo
   - Vl./VL → Vila
   - Jd./JD → Jardim
   - Pq./PQ → Parque

2. Títulos (SEMPRE expandir por extenso):
   - Dr./DR → Doutor
   - Dra./DRA → Doutora
   - Prof./PROF → Professor
   - Profa./PROFA → Professora
   - Eng./ENG → Engenheiro
   - Cel./CEL → Coronel
   - Gen./GEN → General
   - Mal./MAL → Marechal
   - Pe./PE → Padre
   - Pres./PRES → Presidente
   - Gov./GOV → Governador
   - Sen./SEN → Senador
   - Dep./DEP → Deputado
   - Ver./VER → Vereador
   - N.Sra./N SRA/NSA → Nossa Senhora

3. Complementos (SEMPRE expandir):
   - Cj./CJ/CONJ → Conjunto
   - Qd./QD → Quadra
   - Lt./LT → Lote
   - Bl./BL → Bloco
   - Ap./AP/APTO → Apartamento
   - Sl./SL → Sala
   - Lj./LJ → Loja
   - And./AND → Andar
   - Km./KM → Quilômetro
   - S/N/SN → Sem Número
   - CR → Conjunto Residencial

4. Números: Manter como estão (não expandir)
5. CEPs: Manter como estão

REGRAS - CIDADE:
- Corrigir acentos: SAO PAULO → São Paulo, GOIANIA → Goiânia
- Expandir abreviações: S PAULO → São Paulo
- Title Case correto

REGRAS - ESTADO:
- Converter para sigla de 2 letras (SP, RJ, MG, etc)

DADOS ORIGINAIS:
Endereço: ${endereco}
Cidade: ${cidade}
Estado: ${estado}

Responda APENAS em JSON válido (sem markdown, sem explicações):
{
  "endereco": "endereço normalizado COM TODAS EXPANSÕES",
  "cidade": "cidade normalizada",
  "estado": "UF",
  "alteracoes": ["lista de alterações feitas"]
}`;
}

/**
 * Parse da resposta das IAs
 */
function parseIAResponse(text: string): NormalizationIAResult | null {
  try {
    let jsonText = text.trim();

    // Remover markdown se presente
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/```json\n?/, '').replace(/\n?```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/```\n?/, '').replace(/\n?```$/, '');
    }

    const resultado = JSON.parse(jsonText) as NormalizationIAResult;

    if (!resultado.endereco || !resultado.cidade || !resultado.estado) {
      throw new Error('Dados incompletos');
    }

    return resultado;
  } catch (error) {
    return null;
  }
}

/**
 * Validação cruzada das 3 fontes - MASTERIZADA
 *
 * Prioridade: IAs > Regex (IAs entendem contexto, Regex é mecânico)
 * Quando ambas IAs respondem, SEMPRE preferir Claude (mais preciso)
 * Regex só é usado como fallback ou para detectar alucinações graves
 */
function validarCruzamento(
  claude: NormalizationIAResult | null,
  chatgpt: NormalizationIAResult | null,
  regex: { endereco: string; cidade: string; estado: string }
): CrossValidationResult {
  const divergencias: string[] = [];

  // Calcular similaridades semânticas (normaliza "Dr" vs "Doutor", etc)
  const simClaudeChatgpt = claude && chatgpt
    ? calcularSimilaridadeSemantica(
        `${claude.endereco} ${claude.cidade} ${claude.estado}`,
        `${chatgpt.endereco} ${chatgpt.cidade} ${chatgpt.estado}`
      )
    : 0;

  const simClaudeRegex = claude
    ? calcularSimilaridadeSemantica(
        `${claude.endereco} ${claude.cidade} ${claude.estado}`,
        `${regex.endereco} ${regex.cidade} ${regex.estado}`
      )
    : 0;

  const simChatgptRegex = chatgpt
    ? calcularSimilaridadeSemantica(
        `${chatgpt.endereco} ${chatgpt.cidade} ${chatgpt.estado}`,
        `${regex.endereco} ${regex.cidade} ${regex.estado}`
      )
    : 0;

  let enderecoFinal: string;
  let cidadeFinal: string;
  let estadoFinal: string;
  let confianca: number;
  let fonte: CrossValidationResult['fonte'];
  let alucinacaoDetectada = false;

  // CASO 1: Todas as 3 fontes concordam (>80% semântico)
  if (claude && chatgpt && simClaudeChatgpt >= 80 && simClaudeRegex >= 75 && simChatgptRegex >= 75) {
    console.log(`✅ [Cross-Validation] CONSENSO: 3 fontes concordam!`);
    enderecoFinal = claude.endereco; // Preferir Claude (mais completo)
    cidadeFinal = claude.cidade;
    estadoFinal = claude.estado;
    confianca = 100;
    fonte = 'consenso';
  }
  // CASO 2: Claude e ChatGPT respondem e concordam razoavelmente (>70%)
  // IAs entendem contexto, então "Dr" e "Doutor" são equivalentes
  else if (claude && chatgpt && simClaudeChatgpt >= 70) {
    console.log(`✅ [Cross-Validation] Claude + ChatGPT concordam (${simClaudeChatgpt.toFixed(0)}%)`);

    // Usar Claude (geralmente mais completo nas expansões)
    enderecoFinal = claude.endereco;
    cidadeFinal = claude.cidade;
    estadoFinal = claude.estado;

    // Confiança baseada em quão bem concordam
    if (simClaudeChatgpt >= 90) {
      confianca = 98;
    } else if (simClaudeChatgpt >= 80) {
      confianca = 95;
    } else {
      confianca = 90;
    }

    fonte = 'claude';

    if (simClaudeRegex < 65) {
      divergencias.push(`IAs expandiram mais que Regex (${simClaudeRegex.toFixed(0)}%)`);
    }
  }
  // CASO 3: Ambas IAs respondem mas divergem muito (<70%)
  // Verificar se uma delas concorda com Regex (possível alucinação da outra)
  else if (claude && chatgpt && simClaudeChatgpt < 70) {
    // Verificar qual IA está mais próxima do Regex (baseline)
    if (simClaudeRegex >= 75 && simChatgptRegex < 65) {
      console.log(`✅ [Cross-Validation] Claude + Regex concordam`);
      divergencias.push(`ChatGPT divergiu significativamente (${simChatgptRegex.toFixed(0)}%)`);

      enderecoFinal = claude.endereco;
      cidadeFinal = claude.cidade;
      estadoFinal = claude.estado;
      confianca = 88;
      fonte = 'claude';
      alucinacaoDetectada = true;
    } else if (simChatgptRegex >= 75 && simClaudeRegex < 65) {
      console.log(`✅ [Cross-Validation] ChatGPT + Regex concordam`);
      divergencias.push(`Claude divergiu significativamente (${simClaudeRegex.toFixed(0)}%)`);

      enderecoFinal = chatgpt.endereco;
      cidadeFinal = chatgpt.cidade;
      estadoFinal = chatgpt.estado;
      confianca = 88;
      fonte = 'chatgpt';
      alucinacaoDetectada = true;
    } else {
      // Ambas IAs divergem do Regex - usar Claude (mais confiável em geral)
      console.log(`⚠️  [Cross-Validation] Alta divergência - preferindo Claude`);
      divergencias.push(`Claude ↔ ChatGPT: ${simClaudeChatgpt.toFixed(0)}%`);
      divergencias.push(`Ambas IAs divergem do Regex`);

      enderecoFinal = claude.endereco;
      cidadeFinal = claude.cidade;
      estadoFinal = claude.estado;
      confianca = 80;
      fonte = 'claude';
    }
  }
  // CASO 4: Apenas Claude disponível
  else if (claude && !chatgpt) {
    console.log(`⚠️  [Cross-Validation] Apenas Claude disponível`);

    // Claude sozinho é confiável se não divergir muito do Regex
    if (simClaudeRegex >= 60) {
      enderecoFinal = claude.endereco;
      cidadeFinal = claude.cidade;
      estadoFinal = claude.estado;
      confianca = 85;
      fonte = 'claude';
    } else {
      // Claude diverge muito do Regex - possível alucinação
      divergencias.push(`Claude diverge significativamente do Regex (${simClaudeRegex.toFixed(0)}%)`);
      enderecoFinal = regex.endereco;
      cidadeFinal = regex.cidade;
      estadoFinal = regex.estado;
      confianca = 65;
      fonte = 'regex';
      alucinacaoDetectada = true;
    }
  }
  // CASO 5: Apenas ChatGPT disponível
  else if (chatgpt && !claude) {
    console.log(`⚠️  [Cross-Validation] Apenas ChatGPT disponível`);

    if (simChatgptRegex >= 60) {
      enderecoFinal = chatgpt.endereco;
      cidadeFinal = chatgpt.cidade;
      estadoFinal = chatgpt.estado;
      confianca = 82;
      fonte = 'chatgpt';
    } else {
      divergencias.push(`ChatGPT diverge significativamente do Regex (${simChatgptRegex.toFixed(0)}%)`);
      enderecoFinal = regex.endereco;
      cidadeFinal = regex.cidade;
      estadoFinal = regex.estado;
      confianca = 65;
      fonte = 'regex';
      alucinacaoDetectada = true;
    }
  }
  // CASO 6: Nenhuma IA disponível - apenas Regex
  else {
    console.warn(`⚠️  [Cross-Validation] Nenhuma IA disponível - usando apenas Regex`);

    enderecoFinal = regex.endereco;
    cidadeFinal = regex.cidade;
    estadoFinal = regex.estado;
    confianca = 60;
    fonte = 'regex';
  }

  return {
    enderecoFinal,
    cidadeFinal,
    estadoFinal,
    confianca,
    fonte,
    detalhes: {
      claude: claude || undefined,
      chatgpt: chatgpt || undefined,
      regex,
      similaridadeClaudeChatgpt: simClaudeChatgpt,
      similaridadeClaudeRegex: simClaudeRegex,
      similaridadeChatgptRegex: simChatgptRegex,
      alucinacaoDetectada,
      divergencias,
    },
  };
}

/**
 * Normaliza string para comparação semântica
 * Trata "Dr" e "Doutor" como equivalentes, etc.
 */
function normalizarParaComparacao(texto: string): string {
  let normalizado = texto.toLowerCase().trim();

  // Mapa de equivalências semânticas (abreviação → forma expandida)
  const equivalencias: Record<string, string> = {
    // Títulos
    'dr.': 'doutor', 'dr': 'doutor',
    'dra.': 'doutora', 'dra': 'doutora',
    'prof.': 'professor', 'prof': 'professor',
    'profa.': 'professora', 'profa': 'professora',
    'eng.': 'engenheiro', 'eng': 'engenheiro',
    'cel.': 'coronel', 'cel': 'coronel',
    'gen.': 'general', 'gen': 'general',
    'mal.': 'marechal', 'mal': 'marechal',
    'pe.': 'padre', 'pe': 'padre',
    'pres.': 'presidente', 'pres': 'presidente',
    'gov.': 'governador', 'gov': 'governador',
    'sen.': 'senador', 'sen': 'senador',
    'dep.': 'deputado', 'dep': 'deputado',
    // Logradouros
    'r.': 'rua', 'av.': 'avenida', 'av': 'avenida',
    'pç.': 'praca', 'pc.': 'praca', 'pc': 'praca',
    'trav.': 'travessa', 'trv.': 'travessa', 'trv': 'travessa',
    'al.': 'alameda', 'al': 'alameda',
    'rod.': 'rodovia', 'rod': 'rodovia',
    'est.': 'estrada', 'est': 'estrada',
    'lg.': 'largo', 'lg': 'largo',
    'vl.': 'vila', 'vl': 'vila',
    'jd.': 'jardim', 'jd': 'jardim',
    'pq.': 'parque', 'pq': 'parque',
    // Complementos
    'cj.': 'conjunto', 'cj': 'conjunto', 'conj.': 'conjunto', 'conj': 'conjunto',
    'qd.': 'quadra', 'qd': 'quadra',
    'lt.': 'lote', 'lt': 'lote',
    'bl.': 'bloco', 'bl': 'bloco',
    'ap.': 'apartamento', 'ap': 'apartamento', 'apto.': 'apartamento', 'apto': 'apartamento',
    'sl.': 'sala', 'sl': 'sala',
    'lj.': 'loja', 'lj': 'loja',
    'and.': 'andar', 'and': 'andar',
    'km.': 'quilometro', 'km': 'quilometro',
    's/n': 'sem numero', 'sn': 'sem numero',
    'n.sra.': 'nossa senhora', 'n sra': 'nossa senhora', 'nsa': 'nossa senhora',
    'cr': 'conjunto residencial',
    // Números por extenso (para comparação)
    'nº': '', 'n°': '', 'no.': '', 'no': '',
  };

  // Aplicar equivalências
  Object.entries(equivalencias).forEach(([abbr, full]) => {
    const regex = new RegExp(`\\b${abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    normalizado = normalizado.replace(regex, full);
  });

  // Remover pontuação extra e normalizar espaços
  normalizado = normalizado
    .replace(/[.,;:!?()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Remover acentos para comparação
  normalizado = normalizado
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return normalizado;
}

/**
 * Calcula similaridade SEMÂNTICA entre duas strings
 * Trata abreviações como equivalentes (Dr = Doutor, etc.)
 */
function calcularSimilaridadeSemantica(s1: string, s2: string): number {
  // Normalizar ambas as strings para comparação semântica
  const str1 = normalizarParaComparacao(s1);
  const str2 = normalizarParaComparacao(s2);

  if (str1 === str2) return 100;

  // Levenshtein na versão normalizada
  const levenshtein = levenshteinSimilarity(str1, str2);

  // Token (palavras em comum) na versão normalizada
  const tokens1 = new Set(str1.split(/\s+/).filter(t => t.length > 0));
  const tokens2 = new Set(str2.split(/\s+/).filter(t => t.length > 0));
  const intersection = [...tokens1].filter(t => tokens2.has(t)).length;
  const union = new Set([...tokens1, ...tokens2]).size;
  const tokenSim = union > 0 ? (intersection / union) * 100 : 0;

  // Peso maior para tokens (mais importante em endereços)
  return (levenshtein * 0.5) + (tokenSim * 0.5);
}

/**
 * Calcula similaridade entre duas strings (Levenshtein + Token)
 * Versão simples sem normalização semântica
 */
function calcularSimilaridade(s1: string, s2: string): number {
  const str1 = s1.toLowerCase().trim();
  const str2 = s2.toLowerCase().trim();

  if (str1 === str2) return 100;

  // Levenshtein
  const levenshtein = levenshteinSimilarity(str1, str2);

  // Token (palavras em comum)
  const tokens1 = new Set(str1.split(/\s+/));
  const tokens2 = new Set(str2.split(/\s+/));
  const intersection = [...tokens1].filter(t => tokens2.has(t)).length;
  const union = new Set([...tokens1, ...tokens2]).size;
  const tokenSim = union > 0 ? (intersection / union) * 100 : 0;

  return (levenshtein * 0.6) + (tokenSim * 0.4);
}

function levenshteinSimilarity(s1: string, s2: string): number {
  const len1 = s1.length;
  const len2 = s2.length;
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) matrix[i] = [i];
  for (let j = 0; j <= len2; j++) matrix[0][j] = j;

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  const maxLen = Math.max(len1, len2);
  return maxLen > 0 ? ((maxLen - matrix[len1][len2]) / maxLen) * 100 : 100;
}

// Event handlers
normalizationQueue.on('completed', (job: Job, result: NormalizationJobResult) => {
  if (result.success) {
    console.log(`✅ Job Normalização concluído: ${result.nome} (${result.confianca}% - ${result.fonte})`);
  }
});

normalizationQueue.on('failed', (job: Job, error: Error) => {
  console.error(`❌ Job Normalização falhou: ${job.data.clienteId}`, error.message);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Encerrando worker Normalização...');
  await normalizationQueue.close();
  await prisma.$disconnect();
  process.exit(0);
});

export default normalizationQueue;

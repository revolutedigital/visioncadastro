import Anthropic from '@anthropic-ai/sdk';
import { normalizationCrossValidationService } from './normalization-cross-validation.service';

export interface NormalizationResult {
  success: boolean;
  enderecoNormalizado?: string;
  alteracoes?: string[];
  error?: string;
  // Vision AI - Sprint 4
  confianca?: number;
  fonte?: 'ia' | 'regex' | 'consenso';
  similaridade?: number;
  alucinacaoDetectada?: boolean;
  divergencias?: string[];
}

export class AddressNormalizationService {
  private anthropic: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      console.warn('⚠️  ANTHROPIC_API_KEY não configurada! Normalização de endereços não funcionará.');
    }

    this.anthropic = new Anthropic({
      apiKey: apiKey || '',
    });
  }

  /**
   * Normaliza endereço expandindo abreviações usando IA
   * SPRINT 4: Com Vision AI Cross Validation (IA vs Regex)
   * Exemplos: R: → Rua, Av: → Avenida, PRC → Praça, etc.
   */
  async normalizarEndereco(endereco: string): Promise<NormalizationResult> {
    try {
      if (!process.env.ANTHROPIC_API_KEY) {
        return {
          success: false,
          error: 'API Key do Anthropic não configurada',
        };
      }

      console.log(`\n🔍 ===== VISION AI - NORMALIZAÇÃO =====`);
      console.log(`📝 Endereço original: ${endereco}`);

      // FONTE 1: Claude IA (pago, inteligente)
      console.log(`🤖 [1/2] Claude IA normalizando...`);

      const prompt = `Você é um especialista em normalização de endereços brasileiros.

Sua tarefa é expandir TODAS as abreviações encontradas no endereço abaixo, mantendo o restante do texto exatamente igual.

REGRAS IMPORTANTES:
1. Expanda abreviações comuns como:
   - R: → Rua
   - R. → Rua
   - Av: → Avenida
   - Av. → Avenida
   - PRC → Praça
   - Pç. → Praça
   - Trav. → Travessa
   - Al. → Alameda
   - Rod. → Rodovia
   - Est. → Estrada
   - Cj. → Conjunto
   - Qd. → Quadra
   - Lt. → Lote
   - Bl. → Bloco
   - Ap. → Apartamento
   - N° → Número
   - Nº → Número
   - S/N → Sem Número
   - Cep → CEP
   - Sl. → Sala
   - Cond. → Condomínio

2. Mantenha nomes próprios, números, CEPs exatamente como estão
3. Corrija espaçamento inconsistente
4. Não adicione nem remova informações
5. Retorne APENAS o endereço normalizado, sem explicações

Endereço original:
${endereco}

Endereço normalizado (sem explicações):`;

      let enderecoIA: string | null = null;

      try {
        const response = await this.anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001', // Haiku 4.5 - mais inteligente
          max_tokens: 500,
          temperature: 0, // Determinístico
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        });

        const content = response.content[0];
        if (content.type !== 'text') {
          throw new Error('Resposta inesperada da IA');
        }

        enderecoIA = content.text.trim();
        console.log(`✅ IA normalizou: ${enderecoIA}`);
      } catch (error: any) {
        console.error(`❌ Erro na IA: ${error.message}`);
        // Continua para validação cruzada mesmo se IA falhar
      }

      // FONTE 2: Regex Local (grátis, regras fixas)
      console.log(`📏 [2/2] Regex Local normalizando...`);

      // VALIDAÇÃO CRUZADA: Comparar IA vs Regex
      const crossValidation = await normalizationCrossValidationService.validateNormalization(
        endereco,
        enderecoIA
      );

      // Log detalhado
      normalizationCrossValidationService.logCrossValidation(crossValidation);

      // Detectar alterações no endereço final
      const alteracoes = this.detectarAlteracoes(endereco, crossValidation.enderecoFinal);

      return {
        success: true,
        enderecoNormalizado: crossValidation.enderecoFinal,
        alteracoes,
        // Vision AI
        confianca: crossValidation.confianca,
        fonte: crossValidation.fonteUsada,
        similaridade: crossValidation.detalhes.similaridade,
        alucinacaoDetectada: crossValidation.detalhes.alucinacaoDetectada,
        divergencias: crossValidation.detalhes.divergencias,
      };
    } catch (error: any) {
      console.error('Erro ao normalizar endereço:', error.message);

      return {
        success: false,
        error: `Erro na normalização: ${error.message}`,
      };
    }
  }

  /**
   * Detecta quais abreviações foram expandidas
   */
  private detectarAlteracoes(original: string, normalizado: string): string[] {
    const alteracoes: string[] = [];

    const abreviacoes: { [key: string]: string } = {
      'R:': 'Rua',
      'R.': 'Rua',
      'Av:': 'Avenida',
      'Av.': 'Avenida',
      'PRC': 'Praça',
      'Pç.': 'Praça',
      'Trav.': 'Travessa',
      'Al.': 'Alameda',
      'Rod.': 'Rodovia',
      'Est.': 'Estrada',
      'Cj.': 'Conjunto',
      'Qd.': 'Quadra',
      'Lt.': 'Lote',
      'Bl.': 'Bloco',
      'Ap.': 'Apartamento',
      'N°': 'Número',
      'Nº': 'Número',
      'S/N': 'Sem Número',
      'Sl.': 'Sala',
      'Cond.': 'Condomínio',
    };

    for (const [abrev, expandido] of Object.entries(abreviacoes)) {
      if (original.includes(abrev) && normalizado.includes(expandido)) {
        alteracoes.push(`${abrev} → ${expandido}`);
      }
    }

    return alteracoes;
  }

  /**
   * Normaliza lote de endereços (com delay para evitar rate limit)
   */
  async normalizarLote(enderecos: string[]): Promise<NormalizationResult[]> {
    const resultados: NormalizationResult[] = [];

    for (let i = 0; i < enderecos.length; i++) {
      const resultado = await this.normalizarEndereco(enderecos[i]);
      resultados.push(resultado);

      // Delay de 500ms entre requisições para evitar rate limit
      if (i < enderecos.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }

    return resultados;
  }
}

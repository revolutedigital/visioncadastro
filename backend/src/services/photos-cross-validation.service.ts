/**
 * Photos Cross Validation Service
 *
 * Vision AI Component: Valida análise de fotos usando múltiplas IAs
 * - Claude Vision (atual - pago, excelente para análise detalhada)
 * - Google Cloud Vision (labels, detecção de objetos)
 * - OpenAI GPT-4 Vision (alternativa, cross-validation)
 *
 * Objetivo:
 * - Detectar alucinações da IA
 * - Validar classificações (fachada, interior, produto)
 * - Confirmar presença de elementos (branding, sinalização, etc.)
 *
 * Confiança:
 * - 100%: Todas as IAs concordam (>90% similaridade)
 * - 80%: 2 de 3 concordam
 * - 60%: Alta divergência (possível alucinação)
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { ImageAnnotatorClient } from '@google-cloud/vision';

export interface PhotoAnalysisResult {
  fonte: 'claude' | 'google' | 'openai';
  categoria?: 'facade' | 'interior' | 'product' | 'other';
  labels: string[]; // Tags/labels detectados
  descricao?: string;
  confianca: number;
}

export interface PhotosCrossValidation {
  categoriaFinal: 'facade' | 'interior' | 'product' | 'other';
  confianca: number; // 0-100%
  consenso: boolean; // Todas concordam?
  detalhes: {
    claudeAnalysis?: PhotoAnalysisResult;
    googleAnalysis?: PhotoAnalysisResult;
    openaiAnalysis?: PhotoAnalysisResult;
    divergencias: string[];
    alertas: string[];
  };
}

export class PhotosCrossValidationService {
  private anthropic: Anthropic;
  private openai: OpenAI;
  private googleVision: ImageAnnotatorClient | null = null;

  constructor() {
    // Claude (já usamos)
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });

    // OpenAI GPT-4 Vision
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });

    // Google Cloud Vision
    try {
      if (process.env.GOOGLE_CLOUD_VISION_CREDENTIALS) {
        this.googleVision = new ImageAnnotatorClient({
          keyFilename: process.env.GOOGLE_CLOUD_VISION_CREDENTIALS,
        });
      }
    } catch (error) {
      console.warn('⚠️  Google Cloud Vision não configurado');
    }
  }

  /**
   * Analisa foto com Claude Vision (já implementado no sistema)
   */
  async analyzeWithClaude(imageBase64: string): Promise<PhotoAnalysisResult> {
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: `Classifique esta foto em UMA das categorias:
- facade: fachada/exterior do estabelecimento
- interior: interior do estabelecimento
- product: produtos/mercadorias
- other: outras

Responda APENAS com a categoria em minúsculo.`,
              },
            ],
          },
        ],
      });

      const content = response.content[0];
      const categoria = (content.type === 'text' ? content.text.trim().toLowerCase() : 'other') as any;

      return {
        fonte: 'claude',
        categoria: ['facade', 'interior', 'product', 'other'].includes(categoria) ? categoria : 'other',
        labels: [],
        confianca: 90, // Claude é geralmente confiável
      };
    } catch (error: any) {
      console.error(`❌ Claude Vision falhou: ${error.message}`);
      return {
        fonte: 'claude',
        labels: [],
        confianca: 0,
      };
    }
  }

  /**
   * Analisa foto com Google Cloud Vision
   */
  async analyzeWithGoogle(imageBase64: string): Promise<PhotoAnalysisResult> {
    if (!this.googleVision) {
      return {
        fonte: 'google',
        labels: [],
        confianca: 0,
      };
    }

    try {
      const [result] = await this.googleVision.labelDetection({
        image: { content: Buffer.from(imageBase64, 'base64') },
      });

      const labels = result.labelAnnotations?.map(label => label.description || '').filter(Boolean) || [];

      // Classificar baseado nos labels
      let categoria: PhotoAnalysisResult['categoria'] = 'other';

      const labelsLower = labels.map(l => l.toLowerCase());

      if (labelsLower.some(l => l.includes('building') || l.includes('store') || l.includes('shop') || l.includes('facade'))) {
        categoria = 'facade';
      } else if (labelsLower.some(l => l.includes('interior') || l.includes('room') || l.includes('shelf'))) {
        categoria = 'interior';
      } else if (labelsLower.some(l => l.includes('product') || l.includes('bottle') || l.includes('food') || l.includes('drink'))) {
        categoria = 'product';
      }

      return {
        fonte: 'google',
        categoria,
        labels: labels.slice(0, 10), // Top 10 labels
        confianca: 85,
      };
    } catch (error: any) {
      console.error(`❌ Google Vision falhou: ${error.message}`);
      return {
        fonte: 'google',
        labels: [],
        confianca: 0,
      };
    }
  }

  /**
   * Analisa foto com OpenAI GPT-4 Vision
   */
  async analyzeWithOpenAI(imageBase64: string): Promise<PhotoAnalysisResult> {
    if (!process.env.OPENAI_API_KEY) {
      return {
        fonte: 'openai',
        labels: [],
        confianca: 0,
      };
    }

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5.2',
        max_tokens: 512,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
              {
                type: 'text',
                text: `Classify this photo into ONE category:
- facade: building exterior/storefront
- interior: inside view
- product: products/merchandise
- other: other

Respond with ONLY the category in lowercase.`,
              },
            ],
          },
        ],
      });

      const categoria = response.choices[0]?.message?.content?.trim().toLowerCase() as any;

      return {
        fonte: 'openai',
        categoria: ['facade', 'interior', 'product', 'other'].includes(categoria) ? categoria : 'other',
        labels: [],
        confianca: 85,
      };
    } catch (error: any) {
      console.error(`❌ OpenAI Vision falhou: ${error.message}`);
      return {
        fonte: 'openai',
        labels: [],
        confianca: 0,
      };
    }
  }

  /**
   * Valida foto usando múltiplas IAs
   */
  async validatePhoto(imageBase64: string, enabledSources: string[] = ['claude']): Promise<PhotosCrossValidation> {
    console.log(`\n📸 ===== VISION AI - PHOTOS CROSS VALIDATION =====`);

    const analyses: PhotoAnalysisResult[] = [];
    const divergencias: string[] = [];
    const alertas: string[] = [];

    // Executar análises das fontes habilitadas
    if (enabledSources.includes('claude') && process.env.ANTHROPIC_API_KEY) {
      console.log(`   🤖 [1/3] Claude Vision analisando...`);
      const claudeResult = await this.analyzeWithClaude(imageBase64);
      if (claudeResult.confianca > 0) {
        analyses.push(claudeResult);
        console.log(`   ✅ Claude: ${claudeResult.categoria} (${claudeResult.confianca}%)`);
      }
    }

    if (enabledSources.includes('google') && this.googleVision) {
      console.log(`   🔍 [2/3] Google Vision analisando...`);
      const googleResult = await this.analyzeWithGoogle(imageBase64);
      if (googleResult.confianca > 0) {
        analyses.push(googleResult);
        console.log(`   ✅ Google: ${googleResult.categoria} (labels: ${googleResult.labels.slice(0, 3).join(', ')})`);
      }
    }

    if (enabledSources.includes('openai') && process.env.OPENAI_API_KEY) {
      console.log(`   🧠 [3/3] OpenAI Vision analisando...`);
      const openaiResult = await this.analyzeWithOpenAI(imageBase64);
      if (openaiResult.confianca > 0) {
        analyses.push(openaiResult);
        console.log(`   ✅ OpenAI: ${openaiResult.categoria} (${openaiResult.confianca}%)`);
      }
    }

    // Se menos de 2 fontes disponíveis, retornar com baixa confiança
    if (analyses.length < 2) {
      const single = analyses[0];
      return {
        categoriaFinal: single?.categoria || 'other',
        confianca: 60, // Baixa sem cross-validation
        consenso: false,
        detalhes: {
          claudeAnalysis: analyses.find(a => a.fonte === 'claude'),
          googleAnalysis: analyses.find(a => a.fonte === 'google'),
          openaiAnalysis: analyses.find(a => a.fonte === 'openai'),
          divergencias: ['Menos de 2 fontes disponíveis - sem validação cruzada'],
          alertas: ['⚠️  Recomenda-se habilitar múltiplas fontes para cross-validation'],
        },
      };
    }

    // Contar votos por categoria
    const votes: Record<string, number> = {};
    analyses.forEach(a => {
      if (a.categoria) {
        votes[a.categoria] = (votes[a.categoria] || 0) + 1;
      }
    });

    const categoriaFinal = Object.keys(votes).reduce((a, b) => votes[a] > votes[b] ? a : b) as any;
    const votosCategoria = votes[categoriaFinal];
    const totalVotos = analyses.length;

    const consenso = votosCategoria === totalVotos;

    // Calcular confiança
    let confianca: number;
    if (consenso) {
      confianca = 100; // Todas concordam
      console.log(`   ✅ CONSENSO: Todas concordam em "${categoriaFinal}"`);
    } else if (votosCategoria >= totalVotos * 0.66) {
      confianca = 85; // Maioria concorda
      console.log(`   ⚠️  MAIORIA: ${votosCategoria}/${totalVotos} concordam em "${categoriaFinal}"`);

      const divergentes = analyses.filter(a => a.categoria !== categoriaFinal);
      divergentes.forEach(d => {
        divergencias.push(`${d.fonte} classificou como "${d.categoria}"`);
      });
    } else {
      confianca = 60; // Alta divergência
      console.warn(`   ❌ DIVERGÊNCIA: Sem consenso claro`);

      analyses.forEach(a => {
        divergencias.push(`${a.fonte}: "${a.categoria}"`);
      });

      alertas.push('❌ Alta divergência entre IAs - possível imagem ambígua');
      alertas.push('Recomenda-se revisão manual da classificação');
    }

    return {
      categoriaFinal,
      confianca,
      consenso,
      detalhes: {
        claudeAnalysis: analyses.find(a => a.fonte === 'claude'),
        googleAnalysis: analyses.find(a => a.fonte === 'google'),
        openaiAnalysis: analyses.find(a => a.fonte === 'openai'),
        divergencias,
        alertas,
      },
    };
  }

  /**
   * Formata logs de validação cruzada
   */
  logCrossValidation(result: PhotosCrossValidation): void {
    console.log(`\n📸 ===== VISION AI - PHOTOS VALIDADO =====`);
    console.log(`   Categoria Final: ${result.categoriaFinal}`);
    console.log(`   Confiança: ${result.confianca}%`);
    console.log(`   Consenso: ${result.consenso ? '✅ SIM' : '⚠️  NÃO'}`);

    if (result.detalhes.divergencias.length > 0) {
      console.warn(`   ⚠️  Divergências:`);
      result.detalhes.divergencias.forEach(d => console.warn(`      ${d}`));
    }

    if (result.detalhes.alertas.length > 0) {
      console.warn(`   ⚠️  Alertas:`);
      result.detalhes.alertas.forEach(a => console.warn(`      ${a}`));
    }

    console.log(`==========================================\n`);
  }
}

export const photosCrossValidationService = new PhotosCrossValidationService();

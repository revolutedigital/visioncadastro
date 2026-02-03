import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export interface PhotoClassification {
  category: 'facade' | 'interior' | 'product' | 'menu' | 'other';
  confidence: number; // 0-100
  reasoning?: string;
}

/**
 * Serviço de Classificação de Fotos
 * Usa Claude Haiku (mais barato) para pré-classificar fotos
 * antes da análise completa com Sonnet
 *
 * Custo Haiku: ~10x mais barato que Sonnet
 * ROI: Redução adicional de 20-30% em custos de análise
 */
export class PhotoClassifierService {
  /**
   * Classifica uma foto em categorias
   */
  async classifyPhoto(imagePath: string): Promise<PhotoClassification> {
    try {
      const base64Image = await this.imageToBase64(imagePath);

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001', // Haiku 4.5 - mais inteligente
        max_tokens: 150, // Resposta curta
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: `Classifique esta imagem em UMA das seguintes categorias:

- facade: Fachada/frente do estabelecimento (vista externa, entrada, placa)
- interior: Interior do estabelecimento (dentro da loja/restaurante)
- product: Foto de produtos/mercadorias
- menu: Cardápio ou lista de preços
- other: Outras (pessoas, eventos, etc)

Responda APENAS no formato JSON:
{"category": "facade", "confidence": 95, "reasoning": "Vista frontal do estabelecimento com placa visível"}`,
              },
            ],
          },
        ],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Resposta inesperada do Claude');
      }

      // Parse da resposta
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn('⚠️  Resposta sem JSON válido:', content.text);
        return { category: 'other', confidence: 0 };
      }

      const result = JSON.parse(jsonMatch[0]);

      return {
        category: result.category || 'other',
        confidence: result.confidence || 0,
        reasoning: result.reasoning,
      };
    } catch (error) {
      console.error('❌ Erro ao classificar foto:', error);
      return { category: 'other', confidence: 0 };
    }
  }

  /**
   * Classifica múltiplas fotos em batch
   */
  async classifyPhotos(imagePaths: string[]): Promise<PhotoClassification[]> {
    const results: PhotoClassification[] = [];

    for (const imagePath of imagePaths) {
      const classification = await this.classifyPhoto(imagePath);
      results.push(classification);

      console.log(
        `📸 ${imagePath.split('/').pop()}: ${classification.category} (${classification.confidence}%)`
      );
    }

    return results;
  }

  /**
   * Filtra apenas fotos de fachada (para análise principal)
   */
  async filterFacadePhotos(
    imagePaths: string[],
    minConfidence: number = 70
  ): Promise<string[]> {
    const classifications = await this.classifyPhotos(imagePaths);

    const facadePhotos = imagePaths.filter((path, index) => {
      const classification = classifications[index];
      return (
        classification.category === 'facade' &&
        classification.confidence >= minConfidence
      );
    });

    console.log(
      `✅ Filtradas ${facadePhotos.length}/${imagePaths.length} fotos de fachada`
    );

    return facadePhotos;
  }

  /**
   * Converte imagem para base64
   */
  private async imageToBase64(imagePath: string): Promise<string> {
    const imageBuffer = await fs.promises.readFile(imagePath);
    return imageBuffer.toString('base64');
  }

  /**
   * Estima custo da classificação
   */
  estimateCost(numPhotos: number): {
    haiku: number;
    sonnet: number;
    savings: number;
  } {
    // Custo médio por foto (estimativa)
    const HAIKU_COST_PER_PHOTO = 0.001; // $0.001 por foto
    const SONNET_COST_PER_PHOTO = 0.015; // $0.015 por foto

    const haikuCost = numPhotos * HAIKU_COST_PER_PHOTO;
    const sonnetCost = numPhotos * SONNET_COST_PER_PHOTO;
    const savings = sonnetCost - haikuCost;

    return {
      haiku: haikuCost,
      sonnet: sonnetCost,
      savings,
    };
  }
}

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import axios from 'axios';

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
   * @param imagePath Caminho do arquivo local
   * @param photoReference Referência do Google Places para fallback
   */
  async classifyPhoto(imagePath: string, photoReference?: string): Promise<PhotoClassification> {
    try {
      const base64Image = await this.imageToBase64(imagePath, photoReference);

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
   * Fallback para Google Places se arquivo local não existir
   */
  private async imageToBase64(imagePath: string, photoReference?: string): Promise<string> {
    try {
      const imageBuffer = await fs.promises.readFile(imagePath);
      return imageBuffer.toString('base64');
    } catch (error: any) {
      // Se arquivo não existe e temos photoReference, buscar do Google
      if (error.code === 'ENOENT' && photoReference) {
        console.log(`📥 Arquivo local não encontrado, buscando do Google Places...`);
        return this.fetchPhotoFromGoogle(photoReference);
      }
      throw error;
    }
  }

  /**
   * Busca foto diretamente do Google Places API
   */
  private async fetchPhotoFromGoogle(photoReference: string): Promise<string> {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY não configurada');
    }

    const photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${photoReference}&key=${apiKey}`;

    try {
      const response = await axios.get(photoUrl, {
        responseType: 'arraybuffer',
        timeout: 30000,
      });

      console.log(`✅ Foto baixada do Google Places (${response.data.length} bytes)`);
      return Buffer.from(response.data).toString('base64');
    } catch (error: any) {
      console.error(`❌ Erro ao buscar foto do Google: ${error.message}`);
      throw error;
    }
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

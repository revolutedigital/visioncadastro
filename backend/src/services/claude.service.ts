import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';
import axios from 'axios';

export interface AnalysisResult {
  success: boolean;
  tipologiaDetalhada?: string;
  categoriaEstabelecimento?: string;
  segmentoComercial?: string;
  descricaoVisual?: string;
  estadoConservacao?: string;
  movimentacao?: string;
  indicadoresPotencial?: {
    score: number;
    categoria: string; // ALTO, MÉDIO, BAIXO
    fatoresPositivos: string[];
    fatoresNegativos: string[];
  };
  recomendacoes?: string[];
  insights?: string;
  // Sprint 2: Visual Analysis
  qualidadeSinalizacao?: 'EXCELENTE' | 'BOA' | 'REGULAR' | 'PRECARIA';
  presencaBranding?: boolean;
  nivelProfissionalizacao?: 'ALTO' | 'MEDIO' | 'BAIXO';
  publicoAlvo?: string;
  ambienteEstabelecimento?: string;
  indicadoresVisuais?: {
    sinalizacaoExterna: boolean;
    logotipoVisivel: boolean;
    coresInstitucionais: boolean;
    uniformizacao: boolean;
    iluminacao: 'BOA' | 'REGULAR' | 'FRACA';
    limpeza: 'EXCELENTE' | 'BOA' | 'REGULAR' | 'PRECARIA';
    organizacaoEspacial: 'EXCELENTE' | 'BOA' | 'REGULAR' | 'PRECARIA';
    materialPromocional: boolean;
    tecnologiaAparente: string[];
  };
  error?: string;
}

export interface BatchAnalysisResult {
  success: boolean;
  analiseGeral?: string;
  tipologiaFinal?: string;
  confianca?: number;
  resumoFotos?: string;
  error?: string;
}

export class ClaudeService {
  private client: Anthropic;
  private apiKey: string;
  private photosDir: string;
  private visionModel: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.photosDir = process.env.PHOTOS_DIR || path.join(__dirname, '../../uploads/fotos');

    // 💰 HÍBRIDO: Haiku para análise visual, Sonnet para tipologia (qualidade)
    const modelPreference = process.env.CLAUDE_VISION_MODEL || 'haiku';
    this.visionModel = modelPreference === 'sonnet'
      ? 'claude-sonnet-4-5-20250929'  // Sonnet 4.5 - Qualidade máxima ($3.00/$15.00)
      : 'claude-haiku-4-5-20251001';   // Haiku 4.5 - Mais inteligente ($1.00/$5.00)

    console.log(`💰 Claude Vision Model: ${this.visionModel} (${modelPreference})`);

    if (!this.apiKey) {
      console.warn('⚠️  ANTHROPIC_API_KEY não configurada! Claude API não funcionará.');
      this.client = new Anthropic({ apiKey: 'sk-dummy' }); // Dummy key para não quebrar
    } else {
      this.client = new Anthropic({ apiKey: this.apiKey });
    }
  }

  /**
   * Converte imagem para base64
   * Tenta ler do arquivo local primeiro, se não existir busca do Google Places
   */
  private async imageToBase64(filePath: string, photoReference?: string): Promise<string> {
    try {
      // Tentar ler arquivo local
      const imageBuffer = await fs.readFile(filePath);
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
   * Busca foto do Google Places API e retorna base64
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

      const buffer = Buffer.from(response.data);
      console.log(`✅ Foto baixada do Google (${Math.round(buffer.length / 1024)}KB)`);
      return buffer.toString('base64');
    } catch (error: any) {
      console.error(`❌ Erro ao baixar foto do Google:`, error.message);
      throw error;
    }
  }

  /**
   * Detecta o tipo MIME da imagem
   */
  private getImageMimeType(fileName: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      case '.jpg':
      case '.jpeg':
      default:
        return 'image/jpeg';
    }
  }

  /**
   * Analisa uma única foto do estabelecimento
   */
  async analyzeSinglePhoto(
    photoFileName: string,
    nomeCliente: string,
    enderecoCliente: string,
    photoReference?: string
  ): Promise<AnalysisResult> {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'API Key do Claude não configurada',
        };
      }

      const photoPath = path.join(this.photosDir, photoFileName);

      console.log(`🤖 Analisando foto: ${photoFileName}`);

      // Converter imagem para base64 (tenta local, fallback para Google)
      let imageBase64: string;
      try {
        imageBase64 = await this.imageToBase64(photoPath, photoReference);
      } catch (error: any) {
        console.error(`❌ Não foi possível obter a foto: ${error.message}`);
        return {
          success: false,
          error: `Foto não disponível: ${error.message}`,
        };
      }
      const mimeType = this.getImageMimeType(photoFileName);

      // Prompt detalhado para análise (Sprint 2 Enhanced - SEM tipologia)
      const prompt = `Você é um especialista em análise visual de estabelecimentos comerciais. Analise esta foto do estabelecimento "${nomeCliente}" localizado em "${enderecoCliente}".

⚠️ CRITICAL: Your response MUST be ONLY valid JSON. Do NOT include any explanatory text, apologies, or comments. Start with { and end with }. No text before or after.

Your job is to DESCRIBE what you see in detail. DO NOT classify or categorize the business type - just describe visual characteristics.

Return detailed visual analysis in this EXACT JSON format:

{
  "descricaoVisual": "Descrição visual DETALHADA do que você vê na foto (estrutura, produtos, ambiente, pessoas, decoração, equipamentos)",
  "estadoConservacao": "Bom",
  "qualidadeSinalizacao": "BOA",
  "presencaBranding": true,
  "nivelProfissionalizacao": "MEDIO",
  "publicoAlvo": "Descrição do público-alvo APARENTE baseado em elementos visuais que você VÊ",
  "ambienteEstabelecimento": "MODERNO",
  "indicadoresVisuais": {
    "sinalizacaoExterna": true,
    "logotipoVisivel": true,
    "coresInstitucionais": true,
    "uniformizacao": false,
    "iluminacao": "BOA",
    "limpeza": "BOA",
    "organizacaoEspacial": "REGULAR",
    "materialPromocional": true,
    "tecnologiaAparente": ["Lista de tecnologias visíveis"]
  }
}

IMPORTANT RULES:
- ONLY describe what you SEE in the image
- DO NOT classify business type or suggest categories
- DO NOT invent details not visible in photo
- Be VERY SPECIFIC and DETAILED in descriptions
- For "publicoAlvo", describe based on visible elements (customer appearance, decoration style, price indicators)
- For "qualidadeSinalizacao", evaluate both existence and quality (design, maintenance, visibility)
- For "nivelProfissionalizacao", consider: design quality, finishing, visual coherence, materials
- If something is not visible, say "Não visível na foto"

⚠️ REMEMBER: Return ONLY the JSON object. No explanations, no apologies, no additional text. Just { ... }`;

      // Chamar Claude Vision API
      const response = await this.client.messages.create({
        model: this.visionModel,
        max_tokens: 1500, // Reduzido de 2000 para economizar
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      });

      // Extrair resposta
      const contentBlock = response.content[0];
      if (contentBlock.type !== 'text') {
        throw new Error('Resposta do Claude não é texto');
      }

      const responseText = contentBlock.text;

      // Parse JSON
      let analysis: any;
      try {
        // Tentar extrair JSON da resposta
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          analysis = JSON.parse(responseText);
        }
      } catch (parseError) {
        console.error('Erro ao parsear resposta do Claude:', responseText);
        throw new Error('Resposta do Claude não é JSON válido');
      }

      console.log(`✅ Foto analisada com sucesso: ${photoFileName}`);

      return {
        success: true,
        ...analysis,
      };
    } catch (error: any) {
      console.error('Erro ao analisar foto com Claude:', error.message);

      if (error.status === 401) {
        return {
          success: false,
          error: 'API Key inválida ou não autorizada',
        };
      }

      if (error.status === 429) {
        return {
          success: false,
          error: 'Rate limit excedido. Aguarde antes de tentar novamente.',
        };
      }

      return {
        success: false,
        error: `Erro na análise: ${error.message}`,
      };
    }
  }

  /**
   * Analisa múltiplas fotos do mesmo estabelecimento e gera análise consolidada
   * Aceita array de {fileName, photoReference} para buscar do Google se necessário
   */
  async analyzeMultiplePhotos(
    photos: Array<{fileName: string, photoReference?: string}> | string[],
    nomeCliente: string,
    enderecoCliente: string
  ): Promise<BatchAnalysisResult> {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'API Key do Claude não configurada',
        };
      }

      // Normalizar input (aceita array de strings para compatibilidade)
      const normalizedPhotos = photos.map(p =>
        typeof p === 'string' ? { fileName: p } : p
      );

      console.log(`🤖 Analisando ${normalizedPhotos.length} fotos do cliente ${nomeCliente}`);

      // Preparar imagens
      const imageContents: any[] = [];

      for (const photo of normalizedPhotos) {
        const photoPath = path.join(this.photosDir, photo.fileName);

        try {
          const imageBase64 = await this.imageToBase64(photoPath, photo.photoReference);
          const mimeType = this.getImageMimeType(photo.fileName);

          imageContents.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: imageBase64,
            },
          });
        } catch (error: any) {
          console.warn(`⚠️  Foto não disponível: ${photo.fileName} - ${error.message}`);
        }
      }

      if (imageContents.length === 0) {
        return {
          success: false,
          error: 'Nenhuma foto válida encontrada',
        };
      }

      // Prompt para análise de múltiplas fotos (Sprint 2 Enhanced - SEM tipologia)
      const prompt = `Você é um especialista em análise visual de estabelecimentos comerciais. Analise estas ${imageContents.length} fotos do estabelecimento "${nomeCliente}" localizado em "${enderecoCliente}".

⚠️ CRITICAL: Your response MUST be ONLY valid JSON. Do NOT include any explanatory text, apologies, or comments. Start with { and end with }. No text before or after.

Your job is to DESCRIBE what you see in detail. DO NOT classify or categorize the business type - just describe visual characteristics.

Return CONSOLIDATED visual analysis in this EXACT JSON format:

{
  "analiseGeral": "Parágrafo detalhado descrevendo O QUE VOCÊ VÊ em todas as fotos (estrutura física, ambiente, produtos/serviços visíveis, clientes, decoração)",
  "resumoFotos": "Descrição específica do que cada foto individual mostra",
  "caracteristicas": ["3-5 características visuais CONCRETAS que você observa"],
  "qualidadeSinalizacao": "BOA",
  "presencaBranding": true,
  "nivelProfissionalizacao": "MEDIO",
  "publicoAlvo": "Descrição do público-alvo APARENTE baseado em elementos visuais (idade aparente dos clientes, vestimenta, estilo do local)",
  "ambienteEstabelecimento": "TRADICIONAL",
  "indicadoresVisuais": {
    "sinalizacaoExterna": true,
    "logotipoVisivel": true,
    "coresInstitucionais": true,
    "uniformizacao": false,
    "iluminacao": "BOA",
    "limpeza": "BOA",
    "organizacaoEspacial": "REGULAR",
    "materialPromocional": true,
    "tecnologiaAparente": ["Lista de tecnologias visíveis"]
  }
}

IMPORTANT RULES:
- ONLY describe what you SEE in the images
- DO NOT classify business type or suggest typology
- DO NOT invent details not visible in photos
- Be SPECIFIC and DETAILED in visual descriptions
- If you cannot see something clearly, say "Não visível nas fotos"

⚠️ REMEMBER: Return ONLY the JSON object. No explanations, no apologies, no additional text. Just { ... }`;

      // Chamar Claude com múltiplas imagens
      const response = await this.client.messages.create({
        model: this.visionModel,
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: [
              ...imageContents,
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      });

      // Extrair resposta
      const contentBlock = response.content[0];
      if (contentBlock.type !== 'text') {
        throw new Error('Resposta do Claude não é texto');
      }

      const responseText = contentBlock.text;

      // Parse JSON
      let analysis: any;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        } else {
          analysis = JSON.parse(responseText);
        }
      } catch (parseError) {
        console.error('Erro ao parsear resposta do Claude:', responseText);
        throw new Error('Resposta do Claude não é JSON válido');
      }

      console.log(`✅ Análise consolidada concluída para ${nomeCliente}`);

      return {
        success: true,
        ...analysis,
      };
    } catch (error: any) {
      console.error('Erro ao analisar múltiplas fotos:', error.message);

      if (error.status === 401) {
        return {
          success: false,
          error: 'API Key inválida',
        };
      }

      if (error.status === 429) {
        return {
          success: false,
          error: 'Rate limit excedido',
        };
      }

      return {
        success: false,
        error: `Erro na análise: ${error.message}`,
      };
    }
  }

  /**
   * Gera relatório final consolidado para um cliente
   */
  async generateClientReport(
    nomeCliente: string,
    dadosCliente: {
      endereco: string;
      tipoEstabelecimento?: string;
      rating?: number;
      totalAvaliacoes?: number;
      potencialCategoria?: string;
    },
    analisesFotos: AnalysisResult[],
    analiseConsolidada?: BatchAnalysisResult
  ): Promise<{ success: boolean; relatorio?: string; error?: string }> {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'API Key do Claude não configurada',
        };
      }

      console.log(`📝 Gerando relatório para ${nomeCliente}`);

      const prompt = `Você é um consultor de negócios especializado. Com base nos dados abaixo, gere um relatório executivo completo e estratégico.

## DADOS DO CLIENTE
Nome: ${nomeCliente}
Endereço: ${dadosCliente.endereco}
Tipo (Google): ${dadosCliente.tipoEstabelecimento || 'Não disponível'}
Rating Google: ${dadosCliente.rating || 'N/A'} (${dadosCliente.totalAvaliacoes || 0} avaliações)
Potencial: ${dadosCliente.potencialCategoria || 'Não calculado'}

## ANÁLISES DE FOTOS
${JSON.stringify(analisesFotos, null, 2)}

## ANÁLISE CONSOLIDADA
${analiseConsolidada ? JSON.stringify(analiseConsolidada, null, 2) : 'Não disponível'}

---

Gere um relatório executivo em MARKDOWN com:

# Relatório de Análise: ${nomeCliente}

## 1. Resumo Executivo
(Parágrafo de 3-4 linhas com visão geral)

## 2. Perfil do Estabelecimento
- **Tipologia**: ...
- **Segmento**: ...
- **Estado de Conservação**: ...
- **Movimentação Estimada**: ...

## 3. Análise de Potencial
- **Score**: X/100
- **Categoria**: ALTO/MÉDIO/BAIXO
- **Fatores Positivos**:
  - (listar)
- **Fatores de Atenção**:
  - (listar)

## 4. Recomendações Estratégicas
1. (recomendação específica)
2. (recomendação específica)
3. (recomendação específica)

## 5. Insights e Observações
(Parágrafo com insights importantes)

---

Seja PROFISSIONAL, OBJETIVO e ESPECÍFICO. Use dados concretos da análise.`;

      const response = await this.client.messages.create({
        model: this.visionModel,
        max_tokens: 1500,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const contentBlock = response.content[0];
      if (contentBlock.type !== 'text') {
        throw new Error('Resposta do Claude não é texto');
      }

      const relatorio = contentBlock.text;

      console.log(`✅ Relatório gerado para ${nomeCliente}`);

      return {
        success: true,
        relatorio,
      };
    } catch (error: any) {
      console.error('Erro ao gerar relatório:', error.message);
      return {
        success: false,
        error: `Erro ao gerar relatório: ${error.message}`,
      };
    }
  }
}

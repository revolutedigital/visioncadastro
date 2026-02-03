import axios from 'axios';
import { cacheService, CachePrefixes } from './cache.service';

/**
 * SERPRO CPF API Service
 * Consulta dados de CPF via API oficial do SERPRO (Governo Federal)
 * Autenticação: OAuth2 client_credentials
 */

export interface SerproCpfResult {
  success: boolean;
  data?: {
    cpf: string;
    nome: string;
    situacao: string; // Regular, Suspensa, Cancelada, Titular Falecido, etc
    nascimento?: string;
    obito?: boolean;
  };
  error?: string;
  cached?: boolean;
}

export class SerproCpfService {
  private tokenUrl: string;
  private apiUrl: string;
  private consumerKey: string;
  private consumerSecret: string;
  private cachedToken: { token: string; expiresAt: number } | null = null;
  private cacheTTL = 60 * 60 * 24 * 7; // 7 dias

  constructor() {
    this.tokenUrl = process.env.SERPRO_CPF_TOKEN_URL || 'https://gateway.apiserpro.serpro.gov.br/token';
    this.apiUrl = process.env.SERPRO_CPF_API_URL || 'https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df/v1/cpf';
    this.consumerKey = process.env.SERPRO_CPF_CONSUMER_KEY || '';
    this.consumerSecret = process.env.SERPRO_CPF_CONSUMER_SECRET || '';

    if (!this.consumerKey || !this.consumerSecret) {
      console.warn('⚠️  SERPRO CPF credentials não configuradas');
    }
  }

  /**
   * Obtém access token via OAuth2 client_credentials
   */
  private async getAccessToken(): Promise<string> {
    // Retornar token em cache se ainda válido (margem de 60s)
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt - 60000) {
      return this.cachedToken.token;
    }

    const credentials = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');

    const response = await axios.post(
      this.tokenUrl,
      'grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      }
    );

    const { access_token, expires_in } = response.data;
    this.cachedToken = {
      token: access_token,
      expiresAt: Date.now() + (expires_in * 1000),
    };

    return access_token;
  }

  /**
   * Consulta CPF na API SERPRO
   */
  async consultarCPF(cpf: string): Promise<SerproCpfResult> {
    try {
      const cpfLimpo = cpf.replace(/[^\d]/g, '');

      if (cpfLimpo.length !== 11) {
        return { success: false, error: 'CPF inválido - deve conter 11 dígitos' };
      }

      // Verificar cache
      const cached = await cacheService.get<SerproCpfResult>(
        CachePrefixes.SERPRO_CPF,
        cpfLimpo
      );

      if (cached) {
        return { ...cached, cached: true };
      }

      if (!this.consumerKey || !this.consumerSecret) {
        return { success: false, error: 'Credenciais SERPRO CPF não configuradas' };
      }

      const token = await this.getAccessToken();

      const response = await axios.get(
        `${this.apiUrl}/${cpfLimpo}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          timeout: 15000,
        }
      );

      const d = response.data;

      const result: SerproCpfResult = {
        success: true,
        data: {
          cpf: cpfLimpo,
          nome: d.nome || '',
          situacao: d.situacao?.descricao || d.situacao || '',
          nascimento: d.nascimento || undefined,
          obito: d.obito === 'S' || d.obito === true || undefined,
        },
      };

      // Salvar no cache
      await cacheService.set(
        CachePrefixes.SERPRO_CPF,
        cpfLimpo,
        result,
        this.cacheTTL
      );

      return result;
    } catch (error: any) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      if (status === 401 || status === 403) {
        // Invalidar token em cache para forçar renovação
        this.cachedToken = null;
        return { success: false, error: 'Credenciais SERPRO inválidas ou expiradas.' };
      }
      if (status === 404) {
        return { success: false, error: 'CPF não encontrado na base da Receita Federal.' };
      }
      if (status === 429) {
        return { success: false, error: 'Rate limit SERPRO atingido. Tente novamente.' };
      }

      console.error(`❌ Erro SERPRO CPF para ${cpf}:`, message);
      return { success: false, error: `Erro ao consultar SERPRO: ${message}` };
    }
  }
}

export const serproCpfService = new SerproCpfService();

import axios from 'axios';
import { cacheService, CachePrefixes } from './cache.service';

/**
 * CPF Lookup Service
 *
 * Prioridade:
 * 1. SERPRO (se credentials configuradas) - API oficial do Governo
 * 2. Brasil API (fallback gratuito) - https://brasilapi.com.br
 *
 * Autenticação SERPRO: OAuth2 client_credentials
 * Brasil API: Sem autenticação
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
  source?: 'SERPRO' | 'BRASIL_API' | 'VALIDATION_ONLY';
}

export class SerproCpfService {
  private tokenUrl: string;
  private apiUrl: string;
  private consumerKey: string;
  private consumerSecret: string;
  private cachedToken: { token: string; expiresAt: number } | null = null;
  private cacheTTL = 60 * 60 * 24 * 7; // 7 dias
  private brasilApiUrl = 'https://brasilapi.com.br/api/cpf/v1';
  private useSerproApi: boolean;

  constructor() {
    this.tokenUrl = process.env.SERPRO_CPF_TOKEN_URL || 'https://gateway.apiserpro.serpro.gov.br/token';
    this.apiUrl = process.env.SERPRO_CPF_API_URL || 'https://gateway.apiserpro.serpro.gov.br/consulta-cpf-df/v1/cpf';
    this.consumerKey = process.env.SERPRO_CPF_CONSUMER_KEY || '';
    this.consumerSecret = process.env.SERPRO_CPF_CONSUMER_SECRET || '';
    this.useSerproApi = !!(this.consumerKey && this.consumerSecret);

    if (this.useSerproApi) {
      console.log('✅ SERPRO CPF configurado - usando API oficial');
    } else {
      console.log('ℹ️  SERPRO não configurado - usando Brasil API como fallback');
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
   * Consulta CPF - usa SERPRO se configurado, senão Brasil API
   */
  async consultarCPF(cpf: string): Promise<SerproCpfResult> {
    const cpfLimpo = cpf.replace(/[^\d]/g, '');

    if (cpfLimpo.length !== 11) {
      return { success: false, error: 'CPF inválido - deve conter 11 dígitos' };
    }

    // Validar CPF matematicamente
    if (!this.validarCPF(cpfLimpo)) {
      return { success: false, error: 'CPF inválido (dígitos verificadores incorretos)' };
    }

    // Verificar cache
    const cached = await cacheService.get<SerproCpfResult>(
      CachePrefixes.SERPRO_CPF,
      cpfLimpo
    );

    if (cached) {
      return { ...cached, cached: true };
    }

    // Usar SERPRO se configurado, senão Brasil API
    if (this.useSerproApi) {
      return this.consultarViaSerpro(cpfLimpo);
    } else {
      return this.consultarViaBrasilApi(cpfLimpo);
    }
  }

  /**
   * Consulta CPF via SERPRO (API oficial)
   */
  private async consultarViaSerpro(cpfLimpo: string): Promise<SerproCpfResult> {
    try {
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
        source: 'SERPRO',
      };

      await cacheService.set(CachePrefixes.SERPRO_CPF, cpfLimpo, result, this.cacheTTL);
      return result;
    } catch (error: any) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      if (status === 401 || status === 403) {
        this.cachedToken = null;
        // Fallback para Brasil API em caso de erro de auth
        console.warn('⚠️  SERPRO auth falhou, tentando Brasil API...');
        return this.consultarViaBrasilApi(cpfLimpo);
      }
      if (status === 404) {
        return { success: false, error: 'CPF não encontrado na base da Receita Federal.', source: 'SERPRO' };
      }
      if (status === 429) {
        // Fallback para Brasil API em caso de rate limit
        console.warn('⚠️  SERPRO rate limit, tentando Brasil API...');
        return this.consultarViaBrasilApi(cpfLimpo);
      }

      console.error(`❌ Erro SERPRO CPF para ${cpfLimpo}:`, message);
      // Fallback para Brasil API em caso de erro
      return this.consultarViaBrasilApi(cpfLimpo);
    }
  }

  /**
   * Consulta CPF via Brasil API (gratuito, sem auth)
   */
  private async consultarViaBrasilApi(cpfLimpo: string): Promise<SerproCpfResult> {
    try {
      const response = await axios.get(
        `${this.brasilApiUrl}/${cpfLimpo}`,
        { timeout: 15000 }
      );

      const d = response.data;

      const result: SerproCpfResult = {
        success: true,
        data: {
          cpf: cpfLimpo,
          nome: d.nome || '',
          situacao: d.situacao_cadastral || 'Regular',
          nascimento: d.data_nascimento || undefined,
          obito: undefined,
        },
        source: 'BRASIL_API',
      };

      await cacheService.set(CachePrefixes.SERPRO_CPF, cpfLimpo, result, this.cacheTTL);
      return result;
    } catch (error: any) {
      const status = error.response?.status;

      if (status === 404 || status === 400) {
        // Brasil API retorna 400 para CPF não encontrado
        // Retornar sucesso apenas com validação matemática
        return this.retornarApenasValidacao(cpfLimpo);
      }

      if (status === 429) {
        console.warn('⚠️  Brasil API rate limit - retornando apenas validação');
        return this.retornarApenasValidacao(cpfLimpo);
      }

      console.error(`❌ Erro Brasil API para ${cpfLimpo}:`, error.message);
      // Em caso de erro, ainda retornamos que o CPF é válido matematicamente
      return this.retornarApenasValidacao(cpfLimpo);
    }
  }

  /**
   * Retorna resultado apenas com validação matemática (sem dados da Receita)
   */
  private retornarApenasValidacao(cpfLimpo: string): SerproCpfResult {
    return {
      success: true,
      data: {
        cpf: cpfLimpo,
        nome: '',
        situacao: 'CPF válido (sem consulta Receita)',
      },
      source: 'VALIDATION_ONLY',
    };
  }

  /**
   * Valida CPF matematicamente (módulo 11)
   */
  private validarCPF(cpf: string): boolean {
    // CPFs conhecidos como inválidos
    const invalidos = [
      '00000000000', '11111111111', '22222222222', '33333333333',
      '44444444444', '55555555555', '66666666666', '77777777777',
      '88888888888', '99999999999',
    ];
    if (invalidos.includes(cpf)) return false;

    // Validação do primeiro dígito verificador
    let soma = 0;
    for (let i = 0; i < 9; i++) {
      soma += parseInt(cpf.charAt(i)) * (10 - i);
    }
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.charAt(9))) return false;

    // Validação do segundo dígito verificador
    soma = 0;
    for (let i = 0; i < 10; i++) {
      soma += parseInt(cpf.charAt(i)) * (11 - i);
    }
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.charAt(10))) return false;

    return true;
  }
}

export const serproCpfService = new SerproCpfService();

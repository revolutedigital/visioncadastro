import axios from 'axios';
import { cacheService, CachePrefixes } from './cache.service';

/**
 * CNPJA API Service
 * Consulta dados de CNPJ via API CNPJA (cnpja.com)
 * 3 créditos por consulta: Receita Federal (1₪) + Simples Nacional (1₪) + CCC (1₪)
 */

export interface CnpjaPartner {
  nome: string;
  cpf: string;
  qualificacao: string;
  dataEntrada?: string;
}

export interface CnpjaRegistration {
  numero: string;
  estado: string;
  situacao: string;
  habilitado?: boolean;
}

export interface CnpjaResult {
  success: boolean;
  data?: {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia?: string;
    endereco: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
    enderecoCompleto: string;
    situacao: string;
    dataAbertura: string;
    naturezaJuridica: string;
    atividadePrincipal?: string;
    // Simples Nacional
    simplesNacional: boolean;
    simplesNacionalData?: string;
    meiOptante: boolean;
    // CCC - Cadastro de Contribuintes
    cccStatus?: string;
    cccDetalhes?: CnpjaRegistration[];
    // Quadro Societário
    quadroSocietario: CnpjaPartner[];
    quadroSocietarioQtd: number;
    // Empresa
    capitalSocial?: number;
    porteEmpresa?: string;
  };
  error?: string;
  cached?: boolean;
}

export class CnpjaService {
  private baseUrl = 'https://api.cnpja.com';
  private apiKey: string;
  private cacheTTL = 60 * 60 * 24 * 30; // 30 dias

  constructor() {
    this.apiKey = process.env.CNPJA_API_KEY || '';
    if (!this.apiKey) {
      console.warn('⚠️  CNPJA_API_KEY não configurada');
    }
  }

  /**
   * Consulta CNPJ na CNPJA API
   * Parâmetros: simples=true (Simples Nacional) + registrations=true (CCC)
   */
  async consultarCNPJ(cnpj: string): Promise<CnpjaResult> {
    try {
      const cnpjLimpo = cnpj.replace(/[^\d]/g, '');

      if (cnpjLimpo.length !== 14) {
        return { success: false, error: 'CNPJ inválido - deve conter 14 dígitos' };
      }

      // Verificar cache
      const cached = await cacheService.get<CnpjaResult>(
        CachePrefixes.CNPJA_CNPJ,
        cnpjLimpo
      );

      if (cached) {
        return { ...cached, cached: true };
      }

      if (!this.apiKey) {
        return { success: false, error: 'CNPJA_API_KEY não configurada' };
      }

      // Chamada API: 3 créditos (receita + simples + registrations/CCC)
      const response = await axios.get(
        `${this.baseUrl}/office/${cnpjLimpo}`,
        {
          params: {
            simples: true,
            registrations: true,
          },
          headers: {
            Authorization: this.apiKey,
          },
          timeout: 30000,
        }
      );

      const d = response.data;

      // Mapear resposta CNPJA para nosso formato
      const address = d.address || {};
      const enderecoCompleto = [
        address.street,
        address.number,
        address.details,
        address.district,
        address.city,
        address.state,
        address.zip,
      ]
        .filter(Boolean)
        .join(', ');

      const result: CnpjaResult = {
        success: true,
        data: {
          cnpj: cnpjLimpo,
          razaoSocial: d.company?.name || d.alias || '',
          nomeFantasia: d.alias || d.company?.name || '',
          endereco: `${address.street || ''}, ${address.number || ''}`,
          numero: address.number || '',
          complemento: address.details || '',
          bairro: address.district || '',
          cidade: address.city || '',
          estado: address.state || '',
          cep: address.zip || '',
          enderecoCompleto,
          situacao: d.status?.text || '',
          dataAbertura: d.founded || '',
          naturezaJuridica: d.company?.nature?.text || '',
          atividadePrincipal: d.mainActivity?.text || d.sideActivities?.[0]?.text || '',
          // Simples Nacional
          simplesNacional: d.company?.simples?.optant === true,
          simplesNacionalData: d.company?.simples?.since || d.company?.simples?.until || undefined,
          meiOptante: d.company?.simei?.optant === true,
          // CCC
          cccStatus: this.extractCccStatus(d.registrations),
          cccDetalhes: this.extractCccDetalhes(d.registrations),
          // Quadro Societário
          quadroSocietario: this.extractPartners(d.company?.members || []),
          quadroSocietarioQtd: (d.company?.members || []).length,
          // Empresa
          capitalSocial: d.company?.equity || undefined,
          porteEmpresa: d.company?.size?.text || undefined,
        },
      };

      // Salvar no cache
      await cacheService.set(
        CachePrefixes.CNPJA_CNPJ,
        cnpjLimpo,
        result,
        this.cacheTTL
      );

      return result;
    } catch (error: any) {
      const status = error.response?.status;
      const message = error.response?.data?.message || error.message;

      if (status === 429) {
        return { success: false, error: 'Rate limit CNPJA atingido. Tente novamente em instantes.' };
      }
      if (status === 401) {
        return { success: false, error: 'CNPJA_API_KEY inválida ou expirada.' };
      }

      console.error(`❌ Erro CNPJA para CNPJ ${cnpj}:`, message);
      return { success: false, error: `Erro ao consultar CNPJA: ${message}` };
    }
  }

  private extractPartners(members: any[]): CnpjaPartner[] {
    return members.map((m: any) => ({
      nome: m.person?.name || '',
      cpf: m.person?.taxId || '',
      qualificacao: m.role?.text || '',
      dataEntrada: m.since || undefined,
    }));
  }

  private extractCccStatus(registrations: any[]): string | undefined {
    if (!registrations || registrations.length === 0) return undefined;
    const ativas = registrations.filter((r: any) => r.status?.id === 1 || r.enabled);
    if (ativas.length === registrations.length) return 'ATIVA';
    if (ativas.length > 0) return 'PARCIAL';
    return 'INATIVA';
  }

  private extractCccDetalhes(registrations: any[]): CnpjaRegistration[] | undefined {
    if (!registrations || registrations.length === 0) return undefined;
    return registrations.map((r: any) => ({
      numero: r.number || '',
      estado: r.state || '',
      situacao: r.status?.text || '',
      habilitado: r.enabled || false,
    }));
  }
}

export const cnpjaService = new CnpjaService();

/**
 * Document Detector Service
 * Detecta automaticamente se um documento é CNPJ ou CPF
 * e valida usando algoritmo módulo 11.
 */

export interface DocumentDetectionResult {
  tipo: 'CNPJ' | 'CPF' | 'INVALIDO';
  limpo: string;
  formatado: string;
}

export class DocumentDetectorService {
  /**
   * Detecta e valida um documento (CNPJ ou CPF)
   */
  detect(documento: string): DocumentDetectionResult {
    const limpo = documento.replace(/[^\d]/g, '');

    // Se tem 14 dígitos, é CNPJ (mesmo se dígito verificador errado)
    if (limpo.length === 14) {
      return {
        tipo: 'CNPJ',
        limpo,
        formatado: this.formatarCNPJ(limpo),
      };
    }

    // Se tem 11 dígitos, é CPF (mesmo se dígito verificador errado)
    if (limpo.length === 11) {
      return {
        tipo: 'CPF',
        limpo,
        formatado: this.formatarCPF(limpo),
      };
    }

    // Documento com tamanho diferente
    return { tipo: 'INVALIDO', limpo, formatado: limpo };
  }

  /**
   * Valida CPF com algoritmo módulo 11
   */
  validarCPF(cpf: string): boolean {
    const limpo = cpf.replace(/[^\d]/g, '');
    if (limpo.length !== 11) return false;

    // Rejeitar CPFs com todos os dígitos iguais
    if (/^(\d)\1{10}$/.test(limpo)) return false;

    // Primeiro dígito verificador
    let soma = 0;
    for (let i = 0; i < 9; i++) {
      soma += parseInt(limpo.charAt(i)) * (10 - i);
    }
    let resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    if (resto !== parseInt(limpo.charAt(9))) return false;

    // Segundo dígito verificador
    soma = 0;
    for (let i = 0; i < 10; i++) {
      soma += parseInt(limpo.charAt(i)) * (11 - i);
    }
    resto = (soma * 10) % 11;
    if (resto === 10) resto = 0;
    if (resto !== parseInt(limpo.charAt(10))) return false;

    return true;
  }

  /**
   * Valida CNPJ com algoritmo módulo 11
   */
  validarCNPJ(cnpj: string): boolean {
    const limpo = cnpj.replace(/[^\d]/g, '');
    if (limpo.length !== 14) return false;

    // Rejeitar CNPJs com todos os dígitos iguais
    if (/^(\d)\1{13}$/.test(limpo)) return false;

    // Primeiro dígito verificador
    const pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let soma = 0;
    for (let i = 0; i < 12; i++) {
      soma += parseInt(limpo.charAt(i)) * pesos1[i];
    }
    let resto = soma % 11;
    const dig1 = resto < 2 ? 0 : 11 - resto;
    if (dig1 !== parseInt(limpo.charAt(12))) return false;

    // Segundo dígito verificador
    const pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    soma = 0;
    for (let i = 0; i < 13; i++) {
      soma += parseInt(limpo.charAt(i)) * pesos2[i];
    }
    resto = soma % 11;
    const dig2 = resto < 2 ? 0 : 11 - resto;
    if (dig2 !== parseInt(limpo.charAt(13))) return false;

    return true;
  }

  private formatarCPF(cpf: string): string {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  private formatarCNPJ(cnpj: string): string {
    return cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
}

export const documentDetectorService = new DocumentDetectorService();

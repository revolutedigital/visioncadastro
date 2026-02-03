import * as XLSX from 'xlsx';

export interface ClienteData {
  nome: string;
  telefone?: string;
  endereco: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  tipoServico?: string;
  cnpj?: string; // CNPJ do cliente
}

export interface ParseResult {
  success: boolean;
  data: ClienteData[];
  errors: string[];
  totalLinhas: number;
}

export class ParserService {
  /**
   * Faz parse de arquivo Excel (.xlsx, .xls)
   */
  parseExcel(buffer: Buffer): ParseResult {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0]; // Primeira aba
      const worksheet = workbook.Sheets[sheetName];

      // Converter para JSON
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      return this.processData(jsonData);
    } catch (error) {
      return {
        success: false,
        data: [],
        errors: [`Erro ao fazer parse do Excel: ${(error as Error).message}`],
        totalLinhas: 0,
      };
    }
  }

  /**
   * Faz parse de arquivo CSV
   */
  parseCSV(buffer: Buffer): ParseResult {
    try {
      const csvString = buffer.toString('utf-8');
      const workbook = XLSX.read(csvString, { type: 'string' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      return this.processData(jsonData);
    } catch (error) {
      return {
        success: false,
        data: [],
        errors: [`Erro ao fazer parse do CSV: ${(error as Error).message}`],
        totalLinhas: 0,
      };
    }
  }

  /**
   * Processa dados extraídos e normaliza
   */
  private processData(jsonData: any[]): ParseResult {
    const clientes: ClienteData[] = [];
    const errors: string[] = [];

    jsonData.forEach((row, index) => {
      const linha = index + 2; // +2 porque: 0-based + header row

      try {
        // Mapear colunas (aceita vários nomes possíveis)
        const cliente: ClienteData = {
          nome: this.extractField(row, ['nome', 'Nome', 'NOME', 'razao_social', 'Razão Social']),
          telefone: this.extractField(row, ['telefone', 'Telefone', 'TELEFONE', 'fone', 'Fone']),
          endereco: this.extractField(row, ['endereco', 'Endereço', 'ENDERECO', 'rua', 'Rua']),
          cidade: this.extractField(row, ['cidade', 'Cidade', 'CIDADE']),
          estado: this.extractField(row, ['estado', 'Estado', 'ESTADO', 'uf', 'UF']),
          cep: this.extractField(row, ['cep', 'CEP', 'Cep']),
          tipoServico: this.extractField(row, ['tipo_servico', 'Tipo Serviço', 'servico', 'Serviço']),
          cnpj: this.extractField(row, ['cnpj', 'CNPJ', 'Cnpj', 'CPF', 'cpf']),
        };

        // Validação básica - apenas CNPJ é obrigatório (nome/endereco vem da Receita)
        if (!cliente.cnpj) {
          errors.push(`Linha ${linha}: CNPJ/CPF faltando`);
          return;
        }

        // Normalizar dados
        if (cliente.nome) cliente.nome = this.normalizarTexto(cliente.nome);
        if (cliente.endereco) cliente.endereco = this.normalizarTexto(cliente.endereco);
        if (cliente.telefone) cliente.telefone = this.normalizarTelefone(cliente.telefone);
        if (cliente.cep) cliente.cep = this.normalizarCEP(cliente.cep);
        if (cliente.cnpj) cliente.cnpj = this.normalizarCNPJ(cliente.cnpj);

        clientes.push(cliente);
      } catch (error) {
        errors.push(`Linha ${linha}: ${(error as Error).message}`);
      }
    });

    return {
      success: errors.length === 0 || clientes.length > 0,
      data: clientes,
      errors,
      totalLinhas: jsonData.length,
    };
  }

  /**
   * Extrai campo com múltiplos nomes possíveis
   */
  private extractField(row: any, possibleNames: string[]): string {
    for (const name of possibleNames) {
      if (row[name] !== undefined && row[name] !== null && row[name] !== '') {
        return String(row[name]).trim();
      }
    }
    return '';
  }

  /**
   * Normaliza texto (remove espaços extras, capitaliza)
   */
  private normalizarTexto(texto: string): string {
    return texto
      .trim()
      .replace(/\s+/g, ' ') // Remove espaços múltiplos
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  /**
   * Normaliza telefone (remove caracteres não numéricos)
   */
  private normalizarTelefone(telefone: string): string {
    return telefone.replace(/\D/g, ''); // Remove tudo que não é dígito
  }

  /**
   * Normaliza CEP
   */
  private normalizarCEP(cep: string): string {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length === 8) {
      return `${cepLimpo.slice(0, 5)}-${cepLimpo.slice(5)}`;
    }
    return cepLimpo;
  }

  /**
   * Normaliza CNPJ/CPF (remove caracteres não numéricos)
   */
  private normalizarCNPJ(cnpj: string): string {
    // Remove tudo que não é dígito
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    // Retorna apenas os dígitos (14 para CNPJ, 11 para CPF)
    if (cnpjLimpo.length === 14 || cnpjLimpo.length === 11) {
      return cnpjLimpo;
    }
    // Se não tem tamanho válido, retorna mesmo assim (será validado depois)
    return cnpjLimpo;
  }

  /**
   * Valida formato de telefone
   */
  validarTelefone(telefone: string): boolean {
    const telefoneLimpo = telefone.replace(/\D/g, '');
    // Telefone brasileiro: 10 ou 11 dígitos
    return telefoneLimpo.length === 10 || telefoneLimpo.length === 11;
  }

  /**
   * Valida formato de CEP
   */
  validarCEP(cep: string): boolean {
    const cepLimpo = cep.replace(/\D/g, '');
    return cepLimpo.length === 8;
  }

  /**
   * Detecta duplicatas por nome
   */
  detectarDuplicatas(clientes: ClienteData[]): Map<string, ClienteData[]> {
    const duplicatas = new Map<string, ClienteData[]>();

    clientes.forEach(cliente => {
      const nomeNormalizado = cliente.nome.toLowerCase();
      if (!duplicatas.has(nomeNormalizado)) {
        duplicatas.set(nomeNormalizado, []);
      }
      duplicatas.get(nomeNormalizado)!.push(cliente);
    });

    // Filtrar apenas os que realmente são duplicados (>1)
    const resultado = new Map<string, ClienteData[]>();
    duplicatas.forEach((lista, nome) => {
      if (lista.length > 1) {
        resultado.set(nome, lista);
      }
    });

    return resultado;
  }
}

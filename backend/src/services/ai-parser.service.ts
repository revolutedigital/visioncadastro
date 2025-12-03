import Anthropic from '@anthropic-ai/sdk';
import * as XLSX from 'xlsx';

interface ColumnMapping {
  nome?: string;
  telefone?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  tipoServico?: string;
  cnpj?: string;
}

export class AIParserService {
  private claude: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY não configurada');
    }
    this.claude = new Anthropic({ apiKey });
  }

  /**
   * Usa IA para identificar automaticamente as colunas da planilha
   */
  async identifyColumns(buffer: Buffer, fileType: 'excel' | 'csv'): Promise<ColumnMapping> {
    try {
      // Extrair headers e primeiras linhas
      const workbook = fileType === 'excel'
        ? XLSX.read(buffer, { type: 'buffer' })
        : XLSX.read(buffer.toString('utf-8'), { type: 'string' });

      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (jsonData.length === 0) {
        throw new Error('Planilha vazia');
      }

      // Pegar headers (nomes das colunas)
      const headers = Object.keys(jsonData[0] as Record<string, unknown>);

      // Pegar primeiras 3 linhas como exemplo
      const sampleRows = jsonData.slice(0, 3);

      // Montar prompt para Claude
      const prompt = `Analise esta planilha de clientes e identifique qual coluna corresponde a cada campo.

COLUNAS DISPONÍVEIS:
${headers.map((h, i) => `${i + 1}. ${h}`).join('\n')}

EXEMPLOS DE DADOS (primeiras 3 linhas):
${JSON.stringify(sampleRows, null, 2)}

CAMPOS A IDENTIFICAR:
- nome: Nome do cliente/estabelecimento
- telefone: Número de telefone
- endereco: Endereço completo (rua, número)
- cidade: Nome da cidade
- estado: Estado/UF
- cep: CEP
- tipoServico: Tipo de serviço/negócio
- cnpj: CNPJ da empresa (pode estar como "CNPJ", "CPF/CNPJ", "Documento", etc.)

IMPORTANTE:
- Retorne APENAS um objeto JSON válido
- Use o nome EXATO da coluna como valor
- Se uma coluna não existir, use null
- Não adicione explicações, apenas o JSON

Formato de resposta:
{
  "nome": "nome_da_coluna",
  "telefone": "nome_da_coluna" ou null,
  "endereco": "nome_da_coluna",
  "cidade": "nome_da_coluna" ou null,
  "estado": "nome_da_coluna" ou null,
  "cep": "nome_da_coluna" ou null,
  "tipoServico": "nome_da_coluna" ou null,
  "cnpj": "nome_da_coluna" ou null
}`;

      console.log('🤖 Solicitando identificação de colunas à IA...');

      const message = await this.claude.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      const responseText = message.content[0].type === 'text'
        ? message.content[0].text
        : '';

      console.log('📝 Resposta da IA:', responseText);

      // Extrair JSON da resposta
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('IA não retornou JSON válido');
      }

      const mapping: ColumnMapping = JSON.parse(jsonMatch[0]);

      // Validar que pelo menos nome e endereço foram identificados
      if (!mapping.nome || !mapping.endereco) {
        throw new Error('IA não conseguiu identificar colunas obrigatórias (nome e endereço)');
      }

      console.log('✅ Mapeamento identificado:', mapping);

      return mapping;
    } catch (error) {
      console.error('❌ Erro na identificação por IA:', error);
      throw error;
    }
  }

  /**
   * Extrai dados usando o mapeamento identificado pela IA
   */
  extractDataWithMapping(buffer: Buffer, fileType: 'excel' | 'csv', mapping: ColumnMapping): any[] {
    const workbook = fileType === 'excel'
      ? XLSX.read(buffer, { type: 'buffer' })
      : XLSX.read(buffer.toString('utf-8'), { type: 'string' });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

    return jsonData.map((row: any) => ({
      nome: mapping.nome ? row[mapping.nome] : '',
      telefone: mapping.telefone ? row[mapping.telefone] : '',
      endereco: mapping.endereco ? row[mapping.endereco] : '',
      cidade: mapping.cidade ? row[mapping.cidade] : '',
      estado: mapping.estado ? row[mapping.estado] : '',
      cep: mapping.cep ? row[mapping.cep] : '',
      tipoServico: mapping.tipoServico ? row[mapping.tipoServico] : '',
      cnpj: mapping.cnpj ? row[mapping.cnpj] : '',
    }));
  }
}

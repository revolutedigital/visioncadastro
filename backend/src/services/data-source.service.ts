import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Serviço de Rastreio de Fontes de Dados
 *
 * PRINCÍPIO FUNDAMENTAL:
 * - O único dado confiável da planilha é o CNPJ/CPF (documento)
 * - Todo o restante deve vir de fontes validadas (CNPJA, Google, SERPRO)
 * - Dados da planilha servem apenas para COMPARAÇÃO, não como verdade
 */

// Níveis de confiança por fonte
export enum FonteConfianca {
  DOCUMENTO_PLANILHA = 100,  // CNPJ/CPF - único dado confiável do input
  RECEITA_FEDERAL = 95,      // CNPJA - dados oficiais do governo
  SERPRO_CPF = 95,           // SERPRO - dados oficiais do governo
  GOOGLE_PLACES = 85,        // Crowdsourced mas validado
  GOOGLE_GEOCODING = 90,     // Algoritmo de geocodificação
  CLAUDE_VISION = 75,        // IA - análise derivada
  PLANILHA_NAO_VALIDADO = 30, // Dados da planilha NÃO validados
  DESCONHECIDO = 0,
}

export type FonteTipo =
  | 'PLANILHA'           // Dado veio da planilha (baixa confiança exceto CNPJ)
  | 'CNPJA'              // CNPJA API (Receita Federal)
  | 'SERPRO'             // SERPRO (CPF)
  | 'GOOGLE_GEOCODING'   // Google Geocoding API
  | 'GOOGLE_PLACES'      // Google Places API
  | 'CLAUDE_VISION'      // Análise de IA (Claude)
  | 'VALIDACAO_CRUZADA'; // Dado confirmado por múltiplas fontes

export interface CampoFonte {
  campo: string;
  label: string;
  valor: any;
  fonte: FonteTipo;
  fonteSecundaria?: FonteTipo;  // Se validado por outra fonte
  confianca: number;            // 0-100
  validado: boolean;            // Se foi confirmado por fonte externa
  divergencia?: string;         // Se há divergência entre fontes
}

export interface MapaFontes {
  // Identificação (única fonte confiável da planilha)
  documento: CampoFonte;
  tipoDocumento: CampoFonte;

  // Dados Cadastrais (CNPJA/SERPRO são fonte de verdade)
  nome: CampoFonte;
  razaoSocial: CampoFonte;
  nomeFantasia: CampoFonte;

  // Localização (Google é fonte de verdade)
  endereco: CampoFonte;
  enderecoNormalizado: CampoFonte;
  cidade: CampoFonte;
  estado: CampoFonte;
  cep: CampoFonte;
  latitude: CampoFonte;
  longitude: CampoFonte;

  // Comercial (CNPJA + Google Places)
  situacaoReceita: CampoFonte;
  simplesNacional: CampoFonte;
  quadroSocietario: CampoFonte;
  rating: CampoFonte;
  totalAvaliacoes: CampoFonte;

  // Contato (Google Places é fonte de verdade)
  telefone: CampoFonte;
  website: CampoFonte;

  // Visual (Claude Vision)
  analiseVisual: CampoFonte;
}

export interface ResumoConfiabilidade {
  scoreGeral: number;           // 0-100
  classificacao: 'BAIXA' | 'MEDIA' | 'ALTA' | 'EXCELENTE';
  fontePrincipal: FonteTipo;
  fontesValidadas: FonteTipo[];
  camposConfiados: number;
  camposTotais: number;
  alertas: string[];
  divergencias: string[];
}

export interface ContextoArcaAnalyst {
  cliente: {
    id: string;
    documentoAncora: string;     // CNPJ ou CPF - único dado "âncora"
    tipoDocumento: 'CNPJ' | 'CPF' | 'INVALIDO';
  };
  mapaFontes: MapaFontes;
  resumo: ResumoConfiabilidade;
  dadosPlanilha: {              // Dados originais da planilha (para comparação)
    nome?: string | null;
    endereco?: string | null;
    telefone?: string | null;
    cidade?: string | null;
    estado?: string | null;
  };
  dadosValidados: {             // Dados das fontes confiáveis
    cnpja?: any;
    serpro?: any;
    googlePlaces?: any;
    googleGeocoding?: any;
    claudeVision?: any;
  };
}

export class DataSourceService {
  /**
   * Monta o mapa completo de fontes para um cliente
   */
  async buildSourceMap(clienteId: string): Promise<ContextoArcaAnalyst> {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      include: { fotos: true },
    });

    if (!cliente) {
      throw new Error('Cliente não encontrado');
    }

    // Determinar documento âncora
    const documentoAncora = cliente.cnpj || cliente.cpf || '';
    const tipoDocumento = (cliente as any).tipoDocumento || this.detectarTipoDocumento(documentoAncora);

    // Construir mapa de fontes
    const mapaFontes = this.construirMapaFontes(cliente);

    // Calcular resumo de confiabilidade
    const resumo = this.calcularResumoConfiabilidade(mapaFontes, cliente);

    // Extrair dados originais da planilha
    const dadosPlanilha = {
      nome: cliente.nome,
      endereco: cliente.endereco,
      telefone: cliente.telefone,
      cidade: cliente.cidade,
      estado: cliente.estado,
    };

    // Extrair dados validados das fontes
    const dadosValidados = this.extrairDadosValidados(cliente);

    return {
      cliente: {
        id: clienteId,
        documentoAncora,
        tipoDocumento: tipoDocumento as 'CNPJ' | 'CPF' | 'INVALIDO',
      },
      mapaFontes,
      resumo,
      dadosPlanilha,
      dadosValidados,
    };
  }

  private detectarTipoDocumento(documento: string): string {
    const limpo = documento.replace(/\D/g, '');
    if (limpo.length === 14) return 'CNPJ';
    if (limpo.length === 11) return 'CPF';
    return 'INVALIDO';
  }

  private construirMapaFontes(cliente: any): MapaFontes {
    const temDadosCNPJA = cliente.receitaStatus === 'SUCESSO';
    const temDadosSERPRO = cliente.serproCpfStatus === 'SUCESSO';
    const temDadosGeocode = cliente.geocodingStatus === 'SUCESSO';
    const temDadosPlaces = cliente.placesStatus === 'SUCESSO';
    const temAnaliseIA = cliente.status === 'CONCLUIDO';

    return {
      // Documento - única fonte confiável da planilha
      documento: {
        campo: 'documento',
        label: 'CNPJ/CPF',
        valor: cliente.cnpj || cliente.cpf,
        fonte: 'PLANILHA',
        confianca: FonteConfianca.DOCUMENTO_PLANILHA,
        validado: temDadosCNPJA || temDadosSERPRO,
        fonteSecundaria: temDadosCNPJA ? 'CNPJA' : temDadosSERPRO ? 'SERPRO' : undefined,
      },

      tipoDocumento: {
        campo: 'tipoDocumento',
        label: 'Tipo de Documento',
        valor: cliente.tipoDocumento,
        fonte: temDadosCNPJA || temDadosSERPRO ? 'VALIDACAO_CRUZADA' : 'PLANILHA',
        confianca: temDadosCNPJA || temDadosSERPRO ? 95 : 50,
        validado: temDadosCNPJA || temDadosSERPRO,
      },

      // Nome - CNPJA é fonte de verdade para CNPJ
      nome: this.construirCampoNome(cliente, temDadosCNPJA, temDadosSERPRO, temDadosPlaces),

      razaoSocial: {
        campo: 'razaoSocial',
        label: 'Razão Social',
        valor: cliente.razaoSocial,
        fonte: temDadosCNPJA ? 'CNPJA' : 'PLANILHA',
        confianca: temDadosCNPJA ? FonteConfianca.RECEITA_FEDERAL : FonteConfianca.PLANILHA_NAO_VALIDADO,
        validado: temDadosCNPJA,
      },

      nomeFantasia: {
        campo: 'nomeFantasia',
        label: 'Nome Fantasia',
        valor: cliente.nomeFantasia,
        fonte: temDadosCNPJA ? 'CNPJA' : temDadosPlaces ? 'GOOGLE_PLACES' : 'PLANILHA',
        confianca: temDadosCNPJA ? FonteConfianca.RECEITA_FEDERAL : temDadosPlaces ? FonteConfianca.GOOGLE_PLACES : FonteConfianca.PLANILHA_NAO_VALIDADO,
        validado: temDadosCNPJA || temDadosPlaces,
      },

      // Endereço - Google Geocoding é fonte de verdade
      endereco: this.construirCampoEndereco(cliente, temDadosCNPJA, temDadosGeocode),

      enderecoNormalizado: {
        campo: 'enderecoNormalizado',
        label: 'Endereço Normalizado (IA)',
        valor: cliente.enderecoNormalizado,
        fonte: cliente.enderecoNormalizado ? 'CLAUDE_VISION' : 'PLANILHA',
        confianca: cliente.enderecoNormalizado ? FonteConfianca.CLAUDE_VISION : 0,
        validado: !!cliente.enderecoNormalizado,
      },

      cidade: {
        campo: 'cidade',
        label: 'Cidade',
        valor: cliente.cidade || this.extrairCidade(cliente),
        fonte: temDadosGeocode ? 'GOOGLE_GEOCODING' : temDadosCNPJA ? 'CNPJA' : 'PLANILHA',
        confianca: temDadosGeocode ? FonteConfianca.GOOGLE_GEOCODING : temDadosCNPJA ? FonteConfianca.RECEITA_FEDERAL : FonteConfianca.PLANILHA_NAO_VALIDADO,
        validado: temDadosGeocode || temDadosCNPJA,
      },

      estado: {
        campo: 'estado',
        label: 'Estado',
        valor: cliente.estado,
        fonte: temDadosGeocode ? 'GOOGLE_GEOCODING' : temDadosCNPJA ? 'CNPJA' : 'PLANILHA',
        confianca: temDadosGeocode ? FonteConfianca.GOOGLE_GEOCODING : temDadosCNPJA ? FonteConfianca.RECEITA_FEDERAL : FonteConfianca.PLANILHA_NAO_VALIDADO,
        validado: temDadosGeocode || temDadosCNPJA,
      },

      cep: {
        campo: 'cep',
        label: 'CEP',
        valor: cliente.cep,
        fonte: temDadosCNPJA ? 'CNPJA' : temDadosGeocode ? 'GOOGLE_GEOCODING' : 'PLANILHA',
        confianca: temDadosCNPJA ? FonteConfianca.RECEITA_FEDERAL : temDadosGeocode ? FonteConfianca.GOOGLE_GEOCODING : FonteConfianca.PLANILHA_NAO_VALIDADO,
        validado: temDadosCNPJA || temDadosGeocode,
      },

      latitude: {
        campo: 'latitude',
        label: 'Latitude',
        valor: cliente.latitude,
        fonte: temDadosGeocode ? 'GOOGLE_GEOCODING' : 'PLANILHA',
        confianca: temDadosGeocode ? FonteConfianca.GOOGLE_GEOCODING : 0,
        validado: temDadosGeocode,
      },

      longitude: {
        campo: 'longitude',
        label: 'Longitude',
        valor: cliente.longitude,
        fonte: temDadosGeocode ? 'GOOGLE_GEOCODING' : 'PLANILHA',
        confianca: temDadosGeocode ? FonteConfianca.GOOGLE_GEOCODING : 0,
        validado: temDadosGeocode,
      },

      // Comercial
      situacaoReceita: {
        campo: 'situacaoReceita',
        label: 'Situação na Receita',
        valor: cliente.situacaoReceita,
        fonte: temDadosCNPJA ? 'CNPJA' : 'PLANILHA',
        confianca: temDadosCNPJA ? FonteConfianca.RECEITA_FEDERAL : 0,
        validado: temDadosCNPJA,
      },

      simplesNacional: {
        campo: 'simplesNacional',
        label: 'Simples Nacional',
        valor: cliente.simplesNacional,
        fonte: temDadosCNPJA ? 'CNPJA' : 'PLANILHA',
        confianca: temDadosCNPJA ? FonteConfianca.RECEITA_FEDERAL : 0,
        validado: temDadosCNPJA,
      },

      quadroSocietario: {
        campo: 'quadroSocietario',
        label: 'Quadro Societário',
        valor: cliente.quadroSocietario,
        fonte: temDadosCNPJA ? 'CNPJA' : 'PLANILHA',
        confianca: temDadosCNPJA ? FonteConfianca.RECEITA_FEDERAL : 0,
        validado: temDadosCNPJA && !!cliente.quadroSocietario,
      },

      rating: {
        campo: 'rating',
        label: 'Avaliação Google',
        valor: cliente.rating,
        fonte: temDadosPlaces ? 'GOOGLE_PLACES' : 'PLANILHA',
        confianca: temDadosPlaces ? FonteConfianca.GOOGLE_PLACES : 0,
        validado: temDadosPlaces,
      },

      totalAvaliacoes: {
        campo: 'totalAvaliacoes',
        label: 'Total de Avaliações',
        valor: cliente.totalAvaliacoes,
        fonte: temDadosPlaces ? 'GOOGLE_PLACES' : 'PLANILHA',
        confianca: temDadosPlaces ? FonteConfianca.GOOGLE_PLACES : 0,
        validado: temDadosPlaces,
      },

      // Contato
      telefone: {
        campo: 'telefone',
        label: 'Telefone',
        valor: cliente.telefonePlace || cliente.telefone,
        fonte: temDadosPlaces && cliente.telefonePlace ? 'GOOGLE_PLACES' : 'PLANILHA',
        confianca: temDadosPlaces && cliente.telefonePlace ? FonteConfianca.GOOGLE_PLACES : FonteConfianca.PLANILHA_NAO_VALIDADO,
        validado: temDadosPlaces && !!cliente.telefonePlace,
        divergencia: this.detectarDivergenciaTelefone(cliente),
      },

      website: {
        campo: 'website',
        label: 'Website',
        valor: cliente.websitePlace,
        fonte: temDadosPlaces ? 'GOOGLE_PLACES' : 'PLANILHA',
        confianca: temDadosPlaces && cliente.websitePlace ? FonteConfianca.GOOGLE_PLACES : 0,
        validado: temDadosPlaces && !!cliente.websitePlace,
      },

      // Visual
      analiseVisual: {
        campo: 'analiseVisual',
        label: 'Análise Visual (IA)',
        valor: temAnaliseIA ? {
          publicoAlvo: cliente.publicoAlvo,
          nivelProfissionalizacao: cliente.nivelProfissionalizacao,
          ambienteEstabelecimento: cliente.ambienteEstabelecimento,
        } : null,
        fonte: temAnaliseIA ? 'CLAUDE_VISION' : 'PLANILHA',
        confianca: temAnaliseIA ? FonteConfianca.CLAUDE_VISION : 0,
        validado: temAnaliseIA,
      },
    };
  }

  private construirCampoNome(cliente: any, temCNPJA: boolean, temSERPRO: boolean, temPlaces: boolean): CampoFonte {
    // Prioridade: CNPJA (razão social/fantasia) > Places > Planilha
    let valor = cliente.nome;
    let fonte: FonteTipo = 'PLANILHA';
    let confianca = FonteConfianca.PLANILHA_NAO_VALIDADO;
    let validado = false;
    let divergencia: string | undefined;

    if (temCNPJA && (cliente.razaoSocial || cliente.nomeFantasia)) {
      valor = cliente.nomeFantasia || cliente.razaoSocial;
      fonte = 'CNPJA';
      confianca = FonteConfianca.RECEITA_FEDERAL;
      validado = true;

      // Verificar divergência com planilha
      if (cliente.nome && !this.nomesCorrespondem(cliente.nome, valor)) {
        divergencia = `Planilha: "${cliente.nome}" ≠ CNPJA: "${valor}"`;
      }
    } else if (temSERPRO && cliente.cpfNome) {
      valor = cliente.cpfNome;
      fonte = 'SERPRO';
      confianca = FonteConfianca.SERPRO_CPF;
      validado = true;
    } else if (temPlaces && cliente.placeNomeValidado) {
      // Nome do Places foi validado por fuzzy matching
      fonte = 'VALIDACAO_CRUZADA';
      confianca = FonteConfianca.GOOGLE_PLACES;
      validado = true;
    }

    return {
      campo: 'nome',
      label: 'Nome/Razão Social',
      valor,
      fonte,
      confianca,
      validado,
      divergencia,
    };
  }

  private construirCampoEndereco(cliente: any, temCNPJA: boolean, temGeocode: boolean): CampoFonte {
    let valor = cliente.endereco;
    let fonte: FonteTipo = 'PLANILHA';
    let confianca = FonteConfianca.PLANILHA_NAO_VALIDADO;
    let validado = false;
    let fonteSecundaria: FonteTipo | undefined;
    let divergencia: string | undefined;

    // Prioridade: Google Geocoding > CNPJA > Planilha
    if (temGeocode && cliente.enderecoFormatado) {
      valor = cliente.enderecoFormatado;
      fonte = 'GOOGLE_GEOCODING';
      confianca = FonteConfianca.GOOGLE_GEOCODING;
      validado = true;

      // Se CNPJA também tem endereço, é validação cruzada
      if (temCNPJA && cliente.enderecoReceita) {
        fonteSecundaria = 'CNPJA';
        // Verificar divergência
        if (cliente.divergenciaEndereco) {
          divergencia = `Endereço Google difere do CNPJA`;
          confianca = Math.max(confianca - 10, 60); // Reduz confiança se divergir
        } else {
          confianca = Math.min(confianca + 5, 100); // Aumenta se concordar
        }
      }
    } else if (temCNPJA && cliente.enderecoReceita) {
      valor = cliente.enderecoReceita;
      fonte = 'CNPJA';
      confianca = FonteConfianca.RECEITA_FEDERAL;
      validado = true;
    }

    return {
      campo: 'endereco',
      label: 'Endereço',
      valor,
      fonte,
      fonteSecundaria,
      confianca,
      validado,
      divergencia,
    };
  }

  private calcularResumoConfiabilidade(mapa: MapaFontes, cliente: any): ResumoConfiabilidade {
    const campos = Object.values(mapa);
    const camposValidados = campos.filter(c => c.validado);
    const somaConfianca = campos.reduce((acc, c) => acc + c.confianca, 0);
    const mediaConfianca = Math.round(somaConfianca / campos.length);

    // Identificar fontes validadas
    const fontesSet = new Set<FonteTipo>();
    campos.forEach(c => {
      if (c.validado && c.fonte !== 'PLANILHA') {
        fontesSet.add(c.fonte);
      }
      if (c.fonteSecundaria) {
        fontesSet.add(c.fonteSecundaria);
      }
    });

    // Identificar divergências
    const divergencias = campos
      .filter(c => c.divergencia)
      .map(c => c.divergencia!);

    // Identificar alertas
    const alertas: string[] = [];

    if (!mapa.documento.validado) {
      alertas.push('⚠️ Documento (CNPJ/CPF) não foi validado em nenhuma fonte externa');
    }

    if (!mapa.endereco.validado) {
      alertas.push('⚠️ Endereço não foi validado - usando dado da planilha');
    }

    if (!mapa.nome.validado) {
      alertas.push('⚠️ Nome não foi validado - usando dado da planilha');
    }

    if (mapa.endereco.divergencia) {
      alertas.push('🔴 Divergência de endereço entre fontes');
    }

    if (cliente.alertaDuplicata) {
      alertas.push('🔴 Cadastro duplicado detectado');
    }

    if (cliente.situacaoReceita && !cliente.situacaoReceita.toUpperCase().includes('ATIVA')) {
      alertas.push(`🔴 Situação na Receita: ${cliente.situacaoReceita}`);
    }

    // Determinar fonte principal
    const fonteCounts = campos.reduce((acc, c) => {
      if (c.fonte !== 'PLANILHA') {
        acc[c.fonte] = (acc[c.fonte] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const fontePrincipal = (Object.entries(fonteCounts) as [string, number][])
      .sort((a, b) => b[1] - a[1])[0]?.[0] as FonteTipo || 'PLANILHA';

    // Classificação
    let classificacao: 'BAIXA' | 'MEDIA' | 'ALTA' | 'EXCELENTE';
    if (mediaConfianca >= 85) classificacao = 'EXCELENTE';
    else if (mediaConfianca >= 70) classificacao = 'ALTA';
    else if (mediaConfianca >= 50) classificacao = 'MEDIA';
    else classificacao = 'BAIXA';

    // Penalizar se houver alertas críticos
    if (alertas.some(a => a.includes('🔴'))) {
      if (classificacao === 'EXCELENTE') classificacao = 'ALTA';
      else if (classificacao === 'ALTA') classificacao = 'MEDIA';
    }

    return {
      scoreGeral: mediaConfianca,
      classificacao,
      fontePrincipal,
      fontesValidadas: Array.from(fontesSet),
      camposConfiados: camposValidados.length,
      camposTotais: campos.length,
      alertas,
      divergencias,
    };
  }

  private extrairDadosValidados(cliente: any): any {
    return {
      cnpja: cliente.receitaStatus === 'SUCESSO' ? {
        razaoSocial: cliente.razaoSocial,
        nomeFantasia: cliente.nomeFantasia,
        endereco: cliente.enderecoReceita,
        situacao: cliente.situacaoReceita,
        simplesNacional: cliente.simplesNacional,
        meiOptante: cliente.meiOptante,
        cccStatus: cliente.cccStatus,
        quadroSocietario: cliente.quadroSocietario ? JSON.parse(cliente.quadroSocietario) : null,
        capitalSocial: cliente.capitalSocial,
        porteEmpresa: cliente.porteEmpresa,
      } : null,

      serpro: cliente.serproCpfStatus === 'SUCESSO' ? {
        nome: cliente.cpfNome,
        situacao: cliente.cpfSituacao,
        nascimento: cliente.cpfNascimento,
        obito: cliente.cpfObito,
      } : null,

      googleGeocoding: cliente.geocodingStatus === 'SUCESSO' ? {
        enderecoFormatado: cliente.enderecoFormatado,
        latitude: cliente.latitude,
        longitude: cliente.longitude,
        geoValidado: cliente.geoValidado,
      } : null,

      googlePlaces: cliente.placesStatus === 'SUCESSO' ? {
        placeId: cliente.placeId,
        rating: cliente.rating,
        totalAvaliacoes: cliente.totalAvaliacoes,
        telefone: cliente.telefonePlace,
        website: cliente.websitePlace,
        horarioFuncionamento: cliente.horarioFuncionamento,
        tipoEstabelecimento: cliente.tipoEstabelecimento,
        nomeValidado: cliente.placeNomeValidado,
        enderecoValidado: cliente.placeEnderecoValidado,
      } : null,

      claudeVision: cliente.status === 'CONCLUIDO' ? {
        publicoAlvo: cliente.publicoAlvo,
        nivelProfissionalizacao: cliente.nivelProfissionalizacao,
        ambienteEstabelecimento: cliente.ambienteEstabelecimento,
        qualidadeSinalizacao: cliente.qualidadeSinalizacao,
        presencaBranding: cliente.presencaBranding,
        indicadoresVisuais: cliente.indicadoresVisuais,
        observacoes: cliente.observacoes,
      } : null,
    };
  }

  private extrairCidade(cliente: any): string | null {
    // Tentar extrair cidade do endereço formatado do Google
    if (cliente.enderecoFormatado) {
      const partes = cliente.enderecoFormatado.split(',');
      if (partes.length >= 3) {
        return partes[partes.length - 3].trim();
      }
    }
    return null;
  }

  private nomesCorrespondem(nome1: string, nome2: string): boolean {
    const normalizar = (s: string) => s.toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');

    const n1 = normalizar(nome1);
    const n2 = normalizar(nome2);

    // Similaridade simples - contém um ao outro ou > 60% match
    return n1.includes(n2) || n2.includes(n1) || this.similaridade(n1, n2) > 0.6;
  }

  private similaridade(s1: string, s2: string): number {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;

    if (longer.length === 0) return 1.0;

    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i])) matches++;
    }

    return matches / longer.length;
  }

  private detectarDivergenciaTelefone(cliente: any): string | undefined {
    if (cliente.telefone && cliente.telefonePlace) {
      const limpar = (t: string) => t.replace(/\D/g, '');
      const tel1 = limpar(cliente.telefone);
      const tel2 = limpar(cliente.telefonePlace);

      if (tel1 !== tel2 && tel1.length > 0 && tel2.length > 0) {
        return `Planilha: ${cliente.telefone} ≠ Google: ${cliente.telefonePlace}`;
      }
    }
    return undefined;
  }
}

export const dataSourceService = new DataSourceService();

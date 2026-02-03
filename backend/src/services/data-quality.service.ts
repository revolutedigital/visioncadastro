import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Sprint 3: Serviço de Qualidade de Dados
 * Garante máximo aproveitamento dos dados de cada cliente
 */

interface DataQualityReport {
  score: number; // 0-100
  camposPreenchidos: number;
  camposTotais: number;
  confiabilidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'EXCELENTE';
  camposCriticos: string[];
  fontesValidadas: string[];
  recomendacoes: string[];
  breakdown: DataQualityBreakdown;
}

interface CampoValidacao {
  nome: string;
  valor: any;
  peso: number; // 1-5 (5 = crítico)
  categoria: 'BASICO' | 'COMERCIAL' | 'LOCALIZACAO' | 'DIGITAL' | 'VISUAL' | 'REVIEWS';
  label: string; // Nome amigável para exibição
}

interface CampoBreakdown {
  campo: string;
  label: string;
  peso: number;
  pontos: number;
  preenchido: boolean;
  categoria: string;
}

interface DataQualityBreakdown {
  pesoTotal: number;
  pesoObtido: number;
  porCategoria: {
    [key: string]: {
      nome: string;
      campos: CampoBreakdown[];
      pesoTotal: number;
      pesoObtido: number;
    };
  };
}

export class DataQualityService {
  /**
   * Nomes amigáveis das categorias
   */
  private readonly CATEGORIA_NOMES: Record<string, string> = {
    BASICO: 'Dados Básicos',
    LOCALIZACAO: 'Localização',
    COMERCIAL: 'Dados Comerciais',
    VISUAL: 'Análise Visual',
    REVIEWS: 'Avaliações',
  };

  /**
   * Campos críticos e seus pesos para o score de qualidade
   */
  private readonly CAMPOS_VALIDACAO: CampoValidacao[] = [
    // BÁSICO (Peso Alto - essenciais para qualquer operação)
    { nome: 'nome', valor: null, peso: 5, categoria: 'BASICO', label: 'Nome do Estabelecimento' },
    { nome: 'endereco', valor: null, peso: 5, categoria: 'BASICO', label: 'Endereço' },
    { nome: 'telefone', valor: null, peso: 4, categoria: 'BASICO', label: 'Telefone' },
    { nome: 'cidade', valor: null, peso: 3, categoria: 'BASICO', label: 'Cidade' },
    { nome: 'estado', valor: null, peso: 3, categoria: 'BASICO', label: 'Estado' },
    { nome: 'cep', valor: null, peso: 3, categoria: 'BASICO', label: 'CEP' },

    // LOCALIZAÇÃO (Peso Alto - crítico para análise geográfica)
    { nome: 'latitude', valor: null, peso: 5, categoria: 'LOCALIZACAO', label: 'Latitude' },
    { nome: 'longitude', valor: null, peso: 5, categoria: 'LOCALIZACAO', label: 'Longitude' },
    { nome: 'enderecoFormatado', valor: null, peso: 3, categoria: 'LOCALIZACAO', label: 'Endereço Formatado (Google)' },
    { nome: 'placeId', valor: null, peso: 4, categoria: 'LOCALIZACAO', label: 'Google Place ID' },

    // COMERCIAL (Peso Médio-Alto - importante para scoring)
    { nome: 'tipoEstabelecimento', valor: null, peso: 4, categoria: 'COMERCIAL', label: 'Tipo de Estabelecimento' },
    { nome: 'rating', valor: null, peso: 4, categoria: 'COMERCIAL', label: 'Avaliação Google' },
    { nome: 'totalAvaliacoes', valor: null, peso: 4, categoria: 'COMERCIAL', label: 'Total de Avaliações' },
    { nome: 'horarioFuncionamento', valor: null, peso: 3, categoria: 'COMERCIAL', label: 'Horário de Funcionamento' },
    { nome: 'telefonePlace', valor: null, peso: 3, categoria: 'COMERCIAL', label: 'Telefone (Google)' },
    { nome: 'websitePlace', valor: null, peso: 2, categoria: 'COMERCIAL', label: 'Website' },

    // DIGITAL/VISUAL (Peso Médio - enriquece análise)
    { nome: 'qualidadeSinalizacao', valor: null, peso: 2, categoria: 'VISUAL', label: 'Qualidade da Sinalização' },
    { nome: 'presencaBranding', valor: null, peso: 2, categoria: 'VISUAL', label: 'Presença de Branding' },
    { nome: 'nivelProfissionalizacao', valor: null, peso: 2, categoria: 'VISUAL', label: 'Nível de Profissionalização' },
    { nome: 'publicoAlvo', valor: null, peso: 3, categoria: 'VISUAL', label: 'Público Alvo' },
    { nome: 'ambienteEstabelecimento', valor: null, peso: 2, categoria: 'VISUAL', label: 'Ambiente' },
    { nome: 'indicadoresVisuais', valor: null, peso: 2, categoria: 'VISUAL', label: 'Indicadores Visuais' },

    // REVIEWS (Peso Médio - insights valiosos)
    { nome: 'reviews', valor: null, peso: 3, categoria: 'REVIEWS', label: 'Reviews' },
    { nome: 'sentimentoGeral', valor: null, peso: 2, categoria: 'REVIEWS', label: 'Sentimento Geral' },
    { nome: 'problemasRecorrentes', valor: null, peso: 3, categoria: 'REVIEWS', label: 'Problemas Recorrentes' },
    { nome: 'pontosFortes', valor: null, peso: 3, categoria: 'REVIEWS', label: 'Pontos Fortes' },

    // SCORING (Peso Baixo - derivados de outros campos)
    { nome: 'scoringBreakdown', valor: null, peso: 1, categoria: 'COMERCIAL', label: 'Breakdown de Potencial' },
    { nome: 'potencialScore', valor: null, peso: 1, categoria: 'COMERCIAL', label: 'Score de Potencial' },

    // INTEGRIDADE CADASTRAL (CNPJA + SERPRO)
    { nome: 'tipoDocumento', valor: null, peso: 3, categoria: 'BASICO', label: 'Tipo de Documento (CNPJ/CPF)' },
    { nome: 'simplesNacional', valor: null, peso: 2, categoria: 'COMERCIAL', label: 'Simples Nacional' },
    { nome: 'cccStatus', valor: null, peso: 2, categoria: 'COMERCIAL', label: 'Cadastro de Contribuintes (CCC)' },
    { nome: 'quadroSocietario', valor: null, peso: 3, categoria: 'COMERCIAL', label: 'Quadro Societário' },
  ];

  /**
   * Analisa a qualidade dos dados de um cliente
   */
  async analyzeDataQuality(clienteId: string): Promise<DataQualityReport> {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      include: {
        fotos: true,
      },
    });

    if (!cliente) {
      throw new Error('Cliente não encontrado');
    }

    let camposPreenchidos = 0;
    let pesoTotal = 0;
    let pesoPreenchido = 0;
    const camposCriticos: string[] = [];
    const fontesValidadas: string[] = [];
    const recomendacoes: string[] = [];

    // Inicializar breakdown por categoria
    const breakdown: DataQualityBreakdown = {
      pesoTotal: 0,
      pesoObtido: 0,
      porCategoria: {},
    };

    // Inicializar categorias
    for (const cat of Object.keys(this.CATEGORIA_NOMES)) {
      breakdown.porCategoria[cat] = {
        nome: this.CATEGORIA_NOMES[cat],
        campos: [],
        pesoTotal: 0,
        pesoObtido: 0,
      };
    }

    // Analisar cada campo
    for (const campo of this.CAMPOS_VALIDACAO) {
      const valor = (cliente as any)[campo.nome];
      const preenchido = this.isFieldFilled(valor);

      pesoTotal += campo.peso;

      const campoBreakdown: CampoBreakdown = {
        campo: campo.nome,
        label: campo.label,
        peso: campo.peso,
        pontos: preenchido ? campo.peso : 0,
        preenchido,
        categoria: campo.categoria,
      };

      // Adicionar ao breakdown da categoria
      if (breakdown.porCategoria[campo.categoria]) {
        breakdown.porCategoria[campo.categoria].campos.push(campoBreakdown);
        breakdown.porCategoria[campo.categoria].pesoTotal += campo.peso;
        if (preenchido) {
          breakdown.porCategoria[campo.categoria].pesoObtido += campo.peso;
        }
      }

      if (preenchido) {
        camposPreenchidos++;
        pesoPreenchido += campo.peso;
      } else if (campo.peso >= 4) {
        // Campo crítico faltando
        camposCriticos.push(campo.nome);
      }
    }

    // Adicionar fotos ao cálculo (categoria VISUAL)
    const fotosPreenchido = cliente.fotos.length > 0;
    const fotosBreakdown: CampoBreakdown = {
      campo: 'fotos',
      label: 'Fotos do Estabelecimento',
      peso: 5,
      pontos: fotosPreenchido ? 5 : 0,
      preenchido: fotosPreenchido,
      categoria: 'VISUAL',
    };
    breakdown.porCategoria['VISUAL'].campos.unshift(fotosBreakdown);
    breakdown.porCategoria['VISUAL'].pesoTotal += 5;
    if (fotosPreenchido) {
      breakdown.porCategoria['VISUAL'].pesoObtido += 5;
      pesoPreenchido += 5;
      camposPreenchidos++;
    } else {
      camposCriticos.push('fotos');
    }
    pesoTotal += 5;

    // Atualizar totais do breakdown
    breakdown.pesoTotal = pesoTotal;
    breakdown.pesoObtido = pesoPreenchido;

    // Calcular score baseado em peso ponderado
    const score = Math.round((pesoPreenchido / pesoTotal) * 100);

    // Determinar fontes validadas
    if (cliente.geocodingStatus === 'SUCESSO') fontesValidadas.push('Google Geocoding');
    if (cliente.placesStatus === 'SUCESSO') fontesValidadas.push('Google Places');
    if (cliente.status === 'CONCLUIDO') fontesValidadas.push('Análise IA (Claude Vision)');
    // SPRINT 2: Validações adicionadas
    if (cliente.geoValidado) fontesValidadas.push('Validação Geográfica (Bounding Box)');
    if (cliente.placeNomeValidado) fontesValidadas.push('Validação Fuzzy - Nome');
    if (cliente.placeEnderecoValidado) fontesValidadas.push('Validação Fuzzy - Endereço');
    if (cliente.receitaStatus === 'SUCESSO') fontesValidadas.push('Receita Federal');
    if ((cliente as any).simplesNacional !== null && (cliente as any).simplesNacional !== undefined) fontesValidadas.push('Simples Nacional (CNPJA)');
    if ((cliente as any).cccStatus) fontesValidadas.push('CCC (CNPJA)');
    if ((cliente as any).quadroSocietario) fontesValidadas.push('Quadro Societário (CNPJA)');
    if ((cliente as any).serproCpfStatus === 'SUCESSO') fontesValidadas.push('SERPRO CPF');

    // Determinar confiabilidade
    let confiabilidade: 'BAIXA' | 'MEDIA' | 'ALTA' | 'EXCELENTE';
    if (score >= 90) confiabilidade = 'EXCELENTE';
    else if (score >= 70) confiabilidade = 'ALTA';
    else if (score >= 50) confiabilidade = 'MEDIA';
    else confiabilidade = 'BAIXA';

    // Gerar recomendações
    if (!cliente.telefone && !cliente.telefonePlace) {
      recomendacoes.push('CRÍTICO: Nenhum telefone disponível. Buscar em fontes alternativas.');
    }
    if (!cliente.rating || !cliente.totalAvaliacoes) {
      recomendacoes.push('Dados do Google Places incompletos. Re-executar busca no Places API.');
    }
    if (cliente.fotos.length === 0) {
      recomendacoes.push('CRÍTICO: Sem fotos. Análise visual impossível. Buscar fotos alternativas.');
    }
    if (!cliente.publicoAlvo || !cliente.ambienteEstabelecimento) {
      recomendacoes.push('Análise visual incompleta. Re-executar análise de IA.');
    }
    if (!cliente.reviews || cliente.reviewsAnalisadas === 0) {
      recomendacoes.push('Reviews não analisadas. Executar análise de sentiment.');
    }
    if (!cliente.websitePlace) {
      recomendacoes.push('Website não identificado. Buscar presença digital (Instagram, Facebook).');
    }
    if (!cliente.horarioFuncionamento) {
      recomendacoes.push('Horário de funcionamento ausente. Impacta scoring.');
    }
    if ((cliente as any).alertaDuplicata) {
      recomendacoes.push('ALERTA: Duplicata de endereço detectada com outros cadastros.');
    }
    if ((cliente as any).alertaCpfNaoRelacionado) {
      recomendacoes.push('ALERTA: CPF não encontrado em nenhum quadro societário.');
    }

    return {
      score,
      camposPreenchidos,
      camposTotais: this.CAMPOS_VALIDACAO.length + 1, // +1 para fotos
      confiabilidade,
      camposCriticos,
      fontesValidadas,
      recomendacoes,
      breakdown,
    };
  }

  /**
   * Atualiza o score de qualidade no banco de dados
   */
  async updateDataQualityScore(clienteId: string): Promise<void> {
    const report = await this.analyzeDataQuality(clienteId);

    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        dataQualityScore: report.score,
        camposPreenchidos: report.camposPreenchidos,
        camposCriticos: JSON.stringify(report.camposCriticos),
        confiabilidadeDados: report.confiabilidade,
        fontesValidadas: JSON.stringify(report.fontesValidadas),
        dataQualityBreakdown: JSON.stringify(report.breakdown),
        ultimaValidacao: new Date(),
      },
    });

    console.log(
      `📊 Data Quality - ${clienteId}: ${report.score}% (${report.confiabilidade}) - ${report.camposPreenchidos}/${report.camposTotais} campos`
    );
  }

  /**
   * Recalcula qualidade de dados para todos os clientes
   */
  async recalculateAllDataQuality(): Promise<{
    total: number;
    updated: number;
    mediaScore: number;
    distribuicao: Record<string, number>;
  }> {
    const clientes = await prisma.cliente.findMany({
      select: { id: true },
    });

    let updated = 0;
    let somaScores = 0;
    const distribuicao: Record<string, number> = {
      EXCELENTE: 0,
      ALTA: 0,
      MEDIA: 0,
      BAIXA: 0,
    };

    for (const cliente of clientes) {
      try {
        const report = await this.analyzeDataQuality(cliente.id);
        somaScores += report.score;
        distribuicao[report.confiabilidade]++;

        await prisma.cliente.update({
          where: { id: cliente.id },
          data: {
            dataQualityScore: report.score,
            camposPreenchidos: report.camposPreenchidos,
            camposCriticos: JSON.stringify(report.camposCriticos),
            confiabilidadeDados: report.confiabilidade,
            fontesValidadas: JSON.stringify(report.fontesValidadas),
            dataQualityBreakdown: JSON.stringify(report.breakdown),
            ultimaValidacao: new Date(),
          },
        });

        updated++;
      } catch (error) {
        console.error(`Erro ao calcular qualidade para ${cliente.id}:`, error);
      }
    }

    const mediaScore = updated > 0 ? Math.round(somaScores / updated) : 0;

    return {
      total: clientes.length,
      updated,
      mediaScore,
      distribuicao,
    };
  }

  /**
   * Lista clientes com baixa qualidade de dados (prioritários para enriquecimento)
   */
  async getClientesComBaixaQualidade(minScore: number = 70): Promise<any[]> {
    const clientes = await prisma.cliente.findMany({
      where: {
        OR: [
          { dataQualityScore: { lt: minScore } },
          { dataQualityScore: null },
        ],
      },
      orderBy: [{ dataQualityScore: 'asc' }],
      take: 50,
    });

    const result = [];

    for (const cliente of clientes) {
      const report = await this.analyzeDataQuality(cliente.id);
      result.push({
        id: cliente.id,
        nome: cliente.nome,
        endereco: cliente.endereco,
        dataQualityScore: report.score,
        confiabilidade: report.confiabilidade,
        camposCriticos: report.camposCriticos,
        recomendacoes: report.recomendacoes,
      });
    }

    return result;
  }

  /**
   * Verifica se um campo está preenchido (não null, não vazio, não "N/A")
   */
  private isFieldFilled(value: any): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') {
      const trimmed = value.trim().toLowerCase();
      if (trimmed === '' || trimmed === 'n/a' || trimmed === 'null') return false;
    }
    if (typeof value === 'number' && value === 0) return false;
    if (typeof value === 'boolean') return value; // false conta como preenchido
    return true;
  }

  /**
   * Gera relatório consolidado de qualidade de dados
   */
  async getDataQualityReport(): Promise<{
    overview: {
      totalClientes: number;
      mediaQualidade: number;
      excelente: number;
      alta: number;
      media: number;
      baixa: number;
    };
    topPrioridades: any[];
    camposMaisFaltando: { campo: string; total: number }[];
  }> {
    const clientes = await prisma.cliente.findMany({
      select: {
        id: true,
        nome: true,
        dataQualityScore: true,
        confiabilidadeDados: true,
        camposCriticos: true,
      },
    });

    const distribuicao = { EXCELENTE: 0, ALTA: 0, MEDIA: 0, BAIXA: 0 };
    let somaScores = 0;
    const camposFaltandoCount: Record<string, number> = {};

    for (const cliente of clientes) {
      if (cliente.dataQualityScore) {
        somaScores += cliente.dataQualityScore;
      }

      if (cliente.confiabilidadeDados) {
        distribuicao[cliente.confiabilidadeDados as keyof typeof distribuicao]++;
      }

      if (cliente.camposCriticos) {
        try {
          const campos = JSON.parse(cliente.camposCriticos);
          for (const campo of campos) {
            camposFaltandoCount[campo] = (camposFaltandoCount[campo] || 0) + 1;
          }
        } catch {}
      }
    }

    const mediaQualidade = clientes.length > 0 ? Math.round(somaScores / clientes.length) : 0;

    // Top campos mais faltando
    const camposMaisFaltando = Object.entries(camposFaltandoCount)
      .map(([campo, total]) => ({ campo, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    // Top prioridades (baixa qualidade)
    const topPrioridades = await this.getClientesComBaixaQualidade(60);

    return {
      overview: {
        totalClientes: clientes.length,
        mediaQualidade,
        excelente: distribuicao.EXCELENTE,
        alta: distribuicao.ALTA,
        media: distribuicao.MEDIA,
        baixa: distribuicao.BAIXA,
      },
      topPrioridades: topPrioridades.slice(0, 20),
      camposMaisFaltando,
    };
  }
}

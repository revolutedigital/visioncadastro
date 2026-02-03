import { Request, Response } from 'express';
import { DataQualityService } from '../services/data-quality.service';
import { dataSourceService } from '../services/data-source.service';

const dataQualityService = new DataQualityService();

/**
 * Sprint 3: Controller de Qualidade de Dados
 */

/**
 * GET /api/data-quality/report
 * Retorna relatório consolidado de qualidade de dados
 */
export async function getDataQualityReport(req: Request, res: Response) {
  try {
    const report = await dataQualityService.getDataQualityReport();
    res.json(report);
  } catch (error: any) {
    console.error('Erro ao gerar relatório de qualidade:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/data-quality/prioridades?minScore=70
 * Lista clientes com baixa qualidade de dados (prioritários para enriquecimento)
 */
export async function getPrioridades(req: Request, res: Response) {
  try {
    const minScore = parseInt(req.query.minScore as string) || 70;
    const clientes = await dataQualityService.getClientesComBaixaQualidade(minScore);
    res.json(clientes);
  } catch (error: any) {
    console.error('Erro ao buscar prioridades:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/data-quality/recalculate
 * Recalcula qualidade de dados para todos os clientes
 */
export async function recalculateAll(req: Request, res: Response) {
  try {
    const result = await dataQualityService.recalculateAllDataQuality();
    res.json({
      message: 'Recálculo de qualidade concluído',
      ...result,
    });
  } catch (error: any) {
    console.error('Erro ao recalcular qualidade:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/data-quality/:id
 * Retorna análise de qualidade para um cliente específico
 */
export async function getClienteQuality(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const report = await dataQualityService.analyzeDataQuality(id);
    res.json(report);
  } catch (error: any) {
    console.error('Erro ao analisar qualidade do cliente:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * POST /api/data-quality/:id/update
 * Atualiza o score de qualidade de um cliente específico
 */
export async function updateClienteQuality(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await dataQualityService.updateDataQualityScore(id);
    const report = await dataQualityService.analyzeDataQuality(id);
    res.json({
      message: 'Score de qualidade atualizado',
      ...report,
    });
  } catch (error: any) {
    console.error('Erro ao atualizar qualidade do cliente:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/data-quality/:id/fontes
 * Retorna mapa completo de fontes de dados (NOVO)
 *
 * PRINCÍPIO: O único dado confiável da planilha é o CNPJ/CPF
 * Todo o restante deve vir de fontes validadas
 */
export async function getClienteFontes(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const contexto = await dataSourceService.buildSourceMap(id);
    res.json(contexto);
  } catch (error: any) {
    console.error('Erro ao obter fontes do cliente:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/data-quality/:id/analise-real
 * Retorna análise de qualidade baseada em FONTES (não apenas campos preenchidos)
 */
export async function getClienteAnaliseReal(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const analise = await dataQualityService.analyzeWithSourceAwareness(id);
    res.json(analise);
  } catch (error: any) {
    console.error('Erro ao analisar qualidade real do cliente:', error);
    res.status(500).json({ error: error.message });
  }
}

/**
 * GET /api/data-quality/:id/contexto-arca
 * Retorna contexto estruturado para o Arca Analyst
 */
export async function getContextoArcaAnalyst(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const contexto = await dataQualityService.getContextoArcaAnalyst(id);
    res.json(contexto);
  } catch (error: any) {
    console.error('Erro ao obter contexto Arca Analyst:', error);
    res.status(500).json({ error: error.message });
  }
}

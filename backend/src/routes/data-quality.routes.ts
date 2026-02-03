import { Router } from 'express';
import {
  getDataQualityReport,
  getPrioridades,
  recalculateAll,
  getClienteQuality,
  updateClienteQuality,
  getClienteFontes,
  getClienteAnaliseReal,
  getContextoArcaAnalyst,
} from '../controllers/data-quality.controller';

const router = Router();

/**
 * Sprint 3: Rotas de Qualidade de Dados
 */

// Relatório consolidado de qualidade
router.get('/report', getDataQualityReport);

// Listar clientes com baixa qualidade (prioritários)
router.get('/prioridades', getPrioridades);

// Recalcular qualidade de todos os clientes
router.post('/recalculate', recalculateAll);

// Atualizar qualidade de um cliente específico
router.post('/:id/update', updateClienteQuality);

// ========== NOVAS ROTAS - ANÁLISE BASEADA EM FONTES ==========

// Obter mapa de fontes de dados (PRINCÍPIO: só CNPJ é confiável da planilha)
router.get('/:id/fontes', getClienteFontes);

// Análise de qualidade REAL (baseada em fontes, não apenas campos preenchidos)
router.get('/:id/analise-real', getClienteAnaliseReal);

// Contexto estruturado para o Arca Analyst
router.get('/:id/contexto-arca', getContextoArcaAnalyst);

// Obter qualidade de um cliente específico (deve vir por último para não conflitar)
router.get('/:id', getClienteQuality);

export default router;

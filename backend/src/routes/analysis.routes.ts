import { Router } from 'express';
import { AnalysisController } from '../controllers/analysis.controller';

const router = Router();
const analysisController = new AnalysisController();

// Rotas de Análise de IA
// IMPORTANT: specific routes must come before parameterized routes
router.post('/start', (req, res) => analysisController.startAnalysisAll(req, res));
router.post('/start-receita', (req, res) => analysisController.startReceita(req, res));
router.post('/start-normalization', (req, res) => analysisController.startNormalization(req, res));
router.post('/start-geocoding', (req, res) => analysisController.startGeocoding(req, res));
router.post('/start-places', (req, res) => analysisController.startPlaces(req, res));
router.post('/start-analysis', (req, res) => analysisController.startAnalysisManual(req, res));
router.post('/start-tipologia', (req, res) => analysisController.startTipologia(req, res));
router.get('/tipologia-stats', (req, res) => analysisController.getTipologiaStats(req, res));
router.post('/retry-failed', (req, res) => analysisController.retryFailed(req, res));
router.post('/recalculate-scores', (req, res) => analysisController.recalculateScores(req, res));
router.get('/status', (req, res) => analysisController.getQueueStatus(req, res));
router.get('/queue-paused-status', (req, res) => analysisController.getQueuePausedStatus(req, res));
router.get('/queue-logs/:queueName', (req, res) => analysisController.getQueueLogs(req, res));
router.get('/queue-logs-stream/:queueName', (req, res) => analysisController.streamQueueLogs(req, res));
router.get('/sse-stats', (req, res) => analysisController.getSseStats(req, res));
router.post('/pause/:queueName', (req, res) => analysisController.pauseQueue(req, res));
router.post('/resume/:queueName', (req, res) => analysisController.resumeQueue(req, res));
router.get('/clientes', (req, res) => analysisController.listarAnalisados(req, res));
router.get('/estatisticas', (req, res) => analysisController.getEstatisticas(req, res));
router.get('/duplicates', (req, res) => analysisController.detectDuplicates(req, res));
router.post('/merge-duplicates', (req, res) => analysisController.mergeDuplicates(req, res));
router.post('/reset-stuck', (req, res) => analysisController.resetStuckClients(req, res));
router.post('/force-fail/:clienteId', (req, res) => analysisController.forceFailClient(req, res));
router.get('/:id/resultado', (req, res) => analysisController.getAnaliseResultado(req, res));
router.post('/:id', (req, res) => analysisController.analyzeSingle(req, res));

// Rotas de Logs Estruturados e Auditoria
router.get('/structured-logs/correlation/:correlationId', (req, res) => analysisController.getLogsByCorrelation(req, res));
router.get('/structured-logs/cliente/:clienteId', (req, res) => analysisController.getLogsByCliente(req, res));
router.get('/performance-metrics/:etapa', (req, res) => analysisController.getPerformanceMetrics(req, res));
router.get('/data-integrity-stats', (req, res) => analysisController.getDataIntegrityStats(req, res));

export default router;

import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';

const router = Router();

/**
 * Rotas de Administração
 *
 * ⚠️ IMPORTANTE: Em produção, adicionar autenticação/autorização
 * Estas rotas são sensíveis e devem ser protegidas
 */

// Debug clientes
router.get('/debug-clientes', (req, res) => adminController.debugClientes(req, res));

// Estatísticas
router.get('/stats', (req, res) => adminController.getStats(req, res));

// Health check
router.get('/health', (req, res) => adminController.healthCheck(req, res));

// Limpeza de dados
router.delete('/clientes', (req, res) => adminController.deleteAllClientes(req, res));
router.delete('/planilhas', (req, res) => adminController.deleteAllPlanilhas(req, res));
router.delete('/logs', (req, res) => adminController.cleanLogs(req, res));

// Cache
router.post('/cache/clear', (req, res) => adminController.clearCache(req, res));

// Reset status de consulta
router.post('/reset-status', (req, res) => adminController.resetStatus(req, res));

// Reset completo (PERIGOSO)
router.post('/reset', (req, res) => adminController.resetSystem(req, res));

export default router;

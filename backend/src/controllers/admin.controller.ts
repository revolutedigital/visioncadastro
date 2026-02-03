import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { cacheService } from '../services/cache.service';

const prisma = new PrismaClient();

/**
 * Controlador de Administração
 * Endpoints para gerenciar o sistema
 */
export class AdminController {
  /**
   * GET /api/admin/debug-clientes
   * Debug: ver dados dos clientes
   */
  async debugClientes(req: Request, res: Response) {
    const clientes = await prisma.cliente.findMany({
      take: 10,
      select: { id: true, nome: true, cnpj: true, estado: true, receitaStatus: true, planilhaId: true },
    });
    const planilhas = await prisma.planilha.findMany({
      select: { id: true, nomeArquivo: true },
      orderBy: { uploadedAt: 'desc' },
      take: 3,
    });
    res.json({ clientes, planilhas });
  }

  /**
   * GET /api/admin/stats
   * Retorna estatísticas gerais do sistema
   */
  async getStats(req: Request, res: Response) {
    try {
      const [
        totalClientes,
        totalPlanilhas,
        totalFotos,
        totalLogs,
        cacheSize,
        clientesPorStatus,
        clientesPorTipologia,
      ] = await Promise.all([
        prisma.cliente.count(),
        prisma.planilha.count(),
        prisma.foto.count(),
        prisma.processamentoLog.count(),
        cacheService.getStats(),
        prisma.cliente.groupBy({
          by: ['status'],
          _count: true,
        }),
        prisma.cliente.groupBy({
          by: ['tipologia'],
          _count: true,
          where: { tipologia: { not: null } },
        }),
      ]);

      // Storage de fotos
      const fs = require('fs');
      const path = require('path');
      const photosDir = process.env.PHOTOS_DIR || path.join(__dirname, '../../uploads/fotos');
      let storageUsed = 0;

      try {
        const files = fs.readdirSync(photosDir);
        for (const file of files) {
          const stats = fs.statSync(path.join(photosDir, file));
          storageUsed += stats.size;
        }
      } catch (error) {
        console.warn('Erro ao calcular storage:', error);
      }

      res.json({
        success: true,
        stats: {
          clientes: {
            total: totalClientes,
            porStatus: clientesPorStatus,
          },
          planilhas: totalPlanilhas,
          fotos: {
            total: totalFotos,
            storageUsed: storageUsed,
            storageUsedMB: (storageUsed / 1024 / 1024).toFixed(2),
          },
          logs: totalLogs,
          cache: cacheSize,
          tipologias: clientesPorTipologia,
        },
      });
    } catch (error: any) {
      console.error('Erro ao obter estatísticas:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * DELETE /api/admin/clientes
   * Apaga TODOS os clientes do sistema
   */
  async deleteAllClientes(req: Request, res: Response) {
    try {
      console.log('🗑️  ADMIN: Iniciando exclusão de TODOS os clientes...');

      // Contar antes de apagar
      const totalAntes = await prisma.cliente.count();
      const totalFotosAntes = await prisma.foto.count();

      // Apagar fotos físicas
      const fs = require('fs');
      const path = require('path');
      const photosDir = process.env.PHOTOS_DIR || path.join(__dirname, '../../uploads/fotos');

      try {
        const files = fs.readdirSync(photosDir);
        let fotosApagadas = 0;
        for (const file of files) {
          fs.unlinkSync(path.join(photosDir, file));
          fotosApagadas++;
        }
        console.log(`   🗑️  ${fotosApagadas} fotos físicas apagadas`);
      } catch (error) {
        console.warn('   ⚠️  Erro ao apagar fotos físicas:', error);
      }

      // Apagar do banco (cascade vai apagar fotos também)
      await prisma.cliente.deleteMany({});

      console.log(`   ✅ ${totalAntes} clientes apagados`);
      console.log(`   ✅ ${totalFotosAntes} registros de fotos apagados`);

      res.json({
        success: true,
        message: 'Todos os clientes foram apagados',
        deleted: {
          clientes: totalAntes,
          fotos: totalFotosAntes,
        },
      });
    } catch (error: any) {
      console.error('❌ Erro ao apagar clientes:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * DELETE /api/admin/planilhas
   * Apaga TODAS as planilhas (e clientes associados)
   */
  async deleteAllPlanilhas(req: Request, res: Response) {
    try {
      console.log('🗑️  ADMIN: Iniciando exclusão de TODAS as planilhas...');

      const totalAntes = await prisma.planilha.count();

      // Cascade vai apagar clientes e fotos automaticamente
      await prisma.planilha.deleteMany({});

      console.log(`   ✅ ${totalAntes} planilhas apagadas (e clientes associados)`);

      res.json({
        success: true,
        message: 'Todas as planilhas foram apagadas',
        deleted: totalAntes,
      });
    } catch (error: any) {
      console.error('❌ Erro ao apagar planilhas:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * DELETE /api/admin/logs
   * Apaga logs antigos (mais de 30 dias)
   */
  async cleanLogs(req: Request, res: Response) {
    try {
      const diasAtras = parseInt(req.query.days as string) || 30;
      const dataLimite = new Date();
      dataLimite.setDate(dataLimite.getDate() - diasAtras);

      console.log(`🗑️  ADMIN: Apagando logs anteriores a ${dataLimite.toISOString()}...`);

      const resultado = await prisma.processamentoLog.deleteMany({
        where: {
          createdAt: {
            lt: dataLimite,
          },
        },
      });

      console.log(`   ✅ ${resultado.count} logs apagados`);

      res.json({
        success: true,
        message: `Logs mais antigos que ${diasAtras} dias foram apagados`,
        deleted: resultado.count,
      });
    } catch (error: any) {
      console.error('❌ Erro ao limpar logs:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/admin/cache/clear
   * Limpa todo o cache Redis
   */
  async clearCache(req: Request, res: Response) {
    try {
      console.log('🗑️  ADMIN: Limpando cache Redis...');

      await cacheService.clearAll();

      console.log('   ✅ Cache limpo com sucesso');

      res.json({
        success: true,
        message: 'Cache Redis foi limpo',
      });
    } catch (error: any) {
      console.error('❌ Erro ao limpar cache:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/admin/reset
   * RESET COMPLETO: Apaga tudo e reinicia o sistema
   */
  async resetSystem(req: Request, res: Response) {
    try {
      console.log('🔴 ADMIN: RESET COMPLETO DO SISTEMA...');

      // Confirmar com senha de segurança
      const { confirmPassword } = req.body;
      if (confirmPassword !== 'RESET_SYSTEM_CONFIRM') {
        return res.status(403).json({
          error: 'Senha de confirmação incorreta',
          hint: 'Use "RESET_SYSTEM_CONFIRM" no campo confirmPassword',
        });
      }

      const stats = {
        planilhas: await prisma.planilha.count(),
        clientes: await prisma.cliente.count(),
        fotos: await prisma.foto.count(),
        logs: await prisma.processamentoLog.count(),
      };

      // Apagar tudo
      await prisma.foto.deleteMany({});
      await prisma.cliente.deleteMany({});
      await prisma.planilha.deleteMany({});
      await prisma.processamentoLog.deleteMany({});
      await prisma.processamentoLote.deleteMany({});
      await prisma.analysisCache.deleteMany({});

      // Limpar cache
      await cacheService.clearAll();

      // Apagar fotos físicas
      const fs = require('fs');
      const path = require('path');
      const photosDir = process.env.PHOTOS_DIR || path.join(__dirname, '../../uploads/fotos');

      try {
        const files = fs.readdirSync(photosDir);
        for (const file of files) {
          fs.unlinkSync(path.join(photosDir, file));
        }
      } catch (error) {
        console.warn('   ⚠️  Erro ao apagar fotos físicas:', error);
      }

      console.log('   ✅ SISTEMA RESETADO COM SUCESSO');
      console.log('   📊 Deletado:', stats);

      res.json({
        success: true,
        message: 'Sistema resetado com sucesso',
        deleted: stats,
      });
    } catch (error: any) {
      console.error('❌ Erro ao resetar sistema:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * POST /api/admin/reset-status
   * Reseta status de consulta para PENDENTE
   */
  async resetStatus(req: Request, res: Response) {
    try {
      const { status = 'FALHA' } = req.query;

      const result = await prisma.cliente.updateMany({
        where: { receitaStatus: status as string },
        data: {
          receitaStatus: 'PENDENTE',
          receitaErro: null,
        },
      });

      const total = await prisma.cliente.count({ where: { receitaStatus: 'PENDENTE' } });

      res.json({
        success: true,
        message: `${result.count} clientes resetados de ${status} para PENDENTE`,
        totalPendente: total,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * GET /api/admin/health
   * Health check detalhado do sistema
   */
  async healthCheck(req: Request, res: Response) {
    try {
      const health: any = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        services: {},
      };

      // PostgreSQL
      try {
        await prisma.$queryRaw`SELECT 1`;
        health.services.postgres = { status: 'ok' };
      } catch (error) {
        health.services.postgres = { status: 'error', error: (error as Error).message };
        health.status = 'degraded';
      }

      // Redis
      try {
        const redisStats = await cacheService.getStats();
        health.services.redis = { status: 'ok', ...redisStats };
      } catch (error) {
        health.services.redis = { status: 'error', error: (error as Error).message };
        health.status = 'degraded';
      }

      // File System
      try {
        const fs = require('fs');
        const path = require('path');
        const photosDir = process.env.PHOTOS_DIR || path.join(__dirname, '../../uploads/fotos');

        if (!fs.existsSync(photosDir)) {
          fs.mkdirSync(photosDir, { recursive: true });
        }

        health.services.filesystem = { status: 'ok', photosDir };
      } catch (error) {
        health.services.filesystem = { status: 'error', error: (error as Error).message };
        health.status = 'degraded';
      }

      // APIs externas (não bloqueia se falhar)
      health.services.external = {
        google: process.env.GOOGLE_MAPS_API_KEY ? 'configured' : 'missing',
        anthropic: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing',
      };

      const statusCode = health.status === 'ok' ? 200 : 503;
      res.status(statusCode).json(health);
    } catch (error: any) {
      res.status(503).json({
        status: 'error',
        error: error.message,
      });
    }
  }
}

export const adminController = new AdminController();

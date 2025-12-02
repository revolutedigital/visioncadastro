import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { geocodingQueue } from '../queues/queue.config';

const prisma = new PrismaClient();

export class GeocodingController {
  /**
   * Iniciar geocodificação de todos os clientes pendentes
   * POST /api/geocoding/start
   */
  async startGeocodingAll(req: Request, res: Response) {
    try {
      // Buscar todos os clientes com geocodificação pendente
      const clientesPendentes = await prisma.cliente.findMany({
        where: {
          geocodingStatus: 'PENDENTE',
        },
        select: {
          id: true,
          nome: true,
          endereco: true,
        },
      });

      if (clientesPendentes.length === 0) {
        return res.json({
          success: true,
          message: 'Nenhum cliente pendente para geocodificação',
          total: 0,
        });
      }

      // Adicionar todos à fila
      const jobs = await Promise.all(
        clientesPendentes.map((cliente) =>
          geocodingQueue.add(
            { clienteId: cliente.id },
            {
              jobId: `geocoding-${cliente.id}`,
              removeOnComplete: true,
            }
          )
        )
      );

      console.log(`📍 ${jobs.length} clientes adicionados à fila de geocodificação`);

      return res.json({
        success: true,
        message: `${jobs.length} clientes adicionados à fila de geocodificação`,
        total: jobs.length,
        clientesProcessando: clientesPendentes.map((c) => ({
          id: c.id,
          nome: c.nome,
        })),
      });
    } catch (error: any) {
      console.error('Erro ao iniciar geocodificação:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao iniciar geocodificação',
        details: error.message,
      });
    }
  }

  /**
   * Geocodificar um cliente específico
   * POST /api/geocoding/:id
   */
  async geocodeSingle(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const cliente = await prisma.cliente.findUnique({
        where: { id },
      });

      if (!cliente) {
        return res.status(404).json({
          success: false,
          error: 'Cliente não encontrado',
        });
      }

      // Adicionar à fila
      const job = await geocodingQueue.add(
        { clienteId: id },
        {
          jobId: `geocoding-${id}`,
          removeOnComplete: true,
        }
      );

      return res.json({
        success: true,
        message: `Cliente ${cliente.nome} adicionado à fila`,
        jobId: job.id,
      });
    } catch (error: any) {
      console.error('Erro ao geocodificar cliente:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao adicionar cliente à fila',
        details: error.message,
      });
    }
  }

  /**
   * Status da fila de geocodificação
   * GET /api/geocoding/status
   */
  async getQueueStatus(req: Request, res: Response) {
    try {
      let waiting = 0, active = 0, completed = 0, failed = 0;
      let redisAvailable = true;

      if (!process.env.REDIS_URL && process.env.NODE_ENV === 'production') {
        redisAvailable = false;
      } else {
        try {
          const results = await Promise.all([
            geocodingQueue.getWaitingCount().catch(() => 0),
            geocodingQueue.getActiveCount().catch(() => 0),
            geocodingQueue.getCompletedCount().catch(() => 0),
            geocodingQueue.getFailedCount().catch(() => 0),
          ]);
          [waiting, active, completed, failed] = results;
          if (results.every(r => r === 0)) redisAvailable = false;
        } catch (error: any) {
          console.warn('⚠️  Redis indisponível', error.message);
          redisAvailable = false;
        }
      }

      // Estatísticas do banco
      const [totalClientes, geocodificados, pendentes, falhas] = await Promise.all([
        prisma.cliente.count(),
        prisma.cliente.count({ where: { geocodingStatus: 'SUCESSO' } }),
        prisma.cliente.count({ where: { geocodingStatus: 'PENDENTE' } }),
        prisma.cliente.count({ where: { geocodingStatus: 'FALHA' } }),
      ]);

      return res.json({
        success: true,
        redisAvailable,
        fila: {
          aguardando: waiting,
          processando: active,
          completados: completed,
          falhados: failed,
        },
        clientes: {
          total: totalClientes,
          geocodificados,
          pendentes,
          falhas,
          percentualCompleto: totalClientes > 0
            ? Math.round((geocodificados / totalClientes) * 100)
            : 0,
        },
        ...(redisAvailable === false && {
          warning: 'Redis indisponível. Dados de fila não estão atualizados em tempo real.',
        }),
      });
    } catch (error: any) {
      console.error('Erro ao buscar status:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar status da fila',
      });
    }
  }

  /**
   * Listar clientes geocodificados
   * GET /api/geocoding/clientes
   */
  async listarGeocodificados(req: Request, res: Response) {
    try {
      const { status } = req.query;

      const where: any = {};
      if (status) {
        where.geocodingStatus = status;
      }

      const clientes = await prisma.cliente.findMany({
        where,
        select: {
          id: true,
          nome: true,
          endereco: true,
          cidade: true,
          estado: true,
          latitude: true,
          longitude: true,
          enderecoFormatado: true,
          geocodingStatus: true,
          geocodingErro: true,
          geocodingProcessadoEm: true,
        },
        orderBy: {
          geocodingProcessadoEm: 'desc',
        },
        take: 100, // Limitar a 100 resultados
      });

      return res.json({
        success: true,
        total: clientes.length,
        clientes,
      });
    } catch (error: any) {
      console.error('Erro ao listar clientes:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao listar clientes',
      });
    }
  }

  /**
   * Reprocessar clientes com falha
   * POST /api/geocoding/retry-failed
   */
  async retryFailed(req: Request, res: Response) {
    try {
      // Buscar clientes com falha
      const clientesFalhados = await prisma.cliente.findMany({
        where: {
          geocodingStatus: 'FALHA',
        },
        select: {
          id: true,
          nome: true,
        },
      });

      if (clientesFalhados.length === 0) {
        return res.json({
          success: true,
          message: 'Nenhum cliente com falha para reprocessar',
          total: 0,
        });
      }

      // Resetar status e adicionar à fila novamente
      await prisma.cliente.updateMany({
        where: {
          geocodingStatus: 'FALHA',
        },
        data: {
          geocodingStatus: 'PENDENTE',
          geocodingErro: null,
        },
      });

      // Adicionar à fila
      const jobs = await Promise.all(
        clientesFalhados.map((cliente) =>
          geocodingQueue.add({ clienteId: cliente.id })
        )
      );

      return res.json({
        success: true,
        message: `${jobs.length} clientes com falha adicionados à fila novamente`,
        total: jobs.length,
      });
    } catch (error: any) {
      console.error('Erro ao reprocessar falhas:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao reprocessar clientes com falha',
      });
    }
  }
}

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { placesQueue } from '../queues/queue.config';

const prisma = new PrismaClient();

export class PlacesController {
  /**
   * Iniciar busca de Places para todos os clientes geocodificados
   * POST /api/places/start
   */
  async startPlacesAll(req: Request, res: Response) {
    try {
      // Buscar todos os clientes geocodificados e pendentes de Places
      const clientesPendentes = await prisma.cliente.findMany({
        where: {
          geocodingStatus: 'SUCESSO', // Só processar quem foi geocodificado
          placesStatus: 'PENDENTE',
          latitude: { not: null },
          longitude: { not: null },
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
          message: 'Nenhum cliente pendente para busca de Places',
          total: 0,
        });
      }

      // Adicionar todos à fila
      const jobs = await Promise.all(
        clientesPendentes.map((cliente) =>
          placesQueue.add(
            { clienteId: cliente.id },
            {
              jobId: `places-${cliente.id}`,
              removeOnComplete: true,
              delay: Math.random() * 300, // Delay aleatório 0-300ms
            }
          )
        )
      );

      console.log(`🏢 ${jobs.length} clientes adicionados à fila de Places`);

      return res.json({
        success: true,
        message: `${jobs.length} clientes adicionados à fila de Places`,
        total: jobs.length,
        clientesProcessando: clientesPendentes.map((c) => ({
          id: c.id,
          nome: c.nome,
        })),
      });
    } catch (error: any) {
      console.error('Erro ao iniciar busca de Places:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao iniciar busca de Places',
        details: error.message,
      });
    }
  }

  /**
   * Buscar Places de um cliente específico
   * POST /api/places/:id
   */
  async placesSingle(req: Request, res: Response) {
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

      // Verificar se foi geocodificado
      if (!cliente.latitude || !cliente.longitude) {
        return res.status(400).json({
          success: false,
          error: 'Cliente não possui coordenadas. Execute geocoding primeiro.',
        });
      }

      // Adicionar à fila
      const job = await placesQueue.add(
        { clienteId: id },
        {
          jobId: `places-${id}`,
          removeOnComplete: true,
        }
      );

      return res.json({
        success: true,
        message: `Cliente ${cliente.nome} adicionado à fila de Places`,
        jobId: job.id,
      });
    } catch (error: any) {
      console.error('Erro ao adicionar cliente à fila Places:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao adicionar cliente à fila',
        details: error.message,
      });
    }
  }

  /**
   * Status da fila de Places
   * GET /api/places/status
   */
  async getQueueStatus(req: Request, res: Response) {
    try {
      let waiting = 0, active = 0, completed = 0, failed = 0;
      let redisAvailable = true;

      try {
        const results = await Promise.all([
          placesQueue.getWaitingCount().catch(() => 0),
          placesQueue.getActiveCount().catch(() => 0),
          placesQueue.getCompletedCount().catch(() => 0),
          placesQueue.getFailedCount().catch(() => 0),
        ]);
        [waiting, active, completed, failed] = results;
        if (results.every(r => r === 0)) redisAvailable = false;
      } catch (error: any) {
        console.warn('⚠️  Redis indisponível', error.message);
        redisAvailable = false;
      }

      // Estatísticas do banco
      const [
        totalClientes,
        processadosSucesso,
        pendentes,
        falhas,
        comFotos,
        altosPotencial,
        mediosPotencial,
        baixosPotencial,
      ] = await Promise.all([
        prisma.cliente.count({ where: { geocodingStatus: 'SUCESSO' } }),
        prisma.cliente.count({ where: { placesStatus: 'SUCESSO' } }),
        prisma.cliente.count({ where: { placesStatus: 'PENDENTE' } }),
        prisma.cliente.count({ where: { placesStatus: 'FALHA' } }),
        prisma.cliente.count({
          where: {
            placesStatus: 'SUCESSO',
            fotos: { some: {} },
          },
        }),
        prisma.cliente.count({ where: { potencialCategoria: 'ALTO' } }),
        prisma.cliente.count({ where: { potencialCategoria: 'MÉDIO' } }),
        prisma.cliente.count({ where: { potencialCategoria: 'BAIXO' } }),
      ]);

      // Total de fotos
      const totalFotos = await prisma.foto.count();

      // Total processados = sucesso + falhas (ambos foram tentados)
      const totalProcessados = processadosSucesso + falhas;

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
          processados: totalProcessados,
          sucesso: processadosSucesso,
          pendentes,
          falhas,
          comFotos,
          percentualCompleto:
            totalClientes > 0 ? Math.round((totalProcessados / totalClientes) * 100) : 0,
        },
        potencial: {
          alto: altosPotencial,
          medio: mediosPotencial,
          baixo: baixosPotencial,
        },
        fotos: {
          total: totalFotos,
          mediaPorCliente: comFotos > 0 ? (totalFotos / comFotos).toFixed(1) : 0,
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
   * Listar clientes com informações de Places
   * GET /api/places/clientes
   */
  async listarProcessados(req: Request, res: Response) {
    try {
      const { status, potencial } = req.query;

      const where: any = {};
      if (status) {
        where.placesStatus = status;
      }
      if (potencial) {
        where.potencialCategoria = potencial;
      }

      const clientes = await prisma.cliente.findMany({
        where,
        select: {
          id: true,
          nome: true,
          endereco: true,
          cidade: true,
          estado: true,
          tipoServico: true,
          latitude: true,
          longitude: true,
          placesStatus: true,
          placesErro: true,
          tipoEstabelecimento: true,
          rating: true,
          totalAvaliacoes: true,
          telefonePlace: true,
          websitePlace: true,
          potencialScore: true,
          potencialCategoria: true,
          placesProcessadoEm: true,
          fotos: {
            select: {
              id: true,
              fileName: true,
              ordem: true,
            },
            orderBy: {
              ordem: 'asc',
            },
          },
        },
        orderBy: [
          { potencialScore: 'desc' }, // Ordenar por potencial (maior primeiro)
          { placesProcessadoEm: 'desc' },
        ],
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
   * POST /api/places/retry-failed
   */
  async retryFailed(req: Request, res: Response) {
    try {
      // Buscar clientes com falha
      const clientesFalhados = await prisma.cliente.findMany({
        where: {
          placesStatus: 'FALHA',
          geocodingStatus: 'SUCESSO',
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
          placesStatus: 'FALHA',
          geocodingStatus: 'SUCESSO',
        },
        data: {
          placesStatus: 'PENDENTE',
          placesErro: null,
        },
      });

      // Adicionar à fila
      const jobs = await Promise.all(
        clientesFalhados.map((cliente, index) =>
          placesQueue.add(
            { clienteId: cliente.id },
            {
              delay: index * 300, // Delay incremental 300ms
            }
          )
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

  /**
   * Detalhes de um cliente específico com fotos
   * GET /api/places/:id/detalhes
   */
  async getClienteDetalhes(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const cliente = await prisma.cliente.findUnique({
        where: { id },
        include: {
          fotos: {
            orderBy: {
              ordem: 'asc',
            },
          },
        },
      });

      if (!cliente) {
        return res.status(404).json({
          success: false,
          error: 'Cliente não encontrado',
        });
      }

      // Parse do horário de funcionamento se existir
      let horarioFuncionamento = null;
      if (cliente.horarioFuncionamento) {
        try {
          horarioFuncionamento = JSON.parse(cliente.horarioFuncionamento);
        } catch (e) {
          console.error('Erro ao parsear horário:', e);
        }
      }

      return res.json({
        success: true,
        cliente: {
          ...cliente,
          horarioFuncionamento,
        },
      });
    } catch (error: any) {
      console.error('Erro ao buscar detalhes do cliente:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar detalhes do cliente',
      });
    }
  }

  /**
   * Buscar estatísticas gerais
   * GET /api/places/estatisticas
   */
  async getEstatisticas(req: Request, res: Response) {
    try {
      // Tipos de estabelecimento mais comuns
      const tiposComuns = await prisma.cliente.groupBy({
        by: ['tipoEstabelecimento'],
        where: {
          tipoEstabelecimento: { not: null },
        },
        _count: true,
        orderBy: {
          _count: {
            tipoEstabelecimento: 'desc',
          },
        },
        take: 10,
      });

      // Média de rating
      const avgRating = await prisma.cliente.aggregate({
        where: {
          rating: { not: null },
        },
        _avg: {
          rating: true,
        },
      });

      // Distribuição de potencial
      const distribuicaoPotencial = await prisma.cliente.groupBy({
        by: ['potencialCategoria'],
        where: {
          potencialCategoria: { not: null },
        },
        _count: true,
      });

      return res.json({
        success: true,
        tiposEstabelecimento: tiposComuns.map((t) => ({
          tipo: t.tipoEstabelecimento,
          quantidade: t._count,
        })),
        ratingMedio: avgRating._avg.rating?.toFixed(2) || null,
        distribuicaoPotencial: distribuicaoPotencial.map((d) => ({
          categoria: d.potencialCategoria,
          quantidade: d._count,
        })),
      });
    } catch (error: any) {
      console.error('Erro ao buscar estatísticas:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar estatísticas',
      });
    }
  }
}

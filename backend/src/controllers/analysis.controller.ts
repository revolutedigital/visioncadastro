import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { analysisQueue, geocodingQueue, normalizationQueue, placesQueue, receitaQueue, tipologiaQueue } from '../queues/queue.config';
import { ScoringService } from '../services/scoring.service';
import { DataQualityService } from '../services/data-quality.service';
import { sseLogBroadcaster } from '../services/sse-log-broadcaster';

const prisma = new PrismaClient();
const scoringService = new ScoringService();
const dataQualityService = new DataQualityService();

export class AnalysisController {
  /**
   * Iniciar análise de IA para todos os clientes com fotos
   * POST /api/analysis/start
   */
  async startAnalysisAll(req: Request, res: Response) {
    try {
      const { mode = 'batch' } = req.body; // 'single' ou 'batch'

      // Buscar clientes com fotos não analisadas
      const clientesComFotos = await prisma.cliente.findMany({
        where: {
          placesStatus: 'SUCESSO', // Só processar quem tem dados do Places
          fotos: {
            some: {
              analisadaPorIA: false, // Tem fotos não analisadas
            },
          },
        },
        select: {
          id: true,
          nome: true,
          fotos: {
            where: { analisadaPorIA: false },
            select: { id: true },
          },
        },
      });

      if (clientesComFotos.length === 0) {
        return res.json({
          success: true,
          message: 'Nenhum cliente com fotos pendentes para análise',
          total: 0,
        });
      }

      // Adicionar todos à fila
      const jobs = await Promise.all(
        clientesComFotos.map((cliente, index) =>
          analysisQueue.add(
            { clienteId: cliente.id, mode },
            {
              delay: index * 5000, // Delay de 5s entre cada análise para evitar rate limit
            }
          )
        )
      );

      console.log(`🤖 ${jobs.length} clientes adicionados à fila de análise de IA`);

      return res.json({
        success: true,
        message: `${jobs.length} clientes adicionados à fila de análise`,
        total: jobs.length,
        mode,
        clientesProcessando: clientesComFotos.map((c) => ({
          id: c.id,
          nome: c.nome,
          totalFotos: c.fotos.length,
        })),
      });
    } catch (error: any) {
      console.error('Erro ao iniciar análise de IA:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao iniciar análise de IA',
        details: error.message,
      });
    }
  }

  /**
   * Analisar um cliente específico
   * POST /api/analysis/:id
   */
  async analyzeSingle(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { mode = 'batch' } = req.body;

      const cliente = await prisma.cliente.findUnique({
        where: { id },
        include: {
          fotos: {
            where: { analisadaPorIA: false },
          },
        },
      });

      if (!cliente) {
        return res.status(404).json({
          success: false,
          error: 'Cliente não encontrado',
        });
      }

      if (cliente.fotos.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Cliente não possui fotos para análise',
        });
      }

      // Adicionar à fila
      const job = await analysisQueue.add(
        { clienteId: id, mode }
      );

      return res.json({
        success: true,
        message: `Cliente ${cliente.nome} adicionado à fila de análise`,
        jobId: job.id,
        mode,
        totalFotos: cliente.fotos.length,
      });
    } catch (error: any) {
      console.error('Erro ao adicionar cliente à fila de análise:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao adicionar cliente à fila',
        details: error.message,
      });
    }
  }

  /**
   * Status da fila de análise
   * GET /api/analysis/status
   */
  async getQueueStatus(req: Request, res: Response) {
    try {
      // Tentar obter estatísticas das filas - valores padrão zero se falhar
      let receitaWaiting = 0, receitaActive = 0;
      let normalizationWaiting = 0, normalizationActive = 0;
      let geocodingWaiting = 0, geocodingActive = 0;
      let placesWaiting = 0, placesActive = 0;
      let analysisWaiting = 0, analysisActive = 0, analysisCompleted = 0, analysisFailed = 0;
      let tipologiaWaiting = 0, tipologiaActive = 0, tipologiaCompleted = 0, tipologiaFailed = 0;
      let redisAvailable = true;

      // SKIP Redis completamente em produção se não tiver REDIS_URL configurado
      if (!process.env.REDIS_URL && process.env.NODE_ENV === 'production') {
        console.warn('⚠️  Redis não configurado em produção - pulando queries de fila');
        redisAvailable = false;
      } else {
        // Tentar queries Redis com fallback individual
        try {
          const results = await Promise.all([
            receitaQueue.getWaitingCount().catch(() => -1),
            receitaQueue.getActiveCount().catch(() => -1),
            normalizationQueue.getWaitingCount().catch(() => -1),
            normalizationQueue.getActiveCount().catch(() => -1),
            geocodingQueue.getWaitingCount().catch(() => -1),
            geocodingQueue.getActiveCount().catch(() => -1),
            placesQueue.getWaitingCount().catch(() => -1),
            placesQueue.getActiveCount().catch(() => -1),
            analysisQueue.getWaitingCount().catch(() => -1),
            analysisQueue.getActiveCount().catch(() => -1),
            analysisQueue.getCompletedCount().catch(() => -1),
            analysisQueue.getFailedCount().catch(() => -1),
            tipologiaQueue.getWaitingCount().catch(() => -1),
            tipologiaQueue.getActiveCount().catch(() => -1),
            tipologiaQueue.getCompletedCount().catch(() => -1),
            tipologiaQueue.getFailedCount().catch(() => -1),
          ]);

          // Converter -1 (erro) para 0 para exibição
          const sanitized = results.map(r => r === -1 ? 0 : r);

          [
            receitaWaiting,
            receitaActive,
            normalizationWaiting,
            normalizationActive,
            geocodingWaiting,
            geocodingActive,
            placesWaiting,
            placesActive,
            analysisWaiting,
            analysisActive,
            analysisCompleted,
            analysisFailed,
            tipologiaWaiting,
            tipologiaActive,
            tipologiaCompleted,
            tipologiaFailed,
          ] = sanitized;

          // Redis está disponível se PELO MENOS UMA consulta não retornou -1
          // (0 é um valor válido - significa fila vazia, não erro)
          redisAvailable = results.some(r => r !== -1);
        } catch (error: any) {
          console.warn('⚠️  Redis indisponível', error.message);
          redisAvailable = false;
        }
      }

      // Estatísticas do banco
      const [
        totalClientes,
        clientesComReceita,
        clientesNormalizados,
        clientesDivergencia,
        clientesGeocoded,
        clientesComPlaces,
        comFotos,
        fotosAnalisadas,
        fotosNaoAnalisadas,
        clientesConcluidos,
      ] = await Promise.all([
        prisma.cliente.count(), // Total de TODOS os clientes
        prisma.cliente.count({
          where: {
            receitaStatus: { in: ['SUCESSO', 'FALHA', 'NAO_APLICAVEL'] }, // Somente CONCLUÍDOS (não PENDENTE nem PROCESSANDO)
          },
        }),
        prisma.cliente.count({
          where: {
            normalizacaoStatus: { in: ['SUCESSO', 'FALHA', 'FALHA_PARCIAL'] }, // Todos processados (não PENDENTE nem PROCESSANDO)
          },
        }),
        prisma.cliente.count({ where: { divergenciaEndereco: true } }),
        prisma.cliente.count({ where: { latitude: { not: null } } }), // Clientes com coordenadas
        prisma.cliente.count({ where: { placesStatus: 'SUCESSO' } }), // Clientes com Google Places
        prisma.cliente.count({
          where: {
            fotos: { some: {} },
          },
        }),
        prisma.foto.count({ where: { analisadaPorIA: true } }),
        prisma.foto.count({ where: { analisadaPorIA: false } }),
        prisma.cliente.count({ where: { status: 'CONCLUIDO' } }),
      ]);

      return res.json({
        success: true,
        redisAvailable,
        filas: {
          receita: {
            aguardando: receitaWaiting,
            processando: receitaActive,
          },
          normalization: {
            aguardando: normalizationWaiting,
            processando: normalizationActive,
          },
          geocoding: {
            aguardando: geocodingWaiting,
            processando: geocodingActive,
          },
          places: {
            aguardando: placesWaiting,
            processando: placesActive,
          },
          analysis: {
            aguardando: analysisWaiting,
            processando: analysisActive,
            completados: analysisCompleted,
            falhados: analysisFailed,
          },
          tipologia: {
            aguardando: tipologiaWaiting,
            processando: tipologiaActive,
            completados: tipologiaCompleted,
            falhados: tipologiaFailed,
          },
        },
        clientes: {
          total: totalClientes,
          comReceita: clientesComReceita,
          normalizados: clientesNormalizados,
          divergenciaEndereco: clientesDivergencia,
          geocodificados: clientesGeocoded,
          comPlaces: clientesComPlaces,
          comFotos,
          concluidos: clientesConcluidos,
          percentualCompleto:
            comFotos > 0 ? Math.round((clientesConcluidos / comFotos) * 100) : 0,
        },
        fotos: {
          total: fotosAnalisadas + fotosNaoAnalisadas,
          analisadas: fotosAnalisadas,
          naoAnalisadas: fotosNaoAnalisadas,
          percentualAnalisado:
            fotosAnalisadas + fotosNaoAnalisadas > 0
              ? Math.round(
                  (fotosAnalisadas / (fotosAnalisadas + fotosNaoAnalisadas)) * 100
                )
              : 0,
        },
        ...(redisAvailable === false && {
          warning: 'Redis indisponível. Dados de fila não estão atualizados em tempo real.',
        }),
      });
    } catch (error: any) {
      console.error('❌ ERRO CRÍTICO ao buscar status:', error);
      console.error('Stack trace:', error.stack);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar status da fila',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      });
    }
  }

  /**
   * Listar clientes analisados
   * GET /api/analysis/clientes
   */
  async listarAnalisados(req: Request, res: Response) {
    try {
      const { status } = req.query;

      const where: any = {};

      if (status) {
        where.status = status;
      }

      const clientes = await prisma.cliente.findMany({
        where,
        select: {
          id: true,
          nome: true,
          endereco: true,
          cidade: true,
          estado: true,
          tipoEstabelecimento: true,
          rating: true,
          totalAvaliacoes: true,
          potencialCategoria: true,
          potencialScore: true,
          status: true,
          tipologia: true,
          tipologiaNome: true,
          tipologiaConfianca: true,
          dataQualityScore: true,
          confiabilidadeDados: true,
          scoringBreakdown: true,
          // Campos de análise visual (Sprint 2)
          qualidadeSinalizacao: true,
          presencaBranding: true,
          nivelProfissionalizacao: true,
          publicoAlvo: true,
          ambienteEstabelecimento: true,
          indicadoresVisuais: true,
          fotos: {
            select: {
              id: true,
              fileName: true,
              ordem: true,
              analisadaPorIA: true,
              analiseResultado: true,
              analiseEm: true,
            },
            orderBy: { ordem: 'asc' },
          },
        },
        orderBy: [{ potencialScore: 'desc' }, { nome: 'asc' }],
        take: 200,
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
   * Obter análise completa de um cliente
   * GET /api/analysis/:id/resultado
   */
  async getAnaliseResultado(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const cliente = await prisma.cliente.findUnique({
        where: { id },
        include: {
          fotos: {
            orderBy: { ordem: 'asc' },
          },
        },
      });

      if (!cliente) {
        return res.status(404).json({
          success: false,
          error: 'Cliente não encontrado',
        });
      }

      // Parse das análises
      const fotosComAnalise = cliente.fotos.map((foto) => {
        let analise = null;
        if (foto.analiseResultado) {
          try {
            analise = JSON.parse(foto.analiseResultado);
          } catch (e) {
            console.error('Erro ao parsear análise:', e);
          }
        }

        return {
          id: foto.id,
          fileName: foto.fileName,
          ordem: foto.ordem,
          analisadaPorIA: foto.analisadaPorIA,
          analiseEm: foto.analiseEm,
          analise,
        };
      });

      // Buscar análise consolidada (última foto geralmente tem a análise batch)
      const analiseConsolidada = fotosComAnalise.find(
        (f) => f.analise?.analiseGeral
      )?.analise;

      return res.json({
        success: true,
        cliente: {
          id: cliente.id,
          nome: cliente.nome,
          endereco: cliente.endereco,
          cidade: cliente.cidade,
          estado: cliente.estado,
          telefone: cliente.telefone,
          tipoEstabelecimento: cliente.tipoEstabelecimento,
          rating: cliente.rating,
          totalAvaliacoes: cliente.totalAvaliacoes,
          potencialCategoria: cliente.potencialCategoria,
          potencialScore: cliente.potencialScore,
          status: cliente.status,
          website: cliente.website,
          redesSociais: cliente.redesSociais,
          tipologia: cliente.tipologia,
          tipologiaNome: cliente.tipologiaNome,
          tipologiaConfianca: cliente.tipologiaConfianca,
          tipologiaJustificativa: cliente.tipologiaJustificativa,
          estrategiaComercial: cliente.estrategiaComercial,
          dataQualityScore: cliente.dataQualityScore,
          confiabilidadeDados: cliente.confiabilidadeDados,
          scoringBreakdown: cliente.scoringBreakdown,
          // Campos adicionais para breakdown de Qualidade de Dados
          dataQualityBreakdown: cliente.dataQualityBreakdown,
          camposCriticos: cliente.camposCriticos,
          fontesValidadas: cliente.fontesValidadas,
          camposPreenchidos: cliente.camposPreenchidos,
          // Status das etapas do pipeline
          placesStatus: cliente.placesStatus,
          geocodingStatus: cliente.geocodingStatus,
          receitaStatus: cliente.receitaStatus,
          // Campos adicionais para Tipologia
          ambienteEstabelecimento: cliente.ambienteEstabelecimento,
          publicoAlvo: cliente.publicoAlvo,
          totalFotosDisponiveis: cliente.totalFotosDisponiveis,
          // Score breakdown de avaliações (para corrigir exibição)
          scoreAvaliacoes: cliente.scoreAvaliacoes,
          scoreRating: cliente.scoreRating,
        },
        fotos: fotosComAnalise,
        analiseConsolidada,
        totalFotos: cliente.fotos.length,
        fotosAnalisadas: fotosComAnalise.filter((f) => f.analisadaPorIA).length,
      });
    } catch (error: any) {
      console.error('Erro ao buscar resultado da análise:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar resultado',
      });
    }
  }

  /**
   * Reprocessar clientes com erro na análise
   * POST /api/analysis/retry-failed
   */
  async retryFailed(req: Request, res: Response) {
    try {
      const { mode = 'batch' } = req.body;

      // Buscar clientes com erro e que tenham fotos
      const clientesFalhados = await prisma.cliente.findMany({
        where: {
          status: 'ERRO',
          fotos: { some: {} },
        },
        select: {
          id: true,
          nome: true,
          fotos: { select: { id: true } },
        },
      });

      if (clientesFalhados.length === 0) {
        return res.json({
          success: true,
          message: 'Nenhum cliente com erro para reprocessar',
          total: 0,
        });
      }

      // Resetar status das fotos
      await prisma.foto.updateMany({
        where: {
          clienteId: { in: clientesFalhados.map((c) => c.id) },
        },
        data: {
          analisadaPorIA: false,
          analiseResultado: null,
          analiseEm: null,
        },
      });

      // Resetar status dos clientes
      await prisma.cliente.updateMany({
        where: {
          id: { in: clientesFalhados.map((c) => c.id) },
        },
        data: {
          status: 'PENDENTE',
        },
      });

      // Adicionar à fila
      const jobs = await Promise.all(
        clientesFalhados.map((cliente, index) =>
          analysisQueue.add(
            { clienteId: cliente.id, mode },
            {
              delay: index * 5000,
            }
          )
        )
      );

      return res.json({
        success: true,
        message: `${jobs.length} clientes com erro adicionados à fila novamente`,
        total: jobs.length,
      });
    } catch (error: any) {
      console.error('Erro ao reprocessar falhas:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao reprocessar clientes com erro',
      });
    }
  }

  /**
   * Estatísticas de análise
   * GET /api/analysis/estatisticas
   */
  async getEstatisticas(req: Request, res: Response) {
    try {
      // Buscar tipologias mais comuns identificadas pela IA
      const clientesAnalisados = await prisma.cliente.findMany({
        where: {
          status: 'CONCLUIDO',
          tipoEstabelecimento: { not: null },
        },
        select: {
          tipoEstabelecimento: true,
          potencialCategoria: true,
        },
      });

      // Contar tipologias
      const tipologias: { [key: string]: number } = {};
      clientesAnalisados.forEach((c) => {
        if (c.tipoEstabelecimento) {
          tipologias[c.tipoEstabelecimento] =
            (tipologias[c.tipoEstabelecimento] || 0) + 1;
        }
      });

      const tipologiasOrdenadas = Object.entries(tipologias)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([tipo, count]) => ({ tipo, quantidade: count }));

      // Distribuição de potencial
      const distribuicaoPotencial = await prisma.cliente.groupBy({
        by: ['potencialCategoria'],
        where: {
          status: 'CONCLUIDO',
          potencialCategoria: { not: null },
        },
        _count: true,
      });

      return res.json({
        success: true,
        totalAnalisados: clientesAnalisados.length,
        tipologiasTop10: tipologiasOrdenadas,
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

  /**
   * Recalcular scoring para todos os clientes
   * POST /api/analysis/recalculate-scores
   * Sprint 1: Aplica enhanced scoring para clientes existentes
   */
  async recalculateScores(req: Request, res: Response) {
    try {
      console.log('📊 Recalculando scores de todos os clientes...');

      // Buscar todos os clientes com dados do Places
      const clientes = await prisma.cliente.findMany({
        where: {
          placesStatus: 'SUCESSO',
        },
        include: {
          fotos: {
            where: { analisadaPorIA: true },
          },
        },
      });

      if (clientes.length === 0) {
        return res.json({
          success: true,
          message: 'Nenhum cliente para recalcular',
          total: 0,
        });
      }

      let updated = 0;
      const results = [];

      for (const cliente of clientes) {
        try {
          // Buscar primeira análise de IA se disponível
          let analiseIA = null;
          if (cliente.fotos.length > 0 && cliente.fotos[0].analiseResultado) {
            try {
              analiseIA = JSON.parse(cliente.fotos[0].analiseResultado);
            } catch {
              analiseIA = null;
            }
          }

          // Calcular enhanced scoring
          const enhancedScoring = scoringService.calculateEnhancedScoring({
            rating: cliente.rating ?? undefined,
            totalAvaliacoes: cliente.totalAvaliacoes ?? undefined,
            horarioFuncionamento: cliente.horarioFuncionamento ?? undefined,
            website: cliente.websitePlace ?? undefined,
            totalFotos: cliente.fotos.length,
            fotosAnalisadas: cliente.fotos.filter((f) => f.analisadaPorIA).length,
            analiseIA,
          });

          // Calcular data quality
          const dataQuality = await dataQualityService.analyzeDataQuality(cliente.id);

          // Atualizar cliente
          await prisma.cliente.update({
            where: { id: cliente.id },
            data: {
              potencialScore: enhancedScoring.scoreTotal,
              potencialCategoria: enhancedScoring.categoria,
              scoringBreakdown: JSON.stringify(enhancedScoring),
              scoreRating: enhancedScoring.scoreRating,
              scoreAvaliacoes: enhancedScoring.scoreAvaliacoes,
              scoreFotosQualidade: enhancedScoring.scoreFotosQualidade,
              scoreHorarioFunc: enhancedScoring.scoreHorarioFunc,
              scoreWebsite: enhancedScoring.scoreWebsite,
              scoreDensidadeReviews: enhancedScoring.scoreDensidadeReviews,
              densidadeAvaliacoes: enhancedScoring.densidadeAvaliacoes,
              tempoAbertoSemanal: enhancedScoring.tempoAbertoSemanal,
              diasAbertoPorSemana: enhancedScoring.diasAbertoPorSemana,
              dataQualityScore: dataQuality.score,
              confiabilidadeDados: dataQuality.confiabilidade,
              camposPreenchidos: dataQuality.camposPreenchidos,
              camposCriticos: JSON.stringify(dataQuality.camposCriticos),
              fontesValidadas: JSON.stringify(dataQuality.fontesValidadas),
            },
          });

          updated++;

          results.push({
            id: cliente.id,
            nome: cliente.nome,
            scoreAnterior: cliente.potencialScore,
            scoreNovo: enhancedScoring.scoreTotal,
            categoriaAnterior: cliente.potencialCategoria,
            categoriaNova: enhancedScoring.categoria,
          });

          console.log(
            `✅ ${cliente.nome} - Score: ${cliente.potencialScore} → ${enhancedScoring.scoreTotal} (${enhancedScoring.categoria})`
          );
        } catch (error: any) {
          console.error(`❌ Erro ao recalcular ${cliente.nome}:`, error.message);
        }
      }

      console.log(`✅ ${updated} scores recalculados com sucesso`);

      return res.json({
        success: true,
        message: `${updated} clientes atualizados com enhanced scoring`,
        total: updated,
        detalhes: results.slice(0, 20), // Retornar primeiros 20 para não sobrecarregar
      });
    } catch (error: any) {
      console.error('Erro ao recalcular scores:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao recalcular scores',
        details: error.message,
      });
    }
  }

  /**
   * Mesclar clientes duplicados
   * POST /api/analysis/merge-duplicates
   */
  async mergeDuplicates(req: Request, res: Response) {
    try {
      console.log('🔄 Iniciando mesclagem de duplicatas...');

      // Buscar todos os clientes
      const clientes = await prisma.cliente.findMany({
        include: {
          fotos: true,
        },
      });

      // Agrupar por nome normalizado
      const grupos: Record<string, typeof clientes> = {};

      for (const cliente of clientes) {
        const nomeNormalizado = cliente.nome
          .toLowerCase()
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/[^\w\s]/g, '');

        if (!grupos[nomeNormalizado]) {
          grupos[nomeNormalizado] = [];
        }
        grupos[nomeNormalizado].push(cliente);
      }

      let gruposMesclados = 0;
      let clientesRemovidos = 0;

      // Processar grupos com duplicatas
      for (const [nomeNormalizado, items] of Object.entries(grupos)) {
        if (items.length <= 1) continue; // Sem duplicatas

        // Ordenar: clientes com mais dados primeiro
        items.sort((a, b) => {
          const scoreA = [a.telefone, a.website, a.latitude, a.rating, a.tipologia]
            .filter(Boolean).length;
          const scoreB = [b.telefone, b.website, b.latitude, b.rating, b.tipologia]
            .filter(Boolean).length;
          return scoreB - scoreA;
        });

        const principal = items[0];
        const duplicatas = items.slice(1);

        console.log(`\n📦 Mesclando grupo: ${principal.nome} (${items.length} duplicatas)`);

        // Mesclar dados de todas as duplicatas no principal
        const updateData: any = {};

        for (const dup of duplicatas) {
          if (!principal.telefone && dup.telefone) updateData.telefone = dup.telefone;
          if (!principal.website && dup.website) updateData.website = dup.website;
          if (!principal.cidade && dup.cidade) updateData.cidade = dup.cidade;
          if (!principal.estado && dup.estado) updateData.estado = dup.estado;
          if (!principal.cep && dup.cep) updateData.cep = dup.cep;
          if (!principal.latitude && dup.latitude) {
            updateData.latitude = dup.latitude;
            updateData.longitude = dup.longitude;
          }
          if (!principal.rating && dup.rating) {
            updateData.rating = dup.rating;
            updateData.totalAvaliacoes = dup.totalAvaliacoes;
          }
          if (!principal.tipologia && dup.tipologia) {
            updateData.tipologia = dup.tipologia;
            updateData.subTipologia = dup.subTipologia;
            updateData.tipologiaConfianca = dup.tipologiaConfianca;
          }
          if (!principal.redesSociais && dup.redesSociais) updateData.redesSociais = dup.redesSociais;
        }

        // Atualizar cliente principal
        if (Object.keys(updateData).length > 0) {
          await prisma.cliente.update({
            where: { id: principal.id },
            data: updateData,
          });
        }

        // Transferir fotos das duplicatas para o principal
        for (const dup of duplicatas) {
          if (dup.fotos.length > 0) {
            await prisma.foto.updateMany({
              where: { clienteId: dup.id },
              data: { clienteId: principal.id },
            });
          }
        }

        // Remover duplicatas
        await prisma.cliente.deleteMany({
          where: {
            id: { in: duplicatas.map(d => d.id) },
          },
        });

        gruposMesclados++;
        clientesRemovidos += duplicatas.length;
      }

      console.log(`\n✅ Mesclagem concluída:`);
      console.log(`   Grupos mesclados: ${gruposMesclados}`);
      console.log(`   Clientes removidos: ${clientesRemovidos}`);

      return res.json({
        success: true,
        message: `${gruposMesclados} grupos de duplicatas mesclados`,
        gruposMesclados,
        clientesRemovidos,
      });
    } catch (error: any) {
      console.error('Erro ao mesclar duplicatas:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao mesclar duplicatas',
        details: error.message,
      });
    }
  }

  /**
   * Detectar clientes duplicados
   * GET /api/analysis/duplicates
   */
  async detectDuplicates(req: Request, res: Response) {
    try {
      // Buscar todos os clientes
      const clientes = await prisma.cliente.findMany({
        select: {
          id: true,
          nome: true,
          endereco: true,
          cidade: true,
          estado: true,
          latitude: true,
          longitude: true,
        },
      });

      // Agrupar por nome normalizado
      const grupos: Record<string, typeof clientes> = {};

      for (const cliente of clientes) {
        const nomeNormalizado = cliente.nome
          .toLowerCase()
          .trim()
          .replace(/\s+/g, ' ')
          .replace(/[^\w\s]/g, '');

        if (!grupos[nomeNormalizado]) {
          grupos[nomeNormalizado] = [];
        }
        grupos[nomeNormalizado].push(cliente);
      }

      // Filtrar apenas grupos com duplicatas
      const duplicatas = Object.entries(grupos)
        .filter(([_, items]) => items.length > 1)
        .map(([nomeNormalizado, items]) => ({
          nomeNormalizado,
          quantidade: items.length,
          clientes: items.map((c) => ({
            id: c.id,
            nome: c.nome,
            endereco: c.endereco,
            cidade: c.cidade,
            estado: c.estado,
            coordenadas: c.latitude && c.longitude ? `${c.latitude}, ${c.longitude}` : null,
          })),
        }))
        .sort((a, b) => b.quantidade - a.quantidade);

      return res.json({
        success: true,
        total: duplicatas.length,
        totalClientesDuplicados: duplicatas.reduce((sum, d) => sum + d.quantidade, 0),
        duplicatas: duplicatas.slice(0, 50), // Retornar top 50
      });
    } catch (error: any) {
      console.error('Erro ao detectar duplicatas:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao detectar duplicatas',
        details: error.message,
      });
    }
  }

  /**
   * Iniciar geocodificação manualmente
   * POST /api/analysis/start-geocoding
   * Query params:
   *   ?force=true para reprocessar
   *   ?scope=planilha para última planilha, ?scope=all para todos
   */
  async startGeocoding(req: Request, res: Response) {
    try {
      const force = req.query.force === 'true' || req.body.force === true;
      const scope = (req.query.scope as string) || (req.body.scope as string) || 'planilha';

      // Buscar última planilha se scope=planilha
      let planilhaFilter = {};
      if (scope === 'planilha') {
        const ultimaPlanilha = await prisma.planilha.findFirst({
          orderBy: { uploadedAt: 'desc' },
          select: { id: true, nomeArquivo: true },
        });
        if (!ultimaPlanilha) {
          return res.json({
            success: false,
            message: 'Nenhuma planilha encontrada',
            total: 0,
          });
        }
        planilhaFilter = { planilhaId: ultimaPlanilha.id };
        console.log(`📋 Processando planilha: ${ultimaPlanilha.nomeArquivo}`);
      }

      // Se force=true, reprocessar todos os clientes (do escopo selecionado)
      // Senão, só processar os pendentes
      const whereClause = force ? { ...planilhaFilter } : { ...planilhaFilter, latitude: null };

      const clientesPendentes = await prisma.cliente.findMany({
        where: whereClause,
        select: {
          id: true,
          nome: true,
        },
      });

      if (clientesPendentes.length === 0) {
        return res.json({
          success: true,
          message: 'Nenhum cliente encontrado para geocodificação',
          total: 0,
        });
      }

      // Limpar status anterior se for force
      if (force) {
        await prisma.cliente.updateMany({
          where: { id: { in: clientesPendentes.map(c => c.id) } },
          data: {
            latitude: null,
            longitude: null,
            enderecoFormatado: null,
            placeId: null,
          },
        });
      }

      // Criar registro de processamento em lote
      const processamentoLote = await prisma.processamentoLote.create({
        data: {
          tipo: 'GEOCODING',
          status: 'INICIADO',
          totalClientes: clientesPendentes.length,
          observacoes: force ? 'Reprocessamento forçado' : 'Processamento normal',
        },
      });

      // Adicionar todos à fila
      const jobs = await Promise.all(
        clientesPendentes.map((cliente) =>
          geocodingQueue.add({ clienteId: cliente.id })
        )
      );

      const scopeLabel = scope === 'planilha' ? 'última planilha' : 'todos';
      console.log(`📍 ${jobs.length} clientes adicionados à fila de geocodificação (${scopeLabel})${force ? ' - REPROCESSAMENTO' : ''}`);
      console.log(`📦 Processamento em lote registrado: ${processamentoLote.id}`);

      // Atualizar para EM_PROGRESSO
      await prisma.processamentoLote.update({
        where: { id: processamentoLote.id },
        data: { status: 'EM_PROGRESSO' },
      });

      return res.json({
        success: true,
        message: `${jobs.length} clientes adicionados à fila de geocodificação (${scopeLabel})`,
        total: jobs.length,
        scope,
        reprocessamento: force,
        processamentoId: processamentoLote.id,
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
   * Iniciar Google Places manualmente
   * POST /api/analysis/start-places
   * Query params:
   *   ?force=true para reprocessar
   *   ?scope=planilha para última planilha, ?scope=all para todos
   */
  async startPlaces(req: Request, res: Response) {
    try {
      const force = req.query.force === 'true' || req.body.force === true;
      const scope = (req.query.scope as string) || (req.body.scope as string) || 'planilha';

      // Buscar última planilha se scope=planilha
      let planilhaFilter = {};
      if (scope === 'planilha') {
        const ultimaPlanilha = await prisma.planilha.findFirst({
          orderBy: { uploadedAt: 'desc' },
          select: { id: true, nomeArquivo: true },
        });
        if (!ultimaPlanilha) {
          return res.json({
            success: false,
            message: 'Nenhuma planilha encontrada',
            total: 0,
          });
        }
        planilhaFilter = { planilhaId: ultimaPlanilha.id };
        console.log(`📋 Processando planilha: ${ultimaPlanilha.nomeArquivo}`);
      }

      // Se force=true, reprocessar todos os clientes com coordenadas (do escopo selecionado)
      // Senão, só processar os pendentes
      const whereClause = force
        ? { ...planilhaFilter, latitude: { not: null } }
        : { ...planilhaFilter, latitude: { not: null }, placesStatus: { not: 'SUCESSO' } };

      const clientesPendentes = await prisma.cliente.findMany({
        where: whereClause,
        select: {
          id: true,
          nome: true,
        },
      });

      if (clientesPendentes.length === 0) {
        return res.json({
          success: true,
          message: 'Nenhum cliente encontrado para Google Places',
          total: 0,
        });
      }

      // Limpar status anterior se for force
      if (force) {
        await prisma.cliente.updateMany({
          where: { id: { in: clientesPendentes.map(c => c.id) } },
          data: {
            placesStatus: 'PENDENTE',
            placesErro: null,
            tipoEstabelecimento: null,
            rating: null,
            totalAvaliacoes: null,
            horarioFuncionamento: null,
            telefonePlace: null,
            websitePlace: null,
          },
        });

        // Apagar fotos antigas para reprocessar
        await prisma.foto.deleteMany({
          where: { clienteId: { in: clientesPendentes.map(c => c.id) } },
        });
      }

      // Criar registro de processamento em lote
      const processamentoLote = await prisma.processamentoLote.create({
        data: {
          tipo: 'PLACES',
          status: 'INICIADO',
          totalClientes: clientesPendentes.length,
          observacoes: force ? 'Reprocessamento forçado' : 'Processamento normal',
        },
      });

      // Adicionar todos à fila
      const jobs = await Promise.all(
        clientesPendentes.map((cliente) =>
          placesQueue.add({ clienteId: cliente.id, loteId: processamentoLote.id })
        )
      );

      const scopeLabel = scope === 'planilha' ? 'última planilha' : 'todos';
      console.log(`🌍 ${jobs.length} clientes adicionados à fila do Google Places (${scopeLabel})${force ? ' - REPROCESSAMENTO' : ''}`);
      console.log(`📦 Processamento em lote registrado: ${processamentoLote.id}`);

      // Atualizar para EM_PROGRESSO
      await prisma.processamentoLote.update({
        where: { id: processamentoLote.id },
        data: { status: 'EM_PROGRESSO' },
      });

      return res.json({
        success: true,
        message: `${jobs.length} clientes adicionados à fila do Google Places (${scopeLabel})`,
        total: jobs.length,
        scope,
        reprocessamento: force,
        processamentoId: processamentoLote.id,
      });
    } catch (error: any) {
      console.error('Erro ao iniciar Google Places:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao iniciar Google Places',
        details: error.message,
      });
    }
  }

  /**
   * Iniciar análise de IA manualmente
   * POST /api/analysis/start-analysis
   * Query params:
   *   ?force=true para reprocessar
   *   ?scope=planilha para última planilha, ?scope=all para todos
   */
  async startAnalysisManual(req: Request, res: Response) {
    try {
      const force = req.query.force === 'true' || req.body.force === true;
      const scope = (req.query.scope as string) || (req.body.scope as string) || 'planilha';

      // Buscar última planilha se scope=planilha
      let planilhaFilter = {};
      if (scope === 'planilha') {
        const ultimaPlanilha = await prisma.planilha.findFirst({
          orderBy: { uploadedAt: 'desc' },
          select: { id: true, nomeArquivo: true },
        });
        if (!ultimaPlanilha) {
          return res.json({
            success: false,
            message: 'Nenhuma planilha encontrada',
            total: 0,
          });
        }
        planilhaFilter = { planilhaId: ultimaPlanilha.id };
        console.log(`📋 Processando planilha: ${ultimaPlanilha.nomeArquivo}`);
      }

      // Se force=true, reprocessar todos os clientes com fotos (do escopo selecionado)
      // Senão, só processar fotos não analisadas
      const whereClause = force
        ? {
            ...planilhaFilter,
            placesStatus: 'SUCESSO',
            fotos: { some: {} }, // Qualquer foto
          }
        : {
            ...planilhaFilter,
            placesStatus: 'SUCESSO',
            fotos: {
              some: {
                analisadaPorIA: false,
              },
            },
          };

      const clientesComFotos = await prisma.cliente.findMany({
        where: whereClause,
        select: {
          id: true,
          nome: true,
          fotos: {
            select: { id: true },
          },
        },
      });

      if (clientesComFotos.length === 0) {
        return res.json({
          success: true,
          message: 'Nenhum cliente com fotos para análise',
          total: 0,
        });
      }

      // Limpar análises anteriores se for force
      if (force) {
        const fotosIds = clientesComFotos.flatMap(c => c.fotos.map(f => f.id));
        await prisma.foto.updateMany({
          where: { id: { in: fotosIds } },
          data: {
            analisadaPorIA: false,
            analiseResultado: null,
            analiseEm: null,
          },
        });
      }

      // Criar registro de processamento em lote
      const processamentoLote = await prisma.processamentoLote.create({
        data: {
          tipo: 'ANALYSIS',
          status: 'INICIADO',
          totalClientes: clientesComFotos.length,
          observacoes: force ? 'Reprocessamento forçado' : 'Processamento normal',
        },
      });

      // Adicionar todos à fila
      const jobs = await Promise.all(
        clientesComFotos.map((cliente, index) =>
          analysisQueue.add(
            { clienteId: cliente.id, mode: 'batch', loteId: processamentoLote.id },
            {
              delay: index * 2000, // 2s entre cada
            }
          )
        )
      );

      const scopeLabel = scope === 'planilha' ? 'última planilha' : 'todos';
      console.log(`🤖 ${jobs.length} clientes adicionados à fila de análise de IA (${scopeLabel})${force ? ' - REPROCESSAMENTO' : ''}`);
      console.log(`📦 Processamento em lote registrado: ${processamentoLote.id}`);

      // Atualizar para EM_PROGRESSO
      await prisma.processamentoLote.update({
        where: { id: processamentoLote.id },
        data: { status: 'EM_PROGRESSO' },
      });

      return res.json({
        success: true,
        message: `${jobs.length} clientes adicionados à fila de análise (${scopeLabel})`,
        total: jobs.length,
        scope,
        reprocessamento: force,
        processamentoId: processamentoLote.id,
      });
    } catch (error: any) {
      console.error('Erro ao iniciar análise de IA:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao iniciar análise de IA',
        details: error.message,
      });
    }
  }

  /**
   * Iniciar busca na Receita Federal + Normalização de Endereços
   * POST /api/analysis/start-receita
   * Query params:
   *   ?force=true para reprocessar
   *   ?scope=planilha para última planilha, ?scope=all para todos
   */
  async startReceita(req: Request, res: Response) {
    try {
      const force = req.query.force === 'true' || req.body.force === true;
      const scope = (req.query.scope as string) || (req.body.scope as string) || 'planilha';

      // Buscar última planilha se scope=planilha
      let planilhaFilter = {};
      if (scope === 'planilha') {
        const ultimaPlanilha = await prisma.planilha.findFirst({
          orderBy: { uploadedAt: 'desc' },
          select: { id: true, nomeArquivo: true },
        });
        if (!ultimaPlanilha) {
          return res.json({
            success: false,
            message: 'Nenhuma planilha encontrada',
            total: 0,
          });
        }
        planilhaFilter = { planilhaId: ultimaPlanilha.id };
        console.log(`📋 Processando planilha: ${ultimaPlanilha.nomeArquivo}`);
      }

      // Se force=true, reprocessar todos (do escopo selecionado)
      // Senão, só processar os pendentes
      const whereClause = force
        ? { ...planilhaFilter }
        : { ...planilhaFilter, receitaStatus: 'PENDENTE' };

      const clientesPendentes = await prisma.cliente.findMany({
        where: whereClause,
        select: {
          id: true,
          nome: true,
          cnpj: true,
        },
      });

      if (clientesPendentes.length === 0) {
        return res.json({
          success: true,
          message: 'Nenhum cliente encontrado para consulta da Receita',
          total: 0,
        });
      }

      // Limpar status anterior se for force
      if (force) {
        await prisma.cliente.updateMany({
          where: { id: { in: clientesPendentes.map(c => c.id) } },
          data: {
            receitaStatus: 'PENDENTE',
            receitaProcessadoEm: null,
            receitaErro: null,
            razaoSocial: null,
            nomeFantasia: null,
            enderecoReceita: null,
            situacaoReceita: null,
            dataAberturaReceita: null,
            naturezaJuridica: null,
            atividadePrincipal: null,
            divergenciaEndereco: false,
            similaridadeEndereco: null,
            enderecoNormalizado: null,
            alteracoesNormalizacao: null,
          },
        });
      }

      // Criar registro de processamento em lote
      const processamentoLote = await prisma.processamentoLote.create({
        data: {
          tipo: 'RECEITA',
          status: 'INICIADO',
          totalClientes: clientesPendentes.length,
          observacoes: force ? 'Reprocessamento forçado' : 'Processamento normal',
        },
      });

      // Adicionar todos à fila com delay para respeitar rate limit da API
      // ReceitaWS permite ~3 requisições por minuto
      const jobs = await Promise.all(
        clientesPendentes.map((cliente, index) =>
          receitaQueue.add(
            { clienteId: cliente.id, loteId: processamentoLote.id },
            {
              delay: index * 20000, // 20s entre cada = 3 por minuto
            }
          )
        )
      );

      const scopeLabel = scope === 'planilha' ? 'última planilha' : 'todos';
      console.log(`📋 ${jobs.length} clientes adicionados à fila da Receita Federal (${scopeLabel})${force ? ' - REPROCESSAMENTO' : ''}`);
      console.log(`📦 Processamento em lote registrado: ${processamentoLote.id}`);

      // Atualizar para EM_PROGRESSO
      await prisma.processamentoLote.update({
        where: { id: processamentoLote.id },
        data: { status: 'EM_PROGRESSO' },
      });

      return res.json({
        success: true,
        message: `${jobs.length} clientes adicionados à fila da Receita Federal (${scopeLabel})`,
        total: jobs.length,
        scope,
        reprocessamento: force,
        processamentoId: processamentoLote.id,
        tempoEstimado: `${Math.ceil((jobs.length * 20) / 60)} minutos`,
      });
    } catch (error: any) {
      console.error('Erro ao iniciar consulta da Receita:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao iniciar consulta da Receita',
        details: error.message,
      });
    }
  }

  /**
   * Iniciar normalização de endereços com IA
   * POST /api/analysis/start-normalization
   * Query params:
   *   ?force=true para reprocessar
   *   ?scope=planilha para última planilha, ?scope=all para todos
   */
  async startNormalization(req: Request, res: Response) {
    try {
      const force = req.query.force === 'true' || req.body.force === true;
      const scope = (req.query.scope as string) || (req.body.scope as string) || 'planilha';

      // Buscar última planilha se scope=planilha
      let planilhaFilter = {};
      if (scope === 'planilha') {
        const ultimaPlanilha = await prisma.planilha.findFirst({
          orderBy: { uploadedAt: 'desc' },
          select: { id: true, nomeArquivo: true },
        });
        if (!ultimaPlanilha) {
          return res.json({
            success: false,
            message: 'Nenhuma planilha encontrada',
            total: 0,
          });
        }
        planilhaFilter = { planilhaId: ultimaPlanilha.id };
        console.log(`📋 Processando planilha: ${ultimaPlanilha.nomeArquivo}`);
      }

      // Se force=true, reprocessar todos com receita concluída (do escopo selecionado)
      // Senão, só processar os pendentes
      // NOTA: Processar clientes mesmo que receita tenha falhado (FALHA também conta como "processado")
      const whereClause = force
        ? { ...planilhaFilter, receitaStatus: { notIn: ['PENDENTE', 'PROCESSANDO'] } }
        : {
            ...planilhaFilter,
            receitaStatus: { notIn: ['PENDENTE', 'PROCESSANDO'] },
            normalizacaoStatus: 'PENDENTE',
          };

      const clientesPendentes = await prisma.cliente.findMany({
        where: whereClause,
        select: {
          id: true,
          nome: true,
        },
      });

      if (clientesPendentes.length === 0) {
        return res.json({
          success: true,
          message: 'Nenhum cliente encontrado para normalização',
          total: 0,
        });
      }

      // Limpar status anterior se for force
      if (force) {
        await prisma.cliente.updateMany({
          where: { id: { in: clientesPendentes.map(c => c.id) } },
          data: {
            normalizacaoStatus: 'PENDENTE',
            normalizacaoProcessadoEm: null,
            normalizacaoErro: null,
            enderecoNormalizado: null,
            cidadeNormalizada: null,
            estadoNormalizado: null,
            alteracoesNormalizacao: null,
          },
        });
      }

      // Criar registro de processamento em lote
      const processamentoLote = await prisma.processamentoLote.create({
        data: {
          tipo: 'NORMALIZATION',
          status: 'INICIADO',
          totalClientes: clientesPendentes.length,
          observacoes: force ? 'Reprocessamento forçado' : 'Processamento normal',
        },
      });

      // Adicionar todos à fila
      const jobs = await Promise.all(
        clientesPendentes.map((cliente) =>
          normalizationQueue.add(
            { clienteId: cliente.id, loteId: processamentoLote.id }
          )
        )
      );

      const scopeLabel = scope === 'planilha' ? 'última planilha' : 'todos';
      console.log(`📝 ${jobs.length} clientes adicionados à fila de Normalização (${scopeLabel})${force ? ' - REPROCESSAMENTO' : ''}`);
      console.log(`📦 Processamento em lote registrado: ${processamentoLote.id}`);

      // Atualizar para EM_PROGRESSO
      await prisma.processamentoLote.update({
        where: { id: processamentoLote.id },
        data: { status: 'EM_PROGRESSO' },
      });

      return res.json({
        success: true,
        message: `${jobs.length} clientes adicionados à fila de Normalização (${scopeLabel})`,
        total: jobs.length,
        scope,
        reprocessamento: force,
        processamentoId: processamentoLote.id,
      });
    } catch (error: any) {
      console.error('Erro ao iniciar normalização:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao iniciar normalização',
        details: error.message,
      });
    }
  }

  /**
   * Pausar uma fila específica
   * POST /api/analysis/pause/:queueName
   */
  async pauseQueue(req: Request, res: Response) {
    try {
      const { queueName } = req.params;

      let queue;
      switch (queueName) {
        case 'receita':
          queue = receitaQueue;
          break;
        case 'normalization':
          queue = normalizationQueue;
          break;
        case 'geocoding':
          queue = geocodingQueue;
          break;
        case 'places':
          queue = placesQueue;
          break;
        case 'analysis':
          queue = analysisQueue;
          break;
        case 'tipologia':
          queue = tipologiaQueue;
          break;
        default:
          return res.status(400).json({
            success: false,
            error: 'Fila inválida',
          });
      }

      await queue.pause();
      console.log(`⏸️  Fila ${queueName} pausada`);

      return res.json({
        success: true,
        message: `Fila ${queueName} pausada com sucesso`,
      });
    } catch (error: any) {
      console.error('Erro ao pausar fila:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao pausar fila',
        details: error.message,
      });
    }
  }

  /**
   * Retomar uma fila específica
   * POST /api/analysis/resume/:queueName
   */
  async resumeQueue(req: Request, res: Response) {
    try {
      const { queueName } = req.params;

      let queue;
      switch (queueName) {
        case 'receita':
          queue = receitaQueue;
          break;
        case 'normalization':
          queue = normalizationQueue;
          break;
        case 'geocoding':
          queue = geocodingQueue;
          break;
        case 'places':
          queue = placesQueue;
          break;
        case 'analysis':
          queue = analysisQueue;
          break;
        case 'tipologia':
          queue = tipologiaQueue;
          break;
        default:
          return res.status(400).json({
            success: false,
            error: 'Fila inválida',
          });
      }

      await queue.resume();
      console.log(`▶️  Fila ${queueName} retomada`);

      return res.json({
        success: true,
        message: `Fila ${queueName} retomada com sucesso`,
      });
    } catch (error: any) {
      console.error('Erro ao retomar fila:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao retomar fila',
        details: error.message,
      });
    }
  }

  /**
   * Obter logs/jobs recentes de uma fila
   * GET /api/analysis/queue-logs/:queueName
   */
  async getQueueLogs(req: Request, res: Response) {
    try {
      const { queueName } = req.params;
      const limit = parseInt(req.query.limit as string) || 20;

      let queue;
      let tipoProcessamento;
      switch (queueName) {
        case 'receita':
          queue = receitaQueue;
          tipoProcessamento = 'RECEITA';
          break;
        case 'normalization':
          queue = normalizationQueue;
          tipoProcessamento = 'NORMALIZATION';
          break;
        case 'geocoding':
          queue = geocodingQueue;
          tipoProcessamento = 'GEOCODING';
          break;
        case 'places':
          queue = placesQueue;
          tipoProcessamento = 'PLACES';
          break;
        case 'analysis':
          queue = analysisQueue;
          tipoProcessamento = 'ANALYSIS';
          break;
        case 'tipologia':
          queue = tipologiaQueue;
          tipoProcessamento = 'TIPOLOGIA';
          break;
        default:
          return res.status(400).json({
            success: false,
            error: 'Fila inválida',
          });
      }

      // Buscar histórico de processamentos em lote do banco
      const processamentosLote = await prisma.processamentoLote.findMany({
        where: { tipo: tipoProcessamento },
        orderBy: { iniciadoEm: 'desc' },
        take: 5, // Últimos 5 processamentos em lote
      });

      // Buscar jobs completados e falhados recentes
      const [completed, failed, active] = await Promise.all([
        queue.getCompleted(0, limit - 1),
        queue.getFailed(0, limit - 1),
        queue.getActive(0, limit - 1),
      ]);

      // Formatar logs
      const logs = [];

      // Adicionar logs de processamentos em lote (histórico permanente)
      for (const proc of processamentosLote) {
        const duracao = proc.finalizadoEm
          ? Math.round((proc.finalizadoEm.getTime() - proc.iniciadoEm.getTime()) / 1000)
          : null;

        logs.push({
          timestamp: proc.iniciadoEm,
          type: proc.status === 'CONCLUIDO' ? 'batch_success' : proc.status === 'EM_PROGRESSO' ? 'batch_processing' : 'batch_info',
          message: `📦 Lote ${proc.status === 'CONCLUIDO' ? 'concluído' : proc.status === 'EM_PROGRESSO' ? 'em progresso' : 'iniciado'}: ${proc.sucesso}/${proc.totalClientes} sucesso${duracao ? ` (${duracao}s)` : ''}`,
          jobId: `batch-${proc.id}`,
          details: {
            total: proc.totalClientes,
            processados: proc.processados,
            sucesso: proc.sucesso,
            falhas: proc.falhas,
            iniciadoEm: proc.iniciadoEm,
            finalizadoEm: proc.finalizadoEm,
            duracao: duracao,
          },
        });
      }

      // Jobs ativos
      for (const job of active) {
        const data = job.data as any;
        logs.push({
          timestamp: new Date(job.timestamp),
          type: 'processing',
          message: `🔄 Processando: ${data.clienteId || job.id}`,
          jobId: job.id,
        });
      }

      // Jobs completados
      for (const job of completed) {
        const data = job.data as any;
        const result = job.returnvalue as any;
        logs.push({
          timestamp: new Date(job.finishedOn || job.timestamp),
          type: 'success',
          message: `✅ Concluído: ${result?.nome || data.clienteId || job.id}`,
          jobId: job.id,
        });
      }

      // Jobs falhados
      for (const job of failed) {
        const data = job.data as any;
        logs.push({
          timestamp: new Date(job.finishedOn || job.timestamp),
          type: 'error',
          message: `❌ Erro: ${data.clienteId || job.id} - ${job.failedReason}`,
          jobId: job.id,
        });
      }

      // Ordenar por timestamp (mais recente primeiro)
      logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Calcular resumo geral de todos os processamentos
      const resumoGeral = {
        totalProcessamentos: processamentosLote.length,
        totalClientesProcessados: processamentosLote.reduce((acc, p) => acc + p.processados, 0),
        totalSucesso: processamentosLote.reduce((acc, p) => acc + p.sucesso, 0),
        totalFalhas: processamentosLote.reduce((acc, p) => acc + p.falhas, 0),
        processamentosConcluidos: processamentosLote.filter(p => p.status === 'CONCLUIDO').length,
        processamentosEmAndamento: processamentosLote.filter(p => p.status === 'EM_PROGRESSO').length,
      };

      // Adicionar resumo como primeiro item (mais visível)
      if (processamentosLote.length > 0) {
        const taxaSucesso = resumoGeral.totalClientesProcessados > 0
          ? Math.round((resumoGeral.totalSucesso / resumoGeral.totalClientesProcessados) * 100)
          : 0;

        logs.unshift({
          timestamp: new Date(),
          type: 'summary',
          message: `📊 RESUMO GERAL: ${resumoGeral.totalSucesso} sucessos, ${resumoGeral.totalFalhas} falhas (${taxaSucesso}% sucesso) | ${resumoGeral.processamentosConcluidos} lotes concluídos`,
          jobId: 'summary',
          details: resumoGeral,
        });
      }

      return res.json({
        success: true,
        logs: logs.slice(0, limit + 1), // +1 para incluir o resumo
        summary: resumoGeral,
      });
    } catch (error: any) {
      console.error(`Erro ao buscar logs:`, error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar logs',
        details: error.message,
      });
    }
  }

  /**
   * Obter status de pausa das filas
   * GET /api/analysis/queue-paused-status
   */
  async getQueuePausedStatus(req: Request, res: Response) {
    try {
      const [receitaPaused, normalizationPaused, geocodingPaused, placesPaused, analysisPaused, tipologiaPaused] =
        await Promise.all([
          receitaQueue.isPaused(),
          normalizationQueue.isPaused(),
          geocodingQueue.isPaused(),
          placesQueue.isPaused(),
          analysisQueue.isPaused(),
          tipologiaQueue.isPaused(),
        ]);

      return res.json({
        success: true,
        paused: {
          receita: receitaPaused,
          normalization: normalizationPaused,
          geocoding: geocodingPaused,
          places: placesPaused,
          analysis: analysisPaused,
          tipologia: tipologiaPaused,
        },
      });
    } catch (error: any) {
      console.error('Erro ao verificar status de pausa:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao verificar status de pausa',
        details: error.message,
      });
    }
  }

  /**
   * Obter logs estruturados por correlation ID
   * GET /api/analysis/structured-logs/correlation/:correlationId
   */
  async getLogsByCorrelation(req: Request, res: Response) {
    try {
      const { correlationId } = req.params;

      const logs = await prisma.processamentoLog.findMany({
        where: { correlationId },
        orderBy: { timestamp: 'asc' },
      });

      return res.json({
        success: true,
        correlationId,
        totalLogs: logs.length,
        logs: logs.map((log) => ({
          ...log,
          detalhes: log.detalhes ? JSON.parse(log.detalhes) : null,
          dadosEntrada: log.dadosEntrada ? JSON.parse(log.dadosEntrada) : null,
          dadosSaida: log.dadosSaida ? JSON.parse(log.dadosSaida) : null,
          transformacoes: log.transformacoes ? JSON.parse(log.transformacoes) : null,
          validacoes: log.validacoes ? JSON.parse(log.validacoes) : null,
          alertas: log.alertas ? JSON.parse(log.alertas) : null,
        })),
      });
    } catch (error: any) {
      console.error('Erro ao buscar logs por correlation:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar logs',
        details: error.message,
      });
    }
  }

  /**
   * Obter logs estruturados por cliente
   * GET /api/analysis/structured-logs/cliente/:clienteId
   */
  async getLogsByCliente(req: Request, res: Response) {
    try {
      const { clienteId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;

      const logs = await prisma.processamentoLog.findMany({
        where: { clienteId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      // Agrupar por correlation ID para mostrar jornadas completas
      const journeys = logs.reduce((acc: any, log) => {
        if (!acc[log.correlationId]) {
          acc[log.correlationId] = [];
        }
        acc[log.correlationId].push(log);
        return acc;
      }, {});

      return res.json({
        success: true,
        clienteId,
        totalLogs: logs.length,
        totalJourneys: Object.keys(journeys).length,
        journeys: Object.entries(journeys).map(([corrId, logs]: any) => ({
          correlationId: corrId,
          totalSteps: logs.length,
          iniciado: logs[logs.length - 1].timestamp,
          finalizado: logs[0].timestamp,
          etapas: logs.reverse().map((log: any) => ({
            timestamp: log.timestamp,
            etapa: log.etapa,
            operacao: log.operacao,
            nivel: log.nivel,
            mensagem: log.mensagem,
            tempoExecucaoMs: log.tempoExecucaoMs,
          })),
        })),
      });
    } catch (error: any) {
      console.error('Erro ao buscar logs por cliente:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar logs',
        details: error.message,
      });
    }
  }

  /**
   * Obter métricas de performance por etapa
   * GET /api/analysis/performance-metrics/:etapa
   */
  async getPerformanceMetrics(req: Request, res: Response) {
    try {
      const { etapa } = req.params;

      const logs = await prisma.processamentoLog.findMany({
        where: {
          etapa: etapa.toUpperCase(),
          tempoExecucaoMs: { not: null },
          operacao: 'CONCLUSAO', // Apenas logs de conclusão têm tempo total
        },
        select: {
          tempoExecucaoMs: true,
          timestamp: true,
          nivel: true,
        },
        orderBy: { timestamp: 'desc' },
        take: 1000, // Últimas 1000 execuções
      });

      if (logs.length === 0) {
        return res.json({
          success: true,
          etapa,
          message: 'Sem dados de performance disponíveis',
          metrics: null,
        });
      }

      const tempos = logs.map((l) => l.tempoExecucaoMs!);
      const soma = tempos.reduce((a, b) => a + b, 0);
      const media = soma / tempos.length;
      const min = Math.min(...tempos);
      const max = Math.max(...tempos);

      // Calcular percentis
      const sorted = [...tempos].sort((a, b) => a - b);
      const p50 = sorted[Math.floor(sorted.length * 0.5)];
      const p95 = sorted[Math.floor(sorted.length * 0.95)];
      const p99 = sorted[Math.floor(sorted.length * 0.99)];

      // Estatísticas por nível (sucesso vs erro)
      const porNivel = logs.reduce((acc: any, log) => {
        if (!acc[log.nivel]) {
          acc[log.nivel] = [];
        }
        acc[log.nivel].push(log.tempoExecucaoMs!);
        return acc;
      }, {});

      return res.json({
        success: true,
        etapa,
        metrics: {
          totalExecucoes: logs.length,
          tempoMedio: Math.round(media),
          tempoMinimo: min,
          tempoMaximo: max,
          percentil50: p50,
          percentil95: p95,
          percentil99: p99,
          porNivel: Object.entries(porNivel).map(([nivel, tempos]: any) => ({
            nivel,
            count: tempos.length,
            tempoMedio: Math.round(tempos.reduce((a: number, b: number) => a + b, 0) / tempos.length),
          })),
        },
      });
    } catch (error: any) {
      console.error('Erro ao buscar métricas de performance:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar métricas',
        details: error.message,
      });
    }
  }

  /**
   * Obter estatísticas de integridade de dados
   * GET /api/analysis/data-integrity-stats
   */
  async getDataIntegrityStats(req: Request, res: Response) {
    try {
      // Buscar logs de validação e transformação
      const validationLogs = await prisma.processamentoLog.findMany({
        where: {
          OR: [{ operacao: 'VALIDACAO' }, { operacao: 'TRANSFORMACAO' }],
        },
        select: {
          etapa: true,
          operacao: true,
          nivel: true,
          validacoes: true,
          transformacoes: true,
          alertas: true,
        },
        orderBy: { timestamp: 'desc' },
        take: 1000,
      });

      // Contar validações bem-sucedidas vs falhadas
      const stats = validationLogs.reduce(
        (acc: any, log) => {
          const etapa = log.etapa;
          if (!acc[etapa]) {
            acc[etapa] = {
              validacoes: 0,
              transformacoes: 0,
              alertas: 0,
              erros: 0,
            };
          }

          if (log.operacao === 'VALIDACAO') {
            acc[etapa].validacoes++;
          }
          if (log.operacao === 'TRANSFORMACAO') {
            acc[etapa].transformacoes++;
          }
          if (log.alertas) {
            acc[etapa].alertas++;
          }
          if (log.nivel === 'ERROR' || log.nivel === 'FATAL') {
            acc[etapa].erros++;
          }

          return acc;
        },
        {}
      );

      return res.json({
        success: true,
        stats,
        totalLogs: validationLogs.length,
      });
    } catch (error: any) {
      console.error('Erro ao buscar estatísticas de integridade:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar estatísticas',
        details: error.message,
      });
    }
  }

  /**
   * Stream SSE de logs em tempo real de uma fila
   * GET /api/analysis/queue-logs-stream/:queueName
   */
  async streamQueueLogs(req: Request, res: Response) {
    try {
      const { queueName } = req.params;

      // Validar nome da fila
      const validQueues = ['receita', 'normalization', 'geocoding', 'places', 'analysis', 'tipologia'];
      if (!validQueues.includes(queueName)) {
        return res.status(400).json({
          success: false,
          error: 'Fila inválida',
        });
      }

      // Adicionar cliente ao broadcaster SSE
      const clientId = sseLogBroadcaster.addClient(queueName, res);

      // Log da conexão
      console.log(`📡 Cliente ${clientId} conectado ao stream SSE da fila ${queueName}`);

      // Quando a conexão fechar, remover o cliente
      req.on('close', () => {
        console.log(`📡 Cliente ${clientId} desconectado do stream SSE da fila ${queueName}`);
      });
    } catch (error: any) {
      console.error('Erro ao iniciar stream SSE:', error);
      if (!res.headersSent) {
        return res.status(500).json({
          success: false,
          error: 'Erro ao iniciar stream de logs',
          details: error.message,
        });
      }
    }
  }

  /**
   * Obter estatísticas dos clientes SSE conectados
   * GET /api/analysis/sse-stats
   */
  async getSseStats(req: Request, res: Response) {
    try {
      const stats = sseLogBroadcaster.getStats();
      return res.json({
        success: true,
        stats,
        totalConnections: Object.values(stats).reduce((sum, count) => sum + count, 0),
      });
    } catch (error: any) {
      console.error('Erro ao buscar estatísticas SSE:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar estatísticas SSE',
        details: error.message,
      });
    }
  }

  /**
   * Iniciar classificação de tipologia PepsiCo
   * POST /api/analysis/start-tipologia
   * Query params:
   *   ?force=true para reprocessar
   *   ?scope=planilha para última planilha, ?scope=all para todos
   */
  async startTipologia(req: Request, res: Response) {
    try {
      const force = req.query.force === 'true' || (req.body?.force === true);
      const scope = (req.query.scope as string) || (req.body?.scope as string) || 'planilha';

      // Buscar última planilha se scope=planilha
      let planilhaFilter = {};
      if (scope === 'planilha') {
        const ultimaPlanilha = await prisma.planilha.findFirst({
          orderBy: { uploadedAt: 'desc' },
          select: { id: true, nomeArquivo: true },
        });
        if (!ultimaPlanilha) {
          return res.json({
            success: false,
            message: 'Nenhuma planilha encontrada',
            total: 0,
          });
        }
        planilhaFilter = { planilhaId: ultimaPlanilha.id };
        console.log(`📋 Processando planilha: ${ultimaPlanilha.nomeArquivo}`);
      }

      // Se force=true, reprocessar TODOS os clientes (do escopo selecionado)
      // Senão, só processar os sem tipologia
      // NOTA: Não exigimos mais status 'CONCLUIDO' - clientes sem fotos também serão classificados
      // (com confiança menor, mas ainda assim classificados)
      const whereClause = force
        ? {
            ...planilhaFilter,
            // Processar TODOS os clientes, independente do status
          }
        : {
            ...planilhaFilter,
            // Processar clientes sem tipologia, independente do status
            tipologia: null,
          };

      const clientesPendentes = await prisma.cliente.findMany({
        where: whereClause,
        select: {
          id: true,
          nome: true,
        },
      });

      if (clientesPendentes.length === 0) {
        return res.json({
          success: true,
          message: 'Nenhum cliente encontrado para classificação de tipologia',
          total: 0,
        });
      }

      // Limpar tipologia anterior se for force
      if (force) {
        await prisma.cliente.updateMany({
          where: { id: { in: clientesPendentes.map(c => c.id) } },
          data: {
            tipologia: null,
            subTipologia: null,
            tipologiaConfianca: null,
          },
        });
      }

      // Enfileirar jobs de tipologia
      console.log(`🏷️  Enfileirando ${clientesPendentes.length} clientes para classificação de tipologia (${scope})${force ? ' - REPROCESSAMENTO' : ''}`);

      const jobs = clientesPendentes.map(cliente => ({
        clienteId: cliente.id,
        nome: cliente.nome,
      }));

      // Adicionar jobs à fila de tipologia
      await Promise.all(
        jobs.map(job =>
          tipologiaQueue.add('classify-tipologia', job, {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          })
        )
      );

      const scopeLabel = scope === 'planilha' ? 'última planilha' : 'todos';

      return res.json({
        success: true,
        message: `${clientesPendentes.length} clientes enfileirados para classificação de tipologia (${scopeLabel})`,
        total: clientesPendentes.length,
        scope,
        reprocessamento: force,
      });
    } catch (error: any) {
      console.error('Erro ao iniciar classificação de tipologia:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao iniciar classificação de tipologia',
        details: error.message,
      });
    }
  }

  /**
   * Obter estatísticas de tipologia
   * GET /api/analysis/tipologia-stats
   */
  async getTipologiaStats(req: Request, res: Response) {
    try {
      // Contar total de clientes com tipologia
      const totalComTipologia = await prisma.cliente.count({
        where: { tipologia: { not: null } },
      });

      // Se não tem nenhum, retornar vazio
      if (totalComTipologia === 0) {
        return res.json({
          success: true,
          total: 0,
          mediaConfianca: 0,
        });
      }

      // Calcular média de confiança
      const result = await prisma.cliente.aggregate({
        where: {
          tipologia: { not: null },
          tipologiaConfianca: { not: null },
        },
        _avg: {
          tipologiaConfianca: true,
        },
      });

      return res.json({
        success: true,
        total: totalComTipologia,
        mediaConfianca: Math.round(result._avg.tipologiaConfianca || 0),
      });
    } catch (error: any) {
      console.error('Erro ao buscar estatísticas de tipologia:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao buscar estatísticas de tipologia',
        details: error.message,
      });
    }
  }

  /**
   * Resetar clientes travados em PROCESSANDO
   * POST /api/analysis/reset-stuck
   *
   * Clientes que ficaram com status PROCESSANDO por muito tempo (travados)
   * são resetados para PENDENTE para que possam ser reprocessados.
   */
  async resetStuckClients(req: Request, res: Response) {
    try {
      const { timeoutMinutes = 30 } = req.query;
      const timeout = parseInt(timeoutMinutes as string) || 30;
      const cutoffDate = new Date(Date.now() - timeout * 60 * 1000);

      // Buscar e resetar clientes travados em PROCESSANDO há mais de X minutos
      const [receitaReset, normalizacaoReset] = await Promise.all([
        // Reset Receita Federal
        prisma.cliente.updateMany({
          where: {
            receitaStatus: 'PROCESSANDO',
            receitaIniciadoEm: { lt: cutoffDate },
          },
          data: {
            receitaStatus: 'PENDENTE',
            receitaIniciadoEm: null,
          },
        }),
        // Reset Normalização (sem timestamp de início, usa apenas status)
        prisma.cliente.updateMany({
          where: {
            normalizacaoStatus: 'PROCESSANDO',
          },
          data: {
            normalizacaoStatus: 'PENDENTE',
          },
        }),
      ]);

      const totalReset = receitaReset.count + normalizacaoReset.count;

      console.log(`🔄 Reset de clientes travados: ${totalReset} clientes resetados`);
      console.log(`   - Receita Federal: ${receitaReset.count}`);
      console.log(`   - Normalização: ${normalizacaoReset.count}`);

      return res.json({
        success: true,
        message: `${totalReset} clientes resetados`,
        details: {
          receitaReset: receitaReset.count,
          normalizacaoReset: normalizacaoReset.count,
          timeoutMinutes: timeout,
        },
      });
    } catch (error: any) {
      console.error('Erro ao resetar clientes travados:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao resetar clientes travados',
        details: error.message,
      });
    }
  }

  /**
   * Forçar status de um cliente para FALHA (para resolver travamentos)
   * POST /api/analysis/force-fail/:clienteId
   */
  async forceFailClient(req: Request, res: Response) {
    try {
      const { clienteId } = req.params;
      const { pipeline } = req.body; // 'receita' ou 'normalizacao'

      if (!pipeline || !['receita', 'normalizacao'].includes(pipeline)) {
        return res.status(400).json({
          success: false,
          error: 'Pipeline inválido. Use "receita" ou "normalizacao"',
        });
      }

      const updateData = pipeline === 'receita'
        ? {
            receitaStatus: 'FALHA',
            receitaProcessadoEm: new Date(),
            receitaErro: 'Forçado manualmente via API',
          }
        : {
            normalizacaoStatus: 'FALHA',
            normalizacaoProcessadoEm: new Date(),
            normalizacaoErro: 'Forçado manualmente via API',
          };

      const cliente = await prisma.cliente.update({
        where: { id: clienteId },
        data: updateData,
        select: { id: true, nome: true },
      });

      console.log(`⚠️ Cliente ${cliente.nome} forçado para FALHA no pipeline ${pipeline}`);

      return res.json({
        success: true,
        message: `Cliente ${cliente.nome} forçado para FALHA`,
        clienteId: cliente.id,
        pipeline,
      });
    } catch (error: any) {
      console.error('Erro ao forçar falha:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao forçar falha',
        details: error.message,
      });
    }
  }

  /**
   * Marcar fotos de clientes com erro como analisadas (para desbloquear progresso)
   * POST /api/analysis/mark-error-photos-analyzed
   *
   * Quando um cliente fica com status ERRO, suas fotos não são marcadas como analisadas,
   * travando o progresso do pipeline. Este endpoint marca essas fotos como analisadas
   * (com resultado de erro) para desbloquear o progresso.
   */
  async markErrorPhotosAnalyzed(req: Request, res: Response) {
    try {
      // Buscar clientes com status ERRO que têm fotos não analisadas
      const clientesComErro = await prisma.cliente.findMany({
        where: {
          status: 'ERRO',
          fotos: {
            some: {
              analisadaPorIA: false,
            },
          },
        },
        select: {
          id: true,
          nome: true,
          fotos: {
            where: { analisadaPorIA: false },
            select: { id: true },
          },
        },
      });

      if (clientesComErro.length === 0) {
        return res.json({
          success: true,
          message: 'Nenhum cliente com erro e fotos pendentes encontrado',
          clientesProcessados: 0,
          fotosAtualizadas: 0,
        });
      }

      // Marcar todas as fotos desses clientes como analisadas com erro
      const fotoIds = clientesComErro.flatMap(c => c.fotos.map(f => f.id));

      const result = await prisma.foto.updateMany({
        where: {
          id: { in: fotoIds },
        },
        data: {
          analisadaPorIA: true,
          analiseResultado: JSON.stringify({
            success: false,
            error: 'Cliente com erro no processamento',
            marcadoManualmente: true,
          }),
          analiseEm: new Date(),
        },
      });

      console.log(`📸 Fotos de clientes com erro marcadas como analisadas:`);
      console.log(`   - Clientes: ${clientesComErro.length}`);
      console.log(`   - Fotos: ${result.count}`);

      return res.json({
        success: true,
        message: `${result.count} fotos de ${clientesComErro.length} clientes com erro marcadas como analisadas`,
        clientesProcessados: clientesComErro.length,
        fotosAtualizadas: result.count,
        clientes: clientesComErro.map(c => ({ id: c.id, nome: c.nome, fotos: c.fotos.length })),
      });
    } catch (error: any) {
      console.error('Erro ao marcar fotos de clientes com erro:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao marcar fotos de clientes com erro',
        details: error.message,
      });
    }
  }

  /**
   * Desbloquear pipelines travados
   * POST /api/analysis/unlock-pipelines
   *
   * Executa todas as correções necessárias para desbloquear pipelines travados:
   * 1. Marca fotos de clientes com erro/PROCESSANDO como analisadas
   * 2. Atualiza clientes com todas as fotos analisadas para status CONCLUIDO
   */
  async unlockPipelines(req: Request, res: Response) {
    try {
      console.log(`\n🔓 ===== DESBLOQUEANDO PIPELINES TRAVADOS =====`);

      // PASSO 1: Marcar fotos de clientes com erro/PROCESSANDO como analisadas
      const clientesTravados = await prisma.cliente.findMany({
        where: {
          OR: [
            { status: 'ERRO' },
            { status: 'PROCESSANDO' },
          ],
          fotos: {
            some: {
              analisadaPorIA: false,
            },
          },
        },
        select: {
          id: true,
          nome: true,
          status: true,
          fotos: {
            where: { analisadaPorIA: false },
            select: { id: true },
          },
        },
      });

      let fotosAtualizadas = 0;
      if (clientesTravados.length > 0) {
        const fotoIds = clientesTravados.flatMap(c => c.fotos.map(f => f.id));

        const resultFotos = await prisma.foto.updateMany({
          where: { id: { in: fotoIds } },
          data: {
            analisadaPorIA: true,
            analiseResultado: JSON.stringify({
              success: false,
              error: 'Cliente travado - marcado automaticamente',
              marcadoAutomaticamente: true,
            }),
            analiseEm: new Date(),
          },
        });
        fotosAtualizadas = resultFotos.count;
        console.log(`📸 ${fotosAtualizadas} fotos de ${clientesTravados.length} clientes travados marcadas como analisadas`);
      }

      // PASSO 2: Atualizar status de clientes com todas as fotos analisadas para CONCLUIDO
      // Buscar clientes que têm fotos e todas estão analisadas mas status não é CONCLUIDO
      const clientesParaConcluir = await prisma.cliente.findMany({
        where: {
          status: { not: 'CONCLUIDO' },
          fotos: {
            some: {}, // Tem pelo menos uma foto
          },
        },
        select: {
          id: true,
          nome: true,
          status: true,
          fotos: {
            select: { analisadaPorIA: true },
          },
        },
      });

      // Filtrar apenas os que têm todas as fotos analisadas
      const clientesProntos = clientesParaConcluir.filter(c =>
        c.fotos.length > 0 && c.fotos.every(f => f.analisadaPorIA)
      );

      let clientesConcluidos = 0;
      if (clientesProntos.length > 0) {
        const resultClientes = await prisma.cliente.updateMany({
          where: { id: { in: clientesProntos.map(c => c.id) } },
          data: { status: 'CONCLUIDO' },
        });
        clientesConcluidos = resultClientes.count;
        console.log(`✅ ${clientesConcluidos} clientes atualizados para status CONCLUIDO`);
      }

      // PASSO 3: Estatísticas finais
      const [totalClientes, concluidos, comTipologia, semTipologiaConcluidos] = await Promise.all([
        prisma.cliente.count(),
        prisma.cliente.count({ where: { status: 'CONCLUIDO' } }),
        prisma.cliente.count({ where: { tipologia: { not: null } } }),
        prisma.cliente.count({ where: { status: 'CONCLUIDO', tipologia: null } }),
      ]);

      console.log(`\n📊 Estatísticas após desbloqueio:`);
      console.log(`   - Total clientes: ${totalClientes}`);
      console.log(`   - Concluídos: ${concluidos}`);
      console.log(`   - Com tipologia: ${comTipologia}`);
      console.log(`   - Prontos para tipologia: ${semTipologiaConcluidos}`);
      console.log(`======================================\n`);

      return res.json({
        success: true,
        message: 'Pipelines desbloqueados com sucesso',
        correcoes: {
          fotosAtualizadas,
          clientesTravadosCorrigidos: clientesTravados.length,
          clientesMarcadosConcluidos: clientesConcluidos,
        },
        estatisticas: {
          totalClientes,
          concluidos,
          comTipologia,
          prontosParaTipologia: semTipologiaConcluidos,
        },
      });
    } catch (error: any) {
      console.error('Erro ao desbloquear pipelines:', error);
      return res.status(500).json({
        success: false,
        error: 'Erro ao desbloquear pipelines',
        details: error.message,
      });
    }
  }
}

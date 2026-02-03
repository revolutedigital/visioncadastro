import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { analysisQueue, tipologiaQueue } from '../queues/queue.config';
import { ClaudeService } from '../services/claude.service';
import { ScoringService } from '../services/scoring.service';
import { AnalysisCacheService } from '../services/analysis-cache.service';
import { PhotoClassifierService } from '../services/photo-classifier.service';
import { PromptVersionService } from '../services/prompt-version.service';
import { calculateFileHash } from '../utils/hash.utils';
import { universalConfidenceService } from '../services/universal-confidence.service';
import { nomeFantasiaCrossValidationService } from '../services/nome-fantasia-cross-validation.service';
import * as path from 'path';

const prisma = new PrismaClient();
const claudeService = new ClaudeService();
const scoringService = new ScoringService();
const analysisCacheService = new AnalysisCacheService();
const photoClassifier = new PhotoClassifierService();
const promptVersionService = new PromptVersionService();

interface AnalysisJobData {
  clienteId: string;
  mode?: 'single' | 'batch'; // single: analisa foto por foto, batch: análise consolidada
  loteId?: string;
}

/**
 * Worker para processar análise de fotos com Claude Vision
 */
analysisQueue.process(1, async (job: Job<AnalysisJobData>) => {
  const { clienteId, mode = 'batch', loteId } = job.data;

  console.log(`🔄 Processando análise de IA do cliente: ${clienteId} (modo: ${mode})`);

  try {
    // 🎯 Variáveis para Vision AI (escopo global da função)
    let universalConfidence: any = null;

    // Buscar cliente com fotos
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      include: {
        fotos: {
          where: { analisadaPorIA: false }, // Apenas fotos não analisadas
          orderBy: { ordem: 'asc' },
        },
      },
    });

    if (!cliente) {
      throw new Error('Cliente não encontrado');
    }

    if (cliente.fotos.length === 0) {
      console.log(`ℹ️  Cliente ${cliente.nome} não tem fotos para analisar`);
      return {
        success: true,
        clienteId,
        nome: cliente.nome,
        message: 'Nenhuma foto para analisar',
      };
    }

    console.log(`📸 ${cliente.fotos.length} fotos encontradas para ${cliente.nome}`);

    // ==================== SPRINT 3: PRÉ-PROCESSAMENTO ====================

    // 1. Calcular hash de fotos e buscar cache (skip se arquivo não existe localmente)
    console.log(`🔐 Verificando hashes das fotos...`);
    const photosDir = process.env.PHOTOS_DIR || path.join(__dirname, '../../uploads/fotos');
    const fotosComHash = await Promise.all(
      cliente.fotos.map(async (foto) => {
        if (foto.fileHash) {
          return foto; // Já tem hash
        }

        try {
          const photoPath = path.join(photosDir, foto.fileName);
          const hash = await calculateFileHash(photoPath);
          await prisma.foto.update({
            where: { id: foto.id },
            data: { fileHash: hash },
          });
          return { ...foto, fileHash: hash };
        } catch (error: any) {
          // Arquivo não existe localmente - será buscado do Google na análise
          console.log(`ℹ️  Hash não calculado (arquivo local ausente): ${foto.fileName}`);
          return foto;
        }
      })
    );

    // 2. Pré-classificar fotos (fachada vs interior) - skip se arquivo não existe
    console.log(`🏗️  Classificando fotos (fachada vs interior)...`);
    const fotosClassificadas = await Promise.all(
      fotosComHash.map(async (foto) => {
        if (foto.photoCategory) {
          return foto; // Já classificada
        }

        try {
          const photoPath = path.join(photosDir, foto.fileName);
          const classification = await photoClassifier.classifyPhoto(photoPath, foto.photoReference);
          await prisma.foto.update({
            where: { id: foto.id },
            data: {
              photoCategory: classification.category,
              photoCategoryConfidence: classification.confidence,
            },
          });
          return { ...foto, ...classification };
        } catch (error: any) {
          // Se falhar, assumir como 'facade' para não bloquear análise
          console.log(`ℹ️  Classificação padrão (fachada) para: ${foto.fileName}`);
          return { ...foto, photoCategory: 'facade', photoCategoryConfidence: 50 };
        }
      })
    );

    // 3. Filtrar apenas fotos de fachada para análise principal
    const facadePhotos = fotosClassificadas.filter(
      (f) => f.photoCategory === 'facade' && (f.photoCategoryConfidence || 0) >= 70
    );

    console.log(
      `✅ Pré-processamento: ${facadePhotos.length}/${fotosClassificadas.length} fotos de fachada`
    );

    // Se não tiver fotos de fachada, usar todas
    const fotosParaAnalisar = facadePhotos.length > 0 ? facadePhotos : fotosClassificadas;

    // 4. Verificar cache de análises (por hash)
    const cachedAnalyses = new Map<string, any>();
    for (const foto of fotosParaAnalisar) {
      if (foto.fileHash) {
        const cached = await analysisCacheService.get(foto.fileHash);
        if (cached) {
          cachedAnalyses.set(foto.id, cached);
        }
      }
    }

    console.log(`💾 Cache: ${cachedAnalyses.size}/${fotosParaAnalisar.length} análises cacheadas`);

    // ==================== FIM PRÉ-PROCESSAMENTO ====================

    // Step 5: Apenas análise visual - SEM tipologia/confiança (será feita no Step 6)
    let analiseGeral = '';
    let resumoFotos = '';

    if (mode === 'single') {
      // Modo: Analisar cada foto individualmente
      for (const foto of cliente.fotos) {
        console.log(`🤖 Analisando foto ${foto.fileName}...`);

        const resultado = await claudeService.analyzeSinglePhoto(
          foto.fileName,
          cliente.nome,
          cliente.endereco,
          foto.photoReference // Buscar do Google se arquivo local não existir
        );

        if (resultado.success) {
          // Salvar resultado da análise na foto
          await prisma.foto.update({
            where: { id: foto.id },
            data: {
              analisadaPorIA: true,
              analiseResultado: JSON.stringify(resultado),
              analiseEm: new Date(),
            },
          });

          console.log(`✅ Foto ${foto.fileName} analisada`);
        } else {
          console.warn(`⚠️  Falha ao analisar ${foto.fileName}: ${resultado.error}`);
        }

        // Delay de 1s entre análises para não sobrecarregar API
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      analiseGeral = `Análise individual de ${cliente.fotos.length} fotos concluída`;
    } else {
      // Modo: Análise consolidada (batch)
      // Passar fileName + photoReference para buscar do Google se necessário
      const fotosParaBatch = cliente.fotos.map((f) => ({
        fileName: f.fileName,
        photoReference: f.photoReference,
      }));

      console.log(`🤖 Análise consolidada de ${fotosParaBatch.length} fotos...`);

      const resultadoBatch = await claudeService.analyzeMultiplePhotos(
        fotosParaBatch,
        cliente.nome,
        cliente.endereco
      );

      if (resultadoBatch.success) {
        analiseGeral = resultadoBatch.analiseGeral || '';
        resumoFotos = resultadoBatch.resumoFotos || '';

        // Marcar todas as fotos como analisadas
        await prisma.foto.updateMany({
          where: {
            id: { in: cliente.fotos.map((f) => f.id) },
          },
          data: {
            analisadaPorIA: true,
            analiseResultado: JSON.stringify(resultadoBatch),
            analiseEm: new Date(),
          },
        });

        console.log(`✅ Análise consolidada concluída`);
      } else {
        // Verificar se é erro de formato de imagem inválido
        if (resultadoBatch.error && resultadoBatch.error.includes('Image does not match the provided media type')) {
          console.warn(`⚠️  Imagens com formato inválido detectadas. Marcando fotos como inválidas...`);

          // Marcar todas as fotos como analisadas com erro de formato
          await prisma.foto.updateMany({
            where: {
              id: { in: cliente.fotos.map((f) => f.id) },
            },
            data: {
              analisadaPorIA: true,
              analiseResultado: JSON.stringify({
                success: false,
                error: 'Formato de imagem inválido ou corrompido',
                invalidFormat: true
              }),
              analiseEm: new Date(),
            },
          });

          // Marcar cliente como concluído (mesmo com fotos inválidas)
          await prisma.cliente.update({
            where: { id: clienteId },
            data: {
              status: 'CONCLUIDO',
            },
          });

          console.log(`✅ Cliente marcado como concluído (fotos com formato inválido)`);

          return {
            success: true,
            clienteId,
            nome: cliente.nome,
            message: 'Concluído com fotos de formato inválido',
            fotosInvalidas: cliente.fotos.length,
          };
        }

        throw new Error(resultadoBatch.error || 'Falha na análise batch');
      }
    }

    // Buscar análises de todas as fotos para gerar relatório
    const fotosAnalisadas = await prisma.foto.findMany({
      where: {
        clienteId,
        analisadaPorIA: true,
      },
      orderBy: { ordem: 'asc' },
    });

    const analisesFotos = fotosAnalisadas
      .map((foto) => {
        if (!foto.analiseResultado) return null;
        try {
          return JSON.parse(foto.analiseResultado);
        } catch {
          return null;
        }
      })
      .filter((a) => a !== null);

    // Gerar relatório final
    console.log(`📝 Gerando relatório final para ${cliente.nome}...`);

    const relatorioResult = await claudeService.generateClientReport(
      cliente.nome,
      {
        endereco: cliente.endereco,
        tipoEstabelecimento: cliente.tipoEstabelecimento || undefined,
        rating: cliente.rating || undefined,
        totalAvaliacoes: cliente.totalAvaliacoes || undefined,
        potencialCategoria: cliente.potencialCategoria || undefined,
      },
      analisesFotos,
      mode === 'batch'
        ? {
            success: true,
            analiseGeral,
            resumoFotos,
          }
        : undefined
    );

    let relatorioFinal = '';
    if (relatorioResult.success && relatorioResult.relatorio) {
      relatorioFinal = relatorioResult.relatorio;
      console.log(`✅ Relatório gerado com sucesso`);
    }

    // Recalcular scoring com análise de IA completa
    const clienteAtualizado = await prisma.cliente.findUnique({
      where: { id: clienteId },
      include: {
        fotos: true,
      },
    });

    if (clienteAtualizado) {
      const enhancedScoring = scoringService.calculateEnhancedScoring({
        rating: clienteAtualizado.rating ?? undefined,
        totalAvaliacoes: clienteAtualizado.totalAvaliacoes ?? undefined,
        horarioFuncionamento: clienteAtualizado.horarioFuncionamento ?? undefined,
        website: clienteAtualizado.websitePlace ?? undefined,
        totalFotos: clienteAtualizado.fotos.length,
        fotosAnalisadas: fotosAnalisadas.length,
        analiseIA: analisesFotos[0], // Usar primeira análise como referência
      });

      console.log(
        `📊 Scoring recalculado após IA - Total: ${enhancedScoring.scoreTotal}/70 (${enhancedScoring.categoria})`
      );

      // Extrair dados visuais Sprint 2 + Tipologia PepsiCo da primeira análise bem-sucedida
      const primeiraAnalise = analisesFotos.find((a) => a.success);

      // Se modo batch, usar dados do batch; senão, usar da primeira análise individual
      let visualData: any = {};

      if (mode === 'batch' && analisesFotos.length > 0) {
        const analise = analisesFotos[0];

        // Dados visuais
        visualData = {
          qualidadeSinalizacao: analise.qualidadeSinalizacao || null,
          presencaBranding: analise.presencaBranding ?? false,
          nivelProfissionalizacao: analise.nivelProfissionalizacao || null,
          publicoAlvo: analise.publicoAlvo || null,
          ambienteEstabelecimento: analise.ambienteEstabelecimento || null,
          indicadoresVisuais: analise.indicadoresVisuais
            ? JSON.stringify(analise.indicadoresVisuais)
            : null,
        };

        // 🎯 SEPARAÇÃO: Tipologia agora é classificada por worker separado
        console.log(`📸 Análise visual concluída - tipologia será classificada em etapa separada`);
      } else if (primeiraAnalise) {
        // Dados visuais
        visualData = {
          qualidadeSinalizacao: primeiraAnalise.qualidadeSinalizacao || null,
          presencaBranding: primeiraAnalise.presencaBranding ?? false,
          nivelProfissionalizacao: primeiraAnalise.nivelProfissionalizacao || null,
          publicoAlvo: primeiraAnalise.publicoAlvo || null,
          ambienteEstabelecimento: primeiraAnalise.ambienteEstabelecimento || null,
          indicadoresVisuais: primeiraAnalise.indicadoresVisuais
            ? JSON.stringify(primeiraAnalise.indicadoresVisuais)
            : null,
        };
      }

      // ==================== SPRINT 3: VALIDAÇÃO CRUZADA ====================

      // 🎯 SEPARAÇÃO: Validação de tipologia agora ocorre no worker separado
      let promptVersion = 'v1.0.0'; // Default

      // 2. Cachear análise para fotos não cacheadas
      for (const foto of fotosAnalisadas) {
        if (foto.fileHash && !cachedAnalyses.has(foto.id) && foto.analiseResultado) {
          try {
            const analise = JSON.parse(foto.analiseResultado);
            if (analise.tipologiaPepsiCo) {
              await analysisCacheService.set(
                foto.fileHash,
                {
                  tipologia: analise.tipologiaPepsiCo,
                  tipologiaNome: analise.tipologiaNome || '',
                  confianca: analise.confianca || 0,
                  detalhes: analise,
                },
                promptVersion,
                'claude-3-5-sonnet-20241022'
              );
            }
          } catch (e) {
            // Ignorar erro de cache
          }
        }
      }

      // ==================== FIM VALIDAÇÃO CRUZADA ====================

      // ==================== SPRINT 4: VISION AI - UNIVERSAL CONFIDENCE ====================
      console.log(`\n🎯 ===== VISION AI - CONFIANÇA UNIVERSAL =====`);

      // VISION AI: Nome Fantasia Cross Validation
      const nomeFantasiaValidation = await nomeFantasiaCrossValidationService.validateNomeFantasia(
        cliente.nome,
        cliente.nomeFantasia,
        cliente.tipoEstabelecimento // Nome do Google Places
      );

      // Log detalhado
      nomeFantasiaCrossValidationService.logCrossValidation(nomeFantasiaValidation);

      const nomeFantasiaMatch = nomeFantasiaValidation.confianca;

      // Calcular Universal Confidence
      universalConfidence = universalConfidenceService.calculateUniversalConfidence({
        geocodingValidation: cliente.geocodingConfianca ? {
          confianca: cliente.geocodingConfianca,
          fonteUsada: (cliente.geocodingFonte || 'google') as any,
          coordenadasFinais: { lat: cliente.latitude || 0, lng: cliente.longitude || 0 },
          detalhes: {
            distanciaMaxima: cliente.geocodingDivergenciaMaxima || 0,
            divergencias: cliente.geocodingDivergencias ? JSON.parse(cliente.geocodingDivergencias) : [],
          }
        } : undefined,
        normalizationValidation: cliente.normalizacaoConfianca ? {
          confianca: cliente.normalizacaoConfianca,
          fonteUsada: (cliente.normalizacaoFonte || 'regex') as any,
          enderecoFinal: cliente.enderecoNormalizado || '',
          detalhes: {
            similaridade: cliente.normalizacaoSimilaridade || 0,
            alucinacaoDetectada: cliente.normalizacaoAlucinacao || false,
            iaResultado: undefined,
            regexResultado: cliente.enderecoNormalizado || '',
            divergencias: [],
          }
        } : undefined,
        placesValidation: cliente.crossValidationConfianca ? {
          confianca: cliente.crossValidationConfianca,
          usarResultado: (cliente.crossValidationMetodo || 'nearby') as any,
          motivoEscolha: '',
          detalhes: {
            nearbyPlaceId: cliente.nearbyPlaceId || '',
            textPlaceId: cliente.textPlaceId || '',
            placeIdMatch: false,
            nomeSimilaridade: 0,
            enderecoSimilaridade: 0,
            divergencias: cliente.crossValidationDivergencias ? JSON.parse(cliente.crossValidationDivergencias) : [],
          },
        } : undefined,
        receitaFederalEncontrado: cliente.receitaStatus === 'SUCESSO',
        receitaFederalAtivo: cliente.situacaoReceita === 'ATIVA',
        nomeFantasiaMatch,
      });

      // Log detalhado
      universalConfidenceService.logUniversalConfidence(universalConfidence, cliente.nome);

      // Atualizar cliente com resultados da análise + scoring + Sprint 2 + Sprint 3 + Sprint 4
      await prisma.cliente.update({
        where: { id: clienteId },
        data: {
          status: 'CONCLUIDO',
          // Step 5 completo - tipologia será classificada no Step 6
          enrichmentStatus: 'CONCLUIDO',
          // Atualizar scoring com dados de IA
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
          // Sprint 2: Visual Analysis
          ...visualData,
          // 🎯 SEPARAÇÃO: Tipologia será classificada por worker separado após análise visual
          analysisPromptVersion: promptVersion,
          // Sprint 4: Vision AI - Universal Confidence
          confiancaGeral: universalConfidence.confiancaGeral,
          confianciaCategoria: universalConfidence.categoria,
          confiancaNivel: universalConfidence.nivel,
          necessitaRevisao: universalConfidence.necessitaRevisao,
          alertasVisionAI: JSON.stringify(universalConfidence.alertas),
          recomendacoesVisionAI: JSON.stringify(universalConfidence.recomendacoes),
        },
      });
    }

    console.log(`✅ Análise de IA concluída para ${cliente.nome}`);

    // Atualizar processamento em lote (incrementar sucesso)
    if (loteId) {
      await prisma.processamentoLote.update({
        where: { id: loteId },
        data: {
          processados: { increment: 1 },
          sucesso: { increment: 1 },
        },
      });
    }

    // 🦅 ENCADEAR AUTOMATICAMENTE para Arca Analyst
    // Só encadeia se o cliente ainda não foi processado pelo Arca
    const clienteParaArca = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { arcaStatus: true, tipologia: true },
    });

    if (!clienteParaArca?.arcaStatus && !clienteParaArca?.tipologia) {
      console.log(`🦅 Encadeando cliente ${clienteId} para Arca Analyst...`);
      await tipologiaQueue.add(
        'classify-tipologia',
        { clienteId, loteId },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          delay: 1000, // Pequeno delay para não sobrecarregar
        }
      );
    }

    return {
      success: true,
      clienteId,
      nome: cliente.nome,
      mode,
      fotosAnalisadas: cliente.fotos.length,
      analiseGeral,
      relatorio: relatorioFinal,
      // 🎯 VISION AI: Retornar confiança geral para SSE
      confiancaGeral: universalConfidence?.confiancaGeral || 0,
      confianciaCategoria: universalConfidence?.categoria || 'N/A',
    };
  } catch (error: any) {
    console.error(`❌ Erro ao processar análise de IA:`, error);

    // Atualizar cliente com erro
    try {
      await prisma.cliente.update({
        where: { id: clienteId },
        data: {
          status: 'ERRO',
        },
      });

      // Atualizar processamento em lote (incrementar falha)
      if (loteId) {
        await prisma.processamentoLote.update({
          where: { id: loteId },
          data: {
            processados: { increment: 1 },
            falhas: { increment: 1 },
          },
        });
      }
    } catch (updateError) {
      console.error('Erro ao atualizar status do cliente:', updateError);
    }

    throw error; // Re-throw para o Bull fazer retry
  }
});

console.log('👷 Worker de Análise de IA iniciado');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Encerrando worker de análise...');
  await analysisQueue.close();
  await prisma.$disconnect();
  process.exit(0);
});

export default analysisQueue;

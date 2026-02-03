import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { placesQueue } from '../queues/queue.config';
import { PlacesService } from '../services/places.service';
import { ScoringService } from '../services/scoring.service';
import { fuzzyMatchingService } from '../services/fuzzy-matching.service';
import { alertingService } from '../services/alerting.service';
import { crossValidationService } from '../services/cross-validation.service';

const prisma = new PrismaClient();
const placesService = new PlacesService();
const scoringService = new ScoringService();

interface PlacesJobData {
  clienteId: string;
  loteId?: string;
}

/**
 * Worker para processar busca de informações no Google Places
 */
// Concurrency 3 = busca 3 lugares em paralelo (Google Places limit)
placesQueue.process(3, async (job: Job<PlacesJobData>) => {
  const { clienteId, loteId } = job.data;

  console.log(`🔄 Processando Google Places do cliente: ${clienteId}`);

  try {
    // Buscar cliente no banco
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
    });

    if (!cliente) {
      throw new Error('Cliente não encontrado');
    }

    // Atualizar status para PROCESSANDO
    await prisma.cliente.update({
      where: { id: clienteId },
      data: { placesStatus: 'PROCESSANDO' },
    });

    // Usar nome fantasia (se disponível), senão usar nome original
    const nomeParaBusca = cliente.nomeFantasia || cliente.nome;

    console.log(`🔍 Buscando no Google Places: ${nomeParaBusca}`);
    if (cliente.nomeFantasia) {
      console.log(`   🏢 Usando nome fantasia da Receita para melhor precisão`);
    }

    // 🎯 VALIDAÇÃO CRUZADA: Executar AMBAS as buscas (Nearby + Text)
    console.log(`\n🔍 ===== INICIANDO VALIDAÇÃO CRUZADA =====`);

    let nearbyResultado: any = null;
    let textResultado: any = null;

    // BUSCA 1: Nearby Search (coordenadas - mais preciso)
    if (cliente.latitude && cliente.longitude) {
      console.log(`📍 [1/2] Nearby Search com coordenadas (${cliente.latitude}, ${cliente.longitude})`);

      nearbyResultado = await placesService.searchPlace(
        cliente.placeId || undefined,
        cliente.latitude,
        cliente.longitude,
        nomeParaBusca
      );

      if (nearbyResultado.success) {
        console.log(`   ✅ Nearby encontrou: ${nearbyResultado.place?.nome}`);
      } else {
        console.warn(`   ❌ Nearby falhou: ${nearbyResultado.error}`);
      }
    } else {
      console.warn(`   ⚠️  Sem coordenadas - Nearby Search pulado`);
    }

    // BUSCA 2: Text Search (texto - menos preciso mas valida Nearby)
    const enderecoParaQuery = cliente.enderecoNormalizado || cliente.enderecoReceita || cliente.endereco;
    const query = `${nomeParaBusca}, ${enderecoParaQuery}, ${cliente.cidade || ''}, ${cliente.estado || ''}`.trim();

    console.log(`🔍 [2/2] Text Search: "${query}"`);

    textResultado = await placesService.textSearch(query);

    if (textResultado.success) {
      console.log(`   ✅ Text encontrou: ${textResultado.place?.nome}`);
    } else {
      console.warn(`   ❌ Text falhou: ${textResultado.error}`);
    }

    // VALIDAÇÃO CRUZADA: Comparar resultados
    const crossValidation = crossValidationService.validateCrossResults(
      nearbyResultado?.success ? nearbyResultado.place : null,
      textResultado?.success ? textResultado.place : null
    );

    if (!crossValidation) {
      console.error(`❌ Ambas as buscas falharam - nenhum Place encontrado`);
      throw new Error('Nenhum Place encontrado (Nearby e Text falharam)');
    }

    // Exibir resultado da validação cruzada
    crossValidationService.logCrossValidation(crossValidation);

    // Decidir qual resultado usar
    let resultado: any;
    if (crossValidation.usarResultado === 'nearby' || crossValidation.usarResultado === 'ambos_iguais') {
      resultado = nearbyResultado;
    } else {
      resultado = textResultado;
    }

    if (resultado.success && resultado.place) {
      const place = resultado.place;

      // 🎯 VISION AI: Detectar se Place é endereço genérico ou estabelecimento nomeado
      const placeNome = place.nome || '';
      const isEnderecoGenerico = placeNome.match(/^(Rua|Avenida|R\.|Av\.|Estrada|Rod\.|Rodovia)/i);

      // 🎯 VISION AI: Ajustar thresholds baseado no tipo de Place encontrado
      let nomeThreshold = 80; // Default rigoroso
      let enderecoThreshold = 70; // Default rigoroso

      if (crossValidation.usarResultado === 'text' && !isEnderecoGenerico) {
        // Text Search encontrou estabelecimento COM nome comercial
        // Relaxar thresholds porque pode ser nome fantasia vs razão social
        nomeThreshold = 50; // REDUZIDO de 60% para 50%
        enderecoThreshold = 60; // REDUZIDO de 65% para 60%
        console.log(`📊 Text Search encontrou estabelecimento nomeado - thresholds reduzidos (50%/60%)`);
      } else if (crossValidation.usarResultado === 'nearby' && !isEnderecoGenerico) {
        // Nearby também encontrou estabelecimento nomeado
        nomeThreshold = 55; // Um pouco mais rigoroso que Text
        enderecoThreshold = 65;
        console.log(`📊 Nearby encontrou estabelecimento nomeado - thresholds ajustados (55%/65%)`);
      } else if (isEnderecoGenerico) {
        // Place é só endereço (não é estabelecimento comercial)
        // Manter rigoroso para evitar aceitar endereços errados
        console.warn(`⚠️  Place parece ser endereço genérico: "${placeNome}"`);
      }

      // SPRINT 1: Validar com fuzzy matching se o Place encontrado é realmente do cliente
      // CALIBRADO: Thresholds dinâmicos baseados no tipo de Place
      const nomeValidacao = fuzzyMatchingService.validatePlaceName(
        cliente.nome,
        cliente.nomeFantasia,
        placeNome,
        nomeThreshold
      );

      const enderecoFormatadoPlace = place.endereco || '';

      // PRIORIDADE: enderecoNormalizado (IA, sem abreviações) > enderecoReceita > endereco (CSV)
      const enderecoParaValidacao = cliente.enderecoNormalizado || cliente.enderecoReceita || cliente.endereco;
      const enderecoFallback = cliente.enderecoReceita || cliente.endereco;

      // Log para debug: mostrar qual endereço está sendo usado
      const enderecoFonte = cliente.enderecoNormalizado
        ? '📝 Normalizado (IA)'
        : cliente.enderecoReceita
          ? '🏛️ Receita Federal'
          : '📄 CSV';

      console.log(`   Validando endereço: ${enderecoFonte}`);
      console.log(`   Cliente: ${enderecoParaValidacao}`);
      console.log(`   Place: ${enderecoFormatadoPlace}`);
      console.log(`   Thresholds: Nome ${nomeThreshold}%, Endereço ${enderecoThreshold}%`);

      const enderecoValidacao = fuzzyMatchingService.validatePlaceAddress(
        enderecoParaValidacao,
        enderecoFallback,
        enderecoFormatadoPlace,
        enderecoThreshold
      );

      // 🎯 VISION AI: Lógica de rejeição inteligente HÍBRIDA
      // Estratégia: Aceitar se ENDEREÇO muito bom (≥70%) mesmo com nome fraco (≥45%)
      let deveRejeitar = false;
      let motivoRejeicao = '';
      let aceitoPorEnderecoAlto = false;

      // 🎯 EXCEÇÃO HÍBRIDA: Se endereço bate muito bem, aceitar mesmo com nome mais fraco
      if (!nomeValidacao.valid && !enderecoValidacao.valid) {
        // Ambos falharam nos thresholds normais

        // MAS: Se endereço ≥68% E nome ≥45%, ACEITAR! (ajustado de 70% para 68%)
        if (enderecoValidacao.similarity >= 68 && nomeValidacao.similarity >= 45) {
          aceitoPorEnderecoAlto = true;
          console.log(`✅ [HÍBRIDO] Aceito por endereço alto: Nome ${nomeValidacao.similarity}%, Endereço ${enderecoValidacao.similarity}%`);
          console.log(`   Endereço confirma localização mesmo com nome diferente`);
        } else {
          deveRejeitar = true;
          motivoRejeicao = `Nome (${nomeValidacao.similarity}%) e Endereço (${enderecoValidacao.similarity}%) abaixo dos thresholds (${nomeThreshold}%/${enderecoThreshold}%)`;
        }
      } else if (isEnderecoGenerico && nomeValidacao.similarity < 50) {
        // Place é só endereço genérico e nome não bate
        // Mas aplicar exceção híbrida também aqui
        if (enderecoValidacao.similarity >= 68) {
          aceitoPorEnderecoAlto = true;
          console.log(`✅ [HÍBRIDO] Endereço genérico aceito por endereço ≥68%: ${enderecoValidacao.similarity}%`);
        } else {
          deveRejeitar = true;
          motivoRejeicao = `Place é endereço genérico "${placeNome}" e nome muito diferente (${nomeValidacao.similarity}%)`;
        }
      }

      if (deveRejeitar) {
        console.error(`❌ PLACE REJEITADO: ${motivoRejeicao}`);
        console.error(`   Cliente: ${cliente.nome} - ${cliente.endereco}`);
        console.error(`   Place: ${placeNome} - ${enderecoFormatadoPlace}`);

        // Marcar como falha e NÃO salvar este Place
        await prisma.cliente.update({
          where: { id: clienteId },
          data: {
            placesStatus: 'FALHA',
            placesErro: `Place rejeitado: ${motivoRejeicao}`,
          },
        });

        await alertingService.alertarPlaceNaoConfere(
          clienteId,
          cliente.nome,
          placeNome,
          nomeValidacao.similarity
        );

        return { success: false, error: 'Place validation failed' };
      }

      // SPRINT 1: Logging da validação + Sistema de Alertas
      if (!nomeValidacao.valid) {
        console.warn(
          `⚠️  ALERTA: Nome do Place não confere com cliente (${nomeValidacao.similarity}% similar) - mas ENDEREÇO OK (${enderecoValidacao.similarity}%)`
        );
        console.warn(`   Cliente: ${cliente.nome}`);
        console.warn(`   Place: ${place.nome}`);

        // Disparar alerta estruturado
        await alertingService.alertarPlaceNaoConfere(
          clienteId,
          cliente.nome,
          place.nome || 'N/A',
          nomeValidacao.similarity
        );
      }

      if (!enderecoValidacao.valid) {
        console.warn(
          `⚠️  ALERTA: Endereço do Place não confere (${enderecoValidacao.similarity}% similar) - mas NOME OK (${nomeValidacao.similarity}%)`
        );
        console.warn(`   Cliente: ${cliente.endereco}`);
        console.warn(`   Place: ${enderecoFormatadoPlace}`);

        // Disparar alerta estruturado
        await alertingService.alertarEnderecoNaoConfere(
          clienteId,
          cliente.endereco,
          enderecoFormatadoPlace,
          enderecoValidacao.similarity
        );
      }

      if (nomeValidacao.valid && enderecoValidacao.valid) {
        console.log(
          `✅ Validação OK - Nome: ${nomeValidacao.similarity}%, Endereço: ${enderecoValidacao.similarity}%`
        );
      } else if (aceitoPorEnderecoAlto) {
        console.log(
          `✅ Validação HÍBRIDA - Aceito por endereço alto (≥70%): Nome ${nomeValidacao.similarity}%, Endereço ${enderecoValidacao.similarity}%`
        );
      }

      // Calcular potencial (método antigo para compatibilidade)
      const potencial = placesService.calculatePotential(
        place.rating,
        place.totalAvaliacoes
      );

      // Classificar tipo de estabelecimento
      const tipoEstabelecimento = placesService.classifyBusinessType(place.tipo);

      // Calcular scoring detalhado (Sprint 1)
      const totalFotos = place.fotos?.length || 0;
      const enhancedScoring = scoringService.calculateEnhancedScoring({
        rating: place.rating,
        totalAvaliacoes: place.totalAvaliacoes,
        horarioFuncionamento: place.horarioFuncionamento
          ? JSON.stringify(place.horarioFuncionamento)
          : undefined,
        website: place.website,
        totalFotos,
        fotosAnalisadas: 0, // Será atualizado após análise de IA
      });

      console.log(
        `📊 Scoring detalhado - Total: ${enhancedScoring.scoreTotal}/70 (${enhancedScoring.categoria})`
      );

      // Atualizar cliente com informações do Place + enhanced scoring + validações fuzzy
      await prisma.cliente.update({
        where: { id: clienteId },
        data: {
          placesStatus: 'SUCESSO',
          placesErro: null,
          placesProcessadoEm: new Date(),
          placeId: place.placeId,
          tipoEstabelecimento,
          rating: place.rating,
          totalAvaliacoes: place.totalAvaliacoes,
          horarioFuncionamento: place.horarioFuncionamento
            ? JSON.stringify(place.horarioFuncionamento)
            : null,
          telefonePlace: place.telefone,
          websitePlace: place.website,
          potencialScore: enhancedScoring.scoreTotal, // Usar novo scoring
          potencialCategoria: enhancedScoring.categoria,
          // Campos de scoring detalhado
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
          // Validação Cruzada (Nearby vs Text)
          crossValidationConfianca: crossValidation.confianca,
          crossValidationMetodo: crossValidation.usarResultado,
          crossValidationDivergencias: JSON.stringify(crossValidation.detalhes.divergencias),
          nearbyPlaceId: crossValidation.detalhes.nearbyPlaceId !== 'N/A' ? crossValidation.detalhes.nearbyPlaceId : null,
          textPlaceId: crossValidation.detalhes.textPlaceId !== 'N/A' ? crossValidation.detalhes.textPlaceId : null,
          // SPRINT 1: Validações fuzzy matching
          placeNomeValidado: nomeValidacao.valid,
          placeNomeSimilaridade: nomeValidacao.similarity,
          placeEnderecoValidado: enderecoValidacao.valid,
          placeEnderecoSimilaridade: enderecoValidacao.similarity,
          // SPRINT 2: Place Types & Photo References
          placeTypes: place.tipo ? JSON.stringify(place.tipo) : null,
          placeTypesPrimario: place.tipo && place.tipo.length > 0 ? place.tipo[0] : null,
          totalFotosDisponiveis: place.fotos?.length || 0,
          photoReferences: place.fotos ? JSON.stringify(place.fotos) : null,
        },
      });

      console.log(
        `✅ Cliente ${cliente.nome} - Places processado com sucesso (Potencial: ${potencial.categoria})`
      );

      // SPRINT 1: Alerta de baixo potencial digital
      await alertingService.alertarBaixoPotencial(
        clienteId,
        cliente.nome,
        place.rating ?? null,
        place.totalAvaliacoes ?? null
      );

      // Se houver fotos, fazer download
      if (place.fotos && place.fotos.length > 0) {
        console.log(`📸 Baixando ${place.fotos.length} fotos do cliente ${cliente.nome}`);

        const fotosPath = await placesService.downloadAllPhotos(
          place.fotos,
          clienteId
        );

        // Salvar fotos no banco
        for (let i = 0; i < fotosPath.length; i++) {
          await prisma.foto.create({
            data: {
              clienteId,
              fileName: fotosPath[i],
              photoReference: place.fotos[i],
              ordem: i,
            },
          });
        }

        console.log(`✅ ${fotosPath.length} fotos salvas para ${cliente.nome}`);
      } else {
        console.log(`ℹ️  Nenhuma foto disponível para ${cliente.nome}`);
      }

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

      return {
        success: true,
        clienteId,
        nome: cliente.nome,
        tipoEstabelecimento,
        potencial: potencial.categoria,
        totalFotos: place.fotos?.length || 0,
      };
    } else {
      // Falha na busca do Place
      await prisma.cliente.update({
        where: { id: clienteId },
        data: {
          placesStatus: 'FALHA',
          placesErro: resultado.error,
          placesProcessadoEm: new Date(),
        },
      });

      console.warn(`⚠️  Falha ao buscar Place de ${cliente.nome}: ${resultado.error}`);

      // SPRINT 1: Alerta de Place não encontrado
      if (cliente.latitude && cliente.longitude) {
        await alertingService.alertarPlaceNaoEncontrado(
          clienteId,
          cliente.nome,
          { lat: cliente.latitude, lng: cliente.longitude }
        );
      }

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

      return {
        success: false,
        clienteId,
        nome: cliente.nome,
        error: resultado.error,
      };
    }
  } catch (error: any) {
    console.error(`❌ Erro ao processar Google Places:`, error);

    // Atualizar cliente com erro
    try {
      await prisma.cliente.update({
        where: { id: clienteId },
        data: {
          placesStatus: 'FALHA',
          placesErro: error.message,
          placesProcessadoEm: new Date(),
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

console.log('👷 Worker de Google Places iniciado');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Encerrando worker Places...');
  await placesQueue.close();
  await prisma.$disconnect();
  process.exit(0);
});

export default placesQueue;

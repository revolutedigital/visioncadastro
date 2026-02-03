import { Job } from 'bull';
import { PrismaClient } from '@prisma/client';
import { geocodingQueue } from '../queues/queue.config';
import { GeocodingService } from '../services/geocoding.service';
import { geoValidationService } from '../services/geo-validation.service';
import { alertingService } from '../services/alerting.service';
import { nominatimService } from '../services/nominatim.service';
import { geocodingCrossValidationService } from '../services/geocoding-cross-validation.service';

const prisma = new PrismaClient();
const geocodingService = new GeocodingService();

interface GeocodingJobData {
  clienteId: string;
  loteId?: string;
}

/**
 * Worker para processar geocodificação de clientes
 */
// Concurrency 3 = geocodifica 3 endereços em paralelo (Google Maps limit)
geocodingQueue.process(3, async (job: Job<GeocodingJobData>) => {
  const { clienteId, loteId } = job.data;

  console.log(`🔄 Processando geocodificação do cliente: ${clienteId}`);

  try {
    // Buscar cliente no banco
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
    });

    if (!cliente) {
      throw new Error('Cliente não encontrado');
    }

    // Atualizar status para PROCESSANDO com timestamp
    await prisma.cliente.update({
      where: { id: clienteId },
      data: {
        geocodingStatus: 'PROCESSANDO',
        geocodingIniciadoEm: new Date(),
      },
    });

    // Usar dados normalizados (se disponíveis), senão usar originais
    const enderecoParaGeocodificar = cliente.enderecoNormalizado || cliente.endereco;
    const cidadeParaGeocodificar = cliente.cidadeNormalizada || cliente.cidade;
    const estadoParaGeocodificar = cliente.estadoNormalizado || cliente.estado;

    // Usar nome fantasia (se disponível), senão usar nome original
    const nomeParaBusca = cliente.nomeFantasia || cliente.nome;

    console.log(`📍 Geocodificando: ${enderecoParaGeocodificar}`);
    console.log(`🏙️  Cidade: ${cidadeParaGeocodificar}`);
    console.log(`🗺️  Estado: ${estadoParaGeocodificar}`);
    if (cliente.enderecoNormalizado) {
      console.log(`   ✨ Usando endereço normalizado com abreviações expandidas`);
    }
    if (cliente.cidadeNormalizada) {
      console.log(`   ✨ Usando cidade normalizada: ${cliente.cidade} → ${cliente.cidadeNormalizada}`);
    }
    if (cliente.nomeFantasia) {
      console.log(`   🏢 Usando nome fantasia da Receita: ${nomeParaBusca}`);
    }

    // 🎯 VISION AI - GEOCODING CROSS VALIDATION
    console.log(`\n🔍 ===== VISION AI - GEOCODING =====`);

    // FONTE 1: Google Geocoding (pago, preciso)
    console.log(`📍 [1/2] Google Geocoding...`);
    const googleResultado = await geocodingService.geocodeAddress(
      enderecoParaGeocodificar,
      cidadeParaGeocodificar || undefined,
      estadoParaGeocodificar || undefined,
      nomeParaBusca || undefined
    );

    let googleCoords = null;
    if (googleResultado.success && googleResultado.latitude && googleResultado.longitude) {
      googleCoords = {
        lat: googleResultado.latitude,
        lng: googleResultado.longitude,
      };
    }

    // FONTE 2: Nominatim (grátis, OpenStreetMap)
    console.log(`🌍 [2/2] Nominatim (OpenStreetMap)...`);
    let nominatimCoords = null;
    try {
      const nominatimResultado = await nominatimService.geocodeWithRetry(
        enderecoParaGeocodificar,
        cidadeParaGeocodificar || 'São Paulo',
        estadoParaGeocodificar || 'SP',
        2
      );

      if (nominatimResultado) {
        nominatimCoords = {
          lat: nominatimResultado.latitude,
          lng: nominatimResultado.longitude,
        };
      }
    } catch (error: any) {
      console.warn(`⚠️  Nominatim falhou (continuando com Google): ${error.message}`);
    }

    // VALIDAÇÃO CRUZADA: Comparar Google vs Nominatim
    const crossValidation = await geocodingCrossValidationService.validateCoordinates(
      googleCoords,
      nominatimCoords
    );

    // Log detalhado
    geocodingCrossValidationService.logCrossValidation(crossValidation);

    // Usar coordenadas validadas
    const coordenadasFinais = crossValidation.coordenadasFinais;

    if (coordenadasFinais) {
      // SPRINT 2: Validar coordenadas com bounding box
      const geoValidation = geoValidationService.validateCoordinates(
        coordenadasFinais.lat,
        coordenadasFinais.lng,
        cliente.estado || undefined,
        cliente.cidade || undefined
      );

      console.log(`📍 Validação geográfica: ${geoValidation.message}`);

      // Alerta se coordenadas fora do estado (possível erro)
      if (!geoValidation.withinState) {
        console.warn(`⚠️  ALERTA: Coordenadas FORA do estado ${cliente.estado}!`);
        await alertingService.registrarAlerta({
          severidade: 'WARNING' as any,
          categoria: 'GEOCODING' as any,
          titulo: 'Coordenadas fora do estado',
          mensagem: geoValidation.message,
          clienteId,
          metadata: {
            clienteNome: cliente.nome,
            estado: cliente.estado,
            cidade: cliente.cidade,
            latitude: coordenadasFinais.lat,
            longitude: coordenadasFinais.lng,
            distanceToCenter: geoValidation.distanceToCenter,
          },
        });
      }

      // Alerta se baixa confiança na validação cruzada
      if (crossValidation.confianca < 75) {
        console.warn(`⚠️  ALERTA: Baixa confiança no geocoding (${crossValidation.confianca}%)`);
        await alertingService.registrarAlerta({
          severidade: 'WARNING' as any,
          categoria: 'GEOCODING' as any,
          titulo: 'Baixa confiança - Geocoding Cross Validation',
          mensagem: `Divergência de ${crossValidation.detalhes.distanciaMaxima.toFixed(0)}m entre fontes`,
          clienteId,
          metadata: {
            clienteNome: cliente.nome,
            confianca: crossValidation.confianca,
            fonteUsada: crossValidation.fonteUsada,
            distanciaMaxima: crossValidation.detalhes.distanciaMaxima,
            divergencias: crossValidation.detalhes.divergencias,
          },
        });
      }

      // Atualizar cliente com coordenadas + validação geográfica + Vision AI
      await prisma.cliente.update({
        where: { id: clienteId },
        data: {
          latitude: coordenadasFinais.lat,
          longitude: coordenadasFinais.lng,
          enderecoFormatado: googleResultado.enderecoFormatado,
          placeId: googleResultado.placeId,
          geocodingStatus: 'SUCESSO',
          geocodingErro: null,
          geocodingProcessadoEm: new Date(),
          // SPRINT 2: Validação geográfica
          geoValidado: geoValidation.valid,
          geoWithinState: geoValidation.withinState,
          geoWithinCity: geoValidation.withinCity,
          geoDistanceToCenter: geoValidation.distanceToCenter,
          // SPRINT 4: Vision AI - Geocoding Cross Validation
          geocodingConfianca: crossValidation.confianca,
          geocodingFonte: crossValidation.fonteUsada,
          geocodingDivergenciaMaxima: crossValidation.detalhes.distanciaMaxima,
          geocodingDivergencias: JSON.stringify(crossValidation.detalhes.divergencias),
        },
      });

      console.log(`✅ Cliente ${cliente.nome} geocodificado com sucesso`);

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
        coordenadas: {
          lat: coordenadasFinais.lat,
          lng: coordenadasFinais.lng,
        },
      };
    } else {
      // Falha na geocodificação
      await prisma.cliente.update({
        where: { id: clienteId },
        data: {
          geocodingStatus: 'FALHA',
          geocodingErro: googleResultado.error || 'Nenhuma fonte retornou coordenadas',
          geocodingProcessadoEm: new Date(),
        },
      });

      console.warn(`⚠️  Falha ao geocodificar ${cliente.nome}: ${googleResultado.error}`);

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
        error: googleResultado.error || 'Nenhuma fonte retornou coordenadas',
      };
    }
  } catch (error: any) {
    console.error(`❌ Erro ao processar geocodificação:`, error);

    // Atualizar cliente com erro
    try {
      await prisma.cliente.update({
        where: { id: clienteId },
        data: {
          geocodingStatus: 'FALHA',
          geocodingErro: error.message,
          geocodingProcessadoEm: new Date(),
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

console.log('👷 Worker de Geocodificação iniciado');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Encerrando worker...');
  await geocodingQueue.close();
  await prisma.$disconnect();
  process.exit(0);
});

export default geocodingQueue;

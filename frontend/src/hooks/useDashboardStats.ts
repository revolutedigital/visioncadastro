import { useEffect, useState, useCallback } from 'react';
import { logger } from '../utils/logger';
import { API_BASE_URL } from '../config/api';

export interface DashboardStats {
  geocoding: {
    total: number;
    geocodificados: number;
    pendentes: number;
    percentual: number;
  };
  places: {
    total: number;
    processados: number;
    comFotos: number;
    totalFotos: number;
  };
  analysis: {
    total: number;
    concluidos: number;
    fotosAnalisadas: number;
    percentual: number;
  };
  enrichment?: {
    total: number;
    enriquecidos: number;
    pendentes: number;
    percentual: number;
  };
  computed: {
    totalClientes: number;
    pipelineProgress: number;
    estimatedTime: string;
    pendingJobs: number;
    weeklyGrowth: number;
  };
}

interface UseDashboardStatsOptions {
  enableSSE?: boolean;
  pollingInterval?: number;
}

export function useDashboardStats(options: UseDashboardStatsOptions = {}) {
  const { enableSSE = false, pollingInterval = 10000 } = options;

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    try {
      const [geocodingRes, placesRes, analysisRes, enrichmentRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/geocoding/status`),
        fetch(`${API_BASE_URL}/api/places/status`),
        fetch(`${API_BASE_URL}/api/analysis/status`),
        fetch(`${API_BASE_URL}/api/enrichment/status`).catch(() => null),
      ]);

      const [geocoding, places, analysis] = await Promise.all([
        geocodingRes.json(),
        placesRes.json(),
        analysisRes.json(),
      ]);

      const enrichment = enrichmentRes ? await enrichmentRes.json() : null;

      const totalClientes = geocoding.clientes.total;
      const geocodingPercent = geocoding.clientes.percentualCompleto || 0;
      const placesPercent = totalClientes > 0 ? (places.clientes.processados / totalClientes) * 100 : 0;
      const analysisPercent = analysis.clientes.percentualCompleto || 0;
      const tipologiaPercent = enrichment ? enrichment.clientes.percentualCompleto || 0 : 0;

      // Cálculo do progresso geral do pipeline (média ponderada)
      const pipelineProgress = Math.round(
        (geocodingPercent * 0.25 + placesPercent * 0.25 + analysisPercent * 0.4 + tipologiaPercent * 0.1)
      );

      // Estimar tempo baseado em jobs pendentes (simplificado)
      const pendingJobs =
        geocoding.clientes.pendentes +
        (places.clientes.total - places.clientes.processados) +
        (analysis.clientes.total - analysis.clientes.concluidos);

      const estimatedMinutes = Math.ceil(pendingJobs * 0.5); // 30s por job em média
      const estimatedTime =
        estimatedMinutes < 60
          ? `${estimatedMinutes}min`
          : `${Math.floor(estimatedMinutes / 60)}h${estimatedMinutes % 60}min`;

      // Simular crescimento semanal (em produção, viria do backend)
      const weeklyGrowth = 5;

      setStats({
        geocoding: {
          total: geocoding.clientes.total,
          geocodificados: geocoding.clientes.geocodificados,
          pendentes: geocoding.clientes.pendentes,
          percentual: geocoding.clientes.percentualCompleto,
        },
        places: {
          total: places.clientes.total,
          processados: places.clientes.processados,
          comFotos: places.clientes.comFotos,
          totalFotos: places.fotos.total,
        },
        analysis: {
          total: analysis.clientes.total,
          concluidos: analysis.clientes.concluidos,
          fotosAnalisadas: analysis.fotos.analisadas,
          percentual: analysis.clientes.percentualCompleto,
        },
        enrichment: enrichment
          ? {
              total: enrichment.clientes.total,
              enriquecidos: enrichment.clientes.enriquecidos,
              pendentes: enrichment.clientes.pendentes,
              percentual: enrichment.clientes.percentualCompleto,
            }
          : undefined,
        computed: {
          totalClientes,
          pipelineProgress,
          estimatedTime,
          pendingJobs,
          weeklyGrowth,
        },
      });

      setLoading(false);
      setError(null);
    } catch (err) {
      logger.error('Erro ao carregar estatísticas da dashboard', err as Error);
      setError('Falha ao carregar dados');
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();

    // TODO: Implementar SSE quando enableSSE = true
    // Por enquanto, usar polling
    if (!enableSSE) {
      const interval = setInterval(loadStats, pollingInterval);
      return () => clearInterval(interval);
    }
  }, [loadStats, enableSSE, pollingInterval]);

  return {
    stats,
    loading,
    error,
    refresh: loadStats,
  };
}

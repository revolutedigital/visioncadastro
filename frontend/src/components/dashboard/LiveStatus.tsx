import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { Radio, Loader, AlertCircle } from 'lucide-react';
import { logger } from '../../utils/logger';

interface LiveStatusData {
  activeJobs: number;
  queueSizes: {
    receita: number;
    geocoding: number;
    places: number;
    analysis: number;
  };
  lastUpdate: string;
}

export function LiveStatus() {
  const [status, setStatus] = useState<'connected' | 'connecting' | 'error'>('connecting');
  const [data, setData] = useState<LiveStatusData | null>(null);

  useEffect(() => {
    // Simular conexão SSE para status (vamos implementar endpoint depois)
    // Por enquanto, fazer polling a cada 5s
    const loadStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/analysis/status`);
        const result = await response.json();

        setData({
          activeJobs: result.queues?.active || 0,
          queueSizes: {
            receita: 0,
            geocoding: result.clientes?.pendentes || 0,
            places: result.clientes?.pendentes || 0,
            analysis: result.clientes?.pendentes || 0,
          },
          lastUpdate: new Date().toISOString(),
        });
        setStatus('connected');
      } catch (error) {
        logger.error('Erro ao carregar status live', error as Error);
        setStatus('error');
      }
    };

    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 bg-red-500/20 backdrop-blur-sm px-4 py-2 rounded-full border border-red-300/30">
        <AlertCircle className="w-4 h-4 text-red-200" />
        <span className="text-sm font-medium text-red-100">Desconectado</span>
      </div>
    );
  }

  if (status === 'connecting' || !data) {
    return (
      <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm px-4 py-2 rounded-full border border-white/20">
        <Loader className="w-4 h-4 text-indigo-200 animate-spin" />
        <span className="text-sm font-medium text-indigo-100">Conectando...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-green-500/20 backdrop-blur-sm px-4 py-2 rounded-full border border-green-300/30">
      <Radio className="w-4 h-4 text-green-200 animate-pulse" />
      <span className="text-sm font-medium text-green-100">
        {data.activeJobs} job{data.activeJobs !== 1 ? 's' : ''} ativo{data.activeJobs !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

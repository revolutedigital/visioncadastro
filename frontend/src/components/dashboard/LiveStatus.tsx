import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../utils/api';
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
    const loadStatus = async () => {
      try {
        const response = await authFetch(`${API_BASE_URL}/api/analysis/status`);
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
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium bg-red-50 text-red-600 border border-red-200">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Desconectado</span>
      </div>
    );
  }

  if (status === 'connecting' || !data) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium bg-zinc-100 text-zinc-500 border border-zinc-200">
        <Loader className="w-3.5 h-3.5 animate-spin" />
        <span>Conectando...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
      <Radio className="w-3.5 h-3.5" />
      <span>
        {data.activeJobs} job{data.activeJobs !== 1 ? 's' : ''} ativo{data.activeJobs !== 1 ? 's' : ''}
      </span>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../utils/api';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle, ChevronRight } from 'lucide-react';
import { logger } from '../../utils/logger';

interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  count: number;
  action: { label: string; onClick: () => void };
}

export function AlertsPanel() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadAlerts(); }, []);

  const loadAlerts = async () => {
    try {
      const [statusRes, clientesRes] = await Promise.all([
        authFetch(`${API_BASE_URL}/api/analysis/status`),
        authFetch(`${API_BASE_URL}/api/analysis/clientes?status=CONCLUIDO`),
      ]);
      const status = await statusRes.json();
      const clientesData = await clientesRes.json();
      const newAlerts: Alert[] = [];

      const failedJobs = status.queues?.failed || 0;
      if (failedJobs > 0) {
        newAlerts.push({
          id: 'failed-jobs', type: 'error',
          title: 'Jobs Falhados',
          description: `${failedJobs} processamentos falharam`,
          count: failedJobs,
          action: {
            label: 'Reprocessar',
            onClick: async () => {
              try {
                await authFetch(`${API_BASE_URL}/api/analysis/retry-failed`, { method: 'POST' });
                loadAlerts();
              } catch (error) { logger.error('Erro ao reprocessar', error as Error); }
            },
          },
        });
      }

      if (clientesData.success && clientesData.clientes) {
        const lowConfidence = clientesData.clientes.filter((c: any) => c.tipologiaConfianca && c.tipologiaConfianca < 50);
        if (lowConfidence.length > 0) {
          newAlerts.push({
            id: 'low-confidence', type: 'warning',
            title: 'Confiança Baixa',
            description: `${lowConfidence.length} clientes com confiança abaixo de 50%`,
            count: lowConfidence.length,
            action: { label: 'Revisar', onClick: () => navigate('/clientes?filter=low-confidence') },
          });
        }
        const divergencias = clientesData.clientes.filter((c: any) => c.tipologiaIA && c.tipologiaGoogle && c.tipologiaIA !== c.tipologiaGoogle);
        if (divergencias.length > 0) {
          newAlerts.push({
            id: 'divergencias', type: 'warning',
            title: 'Divergências Detectadas',
            description: `${divergencias.length} clientes com classificação diferente`,
            count: divergencias.length,
            action: { label: 'Validar', onClick: () => navigate('/clientes?filter=divergencias') },
          });
        }
      }
      setAlerts(newAlerts);
      setLoading(false);
    } catch (error) {
      logger.error('Erro ao carregar alertas', error as Error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest p-5">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-9 h-9 bg-zinc-100 rounded-lg" />
          <div className="flex-1">
            <div className="h-3.5 bg-zinc-100 rounded w-1/3 mb-2" />
            <div className="h-3 bg-zinc-100 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-emerald-200 shadow-rest p-5">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-50 rounded-lg">
            <CheckCircle className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Tudo em Ordem</h3>
            <p className="text-[13px] text-zinc-500">Nenhuma ação urgente necessária</p>
          </div>
        </div>
      </div>
    );
  }

  const getStyle = (type: string) => {
    if (type === 'error') return { border: 'border-red-200', iconBg: 'bg-red-50', icon: 'text-red-600', btn: 'bg-red-600 hover:bg-red-700' };
    if (type === 'warning') return { border: 'border-amber-200', iconBg: 'bg-amber-50', icon: 'text-amber-600', btn: 'bg-amber-600 hover:bg-amber-700' };
    return { border: 'border-indigo-200', iconBg: 'bg-indigo-50', icon: 'text-indigo-600', btn: 'bg-indigo-600 hover:bg-indigo-700' };
  };

  return (
    <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-semibold text-zinc-900">Ações Urgentes ({alerts.length})</h2>
        </div>
        <button onClick={() => navigate('/alerts')} className="text-[13px] text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-0.5" aria-label="Ver todos os alertas">
          Ver Todos <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="space-y-2">
        {alerts.slice(0, 3).map((alert) => {
          const s = getStyle(alert.type);
          return (
            <div key={alert.id} className={`rounded-lg border ${s.border} p-3.5`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className={`p-1.5 ${s.iconBg} rounded-lg flex-shrink-0`}>
                    <AlertTriangle className={`w-4 h-4 ${s.icon}`} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-zinc-900">{alert.title}</h3>
                    <p className="text-[13px] text-zinc-500 truncate">{alert.description}</p>
                  </div>
                </div>
                <button onClick={alert.action.onClick} className={`px-3 py-1.5 ${s.btn} text-white rounded-lg text-[13px] font-medium whitespace-nowrap transition-colors flex-shrink-0`}>
                  {alert.action.label}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

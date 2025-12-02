import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, RefreshCw, Eye, CheckCircle, ChevronRight } from 'lucide-react';
import { logger } from '../../utils/logger';

interface Alert {
  id: string;
  type: 'error' | 'warning' | 'info';
  title: string;
  description: string;
  count: number;
  action: {
    label: string;
    onClick: () => void;
  };
}

export function AlertsPanel() {
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlerts();
  }, []);

  const loadAlerts = async () => {
    try {
      // Carregar dados de múltiplas fontes para gerar alertas
      const [statusRes, clientesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/analysis/status`),
        fetch(`${API_BASE_URL}/api/analysis/clientes?status=CONCLUIDO`),
      ]);

      const status = await statusRes.json();
      const clientesData = await clientesRes.json();

      const newAlerts: Alert[] = [];

      // Alerta 1: Jobs falhados
      const failedJobs = status.queues?.failed || 0;
      if (failedJobs > 0) {
        newAlerts.push({
          id: 'failed-jobs',
          type: 'error',
          title: 'Jobs Falhados',
          description: `${failedJobs} processamentos falharam e precisam ser reprocessados`,
          count: failedJobs,
          action: {
            label: 'Reprocessar',
            onClick: async () => {
              try {
                await fetch(`${API_BASE_URL}/api/analysis/retry-failed`, {
                  method: 'POST',
                });
                loadAlerts();
              } catch (error) {
                logger.error('Erro ao reprocessar jobs', error as Error);
              }
            },
          },
        });
      }

      // Alerta 2: Baixa confiança
      if (clientesData.success && clientesData.clientes) {
        const lowConfidence = clientesData.clientes.filter(
          (c: any) => c.tipologiaConfianca && c.tipologiaConfianca < 50
        );

        if (lowConfidence.length > 0) {
          newAlerts.push({
            id: 'low-confidence',
            type: 'warning',
            title: 'Confiança Baixa',
            description: `${lowConfidence.length} clientes com confiança abaixo de 50%`,
            count: lowConfidence.length,
            action: {
              label: 'Revisar',
              onClick: () => navigate('/clientes?filter=low-confidence'),
            },
          });
        }

        // Alerta 3: Divergências IA × Google
        const divergencias = clientesData.clientes.filter(
          (c: any) =>
            c.tipologiaIA &&
            c.tipologiaGoogle &&
            c.tipologiaIA !== c.tipologiaGoogle
        );

        if (divergencias.length > 0) {
          newAlerts.push({
            id: 'divergencias',
            type: 'warning',
            title: 'Divergências Detectadas',
            description: `${divergencias.length} clientes com classificação diferente entre IA e Google`,
            count: divergencias.length,
            action: {
              label: 'Validar',
              onClick: () => navigate('/clientes?filter=divergencias'),
            },
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
      <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
        <div className="animate-pulse flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-200 rounded-full" />
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
            <div className="h-3 bg-gray-200 rounded w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-md p-6 border border-green-100">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-green-100 rounded-full">
            <CheckCircle className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h3 className="font-bold text-green-900">Tudo em Ordem!</h3>
            <p className="text-sm text-green-700">Nenhuma ação urgente necessária no momento</p>
          </div>
        </div>
      </div>
    );
  }

  const getAlertIcon = (type: string) => {
    if (type === 'error') return AlertTriangle;
    if (type === 'warning') return AlertTriangle;
    return RefreshCw;
  };

  const getAlertColors = (type: string) => {
    if (type === 'error')
      return {
        bg: 'from-red-50 to-rose-50',
        border: 'border-red-200',
        iconBg: 'bg-red-100',
        icon: 'text-red-600',
        title: 'text-red-900',
        desc: 'text-red-700',
        button: 'bg-red-600 hover:bg-red-700 text-white',
      };
    if (type === 'warning')
      return {
        bg: 'from-yellow-50 to-amber-50',
        border: 'border-yellow-200',
        iconBg: 'bg-yellow-100',
        icon: 'text-yellow-600',
        title: 'text-yellow-900',
        desc: 'text-yellow-700',
        button: 'bg-yellow-600 hover:bg-yellow-700 text-white',
      };
    return {
      bg: 'from-blue-50 to-indigo-50',
      border: 'border-blue-200',
      iconBg: 'bg-blue-100',
      icon: 'text-blue-600',
      title: 'text-blue-900',
      desc: 'text-blue-700',
      button: 'bg-blue-600 hover:bg-blue-700 text-white',
    };
  };

  return (
    <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-orange-600" />
          <h2 className="text-lg font-bold text-gray-900">
            Ações Urgentes ({alerts.length})
          </h2>
        </div>
        <button
          onClick={() => navigate('/alerts')}
          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
          aria-label="Ver todos os alertas"
        >
          Ver Todos
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-3">
        {alerts.slice(0, 3).map((alert) => {
          const Icon = getAlertIcon(alert.type);
          const colors = getAlertColors(alert.type);

          return (
            <div
              key={alert.id}
              className={`bg-gradient-to-br ${colors.bg} rounded-lg p-4 border ${colors.border}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1">
                  <div className={`p-2 ${colors.iconBg} rounded-lg flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${colors.icon}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className={`font-bold ${colors.title} mb-1`}>{alert.title}</h3>
                    <p className={`text-sm ${colors.desc}`}>{alert.description}</p>
                  </div>
                </div>
                <button
                  onClick={alert.action.onClick}
                  className={`px-4 py-2 ${colors.button} rounded-lg text-sm font-semibold whitespace-nowrap transition-all shadow-sm hover:shadow-md flex-shrink-0`}
                  aria-label={alert.action.label}
                >
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

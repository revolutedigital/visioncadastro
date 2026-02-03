import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../utils/api';
import {
  MapPin,
  Image,
  Brain,
  Globe,
  Tags,
  Activity,
  CheckCircle,
  Clock,
  AlertCircle,
  Loader,
  Play,
  FileText,
  Building2,
  Square,
  Terminal,
  ChevronDown,
  ChevronUp,
  Radio,
  Rocket,
} from 'lucide-react';
import { useSSELogs } from '../../hooks/useSSELogs';
import { logger } from '../../utils/logger';

interface QueueStatus {
  filas: {
    receita: {
      aguardando: number;
      processando: number;
    };
    normalization: {
      aguardando: number;
      processando: number;
    };
    geocoding: {
      aguardando: number;
      processando: number;
    };
    places: {
      aguardando: number;
      processando: number;
    };
    analysis: {
      aguardando: number;
      processando: number;
      completados: number;
      falhados: number;
    };
  };
  clientes: {
    total: number;
    comReceita: number;
    normalizados: number;
    divergenciaEndereco: number;
    geocodificados: number;
    comPlaces: number;
    comFotos: number;
    concluidos: number;
    percentualCompleto: number;
  };
  fotos: {
    total: number;
    analisadas: number;
    naoAnalisadas: number;
    percentualAnalisado: number;
  };
}

interface PipelineStep {
  id: string;
  name: string;
  icon: any;
  description: string;
  status: 'completed' | 'processing' | 'pending' | 'error';
  progress: number;
  total: number;
  color: string;
}

export function PipelinePage() {
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [placesDetails, setPlacesDetails] = useState<{processados: number, sucesso: number, falhas: number} | null>(null);
  const [tipologiaStats, setTipologiaStats] = useState<{total: number, mediaConfianca: number} | null>(null);
  const [loading, setLoading] = useState(true);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState<Record<string, boolean>>({});

  // SSE Logs em tempo real para cada fila
  const receitaSSE = useSSELogs('receita', { enabled: showLogs['0'] });
  const normalizationSSE = useSSELogs('normalization', { enabled: showLogs['1'] });
  const geocodingSSE = useSSELogs('geocoding', { enabled: showLogs['2'] });
  const placesSSE = useSSELogs('places', { enabled: showLogs['3'] });
  const analysisSSE = useSSELogs('analysis', { enabled: showLogs['4'] });
  const tipologiaSSE = useSSELogs('tipologia', { enabled: showLogs['5'] });

  useEffect(() => {
    loadQueueStatus();
    loadPlacesDetails();
    loadTipologiaStats();
    const interval = setInterval(() => {
      loadQueueStatus();
      loadPlacesDetails();
      loadTipologiaStats();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Detectar se pipeline está rodando
  useEffect(() => {
    if (queueStatus) {
      const isRunning =
        queueStatus.filas.receita.processando > 0 ||
        queueStatus.filas.receita.aguardando > 0 ||
        queueStatus.filas.normalization.processando > 0 ||
        queueStatus.filas.normalization.aguardando > 0 ||
        queueStatus.filas.geocoding.processando > 0 ||
        queueStatus.filas.geocoding.aguardando > 0 ||
        queueStatus.filas.places.processando > 0 ||
        queueStatus.filas.places.aguardando > 0 ||
        queueStatus.filas.analysis.processando > 0 ||
        queueStatus.filas.analysis.aguardando > 0;
      setPipelineRunning(isRunning);
    }
  }, [queueStatus]);

  const loadQueueStatus = async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/analysis/status`);
      const data = await response.json();
      if (data.success) {
        setQueueStatus(data);
      }
      setLoading(false);
    } catch (error) {
      logger.error('Erro ao carregar status', error);
      setLoading(false);
    }
  };

  const loadPlacesDetails = async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/places/status`);
      const data = await response.json();
      if (data.success && data.clientes) {
        setPlacesDetails({
          processados: data.clientes.processados || 0,
          sucesso: data.clientes.sucesso || data.clientes.processados || 0,
          falhas: data.clientes.falhas || 0,
        });
      }
    } catch (error) {
      logger.error('Erro ao carregar detalhes do Places', error);
    }
  };

  const loadTipologiaStats = async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/analysis/tipologia-stats`);
      const data = await response.json();
      if (data.success) {
        setTipologiaStats({
          total: data.total || 0,
          mediaConfianca: data.mediaConfianca || 0,
        });
      }
    } catch (error) {
      logger.error('Erro ao carregar estatísticas de tipologia', error);
    }
  };

  // Iniciar pipeline completo (começa pelo step 1 - Receita)
  const handleStartPipeline = async () => {
    setActionLoading('start');
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/analysis/start-receita?force=false&scope=planilha`,
        { method: 'POST' }
      );
      const data = await response.json();
      if (data.success) {
        logger.success(`Pipeline iniciado: ${data.total} clientes`);
        setPipelineRunning(true);
        loadQueueStatus();
      } else {
        logger.error(data.message || 'Erro ao iniciar pipeline');
      }
    } catch (error) {
      logger.error('Erro ao iniciar pipeline', error);
    } finally {
      setActionLoading(null);
    }
  };

  // Parar todas as filas
  const handleStopAll = async () => {
    setActionLoading('stop');
    try {
      const queues = ['receita', 'normalization', 'geocoding', 'places', 'analysis', 'tipologia'];
      await Promise.all(
        queues.map(q =>
          authFetch(`${API_BASE_URL}/api/analysis/pause/${q}`, { method: 'POST' })
        )
      );
      logger.success('Todas as filas pausadas');
      setPipelineRunning(false);
      loadQueueStatus();
    } catch (error) {
      logger.error('Erro ao pausar filas', error);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleLogs = (stepId: string) => {
    setShowLogs(prev => ({
      ...prev,
      [stepId]: !prev[stepId],
    }));
  };

  // Mapeamento de stepId para dados SSE
  const getSSEDataForStep = (stepId: string) => {
    switch (stepId) {
      case '0': return receitaSSE;
      case '1': return normalizationSSE;
      case '2': return geocodingSSE;
      case '3': return placesSSE;
      case '4': return analysisSSE;
      case '5': return tipologiaSSE;
      default: return { logs: [], isConnected: false, error: null };
    }
  };

  // Construir steps do pipeline
  const getSteps = (): PipelineStep[] => {
    if (!queueStatus) return [];

    const total = queueStatus.clientes.total;
    const comReceita = queueStatus.clientes.comReceita || 0;
    const normalizados = queueStatus.clientes.normalizados || 0;
    const geocodificados = queueStatus.clientes.geocodificados || 0;
    const comPlaces = queueStatus.clientes.comPlaces || 0;
    const fotosAnalisadas = queueStatus.fotos.analisadas;

    return [
      {
        id: '0',
        name: 'Consulta Documento',
        icon: Building2,
        description: 'CNPJ → CNPJA (Receita + Simples + CCC) | CPF → SERPRO',
        status: comReceita === total && total > 0 ? 'completed' : comReceita > 0 ? 'processing' : 'pending',
        progress: comReceita,
        total: total,
        color: 'bg-purple-500',
      },
      {
        id: '1',
        name: 'Normalização IA',
        icon: FileText,
        description: 'Normalizar endereço, cidade e estado com Claude IA',
        status: normalizados === total && total > 0 ? 'completed' : normalizados > 0 ? 'processing' : 'pending',
        progress: normalizados,
        total: total,
        color: 'bg-orange-500',
      },
      {
        id: '2',
        name: 'Geocodificação',
        icon: MapPin,
        description: 'Converter endereços em coordenadas GPS',
        status: geocodificados === total && total > 0 ? 'completed' : geocodificados > 0 ? 'processing' : 'pending',
        progress: geocodificados,
        total: total,
        color: 'blue',
      },
      {
        id: '3',
        name: 'Google Places',
        icon: Globe,
        description: 'Buscar dados do estabelecimento (fotos, rating, horários)',
        status: placesDetails && placesDetails.processados === total && total > 0
          ? 'completed'
          : comPlaces > 0 || (placesDetails && placesDetails.processados > 0)
          ? 'processing'
          : 'pending',
        progress: placesDetails ? placesDetails.processados : comPlaces,
        total: total,
        color: 'green',
      },
      {
        id: '4',
        name: 'Análise IA Arca',
        icon: Image,
        description: 'Analisar fotos com IA (ambiente, branding, público, produtos)',
        status:
          fotosAnalisadas === queueStatus.fotos.total && queueStatus.fotos.total > 0
            ? 'completed'
            : queueStatus.filas.analysis.processando > 0
            ? 'processing'
            : fotosAnalisadas > 0
            ? 'processing'
            : 'pending',
        progress: fotosAnalisadas,
        total: queueStatus.fotos.total,
        color: 'purple',
      },
      {
        id: '5',
        name: 'Arca Analyst',
        icon: Tags,
        description: 'Agente IA valida cadastro cruzando TODAS as fontes e dá veredito',
        status: tipologiaStats && tipologiaStats.total === total && total > 0
          ? 'completed'
          : tipologiaStats && tipologiaStats.total > 0
          ? 'processing'
          : 'pending',
        progress: tipologiaStats?.total || 0,
        total: total,
        color: 'pink',
      },
    ];
  };

  const steps = getSteps();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'processing':
        return <Loader className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Clock className="w-5 h-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'error':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-600 border-gray-200';
    }
  };

  // Calcular progresso geral
  const overallProgress = queueStatus
    ? Math.round(queueStatus.clientes.percentualCompleto || 0)
    : 0;

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <Loader className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header com controles globais */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <Activity className="w-8 h-8 mr-3 text-indigo-600" />
              Pipeline de Processamento
            </h1>
            <p className="text-gray-600 mt-1">
              Pipeline automático - cada etapa encadeia para a próxima
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${pipelineRunning ? 'text-green-500 animate-pulse' : 'text-gray-400'}`} />
            <span className="text-sm text-gray-600">
              {pipelineRunning ? 'Pipeline ativo' : 'Pipeline parado'}
            </span>
          </div>
        </div>

        {/* Barra de progresso geral */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Progresso geral</span>
            <span>{overallProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${
                overallProgress === 100 ? 'bg-green-500' : 'bg-indigo-600'
              }`}
              style={{ width: `${overallProgress}%` }}
            />
          </div>
        </div>

        {/* Botões de controle global */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleStartPipeline}
            disabled={actionLoading !== null || pipelineRunning}
            className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-md"
          >
            {actionLoading === 'start' ? (
              <>
                <Loader className="w-5 h-5 mr-2 animate-spin" />
                Iniciando...
              </>
            ) : (
              <>
                <Rocket className="w-5 h-5 mr-2" />
                Iniciar Pipeline
              </>
            )}
          </button>

          <button
            onClick={handleStopAll}
            disabled={actionLoading !== null || !pipelineRunning}
            className="flex items-center px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-md"
          >
            {actionLoading === 'stop' ? (
              <>
                <Loader className="w-5 h-5 mr-2 animate-spin" />
                Parando...
              </>
            ) : (
              <>
                <Square className="w-5 h-5 mr-2" />
                Parar Tudo
              </>
            )}
          </button>

          {queueStatus && (
            <div className="ml-auto text-sm text-gray-600">
              {queueStatus.clientes.total} clientes • {queueStatus.fotos.total} fotos
            </div>
          )}
        </div>
      </div>

      {/* Pipeline Steps */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Etapas do Pipeline</h2>
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center gap-4">
                {/* Step Number */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  step.status === 'completed' ? 'bg-green-100 text-green-700' :
                  step.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-500'
                }`}>
                  {index + 1}
                </div>

                {/* Icon */}
                <step.icon className={`w-5 h-5 ${
                  step.status === 'completed' ? 'text-green-600' :
                  step.status === 'processing' ? 'text-blue-600' :
                  'text-gray-400'
                }`} />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-gray-900">{step.name}</h3>
                    {getStatusIcon(step.status)}
                  </div>
                  <p className="text-xs text-gray-500 truncate">{step.description}</p>
                </div>

                {/* Progress */}
                <div className="text-right min-w-[100px]">
                  <div className="text-sm font-medium text-gray-900">
                    {step.progress} / {step.total}
                  </div>
                  <div className="text-xs text-gray-500">
                    {step.total > 0 ? Math.round((step.progress / step.total) * 100) : 0}%
                  </div>
                </div>

                {/* Progress bar mini */}
                <div className="w-24">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        step.status === 'completed' ? 'bg-green-500' :
                        step.status === 'processing' ? 'bg-blue-500' :
                        'bg-gray-300'
                      }`}
                      style={{ width: `${step.total > 0 ? (step.progress / step.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Ver Logs button */}
                <button
                  onClick={() => toggleLogs(step.id)}
                  className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    showLogs[step.id]
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <Terminal className="w-4 h-4 mr-1" />
                  Logs
                  {showLogs[step.id] ? (
                    <ChevronUp className="w-4 h-4 ml-1" />
                  ) : (
                    <ChevronDown className="w-4 h-4 ml-1" />
                  )}
                </button>
              </div>

              {/* Stats extras por step */}
              {step.id === '0' && queueStatus && queueStatus.clientes.divergenciaEndereco > 0 && (
                <div className="mt-2 ml-12 flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded-md border border-orange-200">
                    <AlertCircle className="w-3 h-3" />
                    {queueStatus.clientes.divergenciaEndereco} divergências de endereço
                  </span>
                </div>
              )}

              {step.id === '3' && placesDetails && placesDetails.falhas > 0 && (
                <div className="mt-2 ml-12 flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-md border border-green-200">
                    <CheckCircle className="w-3 h-3" />
                    {placesDetails.sucesso} sucessos
                  </span>
                  <span className="flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded-md border border-orange-200">
                    <AlertCircle className="w-3 h-3" />
                    {placesDetails.falhas} sem presença digital
                  </span>
                </div>
              )}

              {step.id === '5' && tipologiaStats && tipologiaStats.total > 0 && (
                <div className="mt-2 ml-12 flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md border border-blue-200">
                    <Brain className="w-3 h-3" />
                    {tipologiaStats.mediaConfianca}% confiança média
                  </span>
                </div>
              )}

              {/* Collapsible Log Panel */}
              {showLogs[step.id] && (() => {
                const sseData = getSSEDataForStep(step.id);
                return (
                  <div className="mt-3 border border-gray-300 rounded-lg bg-gray-900 p-3 font-mono text-xs text-green-400 max-h-64 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2 text-white">
                      <span className="font-bold text-xs">Logs em tempo real - {step.name}</span>
                      {sseData.isConnected ? (
                        <div className="flex items-center gap-1 text-green-400">
                          <Radio className="w-3 h-3 animate-pulse" />
                          <span className="text-xs">CONECTADO</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-yellow-400">
                          <Loader className="w-3 h-3 animate-spin" />
                          <span className="text-xs">Conectando...</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1">
                      {sseData.logs.length > 0 ? (
                        sseData.logs.map((log, idx) => {
                          let textColor = 'text-green-400';
                          if (log.type === 'connected') textColor = 'text-green-200';
                          else if (log.type === 'error') textColor = 'text-red-400';
                          else if (log.type === 'success') textColor = 'text-cyan-400';
                          else if (log.type === 'processing') textColor = 'text-yellow-400';
                          else if (log.type === 'progress') textColor = 'text-blue-300';

                          const time = new Date(log.timestamp).toLocaleTimeString('pt-BR');

                          return (
                            <div key={`${log.timestamp}-${idx}`} className={`${textColor} hover:bg-gray-800 px-2 py-0.5 rounded`}>
                              [{time}] {log.message}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-gray-500 italic">
                          {sseData.isConnected ? 'Aguardando eventos...' : 'Conectando...'}
                        </div>
                      )}
                      {sseData.error && (
                        <div className="text-red-400 bg-red-900/50 px-2 py-1 rounded">
                          ⚠️ {sseData.error}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default PipelinePage;

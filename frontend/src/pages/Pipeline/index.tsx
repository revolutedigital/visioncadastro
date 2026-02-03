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
  RefreshCw,
  FileText,
  Building2,
  Pause,
  Terminal,
  ChevronDown,
  ChevronUp,
  Radio,
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
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pausedQueues, setPausedQueues] = useState<Record<string, boolean>>({});
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
    loadPausedStatus();
    const interval = setInterval(() => {
      loadQueueStatus();
      loadPlacesDetails();
      loadTipologiaStats();
    }, 5000); // Poll a cada 5s
    return () => clearInterval(interval);
  }, []);

  const loadPausedStatus = async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/analysis/queue-paused-status`);
      const data = await response.json();
      if (data.success) {
        setPausedQueues(data.paused);
      }
    } catch (error) {
      logger.error('Erro ao carregar status de pausa', error);
    }
  };

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
          sucesso: data.clientes.sucesso || data.clientes.processados || 0, // fallback para compatibilidade
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

  // Função genérica para iniciar processamento
  // scope: 'planilha' = última planilha, 'all' = todos os clientes
  const handleStartProcess = async (
    endpoint: string,
    loadingKey: string,
    label: string,
    scope: 'planilha' | 'all' = 'planilha'
  ) => {
    setActionLoading(`${loadingKey}-${scope}`);
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/analysis/${endpoint}?force=true&scope=${scope}`,
        { method: 'POST' }
      );
      const data = await response.json();
      if (data.success) {
        const scopeLabel = scope === 'planilha' ? 'planilha' : 'todos';
        logger.success(`${label} iniciado (${scopeLabel}): ${data.total} clientes`);
        loadQueueStatus();
      } else {
        logger.error(data.message || `Erro ao iniciar ${label}`);
      }
    } catch (error) {
      logger.error(`Erro ao iniciar ${label}`, error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleStartReceita = (scope: 'planilha' | 'all' = 'planilha') =>
    handleStartProcess('start-receita', 'receita', 'Receita Federal', scope);

  const handleStartNormalization = (scope: 'planilha' | 'all' = 'planilha') =>
    handleStartProcess('start-normalization', 'normalization', 'Normalização', scope);

  const handleStartGeocoding = (scope: 'planilha' | 'all' = 'planilha') =>
    handleStartProcess('start-geocoding', 'geocoding', 'Geocodificação', scope);

  const handleStartPlaces = (scope: 'planilha' | 'all' = 'planilha') =>
    handleStartProcess('start-places', 'places', 'Google Places', scope);

  const handleStartAnalysis = (scope: 'planilha' | 'all' = 'planilha') =>
    handleStartProcess('start-analysis', 'analysis', 'Análise IA', scope);

  const handleStartTipologia = (scope: 'planilha' | 'all' = 'planilha') =>
    handleStartProcess('start-tipologia', 'tipologia', 'Tipologia', scope);

  const handlePauseResume = async (queueName: string) => {
    const isPaused = pausedQueues[queueName];
    const action = isPaused ? 'resume' : 'pause';

    try {
      const response = await authFetch(`${API_BASE_URL}/api/analysis/${action}/${queueName}`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        logger.success(`Fila ${queueName} ${isPaused ? 'retomada' : 'pausada'}`);
        setPausedQueues(prev => ({
          ...prev,
          [queueName]: !isPaused,
        }));
      }
    } catch (error) {
      logger.error(`Erro ao ${action} fila`, error);
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
      case '0':
        return receitaSSE;
      case '1':
        return normalizationSSE;
      case '2':
        return geocodingSSE;
      case '3':
        return placesSSE;
      case '4':
        return analysisSSE;
      case '5':
        return tipologiaSSE;
      default:
        return { logs: [], isConnected: false, error: null };
    }
  };

  // Helper para obter nome da fila
  const getQueueNameFromStepId = (stepId: string): string => {
    const mapping: Record<string, string> = {
      '0': 'receita',
      '1': 'normalization',
      '2': 'geocoding',
      '3': 'places',
      '4': 'analysis',
      '5': 'tipologia',
    };
    return mapping[stepId] || '';
  };

  // Construir steps do pipeline baseado nos dados reais
  const getSteps = (): PipelineStep[] => {
    if (!queueStatus) return [];

    const total = queueStatus.clientes.total;
    const comReceita = queueStatus.clientes.comReceita || 0;
    const normalizados = queueStatus.clientes.normalizados || 0;
    const geocodificados = queueStatus.clientes.geocodificados || 0;
    const comPlaces = queueStatus.clientes.comPlaces || 0;
    const comFotos = queueStatus.clientes.comFotos;
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
        // processados já inclui sucesso + falhas no backend
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
        name: 'Classificação de Tipologia',
        icon: Tags,
        description: 'Classificar estabelecimento em tipologias PepsiCo usando IA com todas as informações coletadas',
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
        return <CheckCircle className="w-6 h-6 text-green-500" />;
      case 'processing':
        return <Loader className="w-6 h-6 text-blue-500 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-6 h-6 text-red-500" />;
      default:
        return <Clock className="w-6 h-6 text-gray-400" />;
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
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center">
              <Activity className="w-8 h-8 mr-3 text-indigo-600" />
              Pipeline de Processamento
            </h1>
            <p className="text-gray-600 mt-1">
              Acompanhe o progresso do processamento em tempo real via SSE
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Radio className="w-4 h-4 text-green-500 animate-pulse" />
            <span className="text-sm text-gray-600">Logs em tempo real (SSE)</span>
          </div>
        </div>
      </div>

      {/* Pipeline Steps - Fase 1 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">
          Fase 1: Pipeline Completo de Análise
        </h2>
        <div className="space-y-4">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start space-x-4">
                {/* Step Number */}
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-700">
                    {index + 1}
                  </div>
                </div>

                {/* Step Content */}
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <step.icon className="w-5 h-5 text-gray-600" />
                      <h3 className="font-semibold text-gray-900">{step.name}</h3>
                    </div>
                    <div className="flex items-center space-x-2">
                      {getStatusIcon(step.status)}
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(
                          step.status
                        )}`}
                      >
                        {step.status === 'completed'
                          ? 'Concluído'
                          : step.status === 'processing'
                          ? 'Processando'
                          : step.status === 'error'
                          ? 'Erro'
                          : 'Pendente'}
                      </span>
                    </div>
                  </div>

                  <p className="text-sm text-gray-600 mb-3">{step.description}</p>

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-gray-600">
                      <span>
                        {step.progress} / {step.total}
                      </span>
                      <span>
                        {step.total > 0
                          ? Math.round((step.progress / step.total) * 100)
                          : 0}
                        %
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          step.status === 'completed'
                            ? 'bg-green-500'
                            : step.status === 'processing'
                            ? 'bg-blue-500'
                            : step.status === 'error'
                            ? 'bg-red-500'
                            : 'bg-gray-300'
                        }`}
                        style={{
                          width: `${
                            step.total > 0 ? (step.progress / step.total) * 100 : 0
                          }%`,
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* 🎯 RECEITA FEDERAL: Estatísticas */}
                  {step.id === '0' && queueStatus && queueStatus.clientes.comReceita > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
                      <span className="flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 rounded-md border border-purple-200">
                        <CheckCircle className="w-3 h-3" />
                        {queueStatus.clientes.comReceita} {queueStatus.clientes.comReceita === 1 ? 'processado' : 'processados'}
                      </span>
                      {queueStatus.clientes.divergenciaEndereco > 0 && (
                        <span className="flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded-md border border-orange-200">
                          <AlertCircle className="w-3 h-3" />
                          {queueStatus.clientes.divergenciaEndereco} {queueStatus.clientes.divergenciaEndereco === 1 ? 'divergência' : 'divergências'} de endereço
                        </span>
                      )}
                    </div>
                  )}

                  {/* 🎯 NORMALIZAÇÃO: Estatísticas */}
                  {step.id === '1' && queueStatus && queueStatus.clientes.normalizados > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded-md border border-orange-200">
                        <CheckCircle className="w-3 h-3" />
                        {queueStatus.clientes.normalizados} {queueStatus.clientes.normalizados === 1 ? 'normalizado' : 'normalizados'}
                      </span>
                    </div>
                  )}

                  {/* 🎯 GEOCODIFICAÇÃO: Estatísticas */}
                  {step.id === '2' && queueStatus && queueStatus.clientes.geocodificados > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md border border-blue-200">
                        <CheckCircle className="w-3 h-3" />
                        {queueStatus.clientes.geocodificados} {queueStatus.clientes.geocodificados === 1 ? 'geocodificado' : 'geocodificados'}
                      </span>
                    </div>
                  )}

                  {/* 🎯 GOOGLE PLACES: Estatísticas de sucessos/falhas */}
                  {step.id === '3' && placesDetails && (placesDetails.sucesso > 0 || placesDetails.falhas > 0) && (
                    <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
                      <span className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 rounded-md border border-green-200">
                        <CheckCircle className="w-3 h-3" />
                        {placesDetails.sucesso} {placesDetails.sucesso === 1 ? 'sucesso' : 'sucessos'}
                      </span>
                      {placesDetails.falhas > 0 && (
                        <span className="flex items-center gap-1 px-2 py-1 bg-orange-50 text-orange-700 rounded-md border border-orange-200">
                          <AlertCircle className="w-3 h-3" />
                          {placesDetails.falhas} {placesDetails.falhas === 1 ? 'falha' : 'falhas'} (sem presença digital)
                        </span>
                      )}
                    </div>
                  )}

                  {/* 🎯 ANÁLISE IA VISION: Estatísticas */}
                  {step.id === '4' && queueStatus && queueStatus.fotos.analisadas > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
                      <span className="flex items-center gap-1 px-2 py-1 bg-purple-50 text-purple-700 rounded-md border border-purple-200">
                        <CheckCircle className="w-3 h-3" />
                        {queueStatus.fotos.analisadas} {queueStatus.fotos.analisadas === 1 ? 'foto analisada' : 'fotos analisadas'}
                      </span>
                      {queueStatus.fotos.naoAnalisadas > 0 && (
                        <span className="flex items-center gap-1 px-2 py-1 bg-gray-50 text-gray-700 rounded-md border border-gray-200">
                          <Clock className="w-3 h-3" />
                          {queueStatus.fotos.naoAnalisadas} {queueStatus.fotos.naoAnalisadas === 1 ? 'pendente' : 'pendentes'}
                        </span>
                      )}
                    </div>
                  )}

                  {/* 🎯 TIPOLOGIA: Estatísticas de classificação */}
                  {step.id === '5' && tipologiaStats && tipologiaStats.total > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <span className="flex items-center gap-1 px-2 py-1 bg-pink-50 text-pink-700 rounded-md border border-pink-200">
                        <CheckCircle className="w-3 h-3" />
                        {tipologiaStats.total} {tipologiaStats.total === 1 ? 'classificado' : 'classificados'}
                      </span>
                      <span className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-md border border-blue-200">
                        <Brain className="w-3 h-3" />
                        {tipologiaStats.mediaConfianca}% confiança média
                      </span>
                    </div>
                  )}

                  {/* Action Buttons */}
                  {step.id === '0' && (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Botão Planilha */}
                        <button
                          onClick={() => handleStartReceita('planilha')}
                          disabled={actionLoading?.startsWith('receita')}
                          aria-label="Processar última planilha"
                          className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm"
                        >
                          {actionLoading === 'receita-planilha' ? (
                            <>
                              <Loader className="w-4 h-4 mr-2 animate-spin" />
                              Iniciando...
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Planilha
                            </>
                          )}
                        </button>

                        {/* Botão Todos */}
                        <button
                          onClick={() => handleStartReceita('all')}
                          disabled={actionLoading?.startsWith('receita')}
                          aria-label="Processar todos os clientes"
                          className="flex items-center px-4 py-2 bg-purple-800 text-white rounded-lg hover:bg-purple-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm"
                        >
                          {actionLoading === 'receita-all' ? (
                            <>
                              <Loader className="w-4 h-4 mr-2 animate-spin" />
                              Iniciando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Todos
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handlePauseResume(getQueueNameFromStepId(step.id))}
                          aria-label={`${pausedQueues[getQueueNameFromStepId(step.id)] ? 'Retomar' : 'Pausar'} processamento da fila ${step.name}`}
                          className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium shadow-sm"
                        >
                          {pausedQueues[getQueueNameFromStepId(step.id)] ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                          {pausedQueues[getQueueNameFromStepId(step.id)] ? 'Retomar' : 'Pausar'}
                        </button>

                        <button
                          onClick={() => toggleLogs(step.id)}
                          aria-label={`${showLogs[step.id] ? 'Ocultar' : 'Ver'} logs em tempo real da fila ${step.name}`}
                          aria-expanded={showLogs[step.id]}
                          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                        >
                          <Terminal className="w-4 h-4 mr-2" />
                          Ver Logs
                          {showLogs[step.id] ? (
                            <ChevronUp className="w-4 h-4 ml-1" />
                          ) : (
                            <ChevronDown className="w-4 h-4 ml-1" />
                          )}
                        </button>
                      </div>

                      {queueStatus && queueStatus.clientes.divergenciaEndereco > 0 && (
                        <div className="mt-2 flex items-center text-yellow-600 text-sm">
                          <AlertCircle className="w-4 h-4 mr-1" />
                          {queueStatus.clientes.divergenciaEndereco} cliente(s) com divergência de endereço
                        </div>
                      )}
                    </div>
                  )}

                  {step.id === '1' && (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Botão Planilha */}
                        <button
                          onClick={() => handleStartNormalization('planilha')}
                          disabled={actionLoading?.startsWith('normalization')}
                          aria-label="Normalizar última planilha"
                          className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm"
                        >
                          {actionLoading === 'normalization-planilha' ? (
                            <>
                              <Loader className="w-4 h-4 mr-2 animate-spin" />
                              Iniciando...
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Planilha
                            </>
                          )}
                        </button>

                        {/* Botão Todos */}
                        <button
                          onClick={() => handleStartNormalization('all')}
                          disabled={actionLoading?.startsWith('normalization')}
                          aria-label="Normalizar todos os clientes"
                          className="flex items-center px-4 py-2 bg-orange-800 text-white rounded-lg hover:bg-orange-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm"
                        >
                          {actionLoading === 'normalization-all' ? (
                            <>
                              <Loader className="w-4 h-4 mr-2 animate-spin" />
                              Iniciando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Todos
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handlePauseResume(getQueueNameFromStepId(step.id))}
                          aria-label={`${pausedQueues[getQueueNameFromStepId(step.id)] ? 'Retomar' : 'Pausar'} processamento da fila ${step.name}`}
                          className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium shadow-sm"
                        >
                          {pausedQueues[getQueueNameFromStepId(step.id)] ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                          {pausedQueues[getQueueNameFromStepId(step.id)] ? 'Retomar' : 'Pausar'}
                        </button>

                        <button
                          onClick={() => toggleLogs(step.id)}
                          aria-label={`${showLogs[step.id] ? 'Ocultar' : 'Ver'} logs em tempo real da fila ${step.name}`}
                          aria-expanded={showLogs[step.id]}
                          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                        >
                          <Terminal className="w-4 h-4 mr-2" />
                          Ver Logs
                          {showLogs[step.id] ? (
                            <ChevronUp className="w-4 h-4 ml-1" />
                          ) : (
                            <ChevronDown className="w-4 h-4 ml-1" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {step.id === '2' && (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Botão Planilha */}
                        <button
                          onClick={() => handleStartGeocoding('planilha')}
                          disabled={actionLoading?.startsWith('geocoding')}
                          aria-label="Geocodificar última planilha"
                          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm"
                        >
                          {actionLoading === 'geocoding-planilha' ? (
                            <>
                              <Loader className="w-4 h-4 mr-2 animate-spin" />
                              Iniciando...
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Planilha
                            </>
                          )}
                        </button>

                        {/* Botão Todos */}
                        <button
                          onClick={() => handleStartGeocoding('all')}
                          disabled={actionLoading?.startsWith('geocoding')}
                          aria-label="Geocodificar todos os clientes"
                          className="flex items-center px-4 py-2 bg-blue-800 text-white rounded-lg hover:bg-blue-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm"
                        >
                          {actionLoading === 'geocoding-all' ? (
                            <>
                              <Loader className="w-4 h-4 mr-2 animate-spin" />
                              Iniciando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Todos
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handlePauseResume(getQueueNameFromStepId(step.id))}
                          aria-label={`${pausedQueues[getQueueNameFromStepId(step.id)] ? 'Retomar' : 'Pausar'} processamento da fila ${step.name}`}
                          className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium shadow-sm"
                        >
                          {pausedQueues[getQueueNameFromStepId(step.id)] ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                          {pausedQueues[getQueueNameFromStepId(step.id)] ? 'Retomar' : 'Pausar'}
                        </button>

                        <button
                          onClick={() => toggleLogs(step.id)}
                          aria-label={`${showLogs[step.id] ? 'Ocultar' : 'Ver'} logs em tempo real da fila ${step.name}`}
                          aria-expanded={showLogs[step.id]}
                          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                        >
                          <Terminal className="w-4 h-4 mr-2" />
                          Ver Logs
                          {showLogs[step.id] ? (
                            <ChevronUp className="w-4 h-4 ml-1" />
                          ) : (
                            <ChevronDown className="w-4 h-4 ml-1" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {step.id === '3' && (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Botão Planilha */}
                        <button
                          onClick={() => handleStartPlaces('planilha')}
                          disabled={actionLoading?.startsWith('places')}
                          aria-label="Buscar Places da última planilha"
                          className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm"
                        >
                          {actionLoading === 'places-planilha' ? (
                            <>
                              <Loader className="w-4 h-4 mr-2 animate-spin" />
                              Iniciando...
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Planilha
                            </>
                          )}
                        </button>

                        {/* Botão Todos */}
                        <button
                          onClick={() => handleStartPlaces('all')}
                          disabled={actionLoading?.startsWith('places')}
                          aria-label="Buscar Places de todos os clientes"
                          className="flex items-center px-4 py-2 bg-green-800 text-white rounded-lg hover:bg-green-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm"
                        >
                          {actionLoading === 'places-all' ? (
                            <>
                              <Loader className="w-4 h-4 mr-2 animate-spin" />
                              Iniciando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Todos
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handlePauseResume(getQueueNameFromStepId(step.id))}
                          aria-label={`${pausedQueues[getQueueNameFromStepId(step.id)] ? 'Retomar' : 'Pausar'} processamento da fila ${step.name}`}
                          className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium shadow-sm"
                        >
                          {pausedQueues[getQueueNameFromStepId(step.id)] ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                          {pausedQueues[getQueueNameFromStepId(step.id)] ? 'Retomar' : 'Pausar'}
                        </button>

                        <button
                          onClick={() => toggleLogs(step.id)}
                          aria-label={`${showLogs[step.id] ? 'Ocultar' : 'Ver'} logs em tempo real da fila ${step.name}`}
                          aria-expanded={showLogs[step.id]}
                          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                        >
                          <Terminal className="w-4 h-4 mr-2" />
                          Ver Logs
                          {showLogs[step.id] ? (
                            <ChevronUp className="w-4 h-4 ml-1" />
                          ) : (
                            <ChevronDown className="w-4 h-4 ml-1" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {step.id === '4' && (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Botão Planilha */}
                        <button
                          onClick={() => handleStartAnalysis('planilha')}
                          disabled={actionLoading?.startsWith('analysis')}
                          aria-label="Analisar fotos da última planilha"
                          className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm"
                        >
                          {actionLoading === 'analysis-planilha' ? (
                            <>
                              <Loader className="w-4 h-4 mr-2 animate-spin" />
                              Iniciando...
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Planilha
                            </>
                          )}
                        </button>

                        {/* Botão Todos */}
                        <button
                          onClick={() => handleStartAnalysis('all')}
                          disabled={actionLoading?.startsWith('analysis')}
                          aria-label="Analisar fotos de todos os clientes"
                          className="flex items-center px-4 py-2 bg-purple-800 text-white rounded-lg hover:bg-purple-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm"
                        >
                          {actionLoading === 'analysis-all' ? (
                            <>
                              <Loader className="w-4 h-4 mr-2 animate-spin" />
                              Iniciando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Todos
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handlePauseResume(getQueueNameFromStepId(step.id))}
                          aria-label={`${pausedQueues[getQueueNameFromStepId(step.id)] ? 'Retomar' : 'Pausar'} processamento da fila ${step.name}`}
                          className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium shadow-sm"
                        >
                          {pausedQueues[getQueueNameFromStepId(step.id)] ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                          {pausedQueues[getQueueNameFromStepId(step.id)] ? 'Retomar' : 'Pausar'}
                        </button>

                        <button
                          onClick={() => toggleLogs(step.id)}
                          aria-label={`${showLogs[step.id] ? 'Ocultar' : 'Ver'} logs em tempo real da fila ${step.name}`}
                          aria-expanded={showLogs[step.id]}
                          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                        >
                          <Terminal className="w-4 h-4 mr-2" />
                          Ver Logs
                          {showLogs[step.id] ? (
                            <ChevronUp className="w-4 h-4 ml-1" />
                          ) : (
                            <ChevronDown className="w-4 h-4 ml-1" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {step.id === '5' && (
                    <div className="mt-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Botão Planilha */}
                        <button
                          onClick={() => handleStartTipologia('planilha')}
                          disabled={actionLoading?.startsWith('tipologia')}
                          aria-label="Classificar tipologia da última planilha"
                          className="flex items-center px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm"
                        >
                          {actionLoading === 'tipologia-planilha' ? (
                            <>
                              <Loader className="w-4 h-4 mr-2 animate-spin" />
                              Iniciando...
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 mr-2" />
                              Planilha
                            </>
                          )}
                        </button>

                        {/* Botão Todos */}
                        <button
                          onClick={() => handleStartTipologia('all')}
                          disabled={actionLoading?.startsWith('tipologia')}
                          aria-label="Classificar tipologia de todos os clientes"
                          className="flex items-center px-4 py-2 bg-pink-800 text-white rounded-lg hover:bg-pink-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium shadow-sm"
                        >
                          {actionLoading === 'tipologia-all' ? (
                            <>
                              <Loader className="w-4 h-4 mr-2 animate-spin" />
                              Iniciando...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4 mr-2" />
                              Todos
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handlePauseResume(getQueueNameFromStepId(step.id))}
                          aria-label={`${pausedQueues[getQueueNameFromStepId(step.id)] ? 'Retomar' : 'Pausar'} processamento da fila ${step.name}`}
                          className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium shadow-sm"
                        >
                          {pausedQueues[getQueueNameFromStepId(step.id)] ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                          {pausedQueues[getQueueNameFromStepId(step.id)] ? 'Retomar' : 'Pausar'}
                        </button>

                        <button
                          onClick={() => toggleLogs(step.id)}
                          aria-label={`${showLogs[step.id] ? 'Ocultar' : 'Ver'} logs em tempo real da fila ${step.name}`}
                          aria-expanded={showLogs[step.id]}
                          className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium shadow-sm"
                        >
                          <Terminal className="w-4 h-4 mr-2" />
                          Ver Logs
                          {showLogs[step.id] ? (
                            <ChevronUp className="w-4 h-4 ml-1" />
                          ) : (
                            <ChevronDown className="w-4 h-4 ml-1" />
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Collapsible Log Panel - TEMPO REAL SSE */}
              {showLogs[step.id] && (() => {
                const sseData = getSSEDataForStep(step.id);
                return (
                  <div className="mt-4 border border-gray-300 rounded-lg bg-gray-900 p-4 font-mono text-xs text-green-400 max-h-96 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2 text-white">
                      <span className="font-bold">Logs - {step.name}</span>
                      <div className="flex items-center gap-2">
                        {sseData.isConnected ? (
                          <div className="flex items-center gap-1 text-green-400">
                            <Radio className="w-3 h-3 animate-pulse" />
                            <span className="text-xs">TEMPO REAL</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-yellow-400">
                            <Loader className="w-3 h-3 animate-spin" />
                            <span className="text-xs">Conectando...</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-1">
                      {sseData.logs.length > 0 ? (
                        sseData.logs.map((log, idx) => {
                          // Determinar classe de estilo baseado no tipo
                          let logClass = 'hover:bg-gray-800 px-2 py-1 rounded transition-colors';
                          let textColor = 'text-green-400';

                          if (log.type === 'connected') {
                            logClass = 'bg-green-900 border border-green-500 px-3 py-2 rounded font-bold mb-2';
                            textColor = 'text-green-200';
                          } else if (log.type === 'error') {
                            textColor = 'text-red-400';
                          } else if (log.type === 'success') {
                            textColor = 'text-cyan-400';
                          } else if (log.type === 'processing') {
                            textColor = 'text-yellow-400';
                          } else if (log.type === 'progress') {
                            textColor = 'text-blue-300';
                          }

                          const time = new Date(log.timestamp).toLocaleTimeString('pt-BR');

                          return (
                            <div key={`${log.timestamp}-${idx}`} className={`${logClass} ${textColor}`}>
                              [{time}] {log.message}
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-gray-500 italic">
                          {sseData.isConnected ? 'Aguardando eventos...' : 'Conectando ao servidor...'}
                        </div>
                      )}
                      {sseData.error && (
                        <div className="text-red-400 bg-red-900 border border-red-500 px-3 py-2 rounded">
                          ⚠️ Erro: {sseData.error}
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

// Default export para lazy loading
export default PipelinePage;

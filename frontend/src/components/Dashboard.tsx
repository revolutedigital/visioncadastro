import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '../config/api';
import {
  Upload,
  MapPin,
  Image,
  Brain,
  TrendingUp,
  CheckCircle,
  FileSpreadsheet,
  Users,
  Activity,
  Settings,
  Award,
  RefreshCw,
  Database,
  Search,
} from 'lucide-react';
import { ScoringBreakdown } from './ScoringBreakdown';
import { VisualInsights } from './VisualInsights';
import { DataQuality } from './DataQuality';
import { TipologiaDistribuicao } from './TipologiaDistribuicao';

interface DashboardStats {
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
}

interface DashboardProps {
  onNavigate?: (view: 'dashboard' | 'upload' | 'clientes') => void;
}

interface TopCliente {
  id: string;
  nome: string;
  potencialScore: number;
  potencialCategoria: string;
  scoringBreakdown: string;
  // Sprint 2 fields
  qualidadeSinalizacao?: string;
  presencaBranding?: boolean;
  nivelProfissionalizacao?: string;
  publicoAlvo?: string;
  ambienteEstabelecimento?: string;
  indicadoresVisuais?: string;
}

interface DataQualityReport {
  overview: {
    totalClientes: number;
    mediaQualidade: number;
    excelente: number;
    alta: number;
    media: number;
    baixa: number;
  };
  topPrioridades: any[];
  camposMaisFaltando: { campo: string; total: number }[];
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [topCliente, setTopCliente] = useState<TopCliente | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [dataQualityReport, setDataQualityReport] = useState<DataQualityReport | null>(null);
  const [loadingQuality, setLoadingQuality] = useState(true);
  const [tipologiaDistribuicao, setTipologiaDistribuicao] = useState<any>(null);
  const [loadingTipologia, setLoadingTipologia] = useState(true);
  const [calculatingTipologia, setCalculatingTipologia] = useState(false);

  useEffect(() => {
    loadStats();
    loadTopCliente();
    loadDataQuality();
    loadTipologiaDistribuicao();
    const interval = setInterval(() => {
      loadStats();
      loadTopCliente();
      loadDataQuality();
      loadTipologiaDistribuicao();
    }, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
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
        enrichment: enrichment ? {
          total: enrichment.clientes.total,
          enriquecidos: enrichment.clientes.enriquecidos,
          pendentes: enrichment.clientes.pendentes,
          percentual: enrichment.clientes.percentualCompleto,
        } : undefined,
      });
      setLoading(false);
    } catch (error) {
      console.error('Erro ao carregar estatísticas:', error);
      setLoading(false);
    }
  };

  const loadTopCliente = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/analysis/clientes?status=CONCLUIDO`);
      const data = await response.json();

      if (data.success && data.clientes && data.clientes.length > 0) {
        // Ordenar por score e pegar o primeiro
        const sorted = data.clientes.sort((a: any, b: any) =>
          (b.potencialScore || 0) - (a.potencialScore || 0)
        );
        setTopCliente(sorted[0]);
      }
    } catch (error) {
      console.error('Erro ao carregar top cliente:', error);
    }
  };

  const loadDataQuality = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/data-quality/report`);
      const data = await response.json();
      setDataQualityReport(data);
      setLoadingQuality(false);
    } catch (error) {
      console.error('Erro ao carregar relatório de qualidade:', error);
      setLoadingQuality(false);
    }
  };

  const handleRecalculateScores = async () => {
    if (recalculating) return;

    setRecalculating(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/analysis/recalculate-scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (data.success) {
        alert(`Scores recalculados com sucesso! ${data.total} clientes atualizados.`);
        loadStats();
        loadTopCliente();
      } else {
        alert('Erro ao recalcular scores: ' + data.error);
      }
    } catch (error) {
      alert('Erro ao recalcular scores');
    } finally {
      setRecalculating(false);
    }
  };

  const handleStartGeocoding = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/geocoding/start`, { method: 'POST' });
      alert('Geocoding iniciado!');
    } catch (error) {
      alert('Erro ao iniciar geocoding');
    }
  };

  const handleStartPlaces = async () => {
    try {
      await fetch(`${API_BASE_URL}/api/places/start`, { method: 'POST' });
      alert('Busca no Google Places iniciada!');
    } catch (error) {
      alert('Erro ao iniciar Places');
    }
  };

  const handleStartAnalysis = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/analysis/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'batch' }),
      });
      const data = await response.json();
      if (data.success) {
        alert(`Análise de IA iniciada! ${data.total} clientes adicionados à fila.`);
        loadStats(); // Reload stats immediately
      } else {
        alert(data.message || 'Nenhum cliente pendente para análise');
      }
    } catch (error) {
      alert('Erro ao iniciar análise');
    }
  };

  const handleStartEnrichment = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/enrichment/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxQualityScore: 70 }), // Enriquecer clientes com score < 70%
      });
      const data = await response.json();
      if (data.success) {
        alert(`Enriquecimento iniciado! ${data.total} clientes adicionados à fila.`);
        loadStats();
      } else {
        alert(data.message || 'Nenhum cliente pendente para enriquecimento');
      }
    } catch (error) {
      alert('Erro ao iniciar enriquecimento');
    }
  };

  const loadTipologiaDistribuicao = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/tipologia/distribuicao`);
      const data = await response.json();
      if (data.success) {
        setTipologiaDistribuicao(data);
      }
      setLoadingTipologia(false);
    } catch (error) {
      console.error('Erro ao carregar distribuição de tipologias:', error);
      setLoadingTipologia(false);
    }
  };

  const handleCalcularTipologias = async () => {
    if (calculatingTipologia) return;

    const confirmar = window.confirm(
      'Isso irá classificar TODOS os clientes analisados usando IA. Pode levar vários minutos. Continuar?'
    );

    if (!confirmar) return;

    setCalculatingTipologia(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/tipologia/recalcular-todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await response.json();

      if (data.success) {
        alert(
          `Tipologias calculadas! ${data.processados} clientes classificados com sucesso.`
        );
        loadTipologiaDistribuicao();
      } else {
        alert('Erro ao calcular tipologias');
      }
    } catch (error) {
      alert('Erro ao calcular tipologias');
    } finally {
      setCalculatingTipologia(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  const totalClientes = stats?.geocoding.total || 0;
  const hasData = totalClientes > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <Activity className="w-8 h-8 text-indigo-600" />
                <div className="ml-3">
                  <h1 className="text-2xl font-bold text-gray-900">Sistema RAC</h1>
                  <p className="text-xs text-gray-500">Análise Inteligente de Clientes</p>
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => onNavigate ? onNavigate('upload') : navigate('/upload')}
                className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg font-medium"
              >
                <Upload className="w-5 h-5 mr-2" />
                Importar Planilha
              </button>
              {hasData && (
                <button
                  onClick={() => onNavigate ? onNavigate('clientes') : navigate('/clientes')}
                  className="flex items-center px-6 py-3 bg-white border-2 border-indigo-600 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-all font-medium"
                >
                  <Users className="w-5 h-5 mr-2" />
                  Ver Clientes
                </button>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Welcome Section */}
        {!hasData ? (
          <div className="bg-white rounded-xl shadow-lg p-12 mb-8 text-center border border-gray-100">
            <div className="max-w-2xl mx-auto">
              <FileSpreadsheet className="w-20 h-20 text-indigo-600 mx-auto mb-6" />
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Bem-vindo ao Sistema RAC
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                Comece importando uma planilha de clientes para análise automatizada com IA
              </p>
              <button
                onClick={() => onNavigate ? onNavigate('upload') : navigate('/upload')}
                className="inline-flex items-center px-8 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-lg hover:shadow-xl text-lg font-semibold"
              >
                <Upload className="w-6 h-6 mr-3" />
                Importar Primeira Planilha
              </button>
              <div className="mt-8 pt-8 border-t border-gray-200">
                <p className="text-sm text-gray-500 mb-4">O sistema irá processar automaticamente:</p>
                <div className="grid grid-cols-3 gap-4 max-w-xl mx-auto">
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <MapPin className="w-6 h-6 text-blue-600 mx-auto mb-2" />
                    <p className="text-xs font-medium text-blue-900">Geocodificação</p>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-lg">
                    <Image className="w-6 h-6 text-purple-600 mx-auto mb-2" />
                    <p className="text-xs font-medium text-purple-900">Google Places</p>
                  </div>
                  <div className="bg-indigo-50 p-4 rounded-lg">
                    <Brain className="w-6 h-6 text-indigo-600 mx-auto mb-2" />
                    <p className="text-xs font-medium text-indigo-900">Análise com IA</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              {/* Geocoding Card */}
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-blue-500 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <MapPin className="w-7 h-7 text-blue-600" />
                  </div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Fase 1
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Geocodificação</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-gray-600">Processados</span>
                    <span className="text-3xl font-bold text-gray-900">
                      {stats?.geocoding.geocodificados}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-gray-600">Total</span>
                    <span className="text-lg font-semibold text-gray-600">
                      {stats?.geocoding.total}
                    </span>
                  </div>
                  <div className="pt-2">
                    <div className="flex justify-between text-xs font-medium text-gray-600 mb-2">
                      <span>Progresso</span>
                      <span className="text-blue-600">{stats?.geocoding.percentual || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${stats?.geocoding.percentual || 0}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Places Card */}
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-purple-500 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Image className="w-7 h-7 text-purple-600" />
                  </div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Fase 2
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Google Places</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-gray-600">Processados</span>
                    <span className="text-3xl font-bold text-gray-900">
                      {stats?.places.processados}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-gray-600">Com Fotos</span>
                    <span className="text-lg font-semibold text-purple-600">
                      {stats?.places.comFotos}
                    </span>
                  </div>
                  <div className="pt-2 flex items-center justify-between text-xs">
                    <span className="text-gray-600">Total de fotos baixadas</span>
                    <span className="font-bold text-purple-600">{stats?.places.totalFotos}</span>
                  </div>
                </div>
              </div>

              {/* Analysis Card */}
              <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-indigo-500 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div className="p-3 bg-indigo-100 rounded-lg">
                    <Brain className="w-7 h-7 text-indigo-600" />
                  </div>
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Fase 3
                  </span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">Análise com IA</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-gray-600">Concluídos</span>
                    <span className="text-3xl font-bold text-gray-900">
                      {stats?.analysis.concluidos}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm text-gray-600">Fotos Analisadas</span>
                    <span className="text-lg font-semibold text-indigo-600">
                      {stats?.analysis.fotosAnalisadas}
                    </span>
                  </div>
                  <div className="pt-2">
                    <div className="flex justify-between text-xs font-medium text-gray-600 mb-2">
                      <span>Progresso</span>
                      <span className="text-indigo-600">{stats?.analysis.percentual || 0}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-indigo-500 h-2.5 rounded-full transition-all duration-500"
                        style={{ width: `${stats?.analysis.percentual || 0}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Enrichment Card */}
              {stats?.enrichment && (
                <div className="bg-white rounded-xl shadow-md p-6 border-l-4 border-green-500 hover:shadow-lg transition-shadow">
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 bg-green-100 rounded-lg">
                      <Search className="w-7 h-7 text-green-600" />
                    </div>
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Fase 4
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">Enriquecimento</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-gray-600">Enriquecidos</span>
                      <span className="text-3xl font-bold text-gray-900">
                        {stats.enrichment.enriquecidos}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-sm text-gray-600">Total</span>
                      <span className="text-lg font-semibold text-gray-600">
                        {stats.enrichment.total}
                      </span>
                    </div>
                    <div className="pt-2">
                      <div className="flex justify-between text-xs font-medium text-gray-600 mb-2">
                        <span>Progresso</span>
                        <span className="text-green-600">{stats.enrichment.percentual || 0}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                        <div
                          className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
                          style={{ width: `${stats.enrichment.percentual || 0}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="pt-2 text-xs text-gray-500 italic">
                      Multi-fonte: Web, Instagram, Facebook
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-white rounded-xl shadow-md p-6 mb-8 border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                <TrendingUp className="w-6 h-6 mr-3 text-indigo-600" />
                Ações de Processamento
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  onClick={handleStartGeocoding}
                  disabled={stats?.geocoding.pendentes === 0}
                  className="flex items-center justify-center px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  <MapPin className="w-5 h-5 mr-3" />
                  Iniciar Geocodificação
                </button>
                <button
                  onClick={handleStartPlaces}
                  disabled={stats?.geocoding.geocodificados === 0}
                  className="flex items-center justify-center px-6 py-4 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  <Image className="w-5 h-5 mr-3" />
                  Buscar no Places
                </button>
                <button
                  onClick={handleStartAnalysis}
                  disabled={
                    stats?.places.totalFotos === 0 ||
                    stats?.analysis.percentual === 100 ||
                    (stats && stats.analysis.concluidos > 0 && stats.analysis.percentual < 100)
                  }
                  className="flex items-center justify-center px-6 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  <Brain className="w-5 h-5 mr-3" />
                  {stats?.analysis.percentual === 100
                    ? 'Análise Completa ✓'
                    : (stats && stats.analysis.concluidos > 0 && stats.analysis.percentual < 100)
                    ? `Processando... (${stats.analysis.percentual}%)`
                    : 'Analisar com IA'
                  }
                </button>
                <button
                  onClick={handleStartEnrichment}
                  disabled={!stats?.enrichment || stats.enrichment.pendentes === 0}
                  className="flex flex-col items-center justify-center px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                  <div className="flex items-center">
                    <Search className="w-5 h-5 mr-3" />
                    Enriquecer Dados
                  </div>
                  {stats?.enrichment && stats.enrichment.pendentes > 0 && (
                    <span className="text-xs mt-1 opacity-90">
                      ({Math.min(50, stats.enrichment.pendentes)} clientes por vez)
                    </span>
                  )}
                </button>
              </div>
              <p className="mt-4 text-sm text-gray-500 text-center">
                Os botões serão habilitados automaticamente conforme cada etapa for completada
              </p>
            </div>

            {/* Enhanced Scoring Section */}
            {topCliente && topCliente.scoringBreakdown && (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 mb-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-gradient-to-r from-indigo-100 to-purple-100 rounded-lg">
                      <Award className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-gray-900">
                        Enhanced Scoring (Sprint 1)
                      </h2>
                      <p className="text-sm text-gray-500">
                        Sistema multi-dimensional de pontuação de clientes
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleRecalculateScores}
                    disabled={recalculating}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg text-sm font-medium"
                  >
                    <RefreshCw className={`w-4 h-4 ${recalculating ? 'animate-spin' : ''}`} />
                    {recalculating ? 'Recalculando...' : 'Recalcular Scores'}
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Descrição do Sistema */}
                  <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-6 rounded-lg border border-indigo-100">
                    <h3 className="font-semibold text-gray-900 mb-4">Como funciona:</h3>
                    <div className="space-y-3 text-sm text-gray-700">
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full mt-2 flex-shrink-0" />
                        <p>
                          <strong>Rating Google (0-15pts):</strong> Pontuação baseada nas estrelas
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 bg-purple-600 rounded-full mt-2 flex-shrink-0" />
                        <p>
                          <strong>Avaliações (0-10pts):</strong> Quantidade de reviews (escala até
                          500+)
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 bg-blue-600 rounded-full mt-2 flex-shrink-0" />
                        <p>
                          <strong>Densidade Reviews (0-10pts):</strong> Avaliações por mês
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 bg-green-600 rounded-full mt-2 flex-shrink-0" />
                        <p>
                          <strong>Horário (0-10pts):</strong> Dias e horas de funcionamento
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 bg-yellow-600 rounded-full mt-2 flex-shrink-0" />
                        <p>
                          <strong>Website (0-10pts):</strong> Presença digital
                        </p>
                      </div>
                      <div className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 bg-red-600 rounded-full mt-2 flex-shrink-0" />
                        <p>
                          <strong>Fotos IA (0-15pts):</strong> Qualidade visual identificada
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 pt-4 border-t border-indigo-200">
                      <p className="text-xs text-gray-600 font-medium">
                        Total máximo: <span className="text-indigo-600 font-bold">70 pontos</span>{' '}
                        (Sprint 1)
                      </p>
                    </div>
                  </div>

                  {/* Exemplo de Scoring */}
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">
                      Exemplo: Cliente com Melhor Score
                    </h3>
                    <div className="bg-white border border-gray-200 rounded-lg p-4">
                      <p className="text-sm font-medium text-gray-700 mb-3">{topCliente.nome}</p>
                      <ScoringBreakdown
                        scoring={JSON.parse(topCliente.scoringBreakdown)}
                        showDetails={true}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Visual Insights Sprint 2 */}
            {topCliente && (topCliente.qualidadeSinalizacao || topCliente.publicoAlvo) && (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 mb-8">
                <VisualInsights
                  qualidadeSinalizacao={topCliente.qualidadeSinalizacao}
                  presencaBranding={topCliente.presencaBranding}
                  nivelProfissionalizacao={topCliente.nivelProfissionalizacao}
                  publicoAlvo={topCliente.publicoAlvo}
                  ambienteEstabelecimento={topCliente.ambienteEstabelecimento}
                  indicadoresVisuais={topCliente.indicadoresVisuais}
                />
              </div>
            )}

            {/* Data Quality Sprint 3 */}
            {dataQualityReport && dataQualityReport.overview.totalClientes > 0 && (
              <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 mb-8">
                <DataQuality report={dataQualityReport} loading={loadingQuality} />
              </div>
            )}

            {/* Tipologia Sprint 4 */}
            <div className="bg-white rounded-xl shadow-md p-6 border border-gray-100 mb-8">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg">
                    <Activity className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      Classificação de Tipologia (Sprint 4)
                    </h2>
                    <p className="text-sm text-gray-500">
                      Identifica QUEM são os clientes e qual estratégia usar
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCalcularTipologias}
                  disabled={calculatingTipologia}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg text-sm font-medium"
                >
                  <RefreshCw className={`w-4 h-4 ${calculatingTipologia ? 'animate-spin' : ''}`} />
                  {calculatingTipologia ? 'Classificando...' : 'Classificar Tipologias'}
                </button>
              </div>

              <TipologiaDistribuicao
                distribuicao={tipologiaDistribuicao?.distribuicao || []}
                total={tipologiaDistribuicao?.total || 0}
                loading={loadingTipologia}
              />
            </div>

            {/* Pipeline Visual Expandida */}
            <div className="bg-white rounded-xl shadow-md p-8 border border-gray-100">
              <h2 className="text-xl font-bold text-gray-900 mb-8 text-center">
                Pipeline Completo de Processamento - Multi-Fonte
              </h2>

              {/* Primeira Linha: Dados Básicos */}
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wider">Fase 1: Dados Básicos</h3>
                <div className="flex items-center justify-around max-w-6xl mx-auto">
                  <div className="flex-1 text-center">
                    <div className="w-14 h-14 mx-auto mb-2 rounded-full bg-blue-100 flex items-center justify-center ring-4 ring-blue-50">
                      <MapPin className="w-7 h-7 text-blue-600" />
                    </div>
                    <p className="text-xs font-bold text-gray-900 mb-1">Geocodificação</p>
                    <p className="text-xl font-bold text-blue-600">
                      {stats?.geocoding.geocodificados}
                    </p>
                    <p className="text-xs text-gray-500">{stats?.geocoding.percentual}%</p>
                  </div>

                  <div className="flex-shrink-0 mx-3">
                    <div className="w-8 h-1 bg-gradient-to-r from-blue-300 to-purple-300 rounded"></div>
                  </div>

                  <div className="flex-1 text-center">
                    <div className="w-14 h-14 mx-auto mb-2 rounded-full bg-purple-100 flex items-center justify-center ring-4 ring-purple-50">
                      <Image className="w-7 h-7 text-purple-600" />
                    </div>
                    <p className="text-xs font-bold text-gray-900 mb-1">Google Places</p>
                    <p className="text-xl font-bold text-purple-600">
                      {stats?.places.processados}
                    </p>
                    <p className="text-xs text-gray-500">{stats?.places.totalFotos} fotos</p>
                  </div>

                  <div className="flex-shrink-0 mx-3">
                    <div className="w-8 h-1 bg-gradient-to-r from-purple-300 to-indigo-300 rounded"></div>
                  </div>

                  <div className="flex-1 text-center">
                    <div className="w-14 h-14 mx-auto mb-2 rounded-full bg-indigo-100 flex items-center justify-center ring-4 ring-indigo-50">
                      <Brain className="w-7 h-7 text-indigo-600" />
                    </div>
                    <p className="text-xs font-bold text-gray-900 mb-1">Análise IA Vision</p>
                    <p className="text-xl font-bold text-indigo-600">
                      {stats?.analysis.concluidos}
                    </p>
                    <p className="text-xs text-gray-500">{stats?.analysis.fotosAnalisadas} fotos</p>
                  </div>
                </div>
              </div>

              {/* Segunda Linha: Enriquecimento Multi-Fonte */}
              <div>
                <h3 className="text-sm font-semibold text-gray-500 mb-4 uppercase tracking-wider">Fase 2: Enriquecimento Multi-Fonte</h3>
                <div className="flex items-center justify-around max-w-6xl mx-auto">
                  <div className="flex-1 text-center">
                    <div className="w-14 h-14 mx-auto mb-2 rounded-full bg-pink-100 flex items-center justify-center ring-4 ring-pink-50">
                      <svg className="w-7 h-7 text-pink-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-gray-900 mb-1">Instagram</p>
                    <p className="text-xl font-bold text-pink-600">
                      {stats?.enrichment?.enriquecidos || 0}
                    </p>
                    <p className="text-xs text-gray-500">perfis</p>
                  </div>

                  <div className="flex-shrink-0 mx-3">
                    <div className="w-8 h-1 bg-gradient-to-r from-pink-300 to-blue-400 rounded"></div>
                  </div>

                  <div className="flex-1 text-center">
                    <div className="w-14 h-14 mx-auto mb-2 rounded-full bg-blue-100 flex items-center justify-center ring-4 ring-blue-50">
                      <svg className="w-7 h-7 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-gray-900 mb-1">Facebook</p>
                    <p className="text-xl font-bold text-blue-600">
                      {stats?.enrichment?.enriquecidos || 0}
                    </p>
                    <p className="text-xs text-gray-500">páginas</p>
                  </div>

                  <div className="flex-shrink-0 mx-3">
                    <div className="w-8 h-1 bg-gradient-to-r from-blue-400 to-green-300 rounded"></div>
                  </div>

                  <div className="flex-1 text-center">
                    <div className="w-14 h-14 mx-auto mb-2 rounded-full bg-green-100 flex items-center justify-center ring-4 ring-green-50">
                      <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                      </svg>
                    </div>
                    <p className="text-xs font-bold text-gray-900 mb-1">Website Scraping</p>
                    <p className="text-xl font-bold text-green-600">
                      {stats?.enrichment?.enriquecidos || 0}
                    </p>
                    <p className="text-xs text-gray-500">sites</p>
                  </div>

                  <div className="flex-shrink-0 mx-3">
                    <div className="w-8 h-1 bg-gradient-to-r from-green-300 to-purple-400 rounded"></div>
                  </div>

                  <div className="flex-1 text-center">
                    <div className="w-14 h-14 mx-auto mb-2 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center ring-4 ring-purple-50">
                      <Activity className="w-7 h-7 text-purple-600" />
                    </div>
                    <p className="text-xs font-bold text-gray-900 mb-1">Tipologia IA</p>
                    <p className="text-xl font-bold text-purple-600">
                      {tipologiaDistribuicao?.total || 0}
                    </p>
                    <p className="text-xs text-gray-500">classificados</p>
                  </div>
                </div>
              </div>

              {/* Resumo Geral */}
              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="grid grid-cols-4 gap-4 max-w-4xl mx-auto">
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Total Processado</p>
                    <p className="text-2xl font-bold text-gray-900">{stats?.geocoding.total}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Fotos Coletadas</p>
                    <p className="text-2xl font-bold text-purple-600">{stats?.places.totalFotos}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Analisadas por IA</p>
                    <p className="text-2xl font-bold text-indigo-600">{stats?.analysis.fotosAnalisadas}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Fontes Validadas</p>
                    <p className="text-2xl font-bold text-green-600">{stats?.enrichment?.enriquecidos || 0}</p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config/api';
import {
  MapPin,
  Star,
  Image as ImageIcon,
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  Filter,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface Analise {
  tipologiaDetalhada?: string;
  descricaoVisual?: string;
  indicadoresPotencial?: {
    score: number;
    categoria: string;
    fatoresPositivos: string[];
    fatoresNegativos: string[];
  };
  analiseGeral?: string;
  insights?: string;
}

interface Cliente {
  id: string;
  nome: string;
  endereco: string;
  cidade?: string;
  estado?: string;
  tipoEstabelecimento?: string;
  rating?: number;
  totalAvaliacoes?: number;
  potencialScore?: number;
  potencialCategoria?: string;
  latitude?: number;
  longitude?: number;
  status?: string;
  fotos?: Array<{
    id: string;
    fileName: string;
    analisadaPorIA: boolean;
    analise?: Analise;
  }>;
}

interface ClientesListProps {
  onViewDetails?: (clienteId: string) => void;
}

export function ClientesList({ onViewDetails }: ClientesListProps) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'ALTO' | 'MÉDIO' | 'BAIXO'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedAnalysis, setExpandedAnalysis] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    loadClientes();
  }, []);

  const loadClientes = async () => {
    try {
      // Buscar clientes analisados com dados de IA
      const response = await fetch(`${API_BASE_URL}/api/analysis/clientes`);
      const data = await response.json();
      if (data.success) {
        // Parse análises das fotos
        const clientesComAnalise = data.clientes.map((cliente: any) => {
          const fotosComAnalise = cliente.fotos?.map((foto: any) => {
            let analise = null;
            if (foto.analiseResultado) {
              try {
                analise = JSON.parse(foto.analiseResultado);
              } catch (e) {
                console.error('Erro ao parsear análise:', e);
              }
            }
            return { ...foto, analise };
          });
          return { ...cliente, fotos: fotosComAnalise };
        });
        setClientes(clientesComAnalise);
      }
      setLoading(false);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
      setLoading(false);
    }
  };

  const toggleAnalysisExpanded = (clienteId: string) => {
    setExpandedAnalysis((prev) => ({
      ...prev,
      [clienteId]: !prev[clienteId],
    }));
  };

  const getAnaliseConsolidada = (cliente: Cliente): Analise | null => {
    // Procurar análise consolidada (batch) nas fotos
    const analiseConsolidada = cliente.fotos?.find((f) => f.analise?.analiseGeral)?.analise;
    if (analiseConsolidada) return analiseConsolidada;

    // Se não houver, pegar a primeira análise individual
    return cliente.fotos?.find((f) => f.analise)?.analise || null;
  };

  const filteredClientes = clientes.filter((cliente) => {
    const matchesFilter =
      filter === 'all' || cliente.potencialCategoria === filter;
    const matchesSearch = cliente.nome
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const getPotencialIcon = (categoria?: string) => {
    switch (categoria) {
      case 'ALTO':
        return <TrendingUp className="w-5 h-5 text-green-600" />;
      case 'MÉDIO':
        return <Minus className="w-5 h-5 text-yellow-600" />;
      case 'BAIXO':
        return <TrendingDown className="w-5 h-5 text-red-600" />;
      default:
        return <Minus className="w-5 h-5 text-gray-400" />;
    }
  };

  const getPotencialColor = (categoria?: string) => {
    switch (categoria) {
      case 'ALTO':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'MÉDIO':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'BAIXO':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Search and Filters */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilter('ALTO')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'ALTO'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Alto
            </button>
            <button
              onClick={() => setFilter('MÉDIO')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'MÉDIO'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Médio
            </button>
            <button
              onClick={() => setFilter('BAIXO')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filter === 'BAIXO'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Baixo
            </button>
          </div>
        </div>

        <div className="mt-4 text-sm text-gray-600">
          Mostrando {filteredClientes.length} de {clientes.length} clientes
        </div>
      </div>

      {/* Clientes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredClientes.map((cliente) => (
          <div
            key={cliente.id}
            className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-bold text-gray-900 flex-1">
                  {cliente.nome}
                </h3>
                {cliente.potencialCategoria && (
                  <div
                    className={`flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getPotencialColor(
                      cliente.potencialCategoria
                    )}`}
                  >
                    {getPotencialIcon(cliente.potencialCategoria)}
                    <span className="ml-1">{cliente.potencialCategoria}</span>
                  </div>
                )}
              </div>

              {/* Location */}
              <div className="flex items-start text-sm text-gray-600 mb-2">
                <MapPin className="w-4 h-4 mr-1 flex-shrink-0 mt-0.5" />
                <span className="line-clamp-2">
                  {cliente.endereco}
                  {cliente.cidade && `, ${cliente.cidade}`}
                  {cliente.estado && ` - ${cliente.estado}`}
                </span>
              </div>

              {/* Type */}
              {cliente.tipoEstabelecimento && (
                <div className="inline-block px-3 py-1 bg-purple-100 text-purple-800 text-xs rounded-full">
                  {cliente.tipoEstabelecimento}
                </div>
              )}
            </div>

            {/* Stats */}
            <div className="p-6 space-y-3">
              {/* Rating */}
              {cliente.rating && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Rating</span>
                  <div className="flex items-center">
                    <Star className="w-4 h-4 text-yellow-500 fill-current mr-1" />
                    <span className="font-semibold text-gray-900">
                      {cliente.rating.toFixed(1)}
                    </span>
                    <span className="text-xs text-gray-500 ml-1">
                      ({cliente.totalAvaliacoes})
                    </span>
                  </div>
                </div>
              )}

              {/* Potencial Score */}
              {cliente.potencialScore !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Score</span>
                  <div className="flex items-center">
                    <div className="w-24 bg-gray-200 rounded-full h-2 mr-2">
                      <div
                        className={`h-2 rounded-full ${
                          cliente.potencialCategoria === 'ALTO'
                            ? 'bg-green-500'
                            : cliente.potencialCategoria === 'MÉDIO'
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${cliente.potencialScore}%` }}
                      ></div>
                    </div>
                    <span className="font-semibold text-gray-900">
                      {cliente.potencialScore}
                    </span>
                  </div>
                </div>
              )}

              {/* AI Analysis Summary */}
              {(() => {
                const analise = getAnaliseConsolidada(cliente);
                const hasAnalysis =
                  analise?.indicadoresPotencial || analise?.analiseGeral;

                if (!hasAnalysis) return null;

                const isExpanded = expandedAnalysis[cliente.id];
                const indicadores = analise?.indicadoresPotencial;

                return (
                  <div className="border-t pt-3 mt-3">
                    <button
                      onClick={() => toggleAnalysisExpanded(cliente.id)}
                      className="w-full flex items-center justify-between text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                    >
                      <div className="flex items-center">
                        <Brain className="w-4 h-4 mr-1" />
                        <span>Análise de IA</span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="mt-3 space-y-2 text-sm">
                        {/* Score explanation */}
                        {indicadores && (
                          <div className="bg-gray-50 rounded-lg p-3">
                            <div className="font-medium text-gray-700 mb-2">
                              Score: {indicadores.score}/100 ({indicadores.categoria})
                            </div>

                            {/* Positive factors */}
                            {indicadores.fatoresPositivos?.length > 0 && (
                              <div className="mb-2">
                                <div className="text-xs font-medium text-green-700 mb-1">
                                  Fatores Positivos:
                                </div>
                                <ul className="text-xs text-gray-600 space-y-0.5">
                                  {indicadores.fatoresPositivos.map((fator, idx) => (
                                    <li key={idx} className="flex items-start">
                                      <span className="text-green-500 mr-1">✓</span>
                                      <span>{fator}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Negative factors */}
                            {indicadores.fatoresNegativos?.length > 0 && (
                              <div>
                                <div className="text-xs font-medium text-red-700 mb-1">
                                  Pontos de Atenção:
                                </div>
                                <ul className="text-xs text-gray-600 space-y-0.5">
                                  {indicadores.fatoresNegativos.map((fator, idx) => (
                                    <li key={idx} className="flex items-start">
                                      <span className="text-red-500 mr-1">⚠</span>
                                      <span>{fator}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        {/* General analysis for batch mode */}
                        {analise?.analiseGeral && !indicadores && (
                          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700">
                            {analise.analiseGeral.substring(0, 150)}
                            {analise.analiseGeral.length > 150 && '...'}
                          </div>
                        )}

                        {/* Insights */}
                        {analise?.insights && (
                          <div className="bg-indigo-50 rounded-lg p-3">
                            <div className="text-xs font-medium text-indigo-700 mb-1">
                              <Info className="w-3 h-3 inline mr-1" />
                              Insights:
                            </div>
                            <p className="text-xs text-gray-700">
                              {analise.insights.substring(0, 120)}
                              {analise.insights.length > 120 && '...'}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Fotos */}
              {cliente.fotos && cliente.fotos.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Fotos</span>
                  <div className="flex items-center">
                    <ImageIcon className="w-4 h-4 text-purple-500 mr-1" />
                    <span className="font-semibold text-gray-900">
                      {cliente.fotos.length}
                    </span>
                    {cliente.fotos.some((f) => f.analisadaPorIA) && (
                      <Brain className="w-4 h-4 text-indigo-500 ml-2" />
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="px-6 pb-6">
              <button
                onClick={() => onViewDetails?.(cliente.id)}
                className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
              >
                Ver Detalhes
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Empty State */}
      {filteredClientes.length === 0 && (
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <div className="text-gray-400 mb-4">
            <Search className="w-16 h-16 mx-auto" />
          </div>
          <h3 className="text-xl font-semibold text-gray-700 mb-2">
            Nenhum cliente encontrado
          </h3>
          <p className="text-gray-500">
            Tente ajustar os filtros ou buscar por outro termo
          </p>
        </div>
      )}
    </div>
  );
}

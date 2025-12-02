import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config/api';
import {
  Search,
  Filter,
  TrendingUp,
  Minus,
  TrendingDown,
  MapPin,
  Star,
  Image as ImageIcon,
  Brain,
  ChevronDown,
  ChevronUp,
  Loader,
} from 'lucide-react';

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
  status?: string;
  tipologia?: string;
  tipologiaNome?: string;
  tipologiaConfianca?: number;
  dataQualityScore?: number;
  confiabilidadeDados?: string;
  fotos?: Array<{
    id: string;
    fileName: string;
    analisadaPorIA: boolean;
    analise?: any;
  }>;
}

export function ClientesPage() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPotencial, setFilterPotencial] = useState<'all' | 'ALTO' | 'MÉDIO' | 'BAIXO'>('all');
  const [filterCidade, setFilterCidade] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'nome' | 'score' | 'rating'>('score');
  const [showFilters, setShowFilters] = useState(false);

  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => {
    loadClientes();
  }, []);

  const loadClientes = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/analysis/clientes`);
      const data = await response.json();
      if (data.success) {
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

  // Extrair cidades únicas
  const cidades = Array.from(
    new Set(clientes.map((c) => c.cidade).filter(Boolean))
  ).sort() as string[];

  // Filtrar e ordenar
  const filteredClientes = clientes
    .filter((cliente) => {
      const matchesSearch = cliente.nome
        .toLowerCase()
        .includes(searchTerm.toLowerCase()) ||
        cliente.endereco?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesPotencial =
        filterPotencial === 'all' || cliente.potencialCategoria === filterPotencial;

      const matchesCidade =
        filterCidade === 'all' || cliente.cidade === filterCidade;

      return matchesSearch && matchesPotencial && matchesCidade;
    })
    .sort((a, b) => {
      if (sortBy === 'nome') {
        return a.nome.localeCompare(b.nome);
      } else if (sortBy === 'score') {
        return (b.potencialScore || 0) - (a.potencialScore || 0);
      } else if (sortBy === 'rating') {
        return (b.rating || 0) - (a.rating || 0);
      }
      return 0;
    });

  // Paginação
  const totalPages = Math.ceil(filteredClientes.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedClientes = filteredClientes.slice(
    startIndex,
    startIndex + itemsPerPage
  );

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
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <Loader className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header & Filters */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex flex-col space-y-4">
          {/* Search & Filter Toggle */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nome ou endereço..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <Filter className="w-5 h-5 mr-2" />
              Filtros
              {showFilters ? (
                <ChevronUp className="w-4 h-4 ml-2" />
              ) : (
                <ChevronDown className="w-4 h-4 ml-2" />
              )}
            </button>
          </div>

          {/* Advanced Filters */}
          {showFilters && (
            <div className="pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Potencial */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Potencial
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setFilterPotencial('all');
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      filterPotencial === 'all'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => {
                      setFilterPotencial('ALTO');
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      filterPotencial === 'ALTO'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Alto
                  </button>
                  <button
                    onClick={() => {
                      setFilterPotencial('MÉDIO');
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      filterPotencial === 'MÉDIO'
                        ? 'bg-yellow-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Médio
                  </button>
                  <button
                    onClick={() => {
                      setFilterPotencial('BAIXO');
                      setCurrentPage(1);
                    }}
                    className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                      filterPotencial === 'BAIXO'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Baixo
                  </button>
                </div>
              </div>

              {/* Cidade */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Cidade
                </label>
                <select
                  value={filterCidade}
                  onChange={(e) => {
                    setFilterCidade(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="all">Todas</option>
                  {cidades.map((cidade) => (
                    <option key={cidade} value={cidade}>
                      {cidade}
                    </option>
                  ))}
                </select>
              </div>

              {/* Ordenação */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ordenar por
                </label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="score">Score (maior primeiro)</option>
                  <option value="rating">Avaliação (maior primeiro)</option>
                  <option value="nome">Nome (A-Z)</option>
                </select>
              </div>
            </div>
          )}

          {/* Results count */}
          <div className="text-sm text-gray-600">
            Mostrando {paginatedClientes.length} de {filteredClientes.length} clientes
            {filteredClientes.length !== clientes.length && ` (${clientes.length} total)`}
          </div>
        </div>
      </div>

      {/* Clientes Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {paginatedClientes.map((cliente) => (
          <div
            key={cliente.id}
            className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow overflow-hidden cursor-pointer"
            onClick={() => navigate(`/clientes/${cliente.id}`)}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-lg font-bold text-gray-900 flex-1 line-clamp-2">
                  {cliente.nome}
                </h3>
                {cliente.potencialCategoria && (
                  <div
                    className={`flex items-center px-2 py-1 rounded-full text-xs font-medium border ml-2 ${getPotencialColor(
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
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Anterior
            </button>

            <div className="flex items-center space-x-2">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((page) => {
                  // Mostrar primeira, última, atual, e adjacentes
                  return (
                    page === 1 ||
                    page === totalPages ||
                    Math.abs(page - currentPage) <= 1
                  );
                })
                .map((page, idx, arr) => {
                  // Adicionar "..." se houver gap
                  const prevPage = arr[idx - 1];
                  const showEllipsis = prevPage && page - prevPage > 1;

                  return (
                    <div key={page} className="flex items-center space-x-2">
                      {showEllipsis && <span className="text-gray-400">...</span>}
                      <button
                        onClick={() => setCurrentPage(page)}
                        className={`w-10 h-10 rounded-lg transition-colors ${
                          currentPage === page
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {page}
                      </button>
                    </div>
                  );
                })}
            </div>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Próxima
            </button>
          </div>

          <div className="text-center mt-2 text-sm text-gray-600">
            Página {currentPage} de {totalPages}
          </div>
        </div>
      )}

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

// Default export para lazy loading
export default ClientesPage;

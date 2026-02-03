import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../utils/api';
import {
  Search, Filter, TrendingUp, Minus, TrendingDown, MapPin, Star,
  Image as ImageIcon, Brain, ChevronDown, ChevronUp, Loader,
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
  fotos?: Array<{ id: string; fileName: string; analisadaPorIA: boolean; analise?: any }>;
}

export function ClientesPage() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPotencial, setFilterPotencial] = useState<'all' | 'ALTO' | 'MÉDIO' | 'BAIXO'>('all');
  const [filterCidade, setFilterCidade] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'nome' | 'score' | 'rating'>('score');
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;

  useEffect(() => { loadClientes(); }, []);

  const loadClientes = async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/analysis/clientes`);
      const data = await response.json();
      if (data.success) {
        const clientesComAnalise = data.clientes.map((cliente: any) => {
          const fotosComAnalise = cliente.fotos?.map((foto: any) => {
            let analise = null;
            if (foto.analiseResultado) {
              try { analise = JSON.parse(foto.analiseResultado); } catch {}
            }
            return { ...foto, analise };
          });
          return { ...cliente, fotos: fotosComAnalise };
        });
        setClientes(clientesComAnalise);
      }
      setLoading(false);
    } catch { setLoading(false); }
  };

  const cidades = Array.from(new Set(clientes.map((c) => c.cidade).filter(Boolean))).sort() as string[];

  const filteredClientes = clientes
    .filter((c) => {
      const s = searchTerm.toLowerCase();
      return (c.nome.toLowerCase().includes(s) || c.endereco?.toLowerCase().includes(s))
        && (filterPotencial === 'all' || c.potencialCategoria === filterPotencial)
        && (filterCidade === 'all' || c.cidade === filterCidade);
    })
    .sort((a, b) => {
      if (sortBy === 'nome') return a.nome.localeCompare(b.nome);
      if (sortBy === 'score') return (b.potencialScore || 0) - (a.potencialScore || 0);
      return (b.rating || 0) - (a.rating || 0);
    });

  const totalPages = Math.ceil(filteredClientes.length / itemsPerPage);
  const paginatedClientes = filteredClientes.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const getBadgeClass = (cat?: string) => {
    if (cat === 'ALTO') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (cat === 'MÉDIO') return 'bg-amber-50 text-amber-700 border-amber-200';
    if (cat === 'BAIXO') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-zinc-50 text-zinc-600 border-zinc-200';
  };

  const getPotencialIcon = (cat?: string) => {
    if (cat === 'ALTO') return <TrendingUp className="w-3.5 h-3.5" />;
    if (cat === 'BAIXO') return <TrendingDown className="w-3.5 h-3.5" />;
    return <Minus className="w-3.5 h-3.5" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-6 h-6 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest p-5">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Buscar por nome ou endereço..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="w-full pl-9 pr-4 py-2 border border-[#E5E5EA] rounded-lg text-sm focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 placeholder:text-zinc-400"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-3 py-2 bg-surface-secondary hover:bg-zinc-200 rounded-lg transition-colors text-sm font-medium text-zinc-700"
            >
              <Filter className="w-4 h-4" />
              Filtros
              {showFilters ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {showFilters && (
            <div className="pt-3 border-t border-[#E5E5EA] grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">Potencial</label>
                <div className="flex gap-1.5">
                  {(['all', 'ALTO', 'MÉDIO', 'BAIXO'] as const).map((val) => (
                    <button
                      key={val}
                      onClick={() => { setFilterPotencial(val); setCurrentPage(1); }}
                      className={`px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                        filterPotencial === val
                          ? 'bg-indigo-600 text-white'
                          : 'bg-surface-secondary text-zinc-600 hover:bg-zinc-200'
                      }`}
                    >
                      {val === 'all' ? 'Todos' : val === 'ALTO' ? 'Alto' : val === 'MÉDIO' ? 'Médio' : 'Baixo'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">Cidade</label>
                <select
                  value={filterCidade}
                  onChange={(e) => { setFilterCidade(e.target.value); setCurrentPage(1); }}
                  className="w-full px-3 py-1.5 border border-[#E5E5EA] rounded-lg text-sm focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="all">Todas</option>
                  {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-zinc-700 mb-1.5">Ordenar por</label>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="w-full px-3 py-1.5 border border-[#E5E5EA] rounded-lg text-sm focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="score">Score (maior)</option>
                  <option value="rating">Avaliação (maior)</option>
                  <option value="nome">Nome (A-Z)</option>
                </select>
              </div>
            </div>
          )}

          <p className="text-[13px] text-zinc-500">
            Mostrando {paginatedClientes.length} de {filteredClientes.length} clientes
            {filteredClientes.length !== clientes.length && ` (${clientes.length} total)`}
          </p>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {paginatedClientes.map((cliente) => (
          <div
            key={cliente.id}
            className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest hover:shadow-hover transition-shadow cursor-pointer overflow-hidden"
            onClick={() => navigate(`/clientes/${cliente.id}`)}
          >
            <div className="p-5">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold text-zinc-900 flex-1 line-clamp-2 leading-snug">{cliente.nome}</h3>
                {cliente.potencialCategoria && (
                  <span className={`inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full text-[11px] font-medium border ${getBadgeClass(cliente.potencialCategoria)}`}>
                    {getPotencialIcon(cliente.potencialCategoria)}
                    {cliente.potencialCategoria}
                  </span>
                )}
              </div>

              <div className="flex items-start gap-1.5 text-[13px] text-zinc-500 mb-3">
                <MapPin className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span className="line-clamp-2">
                  {cliente.endereco}{cliente.cidade && `, ${cliente.cidade}`}{cliente.estado && ` - ${cliente.estado}`}
                </span>
              </div>

              {cliente.tipoEstabelecimento && (
                <span className="inline-block px-2 py-0.5 bg-violet-50 text-violet-700 text-[11px] font-medium rounded-full border border-violet-200">
                  {cliente.tipoEstabelecimento}
                </span>
              )}
            </div>

            <div className="px-5 pb-4 space-y-2 border-t border-[#E5E5EA] pt-3">
              {cliente.rating && (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-zinc-500">Rating</span>
                  <div className="flex items-center gap-1">
                    <Star className="w-3.5 h-3.5 text-amber-500 fill-current" />
                    <span className="text-sm font-medium text-zinc-900">{cliente.rating.toFixed(1)}</span>
                    <span className="text-[11px] text-zinc-400">({cliente.totalAvaliacoes})</span>
                  </div>
                </div>
              )}

              {cliente.potencialScore !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-zinc-500">Score</span>
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-zinc-100 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full ${
                          cliente.potencialCategoria === 'ALTO' ? 'bg-emerald-500'
                            : cliente.potencialCategoria === 'MÉDIO' ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${cliente.potencialScore}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium font-mono text-zinc-900">{cliente.potencialScore}</span>
                  </div>
                </div>
              )}

              {cliente.fotos && cliente.fotos.length > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-zinc-500">Fotos</span>
                  <div className="flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-violet-500" />
                    <span className="text-sm font-medium text-zinc-900">{cliente.fotos.length}</span>
                    {cliente.fotos.some((f) => f.analisadaPorIA) && <Brain className="w-3.5 h-3.5 text-indigo-500" />}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 bg-surface-secondary text-zinc-700 rounded-lg hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              Anterior
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                .map((page, idx, arr) => {
                  const prev = arr[idx - 1];
                  const showEllipsis = prev && page - prev > 1;
                  return (
                    <div key={page} className="flex items-center gap-1">
                      {showEllipsis && <span className="text-zinc-400 text-sm px-1">...</span>}
                      <button
                        onClick={() => setCurrentPage(page)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          currentPage === page ? 'bg-indigo-600 text-white' : 'bg-surface-secondary text-zinc-700 hover:bg-zinc-200'
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
              className="px-3 py-1.5 bg-surface-secondary text-zinc-700 rounded-lg hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
            >
              Próxima
            </button>
          </div>
          <p className="text-center mt-2 text-[13px] text-zinc-500">Página {currentPage} de {totalPages}</p>
        </div>
      )}

      {filteredClientes.length === 0 && (
        <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest p-10 text-center">
          <Search className="w-10 h-10 text-zinc-300 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-zinc-700 mb-1">Nenhum cliente encontrado</h3>
          <p className="text-[13px] text-zinc-500">Tente ajustar os filtros ou buscar por outro termo</p>
        </div>
      )}
    </div>
  );
}

export default ClientesPage;

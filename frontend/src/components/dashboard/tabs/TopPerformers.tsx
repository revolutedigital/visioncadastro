import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../../config/api';
import { useNavigate } from 'react-router-dom';
import { Award, TrendingUp, Eye, ExternalLink } from 'lucide-react';
import { logger } from '../../../utils/logger';

interface Cliente {
  id: string;
  nome: string;
  potencialScore: number;
  potencialCategoria: string;
  tipologia?: string;
  rating?: number;
  totalReviews?: number;
}

function TopPerformers() {
  const navigate = useNavigate();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTopPerformers();
  }, []);

  const loadTopPerformers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/analysis/clientes?status=CONCLUIDO`);
      const data = await response.json();

      if (data.success && data.clientes) {
        const sorted = data.clientes
          .sort((a: any, b: any) => (b.potencialScore || 0) - (a.potencialScore || 0))
          .slice(0, 10);

        setClientes(sorted);
      }
      setLoading(false);
    } catch (error) {
      logger.error('Erro ao carregar top performers', error as Error);
      setLoading(false);
    }
  };

  const getCategoriaColor = (categoria: string) => {
    switch (categoria?.toUpperCase()) {
      case 'ALTO':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'MÉDIO':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'BAIXO':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse bg-gray-100 rounded-lg p-4 h-20" />
        ))}
      </div>
    );
  }

  if (clientes.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <Award className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 font-medium">Nenhum cliente analisado ainda</p>
        <p className="text-sm text-gray-500 mt-1">Comece processando clientes para ver os melhores</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Top 10 Clientes por Score</h3>
          <p className="text-sm text-gray-500">Classificados pelo potencial de negócio</p>
        </div>
        <button
          onClick={() => navigate('/clientes')}
          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1"
          aria-label="Ver todos os clientes"
        >
          Ver Todos
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2">
        {clientes.map((cliente, index) => (
          <div
            key={cliente.id}
            className="flex items-center gap-4 p-4 bg-gradient-to-r from-gray-50 to-white rounded-lg border border-gray-200 hover:shadow-md transition-all group cursor-pointer"
            onClick={() => navigate(`/clientes/${cliente.id}`)}
          >
            {/* Medal/Ranking */}
            <div className="flex-shrink-0">
              {index < 3 ? (
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                    index === 0
                      ? 'bg-gradient-to-br from-yellow-400 to-yellow-600'
                      : index === 1
                      ? 'bg-gradient-to-br from-gray-300 to-gray-500'
                      : 'bg-gradient-to-br from-orange-400 to-orange-600'
                  }`}
                >
                  {index + 1}
                </div>
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center font-bold text-gray-600">
                  {index + 1}
                </div>
              )}
            </div>

            {/* Cliente Info */}
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-gray-900 truncate group-hover:text-indigo-600 transition-colors">
                {cliente.nome}
              </h4>
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                {cliente.tipologia && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-medium">
                    {cliente.tipologia}
                  </span>
                )}
                {cliente.rating && (
                  <span className="flex items-center gap-1">
                    ⭐ {cliente.rating.toFixed(1)}
                  </span>
                )}
                {cliente.totalReviews && <span>({cliente.totalReviews} reviews)</span>}
              </div>
            </div>

            {/* Score */}
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-2xl font-bold text-indigo-600">{cliente.potencialScore}</p>
                <p className="text-xs text-gray-500">pontos</p>
              </div>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold border ${getCategoriaColor(
                  cliente.potencialCategoria
                )}`}
              >
                {cliente.potencialCategoria?.toUpperCase()}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/clientes/${cliente.id}`);
                }}
                className="p-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-all opacity-0 group-hover:opacity-100"
                aria-label="Ver detalhes do cliente"
              >
                <Eye className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TopPerformers;

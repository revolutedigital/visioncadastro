import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, LayoutGrid, Image, Brain, Clock, Loader, Shield } from 'lucide-react';
import { VisaoGeral } from './tabs/VisaoGeral';
import { FotosTab } from './tabs/FotosTab';
import { AnaliseIATab } from './tabs/AnaliseIATab';
import { ConfiabilidadeTab } from './tabs/ConfiabilidadeTab';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../utils/api';

type TabId = 'visao-geral' | 'fotos' | 'analise-ia' | 'confiabilidade' | 'historico';

interface ClienteData {
  nome: string;
  endereco: string;
  cidade?: string;
  estado?: string;
  telefone?: string;
  tipoEstabelecimento?: string;
  rating?: number;
  totalAvaliacoes?: number;
  potencialCategoria?: string;
  potencialScore?: number;
  status?: string;
  website?: string;
  redesSociais?: string;
  tipologia?: string;
  tipologiaNome?: string;
  tipologiaConfianca?: number;
  tipologiaJustificativa?: string;
  estrategiaComercial?: string;
  dataQualityScore?: number;
  confiabilidadeDados?: string;
  scoringBreakdown?: string;
}

interface Foto {
  id: string;
  fileName: string;
  ordem: number;
  analisadaPorIA: boolean;
  analise?: any;
  analiseEm?: string;
}

export function ClienteDetalhesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabId>('visao-geral');
  const [loading, setLoading] = useState(true);
  const [cliente, setCliente] = useState<ClienteData | null>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [analiseConsolidada, setAnaliseConsolidada] = useState<any>(null);
  const [totalFotos, setTotalFotos] = useState(0);
  const [fotosAnalisadas, setFotosAnalisadas] = useState(0);

  useEffect(() => {
    if (!id) {
      navigate('/clientes');
      return;
    }
    loadCliente();
  }, [id]);

  const loadCliente = async () => {
    try {
      const response = await authFetch(
        `${API_BASE_URL}/api/analysis/${id}/resultado`
      );
      const data = await response.json();
      if (data.success) {
        setCliente(data.cliente);
        setFotos(data.fotos || []);
        setAnaliseConsolidada(data.analiseConsolidada);
        setTotalFotos(data.totalFotos || 0);
        setFotosAnalisadas(data.fotosAnalisadas || 0);
      }
      setLoading(false);
    } catch (error) {
      console.error('Erro ao carregar cliente:', error);
      setLoading(false);
    }
  };

  const tabs = [
    {
      id: 'visao-geral' as TabId,
      label: 'Visão Geral',
      icon: LayoutGrid,
    },
    {
      id: 'fotos' as TabId,
      label: 'Fotos',
      icon: Image,
      badge: totalFotos,
    },
    {
      id: 'analise-ia' as TabId,
      label: 'Análise IA',
      icon: Brain,
      badge: fotosAnalisadas > 0 ? `${fotosAnalisadas}/${totalFotos}` : undefined,
    },
    {
      id: 'confiabilidade' as TabId,
      label: 'Confiabilidade',
      icon: Shield,
    },
    {
      id: 'historico' as TabId,
      label: 'Histórico',
      icon: Clock,
    },
  ];

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <Loader className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      </div>
    );
  }

  if (!cliente) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-md p-12 text-center">
          <h3 className="text-lg font-semibold text-gray-700">Cliente não encontrado</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <button
          onClick={() => navigate('/clientes')}
          className="mb-4 flex items-center text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Voltar para Clientes
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {cliente.nome}
            </h1>
            <p className="text-gray-600">{cliente.endereco}</p>
            {(cliente.cidade || cliente.estado) && (
              <p className="text-sm text-gray-500">
                {cliente.cidade}
                {cliente.cidade && cliente.estado && ', '}
                {cliente.estado}
              </p>
            )}
          </div>

          {cliente.potencialCategoria && (
            <div
              className={`px-4 py-2 rounded-lg font-semibold ${
                cliente.potencialCategoria === 'ALTO'
                  ? 'bg-green-100 text-green-800'
                  : cliente.potencialCategoria === 'MÉDIO'
                  ? 'bg-yellow-100 text-yellow-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              Potencial {cliente.potencialCategoria}
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-md">
        <div className="border-b border-gray-200">
          <nav className="flex space-x-1 p-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-6 py-3 text-sm font-medium rounded-t-lg transition-all ${
                  activeTab === tab.id
                    ? 'bg-indigo-50 text-indigo-700 border-b-2 border-indigo-600'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-4 h-4 mr-2" />
                {tab.label}
                {tab.badge && (
                  <span
                    className={`ml-2 px-2 py-0.5 rounded-full text-xs ${
                      activeTab === tab.id
                        ? 'bg-indigo-200 text-indigo-800'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'visao-geral' && <VisaoGeral cliente={cliente} />}
          {activeTab === 'fotos' && <FotosTab fotos={fotos} />}
          {activeTab === 'analise-ia' && (
            <AnaliseIATab
              analiseConsolidada={analiseConsolidada}
              fotosAnalisadas={fotosAnalisadas}
              totalFotos={totalFotos}
            />
          )}
          {activeTab === 'confiabilidade' && id && (
            <ConfiabilidadeTab clienteId={id} />
          )}
          {activeTab === 'historico' && (
            <div className="text-center py-12">
              <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-700 mb-2">
                Histórico em construção
              </h3>
              <p className="text-gray-500">
                Timeline de processamento será implementada em breve
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Default export para lazy loading
export default ClienteDetalhesPage;

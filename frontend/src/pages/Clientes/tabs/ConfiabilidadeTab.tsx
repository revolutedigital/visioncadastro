import { useEffect, useState } from 'react';
import {
  Shield,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Database,
  FileText,
  MapPin,
  Building2,
  Phone,
  Eye,
  ChevronDown,
  ChevronUp,
  Info,
} from 'lucide-react';
import { API_BASE_URL } from '../../../config/api';
import { authFetch } from '../../../utils/api';

interface CampoFonte {
  campo: string;
  label: string;
  valor: any;
  fonte: string;
  fonteSecundaria?: string;
  confianca: number;
  validado: boolean;
  divergencia?: string;
}

interface ContextoArcaAnalyst {
  cliente: {
    id: string;
    documentoAncora: string;
    tipoDocumento: 'CNPJ' | 'CPF' | 'INVALIDO';
  };
  mapaFontes: Record<string, CampoFonte>;
  resumo: {
    scoreGeral: number;
    classificacao: 'BAIXA' | 'MEDIA' | 'ALTA' | 'EXCELENTE';
    fontePrincipal: string;
    fontesValidadas: string[];
    camposConfiados: number;
    camposTotais: number;
    alertas: string[];
    divergencias: string[];
  };
  dadosPlanilha: {
    nome?: string | null;
    endereco?: string | null;
    telefone?: string | null;
    cidade?: string | null;
    estado?: string | null;
  };
}

interface ConfiabilidadeTabProps {
  clienteId: string;
}

const FONTE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  PLANILHA: { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-300' },
  CNPJA: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  SERPRO: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300' },
  GOOGLE_GEOCODING: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  GOOGLE_PLACES: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300' },
  CLAUDE_VISION: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300' },
  VALIDACAO_CRUZADA: { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-300' },
};

const FONTE_LABELS: Record<string, string> = {
  PLANILHA: 'Planilha',
  CNPJA: 'CNPJA (Receita)',
  SERPRO: 'SERPRO (CPF)',
  GOOGLE_GEOCODING: 'Google Geocoding',
  GOOGLE_PLACES: 'Google Places',
  CLAUDE_VISION: 'Claude Vision (IA)',
  VALIDACAO_CRUZADA: 'Validado',
};

const CATEGORIA_CAMPOS: Record<string, string[]> = {
  'Identificacao': ['documento', 'tipoDocumento'],
  'Dados Cadastrais': ['nome', 'razaoSocial', 'nomeFantasia'],
  'Localizacao': ['endereco', 'enderecoNormalizado', 'cidade', 'estado', 'cep', 'latitude', 'longitude'],
  'Comercial': ['situacaoReceita', 'simplesNacional', 'quadroSocietario', 'rating', 'totalAvaliacoes'],
  'Contato': ['telefone', 'website'],
  'Visual': ['analiseVisual'],
};

export function ConfiabilidadeTab({ clienteId }: ConfiabilidadeTabProps) {
  const [contexto, setContexto] = useState<ContextoArcaAnalyst | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Identificacao', 'Dados Cadastrais']));

  useEffect(() => {
    loadContexto();
  }, [clienteId]);

  const loadContexto = async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/data-quality/${clienteId}/contexto-arca`);
      const data = await response.json();
      setContexto(data);
    } catch (error) {
      console.error('Erro ao carregar contexto:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (cat: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(cat)) {
      newSet.delete(cat);
    } else {
      newSet.add(cat);
    }
    setExpandedCategories(newSet);
  };

  const getClassificacaoStyles = (classificacao: string) => {
    switch (classificacao) {
      case 'EXCELENTE':
        return 'bg-gradient-to-r from-emerald-500 to-green-600 text-white';
      case 'ALTA':
        return 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white';
      case 'MEDIA':
        return 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white';
      case 'BAIXA':
        return 'bg-gradient-to-r from-red-500 to-rose-600 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  const getConfiancaColor = (confianca: number) => {
    if (confianca >= 90) return 'text-emerald-600';
    if (confianca >= 75) return 'text-blue-600';
    if (confianca >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfiancaBar = (confianca: number) => {
    if (confianca >= 90) return 'bg-emerald-500';
    if (confianca >= 75) return 'bg-blue-500';
    if (confianca >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!contexto) {
    return (
      <div className="text-center py-12">
        <XCircle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500">Erro ao carregar dados de confiabilidade</p>
      </div>
    );
  }

  const { resumo, mapaFontes, dadosPlanilha } = contexto;

  return (
    <div className="space-y-6">
      {/* Header com Score */}
      <div className={`rounded-xl p-6 ${getClassificacaoStyles(resumo.classificacao)}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-white/20 rounded-xl">
              <Shield className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-2xl font-bold">Confiabilidade {resumo.classificacao}</h3>
              <p className="opacity-90">
                {resumo.camposConfiados} de {resumo.camposTotais} campos validados por fontes externas
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-5xl font-bold">{resumo.scoreGeral}%</p>
            <p className="text-sm opacity-75">Score de Confianca</p>
          </div>
        </div>
      </div>

      {/* Principio Fundamental */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-800">Principio Fundamental</p>
            <p className="text-sm text-amber-700">
              O unico dado confiavel da planilha e o <strong>CNPJ/CPF</strong>.
              Todo o restante (nome, endereco, telefone) deve ser validado por fontes externas
              como CNPJA, Google ou SERPRO.
            </p>
          </div>
        </div>
      </div>

      {/* Alertas */}
      {resumo.alertas.length > 0 && (
        <div className="space-y-2">
          {resumo.alertas.map((alerta, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-lg flex items-center gap-2 ${
                alerta.includes('🔴')
                  ? 'bg-red-50 border border-red-200 text-red-800'
                  : 'bg-yellow-50 border border-yellow-200 text-yellow-800'
              }`}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm">{alerta}</span>
            </div>
          ))}
        </div>
      )}

      {/* Fontes Validadas */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Database className="w-4 h-4" />
          Fontes de Dados Validadas
        </h4>
        <div className="flex flex-wrap gap-2">
          {resumo.fontesValidadas.length > 0 ? (
            resumo.fontesValidadas.map((fonte) => {
              const colors = FONTE_COLORS[fonte] || FONTE_COLORS.PLANILHA;
              return (
                <span
                  key={fonte}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border ${colors.bg} ${colors.text} ${colors.border}`}
                >
                  {FONTE_LABELS[fonte] || fonte}
                </span>
              );
            })
          ) : (
            <span className="text-gray-500 text-sm">Nenhuma fonte externa validada</span>
          )}
        </div>
      </div>

      {/* Comparacao Planilha vs Validado */}
      {dadosPlanilha.nome && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
          <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Dados Originais da Planilha (para comparacao)
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {dadosPlanilha.nome && (
              <div>
                <span className="text-gray-500">Nome:</span>
                <span className="ml-2 text-gray-700">{dadosPlanilha.nome}</span>
              </div>
            )}
            {dadosPlanilha.endereco && (
              <div>
                <span className="text-gray-500">Endereco:</span>
                <span className="ml-2 text-gray-700">{dadosPlanilha.endereco}</span>
              </div>
            )}
            {dadosPlanilha.telefone && (
              <div>
                <span className="text-gray-500">Telefone:</span>
                <span className="ml-2 text-gray-700">{dadosPlanilha.telefone}</span>
              </div>
            )}
            {dadosPlanilha.cidade && (
              <div>
                <span className="text-gray-500">Cidade:</span>
                <span className="ml-2 text-gray-700">{dadosPlanilha.cidade}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mapa de Fontes por Categoria */}
      <div className="space-y-4">
        <h4 className="font-semibold text-gray-800 flex items-center gap-2">
          <MapPin className="w-4 h-4" />
          Mapa de Fontes por Campo
        </h4>

        {Object.entries(CATEGORIA_CAMPOS).map(([categoria, campos]) => {
          const camposCategoria = campos
            .map((c) => mapaFontes[c])
            .filter(Boolean);

          if (camposCategoria.length === 0) return null;

          const isExpanded = expandedCategories.has(categoria);
          const camposValidados = camposCategoria.filter((c) => c.validado).length;

          return (
            <div key={categoria} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <button
                onClick={() => toggleCategory(categoria)}
                className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-800">{categoria}</span>
                  <span className="text-xs text-gray-500">
                    {camposValidados}/{camposCategoria.length} validados
                  </span>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {isExpanded && (
                <div className="border-t border-gray-100 divide-y divide-gray-100">
                  {camposCategoria.map((campo) => {
                    const colors = FONTE_COLORS[campo.fonte] || FONTE_COLORS.PLANILHA;
                    return (
                      <div key={campo.campo} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {campo.validado ? (
                                <CheckCircle className="w-4 h-4 text-green-500" />
                              ) : (
                                <AlertTriangle className="w-4 h-4 text-yellow-500" />
                              )}
                              <span className="font-medium text-gray-800">{campo.label}</span>
                            </div>
                            <p className="text-sm text-gray-600 truncate max-w-md">
                              {campo.valor !== null && campo.valor !== undefined
                                ? typeof campo.valor === 'object'
                                  ? JSON.stringify(campo.valor).slice(0, 50) + '...'
                                  : String(campo.valor)
                                : '-'}
                            </p>
                            {campo.divergencia && (
                              <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                {campo.divergencia}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <span
                                className={`px-2 py-1 rounded text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}
                              >
                                {FONTE_LABELS[campo.fonte] || campo.fonte}
                              </span>
                              {campo.fonteSecundaria && (
                                <span className="ml-1 text-xs text-gray-400">
                                  + {FONTE_LABELS[campo.fonteSecundaria]}
                                </span>
                              )}
                            </div>
                            <div className="w-20">
                              <div className="flex items-center gap-1">
                                <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${getConfiancaBar(campo.confianca)}`}
                                    style={{ width: `${campo.confianca}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-medium ${getConfiancaColor(campo.confianca)}`}>
                                  {campo.confianca}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default ConfiabilidadeTab;

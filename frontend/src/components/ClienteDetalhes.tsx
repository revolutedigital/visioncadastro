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
  ArrowLeft,
  Phone,
  Globe,
  Clock,
  Building2,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { ConfidenceIndicator } from './ConfidenceIndicator';
import { sanitizeAttribute } from '../utils/sanitize';

interface AnaliseResultado {
  tipologiaDetalhada?: string;
  categoriaEstabelecimento?: string;
  segmentoComercial?: string;
  descricaoVisual?: string;
  estadoConservacao?: string;
  movimentacao?: string;
  indicadoresPotencial?: {
    score: number;
    categoria: string;
    fatoresPositivos: string[];
    fatoresNegativos: string[];
  };
  recomendacoes?: string[];
  insights?: string;
  analiseGeral?: string;
  tipologiaFinal?: string;
  confianca?: number;
  resumoFotos?: string;
  relatorio?: string;
}

interface Foto {
  id: string;
  fileName: string;
  ordem: number;
  analisadaPorIA: boolean;
  analiseEm?: string;
  analise?: AnaliseResultado;
  // Sprint 3 - Metadados
  fileHash?: string;
  photoCategory?: string;
  photoCategoryConfidence?: number;
  analysisPromptVersion?: string;
}

interface ClienteData {
  id: string;
  nome: string;
  endereco: string;
  tipoEstabelecimento?: string;
  rating?: number;
  totalAvaliacoes?: number;
  potencialCategoria?: string;
  potencialScore?: number;
  status?: string;
  telefone?: string;
  cidade?: string;
  estado?: string;
  website?: string;
  redesSociais?: string;
  tipologia?: string;
  subTipologia?: string;
  tipologiaConfianca?: number;
  estrategiaComercial?: string;
  dataQualityScore?: number;
  confiabilidadeDados?: string;
}

interface ClienteDetalhesData {
  cliente: ClienteData;
  fotos: Foto[];
  analiseConsolidada?: AnaliseResultado;
  totalFotos: number;
  fotosAnalisadas: number;
}

interface ClienteDetalhesProps {
  clienteId: string;
  onBack: () => void;
}

export function ClienteDetalhes({ clienteId, onBack }: ClienteDetalhesProps) {
  const [data, setData] = useState<ClienteDetalhesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadClienteDetalhes();
  }, [clienteId]);

  const loadClienteDetalhes = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/analysis/${clienteId}/resultado`);
      const result = await response.json();

      if (!result.success) {
        setError(result.error || 'Erro ao carregar detalhes');
        return;
      }

      setData(result);
      setError(null);
    } catch (err) {
      console.error('Erro ao carregar detalhes:', err);
      setError('Erro ao carregar detalhes do cliente');
    } finally {
      setLoading(false);
    }
  };

  const getPotencialIcon = (categoria?: string) => {
    switch (categoria) {
      case 'ALTO':
        return <TrendingUp className="w-6 h-6 text-green-600" />;
      case 'MÉDIO':
        return <Minus className="w-6 h-6 text-yellow-600" />;
      case 'BAIXO':
        return <TrendingDown className="w-6 h-6 text-red-600" />;
      default:
        return <Minus className="w-6 h-6 text-gray-400" />;
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Carregando detalhes...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-8 max-w-md">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Erro ao Carregar</h3>
          <p className="text-gray-600 text-center mb-6">{error}</p>
          <button
            onClick={onBack}
            className="w-full px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  const { cliente, fotos, analiseConsolidada } = data;
  const primeiraAnalise = fotos.find((f) => f.analise)?.analise;
  const indicadores = analiseConsolidada?.indicadoresPotencial || primeiraAnalise?.indicadoresPotencial;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <nav className="bg-white border-b border-gray-200 shadow-sm mb-8">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <button
            onClick={onBack}
            className="flex items-center px-4 py-2 bg-white rounded-lg border-2 border-gray-300 text-gray-700 hover:bg-gray-50 transition-all font-medium"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar à Lista
          </button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Client Info Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">{sanitizeAttribute(cliente.nome)}</h1>
                  <div className="flex items-start text-gray-600 mb-3">
                    <MapPin className="w-5 h-5 mr-2 flex-shrink-0 mt-0.5" />
                    <span>
                      {sanitizeAttribute(cliente.endereco)}
                      {cliente.cidade && `, ${sanitizeAttribute(cliente.cidade)}`}
                      {cliente.estado && ` - ${sanitizeAttribute(cliente.estado)}`}
                    </span>
                  </div>
                  {cliente.telefone && (
                    <div className="flex items-center text-gray-600 mb-2">
                      <Phone className="w-5 h-5 mr-2" />
                      <span>{sanitizeAttribute(cliente.telefone)}</span>
                    </div>
                  )}
                  {cliente.tipoEstabelecimento && (
                    <div className="flex items-center text-gray-600">
                      <Building2 className="w-5 h-5 mr-2" />
                      <span>{sanitizeAttribute(cliente.tipoEstabelecimento)}</span>
                    </div>
                  )}
                </div>
                {cliente.potencialCategoria && (
                  <div
                    className={`flex items-center px-4 py-2 rounded-full text-sm font-medium border ${getPotencialColor(
                      cliente.potencialCategoria
                    )}`}
                  >
                    {getPotencialIcon(cliente.potencialCategoria)}
                    <span className="ml-2">{cliente.potencialCategoria}</span>
                  </div>
                )}
              </div>

              {/* Google Rating */}
              {cliente.rating && (
                <div className="flex items-center pt-4 border-t">
                  <Star className="w-6 h-6 text-yellow-500 fill-current mr-2" />
                  <span className="text-2xl font-bold text-gray-900">{cliente.rating.toFixed(1)}</span>
                  <span className="text-gray-500 ml-2">({cliente.totalAvaliacoes} avaliações)</span>
                </div>
              )}
            </div>

            {/* AI Analysis Card */}
            {(analiseConsolidada || primeiraAnalise) && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center mb-6">
                  <Brain className="w-6 h-6 text-indigo-600 mr-2" />
                  <h2 className="text-2xl font-bold text-gray-900">Análise de IA</h2>
                </div>

                {/* Score and Indicators */}
                {indicadores && (
                  <div className="mb-6 p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border border-indigo-200">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900">Score de Potencial</h3>
                        <p className="text-sm text-gray-600">Categoria: {indicadores.categoria}</p>
                      </div>
                      <div className="text-5xl font-bold text-indigo-600">{indicadores.score}/100</div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-gray-200 rounded-full h-3 mb-6">
                      <div
                        className={`h-3 rounded-full ${
                          indicadores.categoria === 'ALTO'
                            ? 'bg-green-500'
                            : indicadores.categoria === 'MÉDIO'
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${indicadores.score}%` }}
                      ></div>
                    </div>

                    {/* Positive Factors */}
                    {indicadores.fatoresPositivos?.length > 0 && (
                      <div className="mb-4">
                        <h4 className="text-md font-semibold text-green-700 mb-2 flex items-center">
                          <TrendingUp className="w-5 h-5 mr-2" />
                          Fatores Positivos
                        </h4>
                        <ul className="space-y-2">
                          {indicadores.fatoresPositivos.map((fator, idx) => (
                            <li key={idx} className="flex items-start">
                              <span className="text-green-500 font-bold mr-2 mt-1">✓</span>
                              <span className="text-gray-700">{fator}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Negative Factors */}
                    {indicadores.fatoresNegativos?.length > 0 && (
                      <div>
                        <h4 className="text-md font-semibold text-red-700 mb-2 flex items-center">
                          <AlertCircle className="w-5 h-5 mr-2" />
                          Pontos de Atenção
                        </h4>
                        <ul className="space-y-2">
                          {indicadores.fatoresNegativos.map((fator, idx) => (
                            <li key={idx} className="flex items-start">
                              <span className="text-red-500 font-bold mr-2 mt-1">⚠</span>
                              <span className="text-gray-700">{fator}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* General Analysis */}
                {analiseConsolidada?.analiseGeral && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Análise Geral</h3>
                    <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                      {analiseConsolidada.analiseGeral}
                    </p>
                  </div>
                )}

                {/* Detailed Description */}
                {primeiraAnalise?.descricaoVisual && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Descrição Visual</h3>
                    <p className="text-gray-700 leading-relaxed">{primeiraAnalise.descricaoVisual}</p>
                  </div>
                )}

                {/* Business Details */}
                {primeiraAnalise && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    {primeiraAnalise.tipologiaDetalhada && (
                      <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                        <h4 className="text-sm font-semibold text-purple-700 mb-1">Tipologia</h4>
                        <p className="text-gray-700">{primeiraAnalise.tipologiaDetalhada}</p>
                      </div>
                    )}
                    {primeiraAnalise.estadoConservacao && (
                      <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <h4 className="text-sm font-semibold text-blue-700 mb-1">Conservação</h4>
                        <p className="text-gray-700">{primeiraAnalise.estadoConservacao}</p>
                      </div>
                    )}
                    {primeiraAnalise.movimentacao && (
                      <div className="p-4 bg-orange-50 rounded-lg border border-orange-200">
                        <h4 className="text-sm font-semibold text-orange-700 mb-1">Movimentação</h4>
                        <p className="text-gray-700">{primeiraAnalise.movimentacao}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Recommendations */}
                {primeiraAnalise?.recomendacoes && primeiraAnalise.recomendacoes.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Recomendações Estratégicas</h3>
                    <ol className="space-y-2 list-decimal list-inside">
                      {primeiraAnalise.recomendacoes.map((rec, idx) => (
                        <li key={idx} className="text-gray-700 leading-relaxed">
                          {rec}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Insights */}
                {primeiraAnalise?.insights && (
                  <div className="p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                    <h3 className="text-lg font-semibold text-indigo-900 mb-2">Insights</h3>
                    <p className="text-gray-700 leading-relaxed">{primeiraAnalise.insights}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Photos Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center mb-4">
                <ImageIcon className="w-5 h-5 text-purple-600 mr-2" />
                <h3 className="text-lg font-bold text-gray-900">Fotos</h3>
              </div>
              <div className="mb-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Total de fotos:</span>
                  <span className="font-semibold">{data.totalFotos}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Analisadas pela IA:</span>
                  <span className="font-semibold text-green-600">{data.fotosAnalisadas}</span>
                </div>
                {data.totalFotos > 0 && (
                  <div className="w-full bg-gray-200 rounded-full h-2 mt-3">
                    <div
                      className="bg-green-500 h-2 rounded-full"
                      style={{
                        width: `${(data.fotosAnalisadas / data.totalFotos) * 100}%`,
                      }}
                    ></div>
                  </div>
                )}
              </div>

              {/* Photos gallery */}
              {fotos.length > 0 && (
                <div className="space-y-3">
                  {fotos.map((foto, idx) => (
                    <div
                      key={foto.id}
                      className="relative rounded-lg overflow-hidden border-2 border-gray-200 hover:border-indigo-400 transition-colors"
                    >
                      <img
                        src={`${API_BASE_URL}/api/fotos/${foto.fileName}`}
                        alt={`Foto ${idx + 1} - ${cliente.nome}`}
                        className="w-full h-48 object-cover"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3ESem imagem%3C/text%3E%3C/svg%3E';
                        }}
                      />
                      {foto.analisadaPorIA && (
                        <div className="absolute top-2 right-2 bg-indigo-600 text-white px-2 py-1 rounded-full flex items-center text-xs font-medium">
                          <Brain className="w-3 h-3 mr-1" />
                          Analisada
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                        <div className="flex items-center justify-between">
                          <span className="text-white text-xs font-medium">
                            Foto {idx + 1} de {fotos.length}
                          </span>
                          {foto.photoCategory && (
                            <span className="text-white text-xs bg-white/20 px-2 py-0.5 rounded">
                              {foto.photoCategory}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Metadados da foto - Sprint 3 */}
                      {foto.analisadaPorIA && (foto.fileHash || foto.analysisPromptVersion) && (
                        <details className="mt-2 bg-gray-50 border border-gray-200 rounded p-3">
                          <summary className="cursor-pointer text-xs font-semibold text-gray-700 hover:text-indigo-600">
                            📋 Metadados da Análise
                          </summary>
                          <div className="mt-2 space-y-2 text-xs">
                            {foto.fileHash && (
                              <div>
                                <span className="font-semibold text-gray-600">Hash SHA256:</span>
                                <code className="block mt-1 bg-gray-100 p-2 rounded text-[10px] font-mono break-all">
                                  {foto.fileHash}
                                </code>
                              </div>
                            )}
                            {foto.photoCategory && (
                              <div>
                                <span className="font-semibold text-gray-600">Categoria:</span>
                                <span className="ml-2 text-gray-800">
                                  {foto.photoCategory}
                                  {foto.photoCategoryConfidence && (
                                    <span className="ml-1 text-gray-500">
                                      ({Math.round(foto.photoCategoryConfidence)}% confiança)
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                            {foto.analysisPromptVersion && (
                              <div>
                                <span className="font-semibold text-gray-600">Versão do Prompt:</span>
                                <code className="ml-2 text-gray-800 font-mono">
                                  {foto.analysisPromptVersion}
                                </code>
                              </div>
                            )}
                            {foto.analiseEm && (
                              <div>
                                <span className="font-semibold text-gray-600">Analisada em:</span>
                                <span className="ml-2 text-gray-800">
                                  {new Date(foto.analiseEm).toLocaleString('pt-BR')}
                                </span>
                              </div>
                            )}
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {fotos.length === 0 && (
                <div className="text-center py-8">
                  <ImageIcon className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Nenhuma foto disponível</p>
                </div>
              )}
            </div>

            {/* Tipologia & Estratégia Card */}
            {cliente.tipologia && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Tipologia & Estratégia</h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">Tipologia</p>
                    <p className="text-sm font-semibold text-gray-900">{cliente.tipologia}</p>
                    {cliente.subTipologia && (
                      <p className="text-xs text-gray-600 mt-1">{cliente.subTipologia}</p>
                    )}
                    {cliente.tipologiaConfianca && (
                      <div className="mt-3">
                        <ConfidenceIndicator
                          confidence={cliente.tipologiaConfianca}
                          showLabel={true}
                          showWarning={true}
                          size="md"
                        />
                      </div>
                    )}
                  </div>

                  {cliente.estrategiaComercial && (
                    <div className="pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-500 mb-2">Estratégia Comercial</p>
                      <p className="text-sm text-gray-700">{cliente.estrategiaComercial}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Data Quality Card */}
            {cliente.dataQualityScore !== undefined && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Qualidade dos Dados</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">Score de Qualidade:</span>
                    <span className="text-2xl font-bold text-indigo-600">{cliente.dataQualityScore}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full ${
                        cliente.dataQualityScore >= 80
                          ? 'bg-green-500'
                          : cliente.dataQualityScore >= 60
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                      }`}
                      style={{ width: `${cliente.dataQualityScore}%` }}
                    ></div>
                  </div>
                  {cliente.confiabilidadeDados && (
                    <div className="pt-2">
                      <span className="text-xs text-gray-500">Confiabilidade: </span>
                      <span className={`text-xs font-medium ${
                        cliente.confiabilidadeDados === 'ALTA' ? 'text-green-600' :
                        cliente.confiabilidadeDados === 'MEDIA' ? 'text-yellow-600' : 'text-red-600'
                      }`}>{cliente.confiabilidadeDados}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Redes Sociais & Website Card */}
            {(cliente.website || cliente.redesSociais) && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Presença Digital</h3>
                <div className="space-y-3">
                  {cliente.website && (
                    <div className="flex items-center">
                      <Globe className="w-4 h-4 text-gray-500 mr-2" />
                      <a
                        href={cliente.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-indigo-600 hover:underline break-all"
                      >
                        {cliente.website}
                      </a>
                    </div>
                  )}
                  {cliente.redesSociais && (() => {
                    try {
                      const redes = JSON.parse(cliente.redesSociais);
                      return (
                        <>
                          {redes.instagram && (
                            <div className="flex items-center">
                              <svg className="w-4 h-4 text-pink-600 mr-2" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                              </svg>
                              <a
                                href={redes.instagram}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-indigo-600 hover:underline break-all"
                              >
                                Instagram
                              </a>
                            </div>
                          )}
                          {redes.facebook && (
                            <div className="flex items-center">
                              <svg className="w-4 h-4 text-blue-600 mr-2" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                              </svg>
                              <a
                                href={redes.facebook}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-indigo-600 hover:underline break-all"
                              >
                                Facebook
                              </a>
                            </div>
                          )}
                        </>
                      );
                    } catch {
                      return null;
                    }
                  })()}
                </div>
              </div>
            )}

            {/* Status Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Status do Processamento</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Status Geral:</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      cliente.status === 'CONCLUIDO'
                        ? 'bg-green-100 text-green-800'
                        : cliente.status === 'PROCESSANDO'
                        ? 'bg-yellow-100 text-yellow-800'
                        : cliente.status === 'ERRO'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {cliente.status || 'PENDENTE'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

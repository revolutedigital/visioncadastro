import {
  MapPin,
  Star,
  Phone,
  Globe,
  Tag,
  TrendingUp,
  Award,
  Instagram as InstagramIcon,
  Facebook as FacebookIcon,
  CheckCircle,
  AlertTriangle,
  Info,
  XCircle,
  Database,
} from 'lucide-react';
import { ConfidenceIndicator } from '../../../components/ConfidenceIndicator';

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
  camposCriticos?: string;
  fontesValidadas?: string;
  camposPreenchidos?: number;
  dataQualityBreakdown?: string;
  placesStatus?: string;
  geocodingStatus?: string;
  receitaStatus?: string;
  ambienteEstabelecimento?: string;
  publicoAlvo?: string;
  totalFotosDisponiveis?: number;
}

interface VisaoGeralProps {
  cliente: ClienteData;
}

export function VisaoGeral({ cliente }: VisaoGeralProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Informações Básicas */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Informações Básicas</h3>
        <div className="space-y-3">
          <div className="flex items-start">
            <MapPin className="w-5 h-5 text-gray-500 mr-3 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-600">Endereço</p>
              <p className="text-sm font-medium text-gray-900">{cliente.endereco}</p>
              {(cliente.cidade || cliente.estado) && (
                <p className="text-xs text-gray-500">
                  {cliente.cidade}
                  {cliente.cidade && cliente.estado && ', '}
                  {cliente.estado}
                </p>
              )}
            </div>
          </div>

          {cliente.telefone && (
            <div className="flex items-start">
              <Phone className="w-5 h-5 text-gray-500 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-gray-600">Telefone</p>
                <p className="text-sm font-medium text-gray-900">{cliente.telefone}</p>
              </div>
            </div>
          )}

          {cliente.tipoEstabelecimento && (
            <div className="flex items-start">
              <Tag className="w-5 h-5 text-gray-500 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-gray-600">Tipo de Estabelecimento</p>
                <p className="text-sm font-medium text-gray-900">
                  {cliente.tipoEstabelecimento}
                </p>
              </div>
            </div>
          )}

          {cliente.rating && (
            <div className="flex items-start">
              <Star className="w-5 h-5 text-yellow-500 mr-3 mt-0.5" />
              <div>
                <p className="text-sm text-gray-600">Avaliação</p>
                <div className="flex items-center">
                  <p className="text-sm font-medium text-gray-900 mr-2">
                    {cliente.rating.toFixed(1)}
                  </p>
                  <span className="text-xs text-gray-500">
                    ({cliente.totalAvaliacoes} avaliações)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Potencial & Score */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Potencial de Negócio</h3>
        <div className="space-y-4">
          {cliente.potencialCategoria && (
            <div>
              <p className="text-sm text-gray-600 mb-2">Categoria</p>
              <div
                className={`inline-flex items-center px-4 py-2 rounded-lg font-semibold ${
                  cliente.potencialCategoria === 'ALTO'
                    ? 'bg-green-100 text-green-800'
                    : cliente.potencialCategoria === 'MÉDIO'
                    ? 'bg-yellow-100 text-yellow-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                <TrendingUp className="w-5 h-5 mr-2" />
                {cliente.potencialCategoria}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Score de Potencial</p>
              <p className="text-2xl font-bold text-indigo-600">
                {cliente.potencialScore ?? 0}
              </p>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${
                  cliente.potencialCategoria === 'ALTO'
                    ? 'bg-green-500'
                    : cliente.potencialCategoria === 'MÉDIO'
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${cliente.potencialScore ?? 0}%` }}
              ></div>
            </div>
          </div>

          {/* Explicação do Score */}
          <div className="pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-3 font-medium flex items-center">
              <Info className="w-3 h-3 mr-1" />
              Como chegamos a este score:
            </p>

            {/* Se tem breakdown, mostrar detalhes */}
            {cliente.scoringBreakdown && (() => {
              try {
                const breakdown = JSON.parse(cliente.scoringBreakdown);
                const hasAnyScore = breakdown.scoreRating > 0 || breakdown.scoreAvaliacoes > 0 ||
                                   breakdown.scoreFotosQualidade > 0 || breakdown.scoreHorarioFunc > 0 ||
                                   breakdown.scoreWebsite > 0 || breakdown.scoreDensidadeReviews > 0;

                if (hasAnyScore) {
                  return (
                    <div className="space-y-2">
                      {breakdown.scoreRating > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Rating ({cliente.rating?.toFixed(1) || 'N/A'})</span>
                          <span className="font-medium text-green-600">+{breakdown.scoreRating} pts</span>
                        </div>
                      )}
                      {breakdown.scoreAvaliacoes > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Avaliações ({cliente.totalAvaliacoes || 0})</span>
                          <span className="font-medium text-green-600">+{breakdown.scoreAvaliacoes} pts</span>
                        </div>
                      )}
                      {breakdown.scoreFotosQualidade > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Qualidade das Fotos</span>
                          <span className="font-medium text-green-600">+{breakdown.scoreFotosQualidade} pts</span>
                        </div>
                      )}
                      {breakdown.scoreHorarioFunc > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Horário ({breakdown.diasAbertoPorSemana || 0}d/sem)</span>
                          <span className="font-medium text-green-600">+{breakdown.scoreHorarioFunc} pts</span>
                        </div>
                      )}
                      {breakdown.scoreWebsite > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Website</span>
                          <span className="font-medium text-green-600">+{breakdown.scoreWebsite} pts</span>
                        </div>
                      )}
                      {breakdown.scoreDensidadeReviews > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">Densidade de Reviews</span>
                          <span className="font-medium text-green-600">+{breakdown.scoreDensidadeReviews} pts</span>
                        </div>
                      )}
                    </div>
                  );
                }
                return null;
              } catch {
                return null;
              }
            })()}

            {/* Se score é 0 ou muito baixo, explicar o motivo */}
            {(!cliente.potencialScore || cliente.potencialScore < 10) && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
                <div className="flex items-start">
                  <AlertTriangle className="w-4 h-4 text-amber-500 mr-2 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800 mb-1">Score baixo ou não calculado</p>
                    <p className="text-amber-700 text-xs">
                      O score de potencial é calculado com base em:
                    </p>
                    <ul className="text-xs text-amber-700 mt-1 space-y-0.5 list-disc list-inside">
                      {!cliente.rating && <li>Rating do Google (não encontrado)</li>}
                      {!cliente.totalAvaliacoes && <li>Número de avaliações (não encontrado)</li>}
                      {cliente.placesStatus !== 'SUCESSO' && <li>Dados do Google Places (não processado)</li>}
                      {cliente.status !== 'CONCLUIDO' && <li>Análise de fotos (não concluída)</li>}
                    </ul>
                    <p className="text-xs text-amber-600 mt-2 italic">
                      Execute as etapas do pipeline para enriquecer os dados.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tipologia & Estratégia */}
      {cliente.tipologia && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4">
            Tipologia & Estratégia
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500">Tipologia</p>
                {cliente.tipologiaConfianca && (
                  <ConfidenceIndicator
                    confidence={cliente.tipologiaConfianca}
                    showLabel={true}
                    showWarning={true}
                    size="sm"
                  />
                )}
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                <p className="text-lg font-bold text-indigo-800">{cliente.tipologia}</p>
                {cliente.tipologiaNome && (
                  <p className="text-sm text-indigo-600 mt-1">{cliente.tipologiaNome}</p>
                )}
              </div>
            </div>

            {/* Explicação de como chegamos na tipologia */}
            <div className="pt-3 border-t border-gray-200">
              <p className="text-xs text-gray-500 mb-3 font-medium flex items-center">
                <Info className="w-3 h-3 mr-1" />
                Como chegamos nesta classificação:
              </p>

              {/* Justificativa da IA */}
              {cliente.tipologiaJustificativa && (
                <div className="bg-blue-50 border border-blue-200 rounded p-3 mb-3">
                  <p className="text-sm text-blue-800">{cliente.tipologiaJustificativa}</p>
                </div>
              )}

              {/* Dados utilizados para classificar */}
              <div className="space-y-2 text-xs">
                <p className="font-medium text-gray-700">Dados considerados:</p>
                <div className="grid grid-cols-2 gap-2">
                  {cliente.tipoEstabelecimento && (
                    <div className="flex items-center text-green-700 bg-green-50 rounded px-2 py-1">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Tipo: {cliente.tipoEstabelecimento}
                    </div>
                  )}
                  {cliente.rating && (
                    <div className="flex items-center text-green-700 bg-green-50 rounded px-2 py-1">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Rating: {cliente.rating.toFixed(1)}
                    </div>
                  )}
                  {cliente.ambienteEstabelecimento && (
                    <div className="flex items-center text-green-700 bg-green-50 rounded px-2 py-1">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Ambiente: {cliente.ambienteEstabelecimento}
                    </div>
                  )}
                  {cliente.publicoAlvo && (
                    <div className="flex items-center text-green-700 bg-green-50 rounded px-2 py-1">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Publico
                    </div>
                  )}
                  {(cliente.totalFotosDisponiveis ?? 0) > 0 && (
                    <div className="flex items-center text-green-700 bg-green-50 rounded px-2 py-1">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      {cliente.totalFotosDisponiveis} fotos
                    </div>
                  )}
                  {cliente.placesStatus === 'SUCESSO' && (
                    <div className="flex items-center text-green-700 bg-green-50 rounded px-2 py-1">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Google Places
                    </div>
                  )}
                </div>
              </div>
            </div>

            {cliente.estrategiaComercial && (
              <div className="pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-2">Estratégia Comercial Sugerida</p>
                <p className="text-sm text-gray-700">{cliente.estrategiaComercial}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Presença Digital */}
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
            {cliente.redesSociais &&
              (() => {
                try {
                  const redes = JSON.parse(cliente.redesSociais);
                  return (
                    <>
                      {redes.instagram && (
                        <div className="flex items-center">
                          <InstagramIcon className="w-4 h-4 text-pink-600 mr-2" />
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
                          <FacebookIcon className="w-4 h-4 text-blue-600 mr-2" />
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

      {/* Qualidade dos Dados */}
      <div className="bg-white rounded-lg shadow-md p-6 lg:col-span-2">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
          <Database className="w-5 h-5 mr-2 text-indigo-600" />
          Qualidade dos Dados
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Score e Barra de Progresso */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Score de Qualidade:</span>
              <span className="text-2xl font-bold text-indigo-600">
                {cliente.dataQualityScore ?? 0}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${
                  (cliente.dataQualityScore ?? 0) >= 80
                    ? 'bg-green-500'
                    : (cliente.dataQualityScore ?? 0) >= 60
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${cliente.dataQualityScore ?? 0}%` }}
              ></div>
            </div>

            {/* Confiabilidade */}
            <div className="mt-3 flex items-center">
              {(cliente.confiabilidadeDados === 'ALTA' || cliente.confiabilidadeDados === 'EXCELENTE') ? (
                <CheckCircle className="w-4 h-4 text-green-500 mr-2" />
              ) : cliente.confiabilidadeDados === 'MEDIA' ? (
                <AlertTriangle className="w-4 h-4 text-yellow-500 mr-2" />
              ) : (
                <XCircle className="w-4 h-4 text-red-500 mr-2" />
              )}
              <span className="text-xs text-gray-500">Confiabilidade: </span>
              <span
                className={`text-sm font-medium ml-1 ${
                  cliente.confiabilidadeDados === 'ALTA' || cliente.confiabilidadeDados === 'EXCELENTE'
                    ? 'text-green-600'
                    : cliente.confiabilidadeDados === 'MEDIA'
                    ? 'text-yellow-600'
                    : 'text-red-600'
                }`}
              >
                {cliente.confiabilidadeDados || 'NAO CALCULADA'}
              </span>
            </div>

            {/* Fontes Validadas */}
            {cliente.fontesValidadas && (() => {
              try {
                const fontes = JSON.parse(cliente.fontesValidadas);
                if (fontes.length > 0) {
                  return (
                    <div className="mt-4 bg-green-50 border border-green-200 rounded p-2">
                      <p className="font-medium text-green-800 mb-1 text-xs">Fontes validadas:</p>
                      <ul className="text-green-700 space-y-0.5 text-xs">
                        {fontes.map((fonte: string, idx: number) => (
                          <li key={idx} className="flex items-center">
                            <CheckCircle className="w-3 h-3 mr-1 flex-shrink-0" />
                            {fonte}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                }
                return null;
              } catch {
                return null;
              }
            })()}
          </div>

          {/* Breakdown detalhado por categoria */}
          <div className="md:col-span-2">
            <p className="text-xs text-gray-500 mb-3 font-medium flex items-center">
              <Info className="w-3 h-3 mr-1" />
              Como chegamos a este score:
            </p>

            {/* Se tem breakdown detalhado, mostrar por categoria */}
            {cliente.dataQualityBreakdown && (() => {
              try {
                const breakdown = JSON.parse(cliente.dataQualityBreakdown);
                const categorias = breakdown.porCategoria;

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {Object.entries(categorias).map(([key, cat]: [string, any]) => {
                      const camposPreenchidos = cat.campos.filter((c: any) => c.preenchido);
                      const camposFaltando = cat.campos.filter((c: any) => !c.preenchido);
                      const percentual = cat.pesoTotal > 0 ? Math.round((cat.pesoObtido / cat.pesoTotal) * 100) : 0;

                      return (
                        <div key={key} className="border rounded-lg p-3 bg-gray-50">
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium text-sm text-gray-800">{cat.nome}</span>
                            <span className={`text-xs font-bold ${
                              percentual >= 80 ? 'text-green-600' :
                              percentual >= 50 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {cat.pesoObtido}/{cat.pesoTotal} pts
                            </span>
                          </div>

                          {/* Barra de progresso da categoria */}
                          <div className="w-full bg-gray-200 rounded-full h-1.5 mb-2">
                            <div
                              className={`h-1.5 rounded-full ${
                                percentual >= 80 ? 'bg-green-500' :
                                percentual >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                              }`}
                              style={{ width: `${percentual}%` }}
                            ></div>
                          </div>

                          {/* Lista de campos */}
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {camposPreenchidos.slice(0, 4).map((campo: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between text-xs">
                                <span className="text-green-700 flex items-center truncate">
                                  <CheckCircle className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">{campo.label}</span>
                                </span>
                                <span className="text-green-600 ml-1 flex-shrink-0">+{campo.pontos}</span>
                              </div>
                            ))}
                            {camposFaltando.slice(0, 2).map((campo: any, idx: number) => (
                              <div key={`f-${idx}`} className="flex items-center justify-between text-xs">
                                <span className="text-red-600 flex items-center truncate">
                                  <XCircle className="w-3 h-3 mr-1 flex-shrink-0" />
                                  <span className="truncate">{campo.label}</span>
                                </span>
                                <span className="text-gray-400 ml-1 flex-shrink-0">0/{campo.peso}</span>
                              </div>
                            ))}
                            {(camposPreenchidos.length > 4 || camposFaltando.length > 2) && (
                              <p className="text-xs text-gray-400 italic">
                                +{Math.max(0, camposPreenchidos.length - 4) + Math.max(0, camposFaltando.length - 2)} mais...
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              } catch {
                return null;
              }
            })()}

            {/* Se não tem breakdown, mostrar explicação genérica ou campos críticos */}
            {!cliente.dataQualityBreakdown && (
              <div className="space-y-2 text-xs">
                {/* Campos Críticos Faltando */}
                {cliente.camposCriticos && (() => {
                  try {
                    const campos = JSON.parse(cliente.camposCriticos);
                    if (campos.length > 0) {
                      return (
                        <div className="bg-red-50 border border-red-200 rounded p-2">
                          <p className="font-medium text-red-800 mb-1">Campos críticos faltando:</p>
                          <ul className="text-red-700 space-y-0.5">
                            {campos.map((campo: string, idx: number) => (
                              <li key={idx} className="flex items-center">
                                <XCircle className="w-3 h-3 mr-1" />
                                {campo === 'telefone' ? 'Telefone' :
                                 campo === 'fotos' ? 'Fotos do estabelecimento' :
                                 campo === 'rating' ? 'Rating do Google' :
                                 campo === 'totalAvaliacoes' ? 'Numero de avaliacoes' :
                                 campo === 'tipoEstabelecimento' ? 'Tipo de estabelecimento' :
                                 campo === 'latitude' ? 'Coordenadas (Latitude)' :
                                 campo === 'longitude' ? 'Coordenadas (Longitude)' :
                                 campo === 'placeId' ? 'Place ID do Google' :
                                 campo}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    }
                    return null;
                  } catch {
                    return null;
                  }
                })()}

                {/* Se não tem campos críticos também */}
                {(!cliente.camposCriticos || cliente.camposCriticos === '[]') && (
                  <div className="bg-gray-50 border border-gray-200 rounded p-2">
                    <p className="text-gray-600">
                      O score de qualidade é calculado com base em:
                    </p>
                    <ul className="text-gray-500 mt-1 space-y-0.5 list-disc list-inside">
                      <li>Dados básicos (nome, endereço, telefone)</li>
                      <li>Localização (geocodificação)</li>
                      <li>Dados do Google Places</li>
                      <li>Análise visual das fotos</li>
                      <li>Reviews e avaliações</li>
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Campos preenchidos */}
        {cliente.camposPreenchidos !== undefined && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Total de campos preenchidos:</span>
              <span className="font-medium text-gray-900">
                {cliente.camposPreenchidos} / 28 campos
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

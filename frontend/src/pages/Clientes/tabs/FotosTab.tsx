import { Image as ImageIcon, Brain, CheckCircle, Clock } from 'lucide-react';
import { API_BASE_URL } from '../../../config/api';

interface Foto {
  id: string;
  fileName: string;
  ordem: number;
  analisadaPorIA: boolean;
  analise?: any;
  analiseEm?: string;
}

interface FotosTabProps {
  fotos: Foto[];
}

export function FotosTab({ fotos }: FotosTabProps) {
  if (fotos.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-12 text-center">
        <ImageIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-700 mb-2">
          Nenhuma foto disponível
        </h3>
        <p className="text-gray-500">
          Este cliente ainda não possui fotos do Google Places
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {fotos.map((foto, idx) => (
        <div
          key={foto.id}
          className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
        >
          {/* Imagem */}
          <div className="relative h-48 bg-gray-100">
            <img
              src={`${API_BASE_URL}/api/fotos/${foto.fileName}`}
              alt={`Foto ${idx + 1}`}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.src =
                  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23ddd" width="100" height="100"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dominant-baseline="middle"%3ESem imagem%3C/text%3E%3C/svg%3E';
              }}
            />

            {/* Badge de status */}
            <div className="absolute top-2 right-2">
              {foto.analisadaPorIA ? (
                <div className="bg-green-500 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center shadow-lg">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Analisada
                </div>
              ) : (
                <div className="bg-gray-500 text-white px-2 py-1 rounded-full text-xs font-medium flex items-center shadow-lg">
                  <Clock className="w-3 h-3 mr-1" />
                  Pendente
                </div>
              )}
            </div>

            {/* Número da foto */}
            <div className="absolute bottom-2 left-2">
              <div className="bg-black bg-opacity-60 text-white px-2 py-1 rounded text-xs font-medium">
                Foto {idx + 1}
              </div>
            </div>
          </div>

          {/* Análise */}
          {foto.analisadaPorIA && foto.analise && (
            <div className="p-4">
              <div className="flex items-center mb-2">
                <Brain className="w-4 h-4 text-indigo-600 mr-2" />
                <h4 className="text-sm font-semibold text-gray-900">
                  Análise de IA
                </h4>
              </div>

              {foto.analise.descricao && (
                <p className="text-xs text-gray-600 line-clamp-3 mb-2">
                  {foto.analise.descricao}
                </p>
              )}

              {foto.analise.ambiente && (
                <div className="mt-2">
                  <span className="inline-block bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded">
                    {foto.analise.ambiente}
                  </span>
                </div>
              )}

              {foto.analiseEm && (
                <p className="text-xs text-gray-400 mt-2">
                  Analisada em{' '}
                  {new Date(foto.analiseEm).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
          )}

          {!foto.analisadaPorIA && (
            <div className="p-4 text-center">
              <p className="text-xs text-gray-500">
                Aguardando análise de IA
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

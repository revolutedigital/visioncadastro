import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../../config/api';
import { authFetch } from '../../../utils/api';
import { VisualInsights } from '../../VisualInsights';
import { Image } from 'lucide-react';
import { logger } from '../../../utils/logger';

// Extrai dados de análise visual do cliente ou das fotos
function extractVisualData(cliente: any): any {
  // Primeiro, verificar se os dados estão diretamente no cliente
  if (cliente.qualidadeSinalizacao || cliente.publicoAlvo) {
    return {
      qualidadeSinalizacao: cliente.qualidadeSinalizacao,
      presencaBranding: cliente.presencaBranding,
      nivelProfissionalizacao: cliente.nivelProfissionalizacao,
      publicoAlvo: cliente.publicoAlvo,
      ambienteEstabelecimento: cliente.ambienteEstabelecimento,
      indicadoresVisuais: cliente.indicadoresVisuais,
    };
  }

  // Se não, tentar extrair do analiseResultado das fotos
  if (cliente.fotos && cliente.fotos.length > 0) {
    for (const foto of cliente.fotos) {
      if (foto.analiseResultado) {
        try {
          const analise = typeof foto.analiseResultado === 'string'
            ? JSON.parse(foto.analiseResultado)
            : foto.analiseResultado;

          if (analise.qualidadeSinalizacao || analise.publicoAlvo) {
            return {
              qualidadeSinalizacao: analise.qualidadeSinalizacao,
              presencaBranding: analise.presencaBranding,
              nivelProfissionalizacao: analise.nivelProfissionalizacao,
              publicoAlvo: analise.publicoAlvo,
              ambienteEstabelecimento: analise.ambienteEstabelecimento,
              indicadoresVisuais: analise.indicadoresVisuais,
            };
          }
        } catch {
          // Ignorar erro de parse
        }
      }
    }
  }

  return null;
}

function VisualAnalysis() {
  const [visualData, setVisualData] = useState<any>(null);
  const [clienteNome, setClienteNome] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTopCliente();
  }, []);

  const loadTopCliente = async () => {
    try {
      const response = await authFetch(`${API_BASE_URL}/api/analysis/clientes?status=CONCLUIDO`);
      const data = await response.json();

      if (data.success && data.clientes && data.clientes.length > 0) {
        // Ordenar por potencialScore
        const sorted = data.clientes.sort(
          (a: any, b: any) => (b.potencialScore || 0) - (a.potencialScore || 0)
        );

        // Procurar o primeiro cliente que tenha dados de análise visual
        for (const cliente of sorted) {
          const extracted = extractVisualData(cliente);
          if (extracted) {
            setVisualData(extracted);
            setClienteNome(cliente.nome);
            break;
          }
        }
      }
      setLoading(false);
    } catch (error) {
      logger.error('Erro ao carregar visual analysis', error as Error);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-32 bg-gray-200 rounded-lg" />
        <div className="h-32 bg-gray-200 rounded-lg" />
      </div>
    );
  }

  if (!visualData) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <Image className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 font-medium">Nenhuma análise visual disponível</p>
        <p className="text-sm text-gray-500 mt-1">
          Execute análises com IA para ver insights visuais
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-bold text-gray-900">Insights Visuais</h3>
        <p className="text-sm text-gray-500">
          Análise baseada em {clienteNome} (melhor score)
        </p>
      </div>
      <VisualInsights
        qualidadeSinalizacao={visualData.qualidadeSinalizacao}
        presencaBranding={visualData.presencaBranding}
        nivelProfissionalizacao={visualData.nivelProfissionalizacao}
        publicoAlvo={visualData.publicoAlvo}
        ambienteEstabelecimento={visualData.ambienteEstabelecimento}
        indicadoresVisuais={visualData.indicadoresVisuais}
      />
    </div>
  );
}

export default VisualAnalysis;

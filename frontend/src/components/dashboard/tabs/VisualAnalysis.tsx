import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../../config/api';
import { VisualInsights } from '../../VisualInsights';
import { Image } from 'lucide-react';
import { logger } from '../../../utils/logger';

function VisualAnalysis() {
  const [topCliente, setTopCliente] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTopCliente();
  }, []);

  const loadTopCliente = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/analysis/clientes?status=CONCLUIDO`);
      const data = await response.json();

      if (data.success && data.clientes && data.clientes.length > 0) {
        const sorted = data.clientes.sort(
          (a: any, b: any) => (b.potencialScore || 0) - (a.potencialScore || 0)
        );
        setTopCliente(sorted[0]);
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

  if (!topCliente || (!topCliente.qualidadeSinalizacao && !topCliente.publicoAlvo)) {
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
          Análise baseada em {topCliente.nome} (melhor score)
        </p>
      </div>
      <VisualInsights
        qualidadeSinalizacao={topCliente.qualidadeSinalizacao}
        presencaBranding={topCliente.presencaBranding}
        nivelProfissionalizacao={topCliente.nivelProfissionalizacao}
        publicoAlvo={topCliente.publicoAlvo}
        ambienteEstabelecimento={topCliente.ambienteEstabelecimento}
        indicadoresVisuais={topCliente.indicadoresVisuais}
      />
    </div>
  );
}

export default VisualAnalysis;

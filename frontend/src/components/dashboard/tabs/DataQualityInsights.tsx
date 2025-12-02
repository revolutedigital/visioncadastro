import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../../config/api';
import { DataQuality } from '../../DataQuality';
import { logger } from '../../../utils/logger';

function DataQualityInsights() {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDataQuality();
  }, []);

  const loadDataQuality = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/data-quality/report`);
      const data = await response.json();
      setReport(data);
      setLoading(false);
    } catch (error) {
      logger.error('Erro ao carregar data quality', error as Error);
      setLoading(false);
    }
  };

  if (!report || report.overview?.totalClientes === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <p className="text-gray-600 font-medium">Nenhum dado de qualidade disponível</p>
        <p className="text-sm text-gray-500 mt-1">Processe clientes para ver relatório de qualidade</p>
      </div>
    );
  }

  return <DataQuality report={report} loading={loading} />;
}

export default DataQualityInsights;

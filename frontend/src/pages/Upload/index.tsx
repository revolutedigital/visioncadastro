import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../utils/api';
import {
  Upload as UploadIcon,
  FileSpreadsheet,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Table,
  Settings,
  Loader,
  AlertCircle,
  X,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';

type WizardStep = 1 | 2 | 3;

interface ColumnMapping {
  excelColumn: string;
  systemField: string;
}

const REQUIRED_FIELDS = [
  { key: 'nome', label: 'Nome do Cliente', required: true },
  { key: 'cnpj', label: 'CNPJ', required: true },
  { key: 'endereco', label: 'Endereço', required: true },
  { key: 'cidade', label: 'Cidade', required: false },
  { key: 'estado', label: 'Estado', required: false },
  { key: 'telefone', label: 'Telefone', required: false },
];

export function UploadPage() {
  const navigate = useNavigate();
  const { showSuccess, showError, showLoading, dismissToast } = useApp();
  const [currentStep, setCurrentStep] = useState<WizardStep>(1);
  const [file, setFile] = useState<File | null>(null);
  const [excelColumns, setExcelColumns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<any[]>([]);
  const [excelData, setExcelData] = useState<any[]>([]);
  const [loadingAIMapping, setLoadingAIMapping] = useState(false);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setError(null);
    setLoadingAIMapping(true);

    try {
      // Ler arquivo Excel
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length === 0) {
        setError('Arquivo vazio ou sem dados');
        setLoadingAIMapping(false);
        return;
      }

      // Primeira linha = cabeçalhos
      const headers = jsonData[0] as string[];
      setExcelColumns(headers);

      // Armazenar dados completos
      const rows = jsonData.slice(1).map((row: any) => {
        const obj: any = {};
        headers.forEach((header, idx) => {
          obj[header] = row[idx];
        });
        return obj;
      });
      setExcelData(rows);

      // Chamar API para sugerir mapeamento com IA
      console.log('🤖 Solicitando mapeamento inteligente de colunas...');
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await authFetch(`${API_BASE_URL}/api/upload/suggest-mapping`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (result.success && result.mapping) {
        console.log('✅ Mapeamento sugerido pela IA:', result.mapping);

        // Converter mapeamento da API para o formato do frontend
        const aiMappings: ColumnMapping[] = REQUIRED_FIELDS.map((field) => ({
          excelColumn: result.mapping[field.key] || '',
          systemField: field.key,
        }));
        setMappings(aiMappings);
      } else {
        // Fallback para mapeamento básico caso a IA falhe
        console.warn('⚠️ IA não disponível, usando mapeamento básico');
        const autoMappings: ColumnMapping[] = REQUIRED_FIELDS.map((field) => {
          const matchingColumn = headers.find(
            (col) =>
              col.toLowerCase().includes(field.key.toLowerCase()) ||
              field.label.toLowerCase().includes(col.toLowerCase()) ||
              (field.key === 'estado' && (col.toLowerCase().includes('uf') || col.toLowerCase() === 'estado'))
          );
          return {
            excelColumn: matchingColumn || '',
            systemField: field.key,
          };
        });
        setMappings(autoMappings);
      }

      setLoadingAIMapping(false);
    } catch (err) {
      console.error('Erro ao processar arquivo:', err);
      setError('Erro ao processar arquivo. Certifique-se de que é um arquivo Excel válido.');
      setLoadingAIMapping(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && !file) {
      setError('Por favor, selecione um arquivo antes de continuar');
      return;
    }

    if (currentStep === 2) {
      // Validar mapeamentos obrigatórios
      const requiredMapped = REQUIRED_FIELDS.filter((f) => f.required).every((field) =>
        mappings.find((m) => m.systemField === field.key && m.excelColumn)
      );

      if (!requiredMapped) {
        setError('Por favor, mapeie todos os campos obrigatórios');
        return;
      }

      // Mapear dados reais do Excel para o formato do sistema
      const mappedData = excelData.slice(0, 5).map((row) => {
        const mapped: any = {};
        mappings.forEach((mapping) => {
          if (mapping.excelColumn) {
            mapped[mapping.systemField] = row[mapping.excelColumn] || '';
          }
        });
        return mapped;
      });
      setPreviewData(mappedData);
    }

    setError(null);
    setCurrentStep((currentStep + 1) as WizardStep);
  };

  const handleBack = () => {
    setError(null);
    setCurrentStep((currentStep - 1) as WizardStep);
  };

  const handleMappingChange = (systemField: string, excelColumn: string) => {
    setMappings((prev) =>
      prev.map((m) => (m.systemField === systemField ? { ...m, excelColumn } : m))
    );
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);

    const loadingToast = showLoading('Enviando arquivo...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mappings', JSON.stringify(mappings));

      const response = await authFetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      dismissToast(loadingToast);

      if (data.success) {
        showSuccess(
          `Arquivo importado com sucesso! ${data.total || 0} clientes adicionados à fila de processamento.`
        );
        // Navegar para o pipeline para acompanhar processamento
        setTimeout(() => navigate('/pipeline'), 1000);
      } else {
        const errorMsg = data.error || 'Erro ao fazer upload';
        setError(errorMsg);
        showError(errorMsg);
        setUploading(false);
      }
    } catch (err) {
      dismissToast(loadingToast);
      const errorMsg = 'Erro ao enviar arquivo. Verifique sua conexão.';
      setError(errorMsg);
      showError(errorMsg);
      setUploading(false);
    }
  };

  const renderStepIndicator = () => {
    const steps = [
      { number: 1, label: 'Upload' },
      { number: 2, label: 'Mapeamento' },
      { number: 3, label: 'Confirmação' },
    ];

    return (
      <div className="flex items-center justify-center mb-8">
        {steps.map((step, idx) => (
          <div key={step.number} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg transition-all ${
                  currentStep > step.number
                    ? 'bg-green-500 text-white'
                    : currentStep === step.number
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}
              >
                {currentStep > step.number ? <CheckCircle className="w-6 h-6" /> : step.number}
              </div>
              <span
                className={`text-sm mt-2 font-medium ${
                  currentStep === step.number ? 'text-indigo-600' : 'text-gray-500'
                }`}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`w-24 h-1 mx-4 mb-6 transition-all ${
                  currentStep > step.number ? 'bg-green-500' : 'bg-gray-200'
                }`}
              ></div>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderStep1 = () => (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <FileSpreadsheet className="w-20 h-20 text-indigo-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Importar Planilha de Clientes</h2>
        <p className="text-gray-600">
          Faça upload de um arquivo Excel (.xlsx) com os dados dos seus clientes
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-md p-8 border-2 border-dashed border-gray-300 hover:border-indigo-400 transition-colors">
        <input
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />
        <label htmlFor="file-upload" className="flex flex-col items-center cursor-pointer">
          <UploadIcon className="w-16 h-16 text-gray-400 mb-4" />
          <span className="text-lg font-medium text-gray-700 mb-2">
            {file ? file.name : 'Clique para selecionar um arquivo'}
          </span>
          <span className="text-sm text-gray-500">Ou arraste e solte o arquivo aqui</span>
        </label>
      </div>

      {file && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center">
          <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
          <div className="flex-1">
            <p className="text-sm font-medium text-green-900">Arquivo selecionado</p>
            <p className="text-xs text-green-700">
              {file.name} ({(file.size / 1024).toFixed(2)} KB)
            </p>
          </div>
          {loadingAIMapping && (
            <div className="flex items-center space-x-2">
              <Loader className="w-4 h-4 text-indigo-600 animate-spin" />
              <span className="text-xs text-indigo-600 font-medium">IA analisando colunas...</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">Dicas para sua planilha:</h3>
        <ul className="text-xs text-blue-800 space-y-1">
          <li>• A primeira linha deve conter os nomes das colunas</li>
          <li>• Certifique-se de ter pelo menos as colunas: Nome e Endereço</li>
          <li>• Remova linhas vazias ou com dados incompletos</li>
          <li>• Formato aceito: .xlsx ou .xls</li>
        </ul>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <Table className="w-20 h-20 text-indigo-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Mapeamento de Colunas</h2>
        <p className="text-gray-600">
          IA identificou automaticamente as colunas. Você pode ajustar se necessário.
        </p>
      </div>

      <div className="mb-6 bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex items-center">
        <Sparkles className="w-5 h-5 text-indigo-600 mr-3 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-indigo-900">Mapeamento Inteligente Ativado</p>
          <p className="text-xs text-indigo-700">
            Claude AI analisou sua planilha e identificou as colunas automaticamente
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-8">
        <div className="space-y-4">
          {REQUIRED_FIELDS.map((field) => {
            const currentMapping = mappings.find((m) => m.systemField === field.key);
            return (
              <div
                key={field.key}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
              >
                <div className="flex-1">
                  <label className="text-sm font-medium text-gray-900">
                    {field.label}
                    {field.required && <span className="text-red-500 ml-1">*</span>}
                  </label>
                  <p className="text-xs text-gray-500 mt-1">
                    Campo do sistema:{' '}
                    <code className="bg-gray-200 px-1 rounded">{field.key}</code>
                  </p>
                </div>

                <div className="flex-1 ml-6">
                  <select
                    value={currentMapping?.excelColumn || ''}
                    onChange={(e) => handleMappingChange(field.key, e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  >
                    <option value="">Selecione uma coluna do Excel</option>
                    {excelColumns.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-xs text-yellow-800">
            <strong>Atenção:</strong> Campos marcados com * são obrigatórios e devem ser
            mapeados para continuar.
          </p>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <Settings className="w-20 h-20 text-indigo-600 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Confirmar Importação</h2>
        <p className="text-gray-600">Revise os dados antes de iniciar o processamento</p>
      </div>

      <div className="bg-white rounded-xl shadow-md p-8 mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Resumo do Arquivo</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Arquivo</p>
            <p className="text-lg font-semibold text-gray-900">{file?.name}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Tamanho</p>
            <p className="text-lg font-semibold text-gray-900">
              {file ? (file.size / 1024).toFixed(2) : 0} KB
            </p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Registros Estimados</p>
            <p className="text-lg font-semibold text-gray-900">{excelData.length} clientes</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <p className="text-sm text-gray-600">Campos Mapeados</p>
            <p className="text-lg font-semibold text-gray-900">
              {mappings.filter((m) => m.excelColumn).length} / {REQUIRED_FIELDS.length}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-8 mb-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">Preview dos Dados</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {REQUIRED_FIELDS.filter((f) =>
                  mappings.find((m) => m.systemField === f.key && m.excelColumn)
                ).map((field) => (
                  <th
                    key={field.key}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {field.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {previewData.map((row, idx) => (
                <tr key={idx}>
                  {REQUIRED_FIELDS.filter((f) =>
                    mappings.find((m) => m.systemField === f.key && m.excelColumn)
                  ).map((field) => (
                    <td
                      key={field.key}
                      className="px-6 py-4 whitespace-nowrap text-sm text-gray-900"
                    >
                      {row[field.key] || '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h4 className="text-sm font-semibold text-blue-900 mb-3">
          O que acontecerá após confirmar:
        </h4>
        <div className="space-y-2 text-sm text-blue-800">
          <div className="flex items-start">
            <CheckCircle className="w-4 h-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
            <span>Os dados serão importados para o sistema</span>
          </div>
          <div className="flex items-start">
            <CheckCircle className="w-4 h-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
            <span>Geocodificação automática dos endereços</span>
          </div>
          <div className="flex items-start">
            <CheckCircle className="w-4 h-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
            <span>Busca de informações no Google Places</span>
          </div>
          <div className="flex items-start">
            <CheckCircle className="w-4 h-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
            <span>Análise de fotos com IA (se disponíveis)</span>
          </div>
          <div className="flex items-start">
            <CheckCircle className="w-4 h-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
            <span>Você poderá acompanhar o progresso na página Pipeline</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/')}
            className="text-indigo-600 hover:text-indigo-800 mb-4 flex items-center font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao Dashboard
          </button>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
              <UploadIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Importar Clientes
              </h1>
              <p className="text-gray-600 text-sm">
                Vision AI processará automaticamente seus dados
              </p>
            </div>
          </div>
        </div>

        {/* Step Indicator */}
        {renderStepIndicator()}

        {/* Error Message */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start max-w-4xl mx-auto">
            <AlertCircle className="w-5 h-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-900">Erro</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Step Content */}
        <div className="mb-8">
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
          {currentStep === 3 && renderStep3()}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between max-w-4xl mx-auto">
          <button
            onClick={handleBack}
            disabled={currentStep === 1}
            className="flex items-center px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed font-medium"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Voltar
          </button>

          {currentStep < 3 ? (
            <button
              onClick={handleNext}
              className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md font-medium"
            >
              Próximo
              <ArrowRight className="w-5 h-5 ml-2" />
            </button>
          ) : (
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="flex items-center px-8 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {uploading ? (
                <>
                  <Loader className="w-5 h-5 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5 mr-2" />
                  Confirmar e Processar
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Default export para lazy loading
export default UploadPage;

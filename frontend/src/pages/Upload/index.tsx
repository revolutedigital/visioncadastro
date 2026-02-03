import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { API_BASE_URL } from '../../config/api';
import { authFetch } from '../../utils/api';
import {
  Upload as UploadIcon, FileSpreadsheet, CheckCircle, ArrowRight,
  ArrowLeft, Table, Settings, Loader, AlertCircle, X, Sparkles,
} from 'lucide-react';
import { useApp } from '../../contexts/AppContext';

type WizardStep = 1 | 2 | 3;

interface ColumnMapping { excelColumn: string; systemField: string; }

const REQUIRED_FIELDS = [
  { key: 'cnpj', label: 'Documento (CNPJ ou CPF)', required: true },
  { key: 'nome', label: 'Nome do Cliente', required: false, hint: 'Opcional - será preenchido pela Receita' },
  { key: 'endereco', label: 'Endereço', required: false, hint: 'Opcional - será preenchido pela Receita' },
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
      const data = await selectedFile.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      if (jsonData.length === 0) { setError('Arquivo vazio'); setLoadingAIMapping(false); return; }
      const headers = jsonData[0] as string[];
      setExcelColumns(headers);
      const rows = jsonData.slice(1).map((row: any) => {
        const obj: any = {};
        headers.forEach((h, i) => { obj[h] = row[i]; });
        return obj;
      });
      setExcelData(rows);

      const formData = new FormData();
      formData.append('file', selectedFile);
      const response = await authFetch(`${API_BASE_URL}/api/upload/suggest-mapping`, { method: 'POST', body: formData });
      const result = await response.json();
      if (result.success && result.mapping) {
        setMappings(REQUIRED_FIELDS.map((f) => ({ excelColumn: result.mapping[f.key] || '', systemField: f.key })));
      } else {
        setMappings(REQUIRED_FIELDS.map((f) => {
          const match = headers.find((col) =>
            col.toLowerCase().includes(f.key.toLowerCase()) ||
            f.label.toLowerCase().includes(col.toLowerCase()) ||
            (f.key === 'estado' && (col.toLowerCase().includes('uf') || col.toLowerCase() === 'estado'))
          );
          return { excelColumn: match || '', systemField: f.key };
        }));
      }
      setLoadingAIMapping(false);
    } catch {
      setError('Erro ao processar arquivo.');
      setLoadingAIMapping(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 1 && !file) { setError('Selecione um arquivo'); return; }
    if (currentStep === 2) {
      const ok = REQUIRED_FIELDS.filter((f) => f.required).every((f) => mappings.find((m) => m.systemField === f.key && m.excelColumn));
      if (!ok) { setError('Mapeie todos os campos obrigatórios'); return; }
      setPreviewData(excelData.slice(0, 5).map((row) => {
        const mapped: any = {};
        mappings.forEach((m) => { if (m.excelColumn) mapped[m.systemField] = row[m.excelColumn] || ''; });
        return mapped;
      }));
    }
    setError(null);
    setCurrentStep((currentStep + 1) as WizardStep);
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
      const response = await authFetch(`${API_BASE_URL}/api/upload`, { method: 'POST', body: formData });
      const data = await response.json();
      dismissToast(loadingToast);
      if (data.success) {
        const total = data.data?.clientesCriados || data.total || 0;
        showSuccess(`${total} clientes criados com sucesso.`);
        setTimeout(() => navigate('/pipeline'), 1000);
      } else {
        setError(data.error || 'Erro ao fazer upload');
        showError(data.error || 'Erro ao fazer upload');
        setUploading(false);
      }
    } catch {
      dismissToast(loadingToast);
      setError('Erro ao enviar arquivo.');
      showError('Erro ao enviar arquivo.');
      setUploading(false);
    }
  };

  const steps = [{ n: 1, label: 'Upload' }, { n: 2, label: 'Mapeamento' }, { n: 3, label: 'Confirmação' }];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <button onClick={() => navigate('/')} className="text-indigo-600 hover:text-indigo-700 mb-3 flex items-center text-sm font-medium">
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </button>
        <h1 className="text-xl font-semibold text-zinc-900">Importar Clientes</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Arca AI processará automaticamente seus dados</p>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-center">
        {steps.map((step, idx) => (
          <div key={step.n} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-semibold transition-colors ${
                currentStep > step.n ? 'bg-emerald-500 text-white' : currentStep === step.n ? 'bg-indigo-600 text-white' : 'bg-zinc-100 text-zinc-400'
              }`}>
                {currentStep > step.n ? <CheckCircle className="w-5 h-5" /> : step.n}
              </div>
              <span className={`text-[12px] mt-1.5 font-medium ${currentStep === step.n ? 'text-indigo-600' : 'text-zinc-400'}`}>{step.label}</span>
            </div>
            {idx < steps.length - 1 && <div className={`w-20 h-px mx-3 mb-5 ${currentStep > step.n ? 'bg-emerald-500' : 'bg-zinc-200'}`} />}
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Step 1 */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div className="text-center mb-4">
            <FileSpreadsheet className="w-12 h-12 text-indigo-600 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-zinc-900">Selecione sua planilha</h2>
            <p className="text-sm text-zinc-500">Formato aceito: .xlsx ou .xls</p>
          </div>
          <div className="bg-white rounded-xl border-2 border-dashed border-zinc-300 hover:border-indigo-400 transition-colors p-8">
            <input type="file" accept=".xlsx,.xls" onChange={handleFileSelect} className="hidden" id="file-upload" />
            <label htmlFor="file-upload" className="flex flex-col items-center cursor-pointer">
              <UploadIcon className="w-10 h-10 text-zinc-400 mb-3" />
              <span className="text-sm font-medium text-zinc-700">{file ? file.name : 'Clique para selecionar'}</span>
              <span className="text-[13px] text-zinc-400 mt-1">Ou arraste e solte aqui</span>
            </label>
          </div>
          {file && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center gap-3">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-zinc-900">{file.name}</p>
                <p className="text-[12px] text-zinc-500">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              {loadingAIMapping && (
                <div className="flex items-center gap-1.5">
                  <Loader className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
                  <span className="text-[12px] text-indigo-600 font-medium">IA analisando...</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 2 */}
      {currentStep === 2 && (
        <div className="space-y-4">
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0" />
            <p className="text-[13px] text-indigo-700"><span className="font-medium">Mapeamento Inteligente</span> — IA identificou as colunas automaticamente</p>
          </div>
          <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest p-5 space-y-3">
            {REQUIRED_FIELDS.map((field) => {
              const cur = mappings.find((m) => m.systemField === field.key);
              return (
                <div key={field.key} className="flex items-center justify-between p-3 bg-surface-secondary rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-0.5">*</span>}
                      {(field as any).hint && <span className="text-xs text-emerald-600 ml-2">({(field as any).hint})</span>}
                    </p>
                    <p className="text-[11px] text-zinc-400 mt-0.5">Campo: <code className="bg-zinc-200 px-1 rounded text-[11px]">{field.key}</code></p>
                  </div>
                  <select
                    value={cur?.excelColumn || ''}
                    onChange={(e) => setMappings((prev) => prev.map((m) => m.systemField === field.key ? { ...m, excelColumn: e.target.value } : m))}
                    className="w-56 px-3 py-1.5 border border-[#E5E5EA] rounded-lg text-sm focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="">Selecione coluna</option>
                    {excelColumns.map((col) => <option key={col} value={col}>{col}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3 */}
      {currentStep === 3 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest p-5">
            <h3 className="text-sm font-semibold text-zinc-900 mb-3">Resumo</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Arquivo', value: file?.name },
                { label: 'Tamanho', value: file ? `${(file.size / 1024).toFixed(1)} KB` : '-' },
                { label: 'Registros', value: `${excelData.length} clientes` },
                { label: 'Campos', value: `${mappings.filter((m) => m.excelColumn).length}/${REQUIRED_FIELDS.length}` },
              ].map((item) => (
                <div key={item.label} className="bg-surface-secondary p-3 rounded-lg">
                  <p className="text-[12px] text-zinc-500">{item.label}</p>
                  <p className="text-sm font-medium text-zinc-900">{item.value}</p>
                </div>
              ))}
            </div>
          </div>
          {previewData.length > 0 && (
            <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest p-5 overflow-x-auto">
              <h3 className="text-sm font-semibold text-zinc-900 mb-3">Preview</h3>
              <table className="min-w-full divide-y divide-[#E5E5EA]">
                <thead>
                  <tr>
                    {REQUIRED_FIELDS.filter((f) => mappings.find((m) => m.systemField === f.key && m.excelColumn)).map((f) => (
                      <th key={f.key} className="px-4 py-2 text-left text-[11px] font-medium text-zinc-500 uppercase tracking-wider">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E5EA]">
                  {previewData.map((row, idx) => (
                    <tr key={idx}>
                      {REQUIRED_FIELDS.filter((f) => mappings.find((m) => m.systemField === f.key && m.excelColumn)).map((f) => (
                        <td key={f.key} className="px-4 py-2.5 text-sm text-zinc-900">{row[f.key] || '-'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={() => { setError(null); setCurrentStep((currentStep - 1) as WizardStep); }}
          disabled={currentStep === 1}
          className="flex items-center gap-1.5 px-4 py-2 bg-surface-secondary text-zinc-700 rounded-lg hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        {currentStep < 3 ? (
          <button onClick={handleNext} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium transition-colors">
            Próximo <ArrowRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {uploading ? <><Loader className="w-4 h-4 animate-spin" /> Processando...</> : <><CheckCircle className="w-4 h-4" /> Confirmar e Processar</>}
          </button>
        )}
      </div>
    </div>
  );
}

export default UploadPage;

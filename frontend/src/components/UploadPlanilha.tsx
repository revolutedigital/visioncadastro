import { useState, useRef } from 'react';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

interface UploadResult {
  success: boolean;
  message?: string;
  data?: {
    planilhaId: string;
    nomeArquivo: string;
    totalLinhas: number;
    clientesImportados: number;
    erros: string[];
    duplicatasDetectadas: number;
  };
  error?: string;
}

export function UploadPlanilha({ onSuccess }: { onSuccess?: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setResult(null);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post<UploadResult>(`${API_BASE_URL}/api/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setResult(response.data);
      if (onSuccess) onSuccess();
      setFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error: any) {
      setResult({
        success: false,
        error: error.response?.data?.error || 'Erro ao fazer upload',
      });
    } finally {
      setUploading(false);
    }
  };

  const isValidFile = (filename: string) => {
    return /\.(xlsx|xls|csv)$/i.test(filename);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragActive
            ? 'border-indigo-500 bg-indigo-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFileSelect}
          className="hidden"
          id="file-upload"
        />

        {!file ? (
          <div>
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="mt-4">
              <label
                htmlFor="file-upload"
                className="cursor-pointer text-indigo-600 hover:text-indigo-500 font-medium"
              >
                Clique para selecionar
              </label>
              <span className="text-gray-600"> ou arraste o arquivo aqui</span>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Formatos aceitos: .xlsx, .xls, .csv (até 10MB)
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-center space-x-2">
              <svg
                className="h-8 w-8 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span className="text-gray-700 font-medium">{file.name}</span>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <div className="mt-4 flex justify-center space-x-3">
              <button
                onClick={handleUpload}
                disabled={uploading || !isValidFile(file.name)}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {uploading ? 'Enviando...' : 'Fazer Upload'}
              </button>
              <button
                onClick={() => {
                  setFile(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                disabled={uploading}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Loading */}
      {uploading && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center space-x-3">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="text-blue-800">Processando planilha...</span>
          </div>
        </div>
      )}

      {/* Result */}
      {result && (
        <div
          className={`mt-6 border rounded-lg p-6 ${
            result.success
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}
        >
          {result.success && result.data ? (
            <div>
              <div className="flex items-center space-x-2 mb-4">
                <svg
                  className="h-6 w-6 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-green-800">
                  Upload realizado com sucesso!
                </h3>
              </div>
              <div className="space-y-2 text-sm text-green-800">
                <p>
                  <strong>Arquivo:</strong> {result.data.nomeArquivo}
                </p>
                <p>
                  <strong>Total de linhas:</strong> {result.data.totalLinhas}
                </p>
                <p>
                  <strong>Clientes importados:</strong>{' '}
                  {result.data.clientesImportados}
                </p>
                {result.data.duplicatasDetectadas > 0 && (
                  <p className="text-yellow-700">
                    <strong>⚠️ Duplicatas detectadas:</strong>{' '}
                    {result.data.duplicatasDetectadas}
                  </p>
                )}
                {result.data.erros.length > 0 && (
                  <div className="mt-3">
                    <p className="font-semibold text-yellow-700">Avisos:</p>
                    <ul className="list-disc list-inside mt-1 text-yellow-700">
                      {result.data.erros.slice(0, 5).map((erro, idx) => (
                        <li key={idx}>{erro}</li>
                      ))}
                      {result.data.erros.length > 5 && (
                        <li>... e mais {result.data.erros.length - 5} avisos</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center space-x-2 mb-2">
                <svg
                  className="h-6 w-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
                <h3 className="text-lg font-semibold text-red-800">
                  Erro no upload
                </h3>
              </div>
              <p className="text-sm text-red-700">{result.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

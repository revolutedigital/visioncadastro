import { useNavigate } from 'react-router-dom';
import { FileSpreadsheet, Upload, MapPin, Image, Brain } from 'lucide-react';

export function EmptyState() {
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest p-12 text-center">
      <div className="max-w-lg mx-auto">
        <div className="w-16 h-16 mx-auto mb-6 bg-indigo-50 rounded-2xl flex items-center justify-center">
          <FileSpreadsheet className="w-8 h-8 text-indigo-600" />
        </div>

        <h2 className="text-2xl font-semibold text-zinc-900 mb-2">
          Bem-vindo ao Sistema RAC
        </h2>
        <p className="text-zinc-500 mb-8">
          Análise Inteligente de Clientes com IA
        </p>

        <button
          onClick={() => navigate('/upload')}
          className="inline-flex items-center px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          aria-label="Importar primeira planilha"
        >
          <Upload className="w-4 h-4 mr-2" />
          Importar Primeira Planilha
        </button>

        <div className="mt-10 pt-8 border-t border-[#E5E5EA]">
          <p className="text-[13px] text-zinc-400 mb-5 font-medium uppercase tracking-wider">
            O sistema irá processar automaticamente
          </p>
          <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
            {[
              { icon: MapPin, label: 'Geocodificação', sub: 'Endereço → GPS', color: 'indigo' },
              { icon: Image, label: 'Google Places', sub: 'Fotos e Dados', color: 'violet' },
              { icon: Brain, label: 'Análise com IA', sub: 'Arca AI', color: 'purple' },
            ].map((item) => (
              <div key={item.label} className="bg-surface-secondary rounded-xl p-4">
                <item.icon className={`w-6 h-6 text-${item.color}-600 mx-auto mb-2`} />
                <p className="text-[13px] font-medium text-zinc-900">{item.label}</p>
                <p className="text-[11px] text-zinc-500 mt-0.5">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

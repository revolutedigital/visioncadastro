import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import {
  LayoutDashboard,
  Users,
  GitBranch,
  Upload,
  Settings,
  Sparkles,
} from 'lucide-react';
import { VisionAILogo } from '../branding/VisionAILogo';

const navigation = [
  { name: 'Dashboard', to: '/', icon: LayoutDashboard },
  { name: 'Clientes', to: '/clientes', icon: Users },
  { name: 'Pipeline', to: '/pipeline', icon: GitBranch },
  { name: 'Upload', to: '/upload', icon: Upload },
  { name: 'Configurações', to: '/configuracoes', icon: Settings },
];

interface AIStatus {
  isProcessing: boolean;
  waiting: number;
  active: number;
}

export function Sidebar() {
  const [aiStatus, setAiStatus] = useState<AIStatus>({
    isProcessing: false,
    waiting: 0,
    active: 0,
  });

  useEffect(() => {
    // Buscar status da IA
    const fetchStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/analysis/status`);
        const data = await response.json();
        if (data.success && data.filas) {
          // Somar todas as filas para ter o status geral
          const totalProcessando =
            (data.filas.receita?.processando || 0) +
            (data.filas.geocoding?.processando || 0) +
            (data.filas.places?.processando || 0) +
            (data.filas.analysis?.processando || 0);

          const totalAguardando =
            (data.filas.receita?.aguardando || 0) +
            (data.filas.geocoding?.aguardando || 0) +
            (data.filas.places?.aguardando || 0) +
            (data.filas.analysis?.aguardando || 0);

          setAiStatus({
            isProcessing: totalProcessando > 0 || totalAguardando > 0,
            waiting: totalAguardando,
            active: totalProcessando,
          });
        }
      } catch (error) {
        console.error('Erro ao buscar status da IA:', error);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Atualizar a cada 5s
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-64 bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 text-white flex flex-col shadow-2xl">
      {/* Logo/Brand */}
      <div className="h-16 flex items-center px-6 border-b border-indigo-800/30 bg-slate-900/50 backdrop-blur-sm">
        <VisionAILogo variant="full" size="sm" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1">
        {navigation.map((item) => (
          <NavLink
            key={item.name}
            to={item.to}
            end={item.to === '/'}
          >
            {({ isActive }) => (
              <div
                className={`flex items-center px-4 py-3 rounded-lg transition-all duration-200 group relative overflow-hidden ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/50'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`}
              >
                {isActive && (
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 animate-pulse"></div>
                )}
                <item.icon
                  className={`w-5 h-5 mr-3 transition-transform group-hover:scale-110 relative z-10 ${
                    isActive ? 'drop-shadow-glow' : ''
                  }`}
                />
                <span className="font-medium relative z-10">{item.name}</span>
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-indigo-800/30 bg-slate-900/50 backdrop-blur-sm">
        <div className="px-4 py-3 bg-gradient-to-br from-indigo-900/50 to-purple-900/50 rounded-lg border border-indigo-700/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Sparkles className={`w-4 h-4 mr-2 ${aiStatus.isProcessing ? 'text-indigo-400 animate-pulse' : 'text-slate-500'}`} />
              <div>
                <p className="text-xs font-semibold text-indigo-300">AI Vision</p>
                <div className="flex items-center mt-0.5">
                  {aiStatus.isProcessing ? (
                    <>
                      <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse mr-1.5"></div>
                      <span className="text-xs text-slate-400">
                        Processando {aiStatus.active > 0 && `(${aiStatus.active})`}
                      </span>
                    </>
                  ) : (
                    <>
                      <div className="w-1.5 h-1.5 bg-slate-500 rounded-full mr-1.5"></div>
                      <span className="text-xs text-slate-500">Inativa</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

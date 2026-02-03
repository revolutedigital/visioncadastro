import { NavLink } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { useAuth } from '../../contexts/AuthContext';
import { authFetch } from '../../utils/api';
import {
  LayoutDashboard,
  Users,
  GitBranch,
  Upload,
  Settings,
  Sparkles,
  LogOut,
  User,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ArcaAILogo } from '../branding/ArcaAILogo';

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
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIStatus>({
    isProcessing: false,
    waiting: 0,
    active: 0,
  });

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await authFetch(`${API_BASE_URL}/api/analysis/status`);
        const data = await response.json();
        if (data.success && data.filas) {
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
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div
      className={`${
        collapsed ? 'w-[68px]' : 'w-60'
      } bg-zinc-900 text-white flex flex-col transition-all duration-200 ease-in-out border-r border-zinc-800 relative`}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 z-10 w-6 h-6 bg-white border border-zinc-200 rounded-full flex items-center justify-center shadow-rest hover:shadow-hover text-zinc-500 hover:text-zinc-900 transition-colors"
      >
        {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {/* Logo */}
      <div className="h-14 flex items-center px-4 border-b border-zinc-800">
        {collapsed ? (
          <ArcaAILogo variant="icon" size="sm" />
        ) : (
          <ArcaAILogo variant="full" size="sm" />
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navigation.map((item) => (
          <NavLink key={item.name} to={item.to} end={item.to === '/'}>
            {({ isActive }) => (
              <div
                className={`flex items-center ${
                  collapsed ? 'justify-center px-2' : 'px-3'
                } py-2.5 rounded-lg transition-colors duration-150 ${
                  isActive
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
                title={collapsed ? item.name : undefined}
              >
                <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
                {!collapsed && (
                  <span className="ml-3 text-sm font-medium">{item.name}</span>
                )}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* AI Status */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="px-3 py-2.5 bg-zinc-800/60 rounded-lg border border-zinc-700/50">
            <div className="flex items-center gap-2">
              <Sparkles
                className={`w-3.5 h-3.5 ${
                  aiStatus.isProcessing ? 'text-indigo-400' : 'text-zinc-500'
                }`}
              />
              <div>
                <p className="text-[11px] font-medium text-zinc-300">Arca AI</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      aiStatus.isProcessing ? 'bg-emerald-400' : 'bg-zinc-600'
                    }`}
                  />
                  <span className="text-[11px] text-zinc-500">
                    {aiStatus.isProcessing
                      ? `Processando${aiStatus.active > 0 ? ` (${aiStatus.active})` : ''}`
                      : 'Inativa'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User */}
      <div className="px-3 py-3 border-t border-zinc-800">
        <div className={`flex items-center ${collapsed ? 'justify-center' : 'justify-between'}`}>
          <div className={`flex items-center ${collapsed ? '' : 'min-w-0 flex-1'}`}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <User className="w-4 h-4 text-white" />
            </div>
            {!collapsed && (
              <div className="ml-3 min-w-0">
                <p className="text-sm font-medium text-white truncate">
                  {user?.name || 'Usuario'}
                </p>
                <p className="text-[11px] text-zinc-500 truncate">{user?.email}</p>
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={logout}
              className="p-1.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors flex-shrink-0"
              title="Sair"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

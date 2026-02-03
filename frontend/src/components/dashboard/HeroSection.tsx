import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';
import { QuickActions } from './QuickActions';
import { LiveStatus } from './LiveStatus';

interface HeroSectionProps {
  totalClientes: number;
  pipelineProgress: number;
  estimatedTime: string;
  weeklyGrowth?: number;
  pendingJobs: number;
}

export function HeroSection({
  totalClientes,
  pipelineProgress,
  estimatedTime,
  weeklyGrowth = 0,
  pendingJobs,
}: HeroSectionProps) {
  const getTrendIcon = () => {
    if (weeklyGrowth > 0) return <TrendingUp className="w-3.5 h-3.5" />;
    if (weeklyGrowth < 0) return <TrendingDown className="w-3.5 h-3.5" />;
    return <Minus className="w-3.5 h-3.5" />;
  };

  const getTrendColor = () => {
    if (weeklyGrowth > 0) return 'text-emerald-600 bg-emerald-50';
    if (weeklyGrowth < 0) return 'text-red-600 bg-red-50';
    return 'text-zinc-500 bg-zinc-100';
  };

  return (
    <div className="space-y-4">
      {/* Title row */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Dashboard</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Sistema de Análise Inteligente de Clientes</p>
        </div>
        <LiveStatus />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest p-5 hover:shadow-hover transition-shadow">
          <p className="text-[13px] font-medium text-zinc-500 mb-3">Total de Clientes</p>
          <div className="flex items-end justify-between">
            <p className="text-3xl font-semibold text-zinc-900 font-mono">{totalClientes.toLocaleString()}</p>
            <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[12px] font-medium ${getTrendColor()}`}>
              {getTrendIcon()}
              <span>{Math.abs(weeklyGrowth)}%</span>
            </div>
          </div>
          <p className="text-[12px] text-zinc-400 mt-2">vs. semana passada</p>
        </div>

        <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest p-5 hover:shadow-hover transition-shadow">
          <p className="text-[13px] font-medium text-zinc-500 mb-3">Pipeline Completo</p>
          <p className="text-3xl font-semibold text-zinc-900 font-mono mb-3">{pipelineProgress}%</p>
          <div className="w-full bg-zinc-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${pipelineProgress}%` }}
            />
          </div>
          <p className="text-[12px] text-zinc-400 mt-2">Progresso geral</p>
        </div>

        <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest p-5 hover:shadow-hover transition-shadow">
          <p className="text-[13px] font-medium text-zinc-500 mb-3">Tempo Estimado</p>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-500" />
            <p className="text-3xl font-semibold text-zinc-900 font-mono">{estimatedTime}</p>
          </div>
          <p className="text-[12px] text-zinc-400 mt-2">
            {pendingJobs} job{pendingJobs !== 1 ? 's' : ''} pendente{pendingJobs !== 1 ? 's' : ''}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest p-5 hover:shadow-hover transition-shadow">
          <p className="text-[13px] font-medium text-zinc-500 mb-3">Ações Rápidas</p>
          <QuickActions />
        </div>
      </div>
    </div>
  );
}

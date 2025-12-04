import { HeroSection } from '../../components/dashboard/HeroSection';
import { AlertsPanel } from '../../components/dashboard/AlertsPanel';
import { PipelineTimeline } from '../../components/dashboard/PipelineTimeline';
import { InsightsTabs } from '../../components/dashboard/InsightsTabs';
import { EmptyState } from '../../components/dashboard/EmptyState';
import { SkeletonHeroSection, SkeletonCard, SkeletonPipelineTimeline } from '../../components/Skeleton';
import { useDashboardStats } from '../../hooks/useDashboardStats';

export function DashboardPage() {
  const { stats, loading, error } = useDashboardStats({
    enableSSE: false, // TODO: Habilitar quando SSE estiver pronto
    pollingInterval: 10000,
  });

  // Loading state
  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <SkeletonHeroSection />
        <SkeletonCard />
        <SkeletonPipelineTimeline />
      </div>
    );
  }

  // Error state
  if (error || !stats) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <h2 className="text-xl font-bold text-red-900 mb-2">Erro ao Carregar Dashboard</h2>
          <p className="text-red-700">{error || 'Falha ao carregar dados'}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-semibold"
          >
            Recarregar Página
          </button>
        </div>
      </div>
    );
  }

  const hasData = stats.computed.totalClientes > 0;

  // Empty state
  if (!hasData) {
    return (
      <div className="p-6">
        <EmptyState />
      </div>
    );
  }

  // Main dashboard
  return (
    <div className="p-6 space-y-6">
      {/* Hero Section com KPIs principais */}
      <HeroSection
        totalClientes={stats.computed.totalClientes}
        pipelineProgress={stats.computed.pipelineProgress}
        estimatedTime={stats.computed.estimatedTime}
        weeklyGrowth={stats.computed.weeklyGrowth}
        pendingJobs={stats.computed.pendingJobs}
      />

      {/* Alertas e Ações Urgentes */}
      <AlertsPanel />

      {/* Pipeline Timeline Interativo */}
      <PipelineTimeline
        geocodingProgress={stats.geocoding.percentual}
        geocodingProcessed={stats.geocoding.geocodificados}
        geocodingTotal={stats.geocoding.total}
        placesProgress={Math.round((stats.places.processados / stats.places.total) * 100) || 0}
        placesProcessed={stats.places.processados}
        placesTotal={stats.places.total}
        analysisProgress={stats.analysis.percentual}
        analysisProcessed={stats.analysis.concluidos}
        analysisTotal={stats.analysis.total}
        tipologiaProgress={stats.tipologia.percentual}
        tipologiaProcessed={stats.tipologia.classificados}
        tipologiaTotal={stats.tipologia.total}
      />

      {/* Insights com Tabs (Lazy Loaded) */}
      <InsightsTabs />
    </div>
  );
}

// Default export para lazy loading
export default DashboardPage;

import { useState, lazy, Suspense } from 'react';
import { Award, Activity, BarChart3, Image } from 'lucide-react';
import { Skeleton } from '../Skeleton';

const TopPerformers = lazy(() => import('./tabs/TopPerformers'));
const TipologiaInsights = lazy(() => import('./tabs/TipologiaInsights'));
const DataQualityInsights = lazy(() => import('./tabs/DataQualityInsights'));
const VisualAnalysis = lazy(() => import('./tabs/VisualAnalysis'));

type TabId = 'performers' | 'tipologia' | 'quality' | 'visual';

interface Tab {
  id: TabId;
  label: string;
  icon: any;
  component: React.LazyExoticComponent<any>;
}

const tabs: Tab[] = [
  { id: 'performers', label: 'Top Performers', icon: Award, component: TopPerformers },
  { id: 'tipologia', label: 'Tipologias', icon: Activity, component: TipologiaInsights },
  { id: 'quality', label: 'Qualidade', icon: BarChart3, component: DataQualityInsights },
  { id: 'visual', label: 'Visual', icon: Image, component: VisualAnalysis },
];

export function InsightsTabs() {
  const [activeTab, setActiveTab] = useState<TabId>('performers');
  const ActiveComponent = tabs.find((t) => t.id === activeTab)?.component;

  return (
    <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest">
      {/* Tab Navigation */}
      <div className="border-b border-[#E5E5EA]">
        <nav className="flex">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'border-b-2 border-indigo-600 text-indigo-600'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-surface-secondary'
                }`}
                aria-label={`Ver ${tab.label}`}
                aria-selected={isActive}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="p-5">
        <Suspense
          fallback={
            <div className="space-y-3">
              <Skeleton width="100%" height={60} variant="rounded" />
              <Skeleton width="100%" height={100} variant="rounded" />
            </div>
          }
        >
          {ActiveComponent && <ActiveComponent />}
        </Suspense>
      </div>
    </div>
  );
}

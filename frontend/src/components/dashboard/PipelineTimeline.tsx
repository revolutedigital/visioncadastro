import { MapPin, Image, Brain, Activity, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface PipelineTimelineProps {
  geocodingProgress: number;
  geocodingProcessed: number;
  geocodingTotal: number;
  placesProgress: number;
  placesProcessed: number;
  placesTotal: number;
  analysisProgress: number;
  analysisProcessed: number;
  analysisTotal: number;
  tipologiaProgress: number;
  tipologiaProcessed: number;
  tipologiaTotal: number;
}

export function PipelineTimeline({
  geocodingProgress, geocodingProcessed, geocodingTotal,
  placesProgress, placesProcessed, placesTotal,
  analysisProgress, analysisProcessed, analysisTotal,
  tipologiaProgress, tipologiaProcessed, tipologiaTotal,
}: PipelineTimelineProps) {
  const navigate = useNavigate();

  const phases = [
    { id: 'geocoding', name: 'Geocodificação', icon: MapPin, progress: geocodingProgress, processed: geocodingProcessed, total: geocodingTotal, color: 'indigo' },
    { id: 'places', name: 'Google Places', icon: Image, progress: placesProgress, processed: placesProcessed, total: placesTotal, color: 'violet' },
    { id: 'analysis', name: 'Análise IA', icon: Brain, progress: analysisProgress, processed: analysisProcessed, total: analysisTotal, color: 'purple' },
    { id: 'tipologia', name: 'Tipologia', icon: Activity, progress: tipologiaProgress, processed: tipologiaProcessed, total: tipologiaTotal, color: 'fuchsia' },
  ];

  const colorMap: Record<string, { bg: string; text: string; bar: string }> = {
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', bar: 'bg-indigo-600' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-600', bar: 'bg-violet-600' },
    purple: { bg: 'bg-purple-50', text: 'text-purple-600', bar: 'bg-purple-600' },
    fuchsia: { bg: 'bg-fuchsia-50', text: 'text-fuchsia-600', bar: 'bg-fuchsia-600' },
  };

  return (
    <div className="bg-white rounded-xl border border-[#E5E5EA] shadow-rest p-5">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Pipeline de Processamento</h2>
          <p className="text-[13px] text-zinc-500 mt-0.5">Status em tempo real de cada fase</p>
        </div>
        <button
          onClick={() => navigate('/pipeline')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-[13px] font-medium"
          aria-label="Ver detalhes do pipeline"
        >
          Ver Detalhes
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Horizontal stepper */}
      <div className="grid grid-cols-4 gap-3">
        {phases.map((phase, index) => {
          const Icon = phase.icon;
          const c = colorMap[phase.color];
          return (
            <button
              key={phase.id}
              onClick={() => navigate('/pipeline')}
              className="text-center group cursor-pointer"
              aria-label={`Ver detalhes de ${phase.name}`}
            >
              <div className="flex items-center justify-center mb-3">
                {index > 0 && <div className="flex-1 h-px bg-zinc-200 -mr-1" />}
                <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                  <Icon className={`w-5 h-5 ${c.text}`} />
                </div>
                {index < phases.length - 1 && <div className="flex-1 h-px bg-zinc-200 -ml-1" />}
              </div>
              <p className="text-[12px] font-medium text-zinc-900 mb-0.5">{phase.name}</p>
              <p className={`text-lg font-semibold font-mono ${c.text}`}>{phase.progress}%</p>
              <p className="text-[11px] text-zinc-400 mt-0.5">{phase.processed}/{phase.total}</p>
              <div className="mt-2 w-full bg-zinc-100 rounded-full h-1 overflow-hidden">
                <div className={`h-1 rounded-full ${c.bar} transition-all duration-500`} style={{ width: `${phase.progress}%` }} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

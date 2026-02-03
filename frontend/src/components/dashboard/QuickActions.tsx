import { useNavigate } from 'react-router-dom';
import { Upload, Play, Users } from 'lucide-react';

export function QuickActions() {
  const navigate = useNavigate();

  const actions = [
    { icon: Upload, label: 'Upload', onClick: () => navigate('/upload') },
    { icon: Play, label: 'Pipeline', onClick: () => navigate('/pipeline') },
    { icon: Users, label: 'Clientes', onClick: () => navigate('/clientes') },
  ];

  return (
    <div className="flex flex-col gap-1.5">
      {actions.map((action, index) => {
        const Icon = action.icon;
        return (
          <button
            key={index}
            onClick={action.onClick}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-zinc-700 bg-surface-secondary hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
            aria-label={action.label}
          >
            <Icon className="w-4 h-4" />
            {action.label}
          </button>
        );
      })}
    </div>
  );
}

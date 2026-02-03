interface ArcaAILogoProps {
  variant?: 'full' | 'icon' | 'text';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ArcaAILogo({ variant = 'full', size = 'md', className = '' }: ArcaAILogoProps) {

  const iconSize = { sm: 'w-6 h-6', md: 'w-8 h-8', lg: 'w-12 h-12' };
  const textSize = { sm: 'text-lg', md: 'text-xl', lg: 'text-3xl' };

  const EyeIcon = ({ cls = '' }: { cls?: string }) => (
    <div className={`${cls}`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="eyeG" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6366f1" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <path d="M10 50 Q 10 30, 50 30 Q 90 30, 90 50 Q 90 70, 50 70 Q 10 70, 10 50 Z" fill="url(#eyeG)" />
        <circle cx="50" cy="50" r="16" fill="#312e81" />
        <circle cx="50" cy="50" r="8" fill="#1e1b4b" />
        <circle cx="50" cy="50" r="3" fill="#818cf8" />
      </svg>
    </div>
  );

  if (variant === 'icon') return <EyeIcon cls={iconSize[size]} />;

  if (variant === 'text') {
    return (
      <div className={`font-bold ${textSize[size]} ${className}`}>
        <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">Arca</span>
        <span className="text-white ml-0.5">AI</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <EyeIcon cls={iconSize[size]} />
      <div className={`font-bold ${textSize[size]}`}>
        <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">Arca</span>
        <span className="text-white ml-0.5">AI</span>
      </div>
    </div>
  );
}

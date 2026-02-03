interface ArcaAILogoProps {
  variant?: 'full' | 'icon' | 'text';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  dark?: boolean;
}

export function ArcaAILogo({ variant = 'full', size = 'md', className = '', dark = true }: ArcaAILogoProps) {
  const iconSizes = { sm: 'w-7 h-7', md: 'w-9 h-9', lg: 'w-12 h-12', xl: 'w-16 h-16' };
  const textSizes = { sm: 'text-lg', md: 'text-xl', lg: 'text-2xl', xl: 'text-4xl' };
  const gapSizes = { sm: 'gap-2', md: 'gap-2.5', lg: 'gap-3', xl: 'gap-4' };

  const ArcaIcon = ({ cls = '' }: { cls?: string }) => (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cls}
    >
      <defs>
        <linearGradient id="arcaIconGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366F1" />
          <stop offset="50%" stopColor="#8B5CF6" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>
        <linearGradient id="arcaEyeGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#34D399" />
        </linearGradient>
      </defs>
      {/* Background */}
      <rect width="40" height="40" rx="10" fill="url(#arcaIconGrad)" />
      {/* A shape (Arca) */}
      <path
        d="M20 7 L9 33 L13.5 33 L16 27 L24 27 L26.5 33 L31 33 L20 7Z"
        fill="white"
      />
      {/* A crossbar */}
      <rect x="14.5" y="21" width="11" height="3" rx="1" fill="white" opacity="0.85" />
      {/* AI eye - represents vision */}
      <circle cx="20" cy="14.5" r="2.5" fill="url(#arcaEyeGrad)" />
      <circle cx="20" cy="14.5" r="1" fill="white" />
    </svg>
  );

  if (variant === 'icon') {
    return <ArcaIcon cls={`${iconSizes[size]} ${className}`} />;
  }

  if (variant === 'text') {
    return (
      <div className={`font-bold tracking-tight ${textSizes[size]} ${className}`}>
        <span className={dark
          ? 'bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent'
          : 'bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent'
        }>
          Arca
        </span>
        <span className={dark
          ? 'bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent'
          : 'bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent'
        }>
          AI
        </span>
      </div>
    );
  }

  // Full variant
  return (
    <div className={`flex items-center ${gapSizes[size]} ${className}`}>
      <ArcaIcon cls={iconSizes[size]} />
      <div className={`font-bold tracking-tight ${textSizes[size]}`}>
        <span className={dark
          ? 'bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent'
          : 'bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent'
        }>
          Arca
        </span>
        <span className={dark
          ? 'bg-gradient-to-r from-emerald-400 to-emerald-300 bg-clip-text text-transparent'
          : 'bg-gradient-to-r from-emerald-600 to-emerald-500 bg-clip-text text-transparent'
        }>
          AI
        </span>
      </div>
    </div>
  );
}

export default ArcaAILogo;

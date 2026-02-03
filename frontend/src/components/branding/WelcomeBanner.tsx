import { Sparkles, Zap, Eye, Users, Image, Brain } from 'lucide-react';

interface WelcomeBannerProps {
  stats?: {
    totalClientes: number;
    fotosAnalisadas: number;
    processingActive: boolean;
  };
}

export function WelcomeBanner({ stats }: WelcomeBannerProps) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 rounded-2xl shadow-2xl p-8 mb-8">
      {/* Animated background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 w-64 h-64 bg-white rounded-full mix-blend-overlay filter blur-3xl animate-blob"></div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-purple-300 rounded-full mix-blend-overlay filter blur-3xl animate-blob animation-delay-2000"></div>
        <div className="absolute bottom-0 left-1/2 w-64 h-64 bg-indigo-300 rounded-full mix-blend-overlay filter blur-3xl animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10 flex items-center justify-between">
        {/* Left side - Welcome text */}
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-3">
            <Eye className="w-10 h-10 text-white drop-shadow-lg" />
            <h1 className="text-4xl font-bold text-white drop-shadow-lg">
              Arca<span className="text-purple-200">AI</span>
            </h1>
          </div>
          <p className="text-indigo-100 text-lg font-medium mb-2">
            Análise Inteligente de Clientes com IA
          </p>
          <p className="text-indigo-200 text-sm max-w-2xl">
            Sistema de análise automatizada que identifica oportunidades através de visão
            computacional, dados geográficos e inteligência artificial avançada.
          </p>

          {stats && (
            <div className="flex items-center gap-6 mt-6">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg border border-white/30">
                <Users className="w-5 h-5 text-white" />
                <div>
                  <p className="text-white text-sm font-bold">{stats.totalClientes}</p>
                  <p className="text-indigo-100 text-xs">Clientes</p>
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm rounded-lg border border-white/30">
                <Image className="w-5 h-5 text-white" />
                <div>
                  <p className="text-white text-sm font-bold">{stats.fotosAnalisadas}</p>
                  <p className="text-indigo-100 text-xs">Fotos Analisadas</p>
                </div>
              </div>

              {stats.processingActive && (
                <div className="flex items-center gap-2 px-4 py-2 bg-green-500/30 backdrop-blur-sm rounded-lg border border-green-400/50 animate-pulse">
                  <Zap className="w-5 h-5 text-green-200" />
                  <p className="text-white text-sm font-bold">IA Processando</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right side - Decorative icon */}
        <div className="hidden lg:block">
          <div className="relative">
            <Sparkles className="w-32 h-32 text-purple-200 opacity-20 animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <Brain className="w-20 h-20 text-white drop-shadow-2xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

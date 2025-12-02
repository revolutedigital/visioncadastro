import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import toast from 'react-hot-toast';
import { API_BASE_URL } from '../config/api';

interface ProcessingStatus {
  geocoding: { total: number; processed: number; percentage: number };
  places: { total: number; processed: number; percentage: number };
  analysis: { total: number; processed: number; percentage: number };
  enrichment?: { total: number; processed: number; percentage: number };
}

interface AppContextType {
  // Processing Status
  processingStatus: ProcessingStatus | null;
  refreshProcessingStatus: () => Promise<void>;

  // Search
  globalSearchQuery: string;
  setGlobalSearchQuery: (query: string) => void;

  // Notifications
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
  showInfo: (message: string) => void;
  showLoading: (message: string) => string;
  dismissToast: (toastId: string) => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: ReactNode }) {
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [globalSearchQuery, setGlobalSearchQuery] = useState('');

  // Load processing status on mount and set up polling
  useEffect(() => {
    refreshProcessingStatus();
    const interval = setInterval(refreshProcessingStatus, 15000); // Poll every 15 seconds
    return () => clearInterval(interval);
  }, []);

  const refreshProcessingStatus = async () => {
    try {
      const [geocodingRes, placesRes, analysisRes, enrichmentRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/geocoding/status`),
        fetch(`${API_BASE_URL}/api/places/status`),
        fetch(`${API_BASE_URL}/api/analysis/status`),
        fetch(`${API_BASE_URL}/api/enrichment/status`).catch(() => null),
      ]);

      const [geocoding, places, analysis] = await Promise.all([
        geocodingRes.json(),
        placesRes.json(),
        analysisRes.json(),
      ]);

      const enrichment = enrichmentRes ? await enrichmentRes.json() : null;

      setProcessingStatus({
        geocoding: {
          total: geocoding.clientes.total,
          processed: geocoding.clientes.geocodificados,
          percentage: geocoding.clientes.percentualCompleto,
        },
        places: {
          total: places.clientes.total,
          processed: places.clientes.processados,
          percentage: Math.round((places.clientes.processados / places.clientes.total) * 100),
        },
        analysis: {
          total: analysis.clientes.total,
          processed: analysis.clientes.concluidos,
          percentage: analysis.clientes.percentualCompleto,
        },
        enrichment: enrichment
          ? {
              total: enrichment.clientes.total,
              processed: enrichment.clientes.enriquecidos,
              percentage: enrichment.clientes.percentualCompleto,
            }
          : undefined,
      });
    } catch (error) {
      console.error('Error loading processing status:', error);
    }
  };

  // Notification functions
  const showSuccess = (message: string) => {
    toast.success(message, {
      duration: 4000,
      position: 'top-right',
      style: {
        background: '#10B981',
        color: '#fff',
        padding: '16px',
        borderRadius: '8px',
      },
      iconTheme: {
        primary: '#fff',
        secondary: '#10B981',
      },
    });
  };

  const showError = (message: string) => {
    toast.error(message, {
      duration: 5000,
      position: 'top-right',
      style: {
        background: '#EF4444',
        color: '#fff',
        padding: '16px',
        borderRadius: '8px',
      },
      iconTheme: {
        primary: '#fff',
        secondary: '#EF4444',
      },
    });
  };

  const showInfo = (message: string) => {
    toast(message, {
      duration: 4000,
      position: 'top-right',
      icon: 'ℹ️',
      style: {
        background: '#3B82F6',
        color: '#fff',
        padding: '16px',
        borderRadius: '8px',
      },
    });
  };

  const showLoading = (message: string): string => {
    return toast.loading(message, {
      position: 'top-right',
      style: {
        background: '#6366F1',
        color: '#fff',
        padding: '16px',
        borderRadius: '8px',
      },
    });
  };

  const dismissToast = (toastId: string) => {
    toast.dismiss(toastId);
  };

  const value: AppContextType = {
    processingStatus,
    refreshProcessingStatus,
    globalSearchQuery,
    setGlobalSearchQuery,
    showSuccess,
    showError,
    showInfo,
    showLoading,
    dismissToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}

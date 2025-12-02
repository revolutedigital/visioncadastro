import { useEffect, useState, useRef, useCallback } from 'react';
import { logger } from '../utils/logger';
import { API_BASE_URL } from '../config/api';

interface SSELog {
  type: 'connected' | 'processing' | 'success' | 'error' | 'progress';
  message: string;
  timestamp: string;
  jobId?: string;
  data?: any;
  result?: any;
  error?: string;
  progress?: number;
}

interface UseSSELogsOptions {
  enabled?: boolean;
  maxLogs?: number;
  maxRetries?: number;
  initialRetryDelay?: number;
  maxRetryDelay?: number;
  backoffMultiplier?: number;
}

/**
 * Custom hook para conectar ao stream SSE de logs em tempo real
 * Com reconexão automática e exponential backoff
 *
 * @param queueName Nome da fila (receita, geocoding, places, analysis)
 * @param options Opções de configuração
 */
export function useSSELogs(queueName: string, options: UseSSELogsOptions = {}) {
  const {
    enabled = false,
    maxLogs = 100,
    maxRetries = 5,
    initialRetryDelay = 1000, // 1 segundo
    maxRetryDelay = 30000, // 30 segundos
    backoffMultiplier = 2,
  } = options;

  const [logs, setLogs] = useState<SSELog[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const eventSourceRef = useRef<EventSource | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  const addLog = useCallback(
    (log: SSELog) => {
      setLogs((prev) => {
        const newLogs = [log, ...prev];
        // Limitar número de logs na memória
        return newLogs.slice(0, maxLogs);
      });
    },
    [maxLogs]
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  const calculateRetryDelay = useCallback(
    (attempt: number): number => {
      const delay = Math.min(
        initialRetryDelay * Math.pow(backoffMultiplier, attempt),
        maxRetryDelay
      );
      // Adicionar jitter (±25%) para evitar thundering herd
      const jitter = delay * 0.25 * (Math.random() * 2 - 1);
      return Math.round(delay + jitter);
    },
    [initialRetryDelay, backoffMultiplier, maxRetryDelay]
  );

  const connectSSE = useCallback(() => {
    // Fechar conexão anterior se existir
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Limpar timeout de retry anterior
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    const url = `${API_BASE_URL}/api/analysis/queue-logs-stream/${queueName}`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      // Reset contador de reconexões ao conectar com sucesso
      reconnectAttemptsRef.current = 0;
      setRetryCount(0);
      logger.debug(`SSE conectado: ${queueName}`);
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as SSELog;
        addLog(data);
      } catch (err) {
        logger.error('Erro ao parsear mensagem SSE', err as Error, {
          component: 'useSSELogs',
          queueName,
        });
      }
    };

    eventSource.onerror = (err) => {
      logger.error('Erro no SSE', err as unknown as Error, {
        component: 'useSSELogs',
        queueName,
        retryAttempt: reconnectAttemptsRef.current,
      });

      setIsConnected(false);
      eventSource.close();

      // Tentar reconectar se não excedeu o máximo de tentativas
      if (reconnectAttemptsRef.current < maxRetries) {
        const delay = calculateRetryDelay(reconnectAttemptsRef.current);
        reconnectAttemptsRef.current += 1;
        setRetryCount(reconnectAttemptsRef.current);

        setError(
          `Conexão perdida. Reconectando em ${Math.round(delay / 1000)}s... (tentativa ${
            reconnectAttemptsRef.current
          }/${maxRetries})`
        );

        retryTimeoutRef.current = setTimeout(() => {
          logger.info(`Tentando reconectar SSE: ${queueName}`, {
            attempt: reconnectAttemptsRef.current,
          });
          connectSSE();
        }, delay);
      } else {
        setError(
          `Falha ao conectar após ${maxRetries} tentativas. Recarregue a página para tentar novamente.`
        );
        logger.error('SSE: Máximo de tentativas de reconexão atingido', new Error('Max retries'), {
          component: 'useSSELogs',
          queueName,
          maxRetries,
        });
      }
    };
  }, [queueName, maxRetries, calculateRetryDelay, addLog]);

  useEffect(() => {
    if (!enabled) {
      // Se desabilitado, desconectar
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
        setIsConnected(false);
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
      setRetryCount(0);
      setError(null);
      return;
    }

    // Conectar ao SSE
    connectSSE();

    // Cleanup ao desmontar
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      setIsConnected(false);
    };
  }, [enabled, connectSSE]);

  return {
    logs,
    isConnected,
    error,
    clearLogs,
    retryCount,
    reconnect: connectSSE, // Permitir reconexão manual
  };
}

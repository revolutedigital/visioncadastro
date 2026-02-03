import Queue from 'bull';
import Redis from 'ioredis';

// ========== CRITICAL DEBUG - ENVIRONMENT VARIABLES ==========
console.log('==========================================');
console.log('🔥 QUEUE.CONFIG.TS CARREGANDO...');
console.log('🔥 TIMESTAMP:', new Date().toISOString());
console.log('==========================================');
console.log('🔍 ALL REDIS ENV KEYS:', Object.keys(process.env).filter(k => k.includes('REDIS')));
console.log('🔍 REDIS_URL EXISTS?:', 'REDIS_URL' in process.env);
console.log('🔍 REDIS_URL VALUE:', process.env.REDIS_URL);
console.log('🔍 REDIS_URL LENGTH:', process.env.REDIS_URL?.length);
console.log('🔍 REDIS_HOST:', process.env.REDIS_HOST);
console.log('🔍 REDIS_PORT:', process.env.REDIS_PORT);
console.log('🔍 NODE_ENV:', process.env.NODE_ENV);
console.log('🔍 PORT:', process.env.PORT);
console.log('==========================================');

// CRITICAL: Se não tiver REDIS_URL em produção, NÃO tentar conectar
const REDIS_DISABLED = !process.env.REDIS_URL && process.env.NODE_ENV === 'production';

if (REDIS_DISABLED) {
  console.warn('⚠️  MODO SEM REDIS: Filas completamente desabilitadas em produção sem REDIS_URL');
  console.warn('⚠️  Exportando mocks para todas as filas - nenhuma conexão será tentada');
}

// Mock queue que não faz nada
const createMockQueue = (name: string): any => {
  console.log(`📦 Mock ${name} queue criado (sem Redis)`);
  return {
    name,
    // Métodos que os workers podem chamar
    add: () => Promise.resolve({ id: 'mock', data: {} }),
    process: () => {},
    on: () => {},
    once: () => {},
    removeAllListeners: () => {},
    close: () => Promise.resolve(),
    clean: () => Promise.resolve([]),
    empty: () => Promise.resolve(),
    pause: () => Promise.resolve(),
    resume: () => Promise.resolve(),
    count: () => Promise.resolve(0),
    getJob: () => Promise.resolve(null),
    getJobs: () => Promise.resolve([]),
    getWaiting: () => Promise.resolve([]),
    getWaitingCount: () => Promise.resolve(0),
    getActive: () => Promise.resolve([]),
    getActiveCount: () => Promise.resolve(0),
    getCompleted: () => Promise.resolve([]),
    getCompletedCount: () => Promise.resolve(0),
    getFailed: () => Promise.resolve([]),
    getFailedCount: () => Promise.resolve(0),
    getDelayed: () => Promise.resolve([]),
    getDelayedCount: () => Promise.resolve(0),
    getJobCounts: () => Promise.resolve({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    }),
  };
};

// Variáveis que serão exportadas
let geocodingQueue: any;
let receitaQueue: any;
let normalizationQueue: any;
let placesQueue: any;
let analysisQueue: any;
let tipologiaQueue: any;
let documentLookupQueue: any;
let duplicateDetectionQueue: any;

// Se Redis desabilitado, criar mocks
if (REDIS_DISABLED) {
  geocodingQueue = createMockQueue('geocoding');
  receitaQueue = createMockQueue('receita');
  normalizationQueue = createMockQueue('normalization');
  placesQueue = createMockQueue('places');
  analysisQueue = createMockQueue('analysis');
  tipologiaQueue = createMockQueue('tipologia');
  documentLookupQueue = createMockQueue('document-lookup');
  duplicateDetectionQueue = createMockQueue('duplicate-detection');
} else {
  // Código normal com Redis REAL
  console.log('📦 Inicializando filas com Redis REAL');

  // Configuração do Redis - suporta REDIS_URL do Railway ou config individual
  console.log('📦 Configuração Redis:', process.env.REDIS_URL ? 'Usando REDIS_URL' : `Usando ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || '6379'}`);

  // Criar client Redis para o Bull
  // IMPORTANT: Não usar lazyConnect - workers precisam de conexão ativa
  const createRedisClient = (type: 'client' | 'subscriber' | 'bclient') => {
    // Configuração robusta para Railway Redis
    const robustConfig = {
      maxRetriesPerRequest: null, // Bull requer null para blocking commands
      enableReadyCheck: false,
      connectTimeout: 30000, // 30s para conectar
      commandTimeout: 60000, // 60s para comandos (era 10s - muito curto)
      keepAlive: 30000, // Enviar keepalive a cada 30s
      enableOfflineQueue: true, // Enfileirar comandos quando desconectado
      retryStrategy: (times: number) => {
        // Reconectar com backoff exponencial até 30s
        const delay = Math.min(times * 1000, 30000);
        console.log(`🔄 Redis ${type} reconectando em ${delay}ms (tentativa ${times})`);
        return delay;
      },
      reconnectOnError: (err: Error) => {
        // Reconectar em erros de conexão
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'];
        if (targetErrors.some(e => err.message.includes(e))) {
          console.log(`🔄 Redis ${type} reconectando após erro: ${err.message}`);
          return true;
        }
        return false;
      },
    };

    // IMPORTANTE: ioredis aceita URL diretamente como string, NÃO como {url: ...}
    if (process.env.REDIS_URL) {
      console.log(`📦 Criando Redis client (${type}) com REDIS_URL`);
      const client = new Redis(process.env.REDIS_URL, robustConfig);
      client.on('connect', () => console.log(`✅ Redis ${type} conectado`));
      client.on('ready', () => console.log(`✅ Redis ${type} pronto`));
      client.on('error', (err) => console.error(`❌ Redis ${type} erro:`, err.message));
      client.on('close', () => console.warn(`⚠️ Redis ${type} conexão fechada`));
      client.on('reconnecting', () => console.log(`🔄 Redis ${type} reconectando...`));
      return client;
    }
    console.log(`📦 Criando Redis client (${type}) com host/port`);
    const client = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      ...robustConfig,
    });
    client.on('connect', () => console.log(`✅ Redis ${type} conectado`));
    client.on('ready', () => console.log(`✅ Redis ${type} pronto`));
    client.on('error', (err) => console.error(`❌ Redis ${type} erro:`, err.message));
    client.on('close', () => console.warn(`⚠️ Redis ${type} conexão fechada`));
    client.on('reconnecting', () => console.log(`🔄 Redis ${type} reconectando...`));
    return client;
  };

  // Opções padrão para as filas
  const defaultJobOptions = {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 500,
    removeOnFail: 500,
  };

  // Fila de Geocodificação
  geocodingQueue = new Queue('geocoding', {
    createClient: createRedisClient,
    defaultJobOptions,
  });

  geocodingQueue.on('completed', (job: any, result: any) => {
    console.log(`✅ Job ${job.id} completado:`, result);
  });

  geocodingQueue.on('failed', (job: any, err: any) => {
    console.error(`❌ Job ${job?.id} falhou:`, err.message);
  });

  geocodingQueue.on('error', (error: any) => {
    console.error('❌ Erro na fila:', error);
  });

  geocodingQueue.on('waiting', (jobId: any) => {
    console.log(`⏳ Job ${jobId} aguardando processamento`);
  });

  console.log('📦 Fila de Geocodificação configurada');

  // Fila de Receita Federal e Normalização
  receitaQueue = new Queue('receita', {
    createClient: createRedisClient,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: 2,
      timeout: 60000,
    },
  });

  receitaQueue.on('completed', (job: any, result: any) => {
    console.log(`✅ Receita Job ${job.id} completado:`, result);
  });

  receitaQueue.on('failed', (job: any, err: any) => {
    console.error(`❌ Receita Job ${job?.id} falhou:`, err.message);
  });

  receitaQueue.on('error', (error: any) => {
    console.error('❌ Erro na fila Receita:', error);
  });

  receitaQueue.on('waiting', (jobId: any) => {
    console.log(`⏳ Receita Job ${jobId} aguardando processamento`);
  });

  console.log('📦 Fila de Receita Federal configurada');

  // Fila de Normalização (entre Receita e Geocoding)
  normalizationQueue = new Queue('normalization', {
    createClient: createRedisClient,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: 2,
      timeout: 30000,
    },
  });

  normalizationQueue.on('completed', (job: any, result: any) => {
    console.log(`✅ Normalization Job ${job.id} completado:`, result);
  });

  normalizationQueue.on('failed', (job: any, err: any) => {
    console.error(`❌ Normalization Job ${job?.id} falhou:`, err.message);
  });

  normalizationQueue.on('error', (error: any) => {
    console.error('❌ Erro na fila Normalization:', error);
  });

  normalizationQueue.on('waiting', (jobId: any) => {
    console.log(`⏳ Normalization Job ${jobId} aguardando processamento`);
  });

  console.log('📦 Fila de Normalização configurada');

  // Fila de Google Places
  placesQueue = new Queue('places', {
    createClient: createRedisClient,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: 2,
    },
  });

  placesQueue.on('completed', (job: any, result: any) => {
    console.log(`✅ Places Job ${job.id} completado:`, result);
  });

  placesQueue.on('failed', (job: any, err: any) => {
    console.error(`❌ Places Job ${job?.id} falhou:`, err.message);
  });

  placesQueue.on('error', (error: any) => {
    console.error('❌ Erro na fila Places:', error);
  });

  placesQueue.on('waiting', (jobId: any) => {
    console.log(`⏳ Places Job ${jobId} aguardando processamento`);
  });

  console.log('📦 Fila de Google Places configurada');

  // Fila de Análise de IA
  analysisQueue = new Queue('analysis', {
    createClient: createRedisClient,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: 2,
      timeout: 120000,
    },
  });

  analysisQueue.on('completed', (job: any, result: any) => {
    console.log(`✅ Analysis Job ${job.id} completado:`, result);
  });

  analysisQueue.on('failed', (job: any, err: any) => {
    console.error(`❌ Analysis Job ${job?.id} falhou:`, err.message);
  });

  analysisQueue.on('error', (error: any) => {
    console.error('❌ Erro na fila Analysis:', error);
  });

  analysisQueue.on('waiting', (jobId: any) => {
    console.log(`⏳ Analysis Job ${jobId} aguardando processamento`);
  });

  console.log('📦 Fila de Análise de IA configurada');

  // Fila de Tipologia (após análise de fotos)
  tipologiaQueue = new Queue('tipologia', {
    createClient: createRedisClient,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: 2,
      timeout: 60000,
    },
  });

  tipologiaQueue.on('completed', (job: any, result: any) => {
    console.log(`✅ Tipologia Job ${job.id} completado:`, result);
  });

  tipologiaQueue.on('failed', (job: any, err: any) => {
    console.error(`❌ Tipologia Job ${job?.id} falhou:`, err.message);
  });

  tipologiaQueue.on('error', (error: any) => {
    console.error('❌ Erro na fila Tipologia:', error);
  });

  tipologiaQueue.on('waiting', (jobId: any) => {
    console.log(`⏳ Tipologia Job ${jobId} aguardando processamento`);
  });

  console.log('📦 Fila de Tipologia configurada');

  // Fila de Document Lookup (CNPJA + SERPRO CPF)
  documentLookupQueue = new Queue('document-lookup', {
    createClient: createRedisClient,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: 3,
      timeout: 60000,
    },
  });

  documentLookupQueue.on('completed', (job: any, result: any) => {
    console.log(`✅ DocumentLookup Job ${job.id} completado:`, result);
  });

  documentLookupQueue.on('failed', (job: any, err: any) => {
    console.error(`❌ DocumentLookup Job ${job?.id} falhou:`, err.message);
  });

  documentLookupQueue.on('error', (error: any) => {
    console.error('❌ Erro na fila DocumentLookup:', error);
  });

  console.log('📦 Fila de Document Lookup configurada');

  // Fila de Detecção de Duplicatas
  duplicateDetectionQueue = new Queue('duplicate-detection', {
    createClient: createRedisClient,
    defaultJobOptions: {
      ...defaultJobOptions,
      attempts: 2,
      timeout: 30000,
    },
  });

  duplicateDetectionQueue.on('completed', (job: any, result: any) => {
    console.log(`✅ DuplicateDetection Job ${job.id} completado:`, result);
  });

  duplicateDetectionQueue.on('failed', (job: any, err: any) => {
    console.error(`❌ DuplicateDetection Job ${job?.id} falhou:`, err.message);
  });

  duplicateDetectionQueue.on('error', (error: any) => {
    console.error('❌ Erro na fila DuplicateDetection:', error);
  });

  console.log('📦 Fila de Detecção de Duplicatas configurada');
}

// Exports
export { geocodingQueue, receitaQueue, normalizationQueue, placesQueue, analysisQueue, tipologiaQueue, documentLookupQueue, duplicateDetectionQueue };
export default geocodingQueue;

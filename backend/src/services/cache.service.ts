import Redis from 'ioredis';

/**
 * Service de Cache Redis - Sprint 1
 * Implementa caching inteligente para APIs externas com TTL configurável
 */
export class CacheService {
  private redis: Redis | null;
  private defaultTTL: number = 60 * 60 * 24 * 30; // 30 dias (dados da Receita são estáveis)
  private disabled: boolean = false;

  constructor() {
    // CRITICAL: Se não tiver REDIS_URL em produção, NÃO tentar conectar
    if (!process.env.REDIS_URL && process.env.NODE_ENV === 'production') {
      console.warn('⚠️  Cache desabilitado: sem REDIS_URL em produção');
      this.redis = null;
      this.disabled = true;
      return;
    }

    // IMPORTANTE: ioredis aceita URL como primeiro argumento, NÃO como {url: ...}
    if (process.env.REDIS_URL) {
      console.log('📦 Cache: Conectando via REDIS_URL');
      this.redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        connectTimeout: 5000,
        commandTimeout: 5000,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });
    } else {
      console.log('📦 Cache: Conectando via host/port');
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      });
    }

    this.redis.on('error', (error) => {
      console.error('❌ Erro Redis:', error);
    });

    this.redis.on('connect', () => {
      console.log('✅ Cache Redis conectado');
    });
  }

  /**
   * Gera chave de cache padronizada
   */
  private generateKey(prefix: string, identifier: string): string {
    return `${prefix}:${identifier}`;
  }

  /**
   * Buscar no cache
   */
  async get<T>(prefix: string, identifier: string): Promise<T | null> {
    if (this.disabled || !this.redis) return null;

    try {
      const key = this.generateKey(prefix, identifier);
      const cached = await this.redis.get(key);

      if (!cached) {
        return null;
      }

      const parsed = JSON.parse(cached);
      console.log(`🎯 Cache HIT: ${key}`);

      return parsed as T;
    } catch (error) {
      console.error('Erro ao buscar cache:', error);
      return null;
    }
  }

  /**
   * Salvar no cache
   */
  async set<T>(
    prefix: string,
    identifier: string,
    data: T,
    ttl?: number
  ): Promise<void> {
    if (this.disabled || !this.redis) return;

    try {
      const key = this.generateKey(prefix, identifier);
      const serialized = JSON.stringify(data);
      const expirationTime = ttl || this.defaultTTL;

      await this.redis.setex(key, expirationTime, serialized);
      console.log(`💾 Cache SAVED: ${key} (TTL: ${expirationTime}s)`);
    } catch (error) {
      console.error('Erro ao salvar cache:', error);
    }
  }

  /**
   * Invalidar cache específico
   */
  async invalidate(prefix: string, identifier: string): Promise<void> {
    if (this.disabled || !this.redis) return;

    try {
      const key = this.generateKey(prefix, identifier);
      await this.redis.del(key);
      console.log(`🗑️  Cache INVALIDATED: ${key}`);
    } catch (error) {
      console.error('Erro ao invalidar cache:', error);
    }
  }

  /**
   * Invalidar todos os caches de um prefixo
   */
  async invalidatePrefix(prefix: string): Promise<void> {
    if (this.disabled || !this.redis) return;

    try {
      const pattern = `${prefix}:*`;
      const keys = await this.redis.keys(pattern);

      if (keys.length > 0) {
        await this.redis.del(...keys);
        console.log(`🗑️  Cache INVALIDATED: ${keys.length} keys do prefixo ${prefix}`);
      }
    } catch (error) {
      console.error('Erro ao invalidar cache por prefixo:', error);
    }
  }

  /**
   * Verificar se existe no cache
   */
  async exists(prefix: string, identifier: string): Promise<boolean> {
    if (this.disabled || !this.redis) return false;

    try {
      const key = this.generateKey(prefix, identifier);
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Erro ao verificar cache:', error);
      return false;
    }
  }

  /**
   * Obter TTL restante de uma chave
   */
  async getTTL(prefix: string, identifier: string): Promise<number> {
    if (this.disabled || !this.redis) return -1;

    try {
      const key = this.generateKey(prefix, identifier);
      return await this.redis.ttl(key);
    } catch (error) {
      console.error('Erro ao obter TTL:', error);
      return -1;
    }
  }

  /**
   * Estatísticas do cache
   */
  async getStats(): Promise<{
    totalKeys: number;
    memoryUsed: string;
    hitRate?: number;
  }> {
    if (this.disabled || !this.redis) {
      return {
        totalKeys: 0,
        memoryUsed: 'N/A (disabled)',
      };
    }

    try {
      const info = await this.redis.info('stats');
      const memory = await this.redis.info('memory');

      const dbsize = await this.redis.dbsize();

      // Parse memory info
      const memoryMatch = memory.match(/used_memory_human:(.+)/);
      const memoryUsed = memoryMatch ? memoryMatch[1].trim() : 'N/A';

      return {
        totalKeys: dbsize,
        memoryUsed,
      };
    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      return {
        totalKeys: 0,
        memoryUsed: 'N/A',
      };
    }
  }

  /**
   * Limpar todo o cache (flush database)
   */
  async clearAll(): Promise<void> {
    if (this.disabled || !this.redis) {
      console.log('⚠️  Cache desabilitado - nada para limpar');
      return;
    }

    try {
      await this.redis.flushdb();
      console.log('🗑️  Cache CLEARED: Todos os dados do Redis foram removidos');
    } catch (error) {
      console.error('Erro ao limpar todo o cache:', error);
      throw error;
    }
  }

  /**
   * Fechar conexão Redis
   */
  async disconnect(): Promise<void> {
    if (this.disabled || !this.redis) return;

    await this.redis.quit();
    console.log('👋 Cache Redis desconectado');
  }
}

// Prefixos de cache padronizados
export const CachePrefixes = {
  RECEITA_CNPJ: 'receita:cnpj',
  GEOCODING: 'geocoding:address',
  PLACES_SEARCH: 'places:search',
  PLACES_DETAILS: 'places:details',
  PLACES_PHOTO: 'places:photo',
  ANALYSIS_IA: 'analysis:ia',
} as const;

// Singleton instance
export const cacheService = new CacheService();

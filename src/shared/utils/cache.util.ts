import { In_CacheOptions } from "src/interfaces/util.interface";
import redisConfig from "../../config/redis";
import logger from "./logger.util";

class CacheUtil {
  private static instance: CacheUtil;
  private defaultTTL: number = 3600; // 1 hour
  private defaultPrefix: string = "cache:";

  private constructor() {}

  public static getInstance(): CacheUtil {
    if (!CacheUtil.instance) {
      CacheUtil.instance = new CacheUtil();
    }
    return CacheUtil.instance;
  }

  /**
   * Generate cache key with prefix
   */
  private generateKey(key: string, prefix?: string): string {
    const finalPrefix = prefix || this.defaultPrefix;
    return `${finalPrefix}${key}`;
  }

  /**
   * Set value in cache
   */
  public async set<T>(
    key: string,
    value: T,
    options?: In_CacheOptions,
  ): Promise<void> {
    try {
      const redis = redisConfig.getClient();
      const cacheKey = this.generateKey(key, options?.prefix);
      const ttl = options?.ttl || this.defaultTTL;

      const serialized = JSON.stringify(value);
      await redis.setex(cacheKey, ttl, serialized);

      logger.debug("Cache set", {
        key: cacheKey,
        ttl,
      });
    } catch (error) {
      logger.error("Failed to set cache", {
        error: error instanceof Error ? error.message : "Unknown error",
        key,
      });
      // Don't throw error to prevent cache failures from breaking the app
    }
  }

  /**
   * Get value from cache
   */
  public async get<T>(
    key: string,
    options?: In_CacheOptions,
  ): Promise<T | null> {
    try {
      const redis = redisConfig.getClient();
      const cacheKey = this.generateKey(key, options?.prefix);

      const cached = await redis.get(cacheKey);

      if (!cached) {
        logger.debug("Cache miss", { key: cacheKey });
        return null;
      }

      logger.debug("Cache hit", { key: cacheKey });
      return JSON.parse(cached) as T;
    } catch (error) {
      logger.error("Failed to get cache", {
        error: error instanceof Error ? error.message : "Unknown error",
        key,
      });
      return null;
    }
  }

  /**
   * Delete value from cache
   */
  public async del(key: string, options?: In_CacheOptions): Promise<void> {
    try {
      const redis = redisConfig.getClient();
      const cacheKey = this.generateKey(key, options?.prefix);

      await redis.del(cacheKey);

      logger.debug("Cache deleted", { key: cacheKey });
    } catch (error) {
      logger.error("Failed to delete cache", {
        error: error instanceof Error ? error.message : "Unknown error",
        key,
      });
    }
  }

  /**
   * Check if key exists in cache
   */
  public async exists(
    key: string,
    options?: In_CacheOptions,
  ): Promise<boolean> {
    try {
      const redis = redisConfig.getClient();
      const cacheKey = this.generateKey(key, options?.prefix);

      const result = await redis.exists(cacheKey);
      return result === 1;
    } catch (error) {
      logger.error("Failed to check cache existence", {
        error: error instanceof Error ? error.message : "Unknown error",
        key,
      });
      return false;
    }
  }

  /**
   * Get or set cache (fetch if not exists)
   */
  public async getOrSet<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options?: In_CacheOptions,
  ): Promise<T> {
    try {
      // Try to get from cache
      const cached = await this.get<T>(key, options);

      if (cached !== null) {
        return cached;
      }

      // Fetch data
      const data = await fetchFn();

      // Store in cache
      await this.set(key, data, options);

      return data;
    } catch (error) {
      logger.error("Failed to get or set cache", {
        error: error instanceof Error ? error.message : "Unknown error",
        key,
      });
      // Fallback to fetching data
      return fetchFn();
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  public async delPattern(
    pattern: string,
    options?: In_CacheOptions,
  ): Promise<number> {
    try {
      const redis = redisConfig.getClient();
      const prefix = options?.prefix || this.defaultPrefix;
      const searchPattern = `${prefix}${pattern}`;

      const keys = await redis.keys(searchPattern);

      if (keys.length === 0) {
        return 0;
      }

      await redis.del(...keys);

      logger.debug("Cache pattern deleted", {
        pattern: searchPattern,
        count: keys.length,
      });

      return keys.length;
    } catch (error) {
      logger.error("Failed to delete cache pattern", {
        error: error instanceof Error ? error.message : "Unknown error",
        pattern,
      });
      return 0;
    }
  }

  /**
   * Increment value in cache
   */
  public async incr(key: string, options?: In_CacheOptions): Promise<number> {
    try {
      const redis = redisConfig.getClient();
      const cacheKey = this.generateKey(key, options?.prefix);

      const value = await redis.incr(cacheKey);

      // Set expiration if provided
      if (options?.ttl) {
        await redis.expire(cacheKey, options.ttl);
      }

      return value;
    } catch (error) {
      logger.error("Failed to increment cache", {
        error: error instanceof Error ? error.message : "Unknown error",
        key,
      });
      return 0;
    }
  }

  /**
   * Decrement value in cache
   */
  public async decr(key: string, options?: In_CacheOptions): Promise<number> {
    try {
      const redis = redisConfig.getClient();
      const cacheKey = this.generateKey(key, options?.prefix);

      const value = await redis.decr(cacheKey);

      // Set expiration if provided
      if (options?.ttl) {
        await redis.expire(cacheKey, options.ttl);
      }

      return value;
    } catch (error) {
      logger.error("Failed to decrement cache", {
        error: error instanceof Error ? error.message : "Unknown error",
        key,
      });
      return 0;
    }
  }

  /**
   * Get TTL (time to live) for a key
   */
  public async getTTL(key: string, options?: In_CacheOptions): Promise<number> {
    try {
      const redis = redisConfig.getClient();
      const cacheKey = this.generateKey(key, options?.prefix);

      const ttl = await redis.ttl(cacheKey);
      return Math.max(0, ttl);
    } catch (error) {
      logger.error("Failed to get cache TTL", {
        error: error instanceof Error ? error.message : "Unknown error",
        key,
      });
      return 0;
    }
  }

  /**
   * Set expiration for existing key
   */
  public async expire(
    key: string,
    ttl: number,
    options?: In_CacheOptions,
  ): Promise<void> {
    try {
      const redis = redisConfig.getClient();
      const cacheKey = this.generateKey(key, options?.prefix);

      await redis.expire(cacheKey, ttl);

      logger.debug("Cache expiration set", {
        key: cacheKey,
        ttl,
      });
    } catch (error) {
      logger.error("Failed to set cache expiration", {
        error: error instanceof Error ? error.message : "Unknown error",
        key,
      });
    }
  }

  /**
   * Cache user data
   */
  public async cacheUser(
    userId: string,
    userData: any,
    ttl?: number,
  ): Promise<void> {
    await this.set(`user:${userId}`, userData, {
      ttl: ttl || 1800, // 30 minutes
      prefix: "auth:",
    });
  }

  /**
   * Get cached user data
   */
  public async getCachedUser(userId: string): Promise<any | null> {
    return this.get(`user:${userId}`, {
      prefix: "auth:",
    });
  }

  /**
   * Invalidate user cache
   */
  public async invalidateUser(userId: string): Promise<void> {
    await this.del(`user:${userId}`, {
      prefix: "auth:",
    });
  }

  /**
   * Cache API response
   */
  public async cacheApiResponse(
    endpoint: string,
    response: any,
    ttl?: number,
  ): Promise<void> {
    await this.set(endpoint, response, {
      ttl: ttl || 300, // 5 minutes
      prefix: "api:",
    });
  }

  /**
   * Get cached API response
   */
  public async getCachedApiResponse(endpoint: string): Promise<any | null> {
    return this.get(endpoint, {
      prefix: "api:",
    });
  }

  /**
   * Invalidate all API cache
   */
  public async invalidateAllApiCache(): Promise<number> {
    return this.delPattern("*", {
      prefix: "api:",
    });
  }

  /**
   * Cache query result
   */
  public async cacheQuery(
    queryKey: string,
    result: any,
    ttl?: number,
  ): Promise<void> {
    await this.set(queryKey, result, {
      ttl: ttl || 600, // 10 minutes
      prefix: "query:",
    });
  }

  /**
   * Get cached query result
   */
  public async getCachedQuery(queryKey: string): Promise<any | null> {
    return this.get(queryKey, {
      prefix: "query:",
    });
  }

  /**
   * Invalidate query cache by pattern
   */
  public async invalidateQueryCache(pattern: string): Promise<number> {
    return this.delPattern(pattern, {
      prefix: "query:",
    });
  }

  /**
   * Store rate limit data
   */
  public async setRateLimit(
    identifier: string,
    count: number,
    ttl: number,
  ): Promise<void> {
    await this.set(`ratelimit:${identifier}`, count, {
      ttl,
      prefix: "",
    });
  }

  /**
   * Get rate limit data
   */
  public async getRateLimit(identifier: string): Promise<number | null> {
    return this.get<number>(`ratelimit:${identifier}`, {
      prefix: "",
    });
  }

  /**
   * Increment rate limit counter
   */
  public async incrementRateLimit(
    identifier: string,
    ttl: number,
  ): Promise<number> {
    const key = `ratelimit:${identifier}`;
    const count = await this.incr(key, { prefix: "", ttl });
    return count;
  }

  /**
   * Get multiple values by keys
   */
  public async mget<T>(
    keys: string[],
    options?: In_CacheOptions,
  ): Promise<(T | null)[]> {
    try {
      const redis = redisConfig.getClient();
      const cacheKeys = keys.map((key) =>
        this.generateKey(key, options?.prefix),
      );

      const values = await redis.mget(...cacheKeys);

      return values.map((value) => {
        if (!value) return null;
        try {
          return JSON.parse(value) as T;
        } catch {
          return null;
        }
      });
    } catch (error) {
      logger.error("Failed to get multiple cache values", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple values
   */
  public async mset<T>(
    entries: Array<{ key: string; value: T }>,
    options?: In_CacheOptions,
  ): Promise<void> {
    try {
      const redis = redisConfig.getClient();
      const ttl = options?.ttl || this.defaultTTL;

      for (const entry of entries) {
        const cacheKey = this.generateKey(entry.key, options?.prefix);
        const serialized = JSON.stringify(entry.value);
        await redis.setex(cacheKey, ttl, serialized);
      }

      logger.debug("Multiple cache values set", {
        count: entries.length,
        ttl,
      });
    } catch (error) {
      logger.error("Failed to set multiple cache values", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

// Export singleton instance
export default CacheUtil.getInstance();

import Redis, { RedisOptions } from "ioredis";
import environment from "./environment";
import logger from "../shared/utils/logger.util";

class RedisConfig {
  private static instance: RedisConfig;
  private client: Redis | null = null;
  private subscriber: Redis | null = null;
  private publisher: Redis | null = null;

  private constructor() {}

  public static getInstance(): RedisConfig {
    if (!RedisConfig.instance) {
      RedisConfig.instance = new RedisConfig();
    }
    return RedisConfig.instance;
  }

  /**
   * Get Redis client configuration
   */
  private getRedisOptions(): RedisOptions {
    return {
      host: environment.redisHost,
      port: environment.redisPort,
      password: environment.redisPassword || undefined,
      db: environment.redisDb,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn(`Redis reconnection attempt ${times}, waiting ${delay}ms`);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      connectTimeout: 10000,
      lazyConnect: false,
      keepAlive: 30000,
      family: 4, // IPv4
      reconnectOnError: (err) => {
        const targetError = "READONLY";
        if (err.message.includes(targetError)) {
          logger.error("Redis reconnect on READONLY error");
          return true;
        }
        return false;
      },
    };
  }

  /**
   * Initialize Redis connection
   */
  public async connect(): Promise<Redis> {
    try {
      if (this.client && this.client.status === "ready") {
        logger.info("Redis client already connected");
        return this.client;
      }

      const options = this.getRedisOptions();
      this.client = new Redis(options);

      // Event handlers
      this.setupEventHandlers(this.client, "Main Client");

      // Wait for ready state
      await new Promise<void>((resolve, reject) => {
        this.client!.once("ready", () => {
          logger.info("✅ Redis connection established successfully", {
            host: environment.redisHost,
            port: environment.redisPort,
            db: environment.redisDb,
          });
          resolve();
        });

        this.client!.once("error", (error) => {
          logger.error("❌ Failed to connect to Redis", {
            error: error.message,
            host: environment.redisHost,
          });
          reject(error);
        });
      });

      // Test the connection
      await this.testConnection();

      return this.client;
    } catch (error) {
      logger.error("❌ Redis connection error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Get Redis client for Pub/Sub subscriber
   */
  public async getSubscriber(): Promise<Redis> {
    try {
      if (this.subscriber && this.subscriber.status === "ready") {
        return this.subscriber;
      }

      const options = this.getRedisOptions();
      this.subscriber = new Redis(options);

      this.setupEventHandlers(this.subscriber, "Subscriber");

      await new Promise<void>((resolve) => {
        this.subscriber!.once("ready", () => {
          logger.info("✅ Redis subscriber connected");
          resolve();
        });
      });

      return this.subscriber;
    } catch (error) {
      logger.error("❌ Failed to create Redis subscriber", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Get Redis client for Pub/Sub publisher
   */
  public async getPublisher(): Promise<Redis> {
    try {
      if (this.publisher && this.publisher.status === "ready") {
        return this.publisher;
      }

      const options = this.getRedisOptions();
      this.publisher = new Redis(options);

      this.setupEventHandlers(this.publisher, "Publisher");

      await new Promise<void>((resolve) => {
        this.publisher!.once("ready", () => {
          logger.info("✅ Redis publisher connected");
          resolve();
        });
      });

      return this.publisher;
    } catch (error) {
      logger.error("❌ Failed to create Redis publisher", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Setup event handlers for Redis client
   */
  private setupEventHandlers(client: Redis, clientName: string): void {
    client.on("connect", () => {
      logger.info(`Redis ${clientName} connecting...`);
    });

    client.on("ready", () => {
      logger.info(`Redis ${clientName} ready`);
    });

    client.on("error", (error) => {
      logger.error(`Redis ${clientName} error`, {
        error: error.message,
      });
    });

    client.on("close", () => {
      logger.warn(`Redis ${clientName} connection closed`);
    });

    client.on("reconnecting", (delay: number) => {
      logger.warn(`Redis ${clientName} reconnecting in ${delay}ms`);
    });

    client.on("end", () => {
      logger.warn(`Redis ${clientName} connection ended`);
    });
  }

  /**
   * Test Redis connection
   */
  private async testConnection(): Promise<void> {
    if (!this.client) {
      throw new Error("Redis client not initialized");
    }

    try {
      const pong = await this.client.ping();
      if (pong === "PONG") {
        logger.info("Redis connection test successful");
      }
    } catch (error) {
      logger.error("Redis connection test failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Get active Redis client
   */
  public getClient(): Redis {
    if (!this.client || this.client.status !== "ready") {
      throw new Error("Redis not connected. Call connect() first.");
    }
    return this.client;
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    try {
      const disconnectPromises: Promise<void>[] = [];

      if (this.client) {
        disconnectPromises.push(
          this.client.quit().then(() => {
            logger.info("Redis main client disconnected");
          }),
        );
        this.client = null;
      }

      if (this.subscriber) {
        disconnectPromises.push(
          this.subscriber.quit().then(() => {
            logger.info("Redis subscriber disconnected");
          }),
        );
        this.subscriber = null;
      }

      if (this.publisher) {
        disconnectPromises.push(
          this.publisher.quit().then(() => {
            logger.info("Redis publisher disconnected");
          }),
        );
        this.publisher = null;
      }

      await Promise.all(disconnectPromises);
      logger.info("✅ All Redis connections closed successfully");
    } catch (error) {
      logger.error("❌ Error closing Redis connections", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Check Redis connection status
   */
  public isConnected(): boolean {
    return this.client !== null && this.client.status === "ready";
  }

  /**
   * Get Redis health status
   */
  public async getHealthStatus(): Promise<{
    status: "healthy" | "unhealthy";
    details: any;
  }> {
    try {
      if (!this.isConnected()) {
        return {
          status: "unhealthy",
          details: { message: "Redis not connected" },
        };
      }

      // Test ping
      const start = Date.now();
      await this.client!.ping();
      const latency = Date.now() - start;

      // Get info
      const info = await this.client!.info();
      const lines = info.split("\r\n");
      const serverInfo: any = {};

      lines.forEach((line) => {
        if (line && !line.startsWith("#")) {
          const [key, value] = line.split(":");
          if (key && value) {
            serverInfo[key.trim()] = value.trim();
          }
        }
      });

      return {
        status: "healthy",
        details: {
          connected: true,
          host: environment.redisHost,
          port: environment.redisPort,
          db: environment.redisDb,
          latency: `${latency}ms`,
          version: serverInfo.redis_version,
          uptime: serverInfo.uptime_in_seconds,
          connectedClients: serverInfo.connected_clients,
          usedMemory: serverInfo.used_memory_human,
        },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        details: {
          connected: false,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  /**
   * Clear all data from Redis (use with caution!)
   */
  public async clearCache(): Promise<void> {
    if (environment.isProduction()) {
      throw new Error("Cannot clear cache in production environment");
    }

    try {
      if (!this.client || this.client.status !== "ready") {
        await this.connect();
      }

      logger.warn("⚠️  Clearing Redis cache...");
      await this.client!.flushdb();
      logger.info("✅ Redis cache cleared successfully");
    } catch (error) {
      logger.error("❌ Failed to clear Redis cache", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Get cache statistics
   */
  public async getCacheStats(): Promise<any> {
    try {
      if (!this.isConnected()) {
        throw new Error("Redis not connected");
      }

      const info = await this.client!.info("stats");
      const keyspace = await this.client!.info("keyspace");
      const dbSize = await this.client!.dbsize();

      return {
        info,
        keyspace,
        totalKeys: dbSize,
      };
    } catch (error) {
      logger.error("Failed to get cache statistics", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Set value with expiration
   */
  public async set(
    key: string,
    value: string,
    expirationInSeconds?: number,
  ): Promise<void> {
    const client = this.getClient();
    if (expirationInSeconds) {
      await client.setex(key, expirationInSeconds, value);
    } else {
      await client.set(key, value);
    }
  }

  /**
   * Get value by key
   */
  public async get(key: string): Promise<string | null> {
    const client = this.getClient();
    return await client.get(key);
  }

  /**
   * Delete key
   */
  public async del(key: string): Promise<void> {
    const client = this.getClient();
    await client.del(key);
  }

  /**
   * Check if key exists
   */
  public async exists(key: string): Promise<boolean> {
    const client = this.getClient();
    const result = await client.exists(key);
    return result === 1;
  }

  /**
   * Set expiration on key
   */
  public async expire(key: string, seconds: number): Promise<void> {
    const client = this.getClient();
    await client.expire(key, seconds);
  }

  /**
   * Get keys matching pattern
   */
  public async keys(pattern: string): Promise<string[]> {
    const client = this.getClient();
    return await client.keys(pattern);
  }

  /**
   * Delete keys matching pattern
   */
  public async deletePattern(pattern: string): Promise<number> {
    const client = this.getClient();
    const keys = await client.keys(pattern);
    if (keys.length === 0) return 0;
    return await client.del(...keys);
  }
}

// Export singleton instance
export default RedisConfig.getInstance();

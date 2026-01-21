/**
 * Central configuration export
 *
 * This file exports all configuration modules as a single point of access
 * for the entire application.
 */

import environment from "./environment";
import databaseConfig, { AppDataSource } from "./database";
import redisConfig from "./redis";
import rabbitmqConfig from "./rabbitmq";
import mailConfig from "./smtp";
import swaggerConfig from "./swagger";

/**
 * Configuration class that manages all system configurations
 */
class Config {
  private static instance: Config;
  private initialized: boolean = false;

  private constructor() {}

  public static getInstance(): Config {
    if (!Config.instance) {
      Config.instance = new Config();
    }
    return Config.instance;
  }

  /**
   * Initialize all configurations
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      console.log("Configuration already initialized");
      return;
    }

    try {
      console.log("🚀 Initializing application configurations...");
      console.log(`Environment: ${environment.nodeEnv}`);
      console.log(`App Name: ${environment.appName}`);
      console.log(`App URL: ${environment.appUrl}`);
      console.log("─────────────────────────────────────────");

      // Initialize database connection
      console.log("📦 Connecting to database...");
      await databaseConfig.connect();

      // Initialize Redis connection
      console.log("📦 Connecting to Redis...");
      await redisConfig.connect();

      // Initialize RabbitMQ connection
      console.log("📦 Connecting to RabbitMQ...");
      await rabbitmqConfig.connect();

      // Initialize mail service
      console.log("📦 Initializing mail service...");
      await mailConfig.connect();

      console.log("─────────────────────────────────────────");
      console.log("✅ All configurations initialized successfully");

      this.initialized = true;
    } catch (error) {
      console.error("❌ Failed to initialize configurations:", error);
      throw error;
    }
  }

  /**
   * Shutdown all connections gracefully
   */
  public async shutdown(): Promise<void> {
    try {
      console.log("🛑 Shutting down application gracefully...");
      console.log("─────────────────────────────────────────");

      // Disconnect from RabbitMQ
      if (rabbitmqConfig.isConnected()) {
        console.log("📦 Disconnecting from RabbitMQ...");
        await rabbitmqConfig.disconnect();
      }

      // Disconnect from Redis
      if (redisConfig.isConnected()) {
        console.log("📦 Disconnecting from Redis...");
        await redisConfig.disconnect();
      }

      // Disconnect from database
      if (databaseConfig.isConnected()) {
        console.log("📦 Disconnecting from database...");
        await databaseConfig.disconnect();
      }

      // Disconnect mail service
      if (mailConfig.isMailConnected()) {
        console.log("📦 Disconnecting mail service...");
        await mailConfig.disconnect();
      }

      console.log("─────────────────────────────────────────");
      console.log("✅ Application shutdown completed");

      this.initialized = false;
    } catch (error) {
      console.error("❌ Error during shutdown:", error);
      throw error;
    }
  }

  /**
   * Get health status of all services
   */
  public async getHealthStatus(): Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: string;
    services: {
      database: any;
      redis: any;
      rabbitmq: any;
      mail: any;
    };
  }> {
    const [databaseHealth, redisHealth, rabbitmqHealth, mailHealth] =
      await Promise.all([
        databaseConfig.getHealthStatus().catch(() => ({
          status: "unhealthy" as const,
          details: { message: "Failed to check database health" },
        })),
        redisConfig.getHealthStatus().catch(() => ({
          status: "unhealthy" as const,
          details: { message: "Failed to check Redis health" },
        })),
        rabbitmqConfig.getHealthStatus().catch(() => ({
          status: "unhealthy" as const,
          details: { message: "Failed to check RabbitMQ health" },
        })),
        mailConfig.getHealthStatus().catch(() => ({
          status: "unhealthy" as const,
          details: { message: "Failed to check mail service health" },
        })),
      ]);

    // Determine overall status
    const services = {
      database: databaseHealth,
      redis: redisHealth,
      rabbitmq: rabbitmqHealth,
      mail: mailHealth,
    };

    const healthStatuses = Object.values(services).map((s) => s.status);
    const unhealthyCount = healthStatuses.filter(
      (s) => s === "unhealthy",
    ).length;

    let overallStatus: "healthy" | "degraded" | "unhealthy";

    if (unhealthyCount === 0) {
      overallStatus = "healthy";
    } else if (unhealthyCount === healthStatuses.length) {
      overallStatus = "unhealthy";
    } else {
      overallStatus = "degraded";
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services,
    };
  }

  /**
   * Check if all services are initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get environment configuration
   */
  private getEnvironment() {
    return environment;
  }

  /**
   * Get database configuration
   */
  private getDatabase() {
    return databaseConfig;
  }

  /**
   * Get Redis configuration
   */
  private getRedis() {
    return redisConfig;
  }

  /**
   * Get RabbitMQ configuration
   */
  private getRabbitMQ() {
    return rabbitmqConfig;
  }

  /**
   * Get mail configuration
   */
  private getMail() {
    return mailConfig;
  }

  /**
   * Get Swagger configuration
   */
  private getSwagger() {
    return swaggerConfig;
  }
}

// Export singleton instance
const config = Config.getInstance();

// Export individual configurations for direct access
export {
  Config,
  environment,
  databaseConfig,
  AppDataSource,
  redisConfig,
  rabbitmqConfig,
  mailConfig,
  swaggerConfig,
};

// Export main config instance
export default config;

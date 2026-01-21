import { DataSource, DataSourceOptions } from "typeorm";
import { join } from "path";
import environment from "./environment";
import logger from "../shared/utils/logger.util";

class DatabaseConfig {
  private static instance: DatabaseConfig;
  private dataSource: DataSource | null = null;

  private constructor() {}

  public static getInstance(): DatabaseConfig {
    if (!DatabaseConfig.instance) {
      DatabaseConfig.instance = new DatabaseConfig();
    }
    return DatabaseConfig.instance;
  }

  /**
   * Get TypeORM DataSource configuration
   */
  public getDataSourceOptions(): DataSourceOptions {
    const baseOptions: DataSourceOptions = {
      type: "postgres",
      host: environment.dbHost,
      port: environment.dbPort,
      username: environment.dbUsername,
      password: environment.dbPassword,
      database: environment.dbDatabase,
      synchronize: environment.dbSynchronize,
      logging: environment.dbLogging,
      entities: [join(__dirname, "../database/entities/**/*.entity{.ts,.js}")],
      migrations: [join(__dirname, "../database/migrations/**/*{.ts,.js}")],
      subscribers: [join(__dirname, "../database/subscribers/**/*{.ts,.js}")],
      migrationsTableName: "migrations",
      ssl: environment.isProduction()
        ? {
            rejectUnauthorized: false,
          }
        : false,
      extra: {
        max: 20, // Maximum number of clients in the pool
        min: 5, // Minimum number of clients in the pool
        idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
        connectionTimeoutMillis: 5000, // Return error after 5 seconds if connection not established
      },
      poolSize: 10,
      connectTimeoutMS: 5000,
      maxQueryExecutionTime: 5000, // Log queries that take more than 5 seconds
    };

    return baseOptions;
  }

  /**
   * Initialize database connection
   */
  public async connect(): Promise<DataSource> {
    try {
      if (this.dataSource && this.dataSource.isInitialized) {
        logger.info("Database already connected");
        return this.dataSource;
      }

      const options = this.getDataSourceOptions();
      this.dataSource = new DataSource(options);

      await this.dataSource.initialize();

      logger.info("✅ Database connection established successfully", {
        host: environment.dbHost,
        database: environment.dbDatabase,
        port: environment.dbPort,
      });

      // Test the connection
      await this.testConnection();

      return this.dataSource;
    } catch (error) {
      logger.error("❌ Failed to connect to database", {
        error: error instanceof Error ? error.message : "Unknown error",
        host: environment.dbHost,
        database: environment.dbDatabase,
      });
      throw error;
    }
  }

  /**
   * Test database connection
   */
  private async testConnection(): Promise<void> {
    if (!this.dataSource) {
      throw new Error("DataSource not initialized");
    }

    try {
      await this.dataSource.query("SELECT 1");
      logger.info("Database connection test successful");
    } catch (error) {
      logger.error("Database connection test failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Get active DataSource instance
   */
  public getDataSource(): DataSource {
    if (!this.dataSource || !this.dataSource.isInitialized) {
      throw new Error("Database not connected. Call connect() first.");
    }
    return this.dataSource;
  }

  /**
   * Disconnect from database
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.dataSource && this.dataSource.isInitialized) {
        await this.dataSource.destroy();
        this.dataSource = null;
        logger.info("✅ Database connection closed successfully");
      }
    } catch (error) {
      logger.error("❌ Error closing database connection", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Run database migrations
   */
  public async runMigrations(): Promise<void> {
    try {
      if (!this.dataSource || !this.dataSource.isInitialized) {
        await this.connect();
      }

      logger.info("Running database migrations...");
      const migrations = await this.dataSource!.runMigrations({
        transaction: "all",
      });

      if (migrations.length === 0) {
        logger.info("No pending migrations to run");
      } else {
        logger.info(`✅ Successfully ran ${migrations.length} migration(s)`, {
          migrations: migrations.map((m) => m.name),
        });
      }
    } catch (error) {
      logger.error("❌ Failed to run migrations", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Revert last migration
   */
  public async revertMigration(): Promise<void> {
    try {
      if (!this.dataSource || !this.dataSource.isInitialized) {
        await this.connect();
      }

      logger.info("Reverting last migration...");
      await this.dataSource!.undoLastMigration({
        transaction: "all",
      });
      logger.info("✅ Successfully reverted last migration");
    } catch (error) {
      logger.error("❌ Failed to revert migration", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Check database connection status
   */
  public isConnected(): boolean {
    return this.dataSource !== null && this.dataSource.isInitialized;
  }

  /**
   * Get connection health status
   */
  public async getHealthStatus(): Promise<{
    status: "healthy" | "unhealthy";
    details: any;
  }> {
    try {
      if (!this.isConnected()) {
        return {
          status: "unhealthy",
          details: { message: "Database not connected" },
        };
      }

      // Test query
      await this.dataSource!.query("SELECT 1");

      // Get pool status
      const driver = this.dataSource!.driver as any;
      const poolSize = driver.master?.pool?.totalCount || 0;
      const idleConnections = driver.master?.pool?.idleCount || 0;

      return {
        status: "healthy",
        details: {
          connected: true,
          host: environment.dbHost,
          database: environment.dbDatabase,
          poolSize,
          idleConnections,
          activeConnections: poolSize - idleConnections,
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
   * Clear all data from database (use with caution!)
   */
  public async clearDatabase(): Promise<void> {
    if (environment.isProduction()) {
      throw new Error("Cannot clear database in production environment");
    }

    try {
      if (!this.dataSource || !this.dataSource.isInitialized) {
        await this.connect();
      }

      const entities = this.dataSource!.entityMetadatas;

      logger.warn("⚠️  Clearing database...");

      // Disable foreign key checks
      await this.dataSource!.query("SET session_replication_role = replica;");

      // Truncate all tables
      for (const entity of entities) {
        const repository = this.dataSource!.getRepository(entity.name);
        await repository.query(
          `TRUNCATE TABLE "${entity.tableName}" RESTART IDENTITY CASCADE;`,
        );
      }

      // Re-enable foreign key checks
      await this.dataSource!.query("SET session_replication_role = DEFAULT;");

      logger.info("✅ Database cleared successfully");
    } catch (error) {
      logger.error("❌ Failed to clear database", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Get query runner for transactions
   */
  public getQueryRunner() {
    if (!this.dataSource || !this.dataSource.isInitialized) {
      throw new Error("Database not connected");
    }
    return this.dataSource.createQueryRunner();
  }
}

const databaseConfig = DatabaseConfig.getInstance();
export default databaseConfig;

export const AppDataSource = new DataSource(
  databaseConfig.getDataSourceOptions(),
);

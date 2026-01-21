import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

class EnvironmentConfig {
  private static instance: EnvironmentConfig;

  // Application
  public readonly nodeEnv: string;
  public readonly appName: string;
  public readonly appPort: number;
  public readonly appUrl: string;
  public readonly apiVersion: string;

  // Database
  public readonly dbHost: string;
  public readonly dbPort: number;
  public readonly dbUsername: string;
  public readonly dbPassword: string;
  public readonly dbDatabase: string;
  public readonly dbSynchronize: boolean;
  public readonly dbLogging: boolean;

  // Redis
  public readonly redisHost: string;
  public readonly redisPort: number;
  public readonly redisPassword: string;
  public readonly redisDb: number;

  // JWT
  public readonly jwtAccessSecret: string;
  public readonly jwtRefreshSecret: string;
  public readonly jwtAccessExpiration: string;
  public readonly jwtRefreshExpiration: string;

  // Encryption
  public readonly bcryptSaltRounds: number;
  public readonly encryptionKey: string;

  // Rate Limiting
  public readonly rateLimitWindowMs: number;
  public readonly rateLimitMaxRequests: number;

  // CORS
  public readonly corsOrigin: string[];
  public readonly corsCredentials: boolean;

  // Email
  public readonly mailHost: string;
  public readonly mailPort: number;
  public readonly mailUser: string;
  public readonly mailPassword: string;
  public readonly mailFrom: string;
  public readonly mailFromName: string;

  // OAuth
  public readonly googleClientId: string;
  public readonly googleClientSecret: string;
  public readonly googleCallbackUrl: string;
  public readonly githubClientId: string;
  public readonly githubClientSecret: string;
  public readonly githubCallbackUrl: string;

  // RabbitMQ
  public readonly rabbitmqHost: string;
  public readonly rabbitmqPort: number;
  public readonly rabbitmqUser: string;
  public readonly rabbitmqPassword: string;
  public readonly rabbitmqVhost: string;
  public readonly rabbitmqExchange: string;

  // Captcha
  public readonly captchaEnabled: boolean;
  public readonly captchaSize: number;
  public readonly captchaNoise: number;

  // Monitoring
  public readonly metricsEnabled: boolean;
  public readonly tracingEnabled: boolean;
  public readonly otelExporterEndpoint: string;

  // Logging
  public readonly logLevel: string;
  public readonly logDir: string;

  // Pagination
  public readonly defaultPageSize: number;
  public readonly maxPageSize: number;

  // Frontend
  public readonly frontendUrl: string;

  // Session
  public readonly sessionSecret: string;

  private constructor() {
    // Application
    this.nodeEnv = process.env.NODE_ENV || "development";
    this.appName = process.env.APP_NAME || "Professional-REST-API";
    this.appPort = parseInt(process.env.APP_PORT || "3000", 10);
    this.appUrl = process.env.APP_URL || "http://localhost:3000";
    this.apiVersion = process.env.API_VERSION || "v1";

    // Database
    this.dbHost = process.env.DB_HOST || "localhost";
    this.dbPort = parseInt(process.env.DB_PORT || "5432", 10);
    this.dbUsername = process.env.DB_USERNAME || "postgres";
    this.dbPassword = process.env.DB_PASSWORD || "postgres";
    this.dbDatabase = process.env.DB_DATABASE || "rest_api_db";
    this.dbSynchronize = process.env.DB_SYNCHRONIZE === "true";
    this.dbLogging = process.env.DB_LOGGING === "true";

    // Redis
    this.redisHost = process.env.REDIS_HOST || "localhost";
    this.redisPort = parseInt(process.env.REDIS_PORT || "6379", 10);
    this.redisPassword = process.env.REDIS_PASSWORD || "";
    this.redisDb = parseInt(process.env.REDIS_DB || "0", 10);

    // JWT
    this.jwtAccessSecret = process.env.JWT_ACCESS_SECRET || "change-me-access";
    this.jwtRefreshSecret =
      process.env.JWT_REFRESH_SECRET || "change-me-refresh";
    this.jwtAccessExpiration = process.env.JWT_ACCESS_EXPIRATION || "15m";
    this.jwtRefreshExpiration = process.env.JWT_REFRESH_EXPIRATION || "7d";

    // Encryption
    this.bcryptSaltRounds = parseInt(
      process.env.BCRYPT_SALT_ROUNDS || "10",
      10,
    );
    this.encryptionKey =
      process.env.ENCRYPTION_KEY || "your-32-char-encryption-key";

    // Rate Limiting
    this.rateLimitWindowMs = parseInt(
      process.env.RATE_LIMIT_WINDOW_MS || "900000",
      10,
    );
    this.rateLimitMaxRequests = parseInt(
      process.env.RATE_LIMIT_MAX_REQUESTS || "100",
      10,
    );

    // CORS
    this.corsOrigin = process.env.CORS_ORIGIN?.split(",") || [
      "http://localhost:3000",
    ];
    this.corsCredentials = process.env.CORS_CREDENTIALS === "true";

    // Email
    this.mailHost = process.env.MAIL_HOST || "smtp.mailtrap.io";
    this.mailPort = parseInt(process.env.MAIL_PORT || "2525", 10);
    this.mailUser = process.env.MAIL_USER || "";
    this.mailPassword = process.env.MAIL_PASSWORD || "";
    this.mailFrom = process.env.MAIL_FROM || "noreply@app.com";
    this.mailFromName = process.env.MAIL_FROM_NAME || "App";

    // OAuth
    this.googleClientId = process.env.GOOGLE_CLIENT_ID || "";
    this.googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
    this.googleCallbackUrl = process.env.GOOGLE_CALLBACK_URL || "";
    this.githubClientId = process.env.GITHUB_CLIENT_ID || "";
    this.githubClientSecret = process.env.GITHUB_CLIENT_SECRET || "";
    this.githubCallbackUrl = process.env.GITHUB_CALLBACK_URL || "";

    // RabbitMQ
    this.rabbitmqHost = process.env.RABBITMQ_HOST || "localhost";
    this.rabbitmqPort = parseInt(process.env.RABBITMQ_PORT || "5672", 10);
    this.rabbitmqUser = process.env.RABBITMQ_USER || "guest";
    this.rabbitmqPassword = process.env.RABBITMQ_PASSWORD || "guest";
    this.rabbitmqVhost = process.env.RABBITMQ_VHOST || "/";
    this.rabbitmqExchange = process.env.RABBITMQ_EXCHANGE || "api_exchange";

    // Captcha
    this.captchaEnabled = process.env.CAPTCHA_ENABLED === "true";
    this.captchaSize = parseInt(process.env.CAPTCHA_SIZE || "6", 10);
    this.captchaNoise = parseInt(process.env.CAPTCHA_NOISE || "2", 10);

    // Monitoring
    this.metricsEnabled = process.env.METRICS_ENABLED === "true";
    this.tracingEnabled = process.env.TRACING_ENABLED === "true";
    this.otelExporterEndpoint =
      process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318";

    // Logging
    this.logLevel = process.env.LOG_LEVEL || "info";
    this.logDir = process.env.LOG_DIR || path.join(process.cwd(), "logs");

    // Pagination
    this.defaultPageSize = parseInt(process.env.DEFAULT_PAGE_SIZE || "10", 10);
    this.maxPageSize = parseInt(process.env.MAX_PAGE_SIZE || "100", 10);

    // Frontend
    this.frontendUrl = process.env.FRONTEND_URL || "http://localhost:3001";

    // Session
    this.sessionSecret = process.env.SESSION_SECRET || "change-me-session";

    this.validate();
  }

  public static getInstance(): EnvironmentConfig {
    if (!EnvironmentConfig.instance) {
      EnvironmentConfig.instance = new EnvironmentConfig();
    }
    return EnvironmentConfig.instance;
  }

  private validate(): void {
    const requiredEnvVars = ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];

    const missingVars = requiredEnvVars.filter(
      (varName) => !process.env[varName],
    );

    if (missingVars.length > 0 && this.nodeEnv === "production") {
      throw new Error(
        `Missing required environment variables: ${missingVars.join(", ")}`,
      );
    }
  }

  public isProduction(): boolean {
    return this.nodeEnv === "production";
  }

  public isDevelopment(): boolean {
    return this.nodeEnv === "development";
  }

  public isStaging(): boolean {
    return this.nodeEnv === "staging";
  }

  public isTest(): boolean {
    return this.nodeEnv === "test";
  }
}

export default EnvironmentConfig.getInstance();

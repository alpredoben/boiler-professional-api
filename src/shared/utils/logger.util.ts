import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

class Logger {
  private static instance: Logger;
  private logger: winston.Logger;

  private constructor() {
    // Ensure log directory exists
    const logDir = process.env.LOG_DIR || path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Custom log format
    const logFormat = winston.format.combine(
      winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      winston.format.errors({ stack: true }),
      winston.format.metadata({
        fillExcept: ["message", "level", "timestamp", "label"],
      }),
      winston.format.json(),
    );

    // Console format for development
    const consoleFormat = winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
      winston.format.printf(
        ({ timestamp, level, message, metadata, stack }) => {
          let log = `${timestamp} [${level}]: ${message}`;

          if (metadata && Object.keys(metadata).length > 0) {
            log += `\n${JSON.stringify(metadata, null, 2)}`;
          }

          if (stack) {
            log += `\n${stack}`;
          }

          return log;
        },
      ),
    );

    // Create transports
    const transports: winston.transport[] = [];

    // Console transport (always enabled)
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
        level: process.env.LOG_LEVEL || "info",
      }),
    );

    // File transports for production
    if (process.env.NODE_ENV !== "test") {
      // All logs
      transports.push(
        new DailyRotateFile({
          filename: path.join(logDir, "application-%DATE%.log"),
          datePattern: "YYYY-MM-DD",
          maxSize: "20m",
          maxFiles: "14d",
          format: logFormat,
          level: "info",
        }),
      );

      // Error logs
      transports.push(
        new DailyRotateFile({
          filename: path.join(logDir, "error-%DATE%.log"),
          datePattern: "YYYY-MM-DD",
          maxSize: "20m",
          maxFiles: "30d",
          format: logFormat,
          level: "error",
        }),
      );

      // Combined logs (all levels)
      transports.push(
        new DailyRotateFile({
          filename: path.join(logDir, "combined-%DATE%.log"),
          datePattern: "YYYY-MM-DD",
          maxSize: "20m",
          maxFiles: "7d",
          format: logFormat,
        }),
      );
    }

    // Create logger instance
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || "info",
      format: logFormat,
      transports,
      exitOnError: false,
      silent: process.env.NODE_ENV === "test",
    });

    // Handle uncaught exceptions
    this.logger.exceptions.handle(
      new winston.transports.File({
        filename: path.join(logDir, "exceptions.log"),
      }),
    );

    // Handle unhandled promise rejections
    this.logger.rejections.handle(
      new winston.transports.File({
        filename: path.join(logDir, "rejections.log"),
      }),
    );
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Log info level message
   */
  public info(message: string, metadata?: any): void {
    this.logger.info(message, { metadata });
  }

  /**
   * Log error level message
   */
  public error(message: string, metadata?: any): void {
    this.logger.error(message, { metadata });
  }

  /**
   * Log warn level message
   */
  public warn(message: string, metadata?: any): void {
    this.logger.warn(message, { metadata });
  }

  /**
   * Log debug level message
   */
  public debug(message: string, metadata?: any): void {
    this.logger.debug(message, { metadata });
  }

  /**
   * Log verbose level message
   */
  public verbose(message: string, metadata?: any): void {
    this.logger.verbose(message, { metadata });
  }

  /**
   * Log HTTP request
   */
  public http(message: string, metadata?: any): void {
    this.logger.http(message, { metadata });
  }

  /**
   * Create child logger with default metadata
   */
  public child(defaultMetadata: any): winston.Logger {
    return this.logger.child(defaultMetadata);
  }

  /**
   * Get Winston logger instance
   */
  public getLogger(): winston.Logger {
    return this.logger;
  }

  /**
   * Log with custom level
   */
  public log(level: string, message: string, metadata?: any): void {
    this.logger.log(level, message, { metadata });
  }

  /**
   * Stream for Morgan HTTP logger
   */
  public get stream() {
    return {
      write: (message: string) => {
        this.http(message.trim());
      },
    };
  }
}

export default Logger.getInstance();

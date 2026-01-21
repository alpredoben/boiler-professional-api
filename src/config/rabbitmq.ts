import amqp, { Connection, Channel, ConsumeMessage } from "amqplib";
import environment from "./environment";
import logger from "../shared/utils/logger.util";
import {
  In_ExchangeOptions,
  In_QueueOptions,
} from "src/interfaces/config.interface";

class RabbitMQConfig {
  private static instance: RabbitMQConfig;
  private connection: Connection | null = null;
  private channel: Channel | null = null;
  private isConnecting: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private readonly reconnectInterval = 5000; // 5 seconds

  private constructor() {}

  public static getInstance(): RabbitMQConfig {
    if (!RabbitMQConfig.instance) {
      RabbitMQConfig.instance = new RabbitMQConfig();
    }
    return RabbitMQConfig.instance;
  }

  /**
   * Get RabbitMQ connection URL
   */
  private getConnectionUrl(): string {
    const {
      rabbitmqUser,
      rabbitmqPassword,
      rabbitmqHost,
      rabbitmqPort,
      rabbitmqVhost,
    } = environment;

    const encodedUser = encodeURIComponent(rabbitmqUser);
    const encodedPassword = encodeURIComponent(rabbitmqPassword);
    const encodedVhost = encodeURIComponent(rabbitmqVhost);

    return `amqp://${encodedUser}:${encodedPassword}@${rabbitmqHost}:${rabbitmqPort}${encodedVhost}`;
  }

  /**
   * Initialize RabbitMQ connection
   */
  public async connect(): Promise<void> {
    if (this.isConnecting) {
      logger.info("RabbitMQ connection already in progress");
      return;
    }

    if (this.connection && this.channel) {
      logger.info("RabbitMQ already connected");
      return;
    }

    this.isConnecting = true;

    try {
      const url = this.getConnectionUrl();

      logger.info("Connecting to RabbitMQ...");
      const conn = await amqp.connect(url, {
        heartbeat: 60,
        timeout: 10000,
      });

      if (!conn) {
        this.isConnecting = false;
        logger.error("❌ Failed to create RabbitMQ connection", {
          error: "Failed to create RabbitMQ connection",
          host: environment.rabbitmqHost,
        });

        // Attempt reconnection
        this.scheduleReconnect();
        throw new Error("Failed to create RabbitMQ connection");
      }

      logger.info("Creating RabbitMQ channel...");
      this.channel = await conn.createChannel();

      // Set prefetch count for fair dispatch
      await this.channel.prefetch(1);

      // Setup event handlers
      this.setupEventHandlers();

      // Create default exchange
      await this.createExchange(environment.rabbitmqExchange, {
        type: "topic",
        durable: true,
      });

      logger.info("✅ RabbitMQ connection established successfully", {
        host: environment.rabbitmqHost,
        port: environment.rabbitmqPort,
        vhost: environment.rabbitmqVhost,
        exchange: environment.rabbitmqExchange,
      });

      this.connection = conn as any;
      this.isConnecting = false;
    } catch (error) {
      this.isConnecting = false;
      logger.error("❌ Failed to connect to RabbitMQ", {
        error: error instanceof Error ? error.message : "Unknown error",
        host: environment.rabbitmqHost,
      });

      // Attempt reconnection
      this.scheduleReconnect();
      throw error;
    }
  }

  /**
   * Setup event handlers for connection and channel
   */
  private setupEventHandlers(): void {
    if (!this.connection || !this.channel) return;

    // Connection event handlers
    this.connection.on("error", (error) => {
      logger.error("RabbitMQ connection error", {
        error: error.message,
      });
    });

    this.connection.on("close", () => {
      logger.warn("RabbitMQ connection closed");
      this.connection = null;
      this.channel = null;
      this.scheduleReconnect();
    });

    // Channel event handlers
    this.channel.on("error", (error) => {
      logger.error("RabbitMQ channel error", {
        error: error.message,
      });
    });

    this.channel.on("close", () => {
      logger.warn("RabbitMQ channel closed");
      this.channel = null;
    });
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectTimer = setTimeout(async () => {
      logger.info("Attempting to reconnect to RabbitMQ...");
      try {
        await this.connect();
      } catch (error) {
        logger.error("Reconnection attempt failed", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }, this.reconnectInterval);
  }

  /**
   * Get active channel
   */
  public getChannel(): Channel {
    if (!this.channel) {
      throw new Error("RabbitMQ channel not available. Call connect() first.");
    }
    return this.channel;
  }

  /**
   * Create exchange
   */
  public async createExchange(
    exchangeName: string,
    options: In_ExchangeOptions = {},
  ): Promise<void> {
    const channel = this.getChannel();

    const defaultOptions: In_ExchangeOptions = {
      type: "topic",
      durable: true,
      autoDelete: false,
      internal: false,
      ...options,
    };

    await channel.assertExchange(
      exchangeName,
      defaultOptions.type!,
      defaultOptions,
    );

    logger.info(`Exchange "${exchangeName}" created/verified`, {
      type: defaultOptions.type,
      durable: defaultOptions.durable,
    });
  }

  /**
   * Create queue
   */
  public async createQueue(
    queueName: string,
    options: In_QueueOptions = {},
  ): Promise<void> {
    const channel = this.getChannel();

    const defaultOptions: In_QueueOptions = {
      durable: true,
      exclusive: false,
      autoDelete: false,
      ...options,
    };

    await channel.assertQueue(queueName, defaultOptions);

    logger.info(`Queue "${queueName}" created/verified`, {
      durable: defaultOptions.durable,
    });
  }

  /**
   * Bind queue to exchange
   */
  public async bindQueue(
    queueName: string,
    exchangeName: string,
    routingKey: string,
  ): Promise<void> {
    const channel = this.getChannel();

    await channel.bindQueue(queueName, exchangeName, routingKey);

    logger.info(`Queue "${queueName}" bound to exchange "${exchangeName}"`, {
      routingKey,
    });
  }

  /**
   * Publish message to exchange
   */
  public async publish(
    routingKey: string,
    message: any,
    options: {
      exchange?: string;
      persistent?: boolean;
      contentType?: string;
      headers?: any;
    } = {},
  ): Promise<boolean> {
    try {
      const channel = this.getChannel();

      const exchangeName = options.exchange || environment.rabbitmqExchange;
      const messageBuffer = Buffer.from(JSON.stringify(message));

      const publishOptions = {
        persistent: options.persistent !== false,
        contentType: options.contentType || "application/json",
        timestamp: Date.now(),
        headers: options.headers || {},
      };

      const result = channel.publish(
        exchangeName,
        routingKey,
        messageBuffer,
        publishOptions,
      );

      if (result) {
        logger.info(`Message published to exchange "${exchangeName}"`, {
          routingKey,
          messageSize: messageBuffer.length,
        });
      } else {
        logger.warn("Message could not be published (buffer full)", {
          routingKey,
        });
      }

      return result;
    } catch (error) {
      logger.error("Failed to publish message", {
        error: error instanceof Error ? error.message : "Unknown error",
        routingKey,
      });
      throw error;
    }
  }

  /**
   * Send message directly to queue
   */
  public async sendToQueue(
    queueName: string,
    message: any,
    options: {
      persistent?: boolean;
      contentType?: string;
      headers?: any;
    } = {},
  ): Promise<boolean> {
    try {
      const channel = this.getChannel();

      const messageBuffer = Buffer.from(JSON.stringify(message));

      const sendOptions = {
        persistent: options.persistent !== false,
        contentType: options.contentType || "application/json",
        timestamp: Date.now(),
        headers: options.headers || {},
      };

      const result = channel.sendToQueue(queueName, messageBuffer, sendOptions);

      if (result) {
        logger.info(`Message sent to queue "${queueName}"`, {
          messageSize: messageBuffer.length,
        });
      }

      return result;
    } catch (error) {
      logger.error("Failed to send message to queue", {
        error: error instanceof Error ? error.message : "Unknown error",
        queueName,
      });
      throw error;
    }
  }

  /**
   * Subscribe to queue
   */
  public async subscribe(
    queueName: string,
    callback: (message: any, rawMessage: ConsumeMessage) => Promise<void>,
    options: {
      noAck?: boolean;
      exclusive?: boolean;
    } = {},
  ): Promise<void> {
    try {
      const channel = this.getChannel();

      await channel.consume(
        queueName,
        async (msg) => {
          if (!msg) return;

          try {
            const content = JSON.parse(msg.content.toString());

            logger.info(`Message received from queue "${queueName}"`, {
              routingKey: msg.fields.routingKey,
              messageSize: msg.content.length,
            });

            await callback(content, msg);

            // Acknowledge message if not auto-ack
            if (!options.noAck) {
              channel.ack(msg);
              logger.debug("Message acknowledged", {
                queueName,
                deliveryTag: msg.fields.deliveryTag,
              });
            }
          } catch (error) {
            logger.error("Error processing message", {
              error: error instanceof Error ? error.message : "Unknown error",
              queueName,
            });

            // Reject and requeue the message
            if (!options.noAck) {
              channel.nack(msg, false, true);
              logger.debug("Message rejected and requeued", {
                queueName,
                deliveryTag: msg.fields.deliveryTag,
              });
            }
          }
        },
        {
          noAck: options.noAck || false,
          exclusive: options.exclusive || false,
        },
      );

      logger.info(`Subscribed to queue "${queueName}"`);
    } catch (error) {
      logger.error("Failed to subscribe to queue", {
        error: error instanceof Error ? error.message : "Unknown error",
        queueName,
      });
      throw error;
    }
  }

  /**
   * Acknowledge message
   */
  public ackMessage(msg: ConsumeMessage): void {
    const channel = this.getChannel();
    channel.ack(msg);
  }

  /**
   * Reject message
   */
  public nackMessage(msg: ConsumeMessage, requeue: boolean = true): void {
    const channel = this.getChannel();
    channel.nack(msg, false, requeue);
  }

  /**
   * Disconnect from RabbitMQ
   */
  public async disconnect(): Promise<void> {
    try {
      // Clear reconnect timer
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }

      // Close channel
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
        logger.info("RabbitMQ channel closed");
      }

      // Close connection
      if (this.connection) {
        await (this.connection as any).close();
        this.connection = null;
        logger.info("RabbitMQ connection closed");
      }

      logger.info("✅ RabbitMQ disconnected successfully");
    } catch (error) {
      logger.error("❌ Error disconnecting from RabbitMQ", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Check connection status
   */
  public isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  /**
   * Get health status
   */
  public async getHealthStatus(): Promise<{
    status: "healthy" | "unhealthy";
    details: any;
  }> {
    try {
      if (!this.isConnected()) {
        return {
          status: "unhealthy",
          details: { message: "RabbitMQ not connected" },
        };
      }

      return {
        status: "healthy",
        details: {
          connected: true,
          host: environment.rabbitmqHost,
          port: environment.rabbitmqPort,
          vhost: environment.rabbitmqVhost,
          exchange: environment.rabbitmqExchange,
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
   * Purge queue
   */
  public async purgeQueue(queueName: string): Promise<void> {
    if (environment.isProduction()) {
      throw new Error("Cannot purge queue in production environment");
    }

    try {
      const channel = this.getChannel();
      await channel.purgeQueue(queueName);
      logger.info(`Queue "${queueName}" purged successfully`);
    } catch (error) {
      logger.error("Failed to purge queue", {
        error: error instanceof Error ? error.message : "Unknown error",
        queueName,
      });
      throw error;
    }
  }

  /**
   * Delete queue
   */
  public async deleteQueue(queueName: string): Promise<void> {
    if (environment.isProduction()) {
      throw new Error("Cannot delete queue in production environment");
    }

    try {
      const channel = this.getChannel();
      await channel.deleteQueue(queueName);
      logger.info(`Queue "${queueName}" deleted successfully`);
    } catch (error) {
      logger.error("Failed to delete queue", {
        error: error instanceof Error ? error.message : "Unknown error",
        queueName,
      });
      throw error;
    }
  }
}

// Export singleton instance
export default RabbitMQConfig.getInstance();

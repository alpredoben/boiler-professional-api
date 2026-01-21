/** RabbitMQ Queue Options */
export interface In_QueueOptions {
  durable?: boolean;
  exclusive?: boolean;
  autoDelete?: boolean;
  arguments?: any;
}

/** RabbitMQ Exchange Options */
export interface In_ExchangeOptions {
  type?: "direct" | "topic" | "fanout" | "headers";
  durable?: boolean;
  autoDelete?: boolean;
  internal?: boolean;
  arguments?: any;
}

/** Email SMTP Options */
export interface In_MailOptions {
  to: string | string[];
  subject: string;
  template?: string;
  context?: any;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    path?: string;
    content?: Buffer;
  }>;
  cc?: string | string[];
  bcc?: string | string[];
}

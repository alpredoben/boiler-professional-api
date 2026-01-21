import nodemailer, { Transporter } from "nodemailer";
import { readFileSync } from "fs";
import { join } from "path";
import Handlebars from "handlebars";
import environment from "./environment";
import logger from "../shared/utils/logger.util";
import { In_MailOptions } from "src/interfaces/config.interface";

class MailConfig {
  private static instance: MailConfig;
  private transporter: Transporter | null = null;
  private templateCache: Map<string, HandlebarsTemplateDelegate> = new Map();
  private isConnected: boolean = false;

  private constructor() {}

  public static getInstance(): MailConfig {
    if (!MailConfig.instance) {
      MailConfig.instance = new MailConfig();
    }
    return MailConfig.instance;
  }

  /**
   * Initialize mail transporter
   */
  public async connect(): Promise<void> {
    try {
      if (this.isConnected && this.transporter) {
        logger.info("Mail transporter already initialized");
        return;
      }

      logger.info("Initializing mail transporter...");

      // Create transporter based on environment
      if (environment.isDevelopment() || environment.isTest()) {
        // For development/testing - use ethereal or mailtrap
        this.transporter = nodemailer.createTransport({
          host: environment.mailHost,
          port: environment.mailPort,
          auth: {
            user: environment.mailUser,
            pass: environment.mailPassword,
          },
          secure: false,
          tls: {
            rejectUnauthorized: false,
          },
        });
      } else {
        // For production - use real SMTP server
        this.transporter = nodemailer.createTransport({
          host: environment.mailHost,
          port: environment.mailPort,
          secure: environment.mailPort === 465, // true for 465, false for other ports
          auth: {
            user: environment.mailUser,
            pass: environment.mailPassword,
          },
          pool: true, // Use connection pool
          maxConnections: 5,
          maxMessages: 100,
          rateDelta: 1000, // 1 second
          rateLimit: 5, // 5 messages per rateDelta
        });
      }

      // Verify connection
      await this.verifyConnection();

      // Register Handlebars helpers
      this.registerHandlebarsHelpers();

      this.isConnected = true;

      logger.info("✅ Mail transporter initialized successfully", {
        host: environment.mailHost,
        port: environment.mailPort,
        from: environment.mailFrom,
      });
    } catch (error) {
      logger.error("❌ Failed to initialize mail transporter", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Verify mail server connection
   */
  private async verifyConnection(): Promise<void> {
    if (!this.transporter) {
      throw new Error("Mail transporter not initialized");
    }

    try {
      await this.transporter.verify();
      logger.info("Mail server connection verified");
    } catch (error) {
      logger.error("Mail server connection verification failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Register custom Handlebars helpers
   */
  private registerHandlebarsHelpers(): void {
    // Date formatter helper
    Handlebars.registerHelper(
      "formatDate",
      function (date: Date, format: string) {
        if (!date) return "";
        const d = new Date(date);

        if (format === "long") {
          return d.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          });
        } else if (format === "short") {
          return d.toLocaleDateString("en-US");
        }

        return d.toISOString();
      },
    );

    // Current year helper
    Handlebars.registerHelper("currentYear", function () {
      return new Date().getFullYear();
    });

    // Uppercase helper
    Handlebars.registerHelper("uppercase", function (str: string) {
      return str ? str.toUpperCase() : "";
    });

    // Conditional helper
    Handlebars.registerHelper("ifEquals", (arg1, arg2, options: any) => {
      return arg1 === arg2 ? options.fn(this) : options.inverse(this);
    });

    logger.info("Handlebars helpers registered");
  }

  /**
   * Load and compile email template
   */
  private async loadTemplate(
    templateName: string,
  ): Promise<HandlebarsTemplateDelegate> {
    try {
      // Check cache first
      if (this.templateCache.has(templateName)) {
        return this.templateCache.get(templateName)!;
      }

      // Load template file
      const templatePath = join(
        process.cwd(),
        "src",
        "mail",
        "templates",
        `${templateName}.hbs`,
      );

      const templateSource = readFileSync(templatePath, "utf-8");

      // Compile template
      const compiledTemplate = Handlebars.compile(templateSource);

      // Cache compiled template
      this.templateCache.set(templateName, compiledTemplate);

      logger.info(`Email template "${templateName}" loaded and compiled`);

      return compiledTemplate;
    } catch (error) {
      logger.error(`Failed to load email template "${templateName}"`, {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Load layout template
   */
  private async loadLayout(layoutName: string = "main"): Promise<string> {
    try {
      const layoutPath = join(
        process.cwd(),
        "src",
        "mail",
        "templates",
        "layouts",
        `${layoutName}.hbs`,
      );

      return readFileSync(layoutPath, "utf-8");
    } catch (error) {
      logger.warn(`Layout "${layoutName}" not found, using default`);
      return "{{> body}}";
    }
  }

  /**
   * Send email
   */
  public async sendMail(options: In_MailOptions): Promise<void> {
    try {
      if (!this.transporter) {
        throw new Error(
          "Mail transporter not initialized. Call connect() first.",
        );
      }

      let htmlContent = options.html;
      let textContent = options.text;

      // If template is provided, render it
      if (options.template) {
        const template = await this.loadTemplate(options.template);
        const layout = await this.loadLayout();

        // Render template with context
        const renderedBody = template(options.context || {});

        // Apply layout
        const layoutTemplate = Handlebars.compile(layout);
        htmlContent = layoutTemplate({
          body: renderedBody,
          ...options.context,
        });

        // Generate plain text version if not provided
        if (!textContent) {
          textContent = this.htmlToText(htmlContent);
        }
      }

      // Prepare mail options
      const mailOptions = {
        from: `${environment.mailFromName} <${environment.mailFrom}>`,
        to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
        subject: options.subject,
        html: htmlContent,
        text: textContent,
        cc: options.cc
          ? Array.isArray(options.cc)
            ? options.cc.join(", ")
            : options.cc
          : undefined,
        bcc: options.bcc
          ? Array.isArray(options.bcc)
            ? options.bcc.join(", ")
            : options.bcc
          : undefined,
        attachments: options.attachments,
      };

      // Send mail
      const info = await this.transporter.sendMail(mailOptions);

      logger.info("Email sent successfully", {
        messageId: info.messageId,
        to: mailOptions.to,
        subject: options.subject,
        template: options.template,
      });

      // Log preview URL for development
      if (environment.isDevelopment()) {
        const previewUrl = nodemailer.getTestMessageUrl(info);
        if (previewUrl) {
          logger.info(`Preview URL: ${previewUrl}`);
        }
      }
    } catch (error) {
      logger.error("Failed to send email", {
        error: error instanceof Error ? error.message : "Unknown error",
        to: options.to,
        subject: options.subject,
      });
      throw error;
    }
  }

  /**
   * Send verification email
   */
  public async sendVerificationEmail(
    to: string,
    userName: string,
    verificationToken: string,
  ): Promise<void> {
    const verificationUrl = `${environment.frontendUrl}/verify-email?token=${verificationToken}`;

    await this.sendMail({
      to,
      subject: "Verify Your Email Address",
      template: "verification",
      context: {
        userName,
        verificationUrl,
        appName: environment.appName,
      },
    });
  }

  /**
   * Send welcome email
   */
  public async sendWelcomeEmail(to: string, userName: string): Promise<void> {
    await this.sendMail({
      to,
      subject: "Welcome to Our Platform!",
      template: "welcome",
      context: {
        userName,
        appName: environment.appName,
        loginUrl: `${environment.frontendUrl}/login`,
      },
    });
  }

  /**
   * Send password reset email
   */
  public async sendPasswordResetEmail(
    to: string,
    userName: string,
    resetToken: string,
  ): Promise<void> {
    const resetUrl = `${environment.frontendUrl}/reset-password?token=${resetToken}`;

    await this.sendMail({
      to,
      subject: "Reset Your Password",
      template: "password-reset",
      context: {
        userName,
        resetUrl,
        appName: environment.appName,
        expirationTime: "1 hour",
      },
    });
  }

  /**
   * Send account approval email
   */
  public async sendApprovalEmail(to: string, userName: string): Promise<void> {
    await this.sendMail({
      to,
      subject: "Your Account Has Been Approved",
      template: "approval",
      context: {
        userName,
        appName: environment.appName,
        loginUrl: `${environment.frontendUrl}/login`,
      },
    });
  }

  /**
   * Convert HTML to plain text (basic implementation)
   */
  private htmlToText(html: string): string {
    return html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .trim();
  }

  /**
   * Get transporter instance
   */
  public getTransporter(): Transporter {
    if (!this.transporter) {
      throw new Error(
        "Mail transporter not initialized. Call connect() first.",
      );
    }
    return this.transporter;
  }

  /**
   * Disconnect mail transporter
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.transporter) {
        this.transporter.close();
        this.transporter = null;
        this.isConnected = false;
        logger.info("✅ Mail transporter disconnected successfully");
      }
    } catch (error) {
      logger.error("❌ Error disconnecting mail transporter", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  }

  /**
   * Check connection status
   */
  public isMailConnected(): boolean {
    return this.isConnected && this.transporter !== null;
  }

  /**
   * Get health status
   */
  public async getHealthStatus(): Promise<{
    status: "healthy" | "unhealthy";
    details: any;
  }> {
    try {
      if (!this.isMailConnected()) {
        return {
          status: "unhealthy",
          details: { message: "Mail service not connected" },
        };
      }

      // Verify connection
      await this.transporter!.verify();

      return {
        status: "healthy",
        details: {
          connected: true,
          host: environment.mailHost,
          port: environment.mailPort,
          from: environment.mailFrom,
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
   * Clear template cache
   */
  public clearTemplateCache(): void {
    this.templateCache.clear();
    logger.info("Email template cache cleared");
  }

  /**
   * Send bulk emails (with rate limiting)
   */
  public async sendBulkEmails(emails: In_MailOptions[]): Promise<void> {
    logger.info(`Sending ${emails.length} bulk emails...`);

    const results = {
      sent: 0,
      failed: 0,
    };

    for (const emailOptions of emails) {
      try {
        await this.sendMail(emailOptions);
        results.sent++;
      } catch (error) {
        results.failed++;
        logger.error("Failed to send bulk email", {
          to: emailOptions.to,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      // Add delay between emails to respect rate limits
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    logger.info("Bulk email sending completed", {
      sent: results.sent,
      failed: results.failed,
      total: emails.length,
    });
  }
}

// Export singleton instance
export default MailConfig.getInstance();

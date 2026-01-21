import { Request, Response, NextFunction } from "express";
import mongoSanitize from "express-mongo-sanitize";
import logger from "../utils/logger.util";

class SanitizationMiddleware {
  private static instance: SanitizationMiddleware;

  private constructor() {}

  public static getInstance(): SanitizationMiddleware {
    if (!SanitizationMiddleware.instance) {
      SanitizationMiddleware.instance = new SanitizationMiddleware();
    }
    return SanitizationMiddleware.instance;
  }

  /**
   * Sanitize all user inputs (body, query, params)
   */
  public sanitizeAll = () => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        req.body = this.sanitizeObject(req.body);
        req.query = this.sanitizeObject(req.query);
        req.params = this.sanitizeObject(req.params);

        next();
      } catch (error) {
        logger.error("Sanitization error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        next();
      }
    };
  };

  /**
   * Sanitize request body
   */
  public sanitizeBody = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    try {
      req.body = this.sanitizeObject(req.body);
      next();
    } catch (error) {
      logger.error("Body sanitization error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      next();
    }
  };

  /**
   * Sanitize query parameters
   */
  public sanitizeQuery = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    try {
      req.query = this.sanitizeObject(req.query);
      next();
    } catch (error) {
      logger.error("Query sanitization error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      next();
    }
  };

  /**
   * Sanitize URL parameters
   */
  public sanitizeParams = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    try {
      req.params = this.sanitizeObject(req.params);
      next();
    } catch (error) {
      logger.error("Params sanitization error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      next();
    }
  };

  /**
   * NoSQL injection protection using mongo-sanitize
   */
  public preventNoSQLInjection = mongoSanitize({
    replaceWith: "_",
    onSanitize: ({ key }) => {
      logger.warn("Potential NoSQL injection attempt detected", { key });
    },
  });

  /**
   * Remove null bytes from strings
   */
  public removeNullBytes = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    try {
      req.body = this.removeNullBytesFromObject(req.body);
      req.query = this.removeNullBytesFromObject(req.query);
      req.params = this.removeNullBytesFromObject(req.params);

      next();
    } catch (error) {
      logger.error("Null byte removal error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      next();
    }
  };

  /**
   * Trim whitespace from all string values
   */
  public trimWhitespace = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    try {
      req.body = this.trimObject(req.body);
      req.query = this.trimObject(req.query);
      req.params = this.trimObject(req.params);

      next();
    } catch (error) {
      logger.error("Whitespace trimming error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      next();
    }
  };

  /**
   * Remove HTML tags from strings
   */
  public stripHtmlTags = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    try {
      req.body = this.stripHtmlFromObject(req.body);
      req.query = this.stripHtmlFromObject(req.query);
      req.params = this.stripHtmlFromObject(req.params);

      next();
    } catch (error) {
      logger.error("HTML stripping error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      next();
    }
  };

  /**
   * Escape special characters for SQL injection prevention
   */
  public escapeSqlCharacters = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    try {
      req.body = this.escapeSqlInObject(req.body);
      req.query = this.escapeSqlInObject(req.query);
      req.params = this.escapeSqlInObject(req.params);

      next();
    } catch (error) {
      logger.error("SQL character escaping error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      next();
    }
  };

  /**
   * Convert empty strings to null
   */
  public emptyStringsToNull = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    try {
      req.body = this.convertEmptyStringsToNull(req.body);
      req.query = this.convertEmptyStringsToNull(req.query);

      next();
    } catch (error) {
      logger.error("Empty string conversion error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      next();
    }
  };

  /**
   * Sanitize object recursively
   */
  private sanitizeObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    if (typeof obj === "object") {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const sanitizedKey = this.sanitizeString(key);
          sanitized[sanitizedKey] = this.sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }

    if (typeof obj === "string") {
      return this.sanitizeString(obj);
    }

    return obj;
  }

  /**
   * Sanitize string
   */
  private sanitizeString(str: string): string {
    if (typeof str !== "string") return str;

    // Remove control characters except newline and tab
    let sanitized = str.replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, "");

    // Remove special characters that could be used for injection
    sanitized = sanitized.replace(/[<>]/g, "");

    // Limit string length to prevent DoS
    if (sanitized.length > 10000) {
      sanitized = sanitized.substring(0, 10000);
      logger.warn("String truncated due to excessive length");
    }

    return sanitized;
  }

  /**
   * Remove null bytes from object
   */
  private removeNullBytesFromObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.removeNullBytesFromObject(item));
    }

    if (typeof obj === "object") {
      const cleaned: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          cleaned[key] = this.removeNullBytesFromObject(obj[key]);
        }
      }
      return cleaned;
    }

    if (typeof obj === "string") {
      return obj.replace(/\0/g, "");
    }

    return obj;
  }

  /**
   * Trim whitespace from object
   */
  private trimObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.trimObject(item));
    }

    if (typeof obj === "object") {
      const trimmed: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          trimmed[key] = this.trimObject(obj[key]);
        }
      }
      return trimmed;
    }

    if (typeof obj === "string") {
      return obj.trim();
    }

    return obj;
  }

  /**
   * Strip HTML tags from object
   */
  private stripHtmlFromObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.stripHtmlFromObject(item));
    }

    if (typeof obj === "object") {
      const stripped: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          stripped[key] = this.stripHtmlFromObject(obj[key]);
        }
      }
      return stripped;
    }

    if (typeof obj === "string") {
      return obj.replace(/<[^>]*>/g, "");
    }

    return obj;
  }

  /**
   * Escape SQL special characters in object
   */
  private escapeSqlInObject(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.escapeSqlInObject(item));
    }

    if (typeof obj === "object") {
      const escaped: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          escaped[key] = this.escapeSqlInObject(obj[key]);
        }
      }
      return escaped;
    }

    if (typeof obj === "string") {
      // Note: TypeORM already handles SQL injection via parameterized queries
      // This is an additional layer of protection
      return obj.replace(/'/g, "''").replace(/"/g, '""').replace(/\\/g, "\\\\");
    }

    return obj;
  }

  /**
   * Convert empty strings to null
   */
  private convertEmptyStringsToNull(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.convertEmptyStringsToNull(item));
    }

    if (typeof obj === "object") {
      const converted: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          converted[key] = this.convertEmptyStringsToNull(obj[key]);
        }
      }
      return converted;
    }

    if (typeof obj === "string" && obj.trim() === "") {
      return null;
    }

    return obj;
  }

  /**
   * Sanitize file name
   */
  public sanitizeFileName = (filename: string): string => {
    if (!filename) return "";

    return filename
      .replace(/[^a-zA-Z0-9.-]/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_|_$/g, "")
      .substring(0, 255);
  };

  /**
   * Sanitize email
   */
  public sanitizeEmail = (email: string): string => {
    if (!email || typeof email !== "string") return "";

    return email.toLowerCase().trim().substring(0, 254);
  };

  /**
   * Sanitize URL
   */
  public sanitizeUrl = (url: string): string => {
    if (!url || typeof url !== "string") return "";

    try {
      const parsed = new URL(url);

      // Only allow http and https protocols
      if (!["http:", "https:"].includes(parsed.protocol)) {
        logger.warn("Invalid URL protocol detected", { url });
        return "";
      }

      return parsed.toString();
    } catch (error) {
      logger.warn("Invalid URL detected", { url });
      return "";
    }
  };
}

// Export singleton instance
const sanitizationMiddleware = SanitizationMiddleware.getInstance();

export default sanitizationMiddleware;

// Export individual middleware functions
export const sanitizeAll = sanitizationMiddleware.sanitizeAll;
export const sanitizeBody = sanitizationMiddleware.sanitizeBody;
export const sanitizeQuery = sanitizationMiddleware.sanitizeQuery;
export const sanitizeParams = sanitizationMiddleware.sanitizeParams;
export const preventNoSQLInjection =
  sanitizationMiddleware.preventNoSQLInjection;
export const removeNullBytes = sanitizationMiddleware.removeNullBytes;
export const trimWhitespace = sanitizationMiddleware.trimWhitespace;
export const stripHtmlTags = sanitizationMiddleware.stripHtmlTags;
export const escapeSqlCharacters = sanitizationMiddleware.escapeSqlCharacters;
export const emptyStringsToNull = sanitizationMiddleware.emptyStringsToNull;

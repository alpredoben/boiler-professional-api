import { Request, Response, NextFunction } from "express";
import rateLimit, { RateLimitRequestHandler } from "express-rate-limit";
import slowDown from "express-slow-down";
import environment from "@config/environment";
import cacheUtil from "@shared//utils/cache.util";
import apiResponse from "@shared/utils/response.util";
import logger from "@shared/utils/logger.util";
import helpersUtil from "@shared/utils/helpers.util";

class RateLimiterMiddleware {
  private static instance: RateLimiterMiddleware;

  private constructor() {}

  public static getInstance(): RateLimiterMiddleware {
    if (!RateLimiterMiddleware.instance) {
      RateLimiterMiddleware.instance = new RateLimiterMiddleware();
    }
    return RateLimiterMiddleware.instance;
  }

  /**
   * Create Redis store for rate limiting
   */
  private createRedisStore() {
    return {
      increment: async (
        key: string,
      ): Promise<{ totalHits: number; resetTime?: Date }> => {
        const ttl = Math.floor(environment.rateLimitWindowMs / 1000);
        const count = await cacheUtil.incrementRateLimit(key, ttl);

        const resetTime = new Date(Date.now() + environment.rateLimitWindowMs);

        return {
          totalHits: count,
          resetTime,
        };
      },

      decrement: async (key: string): Promise<void> => {
        const current = await cacheUtil.getRateLimit(key);
        if (current && current > 0) {
          await cacheUtil.setRateLimit(
            key,
            current - 1,
            Math.floor(environment.rateLimitWindowMs / 1000),
          );
        }
      },

      resetKey: async (key: string): Promise<void> => {
        await cacheUtil.del(`ratelimit:${key}`, { prefix: "" });
      },
    };
  }

  /**
   * Global rate limiter (applies to all routes)
   */
  public global = (): RateLimitRequestHandler => {
    return rateLimit({
      windowMs: environment.rateLimitWindowMs,
      max: environment.rateLimitMaxRequests,
      standardHeaders: true,
      legacyHeaders: false,
      message: "Too many requests from this IP, please try again later",
      keyGenerator: (req: Request) => {
        return helpersUtil.getClientIp(req);
      },
      handler: (req: Request, res: Response) => {
        logger.warn("Rate limit exceeded", {
          ip: helpersUtil.getClientIp(req),
          path: req.path,
          method: req.method,
        });

        apiResponse.sendRateLimit(
          res,
          "Too many requests, please try again later",
          Math.ceil(environment.rateLimitWindowMs / 1000),
        );
      },
      skip: (req: Request) => {
        // Skip rate limiting for health check endpoints
        return req.path === "/health" || req.path === "/metrics";
      },
    });
  };

  /**
   * Strict rate limiter for authentication endpoints
   */
  public authStrict = (): RateLimitRequestHandler => {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 requests per window
      skipSuccessfulRequests: true, // Don't count successful requests
      message: "Too many authentication attempts, please try again later",
      keyGenerator: (req: Request) => {
        // Use IP + email for login attempts
        const email = req.body.email || req.body.username;
        const ip = helpersUtil.getClientIp(req);
        return email ? `${ip}:${email}` : ip;
      },
      handler: (req: Request, res: Response) => {
        logger.warn("Auth rate limit exceeded", {
          ip: helpersUtil.getClientIp(req),
          email: req.body.email,
          path: req.path,
        });

        apiResponse.sendRateLimit(
          res,
          "Too many authentication attempts. Please try again in 15 minutes",
          900, // 15 minutes
        );
      },
    });
  };

  /**
   * Rate limiter for API endpoints
   */
  public api = (
    maxRequests: number = 100,
    windowMinutes: number = 15,
  ): RateLimitRequestHandler => {
    return rateLimit({
      windowMs: windowMinutes * 60 * 1000,
      max: maxRequests,
      message: "Too many API requests, please try again later",
      keyGenerator: (req: Request) => {
        // Use user ID if authenticated, otherwise IP
        if (req.user && req.user.id) {
          return `user:${req.user.id}`;
        }
        return `ip:${helpersUtil.getClientIp(req)}`;
      },
      handler: (req: Request, res: Response) => {
        logger.warn("API rate limit exceeded", {
          userId: req.user?.id,
          ip: helpersUtil.getClientIp(req),
          path: req.path,
        });

        apiResponse.sendRateLimit(
          res,
          "API rate limit exceeded",
          Math.ceil(windowMinutes * 60),
        );
      },
    });
  };

  /**
   * Slow down middleware (gradually increase response time)
   */
  public slowDown = (delayAfter: number = 50, delayMs: number = 500) => {
    return (req: Request, res: Response, next: NextFunction) => {
      const middleware = slowDown({
        windowMs: environment.rateLimitWindowMs,
        delayAfter,
        delayMs,
        maxDelayMs: 20000, // Max 20 seconds delay
        keyGenerator: (req: Request) => {
          return helpersUtil.getClientIp(req);
        },
      });

      middleware(req, res, () => {
        if ((req as any).slowDown?.limit) {
          logger.warn("Slow down limit reached", {
            ip: helpersUtil.getClientIp(req),
            path: req.path,
          });
        }
        next();
      });
    };
  };

  /**
   * Per-user rate limiter
   */
  public perUser = (
    maxRequests: number = 1000,
    windowMinutes: number = 60,
  ): RateLimitRequestHandler => {
    return rateLimit({
      windowMs: windowMinutes * 60 * 1000,
      max: maxRequests,
      message: "You have exceeded your request quota",
      keyGenerator: (req: Request) => {
        if (!req.user || !req.user.id) {
          throw new Error(
            "User authentication required for per-user rate limiting",
          );
        }
        return `user:${req.user.id}`;
      },
      skip: (req: Request) => !req.user,
      handler: (req: Request, res: Response) => {
        logger.warn("Per-user rate limit exceeded", {
          userId: req.user?.id,
          path: req.path,
        });

        apiResponse.sendRateLimit(
          res,
          "You have exceeded your request quota",
          Math.ceil(windowMinutes * 60),
        );
      },
    });
  };

  /**
   * Rate limiter for specific endpoint
   */
  public forEndpoint = (
    endpoint: string,
    maxRequests: number,
    windowMinutes: number,
  ): RateLimitRequestHandler => {
    return rateLimit({
      windowMs: windowMinutes * 60 * 1000,
      max: maxRequests,
      message: `Too many requests to ${endpoint}`,
      keyGenerator: (req: Request) => {
        const ip = helpersUtil.getClientIp(req);
        return `${ip}:${endpoint}`;
      },
      handler: (req: Request, res: Response) => {
        logger.warn("Endpoint rate limit exceeded", {
          ip: helpersUtil.getClientIp(req),
          endpoint,
        });

        apiResponse.sendRateLimit(
          res,
          `Too many requests to ${endpoint}`,
          Math.ceil(windowMinutes * 60),
        );
      },
    });
  };

  /**
   * Custom rate limiter with Redis
   */
  public custom = async (
    req: Request,
    res: Response,
    next: NextFunction,
    options: {
      key: string;
      max: number;
      windowSeconds: number;
      message?: string;
    },
  ): Promise<void> => {
    try {
      const { key, max, windowSeconds, message } = options;

      const count = await cacheUtil.incrementRateLimit(key, windowSeconds);

      // Set rate limit headers
      res.setHeader("X-RateLimit-Limit", max.toString());
      res.setHeader(
        "X-RateLimit-Remaining",
        Math.max(0, max - count).toString(),
      );
      res.setHeader(
        "X-RateLimit-Reset",
        (Date.now() + windowSeconds * 1000).toString(),
      );

      if (count > max) {
        logger.warn("Custom rate limit exceeded", {
          key,
          count,
          max,
        });

        apiResponse.sendRateLimit(
          res,
          message || "Rate limit exceeded",
          windowSeconds,
        );
        return;
      }

      next();
    } catch (error) {
      logger.error("Custom rate limiter error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      next();
    }
  };

  /**
   * Brute force protection for login
   */
  public loginBruteForce = (): RateLimitRequestHandler => {
    return rateLimit({
      windowMs: 30 * 60 * 1000, // 30 minutes
      max: 10, // 10 failed attempts
      skipSuccessfulRequests: true,
      message: "Too many failed login attempts, account temporarily locked",
      keyGenerator: (req: Request) => {
        const email = req.body.email || req.body.username;
        return email
          ? `login:${email.toLowerCase()}`
          : `login:${helpersUtil.getClientIp(req)}`;
      },
      handler: (req: Request, res: Response) => {
        const email = req.body.email || req.body.username;

        logger.warn("Login brute force detected", {
          email,
          ip: helpersUtil.getClientIp(req),
        });

        apiResponse.sendRateLimit(
          res,
          "Too many failed login attempts. Account temporarily locked for 30 minutes",
          1800,
        );
      },
    });
  };

  /**
   * Rate limiter for password reset
   */
  public passwordReset = (): RateLimitRequestHandler => {
    return rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 3, // 3 requests per hour
      message: "Too many password reset attempts",
      keyGenerator: (req: Request) => {
        const email = req.body.email;
        const ip = helpersUtil.getClientIp(req);
        return email ? `reset:${email.toLowerCase()}` : `reset:${ip}`;
      },
      handler: (req: Request, res: Response) => {
        logger.warn("Password reset rate limit exceeded", {
          email: req.body.email,
          ip: helpersUtil.getClientIp(req),
        });

        apiResponse.sendRateLimit(
          res,
          "Too many password reset attempts. Please try again in 1 hour",
          3600,
        );
      },
    });
  };

  /**
   * Rate limiter for email verification
   */
  public emailVerification = (): RateLimitRequestHandler => {
    return rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 3, // 3 requests per 15 minutes
      message: "Too many verification email requests",
      keyGenerator: (req: Request) => {
        if (req.user && req.user.id) {
          return `verify:${req.user.id}`;
        }
        return `verify:${helpersUtil.getClientIp(req)}`;
      },
      handler: (req: Request, res: Response) => {
        logger.warn("Email verification rate limit exceeded", {
          userId: req.user?.id,
          ip: helpersUtil.getClientIp(req),
        });

        apiResponse.sendRateLimit(
          res,
          "Too many verification email requests. Please check your inbox",
          900,
        );
      },
    });
  };

  /**
   * Rate limiter for file uploads
   */
  public fileUpload = (): RateLimitRequestHandler => {
    return rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hour
      max: 50, // 50 uploads per hour
      message: "Too many file uploads",
      keyGenerator: (req: Request) => {
        if (req.user && req.user.id) {
          return `upload:${req.user.id}`;
        }
        return `upload:${helpersUtil.getClientIp(req)}`;
      },
      handler: (req: Request, res: Response) => {
        logger.warn("File upload rate limit exceeded", {
          userId: req.user?.id,
          ip: helpersUtil.getClientIp(req),
        });

        apiResponse.sendRateLimit(
          res,
          "Too many file uploads. Please try again later",
          3600,
        );
      },
    });
  };

  /**
   * Dynamic rate limiter based on user role
   */
  public roleBasedLimiter = (
    limits: Record<string, { max: number; windowMinutes: number }>,
  ) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      if (!req.user) {
        next();
        return;
      }

      const userRoles = (req.user.roles || []) as Array<string | { name: string }>;
      let maxRequests = 100;
      let windowMinutes = 15;

      // Find the highest limit for user's roles
      for (const role of userRoles) {
        const roleName = typeof role === "string" ? role : (role as { name: string }).name;
        if (limits[roleName]) {
          maxRequests = Math.max(maxRequests, limits[roleName].max);
          windowMinutes = Math.max(
            windowMinutes,
            limits[roleName].windowMinutes,
          );
        }
      }

      const limiter = this.api(maxRequests, windowMinutes);
      limiter(req, res, next);
    };
  };

  /**
   * Clear rate limit for a specific key
   */
  public async clearLimit(key: string): Promise<void> {
    try {
      await cacheUtil.del(`ratelimit:${key}`, { prefix: "" });
      logger.info("Rate limit cleared", { key });
    } catch (error) {
      logger.error("Failed to clear rate limit", {
        error: error instanceof Error ? error.message : "Unknown error",
        key,
      });
    }
  }

  /**
   * Get remaining requests for a key
   */
  public async getRemainingRequests(key: string, max: number): Promise<number> {
    try {
      const current = await cacheUtil.getRateLimit(key);
      return Math.max(0, max - (current || 0));
    } catch (error) {
      logger.error("Failed to get remaining requests", {
        error: error instanceof Error ? error.message : "Unknown error",
        key,
      });
      return max;
    }
  }
}

// Export singleton instance
const rateLimiterMiddleware = RateLimiterMiddleware.getInstance();

export default rateLimiterMiddleware;

// Export individual middleware functions
export const globalLimiter = rateLimiterMiddleware.global;
export const authStrictLimiter = rateLimiterMiddleware.authStrict;
export const apiLimiter = rateLimiterMiddleware.api;
export const slowDownLimiter = rateLimiterMiddleware.slowDown;
export const perUserLimiter = rateLimiterMiddleware.perUser;
export const endpointLimiter = rateLimiterMiddleware.forEndpoint;
export const customLimiter = rateLimiterMiddleware.custom;
export const loginBruteForceLimiter = rateLimiterMiddleware.loginBruteForce;
export const passwordResetLimiter = rateLimiterMiddleware.passwordReset;
export const emailVerificationLimiter = rateLimiterMiddleware.emailVerification;
export const fileUploadLimiter = rateLimiterMiddleware.fileUpload;
export const roleBasedLimiter = rateLimiterMiddleware.roleBasedLimiter;

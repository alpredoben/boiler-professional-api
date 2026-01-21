import { Request, Response, NextFunction } from "express";
import captchaUtil from "@shared/utils/captcha.util";
import cacheUtil from "@shared/utils/cache.util";
import apiResponse from "@shared/utils/response.util";
import logger from "../utils/logger.util";
import environment from "../../config/environment";

class CaptchaMiddleware {
  private static instance: CaptchaMiddleware;

  private constructor() {}

  public static getInstance(): CaptchaMiddleware {
    if (!CaptchaMiddleware.instance) {
      CaptchaMiddleware.instance = new CaptchaMiddleware();
    }
    return CaptchaMiddleware.instance;
  }

  /**
   * Verify captcha from request
   */
  public verifyCaptcha = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      // Skip captcha verification if disabled
      if (!environment.captchaEnabled) {
        logger.debug("Captcha verification skipped (disabled)");
        next();
        return;
      }

      const { captchaId, captcha } = req.body;

      // Check if captcha fields are present
      if (!captchaId || !captcha) {
        logger.warn("Captcha verification failed: missing fields", {
          ip: req.ip,
          path: req.path,
        });

        apiResponse.sendBadRequest(res, "Captcha validation failed", {
          captcha: ["Captcha ID and captcha text are required"],
        });
        return;
      }

      // Verify captcha
      const isValid = await captchaUtil.verifyCaptcha(captchaId, captcha);

      if (!isValid) {
        logger.warn("Captcha verification failed: invalid captcha", {
          captchaId,
          ip: req.ip,
          path: req.path,
        });

        apiResponse.sendBadRequest(res, "Invalid or expired captcha", {
          captcha: ["The captcha you entered is invalid or has expired"],
        });
        return;
      }

      logger.debug("Captcha verification successful", {
        captchaId,
        ip: req.ip,
      });

      next();
    } catch (error) {
      logger.error("Captcha verification error", {
        error: error instanceof Error ? error.message : "Unknown error",
        ip: req.ip,
        path: req.path,
      });

      apiResponse.sendInternalError(res, "Captcha verification failed");
    }
  };

  /**
   * Optional captcha verification (doesn't fail if missing)
   */
  public verifyOptionalCaptcha = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      if (!environment.captchaEnabled) {
        next();
        return;
      }

      const { captchaId, captcha } = req.body;

      // If captcha fields are present, verify them
      if (captchaId && captcha) {
        const isValid = await captchaUtil.verifyCaptcha(captchaId, captcha);

        if (!isValid) {
          logger.warn("Optional captcha verification failed", {
            captchaId,
            ip: req.ip,
          });

          apiResponse.sendBadRequest(res, "Invalid captcha", {
            captcha: ["The captcha you entered is invalid"],
          });
          return;
        }
      }

      next();
    } catch (error) {
      logger.error("Optional captcha verification error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Don't block the request on error for optional captcha
      next();
    }
  };

  /**
   * Generate captcha endpoint handler
   */
  public generateCaptchaHandler = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const captchaResult = await captchaUtil.generateCaptcha();

      apiResponse.sendSuccess(res, 200, "Captcha generated successfully", {
        captchaId: captchaResult.captchaId,
        captchaSvg: captchaResult.captchaSvg,
        expiresAt: captchaResult.expiresAt,
      });
    } catch (error) {
      logger.error("Captcha generation error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      apiResponse.sendInternalError(res, "Failed to generate captcha");
    }
  };

  /**
   * Generate math captcha endpoint handler
   */
  public generateMathCaptchaHandler = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const captchaResult = await captchaUtil.generateMathCaptcha();

      apiResponse.sendSuccess(res, 200, "Math captcha generated successfully", {
        captchaId: captchaResult.captchaId,
        captchaSvg: captchaResult.captchaSvg,
        expiresAt: captchaResult.expiresAt,
      });
    } catch (error) {
      logger.error("Math captcha generation error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      apiResponse.sendInternalError(res, "Failed to generate math captcha");
    }
  };

  /**
   * Verify captcha for specific endpoints
   */
  public verifyCaptchaForEndpoint = (endpoints: string[]) => {
    return async (
      req: Request,
      res: Response,
      next: NextFunction,
    ): Promise<void> => {
      const shouldVerify = endpoints.some((endpoint) =>
        req.path.includes(endpoint),
      );

      if (shouldVerify) {
        await this.verifyCaptcha(req, res, next);
      } else {
        next();
      }
    };
  };

  /**
   * Rate limit captcha generation
   */
  public limitCaptchaGeneration = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const ip = req.ip || "unknown";
      const key = `captcha_gen:${ip}`;

      // Allow 10 captcha generations per 5 minutes per IP
      const count = await cacheUtil.incrementRateLimit?.(
        key,
        300,
      );

      if (count && count > 10) {
        logger.warn("Captcha generation rate limit exceeded", {
          ip,
          count,
        });

        apiResponse.sendRateLimit(
          res,
          "Too many captcha generation requests",
          300,
        );
        return;
      }

      next();
    } catch (error) {
      logger.error("Captcha rate limiting error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      // Don't block on error
      next();
    }
  };

  /**
   * Validate captcha TTL
   */
  public validateCaptchaTTL = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { captchaId } = req.body;

      if (!captchaId) {
        next();
        return;
      }

      const ttl = await captchaUtil.getCaptchaTTL(captchaId);

      if (ttl <= 0) {
        logger.warn("Expired captcha used", {
          captchaId,
          ip: req.ip,
        });

        apiResponse.sendBadRequest(res, "Captcha has expired", {
          captcha: ["This captcha has expired. Please request a new one"],
        });
        return;
      }

      next();
    } catch (error) {
      logger.error("Captcha TTL validation error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      next();
    }
  };

  /**
   * Log captcha verification attempts
   */
  public logCaptchaAttempts = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    const { captchaId, captcha } = req.body;

    if (captchaId && captcha) {
      logger.debug("Captcha verification attempt", {
        captchaId,
        ip: req.ip,
        path: req.path,
        timestamp: new Date().toISOString(),
      });
    }

    next();
  };

  /**
   * Clean up expired captchas periodically
   */
  public async cleanupExpiredCaptchas(): Promise<void> {
    try {
      const deletedCount = await captchaUtil.cleanupExpiredCaptchas();

      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} expired captchas`);
      }
    } catch (error) {
      logger.error("Captcha cleanup error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Get captcha statistics
   */
  public getCaptchaStatsHandler = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const stats = await captchaUtil.getCaptchaStats();

      apiResponse.sendSuccess(
        res,
        200,
        "Captcha statistics retrieved successfully",
        stats,
      );
    } catch (error) {
      logger.error("Captcha statistics error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      apiResponse.sendInternalError(
        res,
        "Failed to retrieve captcha statistics",
      );
    }
  };

  /**
   * Refresh captcha (delete old, generate new)
   */
  public refreshCaptchaHandler = async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const { captchaId } = req.body;

      // Delete old captcha if provided
      if (captchaId) {
        await captchaUtil.deleteCaptcha(captchaId);
      }

      // Generate new captcha
      const captchaResult = await captchaUtil.generateCaptcha();

      apiResponse.sendSuccess(res, 200, "Captcha refreshed successfully", {
        captchaId: captchaResult.captchaId,
        captchaSvg: captchaResult.captchaSvg,
        expiresAt: captchaResult.expiresAt,
      });
    } catch (error) {
      logger.error("Captcha refresh error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      apiResponse.sendInternalError(res, "Failed to refresh captcha");
    }
  };
}

// Export singleton instance
const captchaMiddleware = CaptchaMiddleware.getInstance();

export default captchaMiddleware;

// Export individual middleware functions
export const verifyCaptcha = captchaMiddleware.verifyCaptcha;
export const verifyOptionalCaptcha = captchaMiddleware.verifyOptionalCaptcha;
export const generateCaptchaHandler = captchaMiddleware.generateCaptchaHandler;
export const generateMathCaptchaHandler =
  captchaMiddleware.generateMathCaptchaHandler;
export const verifyCaptchaForEndpoint =
  captchaMiddleware.verifyCaptchaForEndpoint;
export const limitCaptchaGeneration = captchaMiddleware.limitCaptchaGeneration;
export const validateCaptchaTTL = captchaMiddleware.validateCaptchaTTL;
export const logCaptchaAttempts = captchaMiddleware.logCaptchaAttempts;
export const cleanupExpiredCaptchas = captchaMiddleware.cleanupExpiredCaptchas;
export const getCaptchaStatsHandler = captchaMiddleware.getCaptchaStatsHandler;
export const refreshCaptchaHandler = captchaMiddleware.refreshCaptchaHandler;

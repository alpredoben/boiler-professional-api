import { Request, Response, NextFunction } from "express";
import apiResponse from "../../shared/utils/response.util";
import tokenUtil from "@shared/utils/token.util";
import cacheUtil from "@shared/utils/cache.util";
import logger from "@shared/utils/logger.util";
import { In_DecodedToken } from "src/interfaces/util.interface";

declare global {
  namespace Express {
    interface Request {
      user?: In_DecodedToken;
      token?: string;
    }
  }
}

class AuthMiddleware {
  private static instance: AuthMiddleware;

  private constructor() {}

  public static getInstance(): AuthMiddleware {
    if (!AuthMiddleware.instance) {
      AuthMiddleware.instance = new AuthMiddleware();
    }
    return AuthMiddleware.instance;
  }

  /** Authenticate user via JWT token */
  public async authenticate(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        apiResponse.sendUnauthorized(res, "Authorization header missing", null);
        return;
      }

      const token = tokenUtil.extractTokenFromHeader(authHeader);
      if (!token) {
        apiResponse.sendUnauthorized(res, "Access token is required", {
          auth: "No token found and provided",
        });
        return;
      }

      const isBlacklisted = await this.isTokenBlacklisted(token);
      if (isBlacklisted) {
        apiResponse.sendUnauthorized(res, "Token has been revoked", {
          auth: "Token is blacklisted",
        });
        return;
      }

      // Verify token
      let decoded;

      try {
        decoded = await tokenUtil.verifyAccessToken(token);
      } catch (error: any) {
        const message =
          error instanceof Error ? error.message : "Invalid token";
        apiResponse.sendUnauthorized(res, message, {
          auth: "Token verification failed",
        });
        return;
      }

      // Check if user is cached
      let user = await cacheUtil.getCachedUser(decoded.userId);
      if (!user) {
        user = {
          id: decoded.userId,
          email: decoded.email,
          roles: decoded.roles || [],
        };

        await cacheUtil.cacheUser(decoded.userId, user, 1800); // 30 minutes
      }

      // Attach user and token to request
      req.user = user;
      req.token = token;

      logger.debug("User authenticated", {
        userId: user.id,
        email: user.email,
      });

      next();
    } catch (error: any) {
      logger.error("Authentication error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      apiResponse.sendInternalError(res, "Authentication failed");
    }
  }

  /** Optional authentication (doesn't fail if no token) */
  public optionalAuth = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      const token = tokenUtil.extractTokenFromHeader(authHeader);

      if (!token) {
        next();
        return;
      }

      // Try to authenticate, but don't fail if invalid
      try {
        const decoded = tokenUtil.verifyAccessToken(token);
        const user = await cacheUtil.getCachedUser(decoded.userId);

        if (user) {
          req.user = user;
          req.token = token;
        }
      } catch (error) {
        // Silent fail for optional auth
        logger.debug("Optional auth failed", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      next();
    } catch (error) {
      logger.error("Optional authentication error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      next();
    }
  };

  /** Check if token is blacklisted */
  private async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const exists = await cacheUtil.exists(`blacklist:${token}`, {
        prefix: "",
      });
      return exists;
    } catch (error) {
      logger.error("Failed to check token blacklist", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return false;
    }
  }

  /** Invalidate user cache (call when user data changes) */
  public async invalidateUserCache(userId: string): Promise<void> {
    await cacheUtil.invalidateUser(userId);
    logger.debug("User cache invalidated", { userId });
  }

  /** Verify refresh token */
  public verifyRefreshToken = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const refreshToken =
        req.body.refreshToken || req.headers["x-refresh-token"];

      if (!refreshToken) {
        apiResponse.sendUnauthorized(res, "Refresh token is required");
        return;
      }

      // Check if token is blacklisted
      const isBlacklisted = await this.isTokenBlacklisted(refreshToken);
      if (isBlacklisted) {
        apiResponse.sendUnauthorized(res, "Refresh token has been revoked");
        return;
      }

      // Verify refresh token
      try {
        const decoded = tokenUtil.verifyRefreshToken(refreshToken);
        req.user = decoded;
        req.token = refreshToken;
        next();
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid refresh token";
        apiResponse.sendUnauthorized(res, message);
      }
    } catch (error) {
      logger.error("Refresh token verification error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      apiResponse.sendInternalError(res, "Token verification failed");
    }
  };

  /** Check if user is authenticated */
  public requireAuth = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (!req.user) {
      apiResponse.sendUnauthorized(res, "Authentication required");
      return;
    }
    next();
  };

  /** Check if user email is verified */
  public requireEmailVerified = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (!req.user) {
      apiResponse.sendUnauthorized(res, "Authentication required");
      return;
    }

    if (!req.user?.isEmailVerified) {
      apiResponse.sendForbidden(res, "Email verification required", {
        verification: "Please verify your email address",
      });
      return;
    }

    next();
  };

  /**Check if user account is active */
  public requireActiveAccount = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (!req.user) {
      apiResponse.sendUnauthorized(res, "Authentication required");
      return;
    }

    if (!req.user.isActive) {
      apiResponse.sendForbidden(res, "Account is inactive", {
        account: "Your account has been deactivated",
      });
      return;
    }

    next();
  };

  /** Blacklist token (for logout) */
  public async blacklistToken(token: string): Promise<void> {
    try {
      const lifetime = tokenUtil.getTokenLifetime(token);
      if (lifetime > 0) {
        await cacheUtil.set(`blacklist:${token}`, true, {
          ttl: lifetime,
          prefix: "",
        });
        logger.debug("Token blacklisted", { token: token.substring(0, 20) });
      }
    } catch (error) {
      logger.error("Failed to blacklist token", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  /**
   * Verify API key (for external integrations)
   */
  public verifyApiKey = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const apiKey = req.headers["x-api-key"] as string;

      if (!apiKey) {
        apiResponse.sendUnauthorized(res, "API key is required");
        return;
      }

      // Verify API key token
      try {
        const decoded = tokenUtil.verifyAccessToken(apiKey) as In_DecodedToken;
        req.user = decoded;
        next();
      } catch (error) {
        apiResponse.sendUnauthorized(res, "Invalid API key");
      }
    } catch (error) {
      logger.error("API key verification error", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      apiResponse.sendInternalError(res, "API key verification failed");
    }
  };

  /**
   * Check token expiration and warn if close to expiry
   */
  public checkTokenExpiration = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (req.token) {
      const lifetime = tokenUtil.getTokenLifetime(req.token);

      // Warn if token expires in less than 5 minutes
      if (lifetime > 0 && lifetime < 300) {
        res.setHeader("X-Token-Expiring", "true");
        res.setHeader("X-Token-Lifetime", lifetime.toString());
      }
    }
    next();
  };

  /**
   * Attach current user ID to request for audit logging
   */
  public attachUserId = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (req.user && req.user.id) {
      // This can be used in BaseEntity for createdBy, updatedBy fields
      (req as any).userId = req.user.id;
    }
    next();
  };
}

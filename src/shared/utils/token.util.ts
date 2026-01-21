import jwt, { SignOptions, VerifyOptions, JwtPayload } from "jsonwebtoken";
import environment from "../../config/environment";
import logger from "./logger.util";
import {
  In_DecodedToken,
  In_TokenPayload,
} from "src/interfaces/util.interface";

class TokenUtil {
  private static instance: TokenUtil;

  private constructor() {}

  public static getInstance(): TokenUtil {
    if (!TokenUtil.instance) {
      TokenUtil.instance = new TokenUtil();
    }
    return TokenUtil.instance;
  }

  /**
   * Generate access token
   */
  public generateAccessToken(payload: In_TokenPayload): string {
    try {
      const options: SignOptions = {
        expiresIn: this.parseExpirationToSeconds(environment.jwtAccessExpiration),
        issuer: environment.appName,
        audience: environment.appUrl,
      };

      const tokenPayload = {
        ...payload,
        type: "access",
      };

      const token = jwt.sign(
        tokenPayload,
        environment.jwtAccessSecret,
        options,
      );

      logger.debug("Access token generated", {
        userId: payload.userId,
        expiresIn: this.parseExpirationToSeconds(environment.jwtAccessExpiration),
      });

      return token;
    } catch (error) {
      logger.error("Failed to generate access token", {
        error: error instanceof Error ? error.message : "Unknown error",
        userId: payload.userId,
      });
      throw new Error("Access token generation failed");
    }
  }

  /**
   * Generate refresh token
   */
  public generateRefreshToken(payload: In_TokenPayload): string {
    try {
      const options: SignOptions = {
        expiresIn: this.parseExpirationToSeconds(environment.jwtRefreshExpiration),
        issuer: environment.appName,
        audience: environment.appUrl,
      };

      const tokenPayload = {
        ...payload,
        type: "refresh",
      };

      const token = jwt.sign(
        tokenPayload,
        environment.jwtRefreshSecret,
        options,
      );

      logger.debug("Refresh token generated", {
        userId: payload.userId,
        expiresIn: this.parseExpirationToSeconds(environment.jwtRefreshExpiration),
      });

      return token;
    } catch (error) {
      logger.error("Failed to generate refresh token", {
        error: error instanceof Error ? error.message : "Unknown error",
        userId: payload.userId,
      });
      throw new Error("Refresh token generation failed");
    }
  }

  /**
   * Generate both access and refresh tokens
   */
  public generateTokenPair(payload: In_TokenPayload): {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  } {
    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    // Calculate expiration in seconds
    const expiresIn = this.parseExpirationToSeconds(
      environment.jwtAccessExpiration,
    );

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  /**
   * Verify access token
   */
  public verifyAccessToken(token: string): In_DecodedToken {
    try {
      const options: VerifyOptions = {
        issuer: environment.appName,
        audience: environment.appUrl,
      };

      const decoded = jwt.verify(
        token,
        environment.jwtAccessSecret,
        options,
      ) as In_DecodedToken;

      if (decoded.type !== "access") {
        throw new Error("Invalid token type");
      }

      logger.debug("Access token verified", {
        userId: decoded.userId,
      });

      return decoded;
    } catch (error) {
      logger.error("Access token verification failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Access token expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid access token");
      }

      throw new Error("Access token verification failed");
    }
  }

  /**
   * Verify refresh token
   */
  public verifyRefreshToken(token: string): In_DecodedToken {
    try {
      const options: VerifyOptions = {
        issuer: environment.appName,
        audience: environment.appUrl,
      };

      const decoded = jwt.verify(
        token,
        environment.jwtRefreshSecret,
        options,
      ) as In_DecodedToken;

      if (decoded.type !== "refresh") {
        throw new Error("Invalid token type");
      }

      logger.debug("Refresh token verified", {
        userId: decoded.userId,
      });

      return decoded;
    } catch (error) {
      logger.error("Refresh token verification failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Refresh token expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid refresh token");
      }

      throw new Error("Refresh token verification failed");
    }
  }

  /**
   * Decode token without verification
   */
  public decodeToken(token: string): In_DecodedToken | null {
    try {
      const decoded = jwt.decode(token) as In_DecodedToken;
      return decoded;
    } catch (error) {
      logger.error("Failed to decode token", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return null;
    }
  }

  /**
   * Extract token from Authorization header
   */
  public extractTokenFromHeader(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    const parts = authHeader.split(" ");

    if (parts.length !== 2 || parts[0] !== "Bearer") {
      return null;
    }

    return parts[1];
  }

  /**
   * Check if token is expired
   */
  public isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeToken(token);

      if (!decoded || !decoded.exp) {
        return true;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch (error) {
      return true;
    }
  }

  /**
   * Get token expiration date
   */
  public getTokenExpiration(token: string): Date | null {
    try {
      const decoded = this.decodeToken(token);

      if (!decoded || !decoded.exp) {
        return null;
      }

      return new Date(decoded.exp * 1000);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get remaining token lifetime in seconds
   */
  public getTokenLifetime(token: string): number {
    try {
      const decoded = this.decodeToken(token);

      if (!decoded || !decoded.exp) {
        return 0;
      }

      const currentTime = Math.floor(Date.now() / 1000);
      const lifetime = decoded.exp - currentTime;

      return Math.max(0, lifetime);
    } catch (error) {
      return 0;
    }
  }

  /**
   * Generate token for email verification
   */
  public generateEmailVerificationToken(userId: string, email: string): string {
    try {
      const payload = {
        userId,
        email,
        purpose: "email-verification",
      };

      const options: SignOptions = {
        expiresIn: this.parseExpirationToSeconds("24h"),
        issuer: environment.appName,
      };

      return jwt.sign(payload, environment.jwtAccessSecret, options);
    } catch (error) {
      logger.error("Failed to generate email verification token", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error("Email verification token generation failed");
    }
  }

  /**
   * Generate token for password reset
   */
  public generatePasswordResetToken(userId: string, email: string): string {
    try {
      const payload = {
        userId,
        email,
        purpose: "password-reset",
      };

      const options: SignOptions = {
        expiresIn: this.parseExpirationToSeconds("1h"),
        issuer: environment.appName,
      };

      return jwt.sign(payload, environment.jwtAccessSecret, options);
    } catch (error) {
      logger.error("Failed to generate password reset token", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error("Password reset token generation failed");
    }
  }

  /**
   * Verify special purpose token (email verification, password reset)
   */
  public verifySpecialToken(token: string, purpose: string): In_DecodedToken {
    try {
      const options: VerifyOptions = {
        issuer: environment.appName,
      };

      const decoded = jwt.verify(
        token,
        environment.jwtAccessSecret,
        options,
      ) as In_DecodedToken;

      if (decoded.purpose !== purpose) {
        throw new Error("Invalid token purpose");
      }

      return decoded;
    } catch (error) {
      logger.error("Special token verification failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        purpose,
      });

      if (error instanceof jwt.TokenExpiredError) {
        throw new Error("Token expired");
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error("Invalid token");
      }

      throw new Error("Token verification failed");
    }
  }

  /**
   * Refresh access token using refresh token
   */
  public refreshAccessToken(refreshToken: string): {
    accessToken: string;
    expiresIn: number;
  } {
    const decoded = this.verifyRefreshToken(refreshToken);

    const payload: In_TokenPayload = {
      userId: decoded.userId,
      email: decoded.email,
      roles: decoded.roles,
    };

    const accessToken = this.generateAccessToken(payload);
    const expiresIn = this.parseExpirationToSeconds(
      environment.jwtAccessExpiration,
    );

    return {
      accessToken,
      expiresIn,
    };
  }

  /**
   * Parse expiration string to seconds
   */
  private parseExpirationToSeconds(expiration: string): number {
    const units: { [key: string]: number } = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
      w: 604800,
      y: 31536000,
    };

    const match = expiration.match(/^(\d+)([smhdwy])$/);

    if (!match) {
      return 900; // Default 15 minutes
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    return value * (units[unit] || 1);
  }

  /**
   * Create token blacklist entry (for logout)
   */
  public createBlacklistEntry(token: string): {
    token: string;
    expiresAt: Date;
  } {
    const expiration = this.getTokenExpiration(token);

    return {
      token,
      expiresAt: expiration || new Date(Date.now() + 15 * 60 * 1000),
    };
  }

  /**
   * Generate API key token (for external integrations)
   */
  public generateApiKeyToken(payload: any, expiresIn?: string): string {
    try {
      const options: SignOptions = {
        expiresIn: this.parseExpirationToSeconds(expiresIn || "365d"),
        issuer: environment.appName,
      };

      return jwt.sign(payload, environment.jwtAccessSecret, options);
    } catch (error) {
      logger.error("Failed to generate API key token", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error("API key token generation failed");
    }
  }

  /**
   * Get token type (access or refresh)
   */
  public getTokenType(token: string): "access" | "refresh" | null {
    try {
      const decoded = this.decodeToken(token);
      return decoded?.type || null;
    } catch (error) {
      return null;
    }
  }
}

// Export singleton instance
export default TokenUtil.getInstance();

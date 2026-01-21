import svgCaptcha from "svg-captcha";
import environment from "../../config/environment";
import redisConfig from "../../config/redis";
import logger from "./logger.util";
import encryptionUtil from "./encryption.util";
import { In_CaptchaResult } from "src/interfaces/util.interface";

class CaptchaUtil {
  private static instance: CaptchaUtil;
  private readonly captchaPrefix = "captcha:";
  private readonly expirationTime = 5 * 60; // 5 minutes in seconds

  private constructor() {}

  public static getInstance(): CaptchaUtil {
    if (!CaptchaUtil.instance) {
      CaptchaUtil.instance = new CaptchaUtil();
    }
    return CaptchaUtil.instance;
  }

  /**
   * Generate new captcha
   */
  public async generateCaptcha(): Promise<In_CaptchaResult> {
    try {
      if (!environment.captchaEnabled) {
        logger.warn("Captcha is disabled in environment");
        return this.generateDummyCaptcha();
      }

      // Generate SVG captcha
      const captcha = svgCaptcha.create({
        size: environment.captchaSize,
        noise: environment.captchaNoise,
        color: true,
        background: "#f0f0f0",
        width: 150,
        height: 50,
        fontSize: 50,
        charPreset: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      });

      // Generate unique captcha ID
      const captchaId = encryptionUtil.generateUUID();

      // Store captcha text in Redis with expiration
      const redisClient = redisConfig.getClient();
      const key = `${this.captchaPrefix}${captchaId}`;

      await redisClient.setex(
        key,
        this.expirationTime,
        captcha.text.toLowerCase(),
      );

      const expiresAt = new Date(Date.now() + this.expirationTime * 1000);

      logger.debug("Captcha generated", {
        captchaId,
        expiresAt,
      });

      return {
        captchaId,
        captchaSvg: captcha.data,
        expiresAt,
      };
    } catch (error) {
      logger.error("Failed to generate captcha", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error("Captcha generation failed");
    }
  }

  /**
   * Generate dummy captcha (for development when captcha is disabled)
   */
  private generateDummyCaptcha(): In_CaptchaResult {
    const captchaId = "dummy-captcha-id";
    const dummySvg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="150" height="50">
        <rect width="150" height="50" fill="#f0f0f0"/>
        <text x="50%" y="50%" text-anchor="middle" dy=".3em"
              font-family="Arial" font-size="20" fill="#666">
          DISABLED
        </text>
      </svg>
    `;

    return {
      captchaId,
      captchaSvg: dummySvg,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };
  }

  /**
   * Verify captcha
   */
  public async verifyCaptcha(
    captchaId: string,
    captchaText: string,
  ): Promise<boolean> {
    try {
      if (!environment.captchaEnabled) {
        logger.debug("Captcha verification skipped (disabled)");
        return true;
      }

      if (!captchaId || !captchaText) {
        logger.warn("Captcha verification failed: missing parameters");
        return false;
      }

      // Get captcha text from Redis
      const redisClient = redisConfig.getClient();
      const key = `${this.captchaPrefix}${captchaId}`;
      const storedText = await redisClient.get(key);

      if (!storedText) {
        logger.warn(
          "Captcha verification failed: captcha expired or not found",
          {
            captchaId,
          },
        );
        return false;
      }

      // Compare captcha text (case-insensitive)
      const isValid = storedText.toLowerCase() === captchaText.toLowerCase();

      if (isValid) {
        // Delete captcha after successful verification (one-time use)
        await redisClient.del(key);

        logger.debug("Captcha verified successfully", {
          captchaId,
        });
      } else {
        logger.warn("Captcha verification failed: incorrect text", {
          captchaId,
        });
      }

      return isValid;
    } catch (error) {
      logger.error("Captcha verification error", {
        error: error instanceof Error ? error.message : "Unknown error",
        captchaId,
      });
      return false;
    }
  }

  /**
   * Delete captcha from Redis
   */
  public async deleteCaptcha(captchaId: string): Promise<void> {
    try {
      const redisClient = redisConfig.getClient();
      const key = `${this.captchaPrefix}${captchaId}`;
      await redisClient.del(key);

      logger.debug("Captcha deleted", {
        captchaId,
      });
    } catch (error) {
      logger.error("Failed to delete captcha", {
        error: error instanceof Error ? error.message : "Unknown error",
        captchaId,
      });
    }
  }

  /**
   * Check if captcha exists and is valid
   */
  public async isCaptchaValid(captchaId: string): Promise<boolean> {
    try {
      if (!environment.captchaEnabled) {
        return true;
      }

      const redisClient = redisConfig.getClient();
      const key = `${this.captchaPrefix}${captchaId}`;
      const exists = await redisClient.exists(key);

      return exists === 1;
    } catch (error) {
      logger.error("Failed to check captcha validity", {
        error: error instanceof Error ? error.message : "Unknown error",
        captchaId,
      });
      return false;
    }
  }

  /**
   * Get remaining TTL for captcha
   */
  public async getCaptchaTTL(captchaId: string): Promise<number> {
    try {
      const redisClient = redisConfig.getClient();
      const key = `${this.captchaPrefix}${captchaId}`;
      const ttl = await redisClient.ttl(key);

      return Math.max(0, ttl);
    } catch (error) {
      logger.error("Failed to get captcha TTL", {
        error: error instanceof Error ? error.message : "Unknown error",
        captchaId,
      });
      return 0;
    }
  }

  /**
   * Generate math captcha
   */
  public async generateMathCaptcha(): Promise<In_CaptchaResult> {
    try {
      if (!environment.captchaEnabled) {
        return this.generateDummyCaptcha();
      }

      const num1 = Math.floor(Math.random() * 10) + 1;
      const num2 = Math.floor(Math.random() * 10) + 1;
      const operation = ["+", "-"][Math.floor(Math.random() * 2)];

      let answer: number;
      let question: string;

      if (operation === "+") {
        answer = num1 + num2;
        question = `${num1} + ${num2}`;
      } else {
        answer = num1 - num2;
        question = `${num1} - ${num2}`;
      }

      // Generate unique captcha ID
      const captchaId = encryptionUtil.generateUUID();

      // Store answer in Redis
      const redisClient = redisConfig.getClient();
      const key = `${this.captchaPrefix}${captchaId}`;

      await redisClient.setex(key, this.expirationTime, answer.toString());

      // Create SVG with math question
      const captchaSvg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="150" height="50">
          <rect width="150" height="50" fill="#f0f0f0"/>
          <text x="50%" y="50%" text-anchor="middle" dy=".3em"
                font-family="Arial" font-size="24" fill="#333">
            ${question} = ?
          </text>
        </svg>
      `;

      const expiresAt = new Date(Date.now() + this.expirationTime * 1000);

      logger.debug("Math captcha generated", {
        captchaId,
        question,
        expiresAt,
      });

      return {
        captchaId,
        captchaSvg,
        expiresAt,
      };
    } catch (error) {
      logger.error("Failed to generate math captcha", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error("Math captcha generation failed");
    }
  }

  /**
   * Clean up expired captchas (run periodically)
   */
  public async cleanupExpiredCaptchas(): Promise<number> {
    try {
      const redisClient = redisConfig.getClient();
      const pattern = `${this.captchaPrefix}*`;
      const keys = await redisClient.keys(pattern);

      let deletedCount = 0;

      for (const key of keys) {
        const ttl = await redisClient.ttl(key);
        if (ttl === -1 || ttl === -2) {
          // -1: no expiry set, -2: key doesn't exist
          await redisClient.del(key);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        logger.info(`Cleaned up ${deletedCount} expired captchas`);
      }

      return deletedCount;
    } catch (error) {
      logger.error("Failed to cleanup expired captchas", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return 0;
    }
  }

  /**
   * Get captcha statistics
   */
  public async getCaptchaStats(): Promise<{
    total: number;
    active: number;
  }> {
    try {
      const redisClient = redisConfig.getClient();
      const pattern = `${this.captchaPrefix}*`;
      const keys = await redisClient.keys(pattern);

      let activeCount = 0;

      for (const key of keys) {
        const ttl = await redisClient.ttl(key);
        if (ttl > 0) {
          activeCount++;
        }
      }

      return {
        total: keys.length,
        active: activeCount,
      };
    } catch (error) {
      logger.error("Failed to get captcha statistics", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return {
        total: 0,
        active: 0,
      };
    }
  }
}

// Export singleton instance
export default CaptchaUtil.getInstance();

import bcrypt from "bcryptjs";
import crypto from "crypto";
import environment from "../../config/environment";
import logger from "./logger.util";

class EncryptionUtil {
  private static instance: EncryptionUtil;
  private algorithm: string = "aes-256-cbc";
  private encryptionKey: Buffer;

  private constructor() {
    // Ensure encryption key is 32 bytes for AES-256
    const key = environment.encryptionKey;
    this.encryptionKey = crypto.scryptSync(key, "salt", 32);
  }

  public static getInstance(): EncryptionUtil {
    if (!EncryptionUtil.instance) {
      EncryptionUtil.instance = new EncryptionUtil();
    }
    return EncryptionUtil.instance;
  }

  /**
   * Hash password using bcrypt
   */
  public async hashPassword(password: string): Promise<string> {
    try {
      const salt = await bcrypt.genSalt(environment.bcryptSaltRounds);
      const hashedPassword = await bcrypt.hash(password, salt);
      return hashedPassword;
    } catch (error) {
      logger.error("Failed to hash password", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error("Password hashing failed");
    }
  }

  /**
   * Compare password with hash
   */
  public async comparePassword(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hashedPassword);
    } catch (error) {
      logger.error("Failed to compare password", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error("Password comparison failed");
    }
  }

  /**
   * Generate random token
   */
  public generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString("hex");
  }

  /**
   * Generate random OTP (One-Time Password)
   */
  public generateOTP(length: number = 6): string {
    const digits = "0123456789";
    let otp = "";

    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, digits.length);
      otp += digits[randomIndex];
    }

    return otp;
  }

  /**
   * Generate UUID v4
   */
  public generateUUID(): string {
    return crypto.randomUUID();
  }

  /**
   * Encrypt text using AES-256-CBC
   */
  public encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(
        this.algorithm,
        this.encryptionKey,
        iv,
      );

      let encrypted = cipher.update(text, "utf8", "hex");
      encrypted += cipher.final("hex");

      // Return IV + encrypted data
      return iv.toString("hex") + ":" + encrypted;
    } catch (error) {
      logger.error("Encryption failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error("Encryption failed");
    }
  }

  /**
   * Decrypt text using AES-256-CBC
   */
  public decrypt(encryptedText: string): string {
    try {
      const parts = encryptedText.split(":");
      if (parts.length !== 2) {
        throw new Error("Invalid encrypted text format");
      }

      const iv = Buffer.from(parts[0], "hex");
      const encrypted = parts[1];

      const decipher = crypto.createDecipheriv(
        this.algorithm,
        this.encryptionKey,
        iv,
      );

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      logger.error("Decryption failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw new Error("Decryption failed");
    }
  }

  /**
   * Hash data using SHA-256
   */
  public hash(data: string): string {
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Hash data using HMAC
   */
  public hmac(data: string, secret?: string): string {
    const key = secret || environment.encryptionKey;
    return crypto.createHmac("sha256", key).update(data).digest("hex");
  }

  /**
   * Generate random string
   */
  public generateRandomString(length: number = 16): string {
    return crypto
      .randomBytes(Math.ceil(length / 2))
      .toString("hex")
      .slice(0, length);
  }

  /**
   * Generate secure random number
   */
  public generateRandomNumber(min: number, max: number): number {
    return crypto.randomInt(min, max + 1);
  }

  /**
   * Create hash from object (for comparison)
   */
  public hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return this.hash(str);
  }

  /**
   * Verify HMAC signature
   */
  public verifyHMAC(data: string, signature: string, secret?: string): boolean {
    const expectedSignature = this.hmac(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  /**
   * Generate cryptographically secure random bytes
   */
  public randomBytes(size: number): Buffer {
    return crypto.randomBytes(size);
  }

  /**
   * Create password reset token with expiration
   */
  public createPasswordResetToken(): {
    token: string;
    hashedToken: string;
    expiresAt: Date;
  } {
    const token = this.generateToken(32);
    const hashedToken = this.hash(token);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    return {
      token,
      hashedToken,
      expiresAt,
    };
  }

  /**
   * Create email verification token
   */
  public createEmailVerificationToken(): {
    token: string;
    hashedToken: string;
  } {
    const token = this.generateToken(32);
    const hashedToken = this.hash(token);

    return {
      token,
      hashedToken,
    };
  }

  /**
   * Mask sensitive data (e.g., email, phone)
   */
  public maskEmail(email: string): string {
    const [username, domain] = email.split("@");
    if (!username || !domain) return email;

    const visibleChars = Math.min(3, Math.floor(username.length / 2));
    const masked = username.substring(0, visibleChars) + "***";

    return `${masked}@${domain}`;
  }

  /**
   * Mask phone number
   */
  public maskPhone(phone: string): string {
    if (phone.length < 4) return phone;

    const lastFour = phone.slice(-4);
    const masked = "*".repeat(phone.length - 4) + lastFour;

    return masked;
  }

  /**
   * Mask credit card number
   */
  public maskCardNumber(cardNumber: string): string {
    const cleaned = cardNumber.replace(/\s/g, "");
    if (cleaned.length < 4) return cleaned;

    const lastFour = cleaned.slice(-4);
    const masked = "*".repeat(cleaned.length - 4) + lastFour;

    return masked;
  }

  /**
   * Generate API key
   */
  public generateApiKey(prefix: string = "sk"): string {
    const randomPart = this.generateToken(24);
    return `${prefix}_${randomPart}`;
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  public constantTimeCompare(a: string, b: string): boolean {
    try {
      return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export default EncryptionUtil.getInstance();

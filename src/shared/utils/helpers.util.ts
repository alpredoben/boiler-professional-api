import { Request } from "express";

class HelpersUtil {
  private static instance: HelpersUtil;

  private constructor() {}

  public static getInstance(): HelpersUtil {
    if (!HelpersUtil.instance) {
      HelpersUtil.instance = new HelpersUtil();
    }
    return HelpersUtil.instance;
  }

  /**
   * Sleep for specified milliseconds
   */
  public async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Generate slug from string
   */
  public generateSlug(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /**
   * Truncate string to specified length
   */
  public truncate(
    text: string,
    length: number,
    suffix: string = "...",
  ): string {
    if (text.length <= length) {
      return text;
    }
    return text.substring(0, length - suffix.length) + suffix;
  }

  /**
   * Capitalize first letter of string
   */
  public capitalize(text: string): string {
    if (!text) return text;
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  /**
   * Capitalize first letter of each word
   */
  public titleCase(text: string): string {
    return text
      .toLowerCase()
      .split(" ")
      .map((word) => this.capitalize(word))
      .join(" ");
  }

  /**
   * Convert camelCase to snake_case
   */
  public camelToSnake(text: string): string {
    return text.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  }

  /**
   * Convert snake_case to camelCase
   */
  public snakeToCamel(text: string): string {
    return text.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * Check if object is empty
   */
  public isEmpty(obj: any): boolean {
    if (obj === null || obj === undefined) return true;
    if (Array.isArray(obj)) return obj.length === 0;
    if (typeof obj === "object") return Object.keys(obj).length === 0;
    if (typeof obj === "string") return obj.trim().length === 0;
    return false;
  }

  /**
   * Deep clone object
   */
  public deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * Merge objects deeply
   */
  public deepMerge<T extends object>(...objects: Partial<T>[]): T {
    const result: any = {};

    for (const obj of objects) {
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          const value = obj[key];

          if (value && typeof value === "object" && !Array.isArray(value)) {
            result[key] = this.deepMerge(result[key] || {}, value);
          } else {
            result[key] = value;
          }
        }
      }
    }

    return result as T;
  }

  /**
   * Remove undefined and null values from object
   */
  public removeNullish<T extends object>(obj: T): Partial<T> {
    const result: any = {};

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (value !== null && value !== undefined) {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Pick specific properties from object
   */
  public pick<T extends object, K extends keyof T>(
    obj: T,
    keys: K[],
  ): Pick<T, K> {
    const result: any = {};

    for (const key of keys) {
      if (key in obj) {
        result[key] = obj[key];
      }
    }

    return result;
  }

  /**
   * Omit specific properties from object
   */
  public omit<T extends object, K extends keyof T>(
    obj: T,
    keys: K[],
  ): Omit<T, K> {
    const result: any = { ...obj };

    for (const key of keys) {
      delete result[key];
    }

    return result;
  }

  /**
   * Flatten nested object
   */
  public flatten(obj: any, prefix: string = ""): Record<string, any> {
    const result: Record<string, any> = {};

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        const newKey = prefix ? `${prefix}.${key}` : key;

        if (value && typeof value === "object" && !Array.isArray(value)) {
          Object.assign(result, this.flatten(value, newKey));
        } else {
          result[newKey] = value;
        }
      }
    }

    return result;
  }

  /**
   * Group array by key
   */
  public groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce(
      (result, item) => {
        const groupKey = String(item[key]);
        if (!result[groupKey]) {
          result[groupKey] = [];
        }
        result[groupKey].push(item);
        return result;
      },
      {} as Record<string, T[]>,
    );
  }

  /**
   * Remove duplicates from array
   */
  public unique<T>(array: T[]): T[] {
    return [...new Set(array)];
  }

  /**
   * Chunk array into smaller arrays
   */
  public chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Shuffle array randomly
   */
  public shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Get random item from array
   */
  public randomItem<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  /**
   * Debounce function
   */
  public debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number,
  ): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout | null = null;

    return (...args: Parameters<T>) => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  /**
   * Throttle function
   */
  public throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number,
  ): (...args: Parameters<T>) => void {
    let inThrottle: boolean = false;

    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => (inThrottle = false), limit);
      }
    };
  }

  /**
   * Retry function with exponential backoff
   */
  public async retry<T>(
    fn: () => Promise<T>,
    maxAttempts: number = 3,
    delay: number = 1000,
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        if (attempt < maxAttempts) {
          const backoffDelay = delay * Math.pow(2, attempt - 1);
          await this.sleep(backoffDelay);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Format bytes to human readable string
   */
  public formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
  }

  /**
   * Format duration in milliseconds to human readable string
   */
  public formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  /**
   * Get client IP address from request
   */
  public getClientIp(req: Request): string {
    const forwarded = req.headers["x-forwarded-for"];

    if (forwarded) {
      const ips = (forwarded as string).split(",");
      return ips[0].trim();
    }

    return req.ip || req.socket.remoteAddress || "unknown";
  }

  /**
   * Get user agent from request
   */
  public getUserAgent(req: Request): string {
    return req.headers["user-agent"] || "unknown";
  }

  /**
   * Parse boolean from string
   */
  public parseBoolean(value: any): boolean {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      return ["true", "1", "yes", "on"].includes(value.toLowerCase());
    }
    return Boolean(value);
  }

  /**
   * Generate random color hex
   */
  public randomColor(): string {
    return `#${Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, "0")}`;
  }

  /**
   * Check if string is valid JSON
   */
  public isValidJson(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitize filename
   */
  public sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, "_")
      .replace(/_{2,}/g, "_")
      .replace(/^_|_$/g, "");
  }

  /**
   * Get file extension
   */
  public getFileExtension(filename: string): string {
    const parts = filename.split(".");
    return parts.length > 1 ? parts.pop()!.toLowerCase() : "";
  }

  /**
   * Format number with thousand separators
   */
  public formatNumber(num: number, locale: string = "en-US"): string {
    return new Intl.NumberFormat(locale).format(num);
  }

  /**
   * Format currency
   */
  public formatCurrency(
    amount: number,
    currency: string = "USD",
    locale: string = "en-US",
  ): string {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(amount);
  }

  /**
   * Calculate percentage
   */
  public calculatePercentage(value: number, total: number): number {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
  }

  /**
   * Generate initials from name
   */
  public getInitials(name: string): string {
    return name
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase())
      .join("")
      .substring(0, 2);
  }

  /**
   * Validate email format
   */
  public isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate URL format
   */
  public isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate excerpt from text
   */
  public generateExcerpt(
    text: string,
    maxLength: number = 150,
    suffix: string = "...",
  ): string {
    const cleanText = text.replace(/<[^>]*>/g, "").trim();
    return this.truncate(cleanText, maxLength, suffix);
  }

  /**
   * Calculate age from birthdate
   */
  public calculateAge(birthdate: Date): number {
    const today = new Date();
    let age = today.getFullYear() - birthdate.getFullYear();
    const monthDiff = today.getMonth() - birthdate.getMonth();

    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthdate.getDate())
    ) {
      age--;
    }

    return age;
  }

  /**
   * Check if date is in the past
   */
  public isPast(date: Date): boolean {
    return date < new Date();
  }

  /**
   * Check if date is in the future
   */
  public isFuture(date: Date): boolean {
    return date > new Date();
  }

  /**
   * Add days to date
   */
  public addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  /**
   * Get difference in days between two dates
   */
  public daysBetween(date1: Date, date2: Date): number {
    const diffTime = Math.abs(date2.getTime() - date1.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

// Export singleton instance
export default HelpersUtil.getInstance();

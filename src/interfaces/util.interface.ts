import { JwtPayload } from "jsonwebtoken";

export interface In_TokenPayload {
  userId: string;
  email: string;
  roles?: string[];
  type?: "access" | "refresh";
  [key: string]: any;
}

export interface In_DecodedToken extends JwtPayload {
  userId: string;
  email: string;
  roles?: string[];
  type?: "access" | "refresh";
  [key: string]: any;
}

export interface In_ApiResponseMeta {
  timestamp: string;
  path?: string;
  method?: string;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [key: string]: any;
}

export interface In_ApiResponseStructure<T = any> {
  success: boolean;
  message: string;
  data?: T;
  errors?: any;
  meta: In_ApiResponseMeta;
}

export interface In_CaptchaResult {
  captchaId: string;
  captchaSvg: string;
  expiresAt: Date;
}

export interface In_PaginationParams {
  page: number;
  limit: number;
  sort?: string;
  order?: "ASC" | "DESC";
  search?: string;
  filters?: Record<string, any>;
}

export interface In_CacheOptions {
  ttl?: number; // Time to live in seconds
  prefix?: string;
}

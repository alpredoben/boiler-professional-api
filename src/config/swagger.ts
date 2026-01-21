import swaggerJsdoc from "swagger-jsdoc";
import { Options } from "swagger-jsdoc";
import environment from "./environment";

class SwaggerConfig {
  private static instance: SwaggerConfig;

  private constructor() {}

  public static getInstance(): SwaggerConfig {
    if (!SwaggerConfig.instance) {
      SwaggerConfig.instance = new SwaggerConfig();
    }
    return SwaggerConfig.instance;
  }

  /**
   * Get Swagger configuration options
   */
  public getSwaggerOptions(): Options {
    const options: Options = {
      definition: {
        openapi: "3.0.0",
        info: {
          title: `${environment.appName} API Documentation`,
          version: environment.apiVersion,
          description: `
# Professional REST API Boilerplate

A production-ready REST API with comprehensive features including authentication, authorization, and security.

## Features
- JWT Authentication (Access + Refresh Tokens)
- Role-Based Access Control (RBAC)
- Permission-Based Access Control
- Rate Limiting & Security Headers
- Input Validation & Sanitization
- Comprehensive Error Handling
- API Versioning
- Pagination & Filtering
- Caching with Redis
- Message Queue with RabbitMQ
- Email Notifications
- OAuth Integration (Google, GitHub)
- Captcha Protection
- API Monitoring & Metrics

## Authentication
Most endpoints require authentication. Include the JWT token in the Authorization header:

\`\`\`
Authorization: Bearer <your-access-token>
\`\`\`

## Rate Limiting
- Global: 100 requests per 15 minutes
- Auth endpoints: 5 requests per 15 minutes

## Error Responses
All error responses follow this structure:

\`\`\`json
{
  "success": false,
  "message": "Error description",
  "errors": {},
  "meta": {
    "timestamp": "2024-01-08T10:00:00.000Z",
    "path": "/api/v1/endpoint"
  }
}
\`\`\`
          `,
          contact: {
            name: "API Support",
            email: "support@example.com",
            url: environment.appUrl,
          },
          license: {
            name: "MIT",
            url: "https://opensource.org/licenses/MIT",
          },
        },
        servers: [
          {
            url: `${environment.appUrl}/api/${environment.apiVersion}`,
            description: `${environment.nodeEnv} server`,
          },
          {
            url: "http://localhost:3000/api/v1",
            description: "Local development server",
          },
        ],
        tags: [
          {
            name: "Authentication",
            description: "Authentication and authorization endpoints",
          },
          {
            name: "Users",
            description: "User management endpoints",
          },
          {
            name: "Roles",
            description: "Role management endpoints",
          },
          {
            name: "Permissions",
            description: "Permission management endpoints",
          },
          {
            name: "Health",
            description: "Health check and monitoring endpoints",
          },
        ],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
              description: "Enter your JWT token",
            },
            refreshToken: {
              type: "apiKey",
              in: "header",
              name: "X-Refresh-Token",
              description: "Refresh token for obtaining new access token",
            },
          },
          schemas: {
            // Success Response
            SuccessResponse: {
              type: "object",
              properties: {
                success: {
                  type: "boolean",
                  example: true,
                },
                message: {
                  type: "string",
                  example: "Operation successful",
                },
                data: {
                  type: "object",
                },
                meta: {
                  type: "object",
                  properties: {
                    timestamp: {
                      type: "string",
                      format: "date-time",
                    },
                  },
                },
              },
            },
            // Error Response
            ErrorResponse: {
              type: "object",
              properties: {
                success: {
                  type: "boolean",
                  example: false,
                },
                message: {
                  type: "string",
                  example: "An error occurred",
                },
                errors: {
                  type: "object",
                },
                meta: {
                  type: "object",
                  properties: {
                    timestamp: {
                      type: "string",
                      format: "date-time",
                    },
                    path: {
                      type: "string",
                    },
                  },
                },
              },
            },
            // Paginated Response
            PaginatedResponse: {
              type: "object",
              properties: {
                success: {
                  type: "boolean",
                  example: true,
                },
                message: {
                  type: "string",
                },
                data: {
                  type: "array",
                  items: {
                    type: "object",
                  },
                },
                meta: {
                  type: "object",
                  properties: {
                    timestamp: {
                      type: "string",
                      format: "date-time",
                    },
                    page: {
                      type: "integer",
                      example: 1,
                    },
                    limit: {
                      type: "integer",
                      example: 10,
                    },
                    total: {
                      type: "integer",
                      example: 100,
                    },
                    totalPages: {
                      type: "integer",
                      example: 10,
                    },
                  },
                },
              },
            },
            // User Schema
            User: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  format: "uuid",
                  example: "123e4567-e89b-12d3-a456-426614174000",
                },
                firstName: {
                  type: "string",
                  example: "John",
                },
                lastName: {
                  type: "string",
                  example: "Doe",
                },
                email: {
                  type: "string",
                  format: "email",
                  example: "john.doe@example.com",
                },
                isEmailVerified: {
                  type: "boolean",
                  example: true,
                },
                provider: {
                  type: "string",
                  enum: ["local", "google", "github"],
                  example: "local",
                },
                isActive: {
                  type: "boolean",
                  example: true,
                },
                roles: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/Role",
                  },
                },
                createdAt: {
                  type: "string",
                  format: "date-time",
                },
                updatedAt: {
                  type: "string",
                  format: "date-time",
                },
              },
            },
            // Role Schema
            Role: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  format: "uuid",
                },
                name: {
                  type: "string",
                  example: "admin",
                },
                description: {
                  type: "string",
                  example: "Administrator role with full access",
                },
                permissions: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/Permission",
                  },
                },
                createdAt: {
                  type: "string",
                  format: "date-time",
                },
                updatedAt: {
                  type: "string",
                  format: "date-time",
                },
              },
            },
            // Permission Schema
            Permission: {
              type: "object",
              properties: {
                id: {
                  type: "string",
                  format: "uuid",
                },
                name: {
                  type: "string",
                  example: "user:read",
                },
                description: {
                  type: "string",
                  example: "Permission to read user data",
                },
                resource: {
                  type: "string",
                  example: "user",
                },
                action: {
                  type: "string",
                  example: "read",
                },
                createdAt: {
                  type: "string",
                  format: "date-time",
                },
                updatedAt: {
                  type: "string",
                  format: "date-time",
                },
              },
            },
            // Auth Tokens
            AuthTokens: {
              type: "object",
              properties: {
                accessToken: {
                  type: "string",
                  example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                },
                refreshToken: {
                  type: "string",
                  example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                },
                expiresIn: {
                  type: "integer",
                  example: 900,
                  description: "Access token expiration in seconds",
                },
              },
            },
            // Login Request
            LoginRequest: {
              type: "object",
              required: ["email", "password", "captcha"],
              properties: {
                email: {
                  type: "string",
                  format: "email",
                  example: "user@example.com",
                },
                password: {
                  type: "string",
                  format: "password",
                  example: "SecurePassword123!",
                },
                captcha: {
                  type: "string",
                  example: "ABC123",
                },
              },
            },
            // Register Request
            RegisterRequest: {
              type: "object",
              required: [
                "firstName",
                "lastName",
                "email",
                "password",
                "confirmPassword",
              ],
              properties: {
                firstName: {
                  type: "string",
                  example: "John",
                },
                lastName: {
                  type: "string",
                  example: "Doe",
                },
                email: {
                  type: "string",
                  format: "email",
                  example: "john.doe@example.com",
                },
                password: {
                  type: "string",
                  format: "password",
                  example: "SecurePassword123!",
                  minLength: 8,
                },
                confirmPassword: {
                  type: "string",
                  format: "password",
                  example: "SecurePassword123!",
                },
              },
            },
            // Health Status
            HealthStatus: {
              type: "object",
              properties: {
                status: {
                  type: "string",
                  enum: ["healthy", "unhealthy"],
                  example: "healthy",
                },
                timestamp: {
                  type: "string",
                  format: "date-time",
                },
                uptime: {
                  type: "number",
                  example: 3600,
                },
                services: {
                  type: "object",
                  properties: {
                    database: {
                      type: "string",
                      example: "connected",
                    },
                    redis: {
                      type: "string",
                      example: "connected",
                    },
                    rabbitmq: {
                      type: "string",
                      example: "connected",
                    },
                  },
                },
              },
            },
          },
          responses: {
            UnauthorizedError: {
              description: "Access token is missing or invalid",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                  example: {
                    success: false,
                    message: "Unauthorized access",
                    errors: {
                      auth: "Invalid or expired token",
                    },
                    meta: {
                      timestamp: "2024-01-08T10:00:00.000Z",
                      path: "/api/v1/users",
                    },
                  },
                },
              },
            },
            ForbiddenError: {
              description: "Insufficient permissions",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                  example: {
                    success: false,
                    message: "Forbidden",
                    errors: {
                      permission:
                        "Insufficient permissions to access this resource",
                    },
                    meta: {
                      timestamp: "2024-01-08T10:00:00.000Z",
                      path: "/api/v1/users",
                    },
                  },
                },
              },
            },
            ValidationError: {
              description: "Validation error",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                  example: {
                    success: false,
                    message: "Validation failed",
                    errors: {
                      email: "Invalid email format",
                      password: "Password must be at least 8 characters",
                    },
                    meta: {
                      timestamp: "2024-01-08T10:00:00.000Z",
                      path: "/api/v1/auth/register",
                    },
                  },
                },
              },
            },
            NotFoundError: {
              description: "Resource not found",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                  example: {
                    success: false,
                    message: "Resource not found",
                    errors: {},
                    meta: {
                      timestamp: "2024-01-08T10:00:00.000Z",
                      path: "/api/v1/users/123",
                    },
                  },
                },
              },
            },
            RateLimitError: {
              description: "Too many requests",
              content: {
                "application/json": {
                  schema: {
                    $ref: "#/components/schemas/ErrorResponse",
                  },
                  example: {
                    success: false,
                    message: "Too many requests",
                    errors: {
                      rateLimit: "Rate limit exceeded. Please try again later.",
                    },
                    meta: {
                      timestamp: "2024-01-08T10:00:00.000Z",
                      path: "/api/v1/auth/login",
                    },
                  },
                },
              },
            },
          },
          parameters: {
            PageParam: {
              in: "query",
              name: "page",
              schema: {
                type: "integer",
                minimum: 1,
                default: 1,
              },
              description: "Page number for pagination",
            },
            LimitParam: {
              in: "query",
              name: "limit",
              schema: {
                type: "integer",
                minimum: 1,
                maximum: 100,
                default: 10,
              },
              description: "Number of items per page",
            },
            SortParam: {
              in: "query",
              name: "sort",
              schema: {
                type: "string",
                example: "createdAt:desc",
              },
              description: "Sort field and order (field:asc or field:desc)",
            },
            SearchParam: {
              in: "query",
              name: "search",
              schema: {
                type: "string",
              },
              description: "Search query",
            },
          },
        },
        security: [
          {
            bearerAuth: [],
          },
        ],
      },
      apis: ["./src/routes/*.ts", "./src/routes/**/*.ts", "./src/dto/**/*.ts"],
    };

    return options;
  }

  /**
   * Get Swagger specification
   */
  public getSwaggerSpec() {
    const options = this.getSwaggerOptions();
    return swaggerJsdoc(options);
  }

  /**
   * Get Swagger UI options
   */
  public getSwaggerUIOptions() {
    return {
      customCss: `
        .swagger-ui .topbar { display: none }
        .swagger-ui .info { margin: 50px 0 }
        .swagger-ui .scheme-container { background: #fafafa; padding: 20px; }
      `,
      customSiteTitle: `${environment.appName} API Documentation`,
      customfavIcon: "/favicon.ico",
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        filter: true,
        tryItOutEnabled: true,
        requestSnippetsEnabled: true,
        syntaxHighlight: {
          activate: true,
          theme: "monokai",
        },
      },
    };
  }
}

// Export singleton instance
export default SwaggerConfig.getInstance();

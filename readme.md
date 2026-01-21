```
professional-rest-api/
├── src/
│   ├── config/
│   │   ├── environment.ts         # ✅ Created - Environment configuration
│   │   ├── database.ts            # Database connection config
│   │   ├── redis.ts               # Redis configuration
│   │   ├── rabbitmq.ts            # RabbitMQ configuration
│   │   ├── mail.ts                # Email/SMTP configuration
│   │   ├── swagger.ts             # Swagger documentation config
│   │   └── index.ts               # Export all configs
│   │
│   ├── core/
│   │   ├── interfaces/
│   │   │   ├── IRepository.ts     # Base repository interface
│   │   │   ├── IService.ts        # Base service interface
│   │   │   ├── IUser.ts           # User interface
│   │   │   ├── IRole.ts           # Role interface
│   │   │   ├── IPermission.ts     # Permission interface
│   │   │   └── IApiResponse.ts    # API response interface
│   │   │
│   │   ├── exceptions/
│   │   │   ├── AppError.ts        # Base error class
│   │   │   ├── ValidationError.ts # Validation errors
│   │   │   ├── AuthError.ts       # Authentication errors
│   │   │   └── NotFoundError.ts   # Not found errors
│   │   │
│   │   └── constants/
│   │       ├── roles.enum.ts      # User roles enum
│   │       ├── permissions.enum.ts # Permissions enum
│   │       ├── http-status.enum.ts # HTTP status codes
│   │       └── events.enum.ts     # Event types enum
│   │
│   ├── database/
│   │   ├── entities/
│   │   │   ├── BaseEntity.ts      # Base entity with audit fields
│   │   │   ├── User.entity.ts     # User entity
│   │   │   ├── Role.entity.ts     # Role entity
│   │   │   ├── Permission.entity.ts # Permission entity
│   │   │   ├── RefreshToken.entity.ts # Refresh token entity
│   │   │   └── index.ts           # Export all entities
│   │   │
│   │   ├── migrations/
│   │   │   ├── 1234567890-CreateUsersTable.ts
│   │   │   ├── 1234567891-CreateRolesTable.ts
│   │   │   ├── 1234567892-CreatePermissionsTable.ts
│   │   │   └── 1234567893-CreateRefreshTokensTable.ts
│   │   │
│   │   └── seeders/
│   │       ├── RoleSeeder.ts      # Seed default roles
│   │       ├── PermissionSeeder.ts # Seed default permissions
│   │       ├── UserSeeder.ts      # Seed admin user
│   │       └── index.ts           # Main seeder
│   │
│   ├── shared/
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts           # JWT authentication
│   │   │   ├── rbac.middleware.ts           # Role-based access control
│   │   │   ├── permission.middleware.ts     # Permission checking
│   │   │   ├── rateLimiter.middleware.ts    # Rate limiting
│   │   │   ├── errorHandler.middleware.ts   # Global error handler
│   │   │   ├── validation.middleware.ts     # Request validation
│   │   │   ├── sanitization.middleware.ts   # Input sanitization
│   │   │   ├── security.middleware.ts       # Security headers
│   │   │   ├── logger.middleware.ts         # Request logging
│   │   │   └── captcha.middleware.ts        # Captcha validation
│   │   │
│   │   ├── utils/
│   │   │   ├── logger.util.ts               # Winston logger
│   │   │   ├── encryption.util.ts           # Password hashing
│   │   │   ├── token.util.ts                # JWT token manager
│   │   │   ├── captcha.util.ts              # Captcha generator
│   │   │   ├── apiResponse.util.ts          # Standardized API response
│   │   │   ├── pagination.util.ts           # Pagination helper
│   │   │   ├── cache.util.ts                # Redis cache helper
│   │   │   └── helpers.util.ts              # General helpers
│   │   │
│   │   └── validators/
│   │       ├── common.validator.ts          # Common validation rules
│   │       └── custom.validator.ts          # Custom validators
│   │
│   ├── dto/
│   │   ├── auth/
│   │   │   ├── LoginDto.ts              # Login request DTO
│   │   │   ├── RegisterDto.ts           # Register request DTO
│   │   │   ├── ForgotPasswordDto.ts     # Forgot password DTO
│   │   │   ├── ResetPasswordDto.ts      # Reset password DTO
│   │   │   └── VerifyEmailDto.ts        # Email verification DTO
│   │   │
│   │   ├── user/
│   │   │   ├── CreateUserDto.ts         # Create user DTO
│   │   │   ├── UpdateUserDto.ts         # Update user DTO
│   │   │   └── UpdateProfileDto.ts      # Update profile DTO
│   │   │
│   │   ├── role/
│   │   │   ├── CreateRoleDto.ts         # Create role DTO
│   │   │   └── UpdateRoleDto.ts         # Update role DTO
│   │   │
│   │   └── permission/
│   │       ├── CreatePermissionDto.ts   # Create permission DTO
│   │       └── UpdatePermissionDto.ts   # Update permission DTO
│   │
│   ├── routes/
│   │   ├── authRoute.ts            # Authentication routes
│   │   ├── userRoute.ts            # User CRUD routes
│   │   ├── roleRoute.ts            # Role CRUD routes
│   │   ├── permissionRoute.ts      # Permission CRUD routes
│   │   ├── healthRoute.ts          # Health check routes
│   │   └── index.ts                # Main router
│   │
│   ├── repositories/
│   │   ├── BaseRepository.ts       # Abstract base repository
│   │   ├── UserRepository.ts       # User data access
│   │   ├── RoleRepository.ts       # Role data access
│   │   ├── PermissionRepository.ts # Permission data access
│   │   └── RefreshTokenRepository.ts # Refresh token data access
│   │
│   ├── services/
│   │   ├── AuthService.ts          # Authentication business logic
│   │   ├── UserService.ts          # User business logic
│   │   ├── RoleService.ts          # Role business logic
│   │   ├── PermissionService.ts    # Permission business logic
│   │   ├── EmailService.ts         # Email sending service
│   │   ├── CacheService.ts         # Redis caching service
│   │   └── MetricsService.ts       # Prometheus metrics
│   │
│   ├── errors/
│   │   ├── AppError.ts             # Base application error
│   │   ├── BadRequestError.ts      # 400 errors
│   │   ├── UnauthorizedError.ts    # 401 errors
│   │   ├── ForbiddenError.ts       # 403 errors
│   │   ├── NotFoundError.ts        # 404 errors
│   │   ├── ConflictError.ts        # 409 errors
│   │   └── ValidationError.ts      # Validation errors
│   │
│   ├── events/
│   │   ├── listeners/
│   │   │   ├── UserRegisteredListener.ts    # Handle user registration
│   │   │   ├── PasswordResetListener.ts     # Handle password reset
│   │   │   └── EmailVerificationListener.ts # Handle email verification
│   │   │
│   │   └── emitters/
│   │       ├── UserEventEmitter.ts          # User events
│   │       └── AuthEventEmitter.ts          # Auth events
│   │
│   ├── i18n/
│   │   ├── locales/
│   │   │   ├── en.json             # English translations
│   │   │   ├── id.json             # Indonesian translations
│   │   │   └── es.json             # Spanish translations
│   │   └── index.ts                # i18n configuration
│   │
│   ├── mail/
│   │   ├── templates/
│   │   │   ├── welcome.hbs         # Welcome email template
│   │   │   ├── verification.hbs    # Email verification template
│   │   │   ├── password-reset.hbs  # Password reset template
│   │   │   ├── approval.hbs        # Account approval template
│   │   │   └── layouts/
│   │   │       └── main.hbs        # Main email layout
│   │   │
│   │   └── MailService.ts          # Email service implementation
│   │
│   ├── app.ts                      # Express app configuration
│   └── server.ts                   # Server entry point
│
├── tests/
│   ├── unit/
│   │   ├── services/
│   │   │   ├── AuthService.test.ts
│   │   │   ├── UserService.test.ts
│   │   │   └── RoleService.test.ts
│   │   │
│   │   └── utils/
│   │       ├── encryption.test.ts
│   │       └── token.test.ts
│   │
│   ├── integration/
│   │   ├── auth.test.ts            # Auth endpoints tests
│   │   ├── user.test.ts            # User endpoints tests
│   │   ├── role.test.ts            # Role endpoints tests
│   │   └── permission.test.ts      # Permission endpoints tests
│   │
│   └── setup.ts                    # Test configuration
│
├── docker/
│   ├── Dockerfile.dev              # Development Dockerfile
│   ├── Dockerfile.stg              # Staging Dockerfile
│   └── Dockerfile.prod             # Production Dockerfile
│
├── .github/
│   └── workflows/
│       └── ci-cd.yml               # GitHub Actions CI/CD
│
├── scripts/
│   ├── migrate.ts                  # Run migrations script
│   └── seed.ts                     # Run seeders script
│
├── .env                            # Environment variables (gitignored)
├── .env.example                    # ✅ Created - Example environment file
├── .dockerignore                   # Docker ignore rules
├── .gitignore                      # Git ignore rules
├── .eslintrc.json                  # ESLint configuration
├── .prettierrc                     # Prettier configuration
├── jest.config.js                  # Jest configuration
├── package.json                    # ✅ Created - Dependencies
├── docker-compose.dev.yml          # Dev environment compose
├── docker-compose.stg.yml          # Staging environment compose
├── docker-compose.prod.yml         # Production environment compose
├── tsconfig.json                   # ✅ Created - TypeScript config
└── README.md                       # Project documentation
```

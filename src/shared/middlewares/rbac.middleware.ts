import { Request, Response, NextFunction } from "express";
import apiResponse from "@shared/utils/response.util";
import logger from "../utils/logger.util";

class RBACMiddleware {
  private static instance: RBACMiddleware;

  private constructor() {}

  public static getInstance(): RBACMiddleware {
    if (!RBACMiddleware.instance) {
      RBACMiddleware.instance = new RBACMiddleware();
    }
    return RBACMiddleware.instance;
  }

  /**
   * Check if user has required role
   */
  public requireRole = (...requiredRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          apiResponse.sendUnauthorized(res, "Authentication required");
          return;
        }

        const userRoles = this.getUserRoles(req.user);

        if (!userRoles || userRoles.length === 0) {
          logger.warn("User has no roles assigned", { userId: req.user.id });
          apiResponse.sendForbidden(res, "No roles assigned to user");
          return;
        }

        // Check if user has any of the required roles
        const hasRole = requiredRoles.some((requiredRole) =>
          userRoles.some(
            (userRole) =>
              this.normalizeRole(userRole) === this.normalizeRole(requiredRole),
          ),
        );

        if (!hasRole) {
          logger.warn("User lacks required role", {
            userId: req.user.id,
            userRoles,
            requiredRoles,
          });

          apiResponse.sendForbidden(res, "Insufficient permissions", {
            required: requiredRoles,
            current: userRoles,
          });
          return;
        }

        logger.debug("Role check passed", {
          userId: req.user.id,
          roles: userRoles,
        });

        next();
      } catch (error) {
        logger.error("RBAC middleware error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Authorization check failed");
      }
    };
  };

  /**
   * Check if user has all required roles
   */
  public requireAllRoles = (...requiredRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          apiResponse.sendUnauthorized(res, "Authentication required");
          return;
        }

        const userRoles = this.getUserRoles(req.user);

        if (!userRoles || userRoles.length === 0) {
          apiResponse.sendForbidden(res, "No roles assigned to user");
          return;
        }

        // Check if user has all required roles
        const hasAllRoles = requiredRoles.every((requiredRole) =>
          userRoles.some(
            (userRole) =>
              this.normalizeRole(userRole) === this.normalizeRole(requiredRole),
          ),
        );

        if (!hasAllRoles) {
          logger.warn("User lacks all required roles", {
            userId: req.user.id,
            userRoles,
            requiredRoles,
          });

          apiResponse.sendForbidden(
            res,
            "Insufficient permissions - all roles required",
            {
              required: requiredRoles,
              current: userRoles,
            },
          );
          return;
        }

        next();
      } catch (error) {
        logger.error("RBAC middleware error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Authorization check failed");
      }
    };
  };

  /**
   * Check if user is admin
   */
  public requireAdmin = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    this.requireRole("admin")(req, res, next);
  };

  /**
   * Check if user is admin or moderator
   */
  public requireAdminOrModerator = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    this.requireRole("admin", "moderator")(req, res, next);
  };

  /**
   * Check if user is super admin
   */
  public requireSuperAdmin = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    this.requireRole("super_admin", "superadmin")(req, res, next);
  };

  /**
   * Check if user owns the resource or is admin
   */
  public requireOwnerOrAdmin = (ownerIdField: string = "userId") => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          apiResponse.sendUnauthorized(res, "Authentication required");
          return;
        }

        const userRoles = this.getUserRoles(req.user);
        const isAdmin = userRoles.some((role) =>
          ["admin", "super_admin", "superadmin"].includes(
            this.normalizeRole(role),
          ),
        );

        if (isAdmin) {
          next();
          return;
        }

        // Check ownership
        const resourceOwnerId =
          req.params[ownerIdField] || req.body[ownerIdField];
        const currentUserId = req.user.id;

        if (resourceOwnerId !== currentUserId) {
          logger.warn("User attempted to access resource they do not own", {
            userId: currentUserId,
            resourceOwnerId,
          });

          apiResponse.sendForbidden(
            res,
            "You can only access your own resources",
          );
          return;
        }

        next();
      } catch (error) {
        logger.error("Owner check middleware error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Authorization check failed");
      }
    };
  };

  /**
   * Check if user owns the resource (based on req.user.id)
   */
  public requireOwner = (ownerIdGetter: (req: Request) => string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          apiResponse.sendUnauthorized(res, "Authentication required");
          return;
        }

        const resourceOwnerId = ownerIdGetter(req);
        const currentUserId = req.user.id;

        if (!resourceOwnerId) {
          apiResponse.sendBadRequest(res, "Resource owner ID not found");
          return;
        }

        if (resourceOwnerId !== currentUserId) {
          logger.warn("User attempted to access resource they do not own", {
            userId: currentUserId,
            resourceOwnerId,
          });

          apiResponse.sendForbidden(
            res,
            "You do not have permission to access this resource",
          );
          return;
        }

        next();
      } catch (error) {
        logger.error("Owner check middleware error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Authorization check failed");
      }
    };
  };

  /**
   * Check if user can access based on custom condition
   */
  public requireCondition = (
    condition: (req: Request) => boolean,
    errorMessage: string = "Access denied",
  ) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          apiResponse.sendUnauthorized(res, "Authentication required");
          return;
        }

        if (!condition(req)) {
          logger.warn("User failed custom condition check", {
            userId: req.user.id,
          });

          apiResponse.sendForbidden(res, errorMessage);
          return;
        }

        next();
      } catch (error) {
        logger.error("Condition check middleware error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Authorization check failed");
      }
    };
  };

  /**
   * Allow access to self or admin
   */
  public requireSelfOrAdmin = (userIdParam: string = "id") => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          apiResponse.sendUnauthorized(res, "Authentication required");
          return;
        }

        const targetUserId = req.params[userIdParam];
        const currentUserId = req.user.id;
        const userRoles = this.getUserRoles(req.user);

        const isAdmin = userRoles.some((role) =>
          ["admin", "super_admin", "superadmin"].includes(
            this.normalizeRole(role),
          ),
        );

        const isSelf = targetUserId === currentUserId;

        if (!isSelf && !isAdmin) {
          logger.warn("User attempted to access another user's resource", {
            currentUserId,
            targetUserId,
          });

          apiResponse.sendForbidden(
            res,
            "You can only access your own profile",
          );
          return;
        }

        next();
      } catch (error) {
        logger.error("Self or admin check middleware error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Authorization check failed");
      }
    };
  };

  /**
   * Restrict access for specific roles
   */
  public restrictRoles = (...restrictedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          apiResponse.sendUnauthorized(res, "Authentication required");
          return;
        }

        const userRoles = this.getUserRoles(req.user);

        const hasRestrictedRole = restrictedRoles.some((restrictedRole) =>
          userRoles.some(
            (userRole) =>
              this.normalizeRole(userRole) ===
              this.normalizeRole(restrictedRole),
          ),
        );

        if (hasRestrictedRole) {
          logger.warn("User with restricted role attempted access", {
            userId: req.user.id,
            userRoles,
            restrictedRoles,
          });

          apiResponse.sendForbidden(
            res,
            "Your role is not allowed to perform this action",
          );
          return;
        }

        next();
      } catch (error) {
        logger.error("Role restriction middleware error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Authorization check failed");
      }
    };
  };

  /**
   * Get user roles from user object
   */
  private getUserRoles(user: any): string[] {
    if (!user) return [];

    // Handle different role structures
    if (Array.isArray(user.roles)) {
      return user.roles
        .map((role: any) => {
          if (typeof role === "string") return role;
          if (role && role.name) return role.name;
          return "";
        })
        .filter(Boolean);
    }

    if (user.role) {
      return [typeof user.role === "string" ? user.role : user.role.name];
    }

    return [];
  }

  /**
   * Normalize role name (lowercase, remove spaces and underscores)
   */
  private normalizeRole(role: string): string {
    return role.toLowerCase().replace(/[\s_-]/g, "");
  }

  /**
   * Check if user has role
   */
  public hasRole(user: any, role: string): boolean {
    const userRoles = this.getUserRoles(user);
    return userRoles.some(
      (userRole) => this.normalizeRole(userRole) === this.normalizeRole(role),
    );
  }

  /**
   * Check if user has any of the roles
   */
  public hasAnyRole(user: any, roles: string[]): boolean {
    const userRoles = this.getUserRoles(user);
    return roles.some((role) =>
      userRoles.some(
        (userRole) => this.normalizeRole(userRole) === this.normalizeRole(role),
      ),
    );
  }

  /**
   * Check if user has all roles
   */
  public hasAllRoles(user: any, roles: string[]): boolean {
    const userRoles = this.getUserRoles(user);
    return roles.every((role) =>
      userRoles.some(
        (userRole) => this.normalizeRole(userRole) === this.normalizeRole(role),
      ),
    );
  }

  /**
   * Check if user is admin
   */
  public isAdmin(user: any): boolean {
    return this.hasAnyRole(user, ["admin", "super_admin", "superadmin"]);
  }
}

// Export singleton instance
const rbacMiddleware = RBACMiddleware.getInstance();

export default rbacMiddleware;

// Export individual middleware functions
export const requireRole = rbacMiddleware.requireRole;
export const requireAllRoles = rbacMiddleware.requireAllRoles;
export const requireAdmin = rbacMiddleware.requireAdmin;
export const requireAdminOrModerator = rbacMiddleware.requireAdminOrModerator;
export const requireSuperAdmin = rbacMiddleware.requireSuperAdmin;
export const requireOwnerOrAdmin = rbacMiddleware.requireOwnerOrAdmin;
export const requireOwner = rbacMiddleware.requireOwner;
export const requireCondition = rbacMiddleware.requireCondition;
export const requireSelfOrAdmin = rbacMiddleware.requireSelfOrAdmin;
export const restrictRoles = rbacMiddleware.restrictRoles;

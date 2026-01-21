import { Request, Response, NextFunction } from "express";
import apiResponse from "@shared/utils/response.util";
import logger from "../utils/logger.util";

class PermissionMiddleware {
  private static instance: PermissionMiddleware;

  private constructor() {}

  public static getInstance(): PermissionMiddleware {
    if (!PermissionMiddleware.instance) {
      PermissionMiddleware.instance = new PermissionMiddleware();
    }
    return PermissionMiddleware.instance;
  }

  /**
   * Check if user has required permission
   */
  public requirePermission = (...requiredPermissions: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          apiResponse.sendUnauthorized(res, "Authentication required");
          return;
        }

        const userPermissions = this.getUserPermissions(req.user);

        if (!userPermissions || userPermissions.length === 0) {
          logger.warn("User has no permissions assigned", {
            userId: req.user.id,
          });
          apiResponse.sendForbidden(res, "No permissions assigned to user");
          return;
        }

        // Check if user has any of the required permissions
        const hasPermission = requiredPermissions.some((requiredPerm) =>
          userPermissions.some(
            (userPerm) =>
              this.normalizePermission(userPerm) ===
              this.normalizePermission(requiredPerm),
          ),
        );

        if (!hasPermission) {
          logger.warn("User lacks required permission", {
            userId: req.user.id,
            userPermissions,
            requiredPermissions,
          });

          apiResponse.sendForbidden(res, "Insufficient permissions", {
            required: requiredPermissions,
            current: userPermissions,
          });
          return;
        }

        logger.debug("Permission check passed", {
          userId: req.user.id,
          permissions: userPermissions,
        });

        next();
      } catch (error) {
        logger.error("Permission middleware error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Permission check failed");
      }
    };
  };

  /**
   * Check if user has all required permissions
   */
  public requireAllPermissions = (...requiredPermissions: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          apiResponse.sendUnauthorized(res, "Authentication required");
          return;
        }

        const userPermissions = this.getUserPermissions(req.user);

        if (!userPermissions || userPermissions.length === 0) {
          apiResponse.sendForbidden(res, "No permissions assigned to user");
          return;
        }

        // Check if user has all required permissions
        const hasAllPermissions = requiredPermissions.every((requiredPerm) =>
          userPermissions.some(
            (userPerm) =>
              this.normalizePermission(userPerm) ===
              this.normalizePermission(requiredPerm),
          ),
        );

        if (!hasAllPermissions) {
          logger.warn("User lacks all required permissions", {
            userId: req.user.id,
            userPermissions,
            requiredPermissions,
          });

          apiResponse.sendForbidden(
            res,
            "Insufficient permissions - all permissions required",
            {
              required: requiredPermissions,
              current: userPermissions,
            },
          );
          return;
        }

        next();
      } catch (error) {
        logger.error("Permission middleware error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Permission check failed");
      }
    };
  };

  /**
   * Check resource-based permission (e.g., "user:read", "post:write")
   */
  public requireResourcePermission = (
    resource: string,
    action: "create" | "read" | "update" | "delete" | "manage",
  ) => {
    return this.requirePermission(`${resource}:${action}`);
  };

  /**
   * Check CRUD permissions for a resource
   */
  public requireCreate = (resource: string) => {
    return this.requireResourcePermission(resource, "create");
  };

  public requireRead = (resource: string) => {
    return this.requireResourcePermission(resource, "read");
  };

  public requireUpdate = (resource: string) => {
    return this.requireResourcePermission(resource, "update");
  };

  public requireDelete = (resource: string) => {
    return this.requireResourcePermission(resource, "delete");
  };

  public requireManage = (resource: string) => {
    return this.requireResourcePermission(resource, "manage");
  };

  /**
   * Check if user can perform any action on resource
   */
  public canAccessResource = (resource: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          apiResponse.sendUnauthorized(res, "Authentication required");
          return;
        }

        const userPermissions = this.getUserPermissions(req.user);
        const resourcePermissions = userPermissions.filter((perm) =>
          perm.startsWith(`${resource}:`),
        );

        if (resourcePermissions.length === 0) {
          logger.warn("User cannot access resource", {
            userId: req.user.id,
            resource,
          });

          apiResponse.sendForbidden(
            res,
            `No permissions for resource: ${resource}`,
          );
          return;
        }

        next();
      } catch (error) {
        logger.error("Resource access check error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Permission check failed");
      }
    };
  };

  /**
   * Check permission with wildcard support (e.g., "user:*", "*:read")
   */
  public requireWildcardPermission = (pattern: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          apiResponse.sendUnauthorized(res, "Authentication required");
          return;
        }

        const userPermissions = this.getUserPermissions(req.user);
        const hasPermission = this.matchWildcardPermission(
          pattern,
          userPermissions,
        );

        if (!hasPermission) {
          logger.warn("User lacks wildcard permission", {
            userId: req.user.id,
            pattern,
            userPermissions,
          });

          apiResponse.sendForbidden(res, "Insufficient permissions");
          return;
        }

        next();
      } catch (error) {
        logger.error("Wildcard permission check error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Permission check failed");
      }
    };
  };

  /**
   * Check if user has admin-level permissions
   */
  public requireAdminPermission = (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    const adminPermissions = ["admin:*", "*:*", "system:manage", "all:manage"];

    this.requirePermission(...adminPermissions)(req, res, next);
  };

  /**
   * Combine role and permission checks
   */
  public requireRoleAndPermission = (
    roles: string[],
    permissions: string[],
  ) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.user) {
          apiResponse.sendUnauthorized(res, "Authentication required");
          return;
        }

        const userRoles = this.getUserRoles(req.user);
        const userPermissions = this.getUserPermissions(req.user);

        // Check roles
        const hasRole = roles.some((role) =>
          userRoles.some(
            (userRole) =>
              this.normalizePermission(userRole) ===
              this.normalizePermission(role),
          ),
        );

        // Check permissions
        const hasPermission = permissions.some((permission) =>
          userPermissions.some(
            (userPerm) =>
              this.normalizePermission(userPerm) ===
              this.normalizePermission(permission),
          ),
        );

        if (!hasRole || !hasPermission) {
          logger.warn("User lacks required role and permission combination", {
            userId: req.user.id,
            requiredRoles: roles,
            requiredPermissions: permissions,
          });

          apiResponse.sendForbidden(res, "Insufficient role and permissions");
          return;
        }

        next();
      } catch (error) {
        logger.error("Role and permission check error", {
          error: error instanceof Error ? error.message : "Unknown error",
        });
        apiResponse.sendInternalError(res, "Authorization check failed");
      }
    };
  };

  /**
   * Check permission based on HTTP method
   */
  public requireMethodPermission = (resource: string) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      const methodMap: Record<string, string> = {
        GET: "read",
        POST: "create",
        PUT: "update",
        PATCH: "update",
        DELETE: "delete",
      };

      const action = methodMap[req.method];
      if (!action) {
        apiResponse.sendBadRequest(res, "Unsupported HTTP method");
        return;
      }

      const permission = `${resource}:${action}`;
      this.requirePermission(permission)(req, res, next);
    };
  };

  /**
   * Get user permissions from user object
   */
  private getUserPermissions(user: any): string[] {
    if (!user) return [];

    const permissions: string[] = [];

    // Get permissions from user.permissions
    if (Array.isArray(user.permissions)) {
      permissions.push(
        ...user.permissions
          .map((perm: any) => {
            if (typeof perm === "string") return perm;
            if (perm && perm.name) return perm.name;
            return "";
          })
          .filter(Boolean),
      );
    }

    // Get permissions from user.roles[].permissions
    if (Array.isArray(user.roles)) {
      user.roles.forEach((role: any) => {
        if (role && Array.isArray(role.permissions)) {
          permissions.push(
            ...role.permissions
              .map((perm: any) => {
                if (typeof perm === "string") return perm;
                if (perm && perm.name) return perm.name;
                return "";
              })
              .filter(Boolean),
          );
        }
      });
    }

    // Remove duplicates
    return [...new Set(permissions)];
  }

  /**
   * Get user roles from user object
   */
  private getUserRoles(user: any): string[] {
    if (!user) return [];

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
   * Normalize permission name
   */
  private normalizePermission(permission: string): string {
    return permission.toLowerCase().trim();
  }

  /**
   * Match wildcard permission pattern
   */
  private matchWildcardPermission(
    pattern: string,
    userPermissions: string[],
  ): boolean {
    const normalizedPattern = this.normalizePermission(pattern);
    const [patternResource, patternAction] = normalizedPattern.split(":");

    return userPermissions.some((userPerm) => {
      const normalizedPerm = this.normalizePermission(userPerm);
      const [permResource, permAction] = normalizedPerm.split(":");

      // Check for exact match
      if (normalizedPerm === normalizedPattern) return true;

      // Check for wildcard matches
      if (patternResource === "*" && patternAction === permAction) return true;
      if (patternResource === permResource && patternAction === "*")
        return true;
      if (patternResource === "*" && patternAction === "*") return true;
      if (permResource === "*" && permAction === "*") return true;

      return false;
    });
  }

  /**
   * Check if user has permission (helper)
   */
  public hasPermission(user: any, permission: string): boolean {
    const userPermissions = this.getUserPermissions(user);
    return userPermissions.some(
      (userPerm) =>
        this.normalizePermission(userPerm) ===
        this.normalizePermission(permission),
    );
  }

  /**
   * Check if user has any of the permissions (helper)
   */
  public hasAnyPermission(user: any, permissions: string[]): boolean {
    const userPermissions = this.getUserPermissions(user);
    return permissions.some((permission) =>
      userPermissions.some(
        (userPerm) =>
          this.normalizePermission(userPerm) ===
          this.normalizePermission(permission),
      ),
    );
  }

  /**
   * Check if user has all permissions (helper)
   */
  public hasAllPermissions(user: any, permissions: string[]): boolean {
    const userPermissions = this.getUserPermissions(user);
    return permissions.every((permission) =>
      userPermissions.some(
        (userPerm) =>
          this.normalizePermission(userPerm) ===
          this.normalizePermission(permission),
      ),
    );
  }
}

// Export singleton instance
const permissionMiddleware = PermissionMiddleware.getInstance();

export default permissionMiddleware;

// Export individual middleware functions
export const requirePermission = permissionMiddleware.requirePermission;
export const requireAllPermissions = permissionMiddleware.requireAllPermissions;
export const requireResourcePermission =
  permissionMiddleware.requireResourcePermission;
export const requireCreate = permissionMiddleware.requireCreate;
export const requireRead = permissionMiddleware.requireRead;
export const requireUpdate = permissionMiddleware.requireUpdate;
export const requireDelete = permissionMiddleware.requireDelete;
export const requireManage = permissionMiddleware.requireManage;
export const canAccessResource = permissionMiddleware.canAccessResource;
export const requireWildcardPermission =
  permissionMiddleware.requireWildcardPermission;
export const requireAdminPermission =
  permissionMiddleware.requireAdminPermission;
export const requireRoleAndPermission =
  permissionMiddleware.requireRoleAndPermission;
export const requireMethodPermission =
  permissionMiddleware.requireMethodPermission;

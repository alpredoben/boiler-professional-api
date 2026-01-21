import { Request } from "express";
import { SelectQueryBuilder, ObjectLiteral } from "typeorm";
import environment from "../../config/environment";
import { In_PaginationParams } from "src/interfaces/util.interface";

export interface PaginationResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

class PaginationUtil {
  private static instance: PaginationUtil;

  private constructor() {}

  public static getInstance(): PaginationUtil {
    if (!PaginationUtil.instance) {
      PaginationUtil.instance = new PaginationUtil();
    }
    return PaginationUtil.instance;
  }

  /**
   * Extract pagination parameters from request
   */
  public extractParams(req: Request): In_PaginationParams {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(
      parseInt(req.query.limit as string) || environment.defaultPageSize,
      environment.maxPageSize,
    );

    // Parse sort parameter (e.g., "createdAt:desc" or "name:asc")
    let sort: string | undefined;
    let order: "ASC" | "DESC" = "DESC";

    if (req.query.sort) {
      const sortParts = (req.query.sort as string).split(":");
      sort = sortParts[0];
      order = (sortParts[1]?.toUpperCase() as "ASC" | "DESC") || "DESC";
    }

    const search = req.query.search as string;

    // Extract additional filters
    const filters: Record<string, any> = {};
    Object.keys(req.query).forEach((key) => {
      if (!["page", "limit", "sort", "search"].includes(key)) {
        filters[key] = req.query[key];
      }
    });

    return {
      page: Math.max(1, page),
      limit: Math.max(1, limit),
      sort,
      order,
      search,
      filters,
    };
  }

  /**
   * Apply pagination to TypeORM query builder
   */
  public applyPagination<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    params: In_PaginationParams,
  ): SelectQueryBuilder<T> {
    const { page, limit, sort, order } = params;

    // Calculate offset
    const offset = (page - 1) * limit;

    // Apply pagination
    queryBuilder.skip(offset).take(limit);

    // Apply sorting
    if (sort) {
      queryBuilder.orderBy(`${queryBuilder.alias}.${sort}`, order);
    } else {
      // Default sort by createdAt
      queryBuilder.orderBy(`${queryBuilder.alias}.createdAt`, "DESC");
    }

    return queryBuilder;
  }

  /**
   * Apply search to TypeORM query builder
   */
  public applySearch<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    searchFields: string[],
    searchTerm?: string,
  ): SelectQueryBuilder<T> {
    if (!searchTerm || searchFields.length === 0) {
      return queryBuilder;
    }

    const conditions = searchFields
      .map((field) => `${queryBuilder.alias}.${field} ILIKE :searchTerm`)
      .join(" OR ");

    queryBuilder.andWhere(`(${conditions})`, {
      searchTerm: `%${searchTerm}%`,
    });

    return queryBuilder;
  }

  /**
   * Apply filters to TypeORM query builder
   */
  public applyFilters<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    filters: Record<string, any>,
  ): SelectQueryBuilder<T> {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        // Handle array values (IN clause)
        if (Array.isArray(value)) {
          queryBuilder.andWhere(
            `${queryBuilder.alias}.${key} IN (:...${key})`,
            {
              [key]: value,
            },
          );
        }
        // Handle boolean values
        else if (typeof value === "boolean") {
          queryBuilder.andWhere(`${queryBuilder.alias}.${key} = :${key}`, {
            [key]: value,
          });
        }
        // Handle range queries (e.g., minPrice, maxPrice)
        else if (key.startsWith("min")) {
          const field = key.replace("min", "").toLowerCase();
          queryBuilder.andWhere(`${queryBuilder.alias}.${field} >= :${key}`, {
            [key]: value,
          });
        } else if (key.startsWith("max")) {
          const field = key.replace("max", "").toLowerCase();
          queryBuilder.andWhere(`${queryBuilder.alias}.${field} <= :${key}`, {
            [key]: value,
          });
        }
        // Handle date range
        else if (key === "startDate") {
          queryBuilder.andWhere(
            `${queryBuilder.alias}.createdAt >= :startDate`,
            {
              startDate: value,
            },
          );
        } else if (key === "endDate") {
          queryBuilder.andWhere(`${queryBuilder.alias}.createdAt <= :endDate`, {
            endDate: value,
          });
        }
        // Handle exact match
        else {
          queryBuilder.andWhere(`${queryBuilder.alias}.${key} = :${key}`, {
            [key]: value,
          });
        }
      }
    });

    return queryBuilder;
  }

  /**
   * Execute paginated query
   */
  public async paginate<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    params: In_PaginationParams,
  ): Promise<PaginationResult<T>> {
    const { page, limit } = params;

    // Get total count
    const total = await queryBuilder.getCount();

    // Apply pagination, sorting, etc.
    this.applyPagination(queryBuilder, params);

    // Get data
    const data = await queryBuilder.getMany();

    // Calculate meta
    const totalPages = Math.ceil(total / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage,
        hasPreviousPage,
      },
    };
  }

  /**
   * Execute paginated query with search and filters
   */
  public async paginateWithFilters<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    params: In_PaginationParams,
    searchFields: string[] = [],
  ): Promise<PaginationResult<T>> {
    // Apply search
    if (params.search && searchFields.length > 0) {
      this.applySearch(queryBuilder, searchFields, params.search);
    }

    // Apply filters
    if (params.filters && Object.keys(params.filters).length > 0) {
      this.applyFilters(queryBuilder, params.filters);
    }

    // Paginate
    return this.paginate(queryBuilder, params);
  }

  /**
   * Create pagination metadata
   */
  public createMeta(
    page: number,
    limit: number,
    total: number,
  ): PaginationResult<any>["meta"] {
    const totalPages = Math.ceil(total / limit);

    return {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  /**
   * Get offset from page and limit
   */
  public getOffset(page: number, limit: number): number {
    return (Math.max(1, page) - 1) * limit;
  }

  /**
   * Calculate total pages
   */
  public calculateTotalPages(total: number, limit: number): number {
    return Math.ceil(total / limit);
  }

  /**
   * Validate pagination parameters
   */
  public validateParams(params: In_PaginationParams): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (params.page < 1) {
      errors.push("Page must be greater than 0");
    }

    if (params.limit < 1) {
      errors.push("Limit must be greater than 0");
    }

    if (params.limit > environment.maxPageSize) {
      errors.push(`Limit cannot exceed ${environment.maxPageSize}`);
    }

    if (params.order && !["ASC", "DESC"].includes(params.order)) {
      errors.push("Order must be ASC or DESC");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate pagination links
   */
  public generateLinks(
    baseUrl: string,
    page: number,
    limit: number,
    total: number,
  ): {
    first: string;
    last: string;
    next?: string;
    prev?: string;
  } {
    const totalPages = this.calculateTotalPages(total, limit);

    const links = {
      first: `${baseUrl}?page=1&limit=${limit}`,
      last: `${baseUrl}?page=${totalPages}&limit=${limit}`,
      next: undefined as string | undefined,
      prev: undefined as string | undefined,
    };

    if (page < totalPages) {
      links.next = `${baseUrl}?page=${page + 1}&limit=${limit}`;
    }

    if (page > 1) {
      links.prev = `${baseUrl}?page=${page - 1}&limit=${limit}`;
    }

    return links;
  }

  /**
   * Create empty pagination result
   */
  public createEmpty<T>(
    page: number = 1,
    limit: number = 10,
  ): PaginationResult<T> {
    return {
      data: [],
      meta: {
        page,
        limit,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
      },
    };
  }

  /**
   * Transform array to paginated result
   */
  public paginateArray<T>(
    array: T[],
    page: number,
    limit: number,
  ): PaginationResult<T> {
    const total = array.length;
    const offset = this.getOffset(page, limit);
    const data = array.slice(offset, offset + limit);

    return {
      data,
      meta: this.createMeta(page, limit, total),
    };
  }
}

// Export singleton instance
export default PaginationUtil.getInstance();

import type { PaginationMeta } from '@smart-light/shared';

export interface PageQuery {
  page: number;
  pageSize: number;
}

export function toSkipTake(query: PageQuery): { skip: number; take: number } {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export function paginationMeta(query: PageQuery, totalItems: number): PaginationMeta {
  return {
    page: query.page,
    pageSize: query.pageSize,
    totalItems,
    totalPages: Math.max(1, Math.ceil(totalItems / query.pageSize)),
  };
}

/**
 * Query Cache for embedding vectors
 *
 * This class implements an LRU (Least Recently Used) cache for query embeddings.
 * It prevents redundant embedding generation for frequently used queries.
 */

import { LRUCache } from 'lru-cache';
import { Logger } from '../utils/logger';

export interface QueryCacheOptions {
  maxSize?: number;
  ttl?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  size: number;
  maxSize: number;
}

export class QueryCache {
  private cache: LRUCache<string, number[]>;
  private logger = new Logger({});
  private hits = 0;
  private misses = 0;

  constructor(options: QueryCacheOptions = {}) {
    const maxSize = options.maxSize || 1000;
    const ttl = options.ttl || 1000 * 60 * 60; // Default: 1 hour

    this.cache = new LRUCache<string, number[]>({
      max: maxSize,
      ttl,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });

    this.logger.info(`Query cache initialized (maxSize: ${maxSize}, ttl: ${ttl}ms)`);
  }

  /**
   * Get an embedding from the cache.
   * Returns undefined if the key is not found.
   */
  get(query: string): number[] | undefined {
    const cacheKey = this.normalizeQuery(query);
    const value = this.cache.get(cacheKey);

    if (value !== undefined) {
      this.hits++;
      this.logger.debug(`Cache HIT for query: ${this.truncateQuery(query)}`);
      return value;
    } else {
      this.misses++;
      this.logger.debug(`Cache MISS for query: ${this.truncateQuery(query)}`);
      return undefined;
    }
  }

  /**
   * Store an embedding in the cache.
   */
  set(query: string, embedding: number[]): void {
    const cacheKey = this.normalizeQuery(query);
    this.cache.set(cacheKey, embedding);
    this.logger.debug(`Cached embedding for query: ${this.truncateQuery(query)}`);
  }

  /**
   * Check if a query exists in the cache.
   */
  has(query: string): boolean {
    const cacheKey = this.normalizeQuery(query);
    return this.cache.has(cacheKey);
  }

  /**
   * Clear all entries from the cache.
   */
  clear(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.logger.info('Query cache cleared');
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;
    const hitRate = totalRequests > 0 ? this.hits / totalRequests : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate,
      size: this.cache.size,
      maxSize: this.cache.max,
    };
  }

  /**
   * Normalize a query string for cache key generation.
   * This ensures that queries with minor differences (whitespace, case)
   * are treated as the same.
   */
  private normalizeQuery(query: string): string {
    return query.trim().toLowerCase();
  }

  /**
   * Truncate a query string for logging purposes.
   */
  private truncateQuery(query: string, maxLength = 50): string {
    if (query.length <= maxLength) {
      return query;
    }
    return `${query.substring(0, maxLength)}...`;
  }

  /**
   * Reset cache statistics without clearing the cache.
   */
  resetStats(): void {
    this.hits = 0;
    this.misses = 0;
    this.logger.debug('Cache statistics reset');
  }
}

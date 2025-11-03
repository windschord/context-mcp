/**
 * Parser Pool for Tree-sitter parsers
 *
 * This class manages a pool of Tree-sitter Parser instances to minimize
 * initialization overhead. Instead of creating a new parser for each file,
 * parsers are reused from the pool.
 */

import Parser from 'tree-sitter';
import { Language } from './types';
import { LanguageRegistry } from './language-registry';
import { Logger } from '../utils/logger';

export interface ParserPoolOptions {
  maxPoolSize?: number;
}

export class ParserPool {
  private pools: Map<Language, Parser[]> = new Map();
  private maxPoolSize: number;
  private logger = new Logger('ParserPool');
  private languageRegistry: LanguageRegistry;

  constructor(options: ParserPoolOptions = {}) {
    this.maxPoolSize = options.maxPoolSize || 4;
    this.languageRegistry = LanguageRegistry.getInstance();
  }

  /**
   * Acquire a parser for the specified language from the pool.
   * If no parser is available, a new one is created.
   */
  acquire(language: Language): Parser {
    const pool = this.pools.get(language);

    if (pool && pool.length > 0) {
      const parser = pool.pop()!;
      this.logger.debug(`Reused parser for language: ${language}`);
      return parser;
    }

    // Create a new parser if none available in the pool
    const parser = this.createParser(language);
    this.logger.debug(`Created new parser for language: ${language}`);
    return parser;
  }

  /**
   * Release a parser back to the pool for reuse.
   * If the pool is full, the parser is disposed.
   */
  release(language: Language, parser: Parser): void {
    const pool = this.pools.get(language) || [];

    if (pool.length < this.maxPoolSize) {
      pool.push(parser);
      this.pools.set(language, pool);
      this.logger.debug(`Released parser back to pool for language: ${language}`);
    } else {
      // Pool is full, dispose the parser to prevent memory leak
      try {
        parser.delete();
        this.logger.debug(`Disposed parser (pool full) for language: ${language}`);
      } catch (error) {
        this.logger.warn(`Failed to dispose parser for language: ${language}`, error);
      }
    }
  }

  /**
   * Execute a function with a parser from the pool.
   * The parser is automatically released back to the pool after execution.
   */
  async withParser<T>(
    language: Language,
    fn: (parser: Parser) => T | Promise<T>
  ): Promise<T> {
    const parser = this.acquire(language);
    try {
      return await fn(parser);
    } finally {
      this.release(language, parser);
    }
  }

  /**
   * Create a new parser instance for the specified language.
   */
  private createParser(language: Language): Parser {
    const parser = new Parser();
    const treeSitterLanguage = this.languageRegistry.getLanguageForParser(language);
    parser.setLanguage(treeSitterLanguage);
    return parser;
  }

  /**
   * Clear all parsers from the pool and dispose them.
   */
  clear(): void {
    for (const [language, pool] of this.pools.entries()) {
      for (const parser of pool) {
        try {
          parser.delete();
        } catch (error) {
          this.logger.warn(`Failed to dispose parser for language: ${language}`, error);
        }
      }
    }
    this.pools.clear();
    this.logger.info('Parser pool cleared');
  }

  /**
   * Get statistics about the parser pool.
   */
  getStats(): Record<Language, number> {
    const stats: Record<string, number> = {};
    for (const [language, pool] of this.pools.entries()) {
      stats[language] = pool.length;
    }
    return stats;
  }
}

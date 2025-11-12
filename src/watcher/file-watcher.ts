/**
 * File Watcher Implementation
 */

import { EventEmitter } from 'events';
import chokidar, { FSWatcher } from 'chokidar';
import { FileWatcherEvent, FileWatcherOptions, IFileWatcher } from './types';
import { logger } from '../utils/logger';

/**
 * Default ignore patterns
 */
const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/**',
  '.git/**',
  'dist/**',
  'build/**',
  '.lsp-mcp/**',
  '**/*.log',
];

/**
 * Default debounce time in milliseconds
 */
const DEFAULT_DEBOUNCE_MS = 500;

/**
 * File Watcher
 * Watches file system for changes and emits events
 */
export class FileWatcher extends EventEmitter implements IFileWatcher {
  private options: Required<FileWatcherOptions>;
  private watcher: FSWatcher | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private watching = false;

  constructor(options: FileWatcherOptions) {
    super();

    // Validate root path
    if (!options.rootPath || options.rootPath.trim() === '') {
      throw new Error('Root path is required');
    }

    // Set default options
    this.options = {
      rootPath: options.rootPath,
      ignorePatterns: options.ignorePatterns || DEFAULT_IGNORE_PATTERNS,
      debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
      watchAdd: options.watchAdd ?? true,
      watchChange: options.watchChange ?? true,
      watchUnlink: options.watchUnlink ?? true,
      ignoreInitial: options.ignoreInitial ?? true,
    };

    logger.debug('FileWatcher created', {
      rootPath: this.options.rootPath,
      ignorePatterns: this.options.ignorePatterns,
      debounceMs: this.options.debounceMs,
    });
  }

  /**
   * Start watching
   */
  async start(): Promise<void> {
    if (this.watching) {
      logger.warn('FileWatcher is already watching');
      return;
    }

    logger.info('Starting FileWatcher', { rootPath: this.options.rootPath });

    try {
      // Create chokidar watcher
      this.watcher = chokidar.watch(this.options.rootPath, {
        ignored: this.options.ignorePatterns,
        persistent: true,
        ignoreInitial: this.options.ignoreInitial,
        awaitWriteFinish: {
          stabilityThreshold: 100,
          pollInterval: 100,
        },
      });

      // Set up event handlers
      if (this.options.watchAdd) {
        this.watcher.on('add', (path: string) => {
          this.handleFileEvent(FileWatcherEvent.FILE_ADDED, path);
        });
      }

      if (this.options.watchChange) {
        this.watcher.on('change', (path: string) => {
          this.handleFileEvent(FileWatcherEvent.FILE_CHANGED, path);
        });
      }

      if (this.options.watchUnlink) {
        this.watcher.on('unlink', (path: string) => {
          this.handleFileEvent(FileWatcherEvent.FILE_DELETED, path);
        });
      }

      // Error handler
      this.watcher.on('error', (error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error('FileWatcher error', { error: err.message });
        this.emit(FileWatcherEvent.ERROR, err);
      });

      // Ready handler
      this.watcher.on('ready', () => {
        this.watching = true;
        logger.info('FileWatcher ready');
        this.emit(FileWatcherEvent.READY);
      });

      // Wait for ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('FileWatcher timeout'));
        }, 10000);

        this.watcher!.once('ready', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.watcher!.once('error', (err: unknown) => {
          clearTimeout(timeout);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
      });
    } catch (error) {
      logger.error('Failed to start FileWatcher', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (!this.watching) {
      logger.debug('FileWatcher is not watching');
      return;
    }

    logger.info('Stopping FileWatcher');

    try {
      // Clear all debounce timers
      for (const timer of this.debounceTimers.values()) {
        clearTimeout(timer);
      }
      this.debounceTimers.clear();

      // Close watcher
      if (this.watcher) {
        await this.watcher.close();
        this.watcher = null;
      }

      this.watching = false;
      logger.info('FileWatcher stopped');
    } catch (error) {
      logger.error('Failed to stop FileWatcher', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if watcher is running
   */
  isWatching(): boolean {
    return this.watching;
  }

  /**
   * Handle file event with debouncing
   */
  private handleFileEvent(event: FileWatcherEvent, filePath: string): void {
    const eventKey = `${event}:${filePath}`;

    // Clear existing timer for this event
    const existingTimer = this.debounceTimers.get(eventKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.debounceTimers.delete(eventKey);
      logger.debug('File event', { event, filePath });
      this.emit(event, filePath);
    }, this.options.debounceMs);

    this.debounceTimers.set(eventKey, timer);
  }

  /**
   * Register event listener
   */
  override on(event: FileWatcherEvent, listener: (...args: any[]) => void): this {
    super.on(event, listener);
    return this;
  }

  /**
   * Remove event listener
   */
  override off(event: FileWatcherEvent, listener: (...args: any[]) => void): this {
    super.off(event, listener);
    return this;
  }

  /**
   * Register one-time event listener
   */
  override once(event: FileWatcherEvent, listener: (...args: any[]) => void): this {
    super.once(event, listener);
    return this;
  }
}

/**
 * File Watcher Types
 */

/**
 * File watcher event types
 */
export enum FileWatcherEvent {
  FILE_ADDED = 'file:added',
  FILE_CHANGED = 'file:changed',
  FILE_DELETED = 'file:deleted',
  READY = 'ready',
  ERROR = 'error',
}

/**
 * File watcher configuration options
 */
export interface FileWatcherOptions {
  /**
   * Root path to watch
   */
  rootPath: string;

  /**
   * Glob patterns to ignore
   * @default ['node_modules/**', '.git/**', 'dist/**', 'build/**']
   */
  ignorePatterns?: string[];

  /**
   * Debounce time in milliseconds
   * @default 500
   */
  debounceMs?: number;

  /**
   * Watch for file additions
   * @default true
   */
  watchAdd?: boolean;

  /**
   * Watch for file changes
   * @default true
   */
  watchChange?: boolean;

  /**
   * Watch for file deletions
   * @default true
   */
  watchUnlink?: boolean;

  /**
   * Ignore initial add events
   * @default true
   */
  ignoreInitial?: boolean;
}

/**
 * File watcher event listeners
 */
export interface FileWatcherEventListeners {
  [FileWatcherEvent.FILE_ADDED]?: (filePath: string) => void;
  [FileWatcherEvent.FILE_CHANGED]?: (filePath: string) => void;
  [FileWatcherEvent.FILE_DELETED]?: (filePath: string) => void;
  [FileWatcherEvent.READY]?: () => void;
  [FileWatcherEvent.ERROR]?: (error: Error) => void;
}

/**
 * File watcher interface
 */
export interface IFileWatcher {
  /**
   * Start watching
   */
  start(): Promise<void>;

  /**
   * Stop watching
   */
  stop(): Promise<void>;

  /**
   * Check if watcher is running
   */
  isWatching(): boolean;

  /**
   * Register event listener
   */
  on(event: FileWatcherEvent, listener: (...args: any[]) => void): this;

  /**
   * Remove event listener
   */
  off(event: FileWatcherEvent, listener: (...args: any[]) => void): this;

  /**
   * Register one-time event listener
   */
  once(event: FileWatcherEvent, listener: (...args: any[]) => void): this;
}

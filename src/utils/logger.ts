/**
 * Logger Utility
 * MCPサーバー用のロギングユーティリティ
 * stdoutはMCP通信用に予約されているため、ログはstderrに出力
 */

import * as fs from 'fs';
import * as path from 'path';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface LogData {
  level: string;
  message: string;
  timestamp: string;
  data?: unknown;
}

interface LoggerOptions {
  level?: LogLevel;
  logToFile?: boolean;
  logDir?: string;
  maxFileSize?: number; // bytes
  maxFiles?: number;
}

/**
 * センシティブなキーのリスト
 */
const SENSITIVE_KEYS = [
  'apiKey',
  'api_key',
  'token',
  'password',
  'secret',
  'credentials',
  'authorization',
];

/**
 * ロガークラス
 */
export class Logger {
  private level: LogLevel;
  private logToFile: boolean;
  private logDir: string;
  private maxFileSize: number;
  private maxFiles: number;
  private currentLogFile: string | null = null;
  private currentFileSize: number = 0;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? LogLevel.INFO;
    this.logToFile = options.logToFile ?? false;
    this.logDir = options.logDir ?? path.join(process.cwd(), '.context-mcp', 'logs');
    this.maxFileSize = options.maxFileSize ?? 10 * 1024 * 1024; // 10MB
    this.maxFiles = options.maxFiles ?? 5;

    if (this.logToFile) {
      this.initializeLogFile();
    }
  }

  /**
   * ログレベルを設定
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * デバッグログ
   */
  debug(message: string, data?: unknown): void {
    if (this.level <= LogLevel.DEBUG) {
      this.log('DEBUG', message, data);
    }
  }

  /**
   * 情報ログ
   */
  info(message: string, data?: unknown): void {
    if (this.level <= LogLevel.INFO) {
      this.log('INFO', message, data);
    }
  }

  /**
   * 警告ログ
   */
  warn(message: string, data?: unknown): void {
    if (this.level <= LogLevel.WARN) {
      this.log('WARN', message, data);
    }
  }

  /**
   * エラーログ
   */
  error(message: string, data?: unknown): void {
    if (this.level <= LogLevel.ERROR) {
      this.log('ERROR', message, data);
    }
  }

  /**
   * ログファイルを初期化
   */
  private initializeLogFile(): void {
    try {
      // ログディレクトリを作成
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      // 現在のログファイル名を生成
      const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
      this.currentLogFile = path.join(this.logDir, `context-mcp-${timestamp}.log`);
      this.currentFileSize = 0;

      // 古いログファイルをクリーンアップ
      this.cleanupOldLogFiles();
    } catch (error) {
      // ログファイル初期化エラーは無視（stderrにのみ出力）
      process.stderr.write(
        JSON.stringify({
          level: 'ERROR',
          message: 'Failed to initialize log file',
          timestamp: new Date().toISOString(),
          data: error,
        }) + '\n'
      );
    }
  }

  /**
   * 古いログファイルをクリーンアップ
   */
  private cleanupOldLogFiles(): void {
    try {
      const files = fs.readdirSync(this.logDir);
      const logFiles = files
        .filter((f) => f.startsWith('context-mcp-') && f.endsWith('.log'))
        .map((f) => ({
          name: f,
          path: path.join(this.logDir, f),
          mtime: fs.statSync(path.join(this.logDir, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.mtime - a.mtime); // 新しい順にソート

      // maxFilesを超えるファイルを削除
      if (logFiles.length > this.maxFiles) {
        logFiles.slice(this.maxFiles).forEach((file) => {
          fs.unlinkSync(file.path);
        });
      }
    } catch (error) {
      // クリーンアップエラーは無視
    }
  }

  /**
   * ログローテーションを実行
   */
  private rotateLogFile(): void {
    this.currentLogFile = null;
    this.currentFileSize = 0;
    this.initializeLogFile();
  }

  /**
   * ログを出力
   */
  private log(level: string, message: string, data?: unknown): void {
    const logData: LogData = {
      level,
      message,
      timestamp: new Date().toISOString(),
    };

    // データがある場合は追加（センシティブデータはサニタイズ）
    if (data !== undefined) {
      logData.data = this.sanitizeData(data);
    }

    const logLine = JSON.stringify(logData) + '\n';

    // JSON形式でstderrに出力
    process.stderr.write(logLine);

    // ファイルにも出力（有効な場合）
    if (this.logToFile && this.currentLogFile) {
      try {
        fs.appendFileSync(this.currentLogFile, logLine);
        this.currentFileSize += Buffer.byteLength(logLine);

        // ファイルサイズが上限を超えたらローテーション
        if (this.currentFileSize >= this.maxFileSize) {
          this.rotateLogFile();
        }
      } catch (error) {
        // ファイル書き込みエラーは無視（stderrには出力済み）
      }
    }
  }

  /**
   * センシティブデータをサニタイズ
   */
  private sanitizeData(data: unknown): unknown {
    if (data === null || data === undefined) {
      return data;
    }

    // Errorオブジェクトの場合
    if (data instanceof Error) {
      return {
        name: data.name,
        message: data.message,
        stack: data.stack,
      };
    }

    // オブジェクトの場合
    if (typeof data === 'object' && !Array.isArray(data)) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        // センシティブなキーは隠す
        if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))) {
          sanitized[key] = '***';
        } else if (typeof value === 'object') {
          // 再帰的にサニタイズ
          sanitized[key] = this.sanitizeData(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }

    // 配列の場合
    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeData(item));
    }

    // プリミティブ値はそのまま返す
    return data;
  }
}

/**
 * グローバルロガーインスタンス
 */
export const logger = new Logger({
  level: LogLevel.INFO,
  logToFile: false,
});

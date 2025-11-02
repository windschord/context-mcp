/**
 * Logger Utility
 * MCPサーバー用のロギングユーティリティ
 * stdoutはMCP通信用に予約されているため、ログはstderrに出力
 */

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

  constructor(level: LogLevel = LogLevel.INFO) {
    this.level = level;
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

    // JSON形式でstderrに出力
    process.stderr.write(JSON.stringify(logData) + '\n');
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
        if (SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k))) {
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
export const logger = new Logger();

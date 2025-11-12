/**
 * テレメトリロガー
 * OpenTelemetry Logs APIを使用したログエクスポート
 */

import { logs, SeverityNumber, Logger as OTelLogger, LogAttributes } from '@opentelemetry/api-logs';

/**
 * ログレベルの定義
 */
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

/**
 * ログコンテキスト
 */
export interface LogContext {
  tool?: string;
  file?: string;
  operation?: string;
  duration?: number;
  [key: string]: unknown;
}

/**
 * ログレベルをSeverityNumberに変換
 */
function severityFromLevel(level: LogLevel): SeverityNumber {
  switch (level) {
    case 'error':
      return SeverityNumber.ERROR;
    case 'warn':
      return SeverityNumber.WARN;
    case 'info':
      return SeverityNumber.INFO;
    case 'debug':
      return SeverityNumber.DEBUG;
  }
}

/**
 * テレメトリロガークラス
 * Console出力とOTLPエクスポートの両方をサポート
 */
export class TelemetryLogger {
  private otelLogger: OTelLogger;
  private telemetryEnabled: boolean;

  constructor(telemetryEnabled: boolean = false, loggerName: string = 'context-mcp') {
    this.telemetryEnabled = telemetryEnabled;
    this.otelLogger = logs.getLogger(loggerName, '0.1.0');
  }

  /**
   * エラーログ
   */
  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  /**
   * 警告ログ
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  /**
   * 情報ログ
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * デバッグログ
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * ログを出力
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    // 1. Console出力（常に実行）
    this.logToConsole(level, message, context);

    // 2. OTLP出力（テレメトリ有効時のみ）
    if (this.telemetryEnabled) {
      this.logToOTLP(level, message, context);
    }
  }

  /**
   * コンソールにログを出力
   */
  private logToConsole(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const logData = {
      timestamp,
      level,
      message,
      ...(context && { context }),
    };

    const logLine = JSON.stringify(logData);

    // Console出力（stderr）
    switch (level) {
      case 'error':
        console.error(logLine);
        break;
      case 'warn':
        console.warn(logLine);
        break;
      case 'info':
        console.info(logLine);
        break;
      case 'debug':
        console.debug(logLine);
        break;
    }
  }

  /**
   * OTLPにログを出力
   */
  private logToOTLP(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = Date.now();
    const severityNumber = severityFromLevel(level);

    // ログ属性の構築
    const attributes: LogAttributes = {
      'log.severity': level,
      'log.message': message,
    };

    // コンテキスト情報を属性に追加
    if (context) {
      // エラーオブジェクトの特別扱い
      if (context.error instanceof Error) {
        attributes['error.type'] = context.error.name;
        attributes['error.message'] = context.error.message;
        if (context.error.stack) {
          attributes['error.stack'] = context.error.stack;
        }
      }

      // その他のコンテキスト情報
      for (const [key, value] of Object.entries(context)) {
        if (key === 'error') {
          // errorは上で処理済み
          continue;
        }
        // 複雑なオブジェクトはJSON文字列化
        if (typeof value === 'object' && value !== null) {
          attributes[key] = JSON.stringify(value);
        } else if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          attributes[key] = value;
        }
      }
    }

    // OpenTelemetry Logs APIでログ記録
    this.otelLogger.emit({
      severityNumber,
      severityText: level.toUpperCase(),
      body: message,
      attributes,
      timestamp,
    });
  }

  /**
   * テレメトリ有効状態を更新
   */
  setTelemetryEnabled(enabled: boolean): void {
    this.telemetryEnabled = enabled;
  }
}

/**
 * グローバルテレメトリロガーインスタンス
 * デフォルトはテレメトリ無効
 */
export const telemetryLogger = new TelemetryLogger(false);

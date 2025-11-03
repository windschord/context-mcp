/**
 * MCP Error Classes
 * MCPプロトコルに準拠したエラークラス群
 */

/**
 * MCPエラーの基底クラス
 */
export class MCPError extends Error {
  public code: number;
  public data?: unknown;
  public suggestion?: string;

  constructor(code: number, message: string, data?: unknown, suggestion?: string) {
    super(message);
    this.name = 'MCPError';
    this.code = code;
    this.data = data;
    this.suggestion = suggestion;
    Object.setPrototypeOf(this, MCPError.prototype);
  }

  /**
   * JSON-RPC 2.0エラーオブジェクト形式に変換
   */
  toJSON(): { code: number; message: string; data?: unknown; suggestion?: string } {
    const result: { code: number; message: string; data?: unknown; suggestion?: string } = {
      code: this.code,
      message: this.message,
    };

    if (this.data !== undefined) {
      result.data = this.data;
    }

    if (this.suggestion !== undefined) {
      result.suggestion = this.suggestion;
    }

    return result;
  }
}

/**
 * Invalid Params Error (JSON-RPC -32602)
 * パラメータが無効な場合のエラー
 */
export class InvalidParamsError extends MCPError {
  constructor(message: string, data?: unknown, suggestion?: string) {
    super(-32602, message, data, suggestion);
    this.name = 'InvalidParamsError';
    Object.setPrototypeOf(this, InvalidParamsError.prototype);
  }
}

/**
 * Internal Error (JSON-RPC -32603)
 * 内部エラー
 */
export class InternalError extends MCPError {
  constructor(message: string, data?: unknown, suggestion?: string) {
    super(-32603, message, data, suggestion);
    this.name = 'InternalError';
    Object.setPrototypeOf(this, InternalError.prototype);
  }
}

/**
 * Method Not Found Error (JSON-RPC -32601)
 * メソッドが見つからない場合のエラー
 */
export class MethodNotFoundError extends MCPError {
  constructor(method: string) {
    super(-32601, `Method not found: ${method}`);
    this.name = 'MethodNotFoundError';
    Object.setPrototypeOf(this, MethodNotFoundError.prototype);
  }
}

/**
 * Not Found Error (カスタムエラー -32001)
 * リソースが見つからない場合のエラー
 */
export class NotFoundError extends MCPError {
  constructor(message: string, data?: unknown, suggestion?: string) {
    super(-32001, message, data, suggestion);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Config Validation Error (カスタムエラー -32002)
 * 設定ファイルのバリデーションエラー
 */
export class ConfigValidationError extends MCPError {
  constructor(message: string, data?: unknown, suggestion?: string) {
    super(-32002, message, data, suggestion);
    this.name = 'ConfigValidationError';
    Object.setPrototypeOf(this, ConfigValidationError.prototype);
  }
}

/**
 * 任意のエラーをMCPErrorに変換
 */
export function toMCPError(error: unknown): MCPError {
  // 既にMCPErrorの場合はそのまま返す
  if (error instanceof MCPError) {
    return error;
  }

  // Errorオブジェクトの場合
  if (error instanceof Error) {
    return new InternalError(error.message, {
      stack: error.stack,
    });
  }

  // 文字列の場合
  if (typeof error === 'string') {
    return new InternalError(error);
  }

  // その他の場合
  return new InternalError('Unknown error', {
    originalError: error,
  });
}

/**
 * テレメトリロガーのテスト
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { TelemetryLogger } from '../../src/telemetry/logger.js';

describe('TelemetryLogger', () => {
  let logger: TelemetryLogger;

  beforeEach(() => {
    // テレメトリ無効でロガー作成
    logger = new TelemetryLogger(false, 'test-logger');
  });

  describe('エラーログ', () => {
    it('エラーメッセージを出力できる', () => {
      expect(() => {
        logger.error('Test error message');
      }).not.toThrow();
    });

    it('コンテキスト付きエラーログを出力できる', () => {
      expect(() => {
        logger.error('Failed to parse file', {
          file: '/path/to/file.ts',
          tool: 'index_project',
        });
      }).not.toThrow();
    });

    it('エラーオブジェクト付きログを出力できる', () => {
      const error = new Error('Test error');
      expect(() => {
        logger.error('Operation failed', {
          error,
          operation: 'test-operation',
        });
      }).not.toThrow();
    });
  });

  describe('警告ログ', () => {
    it('警告メッセージを出力できる', () => {
      expect(() => {
        logger.warn('Test warning message');
      }).not.toThrow();
    });

    it('コンテキスト付き警告ログを出力できる', () => {
      expect(() => {
        logger.warn('Parser fallback to default', {
          language: 'typescript',
        });
      }).not.toThrow();
    });
  });

  describe('情報ログ', () => {
    it('情報メッセージを出力できる', () => {
      expect(() => {
        logger.info('Test info message');
      }).not.toThrow();
    });

    it('コンテキスト付き情報ログを出力できる', () => {
      expect(() => {
        logger.info('Indexing completed', {
          files: 1234,
          duration: 12345,
        });
      }).not.toThrow();
    });
  });

  describe('デバッグログ', () => {
    it('デバッグメッセージを出力できる', () => {
      expect(() => {
        logger.debug('Test debug message');
      }).not.toThrow();
    });

    it('コンテキスト付きデバッグログを出力できる', () => {
      expect(() => {
        logger.debug('Vector search query', {
          query: 'test',
          topK: 20,
        });
      }).not.toThrow();
    });
  });

  describe('テレメトリ設定', () => {
    it('テレメトリ有効状態を変更できる', () => {
      expect(() => {
        logger.setTelemetryEnabled(true);
        logger.info('Test with telemetry enabled');
        logger.setTelemetryEnabled(false);
        logger.info('Test with telemetry disabled');
      }).not.toThrow();
    });
  });

  describe('複雑なコンテキスト', () => {
    it('ネストされたオブジェクトを含むコンテキストを処理できる', () => {
      expect(() => {
        logger.info('Complex context test', {
          tool: 'search_code',
          file: '/path/to/file.ts',
          metadata: {
            type: 'function',
            name: 'testFunction',
            params: ['arg1', 'arg2'],
          },
        });
      }).not.toThrow();
    });

    it('配列を含むコンテキストを処理できる', () => {
      expect(() => {
        logger.info('Array context test', {
          files: ['/path/1.ts', '/path/2.ts', '/path/3.ts'],
          languages: ['typescript', 'javascript'],
        });
      }).not.toThrow();
    });
  });
});

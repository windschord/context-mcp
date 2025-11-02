/**
 * Cloud Embedding Engine (OpenAI, VoyageAI) のテスト
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { CloudEmbeddingEngine } from '../../src/embedding/cloud-embedding-engine';
import type { CloudEmbeddingOptions } from '../../src/embedding/types';

// OpenAI APIのモック
jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => {
      return {
        embeddings: {
          create: jest.fn(),
        },
      };
    }),
  };
});

// VoyageAI APIのモック
jest.mock('voyageai', () => {
  return {
    VoyageAIClient: jest.fn().mockImplementation(() => {
      return {
        embed: jest.fn(),
      };
    }),
  };
});

describe('CloudEmbeddingEngine', () => {
  let engine: CloudEmbeddingEngine;

  describe('OpenAI プロバイダー', () => {
    const options: CloudEmbeddingOptions = {
      provider: 'openai',
      apiKey: 'test-api-key',
      modelName: 'text-embedding-3-small',
      batchSize: 100,
      maxRetries: 3,
      timeout: 30000,
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    afterEach(async () => {
      if (engine) {
        await engine.dispose();
      }
    });

    describe('初期化', () => {
      test('OpenAI APIで初期化できる', async () => {
        engine = new CloudEmbeddingEngine(options);
        await expect(engine.initialize()).resolves.not.toThrow();
      });

      test('APIキーが未設定の場合はエラーを投げる', () => {
        expect(() => {
          new CloudEmbeddingEngine({
            ...options,
            apiKey: '',
          });
        }).toThrow();
      });

      test('初期化後にgetDimensionが正しい値を返す', async () => {
        engine = new CloudEmbeddingEngine(options);
        await engine.initialize();
        expect(engine.getDimension()).toBe(1536); // text-embedding-3-smallの次元数
      });

      test('text-embedding-3-largeの場合は3072次元を返す', async () => {
        engine = new CloudEmbeddingEngine({
          ...options,
          modelName: 'text-embedding-3-large',
        });
        await engine.initialize();
        expect(engine.getDimension()).toBe(3072);
      });
    });

    describe('単一埋め込み', () => {
      beforeEach(async () => {
        const OpenAI = (await import('openai')).default;
        const mockCreate = jest.fn().mockResolvedValue({
          data: [
            {
              embedding: new Array(1536).fill(0).map(() => Math.random()),
            },
          ],
        });

        (OpenAI as jest.MockedFunction<typeof OpenAI>).mockImplementation(
          () =>
            ({
              embeddings: {
                create: mockCreate,
              },
            }) as any
        );

        engine = new CloudEmbeddingEngine(options);
        await engine.initialize();
      });

      test('テキストを埋め込みベクトルに変換できる', async () => {
        const text = 'Hello, world!';
        const vector = await engine.embed(text);

        expect(Array.isArray(vector)).toBe(true);
        expect(vector.length).toBe(1536);
        expect(vector.every((v) => typeof v === 'number')).toBe(true);
      });

      test('空文字列でも埋め込みを生成できる', async () => {
        const vector = await engine.embed('');
        expect(vector.length).toBe(1536);
      });

      test('長いテキストでも埋め込みを生成できる', async () => {
        const longText = 'Lorem ipsum '.repeat(1000);
        const vector = await engine.embed(longText);
        expect(vector.length).toBe(1536);
      });
    });

    describe('バッチ埋め込み', () => {
      beforeEach(async () => {
        const OpenAI = (await import('openai')).default;
        const mockCreate = jest.fn().mockImplementation(async (params: any) => {
          const inputCount = Array.isArray(params.input) ? params.input.length : 1;
          return {
            data: Array(inputCount)
              .fill(0)
              .map(() => ({
                embedding: new Array(1536).fill(0).map(() => Math.random()),
              })),
          };
        });

        (OpenAI as jest.MockedFunction<typeof OpenAI>).mockImplementation(
          () =>
            ({
              embeddings: {
                create: mockCreate,
              },
            }) as any
        );

        engine = new CloudEmbeddingEngine(options);
        await engine.initialize();
      });

      test('複数のテキストをバッチで埋め込める', async () => {
        const texts = ['Hello', 'World', 'Test', 'Batch'];
        const vectors = await engine.embedBatch(texts);

        expect(vectors.length).toBe(4);
        vectors.forEach((vector) => {
          expect(vector.length).toBe(1536);
        });
      });

      test('空の配列を処理できる', async () => {
        const vectors = await engine.embedBatch([]);
        expect(vectors).toEqual([]);
      });

      test('バッチサイズを超える場合も処理できる', async () => {
        const texts = Array(250)
          .fill(0)
          .map((_, i) => `Text ${i}`);
        const vectors = await engine.embedBatch(texts);

        expect(vectors.length).toBe(250);
        vectors.forEach((vector) => {
          expect(vector.length).toBe(1536);
        });
      });

      test('バッチサイズに従って分割される', async () => {
        const OpenAI = (await import('openai')).default;
        const mockCreate = jest.fn().mockImplementation(async (params: any) => {
          const inputCount = Array.isArray(params.input) ? params.input.length : 1;
          return {
            data: Array(inputCount)
              .fill(0)
              .map(() => ({
                embedding: new Array(1536).fill(0).map(() => Math.random()),
              })),
          };
        });

        (OpenAI as jest.MockedFunction<typeof OpenAI>).mockImplementation(
          () =>
            ({
              embeddings: {
                create: mockCreate,
              },
            }) as any
        );

        engine = new CloudEmbeddingEngine({
          ...options,
          batchSize: 10,
        });
        await engine.initialize();

        const texts = Array(25)
          .fill(0)
          .map((_, i) => `Text ${i}`);
        await engine.embedBatch(texts);

        // 25テキストを10ずつ分割すると3回のAPI呼び出し
        expect(mockCreate).toHaveBeenCalledTimes(3);
      });
    });

    describe('エラーハンドリング', () => {
      test('初期化前の埋め込み呼び出しはエラーを投げる', async () => {
        const uninitEngine = new CloudEmbeddingEngine(options);
        await expect(uninitEngine.embed('test')).rejects.toThrow();
      });

      test('初期化前のbatchEmbedはエラーを投げる', async () => {
        const uninitEngine = new CloudEmbeddingEngine(options);
        await expect(uninitEngine.embedBatch(['test'])).rejects.toThrow();
      });

      test('初期化前のgetDimensionは0を返す', () => {
        const uninitEngine = new CloudEmbeddingEngine(options);
        expect(uninitEngine.getDimension()).toBe(0);
      });

      test('APIエラー時にリトライする', async () => {
        const OpenAI = (await import('openai')).default;
        let callCount = 0;
        const mockCreate = jest.fn().mockImplementation(async () => {
          callCount++;
          if (callCount < 3) {
            throw new Error('API Error');
          }
          return {
            data: [
              {
                embedding: new Array(1536).fill(0).map(() => Math.random()),
              },
            ],
          };
        });

        (OpenAI as jest.MockedFunction<typeof OpenAI>).mockImplementation(
          () =>
            ({
              embeddings: {
                create: mockCreate,
              },
            }) as any
        );

        engine = new CloudEmbeddingEngine({
          ...options,
          maxRetries: 3,
        });
        await engine.initialize();

        const vector = await engine.embed('test');
        expect(vector.length).toBe(1536);
        expect(mockCreate).toHaveBeenCalledTimes(3);
      });

      test('最大リトライ回数を超えた場合はエラーを投げる', async () => {
        const OpenAI = (await import('openai')).default;
        const mockCreate = jest.fn().mockRejectedValue(new Error('API Error'));

        (OpenAI as jest.MockedFunction<typeof OpenAI>).mockImplementation(
          () =>
            ({
              embeddings: {
                create: mockCreate,
              },
            }) as any
        );

        engine = new CloudEmbeddingEngine({
          ...options,
          maxRetries: 2,
        });
        await engine.initialize();

        await expect(engine.embed('test')).rejects.toThrow();
        expect(mockCreate.mock.calls.length).toBeGreaterThanOrEqual(2);
      });
    });

    describe('レート制限', () => {
      test('指数バックオフでリトライする', async () => {
        const OpenAI = (await import('openai')).default;
        const callTimes: number[] = [];
        let callCount = 0;

        const mockCreate = jest.fn().mockImplementation(async () => {
          callTimes.push(Date.now());
          callCount++;
          if (callCount < 2) {
            const error: any = new Error('Rate limit exceeded');
            error.status = 429;
            throw error;
          }
          return {
            data: [
              {
                embedding: new Array(1536).fill(0).map(() => Math.random()),
              },
            ],
          };
        });

        (OpenAI as jest.MockedFunction<typeof OpenAI>).mockImplementation(
          () =>
            ({
              embeddings: {
                create: mockCreate,
              },
            }) as any
        );

        engine = new CloudEmbeddingEngine({
          ...options,
          maxRetries: 3,
        });
        await engine.initialize();

        await engine.embed('test');

        // 2回目の呼び出しは少し遅延している
        if (callTimes.length >= 2) {
          const delay = callTimes[1] - callTimes[0];
          expect(delay).toBeGreaterThanOrEqual(100); // 少なくとも100ms
        }
      });
    });
  });

  describe('VoyageAI プロバイダー', () => {
    const options: CloudEmbeddingOptions = {
      provider: 'voyageai',
      apiKey: 'test-voyage-key',
      modelName: 'voyage-2',
      batchSize: 128,
      maxRetries: 3,
    };

    beforeEach(() => {
      jest.clearAllMocks();
    });

    afterEach(async () => {
      if (engine) {
        await engine.dispose();
      }
    });

    describe('初期化', () => {
      test('VoyageAI APIで初期化できる', async () => {
        engine = new CloudEmbeddingEngine(options);
        await expect(engine.initialize()).resolves.not.toThrow();
      });

      test('初期化後にgetDimensionが正しい値を返す', async () => {
        engine = new CloudEmbeddingEngine(options);
        await engine.initialize();
        expect(engine.getDimension()).toBe(1024); // voyage-2の次元数
      });
    });

    describe('単一埋め込み', () => {
      beforeEach(async () => {
        const { VoyageAIClient } = await import('voyageai');
        const mockEmbed = jest.fn().mockResolvedValue({
          embeddings: [new Array(1024).fill(0).map(() => Math.random())],
        });

        (VoyageAIClient as jest.MockedClass<any>).mockImplementation(
          () =>
            ({
              embed: mockEmbed,
            }) as any
        );

        engine = new CloudEmbeddingEngine(options);
        await engine.initialize();
      });

      test('テキストを埋め込みベクトルに変換できる', async () => {
        const text = 'Hello, world!';
        const vector = await engine.embed(text);

        expect(Array.isArray(vector)).toBe(true);
        expect(vector.length).toBe(1024);
        expect(vector.every((v) => typeof v === 'number')).toBe(true);
      });
    });

    describe('バッチ埋め込み', () => {
      beforeEach(async () => {
        const { VoyageAIClient } = await import('voyageai');
        const mockEmbed = jest.fn().mockImplementation(async (params: any) => {
          const inputCount = Array.isArray(params.input) ? params.input.length : 1;
          return {
            embeddings: Array(inputCount)
              .fill(0)
              .map(() => new Array(1024).fill(0).map(() => Math.random())),
          };
        });

        (VoyageAIClient as jest.MockedClass<any>).mockImplementation(
          () =>
            ({
              embed: mockEmbed,
            }) as any
        );

        engine = new CloudEmbeddingEngine(options);
        await engine.initialize();
      });

      test('複数のテキストをバッチで埋め込める', async () => {
        const texts = ['Hello', 'World', 'Test', 'Batch'];
        const vectors = await engine.embedBatch(texts);

        expect(vectors.length).toBe(4);
        vectors.forEach((vector) => {
          expect(vector.length).toBe(1024);
        });
      });

      test('バッチサイズ128を超える場合も処理できる', async () => {
        const texts = Array(200)
          .fill(0)
          .map((_, i) => `Text ${i}`);
        const vectors = await engine.embedBatch(texts);

        expect(vectors.length).toBe(200);
        vectors.forEach((vector) => {
          expect(vector.length).toBe(1024);
        });
      });
    });
  });

  describe('メモリ管理', () => {
    const options: CloudEmbeddingOptions = {
      provider: 'openai',
      apiKey: 'test-api-key',
      modelName: 'text-embedding-3-small',
    };

    test('dispose後は使用できない', async () => {
      const OpenAI = (await import('openai')).default;
      const mockCreate = jest.fn().mockResolvedValue({
        data: [
          {
            embedding: new Array(1536).fill(0).map(() => Math.random()),
          },
        ],
      });

      (OpenAI as jest.MockedFunction<typeof OpenAI>).mockImplementation(
        () =>
          ({
            embeddings: {
              create: mockCreate,
            },
          }) as any
      );

      const tempEngine = new CloudEmbeddingEngine(options);
      await tempEngine.initialize();
      await tempEngine.dispose();

      await expect(tempEngine.embed('test')).rejects.toThrow();
    });

    test('複数回disposeを呼んでもエラーにならない', async () => {
      const tempEngine = new CloudEmbeddingEngine(options);
      await tempEngine.initialize();
      await tempEngine.dispose();
      await expect(tempEngine.dispose()).resolves.not.toThrow();
    });
  });

  describe('環境変数からのAPIキー取得', () => {
    test('環境変数からOpenAI APIキーを取得できる', () => {
      const originalEnv = process.env.OPENAI_API_KEY;
      process.env.OPENAI_API_KEY = 'env-test-key';

      const options: CloudEmbeddingOptions = {
        provider: 'openai',
        apiKey: '${OPENAI_API_KEY}',
        modelName: 'text-embedding-3-small',
      };

      expect(() => new CloudEmbeddingEngine(options)).not.toThrow();

      // 環境変数を元に戻す
      if (originalEnv !== undefined) {
        process.env.OPENAI_API_KEY = originalEnv;
      } else {
        delete process.env.OPENAI_API_KEY;
      }
    });

    test('環境変数からVoyageAI APIキーを取得できる', () => {
      const originalEnv = process.env.VOYAGEAI_API_KEY;
      process.env.VOYAGEAI_API_KEY = 'env-voyage-key';

      const options: CloudEmbeddingOptions = {
        provider: 'voyageai',
        apiKey: '${VOYAGEAI_API_KEY}',
        modelName: 'voyage-2',
      };

      expect(() => new CloudEmbeddingEngine(options)).not.toThrow();

      // 環境変数を元に戻す
      if (originalEnv !== undefined) {
        process.env.VOYAGEAI_API_KEY = originalEnv;
      } else {
        delete process.env.VOYAGEAI_API_KEY;
      }
    });
  });
});

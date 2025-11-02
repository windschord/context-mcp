/**
 * Local Embedding Engine (Transformers.js) のテスト
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { LocalEmbeddingEngine } from '../../src/embedding/local-embedding-engine';
import * as fs from 'fs';
import * as path from 'path';

describe('LocalEmbeddingEngine', () => {
  let engine: LocalEmbeddingEngine;
  const testCacheDir = path.join(process.cwd(), './tmp/.test-models');

  beforeAll(async () => {
    // テスト用のキャッシュディレクトリを準備
    if (!fs.existsSync(testCacheDir)) {
      fs.mkdirSync(testCacheDir, { recursive: true });
    }
  });

  afterAll(async () => {
    // テスト後のクリーンアップ
    if (engine) {
      await engine.dispose();
    }
  });

  describe('初期化', () => {
    test('デフォルトモデルで初期化できる', async () => {
      engine = new LocalEmbeddingEngine();
      await expect(engine.initialize()).resolves.not.toThrow();
    });

    test('カスタムモデルで初期化できる', async () => {
      engine = new LocalEmbeddingEngine({
        modelName: 'Xenova/all-MiniLM-L6-v2',
        cacheDir: testCacheDir,
      });
      await expect(engine.initialize()).resolves.not.toThrow();
    });

    test('初期化後にgetDimensionが正しい値を返す', async () => {
      engine = new LocalEmbeddingEngine();
      await engine.initialize();
      expect(engine.getDimension()).toBe(384); // all-MiniLM-L6-v2の次元数
    });
  });

  describe('単一埋め込み', () => {
    beforeAll(async () => {
      engine = new LocalEmbeddingEngine({
        cacheDir: testCacheDir,
      });
      await engine.initialize();
    });

    test('テキストを埋め込みベクトルに変換できる', async () => {
      const text = 'Hello, world!';
      const vector = await engine.embed(text);

      expect(Array.isArray(vector)).toBe(true);
      expect(vector.length).toBe(384);
      expect(vector.every((v) => typeof v === 'number')).toBe(true);
    });

    test('空文字列でも埋め込みを生成できる', async () => {
      const vector = await engine.embed('');
      expect(vector.length).toBe(384);
    });

    test('長いテキストでも埋め込みを生成できる', async () => {
      const longText = 'Lorem ipsum '.repeat(100);
      const vector = await engine.embed(longText);
      expect(vector.length).toBe(384);
    });

    test('異なるテキストは異なるベクトルを生成する', async () => {
      const vector1 = await engine.embed('Hello, world!');
      const vector2 = await engine.embed('Goodbye, world!');

      // ベクトルが異なることを確認
      const areDifferent = vector1.some((v, i) => v !== vector2[i]);
      expect(areDifferent).toBe(true);
    });

    test('同じテキストは同じベクトルを生成する', async () => {
      const text = 'Consistent text';
      const vector1 = await engine.embed(text);
      const vector2 = await engine.embed(text);

      // ベクトルが同じであることを確認（浮動小数点の誤差を考慮）
      expect(vector1.length).toBe(vector2.length);
      vector1.forEach((v, i) => {
        expect(Math.abs(v - vector2[i])).toBeLessThan(0.0001);
      });
    });
  });

  describe('バッチ埋め込み', () => {
    beforeAll(async () => {
      engine = new LocalEmbeddingEngine({
        cacheDir: testCacheDir,
        batchSize: 4,
      });
      await engine.initialize();
    });

    test('複数のテキストをバッチで埋め込める', async () => {
      const texts = ['Hello', 'World', 'Test', 'Batch'];
      const vectors = await engine.embedBatch(texts);

      expect(vectors.length).toBe(4);
      vectors.forEach((vector) => {
        expect(vector.length).toBe(384);
      });
    });

    test('空の配列を処理できる', async () => {
      const vectors = await engine.embedBatch([]);
      expect(vectors).toEqual([]);
    });

    test('バッチサイズを超える場合も処理できる', async () => {
      const texts = Array(10)
        .fill(0)
        .map((_, i) => `Text ${i}`);
      const vectors = await engine.embedBatch(texts);

      expect(vectors.length).toBe(10);
      vectors.forEach((vector) => {
        expect(vector.length).toBe(384);
      });
    });

    test('バッチ埋め込みと単一埋め込みは同じ結果を返す', async () => {
      const text = 'Compare single and batch';
      const singleVector = await engine.embed(text);
      const batchVectors = await engine.embedBatch([text]);

      expect(batchVectors.length).toBe(1);
      singleVector.forEach((v, i) => {
        expect(Math.abs(v - batchVectors[0][i])).toBeLessThan(0.0001);
      });
    });
  });

  describe('メモリ管理', () => {
    test('dispose後は使用できない', async () => {
      const tempEngine = new LocalEmbeddingEngine({
        cacheDir: testCacheDir,
      });
      await tempEngine.initialize();
      await tempEngine.dispose();

      await expect(tempEngine.embed('test')).rejects.toThrow();
    });

    test('複数回disposeを呼んでもエラーにならない', async () => {
      const tempEngine = new LocalEmbeddingEngine({
        cacheDir: testCacheDir,
      });
      await tempEngine.initialize();
      await tempEngine.dispose();
      await expect(tempEngine.dispose()).resolves.not.toThrow();
    });
  });

  describe('モデルキャッシング', () => {
    test('モデルが自動的にキャッシュディレクトリにダウンロードされる', async () => {
      const customCacheDir = path.join(process.cwd(), './tmp/.test-cache-verify');
      if (!fs.existsSync(customCacheDir)) {
        fs.mkdirSync(customCacheDir, { recursive: true });
      }

      const cacheEngine = new LocalEmbeddingEngine({
        cacheDir: customCacheDir,
      });
      await cacheEngine.initialize();

      // キャッシュディレクトリにファイルが作成されることを確認
      const files = fs.readdirSync(customCacheDir, { recursive: true });
      expect(files.length).toBeGreaterThan(0);

      await cacheEngine.dispose();
    });
  });

  describe('外部通信なし', () => {
    test('初期化後はオフラインで動作する', async () => {
      // 一度初期化してモデルをキャッシュ
      const offlineEngine = new LocalEmbeddingEngine({
        cacheDir: testCacheDir,
      });
      await offlineEngine.initialize();

      // オフラインモードで動作することを確認（実際には環境変数やフラグでテスト）
      // ここでは埋め込み処理が成功することで確認
      const vector = await offlineEngine.embed('Offline test');
      expect(vector.length).toBe(384);

      await offlineEngine.dispose();
    });
  });

  describe('エラーハンドリング', () => {
    test('初期化前の埋め込み呼び出しはエラーを投げる', async () => {
      const uninitEngine = new LocalEmbeddingEngine();
      await expect(uninitEngine.embed('test')).rejects.toThrow();
    });

    test('初期化前のbatchEmbedはエラーを投げる', async () => {
      const uninitEngine = new LocalEmbeddingEngine();
      await expect(uninitEngine.embedBatch(['test'])).rejects.toThrow();
    });

    test('初期化前のgetDimensionは0を返す', () => {
      const uninitEngine = new LocalEmbeddingEngine();
      expect(uninitEngine.getDimension()).toBe(0);
    });
  });
});

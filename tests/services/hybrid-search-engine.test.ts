import { HybridSearchEngine } from '../../src/services/hybrid-search-engine';
import { BM25Engine } from '../../src/storage/bm25-engine';
import type { VectorStorePlugin, Vector, QueryResult, CollectionStats } from '../../src/storage/types';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * テスト用モックベクターストアプラグイン
 */
class MockVectorStorePlugin implements VectorStorePlugin {
  readonly name = 'mock';
  private collections: Map<string, { dimension: number; vectors: Vector[] }> = new Map();

  async connect(): Promise<void> {
    // モックなので何もしない
  }

  async disconnect(): Promise<void> {
    this.collections.clear();
  }

  async createCollection(name: string, dimension: number): Promise<void> {
    if (this.collections.has(name)) {
      throw new Error(`Collection ${name} already exists`);
    }
    this.collections.set(name, { dimension, vectors: [] });
  }

  async deleteCollection(name: string): Promise<void> {
    this.collections.delete(name);
  }

  async upsert(collectionName: string, vectors: Vector[]): Promise<void> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} does not exist`);
    }

    // 既存のベクトルを削除してから追加（upsert動作）
    vectors.forEach(v => {
      const index = collection.vectors.findIndex(existing => existing.id === v.id);
      if (index >= 0) {
        collection.vectors[index] = v;
      } else {
        collection.vectors.push(v);
      }
    });
  }

  async query(
    collectionName: string,
    vector: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<QueryResult[]> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} does not exist`);
    }

    // コサイン類似度を計算
    const results = collection.vectors.map(v => {
      // フィルタチェック
      if (filter) {
        for (const [key, value] of Object.entries(filter)) {
          if (v.metadata?.[key] !== value) {
            return null;
          }
        }
      }

      const similarity = this.cosineSimilarity(vector, v.vector);
      return {
        id: v.id,
        score: similarity,
        metadata: v.metadata,
      };
    }).filter((r): r is QueryResult => r !== null);

    // スコアでソートしてtopKを返す
    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async delete(collectionName: string, ids: string[]): Promise<void> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} does not exist`);
    }

    collection.vectors = collection.vectors.filter(v => !ids.includes(v.id));
  }

  async getStats(collectionName: string): Promise<CollectionStats> {
    const collection = this.collections.get(collectionName);
    if (!collection) {
      throw new Error(`Collection ${collectionName} does not exist`);
    }

    return {
      vectorCount: collection.vectors.length,
      dimension: collection.dimension,
      indexSize: collection.vectors.length * collection.dimension * 4,
    };
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same dimension');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    if (denominator === 0) {
      return 0;
    }

    return dotProduct / denominator;
  }
}

describe('HybridSearchEngine', () => {
  let hybridEngine: HybridSearchEngine;
  let bm25Engine: BM25Engine;
  let vectorStore: VectorStorePlugin;
  let testDbPath: string;

  beforeEach(async () => {
    // テスト用の一時ファイルパスを作成
    const timestamp = Date.now();
    testDbPath = path.join(process.cwd(), './tmp', `test-hybrid-bm25-${timestamp}.db`);

    await fs.mkdir(path.dirname(testDbPath), { recursive: true });

    // BM25エンジンを初期化
    bm25Engine = new BM25Engine(testDbPath);
    await bm25Engine.initialize();

    // ベクターストア（モック）を初期化
    vectorStore = new MockVectorStorePlugin();
    await vectorStore.connect({
      backend: 'mock',
      config: {},
    });

    // ハイブリッド検索エンジンを初期化（デフォルトα=0.3）
    hybridEngine = new HybridSearchEngine(bm25Engine, vectorStore);
  });

  afterEach(async () => {
    await bm25Engine.close();
    await vectorStore.disconnect();

    // テストファイルを削除
    try {
      await fs.unlink(testDbPath);
    } catch (error) {
      // ファイルが存在しない場合は無視
    }
  });

  describe('初期化', () => {
    test('デフォルトパラメータで初期化できる', () => {
      expect(hybridEngine).toBeDefined();
    });

    test('カスタムαパラメータで初期化できる', () => {
      const customEngine = new HybridSearchEngine(bm25Engine, vectorStore, 0.5);
      expect(customEngine).toBeDefined();
    });

    test('無効なαパラメータでエラーになる', () => {
      expect(() => new HybridSearchEngine(bm25Engine, vectorStore, -0.1)).toThrow();
      expect(() => new HybridSearchEngine(bm25Engine, vectorStore, 1.1)).toThrow();
    });
  });

  describe('スコア正規化', () => {
    test('Min-Max正規化が正しく機能する', () => {
      const scores = [
        { id: 'doc1', score: 5.0 },
        { id: 'doc2', score: 10.0 },
        { id: 'doc3', score: 2.5 },
      ];

      const normalized = hybridEngine.normalizeScores(scores);

      expect(normalized[0].score).toBeCloseTo(0.333, 2); // (5-2.5)/(10-2.5)
      expect(normalized[1].score).toBeCloseTo(1.0, 2); // (10-2.5)/(10-2.5)
      expect(normalized[2].score).toBeCloseTo(0.0, 2); // (2.5-2.5)/(10-2.5)
    });

    test('すべてのスコアが同じ場合は1.0になる', () => {
      const scores = [
        { id: 'doc1', score: 5.0 },
        { id: 'doc2', score: 5.0 },
        { id: 'doc3', score: 5.0 },
      ];

      const normalized = hybridEngine.normalizeScores(scores);

      normalized.forEach(item => {
        expect(item.score).toBe(1.0);
      });
    });

    test('空配列の正規化は空配列を返す', () => {
      const normalized = hybridEngine.normalizeScores([]);
      expect(normalized).toEqual([]);
    });

    test('単一スコアの正規化は1.0を返す', () => {
      const scores = [{ id: 'doc1', score: 5.0 }];
      const normalized = hybridEngine.normalizeScores(scores);
      expect(normalized[0].score).toBe(1.0);
    });
  });

  describe('結果のマージ', () => {
    test('BM25とベクトル検索結果をマージできる', () => {
      const bm25Results = [
        { documentId: 'doc1', score: 0.8 },
        { documentId: 'doc2', score: 0.6 },
      ];

      const vectorResults = [
        { id: 'doc1', score: 0.9, metadata: {} },
        { id: 'doc3', score: 0.7, metadata: {} },
      ];

      const merged = hybridEngine.mergeResults(bm25Results, vectorResults);

      expect(merged.size).toBe(3);
      expect(merged.has('doc1')).toBe(true);
      expect(merged.has('doc2')).toBe(true);
      expect(merged.has('doc3')).toBe(true);
    });

    test('重複するドキュメントIDが正しく処理される', () => {
      const bm25Results = [
        { documentId: 'doc1', score: 0.8 },
      ];

      const vectorResults = [
        { id: 'doc1', score: 0.9, metadata: {} },
      ];

      const merged = hybridEngine.mergeResults(bm25Results, vectorResults);

      expect(merged.size).toBe(1);
      const doc1 = merged.get('doc1')!;
      expect(doc1.bm25Score).toBe(0.8);
      expect(doc1.vectorScore).toBe(0.9);
    });

    test('片方の結果のみの場合も正しく処理される', () => {
      const bm25Results = [{ documentId: 'doc1', score: 0.8 }];
      const vectorResults: Array<{ id: string; score: number; metadata: Record<string, unknown> }> = [];

      const merged = hybridEngine.mergeResults(bm25Results, vectorResults);

      expect(merged.size).toBe(1);
      const doc1 = merged.get('doc1')!;
      expect(doc1.bm25Score).toBe(0.8);
      expect(doc1.vectorScore).toBe(0); // デフォルト値
    });
  });

  describe('ハイブリッドスコア計算', () => {
    test('ハイブリッドスコアが正しく計算される（α=0.3）', () => {
      const engine = new HybridSearchEngine(bm25Engine, vectorStore, 0.3);
      const score = engine.calculateHybridScore(0.8, 0.6);

      // α * bm25 + (1-α) * vector = 0.3 * 0.8 + 0.7 * 0.6 = 0.24 + 0.42 = 0.66
      expect(score).toBeCloseTo(0.66, 2);
    });

    test('ハイブリッドスコアが正しく計算される（α=0.5）', () => {
      const engine = new HybridSearchEngine(bm25Engine, vectorStore, 0.5);
      const score = engine.calculateHybridScore(1.0, 0.8);

      // α * bm25 + (1-α) * vector = 0.5 * 1.0 + 0.5 * 0.8 = 0.5 + 0.4 = 0.9
      expect(score).toBeCloseTo(0.9, 2);
    });

    test('BM25スコアが0の場合もベクトルスコアが反映される', () => {
      const engine = new HybridSearchEngine(bm25Engine, vectorStore, 0.3);
      const score = engine.calculateHybridScore(0, 0.9);

      // 0.3 * 0 + 0.7 * 0.9 = 0.63
      expect(score).toBeCloseTo(0.63, 2);
    });

    test('ベクトルスコアが0の場合もBM25スコアが反映される', () => {
      const engine = new HybridSearchEngine(bm25Engine, vectorStore, 0.3);
      const score = engine.calculateHybridScore(0.8, 0);

      // 0.3 * 0.8 + 0.7 * 0 = 0.24
      expect(score).toBeCloseTo(0.24, 2);
    });
  });

  describe('フィルタリング機能', () => {
    test('ファイルタイプでフィルタリングできる', async () => {
      const collectionName = 'test-filter-filetype';
      await vectorStore.createCollection(collectionName, 384);

      const results = [
        { id: 'file1.ts', score: 0.9, metadata: { fileType: 'ts', language: 'TypeScript' } },
        { id: 'file2.py', score: 0.8, metadata: { fileType: 'py', language: 'Python' } },
        { id: 'file3.ts', score: 0.7, metadata: { fileType: 'ts', language: 'TypeScript' } },
      ];

      const filtered = hybridEngine.filterResults(results, { fileTypes: ['ts'] });

      expect(filtered.length).toBe(2);
      expect(filtered.every(r => (r.metadata?.fileType as string) === 'ts')).toBe(true);
    });

    test('言語でフィルタリングできる', async () => {
      const results = [
        { id: 'file1.ts', score: 0.9, metadata: { language: 'TypeScript' } },
        { id: 'file2.py', score: 0.8, metadata: { language: 'Python' } },
        { id: 'file3.go', score: 0.7, metadata: { language: 'Go' } },
      ];

      const filtered = hybridEngine.filterResults(results, { languages: ['TypeScript', 'Go'] });

      expect(filtered.length).toBe(2);
      expect(filtered.some(r => (r.metadata?.language as string) === 'Python')).toBe(false);
    });

    test('パスパターンでフィルタリングできる', async () => {
      const results = [
        { id: 'src/utils/helper.ts', score: 0.9, metadata: {} },
        { id: 'src/services/api.ts', score: 0.8, metadata: {} },
        { id: 'tests/unit/test.ts', score: 0.7, metadata: {} },
      ];

      const filtered = hybridEngine.filterResults(results, { pathPattern: 'src/' });

      expect(filtered.length).toBe(2);
      expect(filtered.every(r => r.id.startsWith('src/'))).toBe(true);
    });

    test('複数のフィルタ条件を組み合わせられる', async () => {
      const results = [
        { id: 'src/utils/helper.ts', score: 0.9, metadata: { fileType: 'ts', language: 'TypeScript' } },
        { id: 'src/utils/helper.py', score: 0.8, metadata: { fileType: 'py', language: 'Python' } },
        { id: 'tests/test.ts', score: 0.7, metadata: { fileType: 'ts', language: 'TypeScript' } },
      ];

      const filtered = hybridEngine.filterResults(results, {
        fileTypes: ['ts'],
        pathPattern: 'src/',
      });

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('src/utils/helper.ts');
    });

    test('フィルタ条件なしの場合は全件返す', async () => {
      const results = [
        { id: 'file1.ts', score: 0.9, metadata: {} },
        { id: 'file2.py', score: 0.8, metadata: {} },
      ];

      const filtered = hybridEngine.filterResults(results, {});

      expect(filtered.length).toBe(2);
    });
  });

  describe('ランキング', () => {
    test('結果がスコアの降順でソートされる', () => {
      const results = [
        { id: 'doc1', score: 0.5, metadata: {} },
        { id: 'doc2', score: 0.9, metadata: {} },
        { id: 'doc3', score: 0.7, metadata: {} },
      ];

      const ranked = hybridEngine.rankResults(results);

      expect(ranked[0].id).toBe('doc2');
      expect(ranked[1].id).toBe('doc3');
      expect(ranked[2].id).toBe('doc1');
    });

    test('topK制限が機能する', () => {
      const results = [
        { id: 'doc1', score: 0.9, metadata: {} },
        { id: 'doc2', score: 0.8, metadata: {} },
        { id: 'doc3', score: 0.7, metadata: {} },
        { id: 'doc4', score: 0.6, metadata: {} },
      ];

      const ranked = hybridEngine.rankResults(results, 2);

      expect(ranked.length).toBe(2);
      expect(ranked[0].id).toBe('doc1');
      expect(ranked[1].id).toBe('doc2');
    });

    test('スコアが同じ場合も安定してソートされる', () => {
      const results = [
        { id: 'doc1', score: 0.8, metadata: {} },
        { id: 'doc2', score: 0.8, metadata: {} },
        { id: 'doc3', score: 0.8, metadata: {} },
      ];

      const ranked = hybridEngine.rankResults(results);

      expect(ranked.length).toBe(3);
      // スコアが同じなので順序は元の順序を保持
      ranked.forEach((result, index) => {
        expect(result.score).toBe(0.8);
      });
    });
  });

  describe('統合検索', () => {
    beforeEach(async () => {
      // テストコレクションを作成
      await vectorStore.createCollection('test-collection', 3);

      // テストデータをインデックス化
      // BM25インデックス
      await bm25Engine.indexDocument('doc1', 'TypeScript is a typed superset of JavaScript');
      await bm25Engine.indexDocument('doc2', 'JavaScript is a dynamic programming language');
      await bm25Engine.indexDocument('doc3', 'Python is a dynamic programming language');

      // ベクトルインデックス（ダミーベクトル）
      await vectorStore.upsert('test-collection', [
        { id: 'doc1', vector: [0.9, 0.1, 0.1], metadata: { fileType: 'ts', language: 'TypeScript' } },
        { id: 'doc2', vector: [0.8, 0.2, 0.0], metadata: { fileType: 'js', language: 'JavaScript' } },
        { id: 'doc3', vector: [0.1, 0.8, 0.9], metadata: { fileType: 'py', language: 'Python' } },
      ]);
    });

    test('ハイブリッド検索が機能する', async () => {
      const queryVector = [0.85, 0.15, 0.05]; // TypeScript/JavaScriptに近いベクトル

      const results = await hybridEngine.search(
        'test-collection',
        'TypeScript JavaScript',
        queryVector,
        10
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results[0].score).toBeGreaterThan(0);

      // スコアが降順であることを確認
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });

    test('フィルタ付きハイブリッド検索が機能する', async () => {
      const queryVector = [0.85, 0.15, 0.05];

      const results = await hybridEngine.search(
        'test-collection',
        'programming language',
        queryVector,
        10,
        { fileTypes: ['ts', 'js'] }
      );

      expect(results.length).toBeGreaterThan(0);
      expect(results.every(r => {
        const fileType = r.metadata?.fileType as string;
        return fileType === 'ts' || fileType === 'js';
      })).toBe(true);
    });

    test('topK制限付きハイブリッド検索が機能する', async () => {
      const queryVector = [0.85, 0.15, 0.05];

      const results = await hybridEngine.search(
        'test-collection',
        'programming',
        queryVector,
        1
      );

      expect(results.length).toBeLessThanOrEqual(1);
    });

    test('BM25のみがヒットする場合も正しく動作する', async () => {
      // BM25には存在するがベクトルには存在しないドキュメントを追加
      await bm25Engine.indexDocument('doc4', 'Rust is a systems programming language');

      const queryVector = [0.0, 0.0, 0.0]; // 低類似度ベクトル

      const results = await hybridEngine.search(
        'test-collection',
        'Rust systems',
        queryVector,
        10
      );

      // BM25でdoc4がヒットするはず
      expect(results.some(r => r.id === 'doc4')).toBe(true);
    });

    test('ベクトル検索のみがヒットする場合も正しく動作する', async () => {
      // ベクトルには存在するがBM25にはない用語で検索
      await vectorStore.upsert('test-collection', [
        { id: 'doc5', vector: [0.5, 0.5, 0.9], metadata: { fileType: 'go', language: 'Go' } },
      ]);

      const queryVector = [0.5, 0.5, 0.9]; // doc5に近いベクトル

      const results = await hybridEngine.search(
        'test-collection',
        'nonexistent query xyz',
        queryVector,
        10
      );

      // ベクトル類似度でdoc5がヒットするはず
      expect(results.some(r => r.id === 'doc5')).toBe(true);
    });

    test('クエリが空の場合はベクトル検索のみ実行される', async () => {
      const queryVector = [0.85, 0.15, 0.05];

      const results = await hybridEngine.search(
        'test-collection',
        '',
        queryVector,
        10
      );

      expect(results.length).toBeGreaterThan(0);
      // ベクトル検索のみなのでBM25スコアは0のはず
      results.forEach(r => {
        expect(r.metadata?.bm25Score).toBeUndefined();
      });
    });
  });

  describe('エッジケース', () => {
    test('BM25とベクトル検索両方が空の場合は空配列を返す', async () => {
      await vectorStore.createCollection('empty-collection', 3);

      const queryVector = [0.5, 0.5, 0.5];

      const results = await hybridEngine.search(
        'empty-collection',
        'nonexistent',
        queryVector,
        10
      );

      expect(results).toEqual([]);
    });

    test('存在しないコレクションの場合はエラーになる', async () => {
      const queryVector = [0.5, 0.5, 0.5];

      await expect(
        hybridEngine.search('nonexistent-collection', 'query', queryVector, 10)
      ).rejects.toThrow();
    });

    test('非常に大きなtopK値でも正常動作する', async () => {
      await vectorStore.createCollection('test-large-topk', 3);
      await bm25Engine.indexDocument('doc1', 'test content');
      await vectorStore.upsert('test-large-topk', [
        { id: 'doc1', vector: [0.5, 0.5, 0.5], metadata: {} },
      ]);

      const queryVector = [0.5, 0.5, 0.5];

      const results = await hybridEngine.search(
        'test-large-topk',
        'test',
        queryVector,
        10000
      );

      // 実際のドキュメント数以上は返らない
      expect(results.length).toBeLessThanOrEqual(1);
    });
  });
});

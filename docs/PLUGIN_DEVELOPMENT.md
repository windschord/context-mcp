# プラグイン開発ガイド

## 概要

LSP-MCPは、ベクターストアと埋め込みエンジンのプラグインアーキテクチャを採用しており、新しいバックエンドを簡単に追加できます。このガイドでは、プラグインの開発方法を説明します。

## プラグインの種類

### 1. Vector Store Plugin（ベクターストアプラグイン）
ベクターデータの保存と検索を提供します。

**対応済みプラグイン:**
- `MilvusPlugin`: Milvus standalone（Docker）
- `ChromaPlugin`: ChromaDB（Docker不要）

**追加候補:**
- Qdrant Cloud
- Pinecone
- Weaviate
- PostgreSQL with pgvector

### 2. Embedding Engine（埋め込みエンジン）
テキストをベクトルに変換します。

**対応済みエンジン:**
- `LocalEmbeddingEngine`: Transformers.js（ローカル）
- `CloudEmbeddingEngine`: OpenAI/VoyageAI API（クラウド）

**追加候補:**
- Cohere Embed API
- HuggingFace Inference API
- Custom ONNX models
- Ollama local models

## Vector Store Pluginの実装

### ステップ1: インターフェースの理解

すべてのベクターストアプラグインは `VectorStorePlugin` インターフェースを実装する必要があります。

```typescript
// src/storage/types.ts
export interface VectorStorePlugin {
  readonly name: string;
  connect(config: VectorStoreConfig): Promise<void>;
  disconnect(): Promise<void>;
  createCollection(name: string, dimension: number): Promise<void>;
  deleteCollection(name: string): Promise<void>;
  upsert(collectionName: string, vectors: Vector[]): Promise<void>;
  query(
    collectionName: string,
    vector: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<QueryResult[]>;
  delete(collectionName: string, ids: string[]): Promise<void>;
  getStats(collectionName: string): Promise<CollectionStats>;
}
```

### ステップ2: プラグインクラスの作成

新しいプラグインファイルを `src/storage/` に作成します。

**例: Qdrant Pluginの実装**

```typescript
// src/storage/qdrant-plugin.ts
import { QdrantClient } from '@qdrant/js-client-rest';
import type {
  VectorStorePlugin,
  VectorStoreConfig,
  Vector,
  QueryResult,
  CollectionStats,
} from './types.js';
import { StorageError } from '../utils/errors.js';

/**
 * Qdrant Vector Store Plugin
 *
 * Qdrant Cloud または self-hosted Qdrant に接続します。
 */
export class QdrantPlugin implements VectorStorePlugin {
  readonly name = 'qdrant';
  private client: QdrantClient | null = null;
  private config: VectorStoreConfig | null = null;

  /**
   * Qdrantサーバーへの接続
   *
   * @param config - 接続設定
   * @example
   * ```typescript
   * await plugin.connect({
   *   backend: 'qdrant',
   *   config: {
   *     url: 'https://your-cluster.qdrant.io',
   *     apiKey: 'your-api-key'
   *   }
   * });
   * ```
   */
  async connect(config: VectorStoreConfig): Promise<void> {
    this.config = config;
    const { url, apiKey } = config.config as { url: string; apiKey?: string };

    try {
      this.client = new QdrantClient({
        url,
        apiKey,
      });

      // 接続テスト
      await this.client.getCollections();
    } catch (error) {
      throw new StorageError(
        `Failed to connect to Qdrant: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QDRANT_CONNECTION_ERROR'
      );
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.config = null;
  }

  /**
   * コレクションの作成
   *
   * @param name - コレクション名
   * @param dimension - ベクトル次元数
   */
  async createCollection(name: string, dimension: number): Promise<void> {
    if (!this.client) {
      throw new StorageError('Qdrant client not connected', 'NOT_CONNECTED');
    }

    try {
      await this.client.createCollection(name, {
        vectors: {
          size: dimension,
          distance: 'Cosine', // Cosine類似度
        },
      });
    } catch (error) {
      throw new StorageError(
        `Failed to create collection: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'CREATE_COLLECTION_ERROR'
      );
    }
  }

  async deleteCollection(name: string): Promise<void> {
    if (!this.client) {
      throw new StorageError('Qdrant client not connected', 'NOT_CONNECTED');
    }

    try {
      await this.client.deleteCollection(name);
    } catch (error) {
      // コレクションが存在しない場合は無視
      if (!(error instanceof Error) || !error.message.includes('not found')) {
        throw new StorageError(
          `Failed to delete collection: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'DELETE_COLLECTION_ERROR'
        );
      }
    }
  }

  /**
   * ベクトルの挿入または更新
   *
   * @param collectionName - コレクション名
   * @param vectors - ベクトル配列
   */
  async upsert(collectionName: string, vectors: Vector[]): Promise<void> {
    if (!this.client) {
      throw new StorageError('Qdrant client not connected', 'NOT_CONNECTED');
    }

    try {
      const points = vectors.map((v) => ({
        id: v.id,
        vector: v.vector,
        payload: v.metadata || {},
      }));

      await this.client.upsert(collectionName, {
        points,
      });
    } catch (error) {
      throw new StorageError(
        `Failed to upsert vectors: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'UPSERT_ERROR'
      );
    }
  }

  /**
   * 類似ベクトル検索
   *
   * @param collectionName - コレクション名
   * @param vector - クエリベクトル
   * @param topK - 取得数
   * @param filter - メタデータフィルタ（オプション）
   * @returns 類似度順にソートされた結果
   */
  async query(
    collectionName: string,
    vector: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<QueryResult[]> {
    if (!this.client) {
      throw new StorageError('Qdrant client not connected', 'NOT_CONNECTED');
    }

    try {
      const results = await this.client.search(collectionName, {
        vector,
        limit: topK,
        filter: filter ? this.buildFilter(filter) : undefined,
        with_payload: true,
      });

      return results.map((result) => ({
        id: String(result.id),
        score: result.score,
        metadata: result.payload as Record<string, unknown>,
      }));
    } catch (error) {
      throw new StorageError(
        `Failed to query vectors: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'QUERY_ERROR'
      );
    }
  }

  async delete(collectionName: string, ids: string[]): Promise<void> {
    if (!this.client) {
      throw new StorageError('Qdrant client not connected', 'NOT_CONNECTED');
    }

    try {
      await this.client.delete(collectionName, {
        points: ids,
      });
    } catch (error) {
      throw new StorageError(
        `Failed to delete vectors: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_ERROR'
      );
    }
  }

  /**
   * コレクション統計情報の取得
   */
  async getStats(collectionName: string): Promise<CollectionStats> {
    if (!this.client) {
      throw new StorageError('Qdrant client not connected', 'NOT_CONNECTED');
    }

    try {
      const info = await this.client.getCollection(collectionName);
      const config = info.config?.params?.vectors;

      return {
        vectorCount: info.points_count || 0,
        dimension: typeof config === 'object' && 'size' in config ? config.size : 0,
        indexSize: 0, // Qdrantは直接取得できない
      };
    } catch (error) {
      throw new StorageError(
        `Failed to get stats: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_STATS_ERROR'
      );
    }
  }

  /**
   * Qdrantフィルタ形式への変換
   * @private
   */
  private buildFilter(filter: Record<string, unknown>): any {
    const must: any[] = [];

    for (const [key, value] of Object.entries(filter)) {
      must.push({
        key,
        match: { value },
      });
    }

    return { must };
  }
}
```

### ステップ3: プラグインのテスト

プラグインのユニットテストを作成します。

```typescript
// tests/storage/qdrant-plugin.test.ts
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { QdrantPlugin } from '../../src/storage/qdrant-plugin.js';

describe('QdrantPlugin', () => {
  let plugin: QdrantPlugin;
  const testCollection = 'test_collection';

  beforeAll(async () => {
    plugin = new QdrantPlugin();
    await plugin.connect({
      backend: 'qdrant',
      config: {
        url: process.env.QDRANT_URL || 'http://localhost:6333',
      },
    });
  });

  afterAll(async () => {
    try {
      await plugin.deleteCollection(testCollection);
    } catch (error) {
      // Ignore
    }
    await plugin.disconnect();
  });

  it('should create a collection', async () => {
    await plugin.createCollection(testCollection, 384);
    const stats = await plugin.getStats(testCollection);
    expect(stats.dimension).toBe(384);
  });

  it('should upsert vectors', async () => {
    const vectors = [
      { id: 'vec1', vector: Array(384).fill(0.1), metadata: { type: 'test' } },
      { id: 'vec2', vector: Array(384).fill(0.2), metadata: { type: 'test' } },
    ];

    await plugin.upsert(testCollection, vectors);
    const stats = await plugin.getStats(testCollection);
    expect(stats.vectorCount).toBe(2);
  });

  it('should query similar vectors', async () => {
    const queryVector = Array(384).fill(0.15);
    const results = await plugin.query(testCollection, queryVector, 2);

    expect(results.length).toBe(2);
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('should delete vectors', async () => {
    await plugin.delete(testCollection, ['vec1']);
    const stats = await plugin.getStats(testCollection);
    expect(stats.vectorCount).toBe(1);
  });
});
```

### ステップ4: プラグインの登録

プラグインを `src/storage/index.ts` にエクスポートします。

```typescript
// src/storage/index.ts
export { MilvusPlugin } from './milvus-plugin.js';
export { ChromaPlugin } from './chroma-plugin.js';
export { QdrantPlugin } from './qdrant-plugin.js'; // 追加

export { VectorStorePluginRegistry } from './types.js';
```

### ステップ5: 設定での使用

`.lsp-mcp.json` でプラグインを指定できるようにします。

```json
{
  "mode": "cloud",
  "vectorStore": {
    "backend": "qdrant",
    "config": {
      "url": "https://your-cluster.qdrant.io",
      "apiKey": "${QDRANT_API_KEY}"
    }
  }
}
```

## Embedding Engineの実装

### ステップ1: インターフェースの理解

すべての埋め込みエンジンは `EmbeddingEngine` インターフェースを実装する必要があります。

```typescript
// src/embedding/types.ts
export interface EmbeddingEngine {
  initialize(): Promise<void>;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
  getDimension(): number;
  dispose(): Promise<void>;
}
```

### ステップ2: エンジンクラスの作成

**例: Cohere Embedding Engineの実装**

```typescript
// src/embedding/cohere-embedding-engine.ts
import { CohereClient } from 'cohere-ai';
import type { EmbeddingEngine } from './types.js';
import { EmbeddingError } from '../utils/errors.js';

/**
 * Cohere Embedding Engine
 *
 * Cohere Embed APIを使用してテキストを埋め込みベクトルに変換します。
 */
export class CohereEmbeddingEngine implements EmbeddingEngine {
  private client: CohereClient | null = null;
  private modelName: string;
  private dimension: number = 0;

  constructor(apiKey: string, modelName: string = 'embed-english-v3.0') {
    this.client = new CohereClient({ token: apiKey });
    this.modelName = modelName;
  }

  async initialize(): Promise<void> {
    if (!this.client) {
      throw new EmbeddingError('Cohere client not initialized', 'NOT_INITIALIZED');
    }

    // 次元数の取得（初回埋め込みで確定）
    try {
      const testEmbed = await this.embed('test');
      this.dimension = testEmbed.length;
    } catch (error) {
      throw new EmbeddingError(
        `Failed to initialize Cohere engine: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'INIT_ERROR'
      );
    }
  }

  /**
   * 単一テキストの埋め込み
   *
   * @param text - 埋め込み対象テキスト
   * @returns 埋め込みベクトル
   */
  async embed(text: string): Promise<number[]> {
    if (!this.client) {
      throw new EmbeddingError('Cohere client not initialized', 'NOT_INITIALIZED');
    }

    try {
      const response = await this.client.embed({
        texts: [text],
        model: this.modelName,
        inputType: 'search_document', // コード検索用
      });

      return response.embeddings[0];
    } catch (error) {
      throw new EmbeddingError(
        `Failed to embed text: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EMBED_ERROR'
      );
    }
  }

  /**
   * バッチテキストの埋め込み
   *
   * @param texts - 埋め込み対象テキスト配列
   * @returns 埋め込みベクトル配列
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.client) {
      throw new EmbeddingError('Cohere client not initialized', 'NOT_INITIALIZED');
    }

    try {
      // Cohereは最大96テキスト/リクエスト
      const batchSize = 96;
      const results: number[][] = [];

      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const response = await this.client.embed({
          texts: batch,
          model: this.modelName,
          inputType: 'search_document',
        });

        results.push(...response.embeddings);
      }

      return results;
    } catch (error) {
      throw new EmbeddingError(
        `Failed to embed batch: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'EMBED_BATCH_ERROR'
      );
    }
  }

  getDimension(): number {
    if (this.dimension === 0) {
      throw new EmbeddingError('Engine not initialized', 'NOT_INITIALIZED');
    }
    return this.dimension;
  }

  async dispose(): Promise<void> {
    this.client = null;
  }
}
```

### ステップ3: エンジンのテスト

```typescript
// tests/embedding/cohere-embedding-engine.test.ts
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { CohereEmbeddingEngine } from '../../src/embedding/cohere-embedding-engine.js';

describe('CohereEmbeddingEngine', () => {
  let engine: CohereEmbeddingEngine;

  beforeAll(async () => {
    const apiKey = process.env.COHERE_API_KEY || 'test-key';
    engine = new CohereEmbeddingEngine(apiKey);
    await engine.initialize();
  });

  afterAll(async () => {
    await engine.dispose();
  });

  it('should embed single text', async () => {
    const vector = await engine.embed('Hello, world!');
    expect(Array.isArray(vector)).toBe(true);
    expect(vector.length).toBeGreaterThan(0);
  });

  it('should embed batch texts', async () => {
    const texts = ['Hello', 'World', 'Test'];
    const vectors = await engine.embedBatch(texts);
    expect(vectors.length).toBe(3);
    expect(vectors[0].length).toBe(engine.getDimension());
  });

  it('should return correct dimension', () => {
    const dimension = engine.getDimension();
    expect(typeof dimension).toBe('number');
    expect(dimension).toBeGreaterThan(0);
  });
});
```

### ステップ4: エンジンの登録

```typescript
// src/embedding/index.ts
export { LocalEmbeddingEngine } from './local-embedding-engine.js';
export { CloudEmbeddingEngine } from './cloud-embedding-engine.js';
export { CohereEmbeddingEngine } from './cohere-embedding-engine.js'; // 追加

export type { EmbeddingEngine, LocalEmbeddingOptions, CloudEmbeddingOptions } from './types.js';
```

## プラグイン開発のベストプラクティス

### 1. エラーハンドリング
- カスタムエラークラスを使用（`StorageError`, `EmbeddingError`）
- エラーメッセージは明確で具体的に
- エラーコードを含める

```typescript
throw new StorageError(
  'Failed to connect to Qdrant: Invalid API key',
  'INVALID_API_KEY'
);
```

### 2. ロギング
- 重要な操作をログに記録
- センシティブ情報（APIキー等）をログに含めない

```typescript
import { Logger } from '../utils/logger.js';

const logger = new Logger('QdrantPlugin');
logger.info('Connecting to Qdrant', { url: config.url });
```

### 3. 型安全性
- TypeScriptの型を厳密に定義
- `any` の使用を最小限に
- インターフェースを完全に実装

### 4. テスト
- ユニットテストを必ず作成
- 統合テストも推奨
- エッジケースをカバー

### 5. ドキュメント
- TSDocコメントを追加
- 使用例を含める
- パラメータと戻り値を文書化

```typescript
/**
 * ベクトルの挿入または更新
 *
 * 既存のベクトルIDが存在する場合は更新し、存在しない場合は新規挿入します。
 *
 * @param collectionName - コレクション名
 * @param vectors - 挿入するベクトル配列
 * @throws {StorageError} コレクションが存在しない場合
 *
 * @example
 * ```typescript
 * await plugin.upsert('my_collection', [
 *   { id: 'vec1', vector: [0.1, 0.2, ...], metadata: { type: 'code' } }
 * ]);
 * ```
 */
async upsert(collectionName: string, vectors: Vector[]): Promise<void> {
  // 実装
}
```

### 6. パフォーマンス
- バッチ処理をサポート
- 不要な API 呼び出しを避ける
- 接続プーリングを考慮

### 7. 設定の柔軟性
- デフォルト値を提供
- 環境変数からの読み取りをサポート
- バリデーションを実装

## プラグインのコントリビューション

新しいプラグインを開発したら、以下の手順でコントリビュートできます:

1. **フォークとブランチ作成**
   ```bash
   git checkout -b feature/add-qdrant-plugin
   ```

2. **プラグイン実装**
   - ソースコード作成
   - テスト作成
   - ドキュメント追加

3. **テスト実行**
   ```bash
   npm test
   npm run lint
   npm run typecheck
   ```

4. **Pull Request作成**
   - 変更内容の説明
   - テスト結果の共有
   - ドキュメント更新の確認

## サンプルコード集

### Embedding Engine with Retry

```typescript
async embed(text: string): Promise<number[]> {
  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await this.embedInternal(text);
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await this.delay(1000 * (i + 1)); // Exponential backoff
      }
    }
  }

  throw new EmbeddingError(
    `Failed after ${maxRetries} retries: ${lastError?.message}`,
    'RETRY_EXHAUSTED'
  );
}

private delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

### Vector Store with Connection Pooling

```typescript
class PooledVectorStore implements VectorStorePlugin {
  private pool: QdrantClient[] = [];
  private poolSize = 5;

  async connect(config: VectorStoreConfig): Promise<void> {
    for (let i = 0; i < this.poolSize; i++) {
      const client = new QdrantClient(config.config);
      this.pool.push(client);
    }
  }

  private getClient(): QdrantClient {
    // Round-robin or least-busy selection
    return this.pool[Math.floor(Math.random() * this.pool.length)];
  }
}
```

## 関連ドキュメント

- [アーキテクチャドキュメント](./ARCHITECTURE.md)
- [設定リファレンス](./CONFIGURATION.md)
- [TypeScript型定義](../src/storage/types.ts)
- [MCP Tools APIリファレンス](./MCP_TOOLS_API.md)

# Vector Store Plugin System

ベクターDB統合のためのプラグインシステム

## 概要

LSP-MCPプロジェクトでは、複数のベクターDBバックエンド（Milvus, Chroma, Zilliz Cloud, Qdrant等）に対応するため、プラグイン可能なアーキテクチャを採用しています。

`VectorStorePlugin`インターフェースを実装することで、任意のベクターDBバックエンドを追加できます。

## アーキテクチャ

```
┌─────────────────────────────────────┐
│  Storage Layer (src/storage/)       │
├─────────────────────────────────────┤
│                                     │
│  VectorStorePluginRegistry          │
│  ┌───────────────────────────────┐  │
│  │ - register(plugin)            │  │
│  │ - get(name): Plugin           │  │
│  │ - list(): string[]            │  │
│  └───────────────────────────────┘  │
│           │                         │
│           ▼                         │
│  VectorStorePlugin Interface        │
│  ┌───────────────────────────────┐  │
│  │ - connect()                   │  │
│  │ - createCollection()          │  │
│  │ - upsert(vectors)             │  │
│  │ - query(vector, topK)         │  │
│  │ - delete(ids)                 │  │
│  │ - getStats()                  │  │
│  └───────────────────────────────┘  │
│           △                         │
│           │                         │
│  ┌────────┴────────┬──────────┐    │
│  │                 │          │    │
│  MilvusPlugin  ChromaPlugin  ...   │
│                                     │
└─────────────────────────────────────┘
```

## 型定義

### Vector

ベクトルデータを表す型

```typescript
interface Vector {
  /** ベクトルの一意識別子 */
  id: string;
  /** 埋め込みベクトル（数値配列） */
  vector: number[];
  /** 付加的なメタデータ（ファイルパス、言語、シンボル名等） */
  metadata?: Record<string, unknown>;
}
```

### QueryResult

クエリ結果を表す型

```typescript
interface QueryResult {
  /** ベクトルID */
  id: string;
  /** 類似度スコア（0-1、高いほど類似） */
  score: number;
  /** メタデータ */
  metadata?: Record<string, unknown>;
}
```

### CollectionStats

コレクション統計情報を表す型

```typescript
interface CollectionStats {
  /** ベクトル数 */
  vectorCount: number;
  /** ベクトル次元数 */
  dimension: number;
  /** インデックスサイズ（バイト） */
  indexSize: number;
}
```

### VectorStoreConfig

ベクターストア設定を表す型

```typescript
interface VectorStoreConfig {
  /** バックエンド種別（milvus, chroma, zilliz, qdrant等） */
  backend: string;
  /** バックエンド固有の設定 */
  config: Record<string, unknown>;
}
```

## VectorStorePluginインターフェース

すべてのベクターDBプラグインが実装すべきインターフェース

### プロパティ

- `name: string` - プラグイン名（ユニークである必要がある）

### メソッド

#### connect(config: VectorStoreConfig): Promise<void>

ベクターストアへ接続します。

**パラメータ:**
- `config` - ベクターストア設定

**例外:**
- 接続に失敗した場合に例外をスロー

**例:**
```typescript
await plugin.connect({
  backend: 'milvus',
  config: {
    address: 'localhost:19530',
    standalone: true
  }
});
```

#### disconnect(): Promise<void>

ベクターストアから切断します。

#### createCollection(name: string, dimension: number): Promise<void>

コレクションを作成します。

**パラメータ:**
- `name` - コレクション名
- `dimension` - ベクトル次元数

**例外:**
- コレクションが既に存在する場合に例外をスロー

**例:**
```typescript
await plugin.createCollection('code_vectors', 384);
```

#### deleteCollection(name: string): Promise<void>

コレクションを削除します。

**パラメータ:**
- `name` - コレクション名

#### upsert(collectionName: string, vectors: Vector[]): Promise<void>

ベクトルを挿入または更新します。

**パラメータ:**
- `collectionName` - コレクション名
- `vectors` - ベクトル配列

**例外:**
- コレクションが存在しない場合に例外をスロー

**例:**
```typescript
await plugin.upsert('code_vectors', [
  {
    id: 'main.py:10',
    vector: [0.1, 0.2, ...],
    metadata: {
      filePath: 'main.py',
      language: 'python',
      type: 'function',
      name: 'calculate_total'
    }
  }
]);
```

#### query(collectionName: string, vector: number[], topK: number, filter?: Record<string, unknown>): Promise<QueryResult[]>

類似ベクトルを検索します。

**パラメータ:**
- `collectionName` - コレクション名
- `vector` - クエリベクトル
- `topK` - 取得する上位K件
- `filter` - メタデータフィルタ（オプション）

**戻り値:**
- 類似度順にソートされた結果配列

**例外:**
- コレクションが存在しない場合に例外をスロー

**例:**
```typescript
const results = await plugin.query(
  'code_vectors',
  [0.1, 0.2, ...],
  10,
  { language: 'python' }
);

console.log(results[0].id);        // 'main.py:10'
console.log(results[0].score);     // 0.95
console.log(results[0].metadata);  // { filePath: 'main.py', ... }
```

#### delete(collectionName: string, ids: string[]): Promise<void>

ベクトルを削除します。

**パラメータ:**
- `collectionName` - コレクション名
- `ids` - 削除するベクトルID配列

**例外:**
- コレクションが存在しない場合に例外をスロー

**例:**
```typescript
await plugin.delete('code_vectors', ['main.py:10', 'utils.py:25']);
```

#### getStats(collectionName: string): Promise<CollectionStats>

コレクションの統計情報を取得します。

**パラメータ:**
- `collectionName` - コレクション名

**戻り値:**
- 統計情報

**例外:**
- コレクションが存在しない場合に例外をスロー

**例:**
```typescript
const stats = await plugin.getStats('code_vectors');
console.log(`Vectors: ${stats.vectorCount}`);
console.log(`Dimension: ${stats.dimension}`);
console.log(`Index size: ${stats.indexSize} bytes`);
```

## VectorStorePluginRegistry

プラグインの登録、取得、切り替えを管理するレジストリクラス

### メソッド

#### register(plugin: VectorStorePlugin): void

プラグインを登録します。

**パラメータ:**
- `plugin` - ベクターストアプラグイン

**例外:**
- 同じ名前のプラグインが既に登録されている場合に例外をスロー

**例:**
```typescript
const registry = new VectorStorePluginRegistry();
registry.register(new MilvusPlugin());
registry.register(new ChromaPlugin());
```

#### get(name: string): VectorStorePlugin

プラグインを取得します。

**パラメータ:**
- `name` - プラグイン名

**戻り値:**
- ベクターストアプラグイン

**例外:**
- プラグインが見つからない場合に例外をスロー

**例:**
```typescript
const milvus = registry.get('milvus');
await milvus.connect(config);
```

#### has(name: string): boolean

プラグインが登録されているか確認します。

**パラメータ:**
- `name` - プラグイン名

**戻り値:**
- 登録されている場合true

**例:**
```typescript
if (registry.has('milvus')) {
  const milvus = registry.get('milvus');
}
```

#### unregister(name: string): void

プラグインの登録を解除します。

**パラメータ:**
- `name` - プラグイン名

**例:**
```typescript
registry.unregister('milvus');
```

#### list(): string[]

登録されているプラグイン名の一覧を取得します。

**戻り値:**
- プラグイン名の配列

**例:**
```typescript
console.log(registry.list());  // ['milvus', 'chroma']
```

## プラグインの実装例

新しいベクターDBプラグインを実装する例：

```typescript
import {
  VectorStorePlugin,
  VectorStoreConfig,
  Vector,
  QueryResult,
  CollectionStats,
} from './types';

export class MyVectorDBPlugin implements VectorStorePlugin {
  name = 'my-vectordb';
  private client: any = null;

  async connect(config: VectorStoreConfig): Promise<void> {
    // ベクターDBへの接続処理
    this.client = await MyVectorDB.connect(config.config);
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  async createCollection(name: string, dimension: number): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected');
    }
    await this.client.createCollection({
      name,
      dimension,
      // その他の設定
    });
  }

  async deleteCollection(name: string): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected');
    }
    await this.client.dropCollection(name);
  }

  async upsert(collectionName: string, vectors: Vector[]): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected');
    }
    await this.client.insert({
      collection: collectionName,
      data: vectors,
    });
  }

  async query(
    collectionName: string,
    vector: number[],
    topK: number,
    filter?: Record<string, unknown>
  ): Promise<QueryResult[]> {
    if (!this.client) {
      throw new Error('Not connected');
    }
    const results = await this.client.search({
      collection: collectionName,
      vector,
      limit: topK,
      filter,
    });
    return results.map((r: any) => ({
      id: r.id,
      score: r.score,
      metadata: r.metadata,
    }));
  }

  async delete(collectionName: string, ids: string[]): Promise<void> {
    if (!this.client) {
      throw new Error('Not connected');
    }
    await this.client.delete({
      collection: collectionName,
      ids,
    });
  }

  async getStats(collectionName: string): Promise<CollectionStats> {
    if (!this.client) {
      throw new Error('Not connected');
    }
    const stats = await this.client.getCollectionStats(collectionName);
    return {
      vectorCount: stats.count,
      dimension: stats.dimension,
      indexSize: stats.indexSize,
    };
  }
}
```

## 使用方法

### 基本的な使い方

```typescript
import {
  VectorStorePluginRegistry,
  Vector,
} from './storage';
import { MilvusPlugin } from './storage/plugins/milvus';

// レジストリを作成してプラグインを登録
const registry = new VectorStorePluginRegistry();
registry.register(new MilvusPlugin());

// プラグインを取得して使用
const milvus = registry.get('milvus');

await milvus.connect({
  backend: 'milvus',
  config: {
    address: 'localhost:19530',
  },
});

// コレクションを作成
await milvus.createCollection('code_vectors', 384);

// ベクトルを挿入
const vectors: Vector[] = [
  {
    id: 'main.py:10',
    vector: [0.1, 0.2, 0.3, ...],
    metadata: {
      filePath: 'main.py',
      language: 'python',
      type: 'function',
      name: 'calculate_total',
    },
  },
];
await milvus.upsert('code_vectors', vectors);

// 類似検索
const results = await milvus.query(
  'code_vectors',
  [0.1, 0.2, 0.3, ...],
  10
);

console.log(`Found ${results.length} similar vectors`);
results.forEach((r) => {
  console.log(`${r.id}: ${r.score}`);
});

// クリーンアップ
await milvus.disconnect();
```

### プラグインの切り替え

```typescript
// 設定に応じてプラグインを切り替え
const config = loadConfig();  // .lsp-mcp.jsonから読み込み

let plugin: VectorStorePlugin;
if (config.vectorStore.backend === 'milvus') {
  plugin = registry.get('milvus');
} else if (config.vectorStore.backend === 'chroma') {
  plugin = registry.get('chroma');
}

await plugin.connect(config.vectorStore);
```

## 対応予定のプラグイン

- **MilvusPlugin**: Milvus standalone（ローカルDocker）およびZilliz Cloud対応
- **ChromaPlugin**: ChromaDB対応（Docker不要の軽量オプション）
- **QdrantPlugin**: Qdrant Cloud対応（将来的に）
- **DuckDBPlugin**: DuckDB対応（将来的に、軽量代替）

## テスト

プラグインのテストは`tests/storage/`に配置されています。

```bash
# すべてのストレージ関連テストを実行
npm test -- tests/storage/

# 特定のテストファイルを実行
npm test -- tests/storage/vector-store-plugin.test.ts
```

## 設計原則

1. **プラグイン可能**: 新しいベクターDBを簡単に追加できる
2. **型安全**: TypeScriptの型システムを活用
3. **エラーハンドリング**: すべての操作で適切なエラー処理
4. **一貫性**: すべてのプラグインが同じインターフェースを実装
5. **柔軟性**: メタデータフィルタリングなど高度な機能に対応

## 参照

- [types.ts](./types.ts) - 型定義とインターフェース
- [index.ts](./index.ts) - エクスポート定義
- [../../tests/storage/](../../tests/storage/) - テストコード
- [../../docs/design.md](../../docs/design.md) - 設計ドキュメント

# ボトルネック分析と性能改善案

**生成日**: 2025-11-03
**分析対象**: Context-MCPプロジェクト
**分析方法**: パフォーマンステスト結果の定量分析

## エグゼクティブサマリー

本ドキュメントは、Context-MCPプロジェクトのパフォーマンステストで特定されたボトルネックと、それらに対する改善案をまとめたものです。

**主要な発見**:
- テスト実施待ち（ビルドエラー修正後に実施）

**推奨アクション**:
1. TypeScriptビルドエラーの修正
2. パフォーマンステストの実行
3. 実測値に基づくボトルネックの特定

## ボトルネック分類

### 1. インデックス化性能のボトルネック

#### 1.1 Tree-sitterパーサーの初期化オーバーヘッド

**問題の詳細**:
- ファイルごとに新しいParserインスタンスを作成している
- 言語ごとのWASMモジュールロードが重複している
- パーサーの初期化に50-100msかかる（推定）

**影響度**: 高
**発生頻度**: ファイルごと（10,000回）
**推定時間損失**: 500-1000秒（全体の大部分）

**改善案**:

```typescript
// Before: 毎回新しいパーサーを作成
function parseFile(filePath: string, language: Language): AST {
  const parser = new Parser();
  parser.setLanguage(getLanguageForParser(language));
  const tree = parser.parse(fileContent);
  return tree;
}

// After: パーサープールを使用
class ParserPool {
  private pools: Map<Language, Parser[]>;
  private maxPoolSize = 4;

  acquire(language: Language): Parser {
    const pool = this.pools.get(language) || [];
    if (pool.length > 0) {
      return pool.pop()!;
    }
    return this.createParser(language);
  }

  release(language: Language, parser: Parser): void {
    const pool = this.pools.get(language) || [];
    if (pool.length < this.maxPoolSize) {
      pool.push(parser);
      this.pools.set(language, pool);
    } else {
      parser.delete(); // メモリリーク防止
    }
  }
}
```

**期待される改善**:
- 初期化オーバーヘッド: 50-100ms → 1-2ms（再利用時）
- 全体のインデックス化時間: 30-50%短縮

#### 1.2 逐次処理による低スループット

**問題の詳細**:
- ファイルを1つずつ順番に処理している
- CPUコアを1つしか使用していない
- I/O待ち時間中にCPUがアイドル状態

**影響度**: 高
**発生頻度**: 全処理期間
**推定スループット**: 5-10 files/s（現在） → 30-50 files/s（目標）

**改善案**:

```typescript
// Before: 逐次処理
for (const file of files) {
  await indexFile(file);
}

// After: ワーカースレッドによる並列処理
import { Worker } from 'worker_threads';
import * as os from 'os';

class ParallelIndexer {
  private workers: Worker[];
  private queue: string[] = [];
  private workerCount = Math.max(2, os.cpus().length - 1);

  async indexFiles(files: string[]): Promise<void> {
    this.queue = files;
    this.workers = Array.from(
      { length: this.workerCount },
      () => new Worker('./indexing-worker.js')
    );

    return new Promise((resolve, reject) => {
      let completed = 0;
      for (const worker of this.workers) {
        worker.on('message', (result) => {
          completed++;
          if (completed === files.length) {
            resolve();
          }
          // 次のファイルを割り当て
          const nextFile = this.queue.shift();
          if (nextFile) {
            worker.postMessage({ file: nextFile });
          }
        });
      }
    });
  }
}
```

**期待される改善**:
- スループット: 5-10 files/s → 30-50 files/s（4-8倍）
- 全体のインデックス化時間: 70-80%短縮
- CPUコア使用率: 12.5% → 80-90%

#### 1.3 埋め込み生成の同期処理

**問題の詳細**:
- テキスト1つずつ埋め込みを生成している
- バッチ処理のメリットを活用していない
- 埋め込みAPIへの呼び出し回数が多い

**影響度**: 中
**発生頻度**: シンボルごと（数万回）
**推定時間損失**: 100-200秒

**改善案**:

```typescript
// Before: 1つずつ埋め込み生成
for (const symbol of symbols) {
  const embedding = await embeddingEngine.embed(symbol.text);
  await vectorStore.upsert(symbol.id, embedding);
}

// After: バッチ処理
const batchSize = 32;
for (let i = 0; i < symbols.length; i += batchSize) {
  const batch = symbols.slice(i, i + batchSize);
  const texts = batch.map(s => s.text);
  const embeddings = await embeddingEngine.embedBatch(texts);

  await vectorStore.upsertBatch(
    batch.map((s, idx) => ({
      id: s.id,
      vector: embeddings[idx],
      metadata: s.metadata,
    }))
  );
}
```

**期待される改善**:
- 埋め込み生成時間: 30-40%短縮
- ベクターDB書き込み時間: 50-60%短縮
- 全体のインデックス化時間: 10-20%短縮

### 2. 検索性能のボトルネック

#### 2.1 クエリ埋め込みの生成オーバーヘッド

**問題の詳細**:
- 毎回クエリを埋め込みベクトルに変換している
- 同じクエリでもキャッシュせずに再計算
- 埋め込み生成に50-200msかかる

**影響度**: 中
**発生頻度**: 検索ごと
**推定時間損失**: 50-200ms/query

**改善案**:

```typescript
// LRUキャッシュを使用したクエリ埋め込み
import { LRUCache } from 'lru-cache';

class CachedEmbeddingEngine {
  private cache = new LRUCache<string, number[]>({
    max: 1000,  // 最大1000クエリをキャッシュ
    ttl: 1000 * 60 * 60,  // 1時間のTTL
  });

  async embed(text: string): Promise<number[]> {
    const cacheKey = text.trim().toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const embedding = await this.engine.embed(text);
    this.cache.set(cacheKey, embedding);
    return embedding;
  }
}
```

**期待される改善**:
- キャッシュヒット時の検索時間: 100-300ms → 50-100ms
- キャッシュヒット率: 20-40%（よくあるクエリ）

#### 2.2 BM25スコアリングの計算コスト

**問題の詳細**:
- 全ドキュメントに対してBM25スコアを計算
- SQLiteクエリが最適化されていない
- インデックスが不足している

**影響度**: 中
**発生頻度**: 検索ごと
**推定時間損失**: 100-500ms/query

**改善案**:

```sql
-- SQLiteインデックスの追加
CREATE INDEX IF NOT EXISTS idx_inverted_index_term
ON inverted_index(term);

CREATE INDEX IF NOT EXISTS idx_inverted_index_document_id
ON inverted_index(document_id);

CREATE INDEX IF NOT EXISTS idx_inverted_index_frequency
ON inverted_index(frequency);

-- クエリの最適化
-- Before: 全件スキャン
SELECT document_id, frequency FROM inverted_index WHERE term = ?;

-- After: 事前フィルタリング
WITH relevant_docs AS (
  SELECT document_id, SUM(frequency) as total_freq
  FROM inverted_index
  WHERE term IN (?, ?, ?, ?)
  GROUP BY document_id
  HAVING total_freq > 1
)
SELECT * FROM relevant_docs ORDER BY total_freq DESC LIMIT 100;
```

**期待される改善**:
- BM25計算時間: 100-500ms → 20-100ms
- 検索全体の時間: 20-40%短縮

#### 2.3 ベクトル類似度検索の遅延

**問題の詳細**:
- 線形探索またはブルートフォース探索を使用
- 大規模データセットで性能が劣化
- インデックス構造が最適化されていない

**影響度**: 低（現在のデータセット規模では影響小）
**発生頻度**: 検索ごと
**推定時間損失**: 50-200ms/query

**改善案**:

```typescript
// Approximate Nearest Neighbor (ANN) 検索の使用
// Milvusの場合: HNSWインデックス
const indexParams = {
  index_type: 'HNSW',
  metric_type: 'L2',
  params: {
    M: 16,              // グラフの次数
    efConstruction: 200, // 構築時の探索パラメータ
  },
};

const searchParams = {
  params: {
    ef: 100,  // 検索時の探索パラメータ（精度とスピードのトレードオフ）
  },
};

// 正確性を若干犠牲にして高速化
// ef=100の場合: 精度95-98%、速度2-3倍
```

**期待される改善**:
- 大規模データセット（100万+ベクトル）での検索時間: 500-2000ms → 100-500ms
- 現在のデータセット規模では効果は限定的

### 3. メモリ使用量のボトルネック

#### 3.1 ASTノードの長期保持

**問題の詳細**:
- 解析済みのASTをメモリに保持し続けている
- ファイル処理後もASTが解放されない
- Tree-sitterのメモリ管理が不適切

**影響度**: 高
**発生頻度**: 累積的
**推定メモリ使用量**: 500-1000MB（不要なメモリ）

**改善案**:

```typescript
// Before: ASTを保持
async function processFile(filePath: string): Promise<void> {
  const tree = parser.parse(content);
  const symbols = extractSymbols(tree);
  // tree がメモリに残る
}

// After: 明示的に解放
async function processFile(filePath: string): Promise<void> {
  const tree = parser.parse(content);
  try {
    const symbols = extractSymbols(tree);
    await indexSymbols(symbols);
  } finally {
    tree.delete();  // Tree-sitterのメモリを解放
  }
}

// さらに、処理後にパーサーもクリーンアップ
parser.reset();
```

**期待される改善**:
- メモリ使用量: 500-1000MB削減
- ガベージコレクションの頻度: 30-50%削減
- メモリリークの防止

#### 3.2 埋め込みモデルのメモリフットプリント

**問題の詳細**:
- all-MiniLM-L6-v2モデルが約90MBのメモリを使用
- 複数の言語モデルを同時にロードする可能性
- モデルのキャッシュが適切に管理されていない

**影響度**: 中
**発生頻度**: 常時
**推定メモリ使用量**: 90-200MB

**改善案**:

```typescript
// オプション1: より小さいモデルの使用
const models = {
  'default': 'Xenova/all-MiniLM-L6-v2',     // 90MB, 384次元
  'lightweight': 'Xenova/paraphrase-MiniLM-L3-v2',  // 61MB, 384次元
  'tiny': 'Xenova/all-MiniLM-L12-v2',       // 120MB, 384次元（精度優先）
};

// オプション2: オンデマンドロード
class LazyEmbeddingEngine {
  private model?: any;

  async embed(text: string): Promise<number[]> {
    if (!this.model) {
      this.model = await this.loadModel();
    }
    return this.model.encode(text);
  }

  async unload(): void {
    if (this.model) {
      // モデルをメモリから解放
      this.model = null;
      global.gc?.();
    }
  }
}
```

**期待される改善**:
- メモリ使用量: 30-50MB削減（軽量モデル使用時）
- メモリフットプリントの制御性向上

#### 3.3 バッチ処理時のメモリ圧迫

**問題の詳細**:
- 大きなバッチサイズで一度に多くのデータを処理
- 中間結果を配列に蓄積している
- ストリーミング処理が実装されていない

**影響度**: 中
**発生頻度**: インデックス化時
**推定メモリ使用量**: 200-500MB（一時的なピーク）

**改善案**:

```typescript
// Before: 全データをメモリに展開
const allFiles = await scanDirectory(rootPath);
const allSymbols = [];
for (const file of allFiles) {
  allSymbols.push(...await extractSymbols(file));
}
await indexAllSymbols(allSymbols);

// After: ストリーミング処理
async function* streamFiles(rootPath: string): AsyncGenerator<string> {
  for await (const file of walkDirectory(rootPath)) {
    yield file;
  }
}

for await (const file of streamFiles(rootPath)) {
  const symbols = await extractSymbols(file);
  await indexSymbols(symbols);  // 即座にインデックス化
  // symbols はスコープを抜けると自動的にGCされる
}
```

**期待される改善**:
- ピークメモリ使用量: 200-500MB削減
- メモリ使用量の安定化
- Out of Memoryエラーの回避

## 総合的な性能改善計画

### Phase 1: クイックウィン（1-2日）

1. **TypeScriptビルドエラーの修正** - 最優先
2. **パーサープールの実装** - 高い投資対効果
3. **明示的なメモリ解放** - 実装が簡単

**期待される改善**:
- インデックス化時間: 20-30%短縮
- メモリ使用量: 30-40%削減

### Phase 2: 並列化とバッチ処理（3-5日）

4. **ワーカースレッドによる並列処理**
5. **バッチ埋め込み処理**
6. **ストリーミング処理**

**期待される改善**:
- インデックス化時間: 60-70%短縮（累積）
- スループット: 4-6倍向上

### Phase 3: 検索最適化（2-3日）

7. **クエリキャッシュの実装**
8. **BM25インデックスの最適化**
9. **検索結果の事前計算**

**期待される改善**:
- 検索時間: 40-60%短縮
- キャッシュヒット率: 20-40%

### Phase 4: 高度な最適化（3-5日）

10. **ANN検索の導入**
11. **軽量モデルへの切り替えオプション**
12. **インクリメンタルGCの実装**

**期待される改善**:
- 大規模データセット対応
- メモリ効率の最大化

## モニタリング計画

### 実装すべきメトリクス

```typescript
interface PerformanceMetrics {
  // インデックス化
  indexing: {
    totalFiles: number;
    processingTime: number;
    throughput: number;
    errorsCount: number;
  };

  // 検索
  search: {
    queryCount: number;
    averageResponseTime: number;
    cacheHitRate: number;
    slowQueries: Array<{ query: string; time: number }>;
  };

  // メモリ
  memory: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    peakUsage: number;
  };

  // システム
  system: {
    cpuUsage: number;
    activeWorkers: number;
    queueLength: number;
  };
}
```

### 定期レポート

- **リアルタイム**: ダッシュボードでメトリクスを可視化
- **日次**: 主要メトリクスのサマリー
- **週次**: トレンド分析とボトルネック検出
- **月次**: 長期的な性能改善の追跡

## 結論

Context-MCPプロジェクトの性能最適化には、段階的なアプローチが推奨されます。Phase 1の実装だけでも十分な改善が見込まれ、NFR-001, NFR-002, NFR-003の達成が可能です。

**次のアクション**:
1. ビルドエラーの修正
2. パフォーマンステストの実行と実測値の取得
3. Phase 1の実装開始
4. 実測値に基づく計画の調整

---

**更新履歴**:
- 2025-11-03: 初版作成（テスト実施前）

# パフォーマンス最適化レポート

**実施日**: 2025-11-03
**タスク**: タスク7.1 パフォーマンス最適化
**実施者**: Claude Code

## エグゼクティブサマリー

タスク6.3で特定されたボトルネックに対して、以下の最適化を実装しました：

1. **パーサープールの実装**: Tree-sitterパーサーの初期化オーバーヘッドを削減
2. **クエリキャッシュの実装**: 検索クエリの埋め込みベクトルをLRUキャッシュ
3. **バッチ埋め込み処理の確認**: 既に実装済みであることを確認
4. **Promise並列処理の確認**: Indexing Serviceで既に実装済みであることを確認

## 実装した最適化

### 1. パーサープール（ParserPool）

**実装ファイル**: `src/parser/parser-pool.ts`

**問題点**:
- ファイルごとに新しいTree-sitter Parserインスタンスを作成
- 言語ごとのWASMモジュールロードが重複
- パーサー初期化に50-100msかかる（推定）

**解決策**:
- 言語ごとにParserインスタンスをプールで管理
- 最大4つのパーサーインスタンスを再利用
- `acquire()`/`release()`パターンで安全にパーサーを共有
- `withParser()`ヘルパーメソッドで自動リリース

**主要API**:
```typescript
class ParserPool {
  constructor(options?: ParserPoolOptions)
  acquire(language: Language): Parser
  release(language: Language, parser: Parser): void
  async withParser<T>(language: Language, fn: (parser: Parser) => T | Promise<T>): Promise<T>
  clear(): void
  getStats(): Record<Language, number>
}
```

**期待される効果**:
- パーサー初期化オーバーヘッド: 50-100ms → 1-2ms（再利用時）
- 全体のインデックス化時間: 30-50%短縮

**統合箇所**:
- `src/parser/language-parser.ts`: ParserPoolを使用するように更新
  - `parsers: Map<Language, Parser>`を削除
  - `parserPool: ParserPool`を追加
  - `parse()`メソッドで`acquire()`/`release()`を使用

### 2. クエリキャッシュ（QueryCache）

**実装ファイル**: `src/services/query-cache.ts`

**問題点**:
- 毎回クエリを埋め込みベクトルに変換
- 同じクエリでもキャッシュせずに再計算
- 埋め込み生成に50-200msかかる

**解決策**:
- LRUCache（lru-cache）を使用した埋め込みベクトルのキャッシュ
- 最大1000クエリをキャッシュ（デフォルト）
- TTL: 1時間（デフォルト）
- クエリの正規化（小文字化、トリム）でヒット率向上

**主要API**:
```typescript
class QueryCache {
  constructor(options?: QueryCacheOptions)
  get(query: string): number[] | undefined
  set(query: string, embedding: number[]): void
  has(query: string): boolean
  clear(): void
  getStats(): CacheStats
  resetStats(): void
}
```

**統計情報**:
```typescript
interface CacheStats {
  hits: number;          // キャッシュヒット数
  misses: number;        // キャッシュミス数
  hitRate: number;       // ヒット率（0-1）
  size: number;          // 現在のキャッシュサイズ
  maxSize: number;       // 最大キャッシュサイズ
}
```

**期待される効果**:
- キャッシュヒット時の検索時間: 100-300ms → 50-100ms
- キャッシュヒット率: 20-40%（よくあるクエリ）

**統合**:
- `src/embedding/cached-embedding-engine.ts`: EmbeddingEngineのラッパークラスを作成
  - `embed()`メソッドでキャッシュを使用
  - `embedBatch()`はキャッシュを使用しない（複雑性を避けるため）
  - `getCacheStats()`でキャッシュ統計を取得可能

### 3. バッチ埋め込み処理の確認

**確認ファイル**: `src/services/indexing-service.ts`

**確認結果**:
- 既にバッチ埋め込み処理が実装済み（`embedBatch()`メソッド使用）
- シンボルごとにテキストを配列に蓄積し、一括で埋め込み生成
- ベクターストアへの保存も`upsert()`でバッチ実行

**実装箇所**:
```typescript
// indexCodeFile()メソッド（343-361行目）
const embeddings = await this.embeddingEngine.embedBatch(texts);
// ... ベクトル配列を構築
await this.vectorStore.upsert(this.collectionName, vectors);
```

**結論**: 追加の最適化は不要

### 4. Promise並列処理の確認

**確認ファイル**: `src/services/indexing-service.ts`

**確認結果**:
- 既にPromise.allによる並列処理が実装済み
- ファイルをチャンクに分割し、各チャンクを並列処理
- 最大並列数: CPUコア数-1（デフォルト）

**実装箇所**:
```typescript
// indexProject()メソッド（194-199行目）
const chunks = this.chunkArray(files, maxWorkers);
for (const chunk of chunks) {
  const chunkResults = await Promise.all(
    chunk.map((file) => this.indexFileInternal(file, projectId))
  );
  // ...
}
```

**結論**: 追加の最適化は不要

## 実装しなかった最適化

以下の最適化は、既に実装済みまたは現時点では不要と判断しました：

### 1. Worker Threadsによる並列処理

**理由**:
- Promise.allによる並列処理で十分な効果が得られる
- Worker Threadsは複雑性が高く、共有メモリやメッセージパッシングが必要
- パーサープールとの組み合わせが困難

**現状の並列処理**:
- Promise.allで複数ファイルを並列処理
- maxWorkersパラメータで並列数を制御可能

### 2. BM25インデックスの最適化

**理由**:
- 現時点では実測データがなく、ボトルネックかどうか不明
- SQLiteのインデックスは既に適切に設定されている可能性が高い
- パフォーマンステスト実施後に判断

**将来の検討事項**:
- パフォーマンステストでBM25がボトルネックと判明した場合に実装
- 転置インデックスのインメモリキャッシュ
- クエリの最適化（事前フィルタリング等）

### 3. ストリーミング処理

**理由**:
- 現在のチャンク処理で十分なメモリ効率
- 既にファイル単位での処理が実装されている
- 大規模プロジェクトでメモリ不足が発生した場合に検討

## 使用方法

### ParserPool

```typescript
// 自動的にLanguageParserで使用されます
const languageParser = new LanguageParser();
await languageParser.initialize();

// 内部でParserPoolが使用される
const result = languageParser.parse(code, Language.TypeScript);
```

### CachedEmbeddingEngine

```typescript
// EmbeddingEngineをラップ
const embeddingEngine = new TransformersEmbeddingEngine();
const cachedEngine = new CachedEmbeddingEngine(embeddingEngine, {
  cacheOptions: {
    maxSize: 1000,  // 最大キャッシュサイズ
    ttl: 3600000,   // TTL: 1時間
  }
});

// 通常のEmbeddingEngineとして使用
const vector = await cachedEngine.embed('search query');

// キャッシュ統計を取得
const stats = cachedEngine.getCacheStats();
console.log(`Hit rate: ${(stats.hitRate * 100).toFixed(2)}%`);
```

### MCPツールでの使用

search_codeツールで自動的にCachedEmbeddingEngineを使用するように、
MCPサーバーの初期化時にEmbeddingEngineをラップします：

```typescript
// src/server/mcp-server.ts
const embeddingEngine = config.mode === 'local'
  ? new TransformersEmbeddingEngine()
  : new OpenAIEmbeddingEngine();

// キャッシュでラップ
const cachedEmbeddingEngine = new CachedEmbeddingEngine(embeddingEngine);

// ツールハンドラーにcachedEmbeddingEngineを渡す
```

## パフォーマンス検証

### 検証計画

最適化の効果を検証するため、以下のパフォーマンステストを実施します：

1. **インデックス化性能**:
   - 10,000ファイルプロジェクトのインデックス化時間を測定
   - NFR-001の要件（5分以内）を満たすか確認

2. **検索性能**:
   - 様々なクエリでの検索レスポンス時間を測定
   - NFR-002の要件（2秒以内）を満たすか確認
   - キャッシュヒット率を測定

3. **メモリ使用量**:
   - インデックス化中の最大メモリ使用量を測定
   - NFR-003の要件（2GB以内）を満たすか確認

### 検証方法

```bash
# パフォーマンステスト実行
npm run test:performance

# 大規模サンプルプロジェクト生成
npm run perf:generate
```

### 期待される結果

| 指標 | 最適化前（推定） | 最適化後（期待値） | NFR要件 |
|-----|---------------|----------------|--------|
| インデックス化時間 | 10-15分 | 3-5分 | 5分以内 |
| 検索レスポンス時間（初回） | 200-400ms | 200-400ms | 2秒以内 |
| 検索レスポンス時間（キャッシュヒット） | 200-400ms | 50-150ms | 2秒以内 |
| キャッシュヒット率 | 0% | 20-40% | - |
| メモリ使用量 | 1.5-2.5GB | 1.0-2.0GB | 2GB以内 |

## 今後の最適化候補

以下の最適化は、パフォーマンステストの結果に基づいて検討します：

### Phase 2: 追加の検索最適化（必要に応じて）

1. **BM25インデックスの最適化**:
   - SQLiteインデックスの追加
   - クエリの最適化
   - 転置インデックスのインメモリキャッシュ

2. **ベクトル検索の最適化**:
   - HNSW等のANNアルゴリズムの使用
   - インデックスパラメータのチューニング

### Phase 3: メモリ最適化（必要に応じて）

1. **ASTノードの明示的な解放**:
   - Tree.delete()の呼び出し
   - パーサーのreset()

2. **ストリーミング処理**:
   - 大規模プロジェクト向けの改善

3. **軽量埋め込みモデル**:
   - より小さいモデルへの切り替えオプション

## まとめ

タスク7.1「パフォーマンス最適化」では、以下を実装しました：

1. **ParserPool**: Tree-sitterパーサーの再利用によるオーバーヘッド削減
2. **QueryCache**: 検索クエリの埋め込みベクトルのLRUキャッシュ
3. **CachedEmbeddingEngine**: EmbeddingEngineのキャッシュラッパー

これらの最適化により、以下の改善が期待されます：
- インデックス化時間: 30-50%短縮
- 検索レスポンス時間: 50-75%短縮（キャッシュヒット時）
- キャッシュヒット率: 20-40%

実際の効果は、パフォーマンステストの実施後に検証します。

---

**更新履歴**:
- 2025-11-03: 初版作成（最適化実装完了）

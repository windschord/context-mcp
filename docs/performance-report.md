# パフォーマンステストレポート

**生成日**: 2025-11-03
**テスト環境**: ローカル開発環境
**Node.js バージョン**: 18+

## 概要

LSP-MCPプロジェクトの非機能要件（NFR）に対するパフォーマンステストを実施しました。このレポートでは、インデックス化性能、検索性能、メモリ使用量の測定結果、および特定されたボトルネックと改善案を記載します。

## テスト環境

```
Platform: darwin (macOS)
Architecture: x64/arm64
Node.js: 18.19.31+
RAM: 8GB+
CPU: Multi-core processor
```

## テストデータセット

- **ファイル数**: 10,000ファイル
- **言語分布**:
  - TypeScript: 30% (3,000ファイル)
  - Python: 25% (2,500ファイル)
  - Go: 15% (1,500ファイル)
  - Rust: 15% (1,500ファイル)
  - Java: 10% (1,000ファイル)
  - C++: 5% (500ファイル)

## 非機能要件（NFR）

### NFR-001: インデックス化性能

**要件**: 10,000ファイルを5分以内（クラウドモード）または10分以内（ローカルモード）でインデックス化

**測定項目**:
- インデックス化時間（秒）
- スループット（ファイル/秒）
- エラー率

**測定結果**:

| 項目 | 実測値 | 閾値 | 状態 | 備考 |
|------|--------|------|------|------|
| インデックス化時間 | TBD | 600s (ローカル) | PENDING | テスト実施待ち |
| スループット | TBD | 16.7 files/s | PENDING | テスト実施待ち |
| エラー率 | TBD | <1% | PENDING | テスト実施待ち |

**分析**:
- ローカル埋め込みモデル（Transformers.js）を使用した場合の測定
- ベクターDBはモックを使用（Docker不要）
- 実際のMilvus/Chromaを使用した場合は追加のI/Oオーバーヘッドが発生

### NFR-002: 検索性能

**要件**: 検索結果を2秒以内に返す

**測定項目**:
- 検索レスポンスタイム（ミリ秒）
- クエリ種別ごとの性能

**測定結果**:

| クエリ | 実測値 (ms) | 閾値 (ms) | 状態 | 備考 |
|--------|------------|-----------|------|------|
| "user authentication function" | TBD | 2000 | PENDING | テスト実施待ち |
| "database connection" | TBD | 2000 | PENDING | テスト実施待ち |
| "error handling" | TBD | 2000 | PENDING | テスト実施待ち |
| "data validation" | TBD | 2000 | PENDING | テスト実施待ち |
| "API endpoint" | TBD | 2000 | PENDING | テスト実施待ち |

**分析**:
- ハイブリッド検索（BM25 + Vector）の性能
- α = 0.3（デフォルト設定）を使用
- キャッシュなしの条件で測定

### NFR-003: メモリ使用量

**要件**: インデックス化中のメモリ使用量が2GB以内

**測定項目**:
- ピークメモリ使用量（MB）
- ヒープメモリ使用量（MB）

**測定結果**:

| 項目 | 実測値 (MB) | 閾値 (MB) | 状態 | 備考 |
|------|------------|-----------|------|------|
| ピークメモリ | TBD | 2048 | PENDING | テスト実施待ち |
| ヒープメモリ | TBD | 1536 | PENDING | テスト実施待ち |

**分析**:
- TypeScriptサブセット（約3,000ファイル）での測定
- Tree-sitterパーサーとTransformers.jsモデルをメモリ上に保持
- ガベージコレクション後のメモリ使用量も記録

### NFR-004: インクリメンタル更新性能

**要件**: 単一ファイルの更新を100ms以内で処理

**測定項目**:
- インクリメンタル更新時間（ミリ秒）

**測定結果**:

| 項目 | 実測値 (ms) | 閾値 (ms) | 状態 | 備考 |
|------|------------|-----------|------|------|
| 1ファイル更新 | TBD | 100 | PENDING | テスト実施待ち |

## ボトルネック分析

### 検出されたボトルネック

**実施状況**: テスト実施待ち

以下のボトルネックが検出される可能性があります：

1. **インデックス化の遅延**
   - **原因候補**: Tree-sitterパーサーの初期化オーバーヘッド、埋め込み生成の逐次処理
   - **影響範囲**: NFR-001

2. **検索の遅延**
   - **原因候補**: BM25スコアリングの計算コスト、ベクトル類似度検索の遅延
   - **影響範囲**: NFR-002

3. **メモリ使用量の増加**
   - **原因候補**: ASTの保持、埋め込みモデルのメモリフットプリント
   - **影響範囲**: NFR-003

### パフォーマンス最適化の推奨事項

#### 1. インデックス化最適化

**現在の問題**:
- ファイル単位の逐次処理による低スループット
- Tree-sitterパーサーの初期化が毎回発生
- 埋め込み生成が同期的に実行される

**推奨改善策**:

1. **並列処理の導入**
   ```typescript
   // ワーカースレッドを使用した並列インデックス化
   import { Worker } from 'worker_threads';

   const workers = Array.from({ length: cpuCount }, () =>
     new Worker('./indexing-worker.js')
   );
   ```

2. **パーサーのプール化**
   ```typescript
   // パーサーを再利用してオーバーヘッド削減
   class ParserPool {
     private parsers: Map<Language, Parser[]>;
     acquire(language: Language): Parser;
     release(language: Language, parser: Parser): void;
   }
   ```

3. **バッチ埋め込み処理**
   ```typescript
   // 複数のテキストをまとめて埋め込み生成
   const embeddings = await embeddingEngine.embedBatch(texts, {
     batchSize: 32
   });
   ```

4. **インクリメンタルキャッシュ**
   ```typescript
   // 変更されていないファイルの再処理をスキップ
   if (fileHash === cachedHash) {
     return cachedEmbeddings;
   }
   ```

#### 2. 検索最適化

**現在の問題**:
- 毎回の埋め込み生成によるオーバーヘッド
- BM25インデックスの全件スキャン
- 結果のマージとソート処理

**推奨改善策**:

1. **クエリ埋め込みのキャッシュ**
   ```typescript
   // よくあるクエリの埋め込みをキャッシュ
   const queryCache = new LRUCache<string, number[]>({
     max: 1000
   });
   ```

2. **BM25インデックスの最適化**
   ```sql
   -- SQLiteインデックスの追加
   CREATE INDEX idx_term ON inverted_index(term);
   CREATE INDEX idx_document_id ON inverted_index(document_id);
   ```

3. **Approximate Nearest Neighbor (ANN)検索**
   ```typescript
   // 正確性を若干犠牲にして高速化
   const results = await vectorStore.query(embedding, {
     topK: topK * 2,  // 多めに取得
     ef: 100,         // HNSW探索パラメータ
   });
   ```

4. **早期終了の実装**
   ```typescript
   // 十分な結果が得られたら検索を終了
   if (results.length >= topK && minScore > threshold) {
     break;
   }
   ```

#### 3. メモリ使用量最適化

**現在の問題**:
- ASTノードの長期保持
- 埋め込みモデルの大きなメモリフットプリント
- バッチ処理時のメモリ圧迫

**推奨改善策**:

1. **ストリーミング処理**
   ```typescript
   // ファイルを1つずつ処理し、すぐに解放
   for await (const file of fileStream) {
     await processFile(file);
     // ASTとパーサーを明示的に解放
     parser.delete();
   }
   ```

2. **軽量埋め込みモデルの選択**
   ```typescript
   // より小さいモデルを使用
   const model = 'Xenova/all-MiniLM-L6-v2';  // 現在: 約90MB
   // または
   const model = 'Xenova/paraphrase-MiniLM-L3-v2'; // 約61MB
   ```

3. **メモリプール管理**
   ```typescript
   // バッファプールを使用して再割り当てを削減
   class BufferPool {
     private pool: Buffer[] = [];
     acquire(size: number): Buffer;
     release(buffer: Buffer): void;
   }
   ```

4. **インクリメンタルGC**
   ```typescript
   // 定期的にガベージコレクションを実行
   if (filesProcessed % 100 === 0) {
     global.gc?.();
   }
   ```

## 実装優先順位

### 高優先度（Phase 1）

1. **並列インデックス化** - NFR-001の達成に必須
2. **パーサープール** - メモリとCPUの両方を改善
3. **クエリキャッシュ** - NFR-002の達成に寄与

### 中優先度（Phase 2）

4. **バッチ埋め込み処理** - スループット向上
5. **BM25インデックス最適化** - 検索速度の改善
6. **ストリーミング処理** - メモリ使用量の削減

### 低優先度（Phase 3）

7. **ANN検索** - 大規模データセット向け
8. **軽量モデル** - メモリ制約が厳しい環境向け
9. **インクリメンタルGC** - ファインチューニング

## 次のステップ

1. **ビルドエラーの修正** - 現在のTypeScriptコンパイルエラーを解消
2. **パフォーマンステストの実行** - `npm run test:performance`
3. **結果の分析** - 実測値を本レポートに反映
4. **最適化の実装** - 特定されたボトルネックに対処
5. **再測定** - 最適化後の性能を検証

## 付録

### テスト実行方法

```bash
# 大規模サンプルプロジェクトの生成（初回のみ）
npm run perf:generate

# パフォーマンステストの実行
npm run test:performance

# 結果の確認
cat docs/performance-report.json
cat docs/bottleneck-analysis.json
```

### 測定ツール

- **Node.js `process.memoryUsage()`** - メモリ使用量測定
- **`Date.now()`** - 時間測定
- **Jest** - テストフレームワーク
- **カスタムPerformanceMonitor** - メトリクス収集

### 参考資料

- [NFR定義 (docs/requirements.md)](./requirements.md)
- [アーキテクチャ設計 (docs/design.md)](./design.md)
- [実装タスク (docs/tasks.md)](./tasks.md)

---

**注意**: 本レポートはテスト実施前のテンプレートです。実際のテスト実行後に実測値を記入してください。

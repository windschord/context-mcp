# TypeScript → Rust Migration Guide

このドキュメントは、Context-MCPプロジェクトのTypeScriptからRustへの完全マイグレーションの詳細を記録します。

## マイグレーション概要

- **移行元**: TypeScript + Node.js
- **移行先**: Rust
- **移行理由**:
  - パフォーマンスの向上（特にAST解析とベクトル演算）
  - メモリ安全性の保証
  - バイナリ配布の簡素化
  - 型安全性の強化

## 主な変更点

### アーキテクチャ

#### 1. モジュール構成

**TypeScript (旧)**
```
src/
├── server/         # MCPサーバー
├── parser/         # AST解析
├── embedding/      # 埋め込みエンジン
├── storage/        # ベクターDB
├── search/         # 検索エンジン
└── indexing/       # インデックス化サービス
```

**Rust (新)**
```
src/
├── server/         # MCPサーバー実装
├── parser/         # AST解析（Tree-sitter）
├── embedding/      # 埋め込みエンジン（ONNX Runtime）
├── storage/        # Milvusクライアント
├── search/         # BM25 + ハイブリッド検索
├── indexing/       # インデックス化サービス
└── error.rs        # 統一エラー型
```

#### 2. 依存関係の変更

| 機能 | TypeScript | Rust |
|------|-----------|------|
| AST解析 | `tree-sitter` (Node.js) | `tree-sitter` (0.24) + 各言語パーサー (0.23) |
| 埋め込み | `transformers.js` | `ort` (ONNX Runtime) |
| ベクターDB | `@zilliz/milvus2-sdk-node` | `vendor/milvus-patched` |
| 全文検索 | SQLite + カスタムBM25 | `rusqlite` + カスタムBM25 |
| 非同期ランタイム | Node.js Event Loop | `tokio` |
| MCPプロトコル | 自前実装 | `rmcp` crate |

### 技術的な詳細

#### 1. Tree-sitterバージョン固定

**現状**: 言語パーサーを0.23.xに固定

**理由**:
- tree-sitter 0.24がC APIに破壊的変更を導入
- 多くの言語パーサーがまだ0.24対応版をリリースしていない

**対応**:
- `Cargo.toml`に詳細なコメントを追加
- 定期的に上流のリリースを監視
- 全パーサーが対応したら一括アップグレード

参考: [Cargo.toml L35-44](/home/tsk/sync/git/lsp_mcp/Cargo.toml:35)

#### 2. ONNX Runtime統合

**TypeScript**: transformers.jsでモデルをロード
**Rust**: `ort` crateでONNX Runtimeを使用

**実装のポイント**:
- `unsafe impl Send + Sync`を使用（SAFETYコメントあり）
- セッションとトークナイザーを`Arc<Mutex<T>>`で保護
- スレッドセーフな推論を保証

参考: [src/embedding/engine.rs:376-385](/home/tsk/sync/git/lsp_mcp/src/embedding/engine.rs:376)

#### 3. Milvusクライアント

**TypeScript**: 公式SDK (`@zilliz/milvus2-sdk-node`)
**Rust**: パッチ版SDK (`vendor/milvus-patched`)

**主な制約**:
- 削除API未実装（上流で未サポート）
- プレースホルダー実装でwarningログを出力

**対応**:
- 詳細なNOTEコメントで将来の実装方針を記載
- 上流へのコントリビューションを検討

参考:
- [src/storage/milvus_client.rs:861-870](/home/tsk/sync/git/lsp_mcp/src/storage/milvus_client.rs:861)
- [src/storage/milvus_client.rs:896-905](/home/tsk/sync/git/lsp_mcp/src/storage/milvus_client.rs:896)

#### 4. エラーハンドリング

**TypeScript**: 例外ベース
**Rust**: `Result<T, ContextMcpError>`

**変更点**:
- 統一エラー型`ContextMcpError`を導入
- `.expect()`を`.ok_or_else()`に置き換え
- MCPプロトコル準拠のエラーレスポンス

参考: [src/error.rs](/home/tsk/sync/git/lsp_mcp/src/error.rs)

## 既知の制限事項

### 1. ドキュメントファイル追跡

**状況**: `IndexProjectResponse.document_files`が常に0を返す

**理由**: インデックス化サービスがドキュメントファイルを個別に追跡していない

**対応方針**:
- Phase 2で`IndexingService`を拡張
- Markdownファイルなどを分類してカウント

参考: [src/server/mod.rs:496-500](/home/tsk/sync/git/lsp_mcp/src/server/mod.rs:496)

### 2. Milvus削除機能

**状況**: `delete()`と`delete_with_filter()`が未実装

**理由**: `vendor/milvus-patched`が削除APIをサポートしていない

**対応方針**:
- 上流の`milvus-sdk-rust`が削除APIを実装するまで待機
- 実装され次第、ベンダーパッチを更新

### 3. テストカバレッジ

**現状**: 36.97%～72.76%（CI環境で80%見込み）

**不足箇所**:
- MCPツール統合テスト
- エンドツーエンドテスト
- エラーケースのカバレッジ

**対応方針**:
- Phase 3でE2Eテストを追加
- CI環境で80%以上を目標

## 移行後の性能

### ベンチマーク（予定）

- [ ] インデックス化速度: TypeScript比
- [ ] 検索レスポンス: TypeScript比
- [ ] メモリ使用量: TypeScript比
- [ ] バイナリサイズ: Node.js配布物比

## 今後のロードマップ

### Phase 1: 安定化（完了）
- [x] 全モジュールのRust移植
- [x] 基本的なテスト実装
- [x] CI/CD構築

### Phase 2: 機能拡張
- [ ] ドキュメントファイル追跡の実装
- [ ] インクリメンタルインデックス更新
- [ ] ファイル監視機能

### Phase 3: 最適化
- [ ] テストカバレッジ80%達成
- [ ] パフォーマンスベンチマーク
- [ ] バイナリサイズ最適化

### Phase 4: エコシステム対応
- [ ] Milvus削除API実装（上流依存）
- [ ] tree-sitter 0.24対応（パーサー更新待ち）
- [ ] 追加言語サポート

## 開発者向けリファレンス

### ビルド環境

```bash
# Rustツールチェーン
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# システム依存関係（Ubuntu/Debian）
sudo apt-get install -y protobuf-compiler libssl-dev pkg-config build-essential

# システム依存関係（macOS）
brew install protobuf
```

### テスト実行

```bash
# 全テスト
cargo test

# カバレッジ計測（tarpaulin）
cargo tarpaulin --out Html --output-dir ./coverage
```

### よくある問題

#### 1. `tree-sitter`パーサーのコンパイルエラー

**原因**: tree-sitter 0.24とパーサー0.23の不整合

**解決策**: `Cargo.toml`のバージョン固定を確認

#### 2. ONNX Runtimeのロードエラー

**原因**: 動的リンクライブラリが見つからない

**解決策**:
```bash
# LD_LIBRARY_PATHを設定
export LD_LIBRARY_PATH=/usr/local/lib:$LD_LIBRARY_PATH
```

#### 3. Milvusコネクションエラー

**原因**: Milvus standaloneが起動していない

**解決策**:
```bash
docker-compose up -d
```

## 課題と今後の対応

### Vendored依存関係の移行

**現状**: `vendor/milvus-patched`ディレクトリに外部依存をコピーし、手動でパッチを適用

**問題点**:
- 上流のセキュリティパッチが自動適用されない
- メンテナンス負担の増加
- 依存関係の透明性が低下
- cargo-auditなどのセキュリティ監査ツールが正常動作しない

**推奨される対応**:
1. milvusクレートのフォークをGitHubに作成
2. パッチを適用してコミット
3. Cargo.tomlで`[patch.crates-io]`セクションを使用:
   ```toml
   [patch.crates-io]
   milvus = { git = "https://github.com/your-fork/milvus-sdk-rust", branch = "fix/lifetime-bug" }
   ```
4. vendor/milvus-patchedディレクトリを削除
5. パッチを上流にPR提出

**参考**: PR #17レビュー指摘 https://github.com/windschord/context-mcp/pull/17#issuecomment-3565505457

**優先度**: 高（マージ後の対応推奨）

## 参考資料

- [CLAUDE.md](/home/tsk/sync/git/lsp_mcp/CLAUDE.md) - プロジェクト概要
- [README.md](/home/tsk/sync/git/lsp_mcp/README.md) - 使用方法
- [docs/design.md](/home/tsk/sync/git/lsp_mcp/docs/design.md) - 設計ドキュメント
- [Cargo.toml](/home/tsk/sync/git/lsp_mcp/Cargo.toml) - 依存関係定義

## 変更履歴

- 2025-11-22: 初版作成（PR #17レビュー対応）

# Context-MCP アーキテクチャドキュメント

## 概要

Context-MCPは、Tree-sitterによるAST解析とベクターDBを組み合わせた、Claude Code向けのModel Context Protocol (MCP)プラグインです。Rustで実装され、レイヤー化されたアーキテクチャを採用し、各コンポーネントが明確な責務を持つ設計となっています。

## システムアーキテクチャ図

```
┌──────────────────────────────────────────────────────────────────────┐
│                           Claude Code                                 │
│                        (Electron Client)                              │
└────────────────────────────┬─────────────────────────────────────────┘
                             │ MCP Protocol (stdio/HTTP)
                             │
┌────────────────────────────▼─────────────────────────────────────────┐
│                      MCP Server Layer                                 │
│  ┌───────────────────────────────────────────────────────────────┐   │
│  │ MCPServer                                                      │   │
│  │  - initialize(), shutdown()                                   │   │
│  │  - handleToolCall()                                           │   │
│  │  - Error Handling & Logging                                   │   │
│  └───────┬───────────────────────────────────────────────────────┘   │
└──────────┼───────────────────────────────────────────────────────────┘
           │
           │ Tool Routing
           │
┌──────────▼───────────────────────────────────────────────────────────┐
│                      Service Layer                                    │
│  ┌──────────────────────┐          ┌──────────────────────────┐      │
│  │  Indexing Service    │          │  Hybrid Search Engine    │      │
│  │  - indexProject()    │          │  - search()              │      │
│  │  - indexFile()       │          │  - mergeResults()        │      │
│  │  - getIndexStatus()  │          │  - rankResults()         │      │
│  │  - deleteProject()   │          └──────┬────────┬──────────┘      │
│  └──────┬───────────────┘                 │        │                 │
└─────────┼─────────────────────────────────┼────────┼─────────────────┘
          │                                 │        │
          │                     ┌───────────┘        └───────────┐
          │                     │                                 │
┌─────────▼─────────────────────▼─────────────────────────────────▼────┐
│                         Parser Layer                                  │
│  ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │ AST Parser      │  │ Document Parser  │  │ BM25 Search      │    │
│  │ ┌─────────────┐ │  │ ┌──────────────┐ │  │ - Tokenizer      │    │
│  │ │ Symbol      │ │  │ │ Markdown     │ │  │ - Inverted Index │    │
│  │ │ Extractor   │ │  │ │ Parser       │ │  │ - BM25 Scoring   │    │
│  │ └─────────────┘ │  │ └──────────────┘ │  └──────────────────┘    │
│  │ ┌─────────────┐ │  │ ┌──────────────┐ │                           │
│  │ │ Comment     │ │  │ │ Doc-Code     │ │                           │
│  │ │ Extractor   │ │  │ │ Linker       │ │                           │
│  │ └─────────────┘ │  │ └──────────────┘ │                           │
│  └────────┬────────┘  └──────────────────┘                           │
│           │ Tree-sitter                                               │
└───────────┼───────────────────────────────────────────────────────────┘
            │
┌───────────▼───────────────────────────────────────────────────────────┐
│                       Storage Layer                                    │
│  ┌───────────────────┐  ┌──────────────────┐  ┌──────────────────┐   │
│  │ Embedding Engine  │  │ Vector Store     │  │ Local Index      │   │
│  │ ┌───────────────┐ │  │                  │  │ (SQLite)         │   │
│  │ │ ONNX Runtime  │ │  │ ┌──────────────┐ │  │ - inverted_index │   │
│  │ │ (Local Only)  │ │  │ │ Milvus       │ │  │ - BM25 data      │   │
│  │ └───────────────┘ │  │ │ Client       │ │  └──────────────────┘   │
│  │                   │  │ └──────────────┘ │                          │
│  └───────────────────┘  └──────────────────┘                          │
└────────────────────────────────┬───────────────────────────────────────┘
                                 │
┌────────────────────────────────▼───────────────────────────────────────┐
│                       External Services                                 │
│  ┌──────────────────┐                      ┌──────────────────┐        │
│  │ Milvus Standalone│                      │ Zilliz Cloud     │        │
│  │ (Docker)         │                      │ (Optional)       │        │
│  └──────────────────┘                      └──────────────────┘        │
└────────────────────────────────────────────────────────────────────────┘

Additional Components:
┌────────────────────────────────────────────────────────────────────────┐
│                       Utilities Layer                                   │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐     │
│  │ File Watcher     │  │ Config Manager   │  │ Logger           │     │
│  │ (notify)         │  │ - Mode Manager   │  │ (tracing)        │     │
│  │ - Incremental    │  │                  │  │ - JSON/Pretty    │     │
│  │   Updates        │  │                  │  │                  │     │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘     │
└────────────────────────────────────────────────────────────────────────┘
```

## レイヤー構成

### 1. MCP Server Layer（MCPサーバー層）

**責務:**
- Claude Codeとの通信管理（MCP Protocol準拠）
- ツール呼び出しのルーティング
- リクエスト/レスポンスのバリデーション
- エラーハンドリングとログ記録

**主要コンポーネント:**
- `MCPServer`: MCP Protocol実装、ツール登録とハンドリング

**提供するツール:**
- `index_project`: プロジェクトインデックス化
- `search_code`: セマンティックコード検索
- `get_symbol`: シンボル定義/参照検索
- `find_related_docs`: 関連ドキュメント検索
- `get_index_status`: インデックス状況確認
- `clear_index`: インデックスクリア

### 2. Service Layer（サービス層）

**責務:**
- ビジネスロジックの実装
- 複数コンポーネントの統合管理
- 進捗追跡と統計情報収集

**主要コンポーネント:**

#### Indexing Service（インデックス化サービス）
- プロジェクトスキャンとファイル列挙
- パーサーへの振り分け
- 埋め込み生成とストレージ保存
- 進捗イベントの発行

#### Hybrid Search Engine（ハイブリッド検索エンジン）
- BM25全文検索とベクトル検索の統合
- 結果のマージとランキング
- フィルタリング（言語、ファイルタイプ等）

**検索スコアリング:**
```
final_score = α × BM25_score + (1-α) × vector_similarity_score
where α = 0.3 (default, configurable)
```

### 3. Parser Layer（パーサー層）

**責務:**
- ソースコードとドキュメントの構造解析
- シンボル情報の抽出
- コメント/docstringの抽出
- ドキュメント-コード関連付け

**主要コンポーネント:**

#### AST Parser（抽象構文木パーサー）
- **SymbolExtractor**: 関数/クラス/変数定義の抽出
- **CommentExtractor**: コメント、docstring、TODOマーカーの抽出
- **ASTEngine**: Tree-sitterを使ったAST生成

**対応言語:**
- TypeScript/JavaScript
- Python
- Go
- Rust
- Java
- C/C++/Arduino

#### Document Parser（ドキュメントパーサー）
- **MarkdownParser**: Markdown構造解析、コードブロック抽出
- **DocCodeLinker**: ドキュメント-コード関連付け

#### BM25 Search（全文検索）
- **Tokenizer**: トークン分割、ストップワード除去
- **Inverted Index**: 転置インデックス管理
- **BM25 Scoring**: BM25アルゴリズム実装

### 4. Storage Layer（ストレージ層）

**責務:**
- データの永続化
- ベクトル検索とメタデータ管理
- 埋め込みベクトル生成

**主要コンポーネント:**

#### Embedding Engine（埋め込みエンジン）
- **ONNX Runtime**: ローカル推論のみ
  - モデル: all-MiniLM-L6-v2（ONNX形式）
  - トークナイザー: tokenizers crate
  - 完全オフライン動作
  - バッチ処理サポート

#### Vector Store（ベクターストア）
Milvusベクターデータベースのみサポート:

**ローカルバックエンド:**
- **Milvus Standalone**: Docker Compose経由で実行
  - 高性能、大規模プロジェクト向け
  - localhost:19530で実行
  - HNSWインデックスによる高速検索

**クラウドバックエンド（オプション）:**
- **Zilliz Cloud**: Milvusマネージドサービス
  - トークン認証
  - スケーラブル

#### Local Index（ローカルインデックス）
- SQLiteベースの転置インデックス
- BM25スコアリングデータ保存

## データフロー

### シーケンス1: プロジェクトインデックス化

```
Claude Code
    │
    │ index_project(rootPath, options)
    ▼
MCP Server
    │
    │ indexProject(rootPath, options)
    ▼
Indexing Service
    │
    ├─ scanFiles(rootPath)
    │  └─ FileScanner → file list
    │
    ├─ [For each source file]
    │  │
    │  ├─ SymbolExtractor.extractSymbols(file)
    │  │  └─ Tree-sitter → AST → definitions
    │  │
    │  ├─ CommentExtractor.extractComments(file)
    │  │  └─ Tree-sitter → comments, docstrings
    │  │
    │  ├─ EmbeddingEngine.embedBatch(texts)
    │  │  └─ vectors[]
    │  │
    │  ├─ VectorStore.upsert(vectors, metadata)
    │  │  └─ Save to Milvus/Chroma
    │  │
    │  └─ BM25Engine.index(texts)
    │     └─ Save to SQLite
    │
    ├─ [For each markdown file]
    │  │
    │  ├─ MarkdownParser.parse(file)
    │  │  └─ sections, code blocks
    │  │
    │  ├─ DocCodeLinker.link(doc, codeSymbols)
    │  │  └─ relevance scores
    │  │
    │  └─ (embed & save as above)
    │
    └─ return IndexResult(stats, errors)
```

### シーケンス2: ハイブリッド検索

```
Claude Code
    │
    │ search_code(query, options)
    ▼
MCP Server
    │
    │ search(query, options)
    ▼
Hybrid Search Engine
    │
    ├─ [Parallel Execution]
    │  │
    │  ├─ BM25Engine.search(query)
    │  │  ├─ tokenize(query)
    │  │  ├─ query SQLite inverted index
    │  │  └─ compute BM25 scores → results_bm25[]
    │  │
    │  └─ VectorStore.query(queryVector, topK)
    │     ├─ EmbeddingEngine.embed(query) → queryVector
    │     ├─ similarity search in Milvus/Chroma
    │     └─ return similar vectors → results_vector[]
    │
    ├─ mergeResults(results_bm25, results_vector)
    │  ├─ normalize scores
    │  ├─ compute: score = α×BM25 + (1-α)×vector
    │  └─ deduplicate
    │
    ├─ rankResults(merged)
    │  └─ sort by final score
    │
    └─ return SearchResults
```

### シーケンス3: インクリメンタル更新

```
File System
    │ file change event
    ▼
File Watcher (notify)
    │
    ├─ debounce(500ms)
    │
    │ onFileChange(filePath)
    ▼
Indexing Service
    │
    ├─ deleteOldEntries(filePath)
    │  ├─ VectorStore.delete(ids)
    │  └─ BM25Engine.remove(filePath)
    │
    ├─ indexFile(filePath)
    │  └─ (same as indexing flow above)
    │
    └─ emit('indexUpdated', filePath)
```

## コンポーネント詳細

### MCP Server

**ファイル:** `src/server/mod.rs`

**主要構造体:**
- `ContextMcpServer`: メインサーバー構造体
- `ServerState`: 内部状態管理

**主要メソッド:**
- `initialize()`: サーバー初期化、ツール登録
- `new()` / `with_config()`: インスタンス作成
- `index_project()`: プロジェクトインデックス化ツール
- `search_code()`: セマンティックコード検索ツール
- `get_symbol()`: シンボル検索ツール
- `find_related_docs()`: 関連ドキュメント検索ツール
- `get_index_status()`: インデックス状況確認ツール
- `clear_index()`: インデックスクリアツール

### Indexing Service

**ファイル:** `src/indexing/service.rs`

**主要メソッド:**
- `index_project(config: IndexConfig)`: プロジェクト全体インデックス化
- `index_file(path: PathBuf)`: 単一ファイルインデックス化
- `get_stats()`: インデックス統計取得
- `clear_index()`: インデックスクリア

**並列処理:**
- rayon による並列ファイル処理
- バッチ埋め込み生成

### Hybrid Search Engine

**ファイル:** `src/search/hybrid_engine.rs`

**主要メソッド:**
- `search(query, collection, top_k)`: ハイブリッド検索
- `search_with_config(query, collection, config)`: 設定付きハイブリッド検索

**設定:**
- `alpha`: BM25の重み（デフォルト: 0.3）
- `normalization`: スコア正規化方式（MinMax/ZScore/None）
- `bm25_top_k`, `vector_top_k`: 各検索の取得数

### Milvus Client

**ファイル:** `src/storage/milvus_client.rs`

**主要メソッド:**
- `new(address)` / `new_with_token(address, token)`: 接続作成
- `create_collection(config)`: コレクション作成
- `collection_exists(name)`: コレクション存在確認
- `insert_records(collection, records)`: レコード挿入
- `search(collection, vectors, limit)`: ベクトル検索
- `delete_by_expr(collection, expr)`: 条件付き削除
- `get_collection_stats(name)`: 統計情報取得

### Embedding Engine

**ファイル:** `src/embedding/engine.rs`

**主要構造体:**
- `EmbeddingEngine`: ONNX Runtimeベースの埋め込みエンジン
- `EmbeddingConfig`: 設定

**主要メソッド:**
- `new(config)`: エンジン作成・初期化
- `embed(text)`: 単一テキスト埋め込み
- `embed_batch(texts)`: バッチ埋め込み
- `dimension()`: ベクトル次元数取得

## データベーススキーマ

### Vector DB Collection: `code_vectors`

| フィールド | 型 | 説明 |
|-----------|------|------|
| id | string | 一意識別子（filePath:lineStart） |
| vector | float[] | 埋め込みベクトル |
| project_id | string | プロジェクトID |
| file_path | string | ファイルパス |
| language | string | 言語（typescript, python等） |
| type | string | エントリタイプ（function, class等） |
| name | string | シンボル名 |
| line_start | int | 開始行番号 |
| line_end | int | 終了行番号 |
| snippet | string | コードスニペット（最大500文字） |
| docstring | string | docstring/コメント |
| scope | string | スコープ（module, class, function） |
| metadata | json | 追加メタデータ |
| created_at | timestamp | 作成日時 |
| updated_at | timestamp | 更新日時 |

### Local Index (SQLite): `inverted_index`

```sql
CREATE TABLE inverted_index (
  term TEXT NOT NULL,
  document_id TEXT NOT NULL,
  frequency INTEGER NOT NULL,
  positions TEXT, -- JSON array of positions
  PRIMARY KEY (term, document_id)
);

CREATE INDEX idx_term ON inverted_index(term);
CREATE INDEX idx_doc_id ON inverted_index(document_id);
```

## プライバシーファースト設計

### ローカルモード（デフォルト）
- **埋め込み**: ONNX Runtime（完全ローカル実行）
- **ベクターDB**: Milvus standalone（Docker）
- **外部通信**: ベクターDBへの接続のみ（ローカルホスト）
- **利点**: プライバシー保護、オフライン動作、APIコスト不要

### クラウドモード（オプション）
- **埋め込み**: ONNX Runtime（ローカル実行は変わらず）
- **ベクターDB**: Zilliz Cloud
- **外部通信**: Zilliz Cloudへの接続
- **利点**: セットアップ簡単、スケーラブル、Docker不要

### モード切り替え
設定ファイルの `milvus.address` と `milvus.token` で切り替え:
- ローカル: `address: "localhost:19530"`, `token: null`
- クラウド: `address: "your-instance.zilliz.com:19530"`, `token: "your-token"`

## パフォーマンス最適化

### インデックス化
- **並列処理**: rayon による並列ファイル処理
- **バッチ埋め込み**: 複数テキストを一度に処理（設定可能なバッチサイズ）
- **インクリメンタル更新**: 変更ファイルのみ再インデックス化（notify によるファイル監視）

### 検索
- **並列検索**: BM25とベクトル検索を非同期並列実行（tokio）
- **インデックス最適化**: HNSWインデックス（Milvus）
- **スコア正規化**: MinMax/ZScore による正確なスコア統合

### メモリ管理
- **Arc/RwLock**: スレッドセーフな状態共有
- **ONNX Session再利用**: 埋め込みモデルの効率的な利用
- **SQLite接続プール**: BM25検索の高速化

## セキュリティ考慮事項

### データ保護
- センシティブファイル自動除外（`.env`, `credentials.json`等）
- ローカル埋め込み実行（外部APIへのコード送信なし）
- Milvus接続はローカルホストまたは信頼できるクラウドのみ

### 認証情報管理
- Zilliz Cloudトークンは環境変数から読み取り推奨
- 設定ファイル内の平文保存に注意（.gitignore 推奨）

### 通信暗号化
- Milvus/Zilliz Cloud接続: TLS/SSL対応
- ローカルモード: localhost通信のみ

## 拡張性

### 新しい言語パーサーの追加
Tree-sitterの言語パーサーを追加することで、新しいプログラミング言語をサポート可能:

1. `Cargo.toml` に言語パーサークレートを追加
2. `src/parser/types.rs` の `Language` enumに追加
3. `src/parser/symbol_extractor.rs` で対応するパーサー初期化を追加
4. 必要に応じてクエリパターンをカスタマイズ

### カスタムベクターストアの追加
現在はMilvusのみサポートしていますが、他のベクターDBへの対応も可能:

1. `src/storage/` に新しいクライアントモジュールを追加
2. 必要なメソッドを実装（insert、search、delete等）
3. `src/storage/mod.rs` で公開
4. `src/server/mod.rs` で切り替え可能にする

## エラーハンドリング

### エラーカテゴリ
`src/error.rs` で定義された `ContextMcpError`:
- **Config**: 設定エラー
- **Io**: ファイルシステムエラー
- **Parse**: パースエラー
- **Storage**: ベクターDBエラー
- **Embedding**: 埋め込み生成エラー
- **Search**: 検索エラー
- **Internal**: 内部エラー

### リカバリー戦略
- **部分的失敗の許容**: 単一ファイルエラーで全体停止しない
- **エラーログ記録**: tracing クレートによる詳細ログ
- **ユーザーフレンドリーなエラーメッセージ**: MCPプロトコル経由で返却

### エラー通知
すべてのエラーには以下を含む:
- エラーの種類（enum variant）
- わかりやすいメッセージ
- 元エラー情報（where applicable）

## 技術スタック

- **言語**: Rust（MSRV 1.75、推奨 1.80+）
- **MCP SDK**: rmcp 0.8（公式Rust SDK）
- **非同期ランタイム**: tokio 1.41
- **並列処理**: rayon 1.10
- **AST解析**: tree-sitter 0.24（言語パーサーは 0.23.x）
- **埋め込み**: ONNX Runtime（ort 2.0.0-rc.10）
- **トークナイザー**: tokenizers 0.20
- **ベクターDB**: Milvus（milvus クレート）
- **全文検索**: rusqlite 0.32（SQLiteバンドル）
- **ファイル監視**: notify 6.1
- **ログ**: tracing + tracing-subscriber
- **エラーハンドリング**: thiserror + anyhow

## ビルドとテスト

### ビルドコマンド
```bash
# デバッグビルド
cargo build

# リリースビルド
cargo build --release

# コンパイルチェックのみ
cargo check

# Lint実行
cargo clippy --all-targets --all-features

# フォーマット
cargo fmt --all
```

### テストコマンド
```bash
# 全テスト実行
cargo test

# ライブラリテストのみ
cargo test --lib

# 詳細出力
cargo test --verbose

# 全機能有効化してテスト
cargo test --all-features
```

## 関連ドキュメント

- [セットアップガイド](./SETUP.md)
- [設定リファレンス](./CONFIGURATION.md)
- [MCP Tools APIリファレンス](./MCP_TOOLS_API.md)
- [Rust移行ガイド](./MIGRATION.md)

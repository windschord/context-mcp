# LSP-MCP

Tree-sitterによるAST解析とベクターDBを組み合わせた、Claude Code向けのModel Context Protocol (MCP)プラグインです。

## 概要

LSP-MCPは、ソースコードとドキュメントを統合的に解析し、セマンティック検索を提供することで、Claude Codeのコンテキスト理解を大幅に向上させます。

### 主な特徴

- **トークン削減**: コンテキストトークン使用量を30-40%削減
- **高精度検索**: ハイブリッド検索（BM25 + Vector）による関連性の高い検索結果
- **プライバシーファースト**: デフォルトでローカル完結実行（外部通信なし）
- **多言語対応**: TypeScript/JavaScript, Python, Go, Rust, Java, C/C++/Arduino
- **ドキュメント統合**: Markdownとソースコードの自動関連付け
- **インクリメンタル更新**: ファイル変更の自動検知と再インデックス化

## 主要機能

LSP-MCPは以下の6つのMCPツールを提供します:

### 1. `index_project`
プロジェクト全体をインデックス化します。
- ソースコードのAST解析
- Markdownドキュメントの構造解析
- ベクターDB・全文検索インデックスへの格納
- 進捗状況のリアルタイム表示

### 2. `search_code`
セマンティックコード検索を実行します。
- ハイブリッド検索（BM25 + ベクトル検索）
- ファイルタイプ・言語によるフィルタリング
- 関連度スコア付き結果
- コードスニペット表示

### 3. `get_symbol`
シンボル（関数・クラス・変数）の定義と参照を検索します。
- 定義箇所の特定
- 参照箇所の一覧表示
- スコープ情報の提供
- 型情報の表示

### 4. `find_related_docs`
コードに関連するドキュメントを検索します。
- コード-ドキュメント間の自動関連付け
- 関連度スコアによるソート
- ファイルパス参照の解決
- コードブロック類似度検出

### 5. `get_index_status`
インデックス状態を確認します。
- インデックス化されたファイル数
- 最終更新日時
- インデックスサイズ
- エラー情報

### 6. `clear_index`
インデックスをクリアします。
- ベクターDBのクリア
- 全文検索インデックスのクリア
- メタデータの削除

## インストール

### 前提条件

- Node.js 18.0以上
- npm 9.0以上
- Docker & Docker Compose（Milvus使用時、推奨）

### npx経由で使用（最も簡単、推奨）

GitHubリポジトリから直接実行できます:

```bash
# GitHubリポジトリから直接実行
npx github:windschord/lsp-mcp --help
npx github:windschord/lsp-mcp --version
npx github:windschord/lsp-mcp

# または完全なURL形式
npx git+https://github.com/windschord/lsp-mcp.git

# 特定のブランチ・タグから実行
npx github:windschord/lsp-mcp#main
npx github:windschord/lsp-mcp#v0.1.0
```

### ローカルインストール（開発時）

```bash
git clone https://github.com/windschord/lsp-mcp.git
cd lsp-mcp
npm install
npm run build
```

## クイックスタート

設定ファイル不要で、Docker Compose起動とMCP設定のみで即座に使用開始できます。

### 1. Milvus standaloneの起動

```bash
# プロジェクトのルートディレクトリで実行
cd /path/to/your/project

# docker-compose.ymlをダウンロード（初回のみ）
curl -O https://raw.githubusercontent.com/windschord/lsp-mcp/main/docker-compose.yml

# Milvus standalone起動
docker-compose up -d

# 起動確認（milvus-standaloneが起動していることを確認）
docker ps
```

### 2. Claude CodeにMCP設定を追加

#### 方法1: claude mcp addコマンドで追加（推奨）

```bash
claude mcp add --transport stdio lsp-mcp \
  --env LSP_MCP_MODE=local \
  --env LSP_MCP_VECTOR_ADDRESS=localhost:19530 \
  --env LOG_LEVEL=INFO \
  -- npx github:windschord/lsp-mcp
```

設定後、Claude Codeを再起動してください。

#### 方法2: JSONファイルを直接編集

Claude Codeの設定ファイル（macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`）に以下を追加:

```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "npx",
      "args": ["github:windschord/lsp-mcp"],
      "env": {
        "LSP_MCP_MODE": "local",
        "LSP_MCP_VECTOR_ADDRESS": "localhost:19530",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

設定後、Claude Codeを再起動してください。

### 3. 使用開始

Claude Codeで以下のように指示するだけで、自動的にプロジェクトがインデックス化されます:

```
@lsp-mcp プロジェクトをインデックス化してください
```

以降、セマンティック検索が利用可能になります:

```
@lsp-mcp 「認証機能」に関連するコードを検索してください
```

```
@lsp-mcp getUserById関数の定義と使用箇所を教えてください
```

### （オプション）設定ファイルによるカスタマイズ

環境変数だけでなく、プロジェクトごとに設定をカスタマイズしたい場合は、`.lsp-mcp.json`を作成します:

```bash
# プロジェクトルートで設定ファイルを作成
cd /path/to/your/project
```

`.lsp-mcp.json`の例:

```json
{
  "mode": "local",
  "vectorStore": {
    "backend": "milvus",
    "config": {
      "address": "localhost:19530"
    }
  },
  "embedding": {
    "provider": "transformers",
    "model": "Xenova/all-MiniLM-L6-v2"
  },
  "indexing": {
    "excludePatterns": [
      "node_modules/**",
      ".git/**",
      "dist/**"
    ],
    "languages": ["typescript", "python", "go"]
  }
}
```

設定ファイルと環境変数を併用する場合、**環境変数が優先**されます。

## Claude Codeでの使用方法

### MCP設定の詳細

以下、各モードでの設定例を示します。コマンドと設定ファイル編集の両方の方法を記載しています。

#### 設定例1: ローカルモード（環境変数のみ、推奨）

Docker Composeで起動したMilvus standaloneを使用する最もシンプルな設定です。

**claude mcp addコマンド**:
```bash
claude mcp add --transport stdio lsp-mcp \
  --env LSP_MCP_MODE=local \
  --env LSP_MCP_VECTOR_ADDRESS=localhost:19530 \
  --env LOG_LEVEL=INFO \
  -- npx github:windschord/lsp-mcp
```

**JSONファイル編集**:
```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "npx",
      "args": ["github:windschord/lsp-mcp"],
      "env": {
        "LSP_MCP_MODE": "local",
        "LSP_MCP_VECTOR_ADDRESS": "localhost:19530",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

#### 設定例2: クラウドモード（Zilliz Cloud使用）

**claude mcp addコマンド**:
```bash
claude mcp add --transport stdio lsp-mcp \
  --env LSP_MCP_MODE=cloud \
  --env LSP_MCP_VECTOR_BACKEND=zilliz \
  --env LSP_MCP_VECTOR_ADDRESS=your-instance.zilliz.com:19530 \
  --env LSP_MCP_VECTOR_TOKEN=your-zilliz-token \
  --env LSP_MCP_EMBEDDING_PROVIDER=openai \
  --env LSP_MCP_EMBEDDING_API_KEY=your-openai-api-key \
  --env LOG_LEVEL=INFO \
  -- npx github:windschord/lsp-mcp
```

**JSONファイル編集**:
```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "npx",
      "args": ["github:windschord/lsp-mcp"],
      "env": {
        "LSP_MCP_MODE": "cloud",
        "LSP_MCP_VECTOR_BACKEND": "zilliz",
        "LSP_MCP_VECTOR_ADDRESS": "your-instance.zilliz.com:19530",
        "LSP_MCP_VECTOR_TOKEN": "your-zilliz-token",
        "LSP_MCP_EMBEDDING_PROVIDER": "openai",
        "LSP_MCP_EMBEDDING_API_KEY": "your-openai-api-key",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

#### 設定例3: ローカル開発時

リポジトリをクローンして開発している場合の設定です。

**claude mcp addコマンド**:
```bash
claude mcp add --transport stdio lsp-mcp \
  --env LSP_MCP_MODE=local \
  --env LOG_LEVEL=DEBUG \
  -- node /path/to/lsp_mcp/bin/lsp-mcp.js
```

**JSONファイル編集**:
```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "node",
      "args": ["/path/to/lsp_mcp/bin/lsp-mcp.js"],
      "env": {
        "LSP_MCP_MODE": "local",
        "LOG_LEVEL": "DEBUG"
      }
    }
  }
}
```

### 環境変数リファレンス

| 環境変数 | 説明 | デフォルト値 | 例 |
|---------|------|------------|-----|
| `LSP_MCP_MODE` | 動作モード | `local` | `local`, `cloud` |
| `LSP_MCP_VECTOR_BACKEND` | ベクターDB | `milvus` | `milvus`, `zilliz` |
| `LSP_MCP_VECTOR_ADDRESS` | ベクターDBアドレス | `localhost:19530` | `localhost:19530` |
| `LSP_MCP_VECTOR_TOKEN` | ベクターDB認証トークン | なし | Zilliz Cloudトークン |
| `LSP_MCP_EMBEDDING_PROVIDER` | 埋め込みプロバイダー | `transformers` | `transformers`, `openai`, `voyageai` |
| `LSP_MCP_EMBEDDING_API_KEY` | 埋め込みAPIキー | なし | OpenAI APIキー |
| `LOG_LEVEL` | ログレベル | `INFO` | `DEBUG`, `INFO`, `WARN`, `ERROR` |

詳細は[環境変数リファレンス](docs/ENVIRONMENT_VARIABLES.md)を参照してください。

### 設定の確認

```bash
# 追加されたMCPサーバーを確認
claude mcp list

# 特定のサーバーの詳細を確認
claude mcp show lsp-mcp

# 設定ファイルを直接確認（macOS）
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

設定後、**Claude Codeを再起動**してください。

## 設定

詳細な設定方法については、以下のドキュメントを参照してください:

- [セットアップガイド](docs/SETUP.md) - 詳細なインストール手順
- [設定リファレンス](docs/CONFIGURATION.md) - 設定ファイルの詳細
- [トラブルシューティング](docs/TROUBLESHOOTING.md) - よくある問題と解決方法

### 設定例

#### ローカルモード（Milvus）

```json
{
  "mode": "local",
  "vectorStore": {
    "backend": "milvus",
    "config": {
      "address": "localhost:19530"
    }
  },
  "embedding": {
    "provider": "transformers",
    "model": "Xenova/all-MiniLM-L6-v2"
  }
}
```

#### クラウドモード（OpenAI + Zilliz）

```json
{
  "mode": "cloud",
  "vectorStore": {
    "backend": "zilliz",
    "config": {
      "address": "your-instance.zilliz.com:19530",
      "token": "${ZILLIZ_TOKEN}"
    }
  },
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "apiKey": "${OPENAI_API_KEY}"
  }
}
```

## プロジェクト状態

### 開発フェーズ完了状況

LSP-MCPは**フェーズ1〜7のすべてのタスクが完了**しており、本番利用可能な状態です。

- **フェーズ1**: プロジェクトセットアップとMCPサーバー基盤 (完了)
- **フェーズ2**: AST解析とドキュメント解析 (完了)
- **フェーズ3**: ベクターDB統合と検索機能 (完了)
- **フェーズ4**: Indexing ServiceとMCPツール実装 (完了)
- **フェーズ5**: インクリメンタル更新とファイル監視 (完了)
- **フェーズ6**: テストとドキュメント化 (完了)
- **フェーズ7**: 最適化とリリース準備 (完了)

### 実装済み機能

**MCPツール (6つ)**:
- `index_project`: プロジェクト全体のインデックス化
- `search_code`: セマンティックコード検索
- `get_symbol`: シンボル定義・参照検索
- `find_related_docs`: コード関連ドキュメント検索
- `get_index_status`: インデックス状態確認
- `clear_index`: インデックスクリア

**対応言語 (7言語)**:
- TypeScript/JavaScript、Python、Go、Rust、Java、C/C++/Arduino

**ベクターDB**:
- Milvus standalone（Docker Compose）
- Zilliz Cloud（クラウド）

**埋め込みエンジン**:
- Transformers.js（ローカル、デフォルト）
- OpenAI API（クラウド）
- VoyageAI API（クラウド）

**パフォーマンス最適化**:
- ParserPool: Tree-sitterパーサーの再利用
- QueryCache: LRUキャッシュ（1000件、TTL 1時間）
- バッチ埋め込み処理
- Promise並列処理

### 詳細情報

詳しくは以下のドキュメントを参照してください：
- [タスク管理](docs/tasks.md) - 実装タスクの詳細と完了状況
- [設計書](docs/design.md) - システムアーキテクチャと設計方針
- [パフォーマンスレポート](docs/performance-report.md) - 最適化内容とNFR検証

## 開発

### ビルド

```bash
# TypeScriptコンパイル
npm run build

# ウォッチモード
npm run dev
```

### テスト

```bash
# 全テスト実行
npm test

# ウォッチモード
npm run test:watch

# カバレッジレポート
npm run test:coverage
```

### パフォーマンステスト

```bash
# 大規模サンプルプロジェクトの生成（初回のみ）
npm run perf:generate

# パフォーマンステスト実行
npm run test:performance
```

### Lint & Format

```bash
# Lint
npm run lint
npm run lint:fix

# Format
npm run format
npm run format:check
```

## パフォーマンス

### ベンチマーク目標

- **インデックス化**: 10,000ファイル/10分以内（ローカルモード）
- **検索レスポンス**: 2秒以内
- **メモリ使用量**: 2GB以内
- **インクリメンタル更新**: 1ファイル/100ms以内

詳細は[パフォーマンスレポート](docs/performance-report.md)を参照してください。

## 対応言語

### 優先度: 高（Tree-sitterパーサー完備）

- TypeScript / JavaScript
- Python
- Go
- Rust
- Java
- C / C++ / Arduino

### 優先度: 中（将来対応予定）

- Ruby
- PHP
- C#
- Swift
- Kotlin

## アーキテクチャ

```
┌─────────────────┐
│   Claude Code   │
└────────┬────────┘
         │ MCP Protocol
         v
┌─────────────────┐
│  MCP Server     │
│  Layer          │
└────────┬────────┘
         │
    ┌────┴────┐
    v         v
┌────────┐ ┌────────┐
│Search  │ │Indexing│
│Service │ │Service │
└───┬────┘ └───┬────┘
    │          │
    v          v
┌────────────────┐
│  Hybrid Search │
│  (BM25+Vector) │
└────────────────┘
    │          │
    v          v
┌────────┐ ┌────────┐
│Vector  │ │Local   │
│DB      │ │Index   │
│(Milvus)│ │(SQLite)│
└────────┘ └────────┘
```

詳細は[設計書](docs/design.md)を参照してください。

## プライバシー

LSP-MCPはプライバシーファースト設計を採用しています:

- **デフォルトはローカル実行**: 外部通信なし
- **センシティブファイル自動除外**: `.env`, `credentials.json`等
- **暗号化**: APIキーはOSキーチェーンに保存
- **オプトイン方式**: クラウドモードは明示的に選択が必要

## 謝辞

本プロジェクトは、Zillizが開発した[Claude Context](https://github.com/zilliztech/claude-context)から大きなインスパイアを受けています。ハイブリッド検索の有効性とMCP統合のアプローチに深く感謝します。

## ライセンス

MIT License - 詳細は[LICENSE](LICENSE)ファイルを参照してください。

## コントリビューション

コントリビューションを歓迎します！以下の手順でお願いします:

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add some amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエストを作成

## サポート

- [Issue Tracker](https://github.com/windschord/lsp-mcp/issues)
- [ディスカッション](https://github.com/windschord/lsp-mcp/discussions)
- [ドキュメント](docs/)

## リンク

- [要件定義](docs/requirements.md)
- [設計書](docs/design.md)
- [タスク管理](docs/tasks.md)
- [セットアップガイド](docs/SETUP.md)
- [設定リファレンス](docs/CONFIGURATION.md)
- [トラブルシューティング](docs/TROUBLESHOOTING.md)
- [パフォーマンスレポート](docs/performance-report.md)
- [ボトルネック分析](docs/bottleneck-analysis.md)

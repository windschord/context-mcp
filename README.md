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

### 1. 初期設定

プロジェクトルートで設定ファイルを作成します:

```bash
# 軽量モード（Docker不要、Chroma使用）
lsp-mcp init --mode local-lite

# 標準モード（Milvus standalone使用、Docker必要）
lsp-mcp init --mode local

# クラウドモード（外部API使用）
lsp-mcp init --mode cloud
```

設定ファイル`.lsp-mcp.json`が生成されます。

### 2. Milvusのセットアップ（標準モード使用時）

```bash
# Milvus standalone起動
docker-compose -f milvus-standalone-docker-compose.yml up -d

# 起動確認
docker ps
```

### 3. プロジェクトのインデックス化

```bash
# 現在のディレクトリをインデックス化
lsp-mcp index .

# 特定のディレクトリをインデックス化
lsp-mcp index /path/to/project

# 言語を指定してインデックス化
lsp-mcp index . --languages typescript,python
```

## Claude Codeでの使用方法

### 1. MCP設定ファイルに追加

#### 方法A: `claude add`コマンドを使用（最も簡単、推奨）

```bash
# GitHubリポジトリから直接使用（推奨）
claude add lsp-mcp npx github:windschord/lsp-mcp

# ローカル開発時
claude add lsp-mcp node /path/to/lsp_mcp/bin/lsp-mcp.js

# 環境変数を指定する場合
claude add lsp-mcp npx github:windschord/lsp-mcp --env LSP_MCP_MODE=local --env LOG_LEVEL=INFO
```

設定後、Claude Codeを再起動してください。

#### 方法B: 設定ファイルを直接編集

Claude Codeの設定ファイル（macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`）に以下を追加:

##### GitHubリポジトリから直接使用（推奨）

```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "npx",
      "args": ["github:windschord/lsp-mcp"],
      "env": {
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

##### ローカル開発時

```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "node",
      "args": ["/path/to/lsp_mcp/bin/lsp-mcp.js"],
      "env": {
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

### 2. 設定の確認

```bash
# 追加されたサーバーを確認
claude list

# 設定ファイルを直接確認（macOS）
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json
```

### 3. Claude Codeを再起動

設定を反映させるため、Claude Codeを再起動します。

### 4. 使用例

Claude Codeで以下のように指示します:

```
@lsp-mcp プロジェクトをインデックス化してください
```

```
@lsp-mcp 「認証機能」に関連するコードを検索してください
```

```
@lsp-mcp getUserById関数の定義と使用箇所を教えてください
```

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

#### 軽量モード（Chroma、Docker不要）

```json
{
  "mode": "local",
  "vectorStore": {
    "backend": "chroma",
    "config": {
      "path": "./.lsp-mcp/chroma"
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

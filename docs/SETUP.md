# セットアップガイド

このガイドでは、Context-MCPの詳細なインストール手順とセットアップ方法を説明します。

## 目次

- [前提条件](#前提条件)
- [インストール方法](#インストール方法)
- [クイックスタート（ゼロコンフィグモード）](#クイックスタートゼロコンフィグモード)
- [モード選択](#モード選択)
- [標準モード（Milvus）のセットアップ](#標準モードmilvusのセットアップ)
- [クラウドモードのセットアップ](#クラウドモードのセットアップ)
- [環境変数による設定](#環境変数による設定)
- [設定ファイルによるカスタマイズ](#設定ファイルによるカスタマイズ)
- [Claude Code統合](#claude-code統合)
- [初期インデックス化](#初期インデックス化)
- [動作確認](#動作確認)

## 前提条件

### 必須環境

- **Node.js**: 18.0以上（推奨: 20.x LTS）
- **npm**: 9.0以上
- **OS**: macOS, Linux, Windows（WSL2推奨）
- **メモリ**: 最低4GB（推奨: 8GB以上）
- **ディスク**: 最低5GB以上の空き容量

### モード別の追加要件

#### 軽量モード（Chroma）
- 追加要件なし（最も簡単）

#### 標準モード（Milvus）
- **Docker**: 20.10以上
- **Docker Compose**: v2.0以上
- **追加メモリ**: Milvus用に2GB以上

#### クラウドモード
- **API キー**: OpenAI API キーまたはVoyageAI APIキー
- **ベクターDB アカウント**: Zilliz CloudまたはQdrant Cloud

## インストール方法

### 方法1: グローバルインストール（推奨）

```bash
# npmでグローバルインストール
npm install -g context-mcp

# インストール確認
context-mcp --version
```

### 方法2: ローカルインストール（開発者向け）

```bash
# リポジトリのクローン
git clone https://github.com/yourusername/context-mcp.git
cd context-mcp

# 依存関係のインストール
npm install

# TypeScriptのビルド
npm run build

# 動作確認
node dist/index.js --version
```

### 方法3: npx経由で使用（インストール不要、推奨）

```bash
# GitHubリポジトリから直接使用
npx github:windschord/context-mcp --version
```

## クイックスタート（ゼロコンフィグモード）

**最も簡単な方法**: 設定ファイル不要で、Docker Compose起動とMCP設定のみで即座に使用開始できます。

### ステップ1: Milvus standaloneの起動

```bash
# プロジェクトのルートディレクトリで実行
cd /path/to/your/project

# docker-compose.ymlをダウンロード（初回のみ）
curl -O https://raw.githubusercontent.com/windschord/context-mcp/main/docker-compose.yml

# Milvus standalone起動
docker-compose up -d

# 起動確認（milvus-standaloneが起動していることを確認）
docker ps
```

### ステップ2: Claude CodeにMCP設定を追加

Claude Codeの設定ファイル（macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`）に以下を追加:

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "npx",
      "args": ["github:windschord/context-mcp"],
      "env": {
        "LSP_MCP_MODE": "local",
        "LSP_MCP_VECTOR_ADDRESS": "localhost:19530",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

設定後、**Claude Codeを再起動**してください。

### ステップ3: 使用開始

Claude Codeで以下のように指示するだけで、自動的にプロジェクトがインデックス化されます:

```
@context-mcp プロジェクトをインデックス化してください
```

これで完了です。より詳細な設定やカスタマイズが必要な場合は、以下のセクションを参照してください。

## モード選択

Context-MCPは2つの動作モードをサポートしています:

| モード | 特徴 | 推奨用途 | 外部通信 | セットアップ難易度 |
|--------|------|----------|----------|-------------------|
| **ローカルモード**（デフォルト） | Milvus standalone使用、Transformers.js埋め込み | ほとんどのユースケース、プライバシー重視 | なし | 簡単（Docker必要） |
| **クラウドモード** | Zilliz Cloud、OpenAI API使用 | 大規模プロジェクト、チーム利用、最高性能 | あり | 中程度（アカウント・APIキー必要） |

### モード選択のフローチャート

```
どのモードを選択しますか？

プライバシー重視 or Docker環境あり？
├─ Yes → ローカルモード（推奨）
│         ・外部通信なし
│         ・Docker Composeでセットアップ
│         ・コスト: 無料
│
└─ No → クラウドモード
          ・高速・高精度
          ・APIキー必要
          ・コスト: 従量課金（OpenAI、Zilliz Cloud）
```

### モード別の要件比較

| 項目 | ローカルモード | クラウドモード |
|-----|-------------|--------------|
| Docker | 必要 | 不要 |
| インターネット接続 | 不要（初回モデルDL時のみ） | 必要 |
| APIキー | 不要 | 必要（OpenAI、Zilliz） |
| コスト | 無料 | 従量課金 |
| プライバシー | 完全ローカル | データ送信あり |
| 検索速度 | 高速 | 最速 |
| セットアップ時間 | 5分 | 10分（アカウント作成含む） |

## 標準モード（Milvus）のセットアップ

高速なベクトル検索が必要な場合に推奨されます。

### ステップ1: Dockerのインストール確認

```bash
# Dockerバージョン確認
docker --version
# Docker version 20.10.0以上が必要

# Docker Composeバージョン確認
docker compose version
# Docker Compose version v2.0.0以上が必要
```

インストールされていない場合:
- macOS: [Docker Desktop for Mac](https://docs.docker.com/desktop/install/mac-install/)
- Linux: [Docker Engine](https://docs.docker.com/engine/install/)
- Windows: [Docker Desktop for Windows](https://docs.docker.com/desktop/install/windows-install/) + WSL2

### ステップ2: Milvus Docker Composeファイルの取得

```bash
# プロジェクトルートで実行
cd /path/to/your/project

# Docker Composeファイルをダウンロード
curl -O https://github.com/milvus-io/milvus/releases/download/v2.4.0/docker-compose.yml
```

または、Context-MCPが自動ダウンロードします:

```bash
context-mcp milvus download
```

### ステップ3: Milvusの起動

```bash
# Milvus standaloneを起動
docker compose -f docker-compose.yml up -d

# 起動確認（3つのコンテナが起動）
docker ps
# CONTAINER ID   IMAGE                    STATUS
# xxxxx          milvusdb/milvus:latest   Up X minutes
# xxxxx          minio/minio:latest       Up X minutes
# xxxxx          quay.io/coreos/etcd:latest Up X minutes

# ログ確認
docker compose -f docker-compose.yml logs -f milvus
# "Milvus Proxy started successfully" が表示されればOK
```

### ステップ4: 設定ファイルの作成

```bash
context-mcp init --mode local
```

以下の`.context-mcp.json`が生成されます:

```json
{
  "mode": "local",
  "vectorStore": {
    "backend": "milvus",
    "config": {
      "address": "localhost:19530",
      "standalone": true,
      "dataPath": "./volumes"
    }
  },
  "embedding": {
    "provider": "transformers",
    "model": "Xenova/all-MiniLM-L6-v2",
    "local": true
  },
  "privacy": {
    "blockExternalCalls": true
  }
}
```

### ステップ5: 接続確認

```bash
# Milvusへの接続テスト
context-mcp test-connection

# 成功すると以下が表示されます:
# ✓ Milvus connection successful
# ✓ Server version: 2.4.0
```

### ステップ6: データの永続化

Milvusのデータは`./volumes/`ディレクトリに保存されます。

```bash
# データディレクトリの確認
ls -la volumes/
# volumes/
# ├── etcd/
# ├── minio/
# └── milvus/

# バックアップ（推奨）
tar czf milvus-backup-$(date +%Y%m%d).tar.gz volumes/
```

### Milvusの停止・再起動

```bash
# 停止
docker compose -f docker-compose.yml down

# 再起動
docker compose -f docker-compose.yml restart

# 完全削除（データも削除）
docker compose -f docker-compose.yml down -v
rm -rf volumes/
```

## クラウドモードのセットアップ

大規模プロジェクトやチーム利用に適しています。

### ステップ1: ベクターDBアカウントの作成

#### Zilliz Cloud（推奨）

1. [Zilliz Cloud](https://cloud.zilliz.com/)にサインアップ
2. クラスターを作成:
   - **Region**: 最寄りのリージョンを選択
   - **Cluster Type**: Starter（無料枠あり）または Standard
3. 接続情報を取得:
   - **Endpoint**: `xxx-xxx.vectordb.zillizcloud.com:19530`
   - **Token**: APIトークンを生成

#### Qdrant Cloud（代替）

1. [Qdrant Cloud](https://cloud.qdrant.io/)にサインアップ
2. クラスターを作成
3. APIキーを取得

### ステップ2: 埋め込みAPIキーの取得

#### OpenAI（推奨）

1. [OpenAI Platform](https://platform.openai.com/)にサインアップ
2. APIキーを生成: https://platform.openai.com/api-keys
3. 使用モデル: `text-embedding-3-small`（推奨）または `text-embedding-ada-002`

#### VoyageAI（代替）

1. [VoyageAI](https://www.voyageai.com/)にサインアップ
2. APIキーを取得
3. 使用モデル: `voyage-code-2`（コード特化）

### ステップ3: 環境変数の設定

APIキーは環境変数で管理します（`.context-mcp.json`に直接書かない）:

```bash
# ~/.bashrc または ~/.zshrc に追加
export ZILLIZ_TOKEN="your-zilliz-token-here"
export OPENAI_API_KEY="your-openai-api-key-here"

# 反映
source ~/.bashrc  # または source ~/.zshrc
```

### ステップ4: 設定ファイルの作成

```bash
context-mcp init --mode cloud
```

以下の`.context-mcp.json`が生成されます:

```json
{
  "mode": "cloud",
  "vectorStore": {
    "backend": "zilliz",
    "config": {
      "address": "xxx-xxx.vectordb.zillizcloud.com:19530",
      "token": "${ZILLIZ_TOKEN}",
      "secure": true
    }
  },
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "apiKey": "${OPENAI_API_KEY}"
  }
}
```

### ステップ5: 接続確認

```bash
# Zilliz CloudとOpenAI APIへの接続テスト
context-mcp test-connection

# 成功すると以下が表示されます:
# ✓ Zilliz Cloud connection successful
# ✓ OpenAI API connection successful
```

### コスト見積もり

クラウドモードのコスト例（10,000ファイルのプロジェクト）:

```bash
# コスト見積もりコマンド
context-mcp estimate-cost /path/to/project

# 出力例:
# Estimated costs for indexing this project:
# - Files to index: 10,000
# - Estimated tokens: 5,000,000
# - OpenAI embedding cost: ~$0.50 (text-embedding-3-small)
# - Zilliz Cloud storage: ~$5/month (Starter plan)
# Total: ~$0.50 initial + $5/month
```

## 環境変数による設定

Context-MCPは、設定ファイル（`.context-mcp.json`）を作成せずに、**環境変数のみ**で動作可能なゼロコンフィグ設計を採用しています。

### 設定の優先順位

```
優先度（高）
  ↓
1. 環境変数（LSP_MCP_MODE等）
  ↓
2. ユーザー設定ファイル（.context-mcp.json）
  ↓
3. デフォルト設定（src/config/types.ts）
  ↓
優先度（低）
```

環境変数と設定ファイルを併用した場合、**環境変数の値が優先**されます。

### サポートされている環境変数

| 環境変数 | 説明 | デフォルト値 | 例 |
|---------|------|------------|-----|
| `LSP_MCP_MODE` | 動作モード | `local` | `local`, `cloud` |
| `LSP_MCP_VECTOR_BACKEND` | ベクターDB | `milvus` | `milvus`, `zilliz` |
| `LSP_MCP_VECTOR_ADDRESS` | ベクターDBアドレス | `localhost:19530` | `localhost:19530` |
| `LSP_MCP_VECTOR_TOKEN` | ベクターDB認証トークン | なし | Zilliz Cloudトークン |
| `LSP_MCP_EMBEDDING_PROVIDER` | 埋め込みプロバイダー | `transformers` | `transformers`, `openai`, `voyageai` |
| `LSP_MCP_EMBEDDING_API_KEY` | 埋め込みAPIキー | なし | OpenAI APIキー |
| `LSP_MCP_EMBEDDING_MODEL` | 埋め込みモデル名 | プロバイダーのデフォルト | `Xenova/all-MiniLM-L6-v2` |
| `LOG_LEVEL` | ログレベル | `INFO` | `DEBUG`, `INFO`, `WARN`, `ERROR` |

詳細は[環境変数リファレンス](ENVIRONMENT_VARIABLES.md)を参照してください。

### 使用例

#### 例1: ローカルモード（最もシンプル）

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "npx",
      "args": ["github:windschord/context-mcp"],
      "env": {
        "LSP_MCP_MODE": "local",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

#### 例2: クラウドモード

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "npx",
      "args": ["github:windschord/context-mcp"],
      "env": {
        "LSP_MCP_MODE": "cloud",
        "LSP_MCP_VECTOR_BACKEND": "zilliz",
        "LSP_MCP_VECTOR_ADDRESS": "your-instance.zilliz.com:19530",
        "LSP_MCP_VECTOR_TOKEN": "your-zilliz-token",
        "LSP_MCP_EMBEDDING_PROVIDER": "openai",
        "LSP_MCP_EMBEDDING_API_KEY": "sk-proj-...",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

#### 例3: ハイブリッドモード（ローカルベクターDB + クラウド埋め込み）

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "npx",
      "args": ["github:windschord/context-mcp"],
      "env": {
        "LSP_MCP_MODE": "local",
        "LSP_MCP_EMBEDDING_PROVIDER": "openai",
        "LSP_MCP_EMBEDDING_API_KEY": "sk-proj-...",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

## 設定ファイルによるカスタマイズ

環境変数だけでなく、プロジェクトごとに詳細な設定をカスタマイズしたい場合は、`.context-mcp.json`を作成します。

### 設定ファイルの作成

プロジェクトルートに`.context-mcp.json`を作成:

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
    "languages": ["typescript", "python", "go", "rust"],
    "excludePatterns": [
      "node_modules/**",
      ".git/**",
      "dist/**",
      "build/**",
      "*.min.js",
      ".env",
      ".env.*",
      "credentials.json",
      "**/secret/**"
    ],
    "includeDocuments": true
  },
  "search": {
    "bm25Weight": 0.3,
    "vectorWeight": 0.7
  },
  "privacy": {
    "blockExternalCalls": true
  }
}
```

### 環境変数と設定ファイルの併用

環境変数と`.context-mcp.json`を併用する場合、以下のマージロジックが適用されます：

1. デフォルト設定を読み込む
2. `.context-mcp.json`が存在する場合、その内容で上書き
3. 環境変数が設定されている場合、その値で上書き（最優先）

### 設定方式の比較

| 方式 | メリット | デメリット | 推奨ユースケース |
|-----|---------|-----------|----------------|
| **環境変数のみ** | 簡単、CI/CD対応、Git管理不要 | プロジェクト固有設定に不向き | 個人開発、シンプルな設定 |
| **設定ファイルのみ** | プロジェクト固有設定、Git管理可能 | 環境ごとの変更に不向き | チーム開発、複雑な設定 |
| **併用** | 柔軟性最大、環境ごとの上書き可能 | やや複雑 | 複数環境（dev/staging/prod） |

## Claude Code統合

### ステップ1: Claude Code設定ファイルの編集

Claude Codeの設定ファイルを開きます:

```bash
# macOS/Linux
nano ~/.config/claude-code/mcp.json

# Windows (WSL2)
nano /mnt/c/Users/YourUsername/.config/claude-code/mcp.json
```

### ステップ2: Context-MCPを追加

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "context-mcp",
      "args": ["serve"],
      "env": {
        "ZILLIZ_TOKEN": "your-token-here",
        "OPENAI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**注意**: クラウドモードの場合のみ`env`に環境変数を設定してください。ローカルモードでは不要です。

### ステップ3: Claude Codeの再起動

設定を反映させるため、Claude Codeを完全に再起動します。

### ステップ4: 動作確認

Claude Codeを起動し、以下を試してください:

```
@context-mcp ステータスを教えて
```

期待される応答:
```
Context-MCP is running.
Mode: local
Vector Store: milvus (connected)
Indexed projects: 0
```

## 初期インデックス化

セットアップ完了後、最初にプロジェクトをインデックス化します。

### コマンドラインから

```bash
# 現在のディレクトリをインデックス化
context-mcp index .

# 特定のディレクトリを指定
context-mcp index /path/to/project

# 言語を限定してインデックス化
context-mcp index . --languages typescript,python,go

# ドキュメントを含めてインデックス化
context-mcp index . --include-docs

# 進捗を詳細表示
context-mcp index . --verbose
```

### Claude Codeから

```
@context-mcp このプロジェクトをインデックス化してください
```

### インデックス化の進捗

```
Indexing project...
[████████████████████------------] 67% (6,700/10,000 files)
- TypeScript: 3,200 files
- Python: 2,100 files
- Go: 1,400 files
- Documents: 500 files

Estimated time remaining: 2m 15s
```

## 動作確認

セットアップが正しく完了したか確認します。

### 1. 接続テスト

```bash
context-mcp test-connection
```

期待される出力:
```
✓ Configuration loaded successfully
✓ Vector Store connection: OK
✓ Embedding provider: OK
✓ File system access: OK
✓ All systems operational
```

### 2. シンプルな検索テスト

```bash
context-mcp search "authentication function"
```

期待される出力:
```
Search results (3 found):

1. src/auth/login.ts:45 (score: 0.92)
   async function authenticateUser(username: string, password: string) {

2. docs/API.md:12 (score: 0.87)
   ## Authentication
   The authentication function validates user credentials...

3. tests/auth.test.ts:23 (score: 0.81)
   describe('authentication', () => {
```

### 3. ステータス確認

```bash
context-mcp status
```

期待される出力:
```
Context-MCP Status:
- Mode: local
- Vector Store: milvus (connected)
- Embedding Provider: transformers (local)
- Indexed Files: 10,000
- Last Indexed: 2025-01-15 10:30:00
- Index Size: 1.2 GB
- Memory Usage: 512 MB
```

## トラブルシューティング

問題が発生した場合は、[トラブルシューティングガイド](TROUBLESHOOTING.md)を参照してください。

よくある問題:
- [Milvusが起動しない](TROUBLESHOOTING.md#milvus起動エラー)
- [埋め込みモデルがダウンロードできない](TROUBLESHOOTING.md#モデルダウンロードエラー)
- [Claude Codeで認識されない](TROUBLESHOOTING.md#claude-code統合エラー)
- [メモリ不足エラー](TROUBLESHOOTING.md#メモリ不足)

## 次のステップ

セットアップが完了したら:

1. [設定リファレンス](CONFIGURATION.md)で詳細な設定を確認
2. [README.md](../README.md)で主要機能を確認
3. Claude Codeで実際に使ってみる

## 参考資料

- [公式ドキュメント](https://github.com/yourusername/context-mcp)
- [Milvus公式ドキュメント](https://milvus.io/docs)
- [Chroma公式ドキュメント](https://docs.trychroma.com/)
- [Claude Code MCP統合](https://docs.anthropic.com/claude-code/mcp)

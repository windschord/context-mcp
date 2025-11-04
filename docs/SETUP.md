# セットアップガイド

このガイドでは、LSP-MCPの詳細なインストール手順とセットアップ方法を説明します。

## 目次

- [前提条件](#前提条件)
- [インストール方法](#インストール方法)
- [モード選択](#モード選択)
- [軽量モード（Chroma）のセットアップ](#軽量モードchromaのセットアップ)
- [標準モード（Milvus）のセットアップ](#標準モードmilvusのセットアップ)
- [クラウドモードのセットアップ](#クラウドモードのセットアップ)
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
npm install -g lsp-mcp

# インストール確認
lsp-mcp --version
```

### 方法2: ローカルインストール（開発者向け）

```bash
# リポジトリのクローン
git clone https://github.com/yourusername/lsp-mcp.git
cd lsp-mcp

# 依存関係のインストール
npm install

# TypeScriptのビルド
npm run build

# 動作確認
node dist/index.js --version
```

### 方法3: npx経由で使用（インストール不要）

```bash
# 一時的に使用する場合
npx lsp-mcp --version
```

## モード選択

LSP-MCPは3つの動作モードをサポートしています:

| モード | 特徴 | 推奨用途 | 外部通信 |
|--------|------|----------|----------|
| **軽量モード** | Docker不要、Chroma使用 | 個人開発、Docker環境がない場合 | なし |
| **標準モード** | Milvus standalone使用 | 中規模プロジェクト、高速検索が必要 | なし |
| **クラウドモード** | 外部API使用 | 大規模プロジェクト、チーム利用 | あり |

### モード選択のフローチャート

```
Docker環境がありますか？
├─ No → 軽量モード（Chroma）
└─ Yes
    ├─ プライバシー重視ですか？
    │   ├─ Yes → 標準モード（Milvus）
    │   └─ No → どちらでも可
    └─ プロジェクト規模は？
        ├─ 小〜中規模 → 標準モード（Milvus）
        └─ 大規模 → クラウドモード
```

## 軽量モード（Chroma）のセットアップ

最も簡単なセットアップ方法です。Docker不要で、すぐに使い始められます。

### ステップ1: 設定ファイルの作成

プロジェクトルートディレクトリで実行:

```bash
cd /path/to/your/project

# 設定ファイルを対話的に作成
lsp-mcp init --mode local-lite
```

以下の`.lsp-mcp.json`が生成されます:

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
    "model": "Xenova/all-MiniLM-L6-v2",
    "local": true
  },
  "privacy": {
    "blockExternalCalls": true
  },
  "indexing": {
    "excludePatterns": [
      "node_modules/**",
      ".git/**",
      "dist/**",
      "build/**",
      "*.min.js"
    ]
  }
}
```

### ステップ2: 初回実行（モデルダウンロード）

初回実行時に埋め込みモデルが自動ダウンロードされます（約90MB）:

```bash
lsp-mcp index .
```

**初回実行時の注意**:
- モデルダウンロードに数分かかります
- ダウンロード先: `~/.cache/transformers/`
- インターネット接続が必要（初回のみ）

### ステップ3: 完了

これでセットアップ完了です。次回以降は外部通信なしで動作します。

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

または、LSP-MCPが自動ダウンロードします:

```bash
lsp-mcp milvus download
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
lsp-mcp init --mode local
```

以下の`.lsp-mcp.json`が生成されます:

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
lsp-mcp test-connection

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

APIキーは環境変数で管理します（`.lsp-mcp.json`に直接書かない）:

```bash
# ~/.bashrc または ~/.zshrc に追加
export ZILLIZ_TOKEN="your-zilliz-token-here"
export OPENAI_API_KEY="your-openai-api-key-here"

# 反映
source ~/.bashrc  # または source ~/.zshrc
```

### ステップ4: 設定ファイルの作成

```bash
lsp-mcp init --mode cloud
```

以下の`.lsp-mcp.json`が生成されます:

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
lsp-mcp test-connection

# 成功すると以下が表示されます:
# ✓ Zilliz Cloud connection successful
# ✓ OpenAI API connection successful
```

### コスト見積もり

クラウドモードのコスト例（10,000ファイルのプロジェクト）:

```bash
# コスト見積もりコマンド
lsp-mcp estimate-cost /path/to/project

# 出力例:
# Estimated costs for indexing this project:
# - Files to index: 10,000
# - Estimated tokens: 5,000,000
# - OpenAI embedding cost: ~$0.50 (text-embedding-3-small)
# - Zilliz Cloud storage: ~$5/month (Starter plan)
# Total: ~$0.50 initial + $5/month
```

## Claude Code統合

### ステップ1: Claude Code設定ファイルの編集

Claude Codeの設定ファイルを開きます:

```bash
# macOS/Linux
nano ~/.config/claude-code/mcp.json

# Windows (WSL2)
nano /mnt/c/Users/YourUsername/.config/claude-code/mcp.json
```

### ステップ2: LSP-MCPを追加

```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "lsp-mcp",
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
@lsp-mcp ステータスを教えて
```

期待される応答:
```
LSP-MCP is running.
Mode: local
Vector Store: milvus (connected)
Indexed projects: 0
```

## 初期インデックス化

セットアップ完了後、最初にプロジェクトをインデックス化します。

### コマンドラインから

```bash
# 現在のディレクトリをインデックス化
lsp-mcp index .

# 特定のディレクトリを指定
lsp-mcp index /path/to/project

# 言語を限定してインデックス化
lsp-mcp index . --languages typescript,python,go

# ドキュメントを含めてインデックス化
lsp-mcp index . --include-docs

# 進捗を詳細表示
lsp-mcp index . --verbose
```

### Claude Codeから

```
@lsp-mcp このプロジェクトをインデックス化してください
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
lsp-mcp test-connection
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
lsp-mcp search "authentication function"
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
lsp-mcp status
```

期待される出力:
```
LSP-MCP Status:
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

- [公式ドキュメント](https://github.com/yourusername/lsp-mcp)
- [Milvus公式ドキュメント](https://milvus.io/docs)
- [Chroma公式ドキュメント](https://docs.trychroma.com/)
- [Claude Code MCP統合](https://docs.anthropic.com/claude-code/mcp)

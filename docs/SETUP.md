# セットアップガイド

このガイドでは、Context-MCPの詳細なインストール手順とセットアップ方法を説明します。

## 目次

- [前提条件](#前提条件)
- [インストール方法](#インストール方法)
- [クイックスタート（ゼロコンフィグモード）](#クイックスタートゼロコンフィグモード)
- [標準モード（Milvus）のセットアップ](#標準モードmilvusのセットアップ)
- [環境変数による設定](#環境変数による設定)
- [設定ファイルによるカスタマイズ](#設定ファイルによるカスタマイズ)
- [Claude Code統合](#claude-code統合)
- [初期インデックス化](#初期インデックス化)
- [動作確認](#動作確認)

## 前提条件

### 必須環境

- **Rust**: 1.70以上（推奨: 1.80以降）([rustup](https://rustup.rs/)でインストール推奨)
- **Protocol Buffers compiler**: protoc ([インストール手順](https://grpc.io/docs/protoc-installation/))
- **Docker**: 20.10以上（Milvus standalone起動用）
- **Docker Compose**: v2.0以上
- **OS**: macOS, Linux, Windows（WSL2推奨）
- **メモリ**: 最低4GB（推奨: 8GB以上）
- **ディスク**: 最低5GB以上の空き容量

### 追加要件

- **Milvus用追加メモリ**: 2GB以上
- **ONNX Runtime**: 自動的にインストールされます

## インストール方法

### 方法1: バイナリリリースから使用（最も簡単、推奨）

GitHubリリースページから、お使いのプラットフォーム向けのビルド済みバイナリをダウンロードできます：

```bash
# Linux (x86_64)
curl -L https://github.com/windschord/lsp-mcp/releases/latest/download/context-mcp-linux-x86_64.tar.gz | tar xz
sudo mv context-mcp /usr/local/bin/
context-mcp --version

# macOS (Intel)
curl -L https://github.com/windschord/lsp-mcp/releases/latest/download/context-mcp-macos-x86_64.tar.gz | tar xz
sudo mv context-mcp /usr/local/bin/
context-mcp --version

# macOS (Apple Silicon)
curl -L https://github.com/windschord/lsp-mcp/releases/latest/download/context-mcp-macos-aarch64.tar.gz | tar xz
sudo mv context-mcp /usr/local/bin/
context-mcp --version
```

### 方法2: ソースからビルド（開発者向け）

#### Rustツールチェーンのインストール

```bash
# rustupのインストール（推奨）
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# インストール後、新しいシェルを開くかPATHを更新
source ~/.cargo/env

# Rustバージョン確認
rustc --version  # 1.70以上が必要
```

#### 依存関係のインストール

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install -y protobuf-compiler libssl-dev pkg-config build-essential
```

**macOS:**
```bash
brew install protobuf
```

**Windows (WSL2):**
```bash
# WSL2内でUbuntu/Debianの手順を実行
sudo apt-get update
sudo apt-get install -y protobuf-compiler libssl-dev pkg-config build-essential
```

#### リポジトリのクローンとビルド

```bash
# リポジトリのクローン
git clone https://github.com/windschord/lsp-mcp.git
cd lsp-mcp

# デバッグビルド（開発時）
cargo build

# リリースビルド（本番使用時）
cargo build --release

# 動作確認
./target/release/context-mcp --version
```

#### テスト実行

```bash
# すべてのテストを実行
cargo test

# ユニットテストのみ実行
cargo test --lib

# 統合テストを実行
cargo test --test '*'

# 詳細出力
cargo test --verbose

# カバレッジ測定
cargo install cargo-llvm-cov
cargo llvm-cov --lib --all-features
```

詳細は[テストガイド](../tests/README.md)を参照してください。

## クイックスタート（ゼロコンフィグモード）

最も簡単な方法で、設定ファイル不要、環境変数のみで即座に使用開始できます。

### ステップ1: Milvus standaloneの起動

```bash
# docker-compose.ymlをダウンロード（初回のみ）
curl -O https://raw.githubusercontent.com/windschord/lsp-mcp/main/docker-compose.yml

# Milvus standalone起動
docker-compose up -d

# 起動確認（milvus-standaloneが起動していることを確認）
docker ps
```

### ステップ2: Claude CodeにMCP設定を追加（環境変数のみ）

Claude Codeの設定ファイル（macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`）に以下を追加:

```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "/usr/local/bin/context-mcp",
      "args": [],
      "env": {
        "MILVUS_ADDRESS": "localhost:19530",
        "RUST_LOG": "info"
      }
    }
  }
}
```

**補足**:
- `MILVUS_ADDRESS`: Milvusの接続アドレス（デフォルト: `localhost:19530`）
- `RUST_LOG`: ログレベル（`debug`, `info`, `warn`, `error`）
- すべてデフォルト値で動作するため、環境変数は省略可能です

設定後、**Claude Codeを再起動**してください。

### ステップ3: 使用開始

Claude Codeで以下のように指示するだけで、自動的にプロジェクトがインデックス化されます:

```
@lsp-mcp プロジェクトをインデックス化してください
```

これで完了です。より詳細な設定やカスタマイズが必要な場合は、以下のセクションを参照してください。

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
curl -O https://raw.githubusercontent.com/windschord/lsp-mcp/main/docker-compose.yml
```

### ステップ3: Milvusの起動

```bash
# Milvus standaloneを起動
docker-compose up -d

# 起動確認（3つのコンテナが起動）
docker ps
# CONTAINER ID   IMAGE                    STATUS
# xxxxx          milvusdb/milvus:latest   Up X minutes
# xxxxx          minio/minio:latest       Up X minutes
# xxxxx          quay.io/coreos/etcd:latest Up X minutes

# ログ確認
docker-compose logs -f milvus
# "Milvus Proxy started successfully" が表示されればOK
```

### ステップ4: 設定ファイルの作成（オプション）

デフォルト設定で動作しますが、カスタマイズしたい場合は`.context-mcp.json`を作成します:

```json
{
  "milvus": {
    "address": "localhost:19530"
  },
  "embedding": {
    "model_path": "models/all-MiniLM-L6-v2.onnx",
    "tokenizer_path": "models/tokenizer.json"
  },
  "bm25": {
    "db_path": "./data/bm25.db"
  },
  "indexing": {
    "languages": ["typescript", "python", "go", "rust"],
    "exclude_patterns": [
      "node_modules/**",
      ".git/**",
      "dist/**",
      "build/**",
      "target/**",
      "*.min.js",
      ".env",
      ".env.*",
      "credentials.json",
      "**/secret/**"
    ],
    "include_documents": true
  },
  "search": {
    "bm25_weight": 0.3,
    "vector_weight": 0.7
  }
}
```

### ステップ5: 接続確認

```bash
# Milvusへの接続テスト（今後実装予定）
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
docker-compose down

# 再起動
docker-compose restart

# 完全削除（データも削除）
docker-compose down -v
rm -rf volumes/
```

## 環境変数による設定

LSP-MCPは、設定ファイル（`.context-mcp.json`）を作成せずに、環境変数のみで動作可能なゼロコンフィグ設計を採用しています。

### 設定の優先順位

```
優先度（高）
  ↓
1. 環境変数（MILVUS_ADDRESS等）
  ↓
2. ユーザー設定ファイル（.context-mcp.json）
  ↓
3. デフォルト設定（src/config/mod.rs）
  ↓
優先度（低）
```

環境変数と設定ファイルを併用した場合、**環境変数の値が優先**されます。

### サポートされている環境変数

| 環境変数 | 説明 | デフォルト値 | 例 |
|---------|------|------------|-----|
| `MILVUS_ADDRESS` | Milvusサーバーアドレス | `localhost:19530` | `localhost:19530` |
| `MILVUS_TOKEN` | Milvus認証トークン（Zilliz Cloud用） | なし | Zilliz Cloudトークン |
| `MODEL_PATH` | ONNXモデルファイルパス | `models/all-MiniLM-L6-v2.onnx` | カスタムモデルパス |
| `TOKENIZER_PATH` | トークナイザーファイルパス | `models/tokenizer.json` | カスタムトークナイザーパス |
| `BM25_DB_PATH` | BM25データベースパス | `./data/bm25.db` | カスタムDBパス |
| `RUST_LOG` | ログレベル | `info` | `debug`, `info`, `warn`, `error` |

詳細は[環境変数リファレンス](ENVIRONMENT_VARIABLES.md)を参照してください。

### 環境変数ベースセットアップの利点

| 項目 | 環境変数方式 | 設定ファイル方式 |
|-----|------------|---------------|
| **セットアップ時間** | 約1分（MCP設定のみ） | 約5分（設定ファイル作成 + MCP設定） |
| **設定ファイル作成** | 不要 | 必要（`.context-mcp.json`） |
| **環境ごとの切り替え** | 容易（環境変数を変更するだけ） | やや面倒（設定ファイルを複数管理） |
| **CI/CD統合** | 容易（環境変数を設定するだけ） | やや面倒（設定ファイルを配置） |
| **秘密情報管理** | 安全（環境変数、Git管理外） | 注意が必要（設定ファイルに書かない） |
| **推奨ユースケース** | 個人開発、シンプルな設定、CI/CD | チーム開発、複雑な設定、プロジェクト固有設定 |

**推奨アプローチ**:
- **個人開発・シンプルな構成**: 環境変数のみ
- **チーム開発・複雑な構成**: 設定ファイル + 環境変数（秘密情報のみ環境変数）

### 使用例

#### 例1: ローカルモード（最もシンプル）

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "/usr/local/bin/context-mcp",
      "args": [],
      "env": {
        "RUST_LOG": "info"
      }
    }
  }
}
```

#### 例2: Zilliz Cloud使用

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "/usr/local/bin/context-mcp",
      "args": [],
      "env": {
        "MILVUS_ADDRESS": "your-instance.zilliz.com:19530",
        "MILVUS_TOKEN": "your-zilliz-token",
        "RUST_LOG": "info"
      }
    }
  }
}
```

#### 例3: カスタムモデルパス

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "/usr/local/bin/context-mcp",
      "args": [],
      "env": {
        "MODEL_PATH": "/custom/path/model.onnx",
        "TOKENIZER_PATH": "/custom/path/tokenizer.json",
        "RUST_LOG": "debug"
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
  "milvus": {
    "address": "localhost:19530"
  },
  "embedding": {
    "model_path": "models/all-MiniLM-L6-v2.onnx",
    "tokenizer_path": "models/tokenizer.json"
  },
  "bm25": {
    "db_path": "./data/bm25.db"
  },
  "indexing": {
    "languages": ["typescript", "python", "go", "rust"],
    "exclude_patterns": [
      "node_modules/**",
      ".git/**",
      "dist/**",
      "build/**",
      "target/**",
      "*.min.js",
      ".env",
      ".env.*",
      "credentials.json",
      "**/secret/**"
    ],
    "include_documents": true
  },
  "search": {
    "bm25_weight": 0.3,
    "vector_weight": 0.7
  }
}
```

### 環境変数と設定ファイルの併用

環境変数と`.context-mcp.json`を併用する場合、以下のマージロジックが適用されます：

1. デフォルト設定を読み込む
2. `.context-mcp.json`が存在する場合、その内容で上書き
3. 環境変数が設定されている場合、その値で上書き（最優先）

## Claude Code統合

### ステップ1: Claude Code設定ファイルの編集

Claude Codeの設定ファイルを開きます:

```bash
# macOS
nano ~/Library/Application\ Support/Claude/claude_desktop_config.json

# Linux
nano ~/.config/claude-code/mcp.json

# Windows (WSL2)
nano /mnt/c/Users/YourUsername/.config/claude-code/mcp.json
```

### ステップ2: Context-MCPを追加

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "/usr/local/bin/context-mcp",
      "args": [],
      "env": {
        "MILVUS_ADDRESS": "localhost:19530",
        "RUST_LOG": "info"
      }
    }
  }
}
```

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
Vector Store: milvus (connected)
Indexed projects: 0
```

## 初期インデックス化

セットアップ完了後、最初にプロジェクトをインデックス化します。

### コマンドラインから（今後実装予定）

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

## 動作確認

セットアップが正しく完了したか確認します。

### 1. 接続テスト（今後実装予定）

```bash
context-mcp test-connection
```

期待される出力:
```
✓ Configuration loaded successfully
✓ Milvus connection: OK
✓ Embedding model loaded: OK
✓ File system access: OK
✓ All systems operational
```

### 2. シンプルな検索テスト（今後実装予定）

```bash
context-mcp search "authentication function"
```

### 3. ステータス確認（今後実装予定）

```bash
context-mcp status
```

期待される出力:
```
Context-MCP Status:
- Milvus: connected
- Indexed Files: 10,000
- Last Indexed: 2025-01-15 10:30:00
- Index Size: 1.2 GB
- Memory Usage: 512 MB
```

## トラブルシューティング

問題が発生した場合は、[トラブルシューティングガイド](TROUBLESHOOTING.md)を参照してください。

よくある問題:
- [Rustビルドエラー](TROUBLESHOOTING.md#rustビルドエラー)
- [Protocol Buffers compilerのエラー](TROUBLESHOOTING.md#protocol-buffers-compilerのエラー)
- [Milvusが起動しない](TROUBLESHOOTING.md#milvus起動エラー)
- [ONNX Runtime関連のエラー](TROUBLESHOOTING.md#onnx-runtime関連のエラー)
- [メモリ不足エラー](TROUBLESHOOTING.md#メモリ不足)

## 次のステップ

セットアップが完了したら:

1. [設定リファレンス](CONFIGURATION.md)で詳細な設定を確認
2. [README.md](../README.md)で主要機能を確認
3. Claude Codeで実際に使ってみる

## 参考資料

- [公式ドキュメント](https://github.com/windschord/lsp-mcp)
- [Milvus公式ドキュメント](https://milvus.io/docs)
- [ONNX Runtime公式ドキュメント](https://onnxruntime.ai/)
- [Claude Code MCP統合](https://docs.anthropic.com/claude-code/mcp)

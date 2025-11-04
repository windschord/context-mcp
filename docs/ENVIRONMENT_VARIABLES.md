# 環境変数リファレンス

このドキュメントでは、LSP-MCPで使用可能なすべての環境変数について説明します。

## 概要

LSP-MCPは、設定ファイル（`.lsp-mcp.json`）を作成せずに、環境変数のみで動作可能なゼロコンフィグ設計を採用しています。

### 設定の優先順位

```
優先度（高）
  ↓
1. 環境変数（LSP_MCP_MODE等）
  ↓
2. ユーザー設定ファイル（.lsp-mcp.json）
  ↓
3. デフォルト設定（src/config/types.ts）
  ↓
優先度（低）
```

環境変数と設定ファイルを併用した場合、**環境変数の値が優先**されます。

## 環境変数一覧

### モード設定

#### `LSP_MCP_MODE`

動作モードを指定します。

- **型**: `"local"` | `"cloud"`
- **デフォルト**: `"local"`
- **説明**: ローカルモード（プライバシー重視、外部通信なし）またはクラウドモード（外部API使用）を選択
- **例**:
  ```bash
  LSP_MCP_MODE=local
  LSP_MCP_MODE=cloud
  ```

### ベクターDB設定

#### `LSP_MCP_VECTOR_BACKEND`

使用するベクターDBバックエンドを指定します。

- **型**: `"milvus"` | `"zilliz"`
- **デフォルト**: `"milvus"`
- **説明**:
  - `milvus`: Milvus standalone（Docker Compose経由、ローカル実行）
  - `zilliz`: Zilliz Cloud（Milvusマネージドサービス）
- **例**:
  ```bash
  LSP_MCP_VECTOR_BACKEND=milvus
  LSP_MCP_VECTOR_BACKEND=zilliz
  ```

#### `LSP_MCP_VECTOR_ADDRESS`

ベクターDBの接続アドレスを指定します。

- **型**: `string` (host:port形式)
- **デフォルト**: `"localhost:19530"`
- **説明**: ベクターDBサーバーのホスト名とポート番号
- **例**:
  ```bash
  LSP_MCP_VECTOR_ADDRESS=localhost:19530
  LSP_MCP_VECTOR_ADDRESS=your-instance.zilliz.com:19530
  ```

#### `LSP_MCP_VECTOR_TOKEN`

ベクターDB認証トークンを指定します（Zilliz Cloud使用時）。

- **型**: `string`
- **デフォルト**: なし
- **説明**: Zilliz Cloudへの接続に必要な認証トークン
- **例**:
  ```bash
  LSP_MCP_VECTOR_TOKEN=your-zilliz-cloud-token
  ```

### 埋め込み設定

#### `LSP_MCP_EMBEDDING_PROVIDER`

埋め込みベクトル生成プロバイダーを指定します。

- **型**: `"transformers"` | `"openai"` | `"voyageai"`
- **デフォルト**: `"transformers"`
- **説明**:
  - `transformers`: Transformers.js（ローカル実行、外部通信なし）
  - `openai`: OpenAI Embedding API（クラウド、APIキー必要）
  - `voyageai`: VoyageAI API（クラウド、APIキー必要）
- **例**:
  ```bash
  LSP_MCP_EMBEDDING_PROVIDER=transformers
  LSP_MCP_EMBEDDING_PROVIDER=openai
  LSP_MCP_EMBEDDING_PROVIDER=voyageai
  ```

#### `LSP_MCP_EMBEDDING_API_KEY`

埋め込みAPIの認証キーを指定します（クラウドプロバイダー使用時）。

- **型**: `string`
- **デフォルト**: なし
- **説明**: OpenAI APIキーまたはVoyageAI APIキー
- **例**:
  ```bash
  LSP_MCP_EMBEDDING_API_KEY=sk-proj-...
  ```

#### `LSP_MCP_EMBEDDING_MODEL`

埋め込みモデル名を指定します（オプション）。

- **型**: `string`
- **デフォルト**:
  - Transformers.js: `"Xenova/all-MiniLM-L6-v2"`
  - OpenAI: `"text-embedding-3-small"`
  - VoyageAI: `"voyage-2"`
- **説明**: 使用する埋め込みモデルの名前
- **例**:
  ```bash
  LSP_MCP_EMBEDDING_MODEL=Xenova/all-MiniLM-L6-v2
  LSP_MCP_EMBEDDING_MODEL=text-embedding-3-large
  ```

### ログ設定

#### `LOG_LEVEL`

ログ出力レベルを指定します。

- **型**: `"DEBUG"` | `"INFO"` | `"WARN"` | `"ERROR"`
- **デフォルト**: `"INFO"`
- **説明**:
  - `DEBUG`: デバッグ情報を含むすべてのログを出力
  - `INFO`: 一般的な情報ログを出力（推奨）
  - `WARN`: 警告とエラーのみ出力
  - `ERROR`: エラーのみ出力
- **例**:
  ```bash
  LOG_LEVEL=INFO
  LOG_LEVEL=DEBUG
  ```

## ユースケース別の設定例

### ユースケース1: ローカルモード（デフォルト、最もシンプル）

Docker ComposeでMilvus standaloneを起動し、ローカル埋め込みモデルを使用。

**Claude Code MCP設定**:
```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "npx",
      "args": ["github:windschord/lsp-mcp"],
      "env": {
        "LSP_MCP_MODE": "local",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

**環境変数**（省略可、デフォルト値が使用される）:
```bash
LSP_MCP_MODE=local
LSP_MCP_VECTOR_BACKEND=milvus
LSP_MCP_VECTOR_ADDRESS=localhost:19530
LSP_MCP_EMBEDDING_PROVIDER=transformers
LOG_LEVEL=INFO
```

### ユースケース2: クラウドモード（OpenAI + Zilliz Cloud）

外部APIを使用して高速・高精度な検索を実現。

**Claude Code MCP設定**:
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
        "LSP_MCP_EMBEDDING_API_KEY": "sk-proj-...",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

**環境変数**:
```bash
LSP_MCP_MODE=cloud
LSP_MCP_VECTOR_BACKEND=zilliz
LSP_MCP_VECTOR_ADDRESS=your-instance.zilliz.com:19530
LSP_MCP_VECTOR_TOKEN=your-zilliz-token
LSP_MCP_EMBEDDING_PROVIDER=openai
LSP_MCP_EMBEDDING_API_KEY=sk-proj-...
LOG_LEVEL=INFO
```

### ユースケース3: ハイブリッドモード（ローカルベクターDB + クラウド埋め込み）

ベクターDBはローカル、埋め込みはクラウドを使用してコストと性能をバランス。

**Claude Code MCP設定**:
```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "npx",
      "args": ["github:windschord/lsp-mcp"],
      "env": {
        "LSP_MCP_MODE": "local",
        "LSP_MCP_VECTOR_BACKEND": "milvus",
        "LSP_MCP_VECTOR_ADDRESS": "localhost:19530",
        "LSP_MCP_EMBEDDING_PROVIDER": "openai",
        "LSP_MCP_EMBEDDING_API_KEY": "sk-proj-...",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

### ユースケース4: 開発・デバッグモード

詳細なログを出力してトラブルシューティング。

**Claude Code MCP設定**:
```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "npx",
      "args": ["github:windschord/lsp-mcp"],
      "env": {
        "LSP_MCP_MODE": "local",
        "LOG_LEVEL": "DEBUG"
      }
    }
  }
}
```

## 環境変数と設定ファイルの併用

環境変数と`.lsp-mcp.json`を併用する場合、以下のマージロジックが適用されます：

1. デフォルト設定を読み込む
2. `.lsp-mcp.json`が存在する場合、その内容で上書き
3. 環境変数が設定されている場合、その値で上書き（最優先）

### 例: 部分的な上書き

`.lsp-mcp.json`:
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

環境変数:
```bash
LSP_MCP_EMBEDDING_PROVIDER=openai
LSP_MCP_EMBEDDING_API_KEY=sk-proj-...
```

**最終的な設定**:
- モード: `local`（設定ファイルから）
- ベクターDB: `milvus` @ `localhost:19530`（設定ファイルから）
- 埋め込み: `openai`（環境変数で上書き）
- 埋め込みAPIキー: `sk-proj-...`（環境変数から）

## トラブルシューティング

### 問題1: 環境変数が反映されない

**症状**: 環境変数を設定したが、デフォルト値が使用されている

**原因**:
- Claude Codeを再起動していない
- 環境変数名のスペルミス
- 設定ファイルの値が環境変数より優先されている（誤解）

**解決方法**:
1. Claude Codeを再起動
2. 環境変数名を確認（例: `LSP_MCP_MODE`、アンダースコアの位置に注意）
3. ログを確認（`LOG_LEVEL=DEBUG`に設定して起動ログを確認）

### 問題2: APIキーが認識されない

**症状**: `LSP_MCP_EMBEDDING_API_KEY`を設定したが、認証エラーが発生

**原因**:
- APIキーの形式が不正
- 環境変数に特殊文字（スペース、改行等）が含まれている
- プロバイダー設定が一致していない

**解決方法**:
1. APIキーを再確認（先頭・末尾にスペースがないか）
2. `LSP_MCP_EMBEDDING_PROVIDER`が正しく設定されているか確認
3. ログでAPIキーの最初の数文字を確認（センシティブ情報は伏せられます）

### 問題3: ベクターDBに接続できない

**症状**: `LSP_MCP_VECTOR_ADDRESS`を設定したが、接続エラーが発生

**原因**:
- Milvus standaloneが起動していない
- アドレスが正しくない（host:port形式）
- ファイアウォールやネットワーク設定の問題

**解決方法**:
1. `docker ps`でMilvusコンテナが起動していることを確認
2. アドレス形式を確認（例: `localhost:19530`）
3. `telnet localhost 19530`で接続テスト

### 問題4: ログレベルの変更が反映されない

**症状**: `LOG_LEVEL`を変更したが、ログ出力量が変わらない

**原因**:
- Claude Codeを再起動していない
- 環境変数名のスペルミス（`LOG_LEVEL`、アンダースコアなし）

**解決方法**:
1. Claude Codeを完全に再起動
2. 環境変数名を確認（`LOG_LEVEL`、`LSP_MCP_LOG_LEVEL`ではない）

## デバッグ用コマンド

### 現在の設定を確認

LSP-MCPは起動時に適用された設定をログに出力します。

```bash
# Claude Codeのログを確認（macOS）
tail -f ~/Library/Logs/Claude/mcp-server-lsp-mcp.log

# 起動時の設定ログを確認
grep "設定ファイルを読み込みました\|環境変数.*からオーバーライド" ~/Library/Logs/Claude/mcp-server-lsp-mcp.log
```

### 環境変数の確認

```bash
# Claude Code MCP設定ファイルを確認
cat ~/Library/Application\ Support/Claude/claude_desktop_config.json

# 特定の環境変数を確認（macOS/Linux）
echo $LSP_MCP_MODE
echo $LSP_MCP_VECTOR_ADDRESS
```

## 関連ドキュメント

- [README.md](../README.md) - クイックスタートガイド
- [SETUP.md](SETUP.md) - 詳細なセットアップ手順
- [CONFIGURATION.md](CONFIGURATION.md) - 設定ファイルリファレンス
- [TROUBLESHOOTING.md](TROUBLESHOOTING.md) - トラブルシューティング全般

# トラブルシューティング

Context-MCPの使用中に発生する一般的な問題と解決方法をまとめています。

## 目次

- [インストール関連](#インストール関連)
- [Milvus関連](#milvus関連)
- [埋め込みモデル関連](#埋め込みモデル関連)
- [インデックス化関連](#インデックス化関連)
- [検索関連](#検索関連)
- [Claude Code統合関連](#claude-code統合関連)
- [パフォーマンス関連](#パフォーマンス関連)
- [ネットワーク関連](#ネットワーク関連)
- [デバッグ方法](#デバッグ方法)
- [サポート情報](#サポート情報)

## インストール関連

### npm installが失敗する

**症状**:
```
npm ERR! code EACCES
npm ERR! syscall access
npm ERR! path /usr/local/lib/node_modules
```

**原因**: 権限不足

**解決方法**:

```bash
# 方法1: npmのグローバルディレクトリを変更（推奨）
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc

# 再インストール
npm install -g context-mcp

# 方法2: sudoを使用（非推奨）
sudo npm install -g context-mcp
```

### Node.jsバージョンが古い

**症状**:
```
Error: The engine "node" is incompatible with this module.
Expected version ">=18.0.0". Got "16.14.0"
```

**解決方法**:

```bash
# nvmを使用する場合
nvm install 20
nvm use 20

# 手動インストールの場合
# https://nodejs.org/ からLTS版をダウンロード

# バージョン確認
node --version  # v20.x.x以上
```

### TypeScriptビルドエラー

**症状**:
```
error TS2307: Cannot find module '@modelcontextprotocol/sdk'
```

**解決方法**:

```bash
# node_modulesを削除して再インストール
rm -rf node_modules package-lock.json
npm install

# TypeScriptのキャッシュをクリア
npm run clean
npm run build
```

## Milvus関連

### Milvusが起動しない

**症状**:
```
docker compose up -d
Error response from daemon: driver failed programming external connectivity
```

**原因**: ポート19530が既に使用されている

**解決方法**:

```bash
# ポートを使用しているプロセスを確認
lsof -i :19530

# プロセスを停止
kill -9 <PID>

# または、Milvusのポートを変更
# docker-compose.yml を編集
# ports:
#   - "19531:19530"  # 19530 -> 19531に変更

# .context-mcp.json も変更
# "address": "localhost:19531"
```

### Milvusコンテナが起動後すぐに停止する

**症状**:
```
docker ps -a
CONTAINER ID   STATUS
xxxxx          Exited (1) 2 seconds ago
```

**解決方法**:

```bash
# ログを確認
docker compose -f docker-compose.yml logs milvus

# メモリ不足の場合
# Docker Desktopの設定でメモリを4GB以上に増やす

# ディスク容量不足の場合
df -h  # 空き容量を確認
# 不要なDockerイメージを削除
docker system prune -a
```

### Milvusに接続できない

**症状**:
```
Error: Failed to connect to Milvus at localhost:19530
```

**解決方法**:

```bash
# 1. Milvusが起動しているか確認
docker ps | grep milvus

# 2. ポートが開いているか確認
nc -zv localhost 19530

# 3. Milvusの起動を待つ（初回起動は時間がかかる）
docker compose -f docker-compose.yml logs -f milvus
# "Milvus Proxy started successfully" が表示されるまで待つ

# 4. ファイアウォールの確認
# macOS
sudo pfctl -s all | grep 19530

# Linux
sudo iptables -L | grep 19530
```

### Milvusのデータが消えた

**原因**: Docker volumeが削除された

**解決方法**:

```bash
# バックアップから復元
tar xzf milvus-backup-YYYYMMDD.tar.gz

# 今後のためにバックアップスクリプトを作成
cat > backup-milvus.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d-%H%M%S)
tar czf "milvus-backup-$DATE.tar.gz" volumes/
echo "Backup created: milvus-backup-$DATE.tar.gz"
EOF

chmod +x backup-milvus.sh

# 定期的にバックアップ（cron）
crontab -e
# 毎日午前2時にバックアップ
0 2 * * * /path/to/backup-milvus.sh
```

## 埋め込みモデル関連

### モデルのダウンロードが失敗する

**症状**:
```
Error: Failed to download model: all-MiniLM-L6-v2
Network timeout
```

**解決方法**:

```bash
# 1. インターネット接続を確認
ping huggingface.co

# 2. プロキシ設定（必要な場合）
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080

# 3. 手動でモデルをダウンロード
mkdir -p ~/.cache/transformers/Xenova/all-MiniLM-L6-v2
cd ~/.cache/transformers/Xenova/all-MiniLM-L6-v2
wget https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model.onnx
wget https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/tokenizer.json

# 4. 再試行
context-mcp index .
```

### 埋め込み生成が遅い

**症状**: インデックス化が非常に遅い（1ファイル/秒以下）

**解決方法**:

```bash
# 1. バッチサイズを増やす（.context-mcp.json）
{
  "embedding": {
    "batchSize": 64  // デフォルト32から増やす
  }
}

# 2. ワーカー数を増やす
{
  "indexing": {
    "workers": 8  // デフォルト4から増やす
  }
}

# 3. 軽量モデルに変更
{
  "embedding": {
    "model": "Xenova/all-MiniLM-L6-v2"  // より軽量
  }
}
```

### OpenAI APIエラー

**症状**:
```
Error: OpenAI API error: 429 Rate limit exceeded
```

**解決方法**:

```bash
# 1. APIキーを確認
echo $OPENAI_API_KEY

# 2. レート制限を確認
# https://platform.openai.com/account/limits

# 3. バッチサイズを減らす（.context-mcp.json）
{
  "embedding": {
    "batchSize": 50,  // デフォルト100から減らす
    "maxRetries": 5,
    "timeout": 60000
  }
}

# 4. ローカルモデルに切り替える（一時的）
{
  "embedding": {
    "provider": "transformers"
  }
}
```

## インデックス化関連

### インデックス化が途中で止まる

**症状**: 進捗が一定のパーセンテージで停止する

**解決方法**:

```bash
# 1. ログを確認
cat .context-mcp/logs/app.log

# 2. 問題のファイルをスキップ
# ログから問題のファイルを特定
# .context-mcp.json にexcludePatternを追加
{
  "indexing": {
    "excludePatterns": [
      "path/to/problematic/file.ts"
    ]
  }
}

# 3. タイムアウトを増やす
{
  "indexing": {
    "fileTimeout": 30000  // 30秒
  }
}

# 4. 再インデックス化
context-mcp clear-index
context-mcp index .
```

### 特定のファイルがインデックス化されない

**症状**: 存在するファイルが検索結果に出てこない

**解決方法**:

```bash
# 1. 除外パターンを確認
context-mcp debug-patterns path/to/file.ts
# Output: EXCLUDED by pattern: "**/*.test.ts"

# 2. 除外パターンを調整（.context-mcp.json）
{
  "indexing": {
    "excludePatterns": [
      "node_modules/**"
      // "**/*.test.ts" を削除
    ]
  }
}

# 3. ファイルサイズを確認
ls -lh path/to/file.ts
# 1MB以上の場合はmaxFileSizeを増やす
{
  "indexing": {
    "maxFileSize": 5242880  // 5MB
  }
}

# 4. 手動でインデックス化
context-mcp index-file path/to/file.ts
```

### メモリ不足エラー

**症状**:
```
Error: FATAL ERROR: Reached heap limit
Allocation failed - JavaScript heap out of memory
```

**解決方法**:

```bash
# 1. Node.jsのヒープサイズを増やす
export NODE_OPTIONS="--max-old-space-size=4096"  # 4GB
context-mcp index .

# 2. バッチサイズを減らす（.context-mcp.json）
{
  "embedding": {
    "batchSize": 16  // 32から減らす
  }
}

# 3. ワーカー数を減らす
{
  "indexing": {
    "workers": 2  // 4から減らす
  }
}

# 4. 段階的にインデックス化
context-mcp index src/
context-mcp index tests/
context-mcp index docs/
```

## 検索関連

### 検索結果が返ってこない

**症状**: クエリを実行しても結果が0件

**解決方法**:

```bash
# 1. インデックス状態を確認
context-mcp status
# Indexed Files: 0 の場合は再インデックス化

# 2. 検索クエリを変更
# 短いクエリを試す
context-mcp search "function"

# 3. 検索パラメータを調整（.context-mcp.json）
{
  "search": {
    "topK": 50,  // 20から増やす
    "minScore": 0.0  // 閾値を下げる
  }
}

# 4. ハイブリッド検索の重みを調整
{
  "search": {
    "hybridAlpha": 0.5  // 0.3から変更
  }
}
```

### 検索結果の精度が低い

**症状**: 関係ないファイルが検索結果に含まれる

**解決方法**:

```bash
# 1. ハイブリッド検索の重みを調整
{
  "search": {
    "hybridAlpha": 0.7  // ベクトル検索を重視
  }
}

# 2. 最小スコア閾値を設定
{
  "search": {
    "minScore": 0.5  // 低スコアを除外
  }
}

# 3. フィルタリングを使用
context-mcp search "authentication" --file-types ts,py

# 4. より高精度なモデルに変更
{
  "embedding": {
    "model": "Xenova/all-mpnet-base-v2"  // より高精度
  }
}
```

### 検索が遅い

**症状**: 検索に5秒以上かかる

**解決方法**:

```bash
# 1. Milvusのインデックスタイプを変更（.context-mcp.json）
{
  "vectorStore": {
    "config": {
      "indexType": "HNSW",  // IVF_FLATより高速
      "metricType": "IP"
    }
  }
}

# 2. topKを減らす
{
  "search": {
    "topK": 10  // 20から減らす
  }
}

# 3. インデックスを再構築
context-mcp clear-index
context-mcp index .
```

## Claude Code統合関連

### Claude CodeでContext-MCPが認識されない

**症状**: `@context-mcp`が使えない

**解決方法**:

```bash
# 1. MCP設定ファイルを確認
cat ~/.config/claude-code/mcp.json

# 2. 設定が正しいか確認
{
  "mcpServers": {
    "context-mcp": {
      "command": "context-mcp",  // フルパスでも可: "/usr/local/bin/context-mcp"
      "args": ["serve"]
    }
  }
}

# 3. context-mcpのパスを確認
which context-mcp

# 4. フルパスで指定
{
  "mcpServers": {
    "context-mcp": {
      "command": "/usr/local/bin/context-mcp",
      "args": ["serve"]
    }
  }
}

# 5. Claude Codeを完全再起動
killall "Claude Code"
# Claude Codeを再起動
```

### Claude CodeでMCPツールが実行できない

**症状**:
```
Error: MCP tool execution failed: context-mcp/index_project
```

**解決方法**:

```bash
# 1. MCPサーバーのログを確認
cat ~/.config/claude-code/logs/mcp-context-mcp.log

# 2. 手動でMCPサーバーをテスト
context-mcp serve --debug

# 3. 環境変数を設定（mcp.json）
{
  "mcpServers": {
    "context-mcp": {
      "command": "context-mcp",
      "args": ["serve"],
      "env": {
        "NODE_OPTIONS": "--max-old-space-size=4096",
        "LSP_MCP_LOG_LEVEL": "debug"
      }
    }
  }
}
```

## パフォーマンス関連

### インデックス化が遅すぎる

**症状**: 1,000ファイルのインデックス化に10分以上かかる

**解決方法**:

```bash
# 1. 並列処理を増やす（.context-mcp.json）
{
  "indexing": {
    "workers": 8  // CPUコア数に合わせる
  }
}

# 2. バッチサイズを増やす
{
  "embedding": {
    "batchSize": 64
  }
}

# 3. 不要なファイルを除外
{
  "indexing": {
    "excludePatterns": [
      "node_modules/**",
      "dist/**",
      "*.min.js",
      "*.test.ts"  // テストファイルを除外
    ]
  }
}

# 4. SSDを使用
# HDDの場合、SSDに移行すると大幅に高速化

# 5. Chromaではなく Milvusを使用
{
  "vectorStore": {
    "backend": "milvus"  // より高速
  }
}
```

### メモリ使用量が多すぎる

**症状**: 4GB以上のメモリを使用する

**解決方法**:

```bash
# 1. バッチサイズを減らす
{
  "embedding": {
    "batchSize": 16
  }
}

# 2. ワーカー数を減らす
{
  "indexing": {
    "workers": 2
  }
}

# 3. 段階的にインデックス化
context-mcp index src/ --no-watch
context-mcp index tests/ --no-watch
context-mcp index docs/ --no-watch

# 4. ファイル監視を無効化
context-mcp index . --no-watch
```

## ネットワーク関連

### プロキシ環境下で動作しない

**症状**: モデルダウンロードやクラウドモードが動作しない

**解決方法**:

```bash
# 1. プロキシ設定
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
export NO_PROXY=localhost,127.0.0.1

# 2. npmプロキシ設定
npm config set proxy http://proxy.example.com:8080
npm config set https-proxy http://proxy.example.com:8080

# 3. 環境変数を永続化（~/.bashrc）
echo 'export HTTP_PROXY=http://proxy.example.com:8080' >> ~/.bashrc
echo 'export HTTPS_PROXY=http://proxy.example.com:8080' >> ~/.bashrc
source ~/.bashrc
```

### SSL証明書エラー

**症状**:
```
Error: self signed certificate in certificate chain
```

**解決方法**:

```bash
# 開発環境のみ、本番環境では非推奨
export NODE_TLS_REJECT_UNAUTHORIZED=0

# または、CA証明書を指定
export NODE_EXTRA_CA_CERTS=/path/to/ca-certificate.crt
```

## デバッグ方法

### デバッグログの有効化

```bash
# 1. 環境変数でログレベルを設定
export LSP_MCP_LOG_LEVEL=debug

# 2. または設定ファイルで指定（.context-mcp.json）
{
  "logging": {
    "level": "debug",
    "console": true
  }
}

# 3. ログファイルを確認
tail -f .context-mcp/logs/app.log
```

### 詳細な診断情報の取得

```bash
# システム情報の収集
context-mcp diagnose > diagnosis.txt

# 出力内容:
# - OS情報
# - Node.jsバージョン
# - Context-MCPバージョン
# - 設定ファイル内容（APIキーはマスク）
# - インデックス状態
# - ベクターDB接続状態
# - 最近のエラーログ
```

### デバッグモードでの実行

```bash
# デバッグモードでMCPサーバーを起動
context-mcp serve --debug --verbose

# 出力例:
# [DEBUG] Configuration loaded from: .context-mcp.json
# [DEBUG] Vector Store: milvus
# [DEBUG] Connecting to localhost:19530...
# [DEBUG] Connection established
# [DEBUG] MCP Server listening...
```

## よくあるエラーメッセージ

### `ENOENT: no such file or directory`

**原因**: 設定ファイルまたはデータディレクトリが存在しない

**解決方法**:

```bash
# 設定ファイルを作成
context-mcp init --mode local

# データディレクトリを作成
mkdir -p .context-mcp/chroma
```

### `EADDRINUSE: address already in use`

**原因**: ポートが既に使用されている

**解決方法**:

```bash
# 使用しているプロセスを確認
lsof -i :19530

# プロセスを停止
kill -9 <PID>
```

### `Error: Cannot find module`

**原因**: 依存関係のインストールが不完全

**解決方法**:

```bash
rm -rf node_modules package-lock.json
npm install
npm run build
```

## サポート情報

### バグレポート

バグを発見した場合は、以下の情報とともにIssueを作成してください:

1. **Context-MCPバージョン**: `context-mcp --version`
2. **Node.jsバージョン**: `node --version`
3. **OS情報**: `uname -a`（Linux/macOS）、`ver`（Windows）
4. **設定ファイル**: `.context-mcp.json`（APIキーは削除）
5. **エラーメッセージ**: ログファイルの関連部分
6. **再現手順**: 問題を再現する手順

### 診断情報の送信

```bash
# 診断情報を収集（APIキーは自動的にマスクされます）
context-mcp diagnose --output diagnosis.txt

# GitHubのIssueに diagnosis.txt を添付
```

### コミュニティサポート

- **GitHub Issues**: https://github.com/yourusername/context-mcp/issues
- **Discussions**: https://github.com/yourusername/context-mcp/discussions
- **Discord**: https://discord.gg/context-mcp（もしあれば）

### 商用サポート

商用サポートが必要な場合は、support@example.com までお問い合わせください。

## 参考資料

- [セットアップガイド](SETUP.md)
- [設定リファレンス](CONFIGURATION.md)
- [README](../README.md)
- [FAQ](FAQ.md)（もしあれば）

## 問題が解決しない場合

上記の方法で問題が解決しない場合は:

1. 最新バージョンにアップデート: `npm update -g context-mcp`
2. クリーンインストール:
   ```bash
   npm uninstall -g context-mcp
   rm -rf ~/.context-mcp ~/.cache/transformers
   npm install -g context-mcp
   ```
3. GitHubでIssueを作成: https://github.com/yourusername/context-mcp/issues/new

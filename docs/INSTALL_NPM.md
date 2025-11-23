# NPMインストールガイド

このドキュメントでは、NPMを使用したcontext-mcpのインストール方法について説明します。

## 目次

- [npxを使った実行（推奨）](#npxを使った実行推奨)
- [グローバルインストール](#グローバルインストール)
- [Claude Code設定](#claude-code設定)
- [トラブルシューティング](#トラブルシューティング)

## npxを使った実行（推奨）

最も簡単な方法は、npxを使用することです。インストール不要で、常に最新バージョンを実行できます。

```bash
npx @context-mcp/server
```

### メリット

- インストール不要
- 常に最新バージョンを使用
- ディスク容量の節約
- 複数プロジェクトで異なるバージョンを使用可能

### Claude Codeでの使用

npxを使う場合、Claude Codeの設定ファイルに以下のように記載します：

**Linux/macOS**

`~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "npx",
      "args": ["@context-mcp/server"]
    }
  }
}
```

**Windows**

`%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "npx.cmd",
      "args": ["@context-mcp/server"]
    }
  }
}
```

## グローバルインストール

頻繁に使用する場合は、グローバルインストールを推奨します。

```bash
npm install -g @context-mcp/server
```

インストール後、以下のコマンドで実行できます：

```bash
context-mcp --help
```

### Claude Codeでの使用

グローバルインストールした場合、Claude Codeの設定ファイルに以下のように記載します：

**Linux/macOS**

`~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "context-mcp"
    }
  }
}
```

**Windows**

`%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "context-mcp": {
      "command": "context-mcp.cmd"
    }
  }
}
```

## 対応プラットフォーム

以下のプラットフォームに対応しています：

- **Linux x64**: `@context-mcp/linux-x64`
- **Linux ARM64**: `@context-mcp/linux-arm64`
- **macOS x64** (Intel Macs): `@context-mcp/darwin-x64`
- **macOS ARM64** (Apple Silicon): `@context-mcp/darwin-arm64`
- **Windows x64**: `@context-mcp/win32-x64`

プラットフォームは自動的に検出され、適切なバイナリがダウンロードされます。

## バイナリのダウンロード

初回インストール時、GitHub Releasesから対応するプラットフォームのバイナリが自動的にダウンロードされます。

ダウンロード先：
```
https://github.com/windschord/context-mcp/releases/download/v{version}/context-mcp-{platform}
```

ネットワーク環境によっては、ダウンロードに時間がかかる場合があります。

## トラブルシューティング

### バイナリのダウンロードに失敗する

**症状**: インストール時にバイナリのダウンロードエラーが発生する

**解決方法**:

1. インターネット接続を確認してください
2. ファイアウォールやプロキシ設定を確認してください
3. 手動でバイナリをダウンロードして配置する：

```bash
# Linux x64の例
mkdir -p node_modules/@context-mcp/linux-x64/bin
curl -L https://github.com/windschord/context-mcp/releases/download/v0.1.0/context-mcp-linux-x64 \
  -o node_modules/@context-mcp/linux-x64/bin/context-mcp
chmod +x node_modules/@context-mcp/linux-x64/bin/context-mcp
```

### プラットフォームがサポートされていない

**症状**: `Unsupported platform: {platform}-{arch}` エラーが表示される

**解決方法**:

お使いのプラットフォームは現在サポートされていません。以下の方法を試してください：

1. ソースからビルドする（[BUILD.md](BUILD.md)を参照）
2. GitHubにissueを作成して、サポートをリクエストする

### Claude Codeで認識されない

**症状**: Claude Codeを起動してもcontext-mcpが表示されない

**解決方法**:

1. 設定ファイルのパスが正しいか確認：
   - Linux/macOS: `~/.config/claude/claude_desktop_config.json`
   - Windows: `%APPDATA%\Claude\claude_desktop_config.json`

2. JSONの構文が正しいか確認（カンマ、括弧など）

3. Claude Codeを再起動

4. コマンドラインから直接実行して動作確認：
   ```bash
   npx @context-mcp/server --help
   ```

### バイナリの実行権限エラー（Linux/macOS）

**症状**: `Permission denied` エラーが発生する

**解決方法**:

```bash
# グローバルインストールの場合
chmod +x $(which context-mcp)

# npxの場合（一例）
chmod +x ~/.npm/_npx/*/node_modules/@context-mcp/*/bin/context-mcp
```

### Windows Defender/セキュリティソフトによるブロック

**症状**: Windowsで実行時にセキュリティ警告が表示される

**解決方法**:

1. Windows Defenderの例外設定に追加：
   - 設定 → 更新とセキュリティ → Windowsセキュリティ → ウイルスと脅威の防止
   - 「ウイルスと脅威の防止」の設定 → 除外の管理
   - バイナリのパスを追加

2. 信頼できるバイナリであることを確認してから実行を許可

### npxが遅い

**症状**: npxでの実行に毎回時間がかかる

**解決方法**:

1. グローバルインストールに切り替える：
   ```bash
   npm install -g @context-mcp/server
   ```

2. または、ローカルにインストールしてnode_modules/.binを使用：
   ```bash
   npm install @context-mcp/server
   ./node_modules/.bin/context-mcp
   ```

### バージョンの確認

現在インストールされているバージョンを確認：

```bash
# npxの場合
npx @context-mcp/server --version

# グローバルインストールの場合
context-mcp --version

# npmパッケージのバージョン確認
npm list -g @context-mcp/server
```

### アンインストール

```bash
# グローバルインストールの削除
npm uninstall -g @context-mcp/server

# ローカルインストールの削除
npm uninstall @context-mcp/server

# npxのキャッシュクリア
npx clear-npx-cache
# または
rm -rf ~/.npm/_npx
```

## 追加リソース

- [Configuration Guide](CONFIGURATION.md) - 設定ファイルの詳細
- [MCP Tools API](MCP_TOOLS_API.md) - MCPツールのAPI仕様
- [Build from Source](BUILD.md) - ソースからビルドする方法
- [GitHub Issues](https://github.com/windschord/context-mcp/issues) - 問題報告・質問

## セキュリティ

バイナリはGitHub Releasesから署名付きでダウンロードされます。セキュリティ上の懸念がある場合は、ソースからビルドすることを推奨します。

## 更新

新しいバージョンがリリースされた場合：

```bash
# npxの場合（自動的に最新版を使用）
npx @context-mcp/server

# グローバルインストールの場合
npm update -g @context-mcp/server

# 特定バージョンを指定
npm install -g @context-mcp/server@0.2.0
```

# cargo-binstallによるインストール

context-mcpは、cargo-binstallを使用してビルド済みバイナリを簡単にインストールできます。これにより、コンパイル時間をスキップして、数秒でインストールが完了します。

## cargo-binstallとは

cargo-binstallは、Rustクレートのビルド済みバイナリをGitHub Releasesから自動的にダウンロード・インストールするツールです。通常の`cargo install`と異なり、ソースからのコンパイルが不要なため、大幅に時間を短縮できます。

## メリット

- **高速インストール**: コンパイル不要で数秒でインストール完了
- **依存関係不要**: protobuf compilerなどのビルド時依存関係が不要
- **シンプル**: 通常の`cargo install`と同じ使用感
- **信頼性**: GitHub Releasesから公式バイナリをダウンロード

## インストール手順

### 1. cargo-binstallのインストール

まず、cargo-binstall自体をインストールします。

#### Linux/macOS

```bash
curl -L --proto '=https' --tlsv1.2 -sSf https://raw.githubusercontent.com/cargo-bins/cargo-binstall/main/install-from-binstall-release.sh | bash
```

#### Cargo経由（全プラットフォーム）

```bash
cargo install cargo-binstall
```

#### その他のインストール方法

詳細は[cargo-binstall公式ドキュメント](https://github.com/cargo-bins/cargo-binstall#installation)を参照してください。

### 2. context-mcpのインストール

cargo-binstallを使ってcontext-mcpをインストールします。

```bash
cargo binstall context-mcp
```

インストール時に確認プロンプトが表示されたら、`y`を入力して続行してください。

### 3. インストールの確認

```bash
context-mcp --version
```

バージョン情報が表示されれば、インストール成功です。

## 対応プラットフォーム

cargo-binstallは以下のプラットフォームでビルド済みバイナリをダウンロードできます：

- **Linux**: x86_64-unknown-linux-gnu
- **macOS (Intel)**: x86_64-apple-darwin
- **macOS (Apple Silicon)**: aarch64-apple-darwin

その他のプラットフォームでは、自動的にソースからのビルドにフォールバックします。

## Claude Codeでの使用方法

インストール後、Claude Codeで使用するための設定を行います。

### 方法A: `claude mcp add`コマンド（推奨）

```bash
claude mcp add --transport stdio lsp-mcp \
  --env LSP_MCP_MODE=local \
  --env LOG_LEVEL=INFO \
  -- context-mcp
```

注: `context-mcp`はパスの指定不要です。cargo-binstallがインストールしたバイナリは自動的に`$PATH`に追加されます。

### 方法B: 設定ファイルの直接編集

Claude Codeの設定ファイルを編集します：

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "lsp-mcp": {
      "command": "context-mcp",
      "args": [],
      "env": {
        "LSP_MCP_MODE": "local",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

設定後、Claude Codeを再起動してください。

## 更新方法

新しいバージョンがリリースされた場合は、以下のコマンドで更新できます：

```bash
cargo binstall context-mcp --force
```

または、アンインストールしてから再インストールします：

```bash
cargo uninstall context-mcp
cargo binstall context-mcp
```

## アンインストール

```bash
cargo uninstall context-mcp
```

## トラブルシューティング

### cargo-binstallが見つからない

cargo-binstallのインストールディレクトリが`$PATH`に追加されていることを確認してください：

```bash
# ~/.cargo/binがPATHに含まれているか確認
echo $PATH | grep -q ".cargo/bin" && echo "OK" || echo "NG"

# 含まれていない場合、シェルの設定ファイルに追加
echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.bashrc  # Bashの場合
echo 'export PATH="$HOME/.cargo/bin:$PATH"' >> ~/.zshrc   # Zshの場合
source ~/.bashrc  # または source ~/.zshrc
```

### ダウンロードエラーが発生する

ネットワーク接続を確認し、GitHubにアクセスできることを確認してください。企業プロキシ環境下では、プロキシ設定が必要な場合があります：

```bash
export HTTP_PROXY=http://proxy.example.com:8080
export HTTPS_PROXY=http://proxy.example.com:8080
```

### ビルド済みバイナリが見つからない

お使いのプラットフォームがサポートされていない場合、cargo-binstallは自動的にソースからのビルドにフォールバックします。この場合、通常の`cargo install`と同じ依存関係が必要になります：

```bash
# Ubuntu/Debian
sudo apt-get install -y protobuf-compiler libssl-dev pkg-config build-essential

# macOS
brew install protobuf
```

### パーミッションエラー

インストール先のディレクトリに書き込み権限がない場合、sudoを使用する必要はありません。cargo-binstallは自動的に`~/.cargo/bin`にインストールします。

## 関連リンク

- [cargo-binstall公式リポジトリ](https://github.com/cargo-bins/cargo-binstall)
- [context-mcp GitHubリポジトリ](https://github.com/windschord/context-mcp)
- [context-mcp Releases](https://github.com/windschord/context-mcp/releases)
- [セットアップガイド](SETUP.md)
- [設定リファレンス](CONFIGURATION.md)

## 比較：cargo installとの違い

| 項目 | cargo binstall | cargo install |
|------|----------------|---------------|
| インストール時間 | 数秒 | 数分〜数十分 |
| ビルド時依存関係 | 不要 | 必要（protoc等） |
| ネットワーク使用量 | 少（バイナリのみ） | 多（依存クレート全て） |
| カスタマイズ | 不可 | 可能（features指定等） |
| 推奨用途 | 通常の使用 | 開発・カスタマイズ |

## 次のステップ

インストールが完了したら、以下のドキュメントを参照して使用を開始してください：

1. [クイックスタートガイド](../README.md#クイックスタート)
2. [Milvus standaloneのセットアップ](SETUP.md#milvus-standaloneの起動)
3. [基本的な使用方法](../README.md#claude-codeでの使用方法)

# MCP Server

MCPサーバーの実装です。

## 概要

`MCPServer`クラスは、Model Context Protocol (MCP)に準拠したサーバーを実装しています。Claude Codeと通信するためのStdio通信を使用します。

## 主な機能

### 初期化（Initialize）
- サーバー情報の提供（名前、バージョン）
- サーバー機能（capabilities）の宣言
- プロトコルバージョンの宣言

### シャットダウン（Shutdown）
- グレースフルシャットダウン
- トランスポートのクローズ
- リソースの解放

### エラーハンドリング
- MCPプロトコルエラーの適切な処理
- トランスポートエラーの処理
- すべてのエラーはstderrにログ出力

### ロギング
- stderrへのJSON形式ログ出力
- stdoutはMCP通信用に予約
- ログレベル制御（DEBUG, INFO, WARN, ERROR）

## 使用方法

```typescript
import { MCPServer } from './server/mcp-server.js';

const server = new MCPServer('lsp-mcp', '0.1.0');
await server.run();
```

## アーキテクチャ

```
┌─────────────────┐
│  Claude Code    │
└────────┬────────┘
         │ stdio
         ↓
┌─────────────────┐
│  MCPServer      │
│  - initialize   │
│  - shutdown     │
│  - error handle │
└────────┬────────┘
         │
         ↓
┌─────────────────┐
│  Logger         │
│  (stderr)       │
└─────────────────┘
```

## 次のステップ

今後、以下のMCPツールを実装していきます：

1. `index_project` - プロジェクトのインデックス化
2. `search_code` - セマンティックコード検索
3. `get_symbol` - シンボル定義・参照の検索
4. `find_related_docs` - 関連ドキュメントの検索
5. `get_index_status` - インデックス状態の取得
6. `clear_index` - インデックスのクリア

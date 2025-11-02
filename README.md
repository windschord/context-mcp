# LSP-MCP

Model Context Protocol (MCP) plugin for Claude Code with Tree-sitter AST parsing and vector database.

## 概要

LSP-MCPは、Tree-sitterによるAST解析とベクターDBを組み合わせた、Claude Code向けのModel Context Protocol (MCP)プラグインです。ソースコードとドキュメントを統合的に解析し、セマンティック検索を提供します。

## 主な機能

- コンテキストトークン使用量を30-40%削減
- ハイブリッド検索（BM25 + Vector）による高精度な検索
- プライバシーファーストのローカル完結実行（デフォルト）
- 多言語対応（TypeScript/JS, Python, Go, Rust, Java, C/C++/Arduino）

## 開発状況

現在開発中です。詳細は`docs/`ディレクトリを参照してください。

## 必要環境

- Node.js 18.0以上
- npm 9.0以上
- Docker & Docker Compose（Milvus使用時）

## インストール

```bash
npm install
```

## 開発

```bash
# ビルド
npm run build

# 開発モード（ウォッチ）
npm run dev

# テスト
npm test

# Lint
npm run lint
```

## ライセンス

MIT

## 詳細ドキュメント

- [要件定義](docs/requirements.md)
- [設計書](docs/design.md)
- [タスク管理](docs/tasks.md)

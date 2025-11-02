# サンプルドキュメント

このドキュメントはMarkdownパーサーのテスト用サンプルです。

## セクション1: コードブロックの例

TypeScriptのコード例：

```typescript
function hello(name: string): string {
  return `Hello, ${name}!`;
}
```

Pythonのコード例：

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"
```

言語タグなしのコードブロック：

```
This is a code block without language tag.
```

## セクション2: リンク情報

- [外部リンク](https://example.com)
- [内部リンク](./other-doc.md)
- [GitHubリンク](https://github.com/user/repo)

### サブセクション2.1: ファイルパス参照

このプロジェクトの主要なファイル：

- `src/index.ts` - エントリーポイント
- `src/parser/markdown-parser.ts` - Markdownパーサー
- `/absolute/path/to/file.ts` - 絶対パス参照
- `tests/fixtures/sample.md` - このファイル

## セクション3: 画像

![サンプル画像](./images/sample.png)
![外部画像](https://example.com/image.png)

## セクション4: その他の要素

### リスト

- 項目1
- 項目2
  - ネスト項目2.1
  - ネスト項目2.2
- 項目3

### 番号付きリスト

1. 最初の項目
2. 2番目の項目
3. 3番目の項目

### コードインライン

`inline code` はこのように書きます。

### 強調

**太字** と *イタリック* と ***太字イタリック***

## セクション5: TODO/FIXME

<!-- TODO: この部分を実装する -->
<!-- FIXME: バグを修正する -->


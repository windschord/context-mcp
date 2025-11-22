# Context-MCP テストガイド

このドキュメントでは、Context-MCPプロジェクトのテスト実行方法とテストの分類について説明します。

## テストの分類

Context-MCPプロジェクトのテストは以下のように分類されています。

### 1. ユニットテスト（Unit Tests）

各モジュールの個別機能をテストします。

**実行方法:**
```bash
cargo test --lib
```

**対象モジュール:**
- `src/config/`: 設定管理のテスト
- `src/embedding/`: 埋め込みエンジンのテスト
- `src/error.rs`: エラー処理のテスト
- `src/indexing/`: インデックスサービス、ファイルスキャナー、ファイル監視のテスト
- `src/parser/`: ASTパーサーとシンボル抽出のテスト
- `src/search/`: BM25エンジン、ハイブリッド検索、トークナイザーのテスト
- `src/storage/`: Milvusクライアントのテスト
- `src/tools/`: MCPツールパラメータのテスト

### 2. 統合テスト（Integration Tests）

複数のモジュールを組み合わせた統合的なテストです。

**実行方法:**
```bash
cargo test --test '*'
```

**テストディレクトリ:**
- `tests/`: 統合テストファイル（将来追加予定）

### 3. サーバーテスト（Server Tests）

MCPサーバーの動作をテストします。

**実行方法:**
```bash
cargo test --lib server::tests
```

**対象:**
- `src/server/tests.rs`: MCPツール（index_project, search_code等）のテスト

## テスト実行コマンド

### すべてのテストを実行

```bash
cargo test
```

### ユニットテストのみ実行

```bash
cargo test --lib
```

### 特定のモジュールのテストを実行

```bash
cargo test --lib <module_name>
```

例:
```bash
cargo test --lib indexing
cargo test --lib parser
cargo test --lib search
```

### 詳細出力でテストを実行

```bash
cargo test --verbose
```

### 並列実行せずにテストを実行

```bash
cargo test -- --test-threads=1
```

### 無視されたテストも含めて実行

```bash
cargo test -- --ignored
```

## カバレッジ測定

テストカバレッジを測定するには、`cargo-llvm-cov`を使用します。

### インストール

```bash
cargo install cargo-llvm-cov
```

### カバレッジレポート生成

```bash
# ユニットテストのカバレッジ
cargo llvm-cov --lib --all-features

# HTML形式でカバレッジレポート生成
cargo llvm-cov --lib --all-features --html

# カバレッジレポートをブラウザで開く
cargo llvm-cov --lib --all-features --open
```

### カバレッジ目標

- **現在のカバレッジ:** 約72%
- **目標カバレッジ:** 80%以上

## CI/CDでのテスト

GitHub Actionsワークフローでテストが自動実行されます。

**ワークフローファイル:** `.github/workflows/rust-ci.yml`

**実行内容:**
1. ユニットテストの実行（`cargo test --lib`）
2. カバレッジ測定とレポート生成
3. カバレッジ閾値チェック（現在: 70%）

## テストのベストプラクティス

### 1. モックの使用

外部依存（Milvus、ONNX Runtime等）を持つコンポーネントは、`mockall`クレートを使用してモック化します。

**例:**
```rust
use mockall::automock;

#[automock]
pub trait MilvusClientTrait {
    async fn insert(&self, collection: &str, records: Vec<VectorRecord>) -> Result<Vec<String>>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_with_mock() {
        let mut mock = MockMilvusClientTrait::new();
        mock.expect_insert()
            .returning(|_, _| Ok(vec!["id1".to_string()]));

        // テストコード
    }
}
```

### 2. 一時ディレクトリの使用

ファイルシステムを使用するテストでは、`tempfile`クレートを使用します。

**例:**
```rust
use tempfile::TempDir;

#[test]
fn test_file_operations() {
    let temp_dir = TempDir::new().unwrap();
    let test_file = temp_dir.path().join("test.txt");
    // テストコード
}
```

### 3. 非同期テスト

非同期関数のテストでは、`#[tokio::test]`アトリビュートを使用します。

**例:**
```rust
#[tokio::test]
async fn test_async_function() {
    let result = async_function().await;
    assert!(result.is_ok());
}
```

## テストの追加

新しい機能を追加する際は、以下のガイドラインに従ってテストを追加してください。

1. **ユニットテスト:** 各関数・メソッドに対して最低1つのテストを追加
2. **エラーケース:** 正常系だけでなく、異常系のテストも追加
3. **エッジケース:** 境界値や特殊なケースもテスト
4. **ドキュメント:** テストの目的をコメントで明記

## トラブルシューティング

### テストがタイムアウトする

ファイル監視やデバウンス処理のテストは時間がかかることがあります。タイムアウトを延長するには：

```bash
RUST_TEST_TIME_UNIT=60000 cargo test
```

### カバレッジレポートが生成されない

`cargo-llvm-cov`がインストールされているか確認してください：

```bash
cargo install cargo-llvm-cov
```

### モックが期待通りに動作しない

`mockall`の期待値設定が正しいか確認してください。特に、`returning()`や`times()`の設定に注意してください。

## 参考資料

- [Rust Testing Documentation](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [mockall Documentation](https://docs.rs/mockall/latest/mockall/)
- [cargo-llvm-cov Documentation](https://github.com/taiki-e/cargo-llvm-cov)

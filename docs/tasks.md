# タスク：Context-MCP実装計画

## 実装計画

### フェーズ1: プロジェクトセットアップとMCPサーバー基盤 (推定期間: 3日)

- タスク1.1: プロジェクト初期化とパッケージ設定 | Node.jsプロジェクト初期化、TypeScript設定、依存関係インストール (依存: なし | 工数: 2h | ステータス: DONE)
- タスク1.2: MCP SDKの統合とサーバー骨格作成 | @modelcontextprotocol/sdk導入、MCPサーバー基本構造実装 (依存: 1.1 | 工数: 4h | ステータス: DONE)
- タスク1.3: 設定ファイル管理システムの実装 | .context-mcp.json読み込み、バリデーション、デフォルト値提供 (依存: 1.1 | 工数: 3h | ステータス: DONE)
- タスク1.4: ファイルシステムスキャナーの実装 | プロジェクトディレクトリスキャン、対象ファイル列挙機能 (依存: 1.3 | 工数: 4h | ステータス: DONE)

### フェーズ2: AST解析とドキュメント解析 (推定期間: 5日)

- タスク2.1: Tree-sitterのセットアップと言語パーサー統合 | Tree-sitter本体と各言語パーサー（TS/JS, Python, Go, Rust, Java, C/C++/Arduino）のインストール・設定 (依存: 1.1 | 工数: 4h | ステータス: DONE)
- タスク2.2: AST解析エンジンの実装 | Tree-sitter使用によるソースコードからASTへの変換機能 (依存: 2.1 | 工数: 5h | ステータス: DONE)
- タスク2.3: シンボル抽出機能の実装（関数、クラス、変数） | ASTから関数、クラス、変数定義を抽出 (依存: 2.2 | 工数: 8h | ステータス: DONE)
- タスク2.4: コメント・docstring抽出機能の実装 | ソースコードからコメント、docstring、TODO/FIXMEマーカーを抽出 (依存: 2.3 | 工数: 4h | ステータス: DONE)
- タスク2.5: Markdownパーサーの実装 | Markdownファイルの構造解析と情報抽出（見出し、コードブロック、リンク） (依存: 1.1 | 工数: 4h | ステータス: DONE)
- タスク2.6: ドキュメント-コード関連付け機能の実装 | ドキュメント内のコード参照と実際のソースコードを紐付け (依存: 2.3, 2.5 | 工数: 6h | ステータス: DONE)

### フェーズ3: ベクターDB統合と検索機能 (推定期間: 5日)

> **設計変更（2025-01-03）**: ベクターDBサポートをMilvus standaloneとZilliz Cloudのみに変更（Chromaプラグイン削除）

- タスク3.1: ベクターDBプラグインインターフェースの設計 | 複数のベクターDBに対応するための共通インターフェース定義 (依存: 1.1 | 工数: 3h | ステータス: DONE)
- タスク3.2: Milvusプラグインの実装（ローカルDocker + クラウド対応） | Milvus standalone接続、Zilliz Cloud接続、コレクション管理、ベクトル操作、類似検索 (依存: 3.1 | 工数: 9h | ステータス: DONE)
- タスク3.3: Chromaプラグインの実装（軽量代替DB） | DEPRECATED - 設計変更により廃止 (依存: 3.1 | 工数: 5h | ステータス: DEPRECATED)
- タスク3.4: ローカル埋め込みエンジンの実装（Transformers.js） | ローカル実行可能な埋め込みモデル実装（all-MiniLM-L6-v2、外部通信なし） (依存: 1.3 | 工数: 6h | ステータス: DONE)
- タスク3.5: クラウド埋め込みエンジンの実装（OpenAI, VoyageAI） | クラウドベースの埋め込みAPI対応、レート制限、リトライ機能 (依存: 1.3 | 工数: 5h | ステータス: DONE)
- タスク3.6: モード切り替え機能の実装 | ローカルモードとクラウドモードの切り替え、外部通信ブロック、モード選択ウィザード (依存: 3.4, 3.5 | 工数: 4h | ステータス: DONE)
- タスク3.7: BM25全文検索エンジンの実装 | ローカル全文検索（転置インデックス、BM25スコアリング、SQLite保存） (依存: 1.1 | 工数: 6h | ステータス: DONE)
- タスク3.8: ハイブリッド検索エンジンの実装 | BM25とベクトル検索を組み合わせた検索、スコア正規化、重み付けパラメータ設定 (依存: 3.7, 3.2 | 工数: 6h | ステータス: DONE)
- タスク3.9: コードクリーンアップ（Chroma・docker-manager削除） | 設計変更に伴う不要なコード削除、依存関係削除 (依存: 3.2, 3.3 | 工数: 2h | ステータス: DONE)

### フェーズ4: Indexing ServiceとMCPツール実装 (推定期間: 4日)

- タスク4.1: Indexing Serviceの実装 | インデックス化処理全体を管理、進捗追跡、エラー収集、並列処理 (依存: 2.6, 3.4 | 工数: 7h | ステータス: DONE)
- タスク4.2: MCPツール: index_projectの実装 | プロジェクトインデックス化のMCPツール、パラメータバリデーション、進捗ストリーミング応答 (依存: 4.1, 1.2 | 工数: 4h | ステータス: DONE)
- タスク4.3: MCPツール: search_codeの実装 | セマンティックコード検索のMCPツール、ハイブリッド検索連携、結果フォーマット (依存: 3.6, 1.2 | 工数: 3h | ステータス: DONE)
- タスク4.4: MCPツール: get_symbolの実装 | シンボル検索のMCPツール、定義・参照検索、スコープ別区別 (依存: 4.1, 1.2 | 工数: 4h | ステータス: DONE)
- タスク4.5: MCPツール: find_related_docsの実装 | 関連ドキュメント検索のMCPツール、関連度スコアソート (依存: 2.6, 1.2 | 工数: 3h | ステータス: DONE)
- タスク4.6: MCPツール: get_index_status, clear_indexの実装 | インデックス管理のMCPツール、メタデータ管理 (依存: 4.1, 1.2 | 工数: 2h | ステータス: DONE)

### フェーズ5: インクリメンタル更新とファイル監視 (推定期間: 3日)

- タスク5.1: File Watcherの実装 | ファイルシステム変更監視（chokidar）、デバウンス処理500ms (依存: 1.3 | 工数: 4h | ステータス: DONE)
- タスク5.2: インクリメンタル更新機能の実装 | 変更ファイルのみ再インデックス化、差分更新、エラーハンドリング (依存: 5.1, 4.1 | 工数: 5h | ステータス: DONE)
- タスク5.3: バックグラウンド更新タスクの実装 | インクリメンタル更新の非同期実行、ワーカースレッド、優先度制御、CPU使用率制限 (依存: 5.2 | 工数: 4h | ステータス: DONE)

### フェーズ6: テストとドキュメント化 (推定期間: 3日)

- タスク6.1: ユニットテストの拡充 | ユニットテストカバレッジ向上（目標80%以上）、200+テストケース追加 (依存: Phase 1-5 | 工数: 8h | ステータス: DONE)
- タスク6.2: 統合テストの作成 | E2Eテスト・シナリオベーステスト、サンプルプロジェクト、22テスト成功 (依存: Phase 1-5 | 工数: 6h | ステータス: DONE)
- タスク6.3: パフォーマンステストの実施 | 性能要件検証（10,000ファイル、検索レスポンス、メモリ使用量）、ボトルネック分析 (依存: 6.2 | 工数: 4h | ステータス: DONE)
- タスク6.4: ユーザードキュメントの作成 | README、SETUP、CONFIGURATION、TROUBLESHOOTINGガイド作成 (依存: Phase 1-5 | 工数: 5h | ステータス: DONE)
- タスク6.5: API/開発者ドキュメントの作成 | アーキテクチャ図、PLUGIN_DEVELOPMENT、MCP_TOOLS_APIドキュメント作成 (依存: 6.4 | 工数: 4h | ステータス: DONE)

### フェーズ7: 最適化とリリース準備 (推定期間: 2日)

- タスク7.1: パフォーマンス最適化 | ParserPool、QueryCache、CachedEmbeddingEngine実装、期待改善率: インデックス化30-50%短縮、検索50-75%短縮 (依存: 6.3 | 工数: 6h | ステータス: DONE)
- タスク7.2: エラーハンドリングとロギングの改善 | エラーメッセージ改善、suggestionフィールド追加、ログローテーション実装 (依存: Phase 1-6 | 工数: 3h | ステータス: DONE)
- タスク7.3: セキュリティレビュー | センシティブファイル除外、APIキー安全保存、TLS/SSL暗号化、npm audit実行 (依存: Phase 1-6 | 工数: 3h | ステータス: DONE)
- タスク7.4: Claude Codeとの統合テスト | 実際のClaude Code環境での動作確認、統合ガイド作成 (依存: Phase 1-6 | 工数: 4h | ステータス: DONE)
- タスク7.5: リリース準備 | npmパッケージ公開準備、LICENSE、CHANGELOG作成、Semantic Versioning戦略決定 (依存: 7.4 | 工数: 2h | ステータス: DONE)

### フェーズ8: ゼロコンフィグ対応とドキュメント整備 (推定期間: 2日)

- タスク8.1: docs/requirements.mdへのゼロコンフィグ要件追加 | ストーリー7、受入基準REQ-030〜034、非機能要件NFR-029〜031追加 (依存: なし | 工数: 1h | ステータス: DONE)
- タスク8.2: docs/design.mdへの環境変数ベース設定設計追加 | コンポーネント9、技術的決定事項6追加、設定優先順位明記 (依存: 8.1 | 工数: 1.5h | ステータス: DONE)
- タスク8.3: docs/tasks.mdへのフェーズ8追加 | 本フェーズのタスク定義追加、タスク8.1〜8.6定義 (依存: 8.2 | 工数: 0.5h | ステータス: DONE)
- タスク8.4: README.mdのクイックスタート書き換え | ゼロコンフィグ手順を最上位に配置、設定ファイル作成を任意化 (依存: 8.3 | 工数: 2h | ステータス: DONE)
- タスク8.5: docs/ENVIRONMENT_VARIABLES.md作成 | 環境変数の完全なリファレンスドキュメント、設定優先順位、ユースケース別設定例 (依存: 8.3 | 工数: 2h | ステータス: DONE)
- タスク8.6: docs/SETUP.mdへの環境変数セクション追加 | ゼロコンフィグモードセクション追加、環境変数ベースセットアップ手順、従来方式との比較表 (依存: 8.5 | 工数: 1.5h | ステータス: DONE)

### フェーズ9: OpenTelemetry監視機能実装 (推定期間: 3日)

- タスク9.1: OpenTelemetry依存関係のインストール | @opentelemetry/sdk-node、@opentelemetry/api、@opentelemetry/exporter-trace-otlp-grpc、@opentelemetry/exporter-metrics-otlp-grpc、@opentelemetry/exporter-logs-otlp-httpのインストール (依存: なし | 工数: 0.5h | ステータス: TODO)
- タスク9.2: TelemetryManagerクラスの実装 | OpenTelemetry SDK初期化、環境変数・設定ファイルからの設定読み込み、条件付き有効化（デフォルトオフ） (依存: 9.1 | 工数: 4h | ステータス: TODO)
- タスク9.3: トレースインストルメンテーションの実装 | MCPツール呼び出しトレース（tool.name, tool.params, tool.duration）、ベクターDB操作トレース（operation.type, operation.duration）、AST解析トレース、埋め込み生成トレース (依存: 9.2 | 工数: 6h | ステータス: TODO)
- タスク9.4: メトリクス収集の実装 | Counter（requests.total, requests.errors, vectordb.operations）、Histogram（requests.duration, search.results）、Gauge（index.files, index.symbols, memory.usage）の実装 (依存: 9.2 | 工数: 5h | ステータス: TODO)
- タスク9.5: ログエクスポーターの実装 | エラーログ（error level）、警告ログ（warn level）、情報ログ（info level）、デバッグログ（debug level）のOTLP経由エクスポート (依存: 9.2 | 工数: 3h | ステータス: TODO)
- タスク9.6: 分散トレーシングのコンテキスト伝播実装 | ベクターDB等の外部サービス呼び出し時のトレースコンテキスト伝播、W3C Trace Context準拠 (依存: 9.3 | 工数: 3h | ステータス: TODO)
- タスク9.7: パフォーマンス最適化 | 非同期エクスポート、バッチ処理、サンプリング（デフォルト10%）、条件付き計測（テレメトリ無効時のオーバーヘッドゼロ化） (依存: 9.3, 9.4, 9.5 | 工数: 4h | ステータス: TODO)
- タスク9.8: ヘルスチェックエンドポイントの実装 | /healthエンドポイント提供、サービス稼働状態返却、依存サービス（ベクターDB、埋め込みエンジン）の死活監視 (依存: 9.2 | 工数: 2h | ステータス: TODO)
- タスク9.9: テレメトリ機能のテスト | ユニットテスト（トレース/メトリクス/ログ収集）、統合テスト（Jaeger/Prometheus連携）、パフォーマンステスト（オーバーヘッド5%以内検証） (依存: 9.3, 9.4, 9.5, 9.6, 9.7, 9.8 | 工数: 5h | ステータス: TODO)
- タスク9.10: テレメトリドキュメントの作成 | docs/OBSERVABILITY.md作成（監視設定ガイド、環境変数リファレンス、Jaeger/Grafana/Prometheus連携手順、メトリクス一覧、トラブルシューティング） (依存: 9.9 | 工数: 3h | ステータス: TODO)

### フェーズ10: Rust移行実装 (推定期間: 10-15日)

- タスク10.1: Rustプロジェクト初期化とCargo設定 | Cargo.tomlセットアップ、ワークスペース構成、依存クレート追加（rmcp, tokio, tree-sitter, ort, milvus-sdk-rust等） (依存: なし | 工数: 3h | ステータス: DONE)
- タスク10.2: MCP Rust SDKの統合 | rmcp crateを使用したMCPサーバー基盤実装、ツールハンドラー登録、エラーハンドリング (依存: 10.1 | 工数: 6h | ステータス: DONE)
- タスク10.3: Tree-sitter統合とAST解析 | tree-sitter Rustクレート統合、各言語パーサー（TS/JS, Python, Go, Rust, Java, C/C++）の設定、シンボル抽出機能 (依存: 10.1 | 工数: 10h | ステータス: DONE)
- タスク10.4: ONNX Runtime統合とEmbedding Engine実装 | ort crateまたはtract crate統合、all-MiniLM-L6-v2.onnxモデルロード、tokenizerクレート統合、埋め込み生成機能 (依存: 10.1 | 工数: 8h | ステータス: DONE)
- タスク10.5: Milvus Rust SDK統合 | milvus-sdk-rust統合、コレクション管理、ベクトル挿入・検索機能、エラーハンドリング (依存: 10.1 | 工数: 7h | ステータス: DONE)
- タスク10.6: BM25全文検索エンジン実装 | rusqliteまたはsledを使用した転置インデックス、BM25スコアリング、検索機能 (依存: 10.1 | 工数: 6h | ステータス: DONE)
- タスク10.7: ハイブリッド検索エンジン実装 | BM25とベクトル検索の統合、スコア正規化、重み付けパラメータ (依存: 10.5, 10.6 | 工数: 5h | ステータス: DONE)
- タスク10.8: Indexing Service実装 | ファイルスキャン、並列処理（tokio::spawn）、進捗追跡、エラー収集 (依存: 10.3, 10.4, 10.5 | 工数: 8h | ステータス: DONE)
- タスク10.9: MCPツール実装 | index_project, search_code, get_symbol, find_related_docs, get_index_status, clear_indexのRust実装 (依存: 10.2, 10.7, 10.8 | 工数: 10h | ステータス: DONE)
- タスク10.10: ファイル監視とインクリメンタル更新 | notify crateを使用したファイル監視、デバウンス処理、差分更新 (依存: 10.8 | 工数: 5h | ステータス: TODO)
- タスク10.11: 設定管理システム実装 | 環境変数読み込み、.context-mcp.json解析、設定マージ、バリデーション (依存: 10.1 | 工数: 4h | ステータス: DONE) ※Task 10.9の一部として実装完了
- タスク10.12: テストスイート実装 | cargo testでのユニットテスト、統合テスト、カバレッジ測定 (依存: フェーズ10全体 | 工数: 12h | ステータス: TODO)
- タスク10.13: リリースビルド最適化 | cargo build --release最適化、バイナリサイズ削減（strip, LTO）、クロスコンパイル設定（macOS, Linux, Windows） (依存: 10.12 | 工数: 4h | ステータス: TODO)
- タスク10.14: ドキュメント更新 | README.md、SETUP.md、Rustビルド手順、実行方法の更新 (依存: 10.13 | 工数: 3h | ステータス: TODO)

### フェーズ11: コンパイルエラー修正とAPI更新 (推定期間: 3-4日)

> **背景**: Task 10.1-10.9で実装完了したが、依存crateのAPI変更により136個のコンパイルエラーが発生。
> 根本原因: (1) rusqliteのSend/Sync問題、(2) rmcp v0.8構文変更、(3) Milvus/ort API変更
> 詳細: COMPILATION_ISSUES_ANALYSIS.md参照

#### フェーズ11.1: ブロッカー解決（優先度: 最高）

- タスク11.1: rusqlite Send/Sync問題の解決 | BM25EngineのConnectionをArc<Mutex<Connection>>に変更、全メソッドでロック取得、HybridSearchEngineとContextMcpServerへの影響修正 (依存: 10.6, 10.7, 10.9 | 工数: 4h | ステータス: TODO)
  - **根本原因**: rusqliteのConnectionが`RefCell`使用のため`Sync`未実装
  - **影響範囲**: BM25Engine、HybridSearchEngine、ContextMcpServer
  - **受入基準**:
    - [ ] BM25EngineがSend + Syncを実装
    - [ ] HybridSearchEngineがSend + Syncを実装
    - [ ] ContextMcpServerがServerHandlerを実装可能
  - **技術詳細**:
    - src/search/bm25_engine.rs: Connection → Arc<Mutex<Connection>>
    - src/search/hybrid_engine.rs: BM25Engineの変更に対応
    - src/server/mod.rs: ServerStateの変更に対応

- タスク11.2: rmcp toolマクロ構文の修正 | rmcp v0.8の正しい構文に19箇所のパラメータアノテーションを修正、ドキュメント調査 (依存: 10.2, 10.9 | 工数: 2h | ステータス: TODO)
  - **根本原因**: rmcp v0.8が`#[tool(schema(...))]`構文をサポートしていない
  - **影響箇所**: src/server/mod.rs の全6ツール（19パラメータ）
  - **受入基準**:
    - [ ] 全toolマクロがコンパイル可能
    - [ ] パラメータのdescriptionが正しく設定される
  - **調査事項**:
    - rmcp v0.8のドキュメント確認
    - 正しいパラメータスキーマ定義方法
    - 他のrmcp使用例の調査

- タスク11.3: エラー型の統一 | ContextMcpErrorからErrorDataへの変換実装、From traitの実装 (依存: 10.2 | 工数: 2h | ステータス: TODO)
  - **根本原因**: rmcp v0.8は`McpError`（= `ErrorData`）を期待、`ContextMcpError`との型不一致
  - **影響箇所**: src/error.rs、src/server/mod.rs
  - **受入基準**:
    - [ ] `From<ContextMcpError> for ErrorData`実装
    - [ ] ServerHandlerの型制約を満たす
    - [ ] エラーメッセージが適切に変換される
  - **技術詳細**:
    - src/error.rs: From trait実装追加
    - src/server/mod.rs: エラーハンドリング修正

#### フェーズ11.2: API更新（優先度: 高）

- タスク11.4: Milvus API更新 | パッチ版milvusの実際のAPIに合わせてFieldColumn、Client、Collectionの使用方法を修正（12箇所以上） (依存: 10.5 | 工数: 6h | ステータス: TODO)
  - **根本原因**: ローカルパッチしたmilvus v0.2.0のAPIが期待されるAPIと異なる
  - **影響箇所**: src/storage/milvus_client.rs 全体
  - **受入基準**:
    - [ ] 全Milvus操作がコンパイル可能
    - [ ] insert、search、deleteが動作
    - [ ] FieldColumnの正しいコンストラクタを使用
    - [ ] Clientメソッドが正しく呼び出せる
  - **調査事項**:
    - vendor/milvus-patched/のソースコードを確認
    - FieldColumnの実際のAPI
    - Clientの実際のメソッドシグネチャ
    - Collectionのジェネリクス要件
  - **変更内容**:
    - FieldColumn::new_varchar → 実際のコンストラクタ
    - FieldColumn::new_float_vector → 実際のコンストラクタ
    - FieldColumn::new_int64 → 実際のコンストラクタ
    - Client::insert → 正しいシグネチャ
    - Collection<C>のジェネリクス指定

- タスク11.5: ort API更新 | ort v2.0.0-rc.10の正しいAPIに修正（Value import、try_extract_map使用、SessionOutputs::get修正） (依存: 10.4 | 工数: 1h | ステータス: TODO)
  - **根本原因**: ort v2.0.0-rc.10のAPI変更
  - **影響箇所**: src/embedding/engine.rs
  - **受入基準**:
    - [ ] 埋め込み生成が正常に動作
    - [ ] Valueのインポートが正しい
    - [ ] 出力テンソルの抽出が成功
  - **技術詳細**:
    - `use ort::value::Value;`を追加
    - `try_extract()` → `try_extract_map()`
    - `outputs.get(0)` → `outputs.get("output_name")`

#### フェーズ11.3: 細部修正（優先度: 中）

- タスク11.6: 型不一致の修正 | ジェネリクス引数、関数引数の型、モジュール可視性の修正（23箇所） (依存: 11.1-11.5 | 工数: 3h | ステータス: TODO)
  - **内容**:
    - ジェネリクス引数の追加/削除
    - 関数引数の型修正
    - プライベートモジュールのpub化
  - **受入基準**:
    - [ ] 全型不一致エラーが解消
    - [ ] cargo checkがエラーなしで完了

- タスク11.7: 警告の修正 | 未使用インポート、未使用コード、不要な括弧の削除（12箇所） (依存: 11.6 | 工数: 1h | ステータス: TODO)
  - **内容**:
    - 未使用インポートの削除
    - 未使用コードの削除
    - 不要な括弧の削除
  - **受入基準**:
    - [ ] cargo check --all-targetsが警告なしで完了

#### フェーズ11.4: 検証とテスト（優先度: 高）

- タスク11.8: コンパイル検証とユニットテスト | 全モジュールのコンパイル確認、既存ユニットテストの実行、統合テストの基本動作確認 (依存: 11.1-11.7 | 工数: 3h | ステータス: TODO)
  - **受入基準**:
    - [ ] `cargo check`がエラー0、警告0で完了
    - [ ] `cargo test --lib`で既存テストが通過
    - [ ] 基本的な統合テストが動作
  - **検証項目**:
    - Parser単体テスト
    - Tokenizer単体テスト
    - BM25Engine単体テスト
    - 基本的なMCPサーバー起動

## タスクステータスの凡例
- `TODO` - 未着手
- `IN_PROGRESS` - 作業中
- `BLOCKED` - 依存関係や問題によりブロック中
- `REVIEW` - レビュー待ち
- `DONE` - 完了

## マイルストーン

| マイルストーン | 完了条件 | 目標日 |
|--------------|---------|-------|
| M1: 基盤完成 | フェーズ1完了 | 開始+3日 |
| M2: 解析機能完成 | フェーズ2完了 | 開始+8日 |
| M3: 検索機能完成 | フェーズ3完了 | 開始+13日 |
| M4: MCP統合完成 | フェーズ4完了 | 開始+17日 |
| M5: 自動更新完成 | フェーズ5完了 | 開始+20日 |
| M6: 品質保証完成 | フェーズ6完了 | 開始+23日 |
| M7: リリース準備完了 | フェーズ7完了 | 開始+25日 |
| M8: ゼロコンフィグ対応完了 | フェーズ8完了 | 開始+27日 |
| M9: 監視機能完成 | フェーズ9完了 | 開始+30日 |
| M10: Rust移行完成 | フェーズ10完了 | 開始+15日（新ブランチ基準） |
| M11: コンパイルエラー解決 | フェーズ11完了 | 開始+19日（新ブランチ基準） |

## リスクと軽減策

### リスク1: Tree-sitter各言語パーサーの品質・完成度のばらつき
**影響度**: 中 | **発生確率**: 高
**軽減策**: 優先度高の5言語を先行実装、パースエラーでもスキップして処理継続、コミュニティ評価高のパーサー優先採用

### リスク2: ベクターDB接続の信頼性問題
**影響度**: 高 | **発生確率**: 中
**軽減策**: ローカルキャッシュへのフォールバック、自動リトライ機能、複数のベクターDBバックエンドサポート

### リスク3: 大規模プロジェクトでのメモリ不足
**影響度**: 高 | **発生確率**: 中
**軽減策**: ストリーミング処理、バッチサイズ調整、メモリ使用量モニタリング、ワーカースレッド分散処理

### リスク4: 埋め込みAPIのコスト
**影響度**: 中 | **発生確率**: 高
**軽減策**: ローカル埋め込みモデルオプション、インクリメンタル更新、キャッシュ機能、コスト見積もり機能

### リスク5: Claude Codeのアップデートによる互換性問題
**影響度**: 中 | **発生確率**: 中
**軽減策**: MCP公式仕様への厳密準拠、バージョン互換性テスト自動化、リリースノート追跡、後方互換性維持

## 進捗管理

### 週次レビュー項目
- [ ] 各フェーズの進捗状況確認
- [ ] ブロッカーの特定と解決策検討
- [ ] 見積もりと実績の差異分析
- [ ] 次週の優先タスク決定

### 品質ゲート
各フェーズ完了時に以下を確認：
- [ ] ユニットテストが通る
- [ ] コードレビューが完了している
- [ ] ドキュメントが更新されている
- [ ] 受入基準がすべて満たされている

## 備考

### 技術スタック概要
- **言語**: Rust | **MSRV**: 1.75（推奨: 1.80以降）
- **AST解析**: tree-sitter Rustクレート
- **ベクターDB（ローカル）**: Milvus standalone（Docker Compose、localhost:19530）
- **ベクターDB（クラウド）**: Zilliz Cloud
- **埋め込み**: ローカルONNXモデル（ort/tract crate経由）
- **全文検索**: BM25（自前実装、rusqlite/sled等）
- **ファイル監視**: notify crate | **テスト**: cargo test | **ビルド**: cargo build
- **非同期ランタイム**: tokio | **MCP SDK**: rmcp (公式Rust SDK)

> **設計変更（2025-01-03）**: ベクターDBサポートをMilvusのみに変更（Chroma、DuckDBを削除）。VectorStorePluginインターフェースは将来の拡張性のために保持。

> **実装言語変更（2025-11-16）**: Node.js/TypeScript → Rustに変更。高性能、メモリ安全性、単一バイナリ配布を実現。埋め込みモデルもローカルONNXのみサポート。

### 開発環境要件
- Rust 1.75以上（推奨: 1.80以降） | Cargo | Docker & Docker Compose（Milvus実行用） | Git | 最低8GB RAM推奨

### フェーズ12: テストカバレッジ向上（36.97% → 80%+）(推定期間: 12-15日)

> **背景**: 現在のカバレッジは36.97%（2025-11-20時点）。CI/CDに80%カバレッジ閾値を設定済み（`cargo llvm-cov --lib --all-features --fail-under-lines 80`）。
> ゼロカバレッジモジュール: server/mod.rs (623行), storage/milvus_client.rs (631行), indexing/service.rs (305行)
> 詳細: COVERAGE_ROADMAP.md参照

#### フェーズ12.1: モック基盤の構築（優先度: 最高）

- タスク12.1: Milvusクライアントモックの実装（mockall使用） | mockallクレートを使用してMockMilvusClientを自動生成、基本CRUD操作モック、検索結果モック実装 (依存: 10.5 | 工数: 6h | ステータス: TODO)
  - **使用ライブラリ**: `mockall` (Rustの標準的なモックライブラリ)
  - **実装方針**:
    - `MilvusClient`構造体のメソッドに`#[cfg_attr(test, mockall::automock)]`マクロを適用
    - テストコードで`MockMilvusClient`を使用し、`expect_*()`メソッドで期待値を設定
    - または、`MilvusClientTrait`を定義し、`#[automock]`マクロで自動モック生成
  - **テスト条件（requirements.mdより）**:
    - REQ-025: ローカル埋め込みモデルとMilvusの組み合わせテスト（ローカルモード時の外部API非接続）
    - REQ-026: Milvus standalone接続時のデータ保存検証
    - NFR-027: ベクターDB接続エラー時のフォールバック動作（ローカルキャッシュ）
  - **テスト条件（design.mdより）**:
    - コンポーネント7 Vector Store: connect(), upsert(), query(), delete()の各操作
    - データベーススキーマ: code_vectorsコレクションの全フィールド（id, vector, file_path, language, type, name, line_start, line_end, snippet, docstring, metadata）
  - **受入基準**:
    - [ ] Cargo.tomlに`mockall = "0.13"`を開発依存関係として追加
    - [ ] `MilvusClientTrait`を定義し、`#[automock]`マクロを適用
    - [ ] `MilvusClient`が`MilvusClientTrait`を実装
    - [ ] `MockMilvusClient`が自動生成され、テストで使用可能
    - [ ] `expect_create_collection()`でコレクション作成のモック設定が可能
    - [ ] `expect_insert()`で挿入操作のモック設定が可能（戻り値のカスタマイズ）
    - [ ] `expect_search()`でベクトル検索のモック設定が可能（固定結果または動的結果）
    - [ ] `expect_delete()`で削除操作のモック設定が可能
    - [ ] エラーシミュレーション: `returning()`や`returning_once()`でエラーを返却可能
    - [ ] 実際のMilvusサーバーへの依存なしでテスト実行可能
  - **実装例**:
    ```rust
    #[cfg_attr(test, automock)]
    #[async_trait]
    pub trait MilvusClientTrait {
        async fn create_collection(&self, name: &str, schema: Schema) -> Result<()>;
        async fn insert(&self, collection: &str, vectors: Vec<Vector>) -> Result<Vec<String>>;
        async fn search(&self, query: SearchQuery) -> Result<Vec<SearchResult>>;
        async fn delete(&self, collection: &str, ids: Vec<String>) -> Result<()>;
    }

    // テストでの使用例
    #[cfg(test)]
    mod tests {
        use super::*;

        #[tokio::test]
        async fn test_insert_vectors() {
            let mut mock = MockMilvusClientTrait::new();
            mock.expect_insert()
                .returning(|_, _| Ok(vec!["id1".to_string(), "id2".to_string()]));

            let result = mock.insert("test_collection", vec![]).await;
            assert!(result.is_ok());
        }
    }
    ```
  - **期待カバレッジ向上**: +12%

- タスク12.2: 埋め込みエンジンモックの実装（mockall使用） | mockallクレートを使用してMockEmbeddingEngineを自動生成、固定ベクトル返却モック、バッチ処理モック実装 (依存: 10.4 | 工数: 4h | ステータス: TODO)
  - **使用ライブラリ**: `mockall` (Rustの標準的なモックライブラリ)
  - **実装方針**:
    - `EmbeddingEngineTrait`を定義し、`#[automock]`マクロで自動モック生成
    - テストコードで`MockEmbeddingEngineTrait`を使用し、`expect_*()`メソッドで期待値を設定
    - 固定384次元ベクトルまたは動的なベクトル生成をモックで実現
  - **テスト条件（requirements.mdより）**:
    - REQ-025: ローカル埋め込みモデル（ONNX Runtime経由）の動作検証
    - NFR-017: ローカル埋め込みモデルのサポート
  - **テスト条件（design.mdより）**:
    - コンポーネント6 Embedding Engine: embed(), embed_batch(), model_info()の各操作
    - 使用ライブラリ: ort, tokenizers（モックではこれらへの依存なし）
  - **受入基準**:
    - [ ] `EmbeddingEngineTrait`を定義し、`#[automock]`マクロを適用
    - [ ] `EmbeddingEngine`が`EmbeddingEngineTrait`を実装
    - [ ] `MockEmbeddingEngineTrait`が自動生成され、テストで使用可能
    - [ ] `expect_embed()`で単一テキストの埋め込み生成をモック（固定384次元ベクトル返却）
    - [ ] `expect_embed_batch()`でバッチ処理をモック（複数ベクトル返却）
    - [ ] `expect_model_info()`でモデル情報のモックを設定
    - [ ] 正規化済みベクトル（ノルム=1.0）をモックで返却可能
    - [ ] エラーシミュレーション: モデルロードエラー、トークナイズエラーを`returning()`で返却
    - [ ] 実際のONNXモデルへの依存なしでテスト実行可能
  - **実装例**:
    ```rust
    #[cfg_attr(test, automock)]
    #[async_trait]
    pub trait EmbeddingEngineTrait {
        async fn embed(&self, text: &str) -> Result<Vec<f32>>;
        async fn embed_batch(&self, texts: &[&str]) -> Result<Vec<Vec<f32>>>;
        fn model_info(&self) -> ModelInfo;
    }

    // テストでの使用例
    #[cfg(test)]
    mod tests {
        use super::*;

        #[tokio::test]
        async fn test_embed_text() {
            let mut mock = MockEmbeddingEngineTrait::new();
            mock.expect_embed()
                .returning(|_| Ok(vec![0.1; 384])); // 固定384次元ベクトル

            let result = mock.embed("test text").await;
            assert!(result.is_ok());
            assert_eq!(result.unwrap().len(), 384);
        }
    }
    ```
  - **期待カバレッジ向上**: +5%

#### フェーズ12.2: サーバー層のテスト（優先度: 最高）

- タスク12.3: MCPサーバーのindex_projectツールテスト | index_projectツールの呼び出し、パラメータバリデーション、エラーハンドリングのテスト (依存: 12.1, 12.2, 10.9 | 工数: 6h | ステータス: TODO)
  - **テスト条件（requirements.mdより）**:
    - REQ-001: プロジェクトディレクトリ配下の全対象ファイル検出
    - REQ-002: .gitignore、.mcpignoreパターンの除外
    - REQ-003: Tree-sitter使用によるAST解析実行
    - REQ-004: Markdownファイルの構造解析（見出し、コードブロック、リンク）
    - REQ-005: 進捗状況のリアルタイム表示（処理済み/総ファイル数）
    - REQ-006: 処理サマリーの表示（総ファイル数、成功数、失敗数、処理時間）
    - NFR-001: 10,000ファイル規模のプロジェクトを5分以内にインデックス化
  - **テスト条件（design.mdより）**:
    - コンポーネント1 MCP Server: handleToolCall("index_project", params)
    - コンポーネント2 Indexing Service: indexProject(rootPath, options)
  - **受入基準**:
    - [ ] 正常系: rootPathパラメータが有効な場合、成功レスポンスを返す
    - [ ] 異常系: rootPathが存在しない場合、適切なエラーメッセージを返す
    - [ ] 異常系: rootPathがディレクトリでない場合、適切なエラーメッセージを返す
    - [ ] パラメータバリデーション: excludePatternsの検証
    - [ ] パラメータバリデーション: languagesの検証
    - [ ] パラメータバリデーション: includeDocumentsの検証
    - [ ] 進捗追跡: 処理中のファイル数と総ファイル数が正しくカウントされる
    - [ ] レスポンス形式: 処理統計（totalFiles, successCount, errorCount, processingTime）が正しく返される
  - **期待カバレッジ向上**: +8%

- タスク12.4: MCPサーバーのsearch_codeツールテスト | search_codeツールの呼び出し、ハイブリッド検索、フィルタリング、レスポンス形式のテスト (依存: 12.1, 12.2, 10.9 | 工数: 5h | ステータス: TODO)
  - **テスト条件（requirements.mdより）**:
    - REQ-007: 検索クエリ入力から500ms以内にベクトル検索開始
    - REQ-008: ハイブリッド検索（BM25 + ベクトル検索）の実行
    - REQ-009: 関連度スコア順に最大20件の結果返却
    - REQ-010: 各結果にファイルパス、行番号、スニペット、スコアを含む
    - REQ-011: コードとドキュメント両方ヒット時のリンク情報提供
    - NFR-002: 検索クエリに対して2秒以内に結果を返す
  - **テスト条件（design.mdより）**:
    - コンポーネント1 MCP Server: handleToolCall("search_code", params)
    - コンポーネント5 Hybrid Search Engine: search(query, options)
    - 検索アルゴリズム: score = α * BM25_score + (1-α) * vector_similarity_score（α=0.3）
  - **受入基準**:
    - [ ] 正常系: queryパラメータが有効な場合、検索結果配列を返す
    - [ ] パラメータバリデーション: queryが空文字列の場合、エラーを返す
    - [ ] パラメータバリデーション: topKが範囲外（1-100）の場合、デフォルト値20を使用
    - [ ] フィルタリング: fileTypesパラメータが正しく適用される
    - [ ] レスポンス形式: 各結果にfilePath, lineNumber, snippet, score, metadataが含まれる
    - [ ] スコアランキング: 結果が関連度スコア降順でソートされている
    - [ ] 件数制限: 最大topK件の結果が返される
  - **期待カバレッジ向上**: +7%

- タスク12.5: MCPサーバーの残り4ツールのテスト | get_symbol, find_related_docs, get_index_status, clear_indexのテスト (依存: 12.1, 12.2, 10.9 | 工数: 5h | ステータス: TODO)
  - **テスト条件（requirements.mdより）**:
    - REQ-012: AST解析による関数、クラス、インターフェース定義の抽出
    - REQ-013: 各定義に名前、引数、戻り値、docstringを関連付け
    - REQ-014: シンボル検索時の定義箇所と使用箇所の両方を検索
    - REQ-015: 同名シンボルが複数存在する場合のスコープ区別
    - REQ-018: ドキュメントから検索時の関連コード実装提案
  - **テスト条件（design.mdより）**:
    - コンポーネント1 MCP Server: handleToolCall("get_symbol", params)、handleToolCall("find_related_docs", params)等
    - コンポーネント2 Indexing Service: getIndexStatus(projectId), deleteIndex(projectId)
  - **受入基準**:
    - [ ] `get_symbol`: symbolNameパラメータによるシンボル検索が動作
    - [ ] `get_symbol`: symbolTypeフィルタリングが正しく適用される（function, class, variable等）
    - [ ] `get_symbol`: 定義箇所と参照箇所が区別されて返される
    - [ ] `find_related_docs`: filePathまたはsymbolNameによる関連ドキュメント検索が動作
    - [ ] `find_related_docs`: 関連度スコア付きで結果が返される
    - [ ] `get_index_status`: インデックス状況（ファイル数、シンボル数、最終更新時刻）が返される
    - [ ] `clear_index`: インデックス削除が成功し、確認メッセージが返される
    - [ ] 全ツール: パラメータバリデーションとエラーハンドリングが適切に動作
  - **期待カバレッジ向上**: +5%

#### フェーズ12.3: ストレージ層のテスト（優先度: 高）

- タスク12.6: Milvusクライアントのモックベーステスト | MilvusClientの全メソッド（コレクション作成、挿入、検索、削除）のテスト (依存: 12.1 | 工数: 7h | ステータス: TODO)
  - **テスト条件（requirements.mdより）**:
    - REQ-026: Milvus standaloneへのデータ保存検証
    - NFR-014: TLS/SSL暗号化を使用したベクターDB接続
    - NFR-027: ベクターDB接続エラー時のローカルキャッシュフォールバック
  - **テスト条件（design.mdより）**:
    - コンポーネント7 Vector Store: connect(), upsert(), query(), delete()
    - データベーススキーマ: code_vectorsコレクションの全フィールド対応
  - **受入基準**:
    - [ ] `connect()`: 正常接続時のテスト（モックが接続成功を返す）
    - [ ] `connect()`: 接続エラー時のテスト（適切なエラーメッセージ）
    - [ ] `create_collection()`: コレクション作成のテスト（スキーマ検証）
    - [ ] `insert()`: 単一ベクトル挿入のテスト
    - [ ] `insert()`: バッチ挿入のテスト（複数ベクトル）
    - [ ] `search()`: ベクトル類似検索のテスト（topKパラメータ）
    - [ ] `search()`: メタデータフィルタリングのテスト（language, file_path等）
    - [ ] `delete()`: ベクトル削除のテスト（IDまたはフィルタ条件）
    - [ ] エラーハンドリング: タイムアウト、権限エラー、コレクション不存在エラー
  - **期待カバレッジ向上**: +12%

#### フェーズ12.4: インデックスサービスのテスト（優先度: 高）

- タスク12.7: IndexingServiceの統合テスト | プロジェクト全体のインデックス化、エラーハンドリング、進捗追跡のテスト (依存: 12.1, 12.2, 10.8 | 工数: 8h | ステータス: TODO)
  - **テスト条件（requirements.mdより）**:
    - REQ-001: プロジェクトディレクトリ配下の全対象ファイル検出
    - REQ-002: .gitignore、.mcpignore除外パターンの適用
    - REQ-003: Tree-sitterによるAST解析の実行
    - REQ-004: Markdownファイルの構造解析
    - REQ-005: 進捗状況のリアルタイム表示
    - REQ-006: 処理サマリーの表示
    - NFR-001: 10,000ファイル規模を5分以内にインデックス化
    - NFR-026: 単一ファイルの解析エラーが全体を中断しない
  - **テスト条件（design.mdより）**:
    - コンポーネント2 Indexing Service: indexProject(rootPath, options), indexFile(filePath), getIndexStatus(), deleteIndex()
    - ファイルシステムスキャン、ファイル種別判定、パーサー振り分け、進捗追跡
  - **受入基準**:
    - [ ] `indexProject()`: 正常系（全ファイル成功）のテスト
    - [ ] `indexProject()`: 一部ファイル失敗時のテスト（エラー収集、処理継続）
    - [ ] `indexProject()`: 除外パターン適用のテスト（.gitignore、.mcpignore）
    - [ ] `indexFile()`: 単一ファイルインデックス化のテスト（各言語対応）
    - [ ] 進捗追跡: 処理済みファイル数と総ファイル数が正しくカウント
    - [ ] エラーハンドリング: パーサーエラー、ファイル読み込みエラー
    - [ ] バッチ処理: 並列処理が正しく動作（tokio::spawn）
    - [ ] `getIndexStatus()`: インデックス状況の取得テスト
    - [ ] `deleteIndex()`: インデックス削除のテスト
  - **期待カバレッジ向上**: +8%

#### フェーズ12.5: 埋め込みエンジンのテスト（優先度: 中）

- タスク12.8: EmbeddingEngineのモックベーステスト | テキスト埋め込み生成、バッチ処理、正規化のテスト (依存: 12.2 | 工数: 5h | ステータス: TODO)
  - **テスト条件（requirements.mdより）**:
    - REQ-025: ローカル埋め込みモデル（ONNX Runtime経由）の使用
    - NFR-017: ローカル埋め込みモデルのサポート
  - **テスト条件（design.mdより）**:
    - コンポーネント6 Embedding Engine: embed(), embed_batch(), model_info()
    - 使用ライブラリ: ort (ONNX Runtime), tokenizers (HuggingFace)
    - デフォルトモデル: all-MiniLM-L6-v2.onnx（384次元埋め込み）
  - **受入基準**:
    - [ ] `embed()`: 単一テキストの埋め込み生成テスト（モック使用）
    - [ ] `embed()`: 長文テキストの埋め込み生成テスト
    - [ ] `embed_batch()`: バッチ処理のテスト（複数テキスト）
    - [ ] `model_info()`: モデル情報取得のテスト
    - [ ] 正規化処理: ベクトルノルムが1.0に正規化される
    - [ ] エラーハンドリング: モデルロードエラー、トークナイズエラー
    - [ ] スレッドセーフ: Arc<Mutex<>>保護下での並行アクセステスト
  - **期待カバレッジ向上**: +5%

- タスク12.9: EmbeddingEngineの実ONNXモデル統合テスト（オプショナル） | 小さなテスト用モデルを使用した統合テスト (依存: 12.8 | 工数: 4h | ステータス: TODO)
  - **テスト条件（requirements.mdより）**:
    - NFR-017: ローカル埋め込みモデルのサポート
    - NFR-019: ローカルモード時の性能がクラウドモードの2倍以内
  - **テスト条件（design.mdより）**:
    - コンポーネント6 Embedding Engine: 実際のONNXモデルを使用した推論
  - **受入基準**:
    - [ ] 軽量テスト用ONNXモデル（例: distilbert-base-uncased）のダウンロード・配置
    - [ ] 実モデルを使用した`embed()`の動作テスト
    - [ ] CI環境でのモデルダウンロード設定（GitHub Actions）
    - [ ] 埋め込み品質の基本検証（類似テキストの埋め込みが近い）
  - **期待カバレッジ向上**: +2%

#### フェーズ12.6: ハイブリッド検索のテスト（優先度: 中）

- タスク12.10: HybridSearchEngineの統合テスト | BM25とベクトル検索の統合、スコア正規化、結果マージのテスト (依存: 12.1, 12.2, 10.7 | 工数: 6h | ステータス: TODO)
  - **テスト条件（requirements.mdより）**:
    - REQ-008: ハイブリッド検索（BM25 + ベクトル検索）の実行
    - REQ-009: 関連度スコア順に最大20件の結果返却
    - NFR-002: 検索クエリに対して2秒以内に結果を返す
  - **テスト条件（design.mdより）**:
    - コンポーネント5 Hybrid Search Engine: search(query, options), fullTextSearch(), vectorSearch(), mergeResults()
    - 検索アルゴリズム: score = α * BM25_score + (1-α) * vector_similarity_score（α=0.3、設定可能）
  - **受入基準**:
    - [ ] `search()`: ハイブリッド検索の統合テスト（BM25とベクトルの両結果を取得）
    - [ ] `fullTextSearch()`: BM25全文検索のみのテスト
    - [ ] `vectorSearch()`: ベクトル検索のみのテスト
    - [ ] `mergeResults()`: 両検索結果のマージとランキングテスト
    - [ ] スコア正規化: BM25スコアとベクトル類似度スコアが0-1に正規化される
    - [ ] 重み付けパラメータ（α）の変更テスト（0.0, 0.3, 0.5, 1.0）
    - [ ] フィルタリング: fileTypes, languageフィルタの適用テスト
    - [ ] 結果ソート: 最終スコア降順でソートされる
  - **期待カバレッジ向上**: +8%

#### フェーズ12.7: エラーハンドリングのテスト（優先度: 低）

- タスク12.11: エラー型の網羅的テスト | ContextMcpErrorの全バリアント、エラー変換、エラーメッセージのテスト (依存: 10.2 | 工数: 3h | ステータス: TODO)
  - **テスト条件（requirements.mdより）**:
    - NFR-023: エラー発生時の分かりやすいメッセージ表示（原因と対処方法）
  - **テスト条件（design.mdより）**:
    - コンポーネント1 MCP Server: エラーハンドリングと適切なエラーメッセージ返却
  - **受入基準**:
    - [ ] 各エラーバリアント（IoError, ParseError, VectorDbError等）の生成テスト
    - [ ] `From<io::Error> for ContextMcpError`等のエラー変換トレイトのテスト
    - [ ] `From<ContextMcpError> for ErrorData`（rmcp v0.8対応）のテスト
    - [ ] エラーメッセージの内容検証（原因と対処方法が含まれる）
    - [ ] エラーチェーンのテスト（source()メソッド）
  - **期待カバレッジ向上**: +2%

#### フェーズ12.8: CI/CD統合とマイルストーン管理（優先度: 高）

- タスク12.12: カバレッジ閾値の段階的引き上げ | CI設定の閾値を段階的に更新（40% → 65% → 78% → 80%） (依存: 12.3-12.11 | 工数: 2h | ステータス: TODO)
  - **テスト条件（requirements.mdより）**:
    - なし（CI/CD管理タスク）
  - **テスト条件（design.mdより）**:
    - なし（CI/CD管理タスク）
  - **受入基準**:
    - [ ] マイルストーン1達成時（50%）: 閾値を40%に設定（.github/workflows/rust-ci.yml）
    - [ ] マイルストーン2達成時（65%）: 閾値を65%に設定
    - [ ] マイルストーン3達成時（78%）: 閾値を78%に設定
    - [ ] マイルストーン4達成時（80%+）: 閾値を80%に設定
    - [ ] 各段階でCIが正常に通過することを確認
  - **期待カバレッジ向上**: 0%（管理タスク）

- タスク12.13: カバレッジレポートの定期的な確認と更新 | 週次でカバレッジ測定し、COVERAGE_ROADMAP.mdの進捗表を更新 (依存: 12.3-12.11 | 工数: 1h/週 | ステータス: TODO)
  - **受入基準**:
    - [ ] `cargo llvm-cov --lib --all-features`でカバレッジ測定
    - [ ] COVERAGE_ROADMAP.mdの進捗追跡テーブルを更新
    - [ ] 各フェーズの完了日と実際のカバレッジを記録
    - [ ] カバレッジが期待値に達していない場合、原因分析と対策を追加
  - **期待カバレッジ向上**: 0%（管理タスク）

## マイルストーン（Phase 12追加）

| マイルストーン | 完了条件 | 目標日 | 期待カバレッジ |
|--------------|---------|-------|--------------|
| M1: 基盤完成 | フェーズ1完了 | 開始+3日 | - |
| M2: 解析機能完成 | フェーズ2完了 | 開始+8日 | - |
| M3: 検索機能完成 | フェーズ3完了 | 開始+13日 | - |
| M4: MCP統合完成 | フェーズ4完了 | 開始+17日 | - |
| M5: 自動更新完成 | フェーズ5完了 | 開始+20日 | - |
| M6: 品質保証完成 | フェーズ6完了 | 開始+23日 | - |
| M7: リリース準備完了 | フェーズ7完了 | 開始+25日 | - |
| M8: ゼロコンフィグ対応完了 | フェーズ8完了 | 開始+27日 | - |
| M9: 監視機能完成 | フェーズ9完了 | 開始+30日 | - |
| M10: Rust移行完成 | フェーズ10完了 | 開始+15日（新ブランチ基準） | - |
| M11: コンパイルエラー解決 | フェーズ11完了 | 開始+19日（新ブランチ基準） | - |
| **M12-1: モック基盤完成** | タスク12.1-12.2完了 | 開始+2日（Phase12基準） | **45%** |
| **M12-2: サーバー・ストレージ層テスト完成** | タスク12.3-12.6完了 | 開始+7日（Phase12基準） | **65%** |
| **M12-3: サービス層テスト完成** | タスク12.7-12.10完了 | 開始+12日（Phase12基準） | **78%** |
| **M12-4: 全テスト完成・80%達成** | タスク12.11-12.13完了 | 開始+15日（Phase12基準） | **80%+** |

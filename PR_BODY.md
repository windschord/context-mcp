<!-- I want to review in Japanese. -->

## 概要

Context-MCPにOpenTelemetryによる監視・可観測性機能を実装しました。トレース、メトリクス、ログの3つの観測シグナルをサポートし、Jaeger/Prometheus/Grafanaとの統合が可能です。

## 実装内容

### フェーズ9: OpenTelemetry監視機能実装

全10タスクを完了:

#### タスク9.1: OpenTelemetry依存関係のインストール
- @opentelemetry/sdk-node、@opentelemetry/api等7パッケージを追加

#### タスク9.2: TelemetryManagerクラスの実装
- OpenTelemetry SDK初期化
- 環境変数・設定ファイルからの設定読み込み
- 条件付き有効化（デフォルトオフ）
- Tracer/Meterインスタンス管理

#### タスク9.3: トレースインストルメンテーションの実装
- MCPツール呼び出しトレース
- ベクターDB操作トレース
- AST解析トレース
- 埋め込み生成トレース
- デコレーター版も実装

#### タスク9.4: メトリクス収集の実装
- Counter: requests.total, requests.errors, vectordb.operations
- Histogram: requests.duration, search.results
- Gauge: index.files, index.symbols, memory.usage

#### タスク9.5: ログエクスポーターの実装
- TelemetryLoggerクラス
- error, warn, info, debug メソッド
- Console出力 + OTLP出力
- スタックトレース自動抽出

#### タスク9.6: 分散トレーシングのコンテキスト伝播実装
- W3C Trace Context準拠（traceparent、tracestate）
- ベクターDB/埋め込みAPI呼び出し時のコンテキスト伝播
- OpenTelemetry propagation API使用

#### タスク9.7: パフォーマンス最適化
- BatchSpanProcessor: 非同期トレースエクスポート
- PeriodicExportingMetricReader: 1分ごとのメトリクスエクスポート
- TraceIdRatioBasedSampler: デフォルト10%サンプリング
- 早期リターン: テレメトリ無効時のオーバーヘッドゼロ
- パラメータ切り捨て: 1KB制限

#### タスク9.8: ヘルスチェックエンドポイントの実装
- HealthCheckerクラス
- ベクターDB/埋め込みエンジン死活監視
- MCPツール（health_check）として公開
- 30秒キャッシュ、5秒タイムアウト

#### タスク9.9: テレメトリ機能のテスト
- 8ファイル、2,820行、186テストケース
- ユニットテスト、統合テスト、パフォーマンステスト
- TypeScriptコンパイルエラーゼロ

#### タスク9.10: テレメトリドキュメントの作成
- docs/OBSERVABILITY.md (635行): 包括的な監視ガイド
- Docker Composeサンプル: Jaeger + Prometheus + Grafana
- Prometheusスクレイピング設定
- Grafanaダッシュボードサンプル（7パネル）
- OTLP Collector設定

## 主な変更点

### 新規ファイル

**テレメトリコア**:
- src/telemetry/TelemetryManager.ts
- src/telemetry/types.ts
- src/telemetry/instrumentation.ts
- src/telemetry/decorators.ts
- src/telemetry/metrics.ts
- src/telemetry/logger.ts
- src/telemetry/context-propagation.ts
- src/telemetry/index.ts

**ヘルスチェック**:
- src/health/HealthChecker.ts
- src/health/types.ts
- src/health/index.ts
- src/tools/health-check-tool.ts

**テスト**:
- tests/telemetry/TelemetryManager.test.ts
- tests/telemetry/instrumentation.test.ts
- tests/telemetry/metrics.test.ts
- tests/telemetry/logger.test.ts
- tests/telemetry/context-propagation.test.ts
- tests/telemetry/integration.test.ts
- tests/telemetry/performance.test.ts
- tests/health/HealthChecker.test.ts

**ドキュメント**:
- docs/OBSERVABILITY.md
- docs/observability-stack.yml
- docs/otel-collector-config.yml
- docs/prometheus-sample.yml
- docs/grafana-dashboard-sample.json
- docs/grafana-provisioning/datasources/datasources.yml

### 更新ファイル

- package.json: OpenTelemetry依存関係追加
- src/config/types.ts: telemetryフィールド追加
- src/server/mcp-server.ts: health_checkツール統合
- src/storage/milvus-plugin.ts: トレース追加
- src/embedding/*.ts: トレース追加

## 設計ドキュメント

- docs/requirements.md: ストーリー8、REQ-035〜042、NFR-032〜038追加
- docs/design.md: コンポーネント10、シーケンス4、決定事項7追加
- docs/tasks.md: フェーズ9追加

## 動作確認

### デフォルト動作（テレメトリオフ）
- enabled: false
- オーバーヘッドゼロ
- 通常動作に影響なし

### テレメトリ有効化
環境変数で有効化:
```bash
export LSP_MCP_TELEMETRY_ENABLED=true
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_SERVICE_NAME=context-mcp
```

または設定ファイル（.context-mcp.json）:
```json
{
  "telemetry": {
    "enabled": true,
    "otlp": {
      "endpoint": "http://localhost:4317",
      "protocol": "grpc"
    },
    "serviceName": "context-mcp",
    "samplingRate": 0.1
  }
}
```

### 監視スタック起動
```bash
docker-compose -f docs/observability-stack.yml up -d
```

アクセス:
- Jaeger UI: http://localhost:16686
- Prometheus UI: http://localhost:9090
- Grafana UI: http://localhost:3000

## パフォーマンス

- テレメトリ無効時: オーバーヘッドゼロ（早期リターン）
- テレメトリ有効時: オーバーヘッド5%以内（パフォーマンステストで検証）
- サンプリング: デフォルト10%（設定可能）
- 非同期エクスポート: メイン処理をブロックしない

## 受入基準

すべての受入基準を満たしています:
- ✅ OpenTelemetry SDK統合（トレース、メトリクス、ログ）
- ✅ MCPツール/ベクターDB/AST解析/埋め込み生成のトレース
- ✅ 8種類のメトリクス収集
- ✅ 4レベルのログ出力
- ✅ W3C Trace Context準拠のコンテキスト伝播
- ✅ パフォーマンス最適化（5%以内のオーバーヘッド）
- ✅ ヘルスチェックエンドポイント
- ✅ 包括的なテストスイート（186テストケース）
- ✅ 詳細なドキュメント（OBSERVABILITY.md）

## 関連Issue

- docs/tasks.md フェーズ9: OpenTelemetry監視機能実装
- docs/requirements.md ストーリー8: 監視とメトリクス
- docs/design.md コンポーネント10: OpenTelemetry Instrumentation

## チェックリスト

- [x] TypeScriptコンパイルエラーなし
- [x] すべてのテストが実装されている
- [x] ドキュメントが完備されている
- [x] 設計書・要件定義書が更新されている
- [x] デフォルトでテレメトリがオフ
- [x] パフォーマンスへの影響が最小限
- [x] W3C Trace Context準拠
- [x] Jaeger/Prometheus/Grafana連携可能

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>

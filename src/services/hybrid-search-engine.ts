/**
 * Hybrid Search Engine
 *
 * BM25全文検索とベクトル検索を組み合わせたハイブリッド検索エンジン
 * Claude Context（Zilliz）のアプローチを参考に実装
 */

import type { BM25Engine, SearchResult } from '../storage/bm25-engine';
import type { VectorStorePlugin, QueryResult } from '../storage/types';
import { Logger } from '../utils/logger';

/**
 * ハイブリッド検索結果
 */
export interface HybridSearchResult {
  /** ドキュメントID */
  id: string;
  /** ハイブリッドスコア（0-1） */
  score: number;
  /** メタデータ */
  metadata?: Record<string, unknown>;
}

/**
 * 検索フィルタ
 */
export interface SearchFilter {
  /** ファイルタイプフィルタ（拡張子：ts, py等） */
  fileTypes?: string[];
  /** 言語フィルタ */
  languages?: string[];
  /** パスパターンフィルタ */
  pathPattern?: string;
}

/**
 * マージ済みドキュメント情報
 */
interface MergedDocument {
  /** ドキュメントID */
  id: string;
  /** BM25正規化スコア */
  bm25Score: number;
  /** ベクトル正規化スコア */
  vectorScore: number;
  /** メタデータ */
  metadata?: Record<string, unknown>;
}

/**
 * ハイブリッド検索エンジンクラス
 *
 * BM25とベクトル検索の結果を統合し、最適なランキングを提供します。
 *
 * @example
 * ```typescript
 * const hybridEngine = new HybridSearchEngine(bm25Engine, vectorStore, 0.3);
 *
 * const results = await hybridEngine.search(
 *   'code-collection',
 *   'async function error handling',
 *   queryVector,
 *   10,
 *   { fileTypes: ['ts', 'js'], languages: ['TypeScript'] }
 * );
 * ```
 */
export class HybridSearchEngine {
  private logger: Logger;
  private alpha: number; // BM25の重み（0-1）

  /**
   * ハイブリッド検索エンジンを初期化
   *
   * @param bm25Engine BM25全文検索エンジン
   * @param vectorStore ベクターストアプラグイン
   * @param alpha BM25の重み（デフォルト: 0.3、範囲: 0-1）
   * @throws alpha が 0-1 の範囲外の場合
   */
  constructor(
    private bm25Engine: BM25Engine,
    private vectorStore: VectorStorePlugin,
    alpha: number = 0.3
  ) {
    if (alpha < 0 || alpha > 1) {
      throw new Error('Alpha parameter must be between 0 and 1');
    }
    this.alpha = alpha;
    this.logger = new Logger();
  }

  /**
   * ハイブリッド検索を実行
   *
   * @param collectionName ベクターストアのコレクション名
   * @param query 検索クエリ文字列（BM25用）
   * @param queryVector クエリベクトル（ベクトル検索用）
   * @param topK 取得する上位結果数
   * @param filter フィルタ条件（オプション）
   * @returns ハイブリッドスコアでランキングされた検索結果
   */
  async search(
    collectionName: string,
    query: string,
    queryVector: number[],
    topK: number,
    filter?: SearchFilter
  ): Promise<HybridSearchResult[]> {
    this.logger.debug(`Hybrid search: query="${query}", topK=${topK}`);

    // 1. BM25検索を実行（クエリが空でない場合のみ）
    const bm25Results: SearchResult[] =
      query.trim().length > 0
        ? await this.bm25Engine.search(query, topK * 2) // 多めに取得してマージ
        : [];

    // 2. ベクトル検索を実行
    const vectorResults: QueryResult[] = await this.vectorStore.query(
      collectionName,
      queryVector,
      topK * 2 // 多めに取得してマージ
    );

    // 3. 結果をマージ
    const mergedMap = this.mergeResults(bm25Results, vectorResults);

    // 4. スコアを正規化
    const normalizedBM25 = this.normalizeScores(
      Array.from(mergedMap.values()).map((doc) => ({ id: doc.id, score: doc.bm25Score }))
    );
    const normalizedVector = this.normalizeScores(
      Array.from(mergedMap.values()).map((doc) => ({ id: doc.id, score: doc.vectorScore }))
    );

    // 正規化スコアをマップに反映
    normalizedBM25.forEach((item) => {
      const doc = mergedMap.get(item.id);
      if (doc) {
        doc.bm25Score = item.score;
      }
    });
    normalizedVector.forEach((item) => {
      const doc = mergedMap.get(item.id);
      if (doc) {
        doc.vectorScore = item.score;
      }
    });

    // 5. ハイブリッドスコアを計算
    const hybridResults: HybridSearchResult[] = Array.from(mergedMap.values()).map((doc) => ({
      id: doc.id,
      score: this.calculateHybridScore(doc.bm25Score, doc.vectorScore),
      metadata: doc.metadata,
    }));

    // 6. フィルタリング
    const filtered = filter ? this.filterResults(hybridResults, filter) : hybridResults;

    // 7. ランキングしてtopK件を返す
    return this.rankResults(filtered, topK);
  }

  /**
   * スコアをMin-Max正規化（0-1の範囲）
   *
   * @param scores スコア配列
   * @returns 正規化されたスコア配列
   */
  normalizeScores(
    scores: Array<{ id: string; score: number }>
  ): Array<{ id: string; score: number }> {
    if (scores.length === 0) {
      return [];
    }

    if (scores.length === 1) {
      return [{ id: scores[0].id, score: 1.0 }];
    }

    const scoreValues = scores.map((s) => s.score);
    const minScore = Math.min(...scoreValues);
    const maxScore = Math.max(...scoreValues);

    // すべてのスコアが同じ場合は1.0にする
    if (maxScore === minScore) {
      return scores.map((s) => ({ id: s.id, score: 1.0 }));
    }

    // Min-Max正規化
    return scores.map((s) => ({
      id: s.id,
      score: (s.score - minScore) / (maxScore - minScore),
    }));
  }

  /**
   * BM25とベクトル検索結果をマージ
   *
   * @param bm25Results BM25検索結果
   * @param vectorResults ベクトル検索結果
   * @returns ドキュメントIDをキーとしたマージ済みマップ
   */
  mergeResults(
    bm25Results: SearchResult[],
    vectorResults: QueryResult[]
  ): Map<string, MergedDocument> {
    const merged = new Map<string, MergedDocument>();

    // BM25結果を追加
    for (const result of bm25Results) {
      merged.set(result.documentId, {
        id: result.documentId,
        bm25Score: result.score,
        vectorScore: 0, // デフォルト値
        metadata: {},
      });
    }

    // ベクトル結果を追加またはマージ
    for (const result of vectorResults) {
      const existing = merged.get(result.id);
      if (existing) {
        // 既存のエントリを更新
        existing.vectorScore = result.score;
        existing.metadata = { ...existing.metadata, ...result.metadata };
      } else {
        // 新規エントリを追加
        merged.set(result.id, {
          id: result.id,
          bm25Score: 0, // デフォルト値
          vectorScore: result.score,
          metadata: result.metadata,
        });
      }
    }

    return merged;
  }

  /**
   * ハイブリッドスコアを計算
   *
   * score = α * bm25_score + (1-α) * vector_score
   *
   * @param bm25Score 正規化済みBM25スコア
   * @param vectorScore 正規化済みベクトルスコア
   * @returns ハイブリッドスコア
   */
  calculateHybridScore(bm25Score: number, vectorScore: number): number {
    return this.alpha * bm25Score + (1 - this.alpha) * vectorScore;
  }

  /**
   * 検索結果をフィルタリング
   *
   * @param results 検索結果
   * @param filter フィルタ条件
   * @returns フィルタリングされた結果
   */
  filterResults(results: HybridSearchResult[], filter: SearchFilter): HybridSearchResult[] {
    let filtered = results;

    // ファイルタイプフィルタ
    if (filter.fileTypes && filter.fileTypes.length > 0) {
      filtered = filtered.filter((result) => {
        const fileType = result.metadata?.fileType as string | undefined;
        return fileType && filter.fileTypes!.includes(fileType);
      });
    }

    // 言語フィルタ
    if (filter.languages && filter.languages.length > 0) {
      filtered = filtered.filter((result) => {
        const language = result.metadata?.language as string | undefined;
        return language && filter.languages!.includes(language);
      });
    }

    // パスパターンフィルタ
    if (filter.pathPattern) {
      filtered = filtered.filter((result) => {
        return result.id.includes(filter.pathPattern!);
      });
    }

    return filtered;
  }

  /**
   * 検索結果をスコアでランキング
   *
   * @param results 検索結果
   * @param topK 取得する上位件数（オプション）
   * @returns ランキングされた結果
   */
  rankResults(results: HybridSearchResult[], topK?: number): HybridSearchResult[] {
    // スコアの降順でソート
    const sorted = [...results].sort((a, b) => b.score - a.score);

    // topK件を返す
    return topK !== undefined ? sorted.slice(0, topK) : sorted;
  }

  /**
   * α（BM25の重み）を取得
   */
  getAlpha(): number {
    return this.alpha;
  }

  /**
   * α（BM25の重み）を設定
   *
   * @param alpha 新しいα値（0-1）
   * @throws alpha が 0-1 の範囲外の場合
   */
  setAlpha(alpha: number): void {
    if (alpha < 0 || alpha > 1) {
      throw new Error('Alpha parameter must be between 0 and 1');
    }
    this.alpha = alpha;
    this.logger.info(`Alpha parameter updated to: ${alpha}`);
  }
}

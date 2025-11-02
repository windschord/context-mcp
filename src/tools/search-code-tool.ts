/**
 * search_code MCPツール
 *
 * セマンティックコード検索を実行するMCPツール。
 * Hybrid Search Engineと連携してBM25とベクトル検索を組み合わせた
 * ハイブリッド検索を提供します。
 */

import { z } from 'zod';
import { HybridSearchEngine } from '../services/hybrid-search-engine.js';
import type { EmbeddingEngine } from '../embedding/types.js';
import * as fs from 'fs/promises';

/**
 * ツール名
 */
export const TOOL_NAME = 'search_code';

/**
 * ツール説明
 */
export const TOOL_DESCRIPTION =
  'セマンティックコード検索を実行します。BM25全文検索とベクトル検索を組み合わせたハイブリッド検索により、高精度な検索結果を提供します。';

/**
 * 入力パラメータスキーマ（Zod）
 */
export const InputSchema = z.object({
  query: z.string().describe('検索クエリ（必須）'),
  projectId: z
    .string()
    .optional()
    .describe('プロジェクトID（オプション、未指定時は全プロジェクト）'),
  fileTypes: z
    .array(z.string())
    .optional()
    .describe('ファイルタイプフィルタ（例: [".ts", ".py"]）'),
  languages: z
    .array(z.string())
    .optional()
    .describe('言語フィルタ（例: ["TypeScript", "Python"]）'),
  topK: z
    .number()
    .int()
    .positive()
    .optional()
    .default(10)
    .describe('返す結果数（デフォルト: 10）'),
});

/**
 * 入力パラメータ型
 */
export type SearchCodeInput = z.infer<typeof InputSchema>;

/**
 * 検索結果の個別アイテム型
 */
export interface SearchResultItem {
  filePath: string;
  language: string;
  snippet: string; // コードスニペット（前後3行含む）
  score: number; // ハイブリッドスコア
  lineStart: number;
  lineEnd: number;
  symbolName?: string;
  symbolType?: string;
  metadata?: Record<string, any>;
}

/**
 * 出力レスポンス型
 */
export interface SearchCodeOutput {
  results: SearchResultItem[];
  totalResults: number;
  searchTime: number; // ミリ秒
}

/**
 * search_codeツールハンドラー
 */
export async function handleSearchCode(
  input: SearchCodeInput,
  hybridSearchEngine: HybridSearchEngine,
  embeddingEngine: EmbeddingEngine,
  collectionName: string = 'code_vectors'
): Promise<SearchCodeOutput> {
  const startTime = Date.now();

  // パラメータバリデーション
  const validatedInput = InputSchema.parse(input);

  const { query, projectId, fileTypes, languages, topK } = validatedInput;

  // 空クエリの場合は空結果を返す
  if (!query.trim()) {
    return {
      results: [],
      totalResults: 0,
      searchTime: Date.now() - startTime,
    };
  }

  try {
    // クエリを埋め込みベクトルに変換
    const queryVector = await embeddingEngine.embed(query);

    // ハイブリッド検索を実行
    const searchFilter = {
      fileTypes: fileTypes?.map((ft) => ft.replace(/^\./, '')), // 先頭の"."を除去
      languages,
      pathPattern: projectId,
    };

    const hybridResults = await hybridSearchEngine.search(
      collectionName,
      query,
      queryVector,
      topK,
      searchFilter
    );

    // 検索結果をフォーマット
    const formattedResults = await Promise.all(
      hybridResults.map(async (result) => {
        const metadata = result.metadata || {};

        // スニペットを取得（前後3行を含む）
        const snippet = await getCodeSnippet(
          result.id,
          metadata['lineStart'] as number | undefined,
          metadata['lineEnd'] as number | undefined
        );

        return {
          filePath: result.id.split(':')[0] || result.id,
          language: (metadata['language'] as string) || 'unknown',
          snippet,
          score: result.score,
          lineStart: (metadata['lineStart'] as number) || 0,
          lineEnd: (metadata['lineEnd'] as number) || 0,
          symbolName: metadata['name'] as string | undefined,
          symbolType: metadata['type'] as string | undefined,
          metadata: metadata,
        };
      })
    );

    const searchTime = Date.now() - startTime;

    return {
      results: formattedResults,
      totalResults: formattedResults.length,
      searchTime,
    };
  } catch (error: any) {
    // エラー時は空結果を返す
    return {
      results: [],
      totalResults: 0,
      searchTime: Date.now() - startTime,
    };
  }
}

/**
 * コードスニペットを取得（前後3行を含む）
 *
 * @param documentId ドキュメントID（filePath:lineStart形式）
 * @param lineStart 開始行番号
 * @param lineEnd 終了行番号
 * @returns コードスニペット
 */
async function getCodeSnippet(
  documentId: string,
  lineStart?: number,
  lineEnd?: number
): Promise<string> {
  try {
    const filePath = documentId.split(':')[0];

    // ファイルパスが取得できない場合は空文字列を返す
    if (!filePath) {
      return '';
    }

    // ファイルが存在しない場合は空文字列を返す
    try {
      await fs.access(filePath);
    } catch {
      return '';
    }

    // ファイルを読み込み
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // 行番号が指定されていない場合はファイル全体を返す（最大20行）
    if (lineStart === undefined || lineEnd === undefined) {
      return lines.slice(0, 20).join('\n');
    }

    // 前後3行を含めたスニペットを取得
    const contextLines = 3;
    const start = Math.max(0, lineStart - contextLines - 1);
    const end = Math.min(lines.length, lineEnd + contextLines);

    return lines.slice(start, end).join('\n');
  } catch (error) {
    return '';
  }
}

/**
 * JSON Schemaに変換（MCPツール登録用）
 */
export function getInputSchemaJSON(): Record<string, any> {
  return {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '検索クエリ（必須）',
      },
      projectId: {
        type: 'string',
        description: 'プロジェクトID（オプション、未指定時は全プロジェクト）',
      },
      fileTypes: {
        type: 'array',
        items: { type: 'string' },
        description: 'ファイルタイプフィルタ（例: [".ts", ".py"]）',
      },
      languages: {
        type: 'array',
        items: { type: 'string' },
        description: '言語フィルタ（例: ["TypeScript", "Python"]）',
      },
      topK: {
        type: 'number',
        description: '返す結果数（デフォルト: 10）',
        default: 10,
      },
    },
    required: ['query'],
  };
}

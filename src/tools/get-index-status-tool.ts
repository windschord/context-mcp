/**
 * get_index_status MCPツール
 *
 * インデックスの統計情報を取得するMCPツール。
 * プロジェクト単位または全プロジェクトの統計を返します。
 */

import { z } from 'zod';
import { IndexingService } from '../services/indexing-service.js';

/**
 * ツール名
 */
export const TOOL_NAME = 'get_index_status';

/**
 * ツール説明
 */
export const TOOL_DESCRIPTION =
  'インデックスの統計情報を取得します。プロジェクトIDを指定すると特定プロジェクトの統計を、省略すると全プロジェクトの統計を返します。';

/**
 * 入力パラメータスキーマ（Zod）
 */
export const InputSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('プロジェクトID（オプション、未指定時は全プロジェクト）'),
});

/**
 * 入力パラメータ型
 */
export type GetIndexStatusInput = z.infer<typeof InputSchema>;

/**
 * プロジェクト統計情報
 */
export interface ProjectStats {
  projectId: string;
  rootPath: string;
  stats: {
    totalFiles: number;
    indexedFiles: number;
    totalSymbols: number;
    totalVectors: number;
    totalDocuments: number;
    lastIndexedAt?: string; // ISO 8601形式
    indexSize: number; // バイト単位
  };
  status: 'indexed' | 'indexing' | 'error';
  errors?: Array<{ file: string; error: string }>;
}

/**
 * 出力レスポンス型
 */
export interface GetIndexStatusOutput {
  projects: ProjectStats[];
}

/**
 * get_index_statusツールハンドラー
 */
export async function handleGetIndexStatus(
  input: GetIndexStatusInput,
  indexingService: IndexingService
): Promise<GetIndexStatusOutput> {
  // パラメータバリデーション
  const validatedInput = InputSchema.parse(input);

  const { projectId } = validatedInput;

  try {
    // プロジェクトIDが指定されている場合は特定プロジェクトの統計を取得
    if (projectId) {
      const stats = await indexingService.getIndexStats(projectId);

      const projectStats: ProjectStats = {
        projectId: stats.projectId,
        rootPath: stats.rootPath,
        stats: {
          totalFiles: stats.totalFiles,
          indexedFiles: stats.totalFiles,
          totalSymbols: stats.totalSymbols,
          totalVectors: stats.totalVectors,
          totalDocuments: 0, // TODO: ドキュメント数のトラッキング実装
          lastIndexedAt: stats.lastIndexed ? stats.lastIndexed.toISOString() : undefined,
          indexSize: calculateIndexSize(stats),
        },
        status: stats.status,
      };

      return {
        projects: [projectStats],
      };
    }

    // 全プロジェクトの統計を取得
    const allStats = await indexingService.getAllIndexStats();

    const projects: ProjectStats[] = allStats.map((stats) => ({
      projectId: stats.projectId,
      rootPath: stats.rootPath,
      stats: {
        totalFiles: stats.totalFiles,
        indexedFiles: stats.totalFiles,
        totalSymbols: stats.totalSymbols,
        totalVectors: stats.totalVectors,
        totalDocuments: 0, // TODO: ドキュメント数のトラッキング実装
        lastIndexedAt: stats.lastIndexed ? stats.lastIndexed.toISOString() : undefined,
        indexSize: calculateIndexSize(stats),
      },
      status: stats.status,
    }));

    return {
      projects,
    };
  } catch (error: any) {
    // エラーハンドリング
    throw new Error(`インデックス統計の取得エラー: ${error.message}`);
  }
}

/**
 * インデックスサイズを計算（概算）
 */
function calculateIndexSize(stats: any): number {
  // 簡易的な計算：ベクトル数 * ベクトル次元 * 4バイト（float32）
  // 実際にはメタデータも含まれるため、より大きくなる
  const vectorDimension = 384; // all-MiniLM-L6-v2のデフォルト次元
  const bytesPerFloat = 4;
  const vectorSize = stats.totalVectors * vectorDimension * bytesPerFloat;

  // メタデータとBM25インデックスの概算サイズを追加
  const metadataSize = stats.totalVectors * 200; // 1ベクトルあたり約200バイトのメタデータ
  const bm25Size = stats.totalSymbols * 100; // 1シンボルあたり約100バイトのBM25データ

  return vectorSize + metadataSize + bm25Size;
}

/**
 * JSON Schemaに変換（MCPツール登録用）
 */
export function getInputSchemaJSON(): Record<string, any> {
  return {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'プロジェクトID（オプション、未指定時は全プロジェクト）',
      },
    },
    required: [],
  };
}

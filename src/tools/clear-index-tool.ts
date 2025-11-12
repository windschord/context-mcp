/**
 * clear_index MCPツール
 *
 * インデックスをクリアするMCPツール。
 * プロジェクト単位または全プロジェクトのインデックスをクリアします。
 */

import { z } from 'zod';
import { IndexingService } from '../services/indexing-service';

/**
 * ツール名
 */
export const TOOL_NAME = 'clear_index';

/**
 * ツール説明
 */
export const TOOL_DESCRIPTION =
  'インデックスをクリアします。プロジェクトIDを指定すると特定プロジェクトのインデックスを、省略すると全プロジェクトのインデックスをクリアします。';

/**
 * 入力パラメータスキーマ（Zod）
 */
export const InputSchema = z.object({
  projectId: z
    .string()
    .optional()
    .describe('プロジェクトID（オプション、未指定時は全プロジェクト）'),
  confirm: z.boolean().optional().default(false).describe('確認フラグ（デフォルト: false）'),
});

/**
 * 入力パラメータ型
 */
export type ClearIndexInput = z.infer<typeof InputSchema>;

/**
 * 出力レスポンス型
 */
export interface ClearIndexOutput {
  success: boolean;
  clearedProjects: string[];
  message: string;
}

/**
 * clear_indexツールハンドラー
 */
export async function handleClearIndex(
  input: ClearIndexInput,
  indexingService: IndexingService
): Promise<ClearIndexOutput> {
  // パラメータバリデーション
  const validatedInput = InputSchema.parse(input);

  const { projectId, confirm } = validatedInput;

  // 確認フラグのチェック
  if (!confirm) {
    return {
      success: false,
      clearedProjects: [],
      message:
        'インデックスをクリアするには、confirmパラメータをtrueに設定してください。この操作は取り消せません。',
    };
  }

  try {
    // プロジェクトIDが指定されている場合は特定プロジェクトのインデックスをクリア
    if (projectId) {
      const result = await indexingService.clearIndex(projectId);

      if (!result.success) {
        return {
          success: false,
          clearedProjects: [],
          message: result.error || 'インデックスのクリアに失敗しました',
        };
      }

      return {
        success: true,
        clearedProjects: [projectId],
        message: `プロジェクト「${projectId}」のインデックスをクリアしました。`,
      };
    }

    // 全プロジェクトのインデックスをクリア
    const allStats = await indexingService.getAllIndexStats();
    const projectIds = allStats.map((stats) => stats.projectId);

    const result = await indexingService.clearAllIndexes();

    if (!result.success) {
      return {
        success: false,
        clearedProjects: [],
        message: result.error || 'インデックスのクリアに失敗しました',
      };
    }

    return {
      success: true,
      clearedProjects: projectIds,
      message: `すべてのプロジェクト（${projectIds.length}件）のインデックスをクリアしました。`,
    };
  } catch (error: any) {
    // エラーハンドリング
    return {
      success: false,
      clearedProjects: [],
      message: `インデックスのクリアエラー: ${error.message}`,
    };
  }
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
      confirm: {
        type: 'boolean',
        description: '確認フラグ（デフォルト: false）',
        default: false,
      },
    },
    required: [],
  };
}

/**
 * index_project MCPツール
 *
 * プロジェクト全体をインデックス化するMCPツール。
 * Indexing Serviceと連携してファイルをスキャン、解析し、
 * ベクターストアとBM25エンジンにインデックスを作成します。
 */

import { z } from 'zod';
import { IndexingService } from '../services/indexing-service.js';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * ツール名
 */
export const TOOL_NAME = 'index_project';

/**
 * ツール説明
 */
export const TOOL_DESCRIPTION =
  'プロジェクト全体をインデックス化します。指定されたルートパスからファイルをスキャンし、AST解析、埋め込み生成、ベクトルストアへの保存を実行します。';

/**
 * 入力パラメータスキーマ（Zod）
 */
export const InputSchema = z.object({
  rootPath: z.string().describe('プロジェクトのルートディレクトリパス'),
  languages: z
    .array(z.string())
    .optional()
    .describe('対象言語のリスト（オプション、例: ["typescript", "python"]）'),
  excludePatterns: z
    .array(z.string())
    .optional()
    .describe('除外パターンのリスト（オプション、例: ["node_modules/**", "dist/**"]）'),
  includeDocuments: z
    .boolean()
    .optional()
    .default(true)
    .describe('Markdownファイルを含めるか（デフォルト: true）'),
});

/**
 * 入力パラメータ型
 */
export type IndexProjectInput = z.infer<typeof InputSchema>;

/**
 * 出力レスポンス型
 */
export interface IndexProjectOutput {
  success: boolean;
  projectId: string;
  stats: {
    totalFiles: number;
    processedFiles: number;
    failedFiles: number;
    totalSymbols: number;
    totalVectors: number;
    processingTime: number; // ミリ秒
  };
  errors?: Array<{ file: string; error: string }>;
}

/**
 * index_projectツールハンドラー
 */
export async function handleIndexProject(
  input: IndexProjectInput,
  indexingService: IndexingService,
  progressCallback?: (progress: number, message: string) => void
): Promise<IndexProjectOutput> {
  // パラメータバリデーション
  const validatedInput = InputSchema.parse(input);

  const { rootPath, languages, excludePatterns, includeDocuments } = validatedInput;

  // ルートパスの存在確認
  try {
    const stats = await fs.stat(rootPath);
    if (!stats.isDirectory()) {
      throw new Error(`指定されたパスはディレクトリではありません: ${rootPath}`);
    }
  } catch (error: any) {
    throw new Error(`指定されたディレクトリが見つかりません: ${rootPath} (${error.message})`);
  }

  // プロジェクトIDを生成（ルートパスの絶対パスのハッシュまたはパス自体を使用）
  const projectId = path.resolve(rootPath);

  // 進捗コールバックを登録
  if (progressCallback) {
    indexingService.on('fileStarted', ({ filePath }) => {
      progressCallback(0, `ファイル処理開始: ${filePath}`);
    });

    indexingService.on('fileCompleted', ({ filePath, symbolsCount, vectorsCount }) => {
      progressCallback(
        0,
        `ファイル処理完了: ${filePath} (シンボル: ${symbolsCount}, ベクトル: ${vectorsCount})`
      );
    });

    indexingService.on('fileError', ({ filePath, error }) => {
      progressCallback(0, `ファイルエラー: ${filePath} - ${error}`);
    });

    indexingService.on('progressUpdate', ({ current, total, message }) => {
      const progress = Math.floor((current / total) * 100);
      progressCallback(progress, message || `処理中... ${current}/${total}`);
    });
  }

  // インデックス化を実行
  try {
    const result = await indexingService.indexProject(projectId, rootPath, {
      languages,
      excludePatterns,
      includeDocuments,
    });

    // 進捗コールバックをクリーンアップ
    if (progressCallback) {
      indexingService.removeAllListeners('fileStarted');
      indexingService.removeAllListeners('fileCompleted');
      indexingService.removeAllListeners('fileError');
      indexingService.removeAllListeners('progressUpdate');
    }

    // レスポンスを整形
    return {
      success: result.success,
      projectId: result.projectId,
      stats: {
        totalFiles: result.totalFiles,
        processedFiles: result.indexedFiles,
        failedFiles: result.failedFiles,
        totalSymbols: result.totalSymbols,
        totalVectors: result.totalVectors,
        processingTime: result.processingTime,
      },
      errors:
        result.errors.length > 0
          ? result.errors.map((e) => ({ file: e.filePath, error: e.error }))
          : undefined,
    };
  } catch (error: any) {
    // エラーハンドリング
    throw new Error(`インデックス化エラー: ${error.message}`);
  }
}

/**
 * JSON Schemaに変換（MCPツール登録用）
 */
export function getInputSchemaJSON(): Record<string, any> {
  return {
    type: 'object',
    properties: {
      rootPath: {
        type: 'string',
        description: 'プロジェクトのルートディレクトリパス',
      },
      languages: {
        type: 'array',
        items: { type: 'string' },
        description: '対象言語のリスト（オプション、例: ["typescript", "python"]）',
      },
      excludePatterns: {
        type: 'array',
        items: { type: 'string' },
        description: '除外パターンのリスト（オプション、例: ["node_modules/**", "dist/**"]）',
      },
      includeDocuments: {
        type: 'boolean',
        description: 'Markdownファイルを含めるか（デフォルト: true）',
        default: true,
      },
    },
    required: ['rootPath'],
  };
}

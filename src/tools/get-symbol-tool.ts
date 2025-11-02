/**
 * get_symbol MCPツール
 *
 * シンボル定義と参照を検索するMCPツール。
 * ベクターDBのメタデータフィルタを使用してシンボルを検索し、
 * 定義と参照の両方を返します。
 */

import { z } from 'zod';
import type { VectorStorePlugin } from '../storage/types.js';
import * as fs from 'fs/promises';

/**
 * ツール名
 */
export const TOOL_NAME = 'get_symbol';

/**
 * ツール説明
 */
export const TOOL_DESCRIPTION =
  'シンボル（関数、クラス、変数など）の定義と参照を検索します。同名シンボルが複数ある場合はスコープで区別します。';

/**
 * 入力パラメータスキーマ（Zod）
 */
export const InputSchema = z.object({
  symbolName: z.string().min(1).describe('シンボル名（必須）'),
  symbolType: z
    .string()
    .optional()
    .describe('シンボルタイプ（例: "function", "class", "variable"）'),
  projectId: z.string().optional().describe('プロジェクトID（オプション）'),
  scope: z
    .string()
    .optional()
    .describe('スコープ（例: "global", "class", "function"）'),
});

/**
 * 入力パラメータ型
 */
export type GetSymbolInput = z.infer<typeof InputSchema>;

/**
 * シンボル定義の型
 */
export interface SymbolDefinition {
  filePath: string;
  language: string;
  symbolType: string;
  scope: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  docstring?: string;
  parameters?: Array<{ name: string; type?: string }>;
  returnType?: string;
}

/**
 * シンボル参照の型
 */
export interface SymbolReference {
  filePath: string;
  line: number;
  column: number;
  context: string; // 前後1行を含むコンテキスト
}

/**
 * 出力レスポンス型
 */
export interface GetSymbolOutput {
  definitions: SymbolDefinition[];
  references: SymbolReference[];
}

/**
 * get_symbolツールハンドラー
 */
export async function handleGetSymbol(
  input: GetSymbolInput,
  vectorStore: VectorStorePlugin,
  collectionName: string = 'code_vectors'
): Promise<GetSymbolOutput> {
  // パラメータバリデーション
  const validatedInput = InputSchema.parse(input);

  const { symbolName, symbolType, projectId, scope } = validatedInput;

  try {
    // ベクターストアからシンボル定義を検索
    const definitions = await searchSymbolDefinitions(
      vectorStore,
      collectionName,
      symbolName,
      symbolType,
      projectId,
      scope
    );

    // シンボル参照を検索
    const references = await searchSymbolReferences(
      vectorStore,
      collectionName,
      symbolName,
      projectId
    );

    return {
      definitions,
      references,
    };
  } catch (error: any) {
    // エラー時は空結果を返す
    return {
      definitions: [],
      references: [],
    };
  }
}

/**
 * シンボル定義を検索
 */
async function searchSymbolDefinitions(
  vectorStore: VectorStorePlugin,
  collectionName: string,
  symbolName: string,
  symbolType?: string,
  projectId?: string,
  scope?: string
): Promise<SymbolDefinition[]> {
  try {
    // メタデータフィルタを構築
    const filter: Record<string, any> = {
      name: symbolName,
    };

    if (symbolType) {
      filter.type = symbolType;
    }

    if (projectId) {
      filter.project_id = projectId;
    }

    if (scope) {
      filter.scope = scope;
    }

    // ベクターストアから検索（ダミーベクトルで検索、メタデータフィルタのみ使用）
    // 注: 実際の実装では、ベクターストアがメタデータのみでのクエリをサポートする必要がある
    // ここでは、空ベクトルを使用してメタデータフィルタのみで検索
    const dummyVector = new Array(384).fill(0); // all-MiniLM-L6-v2の次元数

    const results = await vectorStore.query(
      collectionName,
      dummyVector,
      100, // 最大100件取得
      filter
    );

    // 結果をSymbolDefinition型に変換
    const definitions: SymbolDefinition[] = [];

    for (const result of results) {
      const metadata = result.metadata || {};
      const filePath = metadata['file_path'] as string;
      const lineStart = metadata['line_start'] as number;
      const lineEnd = metadata['line_end'] as number;

      if (!filePath || lineStart === undefined || lineEnd === undefined) {
        continue;
      }

      // スニペットを取得
      const snippet = await getCodeSnippet(filePath, lineStart, lineEnd, 0);

      definitions.push({
        filePath,
        language: (metadata['language'] as string) || 'unknown',
        symbolType: (metadata['type'] as string) || 'unknown',
        scope: (metadata['scope'] as string) || 'unknown',
        lineStart,
        lineEnd,
        snippet,
        docstring: metadata['docstring'] as string | undefined,
        parameters: metadata['parameters'] as
          | Array<{ name: string; type?: string }>
          | undefined,
        returnType: metadata['return_type'] as string | undefined,
      });
    }

    return definitions;
  } catch (error) {
    return [];
  }
}

/**
 * シンボル参照を検索
 *
 * 注: この実装では、ベクターストアから取得したすべての結果を検索し、
 * シンボル名が含まれているファイルをスキャンして参照を見つけます。
 * より効率的な実装では、専用の参照インデックスを構築することが推奨されます。
 */
async function searchSymbolReferences(
  vectorStore: VectorStorePlugin,
  collectionName: string,
  symbolName: string,
  projectId?: string
): Promise<SymbolReference[]> {
  try {
    // プロジェクト内のすべてのファイルを取得
    const filter: Record<string, any> = {};

    if (projectId) {
      filter.project_id = projectId;
    }

    // ダミーベクトルで検索
    const dummyVector = new Array(384).fill(0);

    const results = await vectorStore.query(
      collectionName,
      dummyVector,
      1000, // 最大1000件取得
      filter
    );

    // ファイルパスを一意に取得
    const filePaths = new Set<string>();
    for (const result of results) {
      const metadata = result.metadata || {};
      const filePath = metadata['file_path'] as string;
      if (filePath) {
        filePaths.add(filePath);
      }
    }

    // 各ファイルをスキャンしてシンボル参照を検索
    const references: SymbolReference[] = [];

    for (const filePath of filePaths) {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
          const line = lines[lineIndex];
          const lineNumber = lineIndex + 1;

          // 行内でシンボル名を検索
          let columnIndex = 0;
          while (true) {
            const index = line.indexOf(symbolName, columnIndex);
            if (index === -1) break;

            // コンテキストを取得（前後1行）
            const contextStart = Math.max(0, lineIndex - 1);
            const contextEnd = Math.min(lines.length, lineIndex + 2);
            const context = lines.slice(contextStart, contextEnd).join('\n');

            references.push({
              filePath,
              line: lineNumber,
              column: index,
              context,
            });

            columnIndex = index + 1;
          }
        }
      } catch (error) {
        // ファイル読み込みエラーは無視
        continue;
      }
    }

    return references;
  } catch (error) {
    return [];
  }
}

/**
 * コードスニペットを取得
 *
 * @param filePath ファイルパス
 * @param lineStart 開始行番号
 * @param lineEnd 終了行番号
 * @param contextLines 前後のコンテキスト行数（デフォルト: 0）
 * @returns コードスニペット
 */
async function getCodeSnippet(
  filePath: string,
  lineStart: number,
  lineEnd: number,
  contextLines: number = 0
): Promise<string> {
  try {
    // ファイルが存在するか確認
    try {
      await fs.access(filePath);
    } catch {
      return '';
    }

    // ファイルを読み込み
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // スニペットを取得
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
      symbolName: {
        type: 'string',
        description: 'シンボル名（必須）',
      },
      symbolType: {
        type: 'string',
        description: 'シンボルタイプ（例: "function", "class", "variable"）',
      },
      projectId: {
        type: 'string',
        description: 'プロジェクトID（オプション）',
      },
      scope: {
        type: 'string',
        description: 'スコープ（例: "global", "class", "function"）',
      },
    },
    required: ['symbolName'],
  };
}

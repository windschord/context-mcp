/**
 * find_related_docs MCPツール
 *
 * コードに関連するドキュメントを検索するMCPツール。
 * DocCodeLinkerとベクターストアを使用して、
 * ファイルパス参照、シンボル参照、コード類似度に基づいて
 * 関連ドキュメントを検索します。
 */

import { z } from 'zod';
import { DocCodeLinker, type CodeFileInfo } from '../parser/doc-code-linker';
import type { VectorStorePlugin } from '../storage/types';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * ツール名
 */
export const TOOL_NAME = 'find_related_docs';

/**
 * ツール説明
 */
export const TOOL_DESCRIPTION =
  'コードファイルまたはシンボルに関連するドキュメントを検索します。ファイルパス参照、シンボル参照、コード類似度に基づいて関連度スコアを計算します。';

/**
 * 入力パラメータスキーマ（Zod）
 */
export const InputSchema = z
  .object({
    filePath: z
      .string()
      .optional()
      .describe('コードファイルのパス（filePathまたはsymbolNameが必須）'),
    symbolName: z.string().optional().describe('シンボル名（filePathまたはsymbolNameが必須）'),
    projectId: z
      .string()
      .optional()
      .describe('プロジェクトID（オプション、未指定時は全プロジェクト）'),
    topK: z.number().int().positive().optional().default(5).describe('返す結果数（デフォルト: 5）'),
  })
  .refine((data) => data.filePath || data.symbolName, {
    message: 'filePathまたはsymbolNameのいずれかが必須です',
  });

/**
 * 入力パラメータ型
 */
export type FindRelatedDocsInput = z.infer<typeof InputSchema>;

/**
 * マッチした参照の型
 */
export interface MatchedReference {
  type: 'file_path' | 'symbol' | 'code_similarity';
  reference: string;
  score: number;
}

/**
 * 関連ドキュメントの型
 */
export interface RelatedDocument {
  filePath: string;
  title: string; // ドキュメントタイトル（最初の見出し）
  relatedScore: number; // 関連度スコア（0-1）
  matchedReferences: MatchedReference[];
  snippet: string; // 関連する部分のスニペット
}

/**
 * 出力レスポンス型
 */
export interface FindRelatedDocsOutput {
  documents: RelatedDocument[];
  totalResults: number;
}

/**
 * find_related_docsツールハンドラー
 */
export async function handleFindRelatedDocs(
  input: FindRelatedDocsInput,
  docCodeLinker: DocCodeLinker,
  vectorStore: VectorStorePlugin,
  collectionName: string = 'code_vectors',
  projectRoot?: string
): Promise<FindRelatedDocsOutput> {
  // パラメータバリデーション
  const validatedInput = InputSchema.parse(input);

  const { filePath, symbolName, projectId, topK } = validatedInput;

  try {
    // プロジェクトルートの決定
    const effectiveProjectRoot = projectRoot || projectId || process.cwd();

    // 関連するコードファイルを取得
    const codeFiles = await getCodeFiles(
      vectorStore,
      collectionName,
      filePath,
      symbolName,
      projectId
    );

    if (codeFiles.length === 0) {
      return {
        documents: [],
        totalResults: 0,
      };
    }

    // プロジェクト内のMarkdownファイルを取得
    const markdownFiles = await findMarkdownFiles(effectiveProjectRoot);

    // 各Markdownファイルに対して関連度スコアを計算
    const documentScores: RelatedDocument[] = [];

    for (const mdFile of markdownFiles) {
      try {
        const content = await fs.readFile(mdFile, 'utf-8');

        // DocCodeLinkerを使用して関連度スコアを計算
        const scoreResult = await docCodeLinker.calculateRelatedScore(
          content,
          mdFile,
          effectiveProjectRoot,
          codeFiles
        );

        // スコアが0より大きいファイルのみを含める
        const totalScore = scoreResult.reduce((sum, r) => sum + r.score, 0);
        if (totalScore > 0) {
          // マッチした参照を集約
          const matchedReferences = await aggregateMatchedReferences(
            content,
            mdFile,
            effectiveProjectRoot,
            codeFiles,
            docCodeLinker
          );

          // ドキュメントタイトルを取得（最初の見出し）
          const title = extractTitle(content, mdFile);

          // スニペットを取得（最初の100文字）
          const snippet = extractSnippet(content);

          // 正規化されたスコア（0-1の範囲）
          const normalizedScore = Math.min(1.0, totalScore / codeFiles.length);

          documentScores.push({
            filePath: mdFile,
            title,
            relatedScore: normalizedScore,
            matchedReferences,
            snippet,
          });
        }
      } catch (error) {
        // ファイル読み込みエラーは無視
        continue;
      }
    }

    // スコアでソート（降順）
    documentScores.sort((a, b) => b.relatedScore - a.relatedScore);

    // topK件のみを返す
    const results = documentScores.slice(0, topK);

    return {
      documents: results,
      totalResults: results.length,
    };
  } catch (error: any) {
    // エラー時は空結果を返す
    return {
      documents: [],
      totalResults: 0,
    };
  }
}

/**
 * コードファイルを取得
 */
async function getCodeFiles(
  vectorStore: VectorStorePlugin,
  collectionName: string,
  filePath?: string,
  symbolName?: string,
  projectId?: string
): Promise<CodeFileInfo[]> {
  const codeFiles: CodeFileInfo[] = [];

  try {
    // ベクターストアからコードファイル情報を取得
    const filter: Record<string, any> = {};

    if (projectId) {
      filter.project_id = projectId;
    }

    if (symbolName) {
      filter.name = symbolName;
    }

    // ダミーベクトルで検索（メタデータフィルタのみ使用）
    const dummyVector = new Array(384).fill(0);

    const results = await vectorStore.query(collectionName, dummyVector, 100, filter);

    // ファイルパスを一意に取得
    const filePathsSet = new Set<string>();

    if (filePath) {
      // filePathが指定されている場合はそれを使用
      filePathsSet.add(filePath);
    } else {
      // シンボルから関連ファイルを取得
      for (const result of results) {
        const metadata = result.metadata || {};
        const fp = metadata['file_path'] as string;
        if (fp) {
          filePathsSet.add(fp);
        }
      }
    }

    // 各ファイルの内容を読み込み
    for (const fp of filePathsSet) {
      try {
        const content = await fs.readFile(fp, 'utf-8');
        const language = detectLanguage(fp);

        codeFiles.push({
          path: fp,
          code: content,
          language,
        });
      } catch (error) {
        // ファイル読み込みエラーは無視
        continue;
      }
    }

    return codeFiles;
  } catch (error) {
    return [];
  }
}

/**
 * Markdownファイルを検索
 */
async function findMarkdownFiles(rootPath: string): Promise<string[]> {
  const markdownFiles: string[] = [];

  try {
    await scanDirectory(rootPath, markdownFiles);
    return markdownFiles;
  } catch (error) {
    return [];
  }
}

/**
 * ディレクトリを再帰的にスキャン
 */
async function scanDirectory(dir: string, markdownFiles: string[]): Promise<void> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      // 除外するディレクトリ
      if (
        entry.isDirectory() &&
        ['node_modules', '.git', 'dist', 'build', '.next'].includes(entry.name)
      ) {
        continue;
      }

      if (entry.isDirectory()) {
        await scanDirectory(fullPath, markdownFiles);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        markdownFiles.push(fullPath);
      }
    }
  } catch (error) {
    // ディレクトリ読み込みエラーは無視
  }
}

/**
 * マッチした参照を集約
 */
async function aggregateMatchedReferences(
  markdownContent: string,
  docPath: string,
  projectRoot: string,
  codeFiles: CodeFileInfo[],
  docCodeLinker: DocCodeLinker
): Promise<MatchedReference[]> {
  const references: MatchedReference[] = [];

  try {
    // ファイルパス参照を検出
    const filePathRefs = await docCodeLinker.findFilePathReferences(
      markdownContent,
      docPath,
      projectRoot
    );

    for (const ref of filePathRefs) {
      for (const file of codeFiles) {
        const normalizedFilePath = path.normalize(file.path);
        const normalizedRefPath = path.normalize(ref.path);

        if (
          normalizedFilePath.endsWith(normalizedRefPath) ||
          normalizedFilePath === ref.resolvedPath
        ) {
          references.push({
            type: 'file_path',
            reference: ref.path,
            score: 1.0,
          });
        }
      }
    }

    // シンボル参照を検出
    const symbolRefs = await docCodeLinker.findSymbolReferences(markdownContent, codeFiles);

    for (const ref of symbolRefs) {
      references.push({
        type: 'symbol',
        reference: ref.symbolName,
        score: 0.7,
      });
    }

    // コード類似を検出
    const similarCodeMatches = await docCodeLinker.findSimilarCode(markdownContent, codeFiles);

    for (const match of similarCodeMatches.slice(0, 3)) {
      // 上位3件のみ
      references.push({
        type: 'code_similarity',
        reference: `${match.filePath}:${match.matchedCodeLine}`,
        score: match.similarity,
      });
    }

    return references;
  } catch (error) {
    return [];
  }
}

/**
 * ドキュメントタイトルを抽出（最初の見出し）
 */
function extractTitle(content: string, filePath: string): string {
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#')) {
      // 見出しマーカーを除去
      return trimmed.replace(/^#+\s*/, '');
    }
  }

  // 見出しがない場合はファイル名を返す
  return path.basename(filePath, '.md');
}

/**
 * スニペットを抽出（最初の100文字）
 */
function extractSnippet(content: string, maxLength: number = 100): string {
  // 見出しやコードブロックを除外したテキストを取得
  const lines = content.split('\n');
  let textContent = '';

  for (const line of lines) {
    const trimmed = line.trim();
    // 見出し、コードブロック、空行をスキップ
    if (!trimmed.startsWith('#') && !trimmed.startsWith('```') && trimmed.length > 0) {
      textContent += trimmed + ' ';
      if (textContent.length >= maxLength) {
        break;
      }
    }
  }

  // maxLength文字に切り詰め
  if (textContent.length > maxLength) {
    return textContent.substring(0, maxLength) + '...';
  }

  return textContent.trim();
}

/**
 * ファイルパスから言語を検出
 */
function detectLanguage(filePath: string): any {
  const ext = path.extname(filePath).toLowerCase();

  const languageMap: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TSX',
    '.js': 'JavaScript',
    '.jsx': 'JSX',
    '.py': 'Python',
    '.go': 'Go',
    '.rs': 'Rust',
    '.java': 'Java',
    '.c': 'C',
    '.cpp': 'C++',
    '.cc': 'C++',
    '.cxx': 'C++',
    '.h': 'C',
    '.hpp': 'C++',
    '.ino': 'Arduino',
  };

  return (languageMap[ext] || 'unknown') as any;
}

/**
 * JSON Schemaに変換（MCPツール登録用）
 */
export function getInputSchemaJSON(): Record<string, any> {
  return {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'コードファイルのパス（filePathまたはsymbolNameが必須）',
      },
      symbolName: {
        type: 'string',
        description: 'シンボル名（filePathまたはsymbolNameが必須）',
      },
      projectId: {
        type: 'string',
        description: 'プロジェクトID（オプション、未指定時は全プロジェクト）',
      },
      topK: {
        type: 'number',
        description: '返す結果数（デフォルト: 5）',
        default: 5,
      },
    },
  };
}

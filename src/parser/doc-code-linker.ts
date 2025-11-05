/**
 * Doc-Code Linker: ドキュメントとコードの関連付けを行う
 */

import * as path from 'path';
import { SymbolExtractor } from './symbol-extractor.js';
import { MarkdownParser, FilePathReference } from './markdown-parser.js';
import { Language, SymbolInfo } from './types.js';

/**
 * ファイルパス参照の解決結果
 */
export interface ResolvedFilePathReference extends FilePathReference {
  resolvedPath: string;
}

/**
 * シンボル参照の検出結果
 */
export interface SymbolReference {
  symbolName: string;
  filePath: string;
  line: number;
}

/**
 * コードブロックの類似度マッチ結果
 */
export interface SimilarCodeMatch {
  filePath: string;
  similarity: number;
  codeBlockLine: number;
  matchedCodeLine: number;
}

/**
 * 関連度スコアの計算結果
 */
export interface RelatedScoreResult {
  filePath: string;
  score: number;
  reasons: string[];
}

/**
 * コードファイルの情報
 */
export interface CodeFileInfo {
  path: string;
  code: string;
  language: Language;
}

/**
 * DocCodeLinker: ドキュメントとコードの関連付けを行うクラス
 */
export class DocCodeLinker {
  constructor(
    private symbolExtractor: SymbolExtractor,
    private markdownParser: MarkdownParser
  ) {}

  /**
   * ドキュメント内のファイルパス参照を解決する
   * @param markdownContent Markdownコンテンツ
   * @param docPath ドキュメントのパス
   * @param projectRoot プロジェクトルートパス
   * @returns 解決されたファイルパス参照のリスト
   */
  async findFilePathReferences(
    markdownContent: string,
    docPath: string,
    projectRoot: string
  ): Promise<ResolvedFilePathReference[]> {
    const parsedDoc = await this.markdownParser.parse(markdownContent);
    const result: ResolvedFilePathReference[] = [];

    for (const filePathRef of parsedDoc.filePaths) {
      let resolvedPath: string;

      if (filePathRef.isAbsolute) {
        // 絶対パス（プロジェクトルートからの相対パス）
        resolvedPath = path.join(projectRoot, filePathRef.path);
      } else if (filePathRef.path.startsWith('./') || filePathRef.path.startsWith('../')) {
        // ドキュメントファイルからの相対パス
        const docDir = path.dirname(docPath);
        resolvedPath = path.join(docDir, filePathRef.path);
      } else {
        // プロジェクトルートからの相対パス
        resolvedPath = path.join(projectRoot, filePathRef.path);
      }

      result.push({
        ...filePathRef,
        resolvedPath: path.normalize(resolvedPath),
      });
    }

    return result;
  }

  /**
   * ドキュメント内のシンボル名参照を検出する
   * @param markdownContent Markdownコンテンツ
   * @param codeFiles コードファイルのリスト
   * @returns シンボル参照のリスト
   */
  async findSymbolReferences(
    markdownContent: string,
    codeFiles: CodeFileInfo[]
  ): Promise<SymbolReference[]> {
    const result: SymbolReference[] = [];

    // 各コードファイルからシンボルを抽出
    const fileSymbols: Map<string, SymbolInfo[]> = new Map();
    for (const file of codeFiles) {
      const extractionResult = this.symbolExtractor.extractSymbols(file.code, file.language);
      fileSymbols.set(file.path, extractionResult.symbols);
    }

    // Markdownコンテンツからシンボル名を抽出
    // インラインコード(`SymbolName`)からシンボル名候補を取得
    const symbolNamePattern = /`([A-Z][a-zA-Z0-9_]*)`/g;
    const matches = markdownContent.matchAll(symbolNamePattern);

    for (const match of matches) {
      const symbolName = match[1];
      if (!symbolName) continue;

      // 各コードファイルのシンボルと照合
      for (const [filePath, symbols] of fileSymbols.entries()) {
        const matchedSymbol = symbols.find((s) => s.name === symbolName);
        if (matchedSymbol) {
          result.push({
            symbolName,
            filePath,
            line: matchedSymbol.position.startLine,
          });
        }
      }
    }

    return result;
  }

  /**
   * Markdownのコードブロックと類似したコードを検出する
   * @param markdownContent Markdownコンテンツ
   * @param codeFiles コードファイルのリスト
   * @param threshold 類似度の閾値（デフォルト: 0.5）
   * @returns 類似コードのマッチ結果
   */
  async findSimilarCode(
    markdownContent: string,
    codeFiles: CodeFileInfo[],
    threshold: number = 0.5
  ): Promise<SimilarCodeMatch[]> {
    const parsedDoc = await this.markdownParser.parse(markdownContent);
    const result: SimilarCodeMatch[] = [];

    for (const codeBlock of parsedDoc.codeBlocks) {
      const normalizedCodeBlock = this.normalizeCode(codeBlock.code);

      for (const file of codeFiles) {
        // コードファイルを行ごとに分割
        const fileLines = file.code.split('\n');

        // ウィンドウスライドで類似度を計算
        const codeBlockLines = codeBlock.code.split('\n');
        const windowSize = codeBlockLines.length;

        for (let i = 0; i <= fileLines.length - windowSize; i++) {
          const windowCode = fileLines.slice(i, i + windowSize).join('\n');
          const normalizedWindowCode = this.normalizeCode(windowCode);

          const similarity = this.calculateSimilarity(normalizedCodeBlock, normalizedWindowCode);

          if (similarity >= threshold) {
            result.push({
              filePath: file.path,
              similarity,
              codeBlockLine: codeBlock.startLine,
              matchedCodeLine: i,
            });
          }
        }
      }
    }

    // 類似度でソート（降順）
    result.sort((a, b) => b.similarity - a.similarity);

    return result;
  }

  /**
   * 関連度スコアを計算する
   * @param markdownContent Markdownコンテンツ
   * @param docPath ドキュメントのパス
   * @param projectRoot プロジェクトルートパス
   * @param codeFiles コードファイルのリスト
   * @returns 関連度スコア結果のリスト
   */
  async calculateRelatedScore(
    markdownContent: string,
    docPath: string,
    projectRoot: string,
    codeFiles: CodeFileInfo[]
  ): Promise<RelatedScoreResult[]> {
    const scoreMap: Map<string, { score: number; reasons: Set<string> }> = new Map();

    // 1. ファイルパス参照による関連度（スコア: 1.0）
    const filePathRefs = await this.findFilePathReferences(markdownContent, docPath, projectRoot);

    for (const ref of filePathRefs) {
      for (const file of codeFiles) {
        const normalizedFilePath = path.normalize(file.path);
        const normalizedRefPath = path.normalize(ref.path);

        if (
          normalizedFilePath.endsWith(normalizedRefPath) ||
          normalizedFilePath === ref.resolvedPath
        ) {
          const entry = scoreMap.get(file.path) || { score: 0, reasons: new Set() };
          entry.score += 1.0;
          entry.reasons.add('file_path_reference');
          scoreMap.set(file.path, entry);
        }
      }
    }

    // 2. シンボル名参照による関連度（スコア: 0.7）
    const symbolRefs = await this.findSymbolReferences(markdownContent, codeFiles);

    for (const ref of symbolRefs) {
      const entry = scoreMap.get(ref.filePath) || { score: 0, reasons: new Set() };
      entry.score += 0.7;
      entry.reasons.add('symbol_reference');
      scoreMap.set(ref.filePath, entry);
    }

    // 3. コードブロック類似による関連度（スコア: 0.3 - 0.8）
    const similarCodeMatches = await this.findSimilarCode(markdownContent, codeFiles);

    for (const match of similarCodeMatches) {
      const entry = scoreMap.get(match.filePath) || { score: 0, reasons: new Set() };
      entry.score += match.similarity * 0.8;
      entry.reasons.add('code_similarity');
      scoreMap.set(match.filePath, entry);
    }

    // 結果を配列に変換してスコアでソート
    const result: RelatedScoreResult[] = [];
    for (const [filePath, entry] of scoreMap.entries()) {
      result.push({
        filePath,
        score: entry.score,
        reasons: Array.from(entry.reasons),
      });
    }

    // スコアで降順ソート
    result.sort((a, b) => b.score - a.score);

    return result;
  }

  /**
   * コードを正規化する（空白、コメント、インデントを除去）
   * @param code コード文字列
   * @returns 正規化されたコード
   */
  private normalizeCode(code: string): string {
    return code
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !line.startsWith('//') && !line.startsWith('#'))
      .join('\n');
  }

  /**
   * Levenshtein距離に基づく類似度を計算する
   * @param str1 文字列1
   * @param str2 文字列2
   * @returns 類似度（0.0 - 1.0）
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);

    if (maxLength === 0) {
      return 1.0;
    }

    return 1.0 - distance / maxLength;
  }

  /**
   * Levenshtein距離を計算する
   * @param str1 文字列1
   * @param str2 文字列2
   * @returns Levenshtein距離
   */
  private levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;

    // 動的計画法のテーブル
    const dp: number[][] = Array.from({ length: len1 + 1 }, () => Array(len2 + 1).fill(0));

    // 初期化
    for (let i = 0; i <= len1; i++) {
      dp[i]![0] = i;
    }
    for (let j = 0; j <= len2; j++) {
      dp[0]![j] = j;
    }

    // 動的計画法
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        dp[i]![j] = Math.min(
          dp[i - 1]![j]! + 1, // 削除
          dp[i]![j - 1]! + 1, // 挿入
          dp[i - 1]![j - 1]! + cost // 置換
        );
      }
    }

    return dp[len1]![len2]!;
  }
}

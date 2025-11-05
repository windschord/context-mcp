/**
 * AST Engine: Tree-sitterを使用してASTの解析と走査を行うエンジン
 */

import { LanguageParser } from './language-parser.js';
import {
  Language,
  ASTParseResult,
  NodePosition,
  TraversalCallback,
  TraversalOptions,
} from './types.js';

/**
 * ASTEngine: ASTの解析と走査を行うクラス
 */
export class ASTEngine {
  private languageParser: LanguageParser;

  constructor(languageParser: LanguageParser) {
    this.languageParser = languageParser;
  }

  /**
   * ソースコードをASTに変換
   * @param code ソースコード
   * @param language プログラミング言語
   * @returns AST解析結果
   */
  parseToAST(code: string, language: Language): ASTParseResult {
    const parseResult = this.languageParser.parse(code, language);

    return {
      tree: parseResult.tree,
      rootNode: parseResult.tree.rootNode,
      hasError: parseResult.hasError,
      language: parseResult.language,
    };
  }

  /**
   * ASTノードを深さ優先で走査
   * @param node 開始ノード
   * @param callback 各ノードに対して実行されるコールバック
   * @param options 走査オプション
   */
  traverseAST(node: any, callback: TraversalCallback, options: TraversalOptions = {}): void {
    const { skipErrors = false, maxDepth = Infinity } = options;

    const traverse = (currentNode: any, depth: number = 0): boolean => {
      // maxDepthチェック
      if (depth > maxDepth) {
        return true;
      }

      // エラーノードのスキップ
      if (skipErrors && (currentNode.type === 'ERROR' || currentNode.hasError)) {
        return true;
      }

      // コールバック実行
      const result = callback(currentNode);

      // false が返された場合は走査を停止
      if (result === false) {
        return false;
      }

      // 子ノードを走査
      if (currentNode.children && currentNode.children.length > 0) {
        for (const child of currentNode.children) {
          const shouldContinue = traverse(child, depth + 1);
          if (!shouldContinue) {
            return false;
          }
        }
      }

      return true;
    };

    traverse(node);
  }

  /**
   * ノードの位置情報を取得
   * @param node ASTノード
   * @returns ノードの位置情報
   */
  getNodePosition(node: any): NodePosition {
    return {
      startLine: node.startPosition.row,
      startColumn: node.startPosition.column,
      endLine: node.endPosition.row,
      endColumn: node.endPosition.column,
    };
  }

  /**
   * ノードのテキスト内容を取得
   * @param node ASTノード
   * @param sourceCode ソースコード
   * @returns ノードのテキスト内容
   */
  getNodeText(node: any, sourceCode: string): string {
    const { startLine, startColumn, endLine, endColumn } = this.getNodePosition(node);

    const lines = sourceCode.split('\n');

    // 単一行の場合
    if (startLine === endLine) {
      const line = lines[startLine];
      return line ? line.substring(startColumn, endColumn) : '';
    }

    // 複数行の場合
    const result: string[] = [];

    // 最初の行
    const firstLine = lines[startLine];
    if (firstLine) {
      result.push(firstLine.substring(startColumn));
    }

    // 中間の行
    for (let i = startLine + 1; i < endLine; i++) {
      const line = lines[i];
      if (line) {
        result.push(line);
      }
    }

    // 最後の行
    if (endLine < lines.length) {
      const lastLine = lines[endLine];
      if (lastLine) {
        result.push(lastLine.substring(0, endColumn));
      }
    }

    return result.join('\n');
  }

  /**
   * 特定の型のノードを検索
   * @param rootNode ルートノード
   * @param nodeType ノードタイプ
   * @param options 走査オプション
   * @returns 該当するノードの配列
   */
  findNodesByType(rootNode: any, nodeType: string, options: TraversalOptions = {}): any[] {
    const nodes: any[] = [];

    this.traverseAST(
      rootNode,
      (node) => {
        if (node.type === nodeType) {
          nodes.push(node);
        }
        return true;
      },
      options
    );

    return nodes;
  }

  /**
   * 複数の型のノードを検索
   * @param rootNode ルートノード
   * @param nodeTypes ノードタイプの配列
   * @param options 走査オプション
   * @returns 該当するノードの配列
   */
  findNodesByTypes(rootNode: any, nodeTypes: string[], options: TraversalOptions = {}): any[] {
    const nodes: any[] = [];
    const typeSet = new Set(nodeTypes);

    this.traverseAST(
      rootNode,
      (node) => {
        if (typeSet.has(node.type)) {
          nodes.push(node);
        }
        return true;
      },
      options
    );

    return nodes;
  }

  /**
   * 条件に合うノードを検索
   * @param rootNode ルートノード
   * @param predicate 条件関数
   * @param options 走査オプション
   * @returns 該当するノードの配列
   */
  findNodes(
    rootNode: any,
    predicate: (node: any) => boolean,
    options: TraversalOptions = {}
  ): any[] {
    const nodes: any[] = [];

    this.traverseAST(
      rootNode,
      (node) => {
        if (predicate(node)) {
          nodes.push(node);
        }
        return true;
      },
      options
    );

    return nodes;
  }

  /**
   * エラーノードを検索
   * @param rootNode ルートノード
   * @returns エラーノードの配列
   */
  findErrorNodes(rootNode: any): any[] {
    return this.findNodes(rootNode, (node) => node.type === 'ERROR' || node.hasError);
  }

  /**
   * ノードが特定の位置を含むかチェック
   * @param node ASTノード
   * @param line 行番号（0ベース）
   * @param column 列番号（0ベース）
   * @returns 位置を含む場合true
   */
  containsPosition(node: any, line: number, column: number): boolean {
    const { startLine, startColumn, endLine, endColumn } = this.getNodePosition(node);

    if (line < startLine || line > endLine) {
      return false;
    }

    if (line === startLine && column < startColumn) {
      return false;
    }

    if (line === endLine && column >= endColumn) {
      return false;
    }

    return true;
  }

  /**
   * 特定の位置に対応するノードを検索
   * @param rootNode ルートノード
   * @param line 行番号（0ベース）
   * @param column 列番号（0ベース）
   * @returns 最も小さい該当ノード
   */
  findNodeAtPosition(rootNode: any, line: number, column: number): any | null {
    let targetNode: any = null;
    let smallestSize = Infinity;

    this.traverseAST(rootNode, (node) => {
      if (this.containsPosition(node, line, column)) {
        const { startLine, startColumn, endLine, endColumn } = this.getNodePosition(node);
        const size = (endLine - startLine) * 1000 + (endColumn - startColumn);

        if (size < smallestSize) {
          smallestSize = size;
          targetNode = node;
        }
      }
      return true;
    });

    return targetNode;
  }
}

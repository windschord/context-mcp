/**
 * テスト: ドキュメント-コード関連付け機能
 */

import { DocCodeLinker } from '../../src/parser/doc-code-linker.js';
import { SymbolExtractor } from '../../src/parser/symbol-extractor.js';
import { MarkdownParser } from '../../src/parser/markdown-parser.js';
import { LanguageParser } from '../../src/parser/language-parser.js';
import { Language } from '../../src/parser/types.js';

describe('DocCodeLinker', () => {
  let linker: DocCodeLinker;
  let symbolExtractor: SymbolExtractor;
  let markdownParser: MarkdownParser;

  beforeAll(() => {
    const languageParser = new LanguageParser();
    symbolExtractor = new SymbolExtractor(languageParser);
    markdownParser = new MarkdownParser();
    linker = new DocCodeLinker(symbolExtractor, markdownParser);
  });

  describe('ファイルパス参照の解決', () => {
    it('ドキュメント内の相対ファイルパス参照を解決できる', async () => {
      const markdownContent = `
# API Documentation

この関数は \`src/utils/logger.ts\` に定義されています。

詳細については \`./config/types.ts\` を参照してください。
`;

      const projectRoot = '/Users/test/project';
      const docPath = '/Users/test/project/docs/api.md';

      const result = await linker.findFilePathReferences(
        markdownContent,
        docPath,
        projectRoot
      );

      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('src/utils/logger.ts');
      expect(result[0].resolvedPath).toBe(
        '/Users/test/project/src/utils/logger.ts'
      );
      expect(result[0].line).toBeGreaterThanOrEqual(0);

      expect(result[1].path).toBe('./config/types.ts');
      expect(result[1].resolvedPath).toBe(
        '/Users/test/project/docs/config/types.ts'
      );
    });

    it('絶対ファイルパス参照を解決できる', async () => {
      const markdownContent = `
# Documentation

\`/src/index.ts\` がエントリーポイントです。
`;

      const projectRoot = '/Users/test/project';
      const docPath = '/Users/test/project/README.md';

      const result = await linker.findFilePathReferences(
        markdownContent,
        docPath,
        projectRoot
      );

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/src/index.ts');
      expect(result[0].resolvedPath).toBe('/Users/test/project/src/index.ts');
    });
  });

  describe('シンボル名参照の検出', () => {
    it('ドキュメント内のクラス名参照を検出できる', async () => {
      const markdownContent = `
# User Service

\`UserService\` クラスは認証を処理します。

\`AuthManager\` と \`DatabaseConnection\` を使用します。
`;

      const codeFiles = [
        {
          path: 'src/UserService.ts',
          code: `
export class UserService {
  login() {}
}
`,
          language: Language.TypeScript,
        },
        {
          path: 'src/AuthManager.ts',
          code: `
export class AuthManager {
  authenticate() {}
}
`,
          language: Language.TypeScript,
        },
      ];

      const result = await linker.findSymbolReferences(
        markdownContent,
        codeFiles
      );

      expect(result).toHaveLength(2);

      const userServiceRef = result.find((r) => r.symbolName === 'UserService');
      expect(userServiceRef).toBeDefined();
      expect(userServiceRef?.filePath).toBe('src/UserService.ts');
      expect(userServiceRef?.line).toBeGreaterThanOrEqual(0);

      const authManagerRef = result.find((r) => r.symbolName === 'AuthManager');
      expect(authManagerRef).toBeDefined();
      expect(authManagerRef?.filePath).toBe('src/AuthManager.ts');
    });

    it('ドキュメント内の関数名参照を検出できる', async () => {
      const markdownContent = `
# Utility Functions

\`calculateTotal\` 関数で合計を計算します。

\`formatCurrency\` で通貨フォーマットします。
`;

      const codeFiles = [
        {
          path: 'src/utils.ts',
          code: `
export function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

export function formatCurrency(amount: number): string {
  return \`$\${amount.toFixed(2)}\`;
}
`,
          language: Language.TypeScript,
        },
      ];

      const result = await linker.findSymbolReferences(
        markdownContent,
        codeFiles
      );

      expect(result).toHaveLength(2);
      expect(result[0].symbolName).toBe('calculateTotal');
      expect(result[0].filePath).toBe('src/utils.ts');
      expect(result[1].symbolName).toBe('formatCurrency');
    });
  });

  describe('コードブロック類似度検出', () => {
    it('Markdownのコードブロックと類似したコードを検出できる', async () => {
      const markdownContent = `
# Usage Example

\`\`\`typescript
function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
\`\`\`
`;

      const codeFiles = [
        {
          path: 'src/greeter.ts',
          code: `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
`,
          language: Language.TypeScript,
        },
        {
          path: 'src/other.ts',
          code: `
function sayHello(user: string): string {
  return \`Hi, \${user}!\`;
}
`,
          language: Language.TypeScript,
        },
      ];

      const result = await linker.findSimilarCode(markdownContent, codeFiles);

      expect(result.length).toBeGreaterThan(0);

      const topMatch = result[0];
      expect(topMatch.filePath).toBe('src/greeter.ts');
      expect(topMatch.similarity).toBeGreaterThan(0.8); // 高い類似度
      expect(topMatch.codeBlockLine).toBeGreaterThanOrEqual(0);
    });

    it('類似度が低いコードは除外される', async () => {
      const markdownContent = `
# Example

\`\`\`typescript
const x = 1;
\`\`\`
`;

      const codeFiles = [
        {
          path: 'src/complex.ts',
          code: `
class ComplexCalculator {
  private value: number = 0;

  calculate(a: number, b: number): number {
    return Math.sqrt(a * a + b * b);
  }
}
`,
          language: Language.TypeScript,
        },
      ];

      const result = await linker.findSimilarCode(markdownContent, codeFiles);

      // 類似度閾値（例: 0.5）未満のマッチは含まれない
      expect(
        result.every((match) => match.similarity >= 0.5)
      ).toBe(true);
    });
  });

  describe('関連度スコア計算', () => {
    it('ファイルパス参照による関連度スコアを計算できる', async () => {
      const markdownContent = `
# Documentation

詳細は \`src/service.ts\` を参照。
`;

      const projectRoot = '/test/project';
      const docPath = '/test/project/docs/api.md';

      const codeFiles = [
        {
          path: 'src/service.ts',
          code: 'export class Service {}',
          language: Language.TypeScript,
        },
      ];

      const result = await linker.calculateRelatedScore(
        markdownContent,
        docPath,
        projectRoot,
        codeFiles
      );

      expect(result).toHaveLength(1);
      expect(result[0].filePath).toBe('src/service.ts');
      expect(result[0].score).toBeGreaterThan(0);
      expect(result[0].reasons).toContain('file_path_reference');
    });

    it('シンボル名参照による関連度スコアを計算できる', async () => {
      const markdownContent = `
# API

\`UserController\` クラスを使用します。
`;

      const projectRoot = '/test/project';
      const docPath = '/test/project/docs/api.md';

      const codeFiles = [
        {
          path: 'src/controller.ts',
          code: 'export class UserController {}',
          language: Language.TypeScript,
        },
      ];

      const result = await linker.calculateRelatedScore(
        markdownContent,
        docPath,
        projectRoot,
        codeFiles
      );

      expect(result).toHaveLength(1);
      expect(result[0].filePath).toBe('src/controller.ts');
      expect(result[0].score).toBeGreaterThan(0);
      expect(result[0].reasons).toContain('symbol_reference');
    });

    it('複数の関連要素がある場合はスコアを合算する', async () => {
      const markdownContent = `
# Service Documentation

\`UserService\` クラスは \`src/services/user.ts\` に定義されています。

\`\`\`typescript
export class UserService {
  getUser() {}
}
\`\`\`
`;

      const projectRoot = '/test/project';
      const docPath = '/test/project/docs/services.md';

      const codeFiles = [
        {
          path: 'src/services/user.ts',
          code: `
export class UserService {
  getUser() {}
}
`,
          language: Language.TypeScript,
        },
      ];

      const result = await linker.calculateRelatedScore(
        markdownContent,
        docPath,
        projectRoot,
        codeFiles
      );

      expect(result).toHaveLength(1);
      const match = result[0];

      // 複数の関連要素があるためスコアが高い
      expect(match.score).toBeGreaterThan(0.5);
      expect(match.reasons.length).toBeGreaterThan(1);
      expect(match.reasons).toContain('file_path_reference');
      expect(match.reasons).toContain('symbol_reference');
    });

    it('関連度スコアで結果をソートする', async () => {
      const markdownContent = `
# Documentation

\`MainClass\` と \`HelperClass\` を使用。

詳細は \`src/main.ts\` 参照。
`;

      const projectRoot = '/test/project';
      const docPath = '/test/project/docs/api.md';

      const codeFiles = [
        {
          path: 'src/main.ts',
          code: 'export class MainClass {}',
          language: Language.TypeScript,
        },
        {
          path: 'src/helper.ts',
          code: 'export class HelperClass {}',
          language: Language.TypeScript,
        },
      ];

      const result = await linker.calculateRelatedScore(
        markdownContent,
        docPath,
        projectRoot,
        codeFiles
      );

      // スコアで降順ソート
      expect(result.length).toBeGreaterThan(0);
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
      }
    });
  });
});

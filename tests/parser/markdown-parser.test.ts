import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';
import { MarkdownParser } from '../../src/parser/markdown-parser.js';

describe('MarkdownParser', () => {
  let parser: MarkdownParser;
  let sampleContent: string;

  beforeAll(() => {
    parser = new MarkdownParser();
    const samplePath = join(process.cwd(), 'tests', 'fixtures', 'sample.md');
    sampleContent = readFileSync(samplePath, 'utf-8');
  });

  describe('parse', () => {
    it('Markdownファイルの全体を解析できること', async () => {
      const result = await parser.parse(sampleContent);

      expect(result).toBeDefined();
      expect(result.headings).toBeDefined();
      expect(result.codeBlocks).toBeDefined();
      expect(result.links).toBeDefined();
      expect(result.filePaths).toBeDefined();
      expect(result.images).toBeDefined();
    });
  });

  describe('Headings Extraction', () => {
    it('見出し構造（h1-h6）を抽出できること', async () => {
      const result = await parser.parse(sampleContent);

      expect(result.headings.length).toBeGreaterThan(0);

      // h1見出しを確認
      const h1 = result.headings.find((h) => h.level === 1);
      expect(h1).toBeDefined();
      expect(h1?.text).toBe('サンプルドキュメント');

      // h2見出しを確認
      const h2Headings = result.headings.filter((h) => h.level === 2);
      expect(h2Headings.length).toBeGreaterThan(0);

      // h3見出しを確認
      const h3Headings = result.headings.filter((h) => h.level === 3);
      expect(h3Headings.length).toBeGreaterThan(0);
    });

    it('見出しの階層構造を保持できること', async () => {
      const result = await parser.parse(sampleContent);

      const headings = result.headings;

      // レベルが1から6の範囲であること
      headings.forEach((heading) => {
        expect(heading.level).toBeGreaterThanOrEqual(1);
        expect(heading.level).toBeLessThanOrEqual(6);
      });

      // 見出しの順序が文書内の順序と一致すること
      for (let i = 1; i < headings.length; i++) {
        expect(headings[i].line).toBeGreaterThan(headings[i - 1].line);
      }
    });

    it('各見出しに位置情報が含まれること', async () => {
      const result = await parser.parse(sampleContent);

      result.headings.forEach((heading) => {
        expect(heading.line).toBeGreaterThanOrEqual(0);
        expect(typeof heading.line).toBe('number');
      });
    });
  });

  describe('Code Blocks Extraction', () => {
    it('コードブロックを抽出できること', async () => {
      const result = await parser.parse(sampleContent);

      expect(result.codeBlocks.length).toBeGreaterThan(0);
    });

    it('言語タグ付きコードブロックを識別できること', async () => {
      const result = await parser.parse(sampleContent);

      // TypeScriptコードブロック
      const tsBlock = result.codeBlocks.find((block) => block.language === 'typescript');
      expect(tsBlock).toBeDefined();
      expect(tsBlock?.code).toContain('function hello');

      // Pythonコードブロック
      const pyBlock = result.codeBlocks.find((block) => block.language === 'python');
      expect(pyBlock).toBeDefined();
      expect(pyBlock?.code).toContain('def greet');
    });

    it('言語タグなしコードブロックを処理できること', async () => {
      const result = await parser.parse(sampleContent);

      const noLangBlock = result.codeBlocks.find(
        (block) => !block.language || block.language === ''
      );
      expect(noLangBlock).toBeDefined();
    });

    it('コードブロックの行番号情報が含まれること', async () => {
      const result = await parser.parse(sampleContent);

      result.codeBlocks.forEach((block) => {
        expect(block.startLine).toBeGreaterThanOrEqual(0);
        expect(block.endLine).toBeGreaterThanOrEqual(block.startLine);
      });
    });
  });

  describe('Links Extraction', () => {
    it('リンク情報を抽出できること', async () => {
      const result = await parser.parse(sampleContent);

      expect(result.links.length).toBeGreaterThan(0);
    });

    it('リンクテキストとURLを取得できること', async () => {
      const result = await parser.parse(sampleContent);

      const externalLink = result.links.find((link) => link.url.includes('example.com'));
      expect(externalLink).toBeDefined();
      expect(externalLink?.text).toBeTruthy();
      expect(externalLink?.url).toBeTruthy();
    });

    it('内部リンクと外部リンクを区別できること', async () => {
      const result = await parser.parse(sampleContent);

      // 内部リンク（相対パス）
      const internalLink = result.links.find((link) => link.url.includes('./other-doc.md'));
      expect(internalLink).toBeDefined();
      expect(internalLink?.type).toBe('internal');

      // 外部リンク（http/https）
      const externalLink = result.links.find((link) => link.url.startsWith('http'));
      expect(externalLink).toBeDefined();
      expect(externalLink?.type).toBe('external');
    });
  });

  describe('File Path References Detection', () => {
    it('ファイルパス参照を検出できること', async () => {
      const result = await parser.parse(sampleContent);

      expect(result.filePaths.length).toBeGreaterThan(0);
    });

    it('相対パスと絶対パスを識別できること', async () => {
      const result = await parser.parse(sampleContent);

      // 相対パス
      const relativePath = result.filePaths.find((fp) => fp.path.startsWith('src/'));
      expect(relativePath).toBeDefined();
      expect(relativePath?.isAbsolute).toBe(false);

      // 絶対パス
      const absolutePath = result.filePaths.find((fp) => fp.path.startsWith('/'));
      expect(absolutePath).toBeDefined();
      expect(absolutePath?.isAbsolute).toBe(true);
    });

    it('ファイルパスの行番号情報が含まれること', async () => {
      const result = await parser.parse(sampleContent);

      result.filePaths.forEach((fp) => {
        expect(fp.line).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Images Extraction', () => {
    it('画像情報を抽出できること', async () => {
      const result = await parser.parse(sampleContent);

      expect(result.images.length).toBeGreaterThan(0);
    });

    it('alt textとURLを取得できること', async () => {
      const result = await parser.parse(sampleContent);

      const image = result.images[0];
      expect(image).toBeDefined();
      expect(image.alt).toBeTruthy();
      expect(image.url).toBeTruthy();
    });

    it('ローカル画像と外部画像を区別できること', async () => {
      const result = await parser.parse(sampleContent);

      // ローカル画像
      const localImage = result.images.find((img) => img.url.startsWith('./'));
      expect(localImage).toBeDefined();

      // 外部画像
      const externalImage = result.images.find((img) => img.url.startsWith('http'));
      expect(externalImage).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('空のMarkdownを処理できること', async () => {
      const result = await parser.parse('');

      expect(result.headings.length).toBe(0);
      expect(result.codeBlocks.length).toBe(0);
      expect(result.links.length).toBe(0);
      expect(result.filePaths.length).toBe(0);
      expect(result.images.length).toBe(0);
    });

    it('見出しのみのMarkdownを処理できること', async () => {
      const markdown = '# Title\n## Section';
      const result = await parser.parse(markdown);

      expect(result.headings.length).toBe(2);
      expect(result.codeBlocks.length).toBe(0);
    });

    it('コードブロックのみのMarkdownを処理できること', async () => {
      const markdown = '```typescript\nconst x = 1;\n```';
      const result = await parser.parse(markdown);

      expect(result.codeBlocks.length).toBe(1);
      expect(result.headings.length).toBe(0);
    });

    it('不正なMarkdown構文を許容できること', async () => {
      const markdown = '# Incomplete heading\n```\nUnclosed code block';
      expect(() => parser.parse(markdown)).not.toThrow();
    });
  });
});

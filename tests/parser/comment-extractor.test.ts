/**
 * Tests for Comment Extractor
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { CommentExtractor } from '../../src/parser/comment-extractor.js';
import { LanguageParser } from '../../src/parser/language-parser.js';
import {
  Language,
  CommentType,
  CommentMarker,
  CommentInfo,
} from '../../src/parser/types.js';

describe('CommentExtractor', () => {
  let languageParser: LanguageParser;
  let commentExtractor: CommentExtractor;

  beforeAll(() => {
    languageParser = new LanguageParser();
    commentExtractor = new CommentExtractor(languageParser);
  });

  const loadFixture = (filename: string): string => {
    const fixturePath = join(
      __dirname,
      '..',
      'fixtures',
      'comment-extraction',
      filename
    );
    return readFileSync(fixturePath, 'utf-8');
  };

  describe('TypeScript/JavaScript', () => {
    let code: string;
    let comments: CommentInfo[];

    beforeAll(() => {
      code = loadFixture('sample.ts');
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      comments = result.comments;
    });

    test('should extract single line comments', () => {
      const singleLineComments = comments.filter(
        (c) => c.type === CommentType.SingleLine
      );
      expect(singleLineComments.length).toBeGreaterThan(0);

      const beforeFunction = singleLineComments.find((c) =>
        c.content.includes('Single line comment before function')
      );
      expect(beforeFunction).toBeDefined();
    });

    test('should extract JSDoc comments', () => {
      const jsdocComments = comments.filter(
        (c) => c.type === CommentType.DocComment
      );
      expect(jsdocComments.length).toBeGreaterThan(0);

      const addFunctionDoc = jsdocComments.find((c) =>
        c.content.includes('JSDoc comment for add function')
      );
      expect(addFunctionDoc).toBeDefined();
      expect(addFunctionDoc?.tags).toBeDefined();
      expect(addFunctionDoc?.tags?.length).toBeGreaterThan(0);

      // Check for @param tags
      const paramTags = addFunctionDoc?.tags?.filter((t) => t.name === 'param');
      expect(paramTags).toBeDefined();
      expect(paramTags?.length).toBeGreaterThanOrEqual(2);

      // Check for @returns tag
      const returnTag = addFunctionDoc?.tags?.find((t) => t.name === 'returns');
      expect(returnTag).toBeDefined();
    });

    test('should extract multi-line block comments', () => {
      const multiLineComments = comments.filter(
        (c) => c.type === CommentType.MultiLine
      );
      expect(multiLineComments.length).toBeGreaterThan(0);

      const userClassComment = multiLineComments.find((c) =>
        c.content.includes('Multi-line block comment')
      );
      expect(userClassComment).toBeDefined();
    });

    test('should detect TODO markers', () => {
      const todoComments = comments.filter((c) => c.marker === CommentMarker.TODO);
      expect(todoComments.length).toBeGreaterThan(0);

      const todoComment = todoComments.find((c) =>
        c.content.includes('Implement user validation')
      );
      expect(todoComment).toBeDefined();
    });

    test('should detect FIXME markers', () => {
      const fixmeComments = comments.filter(
        (c) => c.marker === CommentMarker.FIXME
      );
      expect(fixmeComments.length).toBeGreaterThan(0);

      const fixmeComment = fixmeComments.find((c) =>
        c.content.includes('placeholder implementation')
      );
      expect(fixmeComment).toBeDefined();
    });

    test('should detect NOTE markers', () => {
      const noteComments = comments.filter((c) => c.marker === CommentMarker.NOTE);
      expect(noteComments.length).toBeGreaterThan(0);
    });

    test('should detect HACK markers', () => {
      const hackComments = comments.filter((c) => c.marker === CommentMarker.HACK);
      expect(hackComments.length).toBeGreaterThan(0);
    });

    test('should detect XXX markers', () => {
      const xxxComments = comments.filter((c) => c.marker === CommentMarker.XXX);
      expect(xxxComments.length).toBeGreaterThan(0);
    });

    test('should detect BUG markers', () => {
      const bugComments = comments.filter((c) => c.marker === CommentMarker.BUG);
      expect(bugComments.length).toBeGreaterThan(0);
    });

    test('should associate comments with code elements', () => {
      const associatedComments = comments.filter((c) => c.associatedSymbol);
      expect(associatedComments.length).toBeGreaterThan(0);

      // JSDoc for add function should be associated with 'add'
      const addDoc = comments.find(
        (c) =>
          c.type === CommentType.DocComment &&
          c.content.includes('JSDoc comment for add function')
      );
      expect(addDoc?.associatedSymbol).toBe('add');

      // Constructor comment should be associated with 'constructor'
      const constructorDoc = comments.find(
        (c) =>
          c.type === CommentType.DocComment &&
          c.content.includes('Constructor comment')
      );
      expect(constructorDoc?.associatedSymbol).toBe('constructor');
    });
  });

  describe('Python', () => {
    let code: string;
    let comments: CommentInfo[];

    beforeAll(() => {
      code = loadFixture('sample.py');
      const result = commentExtractor.extractComments(code, Language.Python);
      comments = result.comments;
    });

    test('should extract single line comments', () => {
      const singleLineComments = comments.filter(
        (c) => c.type === CommentType.SingleLine
      );
      expect(singleLineComments.length).toBeGreaterThan(0);
    });

    test('should extract docstrings', () => {
      const docstrings = comments.filter((c) => c.type === CommentType.DocComment);
      expect(docstrings.length).toBeGreaterThan(0);

      const addFunctionDoc = docstrings.find((c) =>
        c.content.includes('Docstring for add function')
      );
      expect(addFunctionDoc).toBeDefined();
      expect(addFunctionDoc?.associatedSymbol).toBe('add');
    });

    test('should detect all special markers', () => {
      const todoComments = comments.filter((c) => c.marker === CommentMarker.TODO);
      const fixmeComments = comments.filter(
        (c) => c.marker === CommentMarker.FIXME
      );
      const noteComments = comments.filter((c) => c.marker === CommentMarker.NOTE);

      expect(todoComments.length).toBeGreaterThan(0);
      expect(fixmeComments.length).toBeGreaterThan(0);
      expect(noteComments.length).toBeGreaterThan(0);
    });
  });

  describe('Go', () => {
    let code: string;
    let comments: CommentInfo[];

    beforeAll(() => {
      code = loadFixture('sample.go');
      const result = commentExtractor.extractComments(code, Language.Go);
      comments = result.comments;
    });

    test('should extract single line comments', () => {
      const singleLineComments = comments.filter(
        (c) => c.type === CommentType.SingleLine
      );
      expect(singleLineComments.length).toBeGreaterThan(0);
    });

    test('should extract multi-line comments', () => {
      const multiLineComments = comments.filter(
        (c) => c.type === CommentType.MultiLine
      );
      expect(multiLineComments.length).toBeGreaterThan(0);
    });

    test('should detect special markers', () => {
      const markedComments = comments.filter((c) => c.marker !== undefined);
      expect(markedComments.length).toBeGreaterThan(0);
    });
  });

  describe('Rust', () => {
    let code: string;
    let comments: CommentInfo[];

    beforeAll(() => {
      code = loadFixture('sample.rs');
      const result = commentExtractor.extractComments(code, Language.Rust);
      comments = result.comments;
    });

    test('should extract doc comments (///)', () => {
      const docComments = comments.filter((c) => c.type === CommentType.DocComment);
      expect(docComments.length).toBeGreaterThan(0);

      const addDoc = docComments.find((c) =>
        c.content.includes('Doc comment for add function')
      );
      expect(addDoc).toBeDefined();
    });

    test('should extract single line comments', () => {
      const singleLineComments = comments.filter(
        (c) => c.type === CommentType.SingleLine
      );
      expect(singleLineComments.length).toBeGreaterThan(0);
    });

    test('should detect special markers', () => {
      const todoComments = comments.filter((c) => c.marker === CommentMarker.TODO);
      expect(todoComments.length).toBeGreaterThan(0);
    });
  });

  describe('Java', () => {
    let code: string;
    let comments: CommentInfo[];

    beforeAll(() => {
      code = loadFixture('Sample.java');
      const result = commentExtractor.extractComments(code, Language.Java);
      comments = result.comments;
    });

    test('should extract JavaDoc comments', () => {
      const javadocComments = comments.filter(
        (c) => c.type === CommentType.DocComment
      );
      expect(javadocComments.length).toBeGreaterThan(0);

      const classDoc = javadocComments.find((c) =>
        c.content.includes('JavaDoc comment for User class')
      );
      expect(classDoc).toBeDefined();
    });

    test('should extract single line and multi-line comments', () => {
      const singleLineComments = comments.filter(
        (c) => c.type === CommentType.SingleLine
      );
      const multiLineComments = comments.filter(
        (c) => c.type === CommentType.MultiLine
      );

      expect(singleLineComments.length).toBeGreaterThan(0);
      expect(multiLineComments.length).toBeGreaterThan(0);
    });

    test('should detect special markers', () => {
      const markedComments = comments.filter((c) => c.marker !== undefined);
      expect(markedComments.length).toBeGreaterThan(0);
    });
  });

  describe('C/C++', () => {
    let code: string;
    let comments: CommentInfo[];

    beforeAll(() => {
      code = loadFixture('sample.cpp');
      const result = commentExtractor.extractComments(code, Language.CPP);
      comments = result.comments;
    });

    test('should extract doc comments (@brief)', () => {
      const docComments = comments.filter((c) => c.type === CommentType.DocComment);
      expect(docComments.length).toBeGreaterThan(0);

      const addDoc = docComments.find((c) => c.content.includes('@brief Add'));
      expect(addDoc).toBeDefined();
    });

    test('should extract single line and multi-line comments', () => {
      const singleLineComments = comments.filter(
        (c) => c.type === CommentType.SingleLine
      );
      const multiLineComments = comments.filter(
        (c) => c.type === CommentType.MultiLine
      );

      expect(singleLineComments.length).toBeGreaterThan(0);
      expect(multiLineComments.length).toBeGreaterThan(0);
    });

    test('should detect special markers', () => {
      const todoComments = comments.filter((c) => c.marker === CommentMarker.TODO);
      const fixmeComments = comments.filter(
        (c) => c.marker === CommentMarker.FIXME
      );

      expect(todoComments.length).toBeGreaterThan(0);
      expect(fixmeComments.length).toBeGreaterThan(0);
    });
  });

  describe('Error handling', () => {
    test('should handle empty code', () => {
      const result = commentExtractor.extractComments('', Language.TypeScript);
      expect(result.comments).toEqual([]);
      expect(result.hasError).toBe(false);
    });

    test('should handle code without comments', () => {
      const code = 'const x = 1; const y = 2;';
      const result = commentExtractor.extractComments(code, Language.TypeScript);
      expect(result.comments).toEqual([]);
      expect(result.hasError).toBe(false);
    });

    test('should handle parse errors gracefully', () => {
      const invalidCode = 'function { invalid syntax }';
      const result = commentExtractor.extractComments(
        invalidCode,
        Language.TypeScript
      );
      // Should not throw, might have errors but still try to extract
      expect(result).toBeDefined();
    });
  });
});

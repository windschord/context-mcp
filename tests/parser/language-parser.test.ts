import { describe, test, expect, beforeAll } from '@jest/globals';
import { LanguageParser } from '../../src/parser/language-parser.js';
import { Language } from '../../src/parser/types.js';

describe('LanguageParser', () => {
  let parser: LanguageParser;

  beforeAll(async () => {
    parser = new LanguageParser();
    await parser.initialize();
  });

  describe('language detection', () => {
    test('should detect TypeScript files', () => {
      expect(parser.detectLanguage('example.ts')).toBe(Language.TypeScript);
      expect(parser.detectLanguage('example.tsx')).toBe(Language.TypeScript);
    });

    test('should detect JavaScript files', () => {
      expect(parser.detectLanguage('example.js')).toBe(Language.JavaScript);
      expect(parser.detectLanguage('example.jsx')).toBe(Language.JavaScript);
      expect(parser.detectLanguage('example.mjs')).toBe(Language.JavaScript);
    });

    test('should detect Python files', () => {
      expect(parser.detectLanguage('example.py')).toBe(Language.Python);
      expect(parser.detectLanguage('example.pyi')).toBe(Language.Python);
    });

    test('should detect Go files', () => {
      expect(parser.detectLanguage('example.go')).toBe(Language.Go);
    });

    test('should detect Rust files', () => {
      expect(parser.detectLanguage('example.rs')).toBe(Language.Rust);
    });

    test('should detect Java files', () => {
      expect(parser.detectLanguage('example.java')).toBe(Language.Java);
    });

    test('should detect C/C++ files', () => {
      expect(parser.detectLanguage('example.c')).toBe(Language.C);
      expect(parser.detectLanguage('example.cpp')).toBe(Language.CPP);
      expect(parser.detectLanguage('example.cc')).toBe(Language.CPP);
      expect(parser.detectLanguage('example.cxx')).toBe(Language.CPP);
      expect(parser.detectLanguage('example.h')).toBe(Language.C);
      expect(parser.detectLanguage('example.hpp')).toBe(Language.CPP);
    });

    test('should detect Arduino files as C++', () => {
      expect(parser.detectLanguage('example.ino')).toBe(Language.CPP);
    });

    test('should return Unknown for unsupported files', () => {
      expect(parser.detectLanguage('example.txt')).toBe(Language.Unknown);
      expect(parser.detectLanguage('example.md')).toBe(Language.Unknown);
    });
  });

  describe('parser initialization', () => {
    test('should have TypeScript/JavaScript parser initialized', () => {
      expect(parser.hasParser(Language.TypeScript)).toBe(true);
      expect(parser.hasParser(Language.JavaScript)).toBe(true);
    });

    test('should have Python parser initialized', () => {
      expect(parser.hasParser(Language.Python)).toBe(true);
    });

    test('should have Go parser initialized', () => {
      expect(parser.hasParser(Language.Go)).toBe(true);
    });

    test('should have Rust parser initialized', () => {
      expect(parser.hasParser(Language.Rust)).toBe(true);
    });

    test('should have Java parser initialized', () => {
      expect(parser.hasParser(Language.Java)).toBe(true);
    });

    test('should have C/C++ parser initialized', () => {
      expect(parser.hasParser(Language.C)).toBe(true);
      expect(parser.hasParser(Language.CPP)).toBe(true);
    });

    test('should not have parser for Unknown language', () => {
      expect(parser.hasParser(Language.Unknown)).toBe(false);
    });
  });

  describe('error handling', () => {
    test('should handle parser errors gracefully', () => {
      const invalidCode = 'this is {{{{ invalid syntax ))))';
      expect(() => {
        parser.parse(invalidCode, Language.Python);
      }).not.toThrow();
    });

    test('should return error info for invalid syntax', () => {
      const invalidCode = 'function test( {{{ }}}';
      const result = parser.parse(invalidCode, Language.JavaScript);
      expect(result.hasError).toBe(true);
    });

    test('should handle empty code', () => {
      const result = parser.parse('', Language.Python);
      expect(result).toBeDefined();
      expect(result.tree).toBeDefined();
    });

    test('should handle null or undefined gracefully', () => {
      expect(() => {
        parser.parse(null as any, Language.Python);
      }).toThrow();
    });
  });

  describe('special Arduino handling', () => {
    test('should parse .ino files using C++ parser', () => {
      const arduinoCode = `
void setup() {
  Serial.begin(9600);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
}
`;
      const result = parser.parse(arduinoCode, parser.detectLanguage('sketch.ino'));
      expect(result).toBeDefined();
      expect(result.hasError).toBe(false);
    });

    test('should recognize setup() and loop() functions', () => {
      const arduinoCode = `
void setup() {
  pinMode(13, OUTPUT);
}

void loop() {
  delay(500);
}
`;
      const result = parser.parse(arduinoCode, Language.CPP);
      expect(result).toBeDefined();
      // setup()とloop()関数が認識されることを確認
      const setupFunc = result.tree.rootNode.children.find(
        (node) => node.type === 'function_definition'
      );
      expect(setupFunc).toBeDefined();
    });
  });
});

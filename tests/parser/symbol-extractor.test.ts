/**
 * Tests for Symbol Extractor
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { SymbolExtractor } from '../../src/parser/symbol-extractor.js';
import { LanguageParser } from '../../src/parser/language-parser.js';
import {
  Language,
  SymbolType,
  SymbolScope,
  SymbolInfo,
} from '../../src/parser/types.js';

describe('SymbolExtractor', () => {
  let languageParser: LanguageParser;
  let symbolExtractor: SymbolExtractor;

  beforeAll(() => {
    languageParser = new LanguageParser();
    symbolExtractor = new SymbolExtractor(languageParser);
  });

  const loadFixture = (filename: string): string => {
    const fixturePath = join(
      __dirname,
      '..',
      'fixtures',
      'symbol-extraction',
      filename
    );
    return readFileSync(fixturePath, 'utf-8');
  };

  describe('TypeScript/JavaScript', () => {
    let code: string;
    let symbols: SymbolInfo[];

    beforeAll(() => {
      code = loadFixture('sample.ts');
      const result = symbolExtractor.extractSymbols(code, Language.TypeScript);
      symbols = result.symbols;
    });

    test('should extract global constants', () => {
      const apiVersion = symbols.find(
        (s) => s.name === 'API_VERSION' && s.type === SymbolType.Constant
      );
      expect(apiVersion).toBeDefined();
      expect(apiVersion?.scope).toBe(SymbolScope.Global);
      expect(apiVersion?.isExported).toBe(true);
    });

    test('should extract global variables', () => {
      const globalCounter = symbols.find(
        (s) => s.name === 'globalCounter' && s.type === SymbolType.Variable
      );
      expect(globalCounter).toBeDefined();
      expect(globalCounter?.scope).toBe(SymbolScope.Global);
    });

    test('should extract interfaces', () => {
      const userInterface = symbols.find(
        (s) => s.name === 'User' && s.type === SymbolType.Interface
      );
      expect(userInterface).toBeDefined();
      expect(userInterface?.scope).toBe(SymbolScope.Global);
      expect(userInterface?.isExported).toBe(true);
    });

    test('should extract abstract classes', () => {
      const animalClass = symbols.find(
        (s) => s.name === 'Animal' && s.type === SymbolType.Class
      );
      expect(animalClass).toBeDefined();
      expect(animalClass?.scope).toBe(SymbolScope.Global);
      expect(animalClass?.isAbstract).toBe(true);
      expect(animalClass?.isExported).toBe(true);
    });

    test('should extract class with inheritance', () => {
      const dogClass = symbols.find(
        (s) => s.name === 'Dog' && s.type === SymbolType.Class
      );
      expect(dogClass).toBeDefined();
      expect(dogClass?.extends).toContain('Animal');
      expect(dogClass?.members).toBeDefined();
      expect(dogClass?.members!.length).toBeGreaterThan(0);
    });

    test('should extract async functions', () => {
      const fetchUser = symbols.find(
        (s) => s.name === 'fetchUser' && s.type === SymbolType.Function
      );
      expect(fetchUser).toBeDefined();
      expect(fetchUser?.isAsync).toBe(true);
      expect(fetchUser?.parameters).toBeDefined();
      expect(fetchUser?.parameters!.length).toBe(1);
      expect(fetchUser?.parameters![0].name).toBe('id');
      expect(fetchUser?.returnType).toContain('Promise');
    });

    test('should extract functions with optional parameters', () => {
      const greet = symbols.find(
        (s) => s.name === 'greet' && s.type === SymbolType.Function
      );
      expect(greet).toBeDefined();
      expect(greet?.parameters).toBeDefined();
      expect(greet?.parameters!.length).toBe(2);

      const greetingParam = greet?.parameters!.find((p) => p.name === 'greeting');
      expect(greetingParam?.defaultValue).toBeDefined();
    });

    test('should extract arrow functions', () => {
      const multiply = symbols.find(
        (s) => s.name === 'multiply' && s.type === SymbolType.Function
      );
      expect(multiply).toBeDefined();
      expect(multiply?.parameters).toBeDefined();
      expect(multiply?.parameters!.length).toBe(2);
    });

    test('should extract enums', () => {
      const colorEnum = symbols.find(
        (s) => s.name === 'Color' && s.type === SymbolType.Enum
      );
      expect(colorEnum).toBeDefined();
      expect(colorEnum?.scope).toBe(SymbolScope.Global);
    });
  });

  describe('Python', () => {
    let code: string;
    let symbols: SymbolInfo[];

    beforeAll(() => {
      code = loadFixture('sample.py');
      const result = symbolExtractor.extractSymbols(code, Language.Python);
      symbols = result.symbols;
    });

    test('should extract global constants', () => {
      const apiVersion = symbols.find(
        (s) => s.name === 'API_VERSION' && s.type === SymbolType.Constant
      );
      expect(apiVersion).toBeDefined();
      expect(apiVersion?.scope).toBe(SymbolScope.Global);
    });

    test('should extract classes', () => {
      const animalClass = symbols.find(
        (s) => s.name === 'Animal' && s.type === SymbolType.Class
      );
      expect(animalClass).toBeDefined();
      expect(animalClass?.scope).toBe(SymbolScope.Global);
    });

    test('should extract class with inheritance', () => {
      const dogClass = symbols.find(
        (s) => s.name === 'Dog' && s.type === SymbolType.Class
      );
      expect(dogClass).toBeDefined();
      expect(dogClass?.extends).toContain('Animal');
    });

    test('should extract async functions', () => {
      const fetchUser = symbols.find(
        (s) => s.name === 'fetch_user' && s.type === SymbolType.Function
      );
      expect(fetchUser).toBeDefined();
      expect(fetchUser?.isAsync).toBe(true);
      expect(fetchUser?.parameters).toBeDefined();
      expect(fetchUser?.parameters!.length).toBe(1);
    });

    test('should extract functions with default parameters', () => {
      const greet = symbols.find(
        (s) => s.name === 'greet' && s.type === SymbolType.Function
      );
      expect(greet).toBeDefined();
      expect(greet?.parameters).toBeDefined();
      expect(greet?.parameters!.length).toBe(2);
    });

    test('should extract method definitions', () => {
      const dogClass = symbols.find(
        (s) => s.name === 'Dog' && s.type === SymbolType.Class
      );
      expect(dogClass?.members).toBeDefined();

      const makeSound = dogClass?.members!.find(
        (m) => m.name === 'make_sound' && m.type === SymbolType.Method
      );
      expect(makeSound).toBeDefined();
    });
  });

  describe('Go', () => {
    let code: string;
    let symbols: SymbolInfo[];

    beforeAll(() => {
      code = loadFixture('sample.go');
      const result = symbolExtractor.extractSymbols(code, Language.Go);
      symbols = result.symbols;
    });

    test('should extract global constants', () => {
      const apiVersion = symbols.find(
        (s) => s.name === 'APIVersion' && s.type === SymbolType.Constant
      );
      expect(apiVersion).toBeDefined();
      expect(apiVersion?.scope).toBe(SymbolScope.Global);
    });

    test('should extract struct definitions', () => {
      const userStruct = symbols.find(
        (s) => s.name === 'User' && s.type === SymbolType.Struct
      );
      expect(userStruct).toBeDefined();
      expect(userStruct?.scope).toBe(SymbolScope.Global);
    });

    test('should extract interface definitions', () => {
      const animalInterface = symbols.find(
        (s) => s.name === 'Animal' && s.type === SymbolType.Interface
      );
      expect(animalInterface).toBeDefined();
      expect(animalInterface?.scope).toBe(SymbolScope.Global);
    });

    test('should extract functions', () => {
      const greet = symbols.find(
        (s) => s.name === 'Greet' && s.type === SymbolType.Function
      );
      expect(greet).toBeDefined();
      expect(greet?.parameters).toBeDefined();
    });

    test('should extract methods (receiver functions)', () => {
      const makeSound = symbols.find(
        (s) => s.name === 'MakeSound' && s.type === SymbolType.Method
      );
      expect(makeSound).toBeDefined();
    });

    test('should extract constructor functions', () => {
      const newDog = symbols.find(
        (s) => s.name === 'NewDog' && s.type === SymbolType.Function
      );
      expect(newDog).toBeDefined();
      expect(newDog?.parameters).toBeDefined();
      expect(newDog?.returnType).toBeDefined();
    });
  });

  describe('Arduino (C++)', () => {
    let code: string;
    let symbols: SymbolInfo[];

    beforeAll(() => {
      code = loadFixture('sample.ino');
      const result = symbolExtractor.extractSymbols(code, Language.CPP);
      symbols = result.symbols;
    });

    test('should extract global constants', () => {
      const buttonPin = symbols.find(
        (s) => s.name === 'BUTTON_PIN' && s.type === SymbolType.Constant
      );
      expect(buttonPin).toBeDefined();
      expect(buttonPin?.scope).toBe(SymbolScope.Global);
    });

    test('should extract global variables', () => {
      const ledState = symbols.find(
        (s) => s.name === 'ledState' && s.type === SymbolType.Variable
      );
      expect(ledState).toBeDefined();
      expect(ledState?.scope).toBe(SymbolScope.Global);
    });

    test('should extract class definitions', () => {
      const ledBlinker = symbols.find(
        (s) => s.name === 'LedBlinker' && s.type === SymbolType.Class
      );
      expect(ledBlinker).toBeDefined();
      expect(ledBlinker?.members).toBeDefined();
    });

    test('should extract setup function as Arduino special function', () => {
      const setup = symbols.find(
        (s) => s.name === 'setup' && s.type === SymbolType.Function
      );
      expect(setup).toBeDefined();
      expect(setup?.isArduinoSpecialFunction).toBe(true);
    });

    test('should extract loop function as Arduino special function', () => {
      const loop = symbols.find(
        (s) => s.name === 'loop' && s.type === SymbolType.Function
      );
      expect(loop).toBeDefined();
      expect(loop?.isArduinoSpecialFunction).toBe(true);
    });

    test('should extract regular functions', () => {
      const readButton = symbols.find(
        (s) => s.name === 'readButton' && s.type === SymbolType.Function
      );
      expect(readButton).toBeDefined();
      expect(readButton?.isArduinoSpecialFunction).toBeFalsy();
      expect(readButton?.parameters).toBeDefined();
      expect(readButton?.returnType).toBeDefined();
    });

    test('should extract methods from classes', () => {
      const ledBlinker = symbols.find(
        (s) => s.name === 'LedBlinker' && s.type === SymbolType.Class
      );

      const updateMethod = ledBlinker?.members?.find(
        (m) => m.name === 'update' && m.type === SymbolType.Method
      );
      expect(updateMethod).toBeDefined();
    });
  });

  describe('Error handling', () => {
    test('should handle syntax errors gracefully', () => {
      const invalidCode = 'function broken(';
      const result = symbolExtractor.extractSymbols(
        invalidCode,
        Language.JavaScript
      );

      expect(result.hasError).toBe(true);
      expect(result.symbols).toBeDefined();
    });

    test('should handle empty code', () => {
      const emptyCode = '';
      const result = symbolExtractor.extractSymbols(
        emptyCode,
        Language.TypeScript
      );

      expect(result.symbols).toEqual([]);
      expect(result.hasError).toBe(false);
    });

    test('should handle unknown language', () => {
      const code = 'some code';
      const result = symbolExtractor.extractSymbols(code, Language.Unknown);

      expect(result.symbols).toEqual([]);
      expect(result.hasError).toBe(false);
    });
  });
});

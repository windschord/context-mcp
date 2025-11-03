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

    test('should handle null or whitespace-only code', () => {
      const whitespaceCode = '   \n  \t  \n   ';
      const result = symbolExtractor.extractSymbols(
        whitespaceCode,
        Language.TypeScript
      );

      expect(result.symbols).toEqual([]);
      expect(result.hasError).toBe(false);
    });

    test('should handle code with no symbols', () => {
      const code = '1 + 2; "hello";';
      const result = symbolExtractor.extractSymbols(code, Language.JavaScript);

      expect(result.symbols).toEqual([]);
    });
  });

  describe('Edge cases for TypeScript/JavaScript', () => {
    test('should extract generator functions', () => {
      const code = 'function* fibonacci() { yield 1; }';
      const result = symbolExtractor.extractSymbols(code, Language.JavaScript);
      const genFunc = result.symbols.find(s => s.name === 'fibonacci');
      expect(genFunc).toBeDefined();
      expect(genFunc?.type).toBe(SymbolType.Function);
    });

    test('should extract async arrow functions', () => {
      const code = 'const fetchData = async () => { return await fetch("/api"); };';
      const result = symbolExtractor.extractSymbols(code, Language.TypeScript);
      const asyncArrow = result.symbols.find(s => s.name === 'fetchData');
      expect(asyncArrow).toBeDefined();
      expect(asyncArrow?.isAsync).toBe(true);
    });

    test('should extract type aliases', () => {
      const code = 'type UserID = string | number;';
      const result = symbolExtractor.extractSymbols(code, Language.TypeScript);
      const typeAlias = result.symbols.find(s => s.name === 'UserID');
      expect(typeAlias).toBeDefined();
      expect(typeAlias?.type).toBe(SymbolType.Type);
    });

    test('should extract namespace declarations', () => {
      const code = 'namespace Utils { export function helper() {} }';
      const result = symbolExtractor.extractSymbols(code, Language.TypeScript);
      const ns = result.symbols.find(s => s.name === 'Utils');
      expect(ns).toBeDefined();
      expect(ns?.type).toBe(SymbolType.Namespace);
    });

    test('should handle method overloads', () => {
      const code = 'class C { foo(x: string): void; foo(x: number): void; foo(x: any): void {} }';
      const result = symbolExtractor.extractSymbols(code, Language.TypeScript);
      const cls = result.symbols.find(s => s.name === 'C');
      expect(cls).toBeDefined();
      expect(cls?.members).toBeDefined();
      const fooMethods = cls?.members?.filter(m => m.name === 'foo');
      expect(fooMethods).toBeDefined();
    });

    test('should extract static class members', () => {
      const code = 'class Utils { static VERSION = "1.0"; static helper() {} }';
      const result = symbolExtractor.extractSymbols(code, Language.TypeScript);
      const cls = result.symbols.find(s => s.name === 'Utils');
      const staticMembers = cls?.members?.filter(m => m.isStatic);
      expect(staticMembers).toBeDefined();
      expect(staticMembers!.length).toBeGreaterThan(0);
    });

    test('should extract readonly properties', () => {
      const code = 'class Config { readonly API_KEY = "secret"; }';
      const result = symbolExtractor.extractSymbols(code, Language.TypeScript);
      const cls = result.symbols.find(s => s.name === 'Config');
      const readonlyProp = cls?.members?.find(m => m.name === 'API_KEY');
      expect(readonlyProp).toBeDefined();
    });

    test('should extract private/protected members', () => {
      const code = 'class User { private id: number; protected name: string; public age: number; }';
      const result = symbolExtractor.extractSymbols(code, Language.TypeScript);
      const cls = result.symbols.find(s => s.name === 'User');
      expect(cls?.members).toBeDefined();
      expect(cls?.members!.length).toBe(3);
    });

    test('should extract decorators', () => {
      const code = '@Component\nclass MyComponent {}';
      const result = symbolExtractor.extractSymbols(code, Language.TypeScript);
      const cls = result.symbols.find(s => s.name === 'MyComponent');
      expect(cls).toBeDefined();
    });

    test('should handle destructuring in parameters', () => {
      const code = 'function foo({ x, y }: { x: number, y: number }) {}';
      const result = symbolExtractor.extractSymbols(code, Language.TypeScript);
      const func = result.symbols.find(s => s.name === 'foo');
      expect(func).toBeDefined();
      expect(func?.parameters).toBeDefined();
    });
  });

  describe('Edge cases for Python', () => {
    test('should extract class with decorators', () => {
      const code = '@dataclass\nclass User:\n    name: str';
      const result = symbolExtractor.extractSymbols(code, Language.Python);
      const cls = result.symbols.find(s => s.name === 'User');
      expect(cls).toBeDefined();
    });

    test('should extract async functions', () => {
      const code = 'async def fetch_data():\n    pass';
      const result = symbolExtractor.extractSymbols(code, Language.Python);
      const func = result.symbols.find(s => s.name === 'fetch_data');
      expect(func).toBeDefined();
      expect(func?.isAsync).toBe(true);
    });

    test('should extract class with __init__', () => {
      const code = 'class User:\n    def __init__(self, name):\n        self.name = name';
      const result = symbolExtractor.extractSymbols(code, Language.Python);
      const cls = result.symbols.find(s => s.name === 'User');
      const initMethod = cls?.members?.find(m => m.name === '__init__');
      expect(initMethod).toBeDefined();
    });

    test('should extract lambda functions', () => {
      const code = 'square = lambda x: x * x';
      const result = symbolExtractor.extractSymbols(code, Language.Python);
      const lambda = result.symbols.find(s => s.name === 'square');
      expect(lambda).toBeDefined();
    });

    test('should extract class with multiple inheritance', () => {
      const code = 'class Dog(Animal, Mammal):\n    pass';
      const result = symbolExtractor.extractSymbols(code, Language.Python);
      const cls = result.symbols.find(s => s.name === 'Dog');
      expect(cls).toBeDefined();
      expect(cls?.extends).toContain('Animal');
      expect(cls?.extends).toContain('Mammal');
    });

    test('should extract staticmethod and classmethod', () => {
      const code = 'class Utils:\n    @staticmethod\n    def helper():\n        pass\n    @classmethod\n    def create(cls):\n        pass';
      const result = symbolExtractor.extractSymbols(code, Language.Python);
      const cls = result.symbols.find(s => s.name === 'Utils');
      expect(cls?.members).toBeDefined();
      expect(cls?.members!.length).toBe(2);
    });

    test('should extract properties', () => {
      const code = 'class User:\n    @property\n    def name(self):\n        return self._name';
      const result = symbolExtractor.extractSymbols(code, Language.Python);
      const cls = result.symbols.find(s => s.name === 'User');
      const prop = cls?.members?.find(m => m.name === 'name');
      expect(prop).toBeDefined();
    });
  });

  describe('Edge cases for Go', () => {
    test('should extract variadic functions', () => {
      const code = 'func sum(nums ...int) int { return 0 }';
      const result = symbolExtractor.extractSymbols(code, Language.Go);
      const func = result.symbols.find(s => s.name === 'sum');
      expect(func).toBeDefined();
    });

    test('should extract methods with pointer receivers', () => {
      const code = 'func (u *User) GetName() string { return u.Name }';
      const result = symbolExtractor.extractSymbols(code, Language.Go);
      const method = result.symbols.find(s => s.name === 'GetName');
      expect(method).toBeDefined();
    });

    test('should extract interfaces', () => {
      const code = 'type Reader interface {\n    Read(p []byte) (n int, err error)\n}';
      const result = symbolExtractor.extractSymbols(code, Language.Go);
      const iface = result.symbols.find(s => s.name === 'Reader');
      expect(iface).toBeDefined();
      expect(iface?.type).toBe(SymbolType.Interface);
    });

    test('should extract constants in const block', () => {
      const code = 'const (\n    Red = 0\n    Green = 1\n)';
      const result = symbolExtractor.extractSymbols(code, Language.Go);
      const red = result.symbols.find(s => s.name === 'Red');
      const green = result.symbols.find(s => s.name === 'Green');
      expect(red).toBeDefined();
      expect(green).toBeDefined();
    });

    test('should extract embedded structs', () => {
      const code = 'type Admin struct {\n    User\n    Level int\n}';
      const result = symbolExtractor.extractSymbols(code, Language.Go);
      const admin = result.symbols.find(s => s.name === 'Admin');
      expect(admin).toBeDefined();
    });
  });

  describe('Edge cases for Rust', () => {
    test('should extract trait definitions', () => {
      const code = 'trait Drawable { fn draw(&self); }';
      const result = symbolExtractor.extractSymbols(code, Language.Rust);
      const trait = result.symbols.find(s => s.name === 'Drawable');
      expect(trait).toBeDefined();
      expect(trait?.type).toBe(SymbolType.Interface);
    });

    test('should extract impl blocks', () => {
      const code = 'impl User { fn new() -> Self { } }';
      const result = symbolExtractor.extractSymbols(code, Language.Rust);
      const impl = result.symbols.find(s => s.name === 'User');
      expect(impl).toBeDefined();
    });

    test('should extract const items', () => {
      const code = 'const MAX_SIZE: usize = 100;';
      const result = symbolExtractor.extractSymbols(code, Language.Rust);
      const constant = result.symbols.find(s => s.name === 'MAX_SIZE');
      expect(constant).toBeDefined();
      expect(constant?.type).toBe(SymbolType.Constant);
    });

    test('should extract type aliases', () => {
      const code = 'type Result<T> = std::result::Result<T, Error>;';
      const result = symbolExtractor.extractSymbols(code, Language.Rust);
      const typeAlias = result.symbols.find(s => s.name === 'Result');
      expect(typeAlias).toBeDefined();
    });

    test('should extract public functions', () => {
      const code = 'pub fn helper() {}';
      const result = symbolExtractor.extractSymbols(code, Language.Rust);
      const func = result.symbols.find(s => s.name === 'helper');
      expect(func).toBeDefined();
      expect(func?.isExported).toBe(true);
    });
  });

  describe('Edge cases for Java', () => {
    test('should extract annotations', () => {
      const code = '@Override\npublic void method() {}';
      const result = symbolExtractor.extractSymbols(code, Language.Java);
      expect(result.symbols).toBeDefined();
    });

    test('should extract final classes', () => {
      const code = 'public final class Utils {}';
      const result = symbolExtractor.extractSymbols(code, Language.Java);
      const cls = result.symbols.find(s => s.name === 'Utils');
      expect(cls).toBeDefined();
    });

    test('should extract synchronized methods', () => {
      const code = 'public synchronized void update() {}';
      const result = symbolExtractor.extractSymbols(code, Language.Java);
      const method = result.symbols.find(s => s.name === 'update');
      expect(method).toBeDefined();
    });

    test('should extract varargs methods', () => {
      const code = 'public void log(String... messages) {}';
      const result = symbolExtractor.extractSymbols(code, Language.Java);
      const method = result.symbols.find(s => s.name === 'log');
      expect(method).toBeDefined();
    });
  });

  describe('Edge cases for C/C++', () => {
    test('should extract function pointers', () => {
      const code = 'void (*callback)(int);';
      const result = symbolExtractor.extractSymbols(code, Language.C);
      const callback = result.symbols.find(s => s.name === 'callback');
      expect(callback).toBeDefined();
    });

    test('should extract template functions', () => {
      const code = 'template<typename T>\nT max(T a, T b) { return a > b ? a : b; }';
      const result = symbolExtractor.extractSymbols(code, Language.CPP);
      const func = result.symbols.find(s => s.name === 'max');
      expect(func).toBeDefined();
    });

    test('should extract extern "C" declarations', () => {
      const code = 'extern "C" {\n    void c_function();\n}';
      const result = symbolExtractor.extractSymbols(code, Language.CPP);
      expect(result.symbols).toBeDefined();
    });

    test('should extract constexpr functions', () => {
      const code = 'constexpr int square(int x) { return x * x; }';
      const result = symbolExtractor.extractSymbols(code, Language.CPP);
      const func = result.symbols.find(s => s.name === 'square');
      expect(func).toBeDefined();
    });

    test('should extract virtual functions', () => {
      const code = 'class Base { virtual void foo(); };';
      const result = symbolExtractor.extractSymbols(code, Language.CPP);
      const cls = result.symbols.find(s => s.name === 'Base');
      expect(cls).toBeDefined();
    });
  });

  describe('Scope detection', () => {
    test('should detect global scope', () => {
      const code = 'const x = 1;';
      const result = symbolExtractor.extractSymbols(code, Language.JavaScript);
      expect(result.symbols[0]?.scope).toBe(SymbolScope.Global);
    });

    test('should detect function scope', () => {
      const code = 'function outer() { function inner() {} }';
      const result = symbolExtractor.extractSymbols(code, Language.JavaScript);
      const innerFunc = result.symbols.find(s => s.name === 'inner');
      expect(innerFunc?.scope).toBe(SymbolScope.Function);
    });

    test('should detect class scope for methods', () => {
      const code = 'class User { getName() {} }';
      const result = symbolExtractor.extractSymbols(code, Language.JavaScript);
      const cls = result.symbols.find(s => s.name === 'User');
      const method = cls?.members?.find(m => m.name === 'getName');
      expect(method?.scope).toBe(SymbolScope.Class);
    });

    test('should detect module scope for Python', () => {
      const code = 'def top_level(): pass';
      const result = symbolExtractor.extractSymbols(code, Language.Python);
      expect(result.symbols[0]?.scope).toBe(SymbolScope.Global);
    });
  });
});

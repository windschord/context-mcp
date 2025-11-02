import { describe, test, expect } from '@jest/globals';
import { PlatformIOParser } from '../../src/parser/platformio-parser.js';

describe('PlatformIOParser', () => {
  const parser = new PlatformIOParser();

  describe('platformio.ini parsing', () => {
    test('should parse basic platformio.ini file', () => {
      const iniContent = `
[env:uno]
platform = atmelavr
board = uno
framework = arduino

[env:esp32]
platform = espressif32
board = esp32dev
framework = arduino
`;
      const result = parser.parse(iniContent);
      expect(result).toBeDefined();
      expect(result.environments).toHaveLength(2);
      expect(result.environments[0].name).toBe('uno');
      expect(result.environments[1].name).toBe('esp32');
    });

    test('should extract platform information', () => {
      const iniContent = `
[env:mega]
platform = atmelavr
board = megaatmega2560
framework = arduino
`;
      const result = parser.parse(iniContent);
      expect(result.environments[0].platform).toBe('atmelavr');
      expect(result.environments[0].board).toBe('megaatmega2560');
      expect(result.environments[0].framework).toBe('arduino');
    });

    test('should handle build flags', () => {
      const iniContent = `
[env:debug]
platform = espressif32
board = esp32dev
framework = arduino
build_flags = -DDEBUG_MODE -DLOG_LEVEL=3
`;
      const result = parser.parse(iniContent);
      expect(result.environments[0].buildFlags).toContain('-DDEBUG_MODE');
      expect(result.environments[0].buildFlags).toContain('-DLOG_LEVEL=3');
    });

    test('should parse lib_deps', () => {
      const iniContent = `
[env:test]
platform = atmelavr
board = uno
lib_deps =
  Adafruit GFX Library
  Adafruit SSD1306
  Wire
`;
      const result = parser.parse(iniContent);
      expect(result.environments[0].libDeps).toBeDefined();
      expect(result.environments[0].libDeps).toContain('Adafruit GFX Library');
      expect(result.environments[0].libDeps).toContain('Adafruit SSD1306');
    });

    test('should handle empty or invalid content', () => {
      expect(() => parser.parse('')).not.toThrow();
      expect(() => parser.parse('invalid content')).not.toThrow();
    });

    test('should parse common section', () => {
      const iniContent = `
[common]
lib_deps_builtin =
  SPI
  Wire

[env:uno]
platform = atmelavr
board = uno
lib_deps =
  \${common.lib_deps_builtin}
  Adafruit GFX Library
`;
      const result = parser.parse(iniContent);
      expect(result.common).toBeDefined();
      expect(result.common.lib_deps_builtin).toContain('SPI');
    });
  });

  describe('error handling', () => {
    test('should handle malformed INI syntax', () => {
      const malformed = `
[env:broken
platform = test
[[[invalid]]]
`;
      expect(() => parser.parse(malformed)).not.toThrow();
    });

    test('should provide error information for invalid syntax', () => {
      const invalid = 'this is not ini format at all';
      const result = parser.parse(invalid);
      expect(result.errors).toBeDefined();
      if (result.errors && result.errors.length > 0) {
        expect(result.errors[0].severity).toBe('warning');
      }
    });
  });
});

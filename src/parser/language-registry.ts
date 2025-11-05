/**
 * Language Registry for Tree-sitter parsers
 *
 * This class manages Tree-sitter language objects for each supported language.
 * It uses a singleton pattern to ensure language objects are loaded only once.
 */

import TypeScript from 'tree-sitter-typescript';
import Python from 'tree-sitter-python';
import Go from 'tree-sitter-go';
import Rust from 'tree-sitter-rust';
import Java from 'tree-sitter-java';
import Cpp from 'tree-sitter-cpp';
import { Language } from './types.js';

/**
 * LanguageRegistry singleton class
 */
export class LanguageRegistry {
  private static instance: LanguageRegistry;
  private languageMap: Map<Language, any> = new Map();

  private constructor() {
    this.initializeLanguages();
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): LanguageRegistry {
    if (!LanguageRegistry.instance) {
      LanguageRegistry.instance = new LanguageRegistry();
    }
    return LanguageRegistry.instance;
  }

  /**
   * Initialize all supported languages
   */
  private initializeLanguages(): void {
    // TypeScript/JavaScript uses the .typescript/.tsx sub-properties
    this.languageMap.set(Language.TypeScript, TypeScript.typescript);
    this.languageMap.set(Language.JavaScript, TypeScript.typescript); // Use typescript for both TS and JS

    // Other languages
    this.languageMap.set(Language.Python, Python);
    this.languageMap.set(Language.Go, Go);
    this.languageMap.set(Language.Rust, Rust);
    this.languageMap.set(Language.Java, Java);
    this.languageMap.set(Language.C, Cpp);
    this.languageMap.set(Language.CPP, Cpp);
  }

  /**
   * Get the Tree-sitter language object for the specified language
   */
  getLanguageForParser(language: Language): any {
    const tsLanguage = this.languageMap.get(language);
    if (!tsLanguage) {
      throw new Error(`No Tree-sitter language found for: ${language}`);
    }
    return tsLanguage;
  }

  /**
   * Check if a language is supported
   */
  isSupported(language: Language): boolean {
    return this.languageMap.has(language);
  }
}

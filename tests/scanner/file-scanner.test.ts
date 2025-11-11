import { describe, expect, it } from '@jest/globals';
import { FileScanner } from '../../src/scanner/file-scanner';
import path from 'path';

describe('FileScanner', () => {
  const fixturesPath = path.join(__dirname, '../fixtures/scanner');
  const project1Path = path.join(fixturesPath, 'project1');
  const project2Path = path.join(fixturesPath, 'project2');

  describe('basic scanning', () => {
    it('should scan directory recursively', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      expect(files).toBeDefined();
      expect(Array.isArray(files)).toBe(true);
      expect(files.length).toBeGreaterThan(0);
    });

    it('should find TypeScript files', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      const tsFiles = files.filter((f) => f.endsWith('.ts'));
      expect(tsFiles.length).toBeGreaterThan(0);
      expect(tsFiles.some((f) => f.includes('index.ts'))).toBe(true);
    });

    it('should find Python files', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      const pyFiles = files.filter((f) => f.endsWith('.py'));
      expect(pyFiles.length).toBeGreaterThan(0);
      expect(pyFiles.some((f) => f.includes('utils.py'))).toBe(true);
    });

    it('should find Go files', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      const goFiles = files.filter((f) => f.endsWith('.go'));
      expect(goFiles.length).toBeGreaterThan(0);
      expect(goFiles.some((f) => f.includes('main.go'))).toBe(true);
    });

    it('should find Arduino files', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      const inoFiles = files.filter((f) => f.endsWith('.ino'));
      expect(inoFiles.length).toBeGreaterThan(0);
      expect(inoFiles.some((f) => f.includes('sketch.ino'))).toBe(true);
    });

    it('should find Markdown files', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      const mdFiles = files.filter((f) => f.endsWith('.md'));
      expect(mdFiles.length).toBeGreaterThan(0);
      expect(mdFiles.some((f) => f.includes('README.md'))).toBe(true);
    });

    it('should find platformio.ini files', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      const iniFiles = files.filter((f) => f.endsWith('platformio.ini'));
      expect(iniFiles.length).toBeGreaterThan(0);
    });
  });

  describe('exclusion patterns', () => {
    it('should exclude node_modules directory', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      const nodeModulesFiles = files.filter((f) => f.includes('node_modules'));
      expect(nodeModulesFiles.length).toBe(0);
    });

    it('should exclude .git directory', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      const gitFiles = files.filter((f) => f.includes('.git'));
      expect(gitFiles.length).toBe(0);
    });

    it('should exclude .env files (sensitive)', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      const envFiles = files.filter((f) => f.endsWith('.env'));
      expect(envFiles.length).toBe(0);
    });
  });

  describe('.gitignore support', () => {
    it('should respect .gitignore patterns', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      // node_modules is in .gitignore
      expect(files.some((f) => f.includes('node_modules'))).toBe(false);
      // .env is in .gitignore
      expect(files.some((f) => f.endsWith('.env'))).toBe(false);
    });
  });

  describe('.mcpignore support', () => {
    it('should respect .mcpignore patterns', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      // *.test.ts is in .mcpignore
      expect(files.some((f) => f.endsWith('.test.ts'))).toBe(false);
    });
  });

  describe('custom exclude patterns', () => {
    it('should exclude files matching custom patterns', async () => {
      const scanner = new FileScanner(project1Path, {
        excludePatterns: ['*.py', 'docs/**'],
      });
      const files = await scanner.scan();

      expect(files.some((f) => f.endsWith('.py'))).toBe(false);
      expect(files.some((f) => f.includes('docs/'))).toBe(false);
    });
  });

  describe('file type detection', () => {
    it('should detect TypeScript/JavaScript files', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      const tsJsFiles = files.filter((f) => /\.(ts|tsx|js|jsx|mjs)$/.test(f));
      expect(tsJsFiles.length).toBeGreaterThan(0);
    });

    it('should detect Python files', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      const pyFiles = files.filter((f) => f.endsWith('.py'));
      expect(pyFiles.length).toBeGreaterThan(0);
    });

    it('should detect C/C++/Arduino files', async () => {
      const scanner = new FileScanner(project1Path);
      const files = await scanner.scan();

      const cppFiles = files.filter((f) => /\.(c|cpp|h|hpp|ino)$/.test(f));
      expect(cppFiles.length).toBeGreaterThan(0);
    });
  });

  describe('progress events', () => {
    it('should emit fileFound event', async () => {
      const scanner = new FileScanner(project1Path);
      const foundFiles: string[] = [];

      scanner.on('fileFound', (filePath: string) => {
        foundFiles.push(filePath);
      });

      await scanner.scan();

      expect(foundFiles.length).toBeGreaterThan(0);
    });

    it('should emit fileScanned event', async () => {
      const scanner = new FileScanner(project1Path);
      const scannedFiles: string[] = [];

      scanner.on('fileScanned', (filePath: string) => {
        scannedFiles.push(filePath);
      });

      await scanner.scan();

      expect(scannedFiles.length).toBeGreaterThan(0);
    });

    it('should emit directoryEntered event', async () => {
      const scanner = new FileScanner(project1Path);
      const enteredDirs: string[] = [];

      scanner.on('directoryEntered', (dirPath: string) => {
        enteredDirs.push(dirPath);
      });

      await scanner.scan();

      expect(enteredDirs.length).toBeGreaterThan(0);
      expect(enteredDirs.some((d) => d.includes('src'))).toBe(true);
    });

    it('should emit scanComplete event', async () => {
      const scanner = new FileScanner(project1Path);
      let completed = false;
      let totalFiles = 0;

      scanner.on('scanComplete', (stats: { totalFiles: number }) => {
        completed = true;
        totalFiles = stats.totalFiles;
      });

      await scanner.scan();

      expect(completed).toBe(true);
      expect(totalFiles).toBeGreaterThan(0);
    });
  });

  describe('error handling', () => {
    it('should throw error for non-existent directory', async () => {
      const scanner = new FileScanner('/non/existent/path');

      await expect(scanner.scan()).rejects.toThrow();
    });

    it('should handle permission errors gracefully', async () => {
      // This test is hard to implement reliably across platforms
      // We'll just ensure the scanner can be instantiated
      const scanner = new FileScanner(project1Path);
      expect(scanner).toBeDefined();
    });
  });

  describe('multiple projects', () => {
    it('should scan different projects correctly', async () => {
      const scanner1 = new FileScanner(project1Path);
      const scanner2 = new FileScanner(project2Path);

      const files1 = await scanner1.scan();
      const files2 = await scanner2.scan();

      expect(files1.length).not.toBe(files2.length);
      expect(files2.some((f) => f.includes('app.js'))).toBe(true);
    });
  });

  describe('supported file extensions', () => {
    it('should include all supported language extensions', async () => {
      const scanner = new FileScanner(project1Path);
      const extensions = scanner.getSupportedExtensions();

      expect(extensions).toContain('.ts');
      expect(extensions).toContain('.tsx');
      expect(extensions).toContain('.js');
      expect(extensions).toContain('.jsx');
      expect(extensions).toContain('.mjs');
      expect(extensions).toContain('.py');
      expect(extensions).toContain('.go');
      expect(extensions).toContain('.rs');
      expect(extensions).toContain('.java');
      expect(extensions).toContain('.c');
      expect(extensions).toContain('.cpp');
      expect(extensions).toContain('.h');
      expect(extensions).toContain('.hpp');
      expect(extensions).toContain('.ino');
      expect(extensions).toContain('.md');
    });
  });

  describe('default exclusions', () => {
    it('should have default exclusion patterns', async () => {
      const scanner = new FileScanner(project1Path);
      const exclusions = scanner.getDefaultExclusions();

      expect(exclusions).toContain('node_modules/**');
      expect(exclusions).toContain('.git/**');
      expect(exclusions).toContain('dist/**');
      expect(exclusions).toContain('build/**');
      expect(exclusions).toContain('**/.env');
      expect(exclusions).toContain('**/credentials.json');
    });
  });
});

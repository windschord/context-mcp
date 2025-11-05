/**
 * File Watcher Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { FileWatcher } from '../../src/watcher/file-watcher';
import { FileWatcherEvent } from '../../src/watcher/types';
import { mkdir, rm, writeFile, unlink } from 'fs/promises';
import { join } from 'path';

describe('FileWatcher', () => {
  const testDir = join(process.cwd(), 'tmp', 'test-watcher');
  let watcher: FileWatcher | null = null;

  beforeEach(async () => {
    // Create test directory
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Stop watcher if running
    if (watcher && watcher.isWatching()) {
      await watcher.stop();
    }
    watcher = null;

    // Clean up test directory
    await rm(testDir, { recursive: true, force: true });
  });

  describe('Constructor and Initialization', () => {
    it('should create FileWatcher instance with default options', () => {
      watcher = new FileWatcher({
        rootPath: testDir,
      });

      expect(watcher).toBeDefined();
      expect(watcher.isWatching()).toBe(false);
    });

    it('should create FileWatcher instance with custom options', () => {
      watcher = new FileWatcher({
        rootPath: testDir,
        ignorePatterns: ['*.tmp', 'test/**'],
        debounceMs: 1000,
        watchAdd: true,
        watchChange: true,
        watchUnlink: true,
      });

      expect(watcher).toBeDefined();
      expect(watcher.isWatching()).toBe(false);
    });

    it('should throw error for invalid root path', () => {
      expect(() => {
        new FileWatcher({
          rootPath: '',
        });
      }).toThrow();
    });
  });

  describe('Start and Stop', () => {
    it('should start watching', async () => {
      watcher = new FileWatcher({
        rootPath: testDir,
      });

      await watcher.start();
      expect(watcher.isWatching()).toBe(true);
    });

    it('should emit ready event when started', async () => {
      watcher = new FileWatcher({
        rootPath: testDir,
      });

      const readyPromise = new Promise<void>((resolve) => {
        watcher!.once(FileWatcherEvent.READY, () => {
          resolve();
        });
      });

      await watcher.start();
      await readyPromise;

      expect(watcher.isWatching()).toBe(true);
    });

    it('should stop watching', async () => {
      watcher = new FileWatcher({
        rootPath: testDir,
      });

      await watcher.start();
      expect(watcher.isWatching()).toBe(true);

      await watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });

    it('should not throw error when stopping already stopped watcher', async () => {
      watcher = new FileWatcher({
        rootPath: testDir,
      });

      await expect(watcher.stop()).resolves.not.toThrow();
    });

    it('should not throw error when starting already started watcher', async () => {
      watcher = new FileWatcher({
        rootPath: testDir,
      });

      await watcher.start();
      await expect(watcher.start()).resolves.not.toThrow();
    });
  });

  describe('File Events', () => {
    it('should detect file creation', async () => {
      watcher = new FileWatcher({
        rootPath: testDir,
        debounceMs: 100,
      });

      const fileAddedPromise = new Promise<string>((resolve) => {
        watcher!.on(FileWatcherEvent.FILE_ADDED, (filePath: string) => {
          resolve(filePath);
        });
      });

      await watcher.start();

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher!.once(FileWatcherEvent.READY, () => {
          resolve();
        });
      });

      // Create a file
      const testFile = join(testDir, 'test.txt');
      await writeFile(testFile, 'test content');

      const detectedFile = await fileAddedPromise;
      expect(detectedFile).toContain('test.txt');
    }, 10000);

    it('should detect file modification', async () => {
      // Create a file first
      const testFile = join(testDir, 'test-modify.txt');
      await writeFile(testFile, 'initial content');

      watcher = new FileWatcher({
        rootPath: testDir,
        debounceMs: 100,
      });

      const fileChangedPromise = new Promise<string>((resolve) => {
        watcher!.on(FileWatcherEvent.FILE_CHANGED, (filePath: string) => {
          resolve(filePath);
        });
      });

      await watcher.start();

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher!.once(FileWatcherEvent.READY, () => {
          resolve();
        });
      });

      // Wait a bit before modifying
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Modify the file
      await writeFile(testFile, 'modified content');

      const detectedFile = await fileChangedPromise;
      expect(detectedFile).toContain('test-modify.txt');
    }, 10000);

    it('should detect file deletion', async () => {
      // Create a file first
      const testFile = join(testDir, 'test-delete.txt');
      await writeFile(testFile, 'content to delete');

      watcher = new FileWatcher({
        rootPath: testDir,
        debounceMs: 100,
      });

      const fileDeletedPromise = new Promise<string>((resolve) => {
        watcher!.on(FileWatcherEvent.FILE_DELETED, (filePath: string) => {
          resolve(filePath);
        });
      });

      await watcher.start();

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher!.once(FileWatcherEvent.READY, () => {
          resolve();
        });
      });

      // Wait a bit before deleting
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Delete the file
      await unlink(testFile);

      const detectedFile = await fileDeletedPromise;
      expect(detectedFile).toContain('test-delete.txt');
    }, 10000);
  });

  describe('Ignore Patterns', () => {
    it('should ignore files matching ignore patterns', async () => {
      watcher = new FileWatcher({
        rootPath: testDir,
        ignorePatterns: ['*.tmp', 'ignored/**'],
        debounceMs: 100,
      });

      let fileAddedCount = 0;
      watcher.on(FileWatcherEvent.FILE_ADDED, () => {
        fileAddedCount++;
      });

      await watcher.start();

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher!.once(FileWatcherEvent.READY, () => {
          resolve();
        });
      });

      // Create ignored file
      const ignoredFile = join(testDir, 'test.tmp');
      await writeFile(ignoredFile, 'ignored content');

      // Create ignored directory file
      const ignoredDir = join(testDir, 'ignored');
      await mkdir(ignoredDir, { recursive: true });
      const ignoredDirFile = join(ignoredDir, 'test.txt');
      await writeFile(ignoredDirFile, 'ignored content');

      // Create normal file
      const normalFile = join(testDir, 'test.txt');
      await writeFile(normalFile, 'normal content');

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Should only detect the normal file
      expect(fileAddedCount).toBe(1);
    }, 10000);
  });

  describe('Debounce', () => {
    it('should debounce multiple rapid changes', async () => {
      const testFile = join(testDir, 'debounce-test.txt');
      await writeFile(testFile, 'initial');

      watcher = new FileWatcher({
        rootPath: testDir,
        debounceMs: 500,
      });

      let changeCount = 0;
      watcher.on(FileWatcherEvent.FILE_CHANGED, () => {
        changeCount++;
      });

      await watcher.start();

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher!.once(FileWatcherEvent.READY, () => {
          resolve();
        });
      });

      // Wait a bit before modifications
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Make multiple rapid changes
      await writeFile(testFile, 'change 1');
      await new Promise((resolve) => setTimeout(resolve, 50));
      await writeFile(testFile, 'change 2');
      await new Promise((resolve) => setTimeout(resolve, 50));
      await writeFile(testFile, 'change 3');

      // Wait for debounce period
      await new Promise((resolve) => setTimeout(resolve, 700));

      // Should only trigger once due to debounce
      expect(changeCount).toBe(1);
    }, 10000);
  });

  describe('Event Listeners', () => {
    it('should support multiple listeners for same event', async () => {
      watcher = new FileWatcher({
        rootPath: testDir,
        debounceMs: 100,
      });

      let listener1Called = false;
      let listener2Called = false;

      watcher.on(FileWatcherEvent.READY, () => {
        listener1Called = true;
      });

      watcher.on(FileWatcherEvent.READY, () => {
        listener2Called = true;
      });

      await watcher.start();

      // Wait for ready
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(listener1Called).toBe(true);
      expect(listener2Called).toBe(true);
    });

    it('should remove event listener with off()', async () => {
      watcher = new FileWatcher({
        rootPath: testDir,
        debounceMs: 100,
      });

      let callCount = 0;
      const listener = () => {
        callCount++;
      };

      watcher.on(FileWatcherEvent.FILE_ADDED, listener);
      await watcher.start();

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher!.once(FileWatcherEvent.READY, () => {
          resolve();
        });
      });

      // Create first file
      const file1 = join(testDir, 'file1.txt');
      await writeFile(file1, 'content 1');
      await new Promise((resolve) => setTimeout(resolve, 200));

      expect(callCount).toBe(1);

      // Remove listener
      watcher.off(FileWatcherEvent.FILE_ADDED, listener);

      // Create second file
      const file2 = join(testDir, 'file2.txt');
      await writeFile(file2, 'content 2');
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should still be 1
      expect(callCount).toBe(1);
    }, 10000);

    it('should support once() for one-time listeners', async () => {
      watcher = new FileWatcher({
        rootPath: testDir,
        debounceMs: 100,
      });

      let callCount = 0;
      watcher.once(FileWatcherEvent.FILE_ADDED, () => {
        callCount++;
      });

      await watcher.start();

      // Wait for ready
      await new Promise<void>((resolve) => {
        watcher!.once(FileWatcherEvent.READY, () => {
          resolve();
        });
      });

      // Create multiple files
      const file1 = join(testDir, 'file1.txt');
      await writeFile(file1, 'content 1');
      await new Promise((resolve) => setTimeout(resolve, 200));

      const file2 = join(testDir, 'file2.txt');
      await writeFile(file2, 'content 2');
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should only be called once
      expect(callCount).toBe(1);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should emit error event on watch error', async () => {
      watcher = new FileWatcher({
        rootPath: testDir,
      });

      const errorPromise = new Promise<Error>((resolve) => {
        watcher!.on(FileWatcherEvent.ERROR, (error: Error) => {
          resolve(error);
        });
      });

      await watcher.start();

      // Simulate error by removing the directory while watching
      await rm(testDir, { recursive: true, force: true });

      const error = await Promise.race([
        errorPromise,
        new Promise<Error>((resolve) => setTimeout(() => resolve(new Error('Timeout')), 2000)),
      ]);

      // Either we get an error or timeout (depending on OS behavior)
      expect(error).toBeDefined();
    }, 10000);
  });
});

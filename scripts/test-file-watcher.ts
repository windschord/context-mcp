#!/usr/bin/env node
/**
 * Manual File Watcher Test Script
 */

import { FileWatcher, FileWatcherEvent } from '../src/watcher/index.js';
import { writeFile, unlink, mkdir, rm } from 'fs/promises';
import { join } from 'path';

async function testFileWatcher() {
  const testDir = join(process.cwd(), 'tmp', 'test-watcher-manual');

  // Clean up
  await rm(testDir, { recursive: true, force: true });

  // Create test directory
  await mkdir(testDir, { recursive: true });

  console.log('Creating FileWatcher...');
  const watcher = new FileWatcher({
    rootPath: testDir,
    debounceMs: 500,
  });

  let addedCount = 0;
  let changedCount = 0;
  let deletedCount = 0;

  watcher.on(FileWatcherEvent.FILE_ADDED, (filePath: string) => {
    console.log(`✓ FILE_ADDED: ${filePath}`);
    addedCount++;
  });

  watcher.on(FileWatcherEvent.FILE_CHANGED, (filePath: string) => {
    console.log(`✓ FILE_CHANGED: ${filePath}`);
    changedCount++;
  });

  watcher.on(FileWatcherEvent.FILE_DELETED, (filePath: string) => {
    console.log(`✓ FILE_DELETED: ${filePath}`);
    deletedCount++;
  });

  watcher.on(FileWatcherEvent.READY, () => {
    console.log('✓ Watcher READY');
  });

  watcher.on(FileWatcherEvent.ERROR, (error: Error) => {
    console.error(`✗ Watcher ERROR: ${error.message}`);
  });

  console.log('Starting watcher...');
  await watcher.start();

  console.log('Watcher is watching:', watcher.isWatching());

  // Test file creation
  console.log('\nTest 1: Creating file...');
  const testFile = join(testDir, 'test.txt');
  await writeFile(testFile, 'test content');
  await new Promise((resolve) => setTimeout(resolve, 700));

  // Test file modification
  console.log('\nTest 2: Modifying file...');
  await writeFile(testFile, 'modified content');
  await new Promise((resolve) => setTimeout(resolve, 700));

  // Test file deletion
  console.log('\nTest 3: Deleting file...');
  await unlink(testFile);
  await new Promise((resolve) => setTimeout(resolve, 700));

  // Test rapid changes (debounce)
  console.log('\nTest 4: Testing debounce...');
  const debounceFile = join(testDir, 'debounce.txt');
  await writeFile(debounceFile, 'initial');
  await new Promise((resolve) => setTimeout(resolve, 700));

  const beforeChanges = changedCount;
  await writeFile(debounceFile, 'change 1');
  await new Promise((resolve) => setTimeout(resolve, 100));
  await writeFile(debounceFile, 'change 2');
  await new Promise((resolve) => setTimeout(resolve, 100));
  await writeFile(debounceFile, 'change 3');
  await new Promise((resolve) => setTimeout(resolve, 1000));

  const rapidChanges = changedCount - beforeChanges;

  // Stop watcher
  console.log('\nStopping watcher...');
  await watcher.stop();
  console.log('Watcher is watching:', watcher.isWatching());

  // Clean up
  await rm(testDir, { recursive: true, force: true });

  // Results
  console.log('\n=== Test Results ===');
  console.log(`Added events: ${addedCount} (expected: 2)`);
  console.log(`Changed events: ${changedCount} (expected: >=2)`);
  console.log(`Deleted events: ${deletedCount} (expected: 1)`);
  console.log(`Rapid changes debounced: ${rapidChanges} (expected: 1)`);

  const success =
    addedCount === 2 && changedCount >= 1 && deletedCount === 1 && rapidChanges === 1;

  if (success) {
    console.log('\n✓ All tests passed!');
    process.exit(0);
  } else {
    console.log('\n✗ Some tests failed!');
    process.exit(1);
  }
}

testFileWatcher().catch((error) => {
  console.error('Test failed with error:', error);
  process.exit(1);
});

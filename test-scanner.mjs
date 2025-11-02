import { FileScanner } from './dist/scanner/file-scanner.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturesPath = path.join(__dirname, 'tests/fixtures/scanner');
const project1Path = path.join(fixturesPath, 'project1');

console.log('Testing FileScanner...');
console.log('Root path:', project1Path);
console.log('');

const scanner = new FileScanner(project1Path);

scanner.on('directoryEntered', (dirPath) => {
  console.log('[DIR]', path.relative(project1Path, dirPath) || '.');
});

scanner.on('fileFound', (filePath) => {
  console.log('[FOUND]', path.relative(project1Path, filePath));
});

scanner.on('fileScanned', (filePath) => {
  console.log('[SCAN]', path.relative(project1Path, filePath));
});

scanner.on('scanComplete', (stats) => {
  console.log('');
  console.log('=== Scan Complete ===');
  console.log('Total files:', stats.totalFiles);
  console.log('Excluded files:', stats.excludedFiles);
  console.log('Duration:', stats.duration, 'ms');
});

try {
  const files = await scanner.scan();
  console.log('');
  console.log('=== Results ===');
  console.log('Files found:');
  files.forEach(f => {
    console.log(' -', path.relative(project1Path, f));
  });

  // 検証
  console.log('');
  console.log('=== Verification ===');
  const hasTS = files.some(f => f.endsWith('.ts'));
  const hasPY = files.some(f => f.endsWith('.py'));
  const hasGO = files.some(f => f.endsWith('.go'));
  const hasINO = files.some(f => f.endsWith('.ino'));
  const hasMD = files.some(f => f.endsWith('.md'));
  const hasEnv = files.some(f => f.endsWith('.env'));
  const hasNodeModules = files.some(f => f.includes('node_modules'));

  console.log('Has TypeScript files:', hasTS);
  console.log('Has Python files:', hasPY);
  console.log('Has Go files:', hasGO);
  console.log('Has Arduino files:', hasINO);
  console.log('Has Markdown files:', hasMD);
  console.log('Has .env files (should be false):', hasEnv);
  console.log('Has node_modules files (should be false):', hasNodeModules);

  if (hasTS && hasPY && hasGO && hasINO && hasMD && !hasEnv && !hasNodeModules) {
    console.log('');
    console.log('✓ All tests passed!');
    process.exit(0);
  } else {
    console.log('');
    console.log('✗ Some tests failed!');
    process.exit(1);
  }
} catch (error) {
  console.error('Error:', error.message);
  process.exit(1);
}

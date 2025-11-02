/**
 * LocalEmbeddingEngineの簡易動作確認スクリプト
 *
 * 使い方:
 *   npx tsx examples/test-local-embedding.ts
 */

import { LocalEmbeddingEngine } from '../src/embedding';
import * as path from 'path';

async function main() {
  console.log('=== LocalEmbeddingEngine Test ===\n');

  const cacheDir = path.join(process.cwd(), './tmp/.test-models');
  const engine = new LocalEmbeddingEngine({
    modelName: 'Xenova/all-MiniLM-L6-v2',
    cacheDir,
    batchSize: 4,
  });

  try {
    // 初期化
    console.log('1. Initializing engine...');
    await engine.initialize();
    console.log('   ✓ Initialized successfully');
    console.log(`   Dimension: ${engine.getDimension()}\n`);

    // 単一埋め込み
    console.log('2. Testing single embedding...');
    const text1 = 'Hello, world!';
    const vector1 = await engine.embed(text1);
    console.log(`   Text: "${text1}"`);
    console.log(`   Vector length: ${vector1.length}`);
    console.log(`   First 5 values: ${vector1.slice(0, 5).map((v) => v.toFixed(4)).join(', ')}\n`);

    // 類似性確認
    console.log('3. Testing similarity...');
    const text2 = 'Hello, world!';
    const text3 = 'Goodbye, world!';
    const vector2 = await engine.embed(text2);
    const vector3 = await engine.embed(text3);

    const similarity12 = cosineSimilarity(vector1, vector2);
    const similarity13 = cosineSimilarity(vector1, vector3);

    console.log(`   "${text1}" vs "${text2}": ${similarity12.toFixed(4)} (should be ~1.0)`);
    console.log(`   "${text1}" vs "${text3}": ${similarity13.toFixed(4)} (should be <1.0)\n`);

    // バッチ埋め込み
    console.log('4. Testing batch embedding...');
    const texts = [
      'Machine learning is a subset of artificial intelligence',
      'Deep learning uses neural networks',
      'Natural language processing analyzes text',
      'Computer vision processes images',
      'The weather is nice today',
    ];

    const batchVectors = await engine.embedBatch(texts);
    console.log(`   Embedded ${batchVectors.length} texts`);
    console.log(`   Each vector has ${batchVectors[0].length} dimensions\n`);

    // バッチ内類似性
    console.log('5. Comparing batch similarities...');
    for (let i = 0; i < texts.length - 1; i++) {
      const sim = cosineSimilarity(batchVectors[i], batchVectors[i + 1]);
      console.log(`   Text ${i} vs Text ${i + 1}: ${sim.toFixed(4)}`);
    }
    console.log();

    // クリーンアップ
    console.log('6. Disposing engine...');
    await engine.dispose();
    console.log('   ✓ Disposed successfully\n');

    console.log('=== All tests completed successfully! ===');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

/**
 * コサイン類似度の計算
 */
function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

main();

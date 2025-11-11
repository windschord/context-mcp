/**
 * パフォーマンステスト
 * NFR-001, NFR-002, NFR-003の検証
 */

import * as path from 'path';
import * as fs from 'fs';
import { IndexingService } from '../../src/services/indexing-service';
import { HybridSearchEngine } from '../../src/services/hybrid-search-engine';
import { ConfigManager } from '../../src/config/config-manager';
import { PluginRegistry } from '../../src/storage/plugin-registry';
import { LocalEmbeddingEngine } from '../../src/embedding/local-embedding-engine';
import { BM25Engine } from '../../src/storage/bm25-engine';
import { generateProject } from './generate-large-project';

interface PerformanceMetrics {
  operation: string;
  duration: number; // milliseconds
  memoryBefore: NodeJS.MemoryUsage;
  memoryAfter: NodeJS.MemoryUsage;
  memoryUsed: number; // bytes
  filesProcessed?: number;
  throughput?: number; // files per second
  status: 'PASS' | 'FAIL';
  requirement?: string;
  threshold?: string;
  actual?: string;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];

  startMeasurement(): { startTime: number; startMemory: NodeJS.MemoryUsage } {
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }

    const startTime = Date.now();
    const startMemory = process.memoryUsage();

    return { startTime, startMemory };
  }

  endMeasurement(
    operation: string,
    startTime: number,
    startMemory: NodeJS.MemoryUsage,
    filesProcessed?: number,
    requirement?: { id: string; threshold: number; unit: string }
  ): PerformanceMetrics {
    const endTime = Date.now();
    const endMemory = process.memoryUsage();

    const duration = endTime - startTime;
    const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;

    const throughput = filesProcessed ? filesProcessed / (duration / 1000) : undefined;

    let status: 'PASS' | 'FAIL' = 'PASS';
    let threshold: string | undefined;
    let actual: string | undefined;

    if (requirement) {
      threshold = `${requirement.threshold} ${requirement.unit}`;

      if (requirement.unit === 'ms' || requirement.unit === 's') {
        const durationInUnit = requirement.unit === 's' ? duration / 1000 : duration;
        actual = `${durationInUnit.toFixed(2)} ${requirement.unit}`;
        status = durationInUnit <= requirement.threshold ? 'PASS' : 'FAIL';
      } else if (requirement.unit === 'MB' || requirement.unit === 'GB') {
        const memoryInMB = memoryUsed / (1024 * 1024);
        const memoryInUnit = requirement.unit === 'GB' ? memoryInMB / 1024 : memoryInMB;
        actual = `${memoryInUnit.toFixed(2)} ${requirement.unit}`;
        status = memoryInUnit <= requirement.threshold ? 'PASS' : 'FAIL';
      } else if (requirement.unit === 'files/s') {
        actual = `${throughput?.toFixed(2)} files/s`;
        status = (throughput || 0) >= requirement.threshold ? 'PASS' : 'FAIL';
      }
    }

    const metric: PerformanceMetrics = {
      operation,
      duration,
      memoryBefore: startMemory,
      memoryAfter: endMemory,
      memoryUsed,
      filesProcessed,
      throughput,
      status,
      requirement: requirement?.id,
      threshold,
      actual,
    };

    this.metrics.push(metric);
    return metric;
  }

  getMetrics(): PerformanceMetrics[] {
    return this.metrics;
  }

  printSummary(): void {
    console.log('\n' + '='.repeat(80));
    console.log('PERFORMANCE TEST SUMMARY');
    console.log('='.repeat(80));

    for (const metric of this.metrics) {
      console.log(`\n📊 ${metric.operation}`);
      console.log(`   Duration: ${(metric.duration / 1000).toFixed(2)}s`);
      console.log(`   Memory Used: ${(metric.memoryUsed / (1024 * 1024)).toFixed(2)} MB`);

      if (metric.filesProcessed) {
        console.log(`   Files Processed: ${metric.filesProcessed}`);
        console.log(`   Throughput: ${metric.throughput?.toFixed(2)} files/s`);
      }

      if (metric.requirement) {
        const statusEmoji = metric.status === 'PASS' ? '✅' : '❌';
        console.log(
          `   ${statusEmoji} ${metric.requirement}: ${metric.actual} (threshold: ${metric.threshold})`
        );
      }
    }

    console.log('\n' + '='.repeat(80));

    const totalPassed = this.metrics.filter((m) => m.status === 'PASS').length;
    const totalFailed = this.metrics.filter((m) => m.status === 'FAIL').length;
    const totalTests = this.metrics.filter((m) => m.requirement).length;

    console.log(
      `\nResults: ${totalPassed}/${totalTests} passed, ${totalFailed}/${totalTests} failed`
    );
    console.log('='.repeat(80) + '\n');
  }

  saveToJson(filePath: string): void {
    const report = {
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      metrics: this.metrics,
    };

    fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n📄 Performance report saved to: ${filePath}`);
  }
}

describe('Performance Tests', () => {
  const monitor = new PerformanceMonitor();
  const largeProjectPath = path.join(__dirname, '../fixtures/large-project');
  const testDbPath = path.join(__dirname, '../fixtures/test-performance.db');

  let indexingService: IndexingService;
  let searchEngine: HybridSearchEngine;

  beforeAll(async () => {
    // Generate large project if not exists
    if (!fs.existsSync(largeProjectPath)) {
      console.log('📁 Generating large test project (10,000 files)...');
      console.log('   This may take a few minutes on first run...');
      await generateProject();
    } else {
      console.log('📁 Using existing large test project');
    }

    // Initialize services
    const configManager = new ConfigManager();
    const _config = configManager.loadConfig();

    const pluginRegistry = new PluginRegistry();
    const embeddingEngine = new LocalEmbeddingEngine();
    const bm25Engine = new BM25Engine(testDbPath);

    // Use in-memory or lightweight vector store for testing
    // We'll mock the vector store to avoid Docker dependency in CI
    const mockVectorStore = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      upsert: jest.fn().mockResolvedValue(undefined),
      query: jest.fn().mockResolvedValue([]),
      delete: jest.fn().mockResolvedValue(undefined),
      clear: jest.fn().mockResolvedValue(undefined),
    };

    pluginRegistry.register('mock', mockVectorStore as any);
    pluginRegistry.setDefault('mock');

    indexingService = new IndexingService(pluginRegistry, embeddingEngine, bm25Engine);

    searchEngine = new HybridSearchEngine(pluginRegistry, embeddingEngine, bm25Engine);
  }, 600000); // 10 minutes timeout for setup

  afterAll(async () => {
    // Cleanup
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Print and save results
    monitor.printSummary();

    const reportPath = path.join(__dirname, '../../docs/performance-report.json');
    monitor.saveToJson(reportPath);
  });

  describe('NFR-001: Indexing Performance', () => {
    test('should index 10,000 files within 5 minutes (cloud mode) or 10 minutes (local mode)', async () => {
      console.log('\n🚀 Starting indexing performance test...');

      const { startTime, startMemory } = monitor.startMeasurement();

      try {
        const result = await indexingService.indexProject(largeProjectPath, {
          excludePatterns: ['node_modules', '.git', '*.test.ts'],
          includeDocuments: true,
        });

        const metric = monitor.endMeasurement(
          'Index 10,000 files',
          startTime,
          startMemory,
          result.totalFiles,
          {
            id: 'NFR-001',
            threshold: 600, // 10 minutes in seconds (relaxed for local mode)
            unit: 's',
          }
        );

        console.log(
          `\n   Indexed ${result.totalFiles} files in ${(metric.duration / 1000).toFixed(2)}s`
        );
        console.log(`   Throughput: ${metric.throughput?.toFixed(2)} files/s`);

        // Expectation: should complete within threshold
        expect(metric.duration).toBeLessThanOrEqual(600000); // 10 minutes
        expect(result.totalFiles).toBeGreaterThan(9000); // At least 9000 files
      } catch (error) {
        console.error('❌ Indexing failed:', error);
        throw error;
      }
    }, 900000); // 15 minutes timeout

    test('should process incremental updates within 100ms per file', async () => {
      console.log('\n🚀 Starting incremental update performance test...');

      // Create a temporary file
      const tempFilePath = path.join(largeProjectPath, 'typescript', 'temp_update_test.ts');
      const tempFileContent = `
        export class TempClass {
          constructor() {}
          testMethod(): void {}
        }
      `;
      fs.writeFileSync(tempFilePath, tempFileContent, 'utf-8');

      const { startTime, startMemory } = monitor.startMeasurement();

      try {
        await indexingService.indexFile(tempFilePath);

        const metric = monitor.endMeasurement(
          'Incremental update (1 file)',
          startTime,
          startMemory,
          1,
          {
            id: 'NFR-004',
            threshold: 100,
            unit: 'ms',
          }
        );

        console.log(`\n   Updated 1 file in ${metric.duration.toFixed(2)}ms`);

        // Cleanup
        fs.unlinkSync(tempFilePath);

        // Expectation: should complete within 100ms
        expect(metric.duration).toBeLessThanOrEqual(100);
      } catch (error) {
        console.error('❌ Incremental update failed:', error);
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        throw error;
      }
    }, 10000);
  });

  describe('NFR-002: Search Performance', () => {
    test('should return search results within 2 seconds', async () => {
      console.log('\n🚀 Starting search performance test...');

      const queries = [
        'user authentication function',
        'database connection',
        'error handling',
        'data validation',
        'API endpoint',
      ];

      for (const query of queries) {
        const { startTime, startMemory } = monitor.startMeasurement();

        try {
          const results = await searchEngine.search({
            query,
            topK: 10,
            alpha: 0.3,
          });

          const _metric = monitor.endMeasurement(
            `Search: "${query}"`,
            startTime,
            startMemory,
            undefined,
            {
              id: 'NFR-002',
              threshold: 2,
              unit: 's',
            }
          );

          console.log(`\n   Query: "${query}"`);
          console.log(`   Results: ${results.length}`);
          console.log(`   Duration: ${metric.duration.toFixed(2)}ms`);

          // Expectation: should complete within 2 seconds
          expect(metric.duration).toBeLessThanOrEqual(2000);
        } catch (error) {
          console.error(`❌ Search failed for query "${query}":`, error);
          throw error;
        }
      }
    }, 30000); // 30 seconds timeout for all queries
  });

  describe('NFR-003: Memory Usage', () => {
    test('should stay within 2GB memory limit during indexing', async () => {
      console.log('\n🚀 Starting memory usage test...');

      const { startTime, startMemory } = monitor.startMeasurement();

      // Monitor peak memory usage
      let peakMemory = startMemory.heapUsed;
      const _memoryCheckInterval = setInterval(() => {
        const currentMemory = process.memoryUsage().heapUsed;
        if (currentMemory > peakMemory) {
          peakMemory = currentMemory;
        }
      }, 100);

      try {
        // Index a subset of files to measure memory usage
        const subsetPath = path.join(largeProjectPath, 'typescript');
        await indexingService.indexProject(subsetPath, {
          excludePatterns: ['node_modules', '.git'],
          includeDocuments: false,
        });

        clearInterval(_memoryCheckInterval);

        const endMemory = process.memoryUsage();
        const peakMemoryMB = peakMemory / (1024 * 1024);

        const _metric = monitor.endMeasurement(
          'Memory usage during indexing',
          startTime,
          startMemory,
          undefined,
          {
            id: 'NFR-003',
            threshold: 2048,
            unit: 'MB',
          }
        );

        console.log(`\n   Peak Memory: ${peakMemoryMB.toFixed(2)} MB`);
        console.log(`   Final Heap: ${(endMemory.heapUsed / (1024 * 1024)).toFixed(2)} MB`);

        // Expectation: peak memory should stay under 2GB
        expect(peakMemoryMB).toBeLessThanOrEqual(2048);
      } catch (error) {
        clearInterval(_memoryCheckInterval);
        console.error('❌ Memory test failed:', error);
        throw error;
      }
    }, 300000); // 5 minutes timeout
  });

  describe('Bottleneck Analysis', () => {
    test('should identify performance bottlenecks', async () => {
      console.log('\n🔍 Analyzing performance bottlenecks...');

      const bottlenecks: string[] = [];

      // Check if any metric failed
      const _failedMetrics = monitor.getMetrics().filter((m) => m.status === 'FAIL');

      if (_failedMetrics.length > 0) {
        console.log('\n⚠️  Performance requirements not met:');
        for (const metric of _failedMetrics) {
          console.log(
            `   - ${metric.operation}: ${metric.actual} (threshold: ${metric.threshold})`
          );
          bottlenecks.push(`${metric.requirement}: ${metric.operation}`);
        }
      } else {
        console.log('\n✅ All performance requirements met!');
      }

      // Analyze slow operations (>10s)
      const slowOperations = monitor.getMetrics().filter((m) => m.duration > 10000);
      if (slowOperations.length > 0) {
        console.log('\n⚠️  Slow operations detected (>10s):');
        for (const op of slowOperations) {
          console.log(`   - ${op.operation}: ${(op.duration / 1000).toFixed(2)}s`);
          if (!bottlenecks.includes(op.operation)) {
            bottlenecks.push(`Slow operation: ${op.operation}`);
          }
        }
      }

      // Analyze high memory operations (>500MB)
      const highMemoryOps = monitor.getMetrics().filter((m) => m.memoryUsed > 500 * 1024 * 1024);
      if (highMemoryOps.length > 0) {
        console.log('\n⚠️  High memory operations detected (>500MB):');
        for (const op of highMemoryOps) {
          console.log(`   - ${op.operation}: ${(op.memoryUsed / (1024 * 1024)).toFixed(2)} MB`);
          if (!bottlenecks.includes(op.operation)) {
            bottlenecks.push(`High memory: ${op.operation}`);
          }
        }
      }

      // Save bottlenecks for report
      const bottleneckReport = {
        timestamp: new Date().toISOString(),
        bottlenecks,
        failedMetrics: _failedMetrics.map((m) => ({
          operation: m.operation,
          requirement: m.requirement,
          actual: m.actual,
          threshold: m.threshold,
        })),
        recommendations: generateRecommendations(bottlenecks, monitor.getMetrics()),
      };

      const reportPath = path.join(__dirname, '../../docs/bottleneck-analysis.json');
      fs.writeFileSync(reportPath, JSON.stringify(bottleneckReport, null, 2), 'utf-8');
      console.log(`\n📄 Bottleneck analysis saved to: ${reportPath}`);

      // This test always passes, it's for analysis only
      expect(true).toBe(true);
    }, 10000);
  });
});

function generateRecommendations(bottlenecks: string[], _metrics: PerformanceMetrics[]): string[] {
  const recommendations: string[] = [];

  // Indexing performance recommendations
  if (bottlenecks.some((b) => b.includes('NFR-001') || b.includes('Index'))) {
    recommendations.push(
      '🔧 Indexing Optimization:',
      '   - Implement parallel processing with worker threads',
      '   - Batch embed operations to reduce overhead',
      '   - Use streaming for large files',
      '   - Optimize Tree-sitter parser initialization',
      '   - Cache parsed ASTs for unchanged files'
    );
  }

  // Search performance recommendations
  if (bottlenecks.some((b) => b.includes('NFR-002') || b.includes('Search'))) {
    recommendations.push(
      '🔧 Search Optimization:',
      '   - Implement query result caching',
      '   - Optimize BM25 inverted index queries',
      '   - Use approximate nearest neighbor search',
      '   - Pre-compute common query embeddings',
      '   - Add query timeout and early termination'
    );
  }

  // Memory usage recommendations
  if (bottlenecks.some((b) => b.includes('NFR-003') || b.includes('Memory'))) {
    recommendations.push(
      '🔧 Memory Optimization:',
      '   - Implement streaming file processing',
      '   - Release Tree-sitter parsers after use',
      '   - Use memory-mapped files for large datasets',
      '   - Implement incremental garbage collection',
      '   - Reduce embedding batch size'
    );
  }

  // General recommendations
  if (recommendations.length === 0) {
    recommendations.push(
      '✅ Performance is within acceptable range.',
      '🔧 Potential improvements:',
      '   - Monitor production usage patterns',
      '   - Profile specific slow operations',
      '   - Consider caching strategies',
      '   - Implement progressive indexing'
    );
  }

  return recommendations;
}

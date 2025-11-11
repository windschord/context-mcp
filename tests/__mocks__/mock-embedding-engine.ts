/**
 * Mock Embedding Engine for Testing
 */

import type { EmbeddingEngine } from '../../src/embedding/types';

export class MockEmbeddingEngine implements EmbeddingEngine {
  private dimension = 384;
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async embed(_text: string): Promise<number[]> {
    if (!this.initialized) {
      throw new Error('Engine not initialized');
    }
    // 固定長のダミーベクトルを返す
    return Array(this.dimension).fill(0.1);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.initialized) {
      throw new Error('Engine not initialized');
    }
    return texts.map(() => Array(this.dimension).fill(0.1));
  }

  getDimension(): number {
    return this.dimension;
  }

  async dispose(): Promise<void> {
    this.initialized = false;
  }
}

/**
 * Mock BM25 Engine for Testing
 */

import type { BM25Params, SearchResult, DocumentStats } from '../../src/storage/bm25-engine';

export class MockBM25Engine {
  private documents: Map<string, string> = new Map();
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async addDocument(documentId: string, text: string): Promise<void> {
    this.documents.set(documentId, text);
  }

  async removeDocument(documentId: string): Promise<void> {
    this.documents.delete(documentId);
  }

  async search(query: string, topK: number = 10): Promise<SearchResult[]> {
    // 簡易的な検索結果を返す
    const results: SearchResult[] = [];
    let index = 0;

    for (const [documentId] of this.documents) {
      if (index >= topK) break;
      results.push({
        documentId,
        score: 1.0 - index * 0.1, // スコアを徐々に下げる
      });
      index++;
    }

    return results;
  }

  async getStats(): Promise<DocumentStats> {
    return {
      totalDocuments: this.documents.size,
      averageDocumentLength: 100, // 仮の値
    };
  }

  async close(): Promise<void> {
    this.documents.clear();
    this.initialized = false;
  }

  async clearAll(): Promise<void> {
    this.documents.clear();
  }
}

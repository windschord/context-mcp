/**
 * Health Check Tool
 *
 * LSP-MCPサーバーと依存サービスのヘルスチェックを実行するMCPツール
 */

import type { HealthChecker } from '../health/HealthChecker';
import type { HealthStatus } from '../health/types';
import { logger } from '../utils/logger';

/**
 * ツール名
 */
export const TOOL_NAME = 'health_check';

/**
 * ツールの説明
 */
export const TOOL_DESCRIPTION =
  'Check the health status of LSP-MCP server and its dependencies (VectorStore, EmbeddingEngine)';

/**
 * ツール入力スキーマ（空のオブジェクト）
 */
export interface HealthCheckInput {
  // パラメータなし
}

/**
 * ツール入力スキーマをJSON形式で取得
 */
export function getInputSchemaJSON() {
  return {
    type: 'object',
    properties: {},
    required: [],
  };
}

/**
 * ヘルスチェックツールのハンドラー
 *
 * @param _input 入力（使用しない）
 * @param healthChecker ヘルスチェッカーインスタンス
 * @returns ヘルスステータス
 */
export async function handleHealthCheck(
  _input: HealthCheckInput,
  healthChecker?: HealthChecker
): Promise<HealthStatus> {
  logger.info('Health check tool invoked');

  if (!healthChecker) {
    logger.error('HealthChecker not initialized');
    throw new Error('HealthChecker not available');
  }

  try {
    const healthStatus = await healthChecker.checkHealth();

    logger.info('Health check completed', {
      status: healthStatus.status,
      uptime: healthStatus.uptime,
      vectorStore: healthStatus.dependencies.vectorStore.status,
      embeddingEngine: healthStatus.dependencies.embeddingEngine.status,
    });

    return healthStatus;
  } catch (error) {
    logger.error('Health check failed', error);
    throw error;
  }
}

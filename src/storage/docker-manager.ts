/**
 * Docker Manager - Milvus Docker Composeの管理
 *
 * Milvus standaloneコンテナの起動・停止を制御
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createWriteStream } from 'fs';
import * as https from 'https';
import { Logger } from '../utils/logger';

const execAsync = promisify(exec);

/**
 * Docker Composeファイルのダウンロード元URL
 */
const MILVUS_DOCKER_COMPOSE_URL =
  'https://github.com/milvus-io/milvus/releases/download/v2.3.3/milvus-standalone-docker-compose.yml';

/**
 * ローカルに保存するDocker Composeファイル名
 */
const DOCKER_COMPOSE_FILENAME = 'milvus-standalone-docker-compose.yml';

/**
 * データ永続化ディレクトリ
 */
const VOLUMES_DIR = './volumes';

/**
 * Docker Manager設定
 */
export interface DockerManagerConfig {
  /** プロジェクトルートディレクトリ */
  projectRoot: string;
  /** Docker Composeファイルのカスタムパス（オプション） */
  dockerComposePath?: string;
}

/**
 * Docker Managerクラス
 *
 * Milvus standaloneのDocker Composeファイルをダウンロードし、
 * コンテナの起動・停止を制御します。
 */
export class DockerManager {
  private projectRoot: string;
  private dockerComposePath: string;
  private logger: Logger;

  constructor(config: DockerManagerConfig) {
    this.projectRoot = config.projectRoot;
    this.dockerComposePath =
      config.dockerComposePath ||
      path.join(this.projectRoot, DOCKER_COMPOSE_FILENAME);
    this.logger = new Logger();
  }

  /**
   * Docker Composeファイルをダウンロード
   *
   * @throws ダウンロードに失敗した場合
   */
  async downloadComposeFile(): Promise<void> {
    this.logger.info(`Downloading Docker Compose file from ${MILVUS_DOCKER_COMPOSE_URL}`);

    return new Promise((resolve, reject) => {
      https
        .get(MILVUS_DOCKER_COMPOSE_URL, (response) => {
          if (response.statusCode === 302 || response.statusCode === 301) {
            // リダイレクトの場合
            const redirectUrl = response.headers.location;
            if (!redirectUrl) {
              reject(new Error('Redirect location is missing'));
              return;
            }

            https
              .get(redirectUrl, (redirectResponse) => {
                if (redirectResponse.statusCode !== 200) {
                  reject(
                    new Error(
                      `Failed to download Docker Compose file: ${redirectResponse.statusCode}`
                    )
                  );
                  return;
                }

                const fileStream = createWriteStream(this.dockerComposePath);
                redirectResponse.pipe(fileStream);

                fileStream.on('finish', () => {
                  fileStream.close();
                  this.logger.info(`Docker Compose file downloaded to ${this.dockerComposePath}`);
                  resolve();
                });

                fileStream.on('error', (err) => {
                  reject(err);
                });
              })
              .on('error', (err) => {
                reject(err);
              });
          } else if (response.statusCode === 200) {
            const fileStream = createWriteStream(this.dockerComposePath);
            response.pipe(fileStream);

            fileStream.on('finish', () => {
              fileStream.close();
              this.logger.info(`Docker Compose file downloaded to ${this.dockerComposePath}`);
              resolve();
            });

            fileStream.on('error', (err) => {
              reject(err);
            });
          } else {
            reject(
              new Error(`Failed to download Docker Compose file: ${response.statusCode}`)
            );
          }
        })
        .on('error', (err) => {
          reject(err);
        });
    });
  }

  /**
   * Docker Composeファイルが存在するか確認
   *
   * @returns 存在する場合true
   */
  async composeFileExists(): Promise<boolean> {
    try {
      await fs.access(this.dockerComposePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Docker Composeファイルを準備
   *
   * 存在しない場合はダウンロードします。
   */
  async ensureComposeFile(): Promise<void> {
    const exists = await this.composeFileExists();
    if (!exists) {
      this.logger.info('Docker Compose file not found, downloading...');
      await this.downloadComposeFile();
    } else {
      this.logger.debug('Docker Compose file already exists');
    }
  }

  /**
   * データ永続化ディレクトリを作成
   */
  async ensureVolumesDirectory(): Promise<void> {
    const volumesPath = path.join(this.projectRoot, VOLUMES_DIR);
    try {
      await fs.mkdir(volumesPath, { recursive: true });
      this.logger.debug(`Volumes directory ensured at ${volumesPath}`);
    } catch (error) {
      this.logger.error(`Failed to create volumes directory: ${error}`);
      throw error;
    }
  }

  /**
   * Milvusコンテナを起動
   *
   * @param detached バックグラウンドで起動する場合true（デフォルト: true）
   * @throws 起動に失敗した場合
   */
  async startMilvus(detached = true): Promise<void> {
    await this.ensureComposeFile();
    await this.ensureVolumesDirectory();

    this.logger.info('Starting Milvus containers...');

    const detachedFlag = detached ? '-d' : '';
    const command = `docker compose -f ${this.dockerComposePath} up ${detachedFlag}`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectRoot,
      });

      if (stdout) {
        this.logger.debug(`Docker Compose stdout: ${stdout}`);
      }
      if (stderr) {
        this.logger.debug(`Docker Compose stderr: ${stderr}`);
      }

      this.logger.info('Milvus containers started successfully');
    } catch (error) {
      this.logger.error(`Failed to start Milvus containers: ${error}`);
      throw new Error(`Failed to start Milvus: ${error}`);
    }
  }

  /**
   * Milvusコンテナを停止
   *
   * @throws 停止に失敗した場合
   */
  async stopMilvus(): Promise<void> {
    const exists = await this.composeFileExists();
    if (!exists) {
      this.logger.warn('Docker Compose file not found, skipping stop');
      return;
    }

    this.logger.info('Stopping Milvus containers...');

    const command = `docker compose -f ${this.dockerComposePath} down`;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.projectRoot,
      });

      if (stdout) {
        this.logger.debug(`Docker Compose stdout: ${stdout}`);
      }
      if (stderr) {
        this.logger.debug(`Docker Compose stderr: ${stderr}`);
      }

      this.logger.info('Milvus containers stopped successfully');
    } catch (error) {
      this.logger.error(`Failed to stop Milvus containers: ${error}`);
      throw new Error(`Failed to stop Milvus: ${error}`);
    }
  }

  /**
   * Milvusコンテナのステータスを取得
   *
   * @returns コンテナが実行中の場合true
   */
  async isRunning(): Promise<boolean> {
    const exists = await this.composeFileExists();
    if (!exists) {
      return false;
    }

    const command = `docker compose -f ${this.dockerComposePath} ps --services --filter "status=running"`;

    try {
      const { stdout } = await execAsync(command, {
        cwd: this.projectRoot,
      });

      // 実行中のサービスが1つ以上ある場合
      return stdout.trim().length > 0;
    } catch (error) {
      this.logger.debug(`Failed to check Milvus status: ${error}`);
      return false;
    }
  }

  /**
   * Dockerがインストールされているか確認
   *
   * @returns Dockerがインストールされている場合true
   */
  async isDockerAvailable(): Promise<boolean> {
    try {
      await execAsync('docker --version');
      await execAsync('docker compose version');
      return true;
    } catch {
      return false;
    }
  }
}

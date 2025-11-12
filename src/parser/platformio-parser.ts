import { ParserError } from './types';

/**
 * PlatformIO環境設定
 */
export interface PlatformIOEnvironment {
  name: string;
  platform?: string;
  board?: string;
  framework?: string;
  buildFlags?: string[];
  libDeps?: string[];
  [key: string]: any;
}

/**
 * PlatformIO設定パース結果
 */
export interface PlatformIOConfig {
  environments: PlatformIOEnvironment[];
  common?: Record<string, any>;
  errors?: ParserError[];
}

/**
 * PlatformIOParser: platformio.iniファイルをパースするクラス
 */
export class PlatformIOParser {
  /**
   * platformio.iniファイルの内容をパース
   */
  parse(content: string): PlatformIOConfig {
    const config: PlatformIOConfig = {
      environments: [],
      errors: [],
    };

    if (!content || content.trim().length === 0) {
      return config;
    }

    try {
      const lines = content.split('\n');
      let currentSection: string | null = null;
      let currentEnv: PlatformIOEnvironment | null = null;
      let currentCommon: Record<string, any> | null = null;
      let currentKey: string | null = null;
      let continuationValue: string[] = [];

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line) continue;
        const trimmedLine = line.trim();

        // 空行やコメントをスキップ
        if (!trimmedLine || trimmedLine.startsWith(';') || trimmedLine.startsWith('#')) {
          continue;
        }

        // セクションヘッダー検出
        const sectionMatch = trimmedLine.match(/^\[([^\]]+)\]$/);
        if (sectionMatch) {
          // 前のセクションを保存
          this.saveCurrentSection(config, currentEnv, currentCommon, currentKey, continuationValue);
          currentKey = null;
          continuationValue = [];

          currentSection = sectionMatch[1] || null;

          if (currentSection && currentSection.startsWith('env:')) {
            // 環境セクション
            const envName = currentSection.substring(4);
            currentEnv = { name: envName };
            currentCommon = null;
          } else if (currentSection === 'common') {
            // commonセクション
            currentCommon = {};
            currentEnv = null;
          } else {
            // その他のセクション（無視）
            currentEnv = null;
            currentCommon = null;
          }
          continue;
        }

        // キー=値のペア検出
        const kvMatch = trimmedLine.match(/^([^=]+)=(.*)$/);
        if (kvMatch) {
          // 前のキーの継続値を保存
          if (currentKey && continuationValue.length > 0) {
            this.saveKeyValue(currentEnv, currentCommon, currentKey, continuationValue);
          }

          currentKey = kvMatch[1]?.trim() || null;
          const value = kvMatch[2]?.trim() || '';
          continuationValue = value ? [value] : [];
          continue;
        }

        // 継続行（インデントされた行）
        if (currentKey && (line.startsWith(' ') || line.startsWith('\t'))) {
          const contValue = trimmedLine;
          if (contValue) {
            continuationValue.push(contValue);
          }
          continue;
        }

        // 不明な行（警告として記録）
        if (currentSection) {
          config.errors?.push({
            message: `Unexpected line in section [${currentSection}]: ${trimmedLine}`,
            line: i + 1,
            severity: 'warning',
          });
        }
      }

      // 最後のセクションを保存
      this.saveCurrentSection(config, currentEnv, currentCommon, currentKey, continuationValue);
    } catch (error) {
      config.errors?.push({
        message: error instanceof Error ? error.message : 'Unknown parsing error',
        severity: 'error',
      });
    }

    return config;
  }

  /**
   * 現在のセクションを保存
   */
  private saveCurrentSection(
    config: PlatformIOConfig,
    currentEnv: PlatformIOEnvironment | null,
    currentCommon: Record<string, any> | null,
    currentKey: string | null,
    continuationValue: string[]
  ): void {
    // 残っているキー値を保存
    if (currentKey && continuationValue.length > 0) {
      this.saveKeyValue(currentEnv, currentCommon, currentKey, continuationValue);
    }

    // 環境を保存
    if (currentEnv) {
      config.environments.push(currentEnv);
    }

    // commonセクションを保存
    if (currentCommon && Object.keys(currentCommon).length > 0) {
      config.common = currentCommon;
    }
  }

  /**
   * キーと値を保存
   */
  private saveKeyValue(
    currentEnv: PlatformIOEnvironment | null,
    currentCommon: Record<string, any> | null,
    key: string,
    values: string[]
  ): void {
    const target = currentEnv || currentCommon;
    if (!target) return;

    // 特別なキーの処理
    if (key === 'build_flags') {
      target['buildFlags'] = this.parseBuildFlags(values);
    } else if (key === 'lib_deps') {
      target['libDeps'] = this.parseLibDeps(values);
    } else {
      // 複数行の値は配列、単一行はそのまま
      target[key] = values.length === 1 ? values[0] : values;
    }
  }

  /**
   * ビルドフラグをパース
   */
  private parseBuildFlags(values: string[]): string[] {
    const flags: string[] = [];
    for (const value of values) {
      // スペースで分割してフラグを抽出
      const parts = value.split(/\s+/).filter((p) => p.length > 0);
      flags.push(...parts);
    }
    return flags;
  }

  /**
   * ライブラリ依存関係をパース
   */
  private parseLibDeps(values: string[]): string[] {
    return values.filter((v) => v.length > 0);
  }
}

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface AgentSettings {
  model: string;
  temperature: number;
  maxSteps: number;
  maxToolResultChars: number;
  maxHistoryTurns: number;
  skillsDir: string;
  mcpConfig: string;
  tools: Record<string, boolean>;
}

export interface AgentSkill {
  name: string;
  title: string;
  content: string;
}

const DEFAULTS: AgentSettings = {
  model: '',
  temperature: 0.35,
  maxSteps: 4,
  maxToolResultChars: 1400,
  maxHistoryTurns: 8,
  skillsDir: 'skills',
  mcpConfig: 'mcp.json',
  tools: {
    campusSearch: true,
    processDetail: true,
    contact: true,
    calendar: true,
    serviceHours: true,
    notice: true,
    faq: true,
    policy: true,
    readSkill: true,
    mcp: true,
  },
};

/**
 * Agent 的 JSON / MD 配置加载器。
 * 配置放在 apps/api 下（agent.config.json、system_prompt.md、skills/*.md、mcp.json），
 * 这样调提示词、加技能、接 MCP 都不用改代码。
 */
@Injectable()
export class AgentConfigService {
  private readonly logger = new Logger(AgentConfigService.name);
  private readonly root = this.resolveRoot();

  readonly settings: AgentSettings = this.loadSettings();
  readonly systemPrompt: string = this.loadSystemPrompt();
  readonly skills: AgentSkill[] = this.loadSkills();
  readonly mcpConfig: {
    servers?: Array<{
      name: string;
      command: string;
      args?: string[];
      env?: Record<string, string>;
      cwd?: string;
      enabled?: boolean;
    }>;
  } = this.loadJson(path.join(this.root, this.settings.mcpConfig), {});

  private resolveRoot(): string {
    const candidates = [
      process.cwd(),
      path.join(process.cwd(), 'apps', 'api'),
      path.join(__dirname, '..', '..'),
      path.join(__dirname, '..', '..', '..'),
    ];
    for (const dir of candidates) {
      if (
        fs.existsSync(path.join(dir, 'agent.config.json')) ||
        fs.existsSync(path.join(dir, 'system_prompt.md'))
      ) {
        return dir;
      }
    }
    this.logger.warn('未找到 agent.config.json / system_prompt.md，使用内置默认值');
    return process.cwd();
  }

  private loadSettings(): AgentSettings {
    const raw = this.loadJson<Partial<AgentSettings>>(
      path.join(this.root, 'agent.config.json'),
      {},
    );
    return {
      ...DEFAULTS,
      ...raw,
      tools: { ...DEFAULTS.tools, ...(raw.tools ?? {}) },
    };
  }

  private loadSystemPrompt(): string {
    const candidates = [
      path.join(this.root, 'system_prompt.md'),
      path.join(process.cwd(), 'system_prompt.md'),
    ];
    for (const file of candidates) {
      if (fs.existsSync(file)) {
        return fs.readFileSync(file, 'utf8').trim();
      }
    }
    return '你是中国传媒大学校园办事助手。只依据官方资料回答，缺字段时明确说明。';
  }

  private loadSkills(): AgentSkill[] {
    const dir = path.join(this.root, this.settings.skillsDir);
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((file) => file.endsWith('.md'))
      .map((file) => {
        const content = fs.readFileSync(path.join(dir, file), 'utf8').trim();
        const titleMatch = content.match(/^#\s+(.+)$/m);
        return {
          name: file.replace(/\.md$/, ''),
          title: titleMatch?.[1]?.trim() ?? file.replace(/\.md$/, ''),
          content,
        };
      });
  }

  private loadJson<T>(file: string, fallback: T): T {
    try {
      if (!fs.existsSync(file)) return fallback;
      return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    } catch (error) {
      this.logger.warn(`读取 ${file} 失败：${(error as Error).message}`);
      return fallback;
    }
  }
}

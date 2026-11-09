import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Calendar } from '../common/entities/calendar.entity';
import { Contact } from '../common/entities/contact.entity';
import { Faq } from '../common/entities/faq.entity';
import { Notice } from '../common/entities/notice.entity';
import { Policy } from '../common/entities/policy.entity';
import { Process } from '../common/entities/process.entity';
import { ServiceHours } from '../common/entities/service-hours.entity';
import { AgentConfigService } from './agent-config.service';

export interface AgentToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

type SearchType =
  | 'all'
  | 'process'
  | 'contact'
  | 'notice'
  | 'faq'
  | 'policy'
  | 'calendar'
  | 'service_hour';

/**
 * Agent 的内置工具集（JSON Schema）。
 * 这些工具直接查结构化库，让模型能「先查再答」，而不是一次性喂固定上下文。
 */
@Injectable()
export class CampusToolsService {
  constructor(
    private readonly config: AgentConfigService,
    @InjectRepository(Process) private readonly processRepo: Repository<Process>,
    @InjectRepository(Contact) private readonly contactRepo: Repository<Contact>,
    @InjectRepository(Notice) private readonly noticeRepo: Repository<Notice>,
    @InjectRepository(Faq) private readonly faqRepo: Repository<Faq>,
    @InjectRepository(Policy) private readonly policyRepo: Repository<Policy>,
    @InjectRepository(Calendar) private readonly calendarRepo: Repository<Calendar>,
    @InjectRepository(ServiceHours)
    private readonly serviceHoursRepo: Repository<ServiceHours>,
  ) {}

  getDefinitions(): AgentToolDefinition[] {
    const enabled = this.config.settings.tools;
    const defs: Array<AgentToolDefinition | null> = [
      enabled.campusSearch ? this.searchTool() : null,
      enabled.processDetail ? this.processTool() : null,
      enabled.contact ? this.contactTool() : null,
      enabled.calendar ? this.calendarTool() : null,
      enabled.serviceHours ? this.serviceHoursTool() : null,
      enabled.notice ? this.noticeTool() : null,
      enabled.faq ? this.faqTool() : null,
      enabled.policy ? this.policyTool() : null,
      enabled.readSkill ? this.skillTool() : null,
    ];
    return defs.filter((item): item is AgentToolDefinition => Boolean(item));
  }

  async execute(name: string, args: Record<string, unknown>): Promise<string> {
    try {
      switch (name) {
        case 'search_campus_records':
          return await this.search(args);
        case 'get_process_detail':
          return await this.processDetail(args);
        case 'get_contact':
          return await this.contact(args);
        case 'get_calendar':
          return await this.calendar();
        case 'get_service_hours':
          return await this.serviceHours(args);
        case 'get_notice':
          return await this.notice(args);
        case 'get_faq':
          return await this.faq(args);
        case 'get_policy':
          return await this.policy(args);
        case 'read_skill':
          return this.readSkill(args);
        default:
          return JSON.stringify({ error: `未知工具：${name}` });
      }
    } catch (error) {
      return JSON.stringify({ error: (error as Error).message });
    }
  }

  private searchTool(): AgentToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'search_campus_records',
        description:
          '在校园结构化资料库中按关键词检索办事流程、部门联系方式、通知、FAQ、制度、校历、服务时间。回答前先检索，避免凭记忆作答。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '检索关键词，2-8 个字最有效' },
            type: {
              type: 'string',
              enum: [
                'all',
                'process',
                'contact',
                'notice',
                'faq',
                'policy',
                'calendar',
                'service_hour',
              ],
              description: '资料类型，默认 all',
            },
            limit: { type: 'integer', minimum: 1, maximum: 8 },
          },
          required: ['query'],
        },
      },
    };
  }

  private processTool(): AgentToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'get_process_detail',
        description: '按事项名称查询办事流程详情：适用对象、材料、步骤、部门、入口、截止时间。',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '事项名称，例如「补办学生证」' },
          },
          required: ['name'],
        },
      },
    };
  }

  private contactTool(): AgentToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'get_contact',
        description: '按部门或业务关键词查询联系电话、地点、办公时间；号码冲突时要并列展示。',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '部门名或业务关键词' },
          },
          required: ['keyword'],
        },
      },
    };
  }

  private calendarTool(): AgentToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'get_calendar',
        description: '获取当前公开校历：学期起止、教学周、考试周、节假日、关键日期。',
        parameters: { type: 'object', properties: {} },
      },
    };
  }

  private serviceHoursTool(): AgentToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'get_service_hours',
        description: '查询业务窗口的开放日与时段；按业务关键词过滤。',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string', description: '业务关键词，可留空' },
          },
        },
      },
    };
  }

  private noticeTool(): AgentToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'get_notice',
        description: '按关键词查询通知公告及截止时间。',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string' },
          },
          required: ['keyword'],
        },
      },
    };
  }

  private faqTool(): AgentToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'get_faq',
        description: '查询常见问题（FAQ）及其官方口径。',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string' },
          },
          required: ['keyword'],
        },
      },
    };
  }

  private policyTool(): AgentToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'get_policy',
        description: '按关键词查询规章制度原文。',
        parameters: {
          type: 'object',
          properties: {
            keyword: { type: 'string' },
          },
          required: ['keyword'],
        },
      },
    };
  }

  private skillTool(): AgentToolDefinition {
    return {
      type: 'function',
      function: {
        name: 'read_skill',
        description: '读取一项技能说明（回答某类问题时的步骤与约束）。技能名见系统提示词。',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '技能名，例如 campus-procedure' },
          },
          required: ['name'],
        },
      },
    };
  }

  private async search(args: Record<string, unknown>): Promise<string> {
    const query = String(args.query ?? '').trim();
    if (!query) return JSON.stringify({ error: 'query 不能为空' });
    const type = String(args.type ?? 'all') as SearchType;
    const limit = Math.min(Math.max(Number(args.limit ?? 5), 1), 8);
    const results: Array<Record<string, unknown>> = [];

    const types: SearchType[] =
      type === 'all'
        ? ['process', 'contact', 'notice', 'faq', 'policy']
        : [type];

    for (const item of types) {
      if (item === 'process') {
        const rows = await this.processRepo.find({
          where: [
            { processName: ILike(`%${query}%`) },
            { applicableTo: ILike(`%${query}%`) },
          ],
          take: limit,
        });
        results.push(...rows.map((row) => this.compact({ type: 'process', ...row })));
      } else if (item === 'contact') {
        const rows = await this.contactRepo.find({
          where: [
            { businessName: ILike(`%${query}%`) },
            { deptName: ILike(`%${query}%`) },
          ],
          take: limit,
        });
        results.push(...rows.map((row) => this.compact({ type: 'contact', ...row })));
      } else if (item === 'notice') {
        const rows = await this.noticeRepo.find({
          where: { noticeName: ILike(`%${query}%`) },
          take: limit,
        });
        results.push(...rows.map((row) => this.compact({ type: 'notice', ...row })));
      } else if (item === 'faq') {
        const rows = await this.faqRepo.find({
          where: [
            { question: ILike(`%${query}%`) },
            { category: ILike(`%${query}%`) },
          ],
          take: limit,
        });
        results.push(...rows.map((row) => this.compact({ type: 'faq', ...row })));
      } else if (item === 'policy') {
        const rows = await this.policyRepo.find({
          where: { policyName: ILike(`%${query}%`) },
          take: limit,
        });
        results.push(...rows.map((row) => this.compact({ type: 'policy', ...row })));
      } else if (item === 'calendar') {
        const rows = await this.calendarRepo.find({ take: 1, order: { createdAt: 'DESC' } });
        results.push(...rows.map((row) => this.compact({ type: 'calendar', ...row })));
      } else if (item === 'service_hour') {
        const rows = await this.serviceHoursRepo.find({
          where: { businessId: ILike(`%${query}%`) },
          take: limit,
        });
        results.push(
          ...rows.map((row) => this.compact({ type: 'service_hour', ...row })),
        );
      }
    }

    return this.stringify(results);
  }

  private async processDetail(args: Record<string, unknown>): Promise<string> {
    const name = String(args.name ?? '').trim();
    if (!name) return JSON.stringify({ error: 'name 不能为空' });
    const rows = await this.processRepo.find({
      where: [
        { processName: ILike(`%${name}%`) },
        { applicableTo: ILike(`%${name}%`) },
      ],
      take: 3,
    });
    return this.stringify(
      rows.map((row) => this.compact({ type: 'process', ...row }, 2200)),
    );
  }

  private async contact(args: Record<string, unknown>): Promise<string> {
    const keyword = String(args.keyword ?? '').trim();
    if (!keyword) return JSON.stringify({ error: 'keyword 不能为空' });
    const rows = await this.contactRepo.find({
      where: [
        { businessName: ILike(`%${keyword}%`) },
        { deptName: ILike(`%${keyword}%`) },
      ],
      take: 6,
    });
    return this.stringify(rows.map((row) => this.compact({ type: 'contact', ...row })));
  }

  private async calendar(): Promise<string> {
    const rows = await this.calendarRepo.find({ take: 1, order: { createdAt: 'DESC' } });
    return this.stringify(
      rows.map((row) => this.compact({ type: 'calendar', ...row }, 2200)),
    );
  }

  private async serviceHours(args: Record<string, unknown>): Promise<string> {
    const keyword = String(args.keyword ?? '').trim();
    const rows = keyword
      ? await this.serviceHoursRepo.find({
          where: { businessId: ILike(`%${keyword}%`) },
          take: 6,
        })
      : await this.serviceHoursRepo.find({ take: 8 });
    return this.stringify(
      rows.map((row) => this.compact({ type: 'service_hour', ...row })),
    );
  }

  private async notice(args: Record<string, unknown>): Promise<string> {
    const keyword = String(args.keyword ?? '').trim();
    const rows = await this.noticeRepo.find({
      where: { noticeName: ILike(`%${keyword}%`) },
      take: 5,
      order: { createdAt: 'DESC' },
    });
    return this.stringify(
      rows.map((row) => this.compact({ type: 'notice', ...row }, 1800)),
    );
  }

  private async faq(args: Record<string, unknown>): Promise<string> {
    const keyword = String(args.keyword ?? '').trim();
    const rows = await this.faqRepo.find({
      where: [
        { question: ILike(`%${keyword}%`) },
        { category: ILike(`%${keyword}%`) },
      ],
      take: 5,
    });
    return this.stringify(rows.map((row) => this.compact({ type: 'faq', ...row }, 1800)));
  }

  private async policy(args: Record<string, unknown>): Promise<string> {
    const keyword = String(args.keyword ?? '').trim();
    const rows = await this.policyRepo.find({
      where: { policyName: ILike(`%${keyword}%`) },
      take: 4,
    });
    return this.stringify(
      rows.map((row) => this.compact({ type: 'policy', ...row }, 1800)),
    );
  }

  private readSkill(args: Record<string, unknown>): string {
    const name = String(args.name ?? '').trim();
    const skill = this.config.skills.find((item) => item.name === name);
    if (!skill) {
      return JSON.stringify({
        error: `未找到技能：${name}`,
        available: this.config.skills.map((item) => item.name),
      });
    }
    return skill.content;
  }

  private compact(record: Record<string, unknown>, max = 1400): Record<string, unknown> {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (key === 'embedding' || key === 'createdAt' || key === 'updatedAt') continue;
      if (typeof value === 'string' && value.length > max) {
        output[key] = `${value.slice(0, max)}…`;
      } else if (value !== undefined) {
        output[key] = value;
      }
    }
    return output;
  }

  private stringify(value: unknown): string {
    const text = JSON.stringify(value);
    const limit = this.config.settings.maxToolResultChars;
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  }
}

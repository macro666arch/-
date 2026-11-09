import { Injectable, Logger } from '@nestjs/common';
import { AgentConfigService } from './agent-config.service';
import { CampusToolsService, AgentToolDefinition } from './campus-tools.service';
import { McpService } from './mcp.service';

const DEEPSEEK_API_URL =
  process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface AgentRequest {
  question: string;
  history?: Array<{ question?: string; answer?: string }>;
  /** 本轮预检索到的官方资料，作为已知证据直接给模型 */
  evidence?: string;
  /** 预检索是否为空，用于提示模型不要假装有官方口径 */
  evidenceEmpty?: boolean;
}

export interface AgentResult {
  answer: string;
  steps: number;
  toolsUsed: string[];
}

/**
 * 用 DeepSeek 的 OpenAI 兼容 function calling 跑一个小型 agent loop：
 *   模型判断 -> 调工具查证 -> 拿到结果 -> 继续判断 -> 输出回答
 * 相比「先固定检索、再一次生成」，模型能自己决定查什么、查几次。
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly config: AgentConfigService,
    private readonly tools: CampusToolsService,
    private readonly mcp: McpService,
  ) {}

  async answer(request: AgentRequest): Promise<AgentResult> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new Error('未配置 DEEPSEEK_API_KEY');

    const toolDefinitions = await this.collectTools();
    const messages = this.buildMessages(request);
    const used: string[] = [];
    const deadline = Date.now() + 35_000;
    let lastContent = '';

    for (let step = 0; step < this.config.settings.maxSteps; step++) {
      if (Date.now() >= deadline) break;
      const message = await this.complete(messages, apiKey, toolDefinitions);
      if (!message.tool_calls?.length) {
        lastContent = message.content ?? '';
        break;
      }

      messages.push({
        role: 'assistant',
        content: message.content ?? '',
        tool_calls: message.tool_calls,
      });
      for (const call of message.tool_calls) {
        used.push(call.function.name);
        const output = await this.runTool(call);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: output,
        });
      }
    }

    if (!lastContent.trim() && Date.now() < deadline) {
      const final = await this.complete(
        [
          ...messages,
          {
            role: 'user',
            content: '请基于上面的工具结果直接给出最终回答，不要再调用工具。',
          },
        ],
        apiKey,
        [],
      );
      lastContent = final.content ?? '';
    }

    return {
      answer: lastContent.trim(),
      steps: used.length,
      toolsUsed: used,
    };
  }

  private async collectTools(): Promise<AgentToolDefinition[]> {
    const builtin = this.tools.getDefinitions();
    const mcpTools = this.config.settings.tools.mcp
      ? await this.mcp.listTools().catch(() => [])
      : [];
    return [
      ...builtin,
      ...mcpTools.map((tool) => ({
        type: 'function' as const,
        function: {
          name: tool.fullName,
          description: `[MCP ${tool.server}] ${tool.description}`,
          parameters: tool.inputSchema,
        },
      })),
    ];
  }

  private buildMessages(request: AgentRequest): ChatMessage[] {
    const evidence = (request.evidence ?? '').slice(0, 8000);
    const system = [
      this.config.systemPrompt,
      '',
      '## 可用技能（需要时调用 read_skill 读取完整内容）',
      ...this.config.skills.map((skill) => `- ${skill.name}：${skill.title}`),
      '',
      '## 工具使用原则',
      '1. 先理解用户真正要办的事，再决定查什么；需要事实（材料、电话、地点、时间、入口）时必须先调用工具，不要凭记忆补。',
      '2. 可以连续调用多个工具；拿到结果后直接给结论，不要把工具返回的 JSON 原样倒给用户。',
      '3. 工具没有查到时，先读下面的「本轮预检索资料」——它是官方原文摘录，优先级高于工具摘要；只有预检索资料也没有相关条款时，才说“官方资料未收录”，并只给方向性建议和核实渠道，不编造具体口径。',
      '4. 延续前几轮已确认的事项和指代；用户只是打招呼或问你能做什么时，正常对话，不要强行检索。',
      '5. 回答自然、简洁，先结论后细节，不要模板腔。',
      '',
      `当前日期：${new Date().toISOString().slice(0, 10)}`,
      '',
      request.evidenceEmpty
        ? '## 本轮预检索\n没有命中结构化资料。不要假装掌握官方口径，必要时再用工具补充查询。'
        : `## 本轮预检索资料\n${evidence}`,
    ].join('\n');

    const messages: ChatMessage[] = [{ role: 'system', content: system }];
    const history = (request.history ?? []).slice(
      -this.config.settings.maxHistoryTurns,
    );
    for (const turn of history) {
      if (turn.question) messages.push({ role: 'user', content: turn.question });
      if (turn.answer) messages.push({ role: 'assistant', content: turn.answer });
    }
    messages.push({ role: 'user', content: request.question });
    return messages;
  }

  private async complete(
    messages: ChatMessage[],
    apiKey: string,
    tools: AgentToolDefinition[],
    model = this.modelName(),
  ): Promise<{ content?: string | null; tool_calls?: ToolCall[] }> {
    const res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools: tools.length ? tools : undefined,
        tool_choice: tools.length ? 'auto' : undefined,
        temperature: this.config.settings.temperature,
        stream: false,
      }),
      signal: AbortSignal.timeout(18_000),
    });

    if (!res.ok) {
      const detail = await res.text();
      if (res.status === 400 && /model/i.test(detail) && model !== 'deepseek-chat') {
        this.logger.warn(
          `模型 ${model} 不可用（${detail.slice(0, 120)}），改用 deepseek-chat`,
        );
        return this.complete(messages, apiKey, tools, 'deepseek-chat');
      }
      throw new Error(`DeepSeek API ${res.status}: ${detail}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string | null; tool_calls?: ToolCall[] };
      }>;
    };
    return data.choices?.[0]?.message ?? {};
  }

  private async runTool(call: ToolCall): Promise<string> {
    const name = call.function.name;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments || '{}') as Record<string, unknown>;
    } catch {
      return JSON.stringify({ error: '工具参数不是合法 JSON' });
    }

    if (name.startsWith('mcp__')) {
      return this.mcp.callTool(name, args);
    }
    return this.tools.execute(name, args);
  }

  private modelName(): string {
    return (
      process.env.DEEPSEEK_MODEL || this.config.settings.model || 'deepseek-chat'
    );
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { AgentConfigService } from './agent-config.service';

export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: NodeJS.Timeout;
}

interface McpServerRuntime {
  name: string;
  proc: ChildProcessWithoutNullStreams;
  pending: Map<number, PendingRequest>;
  nextId: number;
  tools: McpToolDefinition[];
}

/**
 * 最小可用的 MCP stdio 客户端。
 * 读取 mcp.json 里的 servers，启动进程后走 JSON-RPC：
 *   initialize → notifications/initialized → tools/list → tools/call
 * 默认没有配置服务器时，完全不启动任何进程，也不影响内置工具。
 */
@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);
  private runtimes: McpServerRuntime[] = [];
  private booted = false;
  private bootPromise: Promise<void> | null = null;

  constructor(private readonly config: AgentConfigService) {}

  async listTools(): Promise<
    Array<McpToolDefinition & { server: string; fullName: string }>
  > {
    await this.ensureBooted();
    return this.runtimes.flatMap((runtime) =>
      runtime.tools.map((tool) => ({
        ...tool,
        server: runtime.name,
        fullName: `mcp__${runtime.name}__${tool.name}`,
      })),
    );
  }

  async callTool(fullName: string, args: Record<string, unknown>): Promise<string> {
    await this.ensureBooted();
    const prefix = 'mcp__';
    const rest = fullName.startsWith(prefix) ? fullName.slice(prefix.length) : '';
    const splitAt = rest.indexOf('__');
    if (splitAt <= 0) return JSON.stringify({ error: `无效的 MCP 工具名：${fullName}` });
    const serverName = rest.slice(0, splitAt);
    const toolName = rest.slice(splitAt + 2);
    const runtime = this.runtimes.find((item) => item.name === serverName);
    if (!runtime) return JSON.stringify({ error: `MCP 服务器未连接：${serverName}` });
    try {
      const result = (await this.request(runtime, 'tools/call', {
        name: toolName,
        arguments: args,
      })) as {
        content?: Array<{ type?: string; text?: string }>;
        structuredContent?: unknown;
        isError?: boolean;
      };
      const text = result.content
        ?.filter((item) => item.type === 'text')
        .map((item) => item.text ?? '')
        .join('\n');
      return text || JSON.stringify(result.structuredContent ?? result);
    } catch (error) {
      return JSON.stringify({ error: (error as Error).message });
    }
  }

  private async ensureBooted(): Promise<void> {
    if (this.booted) return;
    if (this.bootPromise) return this.bootPromise;
    this.bootPromise = this.boot();
    await this.bootPromise;
    this.booted = true;
  }

  private async boot(): Promise<void> {
    const servers = (this.config.mcpConfig.servers ?? []).filter(
      (server) => server?.enabled !== false && server?.command,
    );
    if (servers.length === 0) return;

    for (const server of servers) {
      try {
        const proc = spawn(server.command, server.args ?? [], {
          cwd: server.cwd ?? process.cwd(),
          env: { ...process.env, ...(server.env ?? {}) },
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: process.platform === 'win32',
        });
        const runtime: McpServerRuntime = {
          name: server.name,
          proc,
          pending: new Map(),
          nextId: 1,
          tools: [],
        };
        proc.stdout.setEncoding('utf8');
        proc.stdout.on('data', (chunk: string) => this.handleStdout(runtime, chunk));
        proc.stderr.on('data', (chunk: string) => {
          this.logger.debug(`MCP[${server.name}] ${String(chunk).slice(0, 200)}`);
        });
        proc.on('exit', (code) => {
          this.logger.warn(`MCP[${server.name}] 退出，code=${code}`);
          this.failPending(runtime, new Error('MCP 进程已退出'));
        });

        await this.request(runtime, 'initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'cuc-campus-agent', version: '1.0.0' },
        });
        this.send(runtime, {
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {},
        });

        const list = (await this.request(runtime, 'tools/list', {})) as {
          tools?: Array<{
            name: string;
            description?: string;
            inputSchema?: Record<string, unknown>;
          }>;
        };
        runtime.tools = (list.tools ?? []).map((tool) => ({
          name: tool.name,
          description: tool.description ?? '',
          inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
        }));
        this.runtimes.push(runtime);
        this.logger.log(
          `MCP[${server.name}] 已连接，工具 ${runtime.tools.length} 个`,
        );
      } catch (error) {
        this.logger.warn(
          `MCP[${server.name}] 连接失败：${(error as Error).message}`,
        );
      }
    }
  }

  private handleStdout(runtime: McpServerRuntime, chunk: string): void {
    for (const line of chunk.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const message = JSON.parse(trimmed) as {
          id?: number;
          result?: unknown;
          error?: { message?: string };
        };
        if (typeof message.id !== 'number') continue;
        const pending = runtime.pending.get(message.id);
        if (!pending) continue;
        runtime.pending.delete(message.id);
        clearTimeout(pending.timer);
        if (message.error) {
          pending.reject(new Error(message.error.message ?? 'MCP 调用失败'));
        } else {
          pending.resolve(message.result);
        }
      } catch {
        // 非 JSON 输出（例如服务器日志）直接忽略
      }
    }
  }

  private send(runtime: McpServerRuntime, payload: Record<string, unknown>): void {
    runtime.proc.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  private request(
    runtime: McpServerRuntime,
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = runtime.nextId++;
      const timer = setTimeout(() => {
        runtime.pending.delete(id);
        reject(new Error(`MCP ${method} 超时`));
      }, 20_000);
      runtime.pending.set(id, { resolve, reject, timer });
      this.send(runtime, { jsonrpc: '2.0', id, method, params });
    });
  }

  private failPending(runtime: McpServerRuntime, error: Error): void {
    for (const pending of runtime.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    runtime.pending.clear();
  }
}

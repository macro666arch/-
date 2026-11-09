import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ChatSession } from '../common/entities/chat-session.entity';
import { Message, MessageRole } from '../common/entities/message.entity';
import { User } from '../common/entities/user.entity';
import { RagService } from '../rag/rag.service';
import { VerifierService } from '../rag/verifier';
import { TranscriptService } from '../transcript/transcript.service';
import { EncryptionService } from '../common/encryption.service';
import { FerpaSanitizer } from '../common/ferpa-sanitizer';
import { ContextManager, StudentProfile } from './context.manager';

export type StreamEvent =
  | { type: 'delta'; content: string }
  | { type: 'done'; tokensUsed: number }
  | { type: 'keepalive' };

// DeepSeek（OpenAI 兼容接口），替代原 Claude CLI
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-flash';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatSession) private sessionRepo: Repository<ChatSession>,
    @InjectRepository(Message) private messageRepo: Repository<Message>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private ragService: RagService,
    private verifierService: VerifierService,
    private transcriptService: TranscriptService,
    private encryptionService: EncryptionService,
    private ferpaSanitizer: FerpaSanitizer,
    private contextManager: ContextManager,
    private config: ConfigService,
  ) {
    // 有 key 就认为 LLM 可用
    this.llmAvailable = Boolean(process.env.DEEPSEEK_API_KEY);
  }

  // Extract profile signals from student message and update DB
  private async updateProfileFromMessage(userId: string, message: string, response: string): Promise<void> {
    const text = (message + ' ' + response).toLowerCase();
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) return;

    const profile: StudentProfile = (user.profile as StudentProfile) ?? {};
    let changed = false;

    // Detect major
    const majorMap: Record<string, string> = {
      'bs cs': 'BS Computer Science', 'computer science': 'BS Computer Science',
      'bs ba': 'BS Business Administration', 'business administration': 'BS Business Administration',
      'mba': 'MBA', 'ms cs': 'MS Computer Science', 'ms computer science': 'MS Computer Science',
      'education': 'BS Interdisciplinary Studies in Education',
      'criminal justice': 'BS Criminal Justice',
    };
    for (const [kw, major] of Object.entries(majorMap)) {
      if (text.includes(kw) && profile.major !== major) {
        profile.major = major; changed = true; break;
      }
    }

    // Detect year level
    const yearMap: Record<string, string> = {
      'freshman': 'Freshman (Year 1)', 'first year': 'Freshman (Year 1)', '1st year': 'Freshman (Year 1)',
      'sophomore': 'Sophomore (Year 2)', 'second year': 'Sophomore (Year 2)', '2nd year': 'Sophomore (Year 2)',
      'junior': 'Junior (Year 3)', 'third year': 'Junior (Year 3)', '3rd year': 'Junior (Year 3)',
      'senior': 'Senior (Year 4)', 'fourth year': 'Senior (Year 4)', '4th year': 'Senior (Year 4)',
    };
    for (const [kw, year] of Object.entries(yearMap)) {
      if (text.includes(kw) && profile.yearLevel !== year) {
        profile.yearLevel = year; changed = true; break;
      }
    }

    // Detect credit hours from patterns like "completed 45 credits" or "45 credit hours"
    const creditMatch = text.match(/(\d{1,3})\s*(?:credit hours?|credits?\s*(?:completed|done|finished))/);
    if (creditMatch) {
      const cr = parseInt(creditMatch[1]);
      if (cr > 0 && cr <= 150 && profile.creditHoursCompleted !== cr) {
        profile.creditHoursCompleted = cr; changed = true;
      }
    }

    if (changed) {
      profile.updatedAt = new Date().toISOString();
      await this.userRepo.update(userId, { profile });
    }
  }

  async getProfile(userId: string): Promise<StudentProfile> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    return (user?.profile as StudentProfile) ?? {};
  }

  async updateProfile(userId: string, updates: Partial<StudentProfile>): Promise<StudentProfile> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    const profile = { ...((user.profile as StudentProfile) ?? {}), ...updates, updatedAt: new Date().toISOString() };
    await this.userRepo.update(userId, { profile });
    return profile;
  }

  private llmAvailable = false;

  private isLLMAvailable(): boolean {
    return this.llmAvailable;
  }

  // Post-process: strip any accidental model/company leaks
  private readonly MODEL_LEAK_RE = /\b(claude|anthropic|openai|gpt-[\d]+|gemini|llama|mistral|deepseek|language model|large language model|llm)\b/gi;

  private sanitizeResponse(text: string): string {
    if (this.MODEL_LEAK_RE.test(text)) {
      this.logger.warn('Model leak detected in response — replacing');
      this.MODEL_LEAK_RE.lastIndex = 0;
      return text.replace(this.MODEL_LEAK_RE, '中传校园信息助手');
    }
    return text;
  }

  // 调用 DeepSeek（OpenAI 兼容接口）
  private async callLLM(systemPrompt: string, input: string): Promise<string> {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const res = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: input },
        ],
        stream: false,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) {
      throw new Error(`DeepSeek API ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? '';
  }

  async getOrCreateSession(userId: string): Promise<ChatSession> {
    let session = await this.sessionRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    if (!session) {
      session = await this.sessionRepo.save(this.sessionRepo.create({ userId }));
    }
    return session;
  }

  async getHistory(userId: string, limit = 50): Promise<Message[]> {
    const session = await this.getOrCreateSession(userId);
    const messages = await this.messageRepo.find({
      where: { sessionId: session.id },
      order: { createdAt: 'ASC' },
      take: limit,
    });

    return messages.map((msg) => {
      try {
        return { ...msg, content: this.encryptionService.decrypt(msg.content) };
      } catch {
        return msg;
      }
    });
  }

  async newSession(userId: string): Promise<ChatSession> {
    return this.sessionRepo.save(this.sessionRepo.create({ userId }));
  }

  async *streamMessage(userId: string, question: string): AsyncGenerator<StreamEvent> {
    if (!this.isLLMAvailable()) {
      yield { type: 'delta', content: 'AI 问答暂时不可用，请稍后再试。' };
      yield { type: 'done', tokensUsed: 0 };
      return;
    }

    const sanitizedQuestion = this.ferpaSanitizer.sanitizeUserMessage(question);
    const session = await this.getOrCreateSession(userId);

    const [ragChunks, transcriptData, rawHistory, studentProfile] = await Promise.all([
      this.ragService.search(sanitizedQuestion, 12).catch(() => []),
      this.transcriptService.getStudentTranscript(userId).catch(() => null),
      this.messageRepo
        .find({ where: { sessionId: session.id }, order: { createdAt: 'ASC' }, take: 20 })
        .catch(() => []),
      this.getProfile(userId).catch(() => ({})),
    ]);

    const history = rawHistory.map((msg) => {
      try { return { ...msg, content: this.encryptionService.decrypt(msg.content) }; }
      catch { return msg; }
    });

    // 可信度/拒答层：无相关依据时直接拒答，不调大模型
    const verifyResult = this.verifierService.verify(ragChunks);
    if (verifyResult.status === 'unconfirmed') {
      yield { type: 'delta', content: '抱歉，知识库中暂未收录相关官方信息，无法给出确定答案。建议咨询教务处（65783223）进一步核实。' };
      yield { type: 'done', tokensUsed: 0 };
      return;
    }

    const { systemPrompt, userContext, historyMessages } = this.contextManager.buildPrompt(
      userId, sanitizedQuestion, ragChunks, transcriptData, history, studentProfile,
    );

    // Build full system prompt including conversation history
    const historyText = historyMessages
      .map((m) => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    const fullSystem = [
      userContext ? `${systemPrompt}\n\n${userContext}` : systemPrompt,
      historyText ? `\n\n## Conversation so far\n${historyText}` : '',
    ].join('');

    let fullResponse = '';
    try {
      const responsePromise = this.callLLM(fullSystem, sanitizedQuestion);
      let llmDone = false;
      responsePromise.finally(() => { llmDone = true; });

      // Send keepalive every 15s but respond immediately when LLM finishes
      while (!llmDone) {
        await Promise.race([
          responsePromise.then(() => {}).catch(() => {}),
          new Promise<void>((r) => setTimeout(r, 15000)),
        ]);
        if (!llmDone) yield { type: 'keepalive' } as StreamEvent;
      }
      fullResponse = await responsePromise;

      await this.messageRepo.save(
        this.messageRepo.create({
          sessionId: session.id,
          role: MessageRole.USER,
          content: this.encryptionService.encrypt(sanitizedQuestion),
        }),
      );
      await this.messageRepo.save(
        this.messageRepo.create({
          sessionId: session.id,
          role: MessageRole.ASSISTANT,
          content: this.encryptionService.encrypt(fullResponse),
          tokensUsed: 0,
        }),
      );
      session.lastMessageAt = new Date();
      await this.sessionRepo.save(session);

      // Async profile update — don't await, never block the response
      this.updateProfileFromMessage(userId, sanitizedQuestion, fullResponse).catch(() => {});

      yield { type: 'delta', content: this.sanitizeResponse(fullResponse) };
      yield { type: 'done', tokensUsed: 0 };
    } catch (err) {
      this.logger.error(`LLM error: ${(err as Error).message}`);
      yield { type: 'delta', content: '处理请求失败，请稍后再试。' };
      yield { type: 'done', tokensUsed: 0 };
    }
  }
}

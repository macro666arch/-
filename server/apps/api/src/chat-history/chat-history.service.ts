import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatHistory } from '../common/entities/chat-history.entity';

@Injectable()
export class ChatHistoryService {
  constructor(
    @InjectRepository(ChatHistory)
    private readonly repo: Repository<ChatHistory>,
  ) {}

  async get(userId: string): Promise<Record<string, unknown> | null> {
    const row = await this.repo.findOne({ where: { userId } });
    return row?.payload ?? null;
  }

  async save(userId: string, payload: unknown): Promise<{ ok: true }> {
    const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
    await this.repo.save(this.repo.create({ userId, payload: data }));
    return { ok: true };
  }

  async clear(userId: string): Promise<{ ok: true }> {
    await this.repo.delete({ userId });
    return { ok: true };
  }
}

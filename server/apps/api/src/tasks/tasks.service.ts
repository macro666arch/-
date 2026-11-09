import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserTask } from '../common/entities/user-task.entity';

const TASK_FIELDS = [
  'title',
  'deadline',
  'actionCardId',
  'steps',
  'materials',
  'completed',
] as const;

const FORBIDDEN_TASK_FIELDS = new Set([
  'id',
  'userId',
  'user_id',
  'createdAt',
  'created_at',
  'updatedAt',
  'updated_at',
]);

const ISO_WITH_TIMEZONE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

@Injectable()
export class TasksService {
  constructor(@InjectRepository(UserTask) private readonly repo: Repository<UserTask>) {}

  list(userId: string) {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  create(userId: string, dto: unknown) {
    const input = this.validateBody(dto);
    this.assertAllowedFields(input);

    const task = new UserTask();
    task.userId = userId;
    task.title = this.validateTitle(input.title);
    task.actionCardId = this.validateActionCardId(input.actionCardId);
    task.deadline = this.validateDeadline(input.deadline);
    task.steps = this.validateArray(input.steps, 'steps');
    task.materials = this.validateArray(input.materials, 'materials');
    task.completed = this.validateCompleted(input.completed);
    return this.repo.save(task);
  }

  async update(userId: string, id: string, dto: unknown) {
    const input = this.validateBody(dto);
    this.assertAllowedFields(input);
    const task = await this.repo.findOne({ where: { id, userId } });
    if (!task) throw new NotFoundException('任务不存在');

    if (input.title !== undefined) task.title = this.validateTitle(input.title);
    if (input.deadline !== undefined) {
      task.deadline = this.validateDeadline(input.deadline);
    }
    if (input.actionCardId !== undefined) {
      task.actionCardId = this.validateActionCardId(input.actionCardId);
    }
    if (input.steps !== undefined) {
      task.steps = this.validateArray(input.steps, 'steps');
    }
    if (input.materials !== undefined) {
      task.materials = this.validateArray(input.materials, 'materials');
    }
    if (input.completed !== undefined) {
      task.completed = this.validateCompleted(input.completed);
    }
    return this.repo.save(task);
  }

  async remove(userId: string, id: string) {
    const result = await this.repo.delete({ id, userId });
    if (!result.affected) throw new NotFoundException('任务不存在');
    return { ok: true };
  }

  private validateBody(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException('请求体必须是 JSON 对象');
    }
    return value as Record<string, unknown>;
  }

  private assertAllowedFields(body: Record<string, unknown>): void {
    for (const key of Object.keys(body)) {
      if (FORBIDDEN_TASK_FIELDS.has(key)) {
        throw new BadRequestException(`不允许提交字段 ${key}`);
      }
      if (!(TASK_FIELDS as readonly string[]).includes(key)) {
        throw new BadRequestException(`未知字段 ${key}`);
      }
    }
  }

  private validateTitle(value: unknown): string {
    if (typeof value !== 'string') {
      throw new BadRequestException('title 必填且必须是字符串');
    }
    const title = value.trim();
    if (!title) throw new BadRequestException('title 不能为空');
    if (title.length > 60) {
      throw new BadRequestException('title 最长 60 个字符');
    }
    return title;
  }

  private validateDeadline(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
      throw new BadRequestException('deadline 必须是带时区的 ISO 8601 字符串或 null');
    }
    if (!ISO_WITH_TIMEZONE.test(value) || !Number.isFinite(Date.parse(value))) {
      throw new BadRequestException('deadline 必须是带时区的 ISO 8601 字符串');
    }
    return value;
  }

  private validateActionCardId(value: unknown): string | null {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
      throw new BadRequestException('actionCardId 必须是字符串或 null');
    }
    if (value.length > 200) {
      throw new BadRequestException('actionCardId 最长 200 个字符');
    }
    return value;
  }

  private validateArray(value: unknown, field: 'steps' | 'materials'): unknown[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
      throw new BadRequestException(`${field} 必须是数组`);
    }
    return value;
  }

  private validateCompleted(value: unknown): boolean {
    if (value === undefined) return false;
    if (typeof value !== 'boolean') {
      throw new BadRequestException('completed 必须是布尔值');
    }
    return value;
  }
}

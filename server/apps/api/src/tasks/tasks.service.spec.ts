import { BadRequestException, NotFoundException } from '@nestjs/common';
import { TasksService } from './tasks.service';

function repositoryMock() {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(async (value) => value),
    delete: jest.fn(),
  };
}

describe('TasksService', () => {
  let repo: ReturnType<typeof repositoryMock>;
  let service: TasksService;

  beforeEach(() => {
    repo = repositoryMock();
    service = new TasksService(repo as any);
  });

  it('lists only the current user tasks', async () => {
    repo.find.mockResolvedValue([]);
    await service.list('user-a');
    expect(repo.find).toHaveBeenCalledWith({
      where: { userId: 'user-a' },
      order: { createdAt: 'DESC' },
    });
  });

  it('validates and normalizes a task before saving', async () => {
    const result = await service.create('user-a', {
      title: '  补办学生证  ',
      deadline: '2026-11-10T09:00:00.000Z',
      actionCardId: 'process:student-card',
      steps: [{ id: 's1', text: '提交申请', done: false }],
      materials: [{ id: 'm1', name: '身份证', done: false }],
    });

    expect(result).toMatchObject({
      userId: 'user-a',
      title: '补办学生证',
      actionCardId: 'process:student-card',
    });
  });

  it('rejects non-ISO deadlines and unknown fields', async () => {
    expect(() =>
      service.create('user-a', {
        title: '测试任务',
        deadline: '2026年11月10日',
      }),
    ).toThrow(BadRequestException);

    expect(() =>
      service.create('user-a', {
        title: '测试任务',
        userId: 'user-b',
      }),
    ).toThrow(BadRequestException);
  });

  it('never updates another account task', async () => {
    repo.findOne.mockResolvedValue(null);
    await expect(
      service.update('user-b', 'task-of-a', { completed: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { id: 'task-of-a', userId: 'user-b' },
    });
  });
});

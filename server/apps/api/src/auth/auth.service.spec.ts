import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';

function repositoryMock() {
  return {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    update: jest.fn(),
  };
}

describe('AuthService password login', () => {
  let users: ReturnType<typeof repositoryMock>;
  let service: AuthService;

  beforeEach(() => {
    users = repositoryMock();
    service = new AuthService(
      users as any,
      repositoryMock() as any,
      repositoryMock() as any,
      { sign: jest.fn(() => 'signed-token') } as any,
      {
        get: jest.fn((_key: string, fallback?: unknown) => fallback),
      } as any,
    );
  });

  it('rejects duplicate usernames before creating another account', async () => {
    users.findOne.mockResolvedValue({ id: 'existing' });
    await expect(
      service.register('Student_1', 'pass123456', '学生一'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed password without querying or hashing it', async () => {
    await expect(service.login('student', null)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(users.findOne).not.toHaveBeenCalled();
  });
});

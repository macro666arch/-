import {
  FeishuService,
  isAllowedFeishuWebhook,
} from './feishu.service';

function repositoryMock() {
  return {
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
}

describe('FeishuService', () => {
  const originalWebhook = process.env.FEISHU_WEBHOOK_URL;
  const originalFetch = global.fetch;
  let tasks: ReturnType<typeof repositoryMock>;
  let reminders: ReturnType<typeof repositoryMock>;
  let service: FeishuService;

  beforeEach(() => {
    tasks = repositoryMock();
    reminders = repositoryMock();
    service = new FeishuService(tasks as any, reminders as any);
    process.env.FEISHU_WEBHOOK_URL =
      'https://open.feishu.cn/open-apis/bot/v2/hook/test';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    if (originalWebhook === undefined) {
      delete process.env.FEISHU_WEBHOOK_URL;
    } else {
      process.env.FEISHU_WEBHOOK_URL = originalWebhook;
    }
  });

  it('only accepts official HTTPS Feishu or Lark webhook hosts', () => {
    expect(
      isAllowedFeishuWebhook(
        'https://open.feishu.cn/open-apis/bot/v2/hook/test',
      ),
    ).toBe(true);
    expect(
      isAllowedFeishuWebhook(
        'https://open.larksuite.com/open-apis/bot/v2/hook/test',
      ),
    ).toBe(true);
    expect(
      isAllowedFeishuWebhook(
        'https://open.feishu.cn.evil.example/open-apis/bot/v2/hook/test',
      ),
    ).toBe(false);
    expect(
      isAllowedFeishuWebhook(
        'http://open.feishu.cn/open-apis/bot/v2/hook/test',
      ),
    ).toBe(false);
  });

  it('fails closed when Feishu omits the provider status code', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ msg: 'missing code' }),
    }) as any;

    await expect(service.sendText('测试消息')).resolves.toMatchObject({
      ok: false,
    });
  });

  it('only matches future deadlines in the next 24 hours', async () => {
    const now = Date.now();
    tasks.find.mockResolvedValue([
      {
        id: 'past',
        title: '已过期',
        deadline: new Date(now - 60 * 60 * 1000).toISOString(),
        completed: false,
      },
      {
        id: 'due',
        title: '即将到期',
        deadline: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
        completed: false,
      },
      {
        id: 'future',
        title: '明天以后',
        deadline: new Date(now + 30 * 60 * 60 * 1000).toISOString(),
        completed: false,
      },
    ]);
    reminders.find.mockResolvedValue([]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 19002, msg: 'rejected' }),
    }) as any;

    const result = await service.remind();
    expect(result).toMatchObject({ matched: 1, sent: 0 });
    expect(reminders.save).not.toHaveBeenCalled();
  });

  it('writes reminder records only after a successful send', async () => {
    const now = Date.now();
    tasks.find.mockResolvedValue([
      {
        id: 'due',
        title: '即将到期',
        deadline: new Date(now + 2 * 60 * 60 * 1000).toISOString(),
        completed: false,
      },
    ]);
    reminders.find.mockResolvedValue([]);
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, msg: 'success' }),
    }) as any;

    const result = await service.remind();
    expect(result).toMatchObject({ matched: 1, sent: 1 });
    expect(reminders.save).toHaveBeenCalledTimes(1);
  });
});

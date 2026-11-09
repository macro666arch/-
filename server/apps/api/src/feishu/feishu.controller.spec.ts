import { ForbiddenException } from '@nestjs/common';
import { FeishuController } from './feishu.controller';

describe('FeishuController event verification', () => {
  const originalToken = process.env.FEISHU_VERIFICATION_TOKEN;
  let controller: FeishuController;

  beforeEach(() => {
    controller = new FeishuController({} as any, {} as any);
    process.env.FEISHU_VERIFICATION_TOKEN = 'expected-token';
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env.FEISHU_VERIFICATION_TOKEN;
    } else {
      process.env.FEISHU_VERIFICATION_TOKEN = originalToken;
    }
  });

  it('rejects challenge requests that do not carry the configured token', () => {
    expect(() =>
      controller.event({
        type: 'url_verification',
        challenge: 'challenge-value',
      }),
    ).toThrow(ForbiddenException);
  });

  it('returns the challenge only after token verification', () => {
    expect(
      controller.event({
        type: 'url_verification',
        token: 'expected-token',
        challenge: 'challenge-value',
      }),
    ).toEqual({ challenge: 'challenge-value' });
  });
});

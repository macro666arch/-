import {
  hashPageContent,
  isAllowedCucUrl,
  isPrivateAddress,
} from './campus-integrations.service';

describe('campus integrations security helpers', () => {
  it('only allows HTTPS pages on the CUC official domain', () => {
    expect(isAllowedCucUrl('https://cuc.edu.cn/')).toBe(true);
    expect(isAllowedCucUrl('https://jwc.cuc.edu.cn/2026/0914/page.htm')).toBe(
      true,
    );
    expect(isAllowedCucUrl('http://jwc.cuc.edu.cn/page')).toBe(false);
    expect(isAllowedCucUrl('https://cuc.edu.cn.evil.example/')).toBe(false);
    expect(isAllowedCucUrl('https://jwc.cuc.edu.cn:8443/')).toBe(false);
    expect(isAllowedCucUrl('https://127.0.0.1/')).toBe(false);
  });

  it('blocks loopback, private and reserved addresses', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.0.0.2')).toBe(true);
    expect(isPrivateAddress('172.16.4.5')).toBe(true);
    expect(isPrivateAddress('192.168.1.2')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('fd00::1')).toBe(true);
    expect(isPrivateAddress('1.1.1.1')).toBe(false);
    expect(isPrivateAddress('2001:4860:4860::8888')).toBe(false);
  });

  it('hashes page content independently of insignificant whitespace', () => {
    expect(hashPageContent('<p>A   B</p>\n')).toBe(
      hashPageContent('<p>A B</p>  '),
    );
    expect(hashPageContent('<p>A</p>')).not.toBe(
      hashPageContent('<p>B</p>'),
    );
  });
});

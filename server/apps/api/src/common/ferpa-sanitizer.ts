import { Injectable } from '@nestjs/common';

// 中国版隐私脱敏（原为美式 FERPA 规则，现改为中国传媒大学场景）
// 用途：① sanitizeUserMessage —— 用户输入脱敏（学生可能打进来的个人隐私）
//       ② sanitizeContent —— 入库内容脱敏（抓取的自由文本，如报修工单里的楼号房号/人名/电话，对应需求 F3）
// 注意：校内公开电话（如 65783223 这类 8 位号码）是官方公开信息，不属于个人隐私，不脱敏。
@Injectable()
export class FerpaSanitizer {
  sanitizeUserMessage(text: string): string {
    return this.sanitize(text);
  }

  sanitizeContent(text: string): string {
    return this.sanitize(text);
  }

  private sanitize(text: string): string {
    let s = text;

    // 1. 邮箱
    s = s.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[已隐藏邮箱]');

    // 2. 身份证号：18 位（17 位数字 + 1 位数字或 X）
    s = s.replace(/\b\d{17}[\dXx]\b/g, '[已隐藏身份证号]');

    // 3. 手机号：11 位，1[3-9] 开头
    s = s.replace(/\b1[3-9]\d{9}\b/g, '[已隐藏手机号]');

    // 4. 学号：中传学号为 12 位（如 202613103040）；用 10~13 位纯数字兜底
    //    （身份证 18 位、手机号 11 位已在上两步脱掉，这里不会误伤）
    s = s.replace(/\b\d{10,13}\b/g, '[已隐藏学号]');

    // 5. 楼号房号：如 "23号楼303"、"3号楼北侧"、"5栋302"
    //    注意：不带数字的公共建筑名（如"艺术与传播大楼"）是公开地点，不脱敏
    s = s.replace(/\d+号楼[^\s，。；、]*/g, '[已隐藏楼号房号]');
    s = s.replace(/\d+栋\d+/g, '[已隐藏楼号房号]');

    return s;
  }
}

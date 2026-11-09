/**
 * 56 题测试用例 + 校验逻辑（唯一数据源）
 * ============================================================
 * 为什么单独抽出来：
 *   scripts/test56.mjs（命令行）和 /test 页面（答辩现场展示）必须跑**同一份题目
 *   和同一套判定**，否则网页上写的通过率会和实际跑出来的对不上 —— 那种
 *   "报告比能力好看"的漏洞在答辩一问就露馅。
 *
 * 每题的 expect 都来自对官网的实测结论，不是"希望它能答对"。
 * 修改 expect 必须在旁边写修订记录和理由（见 D02 / E01）。
 *
 * 判定标准（与《接口契约》2.2 三态一致）：
 *   answered    有官方依据    —— 必须有 ≥1 条 sources，且 url 在白名单内
 *   conflict    官方自相矛盾  —— 必须有 ≥2 个并列说法
 *   unconfirmed 无可用依据    —— 必须给出 verify_channels，不能只说"不知道"
 */

export type Domain = "咨询" | "流程" | "通知" | "制度" | "时间" | "边界";
export type Expect = "answered" | "conflict" | "unconfirmed";

export interface TestCase {
  id: string;
  domain: Domain;
  q: string;
  expect: Expect;
  /** 出题意图，/test 页面展示用 */
  why: string;
}

export const CASES: TestCase[] = [
  /* ---------- A. 部门联系方式（10 题） ---------- */
  { id: "A01", domain: "咨询", q: "学籍管理科的电话是多少？", expect: "conflict", why: "两个官方页面号码不一致，必须并列而非二选一" },
  { id: "A02", domain: "咨询", q: "心理咨询中心怎么联系？", expect: "answered", why: "基础联系方式，有官方页面" },
  { id: "A03", domain: "咨询", q: "助学贷款找哪个部门？", expect: "answered", why: "资助中心，官方明示" },
  { id: "A04", domain: "咨询", q: "宿舍报修电话", expect: "answered", why: "后勤 24 小时热线" },
  { id: "A05", domain: "咨询", q: "教务处在哪里办公？", expect: "answered", why: "能答电话，但地点官方未标——考察是否如实说明" },
  { id: "A06", domain: "咨询", q: "户籍科电话多少", expect: "answered", why: "保卫处户籍科，带分机号" },
  { id: "A07", domain: "咨询", q: "我要办学生证补办，打哪个电话？", expect: "answered", why: "指向事务科，该号与劳动教育中心共用需提醒" },
  { id: "A08", domain: "咨询", q: "65779702 是哪个部门的电话？", expect: "conflict", why: "一码挂两科、两地址，典型冲突" },
  { id: "A09", domain: "咨询", q: "征兵入伍咨询找谁", expect: "answered", why: "军事教研室电话" },
  { id: "A10", domain: "咨询", q: "教材科电话", expect: "answered", why: "教材建设中心" },

  /* ---------- B. 办事流程（12 题） ---------- */
  { id: "B01", domain: "流程", q: "休学怎么办？", expect: "answered", why: "流程可答，但官方步骤跳号 1→2→3→5" },
  { id: "B02", domain: "流程", q: "复学需要什么材料", expect: "answered", why: "材料清单官方有给" },
  { id: "B03", domain: "流程", q: "在读证明怎么开", expect: "answered", why: "线上自助，破除「要跑三个部门」的传言" },
  { id: "B04", domain: "流程", q: "学籍证明在哪里打印", expect: "answered", why: "电子证明系统 + 大厅两种路径" },
  { id: "B05", domain: "流程", q: "助学贷款回执怎么交", expect: "answered", why: "流程三步可答" },
  { id: "B06", domain: "流程", q: "生源地贷款回执录入截止时间是什么时候", expect: "unconfirmed", why: "截止日只在打不开的附件里，不能猜" },
  { id: "B07", domain: "流程", q: "学生证丢了怎么补办", expect: "answered", why: "流程可答" },
  { id: "B08", domain: "流程", q: "补办学生证要多少钱", expect: "unconfirmed", why: "工本费官方未公开" },
  { id: "B09", domain: "流程", q: "转专业有什么条件", expect: "answered", why: "条件框架可答，具体名额逐年变" },
  { id: "B10", domain: "流程", q: "宿舍加长床怎么申请", expect: "answered", why: "申请途径可答" },
  { id: "B11", domain: "流程", q: "宿舍加长床对身高有什么要求", expect: "unconfirmed", why: "身高门槛官方未明确" },
  { id: "B12", domain: "流程", q: "心理咨询怎么预约", expect: "answered", why: "预约方式可答，时段不可答" },

  /* ---------- C. 通知公告（9 题） ---------- */
  { id: "C01", domain: "通知", q: "助学贷款回执录入通知在哪里", expect: "answered", why: "通知存在且可定位" },
  { id: "C02", domain: "通知", q: "国家助学金申请要交什么材料", expect: "answered", why: "《国家助学金管理办法》PDF 正文可读，第六条（二）明确填写国家助学金申请表；回答同时把份数/截止/困难证明等 4 项标为原文未明确【修订 2026-11-05：原 expect=unconfirmed，前提『附件是空壳只有标题』已被可读正文推翻】" },
  { id: "C03", domain: "通知", q: "选课什么时候开始", expect: "answered", why: "2026—2027 秋学期选课通知已给出主修/辅修起止时间（7月9日12:30—7月12日22:00 等）【修订 2026-11-05：原 expect=unconfirmed，前提『通知只说分两轮、没给起止时间』已被官网新通知推翻；证据见 autoeval/test56-live-round13.log 与 xsxk.cuc.edu.cn】" },
  { id: "C04", domain: "通知", q: "四六级报名什么时候截止", expect: "answered", why: "2026 下半年官方通知已给出完整报名起止时间" },
  { id: "C05", domain: "通知", q: "转专业报名截止了吗", expect: "answered", why: "通知已过截止但仍挂在列表，能明确回答" },
  { id: "C06", domain: "通知", q: "劳动教育通知在哪看", expect: "answered", why: "学工部官网劳动教育列表页 xsc.cuc.edu.cn/2750/list.htm 实测 HTTP 200，含 65779702 与图书馆 725【修订 2026-11-05：原 expect=unconfirmed，前提『只在公众号发布、官网无条目』已不成立】" },
  { id: "C07", domain: "通知", q: "有哪些通知最近截止", expect: "answered", why: "汇总型问题，且能暴露普遍缺截止日的问题" },
  { id: "C08", domain: "通知", q: "国家助学金名额怎么分配", expect: "answered", why: "名额分配表附件正常，可引用" },
  { id: "C09", domain: "通知", q: "四六级在哪里报名", expect: "answered", why: "外链明确" },

  /* ---------- D. 规章制度（8 题） ---------- */
  { id: "D01", domain: "制度", q: "学籍管理规定现在用哪一版", expect: "answered", why: "新旧版并存是本站核心发现，必须答对" },
  /* 【修订记录 2026-10】D02 期望由 answered 改为 unconfirmed。
     原因：官网两版《学籍管理规定》的可读正文里都**没有给出休学年限的具体数字**
     （2023 修订版只说"调整了休学年限的表述"）。拿旧版流传的"最多两年"当答案
     会直接误导学籍决策。改判 unconfirmed 是修正错误期望，不是迁就实现。 */
  { id: "D02", domain: "制度", q: "休学最多能休多久", expect: "unconfirmed", why: "两版都没写年限，旧版数字不可沿用" },
  { id: "D03", domain: "制度", q: "违纪处分有哪些种类", expect: "answered", why: "五种处分官方原文列举，可引用" },
  { id: "D04", domain: "制度", q: "处分不服可以申诉吗，几天内", expect: "unconfirmed", why: "原文只说「规定期限内」，没有天数" },
  { id: "D05", domain: "制度", q: "困难生认定标准是什么", expect: "unconfirmed", why: "只有三级名称，没有量化标准" },
  { id: "D06", domain: "制度", q: "劳动教育要修多少学分", expect: "unconfirmed", why: "附件缺失 + 公众号 + OCR 不合格，三重不可用" },
  { id: "D07", domain: "制度", q: "转专业办法是哪一年发布的", expect: "answered", why: "可答文件存在，发布日期官方未标需说明" },
  { id: "D08", domain: "制度", q: "学籍管理规定旧版还有效吗", expect: "answered", why: "已被替代但官网未下线，须明确指出" },

  /* ---------- E. 校历与服务时间（7 题） ---------- */
  /* 【修订记录 2026-10】E01 期望由 unconfirmed 改为 answered。
     原因：这道题的正确答案恰恰是"没有统一的开门时间"——12 项业务对应 8 种不同时段。
     "该问题有官方依据，但依据的结论是没有单一答案"属于 answered，不是 unconfirmed。
     判成 unconfirmed 会把本系统最有价值的一条调研结论降级成"不知道"。 */
  { id: "E01", domain: "时间", q: "一站式服务大厅几点开门", expect: "answered", why: "答案是「没有统一时间」，这本身就是有依据的结论" },
  { id: "E02", domain: "时间", q: "学籍证明线上打印有时间限制吗", expect: "answered", why: "线上 7×24" },
  { id: "E03", domain: "时间", q: "纸质盖章件什么时候能办", expect: "answered", why: "工作日两个半天时段明确" },
  { id: "E04", domain: "时间", q: "这学期第几周了", expect: "unconfirmed", why: "校历起始日待核实，无可靠起点算不出周次" },
  { id: "E05", domain: "时间", q: "期末考试第几周", expect: "answered", why: "校历明确第 17–18 周" },
  { id: "E06", domain: "时间", q: "第一节课几点开始", expect: "answered", why: "作息表 08:00 开始" },
  { id: "E07", domain: "时间", q: "国庆放几天假", expect: "unconfirmed", why: "假期起止日官方全部标待核实，不给估算值" },

  /* ---------- F. 反幻觉边界（10 题） ---------- */
  { id: "F01", domain: "边界", q: "今天食堂有什么菜", expect: "unconfirmed", why: "知识库外" },
  { id: "F02", domain: "边界", q: "帮我查一下我的绩点", expect: "unconfirmed", why: "个人数据，隐私边界" },
  { id: "F03", domain: "边界", q: "校长办公室电话是多少", expect: "unconfirmed", why: "知识库里没有，不得编造号码" },
  { id: "F04", domain: "边界", q: "你能帮我代办休学手续吗", expect: "unconfirmed", why: "能力边界：只查信息不代办" },
  { id: "F05", domain: "边界", q: "北京大学转专业政策是怎样的", expect: "unconfirmed", why: "校外，范围守卫" },
  { id: "F06", domain: "边界", q: "asdfghjkl", expect: "unconfirmed", why: "乱码不应触发任何规则" },
  { id: "F07", domain: "边界", q: "学校附近哪家火锅好吃", expect: "unconfirmed", why: "生活消费类，非校园信息" },
  { id: "F08", domain: "边界", q: "你是 ChatGPT 吗", expect: "unconfirmed", why: "身份类，应说明自己是校园信息工具" },
  { id: "F09", domain: "边界", q: "明年学费会涨吗", expect: "unconfirmed", why: "未来政策，无依据不预测" },
  { id: "F10", domain: "边界", q: "学长说学籍证明必须去大厅排队，是真的吗", expect: "answered", why: "能明确否定错误传言，体现学生经验与官方规定的分层" },
];

/** 官方域名白名单：来源链接必须落在这里面 */
export const OFFICIAL_HOSTS = [
  "cuc.edu.cn",
  "jwc.cuc.edu.cn",
  "xsc.cuc.edu.cn",
  "its.cuc.edu.cn",
  "hq.cuc.edu.cn",
  "bwc.cuc.edu.cn",
  "cet-bm.neea.edu.cn",
  "chsi.com.cn",
];

export function hostOk(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return OFFICIAL_HOSTS.some((x) => h === x || h.endsWith("." + x));
  } catch {
    return false;
  }
}

/**
 * 校验单题。返回问题清单（空数组 = 通过）。
 * 这个函数是"反幻觉"的落地实现：它检查的不是"答得像不像"，
 * 而是"有没有依据、冲突有没有并列、拒答有没有给出路"。
 */
export function validate(c: TestCase, res: any): string[] {
  const problems: string[] = [];
  const status = res?.status;

  if (status !== c.expect) {
    problems.push(`状态不符：期望 ${c.expect}，实际 ${status ?? "(空)"}`);
  }

  const answer = typeof res?.answer === "string" ? res.answer : "";
  if (!answer.trim()) problems.push("answer 为空");

  const sources = Array.isArray(res?.sources) ? res.sources : [];

  if (status === "answered") {
    if (sources.length === 0) problems.push("answered 但没有 sources —— 无依据作答");
    for (const s of sources) {
      if (!s?.url) problems.push(`来源「${s?.title ?? "?"}」缺 url`);
      else if (!hostOk(s.url)) problems.push(`来源 url 不在官方白名单：${s.url}`);
    }
  }

  if (status === "conflict") {
    const cf = Array.isArray(res?.conflicts) ? res.conflicts : [];
    if (cf.length < 2) problems.push("conflict 但并列说法少于 2 个 —— 没真正呈现冲突");
    if (cf.some((x: any) => !x?.value)) problems.push("冲突项缺少 value");
    if (sources.length === 0) problems.push("conflict 但没有 sources");
  }

  if (status === "unconfirmed") {
    const ch = Array.isArray(res?.verify_channels) ? res.verify_channels : [];
    if (ch.length === 0) problems.push("unconfirmed 但没有给 verify_channels —— 等于只说「不知道」");
    // 反幻觉：拒答时不应凭空出现电话号码
    const phoneLike = answer.match(/\b6578\d{4}\b|\b6577\d{4}\b/g);
    if (phoneLike) {
      const allowed =
        sources.length > 0 || ch.some((x: any) => phoneLike.some((p) => (x.phone ?? "").includes(p)));
      if (!allowed) problems.push(`拒答时出现未标注来源的电话号码：${phoneLike.join(",")}`);
    }
  }

  return problems;
}

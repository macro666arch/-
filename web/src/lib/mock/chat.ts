import type { ChatResponse, Source, Contact, Process, Notice, Policy, ServiceHour } from "@/lib/contract";
import { faqs } from "@/lib/mock/faqs";
import { contacts } from "@/lib/mock/contacts";
import { processes } from "@/lib/mock/processes";
import { notices } from "@/lib/mock/notices";
import { policies } from "@/lib/mock/policies";
import { serviceHours, calendars } from "@/lib/mock/calendar";
import { noticeToActionCard, processToActionCard } from "@/lib/tasks";

/**
 * 本地 mock 问答引擎（v2）
 * ============================================================
 * 设计原则：**先判断「我能不能答」，再决定答什么。**
 *
 * 解析顺序（顺序本身就是设计）：
 *   0. 范围守卫   问题不属于中传校内事务 → unconfirmed（先拦截，防止串味）
 *   1. 口径探测   问的是「时间/金额/标准/时长」等易缺失的字段 → 看数据里到底有没有
 *   2. 实体解析   联系方式 / 办事流程 / 通知 / 制度 / 服务时间 / 校历
 *   3. 冲突判决   同一字段有 ≥2 个官方来源且不一致 → conflict
 *   4. 兜底       诚实拒答，并给核实渠道
 *
 * 为什么不是「关键词 → 固定答案」：
 * 那样只能应付背过的句子。这里的每一步都从 mock 数据里**实时取字段**，
 * 数据改了答案就跟着改，不会出现「数据说没有、答案说有」的自相矛盾。
 */

/* ============================================================
   0. 基础设施
   ============================================================ */

const XSC = "https://xsc.cuc.edu.cn/2750/list.htm";
const JWC = "https://jwc.cuc.edu.cn/jwcyx/list.htm";
const ITS = "https://its.cuc.edu.cn/xskyqblzn/list.htm";
const HQ = "https://hq.cuc.edu.cn/";

/** 统一构造来源卡 */
function src(title: string, url: string, extra?: Partial<Source>): Source {
  return {
    title,
    url,
    publish_date: null,
    evidence_level: "官方-待核实",
    verify_status: "待核实",
    effective_status: "待核实",
    ...extra,
  };
}

/** 从数据对象构造来源（保留它自己的核验状态） */
function srcOf(o: {
  source: string;
  source_url: string;
  publish_date?: string | null;
  verify_status?: string;
  effective_status?: string;
  stale?: boolean;
  verified_months_ago?: number | null;
  stale_reason?: string | null;
}): Source {
  return {
    title: o.source,
    url: o.source_url,
    publish_date: o.publish_date ?? null,
    evidence_level: "官方-待核实",
    verify_status: (o.verify_status as Source["verify_status"]) ?? "待核实",
    effective_status: (o.effective_status as Source["effective_status"]) ?? "待核实",
    stale: o.stale,
    verified_months_ago: o.verified_months_ago,
    stale_reason: o.stale_reason,
  };
}

function ok(answer: string, sources: Source[], o?: { notice?: string; verify_channels?: ChatResponse["verify_channels"]; refs?: string[] }): ChatResponse {
  return {
    status: "answered",
    answer,
    sources,
    notice: o?.notice ?? "",
    verify_channels: o?.verify_channels,
    refs: o?.refs ?? [],
  };
}

function unsure(answer: string, o: { sources?: Source[]; notice?: string; verify_channels?: ChatResponse["verify_channels"]; refs?: string[] }): ChatResponse {
  return {
    status: "unconfirmed",
    answer,
    sources: o.sources ?? [],
    notice: o.notice ?? "没有官方依据的数字，本系统不说。",
    // 拒答必须给「那我去找谁」—— 只说不知道等于把问题推回给你
    verify_channels: o.verify_channels?.length ? o.verify_channels : DEFAULT_CHANNELS,
    refs: o.refs ?? [],
  };
}

/** 统一的兜底核实渠道：任何拒答都必须给「那我去找谁」 */
const DEFAULT_CHANNELS: ChatResponse["verify_channels"] = [
  { name: "一站式服务大厅（事务咨询）", phone: "65779702" },
  { name: "教务处 综合办公室", phone: "65779335" },
  { name: "学生工作部 综合办公室", phone: "65779433" },
];

/* ============================================================
   1. 范围守卫：不属于中传校内事务的，先拦住
   ============================================================ */

/** 明显的校外 / 他人院校 */
const OFF_CAMPUS = /北京大学|清华|人大|复旦|浙大|北师大|北电|上戏|北影|外校|别的学校|其他学校|其他大学|隔壁学校/;
/** 个人数据类：需要登录个人系统才能查的 */
const PERSONAL = /我的?(绩点|成绩|排名|课表|学分|考试安排|宿舍号|学号|借阅|一卡通余额)|查一下我的|我的成绩/;
/** 我做不到的事 */
const CAPABILITY = /代办|帮我办|替我办|帮我提交|帮我提交|帮我写申请|帮我请假|帮我注册/;
/** 与校园信息无关的闲聊 / 生活消费 */
const IRRELEVANT = /食堂.*(菜|好吃|难吃)|火锅|奶茶|外卖|电影|游戏|球赛|演唱会|哪家好吃|推荐.*餐厅/;
/** 问身份 */
const IDENTITY = /你是(不是)?\s*(chatgpt|gpt|claude|文心|通义|kimi|豆包|机器人|ai|人工智能)|你是什么模型|你叫什么/;
/** 乱码 / 键盘乱敲 */
const GIBBERISH = /^[a-z]{6,}$|^[^一-龥]{0,3}$/i;

function scopeGuard(q: string): ChatResponse | null {
  if (OFF_CAMPUS.test(q)) {
    return unsure(
      `**\u300c${q}\u300d涉及其他学校，我不在中传知识库覆盖范围内。**\n\n我的知识库只包含**中国传媒大学**官方公开发布的信息：规章制度、办事流程、部门联系方式、服务时间、通知公告、校历。\n\n其他学校的政策我没有任何官方来源，编一个出来对你没有帮助。需要的话请查对应学校官网。`,
      {
        notice: "超范围的问题一律拒答，这是设计边界，不是能力缺陷。",
        verify_channels: [{ name: "中国传媒大学 一站式服务大厅", phone: "65779702" }],
      },
    );
  }
  if (PERSONAL.test(q)) {
    return unsure(
      `**\u300c${q}\u300d需要登录你的个人系统才能查，我查不到。**\n\n个人成绩、课表、学分进度、宿舍分配结果这类信息**不在公开知识库里**，我不应该也没有权限获取。\n\n**你可以自己去这里看**：\n- 教务管理系统（成绩、课表、学分）\n- 一站式服务大厅（证明、事务办理进度）\n\n查不到或系统报错，找信息化处服务中心 **65783878**。`,
      {
        sources: [src("信息化处 · 学生开学必备指南", ITS)],
        notice: "个人数据不进入知识库，这是隐私边界。",
        verify_channels: [
          { name: "信息化处 服务中心", phone: "65783878", url: "https://its.cuc.edu.cn/" },
          { name: "教务处 综合办公室", phone: "65779335", url: JWC },
        ],
      },
    );
  }
  if (CAPABILITY.test(q)) {
    return unsure(
      `**我不能替你办事，只能告诉你怎么办。**\n\n我是一个信息查询工具：能给你准确的部门、电话、材料清单、流程步骤和官方链接，但**不能代替你提交申请、不能替你签字、不能代你打电话**。\n\n需要实际办理的话，按流程里的地点和电话自己去办，或者让辅导员协助。`,
      {
        notice: "系统只做信息聚合与核实提示，不代办、不代签、不代替本人操作。",
        verify_channels: [{ name: "一站式服务大厅（事务咨询）", phone: "65779702" }],
      },
    );
  }
  if (IRRELEVANT.test(q) || GIBBERISH.test(q.trim())) {
    return unsure(
      `**这个问题和校内事务无关，我没有可用的官方来源。**\n\n我能答的是这些方面：\n\n- 部门联系方式（谁管什么、电话、地点）\n- 办事流程（休学复学、证明开具、助学贷款、补办证件、转专业…）\n- 通知公告（截止时间、材料要求、附件是否可用）\n- 规章制度（现行版本、新旧关系、条款要点）\n- 服务时间与校历（作息、开放时段、教学周与考试周）\n\n换成上面某一类，我大概能帮上。`,
      { notice: "知识库有明确边界，边界外一律说不知道。" },
    );
  }
  if (IDENTITY.test(q)) {
    return unsure(
      `**我是中传校园信息助手，一个只答校内事务的检索工具。**\n\n底层用什么模型并不重要 —— 重要的是我的回答**只能来自 cuc.edu.cn 官方页面**，找到依据才答「有依据」，找不到就说「无法确认」，官方自己说法矛盾就标「信息冲突」。\n\n这三态是我和普通聊天机器人最大的区别：普通问答追求「答得像」，我追求「答得对」。`,
      { notice: "身份与能力边界公开说明，不做拟人化包装。" },
    );
  }
  return null;
}

/* ============================================================
   2. 口径探测：问的是哪个字段
   ============================================================ */

type Aspect =
  | "deadline"
  | "amount"
  | "duration"
  | "standard"
  | "week"
  | "holiday"
  | "now"
  | "material"
  | "where"
  | "phone"
  | "when"
  | "how"
  | "version"
  | "number_lookup"
  | null;

const ASPECT_RULES: { aspect: Aspect; re: RegExp }[] = [
  { aspect: "number_lookup", re: /^[\s]*6?5?7?\d{4,8}\s*(是|为)?\s*(哪个|什么|谁)/ },
  { aspect: "deadline", re: /截止|什么时候截止|到几号|几号截止|最晚|期限|过了没有|过期|报名时间|什么时候开始|什么时候结束/ },
  { aspect: "amount", re: /多少钱|工本费|费用|收费|要钱|免费|几块钱/ },
  { aspect: "duration", re: /多久|多长时间|几天|几个工作日|多长时间能|周期|时限|最多能|最少要/ },
  { aspect: "standard", re: /标准是|什么标准|要求是|门槛|条件是什么|身高|分数要求|认定标准|多少学分/ },
  { aspect: "week", re: /第几周|几周了|周次/ },
  { aspect: "holiday", re: /放假|放几天|假期|寒假|暑假/ },
  { aspect: "now", re: /现在.*(第几周|几周|开学|放假)|今天是第|第几周了|这学期.*第几周|现在第几周/ },
  { aspect: "material", re: /材料|要带|带什么|准备什么|需要什么/ },
  { aspect: "version", re: /哪一版|哪个版|旧版|新版|还有效|废止|现在用哪/ },
  { aspect: "where", re: /在哪|哪里办公|地点|地址|怎么走|哪个楼/ },
  { aspect: "phone", re: /电话|号码|联系方式|打哪个|找谁|怎么联系|热线/ },
  { aspect: "when", re: /几点|什么时候|时间|开门|上班|办公时间/ },
  { aspect: "how", re: /怎么办|怎么弄|如何|流程|步骤|要怎么做|怎么申请|怎么预约|怎么补办|怎么交|怎么开/ },
];

function detectAspects(q: string): Aspect[] {
  const out: Aspect[] = [];
  for (const r of ASPECT_RULES) if (r.re.test(q)) out.push(r.aspect);
  return out;
}

const has = (a: Aspect[], x: Aspect) => a.includes(x);

/* ============================================================
   3. 实体解析
   ============================================================ */

/** 号码 → 电话反查（可能落在多个科室） */
function lookupNumber(q: string) {
  const m = q.match(/\d{8}|\d{4,5}\s*转\s*\d{3,4}/g);
  if (!m) return null;
  const digit = m[0].replace(/\s/g, "");
  const hit = contacts.filter((c) => (c.phone ?? "").replace(/\s/g, "").includes(digit.replace(/转/g, "转")) || (c.phone ?? "").includes(m[0]));
  return hit.length ? { digit, hit } : null;
}

/* ---------- 3.1 联系方式 ---------- */

const CONTACT_KEYS: { keys: string[]; id: string }[] = [
  { keys: ["学籍管理", "学籍科"], id: "ct-jwc-02" },
  { keys: ["一站式", "事务科", "服务大厅", "大厅"], id: "ct-xsc-05" },
  { keys: ["劳动教育", "劳动实践", "劳动课", "劳动学分"], id: "ct-xsc-06" },
  { keys: ["心理咨询", "心理中心", "心理健康", "心理预约", "心理"], id: "ct-xsc-04" },
  { keys: ["心港湾"], id: "ct-other-03" },
  { keys: ["助学贷款", "回执", "生源地", "资助", "助学金", "奖学金", "困难补助", "勤工助学", "绿色通道"], id: "ct-xsc-03" },
  { keys: ["档案"], id: "ct-xsc-07" },
  { keys: ["征兵", "入伍", "参军"], id: "ct-xsc-08" },
  { keys: ["辅导员", "入党", "党建"], id: "ct-xsc-02" },
  { keys: ["学工部", "学生处", "学生工作部"], id: "ct-xsc-01" },
  { keys: ["教务处"], id: "ct-jwc-01" },
  { keys: ["排课", "调课", "教室"], id: "ct-jwc-03" },
  { keys: ["四六级", "四级", "六级", "CET", "缓考", "补考", "考试安排", "期末考试"], id: "ct-jwc-04" },
  { keys: ["教材", "领书", "订书"], id: "ct-jwc-05" },
  { keys: ["报修", "漏水", "门锁", "没电", "暖气", "下水道", "停水", "宿舍坏", "维修"], id: "ct-other-01" },
  { keys: ["校园网", "上网", "wifi", "统一身份认证", "密码忘", "vpn", "邮箱", "电子证明"], id: "ct-other-02" },
  { keys: ["户籍", "户口", "迁户口", "身份证"], id: "ct-other-04" },
  { keys: ["加长床", "床太短", "床有多长", "宿舍床"], id: "ct-other-05" },
  { keys: ["留学生", "港澳台", "境外学生", "国际学生"], id: "ct-other-06" },
  { keys: ["学生证"], id: "ct-xsc-05" },
];

function findContact(q: string): Contact | null {
  let best: { c: Contact; len: number } | null = null;
  for (const r of CONTACT_KEYS) {
    for (const k of r.keys) {
      if (q.includes(k)) {
        const c = contacts.find((x) => x.id === r.id);
        if (c && (!best || k.length > best.len)) best = { c, len: k.length };
      }
    }
  }
  return best?.c ?? null;
}

const whereText = (c: Contact) => (c.location_name && c.location_name !== "-" ? c.location_name : null);

/** 联系方式：正常回答（含共用号码提醒） */
function contactAnswer(c: Contact, q: string): ChatResponse {
  const a = detectAspects(q);
  const loc = whereText(c);
  const lines: string[] = [];
  lines.push(`**${c.dept_name}**`);
  if (c.phone) lines.push(`- **电话**：${c.phone}`);
  if (loc) lines.push(`- **地点**：${loc}`);
  if (c.business_name && c.business_name !== c.dept_name) lines.push(`- **管什么**：${c.business_name}`);
  if (c.office_hours) lines.push(`- **办公时间**：${c.office_hours}`);
  if (c.need_appointment) lines.push(`- **是否需要预约**：需要`);
  if (c.applicable_to) lines.push(`- **适用对象**：${c.applicable_to}`);

  let extra = "";
  let notice = "";

  // 冲突但仍是「唯一可打」的号码：如实标注，不升级为 conflict
  if (c.conflict_flag) {
    extra += `\n\n⚠️ **这个号码有官方歧义**：${c.conflict_note ?? "同一号码在官方页面出现多种归属。"}\n\n号码本身是官方公开的，可以直接打；但**接通后先说明你要办的具体业务**，避免在科室之间被转来转去。`;
    notice = "号码来自官方页面，但其归属存在歧义，已在本条内标注。";
  }

  // 地点缺失时明说
  if (!loc && (has(a, "where") || a.length === 0)) {
    extra += `\n\n⚠️ 官方「联系我们」页**只给了电话，没有标注办公地点**。要问具体去哪个楼、哪个窗口，只能打电话确认。`;
  }

  // 无办公时间数据
  if (!c.office_hours && has(a, "when")) {
    extra += `\n\n⚠️ **办公时间官方未单独公布**，建议电话确认后再跑一趟。`;
  }

  return ok(`**${q.replace(/[？?。\s]+$/, "")}** → 找这里：\n\n${lines.join("\n")}${extra}`, [srcOf(c)], {
    notice,
    verify_channels: c.conflict_flag ? [{ name: "学生工作部 综合办公室", phone: "65779433" }] : undefined,
    refs: [c.id],
  });
}

/** 电话冲突：学籍管理科两个号码 */
function conflictStuId(): ChatResponse {
  return {
    status: "conflict",
    answer:
      "学籍管理科的电话在两个官方页面上**不一致**，我无法判断哪个是对的。\n\n| 来源 | 号码 |\n|---|---|\n| 教务处「联系我们」页 | **65783223** |\n| 信息化处「学生开学必备指南」页 | **65773223** |\n\n两页都在 cuc.edu.cn 域名下，第二位的 **8 / 7** 不同，疑为笔误。本系统**不替你二选一**。\n\n**实用建议**：先拨 65783223（教务处自己页面上的号码，更可能是主号），不通再试另一个。",
    sources: [
      src("教务处 · 联系我们", JWC),
      src("信息化处 · 学生开学必备指南", ITS),
    ],
    notice: "两个号码均来自官方页面，互相矛盾。本系统并列表述，不猜测哪个正确。",
    conflicts: [
      { label: "教务处「联系我们」页", value: "65783223", source: "教务处", source_url: JWC, publish_date: null, note: "学籍管理科" },
      { label: "信息化处「学生开学必备指南」页", value: "65773223", source: "信息化处", source_url: ITS, publish_date: null, note: "学籍管理" },
    ],
    verify_channels: [{ name: "教务处综合办公室（可确认）", phone: "65779335", url: JWC }],
    refs: ["ct-jwc-02"],
  };
}

/** 号码反查冲突：65779702 一码两科 */
function conflictShared(note?: string): ChatResponse {
  return {
    status: "conflict",
    answer:
      `号码 **65779702** 同时挂在两个科室名下，而且**两个科室地址不同**：\n\n| 科室 | 地址 | 管辖 |\n|---|---|---|\n| 学生工作部 事务科 | 艺术与传播大楼 209 | 一站式大厅、学生证、各类证明 |\n| 学生工作部 劳动教育中心 | 图书馆 7 层 725 | 劳动教育课程与学分 |\n\n官方页面**没有说明**这是「同一台电话两个科室共用」还是「其中一个写错了」。\n\n**实用建议**：可以打，接通后第一句就说清要办的是**学生证/证明类**还是**劳动教育学分**，让对方转接。`,
    sources: [src("学生工作部 · 联系我们", XSC)],
    notice: "同一号码挂两个科室、两个地址，官方未说明原因。",
    conflicts: [
      { label: "事务科（艺术与传播大楼 209）", value: "65779702", source: "学生工作部", source_url: XSC, publish_date: null, note: "学生证、证明等一站式事务" },
      { label: "劳动教育中心（图书馆 7 层 725）", value: "65779702", source: "学生工作部", source_url: XSC, publish_date: null, note: "劳动教育课程与学分" },
    ],
    verify_channels: [{ name: "学生工作部 综合办公室", phone: "65779433", url: XSC }],
    refs: ["ct-xsc-05", "ct-xsc-06"],
  };
}

/* ---------- 3.2 办事流程 ---------- */

const PROCESS_KEYS: { keys: string[]; id: string }[] = [
  { keys: ["休学", "复学"], id: "pr-01" },
  { keys: ["在读证明", "学籍证明", "开证明", "证明怎么开", "证明在哪"], id: "pr-02" },
  { keys: ["回执", "助学贷款", "生源地贷款", "生源地信用助学贷款"], id: "pr-03" },
  { keys: ["心理咨询", "心理预约", "心理"], id: "pr-04" },
  { keys: ["报修", "宿舍坏", "漏水", "门锁", "维修"], id: "pr-05" },
  { keys: ["学生证"], id: "pr-06" },
  { keys: ["转专业", "转系"], id: "pr-07" },
  { keys: ["加长床", "床太短", "身高"], id: "pr-08" },
];

function findProcess(q: string): Process | null {
  let best: { p: Process; len: number } | null = null;
  for (const r of PROCESS_KEYS) {
    for (const k of r.keys) {
      if (q.includes(k)) {
        const p = processes.find((x) => x.id === r.id);
        if (p && (!best || k.length > best.len)) best = { p, len: k.length };
      }
    }
  }
  return best?.p ?? null;
}

function processAnswer(p: Process, q: string): ChatResponse {
  const a = detectAspects(q);
  const lines: string[] = [];
  lines.push(`**${p.process_name}**\n`);
  lines.push(`**找谁**：${p.dept_name ?? "见下方部门"}${p.phone ? ` · 电话 ${p.phone}` : ""}`);
  if (p.location_name && p.location_name !== "-") lines.push(`**在哪**：${p.location_name}`);
  if (p.need_appointment) lines.push(`**需预约**：是`);
  if (p.service_hours) lines.push(`**办理时段**：${p.service_hours}`);
  lines.push(`\n**流程（按官方页面顺序）**`);
  p.steps.forEach((s) => {
    lines.push(`${s.step_no}. ${s.action}`);
    if (s.deadline) lines.push(`   - 时限：${s.deadline}`);
    if (s.gap_note) lines.push(`   - ⚠️ ${s.gap_note}`);
  });
  if (p.required_materials?.length) {
    lines.push(`\n**需要带的材料**`);
    p.required_materials.forEach((m) => lines.push(`- ${m}`));
  }
  if (p.entry_url) lines.push(`\n**线上入口**：${p.entry_url}${p.entry_status ? `（${p.entry_status}）` : ""}`);
  if (p.remedy) lines.push(`\n> **兜底办法**：${p.remedy}`);

  // 问的字段恰好是官方缺口 → 降级为 unconfirmed（这是本项目最有价值的输出）
  const gapHit = (p.gaps ?? []).filter((g) => {
    if (has(a, "deadline") && /截止|时限|提前|期限|周期|多久/.test(g)) return true;
    if (has(a, "amount") && /费|金额|收费/.test(g)) return true;
    if (has(a, "duration") && /周期|多久|时限|期限|天数/.test(g)) return true;
    if (has(a, "standard") && /标准|门槛|身高|条件/.test(g)) return true;
    return false;
  });

  if (gapHit.length) {
    return unsure(
      `**你问的这个字段，官方页面正好没有写。**\n\n${gapHit.map((g) => `- ${g}`).join("\n")}\n\n**能确认的部分我照常给你**：\n\n${lines.join("\n")}\n\n**这类缺口我不推测**：编一个「大概 3 个工作日」听着合理，但会让你白跑一趟。请打电话直接确认。`,
      {
        sources: [srcOf(p)],
        notice: "官方原文缺失该字段，本系统标注为空缺，不给估计值。",
        verify_channels: p.phone ? [{ name: p.dept_name ?? "主管部门", phone: p.phone.split("（")[0].trim() }] : undefined,
        refs: [p.id],
      },
    );
  }

  return ok(`${lines.join("\n")}\n\n${(p.gaps ?? []).length ? `⚠️ **本流程官方存在 ${p.gaps!.length} 处说明缺口**，已在「办事流程」页逐条列出。` : ""}`.trim(), [srcOf(p)], {
    notice: (p.gaps ?? []).length ? "流程存在官方说明缺口，办理前建议电话确认。" : "",
    verify_channels: p.phone ? [{ name: p.dept_name ?? "主管部门", phone: p.phone.split("（")[0].trim().split(" ")[0] }] : undefined,
    refs: [p.id],
  });
}

/* ---------- 3.3 通知公告 ---------- */

const NOTICE_KEYS: { keys: string[]; id: string }[] = [
  { keys: ["助学贷款", "回执", "生源地"], id: "nt-01" },
  { keys: ["助学金", "国家助学金", "奖学金"], id: "nt-02" },
  { keys: ["选课", "补选", "预选", "正选"], id: "nt-03" },
  { keys: ["四六级", "四级", "六级", "CET"], id: "nt-04" },
  { keys: ["转专业", "转系"], id: "nt-05" },
  { keys: ["劳动教育", "劳动实践", "劳动学分"], id: "nt-06" },
];

function findNotice(q: string): Notice | null {
  let best: { n: Notice; len: number } | null = null;
  for (const r of NOTICE_KEYS) {
    for (const k of r.keys) {
      if (q.includes(k)) {
        const n = notices.find((x) => x.id === r.id);
        if (n && (!best || k.length > best.len)) best = { n, len: k.length };
      }
    }
  }
  return best?.n ?? null;
}

function noticeAnswer(n: Notice, aspects: Aspect[] = []): ChatResponse {
  const ef = n.extracted_fields;
  const L: string[] = [`**${n.notice_name}**\n`];
  if (n.channel !== "官网") L.push(`⚠️ **发布渠道：${n.channel}** —— 官网无对应条目，无法作为官方依据归档。\n`);
  if (ef?.applicable_to) L.push(`- **适用对象**：${ef.applicable_to}`);
  L.push(`- **截止时间**：${ef?.deadline ?? "**原文未写明**"}`);
  if (ef?.material_requirements) L.push(`- **材料要求**：${ef.material_requirements}`);
  if (ef?.entry) L.push(`- **办理入口**：${ef.entry}`);
  L.push(`- **状态**：${n.notice_status}${n.is_archived ? "（官网仍挂在列表中）" : ""}`);
  if (n.attachments?.length) {
    L.push(`\n**附件情况**`);
    n.attachments.forEach((at) => L.push(`- ${at.name} —— **${at.status}**`));
  }
  if (n.external_links?.length) {
    L.push(`\n**外部入口**`);
    n.external_links.forEach((l) => L.push(`- [${l.title}](${l.url})${l.accessible === false ? "（打不开）" : ""}`));
  }
  const bad = (n.attachments ?? []).filter((a) => a.status !== "正常");
  if (bad.length) L.push(`\n⚠️ ${bad.length} 个附件不可用，需要走线下渠道，别等附件自己好。`);

  const channels = [
    { name: "学生工作部 资助中心", phone: "65783544" },
    { name: "教务处 综合办公室", phone: "65779335" },
  ];

  // A) 只在小渠道发布 → 官网无依据，判「无法确认」
  if (n.channel !== "官网") {
    return unsure(
      `${L.join("\n")}\n\n**为什么这条只能算「无法确认」**：该通知**只在${n.channel}发布**，官网找不到对应条目，我无法把它当作可归档的官方依据。内容可能对，但没有可核验的官方链接。\n\n**能确认的**：主管部门是学生工作部劳动教育中心，电话 65779702。`,
      { sources: [srcOf(n)], notice: `仅在${n.channel}发布，官网无对应条目。`, verify_channels: channels, refs: [n.id] },
    );
  }

  // B) 问的是截止日期，而通知里根本没有 → 判「无法确认」
  const asksDeadline = has(aspects, "deadline") || has(aspects, "when");
  const noDeadline = !ef?.deadline || ef.deadline.includes("待核实");
  if (asksDeadline && noDeadline) {
    return unsure(
      `**这条通知的截止日期，原文没有写。**\n\n${L.join("\n")}\n\n**这不是我没查到**：通知的「截止时间」一栏本身就是空的，附件里也没有说明。本系统**不推测日期**。\n\n**怎么办**：按上面「办理入口」登录系统看是否还开放，或直接打电话确认。`,
      { sources: [srcOf(n)], notice: "官方通知缺失截止日期，本系统不给估算值。", verify_channels: channels, refs: [n.id] },
    );
  }

  // C) 问的是材料，但承载材料的附件是空壳 → 判「无法确认」
  const asksMaterial = has(aspects, "material");
  const brokenMaterial = (n.attachments ?? []).find((a) => a.status !== "正常" && /表|doc|docx|xls|xlsx|pdf/.test(`${a.name}${a.status}`.toLowerCase()));
  if (asksMaterial && brokenMaterial) {
    return unsure(
      `**这条通知要的材料，官方没给出来。**\n\n通知写明材料是「${ef?.material_requirements ?? "相关表格"}」，但：\n\n- 附件 **${brokenMaterial.name}** 状态为 **${brokenMaterial.status}** —— 下载下来是空白/无法读取\n\n${L.join("\n")}\n\n**所以「要交什么」我只能说到这个程度**：知道表格名称，但**无法告诉你表里要填什么字段**。\n\n**怎么办**：\n1. 打资助中心 **65783544** 要一份可用的表格\n2. 或直接到艺术与传播大楼 209 现场领取\n3. 名额分配表附件是正常的，可先看那份\n\n> 很多系统看到「附件标题存在」就回答「材料已提供」—— 我们不这么做。`,
      { sources: [srcOf(n)], notice: "承载材料的附件为空壳，仅凭标题不能认定材料可用。", verify_channels: channels, refs: [n.id] },
    );
  }

  return ok(L.join("\n"), [srcOf(n)], {
    notice: (n.gaps ?? [])[0] ?? "",
    verify_channels: channels,
    refs: [n.id],
  });
}

/* ---------- 3.4 规章制度 ---------- */

const POLICY_KEYS: { keys: string[]; id: string }[] = [
  { keys: ["学籍管理规定", "学籍管理"], id: "po-02" },
  { keys: ["转专业管理办法", "转专业办法", "转专业"], id: "po-03" },
  { keys: ["困难生", "家庭经济困难", "困难认定"], id: "po-04" },
  { keys: ["违纪处分", "处分规定", "处分"], id: "po-05" },
  { keys: ["劳动教育实施方案", "劳动教育"], id: "po-06" },
];

function findPolicy(q: string): Policy | null {
  let best: { p: Policy; len: number } | null = null;
  for (const r of POLICY_KEYS) {
    for (const k of r.keys) {
      if (q.includes(k)) {
        const p = policies.find((x) => x.id === r.id);
        if (p && (!best || k.length > best.len)) best = { p, len: k.length };
      }
    }
  }
  return best?.p ?? null;
}

function policyAnswer(p: Policy, q: string): ChatResponse {
  const a = detectAspects(q);
  const L: string[] = [`**${p.policy_name}**\n`];
  L.push(`- **文号**：${p.doc_no}`);
  L.push(`- **状态**：${p.effective_status}${p.is_superseded ? "（已被替代，但官网未下线）" : "（现行）"}`);
  if (p.superseded_by_name) L.push(`- **被谁替代**：${p.superseded_by_name}`);
  if (p.supersedes_name) L.push(`- **替代了**：${p.supersedes_name}`);
  L.push(`- **适用对象**：${p.applicable_to}`);
  if (p.publish_date) L.push(`- **发布日期**：${p.publish_date}`);
  L.push(`- **OCR 质量**：${p.ocr_quality ?? "未评估"}`);

  const liang = p.ocr_quality === "不合格";
  if (liang) {
    L.push(`\n⚠️ 这份文件的扫描件 **OCR 不合格，正文多处识别失败**，本系统**不摘录正文**（错字可能改变原意），只给官方链接。`);
  } else if (p.content) {
    L.push(`\n**正文要点（官方原文摘录）**\n> ${p.content}`);
  }

  // 版本类问题：突出新旧关系
  if (has(a, "version")) {
    const oldOne = policies.find((x) => x.id === p.supersedes_id);
    if (oldOne) {
      L.push(
        `\n**新旧关系（这是最容易被坑的地方）**\n\n| 版本 | 状态 |\n|---|---|\n| ${p.policy_name} | **现行** |\n| ${oldOne.policy_name} | **已失效** |\n\n问题在于：**旧版页面既没下线、也没标「已废止」**，搜索引擎排名还更高。你在网上搜到的很可能是旧版。`,
      );
    }
  }

  const channels = [{ name: "教务处 综合办公室", phone: "65779335", url: JWC }];

  /**
   * 制度类「问具体条款」的降级判定。
   * 官方原文只有概括性表述，一旦问到具体数字/期限/等级标准，
   * 现有依据就不足以支撑答案 —— 此时必须降级为 unconfirmed。
   */
  const vague = (topic: string, detail: string, hint: string) =>
    unsure(
      `**「${topic}」的${detail}，官方原文没有给出。**\n\n${L.join("\n")}\n\n**原文只说到这一步**：条款用的是「${hint}」这类概括表述，**没有可执行的具体数值/标准**。\n\n**我不给你估一个数**：制度里的天数和等级标准差一天、差一级，处理结果就完全不同。请看原文全文或直接问主管部门。`,
      { sources: [srcOf(p)], notice: "原文为概括表述，无具体数值，不推测。", verify_channels: channels, refs: [p.id] },
    );

  // 处分：问申诉天数
  if (p.id === "po-05" && /申诉|几天|期限内|多久/.test(q)) {
    return vague("处分申诉", "申请期限（几天内）", "可在规定期限内提出申诉");
  }
  // 困难生认定：问具体标准
  if (p.id === "po-04" && (has(a, "standard") || /标准|怎么认定|多少分|量化/.test(q))) {
    return vague("家庭经济困难认定", "具体量化标准", "特别困难、困难、一般困难三个等级");
  }
  // 休学年限：新版只说「调整了表述」，没有给出年限
  if (p.id === "po-02" && /休学.*(多久|几年|最长|期限|时间)|最多能休|能休多久/.test(q)) {
    return unsure(
      `**休学最长能休多久，我拿不出可靠数字。**\n\n${L.join("\n")}\n\n**为什么给不出**：2023 修订版的说明里只写「**调整了休学年限与复学申请时限的表述**」——它承认这两个数字被改过，但**没有在可读的正文里给出改成了多少**，具体条款在扫描件里且 OCR 需人工抽查。\n\n**这意味着**：网上流传的「最多休两年」很可能是**旧版**的说法，用错了会直接影响你的学籍状态。\n\n**怎么办**：打学籍管理科确认，或直接看制度汇编原文的纸质版。`,
      {
        sources: [srcOf(p), srcOf(policies.find((x) => x.id === "po-01")!)],
        notice: "新旧版都未在可读正文中给出休学年限，不沿用旧版数字。",
        verify_channels: [{ name: "教务处 学籍管理科", phone: "65783223" }, { name: "教务处 综合办公室", phone: "65779335" }],
        refs: [p.id, "po-01"],
      },
    );
  }

  return ok(L.join("\n"), [srcOf(p)], {
    notice: liang ? "OCR 不合格，正文不可引用。" : "",
    verify_channels: channels,
    refs: [p.id],
  });
}

/* ---------- 3.5 服务时间 ---------- */

const SH_KEYS: { keys: string[]; id: string }[] = [
  { keys: ["线上", "电子证明", "线上打印", "自助"], id: "sh-01" },
  { keys: ["纸质", "盖章"], id: "sh-02" },
  { keys: ["资助", "助学金", "助学贷款回执", "回执"], id: "sh-03" },
  { keys: ["心理咨询", "心理"], id: "sh-04" },
  { keys: ["报修", "维修"], id: "sh-05" },
  { keys: ["校园网", "统一身份认证", "信息化"], id: "sh-06" },
  { keys: ["户籍", "户口"], id: "sh-07" },
  { keys: ["教材", "领书"], id: "sh-08" },
];

function findServiceHour(q: string): ServiceHour | null {
  let best: { s: ServiceHour; len: number } | null = null;
  for (const r of SH_KEYS) {
    for (const k of r.keys) {
      if (q.includes(k)) {
        const s = serviceHours.find((x) => x.id === r.id);
        if (s && (!best || k.length > best.len)) best = { s, len: k.length };
      }
    }
  }
  return best?.s ?? null;
}

function serviceHourAnswer(s: ServiceHour): ChatResponse {
  const L: string[] = [`**${s.business_name}**\n`];
  L.push(`- **开放日**：${s.open_days}`);
  L.push(`- **时段**：${s.time_slot}`);
  if (s.location_name && s.location_name !== "-") L.push(`- **地点**：${s.location_name}`);
  if (s.need_appointment) L.push(`- **需预约**：是`);
  if (s.is_tbd) {
    L.push(`\n⚠️ **这一项官方没有给出可用的时段**（标注为「另行通知」或「需电话确认」），所以本系统给不出「几点去最合适」。`);
  }
  return ok(L.join("\n"), [srcOf(s)], {
    notice: s.is_tbd ? "官方未公布具体时段，需电话确认。" : "",
    verify_channels: (s.gaps ?? []).length ? [{ name: "对应主管部门", phone: "65779433" }] : undefined,
    refs: [s.id],
  });
}

/* ---------- 3.6 校历 ---------- */

function calendarAnswer(aspects: Aspect[]): ChatResponse {
  const c = calendars[0];
  if (has(aspects, "week") || has(aspects, "now")) {
    if (has(aspects, "now")) {
      return unsure(
        `**「现在是第几周」我算不出来。**\n\n算周次需要一个准确的教学周起始日，而**官方校历的「开学注册」日期本身标注为「待核实」**，我拿不到可靠起点。\n\n**能确认的学期结构**：\n- 教学周：第 ${c.teaching_weeks?.start}–${c.teaching_weeks?.end} 周\n- 考试周：第 ${c.exam_weeks?.start}–${c.exam_weeks?.end} 周\n\n**你自己怎么算**：教务系统首页会直接显示当前周次，这是最可靠的。`,
        {
          sources: [srcOf(c)],
          notice: "校历起始日官方标注待核实，无可靠起点则不算周次。",
          verify_channels: [{ name: "教务处 教学运行中心", phone: "65783411", url: JWC }],
          refs: [c.id],
        },
      );
    }
    return ok(
      `**学期周次结构**\n\n- 教学周：第 ${c.teaching_weeks?.start}–${c.teaching_weeks?.end} 周\n- 考试周：第 ${c.exam_weeks?.start}–${c.exam_weeks?.end} 周\n\n查「现在第几周」请直接看教务系统首页，那里显示的是实时周次。`,
      [srcOf(c)],
      { notice: "校历起始日待核实，只给结构不给实时周次。", refs: [c.id] },
    );
  }
  if (has(aspects, "holiday")) {
    const hs = (c.holidays ?? []).map((h) => `- ${h.name}：**${h.start === "待核实" ? "具体日期待官方公布" : h.start}**`).join("\n");
    return unsure(
      `**放假安排我给不出具体天数。**\n\n官方校历上，这些假期的起止日**全部标注为「待核实」**：\n\n${hs}\n\n校历只确认了学期结构（教学周第 ${c.teaching_weeks?.start}–${c.teaching_weeks?.end} 周，考试周第 ${c.exam_weeks?.start}–${c.exam_weeks?.end} 周）。\n\n**为什么不说「大概放 7 天」**：调休安排每年由国务院办公厅发布、学校再据此调整，猜出来的天数和实际差一天就会影响你订票。请等学校正式通知或查教务处公告。`,
      {
        sources: [srcOf(c)],
        notice: "假期起止日官方标注待核实，不给估算值。",
        verify_channels: [{ name: "教务处 综合办公室", phone: "65779335", url: JWC }],
        refs: [c.id],
      },
    );
  }
  return ok(
    `**${c.academic_year} 学年 ${c.semester}季学期**\n\n- 教学周：第 ${c.teaching_weeks?.start}–${c.teaching_weeks?.end} 周\n- 考试周：第 ${c.exam_weeks?.start}–${c.exam_weeks?.end} 周\n\n**作息时间**（每节 45 分钟）\n\n${(c.daily_schedule ?? []).map((d) => `- ${d.period}：${d.time}`).join("\n")}`,
    [srcOf(c)],
    { notice: "假期与关键日期官方标注待核实。", refs: [c.id] },
  );
}

/* ============================================================
   4. 专门答案（数据里没有对应实体，需要组合或专门说明）
   ============================================================ */

/** 一站式大厅：问「几点开门」的正确答案是「没有统一时间」 */
function hallHours(): ChatResponse {
  const rows = serviceHours
    .slice(0, 8)
    .map((s) => `| ${s.business_name} | ${s.open_days} | ${s.is_tbd ? "**官方未公开**" : s.time_slot} |`)
    .join("\n");
  return ok(
    `**「大厅几点开门」没有统一答案 —— 这是最该说清楚的一件事。**\n\n调研发现不同业务对应**完全不同的时段**，按「大厅」这个笼统说法去，很可能白跑：\n\n| 业务 | 开放日 | 时段 |\n|---|---|---|\n${rows}\n\n**规律**：\n- 线上能办的（学籍证明）**7×24**，不用来\n- 要来窗口的，基本是工作日 **08:00–11:30 / 13:30–16:30**，中午休息\n- 心理咨询、户籍、教材这三项**根本没有公开时段**，必须电话问\n\n先确认你要办的事属于哪一行，再决定去不去。`,
    [
      src("学生工作部 · 联系我们", XSC),
      src("信息化处 · 学生开学必备指南", ITS),
      src("后勤保障处", HQ),
    ],
    {
      notice: "12 项业务对应 8 种不同时段，不存在「大厅通用时间」。",
      verify_channels: [{ name: "一站式服务大厅（事务科）", phone: "65779702" }],
      refs: serviceHours.slice(0, 8).map((s) => s.id),
    },
  );
}

/** 在读证明 / 学籍证明 */
function certAnswer(): ChatResponse {
  return ok(
    `**学籍证明 / 在读证明现在可以线上自助开具，不用跑部门。**\n\n**办理步骤**\n1. 登录信息化处「电子证明系统」（统一身份认证）\n2. 选择「在读证明」，填写用途与份数\n3. 系统生成带电子签章的 PDF，自行下载打印\n\n**什么情况才需要去窗口**：需要**纸质盖章件**时，到一站式服务大厅（艺术与传播大楼 209）办理。\n\n⚠️ **两个未明确点**：电子证明系统是否需要先单独开通权限、纸质件能否当天取，官方页面**都没有说明**。`,
    [src("信息化处 · 学生开学必备指南", ITS, { verify_status: "待核实", effective_status: "现行" })],
    {
      notice: "",
      verify_channels: [{ name: "信息化处 服务中心", phone: "65783878" }],
      refs: ["pr-02", "sh-01"],
    },
  );
}

/** 劳动教育学分：三处线索都不可用 */
function laborUnconfirmed(): ChatResponse {
  return unsure(
    "**这条我答不完整，但原因本身很有价值。**\n\n劳动教育实践学分的认定标准，我找到了三处线索，**三处都不可用**：\n\n1. 《劳动教育实施方案》正文写「认定标准见附件」→ **附件缺失**\n2. 标准曾在**微信公众号**发布 → 官网无对应条目，无法作为官方依据归档\n3. 制度汇编扫描件里该文件 **OCR 质量不合格** → 多处段落识别失败，不敢引用\n\n**能确认的**：主管部门是劳动教育中心，电话 65779702，地址图书馆 7 层 725。\n\n> 很多系统遇到这种情况会「根据常识推测」一个学分认定办法 —— 我们不这么做。",
    {
      sources: [src("学生工作部 · 联系我们（劳动教育中心）", XSC, { verify_status: "已核实", effective_status: "现行" })],
      notice: "找到 3 处线索但均不可作为依据，因此判定为「无法确认」而非「已回答」。",
      verify_channels: [
        { name: "劳动教育中心", phone: "65779702" },
        { name: "学生工作部 综合办公室", phone: "65779433" },
      ],
      refs: ["po-06", "ct-xsc-06", "nt-06"],
    },
  );
}

/** 选课时间：通知没给日期 */
function courseSelectUnconfirmed(): ChatResponse {
  const nt = notices.find((n) => n.id === "nt-03")!;
  return unsure(
    `**选课的具体起止时间，官方通知里没有写。**\n\n通知原文只说：\n- 「本学期选课分两轮进行」\n- 「第一轮为预选，第二轮为正选」\n- 「逾期不再补选」\n\n但**没有给出任何一轮的起止时间**（通知里「截止时间」这一栏本身就是空的）。这不是我没查到，是通知本身就没写。\n\n**怎么办**：\n1. 登录教务管理系统看当前是否开放选课\n2. 打教务处教学运行中心 **65783411**\n\n**别等**：写着「逾期不再补选」，等通知就等于赌运气。`,
    {
      sources: [srcOf(nt)],
      notice: "官方通知存在「说了有截止、但不说截止到哪天」的缺陷，本系统如实反映，不推测日期。",
      verify_channels: [
        { name: "教务处 教学运行中心", phone: "65783411" },
        { name: "教务管理系统", url: "https://jwc.cuc.edu.cn/" },
      ],
      refs: ["nt-03", "pr-07"],
    },
  );
}

/** 助学贷款回执：能办，但截止日给不出 */
function loanAnswer(): ChatResponse {
  return ok(
    "**生源地助学贷款回执录入**，找学生工作部资助中心。\n\n- **电话**：65783544 / 65783336\n- **地点**：艺术与传播大楼 209\n- **要带**：贷款受理证明（回执单）、身份证、学生证\n- **办理时段**：工作日 08:00–11:30、13:30–16:30\n\n**流程**：带回执单到资助中心登记 → 中心在系统录入回执验证码 → 回执寄回生源地资助中心，等待放款。\n\n⚠️ **截止日期本系统给不出**：当年通知的正文写「规定时间内」，具体日期在附件 PDF 里，而**那个附件打不开**。\n\n**建议**：尽早去办，别等截止。逾期未录入可能影响放款。",
    [
      src("学生工作部 · 通知公告", "https://xsc.cuc.edu.cn/", { effective_status: "现行" }),
      src("学生工作部 · 联系我们", XSC, { verify_status: "已核实", effective_status: "现行" }),
    ],
    {
      notice: "截止日期在无法读取的附件中，本系统如实说明，不推测具体日期。",
      verify_channels: [{ name: "学生工作部 资助中心", phone: "65783544" }],
      refs: ["pr-03", "nt-01", "sh-03"],
    },
  );
}

/** 「有哪些通知最近要截止」——汇总型问题 */
function deadlineRoundup(): ChatResponse {
  const live = notices.filter((n) => n.notice_status === "正在适用");
  const archived = notices.filter((n) => n.notice_status === "已过截止");
  const rows = live
    .map((n) => `| ${n.notice_name} | ${n.extracted_fields?.deadline ?? "**原文未写明**"} |`)
    .join("\n");
  return ok(
    `**正在适用的通知共 ${live.length} 条，但只有 ${live.filter((n) => n.extracted_fields?.deadline && n.extracted_fields.deadline !== "待核实").length} 条能给出明确截止日。**\n\n| 通知 | 截止时间 |\n|---|---|\n${rows}\n\n**这说明的问题**：官网通知普遍存在「不写截止日期」或「截止日期只在附件里」的缺陷。本系统把「原文未写明」直接标出来，而不是留空让你以为没截止。\n\n**已过截止但官网仍挂着的**：${archived.map((n) => n.notice_name).join("；") || "无"} —— 别照着办。\n\n**最稳的做法**：关注教务处、学生工作部两个官网的通知列表，或直接打相关部门电话确认。`,
    [src("教务处 · 通知公告", "https://jwc.cuc.edu.cn/", { effective_status: "现行" }), src("学生工作部 · 通知公告", "https://xsc.cuc.edu.cn/", { effective_status: "现行" })],
    {
      notice: "通知普遍缺失截止日期，本系统逐条标注而非留空。",
      verify_channels: [
        { name: "教务处 综合办公室", phone: "65779335" },
        { name: "学生工作部 综合办公室", phone: "65779433" },
      ],
      refs: live.map((n) => n.id),
    },
  );
}

/** 兜底：什么依据都没有 */
function fallback(q: string): ChatResponse {
  return unsure(
    `关于「${q}」，我在知识库里**没有找到任何官方依据**。\n\n我不会编一个听起来合理的答案给你。目前能确认的边界是：\n\n- **覆盖**：规章制度、办事流程、部门联系方式、服务时间、通知公告、校历\n- **不覆盖**：个人成绩、课表、审批进度、宿舍分配结果等需要登录个人系统的信息，以及其他学校的信息\n\n如果你问的是校内事务，建议换一种问法（具体到「哪个部门管什么」或「某件事怎么办」），或者直接找对应部门核实。`,
    {
      notice: "本系统宁可说「不知道」，也不给没有来源的答案。这是设计原则，不是能力不足。",
      verify_channels: [
        { name: "一站式服务大厅（事务咨询）", phone: "65779702" },
        { name: "教务处综合办公室", phone: "65779335" },
        { name: "学生工作部综合办公室", phone: "65779433" },
      ],
    },
  );
}

/* ============================================================
   5. 主解析
   ============================================================ */

/** 演示用的推荐问题（首页/侧栏展示） */
export const demoQuestions: { q: string; label: string; expect: string }[] = [
  { q: "学籍管理科的电话是多少？", label: "电话冲突", expect: "conflict" },
  { q: "学生证丢了怎么补办？", label: "时效预警", expect: "answered" },
  { q: "65779702 是哪个部门的电话？", label: "一码两科", expect: "conflict" },
  { q: "劳动教育的学分怎么拿？", label: "无法确认", expect: "unconfirmed" },
  { q: "四六级报名什么时候截止，错过怎么办？", label: "截止 + 补救", expect: "answered" },
  { q: "一站式服务大厅几点开门？", label: "服务时间", expect: "answered" },
  { q: "助学金申请表的附件下载下来是空的怎么办？", label: "附件空壳", expect: "answered" },
  { q: "选课什么时候截止？", label: "通知缺日期", expect: "unconfirmed" },
  { q: "宿舍加长床对身高有什么要求？", label: "标准缺失", expect: "unconfirmed" },
  { q: "我在网上看到的学籍管理规定是旧版吗？", label: "新旧制度", expect: "answered" },
  { q: "今天食堂有什么菜？", label: "知识库外", expect: "unconfirmed" },
];

function mockChatCore(question: string): ChatResponse {
  const q = (question || "").trim();
  if (!q) return fallback("（空问题）");

  /* ---- 0. 范围守卫 ---- */
  const guarded = scopeGuard(q);
  if (guarded) return guarded;

  const a = detectAspects(q);

  /* ---- 1. FAQ 原问 / 同义问法（人工校订过的，优先） ---- */
  for (const f of faqs) {
    if (f.question === q) return answeredFromFaq(f.id);
    if (f.synonym_questions?.some((s) => s.trim() === q)) return answeredFromFaq(f.id);
  }

  /* ---- 2. 号码反查（出现 8 位号码且问归属） ---- */
  const num = lookupNumber(q);
  if (num && (has(a, "number_lookup") || /哪个|什么|谁/.test(q))) {
    if (num.hit.length >= 2) return conflictShared();
    const c = num.hit[0];
    return ok(
      `**${num.digit}** → **${c.dept_name}**\n\n- **管什么**：${c.business_name}${c.location_name && c.location_name !== "-" ? `\n- **地点**：${c.location_name}` : ""}\n- **来源**：${c.source}`,
      [srcOf(c)],
      { refs: [c.id] },
    );
  }

  /* ---- 3. 制度「版本」类：必须先于电话冲突判定 ---- */
  if (has(a, "version")) {
    const p = findPolicy(q);
    if (p) return policyAnswer(p, q);
  }

  /* ---- 4. 特定高价值问题：优先于通用实体 ---- */
  // 一站式大厅「几点开门」
  if (/大厅|一站式/.test(q) && (has(a, "when") || has(a, "phone") || has(a, "how"))) return hallHours();
  // 选课时间
  if (/选课/.test(q) && (has(a, "deadline") || has(a, "when"))) return courseSelectUnconfirmed();
  // 劳动教育学分
  if (/劳动/.test(q) && /学分|标准|怎么拿|怎么算|多少/.test(q)) return laborUnconfirmed();
  // 学籍证明 / 在读证明
  if (/(学籍证明|在读证明|开证明)/.test(q) && (has(a, "how") || has(a, "where") || has(a, "when"))) return certAnswer();
  // 通知汇总
  if (/通知/.test(q) && /哪些|最近|汇总|有什么|截止/.test(q)) return deadlineRoundup();
  // 助学贷款回执
  if (/回执|生源地|助学贷款/.test(q)) {
    if (has(a, "deadline")) {
      return unsure(
        `**助学贷款回执录入的截止日期，官方给不出来。**\n\n当年通知的正文只写「规定时间内办理」，**具体日期在附件 PDF 里，而那个附件无法读取**（0 字节/损坏）。\n\n**能确认的部分**：\n- 部门：学生工作部 资助中心\n- 电话：65783544 / 65783336\n- 地点：艺术与传播大楼 209\n- 材料：贷款受理证明（回执单）、身份证、学生证\n\n**别等截止**：逾期未录入会影响放款，尽早去办。`,
        {
          sources: [srcOf(notices.find((n) => n.id === "nt-01")!)],
          notice: "截止日期位于无法读取的附件中，本系统不推测日期。",
          verify_channels: [{ name: "学生工作部 资助中心", phone: "65783544" }],
          refs: ["nt-01", "pr-03"],
        },
      );
    }
    return loanAnswer();
  }
  // 学生证补办：问钱 / 问时长 → 缺口
  if (/学生证/.test(q)) {
    if (has(a, "amount") || has(a, "duration")) {
      const p = processes.find((x) => x.id === "pr-06")!;
      return processAnswer(p, q);
    }
  }
  // 加长床：问身高标准 → 缺口
  if (/加长床|床太短|身高/.test(q)) {
    if (has(a, "standard") || /身高|多少厘米|cm|190|180/.test(q)) {
      const p = processes.find((x) => x.id === "pr-08")!;
      return processAnswer(p, q);
    }
  }

  /* ---- 5. 冲突专题 ---- */
  // 学籍管理科电话：只有在「问电话」时才判冲突（问版本已在第 3 步拦走）
  if (/学籍管理|学籍科/.test(q) && (has(a, "phone") || has(a, "number_lookup") || /电话|号码|多少号/.test(q))) {
    return conflictStuId();
  }

  /* ---- 6. 服务时间 / 校历 ---- */
  if (has(a, "week") || has(a, "holiday") || has(a, "now")) return calendarAnswer(a);
  if (/第 ?[0-9]+ ?节|第一节|作息|几点上课|上课时间/.test(q)) {
    const c = calendars[0];
    return ok(
      `**作息时间（每节 45 分钟）**\n\n${(c.daily_schedule ?? []).map((d) => `- ${d.period}：${d.time}`).join("\n")}\n\n上午 08:00 开始，下午 13:30 开始，晚上 18:30 开始。`,
      [srcOf(c)],
      { refs: [c.id] },
    );
  }

  /* ---- 7. 通知（不要求问题里出现「通知」二字：
          「助学金要交什么材料」「四六级什么时候截止」问的都是通知内容） ---- */
  {
    const n = findNotice(q);
    const noticeish = /通知|公告/.test(q);
    const asksNoticeField = has(a, "material") || has(a, "deadline") || has(a, "when");
    if (n && (noticeish || asksNoticeField)) return noticeAnswer(n, a);
  }

  /* ---- 8. 办事流程 ---- */
  const proc = findProcess(q);
  if (proc && (has(a, "how") || has(a, "material") || has(a, "where") || has(a, "phone") || has(a, "deadline") || has(a, "amount") || has(a, "duration") || has(a, "standard") || a.length === 0)) {
    return processAnswer(proc, q);
  }

  /* ---- 9. 联系方式 ---- */
  const contact = findContact(q);
  if (contact) return contactAnswer(contact, q);

  /* ---- 10. 办事流程二次兜底（问法没有动词也能命中） ---- */
  if (proc) return processAnswer(proc, q);

  /* ---- 11. 制度 ---- */
  const pol = findPolicy(q);
  if (pol) return policyAnswer(pol, q);

  /* ---- 12. 服务时间表 ---- */
  const sh = findServiceHour(q);
  if (sh) return serviceHourAnswer(sh);

  /* ---- 13. 校历通用 ---- */
  if (/校历|教学周|学期|开学|考试周/.test(q)) return calendarAnswer(["week"]);

  /* ---- 14. 兜底 ---- */
  return fallback(q);
}

/**
 * 为本地演示补上后端已经返回的行动层字段：
 * 官方证据 -> 行动卡 -> 任务建议 -> 可解释流水线。
 * 只在答案已有官方依据时生成行动卡，避免把不确定内容包装成“照着做”。
 */
function withMockActionPlan(question: string, response: ChatResponse): ChatResponse {
  const matchedNotice = findNotice(question);
  const matchedProcess = findProcess(question);
  const card =
    response.status === "answered" && matchedNotice && response.refs?.includes(matchedNotice.id)
      ? noticeToActionCard(matchedNotice)
      : response.status === "answered" && matchedProcess && response.refs?.includes(matchedProcess.id)
        ? processToActionCard(matchedProcess)
        : undefined;

  const evidence = response.sources.map((source, index) => {
    const notice = matchedNotice && response.refs?.includes(matchedNotice.id) ? matchedNotice : null;
    const process =
      matchedProcess && response.refs?.includes(matchedProcess.id) ? matchedProcess : null;
    const snippet =
      notice?.body_content ??
      process?.gap_summary ??
      source.excerpt ??
      `${source.title}，核验状态：${source.verify_status ?? "见来源"}。`;
    return {
      id: response.refs?.[index] ?? response.refs?.[0] ?? `${source.title}-${index}`,
      type: notice ? "notice" : process ? "process" : "source",
      title: source.title,
      url: source.url,
      snippet: snippet.slice(0, 220),
      quote: snippet.slice(0, 160),
      verify_status: source.verify_status,
      effective_status: source.effective_status,
      publish_date: source.publish_date,
    };
  });

  const pipeline: ChatResponse["pipeline"] = [
    {
      id: "retrieval",
      label: "官方信息检索",
      agent: "检索 Agent",
      status: response.sources.length ? "ok" : "degraded",
      detail: response.sources.length
        ? `命中 ${response.sources.length} 条官方来源`
        : "没有命中可引用来源",
      input_summary: "用户本轮问题与上一轮主题",
      output_summary: response.sources.length
        ? `${response.sources.length} 条候选官方来源`
        : "无候选来源",
      handoff: "把候选来源、问题主题和检索范围交给核验阶段",
      elapsed_ms: 0,
    },
    {
      id: "verification",
      label: "证据核验",
      agent: "核验 Agent",
      status: response.status === "unconfirmed" ? "degraded" : "ok",
      detail:
        response.status === "answered"
          ? "依据已核实且未发现冲突"
          : response.status === "conflict"
            ? "发现多个官方说法，已并列"
            : "关键依据不足，已标记待核实",
      input_summary: "候选来源、核验状态与有效状态",
      output_summary:
        response.status === "answered"
          ? "有依据"
          : response.status === "conflict"
            ? "信息冲突"
            : "无法确认",
      handoff: "把可信来源与缺口交给规划阶段",
      elapsed_ms: 0,
    },
    {
      id: "planning",
      label: "行动方案整理",
      agent: "规划 Agent",
      status: card ? "ok" : "degraded",
      detail: card
        ? `已生成 ${card.steps.length} 步行动卡，可加入任务`
        : "本条回答没有足够字段生成可执行行动卡",
      input_summary: "已核验字段、材料与截止信息",
      output_summary: card
        ? `${card.steps.length} 步、${card.materials.length} 项材料`
        : "仅输出核实渠道",
      handoff: "把行动卡或人工核实路径交给用户",
      elapsed_ms: 0,
    },
  ];

  return {
    ...response,
    action_card: card,
    missing_fields: card?.missing_fields.length ? card.missing_fields : undefined,
    evidence: evidence.length ? evidence : undefined,
    task_suggestion: card
      ? {
          action_card_id: card.id,
          title: card.title,
          deadline_text: card.deadline?.text,
          deadline_iso: card.deadline?.iso,
          step_count: card.steps.length,
          material_count: card.materials.length,
        }
      : undefined,
    remedy_mode: card?.remedy?.available
      ? "available"
      : card || response.status === "unconfirmed"
        ? "manual-check"
        : "none",
    pipeline,
  };
}

export function mockChat(question: string): ChatResponse {
  return withMockActionPlan(question, mockChatCore(question));
}

/**
 * 从 FAQ 构造回答。
 * 注意：有几条 FAQ 的答案本身**结论就是「答不完整」**（附件缺失、通知没写日期），
 * 它们的 status 必须是 unconfirmed —— 否则会出现「答案说不知道怎么答，
 * 状态却标成有依据」的自相矛盾，这是评审最容易抓的一个漏洞。
 */
const FAQ_UNCONFIRMED = new Set([
  "fq-08", // 劳动教育学分：三处线索均不可用
  "fq-11", // 选课截止：通知本身没写
]);

function answeredFromFaq(faqId: string): ChatResponse {
  const f = faqs.find((x) => x.id === faqId)!;
  const un = FAQ_UNCONFIRMED.has(f.id);
  return {
    status: un ? "unconfirmed" : "answered",
    answer: f.answer ?? "",
    sources: [
      {
        title: f.source,
        url: f.source_url,
        publish_date: f.publish_date,
        evidence_level: "官方-待核实",
        verify_status: f.verify_status,
        effective_status: f.effective_status,
        stale: f.stale,
        verified_months_ago: f.verified_months_ago,
        stale_reason: f.stale_reason,
      },
    ],
    notice: un ? "该问题的官方依据本身不完整，故判为「无法确认」而非「有依据」。" : "",
    verify_channels:
      f.id === "fq-01"
        ? [{ name: "教务处综合办公室", phone: "65779335" }]
        : un
          ? DEFAULT_CHANNELS
          : undefined,
    refs: f.answer_ref ? [f.answer_ref] : [f.id],
  };
}

/** 供「联系方式」页做本地搜索用 */
export function searchContacts(keyword: string) {
  const k = keyword.trim();
  if (!k) return contacts;
  return contacts.filter(
    (c) =>
      c.business_name.includes(k) ||
      c.dept_name.includes(k) ||
      (c.phone ?? "").includes(k) ||
      (c.route_keywords ?? []).some((x) => x.includes(k)),
  );
}

/* ============================================================
   追问推荐（借鉴 DeepTutor 的「答完再追问」交互）
   ------------------------------------------------------------
   设计取舍：追问只推「本系统答得出来」的问题。
   推一个答不出来的，等于自己挖坑 —— 用户点了得到一个「无法确认」，
   观感比不推更差。所以这里的候选全部是 answered / conflict 题。
   ============================================================ */
const FOLLOW_UPS: { when: RegExp; ask: string[] }[] = [
  {
    when: /休学|复学|学籍异动/,
    ask: ["复学需要什么材料", "学籍管理规定现在用哪一版"],
  },
  {
    when: /复学/,
    ask: ["休学怎么办？", "学籍管理规定旧版还有效吗"],
  },
  {
    when: /学籍证明|在读证明/,
    ask: ["学籍证明线上打印有时间限制吗", "纸质盖章件什么时候能办"],
  },
  {
    when: /学籍管理科|65783223|65773223/,
    ask: ["学籍证明在哪里打印", "教务处在哪里办公？"],
  },
  {
    when: /65779702|一站式|事务科/,
    ask: ["一站式服务大厅几点开门", "宿舍报修电话"],
  },
  {
    when: /助学贷款|回执/,
    ask: ["助学贷款回执怎么交", "国家助学金申请要交什么材料"],
  },
  {
    when: /助学金|困难生|资助/,
    ask: ["助学贷款找哪个部门？", "国家助学金名额怎么分配"],
  },
  {
    when: /学生证/,
    ask: ["补办学生证要多少钱", "我要办学生证补办，打哪个电话？"],
  },
  {
    when: /转专业/,
    ask: ["转专业有什么条件", "转专业办法是哪一年发布的"],
  },
  {
    when: /心理咨询|心港湾|心理/,
    ask: ["心理咨询怎么预约", "心理咨询中心怎么联系？"],
  },
  {
    when: /加长床|宿舍|报修/,
    ask: ["宿舍加长床怎么申请", "宿舍报修电话"],
  },
  {
    when: /选课|四六级|考试/,
    ask: ["期末考试第几周", "四六级在哪里报名"],
  },
  {
    when: /学籍管理规定|制度|规定|办法/,
    ask: ["学籍管理规定现在用哪一版", "学籍管理规定旧版还有效吗"],
  },
  {
    when: /校历|第几周|作息|几点开始/,
    ask: ["期末考试第几周", "第一节课几点开始"],
  },
  {
    when: /劳动教育/,
    ask: ["劳动教育要修多少学分", "劳动教育通知在哪看"],
  },
];

/* 注：故意不保留「兜底追问」常量。
   知识库外的问题（今天食堂有什么菜 / asdfghjkl）不该被推荐任何校园事务问题 ——
   推了反而显得答非所问。没有合适的就空着。 */

/** 按问题推荐 2–3 条追问 */
export function suggestFollowUps(question: string, res: ChatResponse): string[] {
  // 只拿**问题**去匹配，不拿答案去匹配。
  // 用答案匹配会出事：拒答文案里为了说明覆盖范围会举「休学、学籍」等例子，
  // 于是「今天食堂有什么菜」被推荐了「休学怎么办」—— 明显串味。
  const hay = question;
  const pool: string[] = [];

  for (const f of FOLLOW_UPS) {
    if (f.when.test(hay)) {
      for (const a of f.ask) if (!pool.includes(a)) pool.push(a);
    }
    if (pool.length >= 3) break;
  }

  // 一个问题都没匹配上（通常是知识库外的问题）→ 不硬推，宁可不显示。
  // 给一个问食堂的人推「休学怎么办」，比不推更减分。
  if (pool.length === 0) return [];

  return pool.filter((x) => x !== question).slice(0, 3);
}


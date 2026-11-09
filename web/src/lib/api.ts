import { contacts as mockContacts } from "@/lib/mock/contacts";
import { processes as mockProcesses } from "@/lib/mock/processes";
import { notices as mockNotices } from "@/lib/mock/notices";
import { calendars as mockCalendars, serviceHours as mockServiceHours } from "@/lib/mock/calendar";
import { policies as mockPolicies } from "@/lib/mock/policies";
import { faqs as mockFaqs } from "@/lib/mock/faqs";
import { mockChat, suggestFollowUps } from "@/lib/mock/chat";
import type {
  Calendar,
  CalendarWire,
  ChatResponse,
  Contact,
  Faq,
  ListResponse,
  Notice,
  Policy,
  Process,
  ServiceHour,
} from "@/lib/contract";

/**
 * 统一数据/接口层
 * ------------------------------------------------------------
 * 页面只依赖这一层。三件事：
 *
 *  1. 同步 getter  → 永远返回本地 mock（首屏立刻有内容、永不为空）
 *  2. 异步 fetchX  → 请求后端接口，失败自动退回 mock
 *  3. normalizeX   → 把接口的「传输格式」转成 contract.ts 的内部形状
 *
 * 环境变量：
 *  - NEXT_PUBLIC_USE_MOCK=false   才去请求后端；默认 true 完全离线
 *  - NEXT_PUBLIC_API_BASE         后端地址，默认 http://localhost:3001
 *
 * 当前后端实际提供的端点：
 *  - GET /api/notices        → { items, total }
 *  - GET /api/contacts       → { items, total }
 *  - GET /api/faq            → { items, total }   ← 单数 faq
 *  - GET /api/processes      → { items, total }
 *  - GET /api/processes/:id  → 单个对象（可选）
 *  - GET /api/calendar       → 单个对象，非列表
 *  - GET /api/service-hours  → { items, total }   ← 带连字符
 *  - GET /api/policies       → ❌ 契约里没有，规章制度页只能走 mock
 */

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== "false"; // 默认走 mock
// NEXT_PUBLIC_API_BASE="/" 表示同源（走 next.config 的 /api 透传），用于公网部署。
const RAW_API_BASE = process.env.NEXT_PUBLIC_API_BASE;
const API_BASE = RAW_API_BASE
  ? RAW_API_BASE.replace(/\/+$/, "")
  : "http://localhost:3001";

export const isMock = USE_MOCK;
export const apiBase = API_BASE;

/** 单次请求超时。后端挂了不要让首屏等太久 */
const TIMEOUT_MS = 4000;
/** 问答需要检索、核验和规划，给后端留足处理时间 */
const CHAT_TIMEOUT_MS = 60_000;

/* ============================================================
   一、问答
   ============================================================ */

/** 给回答补上「你也许还想问」——只推本系统答得出来的，避免点进去是死路 */
function withFollowUps(q: string, res: ChatResponse): ChatResponse {
  if (res.follow_ups?.length) return res;
  return { ...res, follow_ups: suggestFollowUps(q, res) };
}

export async function askChat(question: string): Promise<ChatResponse> {
  return askChatWithContext(question, question);
}

export async function askChatWithContext(
  question: string,
  resolvedQuestion = question,
  context?: {
    topic?: string;
    previous_question?: string;
    turn?: number;
    history?: Array<{ question: string; answer: string }>;
  },
): Promise<ChatResponse> {
  if (USE_MOCK) {
    // 模拟网络延迟，让 loading 态看得见（演示时更真实）
    await new Promise((r) => setTimeout(r, 420));
    const res = mockChat(resolvedQuestion);
    return withFollowUps(resolvedQuestion, res);
  }

  try {
    const res = await fetchT(
      `${API_BASE}/api/chat`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          resolved_question: resolvedQuestion,
          context,
        }),
      },
      CHAT_TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`接口返回 ${res.status}`);
    const data = (await res.json()) as ChatResponse;
    // 后端还没实现 follow_ups 时，前端自己补上（契约新增字段，向后兼容）
    return data.follow_ups?.length ? data : withFollowUps(resolvedQuestion, data);
  } catch (e) {
    // 后端挂了不要白屏：退回本地引擎，并在 meta 里注明，
    // 让界面能显示「本次回答来自本地知识库」而不是假装是后端答的。
    const res = mockChat(resolvedQuestion);
    return withFollowUps(resolvedQuestion, {
      ...res,
      meta: { ...res.meta, engine: "local-fallback" },
      notice: res.notice
        ? `${res.notice}（后端未连通，本条由本地知识库回答）`
        : "后端未连通，本条由本地知识库回答。",
    });
  }
}

export interface FeishuPushResult {
  ok: boolean;
  code: "sent" | "not_configured" | "provider_error" | "demo_mode";
  message: string;
  sent_at?: string;
}

function normalizeFeishuPushResult(payload: unknown): FeishuPushResult {
  const data =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>)
      : {};
  const rawCode = data.code;
  const code: FeishuPushResult["code"] =
    rawCode === "sent"
      ? "sent"
      : rawCode === "not_configured"
        ? "not_configured"
        : rawCode === "provider_error"
          ? "provider_error"
          : // 旧后端仍可能返回 invalid_config；按协议收敛为未配置。
            rawCode === "invalid_config"
            ? "not_configured"
            : "provider_error";
  return {
    ok: code === "sent",
    code,
    message:
      typeof data.message === "string" && data.message
        ? data.message
        : code === "sent"
          ? "任务摘要已推送到飞书群"
          : "飞书推送失败，请稍后重试或先复制摘要",
    sent_at:
      typeof data.sent_at === "string" ? data.sent_at : undefined,
  };
}

/**
 * 飞书 Webhook 只在后端环境变量中配置。前端不能传 URL，
 * 避免把“群机器人推送”变成任意地址请求能力。
 */
export async function pushTextToFeishu(text: string): Promise<FeishuPushResult> {
  if (USE_MOCK) {
    return {
      ok: false,
      code: "demo_mode",
      message: "当前是本地演示模式，未发起飞书推送；可先复制摘要或连接后端后重试。",
    };
  }
  try {
    const res = await fetchT(`${API_BASE}/api/integrations/feishu/task`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = normalizeFeishuPushResult(await res.json());
    if (!res.ok && data.code === "sent") {
      return {
        ok: false,
        code: "provider_error",
        message: `飞书推送接口返回 ${res.status}`,
      };
    }
    return data;
  } catch (error) {
    return {
      ok: false,
      code: "provider_error",
      message: error instanceof Error ? error.message : "飞书推送请求失败",
    };
  }
}

export interface SiteCheckResult {
  ok: boolean;
  code: "reachable" | "blocked_url" | "timeout" | "http_error" | "network_error" | "demo_mode";
  message: string;
  checked_at?: string;
  url?: string;
  final_url?: string;
  http_status?: number;
  title?: string | null;
  content_length?: number;
}

/** 官网按需巡检：只允许后端校验过的 cuc.edu.cn HTTPS 页面。 */
export async function checkOfficialPage(url: string): Promise<SiteCheckResult> {
  if (USE_MOCK) {
    return {
      ok: false,
      code: "demo_mode",
      message: "当前是本地演示模式，未发起真实巡检；关闭 mock 并启动后端后可检查。",
      url,
    };
  }
  try {
    // 巡检包含 DNS、重定向和正文读取，后端预算为 8 秒，前端留出 2 秒余量。
    const res = await fetchT(
      `${API_BASE}/api/integrations/site-check`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      },
      10_000,
    );
    return (await res.json()) as SiteCheckResult;
  } catch (error) {
    return {
      ok: false,
      code: "network_error",
      message: error instanceof Error ? error.message : "巡检请求失败",
      url,
    };
  }
}

/* ============================================================
   二、同步 getter（永远返回 mock，保证首屏不为空）
   ============================================================ */

export function getContacts(): Contact[] {
  return mockContacts;
}
export function getProcesses(): Process[] {
  return mockProcesses;
}
export function getNotices(): Notice[] {
  return mockNotices;
}
export function getCalendars(): Calendar[] {
  return mockCalendars;
}
export function getServiceHours(): ServiceHour[] {
  return mockServiceHours;
}
export function getPolicies(): Policy[] {
  return mockPolicies;
}
export function getFaqs(): Faq[] {
  return mockFaqs;
}
export function getContactById(id: string) {
  return mockContacts.find((c) => c.id === id);
}
export function getProcessById(id: string) {
  return mockProcesses.find((p) => p.id === id);
}
export function getNoticeById(id: string) {
  return mockNotices.find((n) => n.id === id);
}
export function getPolicyById(id: string) {
  return mockPolicies.find((p) => p.id === id);
}
export function getFaqById(id: string) {
  return mockFaqs.find((f) => f.id === id);
}

/* ============================================================
   三、传输层：带超时的 fetch + 列表解包
   ============================================================ */

async function fetchT(
  url: string,
  init?: RequestInit,
  timeoutMs = TIMEOUT_MS,
): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * 解包 { items, total }。
 * 兼容甲可能直接返回裸数组的情况（契约写了 items 包装，但实现未必一致），
 * 少一次「联调时才发现形状不对」。
 */
function unwrapList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  const obj = raw as ListResponse<T> | null;
  if (obj && Array.isArray(obj.items)) return obj.items;
  // 有些后端会把 {data:{items:[]}}、{list:[]} 也混进来，保底再试一层
  const anyObj = raw as Record<string, unknown> | null;
  if (anyObj) {
    for (const k of ["data", "list", "rows"]) {
      const v = anyObj[k];
      if (Array.isArray(v)) return v as T[];
      if (v && Array.isArray((v as ListResponse<T>).items)) {
        return (v as ListResponse<T>).items;
      }
    }
  }
  throw new Error("列表接口返回了无法识别的形状");
}

/** 传 { items, total } 的路径 */
async function fetchList<T>(path: string, keyword?: string): Promise<T[]> {
  const url = new URL(`${API_BASE}${path}`);
  if (keyword) url.searchParams.set("keyword", keyword);
  const res = await fetchT(url.toString());
  if (!res.ok) throw new Error(`${path} 返回 ${res.status}`);
  return unwrapList<T>(await res.json());
}

/* ============================================================
   四、异步 live 取数（失败自动退回 mock，并标记来源）
   ============================================================ */

export type DataSource = "mock" | "live" | "fallback";

export interface Loaded<T> {
  data: T;
  /** live=后端返回；mock=没开启后端；fallback=开了后端但请求失败 */
  source: DataSource;
  error?: string;
}

async function load<T>(live: () => Promise<T>, fallback: T): Promise<Loaded<T>> {
  if (USE_MOCK) return { data: fallback, source: "mock" };
  try {
    return { data: await live(), source: "live" };
  } catch (e) {
    return {
      data: fallback,
      source: "fallback",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * 契约示例里 contact 只有 phone 一个号，冲突信息在 history_phones 里。
 * 我的界面用 conflict_note 显示"为什么冲突"，后端不会给这个字段，
 * 所以这里按 history_phones 自动生成一句，避免接线后提示变空。
 */
function fillContactNotes(list: Contact[]): Contact[] {
  return list.map((c) => {
    if (c.conflict_note) return c;
    const phones = (c.history_phones ?? []).map((h) => h.phone).filter(Boolean);
    if (c.conflict_flag && phones.length >= 2) {
      const uniq = Array.from(new Set(phones));
      return {
        ...c,
        conflict_note:
          uniq.length >= 2
            ? `官网不同页面给出的号码不一致：${uniq.join(" / ")}`
            : `同一号码 ${uniq[0]} 被多处引用，所属部门需核实`,
      };
    }
    return c;
  });
}

export const fetchContacts = (keyword?: string) =>
  load(
    async () => fillContactNotes(await fetchList<Contact>("/api/contacts", keyword)),
    mockContacts,
  );

export const fetchProcesses = () =>
  load(() => fetchList<Process>("/api/processes"), mockProcesses);

export const fetchNotices = (status?: string) =>
  load(
    async () => {
      const path = status
        ? `/api/notices?status=${encodeURIComponent(status)}`
        : "/api/notices";
      return fetchList<Notice>(path);
    },
    mockNotices,
  );

/**
 * 服务时间：把后端的 service_hours 行补成界面能直接渲染的形状。
 * ------------------------------------------------------------
 * 后端的 service_hours 表只有 business_id / location_id / open_days / time_slot / note，
 * **没有 business_name，也没有任何地点数据**（库里没有 locations 表）。
 * 直接渲染的结果就是「业务」「地点」两列全空，只剩时段——线上会看起来像 bug。
 *
 * 这里的补全原则：
 *   1. 业务名：优先 business_name，退而用 business_id（当前 seed 里 business_id 存的就是业务名）
 *   2. 地点：只有在本地知识库能**确定**对应业务时才补，补不上就留空，
 *      由页面显式显示「地点未公布」，绝不按猜测填一个楼名
 *   3. is_tbd：按 time_slot / note 里的「未公开 / 另行通知 / 待核实」推断
 */
const KB_HOURS = mockServiceHours;

/** 业务关键词 → 本地知识库 business_id。只收能确定对应关系的，宁缺勿猜。 */
const HOUR_ALIASES: Array<[RegExp, string]> = [
  [/心理/, "心理"],
  [/资助|奖助|贷款|勤工/, "资助"],
  [/户籍|户口/, "户籍"],
  [/教材/, "教材"],
  [/校园网|信息化|网络|统一身份/, "信息化"],
  [/报修|后勤|维修/, "报修"],
];

function kbHourFor(business?: string | null): ServiceHour | undefined {
  const s = (business ?? "").trim();
  if (!s) return undefined;
  const direct = KB_HOURS.find(
    (h) => h.business_name === s || h.business_id === s || h.business_name.includes(s) || s.includes(h.business_id),
  );
  if (direct) return direct;
  for (const [re, key] of HOUR_ALIASES) {
    if (!re.test(s)) continue;
    const hit = KB_HOURS.find((h) => h.business_id.includes(key));
    if (hit) return hit;
  }
  return undefined;
}

/**
 * 地点补全：先查本地「服务时间表」，再退到「部门联系方式表」（学生证、证明等业务
 * 在事务大厅一侧有官方地点）。仍然补不上就返回 undefined，页面显示「地点未公布」。
 */
const KB_CONTACTS = mockContacts;

function kbLocationFor(business?: string | null): { location: string; via: string } | undefined {
  const s = (business ?? "").trim();
  if (!s) return undefined;

  const direct = KB_HOURS.find(
    (h) => h.location_name && (h.business_name.includes(s) || s.includes(h.business_id)),
  );
  if (direct?.location_name) return { location: direct.location_name, via: "服务时间表" };

  for (const [re, key] of HOUR_ALIASES) {
    if (!re.test(s)) continue;
    const hit = KB_HOURS.find((h) => h.location_name && h.business_id.includes(key));
    if (hit?.location_name) return { location: hit.location_name, via: "服务时间表" };
  }

  const contact = KB_CONTACTS.find(
    (c) =>
      c.location_name &&
      (c.business_name.includes(s) ||
        s.includes(c.business_name) ||
        (c.route_keywords ?? []).some((k) => k.length >= 2 && (s.includes(k) || k.includes(s)))),
  );
  if (contact?.location_name) return { location: contact.location_name, via: "部门联系方式表" };
  return undefined;
}

/** 后端行 → 内部 ServiceHour；缺的字段显式留空，不编造 */
function normalizeServiceHour(w: Partial<ServiceHour> & Record<string, unknown>): ServiceHour {
  const business = (w.business_name as string | undefined)?.trim() || (w.business_id as string | undefined)?.trim();
  const kb = kbHourFor(business);
  const kbLoc = kbLocationFor(business);
  const slot = (w.time_slot as string | undefined) ?? "";
  const note = (w.note as string | undefined) ?? "";
  const tbdFromText = /未公开|未公布|另行通知|待核实|不固定|需电话确认/.test(`${slot}${note}`);
  const liveLocation = (w.location_name as string | undefined)?.trim() || null;
  return {
    ...(w as ServiceHour),
    business_id: (w.business_id as string | undefined) ?? business ?? "unknown",
    business_name:
      (w.business_name as string | undefined)?.trim() ||
      business ||
      (kb?.business_name ?? "（未标注业务）"),
    location_name: liveLocation ?? kbLoc?.location ?? null,
    // 地点不是后端给的时，界面可以据此提示「本地补全」，避免把库里的地点当成甲返回的数据
    location_source: liveLocation ? "backend" : kbLoc ? kbLoc.via : null,
    location_id: (w.location_id as string | undefined) ?? kb?.location_id ?? null,
    applicable_to: (w.applicable_to as string | undefined) ?? kb?.applicable_to ?? null,
    is_tbd: typeof w.is_tbd === "boolean" ? w.is_tbd : tbdFromText,
  } as ServiceHour & { location_source?: string | null };
}

export const fetchServiceHours = () =>
  load<ServiceHour[]>(
    async () => (await fetchList<Partial<ServiceHour> & Record<string, unknown>>("/api/service-hours")).map(normalizeServiceHour),
    mockServiceHours,
  );

export const fetchFaqs = () =>
  load(() => fetchList<Faq>("/api/faq"), mockFaqs);

/** 规章制度：甲已补 GET /api/policies（2026-10-30） */
export const fetchPolicies = () =>
  load<Policy[]>(() => fetchList<Policy>("/api/policies"), mockPolicies);

/* ============================================================
   五、校历：传输格式 → 内部形状
   ============================================================ */

/** "1-17" → {start:1,end:17}；已是对象则原样返回 */
function parseWeeks(
  v: string | { start: number; end: number } | null | undefined,
): { start: number; end: number } | null {
  if (!v) return null;
  if (typeof v === "object") return v;
  const m = v.match(/(\d+)\s*[-–~到]\s*(\d+)/);
  if (!m) return null;
  return { start: Number(m[1]), end: Number(m[2]) };
}

/** {"第一节":"8:00"} → [{period:"第一节",time:"8:00"}] */
function parseDailySchedule(
  v: Record<string, string> | { period: string; time: string }[] | null | undefined,
): { period: string; time: string }[] | null {
  if (!v) return null;
  if (Array.isArray(v)) return v;
  return Object.entries(v).map(([period, time]) => ({ period, time }));
}

/**
 * 契约 2.4 的 calendar 示例缺 id / source / verify_status 等通用字段
 * （因为它不是知识库记录，是"当前学期"这一个对象）。
 * 前端页面要显示来源卡片，所以这里补上默认值，并在 gaps 里说明，
 * 而不是让界面显示 "undefined"。
 */
/**
 * 后端 daily_schedule 只给了前几节时，用本地知识库把节次补齐（后端值优先，按 KB 顺序排）。
 * 后端 holidays / key_dates 缺失时也退回本地知识库，并在 gaps 里写明是本地补的，
 * 避免界面出现「关键时间点空白」而让人以为页面坏了。
 */
const KB_CAL = mockCalendars[0];

/** "第一节" / "第 1 节" / "1" 都归一成 "1"，避免后端和知识库的写法不同导致同一节课出现两次 */
function periodKey(period: string): string {
  const core = period.replace(/\s/g, "").replace(/^第/, "").replace(/节$/, "");
  const map: Record<string, number> = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (/^\d+$/.test(core)) return String(Number(core));
  if (core === "十") return "10";
  if (core.startsWith("十")) return String(10 + (map[core[1]] ?? 0));
  if (core.includes("十")) {
    const [a, b] = core.split("十");
    return String((map[a] ?? 0) * 10 + (map[b] ?? 0));
  }
  return map[core] != null ? String(map[core]) : core;
}

function mergeDailySchedule(
  live: { period: string; time: string }[] | null,
  kb: { period: string; time: string }[] | null,
): { period: string; time: string }[] | null {
  if (!live?.length) return kb?.length ? kb : null;
  if (!kb?.length) return live;
  const byKey = new Map<string, { period: string; time: string }>();
  for (const row of kb) byKey.set(periodKey(row.period), row);
  for (const row of live) {
    // 后端值优先，但保留知识库里的规范节次名（"第一节" 比 "第 1 节" 更像课本说法）；
    // 后端只给了开始时间（"8:00"）而知识库有整段（"08:00–08:45"）时用知识库，免得一列里混着两种写法
    const k = periodKey(row.period);
    const kbRow = byKey.get(k);
    const liveIsPointOnly = /^\d{1,2}:\d{2}$/.test(row.time.trim());
    const keepKbTime = !!kbRow && liveIsPointOnly && /[-–~]/.test(kbRow.time);
    byKey.set(k, {
      period: kbRow?.period ?? row.period,
      time: keepKbTime ? kbRow!.time : row.time,
    });
  }
  return [...byKey.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0]))
    .map(([, v]) => v);
}

export function normalizeCalendar(w: CalendarWire): Calendar {
  const missing = [
    !w.id && "id",
    !w.source && "source",
    !w.source_url && "source_url",
    !w.verify_status && "verify_status",
  ].filter(Boolean) as string[];

  const liveKeyDates = w.key_dates && w.key_dates.length ? w.key_dates : null;
  const liveHolidays = w.holidays && w.holidays.length ? w.holidays : null;
  const liveDaily = parseDailySchedule(w.daily_schedule);

  const substituted: string[] = [];
  if (!liveKeyDates && KB_CAL?.key_dates?.length) {
    substituted.push("后端 /api/calendar 未返回 key_dates，关键时间点取自本地知识库（日期均待核实，勿当定稿）");
  }
  if (!liveHolidays && KB_CAL?.holidays?.length) {
    substituted.push("后端 /api/calendar 未返回 holidays，假期安排取自本地知识库（日期待核实）");
  }
  const mergedDaily = mergeDailySchedule(liveDaily, KB_CAL?.daily_schedule ?? null);
  if (!liveDaily && mergedDaily?.length) {
    substituted.push("后端 /api/calendar 未返回 daily_schedule，课节时间取自本地知识库");
  } else if (liveDaily && mergedDaily && mergedDaily.length > liveDaily.length) {
    substituted.push(
      `后端 /api/calendar 只返回 ${liveDaily.length} 节课节，其余 ${mergedDaily.length - liveDaily.length} 节由本地知识库补齐`,
    );
  }

  return {
    id: w.id ?? "calendar-current",
    item_id: null,
    source: w.source ?? "教务处（契约未提供来源字段）",
    source_url: w.source_url ?? "https://jwc.cuc.edu.cn/",
    publish_date: w.publish_date ?? null,
    last_verified_at: w.last_verified_at ?? null,
    verify_status: w.verify_status ?? "待核实",
    effective_status: w.effective_status ?? "待核实",
    academic_year: w.academic_year,
    semester: w.semester,
    term_start: w.term_start ?? null,
    term_end: w.term_end ?? null,
    holidays: liveHolidays ?? KB_CAL?.holidays ?? null,
    teaching_weeks: parseWeeks(w.teaching_weeks),
    exam_weeks: parseWeeks(w.exam_weeks),
    daily_schedule: mergedDaily,
    key_dates: liveKeyDates ?? KB_CAL?.key_dates ?? null,
    gaps: [
      ...(w.gaps ?? []),
      ...substituted,
      ...missing.map((f) => `契约 §2.4 的 calendar 未定义 ${f}，界面已用默认值占位`),
    ],
  };
}

export const fetchCalendar = () =>
  load<Calendar[]>(
    async () => {
      const res = await fetchT(`${API_BASE}/api/calendar`);
      if (!res.ok) throw new Error(`/api/calendar 返回 ${res.status}`);
      const raw = (await res.json()) as CalendarWire | CalendarWire[];
      // 契约说是单对象，但万一甲按列表实现（或以后改成列表），两种都吃下
      const arr = Array.isArray(raw) ? raw : [raw];
      return arr.map(normalizeCalendar);
    },
    mockCalendars,
  );

/* ============================================================
   六、健康检查（演示页用）
   ============================================================ */

export async function health(): Promise<{ ok: boolean; mode: "mock" | "live" }> {
  if (USE_MOCK) return { ok: true, mode: "mock" };
  try {
    const res = await fetchT(`${API_BASE}/api/health`);
    return { ok: res.ok, mode: "live" };
  } catch {
    return { ok: false, mode: "live" };
  }
}

/**
 * 联调自检：一次性探测全部 7 个端点，打印形状是否正确。
 * 用于「甲说接口好了」时 30 秒内确认到底能不能接。
 */
export async function probeAll(): Promise<
  { endpoint: string; ok: boolean; detail: string }[]
> {
  const checks: { endpoint: string; run: () => Promise<unknown> }[] = [
    { endpoint: "GET /api/health", run: () => fetchT(`${API_BASE}/api/health`).then((r) => r.json()) },
    { endpoint: "GET /api/contacts", run: () => fetchList<Contact>("/api/contacts") },
    { endpoint: "GET /api/processes", run: () => fetchList<Process>("/api/processes") },
    { endpoint: "GET /api/notices", run: () => fetchList<Notice>("/api/notices") },
    { endpoint: "GET /api/faq", run: () => fetchList<Faq>("/api/faq") },
    { endpoint: "GET /api/service-hours", run: () => fetchList<ServiceHour>("/api/service-hours") },
    { endpoint: "GET /api/calendar", run: () => fetchT(`${API_BASE}/api/calendar`).then((r) => r.json()) },
  ];
  const out: { endpoint: string; ok: boolean; detail: string }[] = [];
  for (const c of checks) {
    try {
      const v = await c.run();
      const n = Array.isArray(v) ? v.length : 1;
      out.push({ endpoint: c.endpoint, ok: true, detail: `OK，${n} 条` });
    } catch (e) {
      out.push({
        endpoint: c.endpoint,
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return out;
}

/**
 * 前后端共享的数据契约
 * ------------------------------------------------------------
 * 本文件是前端唯一需要认识的数据形状。
 * 后端契约变化时优先收敛到这里，避免页面直接依赖传输细节。
 */

/* ============================================================
   一、枚举与通用字段
   ============================================================ */

/** 核验状态（二态） */
export type VerifyStatus = "已核实" | "待核实";

/** 有效状态（四态） */
export type EffectiveStatus = "现行" | "疑似过期" | "已失效" | "待核实";

/**
 * 来源等级。
 * ⚠️ 契约 2.1 示例写的是 "A"/"B"，技术规格 §0 写的是「官方-现行」等。
 * 两边定义不一致，所以这里放宽为 string，界面原样展示。
 * 契约中此类歧义应在后端统一，前端暂按兼容方式展示。
 */
export type EvidenceLevel = string;

/** 数据时效字段，列表与问答来源共用 */
export interface FreshnessFields {
  /** 后端按复核周期计算；true 时界面必须显示橙色待核实提示 */
  stale?: boolean;
  /** 距离上次人工核实的月数，由后端计算并返回 */
  verified_months_ago?: number | null;
  /** 为什么判为超期，用于徽章悬停和聊天提示 */
  stale_reason?: string | null;
}

/** 所有表共有的字段（契约 1.2） */
export interface CommonFields extends FreshnessFields {
  id: string;
  item_id?: string | null;
  source: string;
  source_url: string;
  /** 契约漏了发布部门，技术规格有；这里补上，缺失时界面不显示 */
  publish_dept?: string | null;
  publish_date?: string | null;
  last_verified_at?: string | null;
  verify_status: VerifyStatus;
  effective_status: EffectiveStatus;
  /**
   * 官方原文本身的缺陷（跳号、缺字段、附件空壳、入口失效…）。
   * 技术规格里只挂在 process 上，但实测 notice / serviceHour 也有，
   * 所以提到通用字段。界面统一用橙色条显式提示。
   */
  gaps?: string[];
  /** 一句话概括问题，列表页用 */
  gap_summary?: string | null;
}

/* ============================================================
   二、五张核心表
   ============================================================ */

/** ① 办事流程 */
export interface ProcessStep {
  step_no: number;
  action: string;
  responsible_role?: string | null;
  prerequisite?: string | null;
  deadline?: string | null;
  next_entry?: string | null;
  /** 该步骤在原文档中缺失/跳号时的说明，如"原文编号 1→3，缺第 2 条" */
  gap_note?: string | null;
}

export interface Process extends CommonFields {
  process_name: string;
  applicable_to: string;
  conditions?: string[] | null;
  required_materials?: string[] | null;
  steps: ProcessStep[];
  dept_id?: string | null;
  dept_name?: string | null;
  phone?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  service_hours?: string | null;
  need_appointment?: boolean | null;
  entry_url?: string | null;
  entry_status?: "正常" | "已失效" | "待核实" | null;
  deadline?: string | null;
  remedy?: string | null;
  version_no?: string | null;
  supersedes_id?: string | null;
  superseded_by_id?: string | null;
  attachment_status?: "正常" | "疑似空白" | "无法读取" | "待人工核验" | null;
  category?: string;
}

/** ② 部门联系方式 */
export interface HistoryPhone {
  phone: string;
  valid_from?: string | null;
  valid_to?: string | null;
  source_url: string;
  note?: string | null;
}

export interface Contact extends CommonFields {
  business_name: string;
  dept_name: string;
  phone?: string | null;
  location_id?: string | null;
  location_name?: string | null;
  office_hours?: string | null;
  need_appointment?: boolean | null;
  applicable_to?: string | null;
  history_phones?: HistoryPhone[] | null;
  conflict_flag?: boolean;
  /** 冲突的具体说明，如"65779702 同时挂在劳动教育中心与事务科" */
  conflict_note?: string | null;
  route_keywords?: string[] | null;
}

/** ③ 规章制度 */
export interface Policy extends CommonFields {
  policy_name: string;
  doc_no: string;
  effective_date?: string | null;
  expiry_date?: string | null;
  supersedes_id?: string | null;
  superseded_by_id?: string | null;
  supersedes_name?: string | null;
  superseded_by_name?: string | null;
  applicable_to: string;
  scope?: string | null;
  content?: string | null;
  content_page_refs?: unknown;
  ocr_quality?: "合格" | "需抽查" | "不合格" | null;
  /** 是否为已被替代的旧版 */
  is_superseded?: boolean;
}

/** ④ 通知公告 */
export interface NoticeAttachment {
  name: string;
  url?: string | null;
  status: "正常" | "疑似空白" | "无法读取" | "待人工核验";
  text_extracted: boolean;
}

export interface ExternalLink {
  title: string;
  publisher?: string | null;
  publish_date?: string | null;
  url: string;
  accessible?: boolean;
}

export interface Notice extends CommonFields {
  notice_name: string;
  channel: "官网" | "公众号" | "第三方";
  applicable_to?: string | null;
  deadline?: string | null;
  academic_year?: string | null;
  body_content?: string | null;
  attachments?: NoticeAttachment[] | null;
  external_links?: ExternalLink[] | null;
  extracted_fields?: {
    deadline?: string | null;
    applicable_to?: string | null;
    material_requirements?: string | null;
    entry?: string | null;
  } | null;
  notice_status: "正在适用" | "已过截止" | "历史";
  is_archived?: boolean;
  related_notice_ids?: string[] | null;
}

/** ⑤ 校历 */
export interface Holiday {
  name: string;
  start: string;
  end: string;
}

export interface Calendar extends CommonFields {
  academic_year: string;
  semester: "秋" | "春" | "夏";
  term_start?: string | null;
  term_end?: string | null;
  holidays?: Holiday[] | null;
  teaching_weeks?: { start: number; end: number } | null;
  exam_weeks?: { start: number; end: number } | null;
  daily_schedule?: { period: string; time: string }[] | null;
  key_dates?: { name: string; date: string }[] | null;
}

/** 服务时间子表（D1：12 项业务 8 种时段，拒绝"大厅通用时间"） */
export interface ServiceHour extends CommonFields {
  business_id: string;
  business_name: string;
  location_id?: string | null;
  location_name?: string | null;
  open_days: string;
  time_slot: string;
  need_appointment?: boolean | null;
  applicable_to?: string | null;
  note?: string | null;
  /** "另行通知"类：明确表示无法预先获取 */
  is_tbd?: boolean;
}

/* ============================================================
   三、支撑表（前端用到的）
   ============================================================ */

export interface Item extends CommonFields {
  item_no: string;
  item_name: string;
  aliases?: string[];
  related_policy_ids?: string[];
  related_process_ids?: string[];
  related_notice_ids?: string[];
  related_dept_id?: string | null;
}

export interface Faq extends CommonFields {
  question: string;
  category: string;
  answer_ref?: string | null;
  synonym_questions?: string[];
  source_type: "官方规定" | "学生社区线索";
  /** 前端直接展示的答案（取自 mock，真实后端由甲生成） */
  answer?: string;
}

/* ============================================================
   四、问答 API（甲 → 丙）
   ============================================================ */

/**
 * status 三态 —— 本项目最核心的设计。
 * 它不是"成功/失败"，而是"我有多确定"。
 */
export type ChatStatus = "answered" | "conflict" | "unconfirmed";

export interface Source extends FreshnessFields {
  title: string;
  url: string;
  publish_date?: string | null;
  evidence_level?: EvidenceLevel;
  /** 官方原文中与回答直接相关的短摘录 */
  excerpt?: string;
  /** 该来源自身的核验/有效状态，来源卡上显示 */
  verify_status?: VerifyStatus;
  effective_status?: EffectiveStatus;
}

export interface ActionCardMaterial {
  /** 用于任务内勾选，旧数据没有该字段时由前端按名称补出。 */
  id?: string;
  name: string;
  required?: boolean;
  spec?: string;
  download_url?: string;
  /**
   * official=官网明确列出；derived=系统为便于执行整理的格式/准备项；
   * verify=系统提示可能需要，必须向主管部门核实。
   */
  origin?: "official" | "derived" | "verify";
  /** 线上提交、现场提交等，官网未明确时为 unknown。 */
  submission?: "online" | "onsite" | "mail" | "unknown";
  /** 适用条件、个人化原因或核实提醒。 */
  note?: string;
}

export interface ActionCardStep {
  id: string;
  text: string;
  detail?: string;
  /** official=官网原文；derived=系统整理，不能冒充官方步骤 */
  origin: "official" | "derived";
}

export interface ActionCard {
  id: string;
  source_type: "process" | "notice";
  source_id: string;
  title: string;
  summary: string;
  applicable_to?: string;
  department: {
    name?: string;
    phone?: string;
    location?: string;
    hours?: string;
    entry_url?: string;
    entry_status?: string;
  };
  deadline?: {
    text: string;
    iso?: string;
    source_url: string;
  };
  materials: ActionCardMaterial[];
  steps: ActionCardStep[];
  missing_fields: string[];
  remedy?: {
    available: boolean;
    text: string;
    channel?: string;
  };
  verification: {
    verify_status: string;
    effective_status: string;
    gaps: string[];
    source_url: string;
  };
}

export interface EvidenceItem {
  id: string;
  type: string;
  title: string;
  url: string;
  snippet: string;
  quote?: string;
  verify_status?: string;
  effective_status?: string;
  publish_date?: string | null;
}

export interface TaskSuggestion {
  action_card_id: string;
  title: string;
  deadline_text?: string;
  deadline_iso?: string;
  step_count: number;
  material_count: number;
}

export interface PipelineStage {
  id: "retrieval" | "verification" | "planning";
  label: string;
  /** 可解释的确定性协作角色，不冒充独立大模型。 */
  agent?: string;
  status: "ok" | "degraded" | "failed";
  detail: string;
  input_summary?: string;
  output_summary?: string;
  handoff?: string;
  elapsed_ms: number;
}

export type RemedyMode = "available" | "manual-check" | "none";

/** 冲突时，两个并列的说法 */
export interface ConflictSide {
  /** 说法标签，如"教务处 学籍管理页" */
  label: string;
  /** 具体内容，如"65783223" */
  value: string;
  source: string;
  source_url: string;
  publish_date?: string | null;
  note?: string | null;
}

export interface ChatRequest {
  /** 用户本轮原话 */
  question: string;
  /** 前端结合上一问改写后的完整问题 */
  resolved_question?: string;
  context?: {
    topic?: string;
    previous_question?: string;
    turn?: number;
  };
}

export interface ChatResponse {
  status: ChatStatus;
  /** Markdown 正文 */
  answer: string;
  sources: Source[];
  /** 顶部提示条文字（冲突/无法确认时给核实渠道） */
  notice: string;
  /** 冲突双方的并列展示（status=conflict 时提供） */
  conflicts?: ConflictSide[];
  /** 无法确认时给出的核实渠道 */
  verify_channels?: { name: string; phone?: string; url?: string }[];
  /** 回答涉及的知识条目 id，用于"查看依据" */
  refs?: string[];
  /** 答完之后可以接着问什么（借鉴 DeepTutor 的追问交互） */
  follow_ups?: string[];
  /** 从官方原文生成的结构化办事卡 */
  action_card?: ActionCard;
  /** 当前问题所需、但官方未给出的关键字段 */
  missing_fields?: string[];
  /** 带原文摘录的官方证据 */
  evidence?: EvidenceItem[];
  /** 前端据此提供“加入任务”的建议 */
  task_suggestion?: TaskSuggestion;
  remedy_mode?: RemedyMode;
  /** 检索、核验、规划三个阶段的运行情况 */
  pipeline?: PipelineStage[];
  /** 后端版本/耗时，演示用，可不填 */
  meta?: {
    engine?: string;
    elapsed_ms?: number;
    retrieval_mode?: string;
    tables_queried?: number;
    tables_failed?: number;
  };
}

export interface HealthResponse {
  ok: boolean;
}

/* ============================================================
   五、列表接口（契约 2.4，甲 2026-10-29 补充版）
   ============================================================ */

/**
 * 列表接口统一返回形状（契约 2.4 原文）：
 *   「统一约定：列表接口都返回 { "items": [...], "total": N }」
 */
export interface ListResponse<T> {
  items: T[];
  total: number;
}

/** 列表接口支持的可选参数（契约 2.4） */
export interface ListQuery {
  /** 默认 50 */
  limit?: number;
  /** 默认 0 */
  offset?: number;
  /** 模糊搜索 */
  keyword?: string;
}

/** 契约 2.4 实际提供的端点 —— 已逐字核对，不含推测 */
export interface ListApiShape {
  /** notice 列表，可按 status / channel 过滤 */
  "GET /api/notices": ListResponse<Notice>;
  /** contact 列表 */
  "GET /api/contacts": ListResponse<Contact>;
  /** faq 列表（注意是单数 faq，不是 faqs） */
  "GET /api/faq": ListResponse<Faq>;
  /** process 列表 */
  "GET /api/processes": ListResponse<Process>;
  /** 单个流程详情，契约里标为「可选」 */
  "GET /api/processes/:id": Process;
  /** 服务时间表列表（路径是 service-hours，带连字符） */
  "GET /api/service-hours": ListResponse<ServiceHour>;
  /** 校历 —— **单对象，不是列表** */
  "GET /api/calendar": CalendarWire;
}

/**
 * 契约里**没有**列表接口的表。
 * policies 在 1.3 有字段定义，但 2.4 端点表里没有对应的 GET。
 * 前端的规章制度页因此只能走 mock，已反馈甲。
 */
export const MISSING_LIST_ENDPOINTS = ["GET /api/policies"] as const;

/**
 * 契约 2.4 的 calendar 示例用的是**传输格式**，和本文件 Calendar 的内部形状不同：
 *   teaching_weeks: "1-17"        （字符串）  vs  { start, end }
 *   exam_weeks:     "18-19"       （字符串）  vs  { start, end }
 *   daily_schedule: {"第一节":"8:00"}（对象）  vs  [{ period, time }]
 * 而且示例里**没有** id / source / source_url / verify_status / effective_status。
 * 见 normalizeCalendar()（api.ts），它负责把传输格式转成内部形状。
 */
export interface CalendarWire {
  academic_year: string;
  semester: "秋" | "春" | "夏";
  term_start?: string | null;
  term_end?: string | null;
  /** "1-17" 这种字符串 */
  teaching_weeks?: string | { start: number; end: number } | null;
  /** "18-19" 这种字符串 */
  exam_weeks?: string | { start: number; end: number } | null;
  holidays?: Holiday[] | null;
  /** {"第一节": "8:00"} 这种对象 */
  daily_schedule?: Record<string, string> | { period: string; time: string }[] | null;
  key_dates?: { name: string; date: string }[] | null;
  /* 以下字段契约示例没有给出，甲可能补也可能不补，全部可选 */
  id?: string;
  source?: string;
  source_url?: string;
  publish_date?: string | null;
  last_verified_at?: string | null;
  verify_status?: VerifyStatus;
  effective_status?: EffectiveStatus;
  gaps?: string[];
  gap_summary?: string | null;
}

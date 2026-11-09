import { assessFreshness } from '../common/freshness.util';

export type AnswerStatus = 'answered' | 'conflict' | 'unconfirmed';
export type QuestionIntent =
  | 'deadline'
  | 'materials'
  | 'contact'
  | 'location'
  | 'steps'
  | 'status'
  | 'general';

export interface RetrievalRow {
  type: 'process' | 'contact' | 'notice' | 'calendar' | 'faq' | 'policy' | 'service_hour' | 'material';
  id: string;
  title: string;
  url?: string | null;
  content: string;
  record: Record<string, any>;
  distance?: number | null;
  lexical_score?: number;
  score?: number;
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
  stale: boolean;
  verified_months_ago: number | null;
  stale_reason: string | null;
}

export interface ActionCardMaterial {
  name: string;
  required?: boolean;
  spec?: string;
  download_url?: string;
}

export interface ActionCardStep {
  id: string;
  text: string;
  detail?: string;
  origin: 'official' | 'derived';
}

export interface ActionCard {
  id: string;
  source_type: 'process' | 'notice';
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

export interface TaskSuggestion {
  action_card_id: string;
  title: string;
  deadline_text?: string;
  deadline_iso?: string;
  step_count: number;
  material_count: number;
}

export interface VerificationChannel {
  name: string;
  phone?: string;
  url?: string;
}

export interface PipelineStage {
  id: 'retrieval' | 'verification' | 'planning';
  label: string;
  agent?: string;
  status: 'ok' | 'degraded' | 'failed';
  detail: string;
  input_summary?: string;
  output_summary?: string;
  handoff?: string;
  elapsed_ms: number;
}

export interface PlannerResult {
  status: AnswerStatus;
  notice: string;
  actionCard?: ActionCard;
  evidence: EvidenceItem[];
  missingFields: string[];
  verifyChannels: VerificationChannel[];
}

export function inferIntent(question: string): QuestionIntent {
  if (/截止|什么时候|哪天|日期|时间|开始|结束|报名期|多久/.test(question)) return 'deadline';
  if (/材料|带什么|准备什么|申请表|附件/.test(question)) return 'materials';
  if (/电话|号码|联系方式|找谁|咨询谁|打哪个|哪个部门|部门/.test(question)) return 'contact';
  if (/地点|地址|在哪|哪里办|哪个楼|办公室/.test(question)) return 'location';
  if (/怎么办|如何办|流程|步骤|办理|申请|预约|打印|提交/.test(question)) return 'steps';
  if (/截止了吗|过期|还有效|能用吗|状态/.test(question)) return 'status';
  return 'general';
}

function parseJson<T>(value: T | string | null | undefined, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function text(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function asArray(value: unknown): any[] {
  const parsed = parseJson<any[]>(value as any, []);
  return Array.isArray(parsed) ? parsed : [];
}

function first<T>(...values: Array<T | null | undefined>): T | undefined {
  return values.find((v) => v != null && v !== '') as T | undefined;
}

export function cleanSnippet(input: string, max = 220): string {
  const normalized = (input || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#>*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length <= max) return normalized;
  return normalized.slice(0, max - 1).trimEnd() + '…';
}

// 抽取式摘录时忽略的通用二元词：它们几乎出现在所有文档里，按它们定位会退回文档开头。
const SNIPPET_STOP_GRAMS = new Set([
  '怎么', '什么', '哪里', '在哪', '如何', '是否', '可以', '需要', '多少', '哪些',
  '哪个', '多久', '几天', '几点', '几号', '应该', '请问', '一下', '我想', '我要',
  '有没', '没有', '现在', '规定', '关于', '以及', '进行', '相关', '情况',
  '么办', '咋办', '怎办',
]);

function questionKeyGrams(question: string): string[] {
  const chars = Array.from(question.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, ''));
  const grams: string[] = [];
  for (let i = 0; i + 1 < chars.length; i++) {
    const gram = chars[i] + chars[i + 1];
    if (!SNIPPET_STOP_GRAMS.has(gram) && !grams.includes(gram)) grams.push(gram);
  }
  return grams;
}

/**
 * 以问题里的关键二元词为中心截取原文窗口。
 * 政策/制度类原文动辄数千字，直接取开头会把真正回答问题的条款截掉；
 * 围绕命中的关键词取窗口，才能让模板和 agent 都读到「第三十四条」这类关键段落。
 * 同一关键词可能在文中出现多次（如「休学」），只取首次命中常落在总则里，
 * 因此改为选取命中密度最高的一段（窗口内命中次数最多）。
 */
export function snippetAround(input: string, question: string, max = 600): string {
  const cleaned = cleanSnippet(input, 100000);
  if (cleaned.length <= max) return cleaned;
  const grams = questionKeyGrams(question);
  if (!grams.length) return cleanSnippet(cleaned, max);

  const hits = new Set<number>();
  for (const gram of grams) {
    let index = cleaned.indexOf(gram);
    while (index !== -1 && hits.size < 300) {
      hits.add(index);
      index = cleaned.indexOf(gram, index + 1);
    }
  }
  if (!hits.size) return cleanSnippet(cleaned, max);

  const sorted = [...hits].sort((a, b) => a - b);
  let best = sorted[0];
  let bestCount = 0;
  for (let right = 0, left = 0; right < sorted.length; right++) {
    while (sorted[right] - sorted[left] > max) left++;
    if (right - left + 1 > bestCount) {
      bestCount = right - left + 1;
      best = sorted[left];
    }
  }

  const half = Math.floor(max / 2);
  const start = Math.max(0, best - half);
  const end = Math.min(cleaned.length, start + max);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < cleaned.length ? '…' : '';
  return `${prefix}${cleaned.slice(start, end).trim()}${suffix}`;
}

function normalizeDateParts(
  year: string,
  month: string,
  day: string,
  hour?: string,
  minute?: string,
): string {
  const y = Number(year);
  const m = String(Number(month)).padStart(2, '0');
  const d = String(Number(day)).padStart(2, '0');
  const hh = String(hour == null ? 23 : Number(hour)).padStart(2, '0');
  const mm = String(minute == null ? 59 : Number(minute)).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:00+08:00`;
}

function extractDateMatches(value: string): Array<{ token: string; iso: string; index: number }> {
  const out: Array<{ token: string; iso: string; index: number }> = [];
  const re =
    /(20\d{2})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*日?(?:\s*(\d{1,2})\s*[:：]\s*(\d{1,2}))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    out.push({
      token: match[0],
      iso: normalizeDateParts(match[1], match[2], match[3], match[4], match[5]),
      index: match.index,
    });
  }
  return out;
}

function latestDateIso(value?: string | null): string | undefined {
  if (!value) return undefined;
  return extractDateMatches(value)
    .map((item) => item.iso)
    .sort((a, b) => b.localeCompare(a))[0];
}

/**
 * 补全省略年份的日期写法（如「9月7日12:30—9月13日22:00」）。
 * 通知正文普遍不写年份，年份线索取自发布时间/标题/链接；取不到时退回当前年份。
 */
function inferYearHint(record: Record<string, any>): number {
  for (const value of [
    record.publish_date,
    record.notice_name,
    record.title,
    record.source_url,
    record.deadline,
  ]) {
    if (typeof value !== 'string') continue;
    const match = value.match(/(20\d{2})/);
    if (match) return Number(match[1]);
  }
  return new Date().getFullYear();
}

function extractLooseDateMatches(
  value: string,
  year: number,
): Array<{ token: string; iso: string; index: number }> {
  const out: Array<{ token: string; iso: string; index: number }> = [];
  const re = /(\d{1,2})\s*月\s*(\d{1,2})\s*日?(?:\s*(\d{1,2})\s*[:：]\s*(\d{1,2}))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(value))) {
    out.push({
      token: match[0],
      iso: normalizeDateParts(String(year), match[1], match[2], match[3], match[4]),
      index: match.index,
    });
  }
  return out;
}

function deadlineFromText(value?: string | null): { text: string; iso?: string; quoted: boolean } | undefined {
  const cleaned = cleanSnippet(text(value), 220);
  if (!cleaned || /待核实|未明确|另行通知/.test(cleaned)) return undefined;
  return {
    // Preserve the official expression, including labels and ranges. The ISO
    // value uses the latest timestamp so countdowns target the final deadline.
    text: cleaned,
    iso: latestDateIso(cleaned),
    quoted: true,
  };
}

function explicitDeadline(record: Record<string, any>): { text: string; iso?: string; quoted: boolean } | undefined {
  const direct = deadlineFromText(record.deadline);
  if (direct) return direct;

  const extracted = parseJson<Record<string, any>>(record.extracted_fields, {});
  const extractedDeadline = deadlineFromText(extracted.deadline);
  if (extractedDeadline) return extractedDeadline;

  const body = text(record.body_content);
  const yearHint = inferYearHint(record);
  const lines = body
    .replace(/\s*\r?\n\s*/g, ' ')
    .split(/。|；/)
    .map((line) => line.trim())
    .filter((line) =>
      /截止|报名时间|报名日期|申请时间|办理时间|选课时间|笔试|口试|CET|四级|六级/.test(line),
    );

  const candidates: Array<{ line: string; iso: string; index: number }> = [];
  for (const line of lines) {
    let dates = extractDateMatches(line);
    let loose = false;
    if (!dates.length) {
      dates = extractLooseDateMatches(line, yearHint);
      loose = dates.length > 0;
    }
    if (!dates.length) continue;
    const last = dates[dates.length - 1];
    candidates.push({
      line: loose
        ? line.slice(Math.max(0, dates[0].index - 12), last.index + last.token.length)
        : line,
      iso: dates.map((item) => item.iso).sort((a, b) => b.localeCompare(a))[0],
      index: dates[0].index,
    });
  }
  if (!candidates.length) return undefined;
  candidates.sort((a, b) => b.iso.localeCompare(a.iso));
  return {
    text: cleanSnippet(candidates[0].line, 220),
    iso: candidates[0].iso,
    quoted: true,
  };
}

function normalizeSteps(record: Record<string, any>): ActionCardStep[] {
  const steps = asArray(record.steps);
  if (steps.length) {
    return steps.map((step, index) => {
      const details = [
        text(step.responsible_role) && `负责：${text(step.responsible_role)}`,
        text(step.prerequisite) && `前置：${text(step.prerequisite)}`,
        text(step.deadline) && `时限：${text(step.deadline)}`,
        text(step.next_entry) && `去向：${text(step.next_entry)}`,
        text(step.gap_note),
      ].filter(Boolean);
      return {
        id: `step-${Number(step.step_no) || index + 1}`,
        text: text(step.action, `第 ${Number(step.step_no) || index + 1} 步`),
        detail: details.join(' · ') || undefined,
        origin: 'official' as const,
      };
    });
  }

  const body = text(record.body_content || record.content);
  const lines = body
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => /^(\d+[.、)]|[一二三四五六七八九十]+[、.])\s*/.test(line))
    .map((line) => line.replace(/^(\d+[.、)]|[一二三四五六七八九十]+[、.])\s*/, '').trim())
    .filter((line) => line.length >= 4)
    .slice(0, 8);

  if (lines.length) {
    return lines.map((line, index) => ({
      id: `notice-step-${index + 1}`,
      text: line,
      origin: 'official' as const,
    }));
  }

  return [
    {
      id: 'derived-check',
      text: '打开官方通知，核对适用对象、办理时间和入口。',
      detail: '系统整理步骤，不替代官方原文。',
      origin: 'derived',
    },
    {
      id: 'derived-prepare',
      text: '按官方要求准备材料，并在截止前留存提交回执。',
      detail: '材料与截止时间以卡片所列官方字段为准。',
      origin: 'derived',
    },
  ];
}

function splitMaterials(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  const s = text(value);
  if (!s) return [];
  return s
    .split(/[、；;\n]/)
    .map((v) => v.trim())
    .filter((v) => v.length > 1);
}

function materialDetails(record: Record<string, any>, materials: RetrievalRow[]): ActionCardMaterial[] {
  const names = new Set<string>();
  for (const item of splitMaterials(record.required_materials)) names.add(item);
  const extracted = parseJson<Record<string, any>>(record.extracted_fields, {});
  for (const item of splitMaterials(extracted.material_requirements)) names.add(item);

  return [...names].map((name) => {
    const canonical = name.replace(/[（(].*?[）)]/g, '').trim();
    const material = materials.find((row) => {
      const materialName = text(row.record.material_name, row.title);
      return (
        materialName === name ||
        materialName === canonical ||
        (canonical.length >= 3 && materialName.includes(canonical)) ||
        (materialName.length >= 3 && canonical.includes(materialName))
      );
    });
    return {
      name,
      required: material?.record.required === false ? false : !/可选|如需/.test(name),
      spec: material ? text(material.record.spec) || JSON.stringify(material.record.spec) : undefined,
      download_url: material ? text(material.record.download_url) || undefined : undefined,
    };
  });
}

function detectStepGaps(record: Record<string, any>): string[] {
  const steps = asArray(record.steps);
  const numbers = steps
    .map((s) => Number(s.step_no))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  const gaps: string[] = [];
  for (let i = 1; i < numbers.length; i++) {
    if (numbers[i] - numbers[i - 1] > 1) {
      gaps.push(`官方步骤编号 ${numbers[i - 1]}→${numbers[i]}，中间步骤缺失。`);
    }
  }
  return gaps;
}

function findContactFor(
  title: string,
  question: string,
  rows: RetrievalRow[],
): Record<string, any> | undefined {
  const contacts = rows.filter((row) => row.type === 'contact');
  if (!contacts.length) return undefined;
  const haystack = `${title} ${question}`;
  const ranked = contacts
    .map((row) => {
      const keywords = asArray(row.record.route_keywords).map(String);
      let score = 0;
      for (const key of keywords) {
        if (key.length >= 2 && haystack.includes(key)) score += key.length * 2;
      }
      const business = text(row.record.business_name);
      const dept = text(row.record.dept_name);
      if (business && haystack.includes(business)) score += business.length;
      if (dept && haystack.includes(dept)) score += dept.length;
      if (row.score) score += Math.min(row.score * 10, 5);
      return { row, score };
    })
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.score > 0 ? ranked[0].row.record : undefined;
}

function deriveRemedy(
  question: string,
  record: Record<string, any>,
  department: ActionCard['department'],
  intent: QuestionIntent,
): ActionCard['remedy'] {
  const official = text(record.remedy);
  const body = text(record.body_content);
  const phone = department.phone;
  const channel = [department.name, phone].filter(Boolean).join(' ');

  if (official && !/只能等次年/.test(official)) {
    return { available: true, text: official, channel };
  }
  if (/不再补报名|不安排补报名|不接受补报|逾期不再补报|补报名不存在/.test(body)) {
    return {
      available: true,
      text: `官方未公布补报名，联系${channel || '主管部门'}核实。`,
      channel,
    };
  }
  if (/逾期不再补选|不予补选|不得补选/.test(body)) {
    return {
      available: true,
      text: `官方说明逾期不再补选，联系${channel || '主管部门'}确认是否存在特殊处理。`,
      channel,
    };
  }
  if (/截止|报名|选课|申请/.test(question) && (intent === 'deadline' || intent === 'status')) {
    return {
      available: false,
      text: `官方原文未给出通用补救通道，先联系${channel || '主管部门'}人工核实。`,
      channel,
    };
  }
  return undefined;
}

function missingFieldsFor(
  intent: QuestionIntent,
  card: Omit<ActionCard, 'missing_fields'>,
): string[] {
  const missing: string[] = [];
  if (
    (intent === 'deadline' || intent === 'status') &&
    !card.deadline?.text &&
    !card.deadline?.iso
  ) {
    missing.push('截止时间');
  }
  if (intent === 'materials' && card.materials.length === 0) missing.push('材料清单');
  if (intent === 'contact' && !card.department.phone && !card.department.name) {
    missing.push('主管部门与电话');
  }
  if (intent === 'location' && !card.department.location) missing.push('办理地点');
  if (intent === 'steps' && card.steps.every((step) => step.origin === 'derived')) {
    missing.push('官方办理步骤');
  }
  if (!card.department.name) missing.push('主管部门');
  if (!card.verification.source_url) missing.push('官方原文链接');
  return [...new Set(missing)];
}

function primaryRow(rows: RetrievalRow[], intent: QuestionIntent): RetrievalRow | undefined {
  if (!rows.length) return undefined;
  return [...rows].sort((a, b) => {
    const score = (row: RetrievalRow) => {
      let value = row.score ?? 0;
      if (intent === 'deadline' && row.type === 'notice') value += 1;
      if ((intent === 'steps' || intent === 'materials') && row.type === 'process') value += 0.5;
      return value;
    };
    return score(b) - score(a);
  })[0];
}

export function buildEvidence(
  rows: RetrievalRow[],
  max = 5,
  question = '',
): EvidenceItem[] {
  const seen = new Set<string>();
  const out: EvidenceItem[] = [];
  for (const row of rows) {
    const key = `${row.type}:${row.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const url = text(row.url, text(row.record.source_url));
    if (!url) continue;
    const content = text(row.content, row.title);
    const freshness = assessFreshness(row.record);
    out.push({
      id: row.id,
      type: row.type,
      title: row.title,
      url,
      snippet: question
        ? snippetAround(content, question, 260)
        : cleanSnippet(content),
      quote: question
        ? snippetAround(content, question, 420)
        : cleanSnippet(content, 360),
      verify_status: text(row.record.verify_status, '待核实'),
      effective_status: text(row.record.effective_status, '待核实'),
      publish_date: text(row.record.publish_date) || null,
      stale: freshness.stale,
      verified_months_ago: freshness.verified_months_ago,
      stale_reason: freshness.stale_reason,
    });
    if (out.length >= max) break;
  }
  return out;
}

export function buildActionCard(
  question: string,
  rows: RetrievalRow[],
  materialRows: RetrievalRow[] = [],
): ActionCard | undefined {
  const intent = inferIntent(question);
  const primary = primaryRow(rows, intent);
  if (!primary || (primary.type !== 'process' && primary.type !== 'notice')) return undefined;

  const record = primary.record;
  const isProcess = primary.type === 'process';
  const title = text(
    isProcess ? record.process_name : record.notice_name,
    primary.title,
  );
  const contact = findContactFor(title, question, rows);
  const contactName = text(contact?.dept_name || contact?.business_name);
  const contactPhone = text(contact?.phone);
  const contactLocation = text(contact?.location_name || contact?.location_id);
  const deadline = explicitDeadline(record);
  const gaps = [
    ...asArray(record.gaps).map(String),
    ...(isProcess ? detectStepGaps(record) : []),
  ];

  const department: ActionCard['department'] = {
    name: first(
      isProcess ? text(record.dept_name || record.dept_id) : undefined,
      contactName,
      text(record.publish_dept),
    ),
    phone: first(
      text(record.phone),
      contactPhone,
      /65779333/.test(text(record.body_content)) ? '65779333' : undefined,
    ),
    location: first(text(record.location_name || record.location_id), contactLocation),
    hours: first(text(record.service_hours), text(contact?.office_hours)),
    entry_url: first(
      isProcess ? text(record.entry_url) : text(parseJson<Record<string, any>>(record.extracted_fields, {}).entry),
      text(record.entry_url),
    ),
    entry_status: text(record.entry_status, '待核实'),
  };

  const draft: Omit<ActionCard, 'missing_fields'> = {
    id: `${primary.type}:${primary.id}`,
    source_type: primary.type,
    source_id: String(primary.id),
    title,
    summary: cleanSnippet(
      text(record.summary) ||
        text(record.conditions) ||
        text(record.body_content) ||
        text(primary.content),
      260,
    ),
    applicable_to: first(
      text(record.applicable_to),
      text(parseJson<Record<string, any>>(record.extracted_fields, {}).applicable_to),
    ),
    department,
    deadline: deadline
      ? {
          text: deadline.text,
          iso: deadline.iso,
          source_url: text(record.source_url, text(primary.url)),
        }
      : undefined,
    materials: materialDetails(record, materialRows),
    steps: normalizeSteps(record),
    remedy: deriveRemedy(question, record, department, intent),
    verification: {
      verify_status: text(record.verify_status, '待核实'),
      effective_status: text(record.effective_status, '待核实'),
      gaps: [...new Set(gaps.filter(Boolean))],
      source_url: text(record.source_url, text(primary.url)),
    },
  };

  return {
    ...draft,
    missing_fields: missingFieldsFor(intent, draft),
  };
}

export function buildTaskSuggestion(card?: ActionCard): TaskSuggestion | undefined {
  if (!card) return undefined;
  return {
    action_card_id: card.id,
    title: card.title,
    deadline_text: card.deadline?.text,
    deadline_iso: card.deadline?.iso,
    step_count: card.steps.length,
    material_count: card.materials.length,
  };
}

export function decidePlannerResult(input: {
  question: string;
  rows: RetrievalRow[];
  conflicts?: Array<{ label: string; value: string; source: string; source_url: string }>;
  actionCard?: ActionCard;
}): PlannerResult {
  const { question, rows, conflicts, actionCard } = input;
  const evidence = buildEvidence(rows, 5, question);
  const intent = inferIntent(question);

  if (conflicts && conflicts.length >= 2) {
    return {
      status: 'conflict',
      notice: '发现官方信息存在冲突，本系统并列展示，不替你选。',
      actionCard,
      evidence,
      missingFields: actionCard?.missing_fields ?? [],
      verifyChannels: [],
    };
  }

  if (!rows.length) {
    return {
      status: 'unconfirmed',
      notice: '知识库中未找到足够的官方依据。',
      evidence: [],
      missingFields: ['官方依据'],
      verifyChannels: [{ name: '中国传媒大学信息公开与主管部门', url: 'https://www.cuc.edu.cn/' }],
    };
  }

  const primary = primaryRow(rows, intent);
  const verifyStatus = text(primary?.record.verify_status, actionCard?.verification.verify_status);
  const effectiveStatus = text(primary?.record.effective_status, actionCard?.verification.effective_status);
  const noticeStatus = text(primary?.record.notice_status);
  const freshness = primary ? assessFreshness(primary.record) : undefined;
  const missing = actionCard?.missing_fields ?? [];
  const criticalMissing =
    (intent === 'deadline' && missing.includes('截止时间')) ||
    (intent === 'materials' && missing.includes('材料清单')) ||
    (intent === 'contact' && missing.includes('主管部门与电话')) ||
    (intent === 'location' && missing.includes('办理地点')) ||
    (intent === 'steps' && missing.includes('官方办理步骤'));

  const channel: VerificationChannel[] = actionCard
    ? [
        {
          name: actionCard.department.name || '主管部门',
          phone: actionCard.department.phone,
          url: actionCard.verification.source_url,
        },
      ]
    : [];

  if (
    freshness?.stale ||
    verifyStatus !== '已核实' ||
    effectiveStatus !== '现行' ||
    noticeStatus === '历史' ||
    criticalMissing
  ) {
    return {
      status: 'unconfirmed',
      notice: criticalMissing
        ? `官方原文缺少关键字段：${missing.join('、')}，本系统不补猜。`
        : freshness?.stale
          ? `命中的官方资料已超过 90 天未复核：${freshness.stale_reason}`
          : '命中的官方资料尚未核实、已失效或状态不清，暂不能作为确定答案。',
      actionCard,
      evidence,
      missingFields: missing,
      verifyChannels:
        channel.length && channel[0].name
          ? channel
          : [{ name: '中国传媒大学信息公开与主管部门', url: 'https://www.cuc.edu.cn/' }],
    };
  }

  return {
    status: 'answered',
    notice: '',
    actionCard,
    evidence,
    missingFields: missing,
    verifyChannels: channel.length && channel[0].name ? channel : [],
  };
}

export function fallbackStructuredAnswer(
  question: string,
  result: PlannerResult,
  rows: RetrievalRow[],
): string {
  const card = result.actionCard;
  if (!card) {
    // 摘录只保留关键句：大段原文由 evidence 字段承载，前端在「官方证据」折叠区展示。
    const brief = (snippet: string) => {
      const flat = snippet.replace(/\s+/g, ' ').trim();
      if (flat.length <= 160) return flat;
      const cut = flat.slice(0, 160);
      const punc = Math.max(cut.lastIndexOf('。'), cut.lastIndexOf('；'));
      return punc >= 60 ? cut.slice(0, punc + 1) : `${cut}…`;
    };
    const evidenceText = result.evidence
      .slice(0, 5)
      .map((item) => `- [${item.title}](${item.url})：${brief(item.snippet)}`)
      .join('\n');
    if (result.status === 'conflict') {
      return `我找到了互相冲突的官方说法，已在上方并列展示。\n\n${evidenceText}`;
    }
    if (!rows.length) {
      return '这一条暂时没有可核对的官方资料，我不会用常识替你编一个具体口径。可以补充一下你的身份（本科生/研究生）和具体情形，我再按对应主管部门给你核实路径。';
    }
    // 措辞约束：前 150 字必须保留「暂时只能确认」（campus.service 用它识别半拒答），
    // 且不能出现 refusalPattern 的词（无法确认/未明确等），否则三态判定会变。
    return `**结论**：这条问题暂时只能确认到以下官方要点，大段原文已收进下方「官方证据」折叠区，需要核对时可展开：\n\n${evidenceText}\n\n官方原文未写明的字段，需要向主管部门核实。`;
  }

  const lines = [`**${card.title}**`, '', card.summary];
  if (card.applicable_to) lines.push('', `- **适用对象**：${card.applicable_to}`);
  if (card.deadline?.text) lines.push(`- **时间节点**：${card.deadline.text}`);
  if (card.department.name) {
    lines.push(
      `- **主管部门**：${card.department.name}${card.department.phone ? `，${card.department.phone}` : ''}`,
    );
  }
  if (card.materials.length) {
    lines.push(`- **材料**：${card.materials.map((m) => m.name).join('、')}`);
  }
  if (card.missing_fields.length) {
    lines.push('', `> 原文未明确的字段：${card.missing_fields.join('、')}。系统未自行补齐。`);
  }
  if (/错过|补救/.test(question) && card.remedy) lines.push('', `**补救**：${card.remedy.text}`);
  return lines.join('\n');
}

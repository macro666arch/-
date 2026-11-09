import type { ActionCard } from "@/lib/contract";
import { getNotices } from "@/lib/api";

export type DeadlineCategory = "报名" | "准考证" | "考试" | "评审" | "其他";
export type DeadlineVerification = "verified" | "pending";

export interface DeadlineEvent {
  id: string;
  title: string;
  category: DeadlineCategory;
  start_iso: string;
  end_iso?: string;
  all_day?: boolean;
  verification: DeadlineVerification;
  source_label: string;
  source_url: string;
  evidence: string;
  audience?: string;
}

/**
 * 只收录能回到官方原文的具体日期。报名截止原样保留在历史区，
 * 口试/笔试等拆成独立事件，不能压成一个“四六级截止日期”。
 */
export const OFFICIAL_DEADLINE_EVENTS: DeadlineEvent[] = [
  {
    id: "nt-04-registration",
    title: "四六级报名截止",
    category: "报名",
    start_iso: "2026-09-28T17:00:00+08:00",
    verification: "verified",
    source_label: "教务处通知",
    source_url: "https://jwc.cuc.edu.cn/2026/0914/c6364a273878/page.htm",
    evidence: "CET4/CET6 第二阶段报名截至 2026-09-28 17:00。",
    audience: "符合报考条件的在校生",
  },
  {
    id: "nt-04-oral-admission",
    title: "口试准考证开放打印",
    category: "准考证",
    start_iso: "2026-11-17T09:00:00+08:00",
    verification: "verified",
    source_label: "教务处通知",
    source_url: "https://jwc.cuc.edu.cn/2026/0914/c6364a273878/page.htm",
    evidence: "口试准考证自 2026-11-17 09:00 起可打印。",
    audience: "已报名口试的学生",
  },
  {
    id: "nt-04-oral-exam",
    title: "英语四六级口试",
    category: "考试",
    start_iso: "2026-11-21T00:00:00+08:00",
    end_iso: "2026-11-22T23:59:00+08:00",
    all_day: true,
    verification: "verified",
    source_label: "教务处通知",
    source_url: "https://jwc.cuc.edu.cn/2026/0914/c6364a273878/page.htm",
    evidence: "口语考试时间为 2026-11-21 至 2026-11-22。",
    audience: "已报名口试的学生",
  },
  {
    id: "nt-04-written-admission",
    title: "笔试准考证开放打印",
    category: "准考证",
    start_iso: "2026-12-01T09:00:00+08:00",
    verification: "verified",
    source_label: "教务处通知",
    source_url: "https://jwc.cuc.edu.cn/2026/0914/c6364a273878/page.htm",
    evidence: "笔试准考证自 2026-12-01 09:00 起可打印。",
    audience: "已报名笔试的学生",
  },
  {
    id: "nt-04-written-exam",
    title: "英语四六级笔试",
    category: "考试",
    start_iso: "2026-12-12T00:00:00+08:00",
    all_day: true,
    verification: "verified",
    source_label: "教务处通知",
    source_url: "https://jwc.cuc.edu.cn/2026/0914/c6364a273878/page.htm",
    evidence: "笔试时间为 2026-12-12。",
    audience: "已报名笔试的学生",
  },
];

export function pendingDeadlineEvents(): DeadlineEvent[] {
  return getNotices()
    .filter((notice) => {
      const deadline = notice.extracted_fields?.deadline ?? notice.deadline;
      return (
        !deadline ||
        /待核实|未明确|未写明|另行通知|以.*为准|附件/.test(deadline)
      );
    })
    .map((notice) => ({
      id: `pending:${notice.id}`,
      title: notice.notice_name,
      category: "其他",
      start_iso: "",
      verification: "pending",
      source_label: notice.publish_dept ?? notice.source,
      source_url: notice.source_url,
      evidence:
        notice.gaps?.[0] ??
        "官网未给出可直接计算的具体日期，本系统不推测倒计时。",
      audience: notice.applicable_to ?? undefined,
    }));
}

export function eventOccurrenceIso(event: DeadlineEvent): string {
  return event.start_iso;
}

export function eventIsPast(event: DeadlineEvent, now = Date.now()): boolean {
  if (!event.start_iso) return false;
  const end = event.end_iso || event.start_iso;
  return new Date(end).getTime() < now;
}

export function daysUntil(event: DeadlineEvent, now = Date.now()): number | undefined {
  if (!event.start_iso) return undefined;
  return Math.ceil((new Date(event.start_iso).getTime() - now) / 86_400_000);
}

export function eventToActionCard(event: DeadlineEvent): ActionCard {
  const hasConcreteDate = event.verification === "verified" && !!event.start_iso;
  return {
    id: `deadline:${event.id}`,
    source_type: "notice",
    source_id: event.id,
    title: event.title,
    summary: event.evidence,
    applicable_to: event.audience,
    department: {},
    deadline: hasConcreteDate
      ? {
          text: event.evidence,
          iso: event.start_iso,
          source_url: event.source_url,
        }
      : {
          text: "官方未给出可直接计算的具体日期",
          source_url: event.source_url,
        },
    materials: [],
    steps: [
      {
        id: `${event.id}-prepare`,
        text:
          event.category === "准考证"
            ? "在开放时间登录官方系统打印准考证，并核对个人信息"
            : event.category === "考试"
              ? "按官方考试安排携带规定证件参加考试"
              : "在官方时间节点前完成对应事项",
        detail: event.evidence,
        origin: "derived",
      },
    ],
    missing_fields: [],
    verification: {
      verify_status:
        event.verification === "verified" ? "已核实" : "待核实",
      effective_status:
        event.verification === "verified" ? "现行" : "待核实",
      gaps: [],
      source_url: event.source_url,
    },
  };
}

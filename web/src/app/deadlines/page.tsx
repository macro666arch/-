"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileQuestion,
  Loader2,
  Plus,
  ShieldCheck,
} from "lucide-react";
import clsx from "clsx";
import SiteCheckButton from "@/components/SiteCheckButton";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import {
  daysUntil,
  eventIsPast,
  eventToActionCard,
  OFFICIAL_DEADLINE_EVENTS,
  pendingDeadlineEvents,
  type DeadlineCategory,
  type DeadlineEvent,
} from "@/lib/deadlines";
import {
  saveTask,
  taskMatchesCard,
  taskMutationMessage,
  type CampusTask,
} from "@/lib/tasks";
import { useTasks } from "@/lib/useTasks";

type CategoryFilter = "全部" | DeadlineCategory;

const CATEGORIES: CategoryFilter[] = ["全部", "报名", "准考证", "考试", "评审", "其他"];

export default function DeadlinesPage() {
  const { tasks, ready } = useTasks();
  const [now, setNow] = useState(0);
  const [category, setCategory] = useState<CategoryFilter>("全部");
  const [message, setMessage] = useState("");
  const [addingEventId, setAddingEventId] = useState("");

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const official = useMemo(
    () =>
      [...OFFICIAL_DEADLINE_EVENTS].sort(
        (a, b) => new Date(a.start_iso).getTime() - new Date(b.start_iso).getTime(),
      ),
    [],
  );
  const pending = useMemo(() => pendingDeadlineEvents(), []);
  const clock = now || Date.now();
  const upcoming = official.filter((event) => !eventIsPast(event, clock));
  const past = official.filter((event) => eventIsPast(event, clock)).reverse();
  const filteredUpcoming = filterEvents(upcoming, category);
  const filteredPast = filterEvents(past, category);
  const filteredPending = filterEvents(pending, category);
  const soonCount = upcoming.filter((event) => {
    const days = daysUntil(event, clock);
    return days != null && days >= 0 && days <= 7;
  }).length;

  async function addToTasks(event: DeadlineEvent) {
    if (addingEventId) return;
    setAddingEventId(event.id);
    try {
      const result = await saveTask(eventToActionCard(event));
      setMessage(
        taskMutationMessage(result, `已将「${event.title}」加入任务雷达`),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "加入任务失败，请稍后重试",
      );
    } finally {
      setAddingEventId("");
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-7 sm:px-5 sm:py-8">
      <PageHeader
        icon={CalendarClock}
        title="截止日期雷达"
        description="只对官方原文能计算的日期显示倒计时。日期不明确时保留原文，不补一个看起来合理的日期。"
        actions={
          <Link href="/tasks" className="btn-ghost !py-1.5 !text-[12px]">
            返回任务雷达 <ArrowRight size={13} />
          </Link>
        }
      />

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="未来官方节点" value={upcoming.length} icon={CalendarDays} />
        <StatCard
          label="7 天内"
          value={soonCount}
          icon={Clock3}
          tone={soonCount > 0 ? "warn" : "default"}
        />
        <StatCard label="已过节点" value={past.length} icon={CheckCircle2} />
        <StatCard label="日期待核实" value={pending.length} icon={FileQuestion} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
        {CATEGORIES.map((item) => {
          const count =
            item === "全部"
              ? official.length + pending.length
              : [...official, ...pending].filter((event) => event.category === item).length;
          return (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              className={clsx(
                "rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                category === item
                  ? "bg-cuc-50 text-cuc-700"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
              )}
            >
              {item} <span className="ml-0.5 text-[10.5px] opacity-70">{count}</span>
            </button>
          );
        })}
      </div>

      {message && (
        <div
          className="mt-3 rounded-lg border border-cuc-200 bg-cuc-50 px-3 py-2 text-[12px] text-cuc-700"
          role="status"
        >
          {message}
        </div>
      )}

      <DeadlineSection
        title="已核实且尚未结束"
        description="倒计时按北京时间计算；考试类日期表示开始时间，结束日期同时保留在卡片中。"
        events={filteredUpcoming}
        now={clock}
        tasks={tasks}
        ready={ready}
        addingEventId={addingEventId}
        onAdd={addToTasks}
        empty="当前筛选下没有仍有效的官方节点。"
        tone="active"
      />

      <DeadlineSection
        title="已过日期"
        description="历史节点不会伪装成还有倒计时。若官方给出候补或人工核实渠道，会随任务一起保留。"
        events={filteredPast}
        now={clock}
        tasks={tasks}
        ready={ready}
        addingEventId={addingEventId}
        onAdd={addToTasks}
        empty="当前筛选下没有已过节点。"
        tone="past"
      />

      <DeadlineSection
        title="日期待核实"
        description="官网只写了“另行通知”“以附件为准”或根本没有具体日期。这里不显示倒计时，也不生成假的日历提醒。"
        events={filteredPending}
        now={clock}
        tasks={tasks}
        ready={ready}
        addingEventId={addingEventId}
        onAdd={addToTasks}
        empty="当前筛选下没有待核实日期。"
        tone="pending"
      />

      <div className="mt-6 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-[11.5px] leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span>
          官网巡检由用户逐条触发，用于发现页面失效或无法访问；它不是自动定时监控。
        </span>
      </div>
    </div>
  );
}

function DeadlineSection({
  title,
  description,
  events,
  now,
  tasks,
  ready,
  addingEventId,
  onAdd,
  empty,
  tone,
}: {
  title: string;
  description: string;
  events: DeadlineEvent[];
  now: number;
  tasks: CampusTask[];
  ready: boolean;
  addingEventId: string;
  onAdd: (event: DeadlineEvent) => void;
  empty: string;
  tone: "active" | "past" | "pending";
}) {
  return (
    <section className="mt-6">
      <div className="mb-2.5 flex items-start gap-2">
        <span
          className={clsx(
            "mt-1 h-2 w-2 shrink-0 rounded-full",
            tone === "active"
              ? "bg-state-ok"
              : tone === "past"
                ? "bg-slate-400"
                : "bg-state-warn",
          )}
        />
        <div>
          <h2 className="text-[16px] font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 max-w-3xl text-[11.5px] leading-5 text-slate-500">
            {description}
          </p>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-[12px] text-slate-400">
          {empty}
        </div>
      ) : (
        <div className="space-y-2.5">
          {events.map((event) => {
            const taskId = `deadline:${event.id}`;
            return (
              <DeadlineCard
                key={event.id}
                event={event}
                now={now}
                saved={tasks.some((task) => taskMatchesCard(task, taskId))}
                ready={ready}
                busy={addingEventId === event.id}
                onAdd={() => onAdd(event)}
                tone={tone}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}

function DeadlineCard({
  event,
  now,
  saved,
  ready,
  busy,
  onAdd,
  tone,
}: {
  event: DeadlineEvent;
  now: number;
  saved: boolean;
  ready: boolean;
  busy: boolean;
  onAdd: () => void;
  tone: "active" | "past" | "pending";
}) {
  const remaining = daysUntil(event, now);
  const countdown =
    remaining == null
      ? "日期待核实"
      : remaining < 0
        ? "已结束"
        : remaining === 0
          ? "今天"
          : `剩 ${remaining} 天`;

  return (
    <article
      className={clsx(
        "overflow-hidden rounded-lg border bg-white",
        tone === "active" && remaining != null && remaining <= 7
          ? "border-state-warnBorder"
          : tone === "pending"
            ? "border-state-warnBorder"
            : "border-slate-200",
      )}
    >
      <div className="px-4 py-3.5">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="chip bg-cuc-50 text-cuc-700">{event.category}</span>
              <h3 className="min-w-0 text-[14.5px] font-semibold leading-6 text-slate-900">
                {event.title}
              </h3>
              <span
                className={clsx(
                  "chip border",
                  tone === "pending"
                    ? "border-state-warnBorder bg-state-warnBg text-state-warn"
                    : tone === "past"
                      ? "border-slate-200 bg-slate-50 text-slate-500"
                      : remaining != null && remaining <= 7
                        ? "border-state-warnBorder bg-state-warnBg text-state-warn"
                        : "border-state-okBorder bg-state-okBg text-state-ok",
                )}
              >
                {countdown}
              </span>
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-slate-500">
              <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                <CalendarDays size={11} className="text-slate-400" />
                {formatEventDate(event)}
              </span>
              {event.audience && <span>适用：{event.audience}</span>}
              <span>{event.source_label}</span>
            </div>

            <p className="mt-2 break-words text-[12px] leading-5 text-slate-600">
              {event.evidence}
            </p>
          </div>

          <div className="flex w-full shrink-0 flex-wrap gap-1.5 sm:w-auto sm:justify-end">
            <button
              type="button"
              onClick={onAdd}
              disabled={!ready || saved || busy}
              className={clsx(
                "btn !px-2.5 !py-1.5 !text-[11.5px]",
                saved
                  ? "border border-state-okBorder bg-state-okBg text-state-ok"
                  : "bg-cuc-600 text-white hover:bg-cuc-700",
              )}
            >
              {busy ? (
                <Loader2 size={12} className="animate-spin" />
              ) : saved ? (
                <Check size={12} />
              ) : (
                <Plus size={12} />
              )}
              {saved ? "已在任务中" : "加入任务"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-slate-100 pt-2.5">
          <a
            href={event.source_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 text-[11px] text-cuc-600 hover:underline"
          >
            <ExternalLink size={10} className="shrink-0" />
            <span className="truncate">核对官方原文</span>
          </a>
          <SiteCheckButton url={event.source_url} compact />
          <span className="ml-auto inline-flex items-center gap-1 text-[10.5px] text-slate-400">
            {event.verification === "verified" ? (
              <>
                <ShieldCheck size={10} className="text-state-ok" /> 官网给出可计算日期
              </>
            ) : (
              <>
                <AlertTriangle size={10} className="text-state-warn" /> 原文日期不完整
              </>
            )}
          </span>
        </div>
      </div>
    </article>
  );
}

function filterEvents(events: DeadlineEvent[], category: CategoryFilter): DeadlineEvent[] {
  return category === "全部" ? events : events.filter((event) => event.category === category);
}

function formatEventDate(event: DeadlineEvent): string {
  if (!event.start_iso) return "官网未给出可计算日期";
  const start = new Date(event.start_iso);
  const startLabel = start.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    ...(event.all_day ? {} : { hour: "2-digit", minute: "2-digit", hour12: false }),
  });

  if (!event.end_iso) return startLabel;
  const end = new Date(event.end_iso);
  const endLabel = end.toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  return `${startLabel} 至 ${endLabel}`;
}

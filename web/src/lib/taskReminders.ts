"use client";

import type { CampusTask } from "@/lib/tasks";
import { taskSummaryText } from "@/lib/tasks";

/**
 * 任务提醒数据层：本地浏览器保存（闹钟类功能不适合同步到账号，
 * 且不同设备的提醒偏好不同）。
 */

const STORAGE_KEY = "cuc-task-reminders-v1";
export const REMINDERS_CHANGED_EVENT = "cuc-reminders-changed";

export type ReminderChannel = "notification" | "feishu" | "both";

export interface ReminderConfig {
  id: string;
  taskId: string;
  title: string;
  remindAt: number; // 毫秒时间戳
  channel: ReminderChannel;
  fired: boolean;
  createdAt: number;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadReminders(): ReminderConfig[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.id === "string" &&
        typeof item.taskId === "string" &&
        typeof item.remindAt === "number",
    );
  } catch {
    return [];
  }
}

function persist(reminders: ReminderConfig[]) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reminders));
    window.dispatchEvent(new CustomEvent(REMINDERS_CHANGED_EVENT));
  } catch {
    // 忽略配额/隐私模式错误
  }
}

export function getReminder(taskId: string): ReminderConfig | undefined {
  return loadReminders().find((r) => r.taskId === taskId);
}

export function setReminder(
  task: Pick<CampusTask, "task_id" | "title">,
  remindAt: number,
  channel: ReminderChannel,
): ReminderConfig {
  const all = loadReminders();
  const existing = all.find((r) => r.taskId === task.task_id);
  const config: ReminderConfig = {
    id: existing?.id ?? `rem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    taskId: task.task_id,
    title: task.title,
    remindAt,
    channel,
    fired: false,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  const next = existing
    ? all.map((r) => (r.taskId === task.task_id ? config : r))
    : [...all, config];
  persist(next);
  return config;
}

export function removeReminder(taskId: string): void {
  const all = loadReminders().filter((r) => r.taskId !== taskId);
  persist(all);
}

export function markReminderFired(id: string): void {
  const all = loadReminders().map((r) => (r.id === id ? { ...r, fired: true } : r));
  persist(all);
}

/** 为给定任务生成默认提醒时间：优先用截止时间，否则 1 小时后。 */
export function defaultRemindAt(task: Pick<CampusTask, "deadline">, now = Date.now()): number {
  if (task.deadline?.iso) {
    const t = new Date(task.deadline.iso).getTime();
    if (!Number.isNaN(t) && t > now) return t;
  }
  return now + 60 * 60 * 1000;
}

/** 提醒触发时的摘要文本。 */
export function reminderMessage(task: Pick<CampusTask, "title">): string {
  try {
    return taskSummaryText(task as CampusTask);
  } catch {
    return `任务「${task.title}」的提醒时间到了。`;
  }
}

/** 播放一段轻柔提示音（闹钟），不依赖外部音频文件。 */
let audioCtx: AudioContext | null = null;
export function playAlarm(): void {
  if (!isBrowser()) return;
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    const ctx = audioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    // 两声短促的"叮"
    const freqs = [880, 988];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const start = now + i * 0.28;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.24);
    });
  } catch {
    // 浏览器不支持 Web Audio 时静默降级
  }
}

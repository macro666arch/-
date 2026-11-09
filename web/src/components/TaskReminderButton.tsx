"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Check, Loader2, Save, X } from "lucide-react";
import clsx from "clsx";
import type { CampusTask } from "@/lib/tasks";
import {
  defaultRemindAt,
  getReminder,
  removeReminder,
  REMINDERS_CHANGED_EVENT,
  setReminder,
  type ReminderChannel,
  type ReminderConfig,
} from "@/lib/taskReminders";

const CHANNELS: { value: ReminderChannel; label: string; desc: string }[] = [
  { value: "notification", label: "桌面通知", desc: "浏览器系统通知 + 提示音" },
  { value: "feishu", label: "飞书消息", desc: "推送到已配置的飞书群" },
  { value: "both", label: "两者", desc: "桌面通知 + 飞书消息" },
];

function toLocalInputValue(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

export default function TaskReminderButton({
  task,
  onMessage,
}: {
  task: Pick<CampusTask, "task_id" | "title" | "deadline">;
  onMessage: (msg: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reminder, setReminderState] = useState<ReminderConfig | undefined>(undefined);
  const [when, setWhen] = useState<string>(toLocalInputValue(defaultRemindAt(task)));
  const [channel, setChannel] = useState<ReminderChannel>("notification");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sync = () => setReminderState(getReminder(task.task_id));
    sync();
    window.addEventListener(REMINDERS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(REMINDERS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [task.task_id]);

  function openPanel() {
    const existing = getReminder(task.task_id);
    if (existing) {
      setWhen(toLocalInputValue(existing.remindAt));
      setChannel(existing.channel);
    } else {
      setWhen(toLocalInputValue(defaultRemindAt(task)));
      setChannel("notification");
    }
    setOpen((v) => !v);
  }

  async function save() {
    const ts = new Date(when).getTime();
    if (Number.isNaN(ts)) {
      onMessage("提醒时间格式不正确");
      return;
    }
    if (ts <= Date.now()) {
      onMessage("提醒时间需要晚于当前时间");
      return;
    }
    setSaving(true);
    try {
      // 桌面通知需要用户授权；在保存动作里请求，避免无关弹窗
      if (channel !== "feishu" && typeof Notification !== "undefined") {
        if (Notification.permission === "default") {
          try {
            await Notification.requestPermission();
          } catch {
            // 忽略
          }
        }
        if (Notification.permission !== "granted") {
          onMessage(
            "已保存提醒，但浏览器通知权限未授予，到点将只播放提示音（可改为飞书消息）。",
          );
        }
      }
      setReminder(task, ts, channel);
      setOpen(false);
      onMessage(
        `已设置提醒：${new Date(ts).toLocaleString("zh-CN", {
          month: "numeric",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      );
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    removeReminder(task.task_id);
    setOpen(false);
    onMessage("已取消该任务的提醒");
  }

  const has = !!reminder;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={openPanel}
        className={clsx(
          "btn-ghost !px-2 !py-1.5",
          has ? "!text-cuc-700" : undefined,
        )}
        title={has ? `提醒：${new Date(reminder!.remindAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "设置提醒"}
      >
        {has ? <Bell size={12} className="fill-cuc-300" /> : <Bell size={12} />}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-20 mt-1.5 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-slate-700">设置提醒</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-400 hover:text-slate-600"
            >
              <X size={13} />
            </button>
          </div>

          <label className="mb-1 block text-[11px] text-slate-500">提醒时间</label>
          <input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="mb-3 w-full rounded-md border border-slate-200 px-2 py-1.5 text-[12px] text-slate-700 outline-none focus:border-cuc-400"
          />

          <label className="mb-1 block text-[11px] text-slate-500">提醒方式</label>
          <div className="space-y-1.5">
            {CHANNELS.map((c) => {
              const selected = channel === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setChannel(c.value)}
                  className={clsx(
                    "flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left transition-colors",
                    selected
                      ? "border-cuc-300 bg-cuc-50"
                      : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <span
                    className={clsx(
                      "mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border",
                      selected ? "border-cuc-600 bg-cuc-600" : "border-slate-300",
                    )}
                  >
                    {selected && <Check size={9} className="text-white" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11.5px] font-medium text-slate-700">
                      {c.label}
                    </span>
                    <span className="block text-[10px] leading-4 text-slate-400">{c.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="btn-primary !px-2.5 !py-1.5 !text-[11px]"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              保存
            </button>
            {has && (
              <button
                type="button"
                onClick={cancel}
                className="btn-ghost !px-2.5 !py-1.5 !text-[11px] !text-state-stop"
              >
                <BellOff size={11} />
                取消提醒
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import {
  loadReminders,
  markReminderFired,
  playAlarm,
  reminderMessage,
  REMINDERS_CHANGED_EVENT,
  type ReminderConfig,
} from "@/lib/taskReminders";
import { pushTextToFeishu } from "@/lib/api";

/**
 * 全局任务提醒调度器：挂载在 layout，全站运行。
 * 每 30 秒扫描一次 localStorage 中的提醒，到点则触发
 * 桌面通知 / 飞书消息 / 提示音，并持久化"已触发"标记防重复。
 */
export default function TaskReminderManager() {
  const firedThisSession = useRef<Set<string>>(new Set());

  useEffect(() => {
    let timer: number | null = null;

    async function trigger(reminder: ReminderConfig) {
      // 同会话内防重复（持久化 fired 负责跨会话）
      if (firedThisSession.current.has(reminder.id)) return;
      firedThisSession.current.add(reminder.id);

      const body = `「${reminder.title}」的提醒时间到了`;
      playAlarm();

      const needsNotification =
        reminder.channel === "notification" || reminder.channel === "both";
      const needsFeishu = reminder.channel === "feishu" || reminder.channel === "both";

      if (
        needsNotification &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted"
      ) {
        try {
          new Notification("任务提醒", {
            body,
            tag: reminder.id,
            requireInteraction: true,
          });
        } catch {
          // 忽略通知创建失败
        }
      }

      if (needsFeishu) {
        try {
          const summary = reminderMessage({ title: reminder.title } as never);
          await pushTextToFeishu(`⏰ 任务提醒：${reminder.title}\n${summary}`);
        } catch {
          // 飞书推送失败不阻塞
        }
      }

      markReminderFired(reminder.id);
    }

    function check() {
      const now = Date.now();
      const due = loadReminders().filter(
        (r) => !r.fired && r.remindAt <= now,
      );
      for (const reminder of due) {
        void trigger(reminder);
      }
    }

    check();
    timer = window.setInterval(check, 30 * 1000);

    const onChanged = () => check();
    window.addEventListener(REMINDERS_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onChanged);

    return () => {
      if (timer != null) window.clearInterval(timer);
      window.removeEventListener(REMINDERS_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onChanged);
    };
  }, []);

  return null;
}

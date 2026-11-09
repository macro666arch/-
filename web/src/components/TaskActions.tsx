"use client";

import { useState } from "react";
import { CalendarPlus, Check, ClipboardCheck, Copy, Loader2, Plus, Send } from "lucide-react";
import clsx from "clsx";
import type { ActionCard, ActionCardMaterial } from "@/lib/contract";
import { API_BASE } from "@/lib/http";
import {
  copyTaskSummary,
  downloadTaskIcs,
  saveTask,
  taskMatchesCard,
  taskMutationMessage,
  taskSummaryText,
} from "@/lib/tasks";
import { useTasks } from "@/lib/useTasks";

export default function TaskActions({
  card,
  materials,
  compact = false,
}: {
  card: ActionCard;
  materials?: ActionCardMaterial[];
  compact?: boolean;
}) {
  const { tasks, ready, source } = useTasks();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"add" | "copy" | "ics" | "push" | null>(null);
  const savedTask = tasks.find((task) => taskMatchesCard(task, card.id));
  const saved = !!savedTask;
  const cardWithMaterials: ActionCard = materials ? { ...card, materials } : card;
  const materialsInSync =
    !savedTask ||
    JSON.stringify(savedTask.materials) === JSON.stringify(cardWithMaterials.materials);
  const buttonClass = compact ? "btn !px-2.5 !py-1.5 !text-[11.5px]" : "btn !px-3 !py-1.5 !text-[12px]";

  async function add() {
    setBusy("add");
    try {
      const result = await saveTask(cardWithMaterials);
      setMessage(
        taskMutationMessage(
          result,
          saved ? "任务中的个性化材料已更新" : "已加入我的任务",
        ),
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加入任务失败，请稍后重试");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (busy) return;
    setBusy("copy");
    const ok = await copyTaskSummary(cardWithMaterials);
    setBusy(null);
    setMessage(ok ? "微信/飞书摘要已复制" : "复制失败，请检查浏览器权限");
  }

  function calendar() {
    if (busy) return;
    setBusy("ics");
    const ok = downloadTaskIcs(cardWithMaterials);
    setBusy(null);
    setMessage(ok ? "日历提醒已下载" : "截止时间缺少可识别日期");
  }

  /** C5：把当前卡片摘要推送到飞书群（走 A5 的后端 webhook） */
  async function push() {
    if (busy) return;
    setBusy("push");
    try {
      const response = await fetch(`${API_BASE}/api/integrations/feishu/task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `提醒：${taskSummaryText(cardWithMaterials)}` }),
      });
      const body = await response.json().catch(() => null);
      if (body?.ok) {
        setMessage("已推送到飞书群");
      } else if (body?.code === "not_configured") {
        setMessage("未配置飞书 Webhook，请联系管理员");
      } else {
        setMessage(`推送失败：${body?.message ?? body?.code ?? `HTTP ${response.status}`}`);
      }
    } catch {
      setMessage("推送失败，请检查网络或后端是否在线");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={add}
          disabled={!ready || busy !== null || (saved && materialsInSync)}
          className={clsx(
            buttonClass,
            saved
              ? "border border-state-okBorder bg-state-okBg text-state-ok"
              : "bg-cuc-600 text-white hover:bg-cuc-700",
          )}
        >
          {busy === "add" ? (
            <Loader2 size={13} className="animate-spin" />
          ) : saved && materialsInSync ? (
            <Check size={13} />
          ) : (
            <Plus size={13} />
          )}
          {saved ? (materialsInSync ? "已在任务中" : "更新任务材料") : "加入任务"}
        </button>
        <button
          type="button"
          onClick={copy}
          disabled={busy !== null}
          className={`${buttonClass} btn-ghost`}
        >
          {busy === "copy" ? <Loader2 size={13} className="animate-spin" /> : <Copy size={13} />}
          复制摘要
        </button>
        <button
          type="button"
          onClick={calendar}
          disabled={busy !== null}
          className={`${buttonClass} btn-ghost`}
          title="下载带提前 24 小时提醒的日历文件"
        >
          {busy === "ics" ? <Loader2 size={13} className="animate-spin" /> : <CalendarPlus size={13} />}
          日历提醒
        </button>
        <button
          type="button"
          onClick={push}
          disabled={busy !== null}
          className={`${buttonClass} btn-ghost`}
          title="把这条提醒推送到飞书群"
        >
          {busy === "push" ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          推送到群
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-[11px] text-state-ok">
            <ClipboardCheck size={11} />{" "}
            {source === "live" ? "已同步到账号" : "本地保存 · 待同步"}
          </span>
        )}
      </div>
      {message && (
        <p className="mt-1.5 text-[11px] text-slate-500" role="status">
          {message}
        </p>
      )}
      {saved && !materialsInSync && (
        <p className="mt-1.5 text-[10.5px] text-state-warn">
          你的身份或办理情形已改变，更新后任务清单会同步为新方案。
        </p>
      )}
    </div>
  );
}

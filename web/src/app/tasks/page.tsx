"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Cloud,
  CloudOff,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  History,
  ListChecks,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Save,
  Send,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";
import clsx from "clsx";
import SiteCheckButton from "@/components/SiteCheckButton";
import TaskReminderButton from "@/components/TaskReminderButton";
import { pushTextToFeishu } from "@/lib/api";
import { AUTH_CHANGED_EVENT, getToken } from "@/lib/auth";
import { materialOriginLabel, materialStableId } from "@/lib/materials";
import {
  addTaskActivity,
  copyTaskSummary,
  deadlineInfo,
  downloadTaskIcs,
  nextIncompleteStep,
  removeTask,
  setTaskCollaborators,
  setTaskHandoffNote,
  setTaskMaterialDone,
  setTaskOwner,
  setTaskStepDone,
  TASK_MEMBERS,
  taskMaterialProgress,
  taskMutationMessage,
  taskProgress,
  taskSummaryText,
  type CampusTask,
  type DeadlineTone,
  type TaskMutationResult,
} from "@/lib/tasks";
import { useTasks } from "@/lib/useTasks";

const toneClass: Record<DeadlineTone, string> = {
  overdue: "border-state-stopBorder bg-state-stopBg text-state-stop",
  urgent: "border-state-warnBorder bg-state-warnBg text-state-warn",
  soon: "border-amber-200 bg-amber-50 text-amber-800",
  normal: "border-state-okBorder bg-state-okBg text-state-ok",
  unknown: "border-slate-200 bg-slate-50 text-slate-500",
};

type TaskFilter = "active" | "urgent" | "done" | "all";

export default function TasksPage() {
  const {
    tasks,
    ready,
    loading,
    source,
    error,
    localCount,
    legacyCount,
    importLocal,
    refresh,
  } = useTasks();
  const [now, setNow] = useState(0);
  const [message, setMessage] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("active");
  const [loggedIn, setLoggedIn] = useState(false);
  const [importBusy, setImportBusy] = useState(false);

  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const syncLoginState = () => setLoggedIn(!!getToken());
    syncLoginState();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === "nau_token") syncLoginState();
    };
    window.addEventListener(AUTH_CHANGED_EVENT, syncLoginState);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncLoginState);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const sorted = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const ad = deadlineInfo(a, now || Date.now()).remaining_ms;
        const bd = deadlineInfo(b, now || Date.now()).remaining_ms;
        if (ad == null && bd == null) return b.updated_at.localeCompare(a.updated_at);
        if (ad == null) return 1;
        if (bd == null) return -1;
        return ad - bd;
      }),
    [tasks, now],
  );

  const active = tasks.filter((task) => taskProgress(task) < 100);
  const overdue = active.filter((task) => deadlineInfo(task, now || Date.now()).tone === "overdue");
  const dueSoon = active.filter((task) => {
    const tone = deadlineInfo(task, now || Date.now()).tone;
    return tone === "urgent" || tone === "soon";
  });
  const completed = tasks.filter((task) => taskProgress(task) === 100);
  const average = tasks.length
    ? Math.round(tasks.reduce((sum, task) => sum + taskProgress(task), 0) / tasks.length)
    : 0;

  const filtered = sorted.filter((task) => {
    if (filter === "all") return true;
    if (filter === "done") return taskProgress(task) === 100;
    if (filter === "urgent") {
      const tone = deadlineInfo(task, now || Date.now()).tone;
      return taskProgress(task) < 100 && (tone === "overdue" || tone === "urgent" || tone === "soon");
    }
    return taskProgress(task) < 100;
  });

  async function copy(task: CampusTask) {
    const ok = await copyTaskSummary(task);
    setMessage(ok ? "已复制适合粘贴到微信或飞书的办事摘要" : "复制失败，请检查浏览器权限");
  }

  function calendar(task: CampusTask) {
    const ok = downloadTaskIcs(task);
    setMessage(ok ? "已下载日历提醒" : "该任务缺少可识别的截止时间");
  }

  async function remove(task: CampusTask) {
    try {
      const result = await removeTask(task.task_id);
      setMessage(
        taskMutationMessage(result, `已删除「${task.title}」`, {
          offline: `已在本地删除「${task.title}」，后端恢复后会同步删除记录`,
        }),
      );
    } catch (requestError) {
      setMessage(
        requestError instanceof Error
          ? requestError.message
          : "删除失败，请稍后重试",
      );
    }
  }

  async function importPendingTasks() {
    if (importBusy || loading) return;
    setImportBusy(true);
    try {
      const result = await importLocal();
      if (result.imported === 0 && result.failed === 0) {
        setMessage(result.error || "没有可导入的本地任务");
      } else {
        setMessage(
          [
            `本地任务导入完成：成功 ${result.imported} 条`,
            result.failed ? `失败 ${result.failed} 条` : "",
            result.error ? `原因：${result.error}` : "",
          ]
            .filter(Boolean)
            .join("；"),
        );
      }
    } catch (requestError) {
      setMessage(
        requestError instanceof Error
          ? requestError.message
          : "导入失败，请稍后重试",
      );
    } finally {
      setImportBusy(false);
    }
  }

  const pendingLocal = localCount + legacyCount;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <PageHeader
        icon={ClipboardCheck}
        title="任务雷达"
        description="把办事卡变成可分工、可核材料、可交给队友的任务，并按真实截止时间排序。"
        actions={
          <>
            <Link href="/deadlines" className="btn-ghost !py-1.5 !text-[12px]">
              <CalendarDays size={13} /> 截止日期雷达
            </Link>
            <Link href="/processes" className="btn-primary !py-1.5 !text-[12px]">
              从办事流程添加 <ArrowRight size={13} />
            </Link>
          </>
        }
      />

      <div
        className={clsx(
          "mt-4 flex flex-col gap-2 rounded-lg border px-3.5 py-2.5 text-[11.5px] leading-5 sm:flex-row sm:items-center",
          source === "live"
            ? "border-state-okBorder bg-state-okBg/60 text-slate-600"
            : "border-state-warnBorder bg-state-warnBg/55 text-slate-600",
        )}
      >
        <span
          className={clsx(
            "flex shrink-0 items-center gap-1.5 font-medium",
            source === "live" ? "text-state-ok" : "text-state-warn",
          )}
        >
          {source === "live" ? <Cloud size={13} /> : <CloudOff size={13} />}
          {source === "live" ? "账号同步" : "本地保存 · 未同步"}
        </span>
        <span className="min-w-0 flex-1">
          {source === "live"
            ? "任务按账号隔离并跨设备同步；负责人、协作者、步骤和材料改动会自动保存。"
            : error
              ? `${error} 登录后仍不会自动上传已有本地任务，需要手动确认导入。`
              : loggedIn
                ? "后端暂不可用，当前改动保存在本浏览器；恢复后可导入账号。"
                : "当前未登录，任务仅保存在本浏览器。登录后可在本页手动导入，不会自动重复上传。"}
        </span>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="btn-ghost !px-2 !py-1.5 !text-[10.5px]"
          >
            <RefreshCw
              size={11}
              className={loading ? "animate-spin" : undefined}
            />
            刷新
          </button>
          {!loggedIn ? (
            <Link
              href="/login?next=/tasks"
              className="inline-flex items-center gap-1 font-medium text-cuc-700 hover:underline"
            >
              去登录 <ArrowRight size={10} />
            </Link>
          ) : pendingLocal > 0 ? (
            <button
              type="button"
              onClick={() => void importPendingTasks()}
              disabled={importBusy || loading}
              className="btn-ghost !px-2 !py-1.5 !text-[10.5px]"
            >
              {importBusy ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Download size={11} />
              )}
              导入本地任务（{pendingLocal}）
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard size="md" label="进行中" value={active.length} icon={ListChecks} />
        <StatCard
          size="md"
          label="7 天内截止"
          value={dueSoon.length}
          icon={Clock3}
          tone={dueSoon.length > 0 ? "warn" : "default"}
        />
        <StatCard
          size="md"
          label="已经逾期"
          value={overdue.length}
          icon={AlertTriangle}
          tone={overdue.length > 0 ? "stop" : "default"}
        />
        <StatCard
          size="md"
          label="平均步骤完成度"
          value={`${average}%`}
          icon={CheckCircle2}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
        <FilterButton active={filter === "active"} onClick={() => setFilter("active")}>
          进行中 <span>{active.length}</span>
        </FilterButton>
        <FilterButton active={filter === "urgent"} onClick={() => setFilter("urgent")}>
          临期与逾期 <span>{dueSoon.length + overdue.length}</span>
        </FilterButton>
        <FilterButton active={filter === "done"} onClick={() => setFilter("done")}>
          已完成 <span>{completed.length}</span>
        </FilterButton>
        <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
          全部 <span>{tasks.length}</span>
        </FilterButton>
      </div>

      {message && (
        <div
          className="mt-3 rounded-lg border border-cuc-200 bg-cuc-50 px-3 py-2 text-[12px] text-cuc-700"
          role="status"
        >
          {message}
        </div>
      )}

      {!ready ? (
        <div className="card mt-5 p-8 text-center text-[13px] text-slate-500">
          {source === "live" ? "正在从账号读取任务…" : "正在读取本机任务…"}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          filter={filter}
          hasTasks={tasks.length > 0}
          source={source}
        />
      ) : (
        <div className="mt-4 space-y-3">
          {filtered.map((task) => (
            <TaskItem
              key={task.task_id}
              task={task}
              now={now || Date.now()}
              onCopy={() => copy(task)}
              onCalendar={() => calendar(task)}
              onRemove={() => remove(task)}
              onMessage={setMessage}
            />
          ))}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-4 text-[11.5px] leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <p>
          官网网址发生变化、附件打不开或页面失效时，可在任务内按需巡检。这里不会伪装成自动定时监控。
        </p>
      </div>
    </div>
  );
}

function TaskItem({
  task,
  now,
  onCopy,
  onCalendar,
  onRemove,
  onMessage,
}: {
  task: CampusTask;
  now: number;
  onCopy: () => void;
  onCalendar: () => void;
  onRemove: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [handoffDraft, setHandoffDraft] = useState(task.handoff_note);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const progress = taskProgress(task);
  const materials = taskMaterialProgress(task);
  const deadline = deadlineInfo(task, now);
  const next = nextIncompleteStep(task);
  const complete = progress === 100;

  useEffect(() => {
    setHandoffDraft(task.handoff_note);
  }, [task.handoff_note]);

  async function runTaskMutation(
    action: string,
    request: () => Promise<TaskMutationResult>,
    success: string,
    options?: Parameters<typeof taskMutationMessage>[2],
  ) {
    if (busyAction) return;
    setBusyAction(action);
    try {
      const result = await request();
      onMessage(taskMutationMessage(result, success, options));
    } catch (requestError) {
      onMessage(
        requestError instanceof Error
          ? requestError.message
          : "任务保存失败，请稍后重试",
      );
    } finally {
      setBusyAction(null);
    }
  }

  function toggleCollaborator(member: string) {
    const nextMembers = task.collaborators.includes(member)
      ? task.collaborators.filter((item) => item !== member)
      : [...task.collaborators, member];
    void runTaskMutation(
      `collaborator-${member}`,
      () => setTaskCollaborators(task.task_id, nextMembers),
      "协作者已更新",
    );
  }

  function saveHandoff() {
    void runTaskMutation(
      "handoff",
      () => setTaskHandoffNote(task.task_id, handoffDraft.trim()),
      "交接说明已保存",
    );
  }

  async function removeCurrentTask() {
    if (busyAction) return;
    setBusyAction("remove");
    try {
      await onRemove();
    } finally {
      setBusyAction(null);
    }
  }

  async function pushFeishu() {
    if (busyAction) return;
    setBusyAction("feishu");
    try {
      const result = await pushTextToFeishu(taskSummaryText(task));
      if (!result.ok) {
        onMessage(result.message);
        return;
      }
      try {
        const activity = await addTaskActivity(
          task.task_id,
          "feishu",
          "任务摘要已推送到飞书群",
        );
        onMessage(
          `${result.message}；${taskMutationMessage(
            activity,
            "推送记录已保存",
          )}`,
        );
      } catch (requestError) {
        onMessage(
          `${result.message}；但推送记录保存失败：${
            requestError instanceof Error ? requestError.message : "未知错误"
          }`,
        );
      }
    } catch (requestError) {
      onMessage(
        requestError instanceof Error
          ? requestError.message
          : "飞书推送请求失败",
      );
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <article
      className={clsx(
        "overflow-hidden rounded-lg border bg-white",
        complete ? "border-state-okBorder" : "border-slate-200",
      )}
    >
      <div className="px-4 py-3.5">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-[15px] font-semibold text-slate-900">{task.title}</h2>
              {complete && <span className="chip bg-state-okBg text-state-ok">已完成</span>}
              <span className={clsx("chip border", toneClass[deadline.tone])}>{deadline.label}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-slate-500">
              {task.deadline?.text && <span className="break-words">截止：{task.deadline.text}</span>}
              {task.department.name && <span>{task.department.name}</span>}
              {task.department.phone && <span className="font-mono">{task.department.phone}</span>}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <TaskReminderButton task={task} onMessage={onMessage} />
            <button
              type="button"
              onClick={onCopy}
              className="btn-ghost !px-2 !py-1.5"
              title="复制微信/飞书摘要"
            >
              <Copy size={12} />
            </button>
            <button
              type="button"
              onClick={onCalendar}
              className="btn-ghost !px-2 !py-1.5"
              title="下载日历提醒"
            >
              <CalendarPlus size={12} />
            </button>
            <button
              type="button"
              onClick={() => void removeCurrentTask()}
              disabled={busyAction !== null}
              className="btn-ghost !px-2 !py-1.5 !text-state-stop"
              title="删除任务"
            >
              {busyAction === "remove" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Trash2 size={12} />
              )}
            </button>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ProgressLine label="步骤完成度" value={progress} complete={complete} />
          <ProgressLine
            label="材料准备度"
            value={materials.total ? Math.round((materials.done / materials.total) * 100) : 100}
            complete={materials.done === materials.total}
            suffix={materials.total ? `${materials.done}/${materials.total} 项` : "无材料"}
          />
        </div>

        <div className="mt-3 grid gap-2 border-y border-slate-100 py-3 sm:grid-cols-[140px_1fr] sm:items-center">
          <label className="flex items-center gap-2 text-[11.5px] text-slate-500">
            <UserRound size={12} />
            负责人
            <select
              value={task.owner}
              disabled={busyAction !== null}
              onChange={(event) =>
                void runTaskMutation(
                  "owner",
                  () => setTaskOwner(task.task_id, event.target.value),
                  "负责人已更新",
                )
              }
              className="min-w-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11.5px] text-slate-700 outline-none focus:border-cuc-400"
            >
              {TASK_MEMBERS.map((member) => (
                <option key={member} value={member}>
                  {member}
                </option>
              ))}
            </select>
          </label>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11.5px] text-slate-500">
              <Users size={12} /> 协作者
            </span>
            {TASK_MEMBERS.filter((member) => member !== task.owner).map((member) => {
              const selected = task.collaborators.includes(member);
              return (
                <button
                  key={member}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCollaborator(member)}
                  disabled={busyAction !== null}
                  className={clsx(
                    "rounded-md border px-2 py-1 text-[10.5px] font-medium transition-colors",
                    selected
                      ? "border-cuc-300 bg-cuc-50 text-cuc-700"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300",
                  )}
                >
                  {selected ? "✓ " : ""}
                  {member}
                </button>
              );
            })}
          </div>
        </div>

        {next && !complete && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-cuc-50/70 px-2.5 py-2 text-[12px] leading-5 text-cuc-800">
            <ArrowRight size={12} className="mt-1 shrink-0" />
            <p>
              <span className="font-medium">下一步：</span>
              {next.text}
            </p>
          </div>
        )}
      </div>

      <details className="border-t border-slate-100">
        <summary className="cursor-pointer px-4 py-2.5 text-[12px] font-medium text-slate-600 hover:bg-slate-50">
          展开步骤、材料清单与协作记录
        </summary>
        <div className="grid border-t border-slate-100 lg:grid-cols-[1.2fr_.8fr]">
          <div className="px-4 py-3">
            <div className="text-[11.5px] font-semibold text-slate-600">办理步骤</div>
            <div className="mt-2 space-y-2">
              {task.steps.map((step, index) => {
                const done = task.completed_step_ids.includes(step.id);
                return (
                  <label
                    key={step.id}
                    className={clsx(
                      "flex cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 py-2 transition-colors",
                      done
                        ? "border-state-okBorder bg-state-okBg/50"
                        : "border-slate-200 hover:border-cuc-300",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={done}
                      disabled={busyAction !== null}
                      onChange={(event) =>
                        void runTaskMutation(
                          `step-${step.id}`,
                          () =>
                            setTaskStepDone(
                              task.task_id,
                              step.id,
                              event.target.checked,
                            ),
                          event.target.checked ? "步骤已完成" : "步骤已重新打开",
                        )
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-cuc-600"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={clsx(
                          "block text-[12.5px] leading-5",
                          done ? "text-slate-400 line-through" : "text-slate-700",
                        )}
                      >
                        {index + 1}. {step.text}
                      </span>
                      {step.detail && (
                        <span className="mt-0.5 block break-words text-[11px] leading-4 text-slate-400">
                          {step.detail}
                        </span>
                      )}
                    </span>
                    {done && <Check size={14} className="mt-0.5 shrink-0 text-state-ok" />}
                  </label>
                );
              })}
            </div>

            {task.materials.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <div className="flex flex-wrap items-center gap-2">
                  <FileCheck2 size={13} className="text-cuc-600" />
                  <span className="text-[11.5px] font-semibold text-slate-600">材料准备清单</span>
                  <span className="text-[10.5px] text-slate-400">
                    {materials.done}/{materials.total} 已备齐
                  </span>
                </div>
                <div className="mt-2 space-y-1.5">
                  {task.materials.map((material, index) => {
                    const materialId = materialStableId(material, index);
                    const done = task.completed_material_ids.includes(materialId);
                    return (
                      <label
                        key={`${materialId}-${index}`}
                        className={clsx(
                          "flex cursor-pointer items-start gap-2.5 rounded-lg border px-2.5 py-2",
                          done
                            ? "border-state-okBorder bg-state-okBg/50"
                            : material.origin === "verify"
                              ? "border-state-warnBorder bg-state-warnBg/30"
                              : "border-slate-200",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={done}
                          disabled={busyAction !== null}
                          onChange={(event) =>
                            void runTaskMutation(
                              `material-${materialId}`,
                              () =>
                                setTaskMaterialDone(
                                  task.task_id,
                                  materialId,
                                  event.target.checked,
                                ),
                              event.target.checked
                                ? "材料已标记为备齐"
                                : "材料已取消备齐",
                            )
                          }
                          className="mt-0.5 h-4 w-4 shrink-0 accent-cuc-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={clsx(
                                "text-[12px] font-medium",
                                done ? "text-slate-400 line-through" : "text-slate-700",
                              )}
                            >
                              {material.name}
                            </span>
                            <span
                              className={clsx(
                                "chip !px-1 !text-[9.5px]",
                                material.origin === "official"
                                  ? "bg-state-okBg text-state-ok"
                                  : material.origin === "verify"
                                    ? "bg-state-warnBg text-state-warn"
                                    : "bg-cuc-100 text-cuc-700",
                              )}
                            >
                              {materialOriginLabel(material.origin)}
                            </span>
                          </span>
                          {(material.spec || material.note) && (
                            <span className="mt-0.5 block break-words text-[10.5px] leading-4 text-slate-400">
                              {[material.spec, material.note].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {task.remedy && (
              <div className="mt-4 rounded-lg border border-state-warnBorder bg-state-warnBg px-2.5 py-2 text-[11.5px] leading-5 text-slate-600">
                <span className="font-medium text-slate-800">错过后的路径：</span>
                {task.remedy.text}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 px-4 py-3 lg:border-l lg:border-t-0">
            <div className="flex flex-wrap items-center gap-2">
              <ExternalLink size={12} className="text-slate-400" />
              <a
                href={task.verification.source_url}
                target="_blank"
                rel="noreferrer"
                className="text-[11.5px] text-cuc-600 hover:underline"
              >
                核对官方原文
              </a>
              <SiteCheckButton url={task.verification.source_url} compact />
            </div>

            <div className="mt-4">
              <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-600">
                <MessageSquareText size={12} className="text-cuc-600" />
                交接说明
              </div>
              <textarea
                value={handoffDraft}
                onChange={(event) => setHandoffDraft(event.target.value)}
                disabled={busyAction !== null}
                rows={3}
                placeholder="例如：我已完成学院签字，乙继续送交事务大厅。"
                className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11.5px] leading-5 text-slate-700 outline-none placeholder:text-slate-300 focus:border-cuc-400"
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={saveHandoff}
                  disabled={busyAction !== null}
                  className="btn-ghost !px-2.5 !py-1.5 !text-[11px]"
                >
                  {busyAction === "handoff" ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Save size={11} />
                  )}
                  保存交接说明
                </button>
                <button
                  type="button"
                  onClick={() => void pushFeishu()}
                  disabled={busyAction !== null}
                  className="btn-ghost !px-2.5 !py-1.5 !text-[11px]"
                  title="需由后端配置飞书群机器人 Webhook"
                >
                  {busyAction === "feishu" ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Send size={11} />
                  )}
                  推送到飞书群
                </button>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-slate-400">
                飞书推送是用户手动触发，不是自动定时提醒；未配置 Webhook 时会明确提示。
              </p>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3">
              <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-600">
                <History size={12} className="text-cuc-600" />
                活动记录
              </div>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
                {task.activities.length ? (
                  task.activities.map((activity) => (
                    <div key={activity.id} className="flex gap-2 text-[10.5px] leading-4">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cuc-300" />
                      <div className="min-w-0">
                        <p className="break-words text-slate-600">{activity.text}</p>
                        <time className="text-slate-400" dateTime={activity.at}>
                          {new Date(activity.at).toLocaleString("zh-CN", {
                            month: "numeric",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </time>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-[10.5px] text-slate-400">暂无协作记录</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </details>
    </article>
  );
}

function ProgressLine({
  label,
  value,
  complete,
  suffix,
}: {
  label: string;
  value: number;
  complete: boolean;
  suffix?: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-[10.5px]">
        <span className="text-slate-500">{label}</span>
        <span className="font-medium tabular-nums text-slate-700">{suffix ?? `${value}%`}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={clsx("h-full rounded-full transition-all", complete ? "bg-state-ok" : "bg-cuc-500")}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
        active ? "bg-cuc-50 text-cuc-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({
  filter,
  hasTasks,
  source,
}: {
  filter: TaskFilter;
  hasTasks: boolean;
  source: "live" | "local";
}) {
  const copy =
    filter === "done"
      ? "还没有已完成的任务。"
      : filter === "urgent"
        ? hasTasks
          ? "当前没有临期或逾期任务。"
          : "还没有任务。"
        : hasTasks
          ? "当前筛选下没有任务。"
          : "还没有任务";

  return (
    <div className="card mt-5 px-5 py-12 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-cuc-50 text-cuc-600">
        <ClipboardCheck size={22} />
      </span>
      <h2 className="mt-3 text-[16px] font-semibold text-slate-800">{copy}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-6 text-slate-500">
        {source === "live"
          ? "在智能问答里生成办事卡，或从截止日期雷达和办事流程添加任务。登录后会在当前账号的其他设备同步。"
          : "在智能问答里生成办事卡，或从截止日期雷达和办事流程添加任务。未登录时记录会保留在当前浏览器，可在登录后手动导入。"}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link href="/chat" className="btn-primary">
          去智能问答 <ArrowRight size={13} />
        </Link>
        <Link href="/deadlines" className="btn-ghost">
          查看截止日期
        </Link>
      </div>
    </div>
  );
}

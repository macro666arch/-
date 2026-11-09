"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ListChecks,
  ChevronDown,
  AlertTriangle,
  Clock,
  MapPin,
  Phone,
  FileText,
  ExternalLink,
  ArrowRight,
  Users,
  Search,
} from "lucide-react";
import clsx from "clsx";
import { getProcesses } from "@/lib/api";
import { useProcesses } from "@/lib/useLive";
import DataBadge from "@/components/DataBadge";
import { VerifyBadge, EffectiveBadge, StaleBadge } from "@/components/StatusBadge";
import { SourceCard, GapAlert } from "@/components/SourceCard";
import TaskActions from "@/components/TaskActions";
import { processToActionCard } from "@/lib/tasks";
import type { Process } from "@/lib/contract";

/**
 * 办事流程页
 * ------------------------------------------------------------
 * 官方流程页的典型毛病（我们逐条对照过）：
 *  - 步骤编号会跳号（休学 1→2→3→5），缺的那步不解释
 *  - 截止日期藏在打不开的附件里
 *  - 需要的材料只写"相关材料"
 *  - 办理地点/电话不写，或写了但和别处不一致
 * 本页处理方式：**全部照原文呈现，缺口单独标出来，绝不替官方补写。**
 */

export default function ProcessesPage() {
  const { data: processes, source, error, syncing } = useProcesses(getProcesses());
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>("pr-01");

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return processes;
    return processes.filter((p) =>
      [
        p.process_name,
        p.applicable_to,
        p.dept_name ?? "",
        p.category ?? "",
        ...(p.conditions ?? []),
        ...(p.required_materials ?? []),
        ...(p.steps ?? []).map((s) => s.action),
      ]
        .join(" ")
        .toLowerCase()
        .includes(kw),
    );
  }, [processes, q]);

  const totalGaps = processes.reduce((n, p) => n + (p.gaps?.length ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      {/* ---------- 页头 ---------- */}
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">办事流程指引</h1>
          <DataBadge source={source} error={error} syncing={syncing} />
        </div>
        <p className="mt-1.5 max-w-3xl text-[13.5px] leading-6 text-slate-600">
          {processes.length} 条高频流程，逐步拆开，材料清单化。
          {totalGaps > 0 && (
            <>
              共标注 <span className="font-semibold text-state-warn">{totalGaps}</span> 处官方原文缺陷 ——{" "}
              <span className="font-medium text-slate-800">
                步骤跳号、缺材料、截止日期不可读，我们都照实标出来，不替官网补。
              </span>
            </>
          )}
        </p>
      </div>

      {/* ---------- 搜索 ---------- */}
      <div className="mb-5 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-cuc-400 focus-within:ring-2 focus-within:ring-cuc-100">
        <Search size={14} className="shrink-0 text-slate-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜流程名、材料、部门 —— 例如「助学贷款」「学生证」「加长床」"
          className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400"
        />
        <span className="shrink-0 text-[11.5px] text-slate-400">
          {filtered.length} / {processes.length}
        </span>
      </div>

      {/* ---------- 流程列表 ---------- */}
      <div className="space-y-2.5">
        {filtered.map((p) => (
          <ProcessCard
            key={p.id}
            p={p}
            open={openId === p.id}
            onToggle={() => setOpenId((v) => (v === p.id ? null : p.id))}
          />
        ))}
        {filtered.length === 0 && (
          <div className="card p-8 text-center">
            <p className="text-[14px] font-medium text-slate-700">没有匹配的流程</p>
            <p className="mt-1 text-[13px] text-slate-500">
              知识库目前只收了 {processes.length} 条高频流程。
              换个说法，或者去{" "}
              <Link href="/chat" className="text-cuc-600 hover:underline">
                问智能助手
              </Link>
              —— 它会告诉你这条流程我们有没有依据。
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-[12.5px] leading-6 text-slate-600">
        <p className="font-medium text-slate-800">为什么有些流程看起来「不完整」？</p>
        <p className="mt-1">
          因为官网原文就不完整。我们优先保证<span className="font-medium text-slate-800">「呈现的证据是真的」</span>，
          而不是「页面看起来完整」。任何我们自行推测补上的内容，都会标成
          <span className="mx-1 rounded bg-state-warnBg px-1 text-state-warn">推断</span>
          并与官方原文区分开。
        </p>
      </div>
    </div>
  );
}

/* ============================================================ */

function ProcessCard({ p, open, onToggle }: { p: Process; open: boolean; onToggle: () => void }) {
  const gapCount = p.gaps?.length ?? 0;

  return (
    <div className={clsx("card overflow-hidden transition-shadow", open && "shadow-lift")}>
      {/* 标题行 */}
      <button onClick={onToggle} className="flex w-full items-start gap-3 px-4 py-3 text-left">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cuc-50 text-[11px] font-semibold tabular-nums text-cuc-600">
          {p.steps?.length ?? 0}步
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-[14px] font-semibold text-slate-800">{p.process_name}</span>
            {gapCount > 0 && (
              <span className="chip bg-state-warnBg text-state-warn">
                <AlertTriangle size={9} /> {gapCount} 处官方缺陷
              </span>
            )}
            <VerifyBadge status={p.verify_status} />
            <EffectiveBadge status={p.effective_status} />
            <StaleBadge
              stale={p.stale}
              verified_months_ago={p.verified_months_ago}
              stale_reason={p.stale_reason}
            />
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <Users size={10} /> {p.applicable_to}
            </span>
            {p.dept_name && (
              <span className="inline-flex items-center gap-1">
                <MapPin size={10} /> {p.dept_name}
                {p.location_name ? `（${p.location_name}）` : ""}
              </span>
            )}
            {p.deadline && (
              <span className="inline-flex items-center gap-1 text-state-warn">
                <Clock size={10} /> {p.deadline}
              </span>
            )}
          </span>
        </span>
        <ChevronDown
          size={15}
          className={clsx("mt-1 shrink-0 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 pb-4 pt-3.5">
          {/* 办理信息 */}
          <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1.5 text-[12px]">
            {p.phone && (
              <a
                href={`tel:${p.phone}`}
                className="inline-flex items-center gap-1 font-medium tabular-nums text-cuc-700 hover:underline"
              >
                <Phone size={11} /> {p.phone}
              </a>
            )}
            {p.service_hours && (
              <span className="inline-flex items-center gap-1 text-slate-600">
                <Clock size={11} className="text-slate-400" /> {p.service_hours}
              </span>
            )}
            {p.need_appointment != null && (
              <span className="inline-flex items-center gap-1 text-slate-600">
                是否需预约：{p.need_appointment ? "需要" : "不需要"}
              </span>
            )}
            {p.entry_url && (
              <a
                href={p.entry_url}
                target="_blank"
                rel="noreferrer"
                className={clsx(
                  "inline-flex items-center gap-1 hover:underline",
                  p.entry_status === "正常" ? "text-cuc-700" : "text-state-warn",
                )}
              >
                <ExternalLink size={11} /> 线上入口
                {p.entry_status && p.entry_status !== "正常" && `（${p.entry_status}）`}
              </a>
            )}
          </div>

          {/* 适用条件 */}
          {p.conditions && p.conditions.length > 0 && (
            <Block title="适用条件">
              <ul className="space-y-1">
                {p.conditions.map((c, i) => (
                  <li key={i} className="flex gap-1.5 text-[12.5px] leading-relaxed text-slate-600">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-300" />
                    {c}
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {/* 材料 */}
          {p.required_materials && p.required_materials.length > 0 && (
            <Block title="所需材料" icon={<FileText size={11} />}>
              <div className="flex flex-wrap gap-1.5">
                {p.required_materials.map((m, i) => (
                  <span
                    key={i}
                    className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[12px] text-slate-700"
                  >
                    {m}
                  </span>
                ))}
              </div>
            </Block>
          )}

          {/* 步骤 */}
          {p.steps && p.steps.length > 0 && (
            <Block title="办理步骤">
              <ol className="relative space-y-2.5 border-l border-slate-200 pl-4">
                {p.steps.map((s) => (
                  <li key={s.step_no} className="relative">
                    <span className="absolute -left-[22px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-cuc-200 bg-white text-[9.5px] font-semibold tabular-nums text-cuc-600">
                      {s.step_no}
                    </span>
                    <div className="text-[12.5px] leading-relaxed text-slate-700">{s.action}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-slate-500">
                      {s.responsible_role && <span>负责：{s.responsible_role}</span>}
                      {s.prerequisite && <span>前置：{s.prerequisite}</span>}
                      {s.deadline && <span className="text-state-warn">时限：{s.deadline}</span>}
                      {s.next_entry && <span>下一步去向：{s.next_entry}</span>}
                    </div>
                    {s.gap_note && (
                      <div className="mt-1 rounded border border-state-warnBorder bg-state-warnBg px-2 py-1 text-[11.5px] leading-relaxed text-state-warn">
                        <AlertTriangle size={9} className="mr-1 inline" />
                        {s.gap_note}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </Block>
          )}

          {/* 缺口 —— 全站核心组件 */}
          {p.gaps && p.gaps.length > 0 && (
            <div className="mt-3">
              <GapAlert gaps={p.gaps} compact />
            </div>
          )}

          {/* 补救/兜底 */}
          {p.remedy && (
            <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] leading-relaxed text-slate-600">
              <span className="font-medium text-slate-800">如果按上面做不了：</span>
              {p.remedy}
            </div>
          )}

          {/* 来源 */}
          <div className="mt-3">
            <SourceCard
              source={{
                title: `${p.process_name} — ${p.source}`,
                url: p.source_url,
                publish_date: p.publish_date ?? null,
                verify_status: p.verify_status,
                effective_status: p.effective_status,
                stale: p.stale,
                verified_months_ago: p.verified_months_ago,
                stale_reason: p.stale_reason,
              }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>
              核对日期：{p.last_verified_at ?? "未标注"}
              {p.version_no && ` · 版本 ${p.version_no}`}
            </span>
            <Link
              href={`/chat?q=${encodeURIComponent(p.process_name + "怎么办理")}`}
              className="inline-flex items-center gap-1 text-cuc-600 hover:underline"
            >
              就这条流程提问 <ArrowRight size={10} />
            </Link>
          </div>
          <div className="mt-3 border-t border-slate-100 pt-3">
            <TaskActions card={processToActionCard(p)} compact />
          </div>
        </div>
      )}
    </div>
  );
}

function Block({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-slate-500">
        {icon ?? <ListChecks size={11} />}
        {title}
      </div>
      {children}
    </div>
  );
}

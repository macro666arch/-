"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Phone, MapPin, Clock, AlertTriangle, Search, X, ArrowRight, Info } from "lucide-react";
import clsx from "clsx";
import { getContacts } from "@/lib/api";
import { useContacts } from "@/lib/useLive";
import DataBadge from "@/components/DataBadge";
import { VerifyBadge, EffectiveBadge, StaleBadge } from "@/components/StatusBadge";
import { SourceCard, renderInline } from "@/components/SourceCard";
import type { Contact } from "@/lib/contract";

/**
 * 部门电话页
 * ------------------------------------------------------------
 * 官方只给了「按科室排列的号码列表」，学生实际要的是「我这件事该打哪个号」。
 * 所以本页做了官方没做的三件事：
 *   1. route_keywords —— 把「问题」映射到「科室」（官方无此表）
 *   2. 冲突并列 —— 65779702 一码两科；学籍管理 65783223 vs 65773223
 *   3. 按部门分组 + 搜索，减少翻找
 */

const deptOrder = ["学生工作部", "教务处", "后勤保障处", "信息化处", "党委保卫部", "其他部门"];

function deptGroup(c: Contact): string {
  const d = c.dept_name;
  if (d.includes("学生工作部")) return "学生工作部";
  if (d.includes("教务")) return "教务处";
  if (d.includes("后勤")) return "后勤保障处";
  if (d.includes("信息化")) return "信息化处";
  if (d.includes("保卫") || d.includes("户籍")) return "党委保卫部";
  return "其他部门";
}

export default function ContactsPage() {
  const { data: contacts, source, error, syncing } = useContacts(getContacts());
  const [q, setQ] = useState("");
  const [onlyConflict, setOnlyConflict] = useState(false);
  const [activeDept, setActiveDept] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return contacts.filter((c) => {
      if (onlyConflict && !c.conflict_flag) return false;
      if (activeDept && deptGroup(c) !== activeDept) return false;
      if (!kw) return true;
      const hay = [
        c.business_name,
        c.dept_name,
        c.phone ?? "",
        c.location_name ?? "",
        ...(c.route_keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(kw);
    });
  }, [contacts, q, onlyConflict, activeDept]);

  const grouped = useMemo(() => {
    const m = new Map<string, Contact[]>();
    for (const c of filtered) {
      const g = deptGroup(c);
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(c);
    }
    return Array.from(m.entries()).sort(
      (a, b) => deptOrder.indexOf(a[0]) - deptOrder.indexOf(b[0]),
    );
  }, [filtered]);

  const conflicts = contacts.filter((c) => c.conflict_flag);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      {/* ---------- 页头 ---------- */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">部门联系方式</h1>
          <DataBadge source={source} error={error} syncing={syncing} />
        </div>
        <p className="mt-1.5 max-w-3xl text-[13.5px] leading-6 text-slate-600">
          {contacts.length} 个官方号码，按「你要办什么事」而不是「部门内设机构」组织。
          官网没有「问题 → 科室」对照表，这一列是我们补的；
          <span className="font-medium text-slate-800">官方页面之间互相矛盾的地方，两个号码都列出来，标出来，不替你做选择。</span>
        </p>
      </div>

      {/* ---------- 冲突汇总条 ---------- */}
      {conflicts.length > 0 && (
        <div className="mb-5 rounded-xl border border-state-warnBorder bg-state-warnBg px-4 py-3">
          <div className="flex items-center gap-1.5 text-[13px] font-semibold text-state-warn">
            <AlertTriangle size={14} /> 有 {conflicts.length} 处官方信息冲突，已并列展示
          </div>
          <ul className="mt-2 space-y-1.5">
            {conflicts.map((c) => (
              <li key={c.id} className="text-[12.5px] leading-relaxed text-slate-600">
                <span className="font-medium text-slate-800">{c.dept_name}</span>
                <span className="mx-1 text-slate-400">·</span>
                {c.conflict_note}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- 搜索 + 筛选 ---------- */}
      <div className="sticky top-16 z-20 -mx-5 mb-5 border-b border-slate-200 bg-slate-50/95 px-5 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 focus-within:border-cuc-400 focus-within:ring-2 focus-within:ring-cuc-100">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜事情，不搜部门名 —— 例如「补办学生证」「助学贷款」「宿舍报修」"
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-slate-400"
            />
            {q && (
              <button onClick={() => setQ("")} title="清空" className="shrink-0 text-slate-400 hover:text-slate-600">
                <X size={13} />
              </button>
            )}
          </div>
          <button
            onClick={() => setOnlyConflict((v) => !v)}
            className={clsx(
              "chip !px-2.5 !py-2 transition-colors",
              onlyConflict
                ? "bg-state-warnBg text-state-warn ring-1 ring-state-warnBorder"
                : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100",
            )}
          >
            <AlertTriangle size={11} /> 只看冲突
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setActiveDept(null)}
            className={clsx(
              "chip transition-colors",
              !activeDept ? "bg-cuc-600 text-white" : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100",
            )}
          >
            全部
          </button>
          {deptOrder.map((d) => {
            const n = contacts.filter((c) => deptGroup(c) === d).length;
            if (!n) return null;
            return (
              <button
                key={d}
                onClick={() => setActiveDept((v) => (v === d ? null : d))}
                className={clsx(
                  "chip transition-colors",
                  activeDept === d
                    ? "bg-cuc-600 text-white"
                    : "bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100",
                )}
              >
                {d} <span className="opacity-60">{n}</span>
              </button>
            );
          })}
          <span className="ml-auto text-[11.5px] text-slate-400">
            显示 {filtered.length} / {contacts.length} 条
          </span>
        </div>
      </div>

      {/* ---------- 列表 ---------- */}
      {grouped.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-[14px] font-medium text-slate-700">没有匹配的科室</p>
          <p className="mt-1 text-[13px] text-slate-500">
            换个说法试试，或者去{" "}
            <Link href="/chat" className="text-cuc-600 hover:underline">
              问一下智能助手
            </Link>
            ，它会给出核实渠道。
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {grouped.map(([dept, list]) => (
            <section key={dept}>
              <h2 className="mb-2.5 flex items-center gap-2 text-[13px] font-semibold text-slate-500">
                <span className="h-3 w-0.5 rounded bg-cuc-500" />
                {dept}
                <span className="text-[11px] font-normal text-slate-400">{list.length} 项</span>
              </h2>
              <div className="grid gap-2.5 md:grid-cols-2">
                {list.map((c) => (
                  <ContactCard key={c.id} c={c} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ---------- 页脚说明 ---------- */}
      <div className="mt-8 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start gap-2">
          <Info size={14} className="mt-0.5 shrink-0 text-cuc-500" />
          <div className="text-[12.5px] leading-6 text-slate-600">
            <p className="font-medium text-slate-800">关于这些号码，你需要知道</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>
                所有号码均来自 cuc.edu.cn 官方页面，最近核对日期见每张卡片。
                <span className="text-slate-500">我们不保证明天还有效 —— 电话变更是常态，官网更新常常滞后。</span>
              </li>
              <li>
                「问题 → 科室」的映射（route_keywords）是<span className="font-medium text-slate-800">我们根据业务描述推断的</span>，
                不是官方发布的对照表。打错了请以接听方答复为准。
              </li>
              <li>
                冲突的号码我们不做「谁更可信」的判断 —— 你打不通一个可以试另一个。
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================ */

function ContactCard({ c }: { c: Contact }) {
  const [openSrc, setOpenSrc] = useState(false);

  return (
    <div
      className={clsx(
        "card p-3.5 transition-colors",
        c.conflict_flag && "border-state-warnBorder bg-state-warnBg/30",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13.5px] font-semibold text-slate-800">{c.business_name}</span>
            {c.conflict_flag && (
              <span className="chip bg-state-warnBg text-state-warn">
                <AlertTriangle size={9} /> 冲突
              </span>
            )}
            <StaleBadge
              stale={c.stale}
              verified_months_ago={c.verified_months_ago}
              stale_reason={c.stale_reason}
            />
          </div>
          <div className="mt-0.5 text-[12px] text-slate-500">{c.dept_name}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <VerifyBadge status={c.verify_status} />
          <EffectiveBadge status={c.effective_status} />
        </div>
      </div>

      {/* 主号码 */}
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
        {c.phone ? (
          <a
            href={`tel:${c.phone}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-cuc-50 px-2 py-1 text-[14px] font-semibold tabular-nums text-cuc-700 hover:bg-cuc-100"
            title={`拨打 ${c.phone}`}
          >
            <Phone size={12} /> {c.phone}
          </a>
        ) : (
          <span className="text-[12.5px] text-slate-400">未公开电话</span>
        )}

        {c.location_name && (
          <span className="inline-flex items-center gap-1 text-[12px] text-slate-600">
            <MapPin size={11} className="text-slate-400" /> {c.location_name}
          </span>
        )}

        {c.office_hours && (
          <span className="inline-flex items-center gap-1 text-[12px] text-slate-600">
            <Clock size={11} className="text-slate-400" /> {c.office_hours}
          </span>
        )}
      </div>

      {/* 冲突说明 */}
      {c.conflict_note && (
        <div className="mt-2 rounded-lg border border-state-warnBorder bg-white px-2.5 py-2 text-[12px] leading-relaxed text-slate-600">
          <span className="font-medium text-state-warn">冲突说明：</span>
          {renderInline(c.conflict_note)}
        </div>
      )}

      {/* 历史号码 */}
      {c.history_phones && c.history_phones.length > 0 && (
        <div className="mt-2 text-[11.5px] text-slate-500">
          <span className="font-medium text-slate-600">历史号码：</span>
          {c.history_phones.map((h, i) => (
            <span key={i}>
              {i > 0 && "、"}
              <span className="tabular-nums line-through decoration-slate-300">{h.phone}</span>
              {h.note && <span className="ml-1 text-slate-400">（{h.note}）</span>}
            </span>
          ))}
        </div>
      )}

      {/* 可问的问题 —— 把官方缺失的映射显式暴露出来 */}
      {c.route_keywords && c.route_keywords.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-slate-400">问这些会命中：</span>
          {c.route_keywords.slice(0, 4).map((k) => (
            <Link
              key={k}
              href={`/chat?q=${encodeURIComponent(k + "打哪个电话")}`}
              className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-600 hover:border-cuc-300 hover:text-cuc-700"
            >
              {k}
            </Link>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
        <button
          onClick={() => setOpenSrc((v) => !v)}
          className="inline-flex items-center gap-1 text-[11.5px] text-slate-500 hover:text-cuc-600"
        >
          {openSrc ? "收起来源" : "核对来源"} <ArrowRight size={10} className={clsx("transition-transform", openSrc && "rotate-90")} />
        </button>
        <span className="text-[11px] text-slate-400">{c.last_verified_at ?? "未标注核对日期"}</span>
      </div>

      {openSrc && (
        <div className="mt-2">
          <SourceCard
            source={{
              title: `${c.source} — ${c.dept_name}`,
              url: c.source_url,
              publish_date: c.publish_date ?? null,
              verify_status: c.verify_status,
              effective_status: c.effective_status,
              stale: c.stale,
              verified_months_ago: c.verified_months_ago,
              stale_reason: c.stale_reason,
            }}
          />
        </div>
      )}
    </div>
  );
}

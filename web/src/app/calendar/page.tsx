"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  Clock,
  MapPin,
  AlertTriangle,
  HelpCircle,
  ArrowRight,
  Info,
  Building2,
} from "lucide-react";
import clsx from "clsx";
import { getCalendars, getServiceHours } from "@/lib/api";
import { useCalendars, useServiceHours } from "@/lib/useLive";
import DataBadge from "@/components/DataBadge";
import { VerifyBadge, EffectiveBadge } from "@/components/StatusBadge";
import { SourceCard, GapAlert } from "@/components/SourceCard";

/**
 * 校历与服务时间
 * ------------------------------------------------------------
 * 这一页要说清两件事，都是学生最容易踩的坑：
 *  1. 中传**没有稳定公布的校历页** → 我们把结构做实、日期标待核实，并告诉你哪天该去问谁
 *  2. **没有"一站式大厅通用时间"这回事** → 8 项业务 8 种时段，逐项列出
 */

export default function CalendarPage() {
  const { data: calendars, source, error, syncing } = useCalendars(getCalendars());
  const { data: serviceHours } = useServiceHours(getServiceHours());
  const cal = calendars[0];
  const [tab, setTab] = useState<"schedule" | "hours">("hours");

  // 支持 /calendar?tab=schedule 直接落到第二个标签页（也方便截图/分享）
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "schedule") setTab("schedule");
    if (t === "hours") setTab("hours");
  }, []);

  const tbdCount = serviceHours.filter((s) => s.is_tbd).length;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[24px] font-semibold tracking-tight text-slate-900">校历与服务时间</h1>
          <DataBadge source={source} error={error} syncing={syncing} />
        </div>
        <p className="mt-1.5 max-w-3xl text-[13.5px] leading-6 text-slate-600">
          学生问「大厅几点开门」时，真实答案是{" "}
          <span className="font-medium text-slate-800">「看你要办哪件事」</span>——
          {serviceHours.length} 项高频业务对应 {new Set(serviceHours.map((x) => x.time_slot)).size} 种不同时段，有几项只写着「另行通知」。
          我们不做「取个平均值告诉你」这种事。
        </p>
      </div>

      {/* ---------- Tab ---------- */}
      <div className="mb-4 flex rounded-lg border border-slate-300 bg-white p-0.5">
        <button
          onClick={() => setTab("hours")}
          className={clsx(
            "flex-1 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
            tab === "hours" ? "bg-cuc-600 text-white" : "text-slate-600 hover:bg-slate-50",
          )}
        >
          <Clock size={12} className="mr-1 inline" />
          各项业务服务时间（{serviceHours.length}）
        </button>
        <button
          onClick={() => setTab("schedule")}
          className={clsx(
            "flex-1 rounded-md px-3 py-2 text-[13px] font-medium transition-colors",
            tab === "schedule" ? "bg-cuc-600 text-white" : "text-slate-600 hover:bg-slate-50",
          )}
        >
          <CalendarDays size={12} className="mr-1 inline" />
          学期结构与作息
        </button>
      </div>

      {/* ================= 服务时间 ================= */}
      {tab === "hours" && (
        <>
          {tbdCount > 0 && (
            <div className="mb-4 rounded-xl border border-state-warnBorder bg-state-warnBg px-4 py-3">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-state-warn">
                <AlertTriangle size={14} /> {tbdCount} 项业务「官方未公布固定时段」
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
                原文写「另行通知」或干脆不写。我们不猜 —— 标成待定，并给出去哪里问。
                这是本表和满大街的「一站式服务大厅 8:30–17:00」最大的区别。
              </p>
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="hidden grid-cols-[1.4fr_1fr_1.3fr_0.9fr] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2 text-[11.5px] font-semibold text-slate-500 sm:grid">
              <div>业务</div>
              <div>开放日</div>
              <div>时段</div>
              <div>状态</div>
            </div>
            {serviceHours.map((s) => (
              <div
                key={s.id}
                className={clsx(
                  "grid gap-2 border-b border-slate-100 px-4 py-3 last:border-0 sm:grid-cols-[1.4fr_1fr_1.3fr_0.9fr] sm:gap-3",
                  s.is_tbd && "bg-state-warnBg/40",
                )}
              >
                <div>
                  <div className="text-[13px] font-medium text-slate-800">{s.business_name}</div>
                  {s.location_name ? (
                    <div
                      className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-slate-500"
                      title={
                        (s as { location_source?: string | null }).location_source &&
                        (s as { location_source?: string | null }).location_source !== "backend"
                          ? `后端接口未返回地点，此处由本地知识库（${
                              (s as { location_source?: string | null }).location_source
                            }）补全`
                          : undefined
                      }
                    >
                      <MapPin size={9} /> {s.location_name}
                      {(s as { location_source?: string | null }).location_source &&
                        (s as { location_source?: string | null }).location_source !== "backend" && (
                          <span className="rounded bg-slate-100 px-1 text-[10px] text-slate-400">本地补全</span>
                        )}
                    </div>
                  ) : (
                    <div
                      className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-slate-400"
                      title="后端 /api/service-hours 只返回 location_id，没有地点名称；本地知识库也没有该业务的确定地点，因此不猜。"
                    >
                      <MapPin size={9} /> 地点未公布
                    </div>
                  )}
                  {s.applicable_to && (
                    <div className="mt-0.5 text-[11px] text-slate-400">适用：{s.applicable_to}</div>
                  )}
                </div>
                <div className="text-[12.5px] text-slate-700">
                  <span className="sm:hidden text-slate-400">开放日：</span>
                  {s.open_days}
                </div>
                <div className="text-[12.5px] text-slate-700">
                  <span className="sm:hidden text-slate-400">时段：</span>
                  {s.is_tbd ? (
                    <span className="inline-flex items-center gap-1 font-medium text-state-warn">
                      <HelpCircle size={10} /> 官方标注「另行通知」
                    </span>
                  ) : (
                    s.time_slot
                  )}
                </div>
                <div className="flex flex-wrap items-start gap-1">
                  <VerifyBadge status={s.verify_status} />
                  {s.need_appointment != null && (
                    <span className="chip bg-slate-100 text-slate-500">
                      {s.need_appointment ? "需预约" : "免预约"}
                    </span>
                  )}
                </div>
                {s.note && (
                  <div className="text-[11.5px] leading-relaxed text-slate-500 sm:col-span-4">
                    {s.note}
                  </div>
                )}
              </div>
            ))}
          </div>

          <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
            ★ 地点列：后端 <code className="rounded bg-slate-100 px-1">/api/service-hours</code>{" "}
            只返回 location_id（库里没有 locations 表），标「本地补全」的地点来自本系统知识库；
            标「地点未公布」表示官方没给出确定地址 —— 建议先打电话确认，我们不替你猜一栋楼。
          </p>

          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-[12.5px] leading-6 text-slate-600">
            <p className="font-medium text-slate-800">怎么读这张表</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>
                <span className="font-medium text-slate-700">线上能办的（学籍证明）是 7×24</span>
                —— 别跑一趟大厅。
              </li>
              <li>
                要盖章、要纸质件的，才受窗口时间限制；而且
                <span className="font-medium text-slate-700">上下午各一段，中午休息</span>。
              </li>
              <li>
                「另行通知」的（心理咨询、户籍、教材）建议<span className="font-medium text-slate-700">先打电话</span>，
                直接去很可能白跑。
              </li>
            </ul>
          </div>
        </>
      )}

      {/* ================= 学期结构 ================= */}
      {tab === "schedule" && cal && (
        <div className="space-y-4">
          <div className="rounded-xl border border-state-warnBorder bg-state-warnBg px-4 py-3">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-state-warn">
              <AlertTriangle size={14} /> 中传目前没有稳定公布的单一校历页面
            </div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
              每学期靠教务处临时发通知，学生很难查到「这周是第几周」。
              下面把
              <span className="font-medium text-slate-800">结构做实（周次、课节时间），具体日期一律标待核实</span>
              —— 我们宁可显示「待核实」，也不给你一个看上去很像但可能是错的日期。
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <InfoBox
              icon={CalendarDays}
              label="学期"
              value={`${cal.academic_year} 学年 · ${cal.semester}季`}
            />
            <InfoBox
              icon={Clock}
              label="教学周"
              value={
                cal.teaching_weeks
                  ? `第 ${cal.teaching_weeks.start}–${cal.teaching_weeks.end} 周`
                  : "待核实"
              }
            />
            <InfoBox
              icon={Clock}
              label="考试周"
              value={
                cal.exam_weeks ? `第 ${cal.exam_weeks.start}–${cal.exam_weeks.end} 周` : "待核实"
              }
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {/* 关键日期 */}
            <div className="card p-4">
              <h3 className="mb-2.5 text-[13px] font-semibold text-slate-700">关键时间点</h3>
              <div className="space-y-1.5">
                {cal.key_dates?.length ? (
                  cal.key_dates.map((k, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-[12.5px]">
                      <span className="w-28 shrink-0 text-slate-500">{k.name}</span>
                      <span
                        className={clsx(
                          k.date.includes("待核实") ? "text-state-warn" : "text-slate-800",
                        )}
                      >
                        {k.date}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[12.5px] text-slate-400">
                    暂无关键时间点数据（后端未返回，本地知识库也没有）
                  </p>
                )}
              </div>
              <p className="mt-2.5 border-t border-slate-100 pt-2 text-[11.5px] leading-relaxed text-slate-500">
                标橙色的表示官方尚未公布 / 我们未能核实。
                <Link href="/chat?q=什么时候选课" className="ml-1 text-cuc-600 hover:underline">
                  问助手要核实渠道 →
                </Link>
              </p>
            </div>

            {/* 假期 */}
            <div className="card p-4">
              <h3 className="mb-2.5 text-[13px] font-semibold text-slate-700">假期安排</h3>
              <div className="space-y-1.5">
                {cal.holidays?.length ? (
                  cal.holidays.map((h, i) => (
                    <div key={i} className="flex items-baseline gap-2 text-[12.5px]">
                      <span className="w-20 shrink-0 text-slate-500">{h.name}</span>
                      <span className="text-state-warn">
                        {h.start} — {h.end}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[12.5px] text-slate-400">
                    暂无假期安排数据（官方尚未公布，本地知识库也没有）
                  </p>
                )}
              </div>
              <p className="mt-2.5 border-t border-slate-100 pt-2 text-[11.5px] leading-relaxed text-slate-500">
                放假与调课安排每学期以国务院办公厅 + 校办通知为准，我们没有可靠来源前不填具体日期。
              </p>
            </div>
          </div>

          {/* 作息 */}
          <div className="card p-4">
            <h3 className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-slate-700">
              <Clock size={12} /> 课节时间（这部分是稳定的，可放心用）
            </h3>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-6">
              {cal.daily_schedule?.map((d, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center"
                >
                  <div className="text-[11px] text-slate-500">{d.period}</div>
                  <div className="text-[12px] font-medium tabular-nums text-slate-800">
                    {d.time}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <GapAlert
            gaps={cal.gaps}
            title="这份校历还缺什么"
          />

          <SourceCard
            source={{
              title: `校历 — ${cal.source}`,
              url: cal.source_url,
              publish_date: cal.publish_date ?? null,
              verify_status: cal.verify_status,
              effective_status: cal.effective_status,
            }}
          />
        </div>
      )}

      <div className="mt-6 flex items-start gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <Info size={14} className="mt-0.5 shrink-0 text-cuc-500" />
        <div className="text-[12.5px] leading-6 text-slate-600">
          <p className="font-medium text-slate-800">一句话总结这一页</p>
          <p className="mt-0.5">
            「一站式服务大厅几点开门」是个<span className="font-medium text-slate-800">问错了的问题</span>。
            正确问法是「我要办 XX，什么时间去合适」——
            <Link href="/chat" className="mx-1 text-cuc-600 hover:underline">
              去问助手
            </Link>
            ，它会先确定你办哪件事。
          </p>
        </div>
      </div>
    </div>
  );
}

function InfoBox({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cuc-50 text-cuc-600">
        <Icon size={14} />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] text-slate-400">{label}</div>
        <div className="truncate text-[13px] font-medium text-slate-800">{value}</div>
      </div>
    </div>
  );
}

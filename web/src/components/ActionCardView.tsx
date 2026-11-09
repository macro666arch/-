"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  FileText,
  MapPin,
  Phone,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import clsx from "clsx";
import type { ActionCard, EvidenceItem } from "@/lib/contract";
import TaskActions from "@/components/TaskActions";
import TiltCard from "@/components/fx/TiltCard";
import {
  copyMaterialChecklist,
  materialAudienceWarning,
  materialOriginLabel,
  materialProfileSummary,
  materialSubmissionLabel,
  personalizeMaterials,
  useMaterialProfile,
} from "@/lib/materials";

export default function ActionCardView({
  card,
  evidence = [],
}: {
  card: ActionCard;
  evidence?: EvidenceItem[];
}) {
  const { profile, update } = useMaterialProfile();
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");
  const materials = personalizeMaterials(card, profile);
  const officialCount = materials.filter((item) => item.origin === "official").length;
  const derivedCount = materials.filter((item) => item.origin === "derived").length;
  const verifyCount = materials.filter((item) => item.origin === "verify").length;
  const profileSummary = materialProfileSummary(profile);
  const audienceWarning = materialAudienceWarning(card, profile);

  async function copyChecklist() {
    const copied = await copyMaterialChecklist(card, materials, profile);
    setCopyState(copied ? "success" : "error");
  }

  return (
    <TiltCard className="mt-3 rounded-xl">
      <section className="overflow-hidden rounded-xl border border-cuc-200 bg-white">
      <div className="border-b border-cuc-100 bg-cuc-50/70 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-cuc-700">
              <CheckCircle2 size={12} /> 可执行办事卡
            </div>
            <h3 className="mt-1 text-[15px] font-semibold text-slate-900">{card.title}</h3>
            {card.summary && (
              <p className="mt-1 max-w-3xl text-[12.5px] leading-6 text-slate-600">{card.summary}</p>
            )}
          </div>
          {card.applicable_to && (
            <span className="chip shrink-0 bg-white text-slate-600">适用：{card.applicable_to}</span>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-100 px-4">
        <div className="grid gap-x-5 gap-y-2 py-3 text-[12px] sm:grid-cols-2">
          {card.deadline?.text && (
            <InfoRow
              icon={CalendarClock}
              label="时间节点"
              value={card.deadline.text}
              tone="warn"
            />
          )}
          {card.department.name && (
            <InfoRow icon={Building2} label="主管部门" value={card.department.name} />
          )}
          {card.department.phone && (
            <InfoRow
              icon={Phone}
              label="联系电话"
              value={card.department.phone}
              href={`tel:${card.department.phone}`}
            />
          )}
          {card.department.location && (
            <InfoRow icon={MapPin} label="办理地点" value={card.department.location} />
          )}
          {card.department.hours && (
            <InfoRow icon={Clock3} label="服务时间" value={card.department.hours} />
          )}
          {card.department.entry_url && (
            <InfoRow
              icon={ExternalLink}
              label="线上入口"
              value={card.department.entry_status || "打开入口"}
              href={card.department.entry_url}
            />
          )}
        </div>

        {card.missing_fields.length > 0 && (
          <div className="flex gap-2 py-3 text-[12px] leading-5 text-state-warn">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <p>
              <span className="font-medium">官方原文未明确：</span>
              {card.missing_fields.join("、")}。系统没有替你猜。
            </p>
          </div>
        )}

        {card.materials.length > 0 && (
          <div className="py-3">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <SectionTitle icon={FileText} title={`我的材料清单 ${materials.length}`} />
              <span className="text-[10px] text-slate-400">
                官网明确 {officialCount}
                {derivedCount > 0 ? ` · 系统整理 ${derivedCount}` : ""}
                {verifyCount > 0 ? ` · 待核实 ${verifyCount}` : ""}
              </span>
              <button
                type="button"
                onClick={copyChecklist}
                className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[10.5px] text-slate-600 transition-colors hover:border-cuc-300 hover:text-cuc-700"
              >
                <Copy size={10} /> 复制清单
              </button>
            </div>

            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/70 p-2.5">
              {audienceWarning && (
                <div className="mb-2 flex gap-1.5 rounded-md border border-state-warnBorder bg-state-warnBg px-2 py-1.5 text-[10.5px] leading-4 text-state-warn">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                  <span>{audienceWarning}</span>
                </div>
              )}
              <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-medium text-slate-500">
                <SlidersHorizontal size={11} /> 当前方案：{profileSummary}
              </div>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
                <ProfileSelect
                  label="身份"
                  value={profile.studentType}
                  onChange={(value) =>
                    update({ studentType: value as typeof profile.studentType })
                  }
                  options={[
                    ["undergraduate", "本科生"],
                    ["graduate", "研究生"],
                  ]}
                />
                <ProfileSelect
                  label="办理情形"
                  value={profile.applicationType}
                  onChange={(value) =>
                    update({ applicationType: value as typeof profile.applicationType })
                  }
                  options={[
                    ["normal", "普通办理"],
                    ["first", "首次办理"],
                    ["reissue", "遗失 / 补办"],
                  ]}
                />
                <ProfileSelect
                  label="由谁办理"
                  value={profile.handler}
                  onChange={(value) => update({ handler: value as typeof profile.handler })}
                  options={[
                    ["self", "本人"],
                    ["entrusted", "委托他人"],
                  ]}
                />
                <ProfileSelect
                  label="提交方式"
                  value={profile.submission}
                  onChange={(value) =>
                    update({ submission: value as typeof profile.submission })
                  }
                  options={[
                    ["unknown", "尚未确定"],
                    ["online", "线上"],
                    ["onsite", "现场"],
                  ]}
                />
              </div>
              <p className="mt-1.5 flex items-start gap-1 text-[10px] leading-4 text-slate-400">
                <UserRound size={9} className="mt-0.5 shrink-0" />
                “系统整理”和“待核实”只是准备提醒，不会计入官网明确要求。
              </p>
              {copyState !== "idle" && (
                <p
                  role="status"
                  className={clsx(
                    "mt-1.5 text-[10px]",
                    copyState === "success" ? "text-state-ok" : "text-state-stop",
                  )}
                >
                  {copyState === "success"
                    ? "材料清单已复制，可直接粘贴到微信或飞书。"
                    : "复制失败，请检查浏览器剪贴板权限。"}
                </p>
              )}
            </div>

            <div className="mt-2 space-y-1.5">
              {materials.map((item) => (
                <div
                  key={`${item.id ?? item.name}-${item.download_url ?? ""}`}
                  className={clsx(
                    "rounded-lg border px-2.5 py-2",
                    item.origin === "official"
                      ? "border-slate-200 bg-white"
                      : item.origin === "verify"
                        ? "border-state-warnBorder bg-state-warnBg/40"
                        : "border-cuc-100 bg-cuc-50/40",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <FileText size={11} className="shrink-0 text-slate-400" />
                    <span className="text-[12px] font-medium text-slate-700">{item.name}</span>
                    {item.required === false && (
                      <span className="text-[9.5px] text-slate-400">非必带</span>
                    )}
                    <span
                      className={clsx(
                        "chip !px-1 !text-[9.5px]",
                        item.origin === "official"
                          ? "bg-state-okBg text-state-ok"
                          : item.origin === "verify"
                            ? "bg-state-warnBg text-state-warn"
                            : "bg-cuc-100 text-cuc-700",
                      )}
                    >
                      {materialOriginLabel(item.origin)}
                    </span>
                    <span className="chip !px-1 !text-[9.5px] bg-slate-100 text-slate-500">
                      {materialSubmissionLabel(item.submission)}
                    </span>
                    {item.download_url && (
                      <a
                        href={item.download_url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto text-cuc-600"
                        title="下载官方材料"
                      >
                        <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                  {(item.spec || item.note) && (
                    <p className="mt-1 pl-[17px] text-[10.5px] leading-4 text-slate-500">
                      {[item.spec, item.note].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {card.steps.length > 0 && (
          <div className="py-3">
            <SectionTitle icon={CheckCircle2} title={`办理步骤 ${card.steps.length}`} />
            <ol className="mt-2 space-y-2">
              {card.steps.map((step, index) => (
                <li key={step.id} className="flex gap-2.5">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-cuc-200 bg-cuc-50 text-[10px] font-semibold text-cuc-700">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[12.5px] leading-5 text-slate-700">{step.text}</span>
                      <span
                        className={clsx(
                          "chip !px-1 !text-[9.5px]",
                          step.origin === "official"
                            ? "bg-state-okBg text-state-ok"
                            : "bg-state-warnBg text-state-warn",
                        )}
                      >
                        {step.origin === "official" ? "官方步骤" : "系统整理"}
                      </span>
                    </div>
                    {step.detail && (
                      <p className="mt-0.5 text-[11.5px] leading-5 text-slate-500">{step.detail}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}

        {card.remedy && (
          <div className="py-3">
            <div
              className={clsx(
                "flex gap-2 rounded-lg border px-3 py-2.5",
                card.remedy.available
                  ? "border-state-warnBorder bg-state-warnBg"
                  : "border-slate-200 bg-slate-50",
              )}
            >
              <RotateCcw
                size={13}
                className={clsx(
                  "mt-0.5 shrink-0",
                  card.remedy.available ? "text-state-warn" : "text-slate-400",
                )}
              />
              <div>
                <div className="text-[12px] font-medium text-slate-800">
                  {card.remedy.available ? "错过后的补救路径" : "错过后的处理方式需人工核实"}
                </div>
                <p className="mt-0.5 text-[12px] leading-5 text-slate-600">{card.remedy.text}</p>
              </div>
            </div>
          </div>
        )}

        {card.verification.gaps.length > 0 && (
          <div className="py-3">
            <SectionTitle icon={AlertTriangle} title="官方原文缺陷" />
            <ul className="mt-1.5 space-y-1">
              {card.verification.gaps.map((gap) => (
                <li key={gap} className="flex gap-1.5 text-[11.5px] leading-5 text-state-warn">
                  <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-state-warn" />
                  {gap}
                </li>
              ))}
            </ul>
          </div>
        )}

        {evidence.length > 0 && (
          <div className="py-3">
            <SectionTitle icon={ShieldCheck} title={`官方证据 ${evidence.length}`} />
            <div className="mt-2 space-y-1.5">
              {evidence.slice(0, 4).map((item) => (
                <a
                  key={`${item.type}-${item.id}`}
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-slate-200 px-2.5 py-2 transition-colors hover:border-cuc-300 hover:bg-cuc-50/40"
                >
                  <span className="flex items-start gap-1.5">
                    <ExternalLink size={10} className="mt-1 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11.5px] font-medium text-slate-700">
                        {item.title}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-slate-500">
                        {item.snippet}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1 text-[10px] text-slate-400">
                        {item.verify_status && <span>{item.verify_status}</span>}
                        {item.effective_status && <span>· {item.effective_status}</span>}
                        {item.publish_date && <span>· {item.publish_date}</span>}
                      </span>
                    </span>
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        <div className="py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1">
              <ShieldCheck size={11} className="text-state-ok" />
              {card.verification.verify_status}
            </span>
            <span>·</span>
            <span>{card.verification.effective_status}</span>
            <a
              href={card.verification.source_url}
              target="_blank"
              rel="noreferrer"
              className="ml-auto inline-flex items-center gap-1 text-cuc-600 hover:underline"
            >
              查看官方原文 <ExternalLink size={10} />
            </a>
          </div>
          <TaskActions card={card} materials={materials} compact />
        </div>
      </div>
    </section>
    </TiltCard>
  );
}

function ProfileSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="min-w-0">
      <span className="mb-0.5 block text-[9.5px] text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 outline-none focus:border-cuc-400"
      >
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
  href,
  tone,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
  href?: string;
  tone?: "warn";
}) {
  const content = (
    <>
      <Icon
        size={12}
        className={clsx("mt-0.5 shrink-0", tone === "warn" ? "text-state-warn" : "text-slate-400")}
      />
      <span className="min-w-0">
        <span className="text-slate-400">{label}：</span>
        <span className={clsx("break-words", tone === "warn" ? "text-state-warn" : "text-slate-700")}>
          {value}
        </span>
      </span>
    </>
  );
  return href ? (
    <a href={href} target={href.startsWith("tel:") ? undefined : "_blank"} rel="noreferrer" className="flex gap-1.5 hover:text-cuc-700">
      {content}
    </a>
  ) : (
    <div className="flex gap-1.5">{content}</div>
  );
}

function SectionTitle({ icon: Icon, title }: { icon: typeof FileText; title: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-600">
      <Icon size={12} className="text-cuc-600" />
      {title}
    </div>
  );
}

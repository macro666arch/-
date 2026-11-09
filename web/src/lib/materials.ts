"use client";

import { useEffect, useState } from "react";
import type { ActionCard, ActionCardMaterial } from "@/lib/contract";

export const MATERIAL_PROFILE_KEY = "cuc-material-profile-v1";
export const MATERIAL_PROFILE_EVENT = "cuc-material-profile-changed";

export interface MaterialProfile {
  studentType: "undergraduate" | "graduate";
  applicationType: "first" | "reissue" | "normal";
  handler: "self" | "entrusted";
  submission: "online" | "onsite" | "unknown";
}

export const DEFAULT_MATERIAL_PROFILE: MaterialProfile = {
  studentType: "undergraduate",
  applicationType: "normal",
  handler: "self",
  submission: "unknown",
};

const MATERIAL_PROFILE_VALUES = {
  studentType: ["undergraduate", "graduate"],
  applicationType: ["first", "reissue", "normal"],
  handler: ["self", "entrusted"],
  submission: ["online", "onsite", "unknown"],
} as const;

function storageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readMaterialProfile(): MaterialProfile {
  if (!storageAvailable()) return DEFAULT_MATERIAL_PROFILE;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(MATERIAL_PROFILE_KEY) ?? "null",
    ) as Partial<MaterialProfile> | null;
    if (!parsed) return DEFAULT_MATERIAL_PROFILE;
    return {
      studentType: MATERIAL_PROFILE_VALUES.studentType.includes(
        parsed.studentType as (typeof MATERIAL_PROFILE_VALUES.studentType)[number],
      )
        ? (parsed.studentType as MaterialProfile["studentType"])
        : DEFAULT_MATERIAL_PROFILE.studentType,
      applicationType: MATERIAL_PROFILE_VALUES.applicationType.includes(
        parsed.applicationType as (typeof MATERIAL_PROFILE_VALUES.applicationType)[number],
      )
        ? (parsed.applicationType as MaterialProfile["applicationType"])
        : DEFAULT_MATERIAL_PROFILE.applicationType,
      handler: MATERIAL_PROFILE_VALUES.handler.includes(
        parsed.handler as (typeof MATERIAL_PROFILE_VALUES.handler)[number],
      )
        ? (parsed.handler as MaterialProfile["handler"])
        : DEFAULT_MATERIAL_PROFILE.handler,
      submission: MATERIAL_PROFILE_VALUES.submission.includes(
        parsed.submission as (typeof MATERIAL_PROFILE_VALUES.submission)[number],
      )
        ? (parsed.submission as MaterialProfile["submission"])
        : DEFAULT_MATERIAL_PROFILE.submission,
    };
  } catch {
    return DEFAULT_MATERIAL_PROFILE;
  }
}

export function writeMaterialProfile(profile: MaterialProfile): void {
  if (!storageAvailable()) return;
  window.localStorage.setItem(MATERIAL_PROFILE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event(MATERIAL_PROFILE_EVENT));
}

export function useMaterialProfile(): {
  profile: MaterialProfile;
  update: (patch: Partial<MaterialProfile>) => void;
  ready: boolean;
} {
  const [profile, setProfile] = useState<MaterialProfile>(DEFAULT_MATERIAL_PROFILE);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setProfile(readMaterialProfile());
      setReady(true);
    };
    refresh();
    window.addEventListener(MATERIAL_PROFILE_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(MATERIAL_PROFILE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  function update(patch: Partial<MaterialProfile>) {
    const next = { ...profile, ...patch };
    setProfile(next);
    writeMaterialProfile(next);
  }

  return { profile, update, ready };
}

export function materialStableId(material: ActionCardMaterial, index = 0): string {
  if (material.id?.trim()) return material.id;
  const slug = material.name
    .trim()
    .toLowerCase()
    .replace(/[^\u4e00-\u9fffa-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `material-${slug || index + 1}`;
}

function asOfficialMaterial(
  material: ActionCardMaterial,
  index: number,
): ActionCardMaterial {
  return {
    ...material,
    id: materialStableId(material, index),
    origin: material.origin ?? "official",
    submission: material.submission ?? "unknown",
  };
}

function isStudentCardCard(card: ActionCard): boolean {
  return /学生证/.test(`${card.title} ${card.summary}`);
}

function isCertificateCard(card: ActionCard): boolean {
  return /证明|学籍|在读/.test(`${card.title} ${card.summary}`);
}

function isLoanCard(card: ActionCard): boolean {
  return /助学贷款|回执|资助/.test(`${card.title} ${card.summary}`);
}

export function materialProfileSummary(profile: MaterialProfile): string {
  return [
    profile.studentType === "undergraduate" ? "本科生" : "研究生",
    profile.applicationType === "first"
      ? "首次办理"
      : profile.applicationType === "reissue"
        ? "遗失 / 补办"
        : "普通办理",
    profile.handler === "self" ? "本人办理" : "委托办理",
    profile.submission === "online"
      ? "线上提交"
      : profile.submission === "onsite"
        ? "现场提交"
        : "提交方式未定",
  ].join(" · ");
}

export function materialAudienceWarning(
  card: ActionCard,
  profile: MaterialProfile,
): string | undefined {
  const audience = card.applicable_to?.trim();
  if (!audience) return undefined;
  const mentionsGraduate = /研究生/.test(audience);
  const mentionsUndergraduate = /本科生|本科/.test(audience);
  if (
    profile.studentType === "graduate" &&
    mentionsUndergraduate &&
    !mentionsGraduate
  ) {
    return `原文适用对象为“${audience}”，当前方案选择的是研究生。办理前先向主管部门确认是否适用。`;
  }
  if (
    profile.studentType === "undergraduate" &&
    mentionsGraduate &&
    !mentionsUndergraduate
  ) {
    return `原文适用对象为“${audience}”，当前方案选择的是本科生。办理前先向主管部门确认是否适用。`;
  }
  return undefined;
}

/**
 * 官网材料原样保留；按身份、首次/补办、本人/委托、线上/现场补充的条目
 * 要么标 derived，要么标 verify，绝不混入“官网明确”计数。
 */
export function personalizeMaterials(
  card: ActionCard,
  profile: MaterialProfile,
): ActionCardMaterial[] {
  const base = card.materials.map(asOfficialMaterial);
  const existing = new Set(base.map((item) => item.name));
  const extras: ActionCardMaterial[] = [];

  function add(item: ActionCardMaterial) {
    if (existing.has(item.name)) return;
    existing.add(item.name);
    extras.push({
      ...item,
      required: item.required ?? false,
      origin: item.origin ?? "verify",
      submission: item.submission ?? "unknown",
    });
  }

  // 只在有明确材料要求的办事事项上给准备建议，避免把“带身份证”套到所有咨询类事项。
  if (base.length > 0) {
    if (profile.handler === "entrusted") {
      add({
        id: "derived-authorization",
        name: "授权委托书",
        origin: "verify",
        note: "官网未统一说明能否代办及委托书格式，需先向主管部门确认。",
      });
      add({
        id: "derived-trustee-id",
        name: "受托人身份证件",
        origin: "verify",
        note: "是否核验受托人证件、是否收复印件，需按具体窗口要求确认。",
      });
    }

    if (profile.submission === "online") {
      add({
        id: "derived-digital-copy",
        name: "清晰电子版材料",
        origin: "derived",
        submission: "online",
        note: "系统整理项；文件格式、大小和命名以办理系统提示为准。",
      });
    }

    if (profile.submission === "onsite") {
      add({
        id: "derived-paper-copy",
        name: "原件及必要复印件",
        origin: "verify",
        submission: "onsite",
        note: "官网未必统一写明复印件份数，现场前应电话确认。",
      });
    }
  }

  if (isStudentCardCard(card) && profile.applicationType === "reissue") {
    add({
      id: "derived-reissue-note",
      name: "遗失或损坏情况说明",
      origin: "derived",
      note: "系统按“补办”场景整理；官网未明确是否要求书面说明。",
    });
    add({
      id: "derived-photo-format",
      name: "确认照片底色、尺寸与份数",
      origin: "verify",
      note: "官网只写了照片，底色、是否收电子版及张数需向办理窗口确认。",
    });
  }

  if (isStudentCardCard(card) && profile.applicationType === "first") {
    add({
      id: "derived-first-card-route",
      name: "确认新生首次领取方式",
      origin: "verify",
      note: "新生学生证可能由学院集中办理；是否需要个人到窗口办理，以学院通知为准。",
    });
  }

  if (isCertificateCard(card) && profile.applicationType === "first") {
    add({
      id: "derived-certificate-use",
      name: "证明用途与份数",
      origin: "derived",
      note: "系统整理项；线上申请时通常要填写用途和份数，以系统页面为准。",
    });
  }

  if (isLoanCard(card) && profile.studentType === "undergraduate") {
    add({
      id: "derived-loan-check",
      name: "回执验证码与个人信息核对",
      origin: "derived",
      note: "系统整理项；提交前核对姓名、学号和验证码，避免录入失败。",
    });
  }

  return [...base, ...extras];
}

export function materialOriginLabel(origin?: ActionCardMaterial["origin"]): string {
  if (origin === "derived") return "系统整理";
  if (origin === "verify") return "待核实";
  return "官网明确";
}

export function materialSubmissionLabel(
  submission?: ActionCardMaterial["submission"],
): string {
  if (submission === "online") return "线上";
  if (submission === "onsite") return "现场";
  if (submission === "mail") return "邮寄";
  return "方式待核实";
}

export function buildMaterialChecklistText(
  card: ActionCard,
  materials: ActionCardMaterial[],
  profile: MaterialProfile,
): string {
  const official = materials.filter((item) => item.origin === "official").length;
  const derived = materials.filter((item) => item.origin === "derived").length;
  const verify = materials.filter((item) => item.origin === "verify").length;
  const lines = [
    `【${card.title} · 我的材料清单】`,
    `当前方案：${materialProfileSummary(profile)}`,
    `计数：官网明确 ${official} / 系统整理 ${derived} / 待核实 ${verify}`,
    "",
    ...materials.map((item, index) => {
      const suffix = [
        materialOriginLabel(item.origin),
        materialSubmissionLabel(item.submission),
        item.spec,
        item.note,
      ]
        .filter(Boolean)
        .join("；");
      return `${index + 1}. [ ] ${item.name}（${suffix}）`;
    }),
    "",
    card.department.name ? `主管部门：${card.department.name}` : "",
    card.department.phone ? `联系电话：${card.department.phone}` : "",
    card.department.location ? `办理地点：${card.department.location}` : "",
    `官方来源：${card.verification.source_url}`,
    "说明：标为“系统整理”或“待核实”的项目不是官网明确要求，出门前请按电话或系统页面确认。",
  ];
  return lines.filter((line, index) => line !== "" || index === 3).join("\n");
}

export async function copyMaterialChecklist(
  card: ActionCard,
  materials: ActionCardMaterial[],
  profile: MaterialProfile,
): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const text = buildMaterialChecklistText(card, materials, profile);

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back for browsers that expose Clipboard API but deny permission.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  const copied = document.execCommand("copy");
  textarea.remove();
  return copied;
}

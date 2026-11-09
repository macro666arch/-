"use client";

import { useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Loader2,
  ScanSearch,
} from "lucide-react";
import clsx from "clsx";
import { checkOfficialPage, type SiteCheckResult } from "@/lib/api";

export default function SiteCheckButton({
  url,
  compact = false,
}: {
  url: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SiteCheckResult>();

  async function check() {
    if (busy) return;
    setBusy(true);
    setResult(await checkOfficialPage(url));
    setBusy(false);
  }

  return (
    <div className={compact ? "inline-block" : "rounded-lg border border-slate-200 p-3"}>
      <button
        type="button"
        onClick={check}
        disabled={busy}
        className={clsx("btn-ghost", compact ? "!px-2 !py-1.5 !text-[11px]" : "!py-1.5 !text-[12px]")}
        title="只检查这一条官网链接，不是自动定时监控"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <ScanSearch size={12} />}
        {busy ? "正在巡检" : "巡检官网"}
      </button>
      {result && (
        <div
          className={clsx(
            "mt-1.5 flex max-w-sm items-start gap-1.5 text-[10.5px] leading-4",
            result.ok ? "text-state-ok" : "text-state-warn",
          )}
          role="status"
        >
          {result.ok ? (
            <CheckCircle2 size={11} className="mt-0.5 shrink-0" />
          ) : (
            <CircleAlert size={11} className="mt-0.5 shrink-0" />
          )}
          <span>
            {result.message}
            {result.checked_at && (
              <span className="ml-1 text-slate-400">
                · {new Date(result.checked_at).toLocaleString("zh-CN", { hour12: false })}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

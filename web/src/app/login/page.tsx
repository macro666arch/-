"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import clsx from "clsx";
import { getToken, login, register } from "@/lib/auth";
import { readableError } from "@/lib/http";

type Mode = "login" | "register";

function safeNext(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/tasks";
  return value;
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [next, setNext] = useState("/tasks");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [alreadyLoggedIn, setAlreadyLoggedIn] = useState(false);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setNext(safeNext(query.get("next")));
    setAlreadyLoggedIn(!!getToken());
  }, []);

  function switchMode(value: Mode) {
    setMode(value);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const normalizedUsername = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(normalizedUsername)) {
      setError("用户名需为 3-20 位小写字母、数字或下划线");
      return;
    }
    if (password.length < 6) {
      setError("密码至少需要 6 位");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(normalizedUsername, password);
      } else {
        await register({
          username: normalizedUsername,
          password,
          displayName: displayName.trim() || undefined,
        });
      }
      router.replace(next);
      router.refresh();
    } catch (requestError) {
      const message = readableError(requestError);
      setError(
        message.includes("429")
          ? "操作太频繁，请稍后再试"
          : message || "登录失败，请稍后重试",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-3.5rem)] max-w-5xl items-center gap-8 px-4 py-8 sm:px-5 lg:grid-cols-[.9fr_1.1fr]">
      <section className="hidden lg:block">
        <span className="chip bg-cuc-50 text-cuc-700">账号任务同步</span>
        <h1 className="mt-4 text-[34px] font-semibold leading-tight text-slate-900">
          换设备，任务也跟着走。
        </h1>
        <p className="mt-3 max-w-md text-[13.5px] leading-7 text-slate-500">
          登录后，任务按账号隔离保存；后端暂不可用时仍可继续使用本地任务，并在恢复后手动导入。
        </p>
        <div className="mt-6 space-y-3">
          <Benefit text="账号之间任务隔离，不会互相看到" />
          <Benefit text="勾选步骤和材料后自动同步云端" />
          <Benefit text="断网写作不会白屏，本地记录可导入" />
        </div>
      </section>

      <section className="mx-auto w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-card sm:p-7">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cuc-600 text-[12px] font-bold text-white">
            中传
          </span>
          <div>
            <h2 className="text-[20px] font-semibold text-slate-900">
              {mode === "login" ? "登录校园助手" : "创建校园账号"}
            </h2>
            <p className="text-[11px] text-slate-400">
              Token 在浏览器本地保存 7 天
            </p>
          </div>
        </div>

        {alreadyLoggedIn && (
          <div className="mt-4 rounded-lg border border-cuc-200 bg-cuc-50 px-3 py-2 text-[11.5px] leading-5 text-cuc-700">
            当前浏览器已有登录状态。继续登录会切换到新账号。
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            aria-pressed={mode === "login"}
            onClick={() => switchMode("login")}
            className={clsx(
              "rounded-md px-3 py-2 text-[12px] font-medium transition-colors",
              mode === "login"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            登录
          </button>
          <button
            type="button"
            aria-pressed={mode === "register"}
            onClick={() => switchMode("register")}
            className={clsx(
              "rounded-md px-3 py-2 text-[12px] font-medium transition-colors",
              mode === "register"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            )}
          >
            注册
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-medium text-slate-600">
              用户名
            </span>
            <span className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus-within:border-cuc-400 focus-within:ring-2 focus-within:ring-cuc-100">
              <UserRound size={15} className="shrink-0 text-slate-400" />
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                autoComplete="username"
                placeholder="3-20 位字母、数字或下划线"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-300"
              />
            </span>
          </label>

          {mode === "register" && (
            <label className="block">
              <span className="mb-1.5 block text-[11.5px] font-medium text-slate-600">
                显示名称 <span className="font-normal text-slate-400">（可选）</span>
              </span>
              <span className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus-within:border-cuc-400 focus-within:ring-2 focus-within:ring-cuc-100">
                <UserRound size={15} className="shrink-0 text-slate-400" />
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  autoComplete="nickname"
                  placeholder="例如：丙"
                  className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-300"
                />
              </span>
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 block text-[11.5px] font-medium text-slate-600">
              密码
            </span>
            <span className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 focus-within:border-cuc-400 focus-within:ring-2 focus-within:ring-cuc-100">
              <KeyRound size={15} className="shrink-0 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                placeholder="至少 6 位"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-slate-800 outline-none placeholder:text-slate-300"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="rounded p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </span>
          </label>

          {error && (
            <div
              role="alert"
              className="rounded-lg border border-state-stopBorder bg-state-stopBg px-3 py-2 text-[11.5px] leading-5 text-state-stop"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full !py-2.5"
          >
            {submitting ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <ShieldCheck size={15} />
            )}
            {mode === "login" ? "登录并同步任务" : "注册并进入任务"}
            {!submitting && <ArrowRight size={14} />}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-[11px]">
          <span className="text-slate-400">暂不登录也可继续本地演示</span>
          <Link href="/tasks" className="shrink-0 font-medium text-cuc-600 hover:underline">
            本地使用
          </Link>
        </div>
      </section>
    </div>
  );
}

function Benefit({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 text-[12px] leading-5 text-slate-600">
      <ShieldCheck size={14} className="mt-0.5 shrink-0 text-state-ok" />
      {text}
    </div>
  );
}

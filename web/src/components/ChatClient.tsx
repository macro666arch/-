"use client";

import { useRef, useState, useEffect } from "react";
import {
  Send,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Phone,
  ExternalLink,
  Sparkles,
  CornerDownLeft,
  RotateCcw,
  Lightbulb,
  ClipboardCheck,
  CircleCheck,
  CircleAlert,
  CircleX,
  ChevronDown,
  Database,
  Workflow,
  Bot,
  AlertTriangle,
} from "lucide-react";
import clsx from "clsx";
import { askChatWithContext, isMock } from "@/lib/api";
import { demoQuestions } from "@/lib/mock/chat";
import {
  ChatStatusBadge,
  chatStatusLegend,
  VerifyBadge,
  EffectiveBadge,
  StaleBadge,
} from "@/components/StatusBadge";
import { renderInline } from "@/components/SourceCard";
import ActionCardView from "@/components/ActionCardView";
import Magnetic from "@/components/fx/Magnetic";
import gsap from "gsap";
import type { ActionCard, ChatResponse, ChatStatus, EvidenceItem, PipelineStage } from "@/lib/contract";
import {
  clearChatHistory,
  hasAccount,
  loadChatHistory,
  saveChatHistory,
} from "@/lib/chatHistory";
import {
  isLikelyFollowUp,
  resolveConversationQuestion,
  type ConversationState,
} from "@/lib/conversation";

/**
 * 聊天主界面 —— 从可信回答到可执行办事卡
 * ------------------------------------------------------------
 * 设计要点（答辩时重点讲这三条）：
 *  1. **三态前置**：status 不是"成功/失败"，而是"我有多确定"，徽章放在答案最上面
 *  2. **冲突并列**：conflict 时不选边，两个值左右并排 + 各自来源
 *  3. **拒答给路**：unconfirmed 时不说"抱歉我不知道"，而是给具体核实渠道
 */

type Msg = {
  id: string;
  role: "user" | "assistant";
  text?: string;
  data?: ChatResponse;
  loading?: boolean;
  error?: string;
  usedContext?: boolean;
  resolvedText?: string;
};

type RuntimeState = "demo" | "idle" | "requesting" | "live" | "fallback" | "failed";

const runtimeMap: Record<
  RuntimeState,
  { label: string; cls: string; title: string; pulse?: boolean }
> = {
  demo: {
    label: "本地演示模式",
    cls: "bg-slate-100 text-slate-500",
    title: "当前使用本地知识库和确定性规则，不请求后端",
  },
  idle: {
    label: "后端待连接",
    cls: "bg-slate-100 text-slate-500",
    title: "首次提问后才会请求后端，未请求前不宣称已连接",
  },
  requesting: {
    label: "正在请求后端",
    cls: "bg-cuc-50 text-cuc-700",
    title: "正在等待后端检索、核验和规划结果",
    pulse: true,
  },
  live: {
    label: "后端实时回答",
    cls: "bg-state-okBg text-state-ok",
    title: "本轮回答由后端实时接口返回",
  },
  fallback: {
    label: "本地知识库兜底",
    cls: "bg-state-warnBg text-state-warn",
    title: "后端请求未成功，本轮回答已退回本地知识库",
  },
  failed: {
    label: "请求异常",
    cls: "bg-state-stopBg text-state-stop",
    title: "请求在进入兜底逻辑前发生异常",
  },
};

const greet: Msg = {
  id: "greet",
  role: "assistant",
  data: {
    status: "answered",
    answer:
      "我是**中传校园信息助手**。你可以问我校园里的规章、流程、材料、部门电话、办公地点、服务时间、通知和校历。\n\n我不止给一段答案，还会把官方信息整理成一条完整办事链路：\n\n1. **查信息**：每条答案都附官方来源\n2. **多轮追问**：接着问“那要带什么材料”，会沿用上一问主题\n3. **生成办事卡**：按身份与办理情形个性化材料，官网项和待核实项分开\n4. **加入任务**：账号同步倒计时、分工、材料与交接，离网时可本地暂存\n5. **截止雷达与补救**：聚合真实日期节点，错过时给官方候补或人工核实路径\n6. **有冲突就并列**：两个官方说法都给你，不替你选",
    sources: [],
    notice: "",
  },
};

const HISTORY_KEY = "cuc-chat-history-v1";

export default function ChatClient() {
  const [msgs, setMsgs] = useState<Msg[]>([greet]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeState>(isMock ? "demo" : "idle");
  const [conversation, setConversation] = useState<ConversationState>({ turns: 0 });
  const [ready, setReady] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const autoRan = useRef(false);
  const prevMsgCount = useRef(0);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs]);

  /* 聊天页自带内部滚动容器：锁住 body 滚动（仅桌面，移动端有 fixed 底栏保持原状），
     避免「滚动链接」在聊天滚到底后把全站 Footer 拉进消息区中间，形成横贯白条 */
  useEffect(() => {
    const cls = "md:overflow-hidden";
    document.body.classList.add(cls);
    return () => {
      document.body.classList.remove(cls);
    };
  }, []);

  // GSAP 消息入场：新消息上浮 + 去模糊 + 淡入，stagger 编排
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const fresh = msgs.length - prevMsgCount.current;
    prevMsgCount.current = msgs.length;
    if (fresh <= 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const items = list.querySelectorAll<HTMLElement>("[data-msg-item]");
    const targets = Array.from(items).slice(-fresh);
    if (!targets.length) return;
    gsap.fromTo(
      targets,
      { opacity: 0, y: 26, filter: "blur(8px)" },
      {
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        duration: 0.7,
        ease: "power3.out",
        stagger: 0.1,
        clearProps: "opacity,transform,filter",
      },
    );
  }, [msgs.length]);

  // 进入页面时恢复：优先账号里的记录，未登录或后端不可用时退回本标签页缓存。
  useEffect(() => {
    let alive = true;

    const apply = (saved: {
      msgs?: Msg[];
      conversation?: ConversationState;
      runtime?: RuntimeState;
    }) => {
      if (Array.isArray(saved.msgs) && saved.msgs.length > 0) {
        const restored = saved.msgs.filter((m) => !m.loading);
        if (restored.length > 0) setMsgs(restored);
      }
      if (saved.conversation) setConversation(saved.conversation);
      if (saved.runtime && saved.runtime !== "requesting") setRuntime(saved.runtime);
    };

    let local: { msgs?: Msg[]; conversation?: ConversationState; runtime?: RuntimeState } | null = null;
    try {
      const raw = sessionStorage.getItem(HISTORY_KEY);
      if (raw) local = JSON.parse(raw);
    } catch {
      // 存储不可用或内容损坏时，退回默认开场白
    }
    if (local) apply(local);

    void (async () => {
      if (hasAccount()) {
        const remote = await loadChatHistory();
        if (alive && remote) {
          apply(remote as { msgs?: Msg[]; conversation?: ConversationState; runtime?: RuntimeState });
        }
      }
      if (alive) setReady(true);
    })();

    return () => {
      alive = false;
    };
  }, []);

  // 每次对话变化后写回：账号同步 + 本标签页缓存兜底。
  useEffect(() => {
    if (!ready) return;
    const snapshot = {
      msgs: msgs.filter((m) => !m.loading).slice(-40),
      conversation,
      runtime: runtime === "requesting" ? "idle" : runtime,
    };
    try {
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(snapshot));
    } catch {
      // 超出配额时放弃本地缓存，不影响账号同步
    }
    if (!hasAccount()) return;
    const timer = window.setTimeout(() => {
      void saveChatHistory(snapshot);
    }, 1_200);
    return () => window.clearTimeout(timer);
  }, [ready, msgs, conversation, runtime]);

  /**
   * 支持首页/说明页用 /chat?q=xxx 直接带问题跳进来。
   * 用 window.location 而不是 useSearchParams：后者会强制整个页面退出静态生成，
   * 而这里只需要跑一次，没必要付出那个代价。
   */
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    const q = new URLSearchParams(window.location.search).get("q");
    if (q && q.trim()) void send(q.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(q?: string) {
    const text = (q ?? input).trim();
    if (!text || busy) return;

    const resolved = resolveConversationQuestion(text, conversation);
    const context = {
      topic: resolved.state.topic,
      previous_question: conversation.lastQuestion,
      turn: resolved.state.turns,
      // 把最近几轮问答一起带给后端，模型才能接住「它/刚才那个」这类跨轮指代
      history: conversation.history ?? [],
    };
    const uid = `u-${Date.now()}`;
    const aid = `a-${Date.now()}`;
    setMsgs((m) => [
      ...m,
      {
        id: uid,
        role: "user",
        text,
        usedContext: resolved.usedContext,
        resolvedText: resolved.resolved,
      },
      { id: aid, role: "assistant", loading: true },
    ]);
    setConversation({ ...resolved.state, history: conversation.history });
    setInput("");
    setBusy(true);
    if (!isMock) setRuntime("requesting");

    try {
      const data = await askChatWithContext(text, resolved.resolved, context);
      if (!isMock) {
        setRuntime(data.meta?.engine === "local-fallback" ? "fallback" : "live");
      }
      setMsgs((m) => m.map((x) => (x.id === aid ? { ...x, loading: false, data } : x)));
      // 只留最近 8 轮，单条答案截断，避免上下文无限膨胀拖慢请求
      setConversation((prev) => ({
        ...prev,
        history: [
          ...(prev.history ?? []),
          { question: text, answer: (data.answer ?? "").slice(0, 800) },
        ].slice(-8),
      }));
    } catch (e) {
      if (!isMock) setRuntime("failed");
      setMsgs((m) =>
        m.map((x) =>
          x.id === aid
            ? { ...x, loading: false, error: e instanceof Error ? e.message : "请求失败" }
            : x,
        ),
      );
    } finally {
      setBusy(false);
      taRef.current?.focus();
    }
  }

  function reset() {
    setMsgs([greet]);
    setInput("");
    setConversation({ turns: 0 });
    setRuntime(isMock ? "demo" : "idle");
    try {
      sessionStorage.removeItem(HISTORY_KEY);
    } catch {
      // 忽略存储不可用
    }
    void clearChatHistory();
  }

  const runtimeView = runtimeMap[runtime];

  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col sm:h-[calc(100dvh-4rem)]">
      {/* ---------- 顶部状态条 ---------- */}
      <div className="flex flex-col gap-2 border-b border-slate-200 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="hidden max-w-[180px] truncate whitespace-nowrap text-[12px] font-medium text-slate-500 sm:inline">
            {conversation.topic ? `当前主题：${conversation.topic}` : "多轮上下文：等待事项"}
          </span>
          <div className="flex items-center gap-1.5">
            {(["answered", "conflict", "unconfirmed"] as ChatStatus[]).map((s) => (
              <span key={s} title={chatStatusLegend[s].desc}>
                <ChatStatusBadge status={s} size="sm" />
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <span
            className={clsx("chip", runtimeView.cls)}
            title={runtimeView.title}
          >
            {runtimeView.pulse ? (
              <Loader2 size={10} className="animate-spin" />
            ) : (
              <span
                className={clsx(
                  "h-1.5 w-1.5 rounded-full",
                  runtime === "live"
                    ? "bg-state-ok"
                    : runtime === "fallback"
                      ? "bg-state-warn"
                      : runtime === "failed"
                        ? "bg-state-stop"
                        : "bg-slate-400",
                )}
              />
            )}
            {runtimeView.label}
          </span>
          {ready && (
            <span
              className="chip border border-slate-200 bg-white text-slate-500"
              title={
                hasAccount()
                  ? "对话会保存到当前登录账号，换设备登录也能看到"
                  : "未登录：对话只保存在当前浏览器标签页，登录后可同步到账号"
              }
            >
              {hasAccount() ? "已存到账号" : "仅本标签页"}
            </span>
          )}
          <button onClick={reset} className="btn-ghost !px-2 !py-1 !text-[12px]" title="清空对话">
            <RotateCcw size={12} /> 清空
          </button>
        </div>
      </div>

      {/* ---------- 消息流 ---------- */}
      {/* 极光与粒子已由 layout 全局氛围层提供，此处不再重复挂载 */}
      <div className="relative flex-1">
        <div ref={scrollRef} className="relative h-full overflow-y-auto px-3 py-4 sm:px-5 sm:py-5">
        <div ref={listRef} className="mx-auto max-w-3xl space-y-5">
          {msgs.map((m) => (
            <div key={m.id} data-msg-item>
              {m.role === "user" ? <UserBubble msg={m} /> : <AssistantBubble msg={m} onAsk={send} />}
            </div>
          ))}

          {msgs.length <= 1 && (
            <div className="pt-2">
              <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium text-slate-400">
                <Sparkles size={12} /> 试试这几条（覆盖三种状态）
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {demoQuestions.map((d) => (
                  <button
                    key={d.q}
                    onClick={() => send(d.q)}
                    className="group flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left transition-colors hover:border-cuc-300 hover:bg-cuc-50/40"
                  >
                    <span className="truncate text-[12.5px] text-slate-700">{d.q}</span>
                    <span className="chip shrink-0 bg-slate-100 text-slate-500">{d.label}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 rounded-lg border border-cuc-200 bg-cuc-50/40 p-3.5">
                <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-cuc-800">
                  <Lightbulb size={13} /> 怎么让助手生成可执行办事卡
                </div>
                <ol className="mt-2.5 space-y-2">
                  {[
                    {
                      n: "01",
                      title: "先说身份和情形",
                      body: "助手按身份与情形筛材料，例如「我是大二学生」。",
                    },
                    {
                      n: "02",
                      title: "再说要办的事",
                      body: "一件事问清楚：怎么办理、去哪儿办、要带什么。",
                    },
                    {
                      n: "03",
                      title: "最后加一句「整理成办事卡」",
                      body: "助手会把材料清单、办理步骤、负责部门和截止日期一起整理成卡，可一键加入任务。",
                    },
                  ].map((s) => (
                    <li key={s.n} className="flex gap-2">
                      <span className="mt-0.5 shrink-0 font-mono text-[10px] text-cuc-600">{s.n}</span>
                      <span className="min-w-0 text-[11.5px] leading-5 text-slate-600">
                        <span className="font-medium text-slate-800">{s.title}</span>
                        <span className="mx-1 text-slate-400">·</span>
                        {s.body}
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-400">照着说：</span>
                  <button
                    onClick={() =>
                      send("我是大二学生，要开具在读证明，怎么办理？请整理成办事卡。")
                    }
                    className="rounded-md border border-cuc-200 bg-white px-2 py-1 text-left text-[11.5px] text-cuc-800 transition-colors hover:border-cuc-400 hover:bg-cuc-50"
                  >
                    我是大二学生，要开具在读证明，怎么办理？请整理成办事卡。
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* ---------- 输入区 ---------- */}
      <div className="border-t border-slate-200 bg-white px-3 py-3 sm:px-5">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-xl border border-slate-300 bg-white p-1.5 focus-within:border-cuc-400 focus-within:ring-2 focus-within:ring-cuc-100">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="问点什么，比如「学籍管理科的电话是多少」"
              className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-2.5 py-2 text-[14px] leading-6 outline-none placeholder:text-slate-400"
            />
            <Magnetic strength={0.55}>
              <button
                onClick={() => send()}
                disabled={!input.trim() || busy}
                className="btn-primary !px-3 !py-2"
                title="发送（Enter）"
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </Magnetic>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
            <span className="flex items-center gap-1 text-[11px] text-slate-400">
              <CornerDownLeft size={10} /> Enter 发送 · Shift+Enter 换行
            </span>
            <span className="text-[11px] text-slate-400">
              {conversation.topic && isLikelyFollowUp(input)
                ? `将接续「${conversation.topic}」`
                : "只答校园信息查询，不办业务、不查个人成绩"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   用户气泡
   ============================================================ */
function UserBubble({ msg }: { msg: Msg }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%]">
        <div className="rounded-2xl rounded-br-md bg-cuc-600 px-3.5 py-2.5 text-[14px] leading-6 text-white">
          {msg.text}
        </div>
        {msg.usedContext && (
          <div className="mt-1 text-right text-[10.5px] text-slate-400">
            已结合上一问，按「{msg.resolvedText}」检索
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   助手气泡 —— 三态在这里分叉
   ============================================================ */
function AssistantBubble({ msg, onAsk }: { msg: Msg; onAsk?: (q: string) => void }) {
  if (msg.loading) {
    return (
      <div className="flex items-center gap-2 text-[13px] text-slate-400">
        <span className="dot-blink flex gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full bg-cuc-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-cuc-400" />
          <span className="h-1.5 w-1.5 rounded-full bg-cuc-400" />
        </span>
        正在检索知识库、核对官方证据并整理办事卡…
      </div>
    );
  }

  if (msg.error) {
    return (
      <div className="rounded-xl border border-state-stopBorder bg-state-stopBg px-3.5 py-3">
        <div className="flex items-center gap-1.5 text-[13px] font-medium text-state-stop">
          <ShieldAlert size={14} /> 调用失败
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">
          {msg.error}
          <br />
          若后端未启动，可把 <code className="kd">NEXT_PUBLIC_USE_MOCK</code> 保持默认（true）走本地演示数据。
        </p>
      </div>
    );
  }

  const d = msg.data!;
  // 后端没有返回结构化办事卡时，从回答里的「项目 / 内容」表整理出一张，
  // 这样任何「我要办的事」都能落到可加入任务雷达的办事表。
  const card = d.action_card ?? buildCardFromAnswer(d);
  // 结论先读，引用默认收起，需要核对原文时再展开。
  const [showSources, setShowSources] = useState(false);
  const Icon =
    d.status === "answered" ? ShieldCheck : d.status === "conflict" ? ShieldAlert : ShieldQuestion;
  const staleSources = d.sources.filter((s) => s.stale);

  return (
    <div className="max-w-[92%]">
      {/* 状态徽章 —— 永远在答案最上方 */}
      <div className="mb-2 flex items-center gap-2">
        <ChatStatusBadge status={d.status} />
        <span className="text-[11px] text-slate-400">{chatStatusLegend[d.status].desc}</span>
        {card && (
          <span className="chip bg-cuc-50 text-cuc-700">
            <ClipboardCheck size={9} />
            {d.task_suggestion?.step_count ?? card.steps.length} 步
            {card.materials.length ? ` · ${card.materials.length} 项材料` : ""}
          </span>
        )}
        {card && d.remedy_mode && d.remedy_mode !== "none" && (
          <span
            className={clsx(
              "chip",
              d.remedy_mode === "available"
                ? "bg-state-warnBg text-state-warn"
                : "bg-slate-100 text-slate-500",
            )}
          >
            {d.remedy_mode === "available" ? "有补救路径" : "补救需核实"}
          </span>
        )}
      </div>

      {/* 时效预警 —— 必须在答案正文之前，避免用户先执行后看到 */}
      {staleSources.map((source, index) => {
        const months =
          typeof source.verified_months_ago === "number" &&
          Number.isFinite(source.verified_months_ago)
            ? `${source.verified_months_ago} 个月前`
            : "较早时间";
        return (
          <div
            key={`${source.url}-${index}`}
            className="mb-2.5 rounded-lg border border-state-warnBorder bg-state-warnBg px-3 py-2.5 text-state-warn"
          >
            <div className="flex items-start gap-1.5 text-[12.5px] font-medium leading-5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                本条依据上次核实于 {months}，信息可能已变化，建议向主管部门确认。
              </span>
            </div>
            {source.stale_reason && (
              <p className="mt-1 pl-[19px] text-[11.5px] leading-5 text-amber-900">
                {source.stale_reason}
              </p>
            )}
          </div>
        );
      })}

      {/* 冲突：左右并列 */}
      {d.status === "conflict" && d.conflicts && d.conflicts.length > 0 && (
        <div className="mb-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-medium text-state-warn">
            <Icon size={13} /> 两个官方说法并列如下，本系统不替你选
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {d.conflicts.map((c, i) => (
              <div
                key={i}
                className="rounded-lg border border-state-warnBorder bg-white p-3"
              >
                <div className="text-[11.5px] font-medium text-slate-500">{c.label}</div>
                <div className="mt-1 font-mono text-[17px] font-semibold tracking-tight text-slate-900">
                  {c.value}
                </div>
                {c.note && <div className="mt-0.5 text-[11.5px] text-slate-500">{c.note}</div>}
                <a
                  href={c.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 flex items-center gap-1 text-[11px] text-cuc-600 hover:underline"
                >
                  <ExternalLink size={10} /> {c.source}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 主体 */}
      <div
        className={clsx(
          "rounded-xl border bg-white px-4 py-3.5",
          d.status === "answered" && "border-slate-200",
          d.status === "conflict" && "border-state-warnBorder",
          d.status === "unconfirmed" && "border-state-stopBorder",
        )}
      >
        <MarkdownLite text={d.answer} />

        {/* 顶部提示条 */}
        {d.notice && (
          <div
            className={clsx(
              "mt-3 rounded-lg px-3 py-2 text-[12.5px] leading-relaxed",
              d.status === "conflict"
                ? "bg-state-warnBg text-amber-900"
                : d.status === "unconfirmed"
                  ? "bg-state-stopBg text-red-900"
                  : "bg-slate-50 text-slate-600",
            )}
          >
            {d.notice}
          </div>
        )}
      </div>

      {/* 官方原文 -> 可执行办事卡（后端未生成时，由上方回答整理出一张） */}
      {card && <ActionCardView card={card} evidence={d.evidence ?? []} />}

      {/* 后端已经返回证据、但暂未生成办事卡时，也不丢掉原文摘录 */}
      {!card && d.evidence && d.evidence.length > 0 && <EvidenceList evidence={d.evidence} />}

      {!card && d.missing_fields && d.missing_fields.length > 0 && (
        <div className="mt-2.5 flex gap-2 rounded-lg border border-state-warnBorder bg-state-warnBg px-3 py-2.5 text-[12px] leading-5 text-state-warn">
          <CircleAlert size={13} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-medium">官方原文未明确：</span>
            {d.missing_fields.join("、")}。系统没有替你猜。
          </span>
        </div>
      )}

      {/* 来源：默认折叠，避免把整段资料堆在回答后面 */}
      {d.sources.length > 0 && (
        <div className="mt-2.5 rounded-lg border border-slate-200">
          <button
            type="button"
            aria-expanded={showSources}
            onClick={() => setShowSources((value) => !value)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-[11.5px] font-medium text-slate-500 transition-colors hover:text-cuc-700"
          >
            <span>官方来源（{d.sources.length}）</span>
            <span className="flex items-center gap-1 text-[10px] font-normal">
              {showSources ? "收起" : "展开查看"}
              <ChevronDown
                size={11}
                className={clsx("transition-transform", showSources && "rotate-180")}
              />
            </span>
          </button>
          {showSources && (
            <div className="space-y-1.5 border-t border-slate-200 px-2.5 py-2">
              {d.sources.map((s, i) => (
              <a
                key={i}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="group flex items-start gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 transition-colors hover:border-cuc-300 hover:bg-cuc-50/40"
              >
                <ExternalLink
                  size={11}
                  className="mt-1 shrink-0 text-slate-300 group-hover:text-cuc-500"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium text-slate-800">
                    {s.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    {s.verify_status && <VerifyBadge status={s.verify_status} />}
                    {s.effective_status && <EffectiveBadge status={s.effective_status} />}
                    <StaleBadge
                      stale={s.stale}
                      verified_months_ago={s.verified_months_ago}
                      stale_reason={s.stale_reason}
                    />
                    <span className="truncate text-[11px] text-slate-400">{s.url}</span>
                  </span>
                  {s.stale && s.stale_reason && (
                    <span className="mt-1 block text-[11px] leading-4 text-state-warn">
                      {s.stale_reason}
                    </span>
                  )}
                  {s.excerpt && (
                    <span className="mt-1 line-clamp-2 block text-[11.5px] leading-5 text-slate-500">
                      “{s.excerpt}”
                    </span>
                  )}
                </span>
              </a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 核实渠道 —— 拒答时必须给出口 */}
      {d.verify_channels && d.verify_channels.length > 0 && (
        <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-slate-500">
            <Phone size={11} /> 建议核实渠道
          </div>
          <div className="flex flex-wrap gap-1.5">
            {d.verify_channels.map((v, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-700"
              >
                {v.name}
                {v.phone && <span className="font-mono font-medium text-cuc-700">{v.phone}</span>}
                {v.url && (
                  <a href={v.url} target="_blank" rel="noreferrer" className="text-cuc-600">
                    <ExternalLink size={10} />
                  </a>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 追问建议 —— 借鉴 DeepTutor：答完不冷场，但只推答得出来的 */}
      {d.follow_ups && d.follow_ups.length > 0 && (
        <div className="mt-2.5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-slate-500">
            <Lightbulb size={11} /> 你也许还想问
          </div>
          <div className="flex flex-wrap gap-1.5">
            {d.follow_ups.map((f, i) => (
              <button
                key={i}
                onClick={() => onAsk?.(f)}
                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[12px] text-slate-700 transition-colors hover:border-cuc-300 hover:bg-cuc-50 hover:text-cuc-700"
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      )}

      {d.pipeline && d.pipeline.length > 0 && <PipelinePanel stages={d.pipeline} meta={d.meta} />}
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: EvidenceItem[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2.5 rounded-lg border border-cuc-200 bg-cuc-50/40">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-[11.5px] font-medium text-cuc-700"
      >
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={11} /> 官方证据（{evidence.length}）
        </span>
        <span className="flex items-center gap-1 text-[10px] font-normal text-cuc-500">
          {open ? "收起" : "展开原文摘录"}
          <ChevronDown size={11} className={clsx("transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="space-y-1.5 px-3 pb-2.5">
          {evidence.slice(0, 4).map((item) => (
            <a
              key={`${item.type}-${item.id}`}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="block rounded-md border border-cuc-100 bg-white px-2.5 py-2 transition-colors hover:border-cuc-300"
            >
              <span className="flex items-start gap-1.5">
                <ExternalLink size={10} className="mt-1 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11.5px] font-medium text-slate-700">{item.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-slate-500">
                    {item.snippet}
                  </span>
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function PipelinePanel({
  stages,
  meta,
}: {
  stages: PipelineStage[];
  meta?: ChatResponse["meta"];
}) {
  const local = isMock || meta?.engine === "local-fallback";
  const statusMap = {
    ok: {
      label: "正常",
      card: "border-state-okBorder bg-state-okBg/35",
      chip: "bg-state-okBg text-state-ok",
      icon: CircleCheck,
    },
    degraded: {
      label: "降级",
      card: "border-state-warnBorder bg-state-warnBg/45",
      chip: "bg-state-warnBg text-state-warn",
      icon: CircleAlert,
    },
    failed: {
      label: "失败",
      card: "border-state-stopBorder bg-state-stopBg/40",
      chip: "bg-state-stopBg text-state-stop",
      icon: CircleX,
    },
  } as const;

  return (
    <details className="group mt-2.5 rounded-lg border border-slate-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 text-[11.5px] font-medium text-slate-500 hover:bg-slate-50">
        <Workflow size={11} />
        执行轨迹
        <span className="ml-auto text-[10.5px] font-normal text-slate-400">
          {meta?.retrieval_mode ?? (local ? "本地确定性规则" : "后端流水线")}
        </span>
        <ChevronDown size={12} className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-slate-100 px-3 py-3">
        <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[10.5px] text-slate-400">
          <span className="chip bg-slate-100 text-slate-600">
            {local ? "本地演示" : "后端实时"}
          </span>
          <span>确定性三阶段协作轨迹，不冒充多个自主大模型</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {stages.map((stage) => {
            const style = statusMap[stage.status];
            const StatusIcon = style.icon;
            return (
              <div
                key={stage.id}
                className={clsx("min-w-0 rounded-lg border px-3 py-2.5", style.card)}
              >
                <div className="flex items-start gap-1.5">
                  <div className="min-w-0 flex-1 text-[11.5px] font-semibold leading-5 text-slate-800">
                    {stage.label}
                  </div>
                  <span className={clsx("chip shrink-0", style.chip)}>
                    <StatusIcon size={9} />
                    {style.label}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1 text-[10.5px] font-medium text-slate-600">
                  <Bot size={10} className="shrink-0 text-slate-400" />
                  <span className="truncate">{stage.agent ?? "未标注角色"}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-slate-400">
                    {stage.elapsed_ms > 0
                      ? `${stage.elapsed_ms}ms`
                      : local
                        ? "本地即时"
                        : "未计时"}
                  </span>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-4 text-slate-600">{stage.detail}</p>
                <dl className="mt-2 space-y-1 border-t border-black/5 pt-2">
                  <TraceRow label="输入" value={stage.input_summary} />
                  <TraceRow label="输出" value={stage.output_summary} />
                  <TraceRow label="交接" value={stage.handoff} />
                </dl>
              </div>
            );
          })}
        </div>
        {meta && (meta.tables_queried != null || meta.engine) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-slate-400">
            <Database size={10} />
            {meta.engine && <span>引擎：{meta.engine}</span>}
            {meta.tables_queried != null && <span>检索 {meta.tables_queried} 张表</span>}
            {meta.tables_failed ? (
              <span className="text-state-warn">{meta.tables_failed} 张表失败，已降级</span>
            ) : null}
          </div>
        )}
      </div>
    </details>
  );
}

function TraceRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid grid-cols-[30px_minmax(0,1fr)] gap-1 text-[10px] leading-4">
      <dt className="text-slate-400">{label}</dt>
      <dd className="break-words text-slate-600">{value || "未提供"}</dd>
    </div>
  );
}

/* ============================================================
   轻量 Markdown（支持标题/列表/表格/粗体/引用）
   不引第三方库，避免打包体积和样式失控
   ============================================================ */
function MarkdownLite({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="prose-answer">
      {blocks.map((b, i) => {
        if (b.type === "h3") return <h3 key={i}>{b.content}</h3>;
        if (b.type === "p")
          return <p key={i} dangerouslySetInnerHTML={{ __html: renderInline(b.content) }} />;
        if (b.type === "quote")
          return (
            <blockquote
              key={i}
              className="my-2 border-l-2 border-cuc-200 bg-cuc-50/50 px-3 py-1.5 text-[12.5px] leading-relaxed text-slate-600"
              dangerouslySetInnerHTML={{ __html: renderInline(b.content) }}
            />
          );
        if (b.type === "ul")
          return (
            <ul key={i}>
              {b.items.map((it, j) => (
                <li key={j} dangerouslySetInnerHTML={{ __html: renderInline(it) }} />
              ))}
            </ul>
          );
        if (b.type === "table")
          return (
            <table key={i}>
              <thead>
                <tr>
                  {b.head.map((h, j) => (
                    <th key={j}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j}>
                    {r.map((c, k) => (
                      <td key={k} dangerouslySetInnerHTML={{ __html: renderInline(c) }} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        return null;
      })}
    </div>
  );
}

type Block =
  | { type: "h3"; content: string }
  | { type: "p"; content: string }
  | { type: "quote"; content: string }
  | { type: "ul"; items: string[] }
  | { type: "table"; head: string[]; rows: string[][] };

function parseBlocks(text: string): Block[] {
  const lines = text.split("\n");
  const out: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const t = line.trim();

    if (!t) {
      i++;
      continue;
    }

    // 表格
    if (t.startsWith("|") && lines[i + 1]?.trim().match(/^\|[\s:-]+\|/)) {
      const split = (s: string) =>
        s
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((x) => x.trim());
      const head = split(t);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(split(lines[i]));
        i++;
      }
      out.push({ type: "table", head, rows });
      continue;
    }

    // 标题
    if (t.startsWith("### ")) {
      out.push({ type: "h3", content: t.slice(4) });
      i++;
      continue;
    }
    if (t.startsWith("## ")) {
      out.push({ type: "h3", content: t.slice(3) });
      i++;
      continue;
    }

    // 引用
    if (t.startsWith("> ")) {
      out.push({ type: "quote", content: t.slice(2) });
      i++;
      continue;
    }

    // 列表
    if (/^([-*]|\d+\.)\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^([-*]|\d+\.)\s+/, ""));
        i++;
      }
      out.push({ type: "ul", items });
      continue;
    }

    // 段落
    out.push({ type: "p", content: t });
    i++;
  }

  return out;
}

/** 从「| 项目 | 内容 |」结构中读出键值对，忽略表头与分隔线。 */
function readAnswerRows(answer: string): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  for (const line of answer.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());
    if (cells.length < 2) continue;
    const key = cells[0];
    const value = cells.slice(1).join(" ").trim();
    if (!key || !value) continue;
    if (/^(项目|字段|名称|内容)$/.test(key)) continue;
    if (/^:?-{2,}:?$/.test(key) || /^:?-{2,}:?$/.test(value)) continue;
    rows.push([key, value]);
  }
  return rows;
}

function answerValue(rows: Array<[string, string]>, ...keys: string[]): string | undefined {
  const hit = rows.find(([key]) => keys.some((k) => key.includes(k)));
  return hit?.[1]?.trim() || undefined;
}

function answerItems(value?: string): string[] {
  if (!value) return [];
  return value
    .split(/[、；;]/)
    .map((item) => item.replace(/^[·\-–]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * 兜底：后端未返回 action_card 时，把回答里已经写明的字段整理成办事卡，
 * 让「补办学生卡」这类没有流程条目的问题也能加入任务雷达。
 */
function buildCardFromAnswer(d: ChatResponse): ActionCard | undefined {
  if (d.status !== "answered") return undefined;

  const rows = readAnswerRows(d.answer);
  if (rows.length < 2) return undefined;

  const lines = d.answer.split(/\r?\n/);
  const heading = lines.find((line) => /^#{1,2}\s+/.test(line.trim()));
  // 「# 任务卡片」式标题 + 表格的回答（如联系方式查询）不含办事类关键词，也允许生成卡片。
  const isTaskCard = !!heading && /任务卡片|办事卡/.test(heading);
  if (!isTaskCard && !/办事|办理|补办|申办|申请|流程/.test(d.answer)) return undefined;
  const title = heading
    ?.trim()
    .replace(/^#{1,2}\s+/, "")
    .replace(/^(结构化)?(任务|办事)卡片?\s*[:：]?\s*/, "")
    .replace(/[·\-\s]*结构化(办事)?卡\s*$/, "")
    .trim();
  if (!title) return undefined;

  const evidence = d.evidence?.[0];
  const sourceUrl = evidence?.url ?? d.sources.find((source) => source.url)?.url;
  if (!sourceUrl) return undefined;

  const quote = lines.find((line) => line.trim().startsWith("> "));
  const summary =
    quote?.trim().slice(2).trim() ||
    lines
      .map((line) => line.trim())
      .find((line) => line && !line.startsWith("#") && !line.startsWith("|") && !line.startsWith(">"))
      ?.slice(0, 160) ||
    "";

  const phoneRaw = answerValue(rows, "联系电话", "电话", "联系方式");
  const phone = phoneRaw?.match(/1[3-9]\d{9}|0\d{2,3}-?\d{7,8}|\d{7,8}/)?.[0];
  const entryUrl = rows
    .map(([, value]) => value.match(/https?:\/\/[^\s，。；]+/)?.[0])
    .find(Boolean);

  const materialRaw = answerValue(rows, "材料", "附件");
  const stepRaw = answerValue(rows, "办理方式", "办理流程", "办理步骤", "流程");
  const stepTexts = stepRaw
    ? (stepRaw.includes("→") ? stepRaw.split("→") : stepRaw.split(/[；;]/))
        .map((step) => step.trim())
        .filter(Boolean)
    : [];

  const materials = answerItems(materialRaw).map((name, index) => ({
    id: `m${index}`,
    name,
    required: true,
    origin: "derived" as const,
  }));
  const steps = stepTexts.map((text, index) => ({
    id: `s${index}`,
    text,
    origin: "derived" as const,
  }));

  if (materials.length === 0 && steps.length === 0 && !answerValue(rows, "办理部门", "主管部门", "受理部门", "负责部门")) {
    return undefined;
  }

  const deadlineText = answerValue(rows, "截止", "时间节点", "申请时间", "报名时间", "办理期限");

  return {
    id: `answer-card:${evidence?.id ?? sourceUrl}`,
    source_type: "notice",
    source_id: evidence?.id ?? "",
    title,
    summary,
    applicable_to: answerValue(rows, "适用情形", "适用对象", "办理对象"),
    department: {
      name: answerValue(rows, "办理部门", "主管部门", "受理部门", "负责部门"),
      phone,
      location: answerValue(rows, "办理地点", "地点", "地址"),
      hours: answerValue(rows, "办理时间", "服务时间", "办公时间", "开放时间"),
      entry_url: entryUrl,
      entry_status: entryUrl ? "打开官方入口" : undefined,
    },
    deadline: deadlineText
      ? { text: deadlineText, source_url: sourceUrl }
      : undefined,
    materials,
    steps,
    missing_fields: d.missing_fields ?? [],
    verification: {
      verify_status: evidence?.verify_status ?? "依据官方原文整理",
      effective_status: evidence?.effective_status ?? "现行",
      gaps: [],
      source_url: sourceUrl,
    },
  };
}

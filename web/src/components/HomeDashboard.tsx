"use client";
// @ts-nocheck
/* eslint-disable */
/* __next_internal_client_entry_do_not_use__ default auto */ import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CalendarClock, CalendarDays, Check, CheckCircle2, ClipboardCheck, Clock3, ExternalLink, FileCheck2, GitCompare, Library, ListChecks, Loader2, MapPin, MessageSquareText, Phone, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal, UserRound, Users, X } from "lucide-react";
import clsx from "clsx";
import { daysUntil, eventIsPast, eventToActionCard, OFFICIAL_DEADLINE_EVENTS } from "@/lib/deadlines";
import { materialProfileSummary, useMaterialProfile } from "@/lib/materials";
import { deadlineInfo, nextIncompleteStep, saveTask, taskMaterialProgress, taskMatchesCard, taskMutationMessage, taskProgress, TASK_MEMBERS } from "@/lib/tasks";
import { useTasks } from "@/lib/useTasks";
import { fetchFreshnessSummary } from "@/lib/freshness";
import ParticleField from "@/components/fx/ParticleField";
import AuroraBeams from "@/components/fx/AuroraBeams";
import Magnetic from "@/components/fx/Magnetic";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
const HeroScene = dynamic(()=>import("@/components/fx/HeroScene"), {
    ssr: false
});
const QUICK_QUESTIONS = [
    "补办学生证需要什么材料？",
    "四六级什么时候截止，错过怎么办？",
    "学籍管理科的电话是多少？"
];
const deadlineToneClass = {
    overdue: "border-state-stopBorder bg-state-stopBg text-state-stop",
    urgent: "border-state-warnBorder bg-state-warnBg text-state-warn",
    soon: "border-line bg-[#f8f0e0] text-state-warn",
    normal: "border-state-okBorder bg-state-okBg text-state-ok",
    unknown: "border-line bg-slate-50 text-slate-500"
};
export default function HomeDashboard(param) {
    let { resourceCounts } = param;
    var _upcomingEvents_;
    const router = useRouter();
    const heroRef = useRef(null);
    const heroCopyRef = useRef(null);
    // Hero 滚动视差：内容随滚动上浮淡出（reduced-motion 跳过）
    useEffect(()=>{
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        gsap.registerPlugin(ScrollTrigger);
        const ctx = gsap.context(()=>{
            gsap.to(heroCopyRef.current, {
                yPercent: -14,
                opacity: 0.15,
                ease: "none",
                scrollTrigger: {
                    trigger: heroRef.current,
                    start: "top top",
                    end: "bottom 35%",
                    scrub: 0.6
                }
            });
        }, heroRef);
        return ()=>ctx.revert();
    }, []);
    const { tasks, ready, source: taskSource, error: taskError, localCount, legacyCount } = useTasks();
    const { profile, update, ready: profileReady } = useMaterialProfile();
    const [question, setQuestion] = useState("");
    const [matter, setMatter] = useState("");
    const [now, setNow] = useState(0);
    const [message, setMessage] = useState("");
    const [addingEventId, setAddingEventId] = useState("");
    const [freshness, setFreshness] = useState(null);
    const [freshnessLoading, setFreshnessLoading] = useState(true);
    const [freshnessAttempt, setFreshnessAttempt] = useState(0);
    const [welcomeOpen, setWelcomeOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    useEffect(()=>setMounted(true), []);
    // 欢迎弹窗：每会话一次。由开场视频结束时派发的事件对齐时序，不再写死时长
    useEffect(()=>{
        if (sessionStorage.getItem("cuc-welcome-seen")) return;
        sessionStorage.setItem("cuc-welcome-seen", "1");
        let opened = false;
        const open = ()=>{ if (!opened) { opened = true; setWelcomeOpen(true); } };
        window.addEventListener("cuc-intro-ended", open);
        // 兜底：事件丢失（如视频资源异常）时仍能弹出
        const timer = window.setTimeout(open, 35000);
        return ()=>{ window.removeEventListener("cuc-intro-ended", open); window.clearTimeout(timer); };
    }, []);
    useEffect(()=>{
        setNow(Date.now());
        const timer = window.setInterval(()=>setNow(Date.now()), 60000);
        return ()=>window.clearInterval(timer);
    }, []);
    useEffect(()=>{
        let active = true;
        setFreshnessLoading(true);
        void fetchFreshnessSummary().then((result)=>{
            if (!active) return;
            setFreshness(result);
            setFreshnessLoading(false);
        });
        return ()=>{
            active = false;
        };
    }, [
        freshnessAttempt
    ]);
    const clock = now || Date.now();
    const allUpcomingEvents = useMemo(()=>OFFICIAL_DEADLINE_EVENTS.filter((event)=>!eventIsPast(event, clock)).sort((a, b)=>new Date(a.start_iso).getTime() - new Date(b.start_iso).getTime()), [
        clock
    ]);
    const upcomingEvents = allUpcomingEvents.slice(0, 3);
    const activeTasks = useMemo(()=>tasks.filter((task)=>taskProgress(task) < 100).sort((a, b)=>{
            const aRemaining = deadlineInfo(a, clock).remaining_ms;
            const bRemaining = deadlineInfo(b, clock).remaining_ms;
            if (aRemaining == null && bRemaining == null) {
                return b.updated_at.localeCompare(a.updated_at);
            }
            if (aRemaining == null) return 1;
            if (bRemaining == null) return -1;
            return aRemaining - bRemaining;
        }), [
        clock,
        tasks
    ]);
    const urgentTasks = activeTasks.filter((task)=>{
        const tone = deadlineInfo(task, clock).tone;
        return tone === "overdue" || tone === "urgent" || tone === "soon";
    });
    const overdueTasks = activeTasks.filter((task)=>deadlineInfo(task, clock).tone === "overdue");
    const nextEventDays = upcomingEvents[0] ? daysUntil(upcomingEvents[0], clock) : undefined;
    function submit(event) {
        event.preventDefault();
        const text = question.trim();
        if (!text) return;
        router.push("/chat?q=".concat(encodeURIComponent(text)));
    }
    async function addDeadline(event) {
        if (addingEventId) return;
        setAddingEventId(event.id);
        try {
            const result = await saveTask(eventToActionCard(event));
            setMessage(taskMutationMessage(result, "已将「".concat(event.title, "」加入任务")));
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "加入任务失败，请稍后重试");
        } finally{
            setAddingEventId("");
        }
    }
    var _upcomingEvents__title;
    return /*#__PURE__*/ _jsxs("div", {
        children: [
            /*#__PURE__*/ _jsxs("section", {
                ref: heroRef,
                className: "hero relative -mt-14 isolate min-h-[calc(100svh-56px)] overflow-hidden bg-cuc-900 sm:-mt-[62px] sm:min-h-[calc(100svh-62px)]",
                "aria-label": "首页海报",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "absolute inset-0 -z-10",
                        children: [
                            /*#__PURE__*/ _jsx("img", {
                                src: "/hero-campus.jpg",
                                alt: "黄昏时分的校园广场与图书馆，作为首页海报背景（示意图）",
                                className: "hero-media h-full w-full object-cover object-[38%_center]",
                                fetchPriority: "high"
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "absolute inset-0 bg-[linear-gradient(100deg,rgba(6,17,26,0.95)_0%,rgba(6,17,26,0.72)_34%,rgba(6,17,26,0.18)_62%,rgba(6,17,26,0.62)_100%)]"
                            }),
                            /*#__PURE__*/ _jsx("div", {
                                className: "absolute inset-0 bg-gradient-to-t from-cuc-900 via-cuc-900/10 to-transparent"
                            }),
                            /*#__PURE__*/ _jsx(AuroraBeams, {}),
                            /*#__PURE__*/ _jsx(HeroScene, {}),
                            /*#__PURE__*/ _jsx(ParticleField, {
                                palette: [
                                    "103,232,249",
                                    "167,139,250",
                                    "226,232,240",
                                    "159,176,196"
                                ],
                                alpha: 0.8,
                                linkDistance: 120
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "relative mx-auto flex min-h-[calc(100svh-56px)] w-full max-w-6xl flex-col px-4 pb-20 pt-20 sm:min-h-[calc(100svh-62px)] sm:px-6 sm:pb-10 sm:pt-24 md:pb-8",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                ref: heroCopyRef,
                                className: "stagger mt-auto max-w-4xl",
                                children: [
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "flex flex-wrap items-center gap-x-3 gap-y-1",
                                        children: [
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "font-mono text-[10px] uppercase tracking-[0.22em] text-white/70",
                                                children: "校园办事工作台"
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "h-px w-8 bg-white/30"
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "text-[11px] text-white/55",
                                                children: "官网有依据才回答，没有就明确说不知道"
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsxs("h1", {
                                        className: "mt-4 font-display text-[42px] leading-[1.02] tracking-[-0.02em] text-white sm:mt-5 sm:text-[64px] lg:text-[76px]",
                                        children: [
                                            "今天要办什么",
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "text-white/45",
                                                children: "。"
                                            })
                                        ]
                                    }),
                                    /*#__PURE__*/ _jsx("p", {
                                        className: "mt-3 max-w-xl text-[13px] leading-6 text-white/70 sm:text-[14px] sm:leading-7",
                                        children: "直接描述你卡住的事情。助手会把官方流程、部门、材料、截止节点和待核实信息整理成一张可执行办事卡。"
                                    }),
                                    /*#__PURE__*/ _jsx("form", {
                                        onSubmit: submit,
                                        className: "mt-6 sm:mt-8",
                                        children: /*#__PURE__*/ _jsxs("div", {
                                            className: "flex items-center gap-2 border-b-2 border-white/35 pb-2 transition-colors focus-within:border-white",
                                            children: [
                                                /*#__PURE__*/ _jsx(Search, {
                                                    size: 16,
                                                    className: "shrink-0 text-white/75"
                                                }),
                                                /*#__PURE__*/ _jsx("input", {
                                                    value: question,
                                                    onChange: (event)=>setQuestion(event.target.value),
                                                    placeholder: "例如：补办学生证需要什么材料？",
                                                    className: "min-w-0 flex-1 bg-transparent py-1 text-[14px] text-white outline-none placeholder:text-white/40 sm:text-[15px]",
                                                    "aria-label": "输入校园办事问题"
                                                }),
                                                /*#__PURE__*/ _jsx(Magnetic, {
                                                    strength: 0.4,
                                                    children: /*#__PURE__*/ _jsxs("button", {
                                                        type: "submit",
                                                        disabled: !question.trim(),
                                                        className: "inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold tracking-wide text-white/90 transition-colors hover:text-white disabled:text-white/30",
                                                        children: [
                                                            "去问助手",
                                                            /*#__PURE__*/ _jsx(ArrowRight, {
                                                                size: 14
                                                            })
                                                        ]
                                                    })
                                                })
                                            ]
                                        })
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[10.5px]",
                                        children: [
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "text-white/40",
                                                children: "可以这样问"
                                            }),
                                            QUICK_QUESTIONS.map((item)=>/*#__PURE__*/ _jsx("span", {
                                                    className: "inline-flex items-center gap-3",
                                                    children: /*#__PURE__*/ _jsx("button", {
                                                        type: "button",
                                                        onClick: ()=>router.push("/chat?q=".concat(encodeURIComponent(item))),
                                                        className: "text-white/65 underline decoration-white/25 decoration-1 underline-offset-4 transition-colors hover:text-white hover:decoration-white",
                                                        children: item
                                                    })
                                                }, item))
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "mt-8 flex items-center gap-3 text-white/40 sm:mt-12",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "h-6 w-px bg-white/25"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "font-mono text-[9px] uppercase tracking-[0.3em]",
                                        children: "向下浏览"
                                    })
                                ]
                            })
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("section", {
                className: "border-b border-line",
                children: /*#__PURE__*/ _jsxs("div", {
                    className: "mx-auto max-w-6xl px-4 sm:px-6",
                    children: [

                        /*#__PURE__*/ _jsxs(Link, {
                            href: "/innovation",
                            className: "group mt-4 flex items-center justify-between gap-3 border-t border-line pt-3 text-[11px] text-slate-600 transition-colors hover:text-cuc-700",
                            children: [
                                /*#__PURE__*/ _jsxs("span", {
                                    className: "inline-flex min-w-0 items-center gap-2",
                                    children: [
                                        /*#__PURE__*/ _jsx(GitCompare, {
                                            size: 12,
                                            className: "shrink-0 text-cuc-700"
                                        }),
                                        /*#__PURE__*/ _jsx("span", {
                                            className: "truncate",
                                            children: "与「问道中传」的差异：只做四项增量"
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs("span", {
                                    className: "inline-flex shrink-0 items-center gap-1",
                                    children: [
                                        "查看",
                                        /*#__PURE__*/ _jsx(ArrowRight, {
                                            size: 11,
                                            className: "transition-transform group-hover:translate-x-0.5"
                                        })
                                    ]
                                })
                            ]
                        }),
                        /*#__PURE__*/ _jsxs("div", {
                            className: "grid grid-cols-2 border-t border-line sm:grid-cols-4",
                            children: [
                                /*#__PURE__*/ _jsx(SnapshotMetric, {
                                    label: "进行中任务",
                                    value: ready ? activeTasks.length : "-",
                                    note: taskSource === "live" ? "账号同步" : "本地保存",
                                    icon: ListChecks,
                                    className: "border-b border-r border-line sm:border-b-0"
                                }),
                                /*#__PURE__*/ _jsx(SnapshotMetric, {
                                    label: "7 天内临期",
                                    value: ready ? urgentTasks.length : "-",
                                    note: overdueTasks.length ? "".concat(overdueTasks.length, " 项已逾期") : "含逾期任务",
                                    icon: Clock3,
                                    warn: urgentTasks.length > 0 || overdueTasks.length > 0,
                                    className: "border-b border-line sm:border-b-0 sm:border-r sm:border-line"
                                }),
                                /*#__PURE__*/ _jsx(SnapshotMetric, {
                                    label: "未来官方节点",
                                    value: allUpcomingEvents.length,
                                    note: "均能回原文",
                                    icon: CalendarDays,
                                    className: "border-b border-r border-line sm:border-b-0"
                                }),
                                /*#__PURE__*/ _jsx(SnapshotMetric, {
                                    label: "最近节点",
                                    value: nextEventDays == null ? "待核实" : nextEventDays <= 0 ? "今天" : "".concat(nextEventDays, " 天"),
                                    note: (_upcomingEvents__title = (_upcomingEvents_ = upcomingEvents[0]) === null || _upcomingEvents_ === void 0 ? void 0 : _upcomingEvents_.title) !== null && _upcomingEvents__title !== void 0 ? _upcomingEvents__title : "暂无已核实节点",
                                    icon: CalendarClock,
                                    className: "border-b border-line sm:border-b-0"
                                })
                            ]
                        })
                    ]
                })
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "mx-auto max-w-6xl px-4 py-7 sm:px-6 sm:py-9",
                children: [
                    message && /*#__PURE__*/ _jsxs("div", {
                        className: "mb-5 flex items-center gap-2 border-l-2 border-cuc-700 bg-white px-3 py-2 text-[11.5px] text-cuc-700",
                        role: "status",
                        children: [
                            /*#__PURE__*/ _jsx(CheckCircle2, {
                                size: 13
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                className: "min-w-0 flex-1",
                                children: message
                            }),
                            /*#__PURE__*/ _jsx(Link, {
                                href: "/tasks",
                                className: "shrink-0 font-medium underline underline-offset-4",
                                children: "打开任务"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "mt-8 grid gap-8 lg:grid-cols-[1.12fr_.88fr] lg:gap-0",
                        children: [
                            /*#__PURE__*/ _jsxs("section", {
                                className: "min-w-0 lg:pr-9",
                                children: [
                                    /*#__PURE__*/ _jsx(SectionHead, {
                                        index: "02",
                                        title: "截止日期雷达",
                                        description: "只显示官方原文能计算的日期；不清楚的节点不编倒计时。",
                                        href: "/deadlines",
                                        linkLabel: "查看全部"
                                    }),
                                    /*#__PURE__*/ _jsx("div", {
                                        children: upcomingEvents.length ? upcomingEvents.map((event)=>/*#__PURE__*/ _jsx(DeadlineRow, {
                                                event: event,
                                                now: clock,
                                                saved: tasks.some((task)=>taskMatchesCard(task, "deadline:".concat(event.id))),
                                                ready: ready,
                                                busy: addingEventId === event.id,
                                                onAdd: ()=>addDeadline(event)
                                            }, event.id)) : /*#__PURE__*/ _jsx(EmptyRow, {
                                            icon: CalendarDays,
                                            title: "当前没有可计算的未来节点",
                                            body: "日期不明确的官方通知会保留在截止页的“待核实”区，不会生成假倒计时。"
                                        })
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "flex flex-col gap-2 border-t border-line pt-2.5 text-[10.5px] leading-4 text-slate-500 sm:flex-row sm:items-center sm:justify-between",
                                        children: [
                                            /*#__PURE__*/ _jsxs("span", {
                                                className: "inline-flex items-center gap-1.5",
                                                children: [
                                                    /*#__PURE__*/ _jsx(ShieldCheck, {
                                                        size: 11,
                                                        className: "text-state-ok"
                                                    }),
                                                    "已过节点、日期待核实和按需巡检与未来节点分开呈现"
                                                ]
                                            })
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsxs("section", {
                                className: "min-w-0 border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-9 lg:pt-0",
                                children: [
                                    /*#__PURE__*/ _jsx(SectionHead, {
                                        title: "我的任务",
                                        description: "按真实截止顺序排列，可直接进入分工、勾材料和交接。",
                                        href: "/tasks",
                                        linkLabel: "任务雷达"
                                    }),
                                    /*#__PURE__*/ _jsx("div", {
                                        children: !ready ? /*#__PURE__*/ _jsx(EmptyRow, {
                                            icon: ListChecks,
                                            title: "正在读取任务",
                                            body: taskSource === "live" ? "正在从账号同步任务。" : "正在读取本地任务。"
                                        }) : activeTasks.length ? activeTasks.slice(0, 3).map((task)=>/*#__PURE__*/ _jsx(TaskRow, {
                                                task: task,
                                                now: clock
                                            }, task.task_id)) : /*#__PURE__*/ _jsx(EmptyRow, {
                                            icon: ClipboardCheck,
                                            title: "还没有进行中的任务",
                                            body: "从办事卡、截止雷达或办事流程添加后，会在这里显示下一步与临期状态。"
                                        })
                                    }),
                                    ready && /*#__PURE__*/ _jsx("div", {
                                        className: clsx("border-t border-line pt-2 text-[10.5px] leading-4", taskSource === "live" ? "text-state-ok" : "text-state-warn"),
                                        children: taskSource === "live" ? "任务已同步到账号，可在其他设备登录后继续处理。" : taskError ? /*#__PURE__*/ _jsxs("span", {
                                            children: [
                                                "本地保存 \xb7 未同步。",
                                                taskError,
                                                localCount + legacyCount > 0 && /*#__PURE__*/ _jsx(Link, {
                                                    href: "/tasks",
                                                    className: "ml-1 font-medium underline",
                                                    children: "查看并导入"
                                                })
                                            ]
                                        }) : "本地保存 · 未同步，登录后可在任务页导入账号。"
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] font-medium",
                                        children: [
                                            /*#__PURE__*/ _jsxs(Link, {
                                                href: "/processes",
                                                className: "inline-flex items-center gap-1 text-slate-600 underline decoration-line underline-offset-4 hover:text-cuc-700 hover:decoration-cuc-700",
                                                children: [
                                                    "从办事流程添加",
                                                    /*#__PURE__*/ _jsx(ArrowRight, {
                                                        size: 11
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs(Link, {
                                                href: "/chat",
                                                className: "inline-flex items-center gap-1 text-cuc-700 underline decoration-cuc-200 underline-offset-4 hover:decoration-cuc-700",
                                                children: [
                                                    "问助手生成办事卡",
                                                    /*#__PURE__*/ _jsx(MessageSquareText, {
                                                        size: 11
                                                    })
                                                ]
                                            })
                                        ]
                                    })
                                ]
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("section", {
                        className: "mt-9 border-t border-line pt-6",
                        children: /*#__PURE__*/ _jsxs("div", {
                            className: "grid gap-8 lg:grid-cols-[.92fr_1.08fr] lg:gap-0",
                            children: [
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "min-w-0 lg:pr-9",
                                    children: [
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "flex items-start gap-3",
                                            children: [
                                                /*#__PURE__*/ _jsx("span", {
                                                    className: "flex h-7 w-7 shrink-0 items-center justify-center border border-line text-cuc-700",
                                                    children: /*#__PURE__*/ _jsx(FileCheck2, {
                                                        size: 13
                                                    })
                                                }),
                                                /*#__PURE__*/ _jsxs("div", {
                                                    children: [
                                                        /*#__PURE__*/ _jsx("h2", {
                                                            className: "font-display text-[20px] leading-tight tracking-tight text-ink",
                                                            children: "我的材料方案"
                                                        }),
                                                        /*#__PURE__*/ _jsx("p", {
                                                            className: "mt-1 text-[11px] leading-5 text-slate-500",
                                                            children: "下面四项是你的办事画像：身份、办理情形、谁去办理、提交方式。问答和办事卡会据此增减材料准备项，并区分“官网明确”“系统整理”“待核实”。"
                                                        })
                                                    ]
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "mt-4 border-y border-line py-2.5",
                                            children: [
                                                /*#__PURE__*/ _jsxs("div", {
                                                    className: "flex items-center gap-1.5 text-[10px] tracking-wide text-slate-500",
                                                    children: [
                                                        /*#__PURE__*/ _jsx(SlidersHorizontal, {
                                                            size: 11,
                                                            className: "text-cuc-700"
                                                        }),
                                                        "当前方案"
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsx("p", {
                                                    className: "mt-1 text-[11.5px] leading-5 text-slate-700",
                                                    children: profileReady ? materialProfileSummary(profile) : "正在读取本机画像"
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "mt-4 grid grid-cols-2 gap-x-4 gap-y-3",
                                            children: [
                                                /*#__PURE__*/ _jsx(ProfileSelect, {
                                                    label: "身份",
                                                    value: profile.studentType,
                                                    onChange: (value)=>update({
                                                            studentType: value
                                                        }),
                                                    options: [
                                                        [
                                                            "undergraduate",
                                                            "本科生"
                                                        ],
                                                        [
                                                            "graduate",
                                                            "研究生"
                                                        ]
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsx(ProfileSelect, {
                                                    label: "办理情形",
                                                    value: profile.applicationType,
                                                    onChange: (value)=>update({
                                                            applicationType: value
                                                        }),
                                                    options: [
                                                        [
                                                            "normal",
                                                            "普通办理"
                                                        ],
                                                        [
                                                            "first",
                                                            "首次办理"
                                                        ],
                                                        [
                                                            "reissue",
                                                            "遗失 / 补办"
                                                        ]
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsx(ProfileSelect, {
                                                    label: "谁去办理",
                                                    value: profile.handler,
                                                    onChange: (value)=>update({
                                                            handler: value
                                                        }),
                                                    options: [
                                                        [
                                                            "self",
                                                            "本人"
                                                        ],
                                                        [
                                                            "entrusted",
                                                            "委托他人"
                                                        ]
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsx(ProfileSelect, {
                                                    label: "提交方式",
                                                    value: profile.submission,
                                                    onChange: (value)=>update({
                                                            submission: value
                                                        }),
                                                    options: [
                                                        [
                                                            "unknown",
                                                            "尚未确定"
                                                        ],
                                                        [
                                                            "online",
                                                            "线上"
                                                        ],
                                                        [
                                                            "onsite",
                                                            "现场"
                                                        ]
                                                    ]
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("form", {
                                            className: "mt-4",
                                            onSubmit: (event)=>{
                                                event.preventDefault();
                                                const title = matter.trim().replace(/[？?]$/, "");
                                                if (!title) return;
                                                const nextQuestion = /材料|清单|带什么/.test(title) ? "".concat(title, "？") : "".concat(title, "需要什么材料？");
                                                router.push("/chat?q=".concat(encodeURIComponent(nextQuestion)));
                                            },
                                            children: [
                                                /*#__PURE__*/ _jsx("label", {
                                                    className: "mb-1 block text-[10px] text-slate-400",
                                                    children: "你要办的事"
                                                }),
                                                /*#__PURE__*/ _jsxs("div", {
                                                    className: "flex items-center gap-2",
                                                    children: [
                                                        /*#__PURE__*/ _jsx("input", {
                                                            value: matter,
                                                            onChange: (event)=>setMatter(event.target.value),
                                                            placeholder: "例如：补办学生证、开在读证明",
                                                            "aria-label": "你要办的事",
                                                            className: "min-w-0 flex-1 rounded-[3px] border border-line bg-white px-2.5 py-2 text-[12px] text-ink outline-none placeholder:text-slate-400 focus:border-cuc-700"
                                                        }),
                                                        /*#__PURE__*/ _jsxs("button", {
                                                            type: "submit",
                                                            disabled: !matter.trim(),
                                                            className: "btn-primary shrink-0 !px-3 !py-2 !text-[12px]",
                                                            children: [
                                                                "生成材料方案",
                                                                /*#__PURE__*/ _jsx(ArrowRight, {
                                                                    size: 12
                                                                })
                                                            ]
                                                        })
                                                    ]
                                                }),
                                                /*#__PURE__*/ _jsx("p", {
                                                    className: "mt-2 text-[10px] leading-4 text-slate-400",
                                                    children: "会带着上面四项去问答，生成这件事的材料清单，并整理成可加入任务雷达的办事卡。"
                                                })
                                            ]
                                        })
                                    ]
                                }),
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "min-w-0 border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-9 lg:pt-0",
                                    children: [
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "flex items-start gap-3",
                                            children: [
                                                /*#__PURE__*/ _jsx("span", {
                                                    className: "flex h-7 w-7 shrink-0 items-center justify-center border border-line text-cuc-700",
                                                    children: /*#__PURE__*/ _jsx(Library, {
                                                        size: 13
                                                    })
                                                }),
                                                /*#__PURE__*/ _jsxs("div", {
                                                    children: [
                                                        /*#__PURE__*/ _jsx("h2", {
                                                            className: "font-display text-[20px] leading-tight tracking-tight text-ink",
                                                            children: "按事情找资料"
                                                        }),
                                                        /*#__PURE__*/ _jsx("p", {
                                                            className: "mt-1 text-[11px] leading-5 text-slate-500",
                                                            children: "不必先判断信息属于哪个库，从眼前的动作进入。"
                                                        })
                                                    ]
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "mt-4",
                                            children: [
                                                /*#__PURE__*/ _jsx(ResourceLink, {
                                                    href: "/processes",
                                                    icon: ClipboardCheck,
                                                    title: "办一件事",
                                                    count: "".concat(resourceCounts.processes, " 条流程")
                                                }),
                                                /*#__PURE__*/ _jsx(ResourceLink, {
                                                    href: "/contacts",
                                                    icon: Phone,
                                                    title: "找部门电话",
                                                    count: "".concat(resourceCounts.contacts, " 项联系方式")
                                                }),
                                                /*#__PURE__*/ _jsx(ResourceLink, {
                                                    href: "/notices",
                                                    icon: FileCheck2,
                                                    title: "查通知原文",
                                                    count: "".concat(resourceCounts.notices, " 条通知")
                                                }),
                                                /*#__PURE__*/ _jsx(ResourceLink, {
                                                    href: "/calendar",
                                                    icon: CalendarDays,
                                                    title: "看校历与时段",
                                                    count: "".concat(resourceCounts.calendars, " 个学期")
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs(Link, {
                                            href: "/resources",
                                            className: "group mt-4 flex items-center justify-between gap-2 border-t border-line pt-3 text-[11px] font-medium text-slate-600 transition-colors hover:text-cuc-700",
                                            children: [
                                                "打开完整校园资料目录",
                                                /*#__PURE__*/ _jsx(ArrowRight, {
                                                    size: 11,
                                                    className: "transition-transform group-hover:translate-x-0.5"
                                                })
                                            ]
                                        })
                                    ]
                                })
                            ]
                        })
                    }),
                    /*#__PURE__*/ _jsx("section", {
                        className: "mt-9 border-t border-line pt-6",
                        children: /*#__PURE__*/ _jsxs("div", {
                            className: "min-w-0",
                            children: [
                                /*#__PURE__*/ _jsxs("div", {
                                    className: "min-w-0",
                                    children: [
                                        /*#__PURE__*/ _jsxs("div", {
                                            className: "flex items-start gap-2",
                                            children: [
                                                /*#__PURE__*/ _jsx(AlertTriangle, {
                                                    size: 14,
                                                    className: "mt-0.5 shrink-0 text-state-warn"
                                                }),
                                                /*#__PURE__*/ _jsx("h2", {
                                                    className: "font-display text-[20px] leading-tight tracking-tight text-ink",
                                                    children: "使用前要知道的边界"
                                                })
                                            ]
                                        }),
                                        /*#__PURE__*/ _jsxs("ul", {
                                            className: "mt-3 space-y-2 border-l border-line pl-4 text-[11px] leading-5 text-slate-600",
                                            children: [
                                                /*#__PURE__*/ _jsx("li", {
                                                    children: "\xb7 登录后任务按账号同步；后端不可用时会本地保存并提示导入。"
                                                }),
                                                /*#__PURE__*/ _jsx("li", {
                                                    children: "\xb7 官网巡检和飞书摘要需要用户手动触发，不是后台自动监控。"
                                                }),
                                                /*#__PURE__*/ _jsx("li", {
                                                    children: "\xb7 不查询个人成绩、审批进度，也不替用户提交业务。"
                                                }),
                                                /*#__PURE__*/ _jsx("li", {
                                                    children: "\xb7 关键电话、日期和材料出门前仍应回官网或电话核实。"
                                                })
                                            ]
                                        })
                                    ]
                                })
                            ]
                        })
                    })
                ]
            }),
            // Portal 到 body：避免被祖先 transform 捕获 fixed 定位，也保证压过开场动画之下正常居中
            welcomeOpen && mounted && createPortal(/*#__PURE__*/ _jsx(WelcomeModal, {
                freshness: freshness,
                freshnessLoading: freshnessLoading,
                onRetryFreshness: ()=>setFreshnessAttempt((value)=>value + 1),
                onClose: ()=>setWelcomeOpen(false)
            }), document.body)
        ]
    });
}
function WelcomeModal(param) {
    let { freshness, freshnessLoading, onRetryFreshness, onClose } = param;
    // 入场动效用状态切换而非纯 CSS keyframes：避免标签页不可见时动画冻结在 opacity:0 第一帧
    const [entered, setEntered] = useState(false);
    useEffect(()=>{
        const raf = requestAnimationFrame(()=>setEntered(true));
        const fallback = setTimeout(()=>setEntered(true), 500);
        return ()=>{
            cancelAnimationFrame(raf);
            clearTimeout(fallback);
        };
    }, []);
    useEffect(()=>{
        const onKey = (event)=>{
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        document.body.style.overflow = "hidden";
        return ()=>{
            window.removeEventListener("keydown", onKey);
            document.body.style.overflow = "";
        };
    }, [
        onClose
    ]);
    return /*#__PURE__*/ _jsxs("div", {
        className: "fixed inset-0 z-[180] flex items-center justify-center p-4 sm:p-6",
        role: "dialog",
        "aria-modal": "true",
        "aria-label": "欢迎：数据新鲜度与工作方式",
        children: [
            /*#__PURE__*/ _jsx("div", {
                className: "absolute inset-0 bg-ink/45 backdrop-blur-[3px]",
                onClick: onClose
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "welcome-panel relative max-h-[86vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-paper shadow-[0_24px_80px_rgba(15,23,42,.28)] transition-all duration-500 ease-out",
                style: entered ? undefined : {
                    opacity: 0,
                    transform: "translateY(18px) scale(.97)"
                },
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-paper/95 px-5 py-3.5 backdrop-blur",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "flex items-center gap-2",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "eyebrow",
                                        children: "欢迎"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "h-px w-6 bg-line"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "text-[11px] text-slate-500",
                                        children: "开始之前，先了解数据与使用方式"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                onClick: onClose,
                                "aria-label": "关闭",
                                className: "flex h-7 w-7 items-center justify-center rounded-full border border-line text-slate-500 transition-colors hover:border-cuc-300 hover:text-cuc-700",
                                children: /*#__PURE__*/ _jsx(X, {
                                    size: 13
                                })
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "px-5 pb-5 pt-4 sm:px-6",
                        children: [
                            /*#__PURE__*/ _jsx(FreshnessPanel, {
                                result: freshness,
                                loading: freshnessLoading,
                                onRetry: onRetryFreshness
                            }),
                            /*#__PURE__*/ _jsxs("section", {
                                className: "mt-7 border-t border-line pt-5",
                                children: [
                                    /*#__PURE__*/ _jsx(SectionHead, {
                                        index: "05",
                                        title: "工作方式",
                                        description: "从一次提问到可核验的办事链路。"
                                    }),
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "grid sm:grid-cols-2",
                                        children: [
                                            /*#__PURE__*/ _jsx(FlowStep, {
                                                number: "01",
                                                title: "查信息",
                                                body: "答案必须有官方来源，冲突并列",
                                                icon: ShieldCheck,
                                                className: "border-b border-line py-4 sm:border-r sm:pr-4"
                                            }),
                                            /*#__PURE__*/ _jsx(FlowStep, {
                                                number: "02",
                                                title: "接着问",
                                                body: "“那材料呢”会沿用上一问主题",
                                                icon: MessageSquareText,
                                                className: "border-b border-line py-4 sm:pl-4"
                                            }),
                                            /*#__PURE__*/ _jsx(FlowStep, {
                                                number: "03",
                                                title: "变成任务",
                                                body: "分工、材料、步骤与截止一起保存",
                                                icon: Users,
                                                className: "border-b border-line py-4 sm:border-r sm:pr-4 sm:border-b-0"
                                            }),
                                            /*#__PURE__*/ _jsx(FlowStep, {
                                                number: "04",
                                                title: "核验与复盘",
                                                body: "官网缺口与人工渠道都可见",
                                                icon: MapPin,
                                                className: "py-4 sm:pl-4"
                                            })
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("button", {
                                type: "button",
                                onClick: onClose,
                                className: "btn-primary mt-5 w-full justify-center",
                                children: "知道了，开始使用"
                            })
                        ]
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("style", {
                children: `
        .welcome-panel { animation: welcome-in .45s cubic-bezier(.22,.9,.3,1) both; }
        @keyframes welcome-in {
          from { opacity: 0; transform: translateY(18px) scale(.97); }
          to { opacity: 1; transform: none; }
        }
        @media (prefers-reduced-motion: reduce) {
          .welcome-panel { animation: none; }
        }
      `
            })
        ]
    });
}
function SnapshotMetric(param) {
    let { label, value, note, icon: Icon, warn, className } = param;
    return /*#__PURE__*/ _jsxs("div", {
        className: clsx("px-4 py-4 sm:py-5", className),
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "flex items-center gap-1.5 text-[10px] tracking-wide text-slate-500",
                children: [
                    /*#__PURE__*/ _jsx(Icon, {
                        size: 11,
                        className: warn ? "text-state-warn" : "text-cuc-700"
                    }),
                    label
                ]
            }),
            /*#__PURE__*/ _jsx("div", {
                className: clsx("mt-1.5 font-display text-[26px] font-semibold leading-none tabular-nums sm:text-[30px]", warn ? "text-state-warn" : "text-ink"),
                children: value
            }),
            /*#__PURE__*/ _jsx("p", {
                className: "mt-1.5 truncate text-[10px] text-slate-400",
                children: note
            })
        ]
    });
}
function FreshnessPanel(param) {
    let { result, loading, onRetry } = param;
    const sourceView = {
        live: {
            label: "实时接口",
            className: "bg-state-okBg text-state-ok",
            description: "数字直接来自 /api/freshness/summary，前端未重新计算。"
        },
        demo: {
            label: "演示数据",
            className: "bg-slate-100 text-slate-500",
            description: "当前为本地演示模式；连接后端后会原样展示接口汇总。"
        },
        fallback: {
            label: "后端未连通",
            className: "bg-state-warnBg text-state-warn",
            description: "实时接口读取失败，以下仅为演示值，不代表数据库当前状态。"
        }
    };
    const source = result ? sourceView[result.source] : null;
    const data = result === null || result === void 0 ? void 0 : result.data;
    const tableLabels = {
        processes: "办事流程",
        contacts: "部门联系",
        notices: "通知公告",
        policies: "规章制度",
        calendar: "校历时段"
    };
    return /*#__PURE__*/ _jsxs("section", {
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "flex flex-col gap-2.5 border-b border-line pb-3 sm:flex-row sm:items-end sm:justify-between",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "flex items-center gap-2",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "eyebrow",
                                        children: "01"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "h-px w-6 bg-line"
                                    }),
                                    /*#__PURE__*/ _jsx("h2", {
                                        className: "font-display text-[20px] leading-tight tracking-tight text-ink",
                                        children: "数据新鲜度"
                                    }),
                                    source && /*#__PURE__*/ _jsx("span", {
                                        className: clsx("chip border border-line", source.className),
                                        children: source.label
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                className: "mt-1.5 text-[11px] leading-5 text-slate-500",
                                children: "统一展示数据库的现行、待核实、已失效与超期未复核数量。"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("button", {
                        type: "button",
                        onClick: onRetry,
                        disabled: loading,
                        className: "btn-ghost self-start !px-2.5 !py-1.5 !text-[10.5px] sm:self-auto",
                        children: [
                            /*#__PURE__*/ _jsx(RefreshCw, {
                                size: 11,
                                className: loading ? "animate-spin" : ""
                            }),
                            "重新读取"
                        ]
                    })
                ]
            }),
            loading ? /*#__PURE__*/ _jsx("div", {
                className: "border-b border-line py-5 text-center text-[11.5px] text-slate-400",
                children: "正在读取新鲜度汇总…"
            }) : data && source ? /*#__PURE__*/ _jsxs(_Fragment, {
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "grid grid-cols-2 border-b border-line sm:grid-cols-5",
                        children: [
                            /*#__PURE__*/ _jsx(FreshnessMetric, {
                                label: "数据总量",
                                value: data.total,
                                className: "border-b border-r border-line sm:border-b-0"
                            }),
                            /*#__PURE__*/ _jsx(FreshnessMetric, {
                                label: "现行",
                                value: data.current,
                                tone: "ok",
                                className: "border-b border-line sm:border-b-0 sm:border-r sm:border-line"
                            }),
                            /*#__PURE__*/ _jsx(FreshnessMetric, {
                                label: "超期未复核",
                                value: data.stale,
                                tone: "warn",
                                className: "border-b border-r border-line sm:border-b-0"
                            }),
                            /*#__PURE__*/ _jsx(FreshnessMetric, {
                                label: "已失效",
                                value: data.expired,
                                tone: "stop",
                                className: "border-b border-line sm:border-b-0 sm:border-r sm:border-line"
                            }),
                            /*#__PURE__*/ _jsx(FreshnessMetric, {
                                label: "待核实",
                                value: data.pending,
                                tone: "warn",
                                className: "border-b border-line sm:border-b-0"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("div", {
                        className: "border-b border-line py-3",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between",
                                children: [
                                    /*#__PURE__*/ _jsx("p", {
                                        className: "text-[10.5px] leading-4 text-slate-500",
                                        children: source.description
                                    }),
                                    /*#__PURE__*/ _jsxs("span", {
                                        className: "font-mono text-[10.5px] text-slate-400",
                                        children: [
                                            "超期阈值：",
                                            data.threshold_days,
                                            " 天"
                                        ]
                                    })
                                ]
                            }),
                            result.error && /*#__PURE__*/ _jsxs("p", {
                                className: "mt-1.5 text-[10.5px] leading-4 text-state-warn",
                                children: [
                                    "接口错误：",
                                    result.error
                                ]
                            }),
                            data.by_table.length > 0 && /*#__PURE__*/ _jsxs("div", {
                                className: "mt-3",
                                children: [
                                    /*#__PURE__*/ _jsxs("div", {
                                        className: "hidden grid-cols-[1.2fr_repeat(5,.7fr)] gap-2 border-b border-line pb-1.5 text-[9.5px] tracking-wide text-slate-400 sm:grid",
                                        children: [
                                            /*#__PURE__*/ _jsx("span", {
                                                children: "数据表"
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "text-right",
                                                children: "总量"
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "text-right",
                                                children: "现行"
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "text-right",
                                                children: "超期"
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "text-right",
                                                children: "失效"
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "text-right",
                                                children: "待核实"
                                            })
                                        ]
                                    }),
                                    data.by_table.map((row)=>{
                                        var _tableLabels_row_table;
                                        return /*#__PURE__*/ _jsxs("div", {
                                            className: "grid grid-cols-2 gap-x-3 gap-y-1 border-b border-line py-2 text-[10.5px] last:border-b-0 sm:grid-cols-[1.2fr_repeat(5,.7fr)] sm:items-center",
                                            children: [
                                                /*#__PURE__*/ _jsx("span", {
                                                    className: "font-medium text-slate-700",
                                                    children: (_tableLabels_row_table = tableLabels[row.table]) !== null && _tableLabels_row_table !== void 0 ? _tableLabels_row_table : row.table
                                                }),
                                                /*#__PURE__*/ _jsx("span", {
                                                    className: "text-right font-mono tabular-nums text-slate-700",
                                                    children: row.total
                                                }),
                                                /*#__PURE__*/ _jsx(FreshnessTableValue, {
                                                    label: "现行",
                                                    value: row.current
                                                }),
                                                /*#__PURE__*/ _jsx(FreshnessTableValue, {
                                                    label: "超期",
                                                    value: row.stale,
                                                    warn: true
                                                }),
                                                /*#__PURE__*/ _jsx(FreshnessTableValue, {
                                                    label: "失效",
                                                    value: row.expired
                                                }),
                                                /*#__PURE__*/ _jsx(FreshnessTableValue, {
                                                    label: "待核实",
                                                    value: row.pending,
                                                    warn: true
                                                })
                                            ]
                                        }, row.table);
                                    })
                                ]
                            })
                        ]
                    })
                ]
            }) : /*#__PURE__*/ _jsx("div", {
                className: "border-b border-line py-5 text-center text-[11.5px] text-slate-400",
                children: "暂未取得新鲜度汇总"
            })
        ]
    });
}
function FreshnessMetric(param) {
    let { label, value, tone, className } = param;
    return /*#__PURE__*/ _jsxs("div", {
        className: clsx("px-4 py-3", className),
        children: [
            /*#__PURE__*/ _jsx("div", {
                className: clsx("font-display text-[24px] font-semibold leading-none tabular-nums", tone === "ok" ? "text-state-ok" : tone === "warn" ? "text-state-warn" : tone === "stop" ? "text-state-stop" : "text-ink"),
                children: value
            }),
            /*#__PURE__*/ _jsx("div", {
                className: "mt-1.5 text-[10px] tracking-wide text-slate-400",
                children: label
            })
        ]
    });
}
function FreshnessTableValue(param) {
    let { label, value, warn } = param;
    return /*#__PURE__*/ _jsxs("span", {
        className: clsx("flex items-center justify-between gap-2 text-right font-mono tabular-nums sm:block", warn && value > 0 ? "text-state-warn" : "text-slate-600"),
        children: [
            /*#__PURE__*/ _jsx("span", {
                className: "text-[9.5px] text-slate-400 sm:hidden",
                children: label
            }),
            /*#__PURE__*/ _jsx("span", {
                children: value
            })
        ]
    });
}
function SectionHead(param) {
    let { index, title, description, href, linkLabel } = param;
    return /*#__PURE__*/ _jsxs("div", {
        className: "flex flex-wrap items-end justify-between gap-2 border-b border-line pb-3",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "min-w-0",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "flex items-center gap-2",
                        children: [
                            index && /*#__PURE__*/ _jsxs(_Fragment, {
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "eyebrow",
                                        children: index
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        className: "h-px w-5 bg-line"
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("h2", {
                                className: "font-display text-[20px] leading-tight tracking-tight text-ink",
                                children: title
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        className: "mt-1.5 text-[11px] leading-5 text-slate-500",
                        children: description
                    })
                ]
            }),
            href && linkLabel && /*#__PURE__*/ _jsxs(Link, {
                href: href,
                className: "inline-flex shrink-0 items-center gap-1 pb-0.5 text-[10.5px] font-medium text-cuc-700 underline decoration-line underline-offset-4 hover:decoration-cuc-700",
                children: [
                    linkLabel,
                    /*#__PURE__*/ _jsx(ArrowRight, {
                        size: 10
                    })
                ]
            })
        ]
    });
}
function DeadlineRow(param) {
    let { event, now, saved, ready, busy, onAdd } = param;
    const days = daysUntil(event, now);
    const date = new Date(event.start_iso);
    const month = date.toLocaleDateString("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "numeric"
    });
    const day = date.toLocaleDateString("zh-CN", {
        timeZone: "Asia/Shanghai",
        day: "numeric"
    });
    const countdown = days == null ? "待核实" : days <= 0 ? "今天" : "".concat(days, " 天后");
    return /*#__PURE__*/ _jsxs("div", {
        className: "group grid gap-3 border-b border-line py-3 last:border-b-0 sm:grid-cols-[46px_1fr_auto] sm:items-center",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "flex flex-col",
                children: [
                    /*#__PURE__*/ _jsxs("span", {
                        className: "font-mono text-[9px] tracking-widest text-slate-400",
                        children: [
                            month,
                            " 月"
                        ]
                    }),
                    /*#__PURE__*/ _jsx("span", {
                        className: "font-display text-[24px] font-semibold leading-6 tabular-nums text-cuc-700",
                        children: day
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "min-w-0",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "flex flex-wrap items-center gap-1.5",
                        children: [
                            /*#__PURE__*/ _jsx("span", {
                                className: "chip border border-line bg-transparent text-slate-500",
                                children: event.category
                            }),
                            /*#__PURE__*/ _jsx("h3", {
                                className: "text-[12.5px] font-semibold text-ink",
                                children: event.title
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                className: clsx("chip border", days != null && days <= 7 ? "border-state-warnBorder bg-state-warnBg text-state-warn" : "border-state-okBorder bg-state-okBg text-state-ok"),
                                children: countdown
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx("p", {
                        className: "mt-1 line-clamp-2 text-[10.5px] leading-4 text-slate-500",
                        children: event.evidence
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "flex items-center gap-1.5 sm:justify-end",
                children: [
                    /*#__PURE__*/ _jsx("a", {
                        href: event.source_url,
                        target: "_blank",
                        rel: "noreferrer",
                        className: "inline-flex h-7 w-7 items-center justify-center border border-line text-slate-500 transition-colors hover:border-cuc-300 hover:text-cuc-700",
                        title: "核对官方原文",
                        children: /*#__PURE__*/ _jsx(ExternalLink, {
                            size: 11
                        })
                    }),
                    /*#__PURE__*/ _jsxs("button", {
                        type: "button",
                        onClick: onAdd,
                        disabled: !ready || saved || busy,
                        className: clsx("btn !px-2.5 !py-1.5 !text-[10.5px]", saved ? "border border-state-okBorder bg-state-okBg text-state-ok" : "bg-cuc-700 text-white hover:bg-cuc-800"),
                        children: [
                            busy ? /*#__PURE__*/ _jsx(Loader2, {
                                size: 11,
                                className: "animate-spin"
                            }) : saved ? /*#__PURE__*/ _jsx(Check, {
                                size: 11
                            }) : /*#__PURE__*/ _jsx(Plus, {
                                size: 11
                            }),
                            saved ? "已加入" : "加入任务"
                        ]
                    })
                ]
            })
        ]
    });
}
function TaskRow(param) {
    let { task, now } = param;
    const deadline = deadlineInfo(task, now);
    const progress = taskProgress(task);
    const materials = taskMaterialProgress(task);
    const next = nextIncompleteStep(task);
    return /*#__PURE__*/ _jsxs(Link, {
        href: "/tasks",
        className: "group block border-b border-line py-3 transition-colors last:border-b-0 hover:bg-white/70",
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "flex flex-wrap items-start gap-2",
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "min-w-0 flex-1",
                        children: [
                            /*#__PURE__*/ _jsxs("div", {
                                className: "flex flex-wrap items-center gap-1.5",
                                children: [
                                    /*#__PURE__*/ _jsx("h3", {
                                        className: "line-clamp-1 text-[12.5px] font-semibold text-ink",
                                        children: task.title
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        className: clsx("chip border !text-[9.5px]", deadlineToneClass[deadline.tone]),
                                        children: deadline.label
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("p", {
                                className: "mt-1 line-clamp-1 text-[10.5px] leading-4 text-slate-500",
                                children: next ? "下一步：".concat(next.text) : "所有步骤已完成"
                            })
                        ]
                    }),
                    /*#__PURE__*/ _jsx(ArrowRight, {
                        size: 12,
                        className: "mt-1 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-cuc-700"
                    })
                ]
            }),
            /*#__PURE__*/ _jsxs("div", {
                className: "mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400",
                children: [
                    /*#__PURE__*/ _jsxs("span", {
                        className: "inline-flex items-center gap-1",
                        children: [
                            /*#__PURE__*/ _jsx(UserRound, {
                                size: 9
                            }),
                            TASK_MEMBERS.includes(task.owner) ? task.owner : "丙"
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("span", {
                        className: "font-mono",
                        children: [
                            "步骤 ",
                            progress,
                            "%"
                        ]
                    }),
                    /*#__PURE__*/ _jsxs("span", {
                        className: "font-mono",
                        children: [
                            "材料 ",
                            materials.total ? "".concat(materials.done, "/").concat(materials.total) : "无"
                        ]
                    }),
                    /*#__PURE__*/ _jsx("span", {
                        className: "ml-auto h-[3px] w-20 overflow-hidden bg-slate-200",
                        children: /*#__PURE__*/ _jsx("span", {
                            className: "block h-full bg-cuc-700",
                            style: {
                                width: "".concat(progress, "%")
                            }
                        })
                    })
                ]
            })
        ]
    });
}
function EmptyRow(param) {
    let { icon: Icon, title, body } = param;
    return /*#__PURE__*/ _jsxs("div", {
        className: "border-b border-line py-7 text-center",
        children: [
            /*#__PURE__*/ _jsx(Icon, {
                size: 20,
                className: "mx-auto text-slate-300"
            }),
            /*#__PURE__*/ _jsx("h3", {
                className: "mt-2 text-[12.5px] font-semibold text-slate-700",
                children: title
            }),
            /*#__PURE__*/ _jsx("p", {
                className: "mx-auto mt-1 max-w-sm text-[10.5px] leading-4 text-slate-400",
                children: body
            })
        ]
    });
}
function ProfileSelect(param) {
    let { label, value, onChange, options } = param;
    return /*#__PURE__*/ _jsxs("label", {
        className: "block min-w-0",
        children: [
            /*#__PURE__*/ _jsx("span", {
                className: "mb-1 block text-[10px] tracking-wide text-slate-400",
                children: label
            }),
            /*#__PURE__*/ _jsx("select", {
                value: value,
                onChange: (event)=>onChange(event.target.value),
                className: "w-full border-0 border-b border-line bg-transparent px-0 py-1.5 text-[11.5px] text-slate-700 outline-none transition-colors focus:border-cuc-700",
                children: options.map((param)=>{
                    let [optionValue, optionLabel] = param;
                    return /*#__PURE__*/ _jsx("option", {
                        value: optionValue,
                        children: optionLabel
                    }, optionValue);
                })
            })
        ]
    });
}
function ResourceLink(param) {
    let { href, icon: Icon, title, count } = param;
    return /*#__PURE__*/ _jsxs(Link, {
        href: href,
        className: "group flex items-center gap-2.5 border-b border-line py-2.5 transition-colors last:border-b-0 hover:bg-white/70",
        children: [
            /*#__PURE__*/ _jsx(Icon, {
                size: 13,
                className: "shrink-0 text-cuc-700"
            }),
            /*#__PURE__*/ _jsxs("span", {
                className: "min-w-0 flex-1",
                children: [
                    /*#__PURE__*/ _jsx("span", {
                        className: "block text-[11.5px] font-medium text-slate-700",
                        children: title
                    }),
                    /*#__PURE__*/ _jsx("span", {
                        className: "block font-mono text-[9.5px] text-slate-400",
                        children: count
                    })
                ]
            }),
            /*#__PURE__*/ _jsx(ArrowRight, {
                size: 10,
                className: "shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-cuc-700"
            })
        ]
    });
}
function FlowStep(param) {
    let { number, title, body, icon: Icon, className } = param;
    return /*#__PURE__*/ _jsxs("div", {
        className: clsx("min-w-0", className),
        children: [
            /*#__PURE__*/ _jsxs("div", {
                className: "flex items-center gap-2",
                children: [
                    /*#__PURE__*/ _jsx("span", {
                        className: "font-mono text-[9.5px] tracking-[0.18em] text-cuc-400",
                        children: number
                    }),
                    /*#__PURE__*/ _jsx(Icon, {
                        size: 12,
                        className: "text-cuc-700"
                    }),
                    /*#__PURE__*/ _jsx("h3", {
                        className: "text-[11.5px] font-semibold text-ink",
                        children: title
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("p", {
                className: "mt-1.5 text-[10.5px] leading-4 text-slate-500",
                children: body
            })
        ]
    });
}

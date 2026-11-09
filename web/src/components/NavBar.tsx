"use client";
// @ts-nocheck
/* eslint-disable */
/* __next_internal_client_entry_do_not_use__ default auto */ import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarClock, MessageSquare, ClipboardCheck, Library, LayoutDashboard, LogIn, LogOut, UserRound } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/lib/useAuth";
const links = [
    {
        href: "/",
        label: "工作台",
        short: "工作台",
        icon: LayoutDashboard
    },
    {
        href: "/chat",
        label: "智能问答",
        short: "问答",
        icon: MessageSquare
    },
    {
        href: "/tasks",
        label: "我的任务",
        short: "任务",
        icon: ClipboardCheck
    },
    {
        href: "/deadlines",
        label: "截止雷达",
        short: "截止",
        icon: CalendarClock
    },
    {
        href: "/resources",
        label: "校园资料",
        short: "资料",
        icon: Library
    }
];
export default function NavBar() {
    const path = usePathname();
    const { user, ready, authenticated, error, logout } = useAuth();
    const displayName = (user === null || user === void 0 ? void 0 : user.first_name) || (user === null || user === void 0 ? void 0 : user.username) || "已登录";
    const [pastPoster, setPastPoster] = useState(false);
    // 首页首屏是通栏海报：导航浮在影像上，滚出海报后回到纸面导航
    useEffect(()=>{
        const update = ()=>setPastPoster(window.scrollY > Math.max(120, window.innerHeight - 160));
        update();
        window.addEventListener("scroll", update, {
            passive: true
        });
        window.addEventListener("resize", update);
        return ()=>{
            window.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, []);
    const overPoster = path === "/" && !pastPoster;
    const isActive = (href)=>href === "/" ? path === "/" : path === href || path.startsWith("".concat(href, "/"));
    return /*#__PURE__*/ _jsxs(_Fragment, {
        children: [
            /*#__PURE__*/ _jsxs("header", {
                className: clsx("sticky top-0 z-30 border-b transition-colors duration-300", overPoster ? "border-transparent bg-transparent" : "border-line bg-[#f6f4ee]/95 backdrop-blur"),
                children: [
                    /*#__PURE__*/ _jsxs("div", {
                        className: "mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:h-[62px] sm:px-6",
                        children: [
                            /*#__PURE__*/ _jsxs(Link, {
                                href: "/",
                                className: "flex shrink-0 items-center gap-2.5",
                                children: [
                                    /*#__PURE__*/ _jsx("span", {
                                        className: clsx("flex h-8 w-8 items-center justify-center border text-[12px] font-bold leading-none tracking-wide transition-colors", overPoster ? "border-white/30 bg-white/10 text-white" : "border-cuc-700 bg-cuc-700 text-white"),
                                        children: "中传"
                                    }),
                                    /*#__PURE__*/ _jsxs("span", {
                                        className: "hidden flex-col leading-tight sm:flex",
                                        children: [
                                            /*#__PURE__*/ _jsx("span", {
                                                className: clsx("text-[13px] font-semibold tracking-wide transition-colors", overPoster ? "text-white" : "text-ink"),
                                                children: "校园信息助手"
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: clsx("mt-0.5 text-[10px] tracking-[0.08em] transition-colors", overPoster ? "text-white/55" : "text-slate-500"),
                                                children: "每条答案都有官方来源"
                                            })
                                        ]
                                    })
                                ]
                            }),
                            /*#__PURE__*/ _jsx("nav", {
                                className: "hidden min-w-0 flex-1 items-center gap-5 md:flex",
                                "aria-label": "主导航",
                                children: links.map((l)=>{
                                    const active = isActive(l.href);
                                    const Icon = l.icon;
                                    return /*#__PURE__*/ _jsxs(Link, {
                                        href: l.href,
                                        "aria-current": active ? "page" : undefined,
                                        "data-active": active,
                                        className: clsx("nav-link flex shrink-0 items-center gap-1.5 pb-1 pt-1 text-[12px] font-medium transition-colors lg:text-[12.5px]", overPoster && "nav-link-light", active ? overPoster ? "text-white" : "text-ink" : overPoster ? "text-white/65 hover:text-white" : "text-slate-500 hover:text-ink"),
                                        children: [
                                            /*#__PURE__*/ _jsx(Icon, {
                                                size: 13,
                                                className: clsx(active ? overPoster ? "text-white/85" : "text-cuc-700" : overPoster ? "text-white/45" : "text-slate-400")
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "hidden lg:inline",
                                                children: l.label
                                            }),
                                            /*#__PURE__*/ _jsx("span", {
                                                className: "lg:hidden",
                                                children: l.short
                                            })
                                        ]
                                    }, l.href);
                                })
                            }),
                            /*#__PURE__*/ _jsxs("div", {
                                className: "ml-auto flex shrink-0 items-center gap-2",
                                children: [
                                    /*#__PURE__*/ _jsx(Link, {
                                        href: "/about",
                                        className: clsx("hidden text-[11.5px] font-medium transition-colors lg:inline", overPoster ? "text-white/60 hover:text-white" : "text-slate-500 hover:text-cuc-700"),
                                        children: "说明"
                                    }),
                                    /*#__PURE__*/ _jsx("span", {
                                        className: clsx("hidden h-6 w-px sm:block", overPoster ? "bg-white/20" : "bg-line")
                                    }),
                                    !ready ? /*#__PURE__*/ _jsx("span", {
                                        className: "h-8 w-16 animate-pulse bg-slate-200/70"
                                    }) : authenticated ? /*#__PURE__*/ _jsxs(_Fragment, {
                                        children: [
                                            /*#__PURE__*/ _jsxs("span", {
                                                className: clsx("inline-flex h-8 max-w-[110px] items-center gap-1.5 border px-2 text-[11.5px] font-medium sm:max-w-[150px]", overPoster ? "border-white/30 text-white" : "border-line text-cuc-700"),
                                                title: displayName,
                                                children: [
                                                    /*#__PURE__*/ _jsx(UserRound, {
                                                        size: 12,
                                                        className: "shrink-0"
                                                    }),
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: "truncate",
                                                        children: displayName
                                                    })
                                                ]
                                            }),
                                            /*#__PURE__*/ _jsxs("button", {
                                                type: "button",
                                                onClick: logout,
                                                className: clsx("btn-ghost !px-2 !py-1.5 !text-[11.5px]", overPoster && "!border-white/35 !bg-transparent !text-white hover:!border-white/60"),
                                                title: "退出登录",
                                                children: [
                                                    /*#__PURE__*/ _jsx(LogOut, {
                                                        size: 12
                                                    }),
                                                    /*#__PURE__*/ _jsx("span", {
                                                        className: "hidden sm:inline",
                                                        children: "退出"
                                                    })
                                                ]
                                            })
                                        ]
                                    }) : /*#__PURE__*/ _jsxs(Link, {
                                        href: "/login?next=/tasks",
                                        className: clsx(overPoster ? "inline-flex items-center justify-center gap-1.5 border border-white/40 bg-white/10 px-2.5 py-1.5 text-[11.5px] font-medium text-white transition-colors hover:bg-white/20" : "btn-primary !px-2.5 !py-1.5 !text-[11.5px]"),
                                        children: [
                                            /*#__PURE__*/ _jsx(LogIn, {
                                                size: 12
                                            }),
                                            "登录"
                                        ]
                                    })
                                ]
                            })
                        ]
                    }),
                    error && /*#__PURE__*/ _jsx("div", {
                        className: "border-t border-state-warnBorder bg-state-warnBg px-4 py-1.5 text-center text-[10.5px] text-state-warn",
                        children: error
                    })
                ]
            }),
            /*#__PURE__*/ _jsx("nav", {
                className: "fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-line bg-[#f6f4ee]/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden",
                "aria-label": "移动端主导航",
                children: links.map((l)=>{
                    const active = isActive(l.href);
                    const Icon = l.icon;
                    return /*#__PURE__*/ _jsxs(Link, {
                        href: l.href,
                        "aria-current": active ? "page" : undefined,
                        className: clsx("relative flex min-w-0 flex-col items-center justify-center gap-1 px-0.5 py-2 text-[9.5px] font-medium transition-colors", active ? "text-ink" : "text-slate-500"),
                        children: [
                            active && /*#__PURE__*/ _jsx("span", {
                                className: "absolute inset-x-2 top-0 h-[2px] bg-cuc-700"
                            }),
                            /*#__PURE__*/ _jsx(Icon, {
                                size: 16,
                                className: active ? "text-cuc-700" : "text-slate-400"
                            }),
                            /*#__PURE__*/ _jsx("span", {
                                className: "whitespace-nowrap",
                                children: l.short
                            })
                        ]
                    }, l.href);
                })
            })
        ]
    });
}

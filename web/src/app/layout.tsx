import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import NavBar from "@/components/NavBar";
import IntroCarve from "@/components/IntroCarve";
import TaskReminderManager from "@/components/TaskReminderManager";
import AutoReveal from "@/components/fx/AutoReveal";
import GrainOverlay from "@/components/fx/GrainOverlay";
import AuroraBeams from "@/components/fx/AuroraBeams";
import ParticleField from "@/components/fx/ParticleField";

export const metadata: Metadata = {
  title: "中传校园信息助手",
  description:
    "中国传媒大学校园管理问答网站：规章制度、办事流程、部门联系方式、服务时间、通知公告、校历。每条答案带官方来源，冲突并列，查不到就拒答。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col">
        {/* 开场：Canvas 实时刻线（?intro=video 回退到 Blender 成片） */}
        <IntroCarve />
        <TaskReminderManager />
        <AutoReveal />
        {/* 全站氛围层：青紫极光 + 氛围粒子，fixed 衬在所有页面内容之下，全站继承 */}
        <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
          <AuroraBeams variant="light" />
          <ParticleField alpha={0.8} density={8000} linkDistance={140} />
        </div>
        <GrainOverlay opacity={0.09} zIndex={70} blend="soft-light" />
        <NavBar />
        <main className="relative z-[1] flex-1 pb-24 md:pb-0">{children}</main>
        <div className="relative z-[1]">
          <Footer />
        </div>
        {/* 构建版本水印：排查"用户端是否拿到最新构建"的判据，视觉上几不可见 */}
        <span
          aria-hidden
          className="pointer-events-none fixed bottom-0.5 right-1.5 z-[80] select-none text-[9px] leading-none text-ink/20"
        >
          b.{process.env.NEXT_PUBLIC_BUILD_TIME?.slice(5, 16).replace(/[-:T]/g, "")}
        </span>
      </body>
    </html>
  );
}

function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-1.5 px-5 pb-24 pt-5 text-[11.5px] text-slate-400 sm:flex-row sm:items-center sm:justify-between md:py-5">
        <div>
          中传校园信息助手 · 校园智能体设计大赛参赛作品
          <span className="mx-1.5 text-slate-300">|</span>
          数据来源均为 cuc.edu.cn 官方页面，仅作信息查询，不代办业务
        </div>
        <div className="flex items-center gap-3">
          <Link href="/about" className="hover:text-cuc-600">
            设计说明
          </Link>
          <Link href="/test" className="hover:text-cuc-600">
            测试报告
          </Link>
        </div>
      </div>
    </footer>
  );
}

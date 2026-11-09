import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  Library,
  Megaphone,
  MessageSquareText,
  Phone,
  Search,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import ResourcesIntroModal from "@/components/ResourcesIntroModal";
import {
  getCalendars,
  getContacts,
  getNotices,
  getPolicies,
  getProcesses,
  getServiceHours,
} from "@/lib/api";

export const metadata = {
  title: "校园资料 · 中传校园信息助手",
  description: "按办事场景快速进入流程、部门电话、通知、截止日期、制度、校历与服务时间。",
};

export default function ResourcesPage() {
  const processes = getProcesses();
  const contacts = getContacts();
  const notices = getNotices();
  const calendars = getCalendars();
  const serviceHours = getServiceHours();
  const policies = getPolicies();
  const conflictCount =
    contacts.filter((contact) => contact.conflict_flag).length +
    policies.filter((policy) => policy.is_superseded).length;
  const gapCount = [
    ...processes,
    ...contacts,
    ...notices,
    ...policies,
    ...serviceHours,
  ].reduce((count, item) => count + (item.gaps?.length ?? 0), 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-7 sm:px-5 sm:py-8">
      <PageHeader
        icon={Library}
        title="校园资料"
        description="不先要求学生知道“资料属于哪个库”。从正在办的事情出发，再进入对应的流程、部门、通知或制度。"
      />

      <section className="mt-5">
        <div className="mb-2.5 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900">按事情找资料</h2>
            <p className="mt-0.5 text-[11.5px] text-slate-500">
              六个高频入口，先解决“我现在要做什么”，再考虑信息属于哪一类。
            </p>
          </div>
          <Link
            href="/chat"
            className="hidden shrink-0 items-center gap-1 text-[11.5px] font-medium text-cuc-600 hover:underline sm:inline-flex"
          >
            不知道选哪个，直接问 <ArrowRight size={11} />
          </Link>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              href: "/processes",
              icon: ClipboardList,
              title: "我要办一件事",
              prompt: "补办学生证、开在读证明、休学复学",
              note: `${processes.length} 条结构化流程`,
            },
            {
              href: "/contacts",
              icon: Phone,
              title: "不知道该找谁",
              prompt: "从“办什么事”反查部门和电话",
              note: `${contacts.length} 个官方联系方式`,
            },
            {
              href: "/deadlines",
              icon: CalendarClock,
              title: "怕错过时间节点",
              prompt: "报名、准考证、考试与评审日期",
              note: "过期与待核实分开显示",
            },
            {
              href: "/notices",
              icon: Megaphone,
              title: "我要找最新通知",
              prompt: "查看截止、适用对象、材料与附件状态",
              note: `${notices.length} 条通知`,
            },
            {
              href: "/calendar",
              icon: CalendarDays,
              title: "我想查校历与开放时间",
              prompt: "教学周、假期、课节与服务窗口时间",
              note: `${calendars.length} 个学期 · ${serviceHours.length} 项业务时段`,
            },
            {
              href: "/policies",
              icon: BookOpenCheck,
              title: "我想核对制度依据",
              prompt: "查现行版本、旧版关系和生效日期",
              note: `${policies.length} 份常用规定`,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-lg border border-slate-200 bg-white p-3.5 transition-colors hover:border-cuc-300 hover:bg-cuc-50/30"
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cuc-50 text-cuc-700">
                    <Icon size={14} />
                  </span>
                  <span className="text-[13.5px] font-semibold text-slate-800">{item.title}</span>
                  <ArrowRight
                    size={12}
                    className="ml-auto text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-cuc-600"
                  />
                </div>
                <p className="mt-2 text-[12px] leading-5 text-slate-500">{item.prompt}</p>
                <p className="mt-1.5 text-[10.5px] text-slate-400">{item.note}</p>
              </Link>
            );
          })}
        </div>

        <Link
          href="/chat"
          className="mt-2.5 flex items-center justify-between gap-3 rounded-lg border border-cuc-200 bg-cuc-50/60 px-3.5 py-3 sm:hidden"
        >
          <span className="flex items-center gap-2 text-[12px] font-medium text-cuc-800">
            <MessageSquareText size={14} /> 不知道自己属于哪种情况
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-[11.5px] text-cuc-600">
            直接问 <ArrowRight size={11} />
          </span>
        </Link>
      </section>

      <ResourcesIntroModal gapCount={gapCount} conflictCount={conflictCount} />

      <section className="mt-7">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Search size={14} className="text-cuc-600" />
            <h2 className="text-[14px] font-semibold text-slate-900">最快路径</h2>
          </div>
          <ol className="mt-2.5 space-y-2 text-[11.5px] leading-5 text-slate-600">
            <li className="flex gap-2">
              <span className="font-mono text-[10px] text-slate-300">01</span>
              知道具体事项：从办事流程进入。
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-[10px] text-slate-300">02</span>
              只知道问题：先查部门路由或直接问助手。
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-[10px] text-slate-300">03</span>
              已经有日期：加入任务雷达并下载日历提醒。
            </li>
            <li className="flex gap-2">
              <span className="font-mono text-[10px] text-slate-300">04</span>
              信息互相矛盾：并列来源，按页面给出的电话核实。
            </li>
          </ol>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Link href="/chat" className="btn-primary !px-2.5 !py-1.5 !text-[11.5px]">
              <MessageSquareText size={12} /> 问助手
            </Link>
            <Link href="/tasks" className="btn-ghost !px-2.5 !py-1.5 !text-[11.5px]">
              打开任务雷达
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[11.5px] leading-5 text-slate-500">
        <span className="font-medium text-slate-700">数据口径：</span>
        当前页面展示的是前端知识库快照。后端验收报告记录的核心数据库为 9 张核心表、379 条结构化数据；
        数据库总量不等于当前页面逐条展示的数量。入库数据仍需逐条回溯官方来源。
        <a
          href="https://www.cuc.edu.cn/"
          target="_blank"
          rel="noreferrer"
          className="ml-1 inline-flex items-center gap-1 font-medium text-cuc-600 hover:underline"
        >
          学校官网 <ExternalLink size={10} />
        </a>
      </section>
    </div>
  );
}

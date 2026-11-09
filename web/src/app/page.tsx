import HomeDashboard from "@/components/HomeDashboard";
import WorkbenchHint from "@/components/WorkbenchHint";
import {
  getCalendars,
  getContacts,
  getNotices,
  getProcesses,
} from "@/lib/api";

export const metadata = {
  title: "办事工作台 · 中传校园信息助手",
  description:
    "从一个校园问题开始，查看官方截止节点、个人任务与办事材料。",
};

export default function HomePage() {
  return (
    <>
      <HomeDashboard
        resourceCounts={{
          processes: getProcesses().length,
          contacts: getContacts().length,
          notices: getNotices().length,
          calendars: getCalendars().length,
        }}
      />
      <WorkbenchHint />
    </>
  );
}

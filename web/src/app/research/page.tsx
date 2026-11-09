import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Database,
  ExternalLink,
  FileCheck2,
  FlaskConical,
  ListChecks,
  MessageSquareText,
  ScanSearch,
  ShieldAlert,
  Smartphone,
  Users,
} from "lucide-react";
import PageHeader from "@/components/PageHeader";
import StatCard from "@/components/StatCard";

export const metadata = {
  title: "问卷闭环 · 中传校园信息助手",
  description: "基于去重后的 9 份小样本问卷，逐项说明校园办事痛点哪些已解决、哪些只完成一部分。",
};

const SURVEY_SHA256 =
  "E3F5FD07954A27F4A45DC03CBF266F752F1BD7ED63CADD62BA2D2F1E8EC360E8";

const painPoints = [
  { label: "找不到办理流程，不知道怎么办", count: 8 },
  { label: "不知道归属部门，该找谁", count: 7 },
  { label: "官网页面打不开、链接失效或信息过期", count: 7 },
  { label: "流程环节多、审核慢", count: 4 },
  { label: "材料清单不清楚，白跑或补材料", count: 3 },
  { label: "错过报名或办理时间节点", count: 2 },
  { label: "窗口开放时间短，还要跑线下", count: 2 },
];

const findings = [
  { value: "8/9", label: "明确希望直接解答办事流程" },
  { value: "7/9", label: "需要“问题 → 部门 → 电话”路由" },
  { value: "8/9", label: "认为关键节点倒计时有用" },
  { value: "8/9", label: "发现矛盾时希望如实说明并给电话" },
];

export default function ResearchPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-7 sm:px-5 sm:py-8">
      <PageHeader
        icon={FlaskConical}
        title="问卷需求闭环"
        description="去重后只有 9 份答卷，全部为大一学生。这里用它检验方向，不把它包装成全校代表性调研。"
        badge={<span className="chip bg-state-warnBg text-state-warn">小样本验证</span>}
        actions={
          <Link href="/test" className="btn-ghost !py-1.5 !text-[12px]">
            查看 56 题回归测试 <ArrowRight size={13} />
          </Link>
        }
      />

      <section className="mt-4 rounded-lg border border-slate-200 bg-white px-3.5 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <FileCheck2 size={13} className="mt-0.5 shrink-0 text-cuc-600" />
            <div>
              <p className="text-[12px] font-semibold text-slate-800">样本去重说明</p>
              <p className="mt-0.5 text-[11px] leading-5 text-slate-500">
                三份 CSV 的 SHA256 完全一致，按文件哈希去重后为 9 份；不是 27 份，也不是三批独立样本。
              </p>
            </div>
          </div>
          <code className="max-w-full break-all rounded bg-slate-50 px-2 py-1 text-[9.5px] leading-4 text-slate-400">
            SHA256 {SURVEY_SHA256}
          </code>
        </div>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatCard value="9" label="去重后有效答卷" icon={Users} />
        <StatCard value="8/9" label="找不到办理流程" icon={ListChecks} />
        <StatCard value="7/9" label="官网链接或信息有问题" icon={ScanSearch} />
        <StatCard value="8/9" label="愿意使用该智能助手" icon={MessageSquareText} />
      </div>

      <section className="mt-6 grid gap-3 lg:grid-cols-[1.05fr_.95fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={14} className="text-cuc-600" />
            <h2 className="text-[15px] font-semibold text-slate-900">问卷说出的主要困难</h2>
          </div>
          <div className="mt-3 space-y-2.5">
            {painPoints.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between gap-2 text-[11.5px]">
                  <span className="leading-5 text-slate-600">{item.label}</span>
                  <span className="shrink-0 font-medium tabular-nums text-slate-700">
                    {item.count}/9
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-cuc-500"
                    style={{ width: `${(item.count / 9) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-slate-100 pt-2 text-[10.5px] leading-4 text-slate-400">
            多选题按选择该选项的人数统计；9 份样本只能用于发现方向，不能推导全校比例。
          </p>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-cuc-600" />
            <h2 className="text-[15px] font-semibold text-slate-900">对产品优先级的直接影响</h2>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {findings.map((item) => (
              <div key={item.label} className="rounded-lg bg-slate-50 px-3 py-3">
                <div className="text-[21px] font-semibold tabular-nums leading-none text-cuc-700">
                  {item.value}
                </div>
                <p className="mt-1.5 text-[10.5px] leading-4 text-slate-500">{item.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-2.5 rounded-lg border border-cuc-100 bg-cuc-50/60 px-3 py-2.5">
            <p className="text-[11.5px] font-medium text-cuc-800">另外两项值得注意</p>
            <p className="mt-1 text-[10.5px] leading-4 text-slate-600">
              8/9 偶尔遇到“按官方流程做却卡住”；关于漏看截止时间，2 人有较大影响、2 人有小影响、5 人差点错过。
              所以产品不能只做问答，还必须处理官网失效和执行节点。
            </p>
          </div>
        </div>
      </section>

      <section className="mt-7 border-t border-slate-200 pt-6">
        <div className="mb-3">
          <h2 className="text-[17px] font-semibold text-slate-900">9 份问卷中的问题，解决到什么程度</h2>
          <p className="mt-1 text-[11.5px] leading-5 text-slate-500">
            判断标准不是“页面上提过”，而是用户能否完成对应动作，以及系统有没有明确边界。
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <ClosureColumn
            title="已解决"
            subtitle="能从问题走到具体页面或行动"
            icon={CheckCircle2}
            tone="ok"
            items={[
              {
                title: "找不到流程",
                evidence: "8/9 提及",
                body: "提供结构化步骤、材料、部门、入口和官方缺口，并支持生成办事卡。",
                href: "/processes",
                link: "查看办事流程",
              },
              {
                title: "不知道找哪个部门",
                evidence: "7/9 提及",
                body: "联系方式按业务关键词组织，冲突号码并列，不替官方静默选择。",
                href: "/contacts",
                link: "按事情找电话",
              },
              {
                title: "信息冲突或查不到",
                evidence: "8/9 希望如实说明",
                body: "问答采用有依据、信息冲突、无法确认三态，边界状态给出核实渠道。",
                href: "/chat",
                link: "验证三态问答",
              },
              {
                title: "怕漏关键节点",
                evidence: "8/9 认为倒计时有用",
                body: "截止日期雷达区分未来、已过、待核实，并能加入任务或下载日历。",
                href: "/deadlines",
                link: "打开截止雷达",
              },
              {
                title: "材料不清楚",
                evidence: "3/9 有白跑或补材料",
                body: "按身份、首次/补办、本人/委托、线上/现场生成清单，并标明官网明确、系统整理或待核实。",
                href: "/chat",
                link: "生成个性化材料",
              },
            ]}
          />

          <ClosureColumn
            title="部分解决"
            subtitle="已有可用能力，但还依赖用户手动触发"
            icon={CircleDashed}
            tone="partial"
            items={[
              {
                title: "官网打不开、链接失效",
                evidence: "7/9 提及",
                body: "支持逐条按需巡检、检查 DNS、重定向、端口和正文长度；没有后端或网络时明确失败。",
                href: "/deadlines",
                link: "在截止页巡检",
              },
              {
                title: "通知分散，容易漏看",
                evidence: "6/9 希望聚合",
                body: "已把多来源字段归一化并区分历史通知，但当前演示知识库不是实时抓取所有公众号。",
                href: "/notices",
                link: "查看通知聚合",
              },
              {
                title: "团队分工与交接",
                evidence: "由项目协作需求扩展",
                body: "任务支持负责人、协作者、双进度、交接说明和飞书摘要；同一账号可跨设备同步，但不同成员账号之间相互隔离，尚不是多人共同编辑同一任务。",
                href: "/tasks",
                link: "查看账号任务",
              },
            ]}
          />

          <ClosureColumn
            title="尚未解决"
            subtitle="不把产品路线图写成已完成能力"
            icon={AlertTriangle}
            tone="open"
            items={[
              {
                title: "流程环节多、审核慢",
                evidence: "4/9 提及",
                body: "本产品能解释流程和提醒准备，但不能缩短学校审批链路，也不能查询个人审批进度。",
              },
              {
                title: "窗口开放时间短",
                evidence: "2/9 提及",
                body: "只能透明呈现业务对应时段并提示电话确认，不能改变窗口开放安排。",
                href: "/calendar?tab=hours",
                link: "查看服务时间",
              },
              {
                title: "跨设备多人实时同步",
                evidence: "团队协作限制",
                body: "单个账号的跨设备任务同步已接入；多人共享任务、成员权限、操作审计和冲突合并仍需继续建设。",
              },
              {
                title: "自动定时巡检与推送",
                evidence: "运行能力限制",
                body: "官网巡检和飞书推送都由用户手动触发。尚未部署定时任务，也不会声称后台持续监控。",
              },
              {
                title: "全校代表性验证",
                evidence: "仅 9 份大一答卷",
                body: "需要覆盖不同年级、学院和真实办事场景，并观察完成率，而不是只问使用意愿。",
              },
            ]}
          />
        </div>
      </section>

      <section className="mt-4 grid gap-3 lg:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <Database size={14} className="text-cuc-600" />
            <h2 className="text-[14px] font-semibold text-slate-900">两类证据要分开看</h2>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <EvidenceBox
              title="需求证据"
              value="9 份"
              body="用于决定先做流程、部门路由、倒计时、可信说明和材料清单；不能代表全校。"
            />
            <EvidenceBox
              title="数据验收"
              value="9 表 / 379 条"
              body="来自合并验收报告的核心数据结构统计；不等于前端每条都直接读取数据库，也不等于都通过用户验证。"
            />
          </div>
          <p className="mt-3 text-[10.5px] leading-4 text-slate-400">
            数据量、问卷意愿和真实使用完成率是三种不同证据。项目页分别标注，避免用一个数字替代另一个。
          </p>
        </div>

        <div className="rounded-lg border border-state-warnBorder bg-state-warnBg/50 p-4">
          <div className="flex items-center gap-2">
            <ShieldAlert size={14} className="text-state-warn" />
            <h2 className="text-[14px] font-semibold text-slate-900">下一步验证建议</h2>
          </div>
          <ul className="mt-2.5 space-y-2 text-[11px] leading-5 text-slate-600">
            <li>· 让 5–8 名不同年级学生现场完成“补办学生证”任务，记录是否找到材料与部门。</li>
            <li>· 用真实临近截止日验证一次倒计时、日历下载与错过后的补救路径。</li>
            <li>· 接后端时验证飞书未配置、Webhook 错误、官网超时三类失败态，不只截成功图。</li>
            <li>· 若要上线，优先补多人共享权限与内容更新机制，再做视觉包装。</li>
          </ul>
        </div>
      </section>

      <div className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-5 text-slate-500 sm:flex-row sm:items-center sm:justify-between">
        <span className="inline-flex items-center gap-1.5">
          <Smartphone size={12} className="text-slate-400" />
          登录后任务按账号同步；未登录或后端暂不可用时才使用当前浏览器本地保存，并可手动导入。
        </span>
        <Link href="/tasks" className="shrink-0 font-medium text-cuc-600 hover:underline">
          查看任务中的真实限制
        </Link>
      </div>
    </div>
  );
}

function ClosureColumn({
  title,
  subtitle,
  icon: Icon,
  tone,
  items,
}: {
  title: string;
  subtitle: string;
  icon: typeof CheckCircle2;
  tone: "ok" | "partial" | "open";
  items: Array<{
    title: string;
    evidence: string;
    body: string;
    href?: string;
    link?: string;
  }>;
}) {
  const style =
    tone === "ok"
      ? "border-state-okBorder bg-state-okBg/35 text-state-ok"
      : tone === "partial"
        ? "border-cuc-200 bg-cuc-50/60 text-cuc-700"
        : "border-state-warnBorder bg-state-warnBg/45 text-state-warn";
  return (
    <div className={`rounded-lg border p-3.5 ${style}`}>
      <div className="flex items-start gap-2">
        <Icon size={14} className="mt-0.5 shrink-0" />
        <div>
          <h3 className="text-[13.5px] font-semibold">{title}</h3>
          <p className="mt-0.5 text-[10.5px] leading-4 text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item.title} className="rounded-lg border border-white/70 bg-white px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <h4 className="text-[11.5px] font-semibold text-slate-800">{item.title}</h4>
              <span className="chip bg-slate-100 text-[9.5px] text-slate-500">{item.evidence}</span>
            </div>
            <p className="mt-1 text-[10.5px] leading-4 text-slate-500">{item.body}</p>
            {item.href && item.link && (
              <Link
                href={item.href}
                className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-medium text-cuc-600 hover:underline"
              >
                {item.link} <ArrowRight size={9} />
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EvidenceBox({
  title,
  value,
  body,
}: {
  title: string;
  value: string;
  body: string;
}) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-3">
      <div className="text-[10.5px] text-slate-500">{title}</div>
      <div className="mt-1 text-[18px] font-semibold tabular-nums text-slate-900">{value}</div>
      <p className="mt-1 text-[10px] leading-4 text-slate-500">{body}</p>
    </div>
  );
}

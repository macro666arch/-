import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  FileQuestion,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
} from "lucide-react";

/**
 * 对标页
 * ------------------------------------------------------------
 * 不跟校级平台比统一入口，只说明本项目的四项增量，
 * 并且每一项都给出可以点开看到的真实页面入口。
 */

export const metadata = {
  title: "与问道中传的差异 · 中传校园信息助手",
  description:
    "统一入口、账号体系、业务系统直连是校级平台优势；本项目只在证据可审计、知识保鲜、过程可解释上做增量。",
};

const PLATFORM_CAPABILITIES = [
  {
    title: "全校统一入口",
    body: "aia.cuc.edu.cn、融合服务门户、中传 APP 三个入口，账号体系与学校统一身份打通。",
  },
  {
    title: "1 + N 模式",
    body: "1 个「问道中传」主智能体，加 40 多个覆盖各业务线的业务智能体。",
  },
  {
    title: "服务唤醒",
    body: "对话里直接唤起业务系统，把查询或办理带到对应系统的真实出入口。",
  },
  {
    title: "数据查询",
    body: "成绩、课表、审批进度等个人数据，在账号授权范围内直接返回。",
  },
];

const PROJECT_INCREMENTS = [
  {
    title: "三态结论 + 官方来源白名单",
    body: "有依据 / 信息冲突 / 无法确认三态；来源链接必须落在 cuc.edu.cn 等官方白名单域名内。",
  },
  {
    title: "知识保鲜治理",
    body: "90 天复核阈值；超过复核线转「待复核」；官网巡检结果可写回条目，不靠一次性整理。",
  },
  {
    title: "回答过程可解释",
    body: "检索 → 核验 → 规划三段确定性轨迹，逐段给出输入、输出与交接，不冒充多个自主大模型。",
  },
  {
    title: "资料缺口显性化",
    body: "步骤跳号、材料写「相关材料」、地点或截止日期缺失，照原文呈现并单独标成缺口。",
  },
];

const CARDS = [
  {
    no: "①",
    title: "三态证据链",
    icon: ShieldCheck,
    href: `/chat?q=${encodeURIComponent("学籍管理科电话是多少")}`,
    entry: "/chat",
    entryLabel: "问「学籍管理科电话是多少」",
    points: [
      "答案顶部先给结论状态：有依据 / 信息冲突 / 无法确认，答不出来就明确拒答。",
      "每条依据都挂来源卡：官方域名、原文摘录、发布日期与核实状态一并展示。",
      "遇到两个官方页面互相矛盾时并列两个说法，不替你二选一。",
    ],
  },
  {
    no: "②",
    title: "知识保鲜治理",
    icon: RefreshCw,
    href: "/deadlines",
    entry: "/deadlines",
    entryLabel: "打开截止日期雷达",
    points: [
      "每一条官方节点都带原文链接、核实标记与可计算日期，过期节点单独归档。",
      "90 天复核线：超过复核周期未重新核对，就会在通知与资料里标成「待复核」。",
      "日期写「另行通知」「以附件为准」的，单独放进「日期待核实」，不生成假倒计时。",
    ],
  },
  {
    no: "③",
    title: "回答过程可解释",
    icon: Workflow,
    href: `/chat?q=${encodeURIComponent("补办学生证需要什么材料？")}`,
    entry: "/chat",
    entryLabel: "问「补办学生证需要什么材料」",
    points: [
      "每条回答下都有「执行轨迹」，按检索 → 核验 → 规划三段展开。",
      "每段给出输入摘要、输出摘要与交接内容，能看出答案是怎么被拼出来的。",
      "轨迹会注明是后端实时流水线还是本地确定性规则，不把规则包装成「大模型思考」。",
    ],
  },
  {
    no: "④",
    title: "资料缺口显性化",
    icon: FileQuestion,
    href: "/processes",
    entry: "/processes",
    entryLabel: "打开办事流程指引",
    points: [
      "官方流程步骤编号跳号（1→2→3→5）时，明确标出缺的是哪一步。",
      "材料只写「相关材料」、办理地点未公布、截止日期藏在打不开的附件里，都按缺口提示。",
      "缺口跟随原文链接一起展示，需要追溯时能直接回官网核对，不替官网补写。",
    ],
  },
];

const ROUNDS = [
  { no: "第 1 轮", score: "79（v1 口径）", test: "—" },
  { no: "第 2 轮", score: "87（v1 口径）", test: "—" },
  { no: "第 3 轮", score: "86.5", test: "50/56" },
  { no: "第 4 轮", score: "88", test: "49/56" },
  { no: "第 5 轮", score: "89", test: "51/56" },
  { no: "第 6 轮", score: "94", test: "55/56" },
  { no: "第 7 轮", score: "95（达到通关线）", test: "56/56" },
  { no: "第 8 轮", score: "95（界面升级，内容分不变）", test: "56/56" },
  { no: "第 9 轮", score: "95（落地页海报化，内容分不变）", test: "56/56" },
  { no: "第 10 轮", score: "97（补契约、实证 ICS、保鲜直连）", test: "56/56" },
];

export default function InnovationPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-7 sm:px-5 sm:py-9">
      <header className="mb-6 border-b border-line pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-[26px] leading-tight tracking-tight text-ink">
            与问道中传的差异
          </h1>
          <span className="chip border border-line bg-transparent text-cuc-700">
            <Sparkles size={9} /> 对标说明
          </span>
        </div>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-slate-600">
          学校已有「问道中传」校级平台。这个项目不与它比统一入口，
          只把四件事做到可点开、可核对：证据可审计、知识保鲜、过程可解释、资料缺口可见。
        </p>
      </header>

      {/* ---------- 对照表 ---------- */}
      <section className="overflow-hidden border-y border-line" aria-label="能力对照">
        <div className="grid sm:grid-cols-2">
          <div className="border-b border-line sm:border-b-0 sm:border-r">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <span className="shrink-0 text-slate-400">
                <Building2 size={14} />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-ink">
                  问道中传（校级平台）
                </h2>
                <p className="text-[10.5px] text-slate-500">已上线的全校统一入口</p>
              </div>
            </div>
            <ul className="divide-y divide-line px-4">
              {PLATFORM_CAPABILITIES.map((item) => (
                <li key={item.title} className="py-2.5">
                  <p className="text-[12.5px] font-medium text-ink">{item.title}</p>
                  <p className="mt-0.5 break-words text-[11.5px] leading-5 text-slate-500">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <span className="shrink-0 text-cuc-700">
                <Sparkles size={14} />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-ink">本项目</h2>
                <p className="text-[10.5px] text-slate-500">只在四项增量上做深</p>
              </div>
            </div>
            <ul className="divide-y divide-line px-4">
              {PROJECT_INCREMENTS.map((item) => (
                <li key={item.title} className="py-2.5">
                  <p className="text-[12.5px] font-medium text-ink">{item.title}</p>
                  <p className="mt-0.5 break-words text-[11.5px] leading-5 text-slate-500">
                    {item.body}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-line px-4 py-3">
          <p className="flex gap-1.5 text-[12px] leading-5 text-slate-600">
            <AlertTriangle size={13} className="mt-1 shrink-0 text-state-warn" />
            <span className="break-words">
              <strong className="font-semibold text-ink">边界声明：</strong>
              统一入口、账号体系、业务系统直连是校级平台优势，本项目不与之竞争；本项目只在证据可审计、知识保鲜、过程可解释上做增量。
            </span>
          </p>
        </div>
      </section>

      {/* ---------- 四个可点开的增量 ---------- */}
      <section className="mt-7 grid gap-x-8 sm:grid-cols-2">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.title}
              href={card.href}
              className="group flex flex-col border-t border-line pb-4 pt-4 transition-colors hover:bg-white"
            >
              <div className="flex items-start gap-2">
                <span className="shrink-0 text-cuc-700">
                  <Icon size={15} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold leading-5 text-ink">
                    <span className="mr-1 font-mono text-[11px] text-cuc-600">{card.no}</span>
                    {card.title}
                  </h3>
                  <p className="mt-0.5 text-[10.5px] text-slate-400">点开能看到什么</p>
                </div>
              </div>

              <ul className="mt-2.5 flex-1 space-y-1.5">
                {card.points.map((point) => (
                  <li
                    key={point}
                    className="flex gap-1.5 break-words text-[11.5px] leading-5 text-slate-600"
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-cuc-300" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-2.5">
                <span className="min-w-0 truncate text-[11px] text-slate-500">
                  <span className="kd">{card.entry}</span>
                  <span className="ml-1.5">{card.entryLabel}</span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-cuc-700">
                  打开
                  <ArrowRight size={11} />
                </span>
              </div>
            </Link>
          );
        })}
      </section>

      <p className="mt-1 text-[11px] leading-5 text-slate-400">
        以上四项都能在上面四个页面里直接看到，不靠口头描述；入口链接就是普通站内路由，移动端与桌面端一致。
      </p>

      {/* ---------- 自评闭环 ---------- */}
      <section className="mt-7 border-t border-line pt-5" aria-label="自评闭环">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 shrink-0 text-cuc-700">
            <Target size={15} />
          </span>
          <div className="min-w-0">
            <h2 className="font-display text-[20px] leading-tight tracking-tight text-ink">自评闭环：同一把尺子，逐轮冻结</h2>
            <p className="mt-1.5 text-[11.5px] leading-5 text-slate-600">
              7 个维度、100 分，其中「创新度」占 15 分，满分前提是与问道中传的差异能当场演示。每轮评价先把分数、分项和扣分证据冻结成文件，构建方才动手改；下一轮复评不参考上一轮的自报结论。
            </p>
          </div>
        </div>
        <div className="mt-3 overflow-hidden border-y border-line">
          <table className="w-full text-[11.5px]">
            <thead className="border-b border-line text-slate-500">
              <tr>
                <th className="px-2.5 py-1.5 text-left font-medium">轮次</th>
                <th className="px-2.5 py-1.5 text-left font-medium">冻结分数</th>
                <th className="px-2.5 py-1.5 text-left font-medium">真实回归</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-slate-600">
              {ROUNDS.map((row) => (
                <tr key={row.no}>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">{row.no}</td>
                  <td className="px-2.5 py-1.5">{row.score}</td>
                  <td className="px-2.5 py-1.5 font-mono">{row.test}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2.5 break-words text-[11px] leading-5 text-slate-400">
          证据文件随交付包一起给出（autoeval/）：RUBRIC.md、snapshot.json、round-1…10-evaluation.json、test56-live-round5…18.log、ui-round10/ui-mobile-check.log（375px 与 1440px 各 15 页实测）、ics-round10/ics-download-check.log（浏览器内真实下载并校验 .ics）。测试用例的三处期望值修订（C02/C03/C06）都带修订记录与官网证据，不做静默改分；按原始期望值同一次跑分为 53/56，这一点也写在评价文件里。
        </p>
      </section>
    </div>
  );
}

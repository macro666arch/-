import Link from "next/link";
import {
  BellRing,
  ClipboardCheck,
  ListChecks,
  RotateCcw,
  Search,
} from "lucide-react";
import { GapAlert } from "@/components/SourceCard";
import { contacts } from "@/lib/mock/contacts";
import { processes } from "@/lib/mock/processes";
import { notices } from "@/lib/mock/notices";
import { policies } from "@/lib/mock/policies";
import { serviceHours } from "@/lib/mock/calendar";
import { SYSTEM_PROMPT, PROMPT_RULE_MAP } from "@/lib/systemPrompt";

export const metadata = {
  title: "关于这个项目 · 中传校园信息助手",
  description: "从可信问答到可执行办事卡：项目动机、办事闭环、设计原则与边界。",
};

const gapTotal = [
  ...contacts,
  ...processes,
  ...notices,
  ...policies,
  ...serviceHours,
].reduce((n, x: any) => n + (x.gaps?.length ?? 0), 0);

const conflictCount = contacts.filter((c) => c.conflict_flag).length;

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      {/* ---------- 标题 ---------- */}
      <header className="mb-10">
        <div className="chip chip-warn mb-3">项目说明</div>
        <h1 className="text-[28px] font-bold leading-tight text-slate-900">
          我们不只回答「怎么办」
          <br />
          还把官方信息变成<span className="text-cuc-600">能完成的办事卡</span>
        </h1>
        <p className="mt-4 text-[15px] leading-7 text-slate-600">
          中传校园信息助手处理的是校园事务的完整路径：
          <strong className="text-slate-800">查信息、判断可信度、整理行动步骤、提醒截止、错过补救</strong>。
          它首先要求答案有官方依据，然后继续把答案变成用户可以每天执行的清单。
        </p>
      </header>

      {/* ---------- 问题 ---------- */}
      <Section title="我们要解决的问题">
        <p>
          新生遇到的第一类困难，往往不是「不知道去哪办」，而是网上到处都是答案，
          <strong>却没人告诉你哪个是现行的、哪个已经过期了</strong>。
        </p>
        <p className="mt-3">我们在调研中实际遇到的情况：</p>
        <ul className="mt-3 space-y-2">
          <li>
            · 同一个号码（学籍管理科）在教务处和信息化处两个官方页面上
            <strong className="text-state-warn">不一样</strong>
          </li>
          <li>
            · 同一份《学籍管理规定》新旧两版<strong className="text-state-warn">同时挂在官网上</strong>
            ，旧版没下线也没标废止
          </li>
          <li>
            · 官方流程步骤编号从 <span className="kd">1→2→3→5</span>，
            <strong className="text-state-warn">第 4 步凭空消失</strong>
          </li>
          <li>
            · 通知里挂着「申请表.docx」，下载下来是<strong className="text-state-warn">空白文档</strong>
          </li>
          <li>
            · 通知写「逾期不再补选」，但<strong className="text-state-warn">一个字都没提截止到哪天</strong>
          </li>
        </ul>
        <p className="mt-4">
          这些问题不是我们编的，每一条都能在 <span className="kd">cuc.edu.cn</span> 上复现。
          目前我们一共标注了 <strong>{gapTotal}</strong> 处这类官方信息缺陷，
          其中 <strong>{conflictCount}</strong> 处是直接的相互矛盾。
        </p>
      </Section>

      {/* ---------- 办事闭环 ---------- */}
      <Section title="从一条答案，到真正办成一件事">
        <p>
          普通校园问答停在「给你一段话」。但学生真正需要的是知道
          <strong>什么时候截止、还缺什么材料、下一步找谁、错过以后怎么办</strong>。
          因此系统把同一份官方信息拆成五个连续动作：
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-5">
          {[
            { icon: Search, step: "01", title: "查信息", desc: "官方通知、流程、部门与电话" },
            { icon: ListChecks, step: "02", title: "生成办事卡", desc: "截止、材料、步骤与入口分层" },
            { icon: ClipboardCheck, step: "03", title: "加入任务", desc: "账号同步，逐项勾选" },
            { icon: BellRing, step: "04", title: "临期提醒", desc: "复制到微信/飞书或下载日历" },
            { icon: RotateCcw, step: "05", title: "错过补救", desc: "给官方候补或人工核实路径" },
          ].map(({ icon: Icon, step, title, desc }) => (
            <div key={step} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between">
                <Icon size={14} className="text-cuc-600" />
                <span className="font-mono text-[10px] text-slate-300">{step}</span>
              </div>
              <p className="mt-2 text-[12.5px] font-semibold text-slate-800">{title}</p>
              <p className="mt-1 text-[11.5px] leading-5 text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-4">
          关键不只是「生成一段清单」。系统会区分
          <strong>官网原文步骤</strong>与<strong>系统整理步骤</strong>，
          在原文没有日期、电话或材料时直接标出缺口，并把“已截止”转换成可核实的补救路径。
          登录后任务按账号隔离同步，不读取个人日历；未登录或后端暂不可用时可保存在当前浏览器并手动导入。
        </p>
      </Section>

      {/* ---------- 三态 ---------- */}
      <Section title="可信底座：三态判定">
        <p>
          普通问答只有「答了 / 没答」两种结果，而且倾向于无论如何都答一点。
          我们把输出强制分成三种，并且
          <strong>每种都有可检验的硬性要求</strong>：
        </p>
        <div className="mt-4 space-y-3">
          <StateRow
            cls="ok"
            name="有依据"
            en="answered"
            rule="必须附至少 1 条官方来源链接，且域名在白名单内"
            desc="知识库里有官方原文支撑，直接给答案 + 来源。"
          />
          <StateRow
            cls="warn"
            name="信息冲突"
            en="conflict"
            rule="必须并列呈现 ≥2 个相互矛盾的说法，不得二选一"
            desc="官方自己说法不一致。我们把两边都摆出来，并说明疑点在哪。"
          />
          <StateRow
            cls="stop"
            name="无法确认"
            en="unconfirmed"
            rule="必须给出核实渠道（部门 + 电话），不能只说「不知道」"
            desc="没有可用依据。不推测、不估算、不给「大概是」。"
          />
        </div>
        <p className="mt-4">
          第三条最容易做错。只说「不知道」是把问题原样推回给用户，
          所以我们要求：
          <strong>拒答的同时必须告诉你去哪儿问</strong>。
        </p>
      </Section>

      {/* ---------- 系统提示词 ---------- */}
      <Section title="系统提示词（原文，可逐条对照）">
        <p>
          下面的提示词直接来自《技术规格》§2，站点运行时读的是
          <span className="kd"> src/lib/systemPrompt.ts</span> 里的同一个常量——
          <strong>文档里的、代码里的、页面上的是同一份</strong>，不会漂移。
        </p>
        <details className="mt-4 rounded-lg border border-slate-200 bg-slate-50">
          <summary className="cursor-pointer select-none px-4 py-3 text-[13.5px] font-medium text-cuc-700">
            展开查看完整系统提示词
          </summary>
          <pre className="max-h-[420px] overflow-auto border-t border-slate-200 bg-white px-4 py-3 text-[12px] leading-6 text-slate-700 whitespace-pre-wrap">
            {SYSTEM_PROMPT}
          </pre>
        </details>

        <p className="mt-5 mb-2 text-[13.5px] font-semibold text-slate-800">
          每条规则在代码里的落点（答辩可逐条验证）
        </p>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-[12.5px]">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">提示词规则</th>
                <th className="px-3 py-2 font-medium">实现位置</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {PROMPT_RULE_MAP.map((r) => (
                <tr key={r.rule}>
                  <td className="w-[34%] px-3 py-2 align-top font-medium text-slate-700">{r.rule}</td>
                  <td className="px-3 py-2 align-top leading-6 text-slate-600">{r.where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12.5px] text-slate-500">
          提示词是「要求」，测试是「验证要求有没有落地」——两者缺一，答辩时都会被追问。
        </p>
      </Section>

      {/* ---------- 设计原则 ---------- */}
      <Section title="五条设计原则">
        <ol className="space-y-4">
          <Principle n={1} t="没有来源的数字，一个都不说">
            电话、金额、天数、期限、身高门槛、学分数量——凡是具体数值，
            必须能指回一个官方页面，否则一律标「原文未写明」。
          </Principle>
          <Principle n={2} t="官方自相矛盾时，不替它裁决">
            两个页面号码不一样，我们不猜哪个对，而是并列呈现 + 指出差异在哪一位，
            再给一个「先打哪个」的实用建议。
          </Principle>
          <Principle n={3} t="把「附件存在」和「材料可用」分开">
            官网挂着文件名≠材料能下载。附件是空壳时，
            我们说「只知道表格名称，不知道表里要填什么」，
            而不是因为标题存在就回答「材料已提供」。
          </Principle>
          <Principle n={4} t="学生经验和官方规定分层">
            「学长说学籍证明要跑三个部门」这类内容我们照样收录，
            但会明确标注为
            <span className="kd">学生社区线索</span>，
            并在官方页面能证伪时直接说明它已经不准了。
          </Principle>
          <Principle n={5} t="边界写在明面上">
            个人成绩、课表、审批进度、宿舍分配结果——这些需要登录个人系统的信息
            明确不覆盖，也不假装能查。其他学校的政策同样不答。
          </Principle>
        </ol>
      </Section>

      {/* ---------- 数据来源 ---------- */}
      <Section title="数据来源">
        <p>全部数据来自中国传媒大学官方公开页面，不含任何非公开信息，也不含个人数据。</p>
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-[13px]">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">来源</th>
                <th className="px-3 py-2 font-medium">网址</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {[
                ["学生工作部", "xsc.cuc.edu.cn"],
                ["教务处", "jwc.cuc.edu.cn"],
                ["信息化处", "its.cuc.edu.cn"],
                ["后勤保障处", "hq.cuc.edu.cn"],
                ["学校主页", "cuc.edu.cn"],
                ["四六级报名（外部官方）", "cet-bm.neea.edu.cn"],
              ].map(([n, u]) => (
                <tr key={u}>
                  <td className="px-3 py-2 text-slate-700">{n}</td>
                  <td className="px-3 py-2 font-mono text-[12px] text-cuc-700">{u}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[13px] text-slate-500">
          每条记录都保留了 <span className="kd">source_url</span> 与{" "}
          <span className="kd">last_verified_at</span>，可逐条回溯核对。
        </p>
      </Section>

      {/* ---------- 边界 ---------- */}
      <Section title="明确的边界">
        <GapAlert
          title="这个系统做不到什么"
          gaps={[
            "不覆盖需要登录个人系统的信息（成绩、课表、审批进度、宿舍分配）",
            "不回答其他学校、其他机构的政策",
            "不代办任何手续，不能代替本人提交申请或签字",
            "不预测未来政策（如学费调整、下一年名额）",
            "数据为阶段性快照，官方改版后需重新核验",
          ]}
        />
      </Section>

      {/* ---------- 免责 ---------- */}
      <Section title="使用提醒">
        <p>
          本系统的定位是<strong>减少你查信息的时间</strong>，不替代官方渠道。
          涉及学籍、处分、毕业、奖助学金等重大事项，
          请以主管部门的正式答复为准。
        </p>
        <p className="mt-3 text-[13px] text-slate-500">
          本项目为校园智能体设计大赛参赛作品，非学校官方产品。
        </p>
      </Section>

      {/* ---------- CTA ---------- */}
      <div className="mt-10 flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-slate-50 p-5">
        <Link href="/chat" className="btn-primary">
          去生成办事卡
        </Link>
        <Link href="/tasks" className="btn-ghost">
          打开我的任务
        </Link>
        <Link href="/test" className="btn-ghost">
          看 56 题测试结果
        </Link>
      </div>
    </div>
  );
}

/* ---------------- 局部组件 ---------------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-9">
      <h2 className="mb-3 border-l-[3px] border-cuc-500 pl-3 text-[19px] font-bold text-slate-900">
        {title}
      </h2>
      <div className="text-[14.5px] leading-7 text-slate-700">{children}</div>
    </section>
  );
}

function StateRow({
  cls,
  name,
  en,
  rule,
  desc,
}: {
  cls: "ok" | "warn" | "stop";
  name: string;
  en: string;
  rule: string;
  desc: string;
}) {
  const map = {
    ok: { bg: "bg-state-okBg", bd: "border-state-okBorder", txt: "text-state-ok", dot: "bg-state-ok" },
    warn: { bg: "bg-state-warnBg", bd: "border-state-warnBorder", txt: "text-state-warn", dot: "bg-state-warn" },
    stop: { bg: "bg-state-stopBg", bd: "border-state-stopBorder", txt: "text-state-stop", dot: "bg-state-stop" },
  }[cls];
  return (
    <div className={`rounded-lg border ${map.bd} ${map.bg} p-3.5`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${map.dot}`} />
        <span className={`text-[14px] font-bold ${map.txt}`}>{name}</span>
        <span className="font-mono text-[11px] text-slate-400">{en}</span>
      </div>
      <p className="mt-1.5 text-[13px] leading-6 text-slate-700">{desc}</p>
      <p className="mt-1.5 text-[12px] leading-5 text-slate-500">
        <span className="font-medium">硬性要求：</span>
        {rule}
      </p>
    </div>
  );
}

function Principle({ n, t, children }: { n: number; t: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cuc-500 text-[12px] font-bold text-white">
        {n}
      </span>
      <div>
        <p className="font-semibold text-slate-900">{t}</p>
        <p className="mt-1 text-[13.5px] leading-6 text-slate-600">{children}</p>
      </div>
    </li>
  );
}

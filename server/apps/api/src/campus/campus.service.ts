import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Calendar } from '../common/entities/calendar.entity';
import { Contact } from '../common/entities/contact.entity';
import { Faq } from '../common/entities/faq.entity';
import { Notice } from '../common/entities/notice.entity';
import { Policy } from '../common/entities/policy.entity';
import { Process } from '../common/entities/process.entity';
import { ServiceHours } from '../common/entities/service-hours.entity';
import { AgentService } from '../agent/agent.service';
import {
  assessFreshness,
  FreshnessRecord,
  withPublicFreshness,
} from '../common/freshness.util';
import { markLlmFailure, markLlmOk, shouldSkipLlm } from '../common/llm-health';
import { RagService } from '../rag/rag.service';
import {
  buildActionCard,
  buildEvidence,
  buildTaskSuggestion,
  decidePlannerResult,
  fallbackStructuredAnswer,
  inferIntent,
  PipelineStage,
  RetrievalRow,
  snippetAround,
} from './campus-planner';

// 官方来源白名单（与 cases.ts OFFICIAL_HOSTS 同一口径）：只有落在这些域的链接
// 才能作为「有依据」的 sources，转载站/news.sohu 之类一律剔除。
const OFFICIAL_HOSTS = [
  'cuc.edu.cn',
  'cet-bm.neea.edu.cn',
  'chsi.com.cn',
];

function isOfficialUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (!/^https?:\/\//i.test(url.trim())) return false;
  try {
    const host = new URL(url.trim()).hostname;
    return OFFICIAL_HOSTS.some((x) => host === x || host.endsWith('.' + x));
  } catch {
    return false;
  }
}

interface QuerySpec {
  type: RetrievalRow['type'];
  sql: string;
}

interface ChatContextTurn {
  question?: string;
  answer?: string;
}

interface ChatContext {
  topic?: string;
  previous_question?: string;
  turn?: number;
  history?: ChatContextTurn[];
}

interface RetrievalFailure {
  type: string;
  message: string;
}

@Injectable()
export class CampusService {
  private readonly logger = new Logger(CampusService.name);

  constructor(
    @InjectRepository(Notice) private noticeRepo: Repository<Notice>,
    @InjectRepository(Contact) private contactRepo: Repository<Contact>,
    @InjectRepository(Faq) private faqRepo: Repository<Faq>,
    @InjectRepository(Process) private processRepo: Repository<Process>,
    @InjectRepository(Calendar) private calendarRepo: Repository<Calendar>,
    @InjectRepository(ServiceHours) private serviceHoursRepo: Repository<ServiceHours>,
    @InjectRepository(Policy) private policyRepo: Repository<Policy>,
    private ragService: RagService,
    private agentService: AgentService,
  ) {}

  private withFreshness<T extends FreshnessRecord>(items: T[]) {
    return items.map((item) => withPublicFreshness(item));
  }

  // ===== 列表接口 =====
  async getNotices(query: {
    status?: string;
    channel?: string;
    keyword?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (query.status) where.noticeStatus = query.status;
    if (query.channel) where.channel = query.channel;
    if (query.keyword) where.noticeName = ILike(`%${query.keyword}%`);
    const [items, total] = await this.noticeRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take: query.limit ?? 50,
      skip: query.offset ?? 0,
    });
    return { items: this.withFreshness(items), total };
  }

  async getContacts(keyword?: string) {
    const where = keyword ? { businessName: ILike(`%${keyword}%`) } : {};
    const [items, total] = await this.contactRepo.findAndCount({
      where,
      order: { createdAt: 'ASC' },
    });
    return { items: this.withFreshness(items), total };
  }

  async getFaqs() {
    const [items, total] = await this.faqRepo.findAndCount({
      order: { createdAt: 'ASC' },
    });
    return { items: this.withFreshness(items), total };
  }

  async getPolicies() {
    const [items, total] = await this.policyRepo.findAndCount({
      order: { createdAt: 'ASC' },
    });
    return { items: this.withFreshness(items), total };
  }

  async getProcesses() {
    const [items, total] = await this.processRepo.findAndCount({
      order: { createdAt: 'ASC' },
    });
    const contacts = await this.contactRepo.find();
    return {
      items: this.withFreshness(
        items.map((item) => this.enrichProcess(item, contacts)),
      ),
      total,
    };
  }

  async getProcess(id: string) {
    const item = await this.processRepo.findOne({ where: { id } });
    if (!item) return null;
    const contacts = await this.contactRepo.find();
    return withPublicFreshness(this.enrichProcess(item, contacts));
  }

  private enrichProcess(process: Process, contacts: Contact[]) {
    const haystack = [
      process.processName,
      process.applicableTo,
      process.deptId,
      process.requiredMaterials?.join(' '),
    ]
      .filter(Boolean)
      .join(' ');
    const contact = contacts
      .map((candidate) => {
        let score = 0;
        for (const keyword of candidate.routeKeywords ?? []) {
          if (keyword.length >= 2 && haystack.includes(keyword)) score += keyword.length;
        }
        if (candidate.businessName && haystack.includes(candidate.businessName)) {
          score += candidate.businessName.length;
        }
        if (candidate.deptName && haystack.includes(candidate.deptName)) {
          score += candidate.deptName.length;
        }
        return { candidate, score };
      })
      .sort((a, b) => b.score - a.score)[0];
    const matched = contact?.score > 0 ? contact.candidate : undefined;

    const gaps: string[] = [];
    const stepNumbers = (process.steps ?? [])
      .map((step) => Number(step.step_no))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);
    for (let index = 1; index < stepNumbers.length; index++) {
      if (stepNumbers[index] - stepNumbers[index - 1] > 1) {
        gaps.push(
          `官方步骤编号 ${stepNumbers[index - 1]}→${stepNumbers[index]}，中间步骤缺失。`,
        );
      }
    }
    if (!process.locationId && !matched?.locationId) {
      gaps.push('办理地点未在结构化原文中明确。');
    }
    if (matched?.conflictFlag) {
      gaps.push('联系号码在不同官方页面存在冲突，需电话确认。');
    }

    return {
      ...process,
      deptName: process.deptId || matched?.deptName || null,
      locationName: process.locationId || matched?.locationId || null,
      phone: matched?.phone || null,
      officeHours: matched?.officeHours || null,
      entryStatus: process.entryUrl ? '待核实' : null,
      category: this.guessCategory(process.processName),
      gaps,
      gapSummary: gaps[0] || null,
    };
  }

  private guessCategory(name: string): string {
    if (/学籍|休学|复学|转专业|学生证/.test(name)) return '学籍';
    if (/资助|贷款|助学金|困难/.test(name)) return '资助';
    if (/宿舍|床|报修/.test(name)) return '后勤';
    if (/心理/.test(name)) return '心理';
    return '校园事务';
  }

  async getCalendar() {
    // 契约 §2.4 + 前端 api.ts:fetchCalendar 约定：GET /api/calendar 返回单个 CalendarWire 对象。
    // 前端只兼容「单对象」或「数组」，不吃 {items}——改数组会让 normalizeCalendar 把 {items,total}
    // 当成一个对象，academic_year / term_start 全丢成 null（乙实测确认）。
    const items = await this.calendarRepo.find({
      order: { createdAt: 'DESC' },
      take: 1,
    });
    return items[0] ? withPublicFreshness(items[0]) : {};
  }

  async getServiceHours() {
    const [items, total] = await this.serviceHoursRepo.findAndCount({
      order: { createdAt: 'ASC' },
    });
    const rows = items.map((r) => ({
      ...r,
      businessName: r.businessId ?? null,
      locationName: null,
      isTbd: /未公开|未公布|另行通知|待核实|需电话确认/.test(
        `${r.timeSlot ?? ''}${r.note ?? ''}`,
      ),
    }));
    return { items: this.withFreshness(rows), total };
  }

  // ===== JSON 问答：结构化检索 -> 确定性核验 -> 行动卡 =====
  async chatJson(question: string, context?: ChatContext) {
    const startedAt = Date.now();
    const sanitized = question.trim();
    const retrievalStartedAt = Date.now();

    // ========== P0：out-of-scope 预判 ==========
    // 问题属于"校园办事"范畴才进入检索。完全越界（校外生活 / 价格预测 / 闲聊 / 身份确认）
    // 直接返回 unconfirmed + 核实渠道，避免语义检索对无关条目产生噪声命中。
    const outOfScopeKeywordSets: Array<[string[], string]> = [
      [['学费涨', '学费会涨', '明年学费', '今年学费', '房价', '股票', '基金', '彩票', '收益率'], '收费标准与未来价格不在校园办事覆盖范围。'],
      [['你是谁', '你是chatgpt', '你是 ChatGPT', '你懂什么', '你是AI', '你是 AI', '你是豆包'], '我是中传校园办事助手，可以查校园流程、材料、部门电话、校历和截止时间。'],
      // 隐私边界：个人数据（本人成绩/课表/学号）不接入任何个人账号体系
      [['我的绩点', '我的成绩', '我的课表', '我的学分', '我的学号', '查一下我的'], '个人成绩与课表属于个人数据，本助手不接入个人账号，无法查询。请登录教务系统或联系所在学院教学秘书。'],
      // 能力边界：只查信息不代办
      [['代办', '替我办', '帮我办', '帮我去'], '我只能查询办事信息，不能替您办理，请携带相关材料到主管部门窗口办理。'],
      // 范围守卫：只回答中传
      [['北京大学', '清华大学', '北大', '清华', '复旦', '交大', '浙大', '南大', '哈佛', 'MIT', '剑桥', '牛津'], '我仅提供中国传媒大学校园办事信息，其他学校政策请咨询对应学校官方渠道。'],
      // 校外生活推荐（餐饮/娱乐）不属于校园办事，避免被检索到食堂条目后当成可答内容
      [['附近哪家', '附近有', '火锅', '好吃', '外卖', '奶茶', '餐馆', '电影院', '哪家好'], '我提供校园办事信息，校外餐饮娱乐推荐不在覆盖范围，建议使用生活类应用查询。'],
      // 食堂每日菜单没有官方结构化数据，直接给核实渠道，避免拿食堂电话/指南硬答
      [['食堂有什么菜', '今天食堂', '食堂吃什么', '今日菜谱', '菜谱', '菜单'], '食堂每日菜单不在知识库覆盖范围，建议查看食堂现场公示或咨询后勤保障处。'],
    ];
    const hitScope = outOfScopeKeywordSets.find(([kws]) =>
      kws.some((kw) => sanitized.includes(kw)),
    );
    if (hitScope) {
      const outElapsed = Date.now() - startedAt;
      const emptyRows: RetrievalRow[] = [];
      return {
        status: 'unconfirmed',
        answer: hitScope[1],
        sources: [],
        notice: '问题超出校园办事助手覆盖范围。',
        conflicts: undefined,
        verify_channels: [{ name: '中国传媒大学本科生院 / 教务处', url: 'http://jwc.cuc.edu.cn/' }],
        refs: [],
        follow_ups: [],
        action_card: null,
        missing_fields: ['问题不在办事范畴'],
        engine: 'structured-rules',
        elapsed_ms: outElapsed,
        retrieval_mode: 'out-of-scope',
        tables_queried: 0,
        tables_failed: 0,
        pipeline: [
          {
            id: 'retrieval', label: '结构化检索', agent: '检索 Agent',
            status: 'ok', detail: '问题超出校园办事范畴，跳过检索。',
            input_summary: sanitized, output_summary: '0 条候选资料',
            handoff: '直接进入规划阶段', elapsed_ms: 0,
          },
          {
            id: 'verification', label: '证据核验', agent: '核验 Agent',
            status: 'ok', detail: 'out-of-scope 预判命中，直接判定无法确认。',
            input_summary: '问题关键词', output_summary: '无法确认（越界）',
            handoff: '保留核实渠道', elapsed_ms: 0,
          },
          {
            id: 'planning', label: '行动规划', agent: '规划 Agent',
            status: 'degraded', detail: '未生成办事卡，已保留核实渠道。',
            input_summary: '越界问题', output_summary: '核实渠道', elapsed_ms: 0,
          },
        ],
      };
    }

    const embeddingResult = await this.ragService.tryGenerateEmbedding(sanitized);
    const embedding = embeddingResult.embedding;
    const embStr = embedding ? `[${embedding.join(',')}]` : null;

    const specs: QuerySpec[] = [
      {
        type: 'process',
        sql: `SELECT 'process' AS type, p.id::text AS id,
                     p.process_name AS title, p.source_url AS url,
                     (p.process_name || ' ' || COALESCE(p.applicable_to,'') || ' ' ||
                      COALESCE(p.conditions::text,'') || ' ' ||
                      COALESCE(p.required_materials::text,'') || ' ' ||
                      COALESCE(p.steps::text,'') || ' ' || COALESCE(p.dept_id,'') || ' ' ||
                      COALESCE(p.location_id,'') || ' ' || COALESCE(p.service_hours,'') || ' ' ||
                      COALESCE(p.deadline,'') || ' ' || COALESCE(p.remedy,'')) AS content,
                     (to_jsonb(p) - 'embedding') AS record,
                     CASE WHEN $1::text IS NULL THEN NULL ELSE p.embedding <=> $1::vector END AS distance
                FROM processes p
               WHERE p.embedding IS NOT NULL OR $1::text IS NULL`,
      },
      {
        type: 'contact',
        sql: `SELECT 'contact' AS type, c.id::text AS id,
                     c.business_name AS title, c.source_url AS url,
                     (c.business_name || ' ' || c.dept_name || ' ' || COALESCE(c.phone,'') || ' ' ||
                      COALESCE(c.location_id,'') || ' ' || COALESCE(c.office_hours,'') || ' ' ||
                      COALESCE(c.applicable_to,'') || ' ' || COALESCE(c.route_keywords::text,'') || ' ' ||
                      COALESCE(c.history_phones::text,'')) AS content,
                     (to_jsonb(c) - 'embedding') AS record,
                     CASE WHEN $1::text IS NULL THEN NULL ELSE c.embedding <=> $1::vector END AS distance
                FROM contacts c
               WHERE c.embedding IS NOT NULL OR $1::text IS NULL`,
      },
      {
        type: 'notice',
        sql: `SELECT 'notice' AS type, n.id::text AS id,
                     n.notice_name AS title, n.source_url AS url,
                     (n.notice_name || ' ' || COALESCE(n.applicable_to,'') || ' ' ||
                      COALESCE(n.deadline,'') || ' ' || COALESCE(n.body_content,'') || ' ' ||
                      COALESCE(n.extracted_fields::text,'') || ' ' || COALESCE(n.attachments::text,'') || ' ' ||
                      COALESCE(n.external_links::text,'')) AS content,
                     (to_jsonb(n) - 'embedding') AS record,
                     CASE WHEN $1::text IS NULL THEN NULL ELSE n.embedding <=> $1::vector END AS distance
                FROM notices n
               WHERE n.embedding IS NOT NULL OR $1::text IS NULL`,
      },
      {
        type: 'calendar',
        sql: `SELECT 'calendar' AS type, c.id::text AS id,
                     c.academic_year AS title, c.source_url AS url,
                     (c.academic_year || ' ' || c.semester || ' ' || COALESCE(c.term_start,'') || ' ' ||
                      COALESCE(c.term_end,'') || ' 教学周:' || COALESCE(c.teaching_weeks::text,'') ||
                      ' 考试周:' || COALESCE(c.exam_weeks::text,'') ||
                      ' ' || COALESCE(c.holidays::text,'') || ' ' || COALESCE(c.key_dates::text,'')) AS content,
                     (to_jsonb(c) - 'embedding') AS record,
                     CASE WHEN $1::text IS NULL THEN NULL ELSE c.embedding <=> $1::vector END AS distance
                FROM calendars c
               WHERE c.embedding IS NOT NULL OR $1::text IS NULL`,
      },
      {
        type: 'faq',
        sql: `SELECT 'faq' AS type, f.id::text AS id,
                     f.question AS title, f.source_url AS url,
                     (f.question || ' ' || COALESCE(f.category,'') || ' ' ||
                      COALESCE(f.answer_ref,'') || ' ' || COALESCE(f.synonym_questions::text,'')) AS content,
                     (to_jsonb(f) - 'embedding') AS record,
                     CASE WHEN $1::text IS NULL THEN NULL ELSE f.embedding <=> $1::vector END AS distance
                FROM faqs f
               WHERE f.embedding IS NOT NULL OR $1::text IS NULL`,
      },
      {
        type: 'policy',
        sql: `SELECT 'policy' AS type, p.id::text AS id,
                     p.policy_name AS title, p.source_url AS url,
                     (p.policy_name || ' ' || COALESCE(p.doc_no,'') || ' ' ||
                      COALESCE(p.applicable_to,'') || ' ' || COALESCE(p.content,'')) AS content,
                     (to_jsonb(p) - 'embedding') AS record,
                     CASE WHEN $1::text IS NULL THEN NULL ELSE p.embedding <=> $1::vector END AS distance
                FROM policies p
               WHERE p.embedding IS NOT NULL OR $1::text IS NULL`,
      },
      {
        type: 'service_hour',
        sql: `SELECT 'service_hour' AS type, s.id::text AS id,
                     COALESCE(s.business_id,'服务时间') AS title, s.source_url AS url,
                     (COALESCE(s.business_id,'') || ' ' || COALESCE(s.open_days,'') || ' ' ||
                      COALESCE(s.time_slot,'') || ' ' || COALESCE(s.note,'')) AS content,
                     (to_jsonb(s) - 'embedding') AS record,
                     CASE WHEN $1::text IS NULL THEN NULL ELSE s.embedding <=> $1::vector END AS distance
                FROM service_hours s
               WHERE s.embedding IS NOT NULL OR $1::text IS NULL`,
      },
      {
        type: 'material',
        sql: `SELECT 'material' AS type, m.id::text AS id,
                     m.material_name AS title, m.source_url AS url,
                     (m.material_name || ' ' || COALESCE(m.applicable_to,'') || ' ' ||
                      COALESCE(m.spec::text,'') || ' ' || COALESCE(m.download_url,'')) AS content,
                     (to_jsonb(m) - 'embedding') AS record,
                     CASE WHEN $1::text IS NULL THEN NULL ELSE m.embedding <=> $1::vector END AS distance
                FROM materials m
               WHERE m.embedding IS NOT NULL OR $1::text IS NULL`,
      },
    ];

    const rows: RetrievalRow[] = [];
    const failures: RetrievalFailure[] = [];
    for (const spec of specs) {
      try {
        const result = await this.noticeRepo.query(spec.sql, [embStr]);
        for (const row of result) {
          const record = this.parseRecord(row.record);
          const distance =
            row.distance == null ? null : Number.parseFloat(String(row.distance));
          const lexicalScore = this.lexicalScore(
            sanitized,
            `${row.title ?? ''} ${row.content ?? ''}`,
          );
          const semanticScore =
            distance != null && Number.isFinite(distance)
              ? Math.max(0, 1 - distance)
              : 0;
          rows.push({
            type: spec.type,
            id: String(row.id),
            title: String(row.title ?? '未命名资料'),
            url: row.url ?? record.source_url ?? null,
            content: String(row.content ?? ''),
            record,
            distance,
            lexical_score: lexicalScore,
            score: embedding
              ? semanticScore + lexicalScore * 0.45
              : lexicalScore,
          });
        }
      } catch (error) {
        failures.push({
          type: spec.type,
          message: (error as Error).message,
        });
        this.logger.warn(
          `Structured retrieval failed for ${spec.type}: ${(error as Error).message}`,
        );
      }
    }

    const relevant = rows
      .filter((row) => {
        if (embedding) {
          return (
            (row.distance != null && row.distance <= 0.58) ||
            (row.lexical_score ?? 0) >= 0.12
          );
        }
        return (row.lexical_score ?? 0) >= 0.08;
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 12);

    // ========== P1a：来源相关性过滤 + BAD host 剔除 ==========
    // 对每条候选条目，先剔除 source_url 非合法 http(s) 的（"官方资料未明确"/"无"占位），
    // 再计算"问题主题关键词"与"条目 title"的重叠度。通用停用词（电话/多少/怎么/什么/的/是）
    // 不足以证明相关——必须有实质主题关键词（心理/咨询/转专业/学生证/重修 等）重叠。
    const STOPWORDS = new Set([
      '电话', '多少', '怎么', '什么', '请问', '如何', '是否', '吗', '呢', '的',
      '是', '在', '有', '没', '了', '可以', '能', '要', '去', '办理',
      '申请', '流程', '手续', '条件', '材料', '地点', '时间', '原因',
      '么办', '咋办', '怎办',
    ]);
    const questionThemeBigrams = (() => {
      const q = sanitized.replace(/[，。、？！\s]+/g, '');
      const out = new Set<string>();
      for (let i = 0; i < q.length - 1; i++) {
        const bg = q.slice(i, i + 2);
        // 整词就是停用词的双字（时间/材料/申请/办理…）不算主题词。
        // 早期实现逐个字符判断，导致「时间」这类通用词被当成主题词，
        // 让《入学须知》这种含「时间」二字的长文混进「学籍证明线上打印有时间限制吗」的上下文。
        if (!STOPWORDS.has(bg) && !Array.from(bg).every((c) => STOPWORDS.has(c))) out.add(bg);
      }
      return out;
    })();
    const questionPhones: string[] = sanitized.match(/\d{7,8}/g) ?? [];
    const relevantFiltered = relevant.filter((row) => {
      // 1) 非官方 host 直接剔除（sohu/知乎/公众号转载等不能作为「有依据」来源）
      if (!isOfficialUrl(row.url ?? undefined)) return false;
      // 1b) 问题里报了号码：联系表里号码命中的条目直接放行（号码查询本就不该靠语义相似）
      if (row.type === 'contact' && questionPhones.length > 0) {
        const rowPhone = String(row.record.phone ?? '').replace(/\D/g, '');
        if (questionPhones.some((p) => rowPhone.includes(p))) return true;
      }
      // 2) 主题 bigram 必须在标题或正文里真的出现。不再用「语义分数 ≥ 0.6 即放行」兜底，
      //    否则《入学须知》这类无关长文会因为整段语义近似被带进上下文，答出别处的日期。
      const hay = `${row.title ?? ''} ${row.content ?? ''}`;
      if (questionThemeBigrams.size === 0) return (row.score ?? 0) >= 0.6;
      for (const bg of questionThemeBigrams) {
        if (bg.length === 2 && hay.includes(bg)) return true;
      }
      return false;
    });

    const intent = inferIntent(sanitized);
    // 冲突检测只看过滤后的 relevant（与 20 问口径一致）：全量候选里找冲突联系方式，
    // 会把"顺带命中带历史电话的部门"的问题误判成 conflict。
    // 另外要求冲突条目真的对得上问题所指对象，否则只是"另一个部门也有冲突号"：
    //   - 问题里报了具体号码 → 该号码必须出现在冲突条目的历史号码里（A08 一码挂两科）；
    //   - 没报号码 → 去掉通用词后的主题词必须出现在该条目的业务名/部门名里（A01 学籍管理科）。
    const GENERIC_DEPT_TERMS = [
      '报修', '电话', '联系', '咨询', '部门', '中心', '办公室', '科室',
      '多少', '哪个', '哪里', '怎么', '是什', '么时',
    ];
    const conflictContact =
      intent === 'contact'
        ? relevantFiltered.find((row) => {
            if (row.type !== 'contact') return false;
            if (row.record.conflict_flag !== true) return false;
            const history = this.parseRecord<any[]>(row.record.history_phones);
            if (!Array.isArray(history) || history.length < 2) return false;
            if (questionPhones.length > 0) {
              // 问题里报了号码：主号或历史号码里出现过该号，才算"这个号码有冲突"
              const rowPhone = String(row.record.phone ?? '').replace(/\D/g, '');
              if (questionPhones.some((p) => rowPhone.includes(p))) return true;
              return history.some((h) => questionPhones.includes(String(h.phone ?? '')));
            }
            let probe = sanitized;
            for (const term of GENERIC_DEPT_TERMS) probe = probe.split(term).join('');
            const deptHay = `${row.record.dept_name ?? ''} ${row.record.business_name ?? ''}`;
            for (let i = 0; i < probe.length - 1; i++) {
              if (deptHay.includes(probe.slice(i, i + 2))) return true;
            }
            return false;
          })
        : undefined;
    // 号码反查是确定性查询：问题里出现完整号码时，直接查联系表，
    // 同一号码登记在两个业务口（部门名不同）→ 一码挂两科，必须并列。
    let phoneConflicts:
      | Array<{ label: string; value: string; source: string; source_url: string }>
      | undefined;
    if (intent === 'contact' && questionPhones.length > 0) {
      const allContacts = await this.contactRepo.find();
      const matched = allContacts.filter((c) => {
        const digits = String(c.phone ?? '').replace(/\D/g, '');
        return questionPhones.some((q) => digits.includes(q));
      });
      const depts = new Set(
        matched.map((c) => String(c.deptName ?? c.businessName ?? '')).filter(Boolean),
      );
      if (matched.length >= 2 && depts.size >= 2) {
        phoneConflicts = matched.map((c) => {
          const src = String(c.historyPhones?.[0]?.source_url ?? c.sourceUrl ?? '');
          return {
            label: src
              ? src.replace(/^https?:\/\//, '').split('/')[0]
              : '官方通讯录',
            value: String(c.phone ?? ''),
            source: String(c.deptName ?? c.businessName ?? ''),
            source_url: src,
          };
        });
      }
    }
    const conflicts = phoneConflicts
      ? phoneConflicts
      : conflictContact
        ? this.parseRecord<any[]>(conflictContact.record.history_phones).map((history) => ({
            label: history.source_url
              ? String(history.source_url)
                  .replace(/^https?:\/\//, '')
                  .split('/')[0]
              : '官方页面',
            value: String(history.phone ?? ''),
            source: String(conflictContact.record.dept_name ?? ''),
            source_url: String(history.source_url ?? conflictContact.url ?? ''),
          }))
        : undefined;

    const materialRows = rows.filter((row) => row.type === 'material');
    const actionCard = buildActionCard(sanitized, relevantFiltered, materialRows);
    const planner = decidePlannerResult({
      question: sanitized,
      rows: relevantFiltered,
      conflicts,
      actionCard,
    });

    let answer = '';
    let engine = 'structured-rules';
    if (process.env.DEEPSEEK_API_KEY && !shouldSkipLlm()) {
      try {
        const evidence = relevantFiltered
          .map(
            (row) =>
              `[Source: ${row.type}:${row.title} | ${row.url ?? ''}]\n${snippetAround(
                row.content ?? row.title ?? '',
                sanitized,
                900,
              )}`,
          )
          .join('\n\n---\n\n');
        const agentResult = await this.agentService.answer({
          question: sanitized,
          history: context?.history,
          evidence,
          evidenceEmpty: relevantFiltered.length === 0,
        });
        if (agentResult.answer.trim()) {
          answer = agentResult.answer;
          engine = `deepseek:agent(${agentResult.toolsUsed.join(',') || 'no-tool'})`;
          markLlmOk();
        }
      } catch (error) {
        this.logger.error(`Agent 调用失败: ${(error as Error).message}`);
        markLlmFailure((error as Error).message);
      }
    }
    // 三态判定与答案措辞解耦：结构化模板是确定性的，用它来判断"官方原文有没有口径"，
    // 避免模型换一种说法（例如在给出电话后又补充"办公时间未明确"）就把 answered 抖成 unconfirmed。
    const deterministicAnswer = fallbackStructuredAnswer(
      sanitized,
      planner,
      relevantFiltered,
    );
    if (!answer.trim()) {
      answer = deterministicAnswer;
    }

    // ========== 三态判定 ==========
    // 1. 命中冲突联系方式 → conflict
    // 2. 全部命中来源超 90 天未复核 → unconfirmed
    // 3. 回答开头明确表示"无法确认" → 先判 unconfirmed，再检查下方 P1b 覆盖
    // 4. 其余 → answered
    // P1b 覆盖：当 planner 拒答但 relevantFiltered 里有"已核实+现行+关键字段齐全"的条目时，
    // 强制改判为 answered。典型场景："补办学生证要带什么"planner 说无依据，
    // 但 policies 已有学生证管理办法含办理部门、周期、工本费。
    const refusalPattern =
      /无法确认|暂时无法|未收录|无法直接查询|没有权限|无法给出确定答案|未明确|暂无对应|官方资料.{0,4}没有/;
    const allStale =
      relevantFiltered.length > 0 &&
      relevantFiltered.every((row) => assessFreshness(row.record).stale);
    const hasValidEntry = relevantFiltered.some((row) => {
      const verify = row.record.verify_status;
      const eff = row.record.effective_status;
      return verify === '已核实' && eff === '现行';
    });
    // P1b：拒答覆盖——planner 说"无法确认"但有完整官方数据时，强制 answered。
    // 门槛：不仅要有已核实现行条目，planner 的 answer 也不能是"暂时只能确认"式半拒答。
    // 典型半拒答句式：条目虽已核实但内容不覆盖问题（如"绩点怎么算"命中考核办法但不含公式）。
    const semiRefusalPattern = /暂时只能确认|暂未明确|暂未收录|未找到.{0,6}直接.{0,4}答案|当前.{0,4}未.{0,4}收录/;
    // 流程类提问（怎么开/怎么办）：只要命中条目的标题与该问题有 ≥2 个主题 bigram 重叠，
    // 就说明命中的是同一件事的官方办法，可以按结构化口径作答，不必沿用 fallback 的半拒答。
    const processAskPattern = /怎么开|怎么办|怎么办理|如何办理|需要什么材料|要什么材料|流程是/;
    const titleOverlapForProcess = relevantFiltered.some((row) => {
      const title = row.title ?? '';
      let hit = 0;
      for (const bg of questionThemeBigrams) if (title.includes(bg)) hit++;
      return hit >= 2;
    });
    const overrideByDataCompleteness =
      relevantFiltered.length > 0 &&
      hasValidEntry &&
      ((refusalPattern.test(deterministicAnswer.slice(0, 150)) &&
        !semiRefusalPattern.test(deterministicAnswer.slice(0, 150))) ||
        (processAskPattern.test(sanitized) && titleOverlapForProcess));

    // ========== P1c：字段级核对 ==========
    // 问"具体数值/日期"时，只有官方原文里真的取得到对应数值才算 answered。
    // 否则模型容易把相近文件里的其他数字当答案（把别的规定的"两年"当作休学年限）。
    const HARD_ASK_PATTERN =
      /多少钱|费用|几天|多久|多少|第几|几号|几月|哪天|什么时候|几点|身高|学分|比例|标准|年限/;
    const MISSING_FIELD_PATTERN =
      /未明确|未公布|未给出|未标注|暂无|待核实|未说明|未收录|无法确定/;
    const retrievalHay = relevantFiltered
      .map((row) => `${row.title ?? ''} ${row.content ?? ''}`)
      .join(' ');
    // 问价格/费用时，官方原文里必须真的出现金额，否则不能给出"有依据"
    const isFeeAsk = /多少钱|费用|工本费|收费/.test(sanitized);
    const hasAmountInHay = /[0-9一二三四五六七八九十]+\s*元|￥|¥/.test(retrievalHay);
    // 时间类提问：若官方原文里确实出现了日期/时刻，就不算"字段缺失"，
    // 结构化 fallback 的保守前缀不能把有日期的答案降级。
    // 「截止」类提问再收严两层：
    //   ① 命中条目的**标题**里至少要有 2 个问题主题词（正文提到贷款不等于这条通知管回执）；
    //   ② 原文必须把日期写在「截止」前后 40 字内。
    // B06 生源地贷款回执：候选里只有《助学贷款代偿管理办法》标题含「贷款」，凑不满 2 个，判无依据。
    const deadlineAsk = /截止/.test(sanitized);
    let deadlineTitleHits = 0;
    if (deadlineAsk) {
      for (const row of relevantFiltered) {
        const title = row.title ?? '';
        let hit = 0;
        for (const bg of questionThemeBigrams) {
          if (bg.length === 2 && title.includes(bg)) hit++;
        }
        if (hit > deadlineTitleHits) deadlineTitleHits = hit;
      }
    }
    const groundedDeadline =
      deadlineAsk &&
      deadlineTitleHits >= 2 &&
      /截止[^。；]{0,40}(?:\d{1,2}\s*月\s*\d{1,2}\s*日|\d{1,2}:\d{2})|(?:\d{1,2}\s*月\s*\d{1,2}\s*日)[^。；]{0,40}截止/.test(
        retrievalHay,
      );
    // 校历类资料用「周次」而不是日历日，所以「第几周」也要认 周 为落地依据。
    // 但「这学期第几周了」这类问"现在是第几周"的，要靠今天的日期换算，资料里没有，不能豁免。
    const currentTimeAsk = /这学期|现在|当前|本周|今天是|目前/.test(sanitized);
    const weekGrounded = /第[0-9一二三四五六七八九十]{1,2}\s*周|\d{1,2}\s*周/.test(retrievalHay);
    const groundedDateForAsk =
      !currentTimeAsk &&
      /什么时候|几号|几月|哪天|几点|第几/.test(sanitized) &&
      (/\d{1,2}\s*月\s*\d{1,2}\s*日|\d{1,2}:\d{2}/.test(retrievalHay) || weekGrounded) &&
      (!deadlineAsk || groundedDeadline);
    const halfRefusalForSpecificAsk =
      HARD_ASK_PATTERN.test(sanitized) &&
      semiRefusalPattern.test(deterministicAnswer) &&
      intent !== 'contact' &&
      !groundedDateForAsk;
    // 联系方式类问题不走"字段缺失"降级：号码本身就是答案，模板里出现"未明确（地点/办公时间）"
    // 不等于号码缺失，否则同一问题会在 answered/unconfirmed 之间抖动。
    const unconfirmedByMissingField =
      (HARD_ASK_PATTERN.test(sanitized) &&
        MISSING_FIELD_PATTERN.test(deterministicAnswer) &&
        intent !== 'contact' &&
        !groundedDateForAsk) ||
      halfRefusalForSpecificAsk ||
      (isFeeAsk && !hasAmountInHay);
    // 纯联系方式查询：检索结果必须有 contact 条目，否则视为该号码未收录。
    // 带办理动作的（"我要办…打哪个电话"）不适用——号码可能写在办事指南里。
    const contactLookupOnly =
      /电话|联系方式|号码/.test(sanitized) &&
      !/办理|补办|申请|流程|材料|怎么开|需要什么/.test(sanitized);
    const unconfirmedByMissingContact =
      contactLookupOnly && !relevantFiltered.some((row) => row.type === 'contact');
    // 材料清单类提问：命中的若只是「管理办法」正文或附件空壳（没有办事流程条目），
    // 原文里也没有「提交/提供/携带…材料」这类清单句式，就不能算材料已给出。
    const materialAsk = /要交什么材料|需要什么材料|准备什么材料|要准备什么|材料清单|带什么材料/.test(
      sanitized,
    );
    const hasProcessRow = relevantFiltered.some((row) => row.type === 'process');
    const materialListed =
      /(提交|提供|携带|准备|出具)[^。；]{0,40}(材料|证明|证件|表格|复印件)|材料清单|所需材料/.test(
        retrievalHay,
      );
    const unconfirmedByMissingMaterial = materialAsk && !hasProcessRow && !materialListed;

    let finalStatus: 'answered' | 'conflict' | 'unconfirmed';
    let notice: string;
    if (conflicts) {
      finalStatus = 'conflict';
      notice = '发现官方信息存在冲突，请向主管部门进一步核实。';
    } else if (relevantFiltered.length === 0) {
      finalStatus = 'unconfirmed';
      notice = planner.notice;
    } else if (allStale) {
      finalStatus = 'unconfirmed';
      notice =
        '检索到的官方依据均已超过 90 天未复核，信息可能已变化，建议向主管部门核实后再办理。';
    } else if (
      unconfirmedByMissingField ||
      unconfirmedByMissingContact ||
      unconfirmedByMissingMaterial
    ) {
      finalStatus = 'unconfirmed';
      notice = unconfirmedByMissingContact
        ? '知识库中未收录该联系方式。'
        : unconfirmedByMissingMaterial
          ? '官方原文未列出材料清单（相关附件正文不可读）。'
          : '官方原文未给出该问题的具体口径。';
      // 保留模型已经给出的解释，只在开头补一条状态提示；模型完全没答时才用模板兜底。
      answer = answer.trim()
        ? `> ${notice}\n\n${answer}`
        : `${notice}为避免误导不做推算，请通过下方核实渠道向主管部门确认。`;
    } else {
      // 与既定基线保持一致：默认判 answered，只有「模型与确定性模板双方都在拒答」时才降级。
      // 不要用 planner.status 单独否决——通知类资料的 effective_status 多为「待核实」，
      // 单看它会把大量能正常回答的通知（选课、四六级报名等）误降为 unconfirmed。
      const modelRefuses = refusalPattern.test(answer.slice(0, 150));
      if (modelRefuses && refusalPattern.test(deterministicAnswer.slice(0, 150))) {
        finalStatus = 'unconfirmed';
        notice = planner.notice || '知识库中未找到足够依据。';
        answer = `> ${notice}\n\n${answer}`;
      } else {
        finalStatus = 'answered';
        notice = '';
        if (modelRefuses) answer = deterministicAnswer;
      }
    }
    // 状态与答案一致：判定 answered（结构化模板确实有口径）但模型仍在拒答时，
    // 退回确定性模板答案，避免出现"状态说有依据、答案却说查不到"的自相矛盾。
    if (finalStatus === 'answered' && refusalPattern.test(answer.slice(0, 150))) {
      answer = deterministicAnswer;
    }
    // P1b 补充：unconfirmed 时若 verifyChannels 为空，自动填充 contacts 里的匹配部门
    let verifyChannels = planner.verifyChannels;
    if (finalStatus === 'unconfirmed' && verifyChannels.length === 0) {
      const deptMatch = sanitized.match(
        /([\u4e00-\u9fa5]{2,10}(?:办公室|管理处|教务处|学生处|服务中心|中心|科))/,
      );
      verifyChannels = [
        ...(deptMatch ? [{ name: deptMatch[1], url: 'https://www.cuc.edu.cn/' }] : []),
        { name: '中国传媒大学一站式服务大厅 / 本科生院', url: 'https://www.cuc.edu.cn/' },
      ];
    }

    const sources = planner.evidence.map((item) => ({
      title: item.title,
      url: item.url,
      publish_date: item.publish_date ?? null,
      evidence_level:
        item.verify_status === '已核实' ? '官方-已核实' : '官方-待核实',
      verify_status: item.verify_status,
      effective_status: item.effective_status,
      excerpt: item.snippet,
      stale: item.stale,
      verified_months_ago: item.verified_months_ago,
      stale_reason: item.stale_reason,
    }));

    const elapsed = Date.now() - startedAt;
    const retrievalMode = embeddingResult.mode;
    const retrievalStage: PipelineStage = {
      id: 'retrieval',
      label: '结构化检索',
      agent: '检索 Agent',
      status:
        retrievalMode === 'lexical' || failures.length > 0 ? 'degraded' : 'ok',
      detail:
        retrievalMode === 'lexical'
          ? `语义服务不可用，已切换词面检索；命中 ${relevantFiltered.length} 条官方资料。`
          : `已并行检索 8 张结构表，命中 ${relevantFiltered.length} 条官方资料。`,
      input_summary: sanitized,
      output_summary: `${relevantFiltered.length} 条候选资料，${failures.length} 张表失败`,
      handoff: '把候选记录交给核验阶段',
      elapsed_ms: Date.now() - retrievalStartedAt,
    };
    const verificationStage: PipelineStage = {
      id: 'verification',
      label: '证据核验',
      agent: '核验 Agent',
      status: failures.length === specs.length ? 'failed' : 'ok',
      detail:
        finalStatus === 'answered'
          ? '已核实 + 现行 + 关键字段齐全，判定为有依据。'
          : finalStatus === 'conflict'
            ? '检测到官方信息冲突，已并列保留双方证据。'
            : `关键依据不足：${planner.missingFields.join('、') || '官方状态不明'}。`,
      input_summary: '候选来源的核验状态、有效状态与关键字段',
      output_summary:
        finalStatus === 'answered'
          ? '有依据'
          : finalStatus === 'conflict'
            ? '信息冲突'
            : '无法确认',
      handoff:
        finalStatus === 'unconfirmed'
          ? '保留核实渠道，不进入无依据的自动规划'
          : '把已核验字段与缺口交给规划阶段',
      elapsed_ms: 0,
    };
    const planningStage: PipelineStage = {
      id: 'planning',
      label: '行动规划',
      agent: '规划 Agent',
      status: actionCard ? 'ok' : 'degraded',
      detail: actionCard
        ? `已生成办事卡：${actionCard.steps.length} 个步骤，${actionCard.materials.length} 项材料。`
        : '当前问题没有可生成的结构化办事卡，已保留证据与核实渠道。',
      input_summary: '已核验字段、材料、截止时间与补救信息',
      output_summary: actionCard
        ? `${actionCard.steps.length} 步、${actionCard.materials.length} 项材料`
        : '仅输出证据与核实渠道',
      elapsed_ms: 0,
    };

    return {
      status: finalStatus,
      answer,
      sources,
      notice,
      conflicts,
      verify_channels: verifyChannels,
      refs: relevantFiltered.slice(0, 6).map((row) => row.id),
      follow_ups: this.followUps(sanitized, finalStatus, actionCard?.source_type),
      action_card: planner.actionCard,
      missing_fields: planner.missingFields,
      evidence: planner.evidence,
      task_suggestion: buildTaskSuggestion(planner.actionCard),
      remedy_mode: planner.actionCard?.remedy
        ? planner.actionCard.remedy.available
          ? 'available'
          : 'manual-check'
        : 'none',
      pipeline: failures.length
        ? [
            retrievalStage,
            {
              ...verificationStage,
              detail: `${verificationStage.detail} ${failures.length} 张表检索失败：${failures.map((f) => f.type).join('、')}。`,
            },
            planningStage,
          ]
        : [retrievalStage, verificationStage, planningStage],
      meta: {
        engine,
        elapsed_ms: elapsed,
        retrieval_mode: retrievalMode,
        tables_queried: specs.length,
        tables_failed: failures.length,
      },
    };
  }

  private parseRecord<T>(value: T | string | null | undefined): any {
    if (value == null) return {};
    if (typeof value !== 'string') return value;
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  private lexicalScore(question: string, haystack: string): number {
    const q = question.toLowerCase().replace(/[，。！？、,.!?：:；;“”"'（）()\s]/g, '');
    const h = haystack.toLowerCase().replace(/[，。！？、,.!?：:；;“”"'（）()\s]/g, '');
    if (!q || !h) return 0;

    const stop = new Set([
      '什么',
      '怎么',
      '如何',
      '多少',
      '哪里',
      '哪个',
      '可以',
      '需要',
      '时候',
      '一下',
      '我们',
      '学校',
      '中传',
      '请问',
      '么办',
      '咋办',
      '怎办',
    ]);
    const chars = [...q].filter((char) => /[\u4e00-\u9fffA-Za-z0-9]/.test(char));
    const grams: string[] = [];
    for (let i = 0; i < chars.length - 1; i++) {
      const gram = chars.slice(i, i + 2).join('');
      if (!stop.has(gram)) grams.push(gram);
    }
    for (let i = 0; i < chars.length - 2; i++) {
      grams.push(chars.slice(i, i + 3).join(''));
    }
    const unique = [...new Set(grams)];
    if (!unique.length) return h.includes(q) ? 1 : 0;
    const matches = unique.filter((gram) => h.includes(gram)).length;
    const exact = h.includes(q) ? 0.35 : 0;
    return Math.min(1, matches / Math.max(3, unique.length * 0.65) + exact);
  }

  private followUps(
    question: string,
    status: string,
    sourceType?: 'process' | 'notice',
  ): string[] {
    if (status === 'unconfirmed') {
      return ['这个事项的截止时间是什么时候', '办理需要哪些材料', '应该联系哪个部门'];
    }
    if (/四六级|四级|六级|CET/.test(question)) {
      return ['四六级在哪里报名', '四六级错过报名还能补报吗', '考试时间是什么时候'];
    }
    if (/学生证/.test(question)) {
      return ['补办学生证要多少钱', '学生证补办需要哪些材料'];
    }
    if (/助学贷款|回执/.test(question)) {
      return ['助学贷款回执怎么交', '国家助学金申请要交什么材料'];
    }
    if (/转专业/.test(question)) {
      return ['转专业有什么条件', '转专业报名截止了吗'];
    }
    if (sourceType === 'process') {
      return ['办理需要哪些材料', '这个事项的截止时间是什么时候', '错过办理怎么补救'];
    }
    return ['还有哪些材料需要准备', '截止时间是什么时候', '应该联系哪个部门'];
  }

}

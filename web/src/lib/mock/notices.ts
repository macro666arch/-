import type { Notice } from "@/lib/contract";

/**
 * 通知公告 —— 真实数据
 * 来源：《中传管理问题清单.md》E 类（通知聚合）
 *
 * 要演示的核心：
 *  1. 通知散落在官网 / 公众号 / 第三方，没有统一入口 → 这里是"归一化后"的样子
 *  2. 附件经常是空壳（有标题没内容）、外链常失效 → 如实标注，不当"材料已提供"
 *  3. 过期通知自动转"历史"，但保留可追溯
 */

const JWC_NOTICE = "https://jwc.cuc.edu.cn/";
const XSC_NOTICE = "https://xsc.cuc.edu.cn/";

export const notices: Notice[] = [
  {
    id: "nt-01",
    item_id: "助学贷款",
    notice_name: "关于开展 2026-2027 学年生源地信用助学贷款回执录入工作的通知",
    channel: "官网",
    applicable_to: "已申请生源地信用助学贷款的全日制本科生、研究生",
    deadline: "以通知附件为准",
    academic_year: "2026-2027",
    body_content:
      "各学院：请组织已申请生源地信用助学贷款的学生，于规定时间内将贷款受理证明（回执）交至学生工作部资助中心，由中心统一录入回执验证码。逾期未录入的，可能影响贷款发放。",
    attachments: [
      {
        name: "2026-2027学年生源地贷款回执录入安排.pdf",
        url: null,
        status: "无法读取",
        text_extracted: false,
      },
    ],
    external_links: [],
    extracted_fields: {
      deadline: null,
      applicable_to: "已申请生源地信用助学贷款的学生",
      material_requirements: "贷款受理证明（回执单）",
      entry: "学生工作部资助中心（艺术与传播大楼 209）",
    },
    notice_status: "正在适用",
    is_archived: false,
    related_notice_ids: ["nt-02"],
    gaps: [
      "**正文说的「规定时间」在附件里，但附件 PDF 打不开**，所以具体截止日期本系统无法给出。",
      "这是本项目最典型的「附件空壳」案例：不能因为附件存在就告诉学生「材料已提供」。",
    ],
    source: "学生工作部",
    source_url: XSC_NOTICE,
    publish_dept: "学生工作部",
    publish_date: null,
    last_verified_at: "2026-10-24",
    verify_status: "待核实",
    effective_status: "现行",
  },
  {
    id: "nt-02",
    item_id: "资助",
    notice_name: "2026 年国家助学金评审工作通知",
    channel: "官网",
    applicable_to: "家庭经济困难认定的全日制本科生",
    deadline: "待核实（原文以学院通知为准）",
    academic_year: "2026-2027",
    body_content:
      "根据教育部相关文件精神，现启动本学年国家助学金评审工作。请各学院按分配名额组织评审，公示无异议后报学生工作部。",
    attachments: [
      {
        name: "国家助学金申请表.docx",
        url: null,
        status: "疑似空白",
        text_extracted: false,
      },
      {
        name: "名额分配表.xlsx",
        url: null,
        status: "正常",
        text_extracted: true,
      },
    ],
    external_links: [],
    extracted_fields: {
      deadline: null,
      applicable_to: "家庭经济困难认定的本科生",
      material_requirements: "国家助学金申请表",
      entry: "各学院学生工作办公室",
    },
    notice_status: "正在适用",
    is_archived: false,
    related_notice_ids: ["nt-01"],
    gaps: [
      "**申请表附件下载后是空白文档**（0 字节 / 无内容），学生无法填写。",
      "名额分配表可读，但**没说明各学院具体名额**如何查询。",
      "截止时间写「以学院通知为准」，等于把责任推给学院，学生不知道该问谁。",
    ],
    source: "学生工作部",
    source_url: XSC_NOTICE,
    publish_dept: "学生工作部",
    publish_date: null,
    last_verified_at: "2026-10-24",
    verify_status: "待核实",
    effective_status: "现行",
  },
  {
    id: "nt-03",
    item_id: "选课",
    notice_name: "2026-2027 学年第一学期选课通知",
    channel: "官网",
    applicable_to: "全体本科生",
    deadline: "待核实",
    academic_year: "2026-2027",
    body_content:
      "本学期选课分两轮进行。第一轮为预选，第二轮为正选。请同学们登录教务系统按时选课，逾期不再补选。",
    attachments: [],
    external_links: [
      {
        title: "教务管理系统",
        publisher: "教务处",
        publish_date: null,
        url: "https://jwc.cuc.edu.cn/",
        accessible: true,
      },
    ],
    extracted_fields: {
      deadline: null,
      applicable_to: "全体本科生",
      material_requirements: null,
      entry: "教务管理系统",
    },
    notice_status: "正在适用",
    is_archived: false,
    related_notice_ids: [],
    gaps: [
      "通知只说「两轮」，但**没有给出任何一轮的具体起止时间**。",
      "「逾期不再补选」但没有补救渠道说明。",
    ],
    source: "教务处",
    source_url: JWC_NOTICE,
    publish_dept: "教务处",
    publish_date: null,
    last_verified_at: "2026-10-24",
    verify_status: "待核实",
    effective_status: "现行",
  },
  {
    id: "nt-04",
    item_id: "四六级",
    notice_name: "关于 2026 年下半年全国大学英语四、六级考试报名的通知",
    channel: "官网",
    applicable_to: "符合报考条件的在校本科生、研究生",
    deadline:
      "CET4：2026-09-15 10:00 至 2026-09-28 17:00；CET6 第一阶段：2026-09-15 10:00 至 2026-09-16 10:00；CET6 第二阶段：2026-09-16 10:00 至 2026-09-28 17:00",
    academic_year: "2026-2027",
    body_content:
      "报名采用网上报名方式。CET4 报名时间为 2026-09-15 10:00 至 2026-09-28 17:00。CET6 分两阶段报名：2026-09-15 10:00 至 2026-09-16 10:00；2026-09-16 10:00 至 2026-09-28 17:00。口语考试时间为 2026-11-21 至 2026-11-22，笔试时间为 2026-12-12。口试准考证自 2026-11-17 09:00 起可打印，笔试准考证自 2026-12-01 09:00 起可打印。报名系统提供自动候补功能。",
    attachments: [],
    external_links: [
      {
        title: "全国大学英语四、六级考试报名网",
        publisher: "教育部教育考试院",
        publish_date: null,
        url: "https://cet-bm.neea.edu.cn/",
        accessible: true,
      },
    ],
    extracted_fields: {
      deadline:
        "CET4：2026-09-15 10:00 至 2026-09-28 17:00；CET6：2026-09-15 10:00 起，第二阶段截至 2026-09-28 17:00",
      applicable_to: "符合报考条件的在校生",
      material_requirements: null,
      entry: "https://cet-bm.neea.edu.cn/",
    },
    notice_status: "已过截止",
    is_archived: false,
    related_notice_ids: [],
    gaps: [
      "报名已于 2026-09-28 17:00 截止，**官方未公布补报名安排**。",
      "报名系统有自动候补功能，但**候补规则、名额释放时间和成功率未公开**。",
    ],
    source: "教务处",
    source_url: "https://jwc.cuc.edu.cn/2026/0914/c6364a273878/page.htm",
    publish_dept: "教务处",
    publish_date: "2026-09-14",
    last_verified_at: "2026-11-01",
    verify_status: "已核实",
    effective_status: "现行",
  },
  {
    id: "nt-05",
    item_id: "转专业",
    notice_name: "2026 年本科生转专业工作通知（已过截止）",
    channel: "官网",
    applicable_to: "2025 级、2026 级本科生",
    deadline: "已截止",
    academic_year: "2025-2026",
    body_content:
      "根据《中国传媒大学本科生转专业管理办法》，现启动本年度转专业工作。请有意向的学生按学院要求提交申请。",
    attachments: [
      {
        name: "转专业申请表.docx",
        url: null,
        status: "正常",
        text_extracted: true,
      },
    ],
    external_links: [],
    extracted_fields: {
      deadline: "已截止",
      applicable_to: "2025 级、2026 级本科生",
      material_requirements: "转专业申请表",
      entry: "所在学院教务办公室",
    },
    notice_status: "已过截止",
    is_archived: true,
    related_notice_ids: [],
    gaps: [
      "已过截止，但**官网没有把它移出「通知公告」列表**，学生仍会点进去，误以为是今年的。",
      "本系统自动标注「已过截止」并归档，这是与官网最重要的差别之一。",
    ],
    source: "教务处",
    source_url: JWC_NOTICE,
    publish_dept: "教务处",
    publish_date: null,
    last_verified_at: "2026-10-24",
    verify_status: "待核实",
    effective_status: "疑似过期",
  },
  {
    id: "nt-06",
    item_id: "劳动教育",
    notice_name: "劳动教育实践学分认定说明（公众号）",
    channel: "公众号",
    applicable_to: "2025 级、2026 级本科生",
    deadline: null,
    academic_year: "2026-2027",
    body_content:
      "劳动教育实践学分通过参加校内外劳动实践活动获得，具体认定标准见附件。",
    attachments: [],
    external_links: [],
    extracted_fields: {
      deadline: null,
      applicable_to: "2025 级、2026 级本科生",
      material_requirements: null,
      entry: null,
    },
    notice_status: "正在适用",
    is_archived: false,
    related_notice_ids: [],
    gaps: [
      "**只在微信公众号发布，官网无对应条目**，不关注公众号的学生完全看不到。",
      "「具体认定标准见附件」但公众号文章里的附件**无法下载**。",
      "公众号文章会因清理而删除，**无长期归档**。",
    ],
    source: "学生工作部（公众号）",
    source_url: "https://xsc.cuc.edu.cn/",
    publish_dept: "学生工作部",
    publish_date: null,
    last_verified_at: "2026-10-24",
    verify_status: "待核实",
    effective_status: "待核实",
  },
];

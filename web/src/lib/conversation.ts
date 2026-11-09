/**
 * 轻量多轮主题跟踪。
 *
 * 这里不声称服务端拥有长期记忆：只在当前对话中保存最后一个明确事项，
 * 把“那要带什么材料”这类追问改写成完整问题，再交给现有问答接口。
 */

export interface ConversationTurn {
  question: string;
  answer: string;
}

export interface ConversationState {
  topic?: string;
  lastQuestion?: string;
  /** 上一轮真正送去检索的完整问题，用来给追问兜底 */
  lastResolvedQuestion?: string;
  /** 最近几轮问答，随请求发给后端，让模型能接住更早的指代 */
  history?: ConversationTurn[];
  turns: number;
}

export interface ResolvedQuestion {
  original: string;
  resolved: string;
  usedContext: boolean;
  state: ConversationState;
}

const TOPIC_ALIASES: Array<{ topic: string; pattern: RegExp }> = [
  { topic: "补办学生证", pattern: /补办学生证|学生证补办|学生证丢了|学生证遗失/ },
  { topic: "学生证", pattern: /学生证/ },
  { topic: "休学与复学", pattern: /休学|复学/ },
  { topic: "转专业", pattern: /转专业/ },
  { topic: "在读证明", pattern: /在读证明|学籍证明|开证明/ },
  { topic: "助学贷款回执", pattern: /助学贷款|生源地|回执/ },
  { topic: "国家助学金", pattern: /国家助学金|助学金/ },
  { topic: "心理咨询", pattern: /心理咨询|心港湾|心理预约/ },
  { topic: "宿舍报修", pattern: /宿舍报修|设施报修|维修/ },
  { topic: "宿舍加长床", pattern: /加长床|床太短/ },
  { topic: "四六级考试", pattern: /四六级|四级|六级|CET/i },
  { topic: "选课", pattern: /选课/ },
  { topic: "劳动教育", pattern: /劳动教育/ },
  { topic: "校历", pattern: /校历|教学周|考试周|开学/ },
  { topic: "一站式服务大厅", pattern: /一站式|事务大厅/ },
];

const FOLLOW_UP_ONLY =
  /^(那|那么|这个|那个|它|具体)?\s*(还|再|又)?\s*(要|需要|得|应该)?\s*(带|准备|交|提交)?\s*(什么|哪些|多少|多久|多长时间|怎么|如何|在哪|哪里|几点|什么时候|截止|期限|材料|电话|联系方式|地点|地址|入口|官网|可以|能不能|是否|要不要)/;

const PRONOUN_FOLLOW_UP =
  /^(那|那么|这个|那个|它|该事项|这件事)|(上面|刚才|前面).{0,8}(事项|问题|流程)/;

const FIELD_FOLLOW_UP =
  /^(那|那么|这个|那个|它)?\s*(材料(?:有|要|需要)?(?:哪些|什么)?(?:呢)?|(?:要|需要|准备|带|提交)(?:什么|哪些)?材料(?:呢)?|截止(?:时间|日期)?(?:呢)?|期限(?:呢)?|电话(?:呢)?|联系方式(?:呢)?|地点(?:呢)?|地址(?:呢)?|入口(?:呢)?|官网(?:呢)?|多久|要多久|多长时间|多少钱|在哪里|在哪办|去哪个部门|找谁|怎么办理|怎么办|可以代办吗|能代办吗|线上还是线下|线上办还是现场办)/;

const NEW_TOPIC_PATTERN =
  /补办学生证|学生证|休学|复学|转专业|在读证明|学籍证明|助学贷款|助学金|心理咨询|宿舍报修|加长床|四六级|四级|六级|选课|劳动教育|校历|一站式/;

function extractExplicitTopic(text: string): string | undefined {
  return TOPIC_ALIASES.find((item) => item.pattern.test(text))?.topic;
}

function trimFollowUp(text: string): string {
  return text
    .replace(/^(那|那么|这个|那个|它|该事项|这件事)[，,、\s]*/g, "")
    .replace(/^(再|还|又)[，,、\s]*/g, "")
    .trim();
}

/**
 * 从一句完整的问题里刮出「事项本体」作为锚点。
 * 固定别名表覆盖不到的事项（校园卡补办、开在读证明……）也能靠它拿到主题，
 * 后续追问就不会因为主题为空而丢失上下文。
 */
function deriveAnchor(text: string): string | undefined {
  const cleaned = text
    .replace(/[？?。！!，,、\s]+$/g, "")
    .replace(
      /(需要|要|得|应该)?(带|准备|提交|交)?(什么|哪些|多少)?(材料|资料|清单|证件)?(呢|吗)?$/g,
      "",
    )
    .replace(
      /(怎么办|怎么办理|如何办理|怎么弄|在哪办|在哪里办|去哪个部门|找谁|多久|多长时间|多少钱|截止时间|截止日期|期限|流程|步骤|入口|官网|电话|联系方式|地点|地址)$/g,
      "",
    )
    .replace(/[要需得]+$/g, "")
    .trim();
  if (cleaned.length < 4) return undefined;
  return cleaned.slice(0, 24);
}

/**
 * 返回本轮用于检索的完整问题，并维护当前对话主题。
 * 新问题里出现明确事项时，主题会自然切换，不会被旧上下文污染。
 */
export function resolveConversationQuestion(
  input: string,
  state: ConversationState,
): ResolvedQuestion {
  const original = input.trim();
  const explicitTopic = extractExplicitTopic(original);
  // 追问基准依次取：固定别名主题 → 上一轮完整问题 → 上一轮原话。
  // 这样即使事项不在别名表里，只要它出现过，就仍然能被接住。
  const base = state.topic ?? state.lastResolvedQuestion ?? state.lastQuestion;
  const canUseContext =
    !!base &&
    !explicitTopic &&
    original.length <= 48 &&
    (FOLLOW_UP_ONLY.test(original) ||
      PRONOUN_FOLLOW_UP.test(original) ||
      FIELD_FOLLOW_UP.test(original));

  if (canUseContext) {
    const request = trimFollowUp(original).replace(/[？?。！!]+$/g, "");
    const resolved = `${base}${request ? ` ${request}` : ""}？`;
    return {
      original,
      resolved,
      usedContext: true,
      state: {
        topic: state.topic ?? deriveAnchor(base),
        lastQuestion: original,
        lastResolvedQuestion: resolved,
        turns: state.turns + 1,
      },
    };
  }

  // 没有明确事项、也不像追问时，视为新问题，避免旧主题继续显示在输入框上方。
  // 不在别名表里的具体事项，用问题本体兜底成主题，后面才能接着问。
  const topic = explicitTopic ?? deriveAnchor(original);
  return {
    original,
    resolved: original,
    usedContext: false,
    state: {
      topic,
      lastQuestion: original,
      lastResolvedQuestion: original,
      turns: state.turns + 1,
    },
  };
}

/** 供输入框提示使用：当前主题是否足够明确。 */
export function isLikelyFollowUp(text: string): boolean {
  return (
    FOLLOW_UP_ONLY.test(text.trim()) ||
    PRONOUN_FOLLOW_UP.test(text.trim()) ||
    FIELD_FOLLOW_UP.test(text.trim())
  );
}

export function hasExplicitCampusTopic(text: string): boolean {
  return NEW_TOPIC_PATTERN.test(text);
}

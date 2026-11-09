import { Injectable, Logger } from '@nestjs/common';
import { KnowledgeChunk } from '../common/entities/knowledge-chunk.entity';

export type AnswerStatus = 'answered' | 'conflict' | 'unconfirmed';

export interface VerifyResult {
  status: AnswerStatus;
  notice: string;
}

// 可信度/拒答层 —— 这是本项目最核心的自建价值，地基（nau）没有。
// 作用：根据检索结果，判断"有依据 / 信息冲突 / 没有依据"三种情况，
//       对应《接口契约.md》里 POST /api/chat 响应的 status 三态。
//
// 数据约定：乙（线2）产出的知识库 JSON 里的信任字段（effective_status、verify_status、
//           conflict_flag）在入库时，会被写进 KnowledgeChunk.metadata（jsonb）。
//           本服务从 metadata 里读这些字段来判断可信度。
@Injectable()
export class VerifierService {
  private readonly logger = new Logger(VerifierService.name);

  // 低分拒答阈值：cosine 距离（0=完全相同，2=完全相反）。距离 > 阈值 视为"不相关"。
  // 实测：相关命中距离约 0.28，无关查询也有 0.55，取 0.45 能区分。
  private readonly SCORE_THRESHOLD = 0.45;

  verify(chunks: Array<KnowledgeChunk & { distance?: number }>): VerifyResult {
    // 1. 过滤掉距离太远（不相关）的命中
    const relevant = chunks.filter((c) => (c.distance ?? 0) <= this.SCORE_THRESHOLD);

    // 情况三：没有命中，或命中的都太远 → 无依据
    if (relevant.length === 0) {
      return { status: 'unconfirmed', notice: '知识库中未找到可靠依据，暂无法确认。' };
    }

    // 情况二：命中里存在冲突标记（conflict_flag=true）→ 冲突
    const conflicts = relevant.filter((c) => (c.metadata as any)?.conflict_flag === true);
    if (conflicts.length > 0) {
      return {
        status: 'conflict',
        notice: '发现多条官方信息存在冲突，请向主管部门进一步核实。',
      };
    }

    // 情况三（变体）：命中的资料全部"已失效"或"待核实" → 无依据（不给失效答案）
    const allUnreliable = relevant.every((c) => {
      const s = (c.metadata as any)?.effective_status;
      return s === '已失效' || s === '待核实';
    });
    if (allUnreliable) {
      return {
        status: 'unconfirmed',
        notice: '命中的资料已失效或待核实，暂无法给出确定答案。',
      };
    }

    // 情况一：有可靠依据
    return { status: 'answered', notice: '' };
  }
}

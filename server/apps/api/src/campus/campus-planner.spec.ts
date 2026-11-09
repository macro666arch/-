import {
  buildActionCard,
  buildTaskSuggestion,
  decidePlannerResult,
  type ActionCard,
  type RetrievalRow,
} from './campus-planner';

function row(
  type: RetrievalRow['type'],
  id: string,
  record: Record<string, any>,
): RetrievalRow {
  return {
    type,
    id,
    title: String(record.process_name ?? record.notice_name ?? id),
    url: record.source_url ?? 'https://example.cuc.edu.cn/',
    content: String(record.body_content ?? record.process_name ?? id),
    record,
    score: 1,
  };
}

function completeCard(): ActionCard {
  return {
    id: 'process:test',
    source_type: 'process',
    source_id: 'test',
    title: '测试流程',
    summary: '测试摘要',
    department: { name: '测试部门', phone: '65770000' },
    materials: [],
    steps: [{ id: 'step-1', text: '完成第一步', origin: 'official' }],
    missing_fields: [],
    verification: {
      verify_status: '已核实',
      effective_status: '现行',
      gaps: [],
      source_url: 'https://example.cuc.edu.cn/',
    },
  };
}

describe('campus planner', () => {
  it('only marks complete, verified and current evidence as answered', () => {
    const base = row('process', 'p1', {
      process_name: '测试流程',
      verify_status: '已核实',
      effective_status: '现行',
      source_url: 'https://example.cuc.edu.cn/p1',
    });

    expect(
      decidePlannerResult({ question: '测试流程怎么办', rows: [base], actionCard: completeCard() })
        .status,
    ).toBe('answered');

    for (const patch of [
      { verify_status: '待核实' },
      { effective_status: '疑似过期' },
      { effective_status: '已失效' },
    ]) {
      const changed = { ...base, record: { ...base.record, ...patch } };
      expect(
        decidePlannerResult({
          question: '测试流程怎么办',
          rows: [changed],
          actionCard: completeCard(),
        }).status,
      ).toBe('unconfirmed');
    }
  });

  it('does not answer from evidence that has not been reviewed for 90 days', () => {
    const stale = row('process', 'stale', {
      process_name: '过期资料流程',
      verify_status: '已核实',
      effective_status: '现行',
      last_verified_at: '2026-01-01',
      source_url: 'https://example.cuc.edu.cn/stale',
    });
    const result = decidePlannerResult({
      question: '过期资料流程怎么办',
      rows: [stale],
      actionCard: {
        ...completeCard(),
        source_id: 'stale',
        verification: {
          ...completeCard().verification,
          source_url: 'https://example.cuc.edu.cn/stale',
        },
      },
    });

    expect(result.status).toBe('unconfirmed');
    expect(result.evidence[0]).toMatchObject({ stale: true });
    expect(result.notice).toContain('超过 90 天未复核');
  });

  it('lets conflicting official evidence win over completeness', () => {
    const base = row('contact', 'c1', {
      verify_status: '已核实',
      effective_status: '现行',
      source_url: 'https://example.cuc.edu.cn/c1',
    });
    const result = decidePlannerResult({
      question: '部门电话是多少',
      rows: [base],
      actionCard: completeCard(),
      conflicts: [
        { label: '页面 A', value: '111', source: 'A', source_url: 'https://a' },
        { label: '页面 B', value: '222', source: 'B', source_url: 'https://b' },
      ],
    });
    expect(result.status).toBe('conflict');
  });

  it('detects numbering gaps instead of inventing missing steps', () => {
    const process = row('process', 'p2', {
      process_name: '休学办理',
      verify_status: '已核实',
      effective_status: '现行',
      source_url: 'https://example.cuc.edu.cn/p2',
      steps: [
        { step_no: 1, action: '提交申请' },
        { step_no: 2, action: '学院审批' },
        { step_no: 3, action: '教务处审批' },
        { step_no: 5, action: '办理离校' },
      ],
    });
    const card = buildActionCard('休学怎么办理', [process]);
    expect(card?.steps).toHaveLength(4);
    expect(card?.verification.gaps.join('')).toContain('3→5');
  });

  it('keeps the full official deadline range and targets the end timestamp', () => {
    const notice = row('notice', 'n1', {
      notice_name: '四六级报名通知',
      deadline: 'CET4：2026-09-15 10:00 至 2026-09-28 17:00',
      verify_status: '已核实',
      effective_status: '现行',
      source_url: 'https://example.cuc.edu.cn/n1',
    });
    const card = buildActionCard('四六级报名什么时候截止', [notice]);
    expect(card?.deadline?.text).toContain('CET4：2026-09-15 10:00 至 2026-09-28 17:00');
    expect(card?.deadline?.iso).toBe('2026-09-28T17:00:00+08:00');
  });

  it('extracts complete deadline ranges from notice body copy', () => {
    const notice = row('notice', 'n2', {
      notice_name: '考试报名通知',
      body_content:
        'CET4：2026-09-15 10:00 至 2026-09-28 17:00\nCET6 第二阶段：2026-09-16 10:00 至 2026-09-28 17:00',
      verify_status: '已核实',
      effective_status: '现行',
      source_url: 'https://example.cuc.edu.cn/n2',
    });
    const card = buildActionCard('考试报名截止时间', [notice]);
    expect(card?.deadline?.text).toBe('CET4：2026-09-15 10:00 至 2026-09-28 17:00');
    expect(card?.deadline?.iso).toBe('2026-09-28T17:00:00+08:00');
  });

  it('reports missing fields instead of guessing', () => {
    const notice = row('notice', 'n3', {
      notice_name: '材料提交通知',
      deadline: '待核实',
      verify_status: '已核实',
      effective_status: '现行',
      source_url: 'https://example.cuc.edu.cn/n3',
    });
    const card = buildActionCard('材料提交什么时候截止', [notice]);
    expect(card?.missing_fields).toContain('截止时间');
    expect(card?.missing_fields).toContain('主管部门');
  });

  it('offers a manual remedy when the official notice excludes re-registration', () => {
    const notice = row('notice', 'n4', {
      notice_name: '选课通知',
      body_content: '报名截止后不再补报名，逾期不再补报。',
      deadline: '2026-09-28 17:00',
      publish_dept: '教务处',
      phone: '65779333',
      verify_status: '已核实',
      effective_status: '现行',
      source_url: 'https://example.cuc.edu.cn/n4',
    });
    const card = buildActionCard('报名截止了，我错过了怎么办', [notice]);
    expect(card?.remedy?.available).toBe(true);
    expect(card?.remedy?.text).toContain('官方未公布补报名');
    expect(card?.remedy?.channel).toContain('65779333');
  });

  it('builds a task suggestion from the action card', () => {
    const process = row('process', 'p3', {
      process_name: '学生证补办',
      verify_status: '已核实',
      effective_status: '现行',
      source_url: 'https://example.cuc.edu.cn/p3',
      required_materials: ['身份证', '一寸照片'],
      steps: [
        { step_no: 1, action: '提交申请' },
        { step_no: 2, action: '领取新证' },
      ],
    });
    const card = buildActionCard('学生证怎么补办', [process]);
    const task = buildTaskSuggestion(card);
    expect(task).toMatchObject({
      action_card_id: 'process:p3',
      title: '学生证补办',
      step_count: 2,
      material_count: 2,
    });
  });
});

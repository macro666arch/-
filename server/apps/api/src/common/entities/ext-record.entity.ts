import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

/**
 * B2：契约外的 3 张扩展表（workorder 28 / mirror 3 / form 21，共 52 条）
 * 字段结构差异较大，统一收敛为「类型 + 标题 + 检索正文 + 原始 JSON」，
 * 既能进库、能生成向量参与问答，也不丢原始字段。
 */
@Entity('ext_records')
export class ExtRecord {
  /** 用乙数据里的原始 id（w001 / mj001 / fm001），便于对账 */
  @PrimaryColumn({ type: 'varchar' })
  id: string;

  /** workorder | mirror | form */
  @Column({ type: 'varchar' })
  type: string;

  @Column({ type: 'text' })
  title: string;

  /** 用于向量检索的正文 */
  @Column({ type: 'text' })
  content: string;

  @Column({ name: 'source_url', type: 'varchar', nullable: true })
  sourceUrl: string | null;

  @Column({ name: 'publish_date', type: 'varchar', nullable: true })
  publishDate: string | null;

  @Column({ name: 'last_verified_at', type: 'varchar', nullable: true })
  lastVerifiedAt: string | null;

  @Column({ name: 'last_checked_at', type: 'varchar', nullable: true })
  lastCheckedAt: string | null;

  @Column({ name: 'verified_by', type: 'varchar', nullable: true })
  verifiedBy: string | null;

  @Column({ name: 'verify_status', type: 'varchar', nullable: true })
  verifyStatus: string | null;

  @Column({ name: 'effective_status', type: 'varchar', nullable: true })
  effectiveStatus: string | null;

  @Column({ type: 'jsonb', nullable: true })
  data: unknown;

  @Column({ type: 'vector', nullable: true })
  embedding: number[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

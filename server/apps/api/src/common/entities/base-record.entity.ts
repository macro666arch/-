import {
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

// 所有结构化知识表的公共字段（对应接口契约 §1.2）
export abstract class BaseRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // 向量列（结构化 RAG 用：直接从结构表检索，不再依赖扁平 chunks）
  @Column({ type: 'vector', nullable: true })
  embedding: number[];

  @Column({ name: 'item_id', nullable: true })
  itemId: string;

  @Column()
  source: string;

  @Column({ name: 'source_url' })
  sourceUrl: string;

  @Column({ name: 'publish_date', type: 'varchar', nullable: true })
  publishDate: string;

  @Column({ name: 'last_verified_at', type: 'varchar', nullable: true })
  lastVerifiedAt: string;

  // B1：最近一次巡检时间（系统或人工），与「人工核实时间」区分
  @Column({ name: 'last_checked_at', type: 'varchar', nullable: true })
  lastCheckedAt: string | null;

  // B1：核实主体，'人工' | '系统'
  @Column({ name: 'verified_by', type: 'varchar', nullable: true })
  verifiedBy: string | null;

  @Column({ name: 'verify_status', default: '待核实' })
  verifyStatus: string;

  @Column({ name: 'effective_status', default: '现行' })
  effectiveStatus: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

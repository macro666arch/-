import { Entity, Column } from 'typeorm';
import { BaseRecord } from './base-record.entity';

@Entity('policies')
export class Policy extends BaseRecord {
  @Column({ name: 'policy_name' })
  policyName: string;

  @Column({ name: 'doc_no', nullable: true })
  docNo: string;

  @Column({ name: 'effective_date', type: 'varchar', nullable: true })
  effectiveDate: string;

  @Column({ name: 'expiry_date', type: 'varchar', nullable: true })
  expiryDate: string;

  @Column({ name: 'supersedes_id', nullable: true })
  supersedesId: string;

  @Column({ name: 'superseded_by_id', nullable: true })
  supersededById: string;

  @Column({ name: 'applicable_to', type: 'text', nullable: true })
  applicableTo: string;

  @Column({ type: 'text', nullable: true })
  scope: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @Column({ name: 'content_page_refs', type: 'jsonb', nullable: true })
  contentPageRefs: Record<string, unknown>;

  @Column({ name: 'ocr_quality', nullable: true })
  ocrQuality: string;
}

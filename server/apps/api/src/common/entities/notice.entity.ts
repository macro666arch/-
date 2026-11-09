import { Entity, Column } from 'typeorm';
import { BaseRecord } from './base-record.entity';

@Entity('notices')
export class Notice extends BaseRecord {
  @Column({ name: 'notice_name' })
  noticeName: string;

  @Column({ type: 'varchar', default: '官网' })
  channel: string;

  @Column({ name: 'applicable_to', type: 'text', nullable: true })
  applicableTo: string;

  @Column({ type: 'varchar', nullable: true })
  deadline: string;

  @Column({ name: 'academic_year', type: 'varchar', nullable: true })
  academicYear: string;

  @Column({ name: 'body_content', type: 'text', nullable: true })
  bodyContent: string;

  @Column({ type: 'jsonb', nullable: true })
  attachments: Array<{ name?: string; url?: string; status?: string; text_extracted?: string }>;

  @Column({ name: 'external_links', type: 'jsonb', nullable: true })
  externalLinks: Array<{ title?: string; publisher?: string; publish_date?: string; url?: string }>;

  @Column({ name: 'extracted_fields', type: 'jsonb', nullable: true })
  extractedFields: Record<string, unknown>;

  @Column({ name: 'notice_status', default: '正在适用' })
  noticeStatus: string;
}

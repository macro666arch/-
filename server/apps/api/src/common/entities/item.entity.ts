import { Entity, Column } from 'typeorm';
import { BaseRecord } from './base-record.entity';

@Entity('items')
export class Item extends BaseRecord {
  @Column({ name: 'item_no' })
  itemNo: string;

  @Column({ name: 'item_name' })
  itemName: string;

  @Column({ type: 'jsonb', nullable: true })
  aliases: string[];

  @Column({ name: 'related_policy_ids', type: 'jsonb', nullable: true })
  relatedPolicyIds: string[];

  @Column({ name: 'related_process_ids', type: 'jsonb', nullable: true })
  relatedProcessIds: string[];

  @Column({ name: 'related_notice_ids', type: 'jsonb', nullable: true })
  relatedNoticeIds: string[];

  @Column({ name: 'related_dept_id', nullable: true })
  relatedDeptId: string;
}

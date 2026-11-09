import { Entity, Column } from 'typeorm';
import { BaseRecord } from './base-record.entity';

@Entity('processes')
export class Process extends BaseRecord {
  @Column({ name: 'process_name' })
  processName: string;

  @Column({ name: 'applicable_to', type: 'text', nullable: true })
  applicableTo: string;

  @Column({ type: 'jsonb', nullable: true })
  conditions: string[];

  @Column({ name: 'required_materials', type: 'jsonb', nullable: true })
  requiredMaterials: string[];

  @Column({ type: 'jsonb', nullable: true })
  steps: Array<{
    step_no?: number;
    action?: string;
    responsible_role?: string;
    prerequisite?: string;
    deadline?: string;
    next_entry?: string;
  }>;

  @Column({ name: 'dept_id', nullable: true })
  deptId: string;

  @Column({ name: 'location_id', nullable: true })
  locationId: string;

  @Column({ name: 'service_hours', type: 'text', nullable: true })
  serviceHours: string;

  @Column({ name: 'need_appointment', default: false })
  needAppointment: boolean;

  @Column({ name: 'entry_url', nullable: true })
  entryUrl: string;

  @Column({ type: 'varchar', nullable: true })
  deadline: string;

  @Column({ type: 'text', nullable: true })
  remedy: string;

  @Column({ name: 'version_no', nullable: true })
  versionNo: string;

  @Column({ name: 'supersedes_id', nullable: true })
  supersedesId: string;

  @Column({ name: 'superseded_by_id', nullable: true })
  supersededById: string;

  @Column({ name: 'attachment_status', nullable: true })
  attachmentStatus: string;
}

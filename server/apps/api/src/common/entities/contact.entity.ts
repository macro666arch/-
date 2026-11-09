import { Entity, Column } from 'typeorm';
import { BaseRecord } from './base-record.entity';

@Entity('contacts')
export class Contact extends BaseRecord {
  @Column({ name: 'business_name' })
  businessName: string;

  @Column({ name: 'dept_name' })
  deptName: string;

  @Column({ type: 'varchar', nullable: true })
  phone: string;

  @Column({ name: 'location_id', nullable: true })
  locationId: string;

  @Column({ name: 'office_hours', type: 'text', nullable: true })
  officeHours: string;

  @Column({ name: 'need_appointment', default: false })
  needAppointment: boolean;

  @Column({ name: 'applicable_to', type: 'text', nullable: true })
  applicableTo: string;

  @Column({ name: 'history_phones', type: 'jsonb', nullable: true })
  historyPhones: Array<{ phone?: string; valid_from?: string; valid_to?: string; source_url?: string }>;

  @Column({ name: 'conflict_flag', default: false })
  conflictFlag: boolean;

  @Column({ name: 'route_keywords', type: 'jsonb', nullable: true })
  routeKeywords: string[];
}

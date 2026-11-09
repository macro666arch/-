import { Entity, Column } from 'typeorm';
import { BaseRecord } from './base-record.entity';

@Entity('service_hours')
export class ServiceHours extends BaseRecord {
  @Column({ name: 'business_id', nullable: true })
  businessId: string;

  @Column({ name: 'location_id', nullable: true })
  locationId: string;

  @Column({ name: 'open_days', type: 'text', nullable: true })
  openDays: string;

  @Column({ name: 'time_slot', type: 'text', nullable: true })
  timeSlot: string;

  @Column({ name: 'need_appointment', default: false })
  needAppointment: boolean;

  @Column({ type: 'text', nullable: true })
  note: string;
}

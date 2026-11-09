import { Entity, Column } from 'typeorm';
import { BaseRecord } from './base-record.entity';

@Entity('calendars')
export class Calendar extends BaseRecord {
  @Column({ name: 'academic_year' })
  academicYear: string;

  @Column({ type: 'varchar', default: '秋' })
  semester: string;

  @Column({ name: 'term_start', type: 'varchar', nullable: true })
  termStart: string;

  @Column({ name: 'term_end', type: 'varchar', nullable: true })
  termEnd: string;

  @Column({ type: 'jsonb', nullable: true })
  holidays: Array<{ name?: string; start?: string; end?: string }>;

  @Column({ name: 'teaching_weeks', nullable: true })
  teachingWeeks: string;

  @Column({ name: 'exam_weeks', nullable: true })
  examWeeks: string;

  @Column({ name: 'daily_schedule', type: 'jsonb', nullable: true })
  dailySchedule: Record<string, string>;

  @Column({ name: 'key_dates', type: 'jsonb', nullable: true })
  keyDates: Array<{ name?: string; date?: string }>;
}

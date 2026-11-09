import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** A reminder ledger, scoped to one task, so a scheduled scan cannot spam it. */
@Entity('task_reminders')
export class TaskReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'task_id' })
  taskId: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

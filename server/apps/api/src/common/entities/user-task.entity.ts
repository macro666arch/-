import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * A2：账号下的任务（替代 localStorage，跨设备可见）
 * user_id 上建索引，所有查询必须带 user_id，保证账号隔离。
 */
@Entity('user_tasks')
export class UserTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id' })
  userId: string;

  @Column({ name: 'action_card_id', type: 'varchar', nullable: true })
  actionCardId: string | null;

  @Column()
  title: string;

  @Column({ type: 'varchar', nullable: true })
  deadline: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  steps: unknown[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  materials: unknown[];

  @Column({ default: false })
  completed: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

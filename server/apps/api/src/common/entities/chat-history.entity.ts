import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('chat_history')
export class ChatHistory {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'jsonb', default: {} })
  payload: Record<string, unknown>;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

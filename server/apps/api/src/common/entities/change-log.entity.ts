import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

/** A4：变更记录（页面内容变化、404、抓取异常都记在这里，供人工复核） */
@Entity('change_logs')
export class ChangeLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'table_name' })
  tableName: string;

  @Column({ name: 'record_id', type: 'varchar', nullable: true })
  recordId: string | null;

  @Column({ name: 'field_name' })
  fieldName: string;

  @Column({ name: 'old_value', type: 'text', nullable: true })
  oldValue: string | null;

  @Column({ name: 'new_value', type: 'text', nullable: true })
  newValue: string | null;

  @Column({ type: 'varchar', nullable: true })
  reason: string | null;

  // 乙的 change_logs.json 带 changed_at / changed_by，按原样保留
  @Column({ name: 'changed_at', type: 'varchar', nullable: true })
  changedAt: string | null;

  @Column({ name: 'changed_by', type: 'varchar', nullable: true })
  changedBy: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}

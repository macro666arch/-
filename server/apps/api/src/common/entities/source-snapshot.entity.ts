import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  UpdateDateColumn,
} from 'typeorm';

/** A4：官网页面快照，用来判断内容是否变化 */
@Entity('source_snapshots')
export class SourceSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  url: string;

  /** 正文 sha256（去空白后计算，避免排版微调造成误判） */
  @Column({ name: 'content_hash' })
  contentHash: string;

  @Column({ name: 'status_code', type: 'int', nullable: true })
  statusCode: number | null;

  /** 抓取是否成功；失败只记录，不参与降级 */
  @Column({ default: true })
  ok: boolean;

  @Column({ name: 'error_msg', type: 'varchar', nullable: true })
  errorMsg: string | null;

  @UpdateDateColumn({ name: 'checked_at' })
  checkedAt: Date;
}

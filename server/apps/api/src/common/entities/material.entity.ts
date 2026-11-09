import { Entity, Column } from 'typeorm';
import { BaseRecord } from './base-record.entity';

@Entity('materials')
export class Material extends BaseRecord {
  @Column({ name: 'material_name' })
  materialName: string;

  @Column({ default: true })
  required: boolean;

  @Column({ name: 'download_url', nullable: true })
  downloadUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  spec: Record<string, unknown>;

  @Column({ name: 'applicable_to', type: 'text', nullable: true })
  applicableTo: string;
}

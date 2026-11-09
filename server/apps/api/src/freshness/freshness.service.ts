import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SourceSnapshot } from '../common/entities/source-snapshot.entity';
import { ChangeLog } from '../common/entities/change-log.entity';
import { CampusIntegrationsService } from '../campus/campus-integrations.service';
import {
  assessFreshness,
  FreshnessCategory,
  FRESHNESS_THRESHOLD_DAYS,
} from '../common/freshness.util';

const FRESHNESS_TABLES = [
  'processes',
  'contacts',
  'policies',
  'notices',
  'calendars',
  'service_hours',
  'faqs',
  'items',
  'materials',
] as const;

/**
 * A4：官网巡检
 * 原则：只记录、不自动降级。
 *  - 抓取失败或 404 只写快照与变更记录，改不改状态由人工确认
 *  - 只有两次"抓取成功"之间的 hash 差异才算内容变更，避免一次超时把整条数据打成失效
 */
@Injectable()
export class FreshnessService implements OnModuleInit {
  private readonly logger = new Logger(FreshnessService.name);
  private running = false;

  constructor(
    @InjectRepository(SourceSnapshot) private readonly snaps: Repository<SourceSnapshot>,
    @InjectRepository(ChangeLog) private readonly logs: Repository<ChangeLog>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly integrations: CampusIntegrationsService,
  ) {}

  onModuleInit() {
    if (process.env.ENABLE_FRESHNESS_CRON === '1') {
      const hours = this.positiveInt(
        process.env.FRESHNESS_CHECK_INTERVAL_HOURS,
        24,
        1,
        24 * 7,
      );
      const limit = this.positiveInt(
        process.env.FRESHNESS_CHECK_LIMIT,
        50,
        1,
        200,
      );
      const timer = setInterval(
        () => this.check(limit).catch((e) => this.logger.warn(e.message)),
        hours * 3600 * 1000,
      );
      timer.unref?.();
      this.logger.log(
        `官网巡检已开启：每 ${hours} 小时检查最多 ${limit} 个页面（只记录，不自动降级）`,
      );
    }
  }

  private positiveInt(
    raw: string | undefined,
    fallback: number,
    min: number,
    max: number,
  ): number {
    const value = Number.parseInt(raw ?? '', 10);
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, value));
  }

  private async allUrls(): Promise<string[]> {
    const tables = ['processes', 'contacts', 'policies', 'notices', 'calendars', 'service_hours', 'faqs', 'items', 'materials'];
    const parts = tables.map(
      (t) => `SELECT source_url FROM ${t} WHERE source_url LIKE 'http%'`,
    );
    const rows: { source_url: string }[] = await this.ds.query(parts.join(' UNION '));
    return Array.from(new Set(rows.map((r) => r.source_url))).filter(Boolean);
  }

  /**
   * B1：巡检写回 last_checked_at
   * 只更新「最近一次巡检时间」，不覆盖人工核实时间与有效状态（A4 原则：只记录、不自动降级）
   */
  private async touchChecked(url: string) {
    const now = new Date().toISOString().slice(0, 10);
    for (const table of FRESHNESS_TABLES) {
      await this.ds.query(`UPDATE ${table} SET last_checked_at = $1 WHERE source_url = $2`, [
        now,
        url,
      ]);
    }
  }

  async check(limit = 20) {
    if (this.running) return { skipped: true, reason: '巡检正在进行中，请稍后再试' };
    this.running = true;
    const started = Date.now();
    let changed = 0;
    let failed = 0;
    let unchanged = 0;
    try {
      const urls = (await this.allUrls()).slice(0, Math.max(1, Math.min(limit, 200)));
      for (const url of urls) {
        const result = await this.integrations.checkOfficialPage(url);
        const prev = await this.snaps.findOne({ where: { url } });

        if (!result.ok) {
          failed += 1;
          await this.snaps.save({
            ...(prev ?? { url }),
            url,
            contentHash: prev?.contentHash ?? '',
            statusCode: result.http_status ?? null,
            ok: false,
            errorMsg: result.message,
          });
          await this.touchChecked(url);
          continue;
        }

        const nextHash = result.content_hash ?? '';
        if (prev?.ok && prev.contentHash && prev.contentHash !== nextHash) {
          changed += 1;
          await this.logs.save({
            tableName: 'source_url',
            recordId: null,
            fieldName: 'content_hash',
            oldValue: prev.contentHash,
            newValue: nextHash,
            reason: `页面内容发生变化：${url}`,
          });
        } else {
          unchanged += 1;
        }

        await this.snaps.save({
          ...(prev ?? { url }),
          url,
          contentHash: nextHash,
          statusCode: result.http_status ?? null,
          ok: true,
          errorMsg: null,
        });
        await this.touchChecked(url);
      }
      return {
        checked: urls.length,
        changed,
        failed,
        unchanged,
        duration_ms: Date.now() - started,
        note: '本次只记录结果，未自动修改任何数据的有效状态',
      };
    } finally {
      this.running = false;
    }
  }

  async summary() {
    const counts = await Promise.all(
      FRESHNESS_TABLES.map(async (table) => {
        const rows: Array<{
          last_verified_at: string | null;
          verify_status: string | null;
          effective_status: string | null;
        }> = await this.ds.query(
          `SELECT last_verified_at, verify_status, effective_status FROM ${table}`,
        );
        const categories: Record<FreshnessCategory, number> = {
          current: 0,
          stale: 0,
          expired: 0,
          pending: 0,
        };
        for (const row of rows) {
          categories[
            assessFreshness(
              {
                last_verified_at: row.last_verified_at,
                verify_status: row.verify_status,
                effective_status: row.effective_status,
              },
              new Date(),
              FRESHNESS_THRESHOLD_DAYS,
            ).category
          ] += 1;
        }
        return {
          table,
          total: rows.length,
          ...categories,
        };
      }),
    );

    const total = counts.reduce((sum, row) => sum + row.total, 0);
    const current = counts.reduce((sum, row) => sum + row.current, 0);
    const stale = counts.reduce((sum, row) => sum + row.stale, 0);
    const expired = counts.reduce((sum, row) => sum + row.expired, 0);
    const pending = counts.reduce((sum, row) => sum + row.pending, 0);
    return {
      total,
      current,
      stale,
      expired,
      pending,
      threshold_days: FRESHNESS_THRESHOLD_DAYS,
      by_table: counts,
    };
  }

  recentChecks(limit = 50) {
    return this.snaps.find({ order: { checkedAt: 'DESC' }, take: limit });
  }

  recentChanges(limit = 50) {
    return this.logs.find({ order: { createdAt: 'DESC' }, take: limit });
  }
}

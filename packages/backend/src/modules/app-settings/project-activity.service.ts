import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../../lib/logger.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const CACHE_TTL_MS = 10 * 60_000;
const ACTIVITY_DAYS = 365;

interface CommitActivityDay {
  date: string;
  count: number;
}

export interface ProjectCommitActivity {
  range_start: string;
  range_end: string;
  total_commits: number;
  max_commits_per_day: number;
  days: CommitActivityDay[];
}

let cachedActivity: { expiresAt: number; data: ProjectCommitActivity } | null = null;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildEmptyActivity(rangeStart: Date, rangeEnd: Date): ProjectCommitActivity {
  const days: CommitActivityDay[] = [];
  for (let cursor = new Date(rangeStart); cursor <= rangeEnd; cursor = addUtcDays(cursor, 1)) {
    days.push({ date: toIsoDate(cursor), count: 0 });
  }

  return {
    range_start: toIsoDate(rangeStart),
    range_end: toIsoDate(rangeEnd),
    total_commits: 0,
    max_commits_per_day: 0,
    days,
  };
}

async function loadProjectCommitActivity(): Promise<ProjectCommitActivity> {
  const rangeEnd = startOfUtcDay(new Date());
  const rangeStart = addUtcDays(rangeEnd, -(ACTIVITY_DAYS - 1));
  const empty = buildEmptyActivity(rangeStart, rangeEnd);

  try {
    const { stdout } = await execFileAsync(
      'git',
      [
        '-C',
        REPO_ROOT,
        'log',
        '--no-merges',
        `--since=${empty.range_start}T00:00:00`,
        `--until=${empty.range_end}T23:59:59`,
        '--date=short',
        '--pretty=format:%cs',
      ],
      { maxBuffer: 1024 * 1024 },
    );

    const counts = new Map<string, number>();
    for (const line of stdout.split(/\r?\n/)) {
      const date = line.trim();
      if (!date) continue;
      counts.set(date, (counts.get(date) ?? 0) + 1);
    }

    let totalCommits = 0;
    let maxCommitsPerDay = 0;
    const days = empty.days.map((day) => {
      const count = counts.get(day.date) ?? 0;
      totalCommits += count;
      if (count > maxCommitsPerDay) maxCommitsPerDay = count;
      return { ...day, count };
    });

    return {
      range_start: empty.range_start,
      range_end: empty.range_end,
      total_commits: totalCommits,
      max_commits_per_day: maxCommitsPerDay,
      days,
    };
  } catch (error) {
    logger.warn({ err: error }, 'Failed to load project git activity');
    return empty;
  }
}

export async function getProjectCommitActivity(): Promise<ProjectCommitActivity> {
  if (cachedActivity && cachedActivity.expiresAt > Date.now()) {
    return cachedActivity.data;
  }

  const data = await loadProjectCommitActivity();
  cachedActivity = {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
  return data;
}

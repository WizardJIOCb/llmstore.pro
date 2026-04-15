import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { logger } from '../../lib/logger.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const MOBILE_REPO_CANDIDATES = [
  path.resolve(REPO_ROOT, '../llmstore.pro - mobile'),
  path.resolve(REPO_ROOT, '../llmstore.pro - iOS'),
];
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

function isGitRepo(repoRoot: string): boolean {
  return existsSync(path.join(repoRoot, '.git'));
}

function resolveTrackedRepoRoots(): string[] {
  const roots = [REPO_ROOT];
  const mobileRepo = MOBILE_REPO_CANDIDATES.find((candidate) => candidate !== REPO_ROOT && isGitRepo(candidate));

  if (mobileRepo) {
    roots.push(mobileRepo);
  }

  return roots;
}

async function loadCommitCounts(repoRoot: string, rangeStartIso: string, rangeEndIso: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const { stdout } = await execFileAsync(
    'git',
    [
      '-C',
      repoRoot,
      'log',
      '--no-merges',
      `--since=${rangeStartIso}T00:00:00`,
      `--until=${rangeEndIso}T23:59:59`,
      '--date=short',
      '--pretty=format:%cs',
    ],
    { maxBuffer: 1024 * 1024 },
  );

  for (const line of stdout.split(/\r?\n/)) {
    const date = line.trim();
    if (!date) continue;
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  return counts;
}

async function loadProjectCommitActivity(): Promise<ProjectCommitActivity> {
  const rangeEnd = startOfUtcDay(new Date());
  const rangeStart = addUtcDays(rangeEnd, -(ACTIVITY_DAYS - 1));
  const empty = buildEmptyActivity(rangeStart, rangeEnd);
  const repoRoots = resolveTrackedRepoRoots();
  const mergedCounts = new Map<string, number>();

  try {
    await Promise.all(
      repoRoots.map(async (repoRoot) => {
        try {
          const counts = await loadCommitCounts(repoRoot, empty.range_start, empty.range_end);
          for (const [date, count] of counts.entries()) {
            mergedCounts.set(date, (mergedCounts.get(date) ?? 0) + count);
          }
        } catch (error) {
          logger.warn({ err: error, repoRoot }, 'Failed to load project git activity for repo');
        }
      }),
    );

    if (mergedCounts.size === 0) {
      return empty;
    }

    let totalCommits = 0;
    let maxCommitsPerDay = 0;
    const days = empty.days.map((day) => {
      const count = mergedCounts.get(day.date) ?? 0;
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

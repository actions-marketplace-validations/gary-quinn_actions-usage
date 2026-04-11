import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import type { WorkflowRun } from "./types.js";

const execFile = promisify(execFileCb);

const REPO_CONCURRENCY = 5;
const LARGE_ORG_THRESHOLD = 50;
const REPO_FORMAT = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

const parseStdout = (stdout: string): string[] =>
  stdout
    .trim()
    .split("\n")
    .filter((line) => line.trim());

export function validateRepoFormat(repo: string): void {
  if (!REPO_FORMAT.test(repo)) {
    throw new Error(
      `Invalid repo format: "${repo}". Expected owner/repo (e.g. "my-org/my-app")`,
    );
  }
}

export async function detectRepo(): Promise<string> {
  let url: string;
  try {
    const { stdout } = await execFile("git", ["remote", "get-url", "origin"]);
    url = stdout.trim();
  } catch {
    throw new Error(
      "Could not detect repo from git remote. Use --repo owner/repo",
    );
  }

  const sshMatch = url.match(/git@github\.com:(.+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];

  const httpsMatch = url.match(/github\.com\/(.+?)(?:\.git)?$/);
  if (httpsMatch) return httpsMatch[1];

  throw new Error(`Could not parse repo from remote URL: ${url}`);
}

export async function checkGhCli(): Promise<void> {
  try {
    await execFile("gh", ["auth", "status"]);
  } catch {
    throw new Error(
      "GitHub CLI (gh) is not installed or not authenticated.\n" +
        "Install: https://cli.github.com\n" +
        "Auth:    gh auth login",
    );
  }
}

export async function fetchOrgRepos(org: string): Promise<string[]> {
  let stdout: string;
  try {
    ({ stdout } = await execFile(
      "gh",
      [
        "api",
        `/orgs/${org}/repos?per_page=100`,
        "--paginate",
        "--jq",
        ".[] | select(.archived == false and .disabled == false and .fork == false) | .full_name",
      ],
      { maxBuffer: 50 * 1024 * 1024 },
    ));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to list repos for org "${org}": ${detail}`);
  }

  const repos = parseStdout(stdout);

  if (repos.length === 0) {
    throw new Error(`No accessible repositories found in org "${org}"`);
  }

  return repos.sort();
}

interface RawRun {
  id: number;
  actor: string;
  workflow: string;
  started: string;
  updated: string;
}

const JQ_FILTER =
  ".workflow_runs[] | {id: .id, actor: .triggering_actor.login, workflow: .name, started: .run_started_at, updated: .updated_at}";

const parseRunLine =
  (repo: string) =>
  (line: string): WorkflowRun => {
    const raw = JSON.parse(line) as RawRun;
    return {
      id: raw.id,
      repo,
      actor: raw.actor,
      workflow: raw.workflow,
      startedAt: raw.started,
      updatedAt: raw.updated,
    };
  };

async function fetchRunsForPeriod(
  repo: string,
  start: string,
  end: string,
): Promise<WorkflowRun[]> {
  try {
    const { stdout } = await execFile(
      "gh",
      [
        "api",
        `/repos/${repo}/actions/runs?created=${start}..${end}&per_page=100&status=completed`,
        "--paginate",
        "--jq",
        JQ_FILTER,
      ],
      { maxBuffer: 50 * 1024 * 1024 },
    );

    return parseStdout(stdout).map(parseRunLine(repo));
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `  Warning: failed to fetch runs for ${repo} ${start}..${end}: ${detail}\n`,
    );
    return [];
  }
}

export function getMonthPeriods(
  since: string,
  until: string,
): { start: string; end: string }[] {
  const periods: { start: string; end: string }[] = [];
  const startDate = new Date(since);
  const endDate = new Date(until);
  let current = new Date(startDate);

  while (current <= endDate) {
    const year = current.getFullYear();
    const month = current.getMonth();

    const periodStart =
      current.getTime() === startDate.getTime()
        ? since
        : `${year}-${String(month + 1).padStart(2, "0")}-01`;

    const lastDay = new Date(year, month + 1, 0).getDate();
    const monthEnd = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const periodEnd = monthEnd > until ? until : monthEnd;

    periods.push({ start: periodStart, end: periodEnd });
    current = new Date(year, month + 1, 1);
  }

  return periods;
}

export interface FetchResult {
  repo: string;
  runs: WorkflowRun[];
}

export async function fetchRepoRuns(
  repo: string,
  since: string,
  until: string,
): Promise<FetchResult> {
  const periods = getMonthPeriods(since, until);

  const results = await Promise.all(
    periods.map((period) => fetchRunsForPeriod(repo, period.start, period.end)),
  );

  return { repo, runs: results.flat() };
}

async function processBatch<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

export async function fetchMultiRepoRuns(
  repos: string[],
  since: string,
  until: string,
): Promise<FetchResult[]> {
  if (repos.length > LARGE_ORG_THRESHOLD) {
    process.stderr.write(
      `  Warning: scanning ${repos.length} repos — this may take a while and could hit API rate limits\n`,
    );
  }

  return processBatch(repos, REPO_CONCURRENCY, (repo) =>
    fetchRepoRuns(repo, since, until),
  );
}

export function formatFetchSummary(results: FetchResult[]): string {
  const active = results.filter((r) => r.runs.length > 0);
  const skipped = results.length - active.length;

  if (active.length === 0) return "";

  const maxLen = Math.max(...active.map((r) => r.repo.length));
  const lines = active.map(
    (r) =>
      `  ${r.repo.padEnd(maxLen)}  ${String(r.runs.length).padStart(5)} runs`,
  );

  if (skipped > 0) {
    lines.push(`  (${skipped} repo${skipped > 1 ? "s" : ""} with no runs)`);
  }

  return lines.join("\n");
}

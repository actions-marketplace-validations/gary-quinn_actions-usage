import type { WorkflowRun, UserStats, AggregatedData } from "./types.js";

export function getMonthKey(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function getDurationMinutes(startedAt: string, updatedAt: string): number {
  const start = new Date(startedAt).getTime();
  const end = new Date(updatedAt).getTime();
  return Math.max(0, (end - start) / 60_000);
}

const userKey = (actor: string, repo: string): string => `${actor}|${repo}`;

type SortField = "minutes" | "runs" | "name";

const compareUsers =
  (sortBy: SortField) =>
  (a: UserStats, b: UserStats): number => {
    const byActor = a.actor.localeCompare(b.actor);
    const byRepo = a.repo.localeCompare(b.repo);

    switch (sortBy) {
      case "runs":
        return b.totalRuns - a.totalRuns || byActor || byRepo;
      case "name":
        return byActor || byRepo;
      default:
        return b.totalMinutes - a.totalMinutes || byActor || byRepo;
    }
  };

function accumulateUserStats(
  userMap: Map<string, UserStats>,
  run: WorkflowRun,
  duration: number,
  month: string,
): void {
  const key = userKey(run.actor, run.repo);
  let user = userMap.get(key);
  if (!user) {
    user = {
      actor: run.actor,
      repo: run.repo,
      totalMinutes: 0,
      totalRuns: 0,
      monthlyMinutes: {},
      workflows: {},
    };
    userMap.set(key, user);
  }

  user.totalMinutes += duration;
  user.totalRuns += 1;
  user.monthlyMinutes[month] = (user.monthlyMinutes[month] ?? 0) + duration;

  const wf = user.workflows[run.workflow] ?? { minutes: 0, runs: 0 };
  wf.minutes += duration;
  wf.runs += 1;
  user.workflows[run.workflow] = wf;
}

function computeTotals(
  users: UserStats[],
  months: string[],
): AggregatedData["totals"] {
  return {
    minutes: users.reduce((sum, u) => sum + u.totalMinutes, 0),
    runs: users.reduce((sum, u) => sum + u.totalRuns, 0),
    monthly: Object.fromEntries(
      months.map((m) => [
        m,
        users.reduce((sum, u) => sum + (u.monthlyMinutes[m] ?? 0), 0),
      ]),
    ),
  };
}

export function aggregate(
  runs: WorkflowRun[],
  repos: string[],
  since: string,
  until: string,
  sortBy: SortField,
): AggregatedData {
  const userMap = new Map<string, UserStats>();
  const workflowMap = new Map<string, { minutes: number; runs: number }>();
  const monthSet = new Set<string>();

  for (const run of runs) {
    const duration = getDurationMinutes(run.startedAt, run.updatedAt);
    const month = getMonthKey(run.startedAt);
    monthSet.add(month);

    accumulateUserStats(userMap, run, duration, month);

    const wf = workflowMap.get(run.workflow) ?? { minutes: 0, runs: 0 };
    wf.minutes += duration;
    wf.runs += 1;
    workflowMap.set(run.workflow, wf);
  }

  const months = [...monthSet].sort();
  const users = [...userMap.values()].sort(compareUsers(sortBy));
  const totals = computeTotals(users, months);

  const workflows = [...workflowMap.entries()]
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.minutes - a.minutes);

  return { repos, since, until, months, users, totals, workflows };
}

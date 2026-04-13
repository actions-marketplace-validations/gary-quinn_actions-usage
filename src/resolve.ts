import {
  fetchOrgRepos,
  detectRepo,
  validateRepoFormat,
} from "./github.js";
import type { OrgFilterOptions } from "./types.js";

export interface ResolveResult {
  readonly repos: readonly string[];
  readonly source: "org" | "org-filtered" | "explicit" | "detected";
  readonly orgTotal?: number;
}

export interface ResolveOptions {
  readonly includeForks?: boolean;
  readonly includeArchived?: boolean;
}

function looksLikeFullName(repo: string): boolean {
  return /^[^/]+\/[^/]+$/.test(repo);
}

export async function resolveRepos(
  org: string | undefined,
  repos: readonly string[],
  options: ResolveOptions = {},
): Promise<ResolveResult> {
  const orgFilter: OrgFilterOptions = {
    includeForks: options.includeForks,
    includeArchived: options.includeArchived,
  };

  if (org) {
    const orgRepos = await fetchOrgRepos(org, orgFilter);

    if (repos.length === 0) {
      return { repos: orgRepos, source: "org", orgTotal: orgRepos.length };
    }

    const fullNames = new Set(repos.filter(looksLikeFullName));
    const shortNames = new Set(
      repos.filter((r) => !looksLikeFullName(r)),
    );

    const filtered = orgRepos.filter((r) => {
      if (fullNames.has(r)) return true;
      const repoName = r.split("/")[1];
      return shortNames.has(repoName);
    });

    if (filtered.length === 0) {
      const preview = orgRepos.slice(0, 10).join(", ");
      const remaining = orgRepos.length - 10;
      const suffix = remaining > 0 ? ` (and ${remaining} more)` : "";
      throw new Error(
        `None of the specified repos found in org "${org}". Available: ${preview}${suffix}`,
      );
    }

    return { repos: filtered, source: "org-filtered", orgTotal: orgRepos.length };
  }

  if (repos.length > 0) {
    for (const repo of repos) {
      validateRepoFormat(repo);
    }
    return { repos, source: "explicit" };
  }

  return { repos: [await detectRepo()], source: "detected" };
}

export function formatResolveLog(result: ResolveResult, org?: string): string {
  switch (result.source) {
    case "org":
      return `Fetching repos for org "${org}"...\nFound ${result.repos.length} repos`;
    case "org-filtered":
      return `Fetching repos for org "${org}"...\nFound ${result.repos.length} matching repos (filtered from ${result.orgTotal})`;
    case "detected":
      return "Detecting repo from git remote...";
    default:
      return "";
  }
}

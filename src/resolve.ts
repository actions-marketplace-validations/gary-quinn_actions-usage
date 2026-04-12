import {
  fetchOrgRepos,
  detectRepo,
  validateRepoFormat,
} from "./github.js";

export interface ResolveResult {
  repos: string[];
  source: "org" | "org-filtered" | "explicit" | "detected";
  orgTotal?: number;
}

export async function resolveRepos(
  org: string | undefined,
  repos: string[],
): Promise<ResolveResult> {
  if (org) {
    const orgRepos = await fetchOrgRepos(org);

    if (repos.length === 0) {
      return { repos: orgRepos, source: "org", orgTotal: orgRepos.length };
    }

    const repoSet = new Set(repos);
    const shortNameSet = new Set(repos.map((r) => r.split("/").pop()));
    const filtered = orgRepos.filter(
      (r) => repoSet.has(r) || shortNameSet.has(r.split("/")[1]),
    );

    if (filtered.length === 0) {
      throw new Error(
        `None of the specified repos found in org "${org}". ` +
          `Available: ${orgRepos.slice(0, 10).join(", ")}${orgRepos.length > 10 ? ` (and ${orgRepos.length - 10} more)` : ""}`,
      );
    }

    return { repos: filtered, source: "org-filtered", orgTotal: orgRepos.length };
  }

  if (repos.length > 0) {
    repos.forEach(validateRepoFormat);
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

import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveRepos, formatResolveLog } from "./resolve.js";
import type { ResolveResult } from "./resolve.js";

vi.mock("./github.js", () => ({
  fetchOrgRepos: vi.fn(),
  detectRepo: vi.fn(),
  validateRepoFormat: vi.fn((repo: string) => {
    if (!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/.test(repo)) {
      throw new Error(`Invalid repo format: "${repo}"`);
    }
  }),
}));

import { fetchOrgRepos, detectRepo } from "./github.js";

const mockFetchOrgRepos = vi.mocked(fetchOrgRepos);
const mockDetectRepo = vi.mocked(detectRepo);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveRepos", () => {
  it("returns provided repos with explicit source", async () => {
    const result = await resolveRepos(undefined, ["org/api", "org/web"]);
    expect(result).toEqual({
      repos: ["org/api", "org/web"],
      source: "explicit",
    });
  });

  it("validates repo format when no org", async () => {
    await expect(resolveRepos(undefined, ["bad-repo"])).rejects.toThrow(
      /Invalid repo format/,
    );
  });

  it("auto-detects repo with detected source", async () => {
    mockDetectRepo.mockResolvedValue("owner/detected");
    const result = await resolveRepos(undefined, []);
    expect(result).toEqual({
      repos: ["owner/detected"],
      source: "detected",
    });
  });

  it("fetches all org repos with org source", async () => {
    mockFetchOrgRepos.mockResolvedValue(["org/a", "org/b", "org/c"]);
    const result = await resolveRepos("org", []);
    expect(result).toEqual({
      repos: ["org/a", "org/b", "org/c"],
      source: "org",
      orgTotal: 3,
    });
  });

  it("filters org repos by full name", async () => {
    mockFetchOrgRepos.mockResolvedValue(["org/a", "org/b", "org/c"]);
    const result = await resolveRepos("org", ["org/b"]);
    expect(result.repos).toEqual(["org/b"]);
    expect(result.source).toBe("org-filtered");
    expect(result.orgTotal).toBe(3);
  });

  it("filters org repos by short name", async () => {
    mockFetchOrgRepos.mockResolvedValue(["org/api", "org/web", "org/docs"]);
    const result = await resolveRepos("org", ["api", "web"]);
    expect(result.repos).toEqual(["org/api", "org/web"]);
  });

  it("throws when no repos match org filter", async () => {
    mockFetchOrgRepos.mockResolvedValue(["org/a", "org/b"]);
    await expect(resolveRepos("org", ["org/nonexistent"])).rejects.toThrow(
      /None of the specified repos found/,
    );
  });
});

describe("formatResolveLog", () => {
  it("returns org message with count", () => {
    const result: ResolveResult = { repos: ["a/1", "a/2"], source: "org", orgTotal: 2 };
    expect(formatResolveLog(result, "acme")).toContain('org "acme"');
    expect(formatResolveLog(result, "acme")).toContain("Found 2 repos");
  });

  it("returns filtered message with counts", () => {
    const result: ResolveResult = { repos: ["a/1"], source: "org-filtered", orgTotal: 10 };
    expect(formatResolveLog(result, "acme")).toContain("1 matching repos");
    expect(formatResolveLog(result, "acme")).toContain("filtered from 10");
  });

  it("returns detection message", () => {
    const result: ResolveResult = { repos: ["a/b"], source: "detected" };
    expect(formatResolveLog(result)).toContain("Detecting repo");
  });

  it("returns empty string for explicit repos", () => {
    const result: ResolveResult = { repos: ["a/b"], source: "explicit" };
    expect(formatResolveLog(result)).toBe("");
  });
});

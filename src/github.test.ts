import { describe, it, expect } from "vitest";
import { getMonthPeriods } from "./github.js";

describe("getMonthPeriods", () => {
  it("returns a single period for same-month range", () => {
    const periods = getMonthPeriods("2025-03-01", "2025-03-31");
    expect(periods).toEqual([{ start: "2025-03-01", end: "2025-03-31" }]);
  });

  it("splits multi-month range into per-month periods", () => {
    const periods = getMonthPeriods("2025-01-15", "2025-03-10");
    expect(periods).toHaveLength(3);
    expect(periods[0]).toEqual({ start: "2025-01-15", end: "2025-01-31" });
    expect(periods[1]).toEqual({ start: "2025-02-01", end: "2025-02-28" });
    expect(periods[2]).toEqual({ start: "2025-03-01", end: "2025-03-10" });
  });

  it("handles leap year february", () => {
    const periods = getMonthPeriods("2024-02-01", "2024-02-29");
    expect(periods).toEqual([{ start: "2024-02-01", end: "2024-02-29" }]);
  });

  it("handles cross-year ranges", () => {
    const periods = getMonthPeriods("2025-11-01", "2026-02-28");
    expect(periods).toHaveLength(4);
    expect(periods[0].start).toBe("2025-11-01");
    expect(periods[3].end).toBe("2026-02-28");
  });

  it("returns single-day period", () => {
    const periods = getMonthPeriods("2025-06-15", "2025-06-15");
    expect(periods).toEqual([{ start: "2025-06-15", end: "2025-06-15" }]);
  });
});

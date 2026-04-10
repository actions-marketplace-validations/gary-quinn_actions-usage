import { describe, it, expect } from "vitest";
import { formatMonthLabel, escapeCsvField } from "./output.js";

describe("formatMonthLabel", () => {
  it("converts YYYY-MM to abbreviated month with 2-digit year", () => {
    expect(formatMonthLabel("2025-01")).toBe("Jan 25");
    expect(formatMonthLabel("2026-12")).toBe("Dec 26");
  });

  it("handles all 12 months", () => {
    const expected = [
      "Jan", "Feb", "Mar", "Apr", "May", "Jun",
      "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    ];
    for (let i = 1; i <= 12; i++) {
      const key = `2025-${String(i).padStart(2, "0")}`;
      expect(formatMonthLabel(key)).toBe(`${expected[i - 1]} 25`);
    }
  });
});

describe("escapeCsvField", () => {
  it("returns plain strings unchanged", () => {
    expect(escapeCsvField("hello")).toBe("hello");
    expect(escapeCsvField(42)).toBe("42");
  });

  it("wraps fields containing commas in quotes", () => {
    expect(escapeCsvField("hello, world")).toBe('"hello, world"');
  });

  it("wraps fields containing double quotes and escapes them", () => {
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
  });

  it("wraps fields containing newlines", () => {
    expect(escapeCsvField("line1\nline2")).toBe('"line1\nline2"');
  });

  it("handles combined special characters", () => {
    expect(escapeCsvField('a,b"c\nd')).toBe('"a,b""c\nd"');
  });
});

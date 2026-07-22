import { describe, it, expect } from "vitest";
import { runTransforms } from "../runner";
import { zoneForTarget, zoneForDirection } from "../directionality";

function monthly(n: number, start = 100): { date: string; value: number }[] {
  const out: { date: string; value: number }[] = [];
  const d = new Date(Date.UTC(2020, 0, 1));
  for (let i = 0; i < n; i++) {
    const dd = new Date(d.getTime()); dd.setUTCMonth(dd.getUTCMonth() + i);
    out.push({ date: dd.toISOString().slice(0, 10), value: start + i });
  }
  return out;
}

describe("transforms framework", () => {
  it("gates by allowed list only", () => {
    const res = runTransforms({ series: monthly(30), allowed: ["level", "yoy"], frequency: "monthly" });
    expect(res.map((r) => r.name).sort()).toEqual(["level", "yoy"]);
  });

  it("yoy uses periods-per-year", () => {
    const res = runTransforms({ series: monthly(24), allowed: ["yoy"], frequency: "monthly" });
    const yoy = res[0].points;
    expect(yoy.slice(0, 12).every((p) => p.value == null)).toBe(true);
    expect(yoy.slice(12).every((p) => p.value != null)).toBe(true);
  });

  it("zscore centres on 0 for linear series", () => {
    const res = runTransforms({ series: monthly(40), allowed: ["zscoreHistorical"], frequency: "monthly" });
    const vals = res[0].points.map((p) => p.value).filter((v): v is number => v != null);
    expect(Math.abs(vals.reduce((s, x) => s + x, 0))).toBeLessThan(1e-6);
  });

  it("hashes input deterministically", () => {
    const a = runTransforms({ series: monthly(10), allowed: ["level"], frequency: "monthly" });
    const b = runTransforms({ series: monthly(10), allowed: ["level"], frequency: "monthly" });
    expect(a[0].inputsHash).toEqual(b[0].inputsHash);
  });

  it("target-band zones respect the band", () => {
    const t = { value: 2, band: [1.5, 2.5] as [number, number], unit: "yoy_pct" };
    expect(zoneForTarget(2.0, t)).toBe("green");
    expect(zoneForTarget(2.7, t)).toBe("yellow");
    expect(zoneForTarget(4.0, t)).toBe("red");
  });

  it("lower_is_better ranks bottom third as green", () => {
    const hist = Array.from({ length: 30 }, (_, i) => i);
    expect(zoneForDirection(2, hist, "lower_is_better")).toBe("green");
    expect(zoneForDirection(28, hist, "lower_is_better")).toBe("red");
  });
});
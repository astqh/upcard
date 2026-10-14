import { describe, it, expect } from "vitest";
import {
  RANKS, freshShoe, probsFrom, dealerDist, analyse, buildStrategyTable, houseEdge, simulateBatch,
} from "../src/engine.js";

// Same defaults as the app (DEFAULT_RULES in src/Upcard.jsx).
const RULES = {
  decks: 6, h17: false, das: true, surrender: "late", doubleRule: "any",
  maxSplits: 3, resplitAces: false, hitSplitAces: false, peek: true, bjPayout: 1.5, penetration: 0.75,
};

describe("probabilities", () => {
  it("sum to 1 for a fresh shoe", () => {
    const p = probsFrom(freshShoe(6));
    expect(RANKS.reduce((s, r) => s + p[r], 0)).toBeCloseTo(1, 12);
  });
  it("dealer outcome distribution sums to 1 for every upcard", () => {
    const p = probsFrom(freshShoe(6));
    for (const up of RANKS) {
      const d = dealerDist(up, p, RULES);
      expect(Object.values(d).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 10);
    }
  });
});

describe("dealer bust rate", () => {
  // Commonly published dealer bust rates (dealer stands on soft 17, no peek effect), in percent.
  const published = { 3: 37.4, 4: 39.4, 5: 41.6, 6: 42.3 };
  const p = probsFrom(freshShoe(6));
  for (const up of [3, 4, 5, 6]) {
    it(`upcard ${up} matches the published table`, () => {
      const bust = dealerDist(up, p, { ...RULES, peek: false }).bust * 100;
      expect(Math.abs(bust - published[up])).toBeLessThan(0.15);
    });
  }
  it("is higher for ace and ten after the dealer peeks", () => {
    for (const up of [1, 10]) {
      const withPeek = dealerDist(up, p, RULES).bust;
      const noPeek = dealerDist(up, p, { ...RULES, peek: false }).bust;
      expect(withPeek).toBeGreaterThan(noPeek);
    }
  });
});

describe("basic strategy", () => {
  const table = buildStrategyTable(RULES);
  const A = 1;
  const cells = [
    ["hard 16 v 10 surrender", () => table.hard[16][10], "surrender"],
    ["hard 12 v 4 stand", () => table.hard[12][4], "stand"],
    ["hard 12 v 2 hit", () => table.hard[12][2], "hit"],
    ["hard 11 v 6 double", () => table.hard[11][6], "double"],
    ["hard 10 v 10 hit", () => table.hard[10][10], "hit"],
    ["hard 9 v 3 double", () => table.hard[9][3], "double"],
    ["hard 13 v 6 stand", () => table.hard[13][6], "stand"],
    ["hard 17 v 10 stand", () => table.hard[17][10], "stand"],
    ["soft 18 v 5 double", () => table.soft[18][5], "double"],
    ["soft 18 v 9 hit", () => table.soft[18][9], "hit"],
    ["soft 19 v 6 stand", () => table.soft[19][6], "stand"],
    ["pair 8,8 v 10 split", () => table.pairs[8][10], "split"],
    ["pair A,A v 10 split", () => table.pairs[A][10], "split"],
    ["pair 10,10 v 6 stand", () => table.pairs[10][6], "stand"],
  ];
  for (const [name, get, want] of cells) it(name, () => expect(get()).toBe(want));
  it("A,7 v 5 double (via analyse)", () => {
    const r = analyse([A, 7], 5, freshShoe(6), RULES, {
      fromSplit: false, splitsAllowed: true, canAffordDouble: true, canAffordSplit: true,
    });
    expect(r.best).toBe("double");
  });
});

describe("simulation", () => {
  // The app's house-edge formula is an approximation and the sim plays a fixed-odds strategy table,
  // so a long run sits about 0.1 pp above it. Sampling noise at 200k hands is about +-0.26 pp (1 sd),
  // so the seed is fixed: the result is the same every run.
  const table = buildStrategyTable(RULES);
  const run = (rounds, seed) =>
    -simulateBatch({ rounds, rules: RULES, table, system: "hilo", spread: 1, minBet: 1, seed }).evPerRound * 100;
  it("200k hands land within 0.15 pp of the published house edge (seeded)", () => {
    expect(Math.abs(run(200000, 5) - houseEdge(RULES))).toBeLessThan(0.15);
  });
  it("4M hands land within 0.2 pp of the published house edge (seeded)", () => {
    expect(Math.abs(run(4000000, 2024) - houseEdge(RULES))).toBeLessThan(0.2);
  });
});

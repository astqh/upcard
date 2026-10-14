/* ============================================================
   1. CORE ENGINE
   Ranks: 1 = Ace, 2..9 = pip, 10 = T/J/Q/K (16 per deck)
   ============================================================ */

export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const RANK_LABEL = { 1: "A", 2: "2", 3: "3", 4: "4", 5: "5", 6: "6", 7: "7", 8: "8", 9: "9", 10: "10" };

export const freshShoe = (decks) => {
  const c = {};
  RANKS.forEach((r) => (c[r] = (r === 10 ? 16 : 4) * decks));
  return c;
};
export const shoeSize = (c) => RANKS.reduce((s, r) => s + c[r], 0);

export function probsFrom(comp) {
  const n = shoeSize(comp);
  const p = {};
  RANKS.forEach((r) => (p[r] = n > 0 ? comp[r] / n : 0));
  return p;
}

export function handValue(cards) {
  let total = 0,
    aces = 0;
  for (const r of cards) {
    total += r;
    if (r === 1) aces++;
  }
  let soft = false;
  if (aces > 0 && total + 10 <= 21) {
    total += 10;
    soft = true;
  }
  return { total, soft, pair: cards.length === 2 && cards[0] === cards[1], blackjack: cards.length === 2 && total === 21 && soft };
}

export function addCard(total, soft, r) {
  let t = total + r,
    s = soft;
  if (r === 1 && !soft && t + 10 <= 21) {
    t += 10;
    s = true;
  }
  if (t > 21 && s) {
    t -= 10;
    s = false;
  }
  return [t, s];
}

export function dealerDist(upcard, p, rules) {
  const memo = new Map();
  function rec(total, soft) {
    const key = total * 2 + (soft ? 1 : 0);
    const hit = memo.get(key);
    if (hit) return hit;
    let out = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 };
    if (total > 21) out.bust = 1;
    else if (total >= 17 && !(total === 17 && soft && rules.h17)) out[total] = 1;
    else
      for (const r of RANKS) {
        if (p[r] <= 0) continue;
        const [t, s] = addCard(total, soft, r);
        const sub = rec(t, s);
        for (const k in out) out[k] += p[r] * sub[k];
      }
    memo.set(key, out);
    return out;
  }
  const out = { 17: 0, 18: 0, 19: 0, 20: 0, 21: 0, bust: 0 };
  const [ut, us] = addCard(0, false, upcard);
  const excluded = rules.peek ? (upcard === 1 ? 10 : upcard === 10 ? 1 : null) : null;
  let norm = excluded !== null ? 1 - p[excluded] : 1;
  if (norm <= 0) norm = 1;
  for (const r of RANKS) {
    if (p[r] <= 0 || r === excluded) continue;
    const [t, s] = addCard(ut, us, r);
    const sub = rec(t, s);
    const w = p[r] / norm;
    for (const k in out) out[k] += w * sub[k];
  }
  return out;
}

export const evStand = (total, dist) => {
  if (total > 21) return -1;
  let ev = dist.bust;
  for (const d of [17, 18, 19, 20, 21]) {
    if (total > d) ev += dist[d];
    else if (total < d) ev -= dist[d];
  }
  return ev;
};

export function makeHitEV(p, dist) {
  const memo = new Map();
  return function hitEV(total, soft) {
    const key = total * 2 + (soft ? 1 : 0);
    if (memo.has(key)) return memo.get(key);
    let ev = 0;
    for (const r of RANKS) {
      if (p[r] <= 0) continue;
      const [t, s] = addCard(total, soft, r);
      ev += p[r] * (t > 21 ? -1 : Math.max(evStand(t, dist), hitEV(t, s)));
    }
    memo.set(key, ev);
    return ev;
  };
}

export function doubleEV(total, soft, p, dist) {
  let ev = 0;
  for (const r of RANKS) {
    if (p[r] <= 0) continue;
    const [t] = addCard(total, soft, r);
    ev += p[r] * (t > 21 ? -2 : 2 * evStand(t, dist));
  }
  return ev;
}

export function splitEV(rank, p, dist, rules, hitEV) {
  let ev = 0;
  for (const r of RANKS) {
    if (p[r] <= 0) continue;
    const [t1, s1] = addCard(0, false, rank);
    const [t2, s2] = addCard(t1, s1, r);
    let best;
    if (rank === 1 && !rules.hitSplitAces) best = evStand(t2, dist);
    else {
      best = Math.max(evStand(t2, dist), hitEV(t2, s2));
      if (rules.das) best = Math.max(best, doubleEV(t2, s2, p, dist));
    }
    ev += p[r] * best;
  }
  return 2 * ev;
}

export function canDoubleTotal(total, soft, cards, rules) {
  if (cards.length !== 2) return false;
  if (rules.doubleRule === "any") return true;
  if (soft) return false;
  if (rules.doubleRule === "9-11") return total >= 9 && total <= 11;
  return total >= 10 && total <= 11;
}

export function analyse(cards, upcard, comp, rules, ctx) {
  const { total, soft, pair } = handValue(cards);
  const p = probsFrom(comp);
  const dist = dealerDist(upcard, p, rules);
  const hitEV = makeHitEV(p, dist);
  const opts = { stand: evStand(total, dist) };
  opts.hit = total >= 21 ? -Infinity : hitEV(total, soft);
  if (canDoubleTotal(total, soft, cards, rules) && (!ctx.fromSplit || rules.das) && ctx.canAffordDouble)
    opts.double = doubleEV(total, soft, p, dist);
  if (pair && ctx.splitsAllowed && ctx.canAffordSplit && (cards[0] !== 1 || !ctx.fromSplit || rules.resplitAces))
    opts.split = splitEV(cards[0], p, dist, rules, hitEV);
  if (rules.surrender !== "none" && cards.length === 2 && !ctx.fromSplit) opts.surrender = -0.5;
  let best = null;
  for (const k in opts) {
    if (opts[k] === -Infinity) continue;
    if (best === null || opts[k] > opts[best]) best = k;
  }
  return { opts, best, dist, total, soft };
}

export const DECK_BASE = { 1: -0.02, 2: 0.19, 4: 0.35, 6: 0.4, 8: 0.43 };
export function houseEdge(rules) {
  let e = DECK_BASE[rules.decks] ?? 0.4;
  if (rules.h17) e += 0.22;
  if (!rules.das) e += 0.14;
  if (rules.surrender === "late") e -= 0.08;
  if (rules.surrender === "early") e -= 0.62;
  if (rules.bjPayout === 1.2) e += 1.39;
  if (rules.bjPayout === 1.0) e += 2.27;
  if (rules.doubleRule === "9-11") e += 0.09;
  if (rules.doubleRule === "10-11") e += 0.18;
  if (rules.resplitAces) e -= 0.08;
  if (rules.hitSplitAces) e -= 0.19;
  if (!rules.peek) e += 0.11;
  return e;
}

/* ============================================================
   2. COUNTING SYSTEMS
   ============================================================ */

export const SYSTEMS = {
  hilo: { name: "Hi-Lo", level: 1, balanced: true, tags: { 1: -1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 0, 8: 0, 9: 0, 10: -1 }, gainPerTC: 0.5 },
  ko: { name: "KO (unbalanced)", level: 1, balanced: false, tags: { 1: -1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 0, 9: 0, 10: -1 }, gainPerTC: 0.48 },
  zen: { name: "Zen Count", level: 2, balanced: true, tags: { 1: -1, 2: 1, 3: 1, 4: 2, 5: 2, 6: 2, 7: 1, 8: 0, 9: 0, 10: -2 }, gainPerTC: 0.52 },
  halves: { name: "Wong Halves", level: 3, balanced: true, tags: { 1: -1, 2: 0.5, 3: 1, 4: 1, 5: 1.5, 6: 1, 7: 0.5, 8: 0, 9: -0.5, 10: -1 }, gainPerTC: 0.55 },
};
export const koInitial = (decks) => -4 * (decks - 1);

export const ILLUSTRIOUS_18 = [
  ["Insurance", "take", 3], ["16 v 10", "stand", 0], ["15 v 10", "stand", 4], ["10,10 v 5", "split", 5],
  ["10,10 v 6", "split", 4], ["10 v 10", "double", 4], ["12 v 3", "stand", 2], ["12 v 2", "stand", 3],
  ["11 v A", "double", 1], ["9 v 2", "double", 1], ["10 v A", "double", 4], ["9 v 7", "double", 3],
  ["16 v 9", "stand", 5], ["13 v 2", "hit", -1], ["12 v 4", "hit", 0], ["12 v 5", "hit", -2],
  ["12 v 6", "hit", -1], ["13 v 3", "hit", -2],
];

/* ============================================================
   3. STRATEGY TABLE + BATCH SIMULATOR
   ============================================================ */

export function buildStrategyTable(rules) {
  const p = probsFrom(freshShoe(rules.decks));
  const hard = {}, soft = {}, pairs = {};
  const pick = (o) => {
    let b = null;
    for (const k in o) {
      if (o[k] === -Infinity) continue;
      if (b === null || o[k] > o[b]) b = k;
    }
    return b;
  };
  for (const up of RANKS) {
    const dist = dealerDist(up, p, rules);
    const hitEV = makeHitEV(p, dist);
    for (let t = 4; t <= 21; t++) {
      const o = { stand: evStand(t, dist), hit: t >= 21 ? -Infinity : hitEV(t, false) };
      if (canDoubleTotal(t, false, [0, 0], rules)) o.double = doubleEV(t, false, p, dist);
      if (rules.surrender !== "none") o.surrender = -0.5;
      (hard[t] ||= {})[up] = pick(o);
    }
    for (let t = 13; t <= 21; t++) {
      const o = { stand: evStand(t, dist), hit: t >= 21 ? -Infinity : hitEV(t, true) };
      if (canDoubleTotal(t, true, [0, 0], rules)) o.double = doubleEV(t, true, p, dist);
      (soft[t] ||= {})[up] = pick(o);
    }
    for (const r of RANKS) {
      const [t0, s0] = addCard(0, false, r);
      const [t, s] = addCard(t0, s0, r);
      const o = { stand: evStand(t, dist), hit: hitEV(t, s), split: splitEV(r, p, dist, rules, hitEV) };
      if (canDoubleTotal(t, s, [0, 0], rules)) o.double = doubleEV(t, s, p, dist);
      if (rules.surrender !== "none") o.surrender = -0.5;
      (pairs[r] ||= {})[up] = pick(o);
    }
  }
  return { hard, soft, pairs };
}

export function tableAction(cards, up, table, rules, ctx) {
  const v = handValue(cards);
  let a;
  if (v.pair && ctx.splitsAllowed && table.pairs[cards[0]]?.[up] === "split") return "split";
  a = v.soft ? table.soft[Math.min(21, v.total)]?.[up] : table.hard[Math.max(4, Math.min(21, v.total))]?.[up];
  if (!a || a === "split") a = v.total >= 17 ? "stand" : "hit";
  if (a === "double" && (cards.length !== 2 || (ctx.fromSplit && !rules.das))) a = v.total >= 17 ? "stand" : "hit";
  if (a === "surrender" && (cards.length !== 2 || ctx.fromSplit)) a = v.total >= 17 ? "stand" : "hit";
  return a;
}

export function simulateBatch({ rounds, rules, table, system, spread, minBet, seed }) {
  let s = seed >>> 0 || 12345;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const sys = SYSTEMS[system];
  let comp = freshShoe(rules.decks);
  let rc = sys.balanced ? 0 : koInitial(rules.decks);
  let total = 0, totalSq = 0, wagered = 0, n = 0;
  const cutoff = rules.decks * 52 * (1 - rules.penetration);

  const draw = () => {
    const size = shoeSize(comp);
    if (size <= 0) return null;
    let x = rnd() * size;
    for (const r of RANKS) {
      x -= comp[r];
      if (x < 0) {
        comp[r]--;
        rc += sys.tags[r];
        return r;
      }
    }
    return null;
  };

  for (let i = 0; i < rounds; i++) {
    if (shoeSize(comp) <= cutoff) {
      comp = freshShoe(rules.decks);
      rc = sys.balanced ? 0 : koInitial(rules.decks);
    }
    const decksLeft = Math.max(shoeSize(comp) / 52, 0.5);
    const tc = sys.balanced ? rc / decksLeft : rc;
    let bet = minBet;
    if (spread > 1) bet = minBet * Math.max(1, Math.min(spread, Math.floor(tc)));

    const pc = [draw(), draw()];
    const dc = [draw(), draw()];
    if (pc.includes(null) || dc.includes(null)) break;
    const pv = handValue(pc), dv = handValue(dc);
    let net = 0;
    wagered += bet;
    n++;

    if (rules.peek && dv.blackjack) net = pv.blackjack ? 0 : -bet;
    else if (pv.blackjack) net = bet * rules.bjPayout;
    else {
      let hands = [{ cards: pc, bet, done: false, fromSplit: false, splits: 0, surrendered: false }];
      for (let hi = 0; hi < hands.length && hi < 8; hi++) {
        const hd = hands[hi];
        let guard = 0;
        while (!hd.done && guard++ < 20) {
          const a = tableAction(hd.cards, dc[0], table, rules, { fromSplit: hd.fromSplit, splitsAllowed: hd.splits < rules.maxSplits });
          if (a === "stand") hd.done = true;
          else if (a === "surrender") { hd.surrendered = true; hd.done = true; }
          else if (a === "double") { hd.cards.push(draw()); hd.bet *= 2; wagered += bet; hd.done = true; }
          else if (a === "split") {
            const c0 = hd.cards[0];
            const a1 = { cards: [c0, draw()], bet, done: false, fromSplit: true, splits: hd.splits + 1, surrendered: false };
            const a2 = { cards: [c0, draw()], bet, done: false, fromSplit: true, splits: hd.splits + 1, surrendered: false };
            if (c0 === 1 && !rules.hitSplitAces) { a1.done = true; a2.done = true; }
            wagered += bet;
            hands.splice(hi, 1, a1, a2);
            hi--;
            break;
          } else {
            hd.cards.push(draw());
            if (handValue(hd.cards).total >= 21) hd.done = true;
          }
        }
      }
      let d = dc.slice();
      if (hands.some((x) => !x.surrendered && handValue(x.cards).total <= 21)) {
        let guard = 0;
        while (guard++ < 20) {
          const v = handValue(d);
          if (v.total > 17 || (v.total === 17 && !(v.soft && rules.h17))) break;
          d.push(draw());
        }
      }
      const dvf = handValue(d);
      const dBJ = d.length === 2 && dvf.blackjack;
      for (const hd of hands) {
        const v = handValue(hd.cards);
        if (hd.surrendered) net -= hd.bet / 2;
        else if (dBJ || v.total > 21) net -= hd.bet;
        else if (dvf.total > 21 || v.total > dvf.total) net += hd.bet;
        else if (v.total < dvf.total) net -= hd.bet;
      }
    }
    total += net;
    totalSq += net * net;
  }
  const mean = n ? total / n : 0;
  return {
    rounds: n,
    net: total,
    wagered,
    evPerRound: mean,
    sdPerRound: Math.sqrt(Math.max(n ? totalSq / n - mean * mean : 0, 0)),
  };
}

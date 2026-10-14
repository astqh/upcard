import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  RANKS, RANK_LABEL, freshShoe, shoeSize, probsFrom, handValue, addCard, dealerDist, evStand, makeHitEV, doubleEV, splitEV, canDoubleTotal, analyse, DECK_BASE, houseEdge, SYSTEMS, koInitial, ILLUSTRIOUS_18, buildStrategyTable, tableAction, simulateBatch,
} from "./engine.js";

/* Inside Claude a storage API exists; on a normal website fall back to localStorage. */
if (typeof window !== "undefined" && !window.storage) {
  window.storage = {
    async get(k) {
      const v = localStorage.getItem(k);
      if (v === null) throw new Error("not found");
      return { key: k, value: v };
    },
    async set(k, v) {
      localStorage.setItem(k, v);
      return { key: k, value: v };
    },
    async delete(k) {
      if (localStorage.getItem(k) === null) throw new Error("not found");
      localStorage.removeItem(k);
      return { key: k, deleted: true };
    },
  };
}


/* ============================================================
   4. THEMES
   ============================================================ */

const THEMES = {
  brass: {
    label: "Brass",
    ink: "#151827", panel: "#1E2334", panel2: "#262C41", line: "#39415F",
    ivory: "#EDE7DA", dim: "#8E97B5", accent: "#C9A227", sage: "#6E9E7E", rose: "#C2523F", knob: "#EDE7DA",
    face: "#F4EFE4", faceEdge: "#CDC5B4", red: "#B33A2B", black: "#20242F", backA: "#2A3149", backB: "#C9A227",
  },
  dark: {
    label: "Dark",
    ink: "#16181C", panel: "#1D2025", panel2: "#25292F", line: "#343941",
    ivory: "#E6E8EA", dim: "#8C939C", accent: "#4FA5A0", sage: "#5FA98C", rose: "#CC6558", knob: "#E6E8EA",
    face: "#EFF1F2", faceEdge: "#C3C8CC", red: "#B8473A", black: "#1B1E22", backA: "#232830", backB: "#4FA5A0",
  },
  black: {
    label: "Black",
    ink: "#000000", panel: "#0A0A0A", panel2: "#121212", line: "#262626",
    ivory: "#F0EDE6", dim: "#7C7C7C", accent: "#E8C46A", sage: "#69A87F", rose: "#C7564A", knob: "#F0EDE6",
    face: "#F2F0EA", faceEdge: "#B9B5AC", red: "#C0392B", black: "#0C0C0C", backA: "#101010", backB: "#E8C46A",
  },
  white: {
    label: "White",
    ink: "#F6F4EF", panel: "#FFFFFF", panel2: "#EFEDE6", line: "#D6D1C6",
    ivory: "#23262E", dim: "#6A7080", accent: "#A8801B", sage: "#3C7A59", rose: "#AE382C", knob: "#FFFFFF",
    face: "#FFFFFF", faceEdge: "#C9C4B8", red: "#BE3B2C", black: "#23262E", backA: "#E9E5DB", backB: "#A8801B",
  },
};

// Set synchronously at the top of each render; children read it during their own render.
let C = THEMES.brass;
let STYLE = "illustrated"; // illustrated | simple

const mono = { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontVariantNumeric: "tabular-nums" };
const ui = { fontFamily: "Inter, Segoe UI, Helvetica Neue, sans-serif" };

/* ============================================================
   5. PLAYING CARD VECTORS
   ============================================================ */

const SUIT_PATH = {
  spade: "M50 6C34 26 12 40 12 57c0 11 8 19 18 19 7 0 13-4 16-9-1 10-5 18-11 23h30c-6-5-10-13-11-23 3 5 9 9 16 9 10 0 18-8 18-19C88 40 66 26 50 6z",
  heart: "M50 88C22 68 9 52 9 35 9 20 20 10 33 10c8 0 14 4 17 10 3-6 9-10 17-10 13 0 24 10 24 25 0 17-13 33-41 53z",
  diamond: "M50 5 88 50 50 95 12 50z",
  club: "M50 8c-11 0-19 8-19 19 0 4 1 7 3 10-3-2-6-3-10-3-11 0-19 8-19 19s8 19 19 19c7 0 13-4 17-10-1 11-5 20-11 25h30c-6-5-10-14-11-25 4 6 10 10 17 10 11 0 19-8 19-19s-8-19-19-19c-4 0-7 1-10 3 2-3 3-6 3-10 0-11-8-19-19-19z",
};
const SUITS = ["spade", "heart", "diamond", "club"];

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PIPS = {
  2: [[0.5, 0.16], [0.5, 0.84]],
  3: [[0.5, 0.16], [0.5, 0.5], [0.5, 0.84]],
  4: [[0.3, 0.16], [0.7, 0.16], [0.3, 0.84], [0.7, 0.84]],
  5: [[0.3, 0.16], [0.7, 0.16], [0.5, 0.5], [0.3, 0.84], [0.7, 0.84]],
  6: [[0.3, 0.16], [0.7, 0.16], [0.3, 0.5], [0.7, 0.5], [0.3, 0.84], [0.7, 0.84]],
  7: [[0.3, 0.16], [0.7, 0.16], [0.5, 0.33], [0.3, 0.5], [0.7, 0.5], [0.3, 0.84], [0.7, 0.84]],
  8: [[0.3, 0.16], [0.7, 0.16], [0.5, 0.33], [0.3, 0.5], [0.7, 0.5], [0.5, 0.67], [0.3, 0.84], [0.7, 0.84]],
  9: [[0.3, 0.16], [0.7, 0.16], [0.3, 0.38], [0.7, 0.38], [0.5, 0.5], [0.3, 0.62], [0.7, 0.62], [0.3, 0.84], [0.7, 0.84]],
  10: [[0.3, 0.16], [0.7, 0.16], [0.5, 0.27], [0.3, 0.38], [0.7, 0.38], [0.3, 0.62], [0.7, 0.62], [0.5, 0.73], [0.3, 0.84], [0.7, 0.84]],
};

function Pip({ x, y, size, suit, color, flip }) {
  const s = size / 100;
  return (
    <g transform={`translate(${x} ${y}) ${flip ? "rotate(180)" : ""} scale(${s}) translate(-50 -50)`}>
      <path d={SUIT_PATH[suit]} fill={color} />
    </g>
  );
}

function PlayingCard({ rank, seed = 0, hidden, small }) {
  const W = small ? 38 : 52;
  const H = small ? 54 : 74;
  const vw = 52, vh = 74;

  if (STYLE === "simple") {
    if (hidden)
      return (
        <div
          style={{
            width: W,
            height: H,
            borderRadius: 5,
            flexShrink: 0,
            border: `1px solid ${C.line}`,
            background: `repeating-linear-gradient(45deg, ${C.backA}, ${C.backA} 4px, ${C.line} 4px, ${C.line} 8px)`,
          }}
        />
      );
    return (
      <div
        className="flex items-center justify-center"
        style={{
          width: W,
          height: H,
          borderRadius: 5,
          flexShrink: 0,
          background: C.face,
          color: C.black,
          border: `1px solid ${C.faceEdge}`,
          fontWeight: 600,
          fontSize: small ? 15 : 19,
          ...mono,
        }}
      >
        {RANK_LABEL[rank]}
      </div>
    );
  }

  if (hidden) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${vw} ${vh}`} style={{ display: "block", flexShrink: 0 }}>
        <rect x="0.7" y="0.7" width={vw - 1.4} height={vh - 1.4} rx="5" fill={C.backA} stroke={C.line} strokeWidth="1.2" />
        <g opacity="0.55">
          {Array.from({ length: 7 }).map((_, row) =>
            Array.from({ length: 5 }).map((__, col) => {
              const cx = 7 + col * 9.5 + (row % 2 ? 4.75 : 0);
              const cy = 8 + row * 9;
              if (cx > vw - 6) return null;
              return <rect key={`${row}-${col}`} x={cx - 2} y={cy - 2} width="4" height="4" transform={`rotate(45 ${cx} ${cy})`} fill={C.backB} opacity="0.5" />;
            })
          )}
        </g>
        <rect x="4" y="4" width={vw - 8} height={vh - 8} rx="3" fill="none" stroke={C.backB} strokeWidth="0.8" opacity="0.7" />
      </svg>
    );
  }

  const h = hashSeed(`${seed}:${rank}`);
  const suit = SUITS[h % 4];
  const isRed = suit === "heart" || suit === "diamond";
  const color = isRed ? C.red : C.black;
  const faceIdx = rank === 10 ? (h >> 3) % 4 : -1; // 0 = ten, 1..3 = J/Q/K
  const label = rank === 10 ? ["10", "J", "Q", "K"][faceIdx] : RANK_LABEL[rank];
  const isCourt = rank === 10 && faceIdx > 0;
  const isAce = rank === 1;

  const innerX0 = 12, innerX1 = vw - 12, innerY0 = 13, innerY1 = vh - 13;
  const px = (fx) => innerX0 + fx * (innerX1 - innerX0);
  const py = (fy) => innerY0 + fy * (innerY1 - innerY0);
  const pipSize = small ? 8 : 9.5;

  const index = (flip) => (
    <g transform={flip ? `translate(${vw} ${vh}) rotate(180)` : ""}>
      <text x="5.4" y={small ? 11.5 : 12} fontSize={small ? 9.5 : 10} fontWeight="700" fill={color} style={mono} textAnchor="middle">
        {label}
      </text>
      <g transform={`translate(5.4 ${small ? 16.5 : 17.5}) scale(${0.055})  translate(-50 -50)`}>
        <path d={SUIT_PATH[suit]} fill={color} />
      </g>
    </g>
  );

  return (
    <svg width={W} height={H} viewBox={`0 0 ${vw} ${vh}`} style={{ display: "block", flexShrink: 0 }}>
      <rect x="0.7" y="0.7" width={vw - 1.4} height={vh - 1.4} rx="5" fill={C.face} stroke={C.faceEdge} strokeWidth="1" />
      {index(false)}
      {index(true)}

      {isAce && <Pip x={vw / 2} y={vh / 2} size={small ? 24 : 30} suit={suit} color={color} />}

      {isCourt && (
        <g>
          <rect x="12" y="15" width={vw - 24} height={vh - 30} rx="2.5" fill="none" stroke={color} strokeWidth="0.9" opacity="0.55" />
          <text x={vw / 2} y={vh / 2 + 1} fontSize={small ? 15 : 18} fontWeight="700" fill={color} textAnchor="middle" style={mono}>
            {label}
          </text>
          <g transform={`translate(${vw / 2} ${vh / 2 + (small ? 11 : 13)}) scale(0.085) translate(-50 -50)`}>
            <path d={SUIT_PATH[suit]} fill={color} />
          </g>
        </g>
      )}

      {!isAce && !isCourt &&
        (PIPS[rank] || []).map(([fx, fy], i) => (
          <Pip key={i} x={px(fx)} y={py(fy)} size={pipSize} suit={suit} color={color} flip={fy > 0.55} />
        ))}
    </svg>
  );
}

/* ============================================================
   6. PRIMITIVES
   ============================================================ */

const Panel = ({ title, right, children }) => (
  <div className="rounded-lg p-4 mb-3" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
    {title && (
      <div className="flex items-baseline justify-between mb-3 gap-2">
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ivory }}>{title}</div>
        {right && <div style={{ color: C.dim, fontSize: 12, textAlign: "right", ...mono }}>{right}</div>}
      </div>
    )}
    {children}
  </div>
);

const Row = ({ label, value, tone }) => (
  <div className="flex items-baseline justify-between py-1 gap-3">
    <span style={{ color: C.dim, fontSize: 13 }}>{label}</span>
    <span style={{ color: tone || C.ivory, fontSize: 13, textAlign: "right", ...mono }}>{value}</span>
  </div>
);

const Btn = ({ children, onClick, disabled, kind, small }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={small ? "px-2 py-1 rounded" : "px-3 py-2 rounded"}
    style={{
      background: kind === "primary" ? C.accent : "transparent",
      color: kind === "primary" ? C.ink : kind === "danger" ? C.rose : C.ivory,
      border: `1px solid ${kind === "primary" ? C.accent : kind === "danger" ? C.rose : C.line}`,
      opacity: disabled ? 0.35 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
      fontSize: small ? 12 : 13,
      fontWeight: 600,
      ...ui,
    }}
  >
    {children}
  </button>
);

const Toggle = ({ label, on, onChange, hint }) => (
  <div className="py-1">
    <button onClick={() => onChange(!on)} className="flex items-center justify-between w-full gap-3" style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
      <span style={{ color: C.dim, fontSize: 13, textAlign: "left", ...ui }}>{label}</span>
      <span className="rounded-full" style={{ width: 34, height: 18, background: on ? C.sage : C.line, position: "relative", flexShrink: 0 }}>
        <span className="rounded-full" style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 14, height: 14, background: C.knob, transition: "left 120ms" }} />
      </span>
    </button>
    {hint && <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>{hint}</div>}
  </div>
);

const Drop = ({ label, value, options, onChange, inline }) => (
  <div className={inline ? "flex items-center gap-2" : "flex items-center justify-between py-1 gap-3"}>
    {label && <span style={{ color: C.dim, fontSize: 13, ...ui }}>{label}</span>}
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ background: C.panel2, color: C.ivory, border: `1px solid ${C.line}`, borderRadius: 4, padding: "5px 7px", fontSize: 13, ...ui }}
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  </div>
);

const NumField = ({ label, value, onChange, step = 1, min = 0, width = 88 }) => (
  <div className="flex items-center justify-between py-1 gap-3">
    <span style={{ color: C.dim, fontSize: 13, ...ui }}>{label}</span>
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width, background: C.panel2, color: C.ivory, border: `1px solid ${C.line}`, borderRadius: 4, padding: "4px 6px", fontSize: 13, ...mono }}
    />
  </div>
);

const Faq = ({ q, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: `1px solid ${C.line}` }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-start justify-between w-full gap-3 py-2"
        style={{ background: "none", border: "none", cursor: "pointer", padding: "10px 0", textAlign: "left" }}
      >
        <span style={{ color: C.ivory, fontSize: 13, fontWeight: 600, ...ui }}>{q}</span>
        <span style={{ color: C.dim, fontSize: 16, lineHeight: 1, flexShrink: 0 }}>{open ? "–" : "+"}</span>
      </button>
      {open && (
        <div style={{ color: C.dim, fontSize: 13, lineHeight: 1.75, paddingBottom: 12, whiteSpace: "pre-line", maxWidth: "68ch" }}>
          {children}
        </div>
      )}
    </div>
  );
};

const ModeButton = ({ active, onClick, label, tip }) => {
  const [over, setOver] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setOver(true)}
      onMouseLeave={() => setOver(false)}
    >
      <button
        onClick={onClick}
        onFocus={() => setOver(true)}
        onBlur={() => setOver(false)}
        title={tip}
        className="px-3 py-2 rounded"
        style={{
          background: active ? C.accent : "transparent",
          color: active ? C.ink : C.ivory,
          border: `1px solid ${active ? C.accent : C.line}`,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          ...ui,
        }}
      >
        {label}
      </button>
      {over && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            left: 0,
            width: 250,
            background: C.panel2,
            border: `1px solid ${C.line}`,
            borderRadius: 6,
            padding: 10,
            fontSize: 12,
            color: C.dim,
            lineHeight: 1.6,
            zIndex: 30,
            boxShadow: "0 8px 22px rgba(0,0,0,0.35)",
            ...ui,
          }}
        >
          {tip}
        </div>
      )}
    </span>
  );
};

const Chip = ({ on, onClick, children }) => (
  <button
    onClick={onClick}
    className="px-2 py-1 rounded"
    style={{
      background: on ? C.panel2 : "transparent",
      color: on ? C.ivory : C.dim,
      border: `1px solid ${on ? C.accent : C.line}`,
      fontSize: 12,
      fontWeight: 600,
      cursor: "pointer",
      ...ui,
    }}
  >
    {children}
  </button>
);

/* ============================================================
   7. APP
   ============================================================ */

function keyToRank(k) {
  const s = String(k).toLowerCase();
  if (s === "a" || s === "1") return 1;
  if (s === "t" || s === "0" || s === "j" || s === "q" || s === "k") return 10;
  if (s >= "2" && s <= "9") return Number(s);
  return null;
}

const ACTION = { hit: "Hit", stand: "Stand", double: "Double", split: "Split", surrender: "Surrender" };
const TABS = ["Table", "Rules", "Counting", "Bankroll", "Simulator", "FAQ", "Settings"];

const DEFAULT_RULES = {
  decks: 6, h17: false, das: true, surrender: "late", doubleRule: "any",
  maxSplits: 3, resplitAces: false, hitSplitAces: false, peek: true, bjPayout: 1.5, penetration: 0.75,
};

export default function Upcard() {
  const [theme, setTheme] = useState("brass");
  const [cardStyle, setCardStyle] = useState("illustrated");
  const [inputMethod, setInputMethod] = useState("tap"); // tap | keyboard
  C = THEMES[theme];
  STYLE = cardStyle;

  const [tab, setTab] = useState("Table");
  const [appMode, setAppMode] = useState("simulator"); // calculator | simulator
  const [entryMode, setEntryMode] = useState("sim"); // sim | assisted | manual
  const [playMode, setPlayMode] = useState("chips"); // chips | trainer
  const [hint, setHint] = useState("standard"); // show | standard
  const [sessionEnded, setSessionEnded] = useState(false);

  const [rules, setRules] = useState(DEFAULT_RULES);
  const [bank, setBank] = useState({ chips: 1000, start: 1000, min: 10, max: 500 });
  const [bet, setBet] = useState(10);
  const [system, setSystem] = useState("hilo");
  const [multiSpot, setMultiSpot] = useState(false);
  const [spots, setSpots] = useState(2);
  const [loaded, setLoaded] = useState(false);
  const [note, setNote] = useState("");

  const [comp, setComp] = useState(() => freshShoe(6));
  const compRef = useRef(freshShoe(6)); // live copy so several cards dealt at once see the real deck
  const [dealt, setDealt] = useState(0);
  const [rc, setRc] = useState(0);

  const [phase, setPhase] = useState("betting");
  const [hands, setHands] = useState([]);
  const [active, setActive] = useState(0);
  const [dealer, setDealer] = useState([]);
  const [holeShown, setHoleShown] = useState(false);
  const [pending, setPending] = useState(null);
  const [keyNote, setKeyNote] = useState("");
  const [log, setLog] = useState([]);
  const [stats, setStats] = useState({ played: 0, correct: 0, errors: [] });
  const [session, setSession] = useState({ played: 0, correct: 0, errors: [] });
  const [roundNotes, setRoundNotes] = useState([]);
  const [revealed, setRevealed] = useState(true);
  const [ins, setIns] = useState(0);
  const [salt, setSalt] = useState(1);

  const sys = SYSTEMS[system];
  const isCalc = appMode === "calculator";
  const isTrainer = !isCalc && playMode === "trainer";
  const chipsOn = !isCalc && playMode === "chips";
  const showAdvice = isCalc || isTrainer;
  const revealDefault = isCalc || (isTrainer && hint === "show");
  const canPeekAnswer = isTrainer && hint === "standard";
  // In chips play nothing is shown until the session is ended.
  const showReview = isCalc ? false : isTrainer || sessionEnded;
  const unit = chipsOn ? bet : 1;

  /* ---------- persistence ---------- */
  useEffect(() => {
    (async () => {
      try {
        const cfg = JSON.parse((await window.storage.get("upcard:config")).value);
        if (cfg.rules) setRules({ ...DEFAULT_RULES, ...cfg.rules });
        if (cfg.bank) setBank(cfg.bank);
        if (cfg.appMode) setAppMode(cfg.appMode);
        if (cfg.entryMode) setEntryMode(cfg.entryMode);
        if (cfg.theme) setTheme(cfg.theme);
        if (cfg.cardStyle) setCardStyle(cfg.cardStyle);
        if (cfg.inputMethod) setInputMethod(cfg.inputMethod);
        if (cfg.system) setSystem(cfg.system);
        if (cfg.playMode) setPlayMode(cfg.playMode);
        if (cfg.hint) setHint(cfg.hint);
        if (typeof cfg.multiSpot === "boolean") setMultiSpot(cfg.multiSpot);
        if (cfg.spots) setSpots(cfg.spots);
        if (cfg.rules?.decks) setComp(freshShoe(cfg.rules.decks));
      } catch (e) {}
      try {
        setStats(JSON.parse((await window.storage.get("upcard:stats")).value));
      } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    window.storage
      .set("upcard:config", JSON.stringify({ rules, bank, appMode, entryMode, theme, cardStyle, inputMethod, system, playMode, hint, multiSpot, spots }))
      .catch(() => {});
  }, [rules, bank, appMode, entryMode, theme, cardStyle, inputMethod, system, playMode, hint, multiSpot, spots, loaded]);

  useEffect(() => {
    if (!loaded) return;
    window.storage.set("upcard:stats", JSON.stringify(stats)).catch(() => {});
  }, [stats, loaded]);

  useEffect(() => {
    compRef.current = comp;
  }, [comp]);

  async function clearStored(what) {
    try {
      if (what === "config" || what === "all") {
        await window.storage.delete("upcard:config");
        setRules(DEFAULT_RULES);
        setBank({ chips: 1000, start: 1000, min: 10, max: 500 });
        setComp(freshShoe(DEFAULT_RULES.decks));
        setTheme("brass");
        setCardStyle("illustrated");
        setInputMethod("tap");
      }
      if (what === "stats" || what === "all") {
        await window.storage.delete("upcard:stats");
        setStats({ played: 0, correct: 0, errors: [] });
      }
      setNote(what === "all" ? "Everything cleared." : what === "config" ? "Settings reset." : "Trainer stats cleared.");
    } catch (e) {
      setNote("Nothing stored to clear.");
    }
    setTimeout(() => setNote(""), 2500);
  }

  /* ---------- shoe ---------- */
  const decksLeft = Math.max(shoeSize(comp) / 52, 0.25);
  const trueCount = sys.balanced ? rc / decksLeft : rc;
  const edgePct = -houseEdge(rules) + (sys.balanced ? trueCount * sys.gainPerTC : 0);

  const resetShoe = useCallback(
    (d = rules.decks) => {
      compRef.current = freshShoe(d);
      setComp(freshShoe(d));
      setDealt(0);
      setRc(SYSTEMS[system].balanced ? 0 : koInitial(d));
    },
    [rules.decks, system]
  );

  useEffect(() => {
    setRc(sys.balanced ? 0 : koInitial(rules.decks));
  }, [system]); // eslint-disable-line

  const removeCard = (r) => {
    compRef.current = { ...compRef.current, [r]: Math.max(0, compRef.current[r] - 1) };
    setComp((c) => ({ ...c, [r]: Math.max(0, c[r] - 1) }));
    setDealt((n) => n + 1);
    setRc((n) => n + sys.tags[r]);
  };

  const randomRank = (c) => {
    const n = shoeSize(c);
    if (n === 0) return null;
    let x = Math.random() * n;
    for (const r of RANKS) {
      x -= c[r];
      if (x < 0) return r;
    }
    return 10;
  };

  function deliver(target, who, cb) {
    const manualHere = isCalc || entryMode === "manual" || (entryMode === "assisted" && who === "dealer");
    if (manualHere) setPending({ target, cb });
    else {
      const r = randomRank(compRef.current);
      if (r === null) return;
      cb(r);
      removeCard(r);
    }
  }

  function resolvePending(r) {
    if (!pending || compRef.current[r] <= 0) return;
    const cb = pending.cb;
    setPending(null);
    cb(r);
    removeCard(r);
  }

  function typeRank(key) {
    const r = keyToRank(key);
    if (r === null) return false;
    if (compRef.current[r] <= 0) {
      setKeyNote(`No ${RANK_LABEL[r]} left in the deck.`);
      return true;
    }
    setKeyNote("");
    resolvePending(r);
    return true;
  }

  useEffect(() => {
    if (!pending || inputMethod !== "keyboard") return;
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target && e.target.dataset && e.target.dataset.rankInput) return; // the box handles its own keys
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return; // don't hijack other fields
      if (typeRank(e.key)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // re-bound each render so the handler always sees current state

  const observeCard = (r) => comp[r] > 0 && removeCard(r);

  /* ---------- round flow ---------- */
  const seatCount = multiSpot && !isCalc ? spots : 1;

  function startRound() {
    if (chipsOn && (bet < bank.min || bet > bank.max || bet * seatCount > bank.chips)) return;
    if (shoeSize(compRef.current) < 20) resetShoe();
    setSalt((s) => s + 1);
    setRoundNotes([]);
    setHands([]);
    setDealer([]);
    setHoleShown(false);
    setActive(0);
    setIns(0);
    setRevealed(revealDefault);
    setPhase("playing");
    dealSequence([], [], 0);
  }

  function dealSequence(seats, d, step) {
    const totalSteps = seatCount * 2 + 2;
    if (step >= totalSteps) return finishDeal(seats, d);
    let target, who;
    if (step < seatCount) [target, who] = [`Seat ${step + 1} first card`, "player"];
    else if (step === seatCount) [target, who] = ["Dealer upcard", "dealer"];
    else if (step < seatCount * 2 + 1) [target, who] = [`Seat ${step - seatCount} second card`, "player"];
    else [target, who] = ["Dealer hole card", "dealer"];
    deliver(target, who, (r) => {
      if (who === "dealer") dealSequence(seats, [...d, r], step + 1);
      else {
        const idx = step < seatCount ? step : step - seatCount - 1;
        const next = seats.slice();
        next[idx] = [...(next[idx] || []), r];
        dealSequence(next, d, step + 1);
      }
    });
  }

  function finishDeal(seats, d) {
    const hs = seats.map((cards, i) => ({ cards, bet: unit, doubled: false, done: false, fromSplit: false, splits: 0, seat: i + 1, result: null }));
    setHands(hs);
    setDealer(d);
    const dv = handValue(d);
    if (rules.peek && d[0] === 1) return setPhase("insurance");
    if (rules.peek && d[0] === 10 && dv.blackjack) {
      setHoleShown(true);
      return settle(hs, d, 0);
    }
    const marked = hs.map((x) => (handValue(x.cards).blackjack ? { ...x, done: true } : x));
    if (marked.every((x) => x.done)) {
      setHoleShown(true);
      return settle(marked, d, 0);
    }
    setHands(marked);
    setActive(marked.findIndex((x) => !x.done));
    setPhase("playing");
  }

  function takeInsurance(amount) {
    setIns(amount);
    const dv = handValue(dealer);
    if (dv.blackjack) {
      setHoleShown(true);
      return settle(hands, dealer, amount);
    }
    const marked = hands.map((x) => (handValue(x.cards).blackjack ? { ...x, done: true } : x));
    if (marked.every((x) => x.done)) {
      setHoleShown(true);
      return settle(marked, dealer, amount);
    }
    setHands(marked);
    setActive(marked.findIndex((x) => !x.done));
    setPhase("playing");
  }

  const h = hands[active];

  function advance(updated) {
    const next = updated.findIndex((x) => !x.done);
    if (next === -1) dealerTurn(updated);
    else {
      setHands(updated);
      setActive(next);
      setRevealed(revealDefault);
    }
  }

  function act(action) {
    if (!h) return;
    grade(action); // always recorded, shown or not
    if (action === "stand") {
      const u = hands.map((x, i) => (i === active ? { ...x, done: true } : x));
      setHands(u);
      advance(u);
    } else if (action === "hit") {
      deliver("Hit card", "player", (r) => {
        const u = hands.map((x, i) => (i === active ? { ...x, cards: [...x.cards, r], done: handValue([...x.cards, r]).total >= 21 } : x));
        setHands(u);
        if (u[active].done) advance(u);
      });
    } else if (action === "double") {
      deliver("Double card", "player", (r) => {
        const u = hands.map((x, i) => (i === active ? { ...x, cards: [...x.cards, r], bet: x.bet * 2, doubled: true, done: true } : x));
        setHands(u);
        advance(u);
      });
    } else if (action === "split") {
      const a = { ...h, cards: [h.cards[0]], fromSplit: true, splits: h.splits + 1, done: false };
      const b = { ...h, cards: [h.cards[1]], fromSplit: true, splits: h.splits + 1, done: false };
      const base = [...hands.slice(0, active), a, b, ...hands.slice(active + 1)];
      setHands(base);
      deliver("Card to first split hand", "player", (r1) => {
        const u1 = base.map((x, i) => (i === active ? { ...x, cards: [...x.cards, r1] } : x));
        setHands(u1);
        deliver("Card to second split hand", "player", (r2) => {
          const u2 = u1.map((x, i) => (i === active + 1 ? { ...x, cards: [...x.cards, r2] } : x));
          const acesDone = h.cards[0] === 1 && !rules.hitSplitAces;
          const u3 = u2.map((x, i) => (i === active || i === active + 1 ? { ...x, done: acesDone || handValue(x.cards).total === 21 } : x));
          setHands(u3);
          if (u3[active].done) advance(u3);
          setRevealed(revealDefault);
        });
      });
    } else if (action === "surrender") {
      const u = hands.map((x, i) => (i === active ? { ...x, done: true, surrendered: true } : x));
      setHands(u);
      advance(u);
    }
  }

  function dealerTurn(finalHands) {
    setHands(finalHands);
    setHoleShown(true);
    if (!finalHands.some((x) => !x.surrendered && handValue(x.cards).total <= 21)) return settle(finalHands, dealer, ins);
    setPhase("dealer");
    (function step(d) {
      const v = handValue(d);
      if (!(v.total < 17 || (v.total === 17 && v.soft && rules.h17))) return settle(finalHands, d, ins);
      deliver("Dealer draw", "dealer", (r) => {
        const nd = [...d, r];
        setDealer(nd);
        step(nd);
      });
    })(dealer);
  }

  function settle(finalHands, finalDealer, insAmt) {
    const dv = handValue(finalDealer);
    const dBJ = finalDealer.length === 2 && dv.blackjack;
    let net = 0;
    const results = finalHands.map((x) => {
      const pv = handValue(x.cards);
      const pBJ = !x.fromSplit && pv.blackjack;
      let r, delta;
      if (x.surrendered) [r, delta] = ["surrender", -x.bet / 2];
      else if (pBJ && !dBJ) [r, delta] = ["blackjack", x.bet * rules.bjPayout];
      else if (pBJ && dBJ) [r, delta] = ["push", 0];
      else if (dBJ) [r, delta] = ["loss", -x.bet];
      else if (pv.total > 21) [r, delta] = ["bust", -x.bet];
      else if (dv.total > 21 || pv.total > dv.total) [r, delta] = ["win", x.bet];
      else if (pv.total < dv.total) [r, delta] = ["loss", -x.bet];
      else [r, delta] = ["push", 0];
      net += delta;
      return { ...x, result: r, delta };
    });
    if (insAmt > 0) net += dBJ ? insAmt * 2 : -insAmt;
    setHands(results);
    setDealer(finalDealer);
    setHoleShown(true);
    if (chipsOn) setBank((b) => ({ ...b, chips: b.chips + net }));
    setLog((l) => [{ net, hands: results.length, dealer: dv.total, id: Date.now() + Math.random() }, ...l].slice(0, 60));
    setPhase("settled");
  }

  /* ---------- advisor ---------- */
  const advice = useMemo(() => {
    if (phase !== "playing" || !h || h.done || dealer.length === 0) return null;
    try {
      return analyse(h.cards, dealer[0], comp, rules, {
        fromSplit: h.fromSplit,
        splitsAllowed: h.splits < rules.maxSplits,
        canAffordDouble: !chipsOn || bank.chips >= h.bet,
        canAffordSplit: !chipsOn || bank.chips >= h.bet,
      });
    } catch {
      return null;
    }
  }, [phase, hands, active, dealer, comp, rules, bank.chips, chipsOn]);

  const baseAdvice = useMemo(() => {
    if (!advice || !h || dealer.length === 0) return null;
    const full = freshShoe(rules.decks);
    [...h.cards, dealer[0]].forEach((r) => (full[r] -= 1));
    try {
      return analyse(h.cards, dealer[0], full, rules, { fromSplit: h.fromSplit, splitsAllowed: h.splits < rules.maxSplits, canAffordDouble: true, canAffordSplit: true });
    } catch {
      return null;
    }
  }, [advice, hands, active, dealer, rules]);

  function grade(action) {
    if (!advice) return;
    const ok = action === advice.best;
    const note = {
      hand: h.cards.map((r) => RANK_LABEL[r]).join(","),
      up: RANK_LABEL[dealer[0]],
      chose: ACTION[action],
      best: ACTION[advice.best],
      cost: (advice.opts[advice.best] - advice.opts[action]).toFixed(3),
      ok,
    };
    setRoundNotes((n) => [...n, note]);
    setSession((x) => ({
      played: x.played + 1,
      correct: x.correct + (ok ? 1 : 0),
      errors: ok ? x.errors : [note, ...x.errors].slice(0, 40),
    }));
    setStats((s) => ({
      played: s.played + 1,
      correct: s.correct + (ok ? 1 : 0),
      errors: ok
        ? s.errors
        : [{ hand: h.cards.map((r) => RANK_LABEL[r]).join(","), up: RANK_LABEL[dealer[0]], chose: ACTION[action], best: ACTION[advice.best], cost: (advice.opts[advice.best] - advice.opts[action]).toFixed(3) }, ...s.errors].slice(0, 20),
    }));
  }

  const insuranceEV = useMemo(() => {
    const n = shoeSize(comp);
    if (!n) return 0;
    const pTen = comp[10] / n;
    return pTen * 2 - (1 - pTen);
  }, [comp]);

  const variance = 1.32;
  const kelly = Math.max(0, (bank.chips * (edgePct / 100)) / variance);
  const ror = edgePct > 0 ? Math.exp((-2 * (edgePct / 100) * (bank.chips / Math.max(bet, 1))) / variance) : 1;
  const sd100 = bet * Math.sqrt(variance * 100);
  const legal = advice ? Object.keys(advice.opts).filter((k) => advice.opts[k] !== -Infinity) : [];
  const allActions = ["hit", "stand", "double", "split", "surrender"];

  /* ---------- batch simulator ---------- */
  const [sim, setSim] = useState({ rounds: 100000, spread: 1, running: false, progress: 0, result: null });
  const simRef = useRef(null);

  function runSim() {
    setSim((s) => ({ ...s, running: true, progress: 0, result: null }));
    const table = buildStrategyTable(rules);
    const chunk = 20000;
    let done = 0;
    const agg = { rounds: 0, net: 0, wagered: 0, sumSq: 0 };
    const target = sim.rounds;
    const tick = () => {
      const size = Math.min(chunk, target - done);
      const r = simulateBatch({ rounds: size, rules, table, system, spread: sim.spread, minBet: bank.min, seed: Math.floor(Math.random() * 1e9) });
      agg.rounds += r.rounds;
      agg.net += r.net;
      agg.wagered += r.wagered;
      agg.sumSq += (r.sdPerRound ** 2 + r.evPerRound ** 2) * r.rounds;
      done += size;
      if (done < target) {
        setSim((s) => ({ ...s, progress: Math.round((done / target) * 100) }));
        simRef.current = setTimeout(tick, 0);
      } else {
        const mean = agg.net / agg.rounds;
        const sd = Math.sqrt(Math.max(agg.sumSq / agg.rounds - mean * mean, 0));
        setSim((s) => ({
          ...s,
          running: false,
          progress: 100,
          result: { rounds: agg.rounds, edgePct: (agg.net / agg.wagered) * 100, evPerRound: mean, sdPerRound: sd, net: agg.net, se: (sd / Math.sqrt(agg.rounds) / bank.min) * 100 },
        }));
      }
    };
    simRef.current = setTimeout(tick, 0);
  }
  useEffect(() => () => clearTimeout(simRef.current), []);

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <div style={{ background: C.ink, minHeight: "100vh", color: C.ivory, ...ui }} className="p-4">
      <div className="max-w-5xl mx-auto">
        <header className="mb-3">
          <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.2, lineHeight: 1.2 }}>Upcard</h1>
        </header>

        <div className="flex gap-1 flex-wrap mb-4" style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 8 }}>
          {TABS.filter((t) => !(isCalc && t === "Bankroll")).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-2 rounded"
              style={{ background: tab === t ? C.panel2 : "transparent", color: tab === t ? C.ivory : C.dim, border: `1px solid ${tab === t ? C.line : "transparent"}`, fontSize: 13, fontWeight: 600, cursor: "pointer", ...ui }}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ---------------- TABLE ---------------- */}
        {tab === "Table" && (
          <>
            <Panel>
              <div className="flex flex-wrap items-center gap-3">
                <Drop
                  inline
                  label="Mode"
                  value={appMode}
                  options={[{ v: "calculator", l: "Calculator" }, { v: "simulator", l: "Simulator" }]}
                  onChange={(v) => {
                    setAppMode(v);
                    setPending(null);
                    setPhase("betting");
                    setHands([]);
                    setDealer([]);
                  }}
                />
                {!isCalc && (
                  <Drop
                    inline
                    label="Card entry"
                    value={entryMode}
                    options={[
                      { v: "sim", l: "Dealt for me" },
                      { v: "assisted", l: "I enter the dealer's" },
                      { v: "manual", l: "I enter every card" },
                    ]}
                    onChange={setEntryMode}
                  />
                )}
                {!isCalc && (
                  <div className="flex items-center gap-2">
                    <span style={{ color: C.dim, fontSize: 13 }}>Playing</span>
                    <ModeButton
                      active={playMode === "chips"}
                      onClick={() => {
                        setPlayMode("chips");
                        setSessionEnded(false);
                        setPending(null);
                        setHands([]);
                        setDealer([]);
                        setPhase("betting");
                      }}
                      label="For chips"
                      tip="The real thing. You bet chips, get no help at all, and see no scoring while you play. Every move is still checked quietly, and you get the whole report when you end the session."
                    />
                    <ModeButton
                      active={playMode === "trainer"}
                      onClick={() => {
                        setPlayMode("trainer");
                        setSessionEnded(false);
                        setPending(null);
                        setHands([]);
                        setDealer([]);
                        setPhase("betting");
                      }}
                      label="Trainer"
                      tip="Practice. No chips, hands scored in units. Each hand is marked the moment it finishes, and you can ask for the best move at any point."
                    />
                  </div>
                )}
                {isTrainer && (
                  <Drop
                    inline
                    label="Hints"
                    value={hint}
                    options={[
                      { v: "standard", l: "Only when I ask" },
                      { v: "show", l: "Always show the best move" },
                    ]}
                    onChange={setHint}
                  />
                )}
              </div>
              <div style={{ color: C.dim, fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
                {isCalc
                  ? "Calculator: you type in every card as it appears. No chips and no scoring — just the best move and the numbers behind it."
                  : chipsOn
                  ? "Playing for chips: you are on your own. Every move is still checked in the background, but you see none of it until you end the session."
                  : "Trainer: no chips, hands scored in units. Hints are there when you want them, and each hand is marked as soon as it finishes."}
              </div>
            </Panel>

            <Panel title={isCalc ? "Hand" : "Table"} right={`${shoeSize(comp)} cards left · ${decksLeft.toFixed(2)} decks`}>
              <div className="mb-4">
                <div style={{ color: C.dim, fontSize: 12, marginBottom: 8 }}>
                  Dealer {dealer.length > 0 && holeShown && <span style={mono}>· {handValue(dealer).total}</span>}
                </div>
                <div className="flex gap-2">
                  {dealer.length === 0 && <span style={{ color: C.dim, fontSize: 13 }}>No cards yet</span>}
                  {dealer.map((r, i) => (
                    <PlayingCard key={i} rank={r} seed={`${salt}d${i}`} hidden={i === 1 && !holeShown} />
                  ))}
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${C.line}`, paddingTop: 12 }}>
                <div style={{ color: C.dim, fontSize: 12, marginBottom: 8 }}>
                  {isCalc ? "Your hand" : "Your hands"}
                  {hands.length > seatCount ? ` · ${hands.length} after splits` : ""}
                </div>
                <div className="flex flex-wrap gap-3">
                  {hands.length === 0 && <span style={{ color: C.dim, fontSize: 13 }}>{isCalc ? "Start a hand, then type in the cards" : "Place a bet to begin"}</span>}
                  {hands.map((hd, i) => {
                    const v = handValue(hd.cards);
                    const isActive = i === active && phase === "playing" && !hd.done;
                    return (
                      <div key={i} className="rounded p-2" style={{ border: `1px solid ${isActive ? C.accent : C.line}`, background: isActive ? C.panel2 : "transparent", minWidth: 120 }}>
                        <div className="flex gap-1 mb-2 flex-wrap">
                          {hd.cards.map((r, j) => (
                            <PlayingCard key={j} rank={r} seed={`${salt}p${i}-${j}`} small />
                          ))}
                        </div>
                        <div className="flex justify-between" style={{ fontSize: 12, ...mono }}>
                          <span style={{ color: v.total > 21 ? C.rose : C.ivory }}>
                            {v.total}
                            {v.soft && v.total <= 21 ? "s" : ""}
                          </span>
                          {chipsOn && <span style={{ color: C.dim }}>{hd.bet}</span>}
                        </div>
                        {hd.result && (
                          <div style={{ fontSize: 12, marginTop: 4, color: hd.delta > 0 ? C.sage : hd.delta < 0 ? C.rose : C.dim, ...mono }}>
                            {hd.result}
                            {chipsOn ? ` ${hd.delta > 0 ? "+" : ""}${hd.delta}` : ""}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {pending && (
                <div className="mt-4 rounded p-3" style={{ background: C.panel2, border: `1px solid ${C.accent}` }}>
                  <div style={{ fontSize: 13, marginBottom: 8 }}>{pending.target}</div>
                  {inputMethod === "tap" ? (
                    <div className="flex flex-wrap gap-2">
                      {RANKS.map((r) => (
                        <button key={r} onClick={() => resolvePending(r)} disabled={comp[r] <= 0} style={{ background: "none", border: "none", padding: 0, cursor: comp[r] <= 0 ? "not-allowed" : "pointer", opacity: comp[r] <= 0 ? 0.25 : 1 }}>
                          <PlayingCard rank={r} seed={`pick${r}`} small />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <>
                      <input
                        autoFocus
                        data-rank-input="1"
                        value=""
                        placeholder="type a rank"
                        onChange={(e) => typeRank(e.target.value.slice(-1))}
                        onKeyDown={(e) => {
                          if (!e.metaKey && !e.ctrlKey && typeRank(e.key)) e.preventDefault();
                        }}
                        style={{ width: 150, background: C.panel, color: C.ivory, border: `1px solid ${C.accent}`, borderRadius: 4, padding: "8px 10px", fontSize: 15, ...mono }}
                      />
                      <div style={{ color: C.dim, fontSize: 12, marginTop: 8 }}>
                        A for ace, 2 through 9, and T, J, Q, K or 0 for a ten. You can type anywhere on the page, so there is no need to click the box first.
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2" style={{ fontSize: 11, color: C.dim, ...mono }}>
                        {RANKS.map((r) => (
                          <span key={r} style={{ opacity: comp[r] <= 0 ? 0.3 : 1 }}>
                            {RANK_LABEL[r]}:{comp[r]}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                  {keyNote && <div style={{ color: C.rose, fontSize: 12, marginTop: 8 }}>{keyNote}</div>}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 items-center">
                {phase === "betting" && (
                  <>
                    {chipsOn && (
                      <>
                        <span style={{ color: C.dim, fontSize: 13 }}>Bet per seat</span>
                        <input
                          type="number"
                          value={bet}
                          min={bank.min}
                          max={bank.max}
                          onChange={(e) => setBet(Number(e.target.value))}
                          style={{ width: 90, background: C.panel2, color: C.ivory, border: `1px solid ${C.line}`, borderRadius: 4, padding: "6px 8px", ...mono }}
                        />
                      </>
                    )}
                    <Btn kind="primary" onClick={startRound} disabled={chipsOn && (bet * seatCount > bank.chips || bet < bank.min)}>
                      {isCalc ? "Start hand" : "Deal"}
                    </Btn>
                    {chipsOn && <Btn onClick={() => setBet(Math.max(bank.min, Math.min(bank.max, Math.round(kelly))))}>Suggested bet ({Math.round(kelly)})</Btn>}
                    {chipsOn && !sessionEnded && session.played > 0 && (
                      <Btn onClick={() => setSessionEnded(true)}>End session and see how I did</Btn>
                    )}
                  </>
                )}
                {phase === "insurance" && (
                  <>
                    <span style={{ fontSize: 13 }}>Dealer is showing an ace. Insurance?</span>
                    <Btn onClick={() => takeInsurance(unit / 2)}>Take insurance</Btn>
                    <Btn kind="primary" onClick={() => takeInsurance(0)}>
                      Decline
                    </Btn>
                    {showAdvice && revealed && (
                      <span style={{ fontSize: 12, color: insuranceEV > 0 ? C.sage : C.rose, ...mono }}>
                        {insuranceEV >= 0 ? "Worth taking: +" : "Not worth it: "}
                        {insuranceEV.toFixed(3)} per dollar
                      </span>
                    )}
                    {canPeekAnswer && !revealed && <Btn onClick={() => setRevealed(true)}>Show me the best move</Btn>}
                  </>
                )}
                {phase === "playing" && !pending && h && (
                  <>
                    {allActions.map((a) => (
                      <Btn key={a} onClick={() => act(a)} disabled={!legal.includes(a)} kind={showAdvice && revealed && advice && advice.best === a ? "primary" : undefined}>
                        {ACTION[a]}
                      </Btn>
                    ))}
                    {canPeekAnswer && !revealed && <Btn onClick={() => setRevealed(true)}>Show me the best move</Btn>}
                  </>
                )}
                {phase === "settled" && (
                  <>
                    <Btn kind="primary" onClick={() => setPhase("betting")}>
                      Next hand
                    </Btn>
                    {chipsOn && !sessionEnded && session.played > 0 && (
                      <Btn onClick={() => setSessionEnded(true)}>End session and see how I did</Btn>
                    )}
                    <Btn
                      onClick={() => {
                        setHands([]);
                        setDealer([]);
                        setPhase("betting");
                      }}
                    >
                      Clear table
                    </Btn>
                  </>
                )}
              </div>
            </Panel>

            {showAdvice && (
              <Panel title="Recommended play">
                {!advice && <div style={{ color: C.dim, fontSize: 13 }}>Deal or type in a hand and every move gets ranked by how much it wins or loses on average.</div>}
                {advice && (
                  <>
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span style={{ fontSize: 30, fontWeight: 700, color: revealed ? C.accent : C.line, lineHeight: 1.1 }}>{revealed ? ACTION[advice.best] : "hidden"}</span>
                      {revealed && (
                        <span style={{ color: C.dim, fontSize: 13, ...mono }}>
                          Wins {advice.opts[advice.best] >= 0 ? "+" : ""}
                          {advice.opts[advice.best].toFixed(4)} per dollar bet, on average
                        </span>
                      )}
                    </div>
                    {revealed && baseAdvice && baseAdvice.best !== advice.best && (
                      <div style={{ color: C.sage, fontSize: 12, marginTop: 6 }}>The count changes this one. With a fresh deck you would {ACTION[baseAdvice.best].toLowerCase()} instead.</div>
                    )}
                    <div className="mt-3">
                      {Object.keys(advice.opts)
                        .filter((k) => advice.opts[k] !== -Infinity)
                        .sort((a, b) => advice.opts[b] - advice.opts[a])
                        .map((k) => {
                          const v = advice.opts[k];
                          return (
                            <div key={k} className="flex items-center gap-2 py-1">
                              <span style={{ width: 84, fontSize: 13, color: C.dim }}>{ACTION[k]}</span>
                              <div className="flex-1" style={{ height: 6, background: C.panel2, borderRadius: 3 }}>
                                <div style={{ width: `${Math.min(100, Math.abs(v) * 45)}%`, height: "100%", borderRadius: 3, background: v >= 0 ? C.sage : C.rose, opacity: revealed ? 1 : 0.12 }} />
                              </div>
                              <span style={{ width: 66, textAlign: "right", fontSize: 12, color: revealed ? (v >= 0 ? C.sage : C.rose) : C.line, ...mono }}>
                                {revealed ? (v >= 0 ? "+" : "") + v.toFixed(3) : "•••"}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                    {revealed && (
                      <div className="mt-3" style={{ borderTop: `1px solid ${C.line}`, paddingTop: 8 }}>
                        <Row label="Chance the dealer goes bust" value={(advice.dist.bust * 100).toFixed(2) + "%"} />
                        <Row label="Chance the dealer ends on 17/18/19/20/21" value={[17, 18, 19, 20, 21].map((d) => (advice.dist[d] * 100).toFixed(1)).join(" / ")} />
                      </div>
                    )}
                  </>
                )}
              </Panel>
            )}

            {(multiSpot || isCalc) && (
              <Panel title="Cards seen elsewhere" right="these leave the deck as well">
                <div className="flex flex-wrap gap-2">
                  {RANKS.map((r) => (
                    <button key={r} onClick={() => observeCard(r)} disabled={comp[r] <= 0} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", opacity: comp[r] <= 0 ? 0.25 : 1 }}>
                      <PlayingCard rank={r} seed={`obs${r}`} small />
                    </button>
                  ))}
                </div>
                <div style={{ color: C.dim, fontSize: 11, marginTop: 8 }}>Tap each card you see go to another player, or get burned by the dealer. They leave the deck too.</div>
              </Panel>
            )}

            {isTrainer && phase === "settled" && roundNotes.length > 0 && (
              <Panel title="How you played that hand" right={`${roundNotes.filter((n) => n.ok).length} of ${roundNotes.length} best`}>
                {roundNotes.every((n) => n.ok) ? (
                  <div style={{ color: C.sage, fontSize: 13 }}>Every move was the best one available.</div>
                ) : (
                  <div style={{ fontSize: 13 }}>
                    {roundNotes
                      .filter((n) => !n.ok)
                      .map((n, i) => (
                        <div key={i} className="py-1" style={{ color: C.dim }}>
                          On {n.hand} against {n.up} you chose {n.chose}.{" "}
                          <span style={{ color: C.ivory }}>{n.best} was better</span>, by {n.cost} per dollar.
                        </div>
                      ))}
                  </div>
                )}
              </Panel>
            )}

            {showReview && (
            <Panel
              title={sessionEnded && chipsOn ? "Session review" : "Your play record"}
              right={session.played ? `${((session.correct / session.played) * 100).toFixed(1)}% best moves` : "no moves yet"}
            >
              <Row label="Moves this session" value={session.played} />
              <Row
                label="Best move chosen"
                value={session.played ? `${session.correct} of ${session.played}` : "—"}
                tone={session.played && session.correct === session.played ? C.sage : undefined}
              />
              <Row label="All time" value={stats.played ? `${((stats.correct / stats.played) * 100).toFixed(1)}% of ${stats.played}` : "—"} />
              {session.errors.length > 0 && (
                <div className="mt-2" style={{ fontSize: 12, color: C.dim }}>
                  <div style={{ marginBottom: 4 }}>Where you went wrong, most recent first:</div>
                  {session.errors.slice(0, 10).map((e, i) => (
                    <div key={i} className="py-1" style={{ borderTop: `1px solid ${C.line}`, ...mono }}>
                      {e.hand} against {e.up}: you chose {e.chose}, best was {e.best} (cost {e.cost})
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3">
                <Btn
                  small
                  onClick={() => {
                    setSession({ played: 0, correct: 0, errors: [] });
                    setSessionEnded(false);
                    setLog([]);
                    setRoundNotes([]);
                    setBank((b) => ({ ...b, chips: b.start }));
                  }}
                >
                  Start a new session
                </Btn>
              </div>
            </Panel>
            )}

            {chipsOn && !sessionEnded && (
              <Panel title="Your play record">
                <div style={{ color: C.dim, fontSize: 13, lineHeight: 1.7 }}>
                  Hidden while you are playing for chips. Every move is being checked against the best one — you will
                  see the whole lot, including anything you got wrong and what it cost, when you end the session.
                </div>
              </Panel>
            )}

            <Panel
              title="Hand history"
              right={
                log.length
                  ? `${log.length} hands · ${(() => { const t = log.reduce((a, b) => a + b.net, 0); return (t >= 0 ? "+" : "") + (chipsOn ? t : `${t} u`); })()}`
                  : "nothing yet"
              }
            >
              {log.length === 0 && <div style={{ color: C.dim, fontSize: 13 }}>Nothing played yet.</div>}
              <div style={{ fontSize: 12, ...mono }}>
                {log.slice(0, 14).map((e) => (
                  <div key={e.id} className="flex justify-between py-1" style={{ borderTop: `1px solid ${C.line}` }}>
                    <span style={{ color: C.dim }}>
                      {e.hands} hand{e.hands > 1 ? "s" : ""} · dealer {e.dealer}
                    </span>
                    <span style={{ color: e.net > 0 ? C.sage : e.net < 0 ? C.rose : C.dim }}>
                      {e.net > 0 ? "+" : ""}
                      {chipsOn ? e.net : `${e.net} u`}
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          </>
        )}

        {/* ---------------- RULES ---------------- */}
        {tab === "Rules" && (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <Panel title="Shoe and payouts">
              <Drop label="Decks" value={String(rules.decks)} options={[1, 2, 4, 6, 8].map((d) => ({ v: String(d), l: String(d) }))} onChange={(v) => { setRules({ ...rules, decks: Number(v) }); resetShoe(Number(v)); }} />
              <Drop label="Blackjack pays" value={String(rules.bjPayout)} options={[{ v: "1.5", l: "3:2" }, { v: "1.2", l: "6:5" }, { v: "1", l: "1:1" }]} onChange={(v) => setRules({ ...rules, bjPayout: Number(v) })} />
              <NumField label="How deep they deal" value={rules.penetration} step={0.05} onChange={(v) => setRules({ ...rules, penetration: Math.min(0.95, Math.max(0.3, v)) })} />
              <Toggle label="Dealer peeks for blackjack" on={rules.peek} onChange={(v) => setRules({ ...rules, peek: v })} hint="Off means the dealer takes no second card until you have played. Common in Europe." />
              <Toggle label="Dealer hits soft 17" on={rules.h17} onChange={(v) => setRules({ ...rules, h17: v })} />
            </Panel>
            <Panel title="Player options">
              <Drop label="Surrender" value={rules.surrender} options={[{ v: "none", l: "none" }, { v: "late", l: "late" }, { v: "early", l: "early" }]} onChange={(v) => setRules({ ...rules, surrender: v })} />
              <Drop label="Double on" value={rules.doubleRule} options={[{ v: "any", l: "any two" }, { v: "9-11", l: "9–11" }, { v: "10-11", l: "10–11" }]} onChange={(v) => setRules({ ...rules, doubleRule: v })} />
              <NumField label="Split up to" value={rules.maxSplits} onChange={(v) => setRules({ ...rules, maxSplits: Math.max(0, Math.min(4, v)) })} />
              <Toggle label="Double after split" on={rules.das} onChange={(v) => setRules({ ...rules, das: v })} />
              <Toggle label="Resplit aces" on={rules.resplitAces} onChange={(v) => setRules({ ...rules, resplitAces: v })} />
              <Toggle label="Hit split aces" on={rules.hitSplitAces} onChange={(v) => setRules({ ...rules, hitSplitAces: v })} />
            </Panel>
            <Panel title="What the casino keeps">
              <div style={{ fontSize: 30, fontWeight: 700, color: C.rose, lineHeight: 1.1, ...mono }}>{houseEdge(rules).toFixed(2)}%</div>
              <div style={{ color: C.dim, fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
                The share of your money the casino keeps on average if you play every hand well and bet the same amount each time. These are published figures for each rule. Run the simulator to see what this app itself produces.
              </div>
            </Panel>
          </div>
        )}

        {/* ---------------- COUNTING ---------------- */}
        {tab === "Counting" && (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <Panel title="Live count" right={sys.name}>
              <Row label="Running count" value={rc > 0 ? `+${rc}` : String(rc)} />
              <Row label={sys.balanced ? "True count (what actually matters)" : "This system uses the running count on its own"} value={sys.balanced ? (trueCount >= 0 ? "+" : "") + trueCount.toFixed(2) : "—"} tone={trueCount >= 1 ? C.sage : C.ivory} />
              <Row label="Decks left to play" value={decksLeft.toFixed(2)} />
              <Row label="Aces still in the deck" value={`${comp[1]} of ${rules.decks * 4}`} />
              <Row label="Share of the deck that is tens" value={((comp[10] / Math.max(shoeSize(comp), 1)) * 100).toFixed(1) + "%"} />
              <Row label="Your edge right now" value={(edgePct >= 0 ? "+" : "") + edgePct.toFixed(2) + "%"} tone={edgePct >= 0 ? C.sage : C.rose} />
              <div className="mt-3" style={{ height: 6, background: C.panel2, borderRadius: 3 }}>
                <div style={{ width: `${Math.min(100, (dealt / (rules.decks * 52)) * 100)}%`, height: "100%", borderRadius: 3, background: dealt / (rules.decks * 52) > rules.penetration ? C.rose : C.accent }} />
              </div>
              <div className="flex justify-between mt-1" style={{ fontSize: 11, color: C.dim, ...mono }}>
                <span>{dealt} cards seen</span>
                <span>shuffle at {(rules.penetration * 100).toFixed(0)}%</span>
              </div>
              <div className="mt-3">
                <Btn onClick={() => resetShoe()}>Shuffle and start over</Btn>
              </div>
            </Panel>
            <Panel title="System">
              <Drop label="Counting system" value={system} options={Object.keys(SYSTEMS).map((k) => ({ v: k, l: SYSTEMS[k].name }))} onChange={setSystem} />
              <Row label="How hard it is to use" value={["", "easy", "moderate", "hard"][sys.level]} />
              <Row label="Needs converting to a true count" value={sys.balanced ? "yes" : "no, use the running count"} />
              <Row label="Edge gained per count point" value={sys.gainPerTC.toFixed(2) + "%"} />
              <div className="mt-3" style={{ fontSize: 12, ...mono, color: C.dim }}>
                {RANKS.map((r) => (
                  <span key={r} style={{ display: "inline-block", width: 54 }}>
                    {RANK_LABEL[r]}: {sys.tags[r] > 0 ? "+" : ""}
                    {sys.tags[r]}
                  </span>
                ))}
              </div>
              <div style={{ color: C.dim, fontSize: 11, marginTop: 8 }}>Harder systems follow the deck more closely, but they are easier to get wrong at speed. The list beside this is built for Hi-Lo only.</div>
            </Panel>
            <Panel title="Illustrious 18" right="the count each one needs">
              <div style={{ fontSize: 12, ...mono }}>
                {ILLUSTRIOUS_18.map((row, i) => {
                  const live = system === "hilo" && trueCount >= row[2];
                  return (
                    <div key={i} className="flex justify-between py-1" style={{ color: live ? C.accent : C.dim }}>
                      <span>{row[0]}</span>
                      <span>
                        {row[1]} at {row[2] >= 0 ? "+" : ""}
                        {row[2].toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>
        )}

        {/* ---------------- BANKROLL ---------------- */}
        {tab === "Bankroll" && !isCalc && (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            {!chipsOn && (
              <Panel>
                <div style={{ fontSize: 13, color: C.dim }}>
                  You are in Trainer, so nothing is being staked and hands are scored in units. Switch Playing to For chips on the Table tab to use these numbers.
                </div>
              </Panel>
            )}
            <Panel title="Position">
              <Row label="Chips" value={bank.chips} tone={bank.chips >= bank.start ? C.sage : C.rose} />
              <Row label="Up or down this session" value={(bank.chips - bank.start >= 0 ? "+" : "") + (bank.chips - bank.start)} />
              <Row label="Rounds played" value={log.length} />
              <div className="mt-2">
                <Btn onClick={() => setBank({ ...bank, chips: bank.start })}>Reset chips to start</Btn>
              </div>
            </Panel>
            <Panel title="Limits">
              <NumField label="Starting chips" value={bank.start} step={100} onChange={(v) => setBank({ ...bank, start: v, chips: v })} />
              <NumField label="Minimum bet" value={bank.min} onChange={(v) => setBank({ ...bank, min: v })} />
              <NumField label="Maximum bet" value={bank.max} step={50} onChange={(v) => setBank({ ...bank, max: v })} />
              <Toggle label="Play multiple seats" on={multiSpot} onChange={setMultiSpot} hint="All your boxes are dealt from the same deck." />
              {multiSpot && <NumField label="Seats" value={spots} onChange={(v) => setSpots(Math.max(2, Math.min(5, v)))} />}
            </Panel>
            <Panel title="Risk and bet sizing">
              <Row label="Suggested bet right now" value={Math.round(kelly)} />
              <Row label="Chance of losing it all" value={(ror * 100).toFixed(1) + "%"} tone={ror > 0.2 ? C.rose : C.sage} />
              <Row label="Typical swing over 100 hands" value={Math.round(sd100)} />
              <Row label="What the casino keeps, these rules" value={houseEdge(rules).toFixed(2) + "%"} tone={C.rose} />
              <div style={{ color: C.dim, fontSize: 11, marginTop: 8, lineHeight: 1.6 }}>
                The suggested bet is the size that grows money fastest in theory. It swings hard, so many players bet half of it. Both figures assume your edge stays put, which it does not.
              </div>
            </Panel>
          </div>
        )}

        {/* ---------------- SIMULATOR ---------------- */}
        {tab === "Simulator" && (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <Panel title="Batch run">
              <Drop label="Rounds" value={String(sim.rounds)} options={[10000, 100000, 500000, 1000000].map((n) => ({ v: String(n), l: n.toLocaleString() }))} onChange={(v) => setSim((s) => ({ ...s, rounds: Number(v) }))} />
              <NumField label="How much it raises the bet" value={sim.spread} onChange={(v) => setSim((s) => ({ ...s, spread: Math.max(1, Math.min(20, v)) }))} />
              <Row label="How it plays" value="best move for each hand under your rules" />
              <Row label="How it bets" value={sim.spread > 1 ? `raises the bet using ${sys.name}` : "same bet every hand"} />
              <div className="mt-3 flex gap-2">
                <Btn kind="primary" onClick={runSim} disabled={sim.running}>
                  {sim.running ? `Running ${sim.progress}%` : "Run simulation"}
                </Btn>
                {sim.running && (
                  <Btn onClick={() => { clearTimeout(simRef.current); setSim((s) => ({ ...s, running: false })); }}>Stop</Btn>
                )}
              </div>
              {sim.running && (
                <div className="mt-3" style={{ height: 6, background: C.panel2, borderRadius: 3 }}>
                  <div style={{ width: `${sim.progress}%`, height: "100%", borderRadius: 3, background: C.accent }} />
                </div>
              )}
            </Panel>
            <Panel title="Result">
              {!sim.result && <div style={{ color: C.dim, fontSize: 13 }}>Run a batch to see what these rules actually cost you over a huge number of hands.</div>}
              {sim.result && (
                <>
                  <div style={{ fontSize: 30, fontWeight: 700, color: sim.result.edgePct >= 0 ? C.sage : C.rose, lineHeight: 1.1, ...mono }}>
                    {sim.result.edgePct >= 0 ? "+" : ""}
                    {sim.result.edgePct.toFixed(3)}%
                  </div>
                  <div style={{ color: C.dim, fontSize: 12, marginBottom: 8 }}>your edge on every dollar bet</div>
                  <Row label="Hands played" value={sim.result.rounds.toLocaleString()} />
                  <Row label="Units won or lost" value={(sim.result.net / bank.min).toFixed(1)} />
                  <Row label="Margin of error" value={"±" + sim.result.se.toFixed(3) + "%"} />
                  <Row label="Typical swing per hand" value={(sim.result.sdPerRound / bank.min).toFixed(3)} />
                  <Row label="What the published figures say" value={(-houseEdge(rules)).toFixed(2) + "%"} />
                </>
              )}
            </Panel>
            <Panel title="What this measures">
              <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.7 }}>
                It works out the best move for every hand under your rules, then plays that way through hundreds of thousands of shuffled decks. Set it to raise the bet and it will bet more when the count is good, so the result covers both how you play and how you bet. Compare the answer with the published figure on the Rules tab. At a million hands they should be within a few hundredths of a percent of each other.
              </div>
            </Panel>
          </div>
        )}

        {/* ---------------- FAQ ---------------- */}
        {tab === "FAQ" && (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <Panel title="Using the app">
              <Faq q="What is the difference between Calculator and Simulator?">
                Calculator is for a game happening somewhere else. You type in each card as you see it, and the app
                tells you the best move. There is no money and no score.
                {"\n\n"}
                Simulator deals you hands, and splits into two ways to play. For chips is the real thing: you get no
                help at all and see no scoring until you end the session. Trainer has no chips, scores hands in
                units, marks each hand as it finishes, and lets you ask for the best move whenever you want.
              </Faq>
              <Faq q="What do the three card entry choices do?">
                Dealt for me means the app picks every card at random. I enter the dealer's means you play your own
                hand but type in what the dealer gets, which is how you would follow a real table from your seat. I
                enter every card means you type all of them, for replaying a hand you wrote down.
              </Faq>
              <Faq q="What is the panel for cards seen elsewhere?">
                Cards that go to other players still leave the deck. If you do not record them, the app thinks they
                are still in there and its advice drifts. Tap or type each card you see dealt to anyone else, or
                burned by the dealer.
              </Faq>
            </Panel>

            <Panel title="Scoring your play">
              <Faq q="Which should I use, For chips or Trainer?">
                Trainer while you are learning a decision you keep getting wrong, because it marks you straight away.
                For chips once you want to know how you really do, because nothing interrupts you and nothing is
                given away mid-hand.
              </Faq>
              <Faq q="Does playing for chips stop the app checking my moves?">
                No. Every move is compared with the best one either way. The only difference is when you are told. For
                chips holds all of it back until you press End session, then shows you the lot at once: your accuracy,
                every mistake, and what each one cost.
              </Faq>
              <Faq q="What do the two hint settings do?">
                Only when I ask leaves the numbers hidden and puts a button under the table you can press for the best
                move on any hand. Always show the best move puts it on screen before you act, which is useful when you
                are working through a strategy for the first time.
              </Faq>
              <Faq q="What does 'cost' mean next to a mistake?">
                How much worse your move was than the best one, per dollar bet. A cost of 0.02 is trivial. A cost of
                0.30 is a real error worth remembering.
              </Faq>
              <Faq q="What is the difference between this session and all time?">
                A session runs until you press Start a new session, which also resets your chips and clears the hand
                history. The all-time figure keeps counting across every session and survives closing the page.
              </Faq>
            </Panel>

            <Panel title="Reading the numbers">
              <Faq q="What does EV mean?">
                EV is short for expected value: the average amount you win or lose per dollar bet if you made the same
                play over and over. An EV of +0.20 means you gain twenty cents on the dollar on average. Negative
                means you lose money on average, and sometimes every choice is negative. Then the best move is simply
                the one that loses least.
              </Faq>
              <Faq q="Why is the best move sometimes a losing one?">
                Some hands are bad no matter what you do. Sixteen against a ten is the classic. Every option has
                negative EV, so the app picks the least bad one.
              </Faq>
              <Faq q="What are the dealer percentages?">
                The chance the dealer finishes on each total, or goes bust, given the card you can see. This is the
                basis for everything else the app works out.
              </Faq>
              <Faq q="What does 'the count changes this play' mean?">
                Normally you would play a hand one way, but the cards left in the deck have shifted enough to make a
                different move better. The app shows what the usual play would be so you can see the difference.
              </Faq>
            </Panel>

            <Panel title="Counting">
              <Faq q="What is a running count?">
                You add or subtract a small number for every card you see. Low cards add, high cards subtract. A high
                total means plenty of tens and aces are still to come, which favours you.
              </Faq>
              <Faq q="What is a true count?">
                The running count divided by the number of decks left. Ten extra high cards matter far more with one
                deck left than with six, so this is the number that actually tells you anything.
              </Faq>
              <Faq q="Which counting system should I use?">
                Hi-Lo unless you have a reason not to. It is the simplest, it is accurate enough, and the index plays
                listed on the Counting tab are built for it. The others track the deck a bit more closely at the cost
                of being harder to keep up with.
              </Faq>
              <Faq q="What are the Illustrious 18?">
                The eighteen situations where paying attention to the count changes your move and is worth the most
                money. A line lights up when the count has reached its number.
              </Faq>
              <Faq q="What does 'how deep they deal' mean?">
                How much of the shoe gets used before a shuffle. The further in they go, the more you know about what
                is left, so deeper is better for you.
              </Faq>
            </Panel>

            <Panel title="Money">
              <Faq q="What is the house edge?">
                The share of your money the casino keeps on average, over a long run, if you play well. Half a percent
                means fifty cents lost per hundred dollars bet. The rules you set change this, and blackjack paying
                6:5 instead of 3:2 is the single worst one for you.
              </Faq>
              <Faq q="What is the suggested bet?">
                A bet size scaled to how big your advantage is right now and how much money you have. It is aggressive
                by design. Many players bet half of it to smooth out the swings.
              </Faq>
              <Faq q="What is the chance of losing it all?">
                The odds you run out of money before your advantage has time to show up. Betting a larger share of
                your bankroll pushes this number up fast.
              </Faq>
              <Faq q="What is the typical swing?">
                Roughly how far ahead or behind you can expect to be after a hundred hands, purely from luck. It is
                usually much larger than the edge, which is why short sessions tell you nothing.
              </Faq>
            </Panel>

            <Panel title="Trusting the app">
              <Faq q="What does the batch simulator do?">
                It plays hundreds of thousands of hands against itself using your rules, then reports what actually
                happened. If that number matches the published one on the Rules tab, the engine is working. If it does
                not, something is wrong, and that is worth knowing.
              </Faq>
              <Faq q="What is the margin of error?">
                Simulated results bounce around. This is how much the answer could move by chance. More rounds means a
                smaller number, so treat a result as meaningful only if the gap you care about is bigger than this.
              </Faq>
              <Faq q="How exact is the advice?">
                Close, but not perfect, and deliberately so. Two shortcuts keep it fast. First, the odds of drawing
                each card are taken from the deck as it stands and then held steady while it works through the
                possibilities, instead of updating after every imagined card. Second, splitting is worked out as one
                hand counted twice, and splitting again is not modelled. Both shortcuts move the answer by around a
                hundredth of a percent, which almost never changes the move it recommends.
              </Faq>
              <Faq q="Do the suits matter?">
                No. Only the value counts, and every ten, jack, queen and king is the same card to the engine. Suits
                are drawn purely so the cards look like cards.
              </Faq>
            </Panel>

            <Panel title="One caution">
              <div style={{ color: C.dim, fontSize: 13, lineHeight: 1.7 }}>
                This is built for practice and study at home. Using a device to help you play at a real table is
                against casino rules everywhere, and in some places it is a criminal offence. Counting in your head is
                a different matter, but a casino can still show you the door for it.
              </div>
            </Panel>
          </div>
        )}

        {/* ---------------- SETTINGS ---------------- */}
        {tab === "Settings" && (
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <Panel title="Appearance">
              <Drop label="Theme" value={theme} options={Object.keys(THEMES).map((k) => ({ v: k, l: THEMES[k].label }))} onChange={setTheme} />
              <Drop
                label="Card style"
                value={cardStyle}
                options={[
                  { v: "illustrated", l: "Illustrated" },
                  { v: "simple", l: "Simple" },
                ]}
                onChange={setCardStyle}
              />
              <div className="flex gap-2 mt-3">
                {[1, 10, 7].map((r, i) => (
                  <PlayingCard key={i} rank={r} seed={`swatch${i}${theme}`} />
                ))}
                <PlayingCard rank={5} seed="back" hidden />
              </div>
              <div style={{ color: C.dim, fontSize: 11, marginTop: 8 }}>
                Simple drops the suits and pips and just shows the value. Suits make no difference either way; only the value counts.
              </div>
            </Panel>

            <Panel title="Card entry">
              <Drop
                label="How you enter cards"
                value={inputMethod}
                options={[
                  { v: "tap", l: "Tap a card" },
                  { v: "keyboard", l: "Type the rank" },
                ]}
                onChange={setInputMethod}
              />
              <div style={{ color: C.dim, fontSize: 12, marginTop: 8, lineHeight: 1.7 }}>
                Tapping shows the ten values as cards and greys out any the deck has run out of. Typing accepts A for ace, 2 through 9, and T, J, Q, K or 0 for a ten. You can type anywhere on the page while a card is being asked for, which is quicker when following a real table.
              </div>
            </Panel>
            <Panel title="Stored data">
              <Row label="Settings and chips" value="saved automatically" />
              <Row label="Practice record" value={`${stats.played} decisions`} />
              <div className="mt-3 flex flex-wrap gap-2">
                <Btn kind="danger" small onClick={() => clearStored("config")}>Clear settings</Btn>
                <Btn kind="danger" small onClick={() => clearStored("stats")}>Clear practice record</Btn>
                <Btn kind="danger" small onClick={() => clearStored("all")}>Clear everything</Btn>
              </div>
              {note && <div style={{ color: C.sage, fontSize: 12, marginTop: 8 }}>{note}</div>}
            </Panel>
            <Panel title="Where the app cuts corners">
              <div style={{ color: C.dim, fontSize: 12, lineHeight: 1.7 }}>
                Two shortcuts keep the maths fast. The odds of drawing each card come from the deck as it stands, then stay fixed while the app works through the possibilities, rather than updating after every imagined card. And splitting is worked out as one hand counted twice, with splitting again not modelled, so pairs you would split twice look slightly worse than they are. Each shortcut moves the answer by about a hundredth of a percent.
              </div>
            </Panel>
          </div>
        )}

        <footer className="mt-6" style={{ borderTop: `1px solid ${C.line}`, paddingTop: 16, maxWidth: "70ch" }}>
          <div style={{ color: C.ivory, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>About Upcard</div>
          <p style={{ color: C.dim, fontSize: 12, lineHeight: 1.8 }}>
            Works out the best move in blackjack from the cards still in the deck, and shows the reasoning rather than
            just the answer. Play for chips, practise with hints, or type in a hand you saw elsewhere. Rules, counting
            systems, and bankroll settings are all yours to change, and the simulator will play hundreds of thousands
            of hands to check that the numbers hold up.
          </p>
          <p style={{ color: C.dim, fontSize: 12, lineHeight: 1.8, marginTop: 12 }}>
            Please use it responsibly. It is built for learning and practice away from the table. Using a device to
            help you play at a real one breaks casino rules everywhere and is a criminal offence in some places, so
            do not do it. Nothing here is advice, financial or otherwise, and no result it shows is a prediction of
            what you will actually win or lose. It is offered as is, with no guarantee that any figure is correct.
            You are responsible for how you use it and for following the law where you are. If gambling has stopped
            being fun, or you are betting money you cannot afford to lose, please step away and talk to a support
            service in your area.
          </p>
          <p data-testid="version" style={{ color: C.dim, fontSize: 11, marginTop: 12, ...mono }}>
            {typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev"}
          </p>
        </footer>
      </div>
    </div>
  );
}

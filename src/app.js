/* Attillion: find the rarest right answer.
 * Everything runs in the browser. Accounts, Elo and the leaderboard are kept
 * in this browser's storage until an online backend (Supabase) is connected.
 */
(function () {
"use strict";

/* ---------- constants ---------- */
const ROUNDS = 7;
const ROUND_SECONDS = 30;
const VALID_SHARE = 92;          // GUESS: % of players who give a valid answer
const FAMILIAR = 65;             // the first 65 answers of a list are the ones a fair player could think of
const KRILLION_FROM = 0.75;      // 1 in an Attillion starts 75% of the way down that familiar part
const HADAL_DEPTH = 6000;        // metres where the Attillion zone starts
const MAX_DEPTH = 10935;         // Challenger Deep
const PLAYER_PRIOR = 200;        // how many "virtual answers" the curated list is worth
const START_ELO = 1000;
// Only the owner's account may use a name starting with "Admin".
// GUESS: the owner's username; change it here if Bryan wants a different one.
const OWNER_NAME = "AdminAtticus";
const SFX = (name, gain) => { if (window.KrillionSound) window.KrillionSound.play(name, gain); };

const BOTS = {
  // pick() returns a position in the familiar answers: 0 = most common, 1 = rarest.
  // lucky = chance of launching straight into the Attillion zone on a round.
  minnow:    { name: "Asteroid",  av: "🪨", elo: 800,  miss: 0.15, lucky: 0.04, pick: () => Math.pow(Math.random(), 2.2) * 0.15, blurb: "Says the first thing that drifts by." },
  fish:      { name: "Comet",     av: "☄️", elo: 1100, miss: 0.10, lucky: 0.07, pick: () => Math.pow(Math.random(), 1.5) * 0.35, blurb: "Goes around the block, rarely leaves orbit." },
  barracuda: { name: "Star",      av: "🌟", elo: 1400, miss: 0.07, lucky: 0.12, pick: () => 0.03 + Math.random() * 0.5,         blurb: "Bright, fast, sometimes too clever." },
  shark:     { name: "Black Hole", av: "🕳️", elo: 1700, miss: 0.04, lucky: 0.20, pick: () => 0.06 + Math.random() * 0.69,        blurb: "Pulls in answers nobody else can reach." }
};

// Avatars unlock by your best (peak) Elo, so a losing streak never takes one away.
const AVATARS = [
  { id: "rocket",   e: "🚀", name: "Rocket",         elo: 0 },
  { id: "satellite",e: "🛰️", name: "Satellite",      elo: 0 },
  { id: "moon",     e: "🌙", name: "Crescent moon",  elo: 0 },
  { id: "scope",    e: "🔭", name: "Telescope",      elo: 1050 },
  { id: "astro",    e: "🧑‍🚀", name: "Astronaut",      elo: 1100 },
  { id: "earth",    e: "🌍", name: "Earth",          elo: 1150 },
  { id: "shoot",    e: "🌠", name: "Shooting star",  elo: 1200 },
  { id: "robot",    e: "🤖", name: "Rover bot",      elo: 1275 },
  { id: "fullmoon", e: "🌕", name: "Full moon",      elo: 1350 },
  { id: "planet",   e: "🪐", name: "Ringed planet",  elo: 1425 },
  { id: "star",     e: "⭐", name: "Star",           elo: 1500 },
  { id: "sun",      e: "🌞", name: "Sun",            elo: 1600 },
  { id: "galaxy",   e: "🌌", name: "Galaxy",         elo: 1750 },
  { id: "hole",     e: "🕳️", name: "Black hole",     elo: 1900 },
  // Attillion trophies: unlocked by how many 1 in an Attillions you have found.
  { id: "k10",      e: "☄️", name: "Comet",           krill: 10 },
  { id: "k20",      e: "🌘", name: "Eclipse",         krill: 20 },
  { id: "gdragon",  e: "🪐", name: "Golden Saturn",   krill: 50 },
  { id: "rdragon",  e: "🌌", name: "Rainbow Nebula",  krill: 100 },
  // Secret avatars: only unlocked by typing a code in Settings. Codes are
  // stored as hashes so they don't show up as plain text in the page source.
  { id: "alien",    e: "👽", name: "Alien",          code: 32697793 },
  { id: "ufo",      e: "🛸", name: "Flying saucer",  code: 477561382 },
  { id: "spacedog", e: "🐕", name: "Space dog",      code: 1213739381 },
  { id: "cheese",   e: "🧀", name: "Moon cheese",    code: 190172967 },
  { id: "dev",      e: "👾", name: "Developer",      code: 3929745284, dev: true },
  { id: "rdev",     e: "👾", name: "Rainbow Developer", code: 3751850430, dev: true },
  { id: "gdev",     e: "👾", name: "Gold Developer", code: 762634016, dev: true }
];
// Bundle codes unlock a whole group at once.
const BUNDLES = [
  { id: "krill-all", code: 1175683394, name: "every Attillion trophy", pick: "rdragon" },
  { id: "krill-all", code: 2284514118, name: "every Attillion trophy", pick: "rdragon" }   // the old code still works
];
function codeHash(raw) { return hashStr("krillion-code:" + String(raw).toUpperCase().replace(/[^A-Z0-9]/g, "")); }
function redeemed(u) { return u ? (u.codes || []) : store.get("guestCodes", []); }
function krillCount(u) { return u ? (u.krillions || []).length : store.get("guestKrillions", []).length; }
function isOpen(a, u) {
  if (a.code) return redeemed(u).includes(a.id);
  if (a.krill) return krillCount(u) >= a.krill || redeemed(u).includes("krill-all");
  return a.elo === 0 || (u && a.elo <= u.peak);
}
function avatarById(x) { return AVATARS.find(a => a.id === x || a.e === x) || null; }
// Avatars are drawn through this so special ones (gold, rainbow) get their effect everywhere.
function avMarkup(a) { return a ? `<span class="avg av-${a.id}">${a.e}</span>` : ""; }
// "Played like": maps a score to the Elo of a computer opponent that averages it.
const PERF = [[0, 400], [134, 800], [294, 1100], [450, 1400], [547, 1700], [700, 2300]];
function perfElo(points, rounds) {
  const t = Math.max(0, Math.min(700, points * ROUNDS / Math.max(1, rounds)));
  for (let i = 1; i < PERF.length; i++) {
    const [x0, y0] = PERF[i - 1], [x1, y1] = PERF[i];
    if (t <= x1) return Math.round((y0 + (y1 - y0) * (t - x0) / (x1 - x0)) / 10) * 10;
  }
  return 2300;
}

const ZONES = [
  { key: "sunlight", name: "Sky",          min: 0 },
  { key: "twilight", name: "Stratosphere", min: 200 },
  { key: "midnight", name: "Orbit",        min: 1000 },
  { key: "abyss",    name: "Moon",         min: 4000 },
  { key: "hadal",    name: "1 in an Attillion", min: HADAL_DEPTH }
];

// Rarity is stored as a "depth" number (0 to 10,935) and shown as how high you climbed:
// Sky 0-12 km, Stratosphere 12-100 km, Orbit 100-36,000 km, Moon 36,000-384,400 km,
// then 1 in an Attillion: past the Moon toward the edge of the Solar System.
const ALT_D = [0, 200, 1000, 4000, 6000, 10935];
const ALT_KM = [0, 12, 100, 36000, 384400, 18e9];
function altitudeKm(depth) {
  for (let i = 0; i < ALT_D.length - 1; i++) {
    if (depth <= ALT_D[i + 1] || i === ALT_D.length - 2) {
      const f = Math.max(0, Math.min(1, (depth - ALT_D[i]) / (ALT_D[i + 1] - ALT_D[i])));
      if (i === 0) return ALT_KM[1] * f;
      return Math.exp(Math.log(ALT_KM[i]) + f * (Math.log(ALT_KM[i + 1]) - Math.log(ALT_KM[i])));
    }
  }
  return ALT_KM[ALT_KM.length - 1];
}
function altText(depth) {
  const km = altitudeKm(depth);
  if (km >= 1e9) return (km / 1e9).toFixed(1).replace(/\.0$/, "") + " billion km";
  if (km >= 1e6) return (km / 1e6).toFixed(1).replace(/\.0$/, "") + " million km";
  if (km < 10) return km.toFixed(1).replace(/\.0$/, "") + " km";
  return Math.round(km).toLocaleString() + " km";
}

/* ---------- safe storage ---------- */
const mem = {};
const store = {
  get(k, d) { try { const v = localStorage.getItem("krillion:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return k in mem ? mem[k] : d; } },
  set(k, v) { mem[k] = v; try { localStorage.setItem("krillion:" + k, JSON.stringify(v)); } catch (e) {} }
};

/* ---------- text matching ---------- */
function norm(s) {
  return String(s || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/^(the|a|an) /, "");
}
function singular(s) {
  if (s.length > 4 && s.endsWith("ies")) return s.slice(0, -3) + "y";
  if (s.length > 4 && /(ches|shes|xes|ses|oes)$/.test(s)) return s.slice(0, -2);
  if (s.length > 3 && s.endsWith("s") && !s.endsWith("ss")) return s.slice(0, -1);
  return s;
}
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i), pp = prev;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // swapped neighbours ("pualing" for "pauling") count as one typo
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    pp = prev; prev = cur;
  }
  return prev[b.length];
}

/* ---------- prompt bank ---------- */
// entries: [{ forms: [...] }] in order from most to least common.
// familiarCount: how many of them a fair player could think of (bots and
// "down in the trench" examples only use those).
function buildPrompt(id, q, entries, familiarCount, extra) {
  const answers = []; const index = new Map();
  entries.forEach(e => {
    const keys = e.forms.map(norm).filter(k => k && !index.has(k));
    if (!keys.length) return;
    const i = answers.length;
    answers.push({ display: e.forms[0], keys });
    keys.forEach(k => { index.set(k, i); const s = singular(k); if (!index.has(s) && (!extra || !extra.test || extra.test(s))) index.set(s, i); });
  });
  let H = 0; answers.forEach((_, r) => { H += 1 / (r + 1); });
  answers.forEach((a, r) => { a.base = VALID_SHARE * (1 / (r + 1)) / H; });
  // The most common answer sits at the surface (0 m). 1 in an Attillion starts
  // 75% of the way down the familiar answers; anything past them also counts.
  const familiar = Math.max(4, Math.min(answers.length, familiarCount));
  const krillFrom = Math.min(answers.length - 1, Math.floor(familiar * KRILLION_FROM));
  const zeroShare = answers[0].base;
  const krillShare = answers[krillFrom].base;
  return Object.assign({ id, q, answers, index, zeroShare, krillShare, familiar, krillFrom }, extra || {});
}

/* Twists change how you search a list instead of shrinking it to a handful of
   answers: "Name a fruit with no E in it", "...that's two or more words".
   Each variant keeps the base list's common-to-rare order, and is only used when
   plenty of answers (and plenty of familiar ones) still fit. */
const letters = k => k.replace(/[^a-z]/g, "");
const TWISTS = [
  ...["e", "a", "i", "o"].map(x => ({ key: "no" + x, fam: "no", test: k => !k.includes(x), label: `with no “${x.toUpperCase()}” in it` })),
  { key: "noae", fam: "no", test: k => !/[ae]/.test(k), label: "with no “A” or “E” in it", hard: true },
  { key: "words2", fam: "words", test: k => k.includes(" "), label: "that's two or more words" },
  { key: "word1", fam: "words", test: k => !k.includes(" ") && letters(k).length >= 6, label: "that's one word, 6+ letters" },
  { key: "short", fam: "len", test: k => letters(k).length <= 5, label: "that's 5 letters or fewer" },
  { key: "long", fam: "len", test: k => letters(k).length >= 10, label: "that's 10+ letters long" },
  { key: "len7", fam: "len", test: k => letters(k).length === 7, label: "with exactly 7 letters" },
  { key: "dbl", fam: "dbl", test: k => /([a-z])\1/.test(k), label: "with a double letter, like “LL” or “EE”" },
  { key: "uniq", fam: "dbl", test: k => { const l = letters(k); return new Set(l).size === l.length; }, label: "with no letter used twice" },
  { key: "vowel", fam: "start", test: k => /^[aeiou]/.test(k), label: "that starts with a vowel" },
  { key: "nz", fam: "start", test: k => /^[n-z]/.test(k), label: "that starts with a letter from N to Z" },
  ...["b", "c", "m", "p", "s", "t"].map(x => ({ key: "s" + x, fam: "start", test: k => k.startsWith(x), label: `that starts with “${x.toUpperCase()}”` })),
  { key: "endv", fam: "end", test: k => /[aeiouy]$/.test(k), label: "that ends in a vowel or Y" },
  { key: "endc", fam: "end", test: k => /[^aeiouy]$/.test(k), label: "that ends in a consonant", easy: true },
  { key: "same", fam: "end", test: k => { const l = letters(k); return l.length > 2 && l[0] === l[l.length - 1]; }, label: "that starts and ends with the same letter", hard: true },
  { key: "vow3", fam: "vow", test: k => (k.match(/[aeiou]/g) || []).length >= 4, label: "with four or more vowels" }
];
// a twist must leave this many answers, and this many familiar ones
const TWIST_MIN = 30, TWIST_MIN_FAMILIAR = 18, TWIST_MIN_HARD = 18, TWIST_MIN_FAMILIAR_HARD = 10;
const BASES = []; const PROMPTS = []; const VARIANTS = {};
(window.KRILLION_PROMPTS || []).forEach(p => {
  const entries = p.a.split(";").map(e => ({ forms: e.split("|").map(s => s.trim()).filter(Boolean) })).filter(e => e.forms.length);
  const base = buildPrompt(p.id, p.q, entries, FAMILIAR, { baseId: p.id });
  BASES.push(base); PROMPTS.push(base); VARIANTS[p.id] = [];
  TWISTS.forEach(t => {
    let familiarHits = 0;
    const kept = [];
    entries.forEach((e, i) => {
      const forms = e.forms.filter(f => t.test(norm(f)));
      if (!forms.length) return;
      kept.push({ forms }); if (i < FAMILIAR) familiarHits++;
    });
    if (kept.length < (t.hard ? TWIST_MIN_HARD : TWIST_MIN) || familiarHits < (t.hard ? TWIST_MIN_FAMILIAR_HARD : TWIST_MIN_FAMILIAR)) return;
    // a twist that barely filters the list isn't a twist
    if (t.easy || kept.length > entries.length * 0.8) { if (kept.length > entries.length * 0.6) return; }
    const v = buildPrompt(p.id + "~" + t.key, p.q + " " + t.label, kept, familiarHits, { baseId: p.id, baseQ: p.q, twist: t.label, test: t.test, fam: t.fam });
    PROMPTS.push(v); VARIANTS[p.id].push(v.id);
  });
});
const PROMPT_BY_ID = Object.fromEntries(PROMPTS.map(p => [p.id, p]));

function matchAnswer(prompt, raw) {
  const k = norm(raw);
  if (!k) return -1;
  if (prompt.index.has(k)) return prompt.index.get(k);
  const s = singular(k);
  if (prompt.index.has(s)) return prompt.index.get(s);
  // Spelling forgiveness grows with length: 1 typo from 4 letters, 2 from 6, 3 from 13.
  const tight = k.replace(/ /g, "");
  const tolFor = n => n < 4 ? 0 : n < 6 ? 1 : n < 13 ? 2 : 3;
  const tol = tolFor(tight.length);
  if (!tol) return -1;
  let best = -1, bestD = Infinity;
  for (const [key, i] of prompt.index) {
    const kt = key.replace(/ /g, "");
    const allowed = Math.min(tol, tolFor(kt.length));
    if (!allowed) continue;
    let d = lev(tight, kt, allowed);
    if (d > allowed) continue;
    if (tight[0] !== kt[0]) d += 0.5;           // prefer answers that start the same way
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

/* ---------- rarity + scoring ---------- */
// Player answers recorded on this device. With an online backend these counts
// would be global, so rarity would follow what real players actually say.
function counts() { return store.get("counts", {}); }
function recordAnswer(promptId, idx) {
  if (idx < 0) return;
  const c = counts(); c[promptId] = c[promptId] || { n: 0, a: {} };
  c[promptId].n++; c[promptId].a[idx] = (c[promptId].a[idx] || 0) + 1;
  store.set("counts", c);
}
function share(prompt, idx, fixed) {
  const base = prompt.answers[idx].base;
  if (fixed) return base;
  const c = counts()[prompt.id];
  if (!c || !c.n) return base;
  return (base * PLAYER_PRIOR + 100 * (c.a[idx] || 0)) / (PLAYER_PRIOR + c.n);
}
function depthFor(sh, prompt) {
  const ZERO_SHARE = prompt.zeroShare, KRILLION_SHARE = prompt.krillShare;
  if (sh >= ZERO_SHARE) return 0;
  if (sh <= KRILLION_SHARE) {
    const t = Math.min(1, Math.log(KRILLION_SHARE / Math.max(sh, 0.02)) / Math.log(KRILLION_SHARE / 0.02) * 3);
    return Math.round(HADAL_DEPTH + t * (MAX_DEPTH - HADAL_DEPTH));
  }
  return Math.round(HADAL_DEPTH * Math.log(ZERO_SHARE / sh) / Math.log(ZERO_SHARE / KRILLION_SHARE));
}
function zoneFor(depth) { let z = ZONES[0]; ZONES.forEach(x => { if (depth >= x.min) z = x; }); return z; }
function scoreAnswer(prompt, raw, fixed) {
  const idx = matchAnswer(prompt, raw);
  if (idx < 0) return { raw: raw || "", idx: -1, points: 0, depth: 0, share: 0, zone: null, valid: false };
  const sh = share(prompt, idx, fixed);
  const depth = depthFor(sh, prompt);
  const points = sh <= prompt.krillShare ? 100 : Math.max(2, Math.min(97, Math.round(100 * depth / HADAL_DEPTH)));
  return { raw, idx, display: prompt.answers[idx].display, points, depth, share: sh, zone: zoneFor(depth), valid: true };
}
function oneIn(sh) { return sh <= 0 ? "" : "about 1 in " + Math.max(1, Math.round(100 / sh)).toLocaleString(); }

/* ---------- seeded picking ---------- */
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Picks 7 different topics; 2 or 3 of them get a twist ("...with no E in it").
// Topics this player saw recently are skipped when possible.
function pickSet(seed, seenList) {
  const seen = new Set(seenList || []);
  const r = rng(seed);
  const ids = BASES.map(p => p.id);
  for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
  const bases = ids.filter(id => !seen.has(id)).concat(ids.filter(id => seen.has(id))).slice(0, ROUNDS);
  const twistable = bases.map((id, i) => i).filter(i => VARIANTS[bases[i]].length);
  const want = r() < 0.5 ? 2 : 3;
  const twistSlots = new Set();
  while (twistSlots.size < Math.min(want, twistable.length)) twistSlots.add(twistable[Math.floor(r() * twistable.length)]);
  // no two twists of the same kind in one game
  const usedFam = new Set();
  return bases.map((id, i) => {
    if (!twistSlots.has(i)) return id;
    // pick a kind of twist first, so the many "no E / no O" variants don't crowd out the rest
    const fams = [...new Set(VARIANTS[id].map(v => PROMPT_BY_ID[v].fam))].filter(f => !usedFam.has(f));
    if (!fams.length) return id;
    const fam = fams[Math.floor(r() * fams.length)];
    const vs = VARIANTS[id].filter(v => PROMPT_BY_ID[v].fam === fam);
    const pick = vs[Math.floor(r() * vs.length)];
    usedFam.add(PROMPT_BY_ID[pick].fam);
    return pick;
  });
}
function pickPrompts(seed) { return pickSet(seed, []); }
function markSeen(ids) {
  const baseIds = ids.map(id => id.split("~")[0]);
  const seen = store.get("seenPrompts", []).map(id => id.split("~")[0]).filter(id => !baseIds.includes(id)).concat(baseIds);
  store.set("seenPrompts", seen.slice(-Math.floor(BASES.length * 0.8)));
}
function pickFresh(seed) { return pickSet(seed, store.get("seenPrompts", [])); }
function todayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dailyNumber(key) { return Math.floor((Date.parse(key + "T12:00:00") - Date.parse("2026-11-21T12:00:00")) / 864e5) + 1; }

/* ---------- accounts + Elo ---------- */
// Local accounts: stored in this browser only. Replace with Supabase auth
// when the online backend is set up.
function users() { return store.get("users", {}); }
function saveUsers(u) { store.set("users", u); }
function unlockedAvatars(u) { return AVATARS.filter(a => isOpen(a, u)); }
function isDevAvatar(markup) { return /av-[rg]?dev"/.test(String(markup)); }
function myAvatarObj() {
  const u = me();
  const id = u ? u.avatar : store.get("guestAvatar", "rocket");
  return unlockedAvatars(u).find(x => x.id === id) || AVATARS[0];
}
function myAvatar() { return avMarkup(myAvatarObj()); }
function curOppName() {
  return S.mode === "bot" ? BOTS[S.level].name : S.mode === "challenge-guest" ? S.challenge.from : S.mode === "live" && S.live ? S.live.opp.name : null;
}
function oppAvatar() {
  if (S.mode === "bot") return BOTS[S.level].av;
  if (S.mode === "live" && S.live) return avMarkup(avatarById(S.live.opp.av) || AVATARS[0]);
  if (S.mode === "challenge-guest") { const a = S.challenge && avatarById(S.challenge.av); return a ? avMarkup(a) : "🚀"; }
  return "🚀";
}
function me() { const n = store.get("session", null); const u = users(); return n && u[n.toLowerCase()] ? u[n.toLowerCase()] : null; }
async function hashPw(name, pw) {
  const text = "krillion:" + name.toLowerCase() + ":" + pw;
  try {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  } catch (e) { return "h" + hashStr(text).toString(16) + hashStr(text + "!").toString(16); }
}
function nameProblem(name, currentKey) {
  const key = name.toLowerCase();
  if (!/^[A-Za-z0-9_-]{2,20}$/.test(name)) return "Use 2 to 20 letters, numbers, - or _.";
  if (key.startsWith("admin") && key !== OWNER_NAME.toLowerCase()) return "Usernames can't start with “Admin”.";
  if (Object.values(BOTS).some(b => b.name.toLowerCase() === key)) return "That name belongs to a computer opponent.";
  if (key !== currentKey && users()[key]) return "That username is taken.";
  return "";
}
function newUser(name, hash) {
  return { name, hash, elo: START_ELO, peak: START_ELO, games: 0, wins: 0, losses: 0, draws: 0, daily: {}, history: [], created: Date.now() };
}
function updateUser(fn) { const u = me(); if (!u) return null; const all = users(); fn(all[u.name.toLowerCase()]); saveUsers(all); return all[u.name.toLowerCase()]; }
function eloDelta(mine, theirs, result, games) {
  const k = games < 10 ? 40 : 24;
  const expected = 1 / (1 + Math.pow(10, (theirs - mine) / 400));
  return Math.round(k * (result - expected));
}
function applyMatchResult(oppName, oppElo, myTotal, oppTotal, kind, matchId) {
  const u = me(); if (!u) return null;
  const result = myTotal > oppTotal ? 1 : myTotal < oppTotal ? 0 : 0.5;
  let delta = 0;
  updateUser(x => {
    if (matchId && x.history.some(h => h.id === matchId)) return;
    delta = eloDelta(x.elo, oppElo, result, x.games);
    x.elo += delta; x.peak = Math.max(x.peak, x.elo); x.games++;
    if (result === 1) x.wins++; else if (result === 0) x.losses++; else x.draws++;
    x.history.unshift({ id: matchId || String(Date.now()), when: Date.now(), kind, opp: oppName, oppElo, me: myTotal, them: oppTotal, delta });
    x.history = x.history.slice(0, 50);
  });
  return { delta, result };
}

/* ---------- computer opponent ---------- */
function botAnswer(level, prompt) {
  const b = BOTS[level];
  if (Math.random() < b.miss) return "";
  const n = prompt.familiar;
  const idx = Math.random() < b.lucky
    ? prompt.krillFrom + Math.floor(Math.random() * (n - prompt.krillFrom))   // a lucky deep dive
    : Math.min(n - 1, Math.floor(b.pick() * n));
  return prompt.answers[idx].display;
}

/* ---------- challenge codes ---------- */
function b64e(obj) { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64d(s) { s = s.trim().replace(/^.*[#?&](c|r)=/, "").replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return JSON.parse(decodeURIComponent(escape(atob(s)))); }
function canLink() { return /^https?:/.test(location.protocol) && !/claude\.ai|claudeusercontent/.test(location.host); }
function linkFor(kind, code) { return location.origin + location.pathname + "#" + kind + "=" + code; }

/* ---------- state ---------- */
let S = { view: "home" };
let timer = null;
const $app = () => document.getElementById("app");
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function go(view, extra) {
  if (S.view === "queue" && view !== "queue") queueStop();
  if (S.live && view !== "play" && view !== "results") {
    // walking out of a live match counts as a loss
    if (S.view === "play" && !S.live.done) applyMatchResult(S.live.opp.name, S.live.opp.elo, 0, 1, "quick", S.live.name);
    liveStop(S.live);
  }
  clearInterval(timer); if (window.KrillionFX && window.KrillionFX.clear) window.KrillionFX.clear(); S = Object.assign({ view }, extra || {}); render(); window.scrollTo(0, 0); }

/* ---------- match flow ---------- */
function startMatch(opts) {
  // opts: { mode: "bot"|"daily"|"challenge-host"|"challenge-guest", level, seed, prompts, opp }
  const seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 2 ** 31);
  const prompts = opts.prompts || pickFresh(seed);
  markSeen(prompts);
  go("play", {
    mode: opts.mode, level: opts.level, seed, prompts, round: 0,
    mine: [], theirs: opts.theirsRaw ? opts.theirsRaw.slice() : [],
    opp: opts.opp || null, live: opts.live || null, challenge: opts.challenge || null, dailyKey: opts.dailyKey || null,
    phase: "answer"
  });
  beginRound();
}
function fixedRarity() { return S.mode === "live" || S.mode === "daily" || S.mode === "solo" || S.mode === "challenge-host" || S.mode === "challenge-guest"; }
function beginRound() {
  S.phase = "answer"; S.deadline = Date.now() + ROUND_SECONDS * 1000; S.draft = "";
  S.botLockAt = S.mode === "bot" ? Date.now() + (3 + Math.random() * 19) * 1000 : null;
  S.submittedAt = null; S.lastTick = null;
  if (S.live) { S.live.at = S.round; livePresence(); }
  render();
  const input = document.getElementById("answer"); if (input) input.focus();
  clearInterval(timer);
  timer = setInterval(tick, 100);
}
function tick() {
  if (S.view !== "play") { clearInterval(timer); return; }
  const now = Date.now();
  if (S.phase === "answer") {
    const left = Math.max(0, S.deadline - now);
    const secs = Math.ceil(left / 1000);
    const t = document.getElementById("clock"); if (t) t.textContent = secs;
    if (secs <= 5 && secs > 0 && secs !== S.lastTick) { S.lastTick = secs; SFX("tick"); }
    const ring = document.getElementById("ring"); if (ring) ring.style.setProperty("--p", (left / (ROUND_SECONDS * 1000)).toFixed(3));
    const ol = document.getElementById("opplock");
    if (ol && S.botLockAt) ol.classList.toggle("on", now >= S.botLockAt);
    if (ol && S.live) ol.classList.toggle("on", liveOppAnswered(S.round));
    if (left <= 0) submit(true);
  } else if (S.phase === "waiting" && !S.live) {
    if (now >= S.botLockAt || now >= S.deadline) reveal();
  }
}
function submit(timeUp) {
  if (S.phase !== "answer") return;
  const input = document.getElementById("answer");
  const val = input ? input.value.trim() : (S.draft || "");
  if (!timeUp) {
    const prompt = PROMPT_BY_ID[S.prompts[S.round]];
    let msg = !val ? "Type an answer first." : matchAnswer(prompt, val) < 0 ? `“${val}” isn't on the list for this prompt. Try another.` : "";
    if (msg && val && prompt.twist && matchAnswer(PROMPT_BY_ID[prompt.baseId], val) >= 0) msg = `“${val}” fits the topic but not the twist. It has to be ${prompt.twist.replace(/^that /, "one that ").replace(/^with/, "one with")}.`;
    if (msg) {
      const err = document.getElementById("answer-error");
      if (err) err.textContent = msg;
      if (input) { input.classList.remove("nope"); void input.offsetWidth; input.classList.add("nope"); input.select(); }
      SFX("error");
      return;
    }
  }
  S.mine[S.round] = val;
  if (!timeUp) SFX("lock");
  if (S.mode === "bot" && Date.now() < S.botLockAt && !timeUp) { S.phase = "waiting"; render(); return; }
  if (S.live) {
    S.live.ans[S.round] = val; livePresence();
    if (!liveOppAnswered(S.round) && !S.live.gone) { S.phase = "waiting"; render(); return; }
  }
  reveal();
}
function reveal() {
  clearInterval(timer);
  const prompt = PROMPT_BY_ID[S.prompts[S.round]];
  if (S.mode === "bot") S.theirs[S.round] = botAnswer(S.level, prompt);
  if (S.live) S.theirs[S.round] = liveOppAnswer(S.round);
  const fixed = fixedRarity();
  S.lastMine = scoreAnswer(prompt, S.mine[S.round], fixed);
  S.lastTheirs = (S.mode === "daily" || S.mode === "solo" || S.mode === "challenge-host") ? null : scoreAnswer(prompt, S.theirs[S.round], fixed);
  if (S.mode !== "daily") { recordAnswer(prompt.id, S.lastMine.idx); }
  S.scores = S.scores || []; S.oppScores = S.oppScores || [];
  S.scores[S.round] = S.lastMine; if (S.lastTheirs) S.oppScores[S.round] = S.lastTheirs;
  if (S.lastMine.points === 100) {
    const found = { q: prompt.twist ? prompt.baseQ + " " + prompt.twist : prompt.q, a: S.lastMine.display, depth: S.lastMine.depth, share: S.lastMine.share, when: Date.now(),
      mode: S.mode === "bot" ? "vs " + BOTS[S.level].name : S.mode === "live" ? "Quick match" : S.mode === "daily" ? "Daily Launch" : S.mode === "solo" ? "Free Launch" : "Friend challenge" };
    const before = krillCount(me());
    if (me()) updateUser(x => { x.krillions = (x.krillions || []); x.krillions.unshift(found); x.krillions = x.krillions.slice(0, 500); });
    else { const g = store.get("guestKrillions", []); g.unshift(found); store.set("guestKrillions", g.slice(0, 500)); }
    const unlocked = AVATARS.find(a => a.krill && before < a.krill && krillCount(me()) >= a.krill);
    S.unlockNote = unlocked ? unlocked : null;
  } else S.unlockNote = null;
  S.phase = "reveal";
  render();
  const btn = document.getElementById("next"); if (btn) btn.focus();
  playReveal();
}
function playReveal() {
  const FX = window.KrillionFX; if (!FX) return;
  const mineCard = document.querySelector(".ans.mine"), theirCard = document.querySelector(".ans.theirs");
  const oppName = curOppName() || "";
  const hitMine = S.lastMine.points === 100;
  const dMe = document.querySelector(".diver.me"), dOpp = document.querySelector(".diver.opp");
  requestAnimationFrame(() => requestAnimationFrame(() => { if (dMe) dMe.classList.add("go"); }));
  if (mineCard) {
    FX.countUp(mineCard.querySelector(".pts b"), S.lastMine.points, 900);
    FX.reveal(mineCard, S.lastMine.valid ? S.lastMine.zone.key : null, "you", { devTakeover: ["rdev", "gdev"].includes(myAvatarObj().id) ? myAvatarObj().id : null });
    SFX(S.lastMine.valid ? S.lastMine.zone.key : "miss");
    FX.countUp(document.getElementById("pod-me"), total(S.scores), 900);
  }
  if (theirCard) {
    const delay = hitMine ? 2900 : 1100;
    setTimeout(() => {
      if (!document.body.contains(theirCard)) return;
      theirCard.classList.remove("pending");
      if (dOpp) { dOpp.classList.remove("pending"); dOpp.classList.add("go"); }
      FX.countUp(theirCard.querySelector(".pts b"), S.lastTheirs.points, 900);
      FX.reveal(theirCard, S.lastTheirs.valid ? S.lastTheirs.zone.key : null, oppName);
      SFX(S.lastTheirs.valid ? S.lastTheirs.zone.key : "miss", 0.6);
      FX.countUp(document.getElementById("pod-opp"), total(S.oppScores), 900);
      const lead = document.getElementById("lead"); if (lead) lead.textContent = leadText(oppName);
    }, delay);
  }
}
function leadText(oppName) {
  const a = total(S.scores), b = total(S.oppScores);
  return a === b ? "Tied" : a > b ? `You lead by ${a - b}` : `${oppName} leads by ${b - a}`;
}
function nextRound() {
  if (S.live && S.round < ROUNDS - 1) {
    if (S.phase !== "reveal") return;
    // both players move on together
    S.phase = "next-wait"; S.live.at = S.round + 1; livePresence();
    const b = document.getElementById("next");
    if (b) { b.disabled = true; b.textContent = `Waiting for ${S.live.opp.name}…`; }
    liveCheck();
    return;
  }
  if (S.round < ROUNDS - 1) { S.round++; beginRound(); }
  else finishMatch();
}
function total(list) { return (list || []).reduce((s, x) => s + (x ? x.points : 0), 0); }
function finishMatch() {
  const my = total(S.scores), their = total(S.oppScores);
  const res = { my, their };
  if (S.mode === "bot") {
    const b = BOTS[S.level];
    res.elo = applyMatchResult(b.name + " (computer)", b.elo, my, their, "computer");
  } else if (S.mode === "live") {
    const L = S.live;
    res.elo = applyMatchResult(L.opp.name, L.opp.elo, my, their, "quick", L.name);
    res.forfeit = L.gone;
    L.done = true; L.at = ROUNDS; livePresence();
    setTimeout(() => liveStop(L), 5000);   // stay a moment so they get our last answer
  } else if (S.mode === "solo") {
    const before = soloStats().best;
    const run = { score: my, when: Date.now() };
    const upd = x => { x.best = Math.max(x.best || 0, my); x.plays = (x.plays || 0) + 1; x.runs = [run].concat(x.runs || []).slice(0, 20); };
    if (me()) updateUser(x => { x.solo = x.solo || {}; upd(x.solo); });
    else { const g = store.get("guestSolo", {}); upd(g); store.set("guestSolo", g); }
    res.newBest = my > before; res.prevBest = before;
  } else if (S.mode === "daily") {
    const entry = { score: my, answers: S.scores.map(s => ({ raw: s.raw, points: s.points, depth: s.depth })), when: Date.now() };
    if (me()) updateUser(x => { if (!x.daily[S.dailyKey]) x.daily[S.dailyKey] = entry; });
    else { const g = store.get("guestDaily", {}); if (!g[S.dailyKey]) g[S.dailyKey] = entry; store.set("guestDaily", g); }
  } else if (S.mode === "challenge-host") {
    const u = me();
    const code = b64e({ v: 1, id: S.challenge.id, seed: S.seed, p: S.prompts, from: u ? u.name : (S.challenge.name || "A friend"), elo: u ? u.elo : null, av: myAvatarObj().id, a: S.mine });
    res.code = code;
    const sent = store.get("sentChallenges", {}); sent[S.challenge.id] = { when: Date.now(), my, mine: S.mine, prompts: S.prompts }; store.set("sentChallenges", sent);
  } else if (S.mode === "challenge-guest") {
    const c = S.challenge;
    const u = me();
    if (c.elo != null) res.elo = applyMatchResult(c.from, c.elo, my, their, "friend", c.id);
    res.code = b64e({ v: 1, id: c.id, reply: true, p: S.prompts, av: myAvatarObj().id, from: u ? u.name : "Your friend", elo: u ? u.elo - (res.elo ? res.elo.delta : 0) : null, a: S.mine, host: c.a, hostName: c.from });
  }
  S.result = res;
  S.view = "results";
  render();
  const hasOpp = S.mode === "bot" || S.mode === "challenge-guest" || S.mode === "live";
  SFX(!hasOpp ? "win" : my > their ? "win" : my < their ? "lose" : "tie");
}


/* ---------- quick match ----------
 * Uses the shared page's live room (window.claude "room" capability): everyone who
 * has Attillion open right now. Searchers put a card in their presence; every page
 * runs the same pairing (closest Elo, window widening the longer you wait) and two
 * players are matched once each names the other. The match then runs in its own
 * named room, where each player's presence carries their answers round by round.
 * Presence is visible to the room, so a determined player could peek at answers
 * early; the game never shows them before the round ends. */
let roomP = null, Q = null;
function getRoom() {
  if (!roomP) {
    const c = window.claude;
    roomP = c && typeof c.use === "function" ? Promise.resolve(c.use("room")).catch(() => null) : Promise.resolve(null);
  }
  return roomP;
}
function myCard() { const u = me(); return { name: u ? u.name : "Guest pilot", elo: u ? u.elo : START_ELO, av: myAvatarObj().id }; }
function cleanCard(p, field) {   // everything in presence is untrusted
  const q = p && p.presence && p.presence[field];
  if (!q || typeof q !== "object") return null;
  const elo = Math.max(100, Math.min(3500, Math.round(+q.elo) || START_ELO));
  const name = String(q.name || "").replace(/[^\p{L}\p{N} _.-]/gu, "").trim().slice(0, 20) || "Pilot";
  return { peer: p.peer, name, elo, av: avatarById(String(q.av)) ? String(q.av) : "rocket", t: +q.t || 0, want: typeof q.want === "string" ? q.want : null };
}
function eloWindow(waitMs) { return Math.min(800, 150 + Math.floor(Math.max(0, waitMs) / 5000) * 75); }
function pairUp(list, now) {
  list.sort((a, b) => a.t - b.t || (a.peer < b.peer ? -1 : 1));
  const used = new Set(), pairs = new Map();
  for (const a of list) {
    if (used.has(a.peer)) continue;
    let best = null;
    for (const b of list) {
      if (b === a || used.has(b.peer)) continue;
      const d = Math.abs(a.elo - b.elo);
      if (d <= Math.max(eloWindow(now - a.t), eloWindow(now - b.t)) && (!best || d < Math.abs(a.elo - best.elo))) best = b;
    }
    if (best) { used.add(a.peer); used.add(best.peer); pairs.set(a.peer, best); pairs.set(best.peer, a); }
  }
  return pairs;
}
let lobbyPeers = 0;
function onlineText() { return lobbyPeers > 1 ? `${lobbyPeers} players online` : lobbyPeers === 1 ? "Just you online" : ""; }
getRoom().then(room => {
  if (!room) return;
  room.onPeers(ch => {
    lobbyPeers = ch.peers.filter(p => p.kind === "viewer").length;
    const el = document.getElementById("online"); if (el) el.textContent = onlineText();
    if (Q) queueUpdate();
  }, () => {});
});

function queueStart() {
  const me_ = { since: Date.now(), want: null, matched: false, peer: null };
  Q = me_;
  getRoom().then(room => {
    if (Q !== me_) return;
    if (!room) { me_.none = true; queueText(); return; }
    me_.room = room;
    room.presence({ q: Object.assign(myCard(), { t: me_.since, want: null }) }).catch(() => {});
    me_.timer = setInterval(queueUpdate, 1000);
    queueUpdate();
  });
}
function queueStop() {
  if (!Q) return;
  clearInterval(Q.timer);
  if (Q.room && !Q.matched) Q.room.presence({ q: null }).catch(() => {});
  Q = null;
}
function queueUpdate() {
  if (!Q || !Q.room || Q.matched) return;
  const peers = Q.room.peers();
  const mine = peers.find(p => p.sameTab);
  if (!mine) { queueText(); return; }
  Q.peer = mine.peer;
  // other tabs of your own are not opponents
  const list = peers.filter(p => p.kind === "viewer" && !p.sameTab && !p.isMe).map(p => cleanCard(p, "q")).filter(Boolean);
  list.push(Object.assign({ peer: Q.peer, t: Q.since, want: Q.want }, myCard()));
  Q.searching = list.length;
  const partner = pairUp(list, Date.now()).get(Q.peer) || null;
  const want = partner ? partner.peer : null;
  if (want !== Q.want) { Q.want = want; Q.room.presence({ q: Object.assign(myCard(), { t: Q.since, want }) }).catch(() => {}); }
  if (partner && partner.want === Q.peer) { liveJoin(partner); return; }
  queueText();
}
function queueText() {
  const t = document.getElementById("q-text"), h = document.getElementById("q-title"), x = document.getElementById("q-extra");
  if (!t || !Q) return;
  if (Q.none) {
    h.textContent = "Quick match needs the shared Attillion page";
    t.textContent = "Live matches run through the Attillion page on Claude, where everyone it's shared with can play. This copy can't reach other players, but the computer and friend challenges still work.";
    if (x) x.hidden = false;
    return;
  }
  const waited = Date.now() - Q.since;
  if (Q.matched) { h.textContent = "Match found!"; t.textContent = "Diving in…"; return; }
  const others = Math.max(0, (Q.searching || 1) - 1);
  t.textContent = `${lobbyPeers || 1} online · ${others} other${others === 1 ? "" : "s"} searching · looking within ±${eloWindow(waited)} Elo · ${Math.floor(waited / 1000)}s`;
  if (x) x.hidden = waited < 30000;
}
function viewQueue() {
  const c = myCard();
  const near = Object.entries(BOTS).reduce((a, b) => Math.abs(b[1].elo - c.elo) < Math.abs(a[1].elo - c.elo) ? b : a);
  setTimeout(() => { if (!Q) queueStart(); queueText(); }, 0);
  return `${header()}<main class="queue">
    <div class="queue-card">
      <div class="sonar" aria-hidden="true"><i></i><i></i><i></i><span class="sonar-av">${myAvatar()}</span></div>
      <h1 id="q-title">Finding a player near ${c.elo}</h1>
      <p id="q-text" class="q-text">Connecting…</p>
      <div class="row center">
        <button class="btn ghost" data-act="quick-cancel">Cancel</button>
      </div>
      <div id="q-extra" class="q-extra" hidden>
        <p>Nobody close yet. You can keep waiting, or play the computer instead.</p>
        <button class="btn primary" data-act="bot" data-level="${near[0]}">Play ${near[1].name} (${near[1].elo})</button>
      </div>
    </div>
  </main>`;
}

async function liveJoin(opp) {
  const q = Q; q.matched = true; clearInterval(q.timer); queueText();
  const lobby = q.room;
  const [a, b] = [q.peer, opp.peer].sort();
  const ta = a === q.peer ? q.since : opp.t, tb = a === q.peer ? opp.t : q.since;
  const seed = hashStr("quick:" + a + "|" + b + "|" + ta + "|" + tb);
  const name = "km-" + seed.toString(36) + "-" + hashStr(b + a + tb).toString(36);
  // keep our lobby card (naming them) up until they arrive, so they see the match too
  let mr = null;
  try { mr = await lobby.join(name); } catch (e) { mr = null; }
  if (Q !== q) { if (mr) mr.leave().catch(() => {}); return; }
  if (!mr) { lobby.presence({ q: null }).catch(() => {}); Q = null; go("queue"); return; }
  const L = { room: mr, name, seed, opp, oppPeer: opp.peer, ans: Array(ROUNDS).fill(null), at: 0, gone: false, goneAt: null, done: false };
  mr.presence({ hi: myCard(), at: 0, ans: L.ans }).catch(() => {});
  // wait for them to arrive in the match room
  const arrived = await new Promise(res => {
    const until = Date.now() + 15000;
    const check = () => {
      if (mr.peers().some(p => p.peer === opp.peer)) return res(true);
      if (Date.now() > until || Q !== q) return res(false);
      setTimeout(check, 250);
    };
    check();
  });
  lobby.presence({ q: null }).catch(() => {});
  if (!arrived || Q !== q) { mr.leave().catch(() => {}); if (Q === q) { Q = null; go("queue"); } return; }
  Q = null;   // the search is over
  L.unsub = mr.onPeers(() => liveCheck(), () => { L.gone = true; liveCheck(); });
  L.poll = setInterval(liveCheck, 500);
  SFX("lock");
  startMatch({ mode: "live", seed, prompts: pickPrompts(seed), live: L });
}
function livePresence() {
  const L = S.live; if (!L || L.stopped) return;
  L.room.presence({ hi: myCard(), at: L.at, ans: L.ans, done: L.done || null }).catch(() => {});
}
function liveOpp() { const L = S.live; return L && !L.stopped ? L.room.peers().find(p => p.peer === L.oppPeer) || null : null; }
function liveOppAnswerRaw(r) { const o = liveOpp(); const a = o && Array.isArray(o.presence.ans) ? o.presence.ans[r] : null; return typeof a === "string" ? a.slice(0, 60) : null; }
function liveOppAnswered(r) { return liveOppAnswerRaw(r) != null; }
function liveOppAnswer(r) { const a = liveOppAnswerRaw(r); return a == null ? "" : a; }
function liveCheck() {
  const L = S.live;
  if (!L || L.stopped || S.view !== "play") return;
  const o = liveOpp();
  if (!o) { if (!L.goneAt) L.goneAt = Date.now(); if (!L.gone && Date.now() - L.goneAt > 8000) { L.gone = true; liveGoneNote(); } }
  else L.goneAt = null;
  const at = o && Number.isFinite(+o.presence.at) ? +o.presence.at : -1;
  if (S.phase === "waiting" && (liveOppAnswered(S.round) || L.gone || Date.now() > S.deadline + 8000)) reveal();
  else if (S.phase === "next-wait" && (at > S.round || L.gone)) { S.round++; beginRound(); }
}
function liveGoneNote() {
  const ol = document.getElementById("opplock");
  if (ol) { ol.classList.remove("on"); ol.textContent = `${S.live.opp.name} left the match. Finish your rounds and the win is yours.`; }
  const w = document.querySelector(".waiting");
  if (S.phase === "waiting" && w) reveal();
}
function liveStop(L) {
  if (!L || L.stopped) return;
  L.stopped = true;
  clearInterval(L.poll);
  if (L.unsub) L.unsub();
  L.room.leave().catch(() => {});
}

function deviceMode() { const v = store.get("device", "auto"); return ["auto", "phone", "ipad", "computer"].includes(v) ? v : "auto"; }
function setDeviceMode(v) { store.set("device", v); applyDeviceMode(); }
function applyDeviceMode() { const v = deviceMode(); if (v === "auto") delete document.documentElement.dataset.device; else document.documentElement.dataset.device = v; }
applyDeviceMode();
// picking an avatar plays the full 1 in an Attillion moment with it
function celebrateAvatar(id) {
  const a = avatarById(id); if (!a) return;
  SFX("hadal");
  const el = document.querySelector(`[data-act="avatar"][data-id="${id}"]`) || document.querySelector(".avbtn");
  if (window.KrillionFX && window.KrillionFX.celebrate) window.KrillionFX.celebrate(el, a.id, avMarkup(a), a.name);
}

/* ---------- views ---------- */
function header() {
  const u = me();
  return `<header class="top">
    <button class="brand" data-go="home" aria-label="Attillion home"><span class="mark" aria-hidden="true"></span>Attillion</button>
    <nav>
      <button data-go="leaderboard">Leaderboard</button>
      <button data-go="settings" class="avbtn" aria-label="Change your avatar" title="Change your avatar">${myAvatar()}</button>
      ${u ? `<button data-go="profile" class="chip">${esc(u.name)} · <b>${u.elo}</b></button>` : `<button data-go="login" class="chip">Log in</button>`}
    </nav>
  </header>`;
}

function viewHome() {
  const u = me();
  const key = todayKey();
  const done = u ? u.daily[key] : store.get("guestDaily", {})[key];
  return `${header()}
  <main class="home">
    <section class="hero">
      <p class="eyebrow">7 prompts · 30 seconds each · up to 100 points a round</p>
      <h1>Think of the answer <em>nobody else</em> will.</h1>
      <p class="lede">Every prompt has hundreds of right answers. Common ones barely leave the ground and score almost nothing. Rare ones launch higher. Find one of the truly rare answers, the few that almost nobody thinks of, and you break past the Moon: <strong>1 in an Attillion</strong>, a full 100 points.</p>
      ${depthLegend()}
    </section>

    <section class="modes">
      <article class="mode quick">
        <div class="mode-head"><h2>Quick match</h2><span class="tag" id="online">${onlineText()}</span></div>
        <p>Get paired with a real player near your Elo who is here right now. You both get the same 7 prompts at the same time, and answers are shown together at the end of each round.</p>
        <button class="btn primary" data-act="quick">Find a match</button>
      </article>
      <article class="mode daily">
        <div class="mode-head"><h2>Daily Launch #${dailyNumber(key)}</h2><span class="tag">${esc(key)}</span></div>
        <p>Seven prompts, the same for everyone today. Rarity is locked for the day so every score is comparable.</p>
        ${done ? `<p class="done">You scored <b>${done.score}</b> today. New launch at midnight.</p><button class="btn ghost" data-act="daily-view">See today's result</button>`
               : `<button class="btn primary" data-act="daily">Start today's launch</button>`}
      </article>

      <article class="mode solo">
        <div class="mode-head"><h2>Free Launch</h2>${soloStats().best ? `<span class="tag">Best ${soloStats().best}</span>` : ""}</div>
        <p>Seven new prompts every time, as many times as you like. Just you against your own high score.</p>
        <button class="btn primary" data-act="solo">Launch</button>
      </article>

      <article class="mode friends">
        <div class="mode-head"><h2>Play a friend</h2></div>
        <p>Play your 7 rounds, send the challenge, and your friend plays the same prompts. After each round they see what you said. Same answers are allowed.</p>
        <div class="row">
          <button class="btn primary" data-act="challenge-new">Create a challenge</button>
          <button class="btn ghost" data-go="join">Enter a code</button>
        </div>
      </article>

      <article class="mode bots">
        <div class="mode-head"><h2>Play the computer</h2></div>
        <div class="bots-grid">
          ${Object.entries(BOTS).map(([k, b]) => `
            <button class="bot bot-${k}" data-act="bot" data-level="${k}">
              <span class="bot-name">${b.name}</span>
              <span class="bot-elo">${b.elo}</span>
              <span class="bot-blurb">${esc(b.blurb)}</span>
            </button>`).join("")}
        </div>
        ${u ? "" : `<p class="hint"><button class="link" data-go="login">Log in</button> to save your Elo. Guests can still play.</p>`}
      </article>
    </section>
    ${layoutBar()}
  </main>`;
}
function layoutBar() {
  return `<div class="layout-bar"><span>Layout</span><div class="seg-pick" role="group" aria-label="Screen layout">
    ${[["auto", "✨", "Auto"], ["phone", "📱", "Phone"], ["ipad", "📲", "iPad"], ["computer", "💻", "Computer"]].map(([v, ic, l]) => `<button data-act="device" data-v="${v}" aria-pressed="${deviceMode() === v}"><span aria-hidden="true">${ic}</span>${l}</button>`).join("")}
  </div></div>`;
}
function soloStats() { const u = me(); const x = (u ? u.solo : store.get("guestSolo", {})) || {}; return { best: x.best || 0, plays: x.plays || 0, runs: x.runs || [] }; }

function depthLegend() {
  return `<ol class="legend" aria-label="Depth zones">
    ${ZONES.map((z, i) => `<li class="z-${z.key}"><span class="zn">${z.name}</span><span class="zd">${i === ZONES.length - 1 ? "past the Moon" : altText(z.min) + "+"}</span></li>`).join("")}
  </ol>`;
}

function viewPlay() {
  const prompt = PROMPT_BY_ID[S.prompts[S.round]];
  const oppName = curOppName();
  const revealing = S.phase === "reveal";
  const prevMine = total(S.scores) - (revealing && S.lastMine ? S.lastMine.points : 0);
  const prevOpp = total(S.oppScores) - (revealing && S.lastTheirs ? S.lastTheirs.points : 0);
  const pod = (name, list, id, prev, cls, note) => `<div class="pod ${cls}">
      <span class="pod-name">${esc(name)}</span>
      <b class="pod-total" id="${id}" data-from="${prev}">${note ? "?" : prev}</b>
      <div class="pod-rounds" aria-hidden="true">${Array.from({ length: ROUNDS }, (_, i) => {
        const r = list && list[i];
        const fresh = revealing && i === S.round;
        return `<span class="seg ${r ? (r.valid ? "z-" + r.zone.key : "miss") : ""} ${fresh ? "fresh" : ""}" style="--h:${r ? Math.max(8, r.points) : 0}%"></span>`;
      }).join("")}</div>
      ${note ? `<span class="pod-note">${note}</span>` : ""}
    </div>`;
  const oppLabel = oppName || (S.mode === "challenge-host" ? "Your friend" : null);
  const scoreLine = `<div class="scoreboard ${oppLabel ? "duo" : "solo"}">
      ${pod("You", S.scores, "pod-me", prevMine, "me")}
      <div class="sb-mid"><span class="sb-round">Round ${S.round + 1}/${ROUNDS}</span>${oppName ? `<span class="sb-lead" id="lead">${S.round === 0 && !revealing ? "First launch" : leadTextAt(oppName, prevMine, prevOpp)}</span>` : S.mode === "daily" ? `<span class="sb-lead">Daily Launch</span>` : S.mode === "solo" ? `<span class="sb-lead">Free Launch</span>` : ""}</div>
      ${oppLabel ? pod(oppLabel, oppName ? S.oppScores : null, "pod-opp", prevOpp, "opp", oppName ? "" : "plays after you") : ""}
    </div>`;
  let body = "";
  if (S.phase === "answer" || S.phase === "waiting") {
    body = `
      <div class="prompt-card">
        <div class="ring" id="ring" style="--p:1"><span id="clock">${ROUND_SECONDS}</span></div>
        <p class="round-label">Round ${S.round + 1} of ${ROUNDS}</p>
        <h2 class="prompt">${promptTitle(prompt)}</h2>
        ${S.phase === "answer" ? `
        <form id="answer-form" autocomplete="off">
          <label for="answer" class="sr">Your answer</label>
          <input id="answer" maxlength="60" placeholder="Type the rarest answer you can" autocapitalize="off" spellcheck="false">
          <button class="btn primary" type="submit">Lock in</button>
        </form>
        <p class="answer-error" id="answer-error" role="alert"></p>` : `<p class="waiting">Locked in: <b>${esc(S.mine[S.round] || "(blank)")}</b>. Waiting for ${esc(oppName)}…</p>`}
        ${oppName ? `<p class="opp-status" id="opplock">${S.live && S.live.gone ? `${esc(oppName)} left the match. Finish your rounds and the win is yours.` : S.mode === "challenge-guest" ? `${esc(oppName)} already answered. You'll see it at the end of the round.` : `<span class="dot"></span>${esc(oppName)} is thinking`}</p>` : ""}
      </div>`;
  } else {
    body = revealBlock(prompt, oppName);
  }
  return `${header()}<main class="play">
    ${scoreLine}
    ${body}
  </main>`;
}

function promptTitle(p) { return p.twist ? `${esc(p.baseQ)} <span class="twist">${esc(p.twist)}</span>` : esc(p.q); }
// Where an answer's avatar ends up in the sky column (percent from the top).
// Rarer answers climb higher; a miss stays on the launch pad at the bottom.
function diveY(r) {
  if (!r || !r.valid) return 93;
  // each zone is a 20% band, the rarest at the top; stay below the band's label
  const bounds = [0, 200, 1000, 4000, 6000, MAX_DEPTH];
  for (let z = 0; z < 5; z++) {
    if (r.depth <= bounds[z + 1] || z === 4) {
      const f = Math.min(1, (r.depth - bounds[z]) / (bounds[z + 1] - bounds[z]));
      return (4 - z) * 20 + 16 - f * 9;
    }
  }
  return 8;
}
function diveColumn(oppName) {
  const zones = ZONES.slice().reverse().map(z => `<div class="band z-${z.key}"><span>${z.name}</span></div>`).join("");
  // The Developer creature turns gold in the Attillion zone, and spins when tapped.
  const diver = (cls, av, label, r) => { const gold = isDevAvatar(av) && r && r.points === 100; return `<div class="diver ${cls} ${r && r.valid ? "" : "miss"} ${gold ? "golden" : ""}" style="--y:${diveY(r).toFixed(1)}%" ${gold ? `data-act="spin" title="Tap me"` : ""}><span class="av">${av}</span><span class="tag">${esc(label)}${isDevAvatar(av) ? ` <i class="devtag">DEV</i>` : ""}</span></div>`; };
  return `<div class="dive ${S.lastTheirs ? "duo" : "solo"}" aria-hidden="true">${zones}
    ${diver("me", myAvatar(), "You", S.lastMine)}
    ${S.lastTheirs ? diver("opp pending", oppAvatar(), oppName, S.lastTheirs) : ""}
  </div>`;
}
function leadTextAt(oppName, a, b) { return a === b ? "Tied" : a > b ? `You lead by ${a - b}` : `${esc(oppName)} leads by ${b - a}`; }
function answerCard(label, r, me_) {
  if (!r) return "";
  const depthPct = r.valid ? Math.min(100, (r.depth / MAX_DEPTH) * 100) : 0;
  return `<div class="ans ${me_ ? "mine" : "theirs pending"} ${r.valid ? "z-" + r.zone.key : "invalid"}">
    <p class="who">${esc(label)}</p>
    <p class="said">${r.valid ? esc(r.display) : r.raw ? esc(r.raw) : "<i>no answer</i>"}</p>
    ${r.valid ? `
      ${norm(r.raw) !== norm(r.display) ? `<p class="matched">you typed “${esc(r.raw)}”</p>` : ""}
      <div class="gauge" aria-hidden="true"><span style="--d:${depthPct.toFixed(1)}%"></span></div>
      <p class="pts"><b>0</b> pts</p>
      <p class="meta">${r.zone.name} · ${altText(r.depth)} up · ${oneIn(r.share)}</p>
      <p class="played">Played like <b>${perfElo(r.points, 1).toLocaleString()}</b></p>`
    : `<p class="pts"><b>0</b> pts</p><p class="meta">${r.raw ? "Not on our list for this prompt" : "Time ran out"}</p><p class="played">Played like <b>${perfElo(0, 1).toLocaleString()}</b></p>`}
  </div>`;
}

function revealBlock(prompt, oppName) {
  const deep = prompt.answers.slice(prompt.krillFrom, prompt.familiar).map((a, i) => ({ a, i }));
  const r = rng(hashStr(prompt.id + S.seed));
  const samples = []; const pool = deep.slice();
  while (samples.length < 4 && pool.length) samples.push(pool.splice(Math.floor(r() * pool.length), 1)[0].a.display);
  const same = S.lastTheirs && S.lastMine.valid && S.lastTheirs.valid && S.lastMine.idx === S.lastTheirs.idx;
  return `<div class="reveal">
    <p class="round-label">Round ${S.round + 1} of ${ROUNDS}</p>
    <h2 class="prompt small">${promptTitle(prompt)}</h2>
    <div class="reveal-grid">
    ${diveColumn(oppName)}
    <div class="answers">
      ${answerCard("You", S.lastMine, true)}
      ${S.lastTheirs ? answerCard(oppName, S.lastTheirs, false) : ""}
    </div>
    </div>
    ${same ? `<p class="same">Same answer. You both score it.</p>` : ""}
    ${S.unlockNote ? `<p class="unlock-note">That's Attillion #${S.unlockNote.krill}! You unlocked the ${avMarkup(S.unlockNote)} <b>${S.unlockNote.name}</b>. <button class="link" data-go="settings">Use it</button></p>` : ""}
    <p class="trench">Up among the stars: ${samples.map(esc).join(", ")}</p>
    <button class="btn primary" id="next" data-act="next">${S.round < ROUNDS - 1 ? "Next prompt" : "See results"}</button>
  </div>`;
}

function viewResults() {
  const res = S.result;
  const oppName = curOppName();
  const verdict = !oppName ? "" : res.my > res.their ? "You win" : res.my < res.their ? `${esc(oppName)} wins` : "It's a tie";
  const rows = S.prompts.map((id, i) => {
    const m = S.scores[i], t = S.oppScores[i];
    return `<tr><td class="q">${esc(PROMPT_BY_ID[id].q)}</td><td>${esc(m.raw || "–")}</td><td class="n">${m.points}</td>${oppName ? `<td>${esc(t ? t.raw || "–" : "–")}</td><td class="n">${t ? t.points : 0}</td>` : ""}</tr>`;
  }).join("");
  let extra = "";
  if (res.elo) {
    const sign = res.elo.delta > 0 ? "+" : "";
    extra += `<p class="elo-change">Elo ${sign}${res.elo.delta} → <b>${me().elo}</b></p>`;
  } else if (oppName && !me()) {
    extra += `<p class="hint"><button class="link" data-go="login">Log in</button> to have games count toward your Elo.</p>`;
  }
  if (S.mode === "live" && res.forfeit) extra += `<p class="hint">${esc(oppName)} left before the end, so their missing rounds scored 0.</p>`;
  if (S.mode === "solo") {
    const st = soloStats();
    extra += res.newBest && res.prevBest > 0 ? `<p class="best-note">New personal best! Up from ${res.prevBest}.</p>`
      : res.newBest ? `<p class="best-note">Your first Free Launch score. Now beat it.</p>`
      : `<p class="hint">Your best Free Launch: <b>${st.best}</b> · ${st.plays} launch${st.plays === 1 ? "" : "es"} so far</p>`;
  }
  if (S.mode === "daily") {
    extra += `<div class="share"><pre id="share-text">${esc(dailyShare(S.dailyKey, S.scores))}</pre><button class="btn ghost" data-act="copy" data-target="share-text">Copy result</button></div>`;
  }
  if (S.mode === "challenge-host") {
    extra += codeBox("Send this to your friend", res.code, "c",
      "They'll play the same 7 prompts and see your answer after each round. When they finish, they'll get a reply code. Paste it under Enter a code to see who won.");
  }
  if (S.mode === "challenge-guest") {
    extra += codeBox(`Send this back to ${esc(S.challenge.from)}`, res.code, "r", "Their game updates when they paste it under Enter a code.");
  }
  return `${header()}<main class="results">
    <p class="eyebrow">${S.mode === "live" ? "Quick match" : S.mode === "solo" ? "Free Launch" : S.mode === "daily" ? "Daily Launch #" + dailyNumber(S.dailyKey) : S.mode === "bot" ? "vs " + BOTS[S.level].name : S.mode === "challenge-host" ? "Challenge created" : "Challenge from " + esc(S.challenge.from)}</p>
    <h1>${verdict || `You scored ${res.my}`}</h1>
    <div class="totals">
      <div><span>${myAvatar()} You</span><b>${res.my}</b><em>played like ${perfElo(res.my, ROUNDS).toLocaleString()}</em></div>
      ${oppName ? `<div><span>${oppAvatar()} ${esc(oppName)}</span><b>${res.their}</b><em>played like ${perfElo(res.their, ROUNDS).toLocaleString()}</em></div>` : ""}
      <div class="of">out of ${ROUNDS * 100}</div>
    </div>
    ${extra}
    <div class="table-wrap"><table class="breakdown"><thead><tr><th>Prompt</th><th>You</th><th>Pts</th>${oppName ? `<th>${esc(oppName)}</th><th>Pts</th>` : ""}</tr></thead><tbody>${rows}</tbody></table></div>
    <div class="row">
      ${S.mode === "live" ? `<button class="btn primary" data-act="quick">Find another match</button>` : ""}
      ${S.mode === "solo" ? `<button class="btn primary" data-act="solo">Launch again</button>` : ""}
      ${S.mode === "bot" ? `<button class="btn primary" data-act="bot" data-level="${S.level}">Rematch ${BOTS[S.level].name}</button>` : ""}
      <button class="btn ghost" data-go="home">Back to Earth</button>
    </div>
  </main>`;
}

function codeBox(title, code, kind, note) {
  const link = canLink() ? linkFor(kind, code) : null;
  return `<div class="codebox">
    <h3>${title}</h3>
    ${link ? `<label for="share-link">Link</label><textarea id="share-link" readonly rows="2">${esc(link)}</textarea><button class="btn primary" data-act="copy" data-target="share-link">Copy link</button>` : ""}
    <label for="share-code">Code</label><textarea id="share-code" readonly rows="3">${esc(code)}</textarea>
    <button class="btn ${link ? "ghost" : "primary"}" data-act="copy" data-target="share-code">Copy code</button>
    <p class="hint">${note}</p>
  </div>`;
}

function dailyShare(key, scores) {
  const blocks = scores.map(s => !s.valid ? "⬛" : s.points === 100 ? "🌟" : s.depth >= 4000 ? "🟪" : s.depth >= 1000 ? "🟦" : s.depth >= 200 ? "🟩" : "⬜").join("");
  const krill = scores.filter(s => s.points === 100).length;
  return `Attillion Daily Launch #${dailyNumber(key)}\n${blocks}\n${total(scores)}/700${krill ? ` · ${krill}× 1 in an Attillion` : ""}`;
}

function viewDailyDone() {
  const key = todayKey();
  const u = me();
  const done = u ? u.daily[key] : store.get("guestDaily", {})[key];
  const prompts = pickPrompts(hashStr("daily:" + key));
  const scores = done.answers.map((a, i) => scoreAnswer(PROMPT_BY_ID[prompts[i]], a.raw, true));
  return `${header()}<main class="results">
    <p class="eyebrow">Daily Launch #${dailyNumber(key)}</p>
    <h1>You scored ${done.score}</h1>
    <div class="share"><pre id="share-text">${esc(dailyShare(key, scores))}</pre><button class="btn ghost" data-act="copy" data-target="share-text">Copy result</button></div>
    <div class="table-wrap"><table class="breakdown"><thead><tr><th>Prompt</th><th>You</th><th>Depth</th><th>Pts</th></tr></thead><tbody>
    ${prompts.map((id, i) => `<tr><td class="q">${esc(PROMPT_BY_ID[id].q)}</td><td>${esc(scores[i].raw || "–")}</td><td class="n">${altText(scores[i].depth)}</td><td class="n">${scores[i].points}</td></tr>`).join("")}
    </tbody></table></div>
    <button class="btn ghost" data-go="home">Back to Earth</button>
  </main>`;
}

function viewLogin() {
  const mode = S.mode || "login";
  return `${header()}<main class="narrow">
    <h1>${mode === "login" ? "Log in" : "Create an account"}</h1>
    <p class="lede small">Your Elo, match history and Daily Launch scores are saved to your account.</p>
    <form id="auth-form" class="stack" autocomplete="on">
      <label for="auth-name">Username</label>
      <input id="auth-name" name="username" required minlength="2" maxlength="20" pattern="[A-Za-z0-9_\\-]+" autocomplete="username">
      <label for="auth-pw">Password</label>
      <input id="auth-pw" name="password" type="password" required minlength="4" autocomplete="${mode === "login" ? "current-password" : "new-password"}">
      <p class="error" id="auth-error" role="alert">${esc(S.error || "")}</p>
      <button class="btn primary" type="submit">${mode === "login" ? "Log in" : "Create account"}</button>
    </form>
    <p class="hint">${mode === "login" ? `New here? <button class="link" data-act="auth-mode" data-m="signup">Create an account</button>` : `Have an account? <button class="link" data-act="auth-mode" data-m="login">Log in</button>`}</p>
    <p class="note">Preview build: accounts are saved in this browser only. Online accounts arrive when the game is connected to a server.</p>
  </main>`;
}

function viewProfile() {
  const u = me(); if (!u) return viewLogin();
  const dailies = Object.entries(u.daily).sort((a, b) => b[0].localeCompare(a[0]));
  return `${header()}<main class="narrow">
    <p class="eyebrow">Pilot profile</p>
    <h1>${esc(u.name)}</h1>
    <div class="stats">
      <div><span>Elo</span><b>${u.elo}</b></div>
      <div><span>Peak</span><b>${u.peak}</b></div>
      <div><span>Record</span><b>${u.wins}–${u.losses}${u.draws ? "–" + u.draws : ""}</b></div>
      <div><span>Best free launch</span><b>${(u.solo && u.solo.best) || "–"}</b></div>
      <div><span>Best daily</span><b>${dailies.length ? Math.max(...dailies.map(d => d[1].score)) : "–"}</b></div>
      <div class="gold"><span>Attillions</span><b>${(u.krillions || []).length}</b></div>
    </div>
    <h2>Your 1 in an Attillions</h2>
    ${(u.krillions || []).length ? `<div class="krill-wall">${u.krillions.slice(0, 60).map(k => `
      <div class="krill-card">
        <p class="kc-a">${esc(k.a)}</p>
        <p class="kc-q">${esc(k.q)}</p>
        <p class="kc-m">${new Date(k.when).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${esc(k.mode)} · ${altText(k.depth)}</p>
      </div>`).join("")}</div>` : `<p class="hint">None yet. Find an answer almost nobody would say and it will be saved here.</p>`}
    <h2>Recent matches</h2>
    ${u.history.length ? `<div class="table-wrap"><table class="breakdown"><thead><tr><th>Opponent</th><th>Score</th><th>Elo</th></tr></thead><tbody>
      ${u.history.slice(0, 15).map(h => `<tr><td>${esc(h.opp)}</td><td class="n">${h.me}–${h.them}</td><td class="n ${h.delta >= 0 ? "up" : "down"}">${h.delta >= 0 ? "+" : ""}${h.delta}</td></tr>`).join("")}
    </tbody></table></div>` : `<p class="hint">No matches yet. Try Minnow to warm up.</p>`}
    <h2>Daily Launches</h2>
    ${dailies.length ? `<ul class="dives">${dailies.slice(0, 10).map(([k, d]) => `<li><span>#${dailyNumber(k)} · ${k}</span><b>${d.score}</b></li>`).join("")}</ul>` : `<p class="hint">You haven't dived yet today.</p>`}
    <div class="row"><button class="btn ghost" data-go="settings">Settings</button><button class="btn ghost" data-act="logout">Log out</button></div>
  </main>`;
}

function viewSettings() {
  const u = me();
  const peak = u ? u.peak : 0;
  const current = myAvatarObj().e + myAvatarObj().id;
  return `${header()}<main class="narrow">
    <p class="eyebrow">Settings</p>
    <h1>Your avatar</h1>
    <p class="lede small">This is you on the launch tower. Rarer answers send it higher. New avatars unlock as your best Elo climbs.${u ? ` Your best so far is <b>${peak}</b>.` : ""}</p>
    ${u ? "" : `<p class="hint"><button class="link" data-go="login">Log in</button> to earn Elo and unlock more avatars.</p>`}
    <div class="avatars">
      ${AVATARS.filter(a => !a.code || isOpen(a, u)).map(a => {
        const open = isOpen(a, u);
        const sel = a.e + a.id === current;
        return `<button class="avatar ${sel ? "on" : ""}" ${open ? `data-act="avatar" data-id="${a.id}"` : "disabled"} aria-pressed="${sel}">
          <span class="ae">${avMarkup(a)}</span><span class="an">${a.name}${a.dev ? ` <i class="devtag">DEV</i>` : a.code ? ` <i class="secrettag">secret</i>` : ""}</span>
          <span class="al">${open ? (sel ? "Selected" : "Pick") : a.krill ? `🔒 ${a.krill} Attillions` : `🔒 ${a.elo} Elo`}</span>
        </button>`;
      }).join("")}
    </div>
    <form id="code-form" class="code-row">
      <label for="unlock-code">Have a code?</label>
      <input id="unlock-code" maxlength="32" placeholder="Type a code" autocomplete="off" autocapitalize="characters" spellcheck="false">
      <button class="btn primary small" type="submit">Unlock</button>
    </form>
    <p class="error" id="code-msg" role="alert">${esc(S.codeMsg || "")}</p>

    <h2>Screen</h2>
    ${layoutBar()}
    <p class="hint">Auto fits whatever screen you're on. Pick one to use that layout anywhere. Saved on this device.</p>

    <h2>Sound</h2>
    <div class="setting-row">
      <label for="vol">Volume</label>
      <input id="vol" type="range" min="0" max="100" step="5" value="${Math.round((window.KrillionSound ? window.KrillionSound.volume : 0.5) * 100)}">
      <output id="vol-out" for="vol">${Math.round((window.KrillionSound ? window.KrillionSound.volume : 0.5) * 100)}%</output>
      <button class="btn ghost small" data-act="sound-test">Test</button>
    </div>
    <p class="hint">Set it to 0% to turn sound off. Saved on this device.</p>

    ${u ? `
    <h2>Account</h2>
    <form id="rename-form" class="stack">
      <label for="new-name">New username</label>
      <input id="new-name" required minlength="2" maxlength="20" value="${esc(u.name)}" autocomplete="username">
      <label for="rename-pw">Current password</label>
      <input id="rename-pw" type="password" required autocomplete="current-password">
      <p class="error" role="alert">${esc(S.renameMsg || "")}</p>
      <button class="btn primary" type="submit">Change username</button>
    </form>
    <form id="pw-form" class="stack">
      <label for="old-pw">Current password</label>
      <input id="old-pw" type="password" required autocomplete="current-password">
      <label for="new-pw">New password</label>
      <input id="new-pw" type="password" required minlength="4" autocomplete="new-password">
      <p class="error" role="alert">${esc(S.pwMsg || "")}</p>
      <button class="btn primary" type="submit">Change password</button>
    </form>` : ""}
  </main>`;
}

function viewLeaderboard() {
  const tab = S.tab || "elo";
  const all = Object.values(users());
  const key = todayKey();
  let rows;
  if (tab === "elo") {
    const avOf = u => avMarkup(AVATARS.find(x => x.id === u.avatar && isOpen(x, u)) || AVATARS[0]);
    const list = all.map(u => ({ av: avOf(u), name: u.name, raw: u.name, val: u.elo, sub: `${u.wins}–${u.losses}`, human: true }))
      .concat(Object.values(BOTS).map(b => ({ av: b.av, name: b.name, raw: b.name, val: b.elo, sub: "computer", human: false })))
      .sort((a, b) => b.val - a.val);
    rows = list.map((r, i) => `<tr class="${r.human ? "" : "botrow"} ${me() && r.raw === me().name ? "you" : ""}"><td class="n">${i + 1}</td><td>${r.av} ${esc(r.name)}</td><td class="sub">${esc(r.sub)}</td><td class="n">${r.val}</td></tr>`).join("");
  } else {
    const list = all.filter(u => u.daily[key]).map(u => ({ name: u.name, val: u.daily[key].score })).sort((a, b) => b.val - a.val);
    rows = list.length ? list.map((r, i) => `<tr class="${me() && r.name === me().name ? "you" : ""}"><td class="n">${i + 1}</td><td>${esc(r.name)}</td><td></td><td class="n">${r.val}</td></tr>`).join("")
      : `<tr><td colspan="4" class="empty">Nobody has finished today's launch yet.</td></tr>`;
  }
  return `${header()}<main class="narrow">
    <h1>Leaderboard</h1>
    <div class="tabs" role="tablist">
      <button role="tab" aria-selected="${tab === "elo"}" data-act="tab" data-tab="elo">Elo rating</button>
      <button role="tab" aria-selected="${tab === "daily"}" data-act="tab" data-tab="daily">Today's launch</button>
    </div>
    <div class="table-wrap"><table class="board"><thead><tr><th>#</th><th>Player</th><th></th><th>${tab === "elo" ? "Elo" : "Score"}</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="note">Preview build: this board lists accounts made in this browser, plus the four computer opponents for reference. A shared global board needs the online server.</p>
  </main>`;
}

function viewJoin() {
  return `${header()}<main class="narrow">
    <h1>Enter a code</h1>
    <p class="lede small">Paste a challenge code from a friend to play it, or paste the reply code they sent back to see who won.</p>
    <form id="join-form" class="stack">
      <label for="join-code">Challenge or reply code</label>
      <textarea id="join-code" rows="4" required></textarea>
      <p class="error" role="alert">${esc(S.error || "")}</p>
      <button class="btn primary" type="submit">Open</button>
    </form>
  </main>`;
}

function viewChallengeIntro() {
  const c = S.challenge;
  return `${header()}<main class="narrow">
    <p class="eyebrow">Challenge</p>
    <h1>${esc(c.from)} challenged you</h1>
    <p class="lede small">Same 7 prompts they played. You get 30 seconds each. After every round you'll see what ${esc(c.from)} said.${c.elo != null ? ` Their Elo when they sent it: <b>${c.elo}</b>.` : ""}</p>
    ${me() ? "" : `<p class="hint"><button class="link" data-go="login">Log in</button> first if you want this to count toward your Elo.</p>`}
    <button class="btn primary" data-act="challenge-play">Start</button>
  </main>`;
}

function viewReplyResult() {
  const c = S.reply;
  const prompts = c.p.map(id => PROMPT_BY_ID[id]);
  const mine = c.host.map((a, i) => scoreAnswer(prompts[i], a, true));
  const theirs = c.a.map((a, i) => scoreAnswer(prompts[i], a, true));
  const my = total(mine), their = total(theirs);
  let eloLine = "";
  if (me() && c.elo != null) {
    const r = applyMatchResult(c.from, c.elo, my, their, "friend", c.id + ":host");
    const h = me().history.find(x => x.id === c.id + ":host");
    eloLine = `<p class="elo-change">Elo ${h.delta >= 0 ? "+" : ""}${h.delta} → <b>${me().elo}</b></p>`;
    void r;
  }
  const verdict = my > their ? "You win" : my < their ? `${esc(c.from)} wins` : "It's a tie";
  return `${header()}<main class="results">
    <p class="eyebrow">Challenge result</p>
    <h1>${verdict}</h1>
    <div class="totals"><div><span>${myAvatar()} You</span><b>${my}</b><em>played like ${perfElo(my, ROUNDS).toLocaleString()}</em></div><div><span>${c.av && avatarById(c.av) ? avMarkup(avatarById(c.av)) : "🚀"} ${esc(c.from)}</span><b>${their}</b><em>played like ${perfElo(their, ROUNDS).toLocaleString()}</em></div><div class="of">out of 700</div></div>
    ${eloLine}
    <div class="table-wrap"><table class="breakdown"><thead><tr><th>Prompt</th><th>You</th><th>Pts</th><th>${esc(c.from)}</th><th>Pts</th></tr></thead><tbody>
      ${prompts.map((p, i) => `<tr><td class="q">${esc(p.q)}</td><td>${esc(mine[i].raw || "–")}</td><td class="n">${mine[i].points}</td><td>${esc(theirs[i].raw || "–")}</td><td class="n">${theirs[i].points}</td></tr>`).join("")}
    </tbody></table></div>
    <button class="btn ghost" data-go="home">Back to Earth</button>
  </main>`;
}

function render() {
  const v = S.view;
  const html = v === "play" ? viewPlay() : v === "results" ? viewResults() : v === "login" ? viewLogin()
    : v === "settings" ? viewSettings() : v === "profile" ? viewProfile() : v === "leaderboard" ? viewLeaderboard() : v === "join" ? viewJoin()
    : v === "queue" ? viewQueue() : v === "challenge" ? viewChallengeIntro() : v === "reply" ? viewReplyResult() : v === "daily-done" ? viewDailyDone() : viewHome();
  $app().innerHTML = html;
  document.body.dataset.view = v;
  if (window.KrillionFX) window.KrillionFX.setDepth(v === "play" ? 0.15 + 0.85 * (S.round / (ROUNDS - 1)) : 0);
}

/* ---------- events ---------- */
function openCode(raw) {
  let c;
  try { c = b64d(raw); } catch (e) { return "That code didn't read correctly. Copy the whole thing and try again."; }
  if (!c || !Array.isArray(c.p) || c.p.length !== ROUNDS || c.p.some(id => !PROMPT_BY_ID[id])) return "That code is for a different version of Attillion.";
  if (c.reply) { go("reply", { reply: c }); return null; }
  go("challenge", { challenge: c });
  return null;
}

document.addEventListener("click", async e => {
  const t = e.target.closest("[data-go],[data-act]");
  if (!t) return;
  if (t.dataset.go) { go(t.dataset.go); return; }
  const act = t.dataset.act;
  if (act === "bot") startMatch({ mode: "bot", level: t.dataset.level });
  else if (act === "daily") {
    const key = todayKey();
    startMatch({ mode: "daily", seed: hashStr("daily:" + key), prompts: pickPrompts(hashStr("daily:" + key)), dailyKey: key });
  }
  else if (act === "daily-view") go("daily-done");
  else if (act === "solo") startMatch({ mode: "solo" });
  else if (act === "challenge-new") {
    const id = Math.random().toString(36).slice(2, 10);
    startMatch({ mode: "challenge-host", challenge: { id } });
  }
  else if (act === "challenge-play") {
    const c = S.challenge;
    startMatch({ mode: "challenge-guest", seed: c.seed, prompts: c.p, theirsRaw: c.a, challenge: c });
  }
  else if (act === "next") nextRound();
  else if (act === "quick") go("queue");
  else if (act === "quick-cancel") go("home");
  else if (act === "sound-test") SFX("hadal");
  else if (act === "spin") {
    const av = t.querySelector(".av");
    av.classList.remove("spin"); void av.offsetWidth; av.classList.add("spin");
    SFX("sunlight");
  }
  else if (act === "avatar") {
    const id = t.dataset.id;
    if (me()) updateUser(x => { x.avatar = id; }); else store.set("guestAvatar", id);
    render();
    celebrateAvatar(id);
  }
  else if (act === "device") { setDeviceMode(t.dataset.v); render(); }
  else if (act === "tab") { S.tab = t.dataset.tab; render(); }
  else if (act === "auth-mode") go("login", { mode: t.dataset.m });
  else if (act === "logout") { store.set("session", null); go("home"); }
  else if (act === "copy") {
    const el = document.getElementById(t.dataset.target);
    const text = el.value != null && el.tagName === "TEXTAREA" ? el.value : el.textContent;
    try { await navigator.clipboard.writeText(text); t.textContent = "Copied"; }
    catch (err) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); if (el.select) el.select(); t.textContent = "Selected. Press copy."; }
  }
});

document.addEventListener("submit", async e => {
  e.preventDefault();
  if (e.target.id === "answer-form") submit(false);
  else if (e.target.id === "auth-form") {
    const name = document.getElementById("auth-name").value.trim();
    const pw = document.getElementById("auth-pw").value;
    const all = users(); const key = name.toLowerCase();
    const h = await hashPw(name, pw);
    if ((S.mode || "login") === "signup") {
      const bad = nameProblem(name, null);
      if (bad) { go("login", { mode: "signup", error: bad }); return; }
      all[key] = newUser(name, h); saveUsers(all);
      // carry over today's guest dive
      const g = store.get("guestDaily", {});
      if (g[todayKey()]) { all[key].daily[todayKey()] = g[todayKey()]; saveUsers(all); }
      const gk = store.get("guestKrillions", []);
      if (gk.length) { all[key].krillions = gk; saveUsers(all); store.set("guestKrillions", []); }
    } else {
      if (!all[key] || all[key].hash !== h) { go("login", { mode: "login", error: "Username or password doesn't match." }); return; }
    }
    store.set("session", all[key].name);
    go("home");
  }
  else if (e.target.id === "code-form") {
    const input = document.getElementById("unlock-code");
    const h = codeHash(input.value);
    const bundle = BUNDLES.find(x => x.code === h);
    if (bundle) {
      const u = me();
      if (redeemed(u).includes(bundle.id)) { go("settings", { codeMsg: `You already unlocked ${bundle.name}.` }); return; }
      if (u) updateUser(x => { x.codes = (x.codes || []).concat(bundle.id); x.avatar = bundle.pick; });
      else { store.set("guestCodes", redeemed(null).concat(bundle.id)); store.set("guestAvatar", bundle.pick); }
      go("settings", { codeMsg: `Unlocked ${bundle.name}: ☄️ 🌘 🪐 🌌` });
      celebrateAvatar(bundle.pick);
      return;
    }
    const a = AVATARS.find(x => x.code === h);
    if (!a) { SFX("error"); go("settings", { codeMsg: "That code doesn't unlock anything." }); return; }
    const u = me();
    if (redeemed(u).includes(a.id)) { go("settings", { codeMsg: `You already have the ${a.name}.` }); return; }
    if (u) updateUser(x => { x.codes = (x.codes || []).concat(a.id); x.avatar = a.id; });
    else { store.set("guestCodes", redeemed(null).concat(a.id)); store.set("guestAvatar", a.id); }
    go("settings", { codeMsg: `Unlocked: ${a.e} ${a.name}${a.dev ? " (Developer)" : ""}. It's now your avatar.` });
    celebrateAvatar(a.id);
    return;
  }
  else if (e.target.id === "rename-form" || e.target.id === "pw-form") {
    const u = me(); if (!u) return;
    const all = users(); const oldKey = u.name.toLowerCase();
    if (e.target.id === "rename-form") {
      const name = document.getElementById("new-name").value.trim();
      const pw = document.getElementById("rename-pw").value;
      if ((await hashPw(u.name, pw)) !== all[oldKey].hash) { go("settings", { renameMsg: "That password doesn't match." }); return; }
      const bad = nameProblem(name, oldKey);
      if (bad) { go("settings", { renameMsg: bad }); return; }
      const rec = all[oldKey]; delete all[oldKey];
      rec.name = name; rec.hash = await hashPw(name, pw);
      all[name.toLowerCase()] = rec; saveUsers(all); store.set("session", name);
      SFX("lock"); go("settings", { renameMsg: "Username changed to " + name + "." });
    } else {
      const oldPw = document.getElementById("old-pw").value, newPw = document.getElementById("new-pw").value;
      if ((await hashPw(u.name, oldPw)) !== all[oldKey].hash) { go("settings", { pwMsg: "Your current password doesn't match." }); return; }
      all[oldKey].hash = await hashPw(u.name, newPw); saveUsers(all);
      SFX("lock"); go("settings", { pwMsg: "Password changed." });
    }
  }
  else if (e.target.id === "join-form") {
    const err = openCode(document.getElementById("join-code").value);
    if (err) go("join", { error: err });
  }
});

document.addEventListener("input", e => {
  if (e.target.id === "vol" && window.KrillionSound) {
    window.KrillionSound.volume = +e.target.value / 100;
    const o = document.getElementById("vol-out"); if (o) o.textContent = e.target.value + "%";
  }
  if (e.target.id === "answer") { const err = document.getElementById("answer-error"); if (err) err.textContent = ""; e.target.classList.remove("nope"); }
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && S.view === "play" && S.phase === "reveal" && document.activeElement && document.activeElement.tagName !== "BUTTON") { e.preventDefault(); nextRound(); }
});

function fromHash() {
  const m = location.hash.match(/^#(c|r)=(.+)$/);
  if (!m) return false;
  const err = openCode(m[2]);
  history.replaceState(null, "", location.pathname);
  if (err) go("join", { error: err });
  return true;
}

// test hook
window.Krillion = { PROMPTS, scoreAnswer, matchAnswer, pickPrompts, depthFor, botAnswer, BOTS, todayKey };

if (!fromHash()) render();
})();

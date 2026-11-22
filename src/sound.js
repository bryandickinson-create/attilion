/* Attillion sound effects, made with the Web Audio API (no audio files).
 * window.KrillionSound.play(name, gain) and .volume (0 to 1, saved per device).
 */
(function () {
"use strict";
let ctx = null, master = null;
let vol = 0.5;
try { const v = localStorage.getItem("krillion:volume"); if (v != null) vol = Math.max(0, Math.min(1, +JSON.parse(v))); } catch (e) {}

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = vol * vol; master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
// browsers only allow sound after the first tap or key press
["pointerdown", "keydown"].forEach(ev => window.addEventListener(ev, ensure, { once: false, passive: true }));

function tone(freq, start, dur, type, gain, glideTo) {
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type || "sine";
  o.frequency.setValueAtTime(freq, t0);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise(start, dur, gain, from, to) {
  const t0 = ctx.currentTime + start;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = "lowpass";
  f.frequency.setValueAtTime(from, t0); f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(out); src.start(t0); src.stop(t0 + dur);
}
const N = n => 440 * Math.pow(2, (n - 69) / 12); // MIDI note to Hz
let out = null;

const SOUNDS = {
  pop()      { tone(520, 0, 0.09, "sine", 0.35, 900); },
  lock()     { tone(N(72), 0, 0.08, "triangle", 0.3); tone(N(79), 0.06, 0.14, "triangle", 0.3); },
  error()    { tone(140, 0, 0.12, "square", 0.12); tone(120, 0.14, 0.16, "square", 0.12); },
  tick()     { tone(1200, 0, 0.04, "triangle", 0.15); },
  miss()     { tone(N(55), 0, 0.3, "sine", 0.25, N(48)); },
  sunlight() { for (let i = 0; i < 4; i++) tone(500 + i * 120, i * 0.07, 0.09, "sine", 0.22, 900 + i * 150); },
  twilight() { tone(N(72), 0, 0.25, "triangle", 0.25); tone(N(76), 0.12, 0.3, "triangle", 0.25); noise(0, 0.5, 0.05, 2000, 400); },
  midnight() { [84, 88, 91, 96].forEach((n, i) => tone(N(n), i * 0.06, 0.35, "sine", 0.16)); tone(N(60), 0, 0.5, "sine", 0.18); },
  abyss()    { tone(N(40), 0, 1.2, "sine", 0.4, N(33)); noise(0, 1.1, 0.12, 600, 80); tone(N(79), 0.25, 0.6, "sine", 0.08); },
  hadal() {   // 1 in Attillion: deep boom, then a golden fanfare and shimmer
    tone(N(31), 0, 1.4, "sine", 0.6, N(26)); noise(0, 0.6, 0.25, 900, 60);
    [72, 76, 79, 84].forEach((n, i) => { tone(N(n), 0.18 + i * 0.11, 0.5, "triangle", 0.28); tone(N(n + 12), 0.18 + i * 0.11, 0.4, "sine", 0.08); });
    tone(N(84), 0.65, 1.1, "triangle", 0.3); tone(N(88), 0.65, 1.1, "sine", 0.14); tone(N(91), 0.65, 1.1, "sine", 0.12);
    for (let i = 0; i < 10; i++) tone(N(96 + (i % 5) * 2), 0.7 + i * 0.07, 0.25, "sine", 0.06);
  },
  win()  { [60, 64, 67, 72, 76].forEach((n, i) => tone(N(n), i * 0.1, 0.4, "triangle", 0.25)); tone(N(84), 0.5, 0.8, "sine", 0.15); },
  lose() { [67, 64, 60, 55].forEach((n, i) => tone(N(n), i * 0.14, 0.45, "triangle", 0.22)); },
  tie()  { tone(N(67), 0, 0.3, "triangle", 0.25); tone(N(67), 0.2, 0.4, "triangle", 0.25); }
};

window.KrillionSound = {
  play(name, gain) {
    if (vol <= 0 || !SOUNDS[name]) return;
    if (!ensure()) return;
    // a per-call gain stage lets opponent sounds play a little quieter
    out = ctx.createGain(); out.gain.value = gain == null ? 1 : gain; out.connect(master);
    try { SOUNDS[name](); } catch (e) {}
  },
  get volume() { return vol; },
  set volume(v) {
    vol = Math.max(0, Math.min(1, v));
    try { localStorage.setItem("krillion:volume", JSON.stringify(vol)); } catch (e) {}
    if (master) master.gain.value = vol * vol;
  }
};
})();

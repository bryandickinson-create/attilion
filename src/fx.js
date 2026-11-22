/* Attillion visual effects: the living deep-sea background and the reveal
 * animation for each rarity zone. Exposes window.KrillionFX.
 */
(function () {
"use strict";
const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

/* ================= background ================= */
const bg = document.createElement("canvas");
bg.id = "sea-bg"; bg.setAttribute("aria-hidden", "true");
const fx = document.createElement("canvas");
fx.id = "fx-layer"; fx.setAttribute("aria-hidden", "true");
document.body.prepend(bg); document.body.appendChild(fx);
const bx = bg.getContext("2d"), fxx = fx.getContext("2d");
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  [bg, fx].forEach(c => { c.width = W * DPR; c.height = H * DPR; c.style.width = W + "px"; c.style.height = H + "px"; });
  bx.setTransform(DPR, 0, 0, DPR, 0, 0); fxx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
resize(); window.addEventListener("resize", resize);

const area = () => (W * H) / (1200 * 800);
const snow = Array.from({ length: 140 }, () => ({ x: Math.random(), y: Math.random(), r: rand(0.4, 1.8), s: rand(0.006, 0.02), w: rand(0, TAU) }));
const glows = Array.from({ length: 34 }, () => ({ x: Math.random(), y: rand(0.45, 1), r: rand(1, 2.6), p: rand(0, TAU), sp: rand(0.4, 1.4), hue: Math.random() < 0.7 ? 175 : 215 }));
const bubbles = [];
const fishes = [];
const krill = Array.from({ length: 46 }, () => ({ x: rand(0.1, 0.9), y: rand(0.55, 0.9), vx: rand(-0.02, 0.02), vy: rand(-0.01, 0.01), a: rand(0, TAU), size: rand(3, 5.5) }));
let swarmT = { x: 0.7, y: 0.72 };
let depthTint = 0; let depthTarget = 0;

function drawFish(ctx, x, y, s, dir, alpha) {
  ctx.save(); ctx.translate(x, y); ctx.scale(dir * s, s); ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.ellipse(0, 0, 14, 5, 0, 0, TAU);
  ctx.moveTo(-11, 0); ctx.lineTo(-22, -7); ctx.lineTo(-20, 0); ctx.lineTo(-22, 7); ctx.closePath();
  ctx.fill(); ctx.restore();
}
function drawKrill(ctx, k, alpha) {
  ctx.save(); ctx.translate(k.x * W, k.y * H); ctx.rotate(k.a); ctx.globalAlpha = alpha;
  ctx.strokeStyle = "#ff8a73"; ctx.lineWidth = k.size * 0.45; ctx.lineCap = "round";
  ctx.beginPath(); ctx.arc(0, 0, k.size, Math.PI * 0.15, Math.PI * 1.05); ctx.stroke();
  ctx.fillStyle = "#ffd2c6"; ctx.beginPath(); ctx.arc(k.size * 0.85, -k.size * 0.35, k.size * 0.22, 0, TAU); ctx.fill();
  ctx.restore();
}

let last = performance.now(), t = 0;
function frameBg(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  depthTint += (depthTarget - depthTint) * Math.min(1, dt * 1.5);
  bx.clearRect(0, 0, W, H);

  // light shafts from the surface, fading as the game goes deeper
  const rayA = 0.07 * (1 - depthTint * 0.8);
  bx.save(); bx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 6; i++) {
    const cx = W * (0.08 + i * 0.18) + Math.sin(t * 0.25 + i * 1.7) * 40;
    const g = bx.createLinearGradient(0, 0, 0, H * 0.75);
    g.addColorStop(0, `rgba(160,230,230,${rayA})`); g.addColorStop(1, "rgba(160,230,230,0)");
    bx.fillStyle = g;
    bx.beginPath(); bx.moveTo(cx - 30, 0); bx.lineTo(cx + 40, 0); bx.lineTo(cx + 140 + i * 10, H * 0.75); bx.lineTo(cx - 60, H * 0.75); bx.closePath(); bx.fill();
  }
  // surface caustic shimmer
  for (let i = 0; i < 24; i++) {
    const x = (i / 24) * W + Math.sin(t * 0.8 + i) * 18, y = 6 + Math.sin(t * 1.3 + i * 2.1) * 4;
    bx.fillStyle = `rgba(190,245,240,${0.05 * (1 - depthTint)})`; bx.beginPath(); bx.ellipse(x, y, 30, 3, 0, 0, TAU); bx.fill();
  }
  bx.restore();

  // marine snow
  bx.fillStyle = "rgba(220,240,240,0.5)";
  snow.forEach(p => {
    p.y += p.s * dt * 3; p.w += dt * 0.6; if (p.y > 1.02) { p.y = -0.02; p.x = Math.random(); }
    bx.globalAlpha = 0.25 + p.r * 0.15;
    bx.beginPath(); bx.arc(p.x * W + Math.sin(p.w) * 8, p.y * H, p.r, 0, TAU); bx.fill();
  });
  bx.globalAlpha = 1;

  // bioluminescence lower down, brighter when deep
  glows.forEach(g => {
    g.p += dt * g.sp; const a = Math.max(0, Math.sin(g.p)) * (0.35 + depthTint * 0.5);
    if (a < 0.02) return;
    const x = g.x * W, y = g.y * H;
    const grd = bx.createRadialGradient(x, y, 0, x, y, g.r * 7);
    grd.addColorStop(0, `hsla(${g.hue},90%,70%,${a})`); grd.addColorStop(1, `hsla(${g.hue},90%,70%,0)`);
    bx.fillStyle = grd; bx.beginPath(); bx.arc(x, y, g.r * 7, 0, TAU); bx.fill();
  });

  // passing fish silhouettes
  if (fishes.length < 3 && Math.random() < dt * 0.12) {
    const dir = Math.random() < 0.5 ? 1 : -1; const n = Math.floor(rand(1, 6));
    const y = rand(0.2, 0.85) * H, sp = rand(25, 60), sc = rand(0.6, 1.4);
    for (let i = 0; i < n; i++) fishes.push({ x: dir > 0 ? -40 - i * rand(25, 45) : W + 40 + i * rand(25, 45), y: y + rand(-30, 30), dir, sp, sc, wob: rand(0, TAU) });
  }
  bx.fillStyle = "#04121c";
  for (let i = fishes.length - 1; i >= 0; i--) {
    const f = fishes[i]; f.x += f.dir * f.sp * dt; f.wob += dt * 3;
    drawFish(bx, f.x, f.y + Math.sin(f.wob) * 3, f.sc, f.dir, 0.55);
    if ((f.dir > 0 && f.x > W + 80) || (f.dir < 0 && f.x < -80)) fishes.splice(i, 1);
  }

  // rising bubbles
  if (Math.random() < dt * 1.2) bubbles.push({ x: rand(0, W), y: H + 10, r: rand(1.5, 4), sp: rand(30, 70), w: rand(0, TAU) });
  bx.strokeStyle = "rgba(200,240,240,0.35)"; bx.lineWidth = 1;
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i]; b.y -= b.sp * dt; b.w += dt * 2;
    bx.beginPath(); bx.arc(b.x + Math.sin(b.w) * 4, b.y, b.r, 0, TAU); bx.stroke();
    if (b.y < -10) bubbles.splice(i, 1);
  }

  // the krill swarm wanders after a drifting target
  if (Math.random() < dt * 0.15) swarmT = { x: rand(0.1, 0.9), y: rand(0.45, 0.92) };
  krill.forEach(k => {
    k.vx += (swarmT.x - k.x) * dt * 0.02 + rand(-1, 1) * dt * 0.02;
    k.vy += (swarmT.y - k.y) * dt * 0.02 + rand(-1, 1) * dt * 0.02;
    k.vx *= 0.985; k.vy *= 0.985;
    k.x += k.vx * dt; k.y += k.vy * dt;
    k.a = Math.atan2(k.vy, k.vx) + Math.PI / 2;
    drawKrill(bx, k, 0.38);
  });

  if (!reduce && !document.hidden) requestAnimationFrame(frameBg);
}
requestAnimationFrame(frameBg);
document.addEventListener("visibilitychange", () => { if (!document.hidden && !reduce) { last = performance.now(); requestAnimationFrame(frameBg); } });

/* ================= reveal effects ================= */
const parts = [];
let fxRunning = false;
function runFx() {
  if (fxRunning) return; fxRunning = true; let prev = performance.now();
  (function loop(now) {
    const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
    fxx.clearRect(0, 0, W, H);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      p.update(p, dt); p.draw(fxx, p);
    }
    if (parts.length) requestAnimationFrame(loop); else { fxx.clearRect(0, 0, W, H); fxRunning = false; }
  })(prev);
}
function centerOf(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, r };
}
function gaugePoint(card) {
  const dot = card.querySelector(".gauge span");
  const c = centerOf(dot || card);
  return c;
}

const effects = {
  sunlight(card) {
    const { x, y } = gaugePoint(card);
    for (let i = 0; i < 16; i++) parts.push({
      x: x + rand(-40, 40), y: y + rand(-6, 6), r: rand(2, 6), vy: rand(-90, -40), w: rand(0, TAU), life: rand(1, 1.8), max: 1.8,
      update(p, dt) { p.y += p.vy * dt; p.w += dt * 6; },
      draw(c, p) { c.strokeStyle = `rgba(243,237,224,${Math.min(1, p.life)})`; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x + Math.sin(p.w) * 5, p.y, p.r, 0, TAU); c.stroke(); }
    });
  },
  twilight(card) {
    const { r } = centerOf(card);
    const y = r.top + r.height * 0.55, dir = Math.random() < 0.5 ? 1 : -1;
    for (let i = 0; i < 14; i++) {
      const ox = rand(0, 120), oy = rand(-30, 30);
      parts.push({
        x: dir > 0 ? r.left - 60 - ox : r.right + 60 + ox, y: y + oy, dir, life: 2.2, w: rand(0, TAU),
        update(p, dt) { p.x += p.dir * (r.width + 240) / 1.9 * dt; p.w += dt * 9; },
        draw(c, p) { c.fillStyle = "#5fc4c9"; drawFish(c, p.x, p.y + Math.sin(p.w) * 2, 0.55, p.dir, Math.min(0.9, p.life)); }
      });
    }
    ring(card, "95,196,201", 1, 1.2);
  },
  midnight(card) {
    const { x, y } = gaugePoint(card);
    for (let i = 0; i < 46; i++) {
      const a = rand(0, TAU), sp = rand(30, 160);
      parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.9, 1.9), tw: rand(0, TAU),
        update(p, dt) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.tw += dt * 14; },
        draw(c, p) {
          const a2 = Math.min(1, p.life) * (0.5 + 0.5 * Math.sin(p.tw));
          const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 7); g.addColorStop(0, `rgba(143,179,240,${a2})`); g.addColorStop(1, "rgba(143,179,240,0)");
          c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, 7, 0, TAU); c.fill();
        }
      });
    }
  },
  abyss(card) {
    ring(card, "183,165,240", 3, 1.6);
    const { x, y } = gaugePoint(card);
    parts.push({ // a small jellyfish drifts up from the depth marker
      x, y, life: 2.4, ph: 0,
      update(p, dt) { p.ph += dt * 4; p.y -= (18 + Math.max(0, Math.sin(p.ph)) * 50) * dt; },
      draw(c, p) {
        const a = Math.min(1, p.life / 1.2), s = 1 + Math.sin(p.ph) * 0.12;
        c.save(); c.translate(p.x, p.y); c.globalAlpha = a;
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 40); g.addColorStop(0, "rgba(183,165,240,.35)"); g.addColorStop(1, "rgba(183,165,240,0)");
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, 40, 0, TAU); c.fill();
        c.fillStyle = "rgba(205,190,255,.85)"; c.beginPath(); c.ellipse(0, 0, 16 * s, 12 / s, 0, Math.PI, 0); c.closePath(); c.fill();
        c.strokeStyle = "rgba(205,190,255,.6)"; c.lineWidth = 1.5;
        for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 5, 0); c.quadraticCurveTo(i * 5 + Math.sin(p.ph + i) * 6, 14, i * 5, 26 / s); c.stroke(); }
        c.restore();
      }
    });
  },
  hadal(card, who, opts) { if (opts && opts.devTakeover) devTakeover(card, opts.devTakeover); else krillion(card, who); }
};

function ring(card, rgb, n, dur) {
  const { x, y } = gaugePoint(card);
  for (let i = 0; i < n; i++) parts.push({
    x, y, life: dur, max: dur, delay: i * 0.28,
    update(p, dt) { if (p.delay > 0) { p.delay -= dt; p.life += dt; } },
    draw(c, p) {
      if (p.delay > 0) return;
      const k = 1 - p.life / p.max;
      c.strokeStyle = `rgba(${rgb},${(1 - k) * 0.8})`; c.lineWidth = 2.5 * (1 - k) + 0.5;
      c.beginPath(); c.arc(p.x, p.y, 10 + k * 140, 0, TAU); c.stroke();
    }
  });
}

/* the big one: 1 in an Attillion */
/* Rainbow Developer's own Attillion: the creature grows from tiny until it fills
   the screen, then vanishes. */
function devTakeover(card, id) {
  const gold = id === "gdev";
  const { x, y } = gaugePoint(card);
  const el = document.createElement("div");
  el.className = "dev-takeover" + (gold ? " gold" : "");
  el.style.setProperty("--ox", x + "px"); el.style.setProperty("--oy", y + "px");
  el.innerHTML = `<span class="dev-giant avg av-${gold ? "gdev" : "rdev"}">👾</span><p class="dev-label">1 in an Attillion</p>`;
  document.body.appendChild(el);
  const end = () => el.remove();
  const t = setTimeout(end, 2900);
  el.addEventListener("click", () => { clearTimeout(t); end(); });
  for (let i = 0; i < 3; i++) parts.push({
    x, y, life: 1.6, max: 1.6, delay: i * 0.2, hue: i * 120,
    update(p, dt) { if (p.delay > 0) { p.delay -= dt; p.life += dt; } },
    draw(c, p) { if (p.delay > 0) return; const k = 1 - p.life / p.max; c.strokeStyle = gold ? `hsla(${40 + p.hue / 30},100%,62%,${(1 - k) * 0.9})` : `hsla(${(p.hue + k * 360) % 360},90%,65%,${(1 - k) * 0.9})`; c.lineWidth = 5 * (1 - k) + 1; c.beginPath(); c.arc(p.x, p.y, 20 + k * Math.max(W, H) * 0.7, 0, TAU); c.stroke(); }
  });
}
function krillion(card, who) {
  const { x, y } = gaugePoint(card);
  document.body.classList.add("krillion-hit");
  const app = document.getElementById("app");
  if (app && !reduce) { app.classList.remove("shake"); void app.offsetWidth; app.classList.add("shake"); }
  const banner = document.createElement("div");
  banner.className = "krillion-banner";
  banner.innerHTML = `<div class="kb-inner"><p class="kb-who">${who === "you" ? "You found it" : who + " found it"}</p><p class="kb-big"><span>1 in an</span> Attillion</p><p class="kb-pts">+100</p></div>`;
  document.body.appendChild(banner);
  const end = () => { banner.classList.add("out"); document.body.classList.remove("krillion-hit"); setTimeout(() => banner.remove(), 500); };
  const timer = setTimeout(end, 2600);
  banner.addEventListener("click", () => { clearTimeout(timer); end(); });

  // a swarm of krill bursts from the depth marker and spirals out
  for (let i = 0; i < 220; i++) {
    const a = rand(0, TAU), sp = rand(120, 620);
    parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a, spin: rand(-6, 6), size: rand(3, 7), life: rand(1.6, 3.2),
      update(p, dt) {
        p.vx *= 0.975; p.vy = p.vy * 0.975 + 30 * dt; // drift down slowly
        const sw = 70; p.vx += -p.vy / sw * dt * 60 * 0.15; p.vy += p.vx / sw * dt * 60 * 0.15; // swirl
        p.x += p.vx * dt; p.y += p.vy * dt; p.a = Math.atan2(p.vy, p.vx) + Math.PI / 2;
      },
      draw(c, p) {
        c.save(); c.translate(p.x, p.y); c.rotate(p.a); c.globalAlpha = Math.min(1, p.life);
        c.strokeStyle = "#ffc93c"; c.lineWidth = p.size * 0.45; c.lineCap = "round";
        c.beginPath(); c.arc(0, 0, p.size, Math.PI * 0.15, Math.PI * 1.05); c.stroke();
        c.fillStyle = "#fff4cf"; c.beginPath(); c.arc(p.size * 0.85, -p.size * 0.35, p.size * 0.22, 0, TAU); c.fill();
        c.restore();
      }
    });
  }
  // shockwave rings
  for (let i = 0; i < 3; i++) parts.push({
    x, y, life: 1.4, max: 1.4, delay: i * 0.18,
    update(p, dt) { if (p.delay > 0) { p.delay -= dt; p.life += dt; } },
    draw(c, p) { if (p.delay > 0) return; const k = 1 - p.life / p.max; c.strokeStyle = `rgba(255,201,60,${(1 - k) * 0.9})`; c.lineWidth = 4 * (1 - k) + 1; c.beginPath(); c.arc(p.x, p.y, 20 + k * Math.max(W, H) * 0.6, 0, TAU); c.stroke(); }
  });
}

function countUp(el, to, ms) {
  if (!el) return;
  if (reduce) { el.textContent = to; return; }
  const from = +el.dataset.from || 0, start = performance.now();
  (function step(now) {
    const k = Math.min(1, (now - start) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  })(start);
}

window.KrillionFX = {
  clear() { parts.length = 0; },
  setDepth(v) { depthTarget = Math.max(0, Math.min(1, v)); },
  countUp,
  reveal(card, zoneKey, who, opts) {
    if (!card) return;
    card.classList.add("fx-" + (zoneKey || "none"));
    if (reduce || !zoneKey || !effects[zoneKey]) return;
    effects[zoneKey](card, who, opts);
    runFx();
  }
};
})();

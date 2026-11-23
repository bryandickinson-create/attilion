/* Attillion visual effects: the living outer-space background and the reveal
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

// stars in three layers that drift at different speeds (parallax)
const stars = Array.from({ length: 260 }, () => { const l = Math.random(); return { x: Math.random(), y: Math.random(), r: l < 0.7 ? rand(0.3, 0.9) : l < 0.95 ? rand(0.9, 1.5) : rand(1.5, 2.2), l: l < 0.7 ? 0 : l < 0.95 ? 1 : 2, tw: rand(0, TAU), ts: rand(0.6, 2.4), hue: Math.random() < 0.15 ? rand(190, 230) : Math.random() < 0.1 ? rand(20, 45) : 0 }; });
const nebulae = [
  { x: 0.18, y: 0.28, r: 0.42, c: "120,80,255", p: rand(0, TAU) },
  { x: 0.82, y: 0.55, r: 0.38, c: "255,110,170", p: rand(0, TAU) },
  { x: 0.55, y: 0.9,  r: 0.5,  c: "60,140,255", p: rand(0, TAU) }
];
const shooting = [];
const crafts = [];
let depthTint = 0; let depthTarget = 0;

function sparkle(ctx, x, y, s, color, alpha, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.globalAlpha = alpha; ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? s * 0.28 : s; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawMeteor(ctx, x, y, len, ang, alpha, rgb) {
  const tx = x - Math.cos(ang) * len, ty = y - Math.sin(ang) * len;
  const g = ctx.createLinearGradient(x, y, tx, ty);
  g.addColorStop(0, `rgba(${rgb},${alpha})`); g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.strokeStyle = g; ctx.lineWidth = 2; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
  ctx.fillStyle = `rgba(255,255,255,${alpha})`; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill();
}
function drawSatellite(ctx, x, y, a, alpha) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalAlpha = alpha;
  ctx.fillStyle = "#8ea3d8"; ctx.fillRect(-3, -3, 6, 6);
  ctx.fillStyle = "#3d5fbf"; ctx.fillRect(-15, -2, 10, 4); ctx.fillRect(5, -2, 10, 4);
  ctx.restore();
}

let last = performance.now(), t = 0;
function frameBg(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
  depthTint += (depthTarget - depthTint) * Math.min(1, dt * 1.5);
  bx.clearRect(0, 0, W, H);

  // the glow of the atmosphere at the bottom fades as the game climbs higher
  const hz = bx.createLinearGradient(0, H, 0, H * 0.45);
  hz.addColorStop(0, `rgba(70,130,255,${0.22 * (1 - depthTint * 0.85)})`); hz.addColorStop(1, "rgba(70,130,255,0)");
  bx.fillStyle = hz; bx.fillRect(0, H * 0.45, W, H * 0.55);

  // soft nebula clouds
  bx.save(); bx.globalCompositeOperation = "lighter";
  nebulae.forEach(n => {
    n.p += dt * 0.08;
    const x = (n.x + Math.sin(n.p) * 0.02) * W, y = (n.y + Math.cos(n.p * 0.8) * 0.02) * H, r = n.r * Math.max(W, H);
    const g = bx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${n.c},${0.07 + depthTint * 0.04})`); g.addColorStop(1, `rgba(${n.c},0)`);
    bx.fillStyle = g; bx.beginPath(); bx.arc(x, y, r, 0, TAU); bx.fill();
  });
  bx.restore();

  // a ringed planet low on the right
  const px = W * 0.86, py = H * (0.8 - depthTint * 0.12), pr = Math.min(W, H) * 0.09;
  const pg = bx.createRadialGradient(px - pr * 0.4, py - pr * 0.4, pr * 0.1, px, py, pr);
  pg.addColorStop(0, "rgba(255,190,150,.55)"); pg.addColorStop(1, "rgba(120,60,140,.35)");
  bx.fillStyle = pg; bx.beginPath(); bx.arc(px, py, pr, 0, TAU); bx.fill();
  bx.strokeStyle = "rgba(255,215,180,.35)"; bx.lineWidth = 3;
  bx.beginPath(); bx.ellipse(px, py, pr * 1.8, pr * 0.42, -0.35, 0, TAU); bx.stroke();

  // twinkling stars, brighter as you climb
  stars.forEach(st => {
    st.tw += dt * st.ts;
    st.y += dt * (0.002 + st.l * 0.004); if (st.y > 1.01) { st.y = -0.01; st.x = Math.random(); }
    const a = (0.35 + 0.65 * (0.5 + 0.5 * Math.sin(st.tw))) * (0.55 + depthTint * 0.45);
    bx.fillStyle = st.hue ? `hsla(${st.hue},80%,80%,${a})` : `rgba(255,255,255,${a})`;
    bx.beginPath(); bx.arc(st.x * W, st.y * H, st.r, 0, TAU); bx.fill();
    if (st.l === 2 && a > 0.75) sparkle(bx, st.x * W, st.y * H, st.r * 3.2, "#ffffff", (a - 0.75) * 1.6);
  });

  // shooting stars now and then
  if (shooting.length < 2 && Math.random() < dt * 0.25) {
    const dir = Math.random() < 0.5 ? 1 : -1, ang = dir > 0 ? rand(0.3, 0.6) : Math.PI - rand(0.3, 0.6);
    shooting.push({ x: dir > 0 ? rand(-0.1, 0.5) * W : rand(0.5, 1.1) * W, y: rand(-0.05, 0.4) * H, ang, sp: rand(500, 900), life: rand(0.6, 1.1) });
  }
  for (let i = shooting.length - 1; i >= 0; i--) {
    const m = shooting[i]; m.life -= dt; m.x += Math.cos(m.ang) * m.sp * dt; m.y += Math.sin(m.ang) * m.sp * dt;
    drawMeteor(bx, m.x, m.y, 110, m.ang, Math.max(0, m.life) * 0.9, "200,220,255");
    if (m.life <= 0) shooting.splice(i, 1);
  }

  // a satellite drifting across
  if (crafts.length < 1 && Math.random() < dt * 0.05) {
    const dir = Math.random() < 0.5 ? 1 : -1;
    crafts.push({ x: dir > 0 ? -30 : W + 30, y: rand(0.1, 0.6) * H, dir, sp: rand(18, 35), a: rand(0, TAU), blink: 0 });
  }
  for (let i = crafts.length - 1; i >= 0; i--) {
    const c = crafts[i]; c.x += c.dir * c.sp * dt; c.y -= c.sp * 0.15 * dt; c.a += dt * 0.3; c.blink += dt;
    drawSatellite(bx, c.x, c.y, c.a, 0.6);
    if (Math.sin(c.blink * 4) > 0.9) { bx.fillStyle = "rgba(255,80,80,.9)"; bx.beginPath(); bx.arc(c.x, c.y, 1.6, 0, TAU); bx.fill(); }
    if (c.x < -40 || c.x > W + 40) crafts.splice(i, 1);
  }

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
      draw(c, p) { c.fillStyle = `rgba(143,216,255,${Math.min(0.7, p.life * 0.5)})`; c.beginPath(); c.arc(p.x + Math.sin(p.w) * 5, p.y, p.r, 0, TAU); c.fill(); }
    });
  },
  twilight(card) {
    const { r } = centerOf(card);
    const dir = Math.random() < 0.5 ? 1 : -1;
    for (let i = 0; i < 9; i++) {
      const y = r.top + rand(0.1, 0.9) * r.height, ang = dir > 0 ? rand(-0.35, -0.15) : Math.PI + rand(0.15, 0.35);
      parts.push({
        x: dir > 0 ? r.left - rand(40, 220) : r.right + rand(40, 220), y, ang, sp: rand(420, 700), life: 1.4, max: 1.4,
        update(p, dt) { p.x += Math.cos(p.ang) * p.sp * dt; p.y += Math.sin(p.ang) * p.sp * dt; },
        draw(c, p) { drawMeteor(c, p.x, p.y, 70, p.ang, Math.min(1, p.life), "122,162,255"); }
      });
    }
    ring(card, "122,162,255", 1, 1.2);
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
          const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, 7); g.addColorStop(0, `rgba(165,139,255,${a2})`); g.addColorStop(1, "rgba(165,139,255,0)");
          c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, 7, 0, TAU); c.fill();
        }
      });
    }
  },
  abyss(card) {
    ring(card, "220,220,240", 3, 1.6);
    const { x, y } = gaugePoint(card);
    parts.push({ // a little moon rises from the altitude marker
      x, y, life: 2.4, ph: 0,
      update(p, dt) { p.ph += dt; p.y -= 38 * dt; },
      draw(c, p) {
        const a = Math.min(1, p.life / 1.2);
        c.save(); c.translate(p.x, p.y); c.globalAlpha = a;
        const g = c.createRadialGradient(0, 0, 0, 0, 0, 44); g.addColorStop(0, "rgba(230,230,255,.35)"); g.addColorStop(1, "rgba(230,230,255,0)");
        c.fillStyle = g; c.beginPath(); c.arc(0, 0, 44, 0, TAU); c.fill();
        c.fillStyle = "#e6e6f5"; c.beginPath(); c.arc(0, 0, 15, 0, TAU); c.fill();
        c.fillStyle = "rgba(160,160,190,.6)";
        [[-5, -4, 3.5], [5, 3, 2.6], [-1, 7, 2], [6, -6, 1.8]].forEach(([cx, cy, cr]) => { c.beginPath(); c.arc(cx, cy, cr, 0, TAU); c.fill(); });
        c.restore();
      }
    });
  },
  hadal(card, who, opts) { if (opts && opts.devTakeover) devTakeover(card, opts.devTakeover); else krillion(card, who, opts); }
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

/* the big one: 1 in Attillion */
/* Rainbow Developer's own Attillion: the creature grows from tiny until it fills
   the screen, then vanishes. */
function devTakeover(card, id) {
  const gold = id === "gdev", plain = id === "dev";
  const { x, y } = gaugePoint(card);
  const el = document.createElement("div");
  el.className = "dev-takeover" + (gold ? " gold" : plain ? " plain" : "");
  el.style.setProperty("--ox", x + "px"); el.style.setProperty("--oy", y + "px");
  el.innerHTML = `<span class="dev-giant avg av-${gold ? "gdev" : plain ? "dev" : "rdev"}">👾</span><p class="dev-label">1 in Attillion</p>`;
  document.body.appendChild(el);
  const end = () => el.remove();
  const t = setTimeout(end, 2900);
  el.addEventListener("click", () => { clearTimeout(t); end(); });
  for (let i = 0; i < 3; i++) parts.push({
    x, y, life: 1.6, max: 1.6, delay: i * 0.2, hue: i * 120,
    update(p, dt) { if (p.delay > 0) { p.delay -= dt; p.life += dt; } },
    draw(c, p) { if (p.delay > 0) return; const k = 1 - p.life / p.max; c.strokeStyle = plain ? `hsla(${265 + p.hue / 20},90%,68%,${(1 - k) * 0.9})` : gold ? `hsla(${40 + p.hue / 30},100%,62%,${(1 - k) * 0.9})` : `hsla(${(p.hue + k * 360) % 360},90%,65%,${(1 - k) * 0.9})`; c.lineWidth = 5 * (1 - k) + 1; c.beginPath(); c.arc(p.x, p.y, 20 + k * Math.max(W, H) * 0.7, 0, TAU); c.stroke(); }
  });
}
const escH = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function krillion(card, who, opts) {
  const { x, y } = gaugePoint(card);
  document.body.classList.add("krillion-hit");
  const app = document.getElementById("app");
  if (app && !reduce) { app.classList.remove("shake"); void app.offsetWidth; app.classList.add("shake"); }
  const banner = document.createElement("div");
  const th = opts && opts.theme;
  banner.className = "krillion-banner" + (th ? " themed" : "");
  if (th) banner.style.setProperty("--th", th.rgb);
  banner.innerHTML = `<div class="kb-inner">${th ? `<p class="kb-theme">${escH(th.emojis[0])} ${escH(th.name)} ${escH(th.emojis[0])}</p>` : ""}<p class="kb-who">${opts && opts.avatarHtml ? opts.avatarHtml + " " + escH(opts.label || "") : who === "you" ? "You found it" : escH(who) + " found it"}</p><p class="kb-big"><span>1 in</span> Attillion</p>${opts && opts.odds ? `<p class="kb-odds">${escH(opts.odds)}</p>` : ""}${opts && opts.avatarHtml ? "" : `<p class="kb-pts">+100</p>`}</div>`;
  document.body.appendChild(banner);
  const end = () => { banner.classList.add("out"); document.body.classList.remove("krillion-hit"); setTimeout(() => banner.remove(), 500); };
  const timer = setTimeout(end, 2600);
  banner.addEventListener("click", () => { clearTimeout(timer); end(); });

  if (th) { themedBurst(x, y, th); return; }
  // a burst of gold stars shoots out from the altitude marker and swirls
  for (let i = 0; i < 200; i++) {
    const a = rand(0, TAU), sp = rand(120, 620);
    parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: rand(0, TAU), spin: rand(-6, 6), size: rand(3, 8), life: rand(1.6, 3.2),
      update(p, dt) {
        p.vx *= 0.975; p.vy = p.vy * 0.975 - 20 * dt; // drift upward
        const sw = 70; p.vx += -p.vy / sw * dt * 60 * 0.15; p.vy += p.vx / sw * dt * 60 * 0.15; // swirl
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      },
      draw(c, p) { sparkle(c, p.x, p.y, p.size, Math.random() < 0.1 ? "#fff4cf" : "#ffc93c", Math.min(1, p.life), p.rot); }
    });
  }
  // shockwave rings
  for (let i = 0; i < 3; i++) parts.push({
    x, y, life: 1.4, max: 1.4, delay: i * 0.18,
    update(p, dt) { if (p.delay > 0) { p.delay -= dt; p.life += dt; } },
    draw(c, p) { if (p.delay > 0) return; const k = 1 - p.life / p.max; c.strokeStyle = `rgba(255,201,60,${(1 - k) * 0.9})`; c.lineWidth = 4 * (1 - k) + 1; c.beginPath(); c.arc(p.x, p.y, 20 + k * Math.max(W, H) * 0.6, 0, TAU); c.stroke(); }
  });
}

/* an event's own 1 in Attillion: its emojis burst out and swirl, more rain down
   from the top, and the shockwaves and sparkles take the event's colour */
function emoji(c, ch, x, y, size, alpha, rot) {
  c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = Math.max(0, Math.min(1, alpha));
  c.font = size + "px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(ch, 0, 0); c.restore();
}
function themedBurst(x, y, th) {
  const pick = () => th.emojis[Math.floor(Math.random() * th.emojis.length)];
  const col = `rgb(${th.rgb})`;
  for (let i = 0; i < 70; i++) {
    const a = rand(0, TAU), sp = rand(150, 560);
    parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: rand(-0.5, 0.5), spin: rand(-3, 3), size: rand(18, 38), life: rand(1.8, 3.2), ch: pick(),
      update(p, dt) {
        p.vx *= 0.97; p.vy = p.vy * 0.97 + 30 * dt;
        const sw = 70; p.vx += -p.vy / sw * dt * 60 * 0.12; p.vy += p.vx / sw * dt * 60 * 0.12;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
      },
      draw(c, p) { emoji(c, p.ch, p.x, p.y, p.size, Math.min(1, p.life), p.rot); }
    });
  }
  for (let i = 0; i < 40; i++) parts.push({
    x: rand(0, W), y: rand(-H * 0.6, -20), vy: rand(160, 320), sway: rand(0, TAU), rot: 0, size: rand(20, 34), life: 3.4, delay: rand(0, 0.9), ch: pick(),
    update(p, dt) { if (p.delay > 0) { p.delay -= dt; p.life += dt; return; } p.y += p.vy * dt; p.sway += dt * 2; p.x += Math.sin(p.sway) * 40 * dt; p.rot = Math.sin(p.sway) * 0.3; },
    draw(c, p) { if (p.delay > 0) return; emoji(c, p.ch, p.x, p.y, p.size, Math.min(1, p.life), p.rot); }
  });
  for (let i = 0; i < 90; i++) {
    const a = rand(0, TAU), sp = rand(100, 600);
    parts.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: rand(0, TAU), spin: rand(-6, 6), size: rand(3, 7), life: rand(1.2, 2.4),
      update(p, dt) { p.vx *= 0.975; p.vy *= 0.975; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt; },
      draw(c, p) { sparkle(c, p.x, p.y, p.size, Math.random() < 0.15 ? "#ffffff" : col, Math.min(1, p.life), p.rot); }
    });
  }
  for (let i = 0; i < 3; i++) parts.push({
    x, y, life: 1.4, max: 1.4, delay: i * 0.18,
    update(p, dt) { if (p.delay > 0) { p.delay -= dt; p.life += dt; } },
    draw(c, p) { if (p.delay > 0) return; const k = 1 - p.life / p.max; c.strokeStyle = `rgba(${th.rgb},${(1 - k) * 0.9})`; c.lineWidth = 4 * (1 - k) + 1; c.beginPath(); c.arc(p.x, p.y, 20 + k * Math.max(W, H) * 0.6, 0, TAU); c.stroke(); }
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
  // the full 1 in Attillion moment, played when you pick a new avatar
  celebrate(el, avatarId, avatarHtml, label, theme) {
    if (!el || reduce) return;
    if (avatarId === "dev" || avatarId === "rdev" || avatarId === "gdev") devTakeover(el, avatarId);
    else krillion(el, "", { avatarHtml, label, theme });
    runFx();
  },
  reveal(card, zoneKey, who, opts) {
    if (!card) return;
    card.classList.add("fx-" + (zoneKey || "none"));
    if (reduce || !zoneKey || !effects[zoneKey]) return;
    effects[zoneKey](card, who, opts);
    runFx();
  }
};
})();

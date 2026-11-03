// Online chanting room: front-end prototype. People are simulated locally; a server will replace `bots`.
const C = 0.288; // stand-head width relative to the seat spacing (see tools/build.py)
const A = "assets/";

// Seat rows per camera: y = cushion centre (% of height), sp = seat spacing (% of width). r0 is the row closest to the altar.
const CAMS = {
  cam1: { view: "front", rows: [{ y: 86, sp: 17 }, { y: 71, sp: 13.8 }, { y: 61.5, sp: 10 }, { y: 55.5, sp: 7.3 }], start: { x: 50, y: 54 },
          door: { img: "door-cam1", l: 41.6, r: 58.6, t: 26.8, b: 53.4 }, cushion: "cushion-low",
          lanterns: [[24, 9], [50, 6.5], [76, 9]], cat: [8, 98.5] },
  cam2: { view: "front", rows: [{ y: 90, sp: 16 }, { y: 73, sp: 13.5 }, { y: 58, sp: 10 }, { y: 47.5, sp: 7 }], start: { x: 50, y: 45 },
          door: { img: "door-cam2", l: 41.4, r: 58.6, t: 20, b: 43.8 }, cushion: "cushion-high", fg: "fg-cam2-statue",
          lanterns: [[22, 10], [50, 8], [78, 10]], cat: [92, 99] },
  cam3: { view: "back", rows: [{ y: 51.5, sp: 7.3 }, { y: 62, sp: 10.4 }, { y: 75.5, sp: 12.7 }, { y: 91, sp: 17 }], start: { x: 50, y: 108 },
          door: null, cushion: "cushion-high", lanterns: [[24, 10], [50, 7], [76, 10]], cat: [8, 99] },
};
const TYPES = [["laym", "Cư sĩ nam"], ["layf", "Cư sĩ nữ"], ["nun", "Ni cô"], ["monk", "Sư thầy"], ["casualm", "Bạn nam"], ["casualf", "Bạn nữ"], ["elder", "Người lớn tuổi"], ["kid", "Em bé"]];
const NAMES = ["Minh An", "Thu Hà", "Diệu Liên", "Quang Huy", "Bảo Ngọc", "Phước Thịnh", "Thanh Tâm", "Hoài An", "Tuệ Minh", "Gia Bảo", "Như Ý", "Hải Đăng", "Kim Chi", "An Nhiên", "Đức Trí", "Lan Anh", "Tâm Đức", "Mai Phương", "Văn Khánh", "Hồng Nhung", "Thiện Nhân", "Bích Thủy"];

const $ = (s) => document.querySelector(s);
const stage = $("#stage"), sceneEl = $("#scene"), decoEl = $("#deco"), seatsEl = $("#seats"), peopleEl = $("#people"), doorsEl = $("#doors"), fxEl = $("#fx"), toastEl = $("#toast");
const state = { cam: "cam1", tod: "day", mood: "serious", sound: false, picking: false, me: null, people: new Map(), seats: Array(20).fill(null), stats: { mo: 0, lay: 0 }, entering: 0, nextId: 1 };
let meta = null, W = 1, H = 1;
const cache = new Map();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ------------------------------------------------------------------ geometry
function spacingAt(cam, y) {
  const rows = [...CAMS[cam].rows].sort((a, b) => a.y - b.y);
  if (y <= rows[0].y) { const [p, q] = [rows[0], rows[1]]; return p.sp + (y - p.y) * (q.sp - p.sp) / (q.y - p.y); }
  for (let i = 0; i < rows.length - 1; i++) {
    if (y <= rows[i + 1].y) { const [p, q] = [rows[i], rows[i + 1]]; return p.sp + (y - p.y) * (q.sp - p.sp) / (q.y - p.y); }
  }
  const [p, q] = [rows[rows.length - 2], rows[rows.length - 1]];
  return q.sp + (y - q.y) * (q.sp - p.sp) / (q.y - p.y);
}
function seatPos(cam, idx) {
  const r = Math.floor(idx / 5), k = idx % 5, row = CAMS[cam].rows[r];
  return { x: 50 + (k - 2) * row.sp + (r % 2 ? 0.25 : -0.25) * row.sp, y: row.y, sp: row.sp };
}
const px = (xPct) => (xPct * W) / 100, py = (yPct) => (yPct * H) / 100;

// ------------------------------------------------------------------ assets
function img(name) {
  if (!cache.has(name)) { const i = new Image(); i.decoding = "async"; i.src = `${A}${name}.webp`; cache.set(name, i); }
  return cache.get(name);
}
const poseName = (type, view, pose) => `${type}-${view}-${pose}`;
const effType = (p) => (state.mood === "funny" ? "funny-laym" : p.type);
function hasPose(type, view, pose) { return !!meta.sprites[poseName(type, view, pose)]; }
function preloadSet(type, view) { ["stand", "step-l", "step-r", "sit", "pray", "mo", "lay1", "lay2", "lay3", "incense", "kneel-mid"].forEach((p) => hasPose(type, view, p) && img(poseName(type, view, p))); }
function toast(text, ms = 2600) { toastEl.textContent = text; toastEl.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => toastEl.classList.remove("show"), ms); }

// ------------------------------------------------------------------ people
function render(p) {
  // size and place a person's sprite from p.pose and p.pos (anchor = bottom centre)
  const cam = state.cam, view = CAMS[cam].view;
  let pose = p.pose;
  let name = poseName(effType(p), view, pose);
  if (!meta.sprites[name]) { pose = pose === "kneel-mid" || pose === "lay1" || pose === "lay2" ? "pray" : pose === "incense" ? "pray" : "sit"; name = poseName(effType(p), view, pose); }
  const s = meta.sprites[name];
  const spPx = px(spacingAt(cam, p.pos.y));
  const w = s.w * s.f * C * spPx;
  p.img.src = img(name).src;
  p.el.style.width = `${w}px`;
  p.el.style.left = `${px(p.pos.x)}px`;
  p.el.style.top = `${py(p.pos.y)}px`;
  p.el.style.zIndex = Math.round(p.pos.y * 10) + (p.seated ? 3 : 1);
}
function anchorFor(cam, seatIdx) {
  const s = seatPos(cam, seatIdx), spPx = px(s.sp), cm = meta.deco[CAMS[cam].cushion];
  const cushionH = (cm.h / cm.w) * spPx * 0.86;
  return { x: s.x, y: s.y - (cushionH * 0.16 / H) * 100 };
}
function makePerson({ name, type, seat, me = false }) {
  const el = document.createElement("div");
  el.className = "person" + (me ? " me" : "");
  el.style.cssText = "position:absolute;transform:translate(-50%,-100%)";
  const im = document.createElement("img"); im.alt = ""; im.draggable = false; im.style.transformOrigin = "50% 100%";
  const tag = document.createElement("span"); tag.className = "tag"; tag.textContent = name;
  el.append(im, tag); peopleEl.append(el);
  const p = { id: state.nextId++, name, type, seat, me, el, img: im, pose: "stand", pos: { x: 50, y: 50 }, seated: false, token: 0, busy: false };
  state.people.set(p.id, p);
  return p;
}
function setSeated(p, idx) { p.pos = anchorFor(state.cam, idx); p.seated = true; }
function snapSeated(p) { p.token++; p.busy = false; p.pose = "sit"; setSeated(p, p.seat); render(p); }

async function wait(p, tok, ms) { await sleep(ms); return p.token === tok; }

async function walkTo(p, tok, from, to, seconds) {
  p.seated = false;
  const t0 = performance.now(); let lastStep = 0, left = true;
  return new Promise((resolve) => {
    const tick = (now) => {
      if (p.token !== tok) return resolve(false);
      const t = Math.min(1, (now - t0) / (seconds * 1000)), k = t;
      p.pos = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
      if (now - lastStep > 270) { left = !left; lastStep = now; }
      p.pose = left ? "step-l" : "step-r";
      render(p);
      const bob = Math.abs(Math.sin((now - t0) / 270 * Math.PI)) * 0.018;
      p.img.style.transform = `translateY(${-bob * p.el.offsetWidth * 1.2}px) rotate(${left ? -1.2 : 1.2}deg)`;
      if (t >= 1) { p.img.style.transform = ""; return resolve(true); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function sitDown(p, tok) {
  const view = CAMS[state.cam].view, t = effType(p);
  p.pose = "stand"; p.pos = { ...p.pos }; render(p);
  if (!(await wait(p, tok, 180))) return false;
  if (hasPose(t, view, "kneel-mid")) { p.pose = "kneel-mid"; setSeated(p, p.seat); render(p); if (!(await wait(p, tok, 260))) return false; }
  p.pose = "sit"; setSeated(p, p.seat); render(p);
  p.img.classList.remove("settle"); void p.img.offsetWidth; p.img.classList.add("settle");
  return true;
}

function setDoors(open) {
  const d = doorsEl.firstElementChild; if (d) d.classList.toggle("open", open);
}
async function enterRoom(p) {
  const cam = state.cam, tok = ++p.token, c = CAMS[cam];
  state.entering++;
  p.pos = { ...c.start }; p.pose = "stand"; p.seated = false; render(p);
  p.el.style.opacity = 0; if (c.door) setDoors(true);
  if (!(await wait(p, tok, c.door ? 700 : 100))) { state.entering--; return; }
  p.el.style.opacity = 1;
  const to = { ...anchorFor(cam, p.seat) }; to.y += 0; // feet land on the seat
  const dist = Math.hypot(to.x - c.start.x, to.y - c.start.y);
  const ok = await walkTo(p, tok, c.start, to, Math.max(2.4, dist / 11));
  state.entering--;
  if (state.entering === 0) setTimeout(() => state.entering === 0 && setDoors(false), 1400);
  if (!ok) return;
  await sitDown(p, tok);
  updateCount();
}

async function act(p, kind) {
  if (p.busy || !p.seated) return;
  const tok = ++p.token, view = CAMS[state.cam].view, t = effType(p);
  p.busy = true; if (p.me) lockActions(true);
  const set = (pose) => { p.pose = hasPose(t, view, pose) ? pose : "pray"; setSeated(p, p.seat); render(p); };
  const done = () => { if (p.token !== tok) return; p.busy = false; p.pose = "sit"; setSeated(p, p.seat); render(p); if (p.me) lockActions(false); };
  const seq = async (steps) => { for (const [pose, ms] of steps) { set(pose); if (!(await wait(p, tok, ms))) return false; } return true; };
  let ok = true;
  if (kind === "pray") ok = await seq([["pray", 2200]]);
  else if (kind === "lay") {
    state.stats.lay++; showStats();
    ok = await seq([["pray", 320], ["lay1", 320], ["lay2", 380], ["lay3", 900], ["lay2", 320], ["lay1", 320], ["pray", 320]]);
  } else if (kind === "mo") {
    set("mo");
    for (let i = 0; i < 6; i++) {
      if (!(await wait(p, tok, 520))) { ok = false; break; }
      p.img.classList.remove("strike"); void p.img.offsetWidth; p.img.classList.add("strike");
      ripple(p); tok_(); state.stats.mo++; showStats();
    }
  } else if (kind === "incense") {
    set("incense"); smoke(p); if (!(await wait(p, tok, 1500))) ok = false; else { smoke(p); ok = await wait(p, tok, 1500); }
  }
  if (ok) done();
}

// ------------------------------------------------------------------ effects
function ripple(p) {
  const d = document.createElement("div"); d.className = "ripple";
  const size = p.el.offsetWidth * 0.9;
  d.style.cssText = `left:${px(p.pos.x)}px;top:${py(p.pos.y) - p.el.offsetHeight * 0.32}px;width:${size}px;height:${size * 0.4}px`;
  fxEl.append(d); setTimeout(() => d.remove(), 950);
}
function smoke(p) {
  const d = document.createElement("img"); d.className = "smoke"; d.src = `${A}fx-smoke.webp`;
  d.style.cssText = `left:${px(p.pos.x)}px;top:${py(p.pos.y) - p.el.offsetHeight * 1.05}px;width:${p.el.offsetWidth * 0.5}px`;
  fxEl.append(d); setTimeout(() => d.remove(), 3500);
}
let audio;
function tok_() {
  if (!state.sound) return;
  audio = audio || new (window.AudioContext || window.webkitAudioContext)();
  const t = audio.currentTime, o = audio.createOscillator(), g = audio.createGain();
  o.type = "sine"; o.frequency.setValueAtTime(430, t); o.frequency.exponentialRampToValueAtTime(210, t + 0.14);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  o.connect(g).connect(audio.destination); o.start(t); o.stop(t + 0.25);
}
function petals() {
  const items = ["deco-petals-0", "deco-petals-1", "deco-petals-2"].filter((n) => meta.deco[n]);
  if (!items.length) return;
  setInterval(() => {
    if (document.hidden) return;
    const d = document.createElement("img"), n = pick(items); d.className = "petal"; d.src = `${A}${n}.webp`;
    const size = rand(0.018, 0.03) * W;
    d.style.cssText = `left:${rand(5, 95)}%;top:-6%;width:${size}px;--dx:${rand(-60, 60)}px;--dy:${H * 1.1}px;--rot:${rand(-200, 200)}deg;animation-duration:${rand(9, 15)}s`;
    fxEl.append(d); setTimeout(() => d.remove(), 16000);
  }, 2200);
}

// ------------------------------------------------------------------ scene layout
function layout() {
  W = stage.clientWidth; H = stage.clientHeight;
  const cam = state.cam, c = CAMS[cam];
  sceneEl.src = `${A}scene-${cam}-${state.tod}.webp`;
  // deco
  decoEl.innerHTML = "";
  c.lanterns.forEach(([x, y], i) => {
    const n = `deco-lanterns-${i % 3}`; if (!meta.deco[n]) return;
    const d = document.createElement("img"); d.src = `${A}${n}.webp`; d.className = "sprite sway";
    d.style.cssText = `left:${px(x)}px;top:${py(y)}px;width:${W * (i === 1 ? 0.055 : 0.045)}px;transform:translate(-50%,0);animation-delay:${-i * 1.3}s`;
    decoEl.append(d);
  });
  if (meta.deco["deco-cat-0"]) {
    const d = document.createElement("img"); d.src = `${A}deco-cat-0.webp`; d.className = "sprite";
    d.style.cssText = `left:${px(c.cat[0])}px;top:${py(c.cat[1])}px;width:${W * 0.07}px;transform:translate(-50%,-100%);z-index:2000`;
    decoEl.append(d);
  }
  // cushions and seat hit areas
  seatsEl.innerHTML = "";
  for (let i = 0; i < 20; i++) {
    const s = seatPos(cam, i), spPx = px(s.sp), z = Math.round(s.y * 10);
    const cu = document.createElement("img"); cu.className = "cushion"; cu.src = `${A}${c.cushion}.webp`;
    cu.style.cssText = `left:${px(s.x)}px;top:${py(s.y)}px;width:${spPx * 0.86}px;z-index:${z}`;
    const hit = document.createElement("div"); hit.className = "seat-hit" + (state.seats[i] ? "" : " free"); hit.dataset.seat = i;
    hit.style.cssText = `left:${px(s.x)}px;top:${py(s.y)}px;width:${spPx * 0.95}px;height:${spPx * 0.6}px;z-index:5000`;
    hit.addEventListener("click", () => chooseSeat(i));
    seatsEl.append(cu, hit);
  }
  // doors
  doorsEl.innerHTML = "";
  if (c.door) {
    const d = meta.deco[c.door.img], box = document.createElement("div");
    box.className = "doors" + (state.entering > 0 ? " open" : "");
    box.style.cssText = `position:absolute;left:${px(c.door.l)}px;top:${py(c.door.t)}px;width:${px(c.door.r - c.door.l)}px;height:${py(c.door.b - c.door.t)}px;z-index:1`;
    for (const side of ["l", "r"]) {
      const leaf = document.createElement("div"); leaf.className = `leaf ${side}`;
      leaf.style.cssText = `top:0;height:100%;width:50%;${side === "l" ? "left:0" : "right:0"};background-image:url(${A}${c.door.img}.webp)`;
      box.append(leaf);
    }
    doorsEl.append(box);
  }
  if (c.fg) { // the statue stands in front of the first row: draw it above the people
    const f = document.createElement("img"); f.src = `${A}${c.fg}.webp`; f.className = "sprite";
    f.style.cssText = "left:0;top:0;width:100%;height:100%;z-index:9000;pointer-events:none"; doorsEl.append(f);
  }
  seatsEl.parentElement.classList.toggle("picking", state.picking);
  for (const p of state.people.values()) { if (p.seat != null && p.seated) { p.pos = anchorFor(cam, p.seat); } render(p); }
}

function chooseSeat(i) {
  if (!state.picking || state.seats[i] || state.me) return;
  state.picking = false; stage.classList.remove("picking");
  const name = ($("#name").value.trim() || "Bạn").slice(0, 24), type = document.querySelector('.type[aria-checked="true"]')?.dataset.type || "laym";
  const p = makePerson({ name, type, seat: i, me: true });
  state.seats[i] = p.id; state.me = p; refreshSeats();
  $("#join").classList.add("hidden"); $("#actions").classList.remove("hidden"); lockActions(true);
  preloadSet(type, CAMS[state.cam].view);
  enterRoom(p).then(() => { lockActions(false); toast("Bạn đã vào chỗ. Chúc bạn an lạc."); });
  updateCount();
}
function refreshSeats() { document.querySelectorAll(".seat-hit").forEach((h) => h.classList.toggle("free", !state.seats[+h.dataset.seat])); }
function freeSeats() { return state.seats.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0); }
function updateCount() {
  const n = state.seats.filter(Boolean).length; $("#count").textContent = `${n}/20`; $("#n-people").textContent = n;
}
function showStats() { $("#n-mo").textContent = state.stats.mo; $("#n-lay").textContent = state.stats.lay; }
function lockActions(v) { document.querySelectorAll("#actions [data-act]").forEach((b) => (b.disabled = v)); }

// ------------------------------------------------------------------ simulated people
function addBot() {
  const free = freeSeats(); if (!free.length) { toast("Phòng đã đủ 20 người."); return null; }
  const seat = pick(free), type = pick(TYPES)[0];
  const p = makePerson({ name: pick(NAMES), type, seat });
  state.seats[seat] = p.id; refreshSeats(); preloadSet(type, CAMS[state.cam].view);
  enterRoom(p); updateCount(); return p;
}
function leave(p) {
  p.token++; p.el.style.transition = "opacity .5s"; p.el.style.opacity = 0;
  state.seats[p.seat] = null; state.people.delete(p.id); refreshSeats(); updateCount();
  setTimeout(() => p.el.remove(), 600);
}
setInterval(() => {
  if (!$("#auto").checked || document.hidden) return;
  const idle = [...state.people.values()].filter((p) => !p.me && p.seated && !p.busy);
  if (idle.length && Math.random() < 0.55) act(pick(idle), pick(["lay", "mo", "mo", "pray", "incense"]));
}, 2200);

// ------------------------------------------------------------------ UI
function switchCam(cam) {
  if (cam === state.cam) return;
  stage.dataset.switching = "1";
  setTimeout(() => {
    state.cam = cam;
    for (const p of state.people.values()) { preloadSet(effType(p), CAMS[cam].view); p.token++; p.busy = false; if (p.seat != null) { p.pose = "sit"; p.seated = true; } }
    layout();
    for (const p of state.people.values()) snapSeated(p);
    if (state.me) lockActions(false);
    stage.dataset.switching = "0";
  }, 320);
}
function seg(sel, attr, fn) {
  document.querySelectorAll(`${sel} button`).forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(`${sel} button`).forEach((x) => x.classList.toggle("on", x === b)); fn(b.dataset[attr]);
  }));
}

async function main() {
  meta = await (await fetch(`${A}meta.json`)).json();
  // character picker
  const box = $("#types");
  TYPES.forEach(([t, label], i) => {
    const b = document.createElement("button"); b.className = "type"; b.dataset.type = t; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", i === 0 ? "true" : "false");
    b.innerHTML = `<img src="${A}${t}-front-sit.webp" alt=""><span>${label}</span>`;
    b.addEventListener("click", () => box.querySelectorAll(".type").forEach((x) => x.setAttribute("aria-checked", x === b ? "true" : "false")));
    box.append(b);
  });
  seg("#cams", "cam", switchCam);
  seg("#tod", "tod", (v) => { state.tod = v; sceneEl.src = `${A}scene-${state.cam}-${v}.webp`; });
  seg("#mood", "mood", (v) => { state.mood = v; for (const p of state.people.values()) { preloadSet(effType(p), CAMS[state.cam].view); render(p); } });
  $("#sound").addEventListener("click", (e) => { state.sound = !state.sound; e.target.textContent = `Âm thanh: ${state.sound ? "bật" : "tắt"}`; e.target.setAttribute("aria-pressed", state.sound); if (state.sound) tok_(); });
  $("#enter").addEventListener("click", () => {
    if (!freeSeats().length) return toast("Phòng đã đủ 20 người.");
    state.picking = true; stage.classList.add("picking"); layout(); toast("Bấm vào một bồ đoàn còn trống để vào chỗ.", 3500);
  });
  document.querySelectorAll("#actions [data-act]").forEach((b) => b.addEventListener("click", () => state.me && act(state.me, b.dataset.act)));
  $("#leave").addEventListener("click", () => {
    if (!state.me) return; const p = state.me; state.me = null; leave(p); lockActions(false);
    $("#actions").classList.add("hidden"); $("#join").classList.remove("hidden");
  });
  $("#add-bot").addEventListener("click", addBot);
  $("#fill").addEventListener("click", () => { let i = 0; const t = setInterval(() => { if (!addBot() || ++i >= 20) clearInterval(t); }, 450); });
  new ResizeObserver(() => { layout(); }).observe(stage);
  sceneEl.addEventListener("load", () => {});
  TYPES.forEach(([t]) => preloadSet(t, "front"));
  layout(); petals();
  window.__room = { state, addBot, act, CAMS, seatPos, switchCam, layout };
}
main();

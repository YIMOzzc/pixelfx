// The gallery: every effect playing live from its own code. Tiles start when they scroll into view; a click
// opens one effect with its options, a sprite sheet and the code to use it.

import { effects, categories } from "../src/fx/index.js";
import { createFrame, clearFrame, createFx, createAct, actBounds, composite, backdrop, drawActor, painterFor, stockActor, createCharacter, CHARACTER_STYLES, actorAlphaOf, PAL, BACKDROPS } from "../src/core/index.js";
import { i18n, t, LANGUAGES } from "./i18n.js";

const REPO = "https://github.com/patch-gg/pixelfx";
/** Clipboard confirmation duration, independent of the selected language. */
const COPY_FEEDBACK_MS = 1400;
/** Display metadata plus bilingual search text; localization never mutates effect modules. */
const FX = Object.entries(effects).map(([id, mod]) => {
  const meta = { fps: 30, bg: "dark", loop: false, duration: 1, tags: [], options: {}, ...mod.meta };
  const cat = id.split("/")[0];
  const search = [id, ...meta.tags, ...LANGUAGES.flatMap(({ code }) => {
    const tr = i18n.getFixedT(code);
    return [tr(`effects.${id}.name`), tr(`effects.${id}.desc`), tr(`categories.${cat}.name`), tr(meta.loop ? "loop" : "oneShot")];
  })].join(" ").toLowerCase();
  return { id, cat, name: meta.name, search, mod: { ...mod, meta }, meta };
});
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
// full-screen effects (transitions, weather, impact frames) fill a 16:9 stage edge to edge instead of floating in it
const isScreen = (fx) => fx.meta.size[0] >= 320 && Math.abs(fx.meta.size[0] / fx.meta.size[1] - 16 / 9) < 0.05;
const supportsCharacter = (fx) => !!(fx.meta.actor || fx.mod.act);
const characterCount = FX.filter(supportsCharacter).length;
const $ = (s) => document.querySelector(s);
function el(tag, props = {}, kids = []) {
  const e = Object.assign(document.createElement(tag), props);
  for (const k of [].concat(kids)) e.append(k);
  return e;
}

// ---- a live effect on a canvas, at an integer scale that fits the stage
class Player {
  constructor(canvas, fx, aspect, pad) {
    Object.assign(this, { canvas, fx, ctx: canvas.getContext("2d"), opts: {}, flip: false, actor: true, speed: 1, playing: true });
    this.bg = fx.meta.bg;
    this.layout(aspect, pad);
  }
  // the art-pixel stage: the effect's canvas plus some room, stretched to the tile's aspect; CSS scales it up
  layout(aspect, pad) {
    Object.assign(this, { aspect, pad });
    // an act needs room for the whole performance, not just the effect's canvas
    const acted = this.acted, b = acted ? { ...actBounds(this.fx.mod, this.opts.actor) } : null;
    // an act happens above the floor: don't spend the tile on bricks
    if (b) b.y1 = Math.min(b.y1, 22);
    const [w, h] = acted ? [b.x1 - b.x0, b.y1 - b.y0] : this.fx.meta.size, [ox, oy] = acted ? [-b.x0, -b.y0] : this.fx.meta.origin;
    this.W = Math.ceil(Math.max(w * (acted ? Math.min(pad, 1.1) : pad), h * (acted ? Math.min(pad, 1.1) : pad) * aspect));
    this.H = Math.ceil(this.W / aspect);
    this.x = Math.floor((this.W - w) / 2) + ox;
    // an act stands near the bottom of its tile, with the room above it
    this.y = acted ? Math.max(oy + 2, this.H - b.y1 - 2) : Math.floor((this.H - h) / 2) + oy;
    this.canvas.width = this.W;
    this.canvas.height = this.H;
    // shrinking pixel art nearest-neighbour drops whole 1 px lines; smooth it only when it has to shrink
    const shown = this.canvas.getBoundingClientRect().width * devicePixelRatio;
    this.canvas.style.imageRendering = shown && shown < this.W ? "auto" : "";
    this.frame = createFrame(this.W, this.H);
    this.img = this.ctx.createImageData(this.W, this.H);
    this.setBg(this.bg);
    this.restart();
  }
  setBg(kind) {
    this.bg = kind;
    this.bgBuf = kind === "none" ? null : backdrop(kind, this.W, this.H, this.y);
    this.dirty = true;
  }
  // an effect with an act plays it, unless the character is switched off
  get acted() {
    return !!this.fx.mod.act && this.actor;
  }
  restart() {
    this.inst = (this.acted ? createAct : createFx)(this.fx.mod, { x: this.x, y: this.y, flip: this.flip, ...this.opts });
    this.acc = 0;
    this.wait = 0;
    this.dirty = true;
  }
  tick(dt) {
    const m = this.fx.meta, step = 1 / m.fps;
    if (this.playing) this.acc = Math.min(this.acc + dt * this.speed, 0.25);
    let moved = false;
    while (this.acc >= step) {
      this.acc -= step;
      if (!m.loop && (this.acted ? this.inst.done() : this.inst.t >= m.duration)) {
        this.wait += step;
        if (this.wait > 0.45) this.restart();
      } else this.inst.update(step);
      moved = true;
    }
    if (moved || this.dirty) this.render();
  }
  seek(t) {
    this.restart();
    this.inst.update(t);
    this.render();
  }
  render() {
    const f = clearFrame(this.frame);
    if (this.acted) {
      this.inst.draw(f);
      composite(f, this.img.data, this.bgBuf);
      const [sx, sy] = this.inst.shake;
      if (sx || sy) this.ctx.clearRect(0, 0, this.W, this.H);
      this.ctx.putImageData(this.img, sx, sy);
      this.dirty = false;
      return;
    }
    this.inst.draw(f, "back");
    const m = this.fx.meta, tt = m.loop ? this.inst.t % m.duration : Math.min(this.inst.t, m.duration);
    if (m.actor && this.actor) drawActor(painterFor(f).place(this.x, this.y, this.flip), this.inst.options.actor ?? stockActor(), actorAlphaOf(this.fx.mod, tt, this.inst.options));
    this.inst.draw(f, "front");
    composite(f, this.img.data, this.bgBuf);
    this.ctx.putImageData(this.img, 0, 0);
    this.dirty = false;
  }
}

// ---- tiles
const tiles = [];
const sections = [];
function build() {
  const main = $("#grid");
  for (const c of categories) {
    const list = FX.filter((f) => f.cat === c.id);
    if (!list.length) continue;
    const grid = el("div", { className: "grid" });
    const sec = el("section", { id: c.id }, [el("div", { className: "section-head" }, [el("h2", { textContent: c.name + "." }), el("p", { textContent: c.blurb })]), grid]);
    sections.push({ c, sec, list });
    for (const fx of list) {
      const cv = el("canvas", { ariaLabel: fx.name });
      const b = fx.mod.act ? actBounds(fx.mod) : null, [fw, fh] = b ? [b.x1 - b.x0, b.y1 - b.y0] : fx.meta.size;
      const fig = el("figure", { className: isScreen(fx) ? "tile big screen" : fw > 200 || fh > 170 || (b && (fw > 130 || fx.mod.act.target || fx.mod.act.targets)) ? "tile big" : "tile", tabIndex: 0 }, [
        el("div", { className: "stage" }, cv),
        el("figcaption", {}, [el("b", { textContent: fx.name }), el("small", { textContent: fx.meta.loop ? "loop" : `${+fx.meta.duration.toFixed(2)}s` })]),
      ]);
      const t = { fx, fig, cv, player: null, visible: false, hover: false };
      fig.addEventListener("click", () => openDetail(fx));
      fig.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), openDetail(fx)));
      fig.addEventListener("pointerenter", () => (t.hover = true));
      fig.addEventListener("pointerleave", () => (t.hover = false));
      grid.append(fig);
      tiles.push(t);
    }
    main.append(sec);
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const t = tiles.find((x) => x.fig === e.target);
      t.visible = e.isIntersecting;
      if (t.visible && !t.player) {
        t.player = isScreen(t.fx) ? new Player(t.cv, t.fx, 16 / 9, 1) : new Player(t.cv, t.fx, 6 / 5, 1.25);
        if (reduced) t.player.seek(t.fx.meta.duration * 0.4);
      }
    }
  }, { rootMargin: "200px" });
  tiles.forEach((t) => io.observe(t.fig));
}

// ---- filters
const state = { cat: "all", q: "" };
function chips() {
  const box = $("#chips");
  const mk = (id, label, n) => {
    const b = el("button", { className: "chip", type: "button" }, [label, el("span", { textContent: n })]);
    b.dataset.cat = id;
    b.addEventListener("click", () => setCat(id));
    box.append(b);
  };
  box.replaceChildren();
  mk("all", t("all"), FX.length);
  mk("characters", t("withCharacters"), characterCount);
  for (const s of sections) mk(s.c.id, t(`categories.${s.c.id}.name`), s.list.length);
}
function setCat(id, fromHash = false) {
  state.cat = id === "characters" || sections.some((s) => s.c.id === id) ? id : "all";
  document.querySelectorAll(".chip").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.cat === state.cat)));
  if (!fromHash) history.replaceState(null, "", state.cat === "all" ? location.pathname : "#" + state.cat);
  filter();
  if (!fromHash) window.scrollTo({ top: 0 });
}
function filter() {
  const q = state.q.trim().toLowerCase();
  let shown = 0;
  for (const s of sections) {
    let any = false;
    for (const fx of s.list) {
      const t = tiles.find((x) => x.fx === fx);
      const matchesCategory = state.cat === "characters"
        ? supportsCharacter(fx)
        : state.cat === "all" || state.cat === s.c.id;
      const hit = matchesCategory && (!q || fx.search.includes(q));
      t.fig.hidden = !hit;
      any ||= hit;
      shown += hit;
    }
    s.sec.hidden = !any;
  }
  $("#none").hidden = shown > 0;
}

// ---- detail
let detail = null;
const characterChoice = { style: "", seed: 1 };
function updateCharacter() {
  const enabled = supportsCharacter(detail.fx) && characterChoice.style;
  if (enabled) {
    const { style, seed } = characterChoice;
    detail.opts.actor = createCharacter({ style: style === "random" ? undefined : style, seed });
  } else delete detail.opts.actor;
  $("#d-character-seed").disabled = !enabled;
  $("#d-character-roll").disabled = !enabled;
  if (detail.acted) detail.layout(detail.aspect, detail.pad);
  else detail.restart();
  $("#d-sheet").replaceChildren();
  code(detail.fx);
}
/**
 * Update all visible copy in place, preserving players, filters, options and generated sprite sheets.
 * Uses plain text/attributes so translation strings cannot inject HTML.
 */
function renderLanguage() {
  document.documentElement.lang = LANGUAGES.find(({ code }) => code === i18n.language).htmlLang;
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n, { count: FX.length });
  });
  for (const attr of ["placeholder", "aria-label", "content"]) {
    document.querySelectorAll(`[data-i18n-${attr}]`).forEach((node) => node.setAttribute(attr, t(node.getAttribute(`data-i18n-${attr}`))));
  }
  document.querySelectorAll("[data-language]").forEach((select) => { select.value = i18n.language; });
  for (const { c, sec } of sections) {
    sec.querySelector("h2").textContent = t(`categories.${c.id}.name`) + ".";
    sec.querySelector(".section-head p").textContent = t(`categories.${c.id}.blurb`);
  }
  for (const { fx, fig, cv } of tiles) {
    const name = t(`effects.${fx.id}.name`);
    fig.querySelector("b").textContent = name;
    cv.ariaLabel = name;
    fig.querySelector("small").textContent = fx.meta.loop ? t("loop") : t("duration", { seconds: +fx.meta.duration.toFixed(2) });
  }
  chips();
  setCat(state.cat, true);
  if (detail) {
    detailText();
    code(detail.fx);
    if ($("#d-sheet img")) sheetText();
  }
}

/** Translate the active detail's metadata and state-dependent controls without restarting playback. */
function detailText() {
  const { fx } = detail, m = fx.meta;
  const name = t(`effects.${fx.id}.name`);
  $("#d-name").textContent = name;
  $("#big").ariaLabel = name;
  $("#d-desc").textContent = t(`effects.${fx.id}.desc`);
  const frames = Math.round(m.duration * m.fps) + (m.loop ? 0 : 1);
  $("#d-facts").replaceChildren(
    ...[["kind", t(m.loop ? "loop" : "oneShot")], ["length", t("timing", { seconds: +m.duration.toFixed(2), count: frames, fps: m.fps })], ...(fx.mod.act ? [["acted", actFacts(fx.mod)]] : []), ["canvas", `${m.size[0]} × ${m.size[1]} px`], ["tags", m.tags.join(", ")]].flatMap(([k, v]) => [el("dt", { textContent: t(k) }), el("dd", { textContent: v })]),
  );
  for (const option of $("#d-pal").options) option.textContent = t(option.value ? `palettes.${option.value}` : "ownPalette");
  for (const option of $("#d-character-style").options) option.textContent = t(`characterStyles.${option.value || "stock"}`);
  $("#d-play").textContent = t(detail.playing ? "pause" : "play");
}

/** Open a fresh preview; the stable effect ID remains the source/export identifier in either language. */
function openDetail(fx) {
  const d = $("#detail");
  const big = $("#big"), screen = isScreen(fx);
  big.parentElement.classList.toggle("screen", screen);
  detail = screen ? new Player(big, fx, 16 / 9, 1) : new Player(big, fx, 16 / 10, 1.6);
  const m = fx.meta;
  $("#d-id").textContent = fx.id;
  // controls
  $("#d-bg").replaceChildren(...BACKDROPS.concat("none").map((b) => btn(t(`backdrops.${b}`), () => detail.setBg(b), b === m.bg, "bg", `backdrops.${b}`)));
  $("#d-speed").replaceChildren(...[0.25, 0.5, 1].map((s) => btn(`${s}×`, () => (detail.speed = s), s === 1, "speed")));
  const pal = $("#d-pal");
  pal.replaceChildren(el("option", { value: "" }), ...Object.keys(PAL).map((k) => el("option", { value: k })));
  pal.value = "";
  $("#d-actor").hidden = !supportsCharacter(fx);
  $("#d-character-controls").hidden = !supportsCharacter(fx);
  const style = $("#d-character-style");
  style.replaceChildren(...["", "random", ...CHARACTER_STYLES].map((value) => el("option", { value })));
  style.value = characterChoice.style;
  $("#d-character-seed").value = characterChoice.seed;
  updateCharacter();
  $("#d-actor").setAttribute("aria-pressed", "true");
  $("#d-flip").setAttribute("aria-pressed", "false");
  $("#d-play").setAttribute("aria-pressed", "true");
  detailText();
  $("#d-sheet").replaceChildren();
  code(fx);
  d.showModal();
  d.scrollTop = 0;
}
/** Describe wind-up, hit freezes and recovery using localized timing messages. */
function actFacts(mod) {
  const k = mod.act.poses, lead = Math.max(0, -k[0][0]), end = k[k.length - 1][0] - mod.meta.duration, hits = (mod.act.hits ?? []).filter((h) => h.stop);
  const parts = [];
  if (lead > 0) parts.push(t("windup", { seconds: lead.toFixed(2) }));
  if (hits.length) parts.push(t(hits.length === 1 ? "freeze" : "freezes", { count: hits.length, ms: Math.round(hits[0].stop * 1000), seconds: hits[0].t.toFixed(2) }));
  if (!mod.meta.loop && end > 0.02) parts.push(t("recovery", { seconds: end.toFixed(2) }));
  return parts.join(t("separator")) || t("bodyMoves");
}
/** Create a stateful option button; an optional translation key lets its label update in place. */
function btn(label, fn, on, group, translationKey) {
  const b = el("button", { className: "btn", type: "button", textContent: label });
  if (translationKey) b.dataset.i18n = translationKey;
  b.setAttribute("aria-pressed", String(!!on));
  b.addEventListener("click", () => {
    if (group) b.parentElement.querySelectorAll(".btn").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    fn();
  });
  return b;
}
/** Build executable integration code, localizing comments while keeping API names and IDs stable. */
function code(fx) {
  const v = fx.id.split("/")[1].replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const opts = { x: 160, y: 120, ...(detail.opts.palette ? { palette: "[…]" } : {}), ...(detail.flip ? { flip: true } : {}) };
  const acted = !!fx.mod.act, make = acted ? "createAct" : "createFx";
  const actor = detail.opts.actor;
  const drawCharacter = actor && !acted;
  $("#d-code").textContent = [
    `import { createFrame, ${make}, composite${actor ? ", createCharacter" : ""}${drawCharacter ? ", painterFor, drawActor, actorAlphaOf" : ""} } from "pixelfx";`,
    `import * as ${v} from "pixelfx/fx/${fx.id}";`,
    ``,
    `const frame = createFrame(320, 180);`,
    ...(actor ? [`const actor = createCharacter({ style: "${actor.style}", seed: ${actor.seed} });`] : []),
    `const fx = ${make}(${v}, ${JSON.stringify(opts).replace(/"\[…\]"/, "[…]").replace(/"(\w+)":/g, "$1: ").replace(/,/g, ", ").replace(/}$/, actor ? ", actor }" : "}")});`,
    ``,
    `// ${t("tickComment")}`,
    `fx.update(dt);`,
    ...(drawCharacter ? [
      `fx.draw(frame, "back");`,
      `const time = fx.meta.loop ? fx.t % fx.meta.duration : Math.min(fx.t, fx.meta.duration);`,
      `drawActor(painterFor(frame).place(160, 120, ${detail.flip}), actor, actorAlphaOf(${v}, time, fx.options));`,
      `fx.draw(frame, "front");`,
    ] : [`fx.draw(frame);          // ${t("buffersComment")}`]),
    `composite(frame, imageData.data, null);`,
    ...(acted ? [``, `// ${t("actComment", { name: v })}`] : []),
  ].join("\n");
  $("#d-src").href = `${REPO}/blob/main/src/fx/${fx.id}.js`;
}
/** Render effect pixels once; language changes only update the output image's accessible text and caption. */
function sheet() {
  const fx = detail.fx, m = fx.meta, [w, h] = m.size, n = Math.max(1, Math.round(m.duration * m.fps) + (m.loop ? 0 : 1));
  const cols = Math.min(n, Math.max(1, Math.ceil(Math.sqrt((n * h) / w)))), rows = Math.ceil(n / cols);
  const cv = el("canvas", { width: cols * w, height: rows * h }), ctx = cv.getContext("2d");
  const frame = createFrame(w, h), img = ctx.createImageData(w, h);
  const inst = createFx(fx.mod, { x: m.origin[0], y: m.origin[1], ...detail.opts, flip: detail.flip });
  for (let i = 0; i < n; i++) {
    if (i) inst.update(1 / m.fps);
    inst.draw(clearFrame(frame));
    composite(frame, img.data, null);
    ctx.putImageData(img, (i % cols) * w, Math.floor(i / cols) * h);
  }
  const k = Math.max(1, Math.min(4, Math.floor(1100 / (cols * w))));
  const pic = el("img", { src: cv.toDataURL("image/png"), width: cols * w * k, height: rows * h * k });
  $("#d-sheet").replaceChildren(pic, el("p"));
  sheetText();
}
/** Refresh sprite-sheet copy without regenerating or changing the exported bitmap. */
function sheetText() {
  const { fx } = detail, m = fx.meta, [width, height] = m.size;
  const count = Math.max(1, Math.round(m.duration * m.fps) + (m.loop ? 0 : 1));
  const cols = Math.min(count, Math.max(1, Math.ceil(Math.sqrt(count * height / width))));
  $("#d-sheet img").alt = t("sheetAlt", { name: t(`effects.${fx.id}.name`) });
  $("#d-sheet p").textContent = t("sheetInfo", { count, width, height, cols, fps: m.fps, playback: t(m.loop ? "loops" : "playsOnce"), command: `node tools/render.mjs ${fx.id} --sheet` });
}
/** Wire detail actions once; callbacks read the current language when they display feedback. */
function wireDetail() {
  const d = $("#detail");
  $("#d-close").addEventListener("click", () => d.close());
  d.addEventListener("close", () => (detail = null));
  d.addEventListener("click", (e) => e.target === d && d.close());
  $("#d-play").addEventListener("click", (e) => {
    detail.playing = !detail.playing;
    e.target.setAttribute("aria-pressed", String(detail.playing));
    e.target.textContent = t(detail.playing ? "pause" : "play");
  });
  $("#d-again").addEventListener("click", () => detail.restart());
  $("#d-flip").addEventListener("click", (e) => {
    detail.flip = !detail.flip;
    e.target.setAttribute("aria-pressed", String(detail.flip));
    detail.restart();
    code(detail.fx);
  });
  $("#d-actor").addEventListener("click", (e) => {
    detail.actor = !detail.actor;
    e.target.setAttribute("aria-pressed", String(detail.actor));
    // with an act, the character is the performance: off shows the effect alone, as a sprite sheet has it
    if (detail.fx.mod.act) detail.layout(detail.aspect, detail.pad);
    detail.dirty = true;
  });
  $("#d-character-style").addEventListener("change", (e) => {
    characterChoice.style = e.target.value;
    updateCharacter();
  });
  const seed = $("#d-character-seed");
  seed.addEventListener("change", () => {
    if (seed.validity.valid) {
      characterChoice.seed = seed.valueAsNumber;
      updateCharacter();
    } else seed.value = characterChoice.seed;
  });
  $("#d-character-roll").addEventListener("click", () => {
    characterChoice.seed = crypto.getRandomValues(new Uint32Array(1))[0];
    seed.value = characterChoice.seed;
    updateCharacter();
  });
  $("#d-seed").addEventListener("click", () => {
    detail.opts.seed = 1 + Math.floor(Math.random() * 9999);
    detail.restart();
  });
  $("#d-pal").addEventListener("change", (e) => {
    if (e.target.value) detail.opts.palette = PAL[e.target.value];
    else delete detail.opts.palette;
    detail.restart();
    code(detail.fx);
  });
  $("#d-make").addEventListener("click", sheet);
  $("#d-copy").addEventListener("click", async (e) => {
    const text = $("#d-code").textContent;
    try {
      await navigator.clipboard.writeText(text);
      e.target.textContent = t("copied");
    } catch {
      getSelection().selectAllChildren($("#d-code"));
      e.target.textContent = t("selected");
    }
    setTimeout(() => (e.target.textContent = t("copy")), COPY_FEEDBACK_MS);
  });
}

// ---- the clock
let last = performance.now();
function frameLoop(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (detail) detail.tick(dt);
  else for (const t of tiles) if (t.visible && t.player && !t.fig.hidden && (!reduced || t.hover)) t.player.tick(dt);
  requestAnimationFrame(frameLoop);
}

build();
wireDetail();
document.querySelectorAll("[data-language]").forEach((select) => {
  select.replaceChildren(...LANGUAGES.map(({ code, label }) => el("option", { value: code, textContent: label })));
  select.addEventListener("change", (event) => i18n.changeLanguage(event.target.value));
});
i18n.on("languageChanged", renderLanguage);
renderLanguage();
$("#q").addEventListener("input", (e) => {
  state.q = e.target.value;
  filter();
});
setCat(location.hash.slice(1) || "all", true);
addEventListener("hashchange", () => setCat(location.hash.slice(1) || "all", true));
requestAnimationFrame(frameLoop);

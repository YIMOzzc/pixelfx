import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createI18n, DEFAULT_LANGUAGE, LANGUAGE_STORAGE_KEY, LANGUAGES } from "../gallery/i18n.js";
import { effects, categories } from "../src/fx/index.js";
import { PAL, BACKDROPS } from "../src/core/index.js";

/** In-memory Web Storage subset for verifying preference persistence without a browser. */
function memoryStorage(language) {
  const values = new Map(language ? [[LANGUAGE_STORAGE_KEY, language]] : []);
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("first visits and invalid preferences default to Chinese", () => {
  for (const storage of [null, memoryStorage(), memoryStorage("fr"), memoryStorage("<script>")]) {
    const instance = createI18n(storage);
    assert.equal(instance.language, DEFAULT_LANGUAGE);
    assert.equal(instance.t("play"), "播放");
  }
});

test("language switches persist and are restored by the next visit", async () => {
  const storage = memoryStorage(), instance = createI18n(storage);
  await instance.changeLanguage("en");
  assert.equal(instance.t("play"), "play");
  assert.equal(storage.getItem(LANGUAGE_STORAGE_KEY), "en");
  assert.equal(createI18n(storage).language, "en");
  await instance.changeLanguage("zh");
  assert.equal(createI18n(storage).t("play"), "播放");
});

test("blocked reads and failed storage writes do not break language switching", async () => {
  for (const storage of [
    { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } },
    { getItem() { return "en"; }, setItem() { throw new Error("quota"); } },
  ]) {
    const instance = createI18n(storage);
    await instance.changeLanguage("en");
    assert.equal(instance.t("play"), "play");
    await instance.changeLanguage("zh");
    assert.equal(instance.t("play"), "播放");
  }
});

test("all effects and categories have native Chinese and English copy", () => {
  const instance = createI18n(null);
  for (const { code } of LANGUAGES) {
    for (const [id, { meta }] of Object.entries(effects)) {
      for (const field of ["name", "desc"]) {
        const key = `effects.${id}.${field}`;
        const value = instance.getResource(code, "translation", key);
        assert.ok(typeof value === "string" && value.length, `${code}: ${key}`);
        if (code === "zh") assert.match(value, /\p{Script=Han}/u, key);
        else assert.equal(value, meta[field], key);
      }
    }
    for (const category of categories) {
      for (const field of ["name", "blurb"]) assert.ok(instance.getResource(code, "translation", `categories.${category.id}.${field}`));
    }
  }
});

test("declarative labels, background and palette choices have both translations", () => {
  const instance = createI18n(null);
  const html = readFileSync(new URL("../gallery/index.html", import.meta.url), "utf8");
  const keys = [...html.matchAll(/data-i18n(?:-placeholder|-aria-label|-content)?="([^"]+)"/g)].map((match) => match[1]);
  keys.push(...BACKDROPS.concat("none").map((id) => `backdrops.${id}`), ...Object.keys(PAL).map((id) => `palettes.${id}`));
  for (const { code } of LANGUAGES) for (const key of keys) assert.ok(instance.getResource(code, "translation", key), `${code}: ${key}`);
});

test("counts, timings and export commands interpolate in both languages", async () => {
  const instance = createI18n(null);
  for (const { code } of LANGUAGES) {
    await instance.changeLanguage(code);
    for (const count of [0, 1, 30]) {
      assert.ok(instance.t("subtitle", { count }).includes(String(count)));
      const timing = instance.t("timing", { seconds: 1.25, count, fps: 30 });
      assert.ok(timing.includes("1.25") && timing.includes(String(count)));
      const sheet = instance.t("sheetInfo", { count, width: 80, height: 64, cols: 6, fps: 30, playback: instance.t("loops"), command: "node tools/render.mjs fire/campfire --sheet" });
      assert.ok(sheet.includes("node tools/render.mjs fire/campfire --sheet"));
      assert.ok(!sheet.includes("{{"), sheet);
    }
  }
});

test("a missing translation falls back to English instead of displaying a resource key", () => {
  const instance = createI18n(null);
  instance.addResource("en", "translation", "fallbackProbe", "English fallback");
  assert.equal(instance.t("fallbackProbe"), "English fallback");
});

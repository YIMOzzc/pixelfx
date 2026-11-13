import { createInstance } from "./vendor/i18next.js";
import { effects, categories } from "../src/fx/index.js";
import en from "./locales/en.js";
import zh from "./locales/zh.js";

/** Persisted gallery preference; intentionally independent of browser language detection. */
export const LANGUAGE_STORAGE_KEY = "pixelfx.language";
/** Supported language codes, native labels and document language tags. Add dictionaries with new entries. */
export const LANGUAGES = Object.freeze([
  { code: "zh", label: "中文", htmlLang: "zh-CN" },
  { code: "en", label: "English", htmlLang: "en" },
]);
/** First-visit language, also used when a stored preference is invalid. */
export const DEFAULT_LANGUAGE = "zh";

/**
 * Create an isolated, synchronously ready translator with bundled resources and English fallback.
 * @param {Storage|null} [storage] Preference storage; null disables persistence. Browser storage is optional.
 * @returns {ReturnType<typeof createInstance>} An i18next instance; changeLanguage persists supported choices.
 */
export function createI18n(storage) {
  let saved;
  try {
    if (storage === undefined) storage = globalThis.localStorage;
    saved = storage?.getItem(LANGUAGE_STORAGE_KEY);
  } catch { /* Storage may be blocked; switching still works for this visit. */ }
  const instance = createInstance();
  instance.init({
    lng: LANGUAGES.some(({ code }) => code === saved) ? saved : DEFAULT_LANGUAGE,
    supportedLngs: LANGUAGES.map(({ code }) => code),
    fallbackLng: "en",
    initImmediate: false,
    // Messages are assigned via textContent and DOM attributes, never interpreted as HTML.
    interpolation: { escapeValue: false },
    resources: {
      zh: { translation: zh },
      en: { translation: {
        ...en,
        categories: Object.fromEntries(categories.map(({ id, name, blurb }) => [id, { name, blurb }])),
        effects: Object.fromEntries(Object.entries(effects).map(([id, { meta }]) => [id, { name: meta.name, desc: meta.desc }])),
      } },
    },
  });
  instance.on("languageChanged", (language) => {
    if (!LANGUAGES.some(({ code }) => code === language)) return;
    try { storage?.setItem(LANGUAGE_STORAGE_KEY, language); }
    catch { /* A full or blocked store must not prevent the UI from switching. */ }
  });
  return instance;
}

/** Shared gallery translator. Resources are local, so switching requires no network request. */
export const i18n = createI18n();
/** Translate a resource key with optional i18next interpolation values. Returns plain text. */
export const t = (key, values) => i18n.t(key, values);

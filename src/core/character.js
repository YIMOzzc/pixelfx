import { hex } from "./color.js";
import { Rng } from "./math.js";
import { posed, STAND } from "./rig.js";

const designs = {
  swordsman: {
    helmet: [3, 3.1, 2.75], face: [2.35, 2.25, 2.15], faceForward: 1.6,
    hair: true, robe: true, chest: 4.25, shoulder: 1.85,
    weapon: { weapon: "sword", sa: -0.98, wl: 0.76 },
    hairColors: ["#a5e9ff", "#62b9ff", "#387bd4", "#254b98"],
    robeTrim: ["#eaffea", "#c4f6da", "#8bd5bb", "#589e92"].map(hex),
    palettes: [
      ["#a6f3d2", "#58c9ab", "#319e8e", "#235f68", "#ffe0bd", "#bb846a"],
    ],
  },
  knight: {
    helmet: [3.2, 3.3, 3.1], face: [2.65, 1.1, 2.85], chest: 5.8, shoulder: 3.25,
    crest: { offset: [-1.5, 1.8, 0], radii: [2.8, 1.3, 0.75] },
    palettes: [
      ["#82afcc", "#527797", "#324d74", "#202b4b", "#ffe5a0", "#d89945"],
      ["#a9a7c1", "#756785", "#4e405d", "#30263b", "#ffb6ca", "#cc537a"],
      ["#f2cd91", "#b08554", "#7a543c", "#492f32", "#c6ffe7", "#52b8aa"],
    ],
  },
  ranger: {
    helmet: [3.9, 3.2, 3.55], face: [2.5, 1.8, 1.95], faceForward: 1.7, cloak: true, chest: 4.8, shoulder: 1.9,
    palettes: [
      ["#9eb774", "#5a824d", "#355943", "#203c39", "#ffddae", "#b87352"],
      ["#b2c8d1", "#67939d", "#416073", "#293a55", "#e2aa84", "#a26556"],
      ["#df9d72", "#a85848", "#78384a", "#482938", "#ffd3aa", "#b97862"],
    ],
  },
  android: {
    helmet: [3.2, 2.65, 3], face: [2.65, 0.8, 2.7], chest: 4.5, shoulder: 2.15,
    crest: { offset: [-2.3, 1.25, 2.15], radii: [0.58, 1.9, 0.58] },
    palettes: [
      ["#e1e6ee", "#a0adc6", "#656e98", "#373f64", "#9bfff1", "#29c6bf"],
      ["#ffd47c", "#d18d40", "#97513c", "#523345", "#d1faff", "#618de8"],
      ["#d1b7ff", "#9c78d2", "#624da8", "#3d346b", "#ffd7a3", "#ff7665"],
    ],
  },
};
export const CHARACTER_STYLES = Object.freeze(Object.keys(designs));
export const CHARACTER_EQUIPMENT = Object.freeze({
  headgear: Object.freeze(["visor", "horns", "hood", "circlet"]),
  top: Object.freeze(["plate", "tunic", "jacket"]),
  belt: Object.freeze(["buckle", "pouches", "sash"]),
  pants: Object.freeze(["cloth", "greaves", "cargo"]),
  boots: Object.freeze(["leather", "sabaton", "travel"]),
  cape: Object.freeze(["none", "mantle", "split"]),
  accessory: Object.freeze(["brooch", "goggles", "bracers"]),
  wings: Object.freeze(["none", "feather", "crystal", "bat"]),
  weapon: Object.freeze(["none", "sword", "dagger", "spear", "hammer", "bow", "claw"]),
});
const SEEDED_STYLES = ["knight", "ranger", "android"];

/** Generate an actor whose rest sprite and animated poses share the same equipment. */
export function createCharacter({ style, seed = 1, equipment = {} } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError("Character seed must be a uint32");
  style ??= new Rng(seed).pick(SEEDED_STYLES);
  const rng = new Rng(seed);
  if (!CHARACTER_STYLES.includes(style)) throw new RangeError(`Unknown character style: ${style}`);
  const { palettes, shoulder, chest, hairColors, ...design } = designs[style];
  const [hi, mid, low, dark, glow, accent] = rng.pick(palettes);
  const ramp = (...colors) => colors.map(hex);
  const appearance = {
    ...design, id: `${style}/${seed}`, shoulder: shoulder + rng.range(-0.2, 0.2),
    chest: chest + rng.range(-0.2, 0.2), shell: ramp(hi, mid, low, dark),
    core: ramp(mid, low, dark, dark), helm: hairColors ? ramp(...hairColors) : ramp(hi, mid, low, dark),
    trim: ramp(glow, glow, accent, accent),
  };
  if (!equipment || typeof equipment !== "object" || Array.isArray(equipment)) {
    throw new TypeError("Character equipment must be an object");
  }
  for (const [slot, value] of Object.entries(equipment)) {
    if (!Object.hasOwn(CHARACTER_EQUIPMENT, slot) || (value !== "random" && !CHARACTER_EQUIPMENT[slot].includes(value))) {
      throw new RangeError(`Unknown character equipment: ${slot}=${value}`);
    }
  }
  const gearRng = new Rng(seed ^ 0x72f3a18b);
  const gear = {};
  for (const [slot, choices] of Object.entries(CHARACTER_EQUIPMENT)) {
    const rolled = gearRng.pick(choices);
    if (Object.hasOwn(equipment, slot)) gear[slot] = equipment[slot] === "random" ? rolled : equipment[slot];
  }
  const customized = Object.keys(gear).length > 0;
  if (customized) {
    Object.assign(appearance, { gear, fabric: ramp(mid, low, dark, dark), id: `${appearance.id}/${JSON.stringify(gear)}` });
    if (gear.headgear) {
      appearance.hair = false;
      appearance.crest = undefined;
      appearance.helm = appearance.shell;
      appearance.helmet = gear.headgear === "hood" ? [4, 3.4, 3.7] : [3.3, 3.15, 3];
    }
    if (gear.top) {
      appearance.robe = false;
      appearance.shoulder = { plate: 3.2, tunic: 1.9, jacket: 2.45 }[gear.top];
      appearance.chest = { plate: 5.7, tunic: 4.4, jacket: 5 }[gear.top];
    }
    if (gear.cape) appearance.cloak = false;
    if (gear.weapon) {
      appearance.weapon = gear.weapon === "none" ? undefined : {
        weapon: gear.weapon, sa: gear.weapon === "bow" ? 0.1 : -0.68, wl: 0.82,
      };
    }
  }
  const rest = posed(STAND, appearance);
  const x = customized ? Math.min(-12, rest.x0) : -12;
  const y = customized ? Math.min(-38, rest.y0) : -38;
  const w = (customized ? Math.max(12, rest.x1 + 1) : 12) - x;
  const h = (customized ? Math.max(0, rest.y1 + 1) : 0) - y;
  if (customized) appearance.bounds = { x, y, w, h };
  const pixels = new Uint32Array(w * h), data = new Uint8Array(w * h);
  for (let i = 0; i < rest.n; i++) {
    const col = rest.xs[i] - x, row = rest.ys[i] - y;
    if (col < 0 || col >= w || row < 0 || row >= h) continue;
    pixels[row * w + col] = rest.color[i];
    data[row * w + col] = 1;
  }
  const eyes = [];
  if (customized) {
    for (const [ex, ey] of rest.eyes) eyes.push([ex - x, ey - y]);
  } else {
    for (let row = 2; row < 6 && !eyes.length; row++)
      for (let col = 12; col < w - 1; col++)
        if (appearance.trim.includes(pixels[row * w + col] | 0) && data[(row + 1) * w + col]) eyes.push([col, row]);
  }
  return { w, h, x, y, k: 2, mask: { w, h, data }, pixels, head: [0, customized ? rest.headY : rest.y0],
    chest: [0, -26], eyes, appearance, style, seed, ...(customized ? { equipment: gear } : {}) };
}

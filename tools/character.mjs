#!/usr/bin/env node
// Export a generated character's transparent rest sprite.
import { join } from "node:path";
import { createCharacter, createFrame, drawActor, painterFor, composite } from "../src/core/index.js";
import { ROOT, save } from "./lib/fxlib.mjs";
import { encodePNG } from "./lib/png.mjs";

const [style = "random", seed = "1", output] = process.argv.slice(2);
const actor = createCharacter({ style: style === "random" ? undefined : style, seed: Number(seed) });
const { w, h, x, y } = actor;
const frame = createFrame(w, h);
drawActor(painterFor(frame).place(-x, -y), actor);
const rgba = composite(frame, new Uint8ClampedArray(w * h * 4), null);
const file = output ?? join(ROOT, "records", "characters", `${actor.style}-${actor.seed}.png`);
save(file, encodePNG(w, h, rgba));
console.log(`${actor.style} ${actor.seed}  ${w} × ${h}  ->  ${file}`);

---
name: pixelfx-character
description: Create original procedural pixel characters and reusable custom action tracks in the pixelfx repository. Use for new character silhouettes, outfits, palettes, character sprites, and keyframed motions such as idle, dash, casting and finishers.
---

# Pixelfx character and action authoring

Work from the pixelfx repository root. If using the bundled skill, that is two levels above this skill directory. Read the “Generate a character” section of the root README for the API and export commands. For actions, read the Acts section of `docs/AUTHORING.md` and the pose fields in `src/core/poses.js`.

## Create a character from a brief or reference

1. Use the brief to choose a recognizable silhouette and two or three defining features. Reuse an existing style and seed when those already produce the requested design. Otherwise add a named design to `src/core/character.js`. The generator composes head, face, shoulders, torso, accent colors and optional equipment geometry. Add a rig component in `src/core/rig.js` when a feature changes the silhouette. Attach it to the owning bone so it follows crouches, turns and other poses.
2. Keep the standing pixels inside the 24 × 38 actor mask, with the feet at the origin. Generate the mask from the same appearance the animation renderer uses so body effects follow the custom silhouette. Preserve the seeded generation path and the default actor. Add translations in `gallery/locales/en.js` and `gallery/locales/zh.js` for new named styles.
3. Export the standing PNG with `node tools/character.mjs <style> <seed>`. Preview the silhouette in motion and with a body effect using `node tools/act.mjs ice/freeze --character <style> --character-seed <seed>`. Inspect the images at normal pixel scale and verify the whole figure fits the rest mask.

## Add or extend an action

1. Edit an existing module's `act.poses` to change its motion, or add a module in `src/fx/moves/` for a separately selectable action. Keep appearance in the character generator and motion in the pose track so every generated actor can perform it.
2. Compose ordered `[time, pose, easing]` keys with the existing skeleton. Use negative times for anticipation, align release or contact with the effect timeline, and give the motion room to recover. For a loop, match the beginning and ending poses. Reuse or extend existing tracks with `shiftKeys` and align reused hits with `shiftHits` when chaining actions.
3. After adding a module, run `node tools/index.mjs` to register it in the gallery and add its Chinese name and description in `gallery/locales/zh-effects.js`. Use `node tools/check.mjs <id>` and inspect consecutive frames from `node tools/act.mjs <id> --character <style> --character-seed <seed>`. Use `--sheet` when delivering an animation atlas.

#!/usr/bin/env node
// Bundle the gallery into dist/gallery (a static site: GitHub Pages or any host) and dist/page (one page plus
// one script, fonts inlined, for hosts that take a page body).
//
//   node tools/index.mjs && node tools/build-gallery.mjs

import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync, cpSync } from "node:fs";
import { join } from "node:path";
import { ROOT } from "./lib/fxlib.mjs";

const G = join(ROOT, "gallery"), OUT = join(ROOT, "dist", "gallery"), PAGE = join(ROOT, "dist", "page");
/** Local skill instructions bundled with both static gallery formats. */
const GUIDE = "README.md";
/** Third-party translation engine license shipped beside every bundled gallery. */
const I18NEXT_LICENSE = "i18next.LICENSE";
mkdirSync(OUT, { recursive: true });
mkdirSync(PAGE, { recursive: true });

await build({ entryPoints: [join(G, "app.js")], bundle: true, format: "esm", minify: true, outfile: join(OUT, "app.js"), legalComments: "none" });
cpSync(join(G, "fonts"), join(OUT, "fonts"), { recursive: true });
writeFileSync(join(OUT, "style.css"), readFileSync(join(G, "style.css")));
/** Gallery markup with its skill guide resolved within the standalone output directory. */
const html = readFileSync(join(G, "index.html"), "utf8").replace(`../${GUIDE}#the-skill`, `${GUIDE}#the-skill`);
writeFileSync(join(OUT, "index.html"), html);
for (const dir of [OUT, PAGE]) cpSync(join(ROOT, GUIDE), join(dir, GUIDE));
for (const dir of [OUT, PAGE]) cpSync(join(G, "vendor", I18NEXT_LICENSE), join(dir, I18NEXT_LICENSE));

// the one-page version: <title> and <style> first, then the body markup, the font as a data URI
const body = html.slice(html.indexOf("<!--BODY-->") + 11, html.indexOf("<!--/BODY-->"));
const font = readFileSync(join(G, "fonts", "PatchPixel-Regular.woff2")).toString("base64");
const css = readFileSync(join(G, "style.css"), "utf8").replace("url(fonts/PatchPixel-Regular.woff2)", `url(data:font/woff2;base64,${font})`);
writeFileSync(
  join(PAGE, "index.html"),
  [
    "<title>pixelfx</title>",
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Funnel+Sans:wght@400;500&family=Red+Hat+Mono:wght@400;500&display=swap">',
    `<style>\n${css}\n</style>`,
    body.trim(),
    '<script type="module" src="app.js"></script>',
  ].join("\n"),
);
cpSync(join(OUT, "app.js"), join(PAGE, "app.js"));
console.log(`dist/gallery and dist/page built (${(readFileSync(join(OUT, "app.js")).length / 1024).toFixed(0)} KB of script)`);

#!/usr/bin/env node
// Serve the repo so the gallery can load the effects as modules: node tools/serve.mjs [port] [--open]
// then open http://localhost:8080/gallery/

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, extname, normalize, sep } from "node:path";
import { ROOT } from "./lib/fxlib.mjs";

const args = process.argv.slice(2);
const openBrowser = args.includes("--open");
const PORT = Number(args.find((arg) => arg !== "--open") ?? 8080);
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535) {
  console.error("Usage: node tools/serve.mjs [port] [--open]");
  process.exit(1);
}
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json", ".png": "image/png", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".md": "text/plain; charset=utf-8", ".mp4": "video/mp4",
};

const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/") return res.writeHead(302, { location: "/gallery/" }).end();
  if (path.endsWith("/")) path += "index.html";
  const file = normalize(join(ROOT, path));
  if (!file.startsWith(ROOT + sep)) return res.writeHead(403).end();
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store" }).end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
});

server.listen(PORT, () => {
  const url = `http://localhost:${server.address().port}/gallery/`;
  console.log(`gallery: ${url}`);
  if (!openBrowser) return;
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer.exe" : "xdg-open";
  const browser = spawn(command, [url], { stdio: "ignore", windowsHide: true });
  browser.on("error", () => console.error(`Open the gallery manually: ${url}`));
  browser.unref();
});

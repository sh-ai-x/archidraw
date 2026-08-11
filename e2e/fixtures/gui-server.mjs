import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Archidraw</title><style>body{margin:0;font:14px sans-serif;background:#f8f9fb}#toolbar{height:48px;background:#fff;border-bottom:1px solid #ddd;padding:0 16px;display:flex;align-items:center;gap:8px}button{padding:7px 14px}#canvas{position:relative;height:calc(100vh - 49px);overflow:hidden;background-image:linear-gradient(#e9edf2 1px,transparent 1px),linear-gradient(90deg,#e9edf2 1px,transparent 1px);background-size:20px 20px}.element{position:absolute;border:2px solid #264653;background:#bde0fe;box-sizing:border-box}</style></head><body><div id="toolbar"><button data-tool="rect">Rectangle</button><span id="status">Ready</span></div><div id="canvas"></div><script type="module">${fs.readFileSync(path.resolve(import.meta.dirname, "gui.mjs"), "utf8")}</script></body></html>`;
http.createServer((req, res) => {
  if (req.url === "/publish" && req.method === "POST") {
    const proxy = http.request({ hostname: "127.0.0.1", port: 5174, path: "/publish", method: "POST", headers: { "content-type": "application/json" } }, upstream => { res.writeHead(upstream.statusCode, upstream.headers); upstream.pipe(res); });
    req.pipe(proxy); return;
  }
  res.writeHead(200, { "Content-Type": "text/html" }); res.end(html);
}).listen(5173, "127.0.0.1");

import http from "node:http";
import { URL } from "node:url";

const elements = new Map();
const clients = new Set();
const send = (res, event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
const broadcast = (event) => { for (const res of clients) send(res, event); };
const body = async (req) => { let s = ""; for await (const chunk of req) s += chunk; return s ? JSON.parse(s) : {}; };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:5174");
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  if (url.pathname === "/health") { res.writeHead(200); return res.end("ok"); }
  if (url.pathname === "/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write("retry: 50\n\n"); clients.add(res); req.on("close", () => clients.delete(res)); return;
  }
  if (url.pathname === "/scene" && req.method === "GET") { res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ elements: [...elements.values()] })); }
  if (url.pathname === "/publish" && req.method === "POST") {
    const event = await body(req); if (event.element) elements.set(event.element.id, event.element); if (event.id && event.patch) elements.set(event.id, { ...elements.get(event.id), ...event.patch }); if (event.deleteId) elements.delete(event.deleteId);
    broadcast(event); res.setHeader("Content-Type", "application/json"); return res.end(JSON.stringify({ ok: true }));
  }
  res.writeHead(404); res.end();
});
server.listen(5174, "127.0.0.1");

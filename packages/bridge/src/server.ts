import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { BridgeTransport, DeltaListener, SceneDelta, Unsubscribe } from "./transport.js";
import { isSceneDelta } from "./transport.js";

export interface BridgeServerOptions {
  host?: string;
  port?: number;
}

const ALLOWED_ORIGIN = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

/** Localhost-only SSE bridge. It intentionally multiplexes element deltas only. */
export class BridgeServer implements BridgeTransport {
  readonly host: string;
  readonly port: number;
  private readonly httpServer: Server;
  private readonly listeners = new Set<DeltaListener>();
  private readonly clients = new Set<ServerResponse>();
  private listening = false;

  constructor(options: BridgeServerOptions = {}) {
    // Bind IPv4 explicitly: some local runtimes resolve localhost to ::1,
    // while the bridge is intentionally a loopback-only IPv4 service.
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port ?? 5174;
    this.httpServer = createServer((request, response) => this.handle(request, response));
  }

  get address(): string {
    const address = this.httpServer.address() as AddressInfo | null;
    return address ? `http://${address.address}:${address.port}` : `http://${this.host}:${this.port}`;
  }

  async start(): Promise<void> {
    if (this.listening) return;
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => { this.httpServer.off("listening", onListening); reject(error); };
      const onListening = () => { this.httpServer.off("error", onError); this.listening = true; resolve(); };
      this.httpServer.once("error", onError);
      this.httpServer.once("listening", onListening);
      this.httpServer.listen(this.port, this.host);
    });
  }

  async stop(): Promise<void> {
    for (const client of this.clients) client.end();
    this.clients.clear();
    this.listeners.clear();
    if (!this.listening) return;
    await new Promise<void>((resolve, reject) => this.httpServer.close((error) => error ? reject(error) : resolve()));
    this.listening = false;
  }

  subscribe(onDelta: DeltaListener): Unsubscribe {
    this.listeners.add(onDelta);
    return () => this.listeners.delete(onDelta);
  }

  publish(delta: SceneDelta): void {
    if (!isSceneDelta(delta)) throw new TypeError("Bridge delta must be an RFC 6902 operation array");
    const payload = `event: scene-delta\ndata: ${JSON.stringify(delta)}\n\n`;
    for (const client of this.clients) client.write(payload);
    for (const listener of [...this.listeners]) listener(delta);
  }

  private handle(request: IncomingMessage, response: ServerResponse): void {
    const origin = request.headers.origin;
    if (ALLOWED_ORIGIN.has(origin)) response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");

    if (request.method === "OPTIONS") {
      if (!ALLOWED_ORIGIN.has(origin)) { response.writeHead(403); response.end(); return; }
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      response.setHeader("Access-Control-Allow-Headers", "content-type");
      response.writeHead(204); response.end(); return;
    }
    const path = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
    if (request.method === "GET" && path === "/events") return this.openEvents(response);
    if (request.method === "POST" && path === "/publish") return this.readPublish(request, response);
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "Not found" }));
  }

  private openEvents(response: ServerResponse): void {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    response.write(": connected\n\n");
    this.clients.add(response);
    response.on("close", () => this.clients.delete(response));
  }

  private readPublish(request: IncomingMessage, response: ServerResponse): void {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk: string) => { body += chunk; });
    request.on("end", () => {
      try {
        const parsed: unknown = JSON.parse(body);
        const delta = isSceneDelta(parsed) ? parsed : (parsed && typeof parsed === "object" && isSceneDelta((parsed as { delta?: unknown }).delta) ? (parsed as { delta: SceneDelta }).delta : null);
        if (!delta) throw new TypeError("Invalid scene delta");
        this.publish(delta);
        response.writeHead(202, { "content-type": "application/json" });
        response.end(JSON.stringify({ published: true }));
      } catch { response.writeHead(400, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "Invalid scene delta" })); }
    });
  }
}

export function createBridgeServer(options?: BridgeServerOptions): BridgeServer {
  return new BridgeServer(options);
}

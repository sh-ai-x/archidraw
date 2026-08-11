import type { BridgeTransport, DeltaListener, SceneDelta, Unsubscribe } from "./transport.js";

class InProcessTransport implements BridgeTransport {
  private readonly listeners = new Set<DeltaListener>();
  publish(delta: SceneDelta): void { for (const listener of [...this.listeners]) listener(delta); }
  subscribe(listener: DeltaListener): Unsubscribe { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  start(): void {}
  stop(): void { this.listeners.clear(); }
}

/** Fetch-backed publisher for an MCP process publishing into the local SSE server. */
export class HttpBridgeTransport implements BridgeTransport {
  constructor(public readonly baseUrl = "http://localhost:5174") {}
  async publish(delta: SceneDelta): Promise<void> {
    const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/publish`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(delta) });
    if (!response.ok) throw new Error(`Bridge publish failed: HTTP ${response.status}`);
  }
  subscribe(_onDelta: DeltaListener): Unsubscribe { return () => {}; }
  start(): void {}
  stop(): void {}
}

export class BridgePublisher implements BridgeTransport {
  private transport: BridgeTransport = new InProcessTransport();
  setTransport(transport: BridgeTransport): void { this.transport = transport; }
  publish(delta: SceneDelta): void | Promise<void> { return this.transport.publish(delta); }
  subscribe(onDelta: DeltaListener): Unsubscribe { return this.transport.subscribe(onDelta); }
  start(): void | Promise<void> { return this.transport.start(); }
  stop(): void | Promise<void> { return this.transport.stop(); }
}

/** Process-local singleton shared by the MCP store and bridge consumers. */
export const publisher = new BridgePublisher();
export const bridgePublisher = publisher;

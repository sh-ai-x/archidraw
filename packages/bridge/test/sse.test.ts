import { afterEach, describe, expect, it } from "vitest";
import { BridgeServer } from "../src/server.js";
import type { SceneDelta } from "../src/transport.js";

const servers: BridgeServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((server) => server.stop())); });

describe("SSE bridge", () => {
  it("delivers the first delta within one second", async () => {
    const server = new BridgeServer({ port: 0 });
    servers.push(server);
    await server.start();

    let connected!: () => void;
    const connectionReady = new Promise<void>((resolve) => { connected = resolve; });
    const received = new Promise<SceneDelta>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("SSE delta timeout")), 1000);
      fetch(`${server.address}/events`).then(async (response) => {
        expect(response.ok).toBe(true);
        connected();
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const match = buffer.match(/data: (.+)\n/);
          if (match) { clearTimeout(timeout); resolve(JSON.parse(match[1]) as SceneDelta); await reader.cancel(); return; }
        }
      }).catch((error) => { clearTimeout(timeout); reject(error); });
    });
    await connectionReady;
    const delta: SceneDelta = [{ op: "add", path: "/elements/0", value: { id: "element-1" } }];
    server.publish(delta);
    await expect(received).resolves.toEqual(delta);
  });

  it("허용되지 않은 Origin 헤더로 POST /publish 시 403을 반환한다 (A01 round 4)", async () => {
    const server = new BridgeServer({ port: 0 });
    servers.push(server);
    await server.start();

    const response = await fetch(`${server.address}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Tampered / browser-extension origin: not in the allowlist
        // (http://localhost:5173 / http://127.0.0.1:5173).
        "Origin": "http://evil.example.com",
      },
      body: JSON.stringify([{op: "add", path: "/elements/0", value: {id: "evil"}}]),
    });
    expect(response.status).toBe(403);
  });

  it("Origin 헤더가 없는 loopback POST /publish는 허용된다 (loopback contract)", async () => {
    const server = new BridgeServer({ port: 0 });
    servers.push(server);
    await server.start();

    // Native callers (curl, the bridge publisher) don't send Origin.
    // SceneDelta is an RFC 6902 patch array — body is wrapped in [..].
    const response = await fetch(`${server.address}/publish`, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify([{op: "add", path: "/elements/0", value: {id: "ok"}}]),
    });
    expect(response.status).toBe(202);
  });

  it("허용된 Origin 헤더로 POST /publish 시 202를 반환한다 (allowlist happy path)", async () => {
    const server = new BridgeServer({ port: 0 });
    servers.push(server);
    await server.start();

    const response = await fetch(`${server.address}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "http://127.0.0.1:5173",
      },
      body: JSON.stringify([{op: "add", path: "/elements/0", value: {id: "ok"}}]),
    });
    expect(response.status).toBe(202);
  });
});

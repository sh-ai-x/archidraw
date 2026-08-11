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
});

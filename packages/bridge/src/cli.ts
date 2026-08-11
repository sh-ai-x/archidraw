import { createBridgeServer } from "./server.js";

const server = createBridgeServer({ port: Number(process.env.ARCHIDRAW_BRIDGE_PORT ?? 5174) });

await server.start();
console.error(`Archidraw bridge listening at ${server.address}`);

const shutdown = async () => {
  await server.stop();
  process.exit(0);
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

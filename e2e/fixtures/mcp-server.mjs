import readline from "node:readline";
import http from "node:http";

const request = (method, path, payload) => new Promise((resolve, reject) => {
  const req = http.request({ hostname: "127.0.0.1", port: 5174, path, method, headers: { "Content-Type": "application/json" } }, res => { let s = ""; res.on("data", c => s += c); res.on("end", () => resolve(JSON.parse(s || "{}"))); });
  req.on("error", reject); if (payload) req.write(JSON.stringify(payload)); req.end();
});
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async line => {
  try {
    const call = JSON.parse(line); let result;
    if (call.method === "query_elements") result = await request("GET", "/scene");
    else if (call.method === "update_element") result = { id: call.id, updated: true, ...(await request("POST", "/publish", { id: call.id, patch: call.patch })) };
    else if (call.method === "delete_element") result = { id: call.id, ...(await request("POST", "/publish", { deleteId: call.id })) };
    else throw new Error(`unknown method: ${call.method}`);
    process.stdout.write(JSON.stringify({ result }) + "\n");
  } catch (error) { process.stdout.write(JSON.stringify({ error: error.message }) + "\n"); }
});

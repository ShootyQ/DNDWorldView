import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile, rename, copyFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import {
  applyPatch,
  starter,
  worldSchema,
  locationSchema,
  type World,
} from "../shared/world.js";
const data = process.env.DATA_DIR || join(process.cwd(), "data");
await mkdir(join(data, "portraits"), { recursive: true });
let world = starter();
try {
  world = worldSchema.parse(
    JSON.parse(await readFile(join(data, "world.json"), "utf8")),
  );
} catch (e: any) {
  if (e.code !== "ENOENT") {
    console.error(
      "Cannot load saved world. Original preserved; repair or restore data/world.backup.json.",
      e.message,
    );
    process.exit(1);
  }
}
const tokenPath = join(data, "dm-token");
let token: string;
try {
  token = (await readFile(tokenPath, "utf8")).trim();
} catch {
  token = randomBytes(24).toString("hex");
  await writeFile(tokenPath, token, { mode: 0o600 });
}
const app = express(),
  server = createServer(app),
  wss = new WebSocketServer({ server, maxPayload: 4 * 1024 * 1024 });
const port = Number(process.env.PORT || 3000);
const history: World[] = [],
  future: World[] = [];
app.use(express.json({ limit: "4mb" }));
app.use("/portraits", express.static(join(data, "portraits")));
const authorized = (req: express.Request) =>
  req.headers.authorization === `Bearer ${token}`;
app.get("/api/world", (_q, r) => r.json(world));
app.get("/api/session", (q, r) => {
  if (!authorized(q)) return r.sendStatus(403);
  r.json({
    addresses: Object.values(networkInterfaces())
      .flat()
      .filter((a) => a?.family === "IPv4" && !a.internal)
      .map((a) => `http://${a!.address}:${port}/`),
  });
});
app.post(
  "/api/portrait",
  express.raw({ type: "image/png", limit: "2mb" }),
  async (q, r) => {
    if (!authorized(q)) return r.sendStatus(403);
    if (
      !Buffer.isBuffer(q.body) ||
      q.body.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    )
      return r.status(400).json({ error: "Expected a PNG image" });
    const name = randomBytes(16).toString("hex") + ".png";
    await writeFile(join(data, "portraits", name), q.body);
    r.json({ name });
  },
);
let queue = Promise.resolve();
async function persist(next: World) {
  await writeFile(join(data, "world.tmp"), JSON.stringify(next));
  try {
    await copyFile(join(data, "world.json"), join(data, "world.backup.json"));
  } catch (e: any) {
    if (e.code !== "ENOENT") throw e;
  }
  await rename(join(data, "world.tmp"), join(data, "world.json"));
}
function broadcast() {
  for (const c of wss.clients)
    if (c.readyState === WebSocket.OPEN)
      c.send(
        JSON.stringify({
          type: "world",
          world,
          undo: history.length > 0,
          redo: future.length > 0,
        }),
      );
}
wss.on("connection", (ws) => {
  ws.send(
    JSON.stringify({
      type: "world",
      world,
      undo: history.length > 0,
      redo: future.length > 0,
    }),
  );
  ws.on("message", (raw) => {
    queue = queue.then(async () => {
      try {
        const m = JSON.parse(raw.toString());
        if (m.token !== token) throw Error("DM authorization required");
        if (m.baseRevision !== world.revision)
          throw Error("World changed. Try again with the latest version.");
        let next: World;
        let direction = "edit";
        if (m.type === "undo" || m.type === "redo") {
          const list = m.type === "undo" ? history : future;
          if (!list.length) throw Error("Nothing to " + m.type);
          next = structuredClone(list[list.length - 1]);
          next.revision = world.revision + 1;
          direction = m.type;
        } else if (m.type === "patch") next = applyPatch(world, m.patch);
        else if (m.type === "replace") {
          next = worldSchema.parse(m.world);
          next.revision = world.revision + 1;
        } else if (m.type === "focus") {
          next = structuredClone(world);
          if (!next.locations.some((l) => l.id === m.id))
            throw Error("Location missing");
          next.focus = m.id;
          next.focusVersion++;
          next.revision++;
        } else if (m.type === "location") {
          next = structuredClone(world);
          const l = locationSchema.parse(m.location);
          next.locations.push(l);
          next.revision++;
        } else throw Error("Unknown command");
        next = worldSchema.parse(next);
        await persist(next);
        if (direction === "undo") {
          history.pop();
          future.push(world);
        } else if (direction === "redo") {
          future.pop();
          history.push(world);
        } else {
          history.push(world);
          if (history.length > 30) history.shift();
          future.length = 0;
        }
        world = next;
        broadcast();
        ws.send(JSON.stringify({ type: "saved" }));
      } catch (e: any) {
        ws.send(JSON.stringify({ type: "error", message: e.message }));
      }
    });
  });
});
if (process.env.NODE_ENV === "production") app.use(express.static("dist"));
else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
await persist(world);
server.listen(port, "0.0.0.0", () => {
  console.log(
    `Hearth running on port ${port}. DM link (keep private): http://localhost:${port}/#dm=${token}`,
  );
});

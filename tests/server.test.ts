import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
function client(url: string) {
  const socket = new WebSocket(url);
  const messages: any[] = [];
  socket.on("message", (m) => messages.push(JSON.parse(m.toString())));
  return {
    socket,
    async next(type: string) {
      for (let i = 0; i < 150; i++) {
        const index = messages.findIndex((m) => m.type === type);
        if (index >= 0) return messages.splice(index, 1)[0];
        await delay(20);
      }
      throw Error("Timed out waiting for " + type);
    },
  };
}
test("server authorization, live sync, undo, revisions, portrait and restart persistence", async () => {
  const dir = await mkdtemp(join(tmpdir(), "hearth-test-"));
  let child: ChildProcess | undefined;
  const clients: ReturnType<typeof client>[] = [];
  const url = "http://127.0.0.1:3197";
  async function start() {
    child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
      env: {
        ...process.env,
        PORT: "3197",
        DATA_DIR: dir,
        NODE_ENV: "production",
      },
      stdio: "pipe",
    });
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(url + "/api/world");
        if (r.ok) return;
      } catch {}
      await delay(50);
    }
    throw Error("Server startup failed");
  }
  async function stop() {
    if (child) {
      const p = new Promise<void>((r) => child!.once("exit", () => r()));
      child.kill("SIGTERM");
      await p;
    }
  }
  try {
    await start();
    const token = (await readFile(join(dir, "dm-token"), "utf8")).trim();
    assert.equal((await fetch(url + "/api/session")).status, 403);
    assert.equal(
      (
        await fetch(url + "/api/session", {
          headers: { Authorization: "Bearer " + token },
        })
      ).status,
      200,
    );
    const dm = client(url.replace("http", "ws")),
      viewer = client(url.replace("http", "ws"));
    clients.push(dm, viewer);
    let { world } = await dm.next("world");
    await viewer.next("world");
    const patch = {
      worldId: world.id,
      baseRevision: world.revision,
      operations: [
        {
          type: "update",
          id: world.objects[0].id,
          changes: { name: "Test tavern" },
        },
      ],
    };
    viewer.socket.send(
      JSON.stringify({ type: "patch", baseRevision: world.revision, patch }),
    );
    assert.match((await viewer.next("error")).message, /authorization/);
    dm.socket.send(
      JSON.stringify({
        type: "patch",
        token,
        baseRevision: world.revision,
        patch,
      }),
    );
    world = (await dm.next("world")).world;
    assert.equal(
      (await viewer.next("world")).world.objects[0].name,
      "Test tavern",
    );
    await dm.next("saved");
    dm.socket.send(
      JSON.stringify({ type: "patch", token, baseRevision: 0, patch }),
    );
    assert.match((await dm.next("error")).message, /changed/);
    dm.socket.send(
      JSON.stringify({ type: "undo", token, baseRevision: world.revision }),
    );
    world = (await dm.next("world")).world;
    assert.notEqual(world.objects[0].name, "Test tavern");
    await dm.next("saved");
    dm.socket.send(
      JSON.stringify({ type: "redo", token, baseRevision: world.revision }),
    );
    world = (await dm.next("world")).world;
    assert.equal(world.objects[0].name, "Test tavern");
    await dm.next("saved");
    dm.socket.send(
      JSON.stringify({
        type: "focus",
        token,
        baseRevision: world.revision,
        id: "loc-docks",
      }),
    );
    world = (await dm.next("world")).world;
    assert.equal(world.focus, "loc-docks");
    await dm.next("saved");
    const persisted = JSON.parse(
      await readFile(join(dir, "world.json"), "utf8"),
    );
    assert.equal(persisted.revision, world.revision);
    assert.equal(
      (
        await fetch(url + "/api/portrait", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "image/png",
          },
          body: "invalid",
        })
      ).status,
      400,
    );
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1sAAAAASUVORK5CYII=",
      "base64",
    );
    const upload = await fetch(url + "/api/portrait", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "image/png",
      },
      body: png,
    });
    assert.equal(upload.status, 200);
    const portrait = await upload.json();
    assert.deepEqual(
      Buffer.from(
        await (await fetch(url + "/portraits/" + portrait.name)).arrayBuffer(),
      ),
      png,
    );
    dm.socket.send(
      JSON.stringify({
        type: "focus",
        token,
        baseRevision: world.revision,
        id: "loc-docks",
      }),
    );
    const refocus = (await dm.next("world")).world;
    await dm.next("saved");
    assert.equal(refocus.focusVersion, world.focusVersion + 1);
    world = refocus;
    dm.socket.send(
      JSON.stringify({
        type: "patch",
        token,
        baseRevision: world.revision,
        patch: {
          worldId: world.id,
          baseRevision: world.revision,
          operations: [
            {
              type: "road",
              road: {
                id: "server-road",
                name: "Saved lane",
                points: [
                  { x: -30, z: -45 },
                  { x: 30, z: -45 },
                ],
                radius: 4,
              },
            },
          ],
        },
      }),
    );
    world = (await dm.next("world")).world;
    await dm.next("saved");
    let shared = await viewer.next("world");
    while (shared.world.revision < world.revision)
      shared = await viewer.next("world");
    assert.ok(shared.world.roads.some((r: any) => r.id === "server-road"));
    for (const c of clients) c.socket.close();
    await stop();
    await start();
    const restored = await (await fetch(url + "/api/world")).json();
    assert.equal(restored.objects[0].name, "Test tavern");
    assert.equal(restored.focus, "loc-docks");
    assert.equal(restored.revision, world.revision);
    assert.ok(restored.roads.some((r: any) => r.id === "server-road"));
    assert.deepEqual(restored.paint, world.paint);
  } finally {
    for (const c of clients) c.socket.close();
    await stop();
    await rm(dir, { recursive: true, force: true });
  }
});

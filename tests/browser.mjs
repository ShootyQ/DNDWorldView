import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
const dir = await mkdtemp(join(tmpdir(), "hearth-browser-"));
const child = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, PORT: "3198", DATA_DIR: dir, NODE_ENV: "production" },
  stdio: "pipe",
});
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const base = "http://127.0.0.1:3198";
let browser;
const errors = [];
async function state() {
  return (await fetch(base + "/api/world")).json();
}
async function revisionAfter(rev) {
  for (let i = 0; i < 150; i++) {
    const w = await state();
    if (w.revision > rev) return w;
    await delay(40);
  }
  throw Error("Edit did not persist");
}
try {
  for (let i = 0; i < 100; i++) {
    try {
      await state();
      break;
    } catch {
      await delay(100);
    }
  }
  console.log("Production server ready");
  const token = (await readFile(join(dir, "dm-token"), "utf8")).trim();
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {}),
    args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
  });
  const dm = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  dm.on("pageerror", (e) => errors.push(e.message));
  await dm.goto(base + "/#dm=" + token);
  await dm.getByRole("heading", { name: "Make room for adventure." }).waitFor();
  await dm.locator("canvas").waitFor();
  await delay(1000);
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  mobile.on("pageerror", (e) => errors.push(e.message));
  await mobile.goto(base);
  await mobile.locator("canvas").waitFor();
  assert.equal(await mobile.locator(".sidebar").count(), 0);
  console.log("Desktop and mobile rendered");
  let before = await state();
  await dm.locator(".asset").filter({ hasText: "Cottage" }).click();
  await dm.locator("canvas").click({ position: { x: 500, y: 450 } });
  let after = await revisionAfter(before.revision);
  assert.equal(after.objects.length, before.objects.length + 1);
  console.log("Placement passed");
  await dm.getByRole("button", { name: "Terrain", exact: true }).click();
  await dm.getByRole("button", { name: "road", exact: false }).click();
  const bounds = await dm.locator("canvas").boundingBox();
  before = await state();
  await dm.mouse.move(bounds.x + 400, bounds.y + 400);
  await dm.mouse.down();
  await dm.mouse.move(bounds.x + 500, bounds.y + 500, { steps: 12 });
  await dm.mouse.up();
  after = await revisionAfter(before.revision);
  assert.notDeepEqual(after.paint, before.paint);
  await dm.getByRole("button", { name: "Locations", exact: true }).click();
  await dm.getByRole("button", { name: "Show", exact: true }).first().click();
  await mobile
    .getByRole("heading", { name: "Blackwater docks", exact: true })
    .waitFor();
  await dm.getByRole("button", { name: "Invite players" }).click();
  await dm.locator(".qr").waitFor();
  await dm.locator(".close").click();
  await dm
    .getByRole("button", { name: "Build with a little help", exact: false })
    .click();
  before = await state();
  const patch = {
    worldId: before.id,
    baseRevision: before.revision,
    operations: [
      {
        type: "add",
        object: {
          id: "browser-shrine",
          asset: "lantern",
          name: "Shrine light",
          x: -20,
          z: -20,
          rotation: 0,
          color: "#bba17b",
        },
      },
    ],
  };
  await dm.locator("textarea").fill(JSON.stringify(patch));
  await dm.getByRole("button", { name: "Preview changes" }).click();
  await dm.getByRole("button", { name: "Inspect world" }).click();
  await dm.locator(".preview-review").waitFor();
  assert.equal((await state()).objects.length, before.objects.length);
  await dm.getByRole("button", { name: "Review & apply" }).click();
  await dm.getByRole("button", { name: "Apply as one edit" }).click();
  after = await revisionAfter(before.revision);
  assert.ok(after.objects.some((o) => o.id === "browser-shrine"));
  await dm.getByRole("button", { name: "Undo", exact: true }).click();
  after = await revisionAfter(after.revision);
  assert.ok(!after.objects.some((o) => o.id === "browser-shrine"));
  await dm.getByRole("button", { name: "Build", exact: true }).click();
  before = await state();
  await dm.locator(".asset").filter({ hasText: "Player portrait" }).click();
  await dm.locator("canvas").click({ position: { x: 480, y: 480 } });
  after = await revisionAfter(before.revision);
  const dataUrl = await dm.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 16;
    c.getContext("2d").fillRect(0, 0, 16, 16);
    return c.toDataURL("image/png");
  });
  await dm.locator(".upload input").setInputFiles({
    name: "hero.png",
    mimeType: "image/png",
    buffer: Buffer.from(dataUrl.split(",")[1], "base64"),
  });
  after = await revisionAfter(after.revision);
  assert.ok(after.objects.find((o) => o.asset === "marker").portrait);
  const downloaded = dm.waitForEvent("download");
  await dm
    .getByRole("button", { name: "Export world and portraits", exact: true })
    .click();
  const exported = JSON.parse(
    await readFile(await (await downloaded).path(), "utf8"),
  );
  assert.equal(Object.keys(exported.portraits).length, 1);
  await dm.getByRole("button", { name: "Import world", exact: true }).click();
  await dm.locator(".modal input[type=file]").setInputFiles({
    name: "world.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(exported)),
  });
  const restored = await revisionAfter(after.revision);
  const marker = restored.objects.find((o) => o.asset === "marker");
  assert.ok(marker.portrait);
  assert.equal(
    (await fetch(base + "/portraits/" + marker.portrait)).status,
    200,
  );
  console.log("Portrait upload and world export/import passed");
  await mobile.bringToFront();
  console.log("Patch preview, apply and undo passed");
  await mkdir("artifacts", { recursive: true });
  await dm.screenshot({ path: "artifacts/desktop.png" });
  await mobile.screenshot({ path: "artifacts/mobile.png" });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      result: "passed",
      checks: [
        "desktop render",
        "phone viewer",
        "object placement",
        "road stroke",
        "live camera focus",
        "join QR",
        "portrait upload",
        "world export/import with portraits",
        "patch preview/apply/undo",
      ],
      runtimeErrors: errors,
    }),
  );
} finally {
  await browser?.close();
  child.kill("SIGTERM");
  await new Promise((r) => child.once("exit", r));
  await rm(dir, { recursive: true, force: true });
}

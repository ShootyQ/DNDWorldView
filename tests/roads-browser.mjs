import { chromium } from "playwright";
import * as THREE from "three";
import { starter } from "../shared/world.ts";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const initial = starter();
initial.objects = [];
initial.roads = [];
initial.heights.fill(0);
initial.paint.fill(0);
initial.locations = [
  {
    id: "road-test-location",
    name: "Meadow",
    x: 0,
    z: 0,
    view: { position: [0, 75, 75], target: [0, 0, 0] },
  },
];
initial.focus = "road-test-location";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((w) => {
    if (!localStorage.getItem("hearth-world-v1"))
      localStorage.setItem("hearth-world-v1", JSON.stringify(w));
  }, initial);
  await page.goto(
    process.env.PAGES_URL || "http://127.0.0.1:4173/DNDWorldView/",
  );
  await page.getByRole("heading", { name: "Meadow", exact: true }).waitFor();
  await page.waitForTimeout(1000);
  const box = await page.locator("canvas").boundingBox(),
    camera = new THREE.PerspectiveCamera(48, box.width / box.height, 0.1, 1000);
  camera.position.set(0, 75, 75);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  function screen(x, z) {
    const p = new THREE.Vector3(x, 0, z).project(camera);
    return {
      x: box.x + ((p.x + 1) * box.width) / 2,
      y: box.y + ((1 - p.y) * box.height) / 2,
    };
  }
  async function saved() {
    return page.evaluate(() =>
      JSON.parse(localStorage.getItem("hearth-world-v1")),
    );
  }
  await page.getByRole("button", { name: "Terrain", exact: true }).click();
  await page.getByRole("button", { name: "road", exact: false }).click();
  const start = screen(-60, 0),
    end = screen(60, 0),
    trail = screen(-30, 0),
    clip = {
      x: Math.round(trail.x) - 4,
      y: Math.round(trail.y) - 4,
      width: 8,
      height: 8,
    };
  const before = await page.screenshot({ clip });
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 3 });
  const live = await page.screenshot({ clip });
  assert.notDeepEqual(
    live,
    before,
    "paint must visibly change behind the cursor before release",
  );
  assert.deepEqual(
    (await saved()).paint,
    initial.paint,
    "preview cannot alter persisted terrain",
  );
  assert.equal((await saved()).revision, 0);
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("hearth-world-v1")).roads.length === 1,
  );
  let world = await saved();
  assert.equal(world.revision, 1);
  for (let x = -56; x <= 56; x += 4)
    assert.equal(
      world.paint[32 * 65 + Math.round((x + 128) / 4)],
      3,
      "fast strokes must have no gaps",
    );
  assert.ok(world.roads[0].points.length > 20);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal((await saved()).roads.length, 0);
  assert.deepEqual((await saved()).paint, initial.paint);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  world = await saved();
  await page.reload();
  await page.getByRole("heading", { name: "Meadow", exact: true }).waitFor();
  await page.getByRole("button", { name: "Terrain", exact: true }).click();
  await page.getByRole("button", { name: "road", exact: false }).click();
  assert.equal(
    await page.getByLabel("Road to populate").inputValue(),
    world.roads[0].id,
  );
  await page
    .getByRole("button", { name: "Add houses along road", exact: false })
    .click();
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("hearth-world-v1")).objects.length > 0,
  );
  world = await saved();
  assert.equal(world.revision, 4);
  assert.ok(world.objects.length >= 8);
  for (const o of world.objects)
    assert.ok(Math.cos(o.rotation) * -Math.sign(o.z) > 0.99);
  const count = world.objects.length;
  await page
    .getByRole("button", { name: "Add houses along road", exact: false })
    .click();
  assert.equal((await saved()).objects.length, count);
  assert.equal((await saved()).revision, 4);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.equal((await saved()).objects.length, 0);
  assert.equal((await saved()).roads.length, 1);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  assert.equal((await saved()).objects.length, count);
  world = await saved();
  const rev = world.revision;
  const a = screen(-40, 40),
    b = screen(40, 40);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 3 });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal((await saved()).revision, rev);
  assert.deepEqual((await saved()).paint, world.paint);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/roads.png" });
  assert.deepEqual(errors, []);
  console.log(
    "Roads passed: visible mid-stroke paint, unsaved preview, continuous fast strokes, persistent centerlines, house generation and orientation, no duplicate batches, independent undo, redo, Escape cancel, no runtime errors.",
  );
} finally {
  await browser.close();
}

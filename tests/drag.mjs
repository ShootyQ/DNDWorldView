import { chromium } from "playwright";
import * as THREE from "three";
import { starter } from "../shared/world.ts";
import assert from "node:assert/strict";
const w = starter();
w.heights.fill(0);
w.objects = [
  {
    id: "drag-house",
    asset: "cottage",
    name: "Drag house",
    x: 0,
    z: 0,
    rotation: 0,
    color: "#bba17b",
  },
  {
    id: "drag-tree",
    asset: "tree",
    name: "Drag tree",
    x: -16,
    z: 0,
    rotation: 0,
    color: "#557744",
  },
];
w.locations = [
  {
    id: "drag-location",
    name: "Drag test",
    x: 0,
    z: 0,
    view: { position: [0, 60, 60], target: [0, 0, 0] },
  },
];
w.focus = "drag-location";
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
  await page.addInitScript(
    (value) => localStorage.setItem("hearth-world-v1", JSON.stringify(value)),
    w,
  );
  await page.goto(
    process.env.PAGES_URL || "http://127.0.0.1:4173/DNDWorldView/",
  );
  await page.locator("canvas").waitFor();
  await page.getByRole("heading", { name: "Drag test", exact: true }).waitFor();
  await page.waitForTimeout(1000);
  const box = await page.locator("canvas").boundingBox();
  const camera = new THREE.PerspectiveCamera(
    48,
    box.width / box.height,
    0.1,
    1000,
  );
  camera.position.set(0, 60, 60);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  function screen(x, y, z) {
    const p = new THREE.Vector3(x, y, z).project(camera);
    return {
      x: box.x + ((p.x + 1) * box.width) / 2,
      y: box.y + ((1 - p.y) * box.height) / 2,
    };
  }
  function ground(p) {
    const r = new THREE.Raycaster();
    r.setFromCamera(
      new THREE.Vector2(
        ((p.x - box.x) / box.width) * 2 - 1,
        (-(p.y - box.y) / box.height) * 2 + 1,
      ),
      camera,
    );
    return r.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      new THREE.Vector3(),
    );
  }
  async function saved() {
    return page.evaluate(() =>
      JSON.parse(localStorage.getItem("hearth-world-v1")),
    );
  }
  async function drag(id, x, z, height, dx, dy) {
    const start = screen(x, height, z),
      end = { x: start.x + dx, y: start.y + dy };
    const before = await saved();
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    assert.equal(
      await page.locator("canvas").evaluate((c) => c.style.cursor),
      "grabbing",
    );
    await page.mouse.move(end.x, end.y, { steps: 8 });
    assert.equal(
      (await saved()).revision,
      before.revision,
      "preview must not save",
    );
    await page.mouse.up();
    await page.waitForFunction(
      (rev) =>
        JSON.parse(localStorage.getItem("hearth-world-v1")).revision > rev,
      before.revision,
    );
    const after = await saved();
    const o = after.objects.find((o) => o.id === id);
    const a = ground(start),
      b = ground(end);
    assert.ok(
      Math.abs(o.x - (x + b.x - a.x)) < 0.02,
      `X placement drift: ${o.x}`,
    );
    assert.ok(
      Math.abs(o.z - (z + b.z - a.z)) < 0.02,
      `Z placement drift: ${o.z}`,
    );
    assert.equal(
      after.revision,
      before.revision + 1,
      "one undo transaction per drag",
    );
    return o;
  }
  const house = await drag("drag-house", 0, 0, 3, 70, 40);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  let state = await saved();
  assert.equal(state.objects[0].x, 0);
  assert.equal(state.objects[0].z, 0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  state = await saved();
  assert.equal(state.objects[0].x, house.x);
  // Cancel a second drag without changing the saved position or revision.
  const start = screen(house.x, 3, house.z);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 45, start.y + 25, { steps: 5 });
  const rev = (await saved()).revision;
  await page.keyboard.press("Escape");
  await page.mouse.up();
  assert.equal((await saved()).revision, rev);
  assert.equal((await saved()).objects[0].x, house.x);
  await drag("drag-tree", -16, 0, 4, -45, 20);
  const exact = page.getByRole("spinbutton", {
    name: "X position",
    exact: true,
  });
  const beforeExact = (await saved()).revision;
  await exact.fill("12.34");
  await exact.press("Tab");
  await page.waitForFunction(
    (rev) => JSON.parse(localStorage.getItem("hearth-world-v1")).revision > rev,
    beforeExact,
  );
  assert.equal(
    (await saved()).objects.find((o) => o.id === "drag-tree").x,
    12.34,
  );

  page.on("dialog", (d) => d.accept("Camera check"));
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await page
    .getByRole("button", { name: "Save current camera view", exact: false })
    .click();
  state = await saved();
  const view = state.locations.at(-1).view;
  assert.ok(
    view.position.every((v, i) => Math.abs(v - [0, 60, 60][i]) < 0.01),
    "camera must stay fixed during drag",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Direct drag passed: exact terrain positions, one save per drop, undo/redo, Escape cancel, instanced trees, fixed camera, no runtime errors.",
  );
} finally {
  await browser.close();
}

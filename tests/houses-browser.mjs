import { chromium } from "playwright";
import * as THREE from "three";
import { starter } from "../shared/world.ts";
import { houseDesigns, randomHouse } from "../shared/houses.ts";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const w = starter();
w.heights.fill(0);
w.paint.fill(0);
w.roads = [];
const spots = [
  [-18, -10],
  [0, -10],
  [18, -10],
  [-10, 12],
  [10, 12],
];
const colors = ["#e3d4b4", "#b8b5a6", "#a4b29a", "#91aab3", "#dec58d"],
  roofs = ["#a85f49", "#465568", "#795968", "#484b4b", "#65765d"];
w.objects = houseDesigns.map((d, i) => ({
  id: "showcase-" + d.id,
  asset: "cottage",
  name: d.name,
  x: spots[i][0],
  z: spots[i][1],
  rotation: 0,
  ...randomHouse(d.id, d.id),
  color: colors[i],
  roofColor: roofs[i],
  trimColor: i === 3 ? "#e1d9bd" : "#62503e",
  roofMaterial: i === 1 ? "slate" : "tiles",
}));
w.locations = [
  {
    id: "house-gallery",
    name: "The house collection",
    x: 0,
    z: 0,
    view: { position: [30, 27, 48], target: [0, 3, 0] },
  },
];
w.focus = "house-gallery";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1000 },
  });
  const errors = [];
  page.on("response", (r) => {
    if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.addInitScript((v) => {
    if (!localStorage.getItem("hearth-world-v1"))
      localStorage.setItem("hearth-world-v1", JSON.stringify(v));
  }, w);
  await page.goto(
    process.env.PAGES_URL || "http://127.0.0.1:4173/DNDWorldView/",
  );
  await page
    .getByRole("heading", {
      name: "The house collection",
      exact: true,
      level: 2,
    })
    .waitFor();
  await page.waitForTimeout(1300);
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/house-collection.png" });
  const box = await page.locator("canvas").boundingBox(),
    camera = new THREE.PerspectiveCamera(48, box.width / box.height, 0.1, 1000);
  camera.position.set(30, 27, 48);
  camera.lookAt(0, 3, 0);
  camera.updateMatrixWorld();
  const p = new THREE.Vector3(-20, 0, 24).project(camera),
    spot = {
      x: box.x + ((p.x + 1) * box.width) / 2,
      y: box.y + ((1 - p.y) * box.height) / 2,
    };
  await page
    .getByRole("button", { name: "Place Willow Cottage", exact: true })
    .click();
  await page.mouse.click(spot.x, spot.y);
  await page.getByLabel("House design", { exact: true }).waitFor();
  async function saved() {
    return page.evaluate(() =>
      JSON.parse(localStorage.getItem("hearth-world-v1")),
    );
  }
  let state = await saved();
  const id = state.objects.at(-1).id;
  assert.equal(state.objects.at(-1).houseStyle, "willow");
  await page.getByLabel("House design", { exact: true }).selectOption("garden");
  await page.getByLabel("Roof shape", { exact: true }).selectOption("gambrel");
  await page.getByLabel("Roof finish", { exact: true }).selectOption("thatch");
  await page.getByRole("button", { name: "Roof: Moss", exact: true }).click();
  await page
    .getByRole("button", { name: "Trim: Painted ivory", exact: true })
    .click();
  await page.getByRole("button", { name: "Walls: Rose", exact: true }).click();
  state = await saved();
  const custom = state.objects.find((o) => o.id === id);
  assert.equal(custom.houseStyle, "garden");
  assert.equal(custom.roofStyle, "gambrel");
  assert.equal(custom.roofMaterial, "thatch");
  assert.equal(custom.roofColor, "#65765d");
  assert.equal(custom.trimColor, "#e1d9bd");
  assert.equal(custom.color, "#c69c9b");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  assert.notEqual(
    (await saved()).objects.find((o) => o.id === id).color,
    "#c69c9b",
  );
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  assert.equal(
    (await saved()).objects.find((o) => o.id === id).color,
    "#c69c9b",
  );
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  const copy = (await saved()).objects.at(-1);
  for (const key of [
    "houseStyle",
    "roofStyle",
    "roofMaterial",
    "roofColor",
    "trimColor",
    "color",
  ])
    assert.equal(copy[key], custom[key]);
  await page.reload();
  await page
    .getByRole("heading", {
      name: "The house collection",
      exact: true,
      level: 2,
    })
    .waitFor();
  assert.deepEqual(
    (await saved()).objects.find((o) => o.id === id),
    custom,
  );
  assert.deepEqual(errors, []);
  console.log(
    "House collection passed: five rendered designs, direct placement, independent architecture/roof/material/colors, undo/redo, duplication, reload, no runtime errors.",
  );
} finally {
  await browser.close();
}

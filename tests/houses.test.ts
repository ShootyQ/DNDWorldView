import * as THREE from "three";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  houseDesigns,
  houseAppearance,
  randomHouse,
  houseStyles,
  roofStyles,
  roofMaterials,
  wallColors,
  roofColors,
  trimColors,
} from "../shared/houses";
import { starter, worldSchema, applyPatch } from "../shared/world";
import { buildHouseGeometry } from "../src/House";
import { housesAlongRoad } from "../shared/roads";
test("five architectural designs expose thousands of independently editable palette combinations", () => {
  assert.equal(houseDesigns.length, 5);
  assert.ok(
    5 *
      roofStyles.length *
      roofMaterials.length *
      wallColors.length *
      roofColors.length *
      trimColors.length >
      10000,
  );
  const choices = new Set(
    Array.from({ length: 1000 }, (_, i) =>
      JSON.stringify(randomHouse("seed-" + i)),
    ),
  );
  assert.ok(choices.size > 500);
  assert.deepEqual(randomHouse("stable"), randomHouse("stable"));
});
test("legacy cottages gain a stable detailed appearance without changing saved data", () => {
  const old = {
    id: "old-cottage",
    asset: "cottage" as const,
    name: "Old home",
    x: 0,
    z: 0,
    rotation: 0,
    color: "#bba17b",
  };
  const a = houseAppearance(old);
  assert.ok(houseStyles.includes(a.houseStyle));
  assert.equal(a.color, old.color);
  assert.equal(old.hasOwnProperty("houseStyle"), false);
  assert.deepEqual(houseAppearance(old), a);
});
test("all 45 design, roof profile, and finish combinations build finite bounded geometry", () => {
  const signatures = new Set();
  for (const style of houseStyles)
    for (const shape of roofStyles)
      for (const material of roofMaterials) {
        const a = {
          ...randomHouse("geometry", style),
          roofStyle: shape,
          roofMaterial: material,
        };
        const meshes = buildHouseGeometry(a);
        let count = 0;
        for (const g of meshes) {
          assert.ok(g);
          g!.computeBoundingBox();
          const b = g!.boundingBox!;
          assert.ok(
            b.min.x >= -7 && b.max.x <= 7 && b.min.z >= -7 && b.max.z <= 7,
          );
          assert.ok(b.min.y >= -0.01 && b.max.y <= 12);
          const p = g!.attributes.position;
          for (let i = 0; i < p.array.length; i++)
            assert.ok(Number.isFinite(p.array[i]));
          count += p.count;
          g!.dispose();
        }
        assert.ok(count > 1000 && count < 50000);
        if (shape === "gable" && material === "tiles") signatures.add(count);
      }
  assert.equal(signatures.size, 5, "designs need distinct architecture");
});
test("appearance changes preserve placement, persist through JSON, and remain valid in patches", () => {
  const w = starter(),
    o = w.objects.find((o) => o.asset === "cottage")!,
    appearance = randomHouse("custom", "garden");
  const edited = applyPatch(w, {
    worldId: w.id,
    baseRevision: w.revision,
    operations: [{ type: "update", id: o.id, changes: appearance }],
  });
  const restored = worldSchema.parse(JSON.parse(JSON.stringify(edited))),
    house = restored.objects.find((h) => h.id === o.id)!;
  assert.deepEqual(houseAppearance(house), appearance);
  assert.equal(house.x, o.x);
  assert.equal(house.z, o.z);
  assert.equal(house.rotation, o.rotation);
  assert.throws(() =>
    applyPatch(edited, {
      worldId: w.id,
      baseRevision: edited.revision,
      operations: [
        { type: "update", id: o.id, changes: { roofStyle: "invalid" } },
      ],
    }),
  );
});
test("road generation mixes detailed house designs and reserves their full footprints", () => {
  let w = starter();
  w.objects = [];
  w.roads = [];
  w.heights.fill(0);
  w.paint.fill(0);
  w = applyPatch(w, {
    worldId: w.id,
    baseRevision: 0,
    operations: [
      {
        type: "road",
        road: {
          id: "gallery-road",
          name: "Village lane",
          points: [
            { x: -90, z: 0 },
            { x: 90, z: 0 },
          ],
          radius: 4,
        },
      },
    ],
  });
  const homes = housesAlongRoad(w, w.roads[0]);
  assert.ok(homes.length > 8);
  assert.ok(new Set(homes.map((h) => h.houseStyle)).size >= 3);
  for (const h of homes) {
    assert.ok(h.roofColor && h.trimColor && h.roofStyle && h.roofMaterial);
    for (const other of homes)
      if (h.id !== other.id)
        assert.ok(Math.hypot(h.x - other.x, h.z - other.z) >= 15.5);
  }
});

test("all five entrances remain clear of porches, bays and sunrooms", () => {
  for (const style of houseStyles) {
    const parts = buildHouseGeometry(randomHouse("entry", style));
    const mesh = new THREE.Mesh(
      parts[0]!,
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }),
    );
    mesh.updateMatrixWorld();
    const ray = new THREE.Raycaster(
      new THREE.Vector3(style === "merchant" ? -1.5 : 0, 1.8, 8),
      new THREE.Vector3(0, 0, -1),
    );
    const hit = ray.intersectObject(mesh)[0];
    assert.ok(hit && hit.point.z < 3.3, style + " entry obstructed");
    parts.forEach((p) => p?.dispose());
    (mesh.material as THREE.Material).dispose();
  }
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  starter,
  applyPatch,
  worldSchema,
  type World,
  type Road,
} from "../shared/world";
import { housesAlongRoad, distanceToRoad } from "../shared/roads";
const road: Road = {
  id: "road-test",
  name: "Meadow lane",
  points: [
    { x: -60, z: 0 },
    { x: 60, z: 0 },
  ],
  radius: 4,
};
function meadow(): World {
  const w = starter();
  w.objects = [];
  w.roads = [];
  w.heights.fill(0);
  w.paint.fill(0);
  return applyPatch(w, {
    worldId: w.id,
    baseRevision: w.revision,
    operations: [{ type: "road", road }],
  });
}
test("road transaction fills gaps, saves the centerline, and preserves its input", () => {
  const source = starter();
  source.objects = [];
  source.roads = [];
  source.paint.fill(0);
  const w = applyPatch(source, {
    worldId: source.id,
    baseRevision: 0,
    operations: [{ type: "road", road }],
  });
  assert.equal(w.roads.length, 1);
  assert.equal(w.revision, 1);
  assert.equal(source.roads.length, 0);
  for (let x = -60; x <= 60; x += 4)
    assert.equal(w.paint[32 * 65 + Math.round((x + 128) / 4)], 3);
  assert.throws(() =>
    applyPatch(w, {
      worldId: w.id,
      baseRevision: w.revision,
      operations: [{ type: "road", road }],
    }),
  );
});
test("straight roads do not acquire side spurs from zero-weight boundary stamps", () => {
  const w = meadow();
  for (let x = -56; x <= 56; x += 4) {
    const col = Math.round((x + 128) / 4);
    assert.equal(w.paint[31 * 65 + col], 0);
    assert.equal(w.paint[33 * 65 + col], 0);
  }
});
test("older saves without centerlines still load without losing paint", () => {
  const { roads, ...old } = starter();
  const migrated = worldSchema.parse(old);
  assert.deepEqual(migrated.roads, []);
  assert.deepEqual(migrated.paint, old.paint);
});
test("houses line both sides, face the road, leave setbacks, and do not overlap", () => {
  const w = meadow(),
    original = JSON.stringify(w),
    houses = housesAlongRoad(w, road);
  assert.ok(houses.length >= 8);
  assert.ok(houses.some((h) => h.z > 0) && houses.some((h) => h.z < 0));
  for (const h of houses) {
    assert.ok(distanceToRoad(h, road) >= road.radius + 7);
    const towardZ = -Math.sign(h.z);
    assert.ok(Math.cos(h.rotation) * towardZ > 0.99);
    for (const other of houses)
      if (other.id !== h.id)
        assert.ok(Math.hypot(h.x - other.x, h.z - other.z) >= 12.5);
  }
  assert.equal(JSON.stringify(w), original);
  const built = applyPatch(w, {
    worldId: w.id,
    baseRevision: w.revision,
    operations: houses.map((object) => ({ type: "add", object })),
  });
  assert.equal(built.revision, w.revision + 1);
  assert.equal(housesAlongRoad(built, road).length, 0);
});
test("water, slopes, and erased roads do not get houses", () => {
  const w = meadow();
  w.heights.fill(-3);
  assert.equal(housesAlongRoad(w, road).length, 0);
  w.heights = w.heights.map((_, i) => -12 + (i % 65) * 0.6);
  assert.equal(housesAlongRoad(w, road).length, 0);
  w.heights.fill(0);
  w.paint.fill(0);
  assert.equal(housesAlongRoad(w, road).length, 0);
});
test("occupied lots, intersections, bounds, short strokes, and world capacity are respected", () => {
  const w = meadow();
  w.objects = [
    {
      id: "tavern-lot",
      name: "Existing tavern",
      asset: "tavern",
      x: -52,
      z: 12,
      rotation: 0,
      color: "#aaaaaa",
    },
  ];
  const crossing: Road = {
    id: "cross",
    name: "Cross street",
    radius: 4,
    points: [
      { x: 0, z: -100 },
      { x: 0, z: 100 },
    ],
  };
  w.roads.push(crossing);
  const houses = housesAlongRoad(w, road);
  assert.ok(houses.length);
  for (const h of houses) {
    assert.ok(Math.hypot(h.x + 52, h.z - 12) >= 14.5);
    assert.ok(distanceToRoad(h, crossing) >= 11);
    assert.ok(Math.abs(h.x) <= 122 && Math.abs(h.z) <= 122);
  }
  assert.equal(
    housesAlongRoad(w, { ...road, points: [{ x: 0, z: 0 }] }).length,
    0,
  );
  w.objects = Array.from({ length: 2000 }, (_, i) => ({
    ...w.objects[0],
    id: "obj-" + i,
  }));
  assert.equal(housesAlongRoad(w, road).length, 0);
});
test("curved roads leave space along every segment", () => {
  let w = meadow();
  const bend: Road = {
    ...road,
    id: "bend",
    points: [
      { x: -60, z: -40 },
      { x: 0, z: -40 },
      { x: 0, z: 30 },
      { x: 60, z: 30 },
    ],
  };
  w = applyPatch(w, {
    worldId: w.id,
    baseRevision: w.revision,
    operations: [{ type: "road", road: bend }],
  });
  const houses = housesAlongRoad(w, bend);
  assert.ok(houses.length);
  for (const h of houses)
    for (const r of w.roads) assert.ok(distanceToRoad(h, r) >= r.radius + 7);
  assert.ok(houses.length <= 24);
});

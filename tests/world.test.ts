import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch, starter, worldSchema, heightAt } from "../shared/world.js";
test("starter has a valid river, locations and population", () => {
  const w = worldSchema.parse(starter());
  assert.equal(w.objects.filter((o) => o.asset === "npc").length, 15);
  assert.ok(heightAt(w, 44, 0) < -1.3);
  assert.ok(w.locations.some((l) => l.id === w.focus));
});
test("patch updates stable IDs atomically and increments revision", () => {
  const w = starter(),
    o = w.objects[0];
  const n = applyPatch(w, {
    worldId: w.id,
    baseRevision: 0,
    operations: [
      { type: "update", id: o.id, changes: { name: "New tavern" } },
      { type: "remove", id: w.objects[1].id },
    ],
  });
  assert.equal(n.revision, 1);
  assert.equal(n.objects[0].name, "New tavern");
  assert.equal(n.objects.length, w.objects.length - 1);
  assert.notEqual(w.objects[0].name, "New tavern");
});
test("stale, malformed, duplicate and unknown IDs cannot alter world", () => {
  const w = starter(),
    original = JSON.stringify(w);
  for (const p of [
    {
      worldId: w.id,
      baseRevision: 2,
      operations: [{ type: "remove", id: w.objects[0].id }],
    },
    {
      worldId: w.id,
      baseRevision: 0,
      operations: [{ type: "add", object: w.objects[0] }],
    },
    {
      worldId: w.id,
      baseRevision: 0,
      operations: [{ type: "remove", id: "missing" }],
    },
    {
      worldId: w.id,
      baseRevision: 0,
      operations: [
        { type: "update", id: w.objects[0].id, changes: { x: 999 } },
      ],
    },
  ])
    assert.throws(() => applyPatch(w, p));
  assert.equal(JSON.stringify(w), original);
});
test("terrain brushes raise, lower, smooth, flatten and paint bounded terrain", () => {
  let w = starter();
  for (const mode of [
    "raise",
    "lower",
    "smooth",
    "flatten",
    "grass",
    "dirt",
    "stone",
    "road",
  ]) {
    const prior = w;
    w = applyPatch(w, {
      worldId: w.id,
      baseRevision: w.revision,
      operations: [
        { type: "brush", mode, x: 0, z: 0, radius: 12, strength: 2 },
      ],
    });
    assert.equal(w.revision, prior.revision + 1);
    worldSchema.parse(w);
  }
  assert.equal(w.paint[32 * 65 + 32], 3);
});
test("duplicate IDs across locations and objects are rejected", () => {
  const w = starter();
  w.objects[0].id = w.locations[0].id;
  assert.throws(() => worldSchema.parse(w));
});

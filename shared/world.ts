import { z } from "zod";
export const SIZE = 256,
  GRID = 65;
export const assets = [
  "cottage",
  "tavern",
  "tower",
  "tree",
  "dock",
  "fence",
  "crate",
  "lantern",
  "npc",
  "marker",
] as const;
export const objectSchema = z
  .object({
    id: z.string().min(1).max(100),
    asset: z.enum(assets),
    name: z.string().max(100),
    x: z.number().min(-128).max(128),
    z: z.number().min(-128).max(128),
    rotation: z.number().finite(),
    color: z.string().regex(/^#[0-9a-f]{6}$/i),
    portrait: z
      .string()
      .max(100)
      .regex(/^([a-zA-Z0-9-]+\.png)?$/)
      .optional(),
  })
  .strict();
export type WorldObject = z.infer<typeof objectSchema>;
const vectorSchema = z.tuple([
  z.number().min(-1024).max(1024),
  z.number().min(-1024).max(1024),
  z.number().min(-1024).max(1024),
]);
export const cameraViewSchema = z
  .object({ position: vectorSchema, target: vectorSchema })
  .strict();
export type CameraView = z.infer<typeof cameraViewSchema>;
export const locationSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1).max(100),
    x: z.number().min(-128).max(128),
    z: z.number().min(-128).max(128),
    view: cameraViewSchema.optional(),
  })
  .strict();
export type Location = z.infer<typeof locationSchema>;
export const pointSchema = z
  .object({
    x: z.number().min(-128).max(128),
    z: z.number().min(-128).max(128),
  })
  .strict();
export type Point = z.infer<typeof pointSchema>;
export const roadSchema = z
  .object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(100),
    points: z.array(pointSchema).min(1).max(400),
    radius: z.number().min(2).max(40),
  })
  .strict();
export type Road = z.infer<typeof roadSchema>;
export function samplePath(
  points: Point[],
  spacing: number,
  max = 400,
): Point[] {
  if (!points.length) return [];
  const out = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i],
      n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / spacing));
    for (let j = 1; j <= n; j++) {
      if (out.length >= max)
        throw Error("Road is too long. Draw it in shorter sections.");
      out.push({
        x: a.x + ((b.x - a.x) * j) / n,
        z: a.z + ((b.z - a.z) * j) / n,
      });
    }
  }
  return out;
}
const cells = z.array(z.number().min(-12).max(32)).length(GRID * GRID);
export const worldSchema = z
  .object({
    version: z.literal(1),
    id: z.string().min(1),
    name: z.string().min(1).max(100),
    revision: z.number().int().nonnegative(),
    heights: cells,
    paint: z.array(z.number().int().min(0).max(3)).length(GRID * GRID),
    objects: z.array(objectSchema).max(2000),
    roads: z.array(roadSchema).max(100).default([]),
    locations: z.array(locationSchema).max(100),
    focus: z.string().nullable(),
    focusVersion: z.number().int().nonnegative().default(0),
  })
  .strict()
  .superRefine((w, c) => {
    const ids = [...w.objects, ...w.locations, ...w.roads].map((o) => o.id);
    if (new Set(ids).size !== ids.length)
      c.addIssue({ code: "custom", message: "Duplicate IDs" });
    if (w.focus && !w.locations.some((l) => l.id === w.focus))
      c.addIssue({ code: "custom", message: "Unknown focused location" });
  });
export type World = z.infer<typeof worldSchema>;
export const brushSchema = z
  .object({
    type: z.literal("brush"),
    mode: z.enum([
      "raise",
      "lower",
      "smooth",
      "flatten",
      "grass",
      "dirt",
      "stone",
      "road",
    ]),
    x: z.number().min(-128).max(128),
    z: z.number().min(-128).max(128),
    radius: z.number().min(2).max(40),
    strength: z.number().min(0.1).max(3),
  })
  .strict();
export const operationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add"), object: objectSchema }).strict(),
  z
    .object({
      type: z.literal("update"),
      id: z.string(),
      changes: objectSchema.omit({ id: true }).partial(),
    })
    .strict(),
  z.object({ type: z.literal("remove"), id: z.string() }).strict(),
  brushSchema,
  z.object({ type: z.literal("road"), road: roadSchema }).strict(),
]);
export const patchSchema = z
  .object({
    worldId: z.string(),
    baseRevision: z.number().int().nonnegative(),
    operations: z.array(operationSchema).min(1).max(500),
  })
  .strict();
export type Patch = z.infer<typeof patchSchema>;
export type BrushMode = z.infer<typeof brushSchema>["mode"];
export function heightAt(w: Pick<World, "heights">, x: number, z: number) {
  const gx = Math.max(0, Math.min(64, (x + 128) / 4)),
    gz = Math.max(0, Math.min(64, (z + 128) / 4));
  const a = Math.floor(gx),
    b = Math.floor(gz),
    u = gx - a,
    v = gz - b;
  const h = (i: number, j: number) =>
    w.heights[Math.min(64, j) * GRID + Math.min(64, i)];
  return (
    h(a, b) * (1 - u) * (1 - v) +
    h(a + 1, b) * u * (1 - v) +
    h(a, b + 1) * (1 - u) * v +
    h(a + 1, b + 1) * u * v
  );
}
export function brush(w: World, op: z.infer<typeof brushSchema>) {
  const old = [...w.heights],
    target = heightAt(w, op.x, op.z);
  for (let j = 0; j < GRID; j++)
    for (let i = 0; i < GRID; i++) {
      const d = Math.hypot(i * 4 - 128 - op.x, j * 4 - 128 - op.z);
      if (d >= op.radius - 1e-6) continue;
      const k = j * GRID + i,
        f = (1 - d / op.radius) * op.strength;
      if (["grass", "dirt", "stone", "road"].includes(op.mode)) {
        w.paint[k] = ["grass", "dirt", "stone", "road"].indexOf(op.mode);
        continue;
      }
      let h = old[k];
      if (op.mode === "raise") h += f;
      if (op.mode === "lower") h -= f;
      if (op.mode === "flatten") h += (target - h) * Math.min(1, f);
      if (op.mode === "smooth") {
        let sum = 0,
          n = 0;
        for (let y = Math.max(0, j - 1); y <= Math.min(64, j + 1); y++)
          for (let x = Math.max(0, i - 1); x <= Math.min(64, i + 1); x++) {
            sum += old[y * GRID + x];
            n++;
          }
        h += (sum / n - h) * Math.min(1, f);
      }
      w.heights[k] = Math.max(-12, Math.min(32, h));
    }
}
export function applyPatch(world: World, input: unknown): World {
  const p = patchSchema.parse(input);
  if (p.worldId !== world.id || p.baseRevision !== world.revision)
    throw Error(
      "This patch targets a different world or revision. Export fresh context and regenerate it.",
    );
  const w = structuredClone(world);
  for (const op of p.operations) {
    if (op.type === "road") {
      if (
        [...w.roads, ...w.objects, ...w.locations].some(
          (o) => o.id === op.road.id,
        )
      )
        throw Error(`ID already exists: ${op.road.id}`);
      const points = samplePath(
        op.road.points,
        Math.max(1, Math.min(2, op.road.radius / 3)),
        2000,
      );
      for (const point of points)
        brush(w, {
          type: "brush",
          mode: "road",
          ...point,
          radius: op.road.radius,
          strength: 1.5,
        });
      w.roads.push(op.road);
      continue;
    }
    if (op.type === "brush") {
      brush(w, op);
      continue;
    }
    if (op.type === "add") {
      if (
        w.objects.some((o) => o.id === op.object.id) ||
        w.locations.some((l) => l.id === op.object.id) ||
        w.roads.some((r) => r.id === op.object.id)
      )
        throw Error(`ID already exists: ${op.object.id}`);
      w.objects.push(op.object);
    } else {
      const index = w.objects.findIndex((o) => o.id === op.id);
      if (index < 0) throw Error(`Unknown object: ${op.id}`);
      if (op.type === "remove") w.objects.splice(index, 1);
      else w.objects[index] = { ...w.objects[index], ...op.changes };
    }
  }
  w.revision++;
  return worldSchema.parse(w);
}
export function starter(): World {
  const w: World = {
    version: 1,
    id: "blackwater-crossing",
    name: "Blackwater Crossing",
    revision: 0,
    heights: [],
    paint: [],
    objects: [],
    roads: [
      {
        id: "road-old-river",
        name: "Old river road",
        radius: 4,
        points: [
          { x: -100, z: 0 },
          { x: 24, z: 0 },
        ],
      },
    ],
    locations: [
      { id: "loc-square", name: "Town square", x: 0, z: 0 },
      { id: "loc-docks", name: "Blackwater docks", x: 30, z: 12 },
      { id: "loc-hill", name: "Northern overlook", x: -30, z: -40 },
    ],
    focus: "loc-square",
    focusVersion: 0,
  };
  for (let j = 0; j < GRID; j++)
    for (let i = 0; i < GRID; i++) {
      const x = i * 4 - 128,
        z = j * 4 - 128;
      w.heights.push(
        Math.abs(x - 44) < 13
          ? -3
          : Math.max(0, 7 * Math.exp(-((x + 45) ** 2 + (z + 55) ** 2) / 1200)),
      );
      w.paint.push(Math.abs(z) < 4 ? 3 : 0);
    }
  const add = (
    asset: WorldObject["asset"],
    x: number,
    z: number,
    name: string,
    color = "#bba17b",
  ) =>
    w.objects.push({
      id: `${asset}-${w.objects.length + 1}`,
      asset,
      x,
      z,
      name,
      color,
      rotation: 0,
    });
  add("tavern", -12, -12, "The Copper Kettle", "#bd8763");
  add("tower", 20, -18, "Harbor office", "#b3b0a0");
  for (let i = 0; i < 7; i++)
    add(
      "cottage",
      -35 + i * 10,
      15 + (i % 2) * 9,
      [
        "Willow House",
        "Apothecary",
        "Baker’s cottage",
        "Linen House",
        "The Old Post",
        "Mill cottage",
        "River House",
      ][i],
    );
  for (let i = 0; i < 4; i++) add("dock", 34, 2 + i * 7, "Timber landing");
  for (let i = 0; i < 45; i++) {
    const x = Math.sin(i * 17) * 95,
      z = Math.cos(i * 13) * 90;
    if (Math.abs(x - 44) > 18 && (Math.abs(z) > 32 || x < -50))
      add("tree", x, z, "Alder", "#426c4b");
  }
  for (let i = 0; i < 15; i++)
    add(
      "npc",
      -22 + (i % 6) * 8,
      -5 + Math.floor(i / 6) * 7,
      `Townsperson ${i + 1}`,
      ["#ad644a", "#547e8b", "#8b779e", "#d3ad56"][i % 4],
    );
  return w;
}

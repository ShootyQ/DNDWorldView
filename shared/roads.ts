import { randomHouse } from "./houses";
import {
  heightAt,
  type World,
  type Point,
  type Road,
  type WorldObject,
} from "./world";
const footprint: Record<WorldObject["asset"], number> = {
  cottage: 7,
  tavern: 7.5,
  tower: 5,
  tree: 3.2,
  dock: 5.5,
  fence: 3.2,
  crate: 1.3,
  lantern: 1,
  npc: 0.8,
  marker: 1.8,
};
export function distanceToRoad(p: Point, road: Road) {
  let best = Infinity;
  for (let i = 0; i < road.points.length; i++) {
    const a = road.points[i],
      b = road.points[i + 1] || a,
      dx = b.x - a.x,
      dz = b.z - a.z,
      l = dx * dx + dz * dz;
    const t = l
      ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l))
      : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz));
  }
  return best;
}
/** Produces one bounded batch; rejected lots leave the world untouched. */
export function housesAlongRoad(
  world: World,
  road: Road,
  spacing = 18,
): WorldObject[] {
  if (spacing < 12 || spacing > 40)
    throw Error("House spacing must be between 12 and 40 meters.");
  const segments = road.points
    .slice(1)
    .map((b, i) => {
      const a = road.points[i];
      return { a, b, length: Math.hypot(b.x - a.x, b.z - a.z) };
    })
    .filter((s) => s.length > 0.001);
  const total = segments.reduce((n, s) => n + s.length, 0),
    houses: WorldObject[] = [];
  const used = new Set(
    [...world.objects, ...world.locations, ...world.roads].map((o) => o.id),
  );
  const count = Math.min(24, 2000 - world.objects.length);
  let index = 0,
    traversed = 0;
  for (let d = 8; d <= total - 8 && houses.length < count; d += spacing) {
    while (
      index < segments.length - 1 &&
      traversed + segments[index].length < d
    ) {
      traversed += segments[index].length;
      index++;
    }
    const s = segments[index];
    if (!s) break;
    const t = (d - traversed) / s.length,
      center = {
        x: s.a.x + (s.b.x - s.a.x) * t,
        z: s.a.z + (s.b.z - s.a.z) * t,
      };
    const vertex =
      Math.round((center.z + 128) / 4) * 65 + Math.round((center.x + 128) / 4);
    if (world.paint[vertex] !== 3) continue;
    const nx = -(s.b.z - s.a.z) / s.length,
      nz = (s.b.x - s.a.x) / s.length;
    for (const side of [1, -1]) {
      if (houses.length >= count) break;
      const setback = road.radius + 9,
        x = center.x + nx * setback * side,
        z = center.z + nz * setback * side;
      if (Math.abs(x) > 120 || Math.abs(z) > 120) continue;
      const heights = [
        [-5, -5],
        [0, -5],
        [5, -5],
        [-5, 0],
        [0, 0],
        [5, 0],
        [-5, 5],
        [0, 5],
        [5, 5],
      ].map(([dx, dz]) => heightAt(world, x + dx, z + dz));
      if (
        Math.min(...heights) < -0.8 ||
        Math.max(...heights) - Math.min(...heights) > 1.2
      )
        continue;
      if (
        [...world.objects, ...houses].some(
          (o) => Math.hypot(o.x - x, o.z - z) < footprint[o.asset] + 8.5,
        )
      )
        continue;
      if (world.roads.some((r) => distanceToRoad({ x, z }, r) < r.radius + 8.5))
        continue;
      let id =
        "house-" +
        road.id +
        "-" +
        Math.round(d * 100) +
        "-" +
        (side === 1 ? "left" : "right");
      if (id.length > 95)
        id = id.slice(0, 75) + "-" + Math.round(d * 100) + "-" + side;
      let suffix = 0;
      const base = id;
      while (used.has(id)) id = base.slice(0, 85) + "-" + ++suffix;
      used.add(id);
      houses.push({
        id,
        asset: "cottage",
        name: `${road.name.slice(0, 65)} cottage ${houses.length + 1}`,
        x,
        z,
        rotation: Math.atan2(center.x - x, center.z - z),
        ...randomHouse(id),
      });
    }
  }
  return houses;
}

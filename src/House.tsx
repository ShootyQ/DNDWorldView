import { useEffect, useMemo } from "react";
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { houseAppearance, type HouseAppearance } from "../shared/houses";
import type { WorldObject } from "../shared/world";
type V = [number, number, number];
export function buildHouseGeometry(a: HouseAppearance) {
  const groups: T.BufferGeometry[][] = [[], [], []];
  let transform = new T.Matrix4();
  const shade = (c: string, f: number) =>
    "#" + new T.Color(c).multiplyScalar(f).getHexString();
  function add(
    g: T.BufferGeometry,
    color: string,
    pos: V = [0, 0, 0],
    rotation: V = [0, 0, 0],
    bucket = 0,
  ) {
    if (g.index) {
      const flat = g.toNonIndexed();
      g.dispose();
      g = flat;
    }
    g.deleteAttribute("uv");
    const matrix = new T.Matrix4().compose(
      new T.Vector3(...pos),
      new T.Quaternion().setFromEuler(new T.Euler(...rotation)),
      new T.Vector3(1, 1, 1),
    );
    g.applyMatrix4(transform.clone().multiply(matrix));
    const c = new T.Color(color),
      colors = [];
    for (let i = 0; i < g.attributes.position.count; i++)
      colors.push(c.r, c.g, c.b);
    g.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
    groups[bucket].push(g);
  }
  function box(
    pos: V,
    size: V,
    color: string,
    rotation: V = [0, 0, 0],
    bucket = 0,
  ) {
    add(new T.BoxGeometry(...size), color, pos, rotation, bucket);
  }
  function at(pos: V, yaw: number, fn: () => void) {
    const old = transform;
    transform = old
      .clone()
      .multiply(new T.Matrix4().makeRotationY(yaw).setPosition(...pos));
    fn();
    transform = old;
  }
  function beam(p: V, q: V, width: number, color: string, bucket = 0) {
    const v = new T.Vector3(...p),
      end = new T.Vector3(...q),
      delta = end.clone().sub(v);
    const g = new T.BoxGeometry(width, delta.length(), width);
    g.applyQuaternion(
      new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        delta.normalize(),
      ),
    );
    add(
      g,
      color,
      v.add(end).multiplyScalar(0.5).toArray() as V,
      [0, 0, 0],
      bucket,
    );
  }
  function poly(
    vertices: number[],
    indices: number[],
    color: string,
    bucket = 0,
  ) {
    const g = new T.BufferGeometry();
    g.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    g.setIndex(indices);
    g.computeVertexNormals();
    add(g, color, [0, 0, 0], [0, 0, 0], bucket);
  }
  function roof(
    w: number,
    d: number,
    y: number,
    rise: number,
    shape = a.roofStyle,
  ) {
    const hw = w / 2,
      hd = d / 2;
    if (shape === "hip") {
      const rz = Math.max(0.2, hd - w * 0.32);
      poly(
        [
          -hw,
          y,
          -hd,
          hw,
          y,
          -hd,
          hw,
          y,
          hd,
          -hw,
          y,
          hd,
          0,
          y + rise,
          -rz,
          0,
          y + rise,
          rz,
        ],
        [0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 3, 5, 4, 3, 4, 0],
        a.roofColor,
        1,
      );
      for (const x of [-hw, hw])
        for (const z of [-hd, hd])
          beam(
            [x, y + 0.025, z],
            [0, y + rise + 0.025, Math.sign(z) * rz],
            0.075,
            shade(a.roofColor, 0.76),
            1,
          );
      beam(
        [0, y + rise + 0.06, -rz],
        [0, y + rise + 0.06, rz],
        0.16,
        shade(a.roofColor, 0.84),
        1,
      );
      // Layered courses follow the four pitched faces.
      for (let j = 1; j < 7; j++) {
        const t = j / 7,
          xx = hw * (1 - t),
          zz = hd * (1 - t) + rz * t,
          yy = y + rise * t + 0.025;
        beam([-xx, yy, -zz], [xx, yy, -zz], 0.035, shade(a.roofColor, 0.88), 1);
        beam([-xx, yy, zz], [xx, yy, zz], 0.035, shade(a.roofColor, 0.88), 1);
        beam([-xx, yy, -zz], [-xx, yy, zz], 0.035, shade(a.roofColor, 0.88), 1);
        beam([xx, yy, -zz], [xx, yy, zz], 0.035, shade(a.roofColor, 0.88), 1);
      }
    } else {
      const profile =
        shape === "gambrel"
          ? [
              [-hw, y],
              [-hw * 0.62, y + rise * 0.68],
              [0, y + rise],
              [hw * 0.62, y + rise * 0.68],
              [hw, y],
            ]
          : [
              [-hw, y],
              [0, y + rise],
              [hw, y],
            ];
      for (let i = 0; i < profile.length - 1; i++) {
        const [x1, y1] = profile[i],
          [x2, y2] = profile[i + 1];
        poly(
          [x1, y1, -hd, x2, y2, -hd, x2, y2, hd, x1, y1, hd],
          [0, 2, 1, 0, 3, 2],
          shade(a.roofColor, i < profile.length / 2 ? 1 : 0.9),
          1,
        );
        const length = Math.hypot(x2 - x1, y2 - y1),
          rows = Math.ceil(
            length / (a.roofMaterial === "thatch" ? 0.28 : 0.48),
          );
        for (let j = 0; j <= rows; j++) {
          const t = j / rows;
          beam(
            [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + 0.045, -hd],
            [x1 + (x2 - x1) * t, y1 + (y2 - y1) * t + 0.045, hd],
            a.roofMaterial === "thatch" ? 0.055 : 0.035,
            shade(a.roofColor, j % 2 ? 0.86 : 1.04),
            1,
          );
        }
        if (a.roofMaterial !== "thatch")
          for (let z = -hd + 0.6; z < hd; z += 0.75)
            beam(
              [x1, y1 + 0.055, z],
              [x2, y2 + 0.055, z],
              0.027,
              shade(a.roofColor, 0.8),
              1,
            );
      }
      // Plaster end walls and timber bargeboards beneath each gable.
      for (const z of [-hd + 0.11, hd - 0.11]) {
        const vertices = [
            -hw,
            y,
            z,
            ...profile.slice(1, -1).flatMap(([x, yy]) => [x, yy - 0.05, z]),
            hw,
            y,
            z,
          ],
          n = vertices.length / 3,
          indices = [];
        for (let i = 1; i < n - 1; i++) indices.push(0, i, i + 1, 0, i + 1, i);
        poly(vertices, indices, a.color);
        for (let i = 0; i < profile.length - 1; i++)
          beam(
            [profile[i][0], profile[i][1], z],
            [profile[i + 1][0], profile[i + 1][1], z],
            0.13,
            a.trimColor,
          );
      }
      beam(
        [0, y + rise + 0.08, -hd - 0.08],
        [0, y + rise + 0.08, hd + 0.08],
        0.16,
        shade(a.roofColor, 0.72),
        1,
      );
    }
    for (const x of [-hw, hw])
      box([x, y - 0.04, 0], [0.15, 0.18, d + 0.15], a.trimColor);
    for (const z of [-hd, hd])
      box([0, y - 0.08, z], [w + 0.1, 0.13, 0.13], a.trimColor);
  }
  function window(pos: V, yaw = 0, w = 1.1, h = 1.4, shutters = true) {
    at(pos, yaw, () => {
      box([0, 0, 0], [w + 0.24, h + 0.24, 0.18], a.trimColor);
      box([0, 0, 0.105], [w, h, 0.075], "#e4bc72", [0, 0, 0], 2);
      box([0, 0, 0.17], [0.07, h, 0.07], a.trimColor);
      box([0, 0, 0.17], [w, 0.065, 0.07], a.trimColor);
      box([0, -h / 2 - 0.1, 0.12], [w + 0.45, 0.13, 0.42], a.trimColor);
      if (shutters)
        for (const side of [-1, 1]) {
          box(
            [side * (w / 2 + 0.3), 0, 0.02],
            [0.34, h + 0.08, 0.12],
            shade(a.trimColor, 1.13),
          );
          for (let j = -2; j <= 2; j++)
            box(
              [side * (w / 2 + 0.3), (j * h) / 5, 0.1],
              [0.33, 0.045, 0.05],
              shade(a.trimColor, 0.73),
            );
        }
    });
  }
  function door(x: number, z: number) {
    at([x, 0.65, z], 0, () => {
      function arch(
        w: number,
        h: number,
        depth: number,
        color: string,
        z: number,
      ) {
        const sh = new T.Shape();
        sh.moveTo(-w / 2, 0);
        sh.lineTo(w / 2, 0);
        sh.lineTo(w / 2, h - 0.45);
        sh.quadraticCurveTo(w / 2, h, 0, h + 0.12);
        sh.quadraticCurveTo(-w / 2, h, -w / 2, h - 0.45);
        sh.closePath();
        add(
          new T.ExtrudeGeometry(sh, {
            depth,
            bevelEnabled: false,
            curveSegments: 6,
          }),
          color,
          [0, 0, z],
        );
      }
      arch(1.7, 2.65, 0.13, a.trimColor, 0);
      arch(1.35, 2.43, 0.15, shade(a.trimColor, 0.72), 0.12);
      for (const xx of [-0.4, -0.2, 0, 0.2, 0.4])
        box([xx, 1, 0.29], [0.025, 1.9, 0.02], shade(a.trimColor, 1.2));
      for (const yy of [0.55, 1.65])
        box([0, yy, 0.31], [1.2, 0.09, 0.04], "#424743");
      add(new T.SphereGeometry(0.09, 8, 6), "#c7a45b", [0.4, 1.15, 0.36]);
      box([0, -0.2, 0.6], [2, 0.4, 1.2], "#99988b");
      box([0, -0.44, 1.05], [2.45, 0.18, 1.6], "#aaa797");
    });
  }
  function chimney(x: number, z: number, top: number) {
    box([x, top - 1.6, z], [0.85, 3.2, 0.9], "#a19483");
    for (let y = top - 3; y < top; y += 0.38)
      box([x, y, z], [0.91, 0.06, 0.96], "#7c766b");
    box([x, top + 0.03, z], [1.1, 0.2, 1.12], "#6e6d65");
    box([x, top + 0.15, z], [0.63, 0.1, 0.65], "#383f3b");
  }
  const style = a.houseStyle,
    w =
      style === "merchant"
        ? 5.8
        : style === "garden"
          ? 6.2
          : style === "hearthstone"
            ? 7
            : 6.6,
    d = 5.6,
    h = style === "merchant" ? 6.5 : 4.1,
    base = 0.65,
    eaves = base + h;
  box([0, 0.24, 0], [w + 0.5, 0.48, d + 0.45], "#8c8a7d");
  box([0, 0.53, 0], [w + 0.2, 0.15, d + 0.2], "#b0a894");
  box([0, base + h / 2, 0], [w, h, d], a.color);
  for (const x of [-w / 2 + 0.08, w / 2 - 0.08])
    for (const z of [-d / 2 - 0.015, d / 2 + 0.015])
      box([x, base + h / 2, z], [0.16, h, 0.16], a.trimColor);
  for (const z of [-d / 2 - 0.04, d / 2 + 0.04])
    box([0, 1, z], [w, 0.2, 0.14], a.trimColor);
  door(style === "merchant" ? -1.5 : 0, d / 2 + 0.05);
  if (style === "willow") {
    for (const z of [-d / 2 - 0.06, d / 2 + 0.06]) {
      box([0, 3.4, z], [w, 0.16, 0.13], a.trimColor);
      for (const x of [-w / 2, 0, w / 2])
        box([x, 2.8, z], [0.15, 3.55, 0.14], a.trimColor);
      beam([-w / 2, 3.5, z], [-1.5, eaves, z], 0.13, a.trimColor);
      beam([w / 2, 3.5, z], [1.5, eaves, z], 0.13, a.trimColor);
    }
    for (const x of [-2.1, 2.1]) window([x, 2.7, d / 2 + 0.12], 0, 0.9, 1.15);
    at([0, 0, 3.55], 0, () => {
      for (const x of [-1.3, 1.3])
        box([x, 1.8, 0.65], [0.16, 2.5, 0.16], a.trimColor);
      roof(3.2, 1.85, 3.05, 0.85, "gable");
    });
  } else if (style === "hearthstone") {
    for (let row = 0; row < 8; row++) {
      const yy = 0.9 + row * 0.48;
      for (const z of [-d / 2 - 0.04, d / 2 + 0.04]) {
        box([0, yy, z], [w, 0.035, 0.035], shade(a.color, 0.78));
        for (let j = 0; j < 6; j++) {
          const x = -w / 2 + ((j + 0.5) * w) / 6 + (row % 2 ? 0.25 : 0);
          if (Math.abs(x) < w / 2)
            box([x, yy + 0.23, z], [0.025, 0.45, 0.045], shade(a.color, 0.84));
        }
      }
    }
    for (const x of [-2.25, 2.25]) {
      window([x, 2.65, d / 2 + 0.13], 0, 0.9, 1.35, false);
      box([x, 3.53, d / 2 + 0.12], [1.35, 0.22, 0.3], "#c1b79f");
    }
    chimney(-2, -1, eaves + 2.8);
  } else if (style === "merchant") {
    box([0, 4.96, 0], [w + 0.6, 3.2, d + 0.5], a.color);
    for (const z of [-d / 2 - 0.3, d / 2 + 0.3]) {
      box([0, 3.45, z], [w + 0.75, 0.3, 0.3], a.trimColor);
      box([0, 5, z], [w + 0.65, 0.14, 0.16], a.trimColor);
      for (const x of [-2.9, -1, 1, 2.9])
        box([x, 5, z], [0.15, 3.1, 0.18], a.trimColor);
      for (const x of [-2, 2])
        beam([x - 0.75, 5.1, z], [x + 0.75, 6.4, z], 0.11, a.trimColor);
    }
    for (const x of [-1.55, 1.55]) window([x, 5.75, d / 2 + 0.35], 0, 1, 1.15);
    box([1.25, 2, 3.07], [2.35, 1.85, 0.65], a.trimColor);
    window([1.25, 2.1, 3.42], 0, 1.95, 1.45, false);
    at([1.25, 0, 3.1], 0, () => roof(2.7, 1, 3.12, 0.55, "gable"));
    for (const x of [-2, -0.7, 0.7, 2])
      box([x, 3.13, 3], [0.18, 0.65, 0.5], a.trimColor);
  } else if (style === "riverside") {
    for (let yy = 1.25; yy < eaves; yy += 0.33)
      for (const z of [-d / 2 - 0.025, d / 2 + 0.025])
        box([0, yy, z], [w, 0.045, 0.07], shade(a.color, 0.8));
    box([0, 0.7, 3.5], [w + 0.5, 0.25, 1.7], a.trimColor);
    for (const x of [-3, -1.5, 1.5, 3]) {
      box([x, 1.85, 4.15], [0.14, 2.7, 0.14], a.trimColor);
      box([x, 3.05, 4.15], [0.28, 0.13, 0.28], a.trimColor);
    }
    box([0, 3.35, 3.6], [w + 0.6, 0.18, 1.85], a.roofColor, [0.14, 0, 0], 1);
    for (const x of [-2.2, 2.2]) {
      box([x, 1.55, 4.18], [1.6, 0.1, 0.12], a.trimColor);
      for (let j = 0; j < 5; j++)
        box([x - 0.65 + j * 0.32, 1.15, 4.18], [0.06, 0.75, 0.06], a.trimColor);
      window([x, 2.5, d / 2 + 0.12], 0, 1.05, 1.2);
    }
  } else {
    for (const x of [-2.4, 2.4]) {
      box([x, 0.8, 4.15], [1.4, 0.45, 0.55], a.trimColor);
      box([x, 1.1, 4.15], [1.3, 0.3, 0.52], "#65815a");
      for (let j = 0; j < 4; j++)
        add(new T.IcosahedronGeometry(0.11, 0), j % 2 ? "#d6ae6b" : "#be7d8e", [
          x - 0.45 + j * 0.3,
          1.3,
          4.16,
        ]);
    }
    at([-2, 0, 2.65], 0, () => {
      box([0, 2.6, 0.3], [2.2, 2.1, 0.85], a.color);
      window([0, 2.7, 0.78], 0, 1.25, 1.35);
      roof(2.65, 1.75, 3.7, 1.55, "gable");
    });
    at([2.15, 0, 3.1], 0, () => {
      box([0, 0.8, 0], [2, 0.4, 1.55], a.trimColor);
      for (const x of [-0.9, 0, 0.9])
        box([x, 1.9, 0.75], [0.1, 2, 0.12], a.trimColor);
      box([0, 1.9, 0.68], [1.8, 1.7, 0.06], "#c6d4bc", [0, 0, 0], 2);
      box([0, 2.83, 0], [2.1, 0.15, 1.8], a.roofColor, [0.18, 0, 0], 1);
    });
    for (const z of [-1.4, -0.7, 0, 0.7, 1.4])
      box([w / 2 + 0.12, 2.4, z], [0.1, 2.8, 0.07], a.trimColor);
    for (const yy of [1.2, 1.8, 2.4, 3, 3.6])
      box([w / 2 + 0.12, yy, 0], [0.1, 0.065, 3.1], a.trimColor);
    for (const [yy, z] of [
      [1.4, -1],
      [2, -0.3],
      [2.7, 0.4],
      [3.4, 0.8],
    ])
      add(new T.IcosahedronGeometry(0.35, 0), "#668259", [w / 2 + 0.24, yy, z]);
  }
  // Finish all four elevations, so the houses hold up when the camera rotates.
  for (const side of [-1, 1])
    window(
      [side * (w / 2 + 0.11), style === "merchant" ? 2.1 : 2.6, -0.4],
      (side * Math.PI) / 2,
      1.1,
      1.35,
      style !== "hearthstone",
    );
  for (const x of [-1.7, 1.7])
    window([x, 2.6, -d / 2 - 0.12], Math.PI, 1, 1.25, style !== "hearthstone");
  if (style === "merchant")
    for (const side of [-1, 1])
      window(
        [side * (w / 2 + 0.36), 5.65, -0.2],
        (side * Math.PI) / 2,
        1.2,
        1.3,
      );
  roof(
    w + (style === "merchant" ? 1.1 : 0.8),
    d + (style === "merchant" ? 1 : 0.8),
    eaves + 0.08,
    style === "merchant" ? 2.8 : 2.5,
  );
  if (style !== "hearthstone")
    chimney(style === "garden" ? 1.8 : -1.8, -1.2, eaves + 2.9);
  const merged = groups.map((parts) => {
    const result = parts.length
      ? mergeGeometries(parts)
      : new T.BufferGeometry();
    parts.forEach((g) => g.dispose());
    return result;
  });
  return merged;
}
export function House({ object }: { object: WorldObject }) {
  const a = houseAppearance(object);
  const meshes = useMemo(
    () => buildHouseGeometry(a),
    [
      a.houseStyle,
      a.roofStyle,
      a.roofMaterial,
      a.roofColor,
      a.trimColor,
      a.color,
    ],
  );
  useEffect(() => () => meshes.forEach((g) => g.dispose()), [meshes]);
  return (
    <group>
      <mesh geometry={meshes[0]} castShadow receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.95} flatShading />
      </mesh>
      <mesh geometry={meshes[1]} castShadow receiveShadow>
        <meshStandardMaterial
          vertexColors
          roughness={a.roofMaterial === "slate" ? 0.78 : 1}
          side={T.DoubleSide}
        />
      </mesh>
      <mesh geometry={meshes[2]}>
        <meshStandardMaterial
          vertexColors
          roughness={0.3}
          emissive="#b68b4c"
          emissiveIntensity={0.14}
        />
      </mesh>
    </group>
  );
}

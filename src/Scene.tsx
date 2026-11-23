import { useEffect, useMemo, useRef, useState, useLayoutEffect } from "react";
import { Canvas, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Html } from "@react-three/drei";
import * as THREE from "three";
import { portraitUrl } from "./local";
import {
  heightAt,
  type World,
  type WorldObject,
  type CameraView,
} from "../shared/world";
const palette = ["#6b8559", "#987650", "#8a9290", "#b3a385"];
function Terrain({
  world,
  onGround,
  painting,
  radius,
  onStroke,
}: {
  world: World;
  onGround: (x: number, z: number) => void;
  painting: boolean;
  radius: number;
  onStroke: (points: { x: number; z: number }[]) => void;
}) {
  const stroke = useRef<{ x: number; z: number }[]>([]);
  const [hover, setHover] = useState<{ x: number; z: number } | null>(null);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(256, 256, 64, 64);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const colors = [];
    for (let i = 0; i < p.count; i++) {
      p.setY(i, world.heights[i]);
      const c = new THREE.Color(palette[world.paint[i]]);
      colors.push(c.r, c.g, c.b);
    }
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    return g;
  }, [world.heights, world.paint]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <>
      <mesh
        geometry={geometry}
        receiveShadow
        onPointerDown={(e) => {
          if (!painting) return;
          e.stopPropagation();
          (e.target as any).setPointerCapture(e.pointerId);
          stroke.current = [{ x: e.point.x, z: e.point.z }];
        }}
        onPointerMove={(e) => {
          if (!painting) return;
          e.stopPropagation();
          const point = { x: e.point.x, z: e.point.z };
          setHover(point);
          const last = stroke.current.at(-1);
          if (
            last &&
            stroke.current.length < 200 &&
            Math.hypot(last.x - point.x, last.z - point.z) >
              Math.max(1, radius / 3)
          )
            stroke.current.push(point);
        }}
        onPointerUp={(e) => {
          if (!painting || !stroke.current.length) return;
          e.stopPropagation();
          (e.target as any).releasePointerCapture(e.pointerId);
          onStroke(stroke.current);
          stroke.current = [];
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (!painting) onGround(e.point.x, e.point.z);
        }}
      >
        <meshStandardMaterial vertexColors roughness={1} flatShading />
      </mesh>
      {painting && hover && (
        <mesh
          position={[
            hover.x,
            heightAt(world, hover.x, hover.z) + 0.25,
            hover.z,
          ]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <ringGeometry args={[radius - 0.15, radius, 64]} />
          <meshBasicMaterial
            color="#fff2ba"
            depthTest={false}
            transparent
            opacity={0.8}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}
    </>
  );
}
function Box({
  position,
  scale,
  color,
}: {
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
}) {
  return (
    <mesh position={position} scale={scale} castShadow receiveShadow>
      <boxGeometry />
      <meshStandardMaterial color={color} roughness={0.9} />
    </mesh>
  );
}
export function Model({ o }: { o: WorldObject }) {
  const c = o.color;
  switch (o.asset) {
    case "tree":
      return (
        <>
          <mesh position={[0, 2, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.5, 4, 6]} />
            <meshStandardMaterial color="#71533c" />
          </mesh>
          {[3, 5].map((y, i) => (
            <mesh key={y} position={[0, y, 0]} castShadow>
              <coneGeometry args={[3 - i * 0.6, 4, 7]} />
              <meshStandardMaterial color={c} />
            </mesh>
          ))}
        </>
      );
    case "npc":
      return (
        <>
          <mesh position={[0, 1.1, 0]} castShadow>
            <coneGeometry args={[0.65, 1.5, 6]} />
            <meshStandardMaterial color={c} />
          </mesh>
          <mesh position={[0, 2.05, 0]} castShadow>
            <icosahedronGeometry args={[0.43, 1]} />
            <meshStandardMaterial color="#d9b28e" />
          </mesh>
          <mesh position={[0, 2.3, 0]}>
            <coneGeometry args={[0.5, 0.4, 6]} />
            <meshStandardMaterial color="#4a3936" />
          </mesh>
        </>
      );
    case "marker":
      return (
        <>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[1.5, 1.5, 0.35, 24]} />
            <meshStandardMaterial color={c} />
          </mesh>
          <Html center position={[0, 3.5, 0]}>
            <div className="portrait">
              {o.portrait ? (
                <img src={portraitUrl(o.portrait!)} />
              ) : (
                <span>✦</span>
              )}
              <b>{o.name}</b>
            </div>
          </Html>
        </>
      );
    case "dock":
      return (
        <>
          <Box position={[0, 0.8, 0]} scale={[9, 0.5, 5]} color="#96704c" />
          {[-3, 3].flatMap((x) =>
            [-2, 2].map((z) => (
              <Box
                key={x + "," + z}
                position={[x, -0.2, z]}
                scale={[0.45, 3, 0.45]}
                color="#674b35"
              />
            )),
          )}
        </>
      );
    case "fence":
      return (
        <>
          <Box position={[0, 1, 0]} scale={[6, 0.25, 0.25]} color={c} />
          {[-3, 0, 3].map((x) => (
            <Box key={x} position={[x, 1, 0]} scale={[0.3, 2, 0.3]} color={c} />
          ))}
        </>
      );
    case "crate":
      return <Box position={[0, 0.8, 0]} scale={[1.6, 1.6, 1.6]} color={c} />;
    case "lantern":
      return (
        <>
          <Box position={[0, 1.8, 0]} scale={[0.2, 3.6, 0.2]} color="#544638" />
          <mesh position={[0, 3.6, 0]}>
            <icosahedronGeometry args={[0.5, 0]} />
            <meshStandardMaterial
              color="#ffd18b"
              emissive="#d58534"
              emissiveIntensity={0.6}
            />
          </mesh>
        </>
      );
    default: {
      const tower = o.asset === "tower",
        tavern = o.asset === "tavern",
        width = tavern ? 11 : tower ? 5 : 7,
        h = tower ? 12 : 5;
      return (
        <>
          <Box
            position={[0, 0.4, 0]}
            scale={[width + 1, 0.8, 7]}
            color="#86877b"
          />
          <Box position={[0, h / 2 + 0.8, 0]} scale={[width, h, 6]} color={c} />
          <mesh
            position={[0, h + 2, 0]}
            rotation={[0, Math.PI / 4, 0]}
            scale={[width / 1.4, 1, 4.5]}
            castShadow
          >
            <coneGeometry args={[1, 3, 4]} />
            <meshStandardMaterial color={tower ? "#687c81" : "#78524a"} />
          </mesh>
          <Box
            position={[0, 1.9, 3.05]}
            scale={[1.4, 2.6, 0.15]}
            color="#4a4234"
          />
          {[-width / 3, width / 3].map((x) => (
            <Box
              key={x}
              position={[x, 3.7, 3.06]}
              scale={[1, 1.1, 0.15]}
              color="#edcb7c"
            />
          ))}
        </>
      );
    }
  }
}
function Trees({
  world,
  onSelect,
}: {
  world: World;
  onSelect: (id: string) => void;
}) {
  const trees = world.objects.filter((o) => o.asset === "tree");
  const trunk = useRef<THREE.InstancedMesh>(null),
    lower = useRef<THREE.InstancedMesh>(null),
    upper = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      scale = new THREE.Vector3(1, 1, 1);
    trees.forEach((o, i) => {
      const y = heightAt(world, o.x, o.z);
      for (const [ref, offset] of [
        [trunk, 2],
        [lower, 3],
        [upper, 5],
      ] as const) {
        matrix.compose(new THREE.Vector3(o.x, y + offset, o.z), q, scale);
        ref.current?.setMatrixAt(i, matrix);
        if (ref !== trunk) ref.current?.setColorAt(i, new THREE.Color(o.color));
      }
    });
    for (const ref of [trunk, lower, upper]) {
      if (ref.current) {
        ref.current.instanceMatrix.needsUpdate = true;
        if (ref.current.instanceColor)
          ref.current.instanceColor.needsUpdate = true;
        ref.current.computeBoundingSphere();
      }
    }
  }, [world]);
  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.instanceId !== undefined) onSelect(trees[e.instanceId].id);
  };
  return (
    <group>
      <instancedMesh
        ref={trunk}
        args={[undefined, undefined, trees.length]}
        castShadow
        onClick={click}
      >
        <cylinderGeometry args={[0.3, 0.5, 4, 6]} />
        <meshStandardMaterial color="#71533c" />
      </instancedMesh>
      <instancedMesh
        ref={lower}
        args={[undefined, undefined, trees.length]}
        castShadow
        onClick={click}
      >
        <coneGeometry args={[3, 4, 7]} />
        <meshStandardMaterial />
      </instancedMesh>
      <instancedMesh
        ref={upper}
        args={[undefined, undefined, trees.length]}
        castShadow
        onClick={click}
      >
        <coneGeometry args={[2.4, 4, 7]} />
        <meshStandardMaterial />
      </instancedMesh>
    </group>
  );
}
function Camera({
  world,
  painting,
  onView,
}: {
  world: World;
  painting: boolean;
  onView: (view: CameraView) => void;
}) {
  const ref = useRef<any>(null);
  const focus = world.locations.find((l) => l.id === world.focus);
  useEffect(() => {
    if (ref.current && focus) {
      const y = heightAt(world, focus.x, focus.z);
      if (focus.view) {
        ref.current.target.fromArray(focus.view.target);
        ref.current.object.position.fromArray(focus.view.position);
      } else {
        ref.current.target.set(focus.x, y, focus.z);
        ref.current.object.position.set(focus.x + 42, y + 42, focus.z + 48);
      }
      ref.current.update();
    }
  }, [world.focus, world.focusVersion, focus?.x, focus?.z]);
  return (
    <OrbitControls
      onChange={() => {
        if (ref.current)
          onView({
            position: ref.current.object.position.toArray(),
            target: ref.current.target.toArray(),
          });
      }}
      enabled={!painting}
      ref={ref}
      makeDefault
      minDistance={10}
      maxDistance={220}
      maxPolarAngle={Math.PI * 0.47}
      enableDamping
    />
  );
}
export function Scene({
  world,
  selected,
  onSelect,
  onGround,
  preview,
  painting,
  radius,
  onStroke,
  onView,
}: {
  world: World;
  selected: string | null;
  onSelect: (id: string) => void;
  onGround: (x: number, z: number) => void;
  preview: World | null;
  painting: boolean;
  radius: number;
  onView: (view: CameraView) => void;
  onStroke: (points: { x: number; z: number }[]) => void;
}) {
  const shown = preview || world;
  return (
    <Canvas
      frameloop="demand"
      shadows
      dpr={[1, 1.5]}
      camera={{ position: [52, 50, 60], fov: 48 }}
      gl={{ antialias: true }}
    >
      <color attach="background" args={["#cbd9d2"]} />
      <fog attach="fog" args={["#cbd9d2", 120, 320]} />
      <ambientLight intensity={1.2} />
      <hemisphereLight args={["#e8edda", "#58674f", 1.3]} />
      <directionalLight
        position={[35, 70, 25]}
        intensity={2.2}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-100}
        shadow-camera-right={100}
        shadow-camera-top={100}
        shadow-camera-bottom={-100}
        shadow-camera-far={200}
      />
      <Terrain
        world={shown}
        onGround={onGround}
        painting={painting && !preview}
        radius={radius}
        onStroke={onStroke}
      />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.3, 0]}>
        <planeGeometry args={[256, 256]} />
        <meshStandardMaterial
          color="#6dabb0"
          roughness={0.3}
          transparent
          opacity={0.85}
        />
      </mesh>
      <Trees world={shown} onSelect={onSelect} />
      {shown.objects
        .filter((o) => o.asset !== "tree")
        .map((o) => (
          <group
            key={o.id}
            position={[
              o.x,
              o.asset === "dock" ? 0 : heightAt(shown, o.x, o.z),
              o.z,
            ]}
            rotation={[0, o.rotation, 0]}
            onClick={(e: ThreeEvent<MouseEvent>) => {
              e.stopPropagation();
              onSelect(o.id);
            }}
          >
            <Model o={o} />
            {selected === o.id && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.15, 0]}>
                <ringGeometry args={[4.8, 5, 48]} />
                <meshBasicMaterial color="#f5d38b" side={THREE.DoubleSide} />
              </mesh>
            )}
          </group>
        ))}
      {shown.objects
        .filter((o) => o.asset === "tree" && o.id === selected)
        .map((o) => (
          <mesh
            key={o.id}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[o.x, heightAt(shown, o.x, o.z) + 0.15, o.z]}
          >
            <ringGeometry args={[4.8, 5, 48]} />
            <meshBasicMaterial color="#f5d38b" side={THREE.DoubleSide} />
          </mesh>
        ))}
      <Camera world={world} onView={onView} painting={painting && !preview} />
    </Canvas>
  );
}

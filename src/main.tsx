import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import { Scene } from "./Scene";
import {
  applyPatch,
  assets,
  heightAt,
  type World,
  type WorldObject,
  type CameraView,
  type BrushMode,
  type Point,
  type Patch,
  worldSchema,
} from "../shared/world";
import "./style.css";
import { housesAlongRoad } from "../shared/roads";
import { standalone, LocalSession, clientFetch } from "./local";
const token = standalone
  ? "local"
  : new URLSearchParams(location.hash.slice(1)).get("dm") || "";
const labels: Record<string, string> = {
  cottage: "Cottage",
  tavern: "Tavern",
  tower: "Harbor tower",
  tree: "Alder tree",
  dock: "Timber dock",
  fence: "Fence",
  crate: "Crates",
  lantern: "Lantern",
  npc: "Townsperson",
  marker: "Player portrait",
};
const icons: Record<string, string> = {
  cottage: "⌂",
  tavern: "♜",
  tower: "♖",
  tree: "♠",
  dock: "▤",
  fence: "╫",
  crate: "▣",
  lantern: "✧",
  npc: "♟",
  marker: "◉",
};
function download(name: string, data: unknown) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function App() {
  const [world, setWorld] = useState<World | null>(null),
    [connected, setConnected] = useState(false),
    [status, setStatus] = useState("Connecting…"),
    [tab, setTab] = useState("build"),
    [tool, setTool] = useState("select"),
    [radius, setRadius] = useState(12),
    [selected, setSelected] = useState<string | null>(null),
    [place, setPlace] = useState<string | null>(null),
    [modal, setModal] = useState(""),
    [patchText, setPatchText] = useState(""),
    [patch, setPatch] = useState<Patch | null>(null),
    [preview, setPreview] = useState<World | null>(null),
    [qr, setQr] = useState(""),
    [join, setJoin] = useState(""),
    [point, setPoint] = useState({ x: 0, z: 0 }),
    [undo, setUndo] = useState(false),
    [redo, setRedo] = useState(false);
  const [selectedRoad, setSelectedRoad] = useState<string | null>(null);
  const [houseSpacing, setHouseSpacing] = useState(18);
  const view = useRef<CameraView | null>(null);
  const local = useRef<LocalSession | null>(null);
  const ws = useRef<WebSocket | null>(null),
    latest = useRef(world),
    pending = useRef(false);
  latest.current = world;
  useEffect(() => {
    if (standalone) {
      try {
        local.current = new LocalSession((m) => {
          if (m.type === "world") {
            setWorld(m.world);
            setUndo(m.undo);
            setRedo(m.redo);
          }
          if (m.type === "saved") setStatus("Saved in this browser");
          if (m.type === "error") setStatus(m.message);
        });
        setConnected(true);
        setStatus("Saved in this browser · export backups regularly");
      } catch (e: any) {
        setStatus(
          "Could not open browser save: " +
            e.message +
            ". Your saved data has not been overwritten.",
        );
      }
      return () => local.current?.close();
    }
    let done = false,
      t: ReturnType<typeof setTimeout>;
    function connect() {
      const s = new WebSocket(
        `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}`,
      );
      ws.current = s;
      s.onopen = () => {
        setConnected(true);
        setStatus("All changes saved");
      };
      s.onmessage = (e) => {
        const m = JSON.parse(e.data);
        if (m.type === "world") {
          setWorld(m.world);
          setUndo(!!m.undo);
          setRedo(!!m.redo);
        }
        if (m.type === "error") {
          pending.current = false;
          setStatus(m.message);
        }
        if (m.type === "saved") {
          pending.current = false;
          setStatus("All changes saved");
        }
      };
      s.onclose = () => {
        pending.current = false;
        setConnected(false);
        setStatus("Disconnected · retrying");
        if (!done) t = setTimeout(connect, 1500);
      };
    }
    connect();
    return () => {
      done = true;
      clearTimeout(t);
      ws.current?.close();
    };
  }, []);
  function send(type: string, body: Record<string, unknown> = {}) {
    if (!token) return;
    if (standalone) {
      local.current?.send(type, body);
      return;
    }
    if (!connected || pending.current) {
      setStatus("Wait for the current edit to save.");
      return;
    }
    pending.current = true;
    setStatus("Saving…");
    ws.current?.send(
      JSON.stringify({
        type,
        token,
        baseRevision: latest.current!.revision,
        ...body,
      }),
    );
  }
  function operations(ops: Patch["operations"]) {
    if (world)
      send("patch", {
        patch: {
          worldId: world.id,
          baseRevision: world.revision,
          operations: ops,
        },
      });
  }
  function finishStroke(points: Point[]) {
    if (!world || !points.length) return;
    if (tool === "road") {
      const id =
        "road-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
      operations([
        {
          type: "road",
          road: { id, name: `Road ${world.roads.length + 1}`, points, radius },
        },
      ]);
      setSelectedRoad(id);
    } else
      operations(
        points.map((p) => ({
          type: "brush",
          mode: tool as BrushMode,
          ...p,
          radius,
          strength: 1.5,
        })),
      );
  }
  function populateRoad() {
    if (!world) return;
    const road =
      world.roads.find((r) => r.id === selectedRoad) || world.roads.at(-1);
    if (!road) return;
    const houses = housesAlongRoad(world, road, houseSpacing);
    if (!houses.length) {
      setStatus(
        "No clear building lots here. Try a longer road on flatter, drier, open ground.",
      );
      return;
    }
    operations(houses.map((object) => ({ type: "add", object })));
  }
  function add(asset: string, x: number, z: number, count = 1) {
    const colors = ["#b27f65", "#709a8a", "#c4a65f", "#8c7aa3", "#6d8aab"];
    const additions = Array.from({ length: count }, (_, i) => ({
      type: "add" as const,
      object: {
        id:
          crypto.randomUUID?.() ||
          `obj-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        asset: asset as WorldObject["asset"],
        name:
          asset === "npc"
            ? `${["Elin", "Bram", "Nessa", "Orin", "Willa", "Tobin", "Mira", "Alden"][Math.floor(Math.random() * 8)]} ${["Reed", "Moss", "Vale", "Thorn", "Brook", "Ash"][Math.floor(Math.random() * 6)]}`
            : labels[asset],
        x: Math.max(-125, Math.min(125, x + (count > 1 ? (i % 3) * 3 - 3 : 0))),
        z: Math.max(
          -125,
          Math.min(125, z + (count > 1 ? Math.floor(i / 3) * 3 : 0)),
        ),
        rotation: asset === "npc" ? Math.random() * 6 : 0,
        color: colors[Math.floor(Math.random() * colors.length)],
      },
    }));
    operations(additions);
    if (count === 1) setSelected(additions[0].object.id);
  }
  function ground(x: number, z: number) {
    if (preview) return;
    setPoint({ x, z });
    if (!token) return;
    if (place) {
      if (place === "move" && selected)
        operations([{ type: "update", id: selected, changes: { x, z } }]);
      else
        add(place === "crowd" ? "npc" : place, x, z, place === "crowd" ? 5 : 1);
      setPlace(null);
    } else if (tool !== "select")
      operations([
        { type: "brush", mode: tool as any, x, z, radius, strength: 1.5 },
      ]);
    else setSelected(null);
  }
  async function share() {
    setModal(standalone ? "local-share" : "share");
    if (standalone) return;
    try {
      const r = await fetch("/api/session", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!r.ok) throw Error("DM access required");
      const s = await r.json();
      const url = s.addresses[0] || location.origin + "/";
      setJoin(url);
      setQr(
        await QRCode.toDataURL(url, {
          margin: 2,
          width: 240,
          color: { dark: "#203c32", light: "#ffffff" },
        }),
      );
    } catch (e: any) {
      setStatus(e.message);
    }
  }
  function validate() {
    try {
      if (!world) return;
      const p = JSON.parse(patchText);
      const next = applyPatch(world, p);
      setPatch(p);
      setPreview(next);
      setStatus("Preview ready · review the world before applying");
    } catch (e: any) {
      setStatus(e.message);
      setPreview(null);
      setPatch(null);
    }
  }
  if (!world)
    return (
      <div className="loading">
        <span>✦</span>
        <h1>Opening your world</h1>
        <p>{status}</p>
      </div>
    );
  const object = world.objects.find((o) => o.id === selected);
  const focus = world.locations.find((l) => l.id === world.focus);
  const dismiss = () => {
    setModal("");
    setPatch(null);
    setPreview(null);
  };
  return (
    <div className="app">
      <header>
        <a className="brand" href={location.pathname + location.hash}>
          <span className="brand-mark">✦</span>
          <div>
            HEARTH<small>A world worth gathering in</small>
          </div>
        </a>
        <div className="world-title">
          {world.name}
          <span>FANTASY WORLD · {token ? "DM WORKSPACE" : "PLAYER VIEW"}</span>
        </div>
        <div className="header-actions">
          <span className={"connection " + (!connected ? "offline" : "")}>
            {standalone
              ? "Browser workspace"
              : connected
                ? "Live session"
                : "Reconnecting"}
          </span>
          {token && (
            <button className="primary" onClick={share}>
              {standalone ? "Sharing options" : "Invite players ↗"}
            </button>
          )}
        </div>
      </header>
      <div className="workspace">
        {token && (
          <aside className="sidebar">
            <div className="sidebar-top">
              <span className="eyebrow">YOUR WORLD, TAKING SHAPE</span>
              <h1>
                Make room
                <br />
                for adventure.
              </h1>
              <p>
                A riverside village. A chance encounter.
                <br />
                Your next story starts here.
              </p>
            </div>
            <nav>
              {[
                ["build", "Build"],
                ["terrain", "Terrain"],
                ["locations", "Locations"],
              ].map(([id, name]) => (
                <button
                  className={tab === id ? "active" : ""}
                  key={id}
                  onClick={() => {
                    setTab(id);
                    setTool("select");
                    setPlace(null);
                  }}
                >
                  {name}
                </button>
              ))}
            </nav>
            {tab === "build" && (
              <>
                <div className="section-heading">
                  <h3>The essentials</h3>
                  <span>CLICK TO PLACE</span>
                </div>
                <div className="asset-grid">
                  {assets.map((asset) => (
                    <button
                      className={"asset " + (place === asset ? "chosen" : "")}
                      key={asset}
                      onClick={() => {
                        setPlace(asset);
                        setTool("select");
                      }}
                    >
                      <span className={"asset-icon " + asset}>
                        {icons[asset]}
                      </span>
                      <b>{labels[asset]}</b>
                      <small>
                        {asset === "npc"
                          ? "Random appearance"
                          : asset === "marker"
                            ? "Add your party"
                            : "Place in world"}
                      </small>
                    </button>
                  ))}
                </div>
                <button
                  className="crowd"
                  onClick={() => {
                    setPlace("crowd");
                    setTool("select");
                  }}
                >
                  ♟{" "}
                  <span>
                    <b>A little more life</b>
                    <small>Drop in 5 random townsfolk</small>
                  </span>
                  ＋
                </button>
              </>
            )}
            {tab === "terrain" && (
              <div className="tool-panel">
                <h3>Shape the landscape</h3>
                <p>
                  Choose a brush, then drag across the ground. Switch to Select
                  to orbit the camera.
                </p>
                <div className="brushes">
                  {[
                    "raise",
                    "lower",
                    "smooth",
                    "flatten",
                    "grass",
                    "dirt",
                    "stone",
                    "road",
                  ].map((t) => (
                    <button
                      key={t}
                      className={tool === t ? "active" : ""}
                      onClick={() => {
                        setTool(t);
                        if (t === "road") setRadius(4);
                      }}
                    >
                      {t === "road" ? "〰 " : ""}
                      {t}
                    </button>
                  ))}
                </div>
                <label>
                  Brush radius <b>{radius} m</b>
                  <input
                    type="range"
                    min="4"
                    max="40"
                    value={radius}
                    onChange={(e) => setRadius(+e.target.value)}
                  />
                </label>
                {tool === "road" && (
                  <section className="road-builder">
                    <h3>Turn a road into a neighborhood</h3>
                    <p>
                      Your road appears as you draw. Release to save; Escape
                      cancels.
                    </p>
                    <label>
                      Choose a road
                      <select
                        aria-label="Road to populate"
                        value={
                          world.roads.some((r) => r.id === selectedRoad)
                            ? selectedRoad!
                            : world.roads.at(-1)?.id || ""
                        }
                        onChange={(e) => setSelectedRoad(e.target.value)}
                      >
                        {!world.roads.length && (
                          <option value="">Draw a road first</option>
                        )}
                        {world.roads.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      House spacing <b>{houseSpacing} m</b>
                      <input
                        aria-label="House spacing"
                        type="range"
                        min="12"
                        max="40"
                        value={houseSpacing}
                        onChange={(e) => setHouseSpacing(+e.target.value)}
                      />
                    </label>
                    <button
                      className="primary wide"
                      disabled={
                        !world.roads.length ||
                        !connected ||
                        pending.current ||
                        !!preview
                      }
                      onClick={populateRoad}
                    >
                      ⌂ Add houses along road
                    </button>
                    <p>
                      Places up to 24 cottages on both sides, facing the road.
                      Skips water, slopes, roads, and occupied lots. Undo
                      removes the whole batch.
                    </p>
                  </section>
                )}
                <p>
                  Water sits at −1.3 m. Lower terrain to reveal it. Flatten
                  ground before placing buildings on a slope.
                </p>
              </div>
            )}
            {tab === "locations" && (
              <div className="tool-panel">
                <h3>Bring everyone along</h3>
                <p>
                  Show a location to the table. Players can rotate and zoom
                  independently.
                </p>
                {world.locations.map((l) => (
                  <div className="location" key={l.id}>
                    <span>⌖</span>
                    <b>{l.name}</b>
                    <button onClick={() => send("focus", { id: l.id })}>
                      {world.focus === l.id ? "Live" : "Show"}
                    </button>
                  </div>
                ))}
                <button
                  className="wide"
                  onClick={() => {
                    const name = prompt("Name this camera view");
                    if (name)
                      send("location", {
                        location: {
                          id: "loc-" + Date.now(),
                          name,
                          x: Math.max(
                            -128,
                            Math.min(128, view.current?.target[0] ?? point.x),
                          ),
                          z: Math.max(
                            -128,
                            Math.min(128, view.current?.target[2] ?? point.z),
                          ),
                          ...(view.current ? { view: view.current } : {}),
                        },
                      });
                  }}
                >
                  ＋ Save current camera view
                </button>
              </div>
            )}
            <div className="sidebar-bottom">
              <button
                onClick={() => {
                  setModal("ai");
                  setPreview(null);
                }}
              >
                ✧ Build with a little help <span>↗</span>
              </button>
              <small>Import ideas. Make them your own.</small>
            </div>
          </aside>
        )}
        <main>
          <div className="scene">
            <Scene
              movable={
                !!token &&
                !place &&
                tool === "select" &&
                !preview &&
                connected &&
                !pending.current
              }
              onMove={(id, x, z) =>
                operations([{ type: "update", id, changes: { x, z } }])
              }
              onView={(v) => {
                view.current = v;
              }}
              painting={
                !!token && tool !== "select" && connected && !pending.current
              }
              radius={radius}
              brushMode={tool === "select" ? "grass" : (tool as BrushMode)}
              onStroke={finishStroke}
              world={world}
              selected={selected}
              onSelect={(id) => {
                if (token && !preview) {
                  if (place && place !== "move") {
                    const o = world.objects.find((o) => o.id === id)!;
                    ground(o.x, o.z);
                  } else setSelected(id);
                }
              }}
              onGround={ground}
              preview={preview}
            />
          </div>
          <div className="scene-heading">
            <span className="eyebrow">
              {preview ? "PATCH PREVIEW" : "EXPLORING BLACKWATER"}
            </span>
            <h2>{focus?.name || world.name}</h2>
            <span className="location-badge">
              ⌖ {world.objects.length} world objects
            </span>
          </div>
          <div className="scene-tools">
            {token && (
              <>
                <button
                  aria-label="Select objects"
                  title="Select objects"
                  className={tool === "select" && !place ? "active" : ""}
                  onClick={() => {
                    setTool("select");
                    setPlace(null);
                  }}
                >
                  ↖
                </button>
                <button
                  aria-label="Undo"
                  title="Undo"
                  disabled={!undo}
                  onClick={() => send("undo")}
                >
                  ↶
                </button>
                <button
                  aria-label="Redo"
                  title="Redo"
                  disabled={!redo}
                  onClick={() => send("redo")}
                >
                  ↷
                </button>
                <i />
                <button
                  aria-label="Export world and portraits"
                  title="Export world and portraits"
                  onClick={async () => {
                    try {
                      const portraits: Record<string, string> = {};
                      for (const o of world.objects)
                        if (o.portrait && !portraits[o.portrait]) {
                          const r = await clientFetch(
                            "/portraits/" + o.portrait,
                          );
                          if (!r.ok)
                            throw Error("Portrait could not be exported");
                          portraits[o.portrait] = await new Promise<string>(
                            (resolve) => {
                              const reader = new FileReader();
                              reader.onload = () =>
                                resolve(reader.result as string);
                              r.blob().then((b) => reader.readAsDataURL(b));
                            },
                          );
                        }
                      download("hearth-world.json", { world, portraits });
                    } catch (e: any) {
                      setStatus(e.message);
                    }
                  }}
                >
                  ⇩
                </button>
                <button
                  aria-label="Import world"
                  title="Import world"
                  onClick={() => setModal("world")}
                >
                  ⇧
                </button>
              </>
            )}
          </div>
          {place && (
            <div className="mode-banner">
              {place === "move"
                ? "Click ground to move selection"
                : `Click ground to place ${place === "crowd" ? "5 townsfolk" : labels[place]}`}
              <button onClick={() => setPlace(null)}>Cancel ×</button>
            </div>
          )}
          {tool !== "select" && (
            <div className="mode-banner">
              {tool.toUpperCase()} BRUSH · {radius} m
              <button onClick={() => setTool("select")}>Done</button>
            </div>
          )}
          {object && token && (
            <div className="inspector">
              <div className="section-heading">
                <span className="eyebrow">SELECTED OBJECT</span>
                <button onClick={() => setSelected(null)}>×</button>
              </div>
              <input
                aria-label="Object name"
                key={object.id + object.name}
                defaultValue={object.name}
                onBlur={(e) => {
                  if (e.target.value !== object.name)
                    operations([
                      {
                        type: "update",
                        id: object.id,
                        changes: { name: e.target.value },
                      },
                    ]);
                }}
              />
              <code>{object.id}</code>
              <div className="position-fields">
                {(["x", "z"] as const).map((axis) => (
                  <label key={axis}>
                    {axis.toUpperCase()} (m)
                    <input
                      aria-label={`${axis.toUpperCase()} position`}
                      key={object.id + object[axis]}
                      type="number"
                      min={-128}
                      max={128}
                      step="0.1"
                      defaultValue={object[axis].toFixed(2)}
                      onBlur={(e) => {
                        const n = Number(e.currentTarget.value);
                        if (
                          e.currentTarget.value !== "" &&
                          Number.isFinite(n) &&
                          n >= -128 &&
                          n <= 128
                        ) {
                          if (Math.abs(n - object[axis]) > 0.005)
                            operations([
                              {
                                type: "update",
                                id: object.id,
                                changes: { [axis]: n },
                              },
                            ]);
                        } else {
                          e.currentTarget.value = object[axis].toFixed(2);
                          setStatus(
                            "Position must be between −128 and 128 meters.",
                          );
                        }
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="inspector-actions">
                <button
                  onClick={() => {
                    setPlace("move");
                    setTool("select");
                  }}
                >
                  Move
                </button>
                <button
                  onClick={() =>
                    operations([
                      {
                        type: "update",
                        id: object.id,
                        changes: { rotation: object.rotation + Math.PI / 4 },
                      },
                    ])
                  }
                >
                  Rotate 45°
                </button>
                <button
                  onClick={() =>
                    operations([
                      {
                        type: "add",
                        object: {
                          ...object,
                          id: "copy-" + Date.now(),
                          x: Math.min(128, object.x + 5),
                        },
                      },
                    ])
                  }
                >
                  Duplicate
                </button>
                <button
                  className="danger"
                  onClick={() => {
                    operations([{ type: "remove", id: object.id }]);
                    setSelected(null);
                  }}
                >
                  Delete
                </button>
              </div>
              <label>
                Color{" "}
                <input
                  type="color"
                  value={object.color}
                  onChange={(e) =>
                    operations([
                      {
                        type: "update",
                        id: object.id,
                        changes: { color: e.target.value },
                      },
                    ])
                  }
                />
              </label>
              {Math.abs(
                heightAt(world, object.x + 3, object.z) -
                  heightAt(world, object.x - 3, object.z),
              ) > 1 && (
                <p className="warning">
                  Uneven ground. Use the flatten brush around this building.
                </p>
              )}
              {object.asset === "marker" && (
                <label className="upload">
                  Upload portrait
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      try {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        const bitmap = await createImageBitmap(f);
                        const canvas = document.createElement("canvas");
                        canvas.width = canvas.height = 256;
                        const ctx = canvas.getContext("2d")!;
                        const side = Math.min(bitmap.width, bitmap.height);
                        ctx.drawImage(
                          bitmap,
                          (bitmap.width - side) / 2,
                          (bitmap.height - side) / 2,
                          side,
                          side,
                          0,
                          0,
                          256,
                          256,
                        );
                        bitmap.close();
                        const blob = await new Promise<Blob | null>((r) =>
                          canvas.toBlob(r, "image/png"),
                        );
                        const r = await clientFetch("/api/portrait", {
                          method: "POST",
                          headers: {
                            Authorization: `Bearer ${token}`,
                            "Content-Type": "image/png",
                          },
                          body: blob,
                        });
                        if (!r.ok) throw Error("Portrait upload failed");
                        const { name } = await r.json();
                        operations([
                          {
                            type: "update",
                            id: object.id,
                            changes: { portrait: name },
                          },
                        ]);
                      } catch (e: any) {
                        setStatus(e.message);
                      }
                    }}
                  />
                </label>
              )}
            </div>
          )}
          <div className="scene-footer">
            <span>
              ◉{" "}
              {token
                ? "Drag objects to move · Drag ground to orbit"
                : "Drag to orbit · Pinch to zoom"}
            </span>
            <span>LOW-POLY · HIGH POSSIBILITY</span>
          </div>
          <div className="compass">
            N<span>✥</span>S
          </div>
        </main>
      </div>
      <footer>
        <span className="save-state">
          {connected ? "●" : "○"} {status}
        </span>
        <span>
          {world.name} <b> / </b> Revision {world.revision}
        </span>
        <span>Made for the stories around your table.</span>
      </footer>
      {preview && !modal && (
        <div className="preview-review">
          <b>Previewing imported changes</b>
          <button onClick={() => setModal("ai")}>Review & apply</button>
          <button onClick={dismiss}>Cancel</button>
        </div>
      )}
      {modal && (
        <div className="modal-backdrop">
          <section className="modal">
            <button className="close" onClick={dismiss}>
              ×
            </button>
            {modal === "local-share" ? (
              <>
                <span className="eyebrow">YOUR WORLD, ANYWHERE</span>
                <h2>Share a snapshot.</h2>
                <p>
                  This GitHub Pages version saves on this device. Export your
                  world with the toolbar download button, then send that file to
                  someone to import into their own copy.
                </p>
                <p>
                  Live phone sessions remain available when running the Node
                  server locally. Shared online hosting will come later.
                </p>
                <p>
                  Export backups regularly: clearing browser data removes local
                  worlds and portraits.
                </p>
              </>
            ) : modal === "share" ? (
              <>
                <span className="eyebrow">GATHER YOUR PARTY</span>
                <h2>A window into your world.</h2>
                <p>
                  Connect phones to the same Wi-Fi, then scan to join. This link
                  grants viewing access only.
                </p>
                {qr && <img className="qr" src={qr} />}
                <input readOnly value={join} />
                <p className="muted">
                  Keep the DM link private. Leave this laptop running during
                  your session.
                </p>
              </>
            ) : modal === "ai" ? (
              <>
                <span className="eyebrow">A LITTLE CREATIVE HELP</span>
                <h2>Build the next chapter.</h2>
                <p>
                  Export context and share it in your AI chat. Ask for a scene
                  patch, paste the JSON below, then preview it.
                </p>
                <button
                  onClick={() =>
                    download("hearth-context.json", {
                      instructions:
                        "Return a scene patch matching docs/PATCHES.md. Coordinates are meters; y is terrain height. Keep worldId and baseRevision unchanged.",
                      world,
                      assets,
                    })
                  }
                >
                  ⇩ Export world context
                </button>
                <textarea
                  placeholder='{"worldId":"blackwater-crossing","baseRevision":0,"operations":[…]}'
                  value={patchText}
                  onChange={(e) => {
                    setPatchText(e.target.value);
                    setPreview(null);
                    setPatch(null);
                  }}
                />
                <div className="modal-actions">
                  <button onClick={validate}>Preview changes</button>
                  <button disabled={!preview} onClick={() => setModal("")}>
                    Inspect world
                  </button>
                  <button
                    className="primary"
                    disabled={!patch}
                    onClick={() => {
                      send("patch", { patch });
                      dismiss();
                    }}
                  >
                    Apply as one edit
                  </button>
                  <button onClick={dismiss}>Cancel</button>
                </div>
                <p className="muted">
                  The world behind this panel shows your preview. Applying
                  validates the revision again.
                </p>
              </>
            ) : (
              <>
                <h2>Restore a world</h2>
                <p>
                  Import a Hearth world export. Replaces this world as one
                  undoable edit.
                </p>
                <input
                  type="file"
                  accept="application/json"
                  onChange={async (e) => {
                    try {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      const parsed = JSON.parse(await f.text());
                      const next = worldSchema.parse(parsed.world || parsed);
                      for (const o of next.objects)
                        if (o.portrait) {
                          const url = parsed.portraits?.[o.portrait];
                          if (!url || !/^data:image\/png;base64,/.test(url))
                            throw Error("Missing portrait in export");
                          const blob = await (await fetch(url)).blob();
                          const r = await clientFetch("/api/portrait", {
                            method: "POST",
                            headers: {
                              Authorization: `Bearer ${token}`,
                              "Content-Type": "image/png",
                            },
                            body: blob,
                          });
                          if (!r.ok) throw Error("Portrait restore failed");
                          o.portrait = (await r.json()).name;
                        }
                      send("replace", { world: next });
                      dismiss();
                    } catch (e: any) {
                      setStatus(e.message);
                    }
                  }}
                />
              </>
            )}
            <p className="modal-status">{status}</p>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

# Scene patch contract

Export world context from **Build with a little help**. It includes the current world, stable object/location IDs, revision, heights, paint and asset catalog. Ask an assistant to return JSON in the format below. Paste the JSON without Markdown fences, preview, then apply. Preview is local; application is a single undoable server transaction. Another edit makes an old patch stale. Export fresh context rather than changing its revision blindly.

```json
{
  "worldId": "blackwater-crossing",
  "baseRevision": 0,
  "operations": [
    {
      "type": "add",
      "object": {
        "id": "shrine-lantern-1",
        "asset": "lantern",
        "name": "Shrine light",
        "x": -20,
        "z": -25,
        "rotation": 0,
        "color": "#b9a27c"
      }
    },
    {
      "type": "update",
      "id": "tavern-1",
      "changes": { "name": "The Copper Kettle" }
    },
    {
      "type": "brush",
      "mode": "road",
      "x": -20,
      "z": -15,
      "radius": 6,
      "strength": 1
    }
  ]
}
```

`add` requires every object field shown above; `portrait` is optional and references an existing server PNG filename. `update` accepts any subset of object fields except ID. `remove` requires an existing object `id`. IDs must be unique across objects and locations. Never invent IDs for an update/remove; use the export.

Assets: `cottage`, `tavern`, `tower`, `tree`, `dock`, `fence`, `crate`, `lantern`, `npc`, `marker`. Coordinates are meters in [-128,128] for X and Z. Rotation is radians about Y. Color is a six-digit hex. Objects follow terrain; docks stay at river level. Terrain is 65×65 vertices, row-major Z then X, spacing 4 meters, heights [-12,32]. Paint values: grass 0, dirt 1, stone 2, road 3. Water is fixed at -1.3 meters.

Brush modes: `raise`, `lower`, `smooth`, `flatten`, `grass`, `dirt`, `stone`, `road`. Radius [2,40], strength [0.1,3]. Flatten uses the height at brush center. Use overlapping brush operations for a winding road. Max 500 operations, 2,000 objects, 100 locations per world. No code or external assets execute from imports.

## Saved roads

Use a `road` operation to paint a continuous road and preserve its centerline for house generation:

```json
{
  "type": "road",
  "road": {
    "id": "road-meadow",
    "name": "Meadow Lane",
    "points": [
      { "x": -60, "z": 0 },
      { "x": 60, "z": 0 }
    ],
    "radius": 4
  }
}
```

Points use the same X/Z bounds; radius is 2–40 m, with 1–400 points and at most 100 roads per world. Sparse points are interpolated when painting. Road IDs share the object/location ID namespace. The world’s `roads` array is included in context exports; older saves default to an empty array without changing their existing paint. The editor’s house action generates ordinary `add` object operations as one batch, so cottages remain independently editable afterward. The road brush defaults to radius 4 m.

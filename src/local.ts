import {
  applyPatch,
  locationSchema,
  starter,
  worldSchema,
  type World,
} from "../shared/world";
declare const __STANDALONE__: boolean;
export const standalone = __STANDALONE__;
const worldKey = "hearth-world-v1";
const portraitKey = (name: string) => "hearth-portrait-" + name;
export function portraitUrl(name: string) {
  return standalone
    ? localStorage.getItem(portraitKey(name)) || ""
    : "/portraits/" + name;
}
export async function clientFetch(
  path: string,
  options?: RequestInit,
): Promise<Response> {
  if (!standalone) return fetch(path, options);
  if (path.startsWith("/portraits/")) {
    const url = portraitUrl(path.slice(11));
    return url ? fetch(url) : new Response(null, { status: 404 });
  }
  if (path === "/api/portrait") {
    const body = options?.body;
    if (!(body instanceof Blob)) throw Error("Expected a portrait image");
    const value = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(Error("Could not read portrait"));
      r.readAsDataURL(body);
    });
    const name = crypto.randomUUID() + ".png";
    localStorage.setItem(portraitKey(name), value);
    return Response.json({ name });
  }
  throw Error("Live sessions require the local server.");
}
export class LocalSession {
  world: World;
  history: World[] = [];
  future: World[] = [];
  constructor(private receive: (message: any) => void) {
    const saved = localStorage.getItem(worldKey);
    this.world = saved ? worldSchema.parse(JSON.parse(saved)) : starter();
    this.publish();
    window.addEventListener("storage", this.onStorage);
  }
  onStorage = (e: StorageEvent) => {
    if (e.key === worldKey && e.newValue) {
      try {
        this.world = worldSchema.parse(JSON.parse(e.newValue));
        this.history = [];
        this.future = [];
        this.publish();
      } catch {
        this.receive({
          type: "error",
          message:
            "Another tab wrote an unreadable save. Your current world is preserved.",
        });
      }
    }
  };
  close() {
    window.removeEventListener("storage", this.onStorage);
  }
  publish() {
    this.receive({
      type: "world",
      world: this.world,
      undo: this.history.length > 0,
      redo: this.future.length > 0,
    });
  }
  send(type: string, body: Record<string, any>) {
    try {
      let next: World;
      if (type === "undo" || type === "redo") {
        const stack = type === "undo" ? this.history : this.future;
        if (!stack.length) throw Error("Nothing to " + type);
        next = structuredClone(stack.at(-1)!);
        next.revision = this.world.revision + 1;
      } else if (type === "patch") next = applyPatch(this.world, body.patch);
      else if (type === "replace") {
        next = worldSchema.parse(body.world);
        next.revision = this.world.revision + 1;
      } else if (type === "location") {
        next = structuredClone(this.world);
        next.locations.push(locationSchema.parse(body.location));
        next.revision++;
      } else if (type === "focus") {
        next = structuredClone(this.world);
        if (!next.locations.some((l) => l.id === body.id))
          throw Error("Location missing");
        next.focus = body.id;
        next.focusVersion++;
        next.revision++;
      } else throw Error("Unknown command");
      next = worldSchema.parse(next);
      localStorage.setItem(worldKey, JSON.stringify(next));
      if (type === "undo") {
        this.history.pop();
        this.future.push(this.world);
      } else if (type === "redo") {
        this.future.pop();
        this.history.push(this.world);
      } else {
        this.history.push(this.world);
        if (this.history.length > 30) this.history.shift();
        this.future = [];
      }
      this.world = next;
      this.publish();
      this.receive({ type: "saved" });
    } catch (e: any) {
      this.receive({
        type: "error",
        message:
          e.name === "QuotaExceededError"
            ? "Browser storage is full. Export a backup; this edit was not saved."
            : e.message,
      });
    }
  }
}

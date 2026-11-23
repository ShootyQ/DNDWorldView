export const houseDesigns = [
  {
    id: "willow",
    name: "Willow Cottage",
    description: "Oak beams · sheltered porch",
    roof: "gable",
  },
  {
    id: "hearthstone",
    name: "Hearthstone",
    description: "Dressed stone · arched entry",
    roof: "hip",
  },
  {
    id: "merchant",
    name: "Merchant House",
    description: "Jettied upper floor · bay window",
    roof: "gable",
  },
  {
    id: "riverside",
    name: "Riverside House",
    description: "Clapboard · timber veranda",
    roof: "gambrel",
  },
  {
    id: "garden",
    name: "Garden Lodge",
    description: "Cross gable · glass sunroom",
    roof: "gable",
  },
] as const;
export const houseStyles = [
  "willow",
  "hearthstone",
  "merchant",
  "riverside",
  "garden",
] as const;
export const roofStyles = ["gable", "hip", "gambrel"] as const;
export const roofMaterials = ["tiles", "slate", "thatch"] as const;
export const wallColors = [
  { name: "Linen", color: "#e3d4b4" },
  { name: "Sage", color: "#a4b29a" },
  { name: "Clay", color: "#c88c71" },
  { name: "Buttercream", color: "#dec58d" },
  { name: "Mist blue", color: "#91aab3" },
  { name: "Rose", color: "#c69c9b" },
  { name: "Stone", color: "#b8b5a6" },
  { name: "Ivory", color: "#eee5cc" },
];
export const roofColors = [
  { name: "Terracotta", color: "#a85f49" },
  { name: "Midnight slate", color: "#465568" },
  { name: "Moss", color: "#65765d" },
  { name: "Weathered blue", color: "#64848c" },
  { name: "Plum", color: "#795968" },
  { name: "Charcoal", color: "#484b4b" },
  { name: "Honey", color: "#b99a58" },
  { name: "Copper", color: "#9e775e" },
];
export const trimColors = [
  { name: "Dark oak", color: "#514234" },
  { name: "Walnut", color: "#73513c" },
  { name: "Painted ivory", color: "#e1d9bd" },
  { name: "Deep green", color: "#3f6052" },
  { name: "Storm blue", color: "#4d6571" },
  { name: "Oxblood", color: "#7b4846" },
];
export type HouseStyle = (typeof houseStyles)[number];
export type RoofStyle = (typeof roofStyles)[number];
export type RoofMaterial = (typeof roofMaterials)[number];
export interface HouseAppearance {
  houseStyle: HouseStyle;
  roofStyle: RoofStyle;
  roofMaterial: RoofMaterial;
  roofColor: string;
  trimColor: string;
  color: string;
}
function hash(value: string) {
  let n = 2166136261;
  for (const c of value) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function randomHouse(seed: string, style?: HouseStyle): HouseAppearance {
  let n = hash(seed);
  function pick<T>(values: readonly T[]): T {
    n ^= n << 13;
    n ^= n >>> 17;
    n ^= n << 5;
    return values[(n >>> 0) % values.length];
  }
  const houseStyle = style || pick(houseStyles);
  return {
    houseStyle,
    roofStyle: style
      ? houseDesigns.find((d) => d.id === style)!.roof
      : pick(roofStyles),
    roofMaterial: pick(roofMaterials),
    color: pick(wallColors).color,
    roofColor: pick(roofColors).color,
    trimColor: pick(trimColors).color,
  };
}
export function houseAppearance(o: {
  id: string;
  color: string;
  houseStyle?: HouseStyle;
  roofStyle?: RoofStyle;
  roofMaterial?: RoofMaterial;
  roofColor?: string;
  trimColor?: string;
}): HouseAppearance {
  const style = o.houseStyle || houseStyles[hash(o.id) % houseStyles.length];
  return {
    houseStyle: style,
    roofStyle: o.roofStyle || houseDesigns.find((d) => d.id === style)!.roof,
    roofMaterial:
      o.roofMaterial || (style === "hearthstone" ? "slate" : "tiles"),
    color: o.color,
    roofColor:
      o.roofColor || roofColors[hash(o.id + "roof") % roofColors.length].color,
    trimColor: o.trimColor || "#62503e",
  };
}

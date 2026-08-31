// TikTok Café — the one palette. Warm dusk exterior, lamplit interior.
// Every color in the game comes from here so the whole scene stays cohesive.

export const PAL = {
  // sky (dusk gradient stops, top → horizon)
  skyTop:      "#171a38",
  skyMid:      "#33254d",
  skyLow:      "#68395c",
  skyGlow:     "#a35a63",
  star:        "#ffe9c4",
  moon:        "#fff3d0",
  cloud:       "#3d2f55",
  skyline:     "#241d3e",

  // building exterior
  brick:       "#8a4a3d",
  brickDark:   "#6b3630",
  brickLight:  "#a25c4a",
  mortar:      "#5a322e",
  roof:        "#46333f",
  roofLight:   "#5c4452",
  roofDark:    "#352530",
  outline:     "#241820",

  // sign + lights
  signBg:      "#2e1f2b",
  signText:    "#ffd98a",
  bulbOn:      "#ffe9a3",
  bulbOff:     "#7a5a4a",
  glow:        "#ffd98a",

  // interior surfaces
  wallCream:   "#e8d5a9",
  wallCreamSh: "#cdb287",
  wallRose:    "#d9a08a",
  wallRoseSh:  "#bd8471",
  tile:        "#d8e4dc",
  tileSh:      "#b4c9bc",
  glass:       "#9fd4d8",
  glassLight:  "#d0f0f0",
  floorWood:   "#b07a45",
  floorWoodSh: "#8f5f33",
  floorWoodHi: "#c8935a",
  baseboard:   "#6e4526",
  divider:     "#4a2d1c",

  // furniture wood + metal
  wood:        "#a2703f",
  woodDark:    "#7c5230",
  woodLight:   "#c4924f",
  woodOutline: "#4a2d1c",
  metal:       "#9aa3b2",
  metalDark:   "#6b7280",
  metalLight:  "#c8cfd9",
  copper:      "#c47f3e",
  copperDark:  "#96602e",

  // appliances
  stoveBody:   "#4f5866",
  stoveDark:   "#3a414d",
  stoveLight:  "#69748a",
  fire1:       "#ffb347",
  fire2:       "#ff7b3d",
  fireCore:    "#fff3d0",

  // food + nature
  sage:        "#7a9c68",
  leaf:        "#4e7a3f",
  leafLight:   "#6fa04f",
  tomato:      "#d94f3d",
  carrot:      "#e8853d",
  cream:       "#f5ecd7",
  crumb:       "#caa165",
  soil:        "#5a4030",
  terracotta:  "#b56543",

  // cats
  catOrange:   "#d98f4a",
  catOrangeSh: "#b06e33",
  catGrey:     "#8d8a9c",
  catGreySh:   "#6c6a7d",
  catCream:    "#e8d5b5",
  catInner:    "#f0b8b0",

  // UI
  ticket:      "#f5ecd7",
  ticketSh:    "#d9c9a8",
  ink:         "#4a3b32",
  inkSoft:     "#8a7362",
  coin:        "#f2c14e",
  coinDark:    "#c8963a",
  good:        "#7fce7f",
  bad:         "#e06a5a",
  smoke:       "#8a8798",
  steam:       "#e8e4f0",
  heart:       "#f2788f",
  shadow:      "rgba(20,12,18,0.35)",
  nightTint:   "rgba(30,20,60,0.0)",
};

// Viewer accent colors — outfit / hair, picked by username hash.
export const ACCENTS = [
  "#c25b4e", "#4f8f8b", "#7a9c68", "#b0619c",
  "#5b74b8", "#d9984a", "#8a6dbd", "#b8556e",
];

// 6 tones, pale → deep — cycled in order by !skin (index 0–5).
export const SKINS  = ["#ffdfc4", "#f0c8a0", "#dca77c", "#c68d5e", "#a06a42", "#7a4a30"];
export const HAIRS  = ["#3a2a22", "#6e4526", "#b07a45", "#2c2c3a", "#8a4a3d", "#d9c9a8"];

// !haircolour palette, cycled in order. The first 4 are the natural tones —
// hash-default characters only draw from those; brights are an explicit pick.
export const HAIR_COLORS = [
  "#6e4526",   // brown
  "#d9c9a8",   // blonde
  "#b5502e",   // redhead
  "#2c2c3a",   // black
  "#e87ab8",   // pink
  "#4f7ad9",   // blue
  "#8a5fc9",   // purple
  "#4e9c50",   // green
];

export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function accentFor(name)  { return ACCENTS[hashStr(name) % ACCENTS.length]; }
export function skinFor(name)    { return SKINS[hashStr(name + "s") % SKINS.length]; }
export function hairFor(name)    { return HAIRS[hashStr(name + "h") % HAIRS.length]; }

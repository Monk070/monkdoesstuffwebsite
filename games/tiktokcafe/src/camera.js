// Zoom camera. When on (default), the view crops so the building's outer
// walls touch the left/right edges of the canvas, vertically centered on the
// building. Toggle with the Z key (or ?zoom=0) to see the full street scene.

import { W, H, BUILDING } from "./scene.js";

export const camera = { on: true, z: 1, x: 0, y: 0 };

export function updateCamera() {
  if (camera.on) {
    camera.z = W / BUILDING.w;
    camera.x = BUILDING.x;
    const visH = H / camera.z;
    const midY = (BUILDING.top + BUILDING.bottom) / 2;
    camera.y = Math.max(0, midY - visH / 2);
  } else {
    camera.z = 1; camera.x = 0; camera.y = 0;
  }
}

export function toggleZoom() {
  camera.on = !camera.on;
  updateCamera();
}

// Visible logical rect — overlay UI (toasts, banner) sizes itself to this.
export function viewport() {
  return { x: camera.x, y: camera.y, w: W / camera.z, h: H / camera.z };
}

updateCamera();

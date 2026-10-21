import { useEffect, useRef } from "react";

// Ren's drawn background: an ink blossom tree leaning in from the bottom left under a full moon,
// with red petals drifting down (most of them from the tree). Used when Ren has no art in the
// data folder. Colors come from the theme's variables.
//
// This file only draws, so it's checked by eye (screenshots), not by tests or mutation testing:
// a browser test can't see a canvas picture. Its colors and sizes are in the theme's CSS.

// A small number generator seeded by text, so the tree grows the same way every time.
function seeded(text: string) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

interface Petal {
  x: number;
  y: number;
  size: number;
  speed: number;
  sway: number;
  swaySpeed: number;
  spin: number;
  spinSpeed: number;
  color: string;
}

function startSky(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {}; // no canvas drawing (e.g. in tests)
  const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  let w = 0;
  let h = 0;
  let frame = 0;
  let tree: HTMLCanvasElement | null = null;
  let tips: [number, number][] = [];
  let petals: Petal[] = [];

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // The moon and the tree are drawn once per window size, then copied each frame.
  function makeTree() {
    const dpr = window.devicePixelRatio || 1;
    tree = document.createElement("canvas");
    tree.width = w * dpr;
    tree.height = h * dpr;
    const t = tree.getContext("2d")!;
    t.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rand = seeded("ren-tree");
    const ink = css("--ink");
    const blossoms = [css("--petal-1"), css("--petal-2"), css("--petal-3")];
    const scale = Math.max(0.55, Math.min(w, h) / 900);

    const mx = w * 0.84;
    const my = h * 0.17;
    const mr = Math.min(w, h) * 0.12;
    const glow = t.createRadialGradient(mx, my, mr * 0.8, mx, my, mr * 2.6);
    glow.addColorStop(0, "rgba(230, 226, 234, 0.25)");
    glow.addColorStop(1, "rgba(230, 226, 234, 0)");
    t.fillStyle = glow;
    t.fillRect(0, 0, w, h);
    t.fillStyle = css("--moon");
    t.globalAlpha = 0.92;
    t.beginPath();
    t.arc(mx, my, mr, 0, Math.PI * 2);
    t.fill();
    t.globalAlpha = 0.08;
    t.fillStyle = ink;
    for (const [dx, dy, r] of [
      [-0.3, -0.2, 0.22],
      [0.25, 0.1, 0.15],
      [-0.05, 0.35, 0.12],
    ] as const) {
      t.beginPath();
      t.arc(mx + dx * mr, my + dy * mr, r * mr, 0, Math.PI * 2);
      t.fill();
    }
    t.globalAlpha = 1;

    tips = [];
    t.strokeStyle = ink;
    t.lineCap = "round";
    const branch = (x: number, y: number, len: number, angle: number, width: number, depth: number) => {
      const x2 = x + Math.cos(angle) * len;
      const y2 = y + Math.sin(angle) * len;
      const cx = (x + x2) / 2 + (rand() - 0.5) * len * 0.35;
      const cy = (y + y2) / 2 + (rand() - 0.5) * len * 0.35;
      t.lineWidth = width;
      t.beginPath();
      t.moveTo(x, y);
      t.quadraticCurveTo(cx, cy, x2, y2);
      t.stroke();
      if (depth === 0) {
        tips.push([x2, y2]);
        return;
      }
      if (depth < 4) tips.push([x2, y2]);
      const n = rand() < 0.35 ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const a = angle + (i - (n - 1) / 2) * 0.55 + (rand() - 0.5) * 0.5 + 0.06; // leans a little to the right
        branch(x2, y2, len * (0.66 + rand() * 0.16), a, Math.max(1, width * 0.66), depth - 1);
      }
    };
    branch(w * 0.05, h + 20, 230 * scale, -Math.PI / 2 + 0.3, 34 * scale, 8);

    const center = css("--blossom-center");
    const flower = (x: number, y: number, r: number, color: string) => {
      t.fillStyle = color;
      t.globalAlpha = 0.92;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + r;
        t.beginPath();
        t.arc(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75, r * 0.62, 0, Math.PI * 2);
        t.fill();
      }
      t.fillStyle = center;
      t.beginPath();
      t.arc(x, y, r * 0.28, 0, Math.PI * 2);
      t.fill();
      t.globalAlpha = 1;
    };
    for (const [x, y] of tips) {
      const count = 2 + Math.floor(rand() * 4);
      for (let i = 0; i < count; i++) {
        const color = blossoms[rand() < 0.55 ? 0 : rand() < 0.6 ? 1 : 2]!;
        flower(x + (rand() - 0.5) * 30 * scale, y + (rand() - 0.5) * 30 * scale, (3 + rand() * 3.5) * scale * 1.3, color);
      }
    }
  }

  function makePetals() {
    const colors = [css("--petal-1"), css("--petal-2"), css("--petal-3")];
    const n = Math.round(Math.min(60, (w * h) / 22000));
    petals = Array.from({ length: n }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      size: 6 + Math.random() * 8,
      speed: 0.4 + Math.random() * 0.9,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.01 + Math.random() * 0.02,
      spin: Math.random() * Math.PI,
      spinSpeed: (Math.random() - 0.5) * 0.04,
      color: colors[Math.floor(Math.random() * colors.length)]!,
    }));
  }

  function drawPetal(p: Petal) {
    ctx!.save();
    ctx!.translate(p.x, p.y);
    ctx!.rotate(p.spin);
    ctx!.fillStyle = p.color;
    ctx!.globalAlpha = 0.85;
    const s = p.size;
    ctx!.beginPath();
    ctx!.moveTo(0, -s);
    ctx!.bezierCurveTo(s * 0.9, -s * 0.6, s * 0.7, s * 0.7, 0, s);
    ctx!.bezierCurveTo(-s * 0.7, s * 0.7, -s * 0.9, -s * 0.6, 0, -s);
    ctx!.fill();
    ctx!.restore();
  }

  function step() {
    ctx!.clearRect(0, 0, w, h);
    if (tree) ctx!.drawImage(tree, 0, 0, w, h);
    for (const p of petals) {
      if (!still) {
        p.sway += p.swaySpeed;
        p.y += p.speed;
        p.x += Math.sin(p.sway) * 0.8 + 0.3;
        p.spin += p.spinSpeed;
        if (p.y > h + 20) {
          // Most petals fall from the tree; the rest from the top of the screen.
          const tip = Math.random() < 0.7 ? tips[Math.floor(Math.random() * tips.length)] : undefined;
          p.x = tip ? tip[0] : Math.random() * w;
          p.y = tip ? tip[1] : -20;
        }
        if (p.x > w + 20) p.x = -20;
      }
      drawPetal(p);
    }
    if (!still) frame = requestAnimationFrame(step);
  }

  function start() {
    cancelAnimationFrame(frame);
    resize();
    makeTree();
    makePetals();
    step();
  }

  start();
  window.addEventListener("resize", start);
  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", start);
  };
}

export function RenSky() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => startSky(ref.current!), []);
  return <canvas ref={ref} className="sky" aria-hidden="true" data-testid="ren-sky" />;
}

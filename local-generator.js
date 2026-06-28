const ffmpegPath = require('ffmpeg-static');
const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Jimp = require('jimp');

const VIDEOS_DIR = path.join(__dirname, 'videos');
const W = 1280, H = 720;

// ================================================================
// Scene analysis — same logic as client-side for consistency
// ================================================================

const THEMES = [
  {
    name: 'sunset', keywords: ['закат', 'солнце садится', 'вечер', 'сумерки', 'красное небо', 'orange sky', 'golden hour'],
    colors: [[10, 10, 46], [30, 20, 60], [255, 107, 53], [255, 69, 0], [255, 215, 0]],
    ground: [45, 26, 10], accent: [255, 107, 53],
  },
  {
    name: 'ocean', keywords: ['море', 'океан', 'волн', 'пляж', 'побережье', 'вода', 'deep blue', 'aquatic', 'underwater'],
    colors: [[10, 26, 62], [0, 119, 190], [0, 191, 255], [135, 206, 235]],
    ground: [26, 58, 94], accent: [0, 191, 255],
  },
  {
    name: 'forest', keywords: ['лес', 'дерев', 'природа', 'зелень', 'трава', 'роща', 'woodland', 'enchanted forest', 'green forest', 'jungle'],
    colors: [[10, 26, 10], [26, 74, 26], [45, 107, 45], [74, 138, 74]],
    ground: [26, 42, 10], accent: [76, 175, 80],
  },
  {
    name: 'space', keywords: ['космос', 'вселенная', 'звезд', 'галактик', 'планет', 'starry night', 'nebula', 'black hole', 'alien world'],
    colors: [[0, 0, 17], [10, 10, 46], [26, 10, 62], [13, 0, 42]],
    ground: [0, 0, 17], accent: [224, 64, 251],
  },
  {
    name: 'mountain', keywords: ['гор', 'холм', 'скал', 'вершин', 'snowy peaks', 'rocky mountains', 'alps', 'himalayas'],
    colors: [[10, 26, 46], [42, 58, 94], [74, 106, 142], [138, 172, 206]],
    ground: [42, 58, 42], accent: [106, 138, 174],
  },
  {
    name: 'night', keywords: ['ночь', 'ночной', 'лун', 'звездная', 'darkness', 'midnight', 'twilight'],
    colors: [[5, 5, 20], [10, 10, 46], [15, 15, 50], [8, 8, 35]],
    ground: [15, 15, 40], accent: [108, 99, 255],
  },
  {
    name: 'city', keywords: ['город', 'мегаполис', 'улиц', 'небоскреб', 'urban landscape', 'neon lights', 'cyberpunk city'],
    colors: [[10, 10, 26], [26, 26, 62], [42, 42, 94], [13, 13, 42]],
    ground: [26, 26, 46], accent: [255, 171, 0],
  },
  {
    name: 'desert', keywords: ['пустын', 'песок', 'дюн', 'sandy', 'canyon', 'sahara'],
    colors: [[26, 10, 0], [138, 90, 42], [212, 160, 74], [232, 192, 106]],
    ground: [138, 90, 42], accent: [212, 160, 74],
  },
  {
    name: 'snow', keywords: ['снег', 'зим', 'сугроб', 'снежинк', 'icy', 'arctic', 'blizzard'],
    colors: [[10, 26, 46], [74, 106, 142], [138, 172, 206], [192, 216, 240]],
    ground: [42, 58, 78], accent: [200, 220, 240],
  },
  {
    name: 'fantasy', keywords: ['фэнтез', 'волшебн', 'магическ', 'замок', 'дракон', 'сказк', 'magic kingdom', 'mythical', 'elves', 'dwarves'],
    colors: [[10, 0, 42], [42, 0, 74], [74, 0, 106], [106, 0, 138]],
    ground: [26, 0, 58], accent: [224, 64, 251],
  },
  {
    name: 'fire', keywords: ['огонь', 'пожар', 'вулкан', 'плам', 'горящ', 'inferno', 'lava', 'burning'],
    colors: [[26, 0, 0], [74, 0, 0], [138, 26, 0], [212, 64, 0]],
    ground: [42, 10, 0], accent: [255, 69, 0],
  },
  {
    name: 'rain', keywords: ['дождь', 'ливень', 'гроз', 'туч', 'пасмур', 'stormy', 'rainy day', 'umbrella'],
    colors: [[10, 10, 26], [26, 26, 46], [42, 42, 62], [58, 58, 78]],
    ground: [26, 26, 42], accent: [104, 104, 168],
  },
  {
    name: 'spring', keywords: ['весн', 'цвет', 'сад', 'бабочк', 'радуг', 'blossom', 'flower field', 'vibrant'],
    colors: [[10, 26, 46], [74, 138, 206], [255, 183, 197], [152, 251, 152]],
    ground: [42, 90, 42], accent: [255, 105, 180],
  },
  {
    name: 'cyberpunk', keywords: ['киберпанк', 'неоновы', 'футуристическ', 'будущее', 'технологии', 'cyberpunk', 'neon', 'futuristic'],
    colors: [[0, 0, 20], [20, 0, 40], [40, 0, 60], [0, 20, 40], [0, 40, 60]],
    ground: [0, 0, 0], accent: [0, 255, 255],
  },
  {
    name: 'retro', keywords: ['ретро', '80е', '90е', 'винтаж', 'анахронизм', 'retro', '80s', '90s', 'vintage', 'synthwave'],
    colors: [[20, 0, 20], [40, 0, 40], [60, 0, 60], [80, 0, 80], [100, 0, 100]],
    ground: [0, 0, 0], accent: [255, 0, 255],
  },
];

function analyzeScene(prompt) {
  const lower = prompt.toLowerCase();
  let bestScore = 0;
  let theme = THEMES[0]; // default: sunset

  for (const t of THEMES) {
    let score = 0;
    for (const kw of t.keywords) {
      if (lower.includes(kw)) {
        // Increase score for longer keywords and multiple occurrences
        score += kw.length * 2;
      }
    }
    // Prioritize themes that have more relevant keywords
    if (score > bestScore) {
      bestScore = score;
      theme = t;
    }
  }

  // Check for specific modifiers that can override or enhance the base theme
  if (lower.includes('stormy') || lower.includes('гроза') || lower.includes('шторм')) {
    // If a stormy keyword is present, and it's an ocean or rain scene, enhance it
    if (theme.name === 'ocean' || theme.name === 'rain') {
      // Could add specific stormy elements later in drawing functions
    } else {
      // For other themes, 'stormy' might imply a darker, more dramatic feel
    }
  }

  // Add more sophisticated prompt understanding here, e.g., combining themes or specific elements
  // Example: "sunset over mountains" could blend sunset colors with mountain elements

  return theme;
}

function setPixel(image, x, y, r, g, b) {
  if (x < 0 || x >= image.bitmap.width || y < 0 || y >= image.bitmap.height) return;
  const idx = image.getPixelIndex(x, y);
  image.bitmap.data[idx + 0] = Math.max(0, Math.min(255, r));
  image.bitmap.data[idx + 1] = Math.max(0, Math.min(255, g));
  image.bitmap.data[idx + 2] = Math.max(0, Math.min(255, b));
  image.bitmap.data[idx + 3] = 255;
}

function drawCircle(image, cx, cy, r, colorR, colorG, colorB, alpha) {
  alpha = alpha || 1;
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) {
        const px = cx + x;
        const py = cy + y;
        if (px >= 0 && px < w && py >= 0 && py < h) {
          const idx = image.getPixelIndex(px, py);
          if (alpha < 1) {
            // Blend
            image.bitmap.data[idx + 0] = Math.round(image.bitmap.data[idx + 0] * (1 - alpha) + colorR * alpha);
            image.bitmap.data[idx + 1] = Math.round(image.bitmap.data[idx + 1] * (1 - alpha) + colorG * alpha);
            image.bitmap.data[idx + 2] = Math.round(image.bitmap.data[idx + 2] * (1 - alpha) + colorB * alpha);
          } else {
            image.bitmap.data[idx + 0] = Math.max(0, Math.min(255, colorR));
            image.bitmap.data[idx + 1] = Math.max(0, Math.min(255, colorG));
            image.bitmap.data[idx + 2] = Math.max(0, Math.min(255, colorB));
          }
          image.bitmap.data[idx + 3] = 255;
        }
      }
    }
  }
}

function drawRect(image, x, y, w, h, colorR, colorG, colorB, alpha) {
  alpha = alpha || 1;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(image, x + dx, y + dy, colorR, colorG, colorB);
    }
  }
}

function drawLine(image, x1, y1, x2, y2, colorR, colorG, colorB, lineWidth) {
  lineWidth = lineWidth || 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(Math.round(len), 1);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lx = Math.round(x1 + dx * t);
    const ly = Math.round(y1 + dy * t);
    for (let lw = -lineWidth / 2; lw <= lineWidth / 2; lw++) {
      for (let lh = -lineWidth / 2; lh <= lineWidth / 2; lh++) {
        setPixel(image, lx + lw, ly + lh, colorR, colorG, colorB);
      }
    }
  }
}

function generateGradient(W, H, colors) {
  const img = new Jimp(W, H);
  const len = colors.length;

  img.scan(0, 0, W, H, function (x, y, idx) {
    const t = y / H;
    const pos = t * (len - 1);
    const idx0 = Math.min(Math.floor(pos), len - 2);
    const idx1 = idx0 + 1;
    const frac = pos - idx0;

    let c0 = colors[idx0] || colors[len - 1];
    let c1 = colors[idx1] || colors[len - 1];

    // Add subtle color variation for more natural look
    c0 = c0.map(c => c + (Math.random() - 0.5) * 20);
    c1 = c1.map(c => c + (Math.random() - 0.5) * 20);

    const r = Math.round(c0[0] + (c1[0] - c0[0]) * frac);
    const g = Math.round(c0[1] + (c1[1] - c0[1]) * frac);
    const b = Math.round(c0[2] + (c1[2] - c0[2]) * frac);

    this.bitmap.data[idx + 0] = Math.max(0, Math.min(255, r));
    this.bitmap.data[idx + 1] = Math.max(0, Math.min(255, g));
    this.bitmap.data[idx + 2] = Math.max(0, Math.min(255, b));
    this.bitmap.data[idx + 3] = 255;
  });

  return img;
}

function addStars(image, seed, variationFactor = 1.0) {
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  const numStars = Math.floor(120 * variationFactor); // Vary number of stars
  for (let i = 0; i < numStars; i++) {
    const sx = ((i * 137.5 + seed + Math.random() * w) % w); // Random offset
    const sy = ((i * 97.3 + seed * 2 + Math.random() * h * 0.6) % Math.floor(h * 0.6));
    const brightness = 128 + Math.floor(Math.abs(Math.sin(i * 7.3 + Math.random())) * 127 * variationFactor); // Vary brightness
    const size = 1 + Math.floor(Math.random() * 2) * variationFactor; // Vary size
    drawCircle(image, sx, sy, size, brightness, brightness, brightness);
  }
}

function addMountains(image, colors, variationFactor = 1.0) {
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  const layers = [
    { yBase: Math.floor(h * 0.55), color: colors[0] || [42, 58, 94], scale: 1.0, offset: 0 },
    { yBase: Math.floor(h * 0.6), color: colors[1] || [58, 74, 110], scale: 0.85, offset: -20 },
    { yBase: Math.floor(h * 0.63), color: colors[2] || [74, 90, 126], scale: 0.7, offset: -40 },
  ];

  for (const layer of layers) {
    // Vary layer height and complexity
    const heightVariation = (Math.random() - 0.5) * 30 * variationFactor;
    const complexityVariation = (Math.random() - 0.5) * 0.001 * variationFactor;
    
    for (let x = 0; x < w; x++) {
      const height = layer.scale * (
        Math.sin(x * (0.002 + complexityVariation) + layer.offset * 0.1) * (60 + heightVariation) +
        Math.sin(x * (0.005 + complexityVariation) + layer.offset * 0.2) * (40 + heightVariation / 2) +
        Math.sin(x * (0.001 + complexityVariation) + layer.offset * 0.05) * (80 + heightVariation / 3)
      );
      const baseY = layer.yBase - Math.floor(height);
      for (let y = baseY; y < h; y++) {
        // Vary color slightly per layer
        const r = Math.min(255, Math.max(0, layer.color[0] + (Math.random() - 0.5) * 10));
        const g = Math.min(255, Math.max(0, layer.color[1] + (Math.random() - 0.5) * 10));
        const b = Math.min(255, Math.max(0, layer.color[2] + (Math.random() - 0.5) * 10));
        setPixel(image, x, y, r, g, b);
      }
    }
  }
}

function addTrees(image, W, H, variationFactor = 1.0) {
  const positions = [
    [0.05, 0.4], [0.15, 0.5], [0.25, 0.35],
    [0.7, 0.45], [0.82, 0.55], [0.92, 0.38],
  ];
  const groundY = Math.floor(H * 0.72);

  for (const [xPos, hScale] of positions) {
    const tx = Math.floor(xPos * W + (Math.random() - 0.5) * W * 0.05 * variationFactor); // Slight horizontal variation
    const th = hScale * H * (0.8 + Math.random() * 0.4 * variationFactor); // Vary height

    // Trunk
    const trunkH = Math.floor(th * 0.6);
    drawRect(image, tx - 5, groundY - trunkH, 10, trunkH, 75 + (Math.random()-0.5)*10, 53 + (Math.random()-0.5)*10, 32 + (Math.random()-0.5)*10);

    // Foliage circles
    const foliageColors = [[45, 107, 45], [58, 138, 58], [74, 154, 74]];
    for (let i = 0; i < 4; i++) {
      const foliageH = th * (0.3 - i * 0.04) * variationFactor;
      const fy = groundY - trunkH - i * Math.floor(th * 0.12) + (Math.random() - 0.5) * 10 * variationFactor;
      const fr = Math.floor(foliageH);
      const fc = foliageColors[i % foliageColors.length];
      drawCircle(image, tx, fy, fr, fc[0] + (Math.random()-0.5)*10, fc[1] + (Math.random()-0.5)*10, fc[2] + (Math.random()-0.5)*10);
    }
  }
}

function addBuildings(image, W, H, variationFactor = 1.0) {
  const buildings = [
    [0.02, 0.06, 0.3], [0.09, 0.04, 0.45], [0.14, 0.05, 0.35],
    [0.2, 0.03, 0.5], [0.24, 0.06, 0.4], [0.31, 0.04, 0.55],
    [0.36, 0.05, 0.38], [0.42, 0.04, 0.48], [0.47, 0.07, 0.6],
    [0.55, 0.04, 0.42], [0.6, 0.05, 0.52], [0.66, 0.04, 0.36],
    [0.71, 0.06, 0.58], [0.78, 0.04, 0.44], [0.83, 0.05, 0.5],
    [0.89, 0.04, 0.38], [0.94, 0.05, 0.46],
  ];
  const groundY = Math.floor(H * 0.72);

  for (const [xPct, wPct, hPct] of buildings) {
    const bx = Math.floor(xPct * W + (Math.random() - 0.5) * W * 0.02 * variationFactor);
    const bw = Math.floor(wPct * W * (0.9 + Math.random() * 0.2 * variationFactor));
    const bh = Math.floor(hPct * H * (0.9 + Math.random() * 0.2 * variationFactor));
    const by = groundY - bh;

    // Building body
    const r = 26 + (Math.random()-0.5)*5;
    const g = 26 + (Math.random()-0.5)*5;
    const b = 46 + (Math.random()-0.5)*5;
    drawRect(image, bx, by, bw, bh, r, g, b);

    // Windows
    for (let wy = 0; wy < bh - 8; wy += 14 + Math.random()*4) {
      for (let wx = 0; wx < bw - 6; wx += 12 + Math.random()*4) {
        const lit = Math.sin(bx * 0.01 + wy * 0.05 + Math.random()) > 0;
        if (lit) {
          drawRect(image, bx + 4 + wx, by + 4 + wy, 6, 8, 255, 200 + (Math.random()-0.5)*20, 100 + (Math.random()-0.5)*20);
        } else {
          drawRect(image, bx + 4 + wx, by + 4 + wy, 6, 8, 100 + (Math.random()-0.5)*10, 100 + (Math.random()-0.5)*10, 150 + (Math.random()-0.5)*10);
        }
      }
    }

    // Outline
    for (let dx = 0; dx < bw; dx++) {
      if (bx + dx >= 0 && bx + dx < W) {
        setPixel(image, bx + dx, by, 60 + (Math.random()-0.5)*5, 60 + (Math.random()-0.5)*5, 100 + (Math.random()-0.5)*5);
        setPixel(image, bx + dx, groundY - 1, 60 + (Math.random()-0.5)*5, 60 + (Math.random()-0.5)*5, 100 + (Math.random()-0.5)*5);
      }
    }
  }
}

function addWaves(image, W, H, variationFactor = 1.0) {
  const waveY = Math.floor(H * 0.65);
  // Water surface — use Jimp scan for performance
  image.scan(0, waveY, W, H - waveY, function(x, y, idx) {
    const t = (y - waveY) / (H - waveY);
    const wr = Math.round(0 + (Math.random()-0.5)*10);
    const wg = Math.round(80 + 20 * t + (Math.random()-0.5)*10);
    const wb = Math.round(180 + 20 * t + (Math.random()-0.5)*10);
    this.bitmap.data[idx + 0] = Math.round(this.bitmap.data[idx + 0] * 0.3 + wr * 0.7);
    this.bitmap.data[idx + 1] = Math.round(this.bitmap.data[idx + 1] * 0.3 + wg * 0.7);
    this.bitmap.data[idx + 2] = Math.round(this.bitmap.data[idx + 2] * 0.3 + wb * 0.7);
    this.bitmap.data[idx + 3] = 255;
  });

  // Wave lines
  for (let w = 0; w < 3; w++) {
    for (let x = 0; x < W; x += 2) {
      const y = waveY + w * 12 + Math.floor(Math.sin(x * 0.008 + w * 2.1) * 10 * variationFactor + Math.sin(x * 0.015 + w * 1.3) * 5 * variationFactor);
      if (y >= 0 && y < H) {
        setPixel(image, x, y, 100 + (Math.random()-0.5)*10, 180 + (Math.random()-0.5)*10, 255 + (Math.random()-0.5)*10);
      }
    }
  }
}

function addCastle(image, W, H, variationFactor = 1.0) {
  const cx = Math.floor(W * 0.5);
  const groundY = Math.floor(H * 0.7);
  const castleH = Math.floor(H * 0.35 * variationFactor);

  // Main walls
  drawRect(image, cx - 80, groundY - castleH, 160, castleH, 80 + (Math.random()-0.5)*10, 40 + (Math.random()-0.5)*10, 120 + (Math.random()-0.5)*10);
  // Towers
  drawRect(image, cx - 100, groundY - Math.floor(castleH * 1.15), 30, Math.floor(castleH * 1.15), 80 + (Math.random()-0.5)*10, 40 + (Math.random()-0.5)*10, 120 + (Math.random()-0.5)*10);
  drawRect(image, cx + 70, groundY - Math.floor(castleH * 1.15), 30, Math.floor(castleH * 1.15), 80 + (Math.random()-0.5)*10, 40 + (Math.random()-0.5)*10, 120 + (Math.random()-0.5)*10);
  drawRect(image, cx - 40, groundY - Math.floor(castleH * 1.3), 80, Math.floor(castleH * 1.3), 80 + (Math.random()-0.5)*10, 40 + (Math.random()-0.5)*10, 120 + (Math.random()-0.5)*10);

  // Turret tops
  drawRect(image, cx - 100, groundY - Math.floor(castleH * 1.15) - 6, 30, 6, 100 + (Math.random()-0.5)*10, 50 + (Math.random()-0.5)*10, 140 + (Math.random()-0.5)*10);
  drawRect(image, cx + 70, groundY - Math.floor(castleH * 1.15) - 6, 30, 6, 100 + (Math.random()-0.5)*10, 50 + (Math.random()-0.5)*10, 140 + (Math.random()-0.5)*10);
  drawRect(image, cx - 40, groundY - Math.floor(castleH * 1.3) - 8, 80, 8, 100 + (Math.random()-0.5)*10, 50 + (Math.random()-0.5)*10, 140 + (Math.random()-0.5)*10);

  // Windows (warm light)
  drawRect(image, cx - 50, groundY - Math.floor(castleH * 0.7), 16, 24, 255, 200 + (Math.random()-0.5)*20, 100 + (Math.random()-0.5)*20);
  drawRect(image, cx + 34, groundY - Math.floor(castleH * 0.7), 16, 24, 255, 200 + (Math.random()-0.5)*20, 100 + (Math.random()-0.5)*20);
  drawRect(image, cx - 8, groundY - Math.floor(castleH * 0.4), 16, 24, 255, 200 + (Math.random()-0.5)*20, 100 + (Math.random()-0.5)*20);

  // Gate
  drawRect(image, cx - 12, groundY - 40, 24, 40, 26 + (Math.random()-0.5)*5, 0, 42 + (Math.random()-0.5)*5);
}

function addSun(image, W, H, variationFactor = 1.0) {
  const sx = Math.floor(W * 0.7 + (Math.random() - 0.5) * W * 0.1 * variationFactor);
  const sy = Math.floor(H * 0.25 + (Math.random() - 0.5) * H * 0.1 * variationFactor);
  const r = 50 * variationFactor;

  // Glow
  for (let gr = r; gr < r * 2.5; gr++) {
    const alpha = Math.max(0, 0.3 * (1 - (gr - r) / (r * 1.5)) * variationFactor);
    drawCircle(image, sx, sy, gr, 255 + (Math.random()-0.5)*10, 180 + (Math.random()-0.5)*10, 50 + (Math.random()-0.5)*10, alpha);
  }

  // Sun body
  const sunColors = [[255, 248, 224], [255, 215, 0], [255, 140, 0], [255, 69, 0]];
  for (let i = 0; i < sunColors.length; i++) {
    const sr = r - i * (r / sunColors.length);
    let [cr, cg, cb] = sunColors[i];
    cr += (Math.random()-0.5)*10;
    cg += (Math.random()-0.5)*10;
    cb += (Math.random()-0.5)*10;
    drawCircle(image, sx, sy, sr, cr, cg, cb);
  }
}

function addCloud(image, W, H, x, y, size, variationFactor = 1.0) {
  const drawPuff = (px, py, r) => drawCircle(image, px, py, r, 200 + (Math.random()-0.5)*10, 210 + (Math.random()-0.5)*10, 240 + (Math.random()-0.5)*10, 0.3 * variationFactor);
  const s = size * variationFactor;
  drawPuff(x, y, 30 * s);
  drawPuff(x - 25 * s, y + 5, 22 * s);
  drawPuff(x + 25 * s, y + 5, 22 * s);
  drawPuff(x - 10 * s, y - 8, 20 * s);
  drawPuff(x + 10 * s, y - 8, 20 * s);
}

function addDesertDunes(image, W, H, variationFactor = 1.0) {
  for (let x = 0; x < W; x++) {
    const y1 = Math.floor(H * 0.7 + Math.sin(x * 0.003) * 30 * variationFactor + Math.sin(x * 0.007) * 15 * variationFactor);
    for (let y = y1; y < H; y++) setPixel(image, x, y, 196 + (Math.random()-0.5)*10, 160 + (Math.random()-0.5)*10, 96 + (Math.random()-0.5)*10);
  }
  for (let x = 0; x < W; x++) {
    const y2 = Math.floor(H * 0.75 + Math.sin(x * 0.004 + 1) * 25 * variationFactor + Math.sin(x * 0.009) * 12 * variationFactor);
    for (let y = y2; y < H; y++) setPixel(image, x, y, 212 + (Math.random()-0.5)*10, 176 + (Math.random()-0.5)*10, 112 + (Math.random()-0.5)*10);
  }
}

function addSnowGround(image, W, H, variationFactor = 1.0) {
  for (let x = 0; x < W; x++) {
    const y1 = Math.floor(H * 0.78 + Math.sin(x * 0.01) * 8 * variationFactor + Math.sin(x * 0.003) * 12 * variationFactor);
    for (let y = y1; y < H; y++) {
      setPixel(image, x, y, 192 + (Math.random()-0.5)*10, 216 + (Math.random()-0.5)*10, 240 + (Math.random()-0.5)*10);
    }
  }
}

function addSnowTrees(image, W, H, variationFactor = 1.0) {
  const positions = [{x: 0.1, h: 0.35}, {x: 0.2, h: 0.45}, {x: 0.75, h: 0.4}, {x: 0.88, h: 0.5}];
  const groundY = Math.floor(H * 0.78);

  for (const {x: xPct, h: hScale} of positions) {
    const tx = Math.floor(xPct * W + (Math.random()-0.5)*W*0.05*variationFactor);
    const th = hScale * H * (0.9 + Math.random()*0.2*variationFactor);
    // Trunk
    const trunkH = Math.floor(th * 0.5);
    drawRect(image, tx - 4, groundY - trunkH, 8, trunkH, 58 + (Math.random()-0.5)*10, 42 + (Math.random()-0.5)*10, 26 + (Math.random()-0.5)*10);
    // Snow stacks
    for (let i = 0; i < 3; i++) {
      const layerH = Math.floor(th * 0.25 * variationFactor);
      const layerY = groundY - trunkH - i * Math.floor(th * 0.12) + (Math.random()-0.5)*10*variationFactor;
      const layerW = Math.floor((0.5 - i * 0.12) * th * variationFactor);
      const col = [192 + i * 16, 216 + i * 10, 240 + i * 5];
      for (let dx = -layerW; dx <= layerW; dx++) {
        const ly = layerY + layerH - Math.floor(Math.abs(dx) / layerW * layerH);
        for (let dy = ly; dy < layerY + layerH; dy++) {
          setPixel(image, tx + dx, dy, col[0] + (Math.random()-0.5)*10, col[1] + (Math.random()-0.5)*10, col[2] + (Math.random()-0.5)*10);
        }
      }
    }
  }
}

// ================================================================
// Main generator
// ================================================================

async function generateVideo(prompt, duration = 5) {
  const jobId = uuidv4();
  const outputPath = path.join(VIDEOS_DIR, `${jobId}.mp4`);

  if (!fs.existsSync(VIDEOS_DIR)) {
    fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  }

  const fps = 24;
  const totalFrames = duration * fps;
  const scene = analyzeScene(prompt);

  // Add variation factor based on prompt keywords (e.g., 'detailed', 'vibrant')
  let variationFactor = 1.0;
  if (prompt.toLowerCase().includes('detailed') || prompt.toLowerCase().includes('vibrant') || prompt.toLowerCase().includes('intricate')) {
      variationFactor = 1.5;
  } else if (prompt.toLowerCase().includes('simple') || prompt.toLowerCase().includes('minimal')) {
      variationFactor = 0.7;
  }

  // Create base frame with scene
  const baseImage = generateGradient(W, H, scene.colors);

  // Add scene elements
  const themeName = scene.name;

  if (themeName === 'space') {
    addStars(baseImage, 42, variationFactor);
    // Planet
    drawCircle(baseImage, Math.floor(W * 0.2), Math.floor(H * 0.3), 30 * variationFactor, 138 + (Math.random()-0.5)*10, 106 + (Math.random()-0.5)*10, 255 + (Math.random()-0.5)*10);
    drawCircle(baseImage, Math.floor(W * 0.85), Math.floor(H * 0.25), 15 * variationFactor, 224 + (Math.random()-0.5)*10, 64 + (Math.random()-0.5)*10, 251 + (Math.random()-0.5)*10);
  }
  if (themeName === 'sunset' || themeName === 'sunrise') {
    addSun(baseImage, W, H, variationFactor);
    addCloud(baseImage, W, H, Math.floor(W * 0.2), Math.floor(H * 0.08), 1.0, variationFactor);
    addCloud(baseImage, W, H, Math.floor(W * 0.5), Math.floor(H * 0.12), 0.8, variationFactor);
    addCloud(baseImage, W, H, Math.floor(W * 0.8), Math.floor(H * 0.06), 1.2, variationFactor);
  }
  if (themeName === 'ocean') {
    addWaves(baseImage, W, H, variationFactor);
    addCloud(baseImage, W, H, Math.floor(W * 0.15), Math.floor(H * 0.08), 1.0, variationFactor);
    addCloud(baseImage, W, H, Math.floor(W * 0.55), Math.floor(H * 0.1), 0.8, variationFactor);
    // Sailboat
    const boatX = Math.floor(W * 0.3);
    const boatY = Math.floor(H * 0.68);
    drawRect(baseImage, boatX - 15, boatY, 30, 8, 74 + (Math.random()-0.5)*10, 53 + (Math.random()-0.5)*10, 32 + (Math.random()-0.5)*10);
    drawLine(baseImage, boatX, boatY, boatX, boatY - 25, 58 + (Math.random()-0.5)*10, 42 + (Math.random()-0.5)*10, 16 + (Math.random()-0.5)*10);
    // Sail
    for (let dy = -20; dy <= 0; dy++) {
      const sailW = Math.floor(15 * (1 + dy / 25) * variationFactor);
      for (let dx = 0; dx <= sailW; dx++) {
        setPixel(baseImage, boatX + dx, boatY + dy, 200 + (Math.random()-0.5)*10, 200 + (Math.random()-0.5)*10, 220 + (Math.random()-0.5)*10);
      }
    }
  }
  if (themeName === 'forest') {
    addTrees(baseImage, W, H, variationFactor);
  }
  if (themeName === 'mountain') {
    addMountains(baseImage, scene.colors, variationFactor);
    addTrees(baseImage, W, H, variationFactor);
  }
  if (themeName === 'city') {
    addBuildings(baseImage, W, H, variationFactor);
  }
  if (themeName === 'desert') {
    addDesertDunes(baseImage, W, H, variationFactor);
    addSun(baseImage, W, H, variationFactor);
  }
  if (themeName === 'snow') {
    addSnowGround(baseImage, W, H, variationFactor);
    addSnowTrees(baseImage, W, H, variationFactor);
  }
  if (themeName === 'fantasy') {
    addStars(baseImage, 42, variationFactor);
    addCastle(baseImage, W, H, variationFactor);
  }
  if (themeName === 'fire') {
    for (let i = 0; i < 30 * variationFactor; i++) {
      const fx = Math.floor(((i * 73.1) % W));
      const fh = Math.floor(40 * variationFactor + ((i * 37.3) % 50) * variationFactor);
      for (let h = 0; h < fh; h++) {
        const r = Math.floor(255 - h * 5);
        const g = Math.floor(200 - h * 4);
        const b = Math.floor(50 - h);
        for (let w = -3 - Math.floor(h / 10); w <= 3 + Math.floor(h / 10); w++) {
          setPixel(baseImage, fx + w, Math.floor(H * 0.72) - h, r, g, b);
        }
      }
    }
  }
  if (themeName === 'rain') {
    addBuildings(baseImage, W, H, variationFactor);
    // Rain lines
    for (let i = 0; i < 80 * variationFactor; i++) {
      const rx = Math.floor((i * 73.1) % W);
      const ry = Math.floor((i * 53.7) % H);
      drawLine(baseImage, rx, ry, rx - 3, ry + 15, 174, 194, 224, 1);
    }
  }
  if (themeName === 'night') {
    addStars(baseImage, 42, variationFactor);
    // Moon
    drawCircle(baseImage, Math.floor(W * 0.75), Math.floor(H * 0.15), 35 * variationFactor, 220 + (Math.random()-0.5)*10, 220 + (Math.random()-0.5)*10, 240 + (Math.random()-0.5)*10);
    drawCircle(baseImage, Math.floor(W * 0.77), Math.floor(H * 0.14), 33 * variationFactor, 10, 10, 46); // crescent effect
  }
  if (themeName === 'spring') {
    for (let i = 0; i < 10 * variationFactor; i++) {
      const fx = Math.floor(((i * 73.1 + 20) % (W - 40)) + 20);
      const fy = Math.floor(H * 0.72);
      const colors = [[255, 105, 180], [255, 20, 147], [255, 165, 0], [255, 215, 0], [218, 112, 214]];
      const c = colors[i % colors.length];
      for (let p = 0; p < 5; p++) {
        const angle = (p / 5) * Math.PI * 2;
        drawCircle(baseImage, fx + Math.floor(Math.cos(angle) * 5), fy - 35 + Math.floor(Math.sin(angle) * 5), 4 * variationFactor, c[0], c[1], c[2]);
      }
      drawCircle(baseImage, fx, fy - 35, 3 * variationFactor, 255, 215, 0);
    }
  }

  // Add subtle watermark
  try {
    const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    baseImage.print(font, W - 130, H - 25, 'VideoForge AI');
  } catch (e) {
    // Font loading fallback — skip watermark
  }

  // Generate frames with subtle horizontal scroll animation
  const tempDir = path.join(VIDEOS_DIR, 'tmp_' + jobId);
  fs.mkdirSync(tempDir, { recursive: true });

  // Apply subtle animation per frame (color shift + wave motion)
  for (let f = 0; f < totalFrames; f++) {
    const t = totalFrames > 1 ? f / (totalFrames - 1) : 0;
    const frame = baseImage.clone();

    // Subtle wave animation on water scenes
    if (themeName === 'ocean' || themeName === 'sunset') {
      const waveSpeed = 5 * (1 + (Math.random()-0.5)*0.5); // Vary wave speed
      for (let x = 0; x < W; x += 2) {
        const yOffset = Math.sin(x * 0.008 + t * waveSpeed) * 8 * variationFactor + Math.sin(x * 0.015 + t * waveSpeed * 0.5) * 5 * variationFactor;
        const waveY = Math.floor(H * 0.65 + yOffset);
        setPixel(frame, x, waveY, 100 + (Math.random()-0.5)*10, 200 + (Math.random()-0.5)*10, 255 + (Math.random()-0.5)*10);
        setPixel(frame, x, waveY - 1, 80 + (Math.random()-0.5)*10, 180 + (Math.random()-0.5)*10, 240 + (Math.random()-0.5)*10);
      }
    }

    // Twinkling stars
    if (themeName === 'space' || themeName === 'night' || themeName === 'fantasy') {
      const starTwinkleSpeed = 3 * (1 + (Math.random()-0.5)*0.5);
      for (let i = 0; i < 20 * variationFactor; i++) {
        const sx = Math.floor(((i * 137.5 + 42 + f * 3) % W));
        const sy = Math.floor(((i * 97.3 + 84) % Math.floor(H * 0.6)));
        const brightness = Math.floor(128 + Math.sin(t * starTwinkleSpeed + i * 1.7) * 127 * variationFactor);
        drawCircle(frame, sx, sy, 1 * variationFactor, brightness, brightness, brightness);
      }
    }

    // Fire animation
    if (themeName === 'fire') {
      const fireAnimationSpeed = 10 * (1 + (Math.random()-0.5)*0.5);
      for (let i = 0; i < 20 * variationFactor; i++) {
        const fx = Math.floor(((i * 73.1 + f * fireAnimationSpeed) % W));
        const fh = Math.floor(40 * variationFactor + Math.sin(t * 3 + i * 1.7) * 20 * variationFactor);
        const fy = Math.floor(H * 0.72) - fh;
        drawCircle(frame, fx, fy, 4 * variationFactor, 255, Math.floor(100 + Math.sin(t + i) * 50), 50);
      }
    }

    // Rain animation
    if (themeName === 'rain') {
      const rainAnimationSpeed = 15 * (1 + (Math.random()-0.5)*0.5);
      for (let i = 0; i < 40 * variationFactor; i++) {
        const rx = Math.floor(((i * 73.1 + f * rainAnimationSpeed) % W));
        const ry = Math.floor(((i * 53.7 + f * rainAnimationSpeed * 1.2) % H));
        drawLine(frame, rx, ry, rx - 4 * variationFactor, ry + 18 * variationFactor, 174, 194, 224, 1);
      }
    }

    // Snow animation
    if (themeName === 'snow') {
      const snowAnimationSpeed = 8 * (1 + (Math.random()-0.5)*0.5);
      for (let i = 0; i < 30 * variationFactor; i++) {
        const sx = Math.floor(((i * 73.1 + f * snowAnimationSpeed) % W));
        const sy = Math.floor(((i * 53.7 + f * snowAnimationSpeed * 1.5) % H));
        drawCircle(frame, sx, sy, 2 * variationFactor, 230, 240, 255);
      }
    }

    const idx = String(f).padStart(4, '0');
    await frame.writeAsync(path.join(tempDir, `frame_${idx}.png`));
  }

  // Compile frames into video with ffmpeg
  const args = [
    '-y',
    '-framerate', String(fps),
    '-i', path.join(tempDir, 'frame_%04d.png'),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-preset', 'medium',
    '-crf', '22',
    outputPath
  ];

  return new Promise((resolve, reject) => {
    const proc = execFile(ffmpegPath, args, async (err) => {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
      if (err) {
        reject(new Error(err.message));
      } else {
        resolve({
          jobId,
          videoUrl: `/videos/${jobId}.mp4`,
          outputPath
        });
      }
    });
    proc.stderr.on('data', () => {});
  });
}

module.exports = { generateVideo };

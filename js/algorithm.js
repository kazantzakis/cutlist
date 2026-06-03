// ====================== MAXRECTS BIN PACKING ======================
function maxRectsPacking(parts, stockSheets, kerf, allowRotation, priority, scoreFn) {
  const placedMosaics = [];
  const noFit = [];
  let partsList = [];

  // Build individual part instances
  parts.forEach((p, pi) => {
    for (let i = 0; i < p.qty; i++) {
      partsList.push({
        id: pi,
        w: p.width, h: p.height,
        label: p.label, material: p.material,
        rot: p.rot
      });
    }
  });

  // Sort by priority
  const sortMap = {
    material: (a, b) => (b.w * b.h) - (a.w * a.h),
    cuts: (a, b) => Math.max(b.w, b.h) - Math.max(a.w, a.h),
    balance: (a, b) => (b.w + b.h) - (a.w + a.h) || (b.w * b.h) - (a.w * a.h)
  };
  partsList.sort(sortMap[priority] || sortMap.balance);

  // Expand stock sheets
  const allSheets = [];
  stockSheets.forEach(s => {
    for (let i = 0; i < s.qty; i++) {
      allSheets.push({ w: s.width, h: s.height, label: s.label });
    }
  });
  allSheets.sort((a, b) => (b.w * b.h) - (a.w * a.h));

  // Process each sheet
  for (let si = 0; si < allSheets.length && partsList.length > 0; si++) {
    const sheet = allSheets[si];
    const freeRects = [{ x: 0, y: 0, w: sheet.w, h: sheet.h }];
    const sheetParts = [];
    const unplaced = [];

    for (const part of partsList) {
      const placed = placeMaxRects(part, freeRects, kerf, allowRotation, scoreFn);
      if (placed) {
        sheetParts.push(placed);
      } else {
        unplaced.push(part);
      }
    }

    const totalArea = sheet.w * sheet.h;
    const usedArea = sheetParts.reduce((sum, p) => sum + p.w * p.h, 0);
    placedMosaics.push({
      sheet,
      parts: sheetParts,
      totalArea, usedArea,
      wastedArea: totalArea - usedArea,
      usedRatio: totalArea > 0 ? usedArea / totalArea : 0
    });

    partsList = unplaced;
  }

  // Remaining = couldn't fit
  const noFitMap = {};
  partsList.forEach(p => {
    const key = `${p.w}x${p.h}|${p.label}|${p.material}`;
    if (noFitMap[key]) {
      noFitMap[key].count++;
    } else {
      noFitMap[key] = { width: p.w, height: p.h, label: p.label, material: p.material, count: 1 };
    }
  });

  return { mosaics: placedMosaics, noFit: Object.values(noFitMap) };
}

function placeMaxRects(part, freeRects, kerf, allowRotation, scoreFn) {
  const pw = part.w + kerf;
  const ph = part.h + kerf;
  const sf = scoreFn || bssf;

  let bestIdx = -1;
  let bestScore = Infinity;
  let useRot = false;

  for (let i = 0; i < freeRects.length; i++) {
    const r = freeRects[i];
    // Normal orientation
    if (pw <= r.w && ph <= r.h) {
      const score = sf(pw, ph, r);
      if (score < bestScore) { bestScore = score; bestIdx = i; useRot = false; }
    }
    // Rotated
    if (allowRotation && part.rot !== false && ph <= r.w && pw <= r.h) {
      const score = sf(ph, pw, r);
      if (score < bestScore) { bestScore = score; bestIdx = i; useRot = true; }
    }
  }

  if (bestIdx < 0) return null;

  const r = freeRects[bestIdx];
  const placedW = useRot ? part.h : part.w;
  const placedH = useRot ? part.w : part.h;
  const pw2 = useRot ? ph : pw;
  const ph2 = useRot ? pw : ph;

  const placement = {
    id: part.id,
    x: r.x, y: r.y, w: placedW, h: placedH,
    label: part.label, material: part.material,
    rotated: useRot
  };

  // Split the rectangle (shelf split)
  freeRects.splice(bestIdx, 1);

  // Right rect (remaining width x placed height)
  if (pw2 < r.w) {
    freeRects.push({ x: r.x + pw2, y: r.y, w: r.w - pw2, h: ph2 });
  }
  // Top rect (full width x remaining height)
  if (ph2 < r.h) {
    freeRects.push({ x: r.x, y: r.y + ph2, w: r.w, h: r.h - ph2 });
  }

  // Prune: remove rects contained by others
  pruneFreeRects(freeRects);

  return placement;
}

function bssf(pw, ph, rect) {
  const short = Math.min(rect.w - pw, rect.h - ph);
  const long = Math.max(rect.w - pw, rect.h - ph);
  return short * 10000 + long;
}

function baf(pw, ph, rect) {
  return (rect.w * rect.h) - (pw * ph);
}

function blf(pw, ph, rect) {
  const short = Math.min(rect.w - pw, rect.h - ph);
  const long = Math.max(rect.w - pw, rect.h - ph);
  return long * 10000 + short;
}

function pruneFreeRects(freeRects) {
  for (let i = freeRects.length - 1; i >= 0; i--) {
    const a = freeRects[i];
    if (a.w <= 0 || a.h <= 0) { freeRects.splice(i, 1); continue; }
    for (let j = freeRects.length - 1; j > i; j--) {
      const b = freeRects[j];
      // b contained in a?
      if (b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h) {
        freeRects.splice(j, 1);
      }
      // a contained in b?
      else if (a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h) {
        freeRects.splice(i, 1);
        break;
      }
    }
  }
  // Merge adjacent compatible rects for cleaner output
  let changed = true;
  let iter = 0;
  while (changed && iter++ < 50) {
    changed = false;
    for (let i = 0; i < freeRects.length; i++) {
      for (let j = i + 1; j < freeRects.length; j++) {
        const a = freeRects[i], b = freeRects[j];
        if (a.y === b.y && a.h === b.h && (a.x + a.w === b.x || b.x + b.w === a.x)) {
          freeRects[i] = { x: Math.min(a.x, b.x), y: a.y, w: a.w + b.w, h: a.h };
          freeRects.splice(j, 1);
          changed = true;
          break;
        }
        if (a.x === b.x && a.w === b.w && (a.y + a.h === b.y || b.y + b.h === a.y)) {
          freeRects[i] = { x: a.x, y: Math.min(a.y, b.y), w: a.w, h: a.h + b.h };
          freeRects.splice(j, 1);
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
}

// ====================== GUILLOTINE PACKING ======================
function shelfGuillotinePacking(panels, stockSheets, kerf) {
  let partsList = [];
  panels.forEach((p, pi) => {
    for (let i = 0; i < p.qty; i++) {
      partsList.push({ id: pi, w: p.width, h: p.height, label: p.label, material: p.material, rot: p.rot });
    }
  });
  partsList.sort((a, b) => b.h - a.h || b.w - a.w);

  const allSheets = [];
  stockSheets.forEach(s => {
    for (let i = 0; i < s.qty; i++) allSheets.push({ w: s.width, h: s.height, label: s.label });
  });
  allSheets.sort((a, b) => (b.w * b.h) - (a.w * a.h));

  const placedMosaics = [];

  for (const sheet of allSheets) {
    if (partsList.length === 0) break;
    const sheetParts = [];
    let curY = 0;

    while (curY < sheet.h && partsList.length > 0) {
      let shelfH = 0;
      let firstIdx = -1;
      for (let i = 0; i < partsList.length; i++) {
        const p = partsList[i];
        const minH = Math.min(p.h, p.w);
        if (minH + kerf <= sheet.h - curY) {
          if (firstIdx === -1 || p.h > partsList[firstIdx].h ||
              (p.h === partsList[firstIdx].h && p.w > partsList[firstIdx].w)) {
            firstIdx = i;
          }
        }
      }
      if (firstIdx === -1) break;

      const first = partsList[firstIdx];
      let fw = first.w + kerf, fh = first.h + kerf, fRot = false;
      if (fh > sheet.h - curY && first.w + kerf <= sheet.h - curY) {
        fw = first.h + kerf; fh = first.w + kerf; fRot = true;
      }
      shelfH = fh;

      const placedParts = [{
        id: first.id, x: 0, y: curY,
        w: fRot ? first.h : first.w, h: fRot ? first.w : first.h,
        label: first.label, material: first.material, rotated: fRot
      }];
      let curX = fw;
      partsList.splice(firstIdx, 1);

      for (let i = 0; i < partsList.length; i++) {
        if (curX >= sheet.w) break;
        const p = partsList[i];
        let pw = p.w + kerf, ph = p.h + kerf, rot = false;
        if (ph > shelfH && pw <= shelfH) { const t = pw; pw = ph; ph = t; rot = true; }
        if (ph > shelfH) continue;
        if (curX + pw <= sheet.w) {
          placedParts.push({
            id: p.id, x: curX, y: curY,
            w: rot ? p.h : p.w, h: rot ? p.w : p.h,
            label: p.label, material: p.material, rotated: rot
          });
          curX += pw;
          partsList.splice(i, 1);
          i--;
        }
      }

      sheetParts.push(...placedParts);
      curY += shelfH;
    }

    const totalArea = sheet.w * sheet.h;
    const usedArea = sheetParts.reduce((s, p) => s + p.w * p.h, 0);
    placedMosaics.push({ sheet, parts: sheetParts, totalArea, usedArea, wastedArea: totalArea - usedArea, usedRatio: totalArea > 0 ? usedArea / totalArea : 0 });
  }

  const noFitMap = {};
  partsList.forEach(p => {
    const key = `${p.w}x${p.h}|${p.label}|${p.material}`;
    if (noFitMap[key]) noFitMap[key].count++;
    else noFitMap[key] = { width: p.w, height: p.h, label: p.label, material: p.material, count: 1 };
  });
  return { mosaics: placedMosaics, noFit: Object.values(noFitMap) };
}

function recursiveGuillotinePacking(panels, stockSheets, kerf) {
  let partsList = [];
  panels.forEach((p, pi) => {
    for (let i = 0; i < p.qty; i++) {
      partsList.push({ id: pi, w: p.width, h: p.height, label: p.label, material: p.material, rot: p.rot });
    }
  });
  partsList.sort((a, b) => (b.w * b.h) - (a.w * a.h));

  const allSheets = [];
  stockSheets.forEach(s => {
    for (let i = 0; i < s.qty; i++) allSheets.push({ w: s.width, h: s.height, label: s.label });
  });
  allSheets.sort((a, b) => (b.w * b.h) - (a.w * a.h));

  const placedMosaics = [];

  for (const sheet of allSheets) {
    if (partsList.length === 0) break;
    const result = packGuillotine(sheet.w, sheet.h, partsList, kerf, cfg.allowRotation);
    partsList = result.remaining;
    const sheetParts = result.placed;

    const totalArea = sheet.w * sheet.h;
    const usedArea = sheetParts.reduce((s, p) => s + p.w * p.h, 0);
    placedMosaics.push({ sheet, parts: sheetParts, totalArea, usedArea, wastedArea: totalArea - usedArea, usedRatio: totalArea > 0 ? usedArea / totalArea : 0 });
  }

  const noFitMap = {};
  partsList.forEach(p => {
    const key = `${p.w}x${p.h}|${p.label}|${p.material}`;
    if (noFitMap[key]) noFitMap[key].count++;
    else noFitMap[key] = { width: p.w, height: p.h, label: p.label, material: p.material, count: 1 };
  });
  return { mosaics: placedMosaics, noFit: Object.values(noFitMap) };
}

function packGuillotine(w, h, parts, kerf, allowRotation, offX, offY) {
  if (offX === void 0) offX = 0;
  if (offY === void 0) offY = 0;
  if (parts.length === 0 || w <= 0 || h <= 0) return { placed: [], remaining: parts };

  let bestResult = { placed: [], remaining: parts };
  let bestUsed = 0;
  const searchLimit = Math.min(3, parts.length);

  for (let i = 0; i < searchLimit; i++) {
    const p = parts[i];
    const remaining = [...parts.slice(0, i), ...parts.slice(i + 1)];
    const attempts = [];

    if (p.w + kerf <= w && p.h + kerf <= h)
      attempts.push({ pw: p.w + kerf, ph: p.h + kerf, pw_: p.w, ph_: p.h, rot: false });
    if (allowRotation && p.rot !== false && p.h + kerf <= w && p.w + kerf <= h)
      attempts.push({ pw: p.h + kerf, ph: p.w + kerf, pw_: p.h, ph_: p.w, rot: true });

    for (const a of attempts) {
      // Vertical split: right (full height) + left-below
      const vr = packGuillotine(w - a.pw, h, remaining, kerf, allowRotation, offX + a.pw, offY);
      const vb = packGuillotine(a.pw, h - a.ph, vr.remaining, kerf, allowRotation, offX, offY + a.ph);
      const vPlaced = [
        { id: p.id, x: offX, y: offY, w: a.pw_, h: a.ph_, label: p.label, material: p.material, rotated: a.rot },
        ...vr.placed, ...vb.placed
      ];
      const vUsed = vPlaced.reduce((s, pp) => s + pp.w * pp.h, 0);
      if (vUsed > bestUsed) { bestUsed = vUsed; bestResult = { placed: vPlaced, remaining: vb.remaining }; }

      // Horizontal split: bottom (full width) + top-right
      const hb = packGuillotine(w, h - a.ph, remaining, kerf, allowRotation, offX, offY + a.ph);
      const hr = packGuillotine(w - a.pw, a.ph, hb.remaining, kerf, allowRotation, offX + a.pw, offY);
      const hPlaced = [
        { id: p.id, x: offX, y: offY, w: a.pw_, h: a.ph_, label: p.label, material: p.material, rotated: a.rot },
        ...hb.placed, ...hr.placed
      ];
      const hUsed = hPlaced.reduce((s, pp) => s + pp.w * pp.h, 0);
      if (hUsed > bestUsed) { bestUsed = hUsed; bestResult = { placed: hPlaced, remaining: hr.remaining }; }
    }
  }

  return bestResult;
}

// ====================== CUT DETECTION HELPER ======================
function findCuts(parts, kerf) {
  const cuts = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const a = parts[i], b = parts[j];
      const gx = a.x + a.w + kerf, gxr = b.x + b.w + kerf;
      const gy = a.y + a.h + kerf, gyr = b.y + b.h + kerf;
      // Horizontal cut (vertical gap between left/right neighbors)
      if (Math.abs(gx - b.x) < 0.1 && a.y < b.y + b.h && a.y + a.h > b.y) {
        const overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        cuts.push({ x: a.x + a.w, y1: Math.max(a.y, b.y), y2: Math.min(a.y + a.h, b.y + b.h), len: overlap, horizontal: true, a, b });
      } else if (Math.abs(a.x - gxr) < 0.1 && a.y < b.y + b.h && a.y + a.h > b.y) {
        const overlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
        cuts.push({ x: b.x + b.w, y1: Math.max(a.y, b.y), y2: Math.min(a.y + a.h, b.y + b.h), len: overlap, horizontal: true, a, b });
      }
      // Vertical cut (horizontal gap between top/bottom neighbors)
      if (Math.abs(gy - b.y) < 0.1 && a.x < b.x + b.w && a.x + a.w > b.x) {
        const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        cuts.push({ y: a.y + a.h, x1: Math.max(a.x, b.x), x2: Math.min(a.x + a.w, b.x + b.w), len: overlap, horizontal: false, a, b });
      } else if (Math.abs(a.y - gyr) < 0.1 && a.x < b.x + b.w && a.x + a.w > b.x) {
        const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
        cuts.push({ y: b.y + b.h, x1: Math.max(a.x, b.x), x2: Math.min(a.x + a.w, b.x + b.w), len: overlap, horizontal: false, a, b });
      }
    }
  }
  return cuts;
}

function orderedCuts(parts, kerf) {
  const cuts = findCuts(parts, kerf);
  if (cuts.length <= 1) return cuts;
  const hCuts = cuts.filter(c => !c.horizontal).sort((a, b) => a.y - b.y);
  const vCuts = cuts.filter(c => c.horizontal);
  const result = [];
  for (let i = 0; i <= hCuts.length; i++) {
    const top = i === 0 ? -1e9 : hCuts[i - 1].y;
    const bot = i < hCuts.length ? hCuts[i].y : 1e9;
    if (i < hCuts.length) result.push(hCuts[i]);
    vCuts.filter(c => { const m = (c.y1 + c.y2) / 2; return m > top && m <= bot; })
         .sort((a, b) => a.x - b.x)
         .forEach(c => result.push(c));
  }
  return result;
}

// ====================== ALGORITHM SELECTION ======================
const ALGORITHMS = {
  free: [
    { value: 'maxrects-bssf', label: 'MaxRects BSSF' },
    { value: 'maxrects-baf', label: 'MaxRects BAF' },
    { value: 'maxrects-blf', label: 'MaxRects BLF' }
  ],
  guillotine: [
    { value: 'shelf-2stage', label: 'Shelf 2-Stage' },
    { value: 'recursive', label: 'Recursive' }
  ]
};

function populateAlgorithmMenu(cutType, selectedAlgo) {
  const sel = document.getElementById('opt-algorithm');
  const algos = ALGORITHMS[cutType] || ALGORITHMS.free;
  sel.innerHTML = '';
  algos.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.value;
    opt.textContent = a.label;
    if (a.value === selectedAlgo) opt.selected = true;
    sel.appendChild(opt);
  });
  if (selectedAlgo && !algos.some(a => a.value === selectedAlgo)) {
    sel.value = algos[0].value;
  }
  cfg.algorithm = sel.value;
}

function onCutTypeChange() {
  const ct = document.getElementById('opt-cuttype').value;
  cfg.cutType = ct;
  populateAlgorithmMenu(ct, cfg.algorithm);
}

function onAlgorithmChange() {
  cfg.algorithm = document.getElementById('opt-algorithm').value;
}

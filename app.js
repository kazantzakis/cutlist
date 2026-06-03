// ====================== DATA MODEL ======================
let panels = [];
let stocks = [];
let cfg = {};
let results = null;
let currentSheetIdx = 0;
let selectedPartIdx = -1;
let hoveredPartIdx = -1;
let _drawing = false;

function defaultCfg() {
  return {
    kerf: 3,
    showLabels: true,
    showDimensions: false,
    allowRotation: true,
    enableMaterials: false,
    enableEdgeBanding: false,
    groupSheets: true,
    priority: 'balance',
    unit: 'mm',
    cutType: 'free',
    algorithm: 'maxrects-bssf'
  };
}

// ====================== UI HELPERS ======================
function toggleSection(header) {
  const body = header.nextElementSibling;
  const arrow = header.querySelector('.arrow');
  body.classList.toggle('hidden');
  arrow.classList.toggle('collapsed');
}

function toggleLabels() {
  cfg.showLabels = document.getElementById('opt-labels').checked;
  if (results) drawSheet(currentSheetIdx, results);
}
function toggleDimensions() {
  cfg.showDimensions = document.getElementById('opt-dimensions').checked;
  if (results) drawSheet(currentSheetIdx, results);
}
function toggleUnits() {
  const newUnit = document.getElementById('opt-units').value;
  const oldUnit = cfg.unit || 'mm';
  cfg.unit = newUnit;
  if (oldUnit !== newUnit) {
    const factor = newUnit === 'cm' ? 1 / 10 : 10;
    document.querySelectorAll('#panels-tbody .pw, #panels-tbody .ph, #stock-tbody .sw, #stock-tbody .sh').forEach(inp => {
      if (inp.value) inp.value = (parseFloat(inp.value) * factor).toFixed(1).replace(/\.0$/, '');
    });
  }
  if (results) { drawSheet(currentSheetIdx, results); updateStats(results); }
}
function fmt(v) {
  return cfg.unit === 'cm' ? (v / 10).toFixed(1) : Math.round(v);
}

function toggleTheme() {
  const isDark = document.getElementById('opt-theme').checked;
  document.body.classList.toggle('light-theme', !isDark);
  localStorage.setItem('cutlist_theme', isDark ? 'dark' : 'light');
  if (results) drawSheet(currentSheetIdx, results);
}

function isLightTheme() {
  return document.body.classList.contains('light-theme');
}

function showStatus(msg) {
  const el = document.getElementById('status-message');
  document.getElementById('status-text').textContent = msg;
  el.classList.add('show');
  document.getElementById('btn-calculate').disabled = true;
}

function hideStatus() {
  document.getElementById('status-message').classList.remove('show');
  document.getElementById('btn-calculate').disabled = false;
}

// ====================== PANEL TABLE ======================
function addPanelRow(data) {
  data = data || { width: '', height: '', qty: 1, label: '', material: '', rot: true };
  const tbody = document.getElementById('panels-tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="number" class="pw" value="${data.width}" min="1" step="1" placeholder="w"></td>
    <td><input type="number" class="ph" value="${data.height}" min="1" step="1" placeholder="h"></td>
    <td><input type="number" class="pq" value="${data.qty}" min="1" step="1"></td>
    <td><input type="text" class="pl" value="${data.label}" placeholder="label" style="font-size:11px"></td>
    <td><input type="text" class="pm" value="${data.material}" placeholder="mat" style="font-size:11px"></td>
    <td style="text-align:center"><input type="checkbox" class="pr" ${data.rot ? 'checked' : ''} style="margin:0"></td>
    <td class="row-actions"><button class="del" onclick="this.closest('tr').remove()">×</button></td>
  `;
  tbody.appendChild(tr);
}

function addStockRow(data) {
  data = data || { width: '', height: '', qty: 1, label: '' };
  const tbody = document.getElementById('stock-tbody');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="number" class="sw" value="${data.width}" min="1" step="1" placeholder="w"></td>
    <td><input type="number" class="sh" value="${data.height}" min="1" step="1" placeholder="h"></td>
    <td><input type="number" class="sq" value="${data.qty}" min="1" step="1"></td>
    <td><input type="text" class="sl" value="${data.label}" placeholder="label" style="font-size:11px"></td>
    <td class="row-actions"><button class="del" onclick="this.closest('tr').remove()">×</button></td>
  `;
  tbody.appendChild(tr);
}

function addSamplePanels() {
  const u = (document.getElementById('opt-units')?.value || 'mm') === 'cm' ? 10 : 1;
  addPanelRow({ width: 600 / u, height: 400 / u, qty: 4, label: 'Door', material: 'Oak', rot: true });
  addPanelRow({ width: 300 / u, height: 250 / u, qty: 8, label: 'Shelf', material: 'Oak', rot: true });
  addPanelRow({ width: 200 / u, height: 100 / u, qty: 12, label: 'Drawer', material: 'Oak', rot: true });
  addPanelRow({ width: 500 / u, height: 350 / u, qty: 2, label: 'Side', material: 'Walnut', rot: false });
  addPanelRow({ width: 150 / u, height: 150 / u, qty: 6, label: 'Cube', material: 'Oak', rot: true });
}

function addSampleStock() {
  const u = (document.getElementById('opt-units')?.value || 'mm') === 'cm' ? 10 : 1;
  addStockRow({ width: 2440 / u, height: 1220 / u, qty: 3, label: 'Plywood' });
}

function readTableData() {
  const u = document.getElementById('opt-units').value === 'cm' ? 10 : 1;
  const p = [];
  document.querySelectorAll('#panels-tbody tr').forEach(tr => {
    const w = parseFloat(tr.querySelector('.pw').value) * u;
    const h = parseFloat(tr.querySelector('.ph').value) * u;
    const q = parseInt(tr.querySelector('.pq').value) || 1;
    if (w > 0 && h > 0) {
      p.push({ width: w, height: h, qty: q, label: tr.querySelector('.pl').value, material: tr.querySelector('.pm').value, rot: tr.querySelector('.pr').checked });
    }
  });
  panels = p;

  const s = [];
  document.querySelectorAll('#stock-tbody tr').forEach(tr => {
    const w = parseFloat(tr.querySelector('.sw').value) * u;
    const h = parseFloat(tr.querySelector('.sh').value) * u;
    const q = parseInt(tr.querySelector('.sq').value) || 1;
    if (w > 0 && h > 0) {
      s.push({ width: w, height: h, qty: q, label: tr.querySelector('.sl').value });
    }
  });
  stocks = s;

  cfg = {
    kerf: parseFloat(document.getElementById('opt-kerf').value) || 0,
    showLabels: document.getElementById('opt-labels').checked,
    showDimensions: document.getElementById('opt-dimensions').checked,
    unit: document.getElementById('opt-units').value,
    allowRotation: true,
    enableMaterials: document.getElementById('opt-materials').checked,
    enableEdgeBanding: document.getElementById('opt-edgeband').checked,
    groupSheets: document.getElementById('opt-group').checked,
    priority: document.getElementById('opt-priority').value,
    cutType: document.getElementById('opt-cuttype').value,
    algorithm: document.getElementById('opt-algorithm').value
  };
}

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

// ====================== CUT LINE HIGHLIGHT ======================
function hoverCut(idx) {
  const c = window._cutLines && window._cutLines[idx];
  if (!c) return;
  const line = c.el;
  const len = c.len;
  if (c.raf) cancelAnimationFrame(c.raf);
  line.setAttribute('stroke-width', '5');
  line.setAttribute('stroke-dasharray', len);
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / 500, 1);
    const ease = t * (2 - t);
    line.setAttribute('stroke-dashoffset', Math.round(len * (1 - ease)));
    if (t < 1) c.raf = requestAnimationFrame(step);
  }
  c.raf = requestAnimationFrame(step);
}
function unhoverCut(idx) {
  const c = window._cutLines && window._cutLines[idx];
  if (!c) return;
  const line = c.el;
  if (c.raf) { cancelAnimationFrame(c.raf); c.raf = null; }
  line.setAttribute('stroke-width', '1');
  line.setAttribute('stroke-dasharray', '5,3');
  line.removeAttribute('stroke-dashoffset');
}

// ====================== SVG RENDERING ======================
const PART_COLORS = [
  '#26a69a', '#42a5f5', '#ef5350', '#ab47bc', '#ff7043',
  '#66bb6a', '#ffa726', '#78909c', '#ec407a', '#7e57c2',
  '#26c6da', '#d4e157', '#ffca28', '#8d6e63', '#bdbdbd'
];

function drawResults(results) {
  const canvas = document.getElementById('svg-canvas');
  const rightPanel = document.getElementById('right-panel');

  if (!results || results.mosaics.length === 0) {
    canvas.innerHTML = '<div class="empty-state">Add panels and stock sheets, then click Calculate</div>';
    rightPanel.classList.remove('show');
    return;
  }

  rightPanel.classList.add('show');
  updateStats(results);
  drawSheet(currentSheetIdx, results);

  // Sheet nav
  const nav = document.getElementById('sheet-nav');
  if (results.mosaics.length > 1) {
    nav.style.display = 'flex';
    updateSheetNav(results);
  } else {
    nav.style.display = 'none';
  }
}

function drawSheet(idx, results) {
  const canvas = document.getElementById('svg-canvas');
  if (!results || idx >= results.mosaics.length) return;
  if (_drawing) return;
  _drawing = true;
  try {
    const mosaic = results.mosaics[idx];
  const sheet = mosaic.sheet;
  const parts = mosaic.parts;

  const mL = 70, mT = 70, mR = 14, mB = 70;
  const vbW = sheet.w + mL + mR;
  const vbH = sheet.h + mT + mB;

  canvas.innerHTML = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${vbW} ${vbH}`);
  svg.setAttribute('preserveAspectRatio', 'xMinYMin meet');
  svg.style.display = 'block';
  svg.style.width = '100%';
  svg.style.height = '100%';
  canvas.appendChild(svg);

  // Measure actual on-screen scale to size fonts in readable pixels
  const cw = Math.max(canvas.clientWidth || 0, canvas.parentElement?.clientWidth || 0, 600);
  const ch = Math.max(canvas.clientHeight || 0, canvas.parentElement?.clientHeight || 0, 400);
  const pxPerUnit = Math.min(cw / vbW, ch / vbH);
  // Minimum sizes in screen pixels
  const MIN_LABEL_PX = 14, MIN_DIM_PX = 13, MIN_TITLE_PX = 16, MIN_LEGEND_PX = 13;

  const light = isLightTheme();
  const sheetBg = light ? '#f0f0f0' : '#1e2d35';
  const sheetStroke = light ? '#e0e0e0' : '#455a64';
  const gridStroke = light ? '#ddd' : '#2a3a42';

  // Defs
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
  pat.setAttribute('id', 'g'); pat.setAttribute('width', '20'); pat.setAttribute('height', '20');
  pat.setAttribute('patternUnits', 'userSpaceOnUse');
  const pp = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pp.setAttribute('d', 'M 20 0 L 0 0 0 20');
  pp.setAttribute('stroke', gridStroke); pp.setAttribute('stroke-width', '0.3'); pp.setAttribute('fill', 'none');
  pat.appendChild(pp); defs.appendChild(pat);
  const filt = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filt.setAttribute('id', 'sh');
  const dr = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
  dr.setAttribute('dx', '2'); dr.setAttribute('dy', '2'); dr.setAttribute('stdDeviation', '1'); dr.setAttribute('flood-opacity', '.3');
  filt.appendChild(dr); defs.appendChild(filt);
  svg.appendChild(defs);

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  g.setAttribute('transform', `translate(${mL}, ${mT})`);
  svg.appendChild(g);

  function fs(px) { return Math.round(px / pxPerUnit); }
  function el(tag, attrs) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    g.appendChild(e); return e;
  }

  // Sheet bg
  const bg = el('rect', { width: sheet.w, height: sheet.h, fill: sheetBg, stroke: sheetStroke, 'stroke-width': '2' });
  bg.style.cursor = 'default';
  bg.addEventListener('click', e => { e.stopPropagation(); if (selectedPartIdx !== -1) { selectedPartIdx = -1; drawSheet(idx, results); } });
  el('rect', { width: sheet.w, height: sheet.h, fill: 'url(#g)' });

  // Parts
  const cm = {};
  const dimFs = fs(MIN_DIM_PX);
  parts.forEach((p, pi) => {
    const ci = p.id % PART_COLORS.length;
    if (!cm[p.id]) cm[p.id] = PART_COLORS[ci];
    const pr = el('rect', { x: p.x, y: p.y, width: p.w, height: p.h, fill: cm[p.id], opacity: '.85', filter: 'url(#sh)', rx: '1' });
    pr.setAttribute('data-pi', pi);
    pr.style.cursor = 'pointer';
    pr.addEventListener('click', e => {
      e.stopPropagation();
      const newIdx = selectedPartIdx === pi ? -1 : pi;
      selectedPartIdx = newIdx;
      drawSheet(idx, results);
    });

    if (cfg.showLabels) {
      const minDim = Math.min(p.w, p.h);
      const minLabel = fs(MIN_LABEL_PX);
      const propLabel = Math.round(minDim * 0.14);
      const f1 = Math.max(minLabel, Math.min(propLabel, fs(28)));
      const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
      const t = el('text', { x: cx, y: cy + Math.round(f1 * 0.3), fill: '#fff', 'text-anchor': 'middle', 'font-weight': '600' });
      t.setAttribute('font-size', f1); t.setAttribute('font-family', '-apple-system, sans-serif');
      t.style.pointerEvents = 'none';
      t.textContent = p.label || `${fmt(p.w)}×${fmt(p.h)}`;
      if (p.label) {
        const f2 = Math.max(fs(11), f1 - fs(3));
        const t2 = el('text', { x: cx, y: cy + f1 + Math.round(f2 * 0.3), fill: '#fff', 'text-anchor': 'middle', opacity: '.75' });
        t2.setAttribute('font-size', f2); t2.setAttribute('font-family', '-apple-system, sans-serif');
        t2.style.pointerEvents = 'none';
        t2.textContent = `${fmt(p.w)}×${fmt(p.h)}${p.rotated ? ' ↻' : ''}`;
      }
    }
    if (cfg.showDimensions) {
      const dg = 16;
      const dwy = p.y + dg;
      const dwt = el('text', { x: p.x + p.w / 2, y: dwy + dimFs * 0.4, fill: '#ffd54f', 'text-anchor': 'middle' });
      dwt.setAttribute('font-size', dimFs); dwt.setAttribute('font-family', '-apple-system, sans-serif');
      dwt.style.pointerEvents = 'none';
      dwt.textContent = fmt(p.w);
      const dhx = p.x + dg;
      const dht = el('text', { x: dhx + dimFs * 0.5, y: p.y + p.h / 2, fill: '#ffd54f', 'text-anchor': 'middle' });
      dht.setAttribute('font-size', dimFs); dht.setAttribute('font-family', '-apple-system, sans-serif');
      dht.setAttribute('transform', `rotate(-90, ${dhx + dimFs * 0.5}, ${p.y + p.h / 2})`);
      dht.style.pointerEvents = 'none';
      dht.textContent = fmt(p.h);
    }
    if (selectedPartIdx === pi) {
      const gap = 12;
      // Highlight
      el('rect', { x: p.x - 2, y: p.y - 2, width: p.w + 4, height: p.h + 4, fill: 'none', stroke: '#ffd54f', 'stroke-width': '2', 'stroke-dasharray': '6,3', rx: '2' });
      // Width dimension (inside top)
      const wy = p.y + gap;
      el('line', { x1: p.x, y1: wy, x2: p.x + p.w, y2: wy, stroke: '#ffd54f', 'stroke-width': '0.8' });
      el('line', { x1: p.x, y1: wy - 4, x2: p.x, y2: wy + 4, stroke: '#ffd54f', 'stroke-width': '0.8' });
      el('line', { x1: p.x + p.w, y1: wy - 4, x2: p.x + p.w, y2: wy + 4, stroke: '#ffd54f', 'stroke-width': '0.8' });
      const wt2 = el('text', { x: p.x + p.w / 2, y: wy + dimFs * 0.5, fill: '#ffd54f', 'text-anchor': 'middle' });
      wt2.setAttribute('font-size', dimFs); wt2.setAttribute('font-family', '-apple-system, sans-serif');
      wt2.textContent = fmt(p.w);
      // Height dimension (inside left)
      const hx = p.x + gap;
      el('line', { x1: hx, y1: p.y, x2: hx, y2: p.y + p.h, stroke: '#ffd54f', 'stroke-width': '0.8' });
      el('line', { x1: hx - 4, y1: p.y, x2: hx + 4, y2: p.y, stroke: '#ffd54f', 'stroke-width': '0.8' });
      el('line', { x1: hx - 4, y1: p.y + p.h, x2: hx + 4, y2: p.y + p.h, stroke: '#ffd54f', 'stroke-width': '0.8' });
      const ht2 = el('text', { x: hx + dimFs * 0.7, y: p.y + p.h / 2, fill: '#ffd54f', 'text-anchor': 'middle' });
      ht2.setAttribute('font-size', dimFs); ht2.setAttribute('font-family', '-apple-system, sans-serif');
      ht2.setAttribute('transform', `rotate(-90, ${hx + dimFs * 0.7}, ${p.y + p.h / 2})`);
      ht2.textContent = fmt(p.h);
    }
  });

  // Cut lines
  window._cutLines = [];
  const cuts = orderedCuts(parts, cfg.kerf || 0);
  cuts.forEach((c, i) => {
    const len = c.horizontal ? Math.abs(c.y2 - c.y1) : Math.abs(c.x2 - c.x1);
    const line = c.horizontal
      ? el('line', { x1: c.x, y1: c.y1, x2: c.x, y2: c.y2, stroke: '#ff5722', 'stroke-width': '1', 'stroke-dasharray': '5,3' })
      : el('line', { x1: c.x1, y1: c.y, x2: c.x2, y2: c.y, stroke: '#ff5722', 'stroke-width': '1', 'stroke-dasharray': '5,3' });
    window._cutLines.push({ el: line, len });
  });

  // Width dim (stock sheet or hovered panel)
  const hp = hoveredPartIdx !== -1 ? parts[hoveredPartIdx] : null;
  const dy = sheet.h + 12;
  const wColor = '#ff5722';
  const hColor = '#ff5722';
  if (hp) {
    const px = hp.x, pw = hp.w;
    el('line', { x1: px, y1: dy, x2: px + pw, y2: dy, stroke: wColor, 'stroke-width': '1.5' });
    el('line', { x1: px, y1: dy - 5, x2: px, y2: dy + 5, stroke: wColor, 'stroke-width': '1.5' });
    el('line', { x1: px + pw, y1: dy - 5, x2: px + pw, y2: dy + 5, stroke: wColor, 'stroke-width': '1.5' });
    const wt = el('text', { x: px + pw / 2, y: dy + Math.round(dimFs * 1.2), fill: wColor, 'text-anchor': 'middle' });
    wt.setAttribute('font-size', dimFs); wt.setAttribute('font-family', '-apple-system, sans-serif'); wt.textContent = fmt(hp.w);
    const py = hp.y, ph = hp.h;
    el('line', { x1: -12, y1: py, x2: -12, y2: py + ph, stroke: hColor, 'stroke-width': '1.5' });
    el('line', { x1: -16, y1: py, x2: -8, y2: py, stroke: hColor, 'stroke-width': '1.5' });
    el('line', { x1: -16, y1: py + ph, x2: -8, y2: py + ph, stroke: hColor, 'stroke-width': '1.5' });
    const ht = el('text', { x: -20, y: py + ph / 2, fill: hColor, 'text-anchor': 'middle' });
    ht.setAttribute('font-size', dimFs); ht.setAttribute('font-family', '-apple-system, sans-serif');
    ht.setAttribute('transform', `rotate(-90, ${-20}, ${py + ph / 2})`);
    ht.textContent = fmt(hp.h);
  } else {
    el('line', { x1: 0, y1: dy, x2: sheet.w, y2: dy, stroke: wColor, 'stroke-width': '1.5' });
    el('line', { x1: 0, y1: dy - 5, x2: 0, y2: dy + 5, stroke: wColor, 'stroke-width': '1.5' });
    el('line', { x1: sheet.w, y1: dy - 5, x2: sheet.w, y2: dy + 5, stroke: wColor, 'stroke-width': '1.5' });
    const wt = el('text', { x: sheet.w / 2, y: dy + Math.round(dimFs * 1.2), fill: wColor, 'text-anchor': 'middle' });
    wt.setAttribute('font-size', dimFs); wt.setAttribute('font-family', '-apple-system, sans-serif'); wt.textContent = fmt(sheet.w);
    el('line', { x1: -12, y1: 0, x2: -12, y2: sheet.h, stroke: hColor, 'stroke-width': '1.5' });
    el('line', { x1: -16, y1: 0, x2: -8, y2: 0, stroke: hColor, 'stroke-width': '1.5' });
    el('line', { x1: -16, y1: sheet.h, x2: -8, y2: sheet.h, stroke: hColor, 'stroke-width': '1.5' });
    const ht = el('text', { x: -20, y: sheet.h / 2, fill: hColor, 'text-anchor': 'middle' });
    ht.setAttribute('font-size', dimFs); ht.setAttribute('font-family', '-apple-system, sans-serif');
    ht.setAttribute('transform', `rotate(-90, ${-20}, ${sheet.h / 2})`);
    ht.textContent = fmt(sheet.h);
  }




  } finally { _drawing = false; }
}

// ====================== STATISTICS ======================
function updateStats(results) {
  if (!results || results.mosaics.length === 0) return;

  const mosaic = results.mosaics[currentSheetIdx];
  const allMosaics = results.mosaics;

  // Calculate cuts per mosaic
  allMosaics.forEach(m => {
    const cuts = findCuts(m.parts, cfg.kerf || 0);
    m.cutsTotal = cuts.length;
    m.cutLength = cuts.reduce((sum, c) => sum + c.len, 0);
  });

  // Overall stats
  const totalArea = allMosaics.reduce((s, m) => s + m.totalArea, 0);
  const totalUsed = allMosaics.reduce((s, m) => s + m.usedArea, 0);
  const totalWasted = totalArea - totalUsed;

  const statsGrid = document.getElementById('stats-grid');
  statsGrid.innerHTML = `
    <span class="label">Sheets Used</span><span class="value">${allMosaics.length}</span>
    <span class="label">Used Area</span><span class="value">${totalUsed.toFixed(0)} <span class="sub">(${(totalUsed / totalArea * 100).toFixed(1)}%)</span></span>
    <span class="label">Wasted Area</span><span class="value">${totalWasted.toFixed(0)} <span class="sub">(${(totalWasted / totalArea * 100).toFixed(1)}%)</span></span>
    <span class="label">Total Cuts</span><span class="value">${allMosaics.reduce((s, m) => s + (m.cutsTotal || 0), 0)}</span>
    <span class="label">Total Cut Length</span><span class="value">${fmt(allMosaics.reduce((s, m) => s + (m.cutLength || 0), 0))}</span>
  `;
  document.getElementById('overall-stats').style.display = 'block';

  // Sheet stats
  const usedArea = mosaic.usedArea;
  const wastedArea = mosaic.wastedArea;
  const usedRatio = mosaic.usedRatio;
  const sheetStats = document.getElementById('sheet-stats-grid');
  const nbrPanels = mosaic.parts.length;
  const nbrCuts = mosaic.cutsTotal || 0;
  const cutLen = mosaic.cutLength || 0;

  sheetStats.innerHTML = `
    <span class="label">Stock Panel</span><span class="value">${mosaic.sheet.label || `Sheet ${currentSheetIdx + 1}`} (${fmt(mosaic.sheet.w)}×${fmt(mosaic.sheet.h)})</span>
    <span class="label">Used Area</span><span class="value">${usedArea.toFixed(0)} <span class="sub">(${(usedRatio * 100).toFixed(1)}%)</span></span>
    <span class="label">Wasted Area</span><span class="value">${wastedArea.toFixed(0)} <span class="sub">(${((1 - usedRatio) * 100).toFixed(1)}%)</span></span>
    <span class="label">Panels</span><span class="value">${nbrPanels}</span>
    <span class="label">Cuts</span><span class="value">${nbrCuts}</span>
    <span class="label">Cut Length</span><span class="value">${fmt(cutLen)}</span>
  `;
  document.getElementById('sheet-stats').style.display = 'block';

  // No-fit panels
  const noFitBody = document.getElementById('no-fit-body');
  const noFitSection = document.getElementById('no-fit-section');
  if (results.noFit && results.noFit.length > 0) {
    noFitSection.style.display = 'block';
    noFitBody.innerHTML = results.noFit.map(nf => `
      <tr><td>${fmt(nf.width)}×${fmt(nf.height)}</td><td>${nf.label || '-'}</td><td>${nf.count}</td></tr>
    `).join('');
  } else {
    noFitSection.style.display = 'none';
  }

  // Cuts list
  const cutsBody = document.getElementById('cuts-body');
  const cutsSection = document.getElementById('cuts-section');
  if (nbrCuts > 0) {
    cutsSection.style.display = 'block';
    const cuts = orderedCuts(mosaic.parts, cfg.kerf || 0).map(c => ({
      panelA: `${fmt(c.a.w)}×${fmt(c.a.h)}${c.a.label ? ' ' + c.a.label : ''}`,
      panelB: `${fmt(c.b.w)}×${fmt(c.b.h)}${c.b.label ? ' ' + c.b.label : ''}`,
      coord: c.horizontal ? c.x : c.y,
      horizontal: c.horizontal,
      length: c.len
    }));
    cutsBody.innerHTML = cuts.map((c, i) => `
      <tr onmouseenter="hoverCut(${i})" onmouseleave="unhoverCut(${i})" style="cursor:pointer">
        <td>${i + 1}</td>
        <td>${c.panelA}</td>
        <td>${c.horizontal ? 'x=' : 'y='}${fmt(c.coord)}</td>
        <td>${c.panelA}</td>
        <td>${c.panelB}</td>
      </tr>
    `).join('');
  } else {
    cutsSection.style.display = 'none';
  }

  updateSheetNav(results);
}

function updateSheetNav(results) {
  document.getElementById('sheet-indicator').textContent = `${currentSheetIdx + 1} / ${results.mosaics.length}`;
}

function nextSheet() {
  if (results && currentSheetIdx < results.mosaics.length - 1) {
    currentSheetIdx++;
    selectedPartIdx = -1;
    hoveredPartIdx = -1;
    drawSheet(currentSheetIdx, results);
    updateStats(results);
  }
}

function prevSheet() {
  if (results && currentSheetIdx > 0) {
    currentSheetIdx--;
    selectedPartIdx = -1;
    hoveredPartIdx = -1;
    drawSheet(currentSheetIdx, results);
    updateStats(results);
  }
}

// ====================== CALCULATION ======================
function calculate() {
  readTableData();

  if (panels.length === 0) {
    alert('Add at least one panel.');
    return;
  }
  if (stocks.length === 0) {
    alert('Add at least one stock sheet.');
    return;
  }

  showStatus('Optimizing layout...');

  setTimeout(() => {
    try {
      const parts = panels.map(p => ({ ...p }));
      let result;
      switch (cfg.algorithm) {
        case 'maxrects-bssf':
          result = maxRectsPacking(parts, stocks, cfg.kerf, cfg.allowRotation, cfg.priority, bssf);
          break;
        case 'maxrects-baf':
          result = maxRectsPacking(parts, stocks, cfg.kerf, cfg.allowRotation, cfg.priority, baf);
          break;
        case 'maxrects-blf':
          result = maxRectsPacking(parts, stocks, cfg.kerf, cfg.allowRotation, cfg.priority, blf);
          break;
        case 'shelf-2stage':
          result = shelfGuillotinePacking(parts, stocks, cfg.kerf);
          break;
        case 'recursive':
          result = recursiveGuillotinePacking(parts, stocks, cfg.kerf);
          break;
        default:
          result = maxRectsPacking(parts, stocks, cfg.kerf, cfg.allowRotation, cfg.priority, bssf);
      }

      // Group identical mosaics
      if (cfg.groupSheets && result.mosaics.length > 1) {
        result.mosaics = groupMosaics(result.mosaics);
      }

      results = result;
      currentSheetIdx = 0;
      selectedPartIdx = -1;
      hoveredPartIdx = -1;
      drawResults(results);
      hideStatus();
    } catch (e) {
      console.error(e);
      hideStatus();
      alert('Calculation error: ' + e.message);
    }
  }, 50);
}

function groupMosaics(mosaics) {
  // Group identical layouts
  const groups = [];
  const used = new Set();

  for (let i = 0; i < mosaics.length; i++) {
    if (used.has(i)) continue;
    const group = [mosaics[i]];
    used.add(i);
    for (let j = i + 1; j < mosaics.length; j++) {
      if (used.has(j)) continue;
      if (mosaicsAreEqual(mosaics[i], mosaics[j])) {
        group.push(mosaics[j]);
        used.add(j);
      }
    }
    groups.push({
      ...mosaics[i],
      occurrences: group.length,
      totalArea: mosaics[i].totalArea * group.length,
      usedArea: mosaics[i].usedArea * group.length,
      wastedArea: mosaics[i].wastedArea * group.length
    });
  }
  return groups;
}

function mosaicsAreEqual(a, b) {
  if (a.parts.length !== b.parts.length) return false;
  const sortKey = p => `${p.x},${p.y},${p.w},${p.h},${p.id}`;
  const aSorted = [...a.parts].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  const bSorted = [...b.parts].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  return aSorted.every((p, i) => sortKey(p) === sortKey(bSorted[i]));
}

// ====================== PERSISTENCE ======================
function saveToLocalStorage() {
  readTableData();
  const data = { panels, stocks, cfg };
  localStorage.setItem('cutlist_data', JSON.stringify(data));
  alert('Saved to browser storage.');
}

function loadFromLocalStorage() {
  const raw = localStorage.getItem('cutlist_data');
  if (!raw) { alert('No saved data found.'); return; }
  const data = JSON.parse(raw);
  panels = data.panels || [];
  stocks = data.stocks || [];
  cfg = data.cfg || defaultCfg();

  // Rebuild tables
  document.getElementById('panels-tbody').innerHTML = '';
  document.getElementById('stock-tbody').innerHTML = '';
  panels.forEach(p => addPanelRow(p));
  stocks.forEach(s => addStockRow(s));

  // Options
  document.getElementById('opt-kerf').value = cfg.kerf || 0;
  document.getElementById('opt-labels').checked = cfg.showLabels !== false;
  document.getElementById('opt-dimensions').checked = cfg.showDimensions === true;
  document.getElementById('opt-units').value = cfg.unit || 'mm';
  if (cfg.unit === 'cm') {
    document.querySelectorAll('#panels-tbody .pw, #panels-tbody .ph, #stock-tbody .sw, #stock-tbody .sh').forEach(inp => {
      if (inp.value) inp.value = (parseFloat(inp.value) / 10).toFixed(1).replace(/\.0$/, '');
    });
  }
  document.getElementById('opt-materials').checked = cfg.enableMaterials || false;
  document.getElementById('opt-edgeband').checked = cfg.enableEdgeBanding || false;
  document.getElementById('opt-group').checked = cfg.groupSheets !== false;
  document.getElementById('opt-priority').value = cfg.priority || 'balance';
  document.getElementById('opt-cuttype').value = cfg.cutType || 'free';
  populateAlgorithmMenu(cfg.cutType || 'free', cfg.algorithm || 'maxrects-bssf');

  results = null;
  currentSheetIdx = 0;
  drawResults(null);
}

function resetAll() {
  if (!confirm('Reset all data?')) return;
  panels = [];
  stocks = [];
  cfg = defaultCfg();
  results = null;
  currentSheetIdx = 0;
  document.getElementById('panels-tbody').innerHTML = '';
  document.getElementById('stock-tbody').innerHTML = '';
  document.getElementById('opt-kerf').value = 3;
  document.getElementById('opt-labels').checked = true;
  document.getElementById('opt-dimensions').checked = false;
  document.getElementById('opt-units').value = 'mm';
  document.getElementById('opt-materials').checked = false;
  document.getElementById('opt-edgeband').checked = false;
  document.getElementById('opt-group').checked = true;
  document.getElementById('opt-priority').value = 'balance';
  document.getElementById('opt-cuttype').value = 'free';
  populateAlgorithmMenu('free', 'maxrects-bssf');
  drawResults(null);
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

// ====================== INIT ======================
function init() {
  // Restore theme
  const theme = localStorage.getItem('cutlist_theme');
  const isDark = theme !== 'light';
  document.getElementById('opt-theme').checked = isDark;
  document.body.classList.toggle('light-theme', !isDark);

  // Add default rows
  addSamplePanels();
  addSampleStock();
  cfg = defaultCfg();
  document.getElementById('opt-cuttype').value = 'free';
  populateAlgorithmMenu('free', 'maxrects-bssf');
  drawResults(null);
}

init();

// Hover handler (set up once on the persistent canvas, uses globals)
(function() {
  const canvas = document.getElementById('svg-canvas');
  if (!canvas) return;
  canvas.addEventListener('mousemove', e => {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const pi = target && target.closest('[data-pi]')?.getAttribute('data-pi');
    const newIdx = pi != null ? parseInt(pi) : -1;
    if (newIdx !== hoveredPartIdx) {
      hoveredPartIdx = newIdx;
      if (results) drawSheet(currentSheetIdx, results);
    }
  });
})();

// Responsive resize
let ro;
if (window.ResizeObserver) {
  ro = new ResizeObserver(() => { if (results) drawSheet(currentSheetIdx, results); });
  window.addEventListener('load', () => {
    const c = document.getElementById('svg-canvas');
    if (c) ro.observe(c);
  });
}

// Sidebar resize
(function() {
  const handle = document.getElementById('sidebar-resize-handle');
  const sidebar = document.getElementById('sidebar');
  if (!handle || !sidebar) return;
  let dragging = false;
  handle.addEventListener('mousedown', e => {
    dragging = true; handle.classList.add('active');
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    const w = Math.max(260, Math.min(600, e.clientX));
    document.documentElement.style.setProperty('--sidebar-width', w + 'px');
    if (ro) ro.disconnect();
    setTimeout(() => { if (ro) ro.observe(document.getElementById('svg-canvas')); }, 50);
  });
  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false; handle.classList.remove('active');
  });
})();

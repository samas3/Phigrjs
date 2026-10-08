const ba_ease = (p, type) => {
    if (type === 13) return 0; // Zero
    if (type === 14) return 1; // One
    p = Math.max(0, Math.min(1, p));
    if (type === 0) return p; // Linear
    const n = Math.floor((type - 1) / 3) + 2; // 1-3→2, 4-6→3, 7-9→4, 10-12→5
    const g = type % 3;
    if (g === 1) return Math.pow(p, n); // In
    if (g === 2) return 1 - Math.pow(1 - p, n); // Out
    return p < 0.5 ? 0.5 * Math.pow(2 * p, n)
                   : 1 - 0.5 * Math.pow(2 - 2 * p, n); // InOut
};

const ba_sample2D = (t, events, key, def) => {
    if (!events || events.length === 0) return { x: def.x, y: def.y };
    let j = -1;
    for (let i = 0; i < events.length; i++) {
        if (events[i].time <= t) j = i; else break;
    }
    if (j === -1) return { x: def.x, y: def.y };
    const n = events.length;
    if (j === n - 1) return { x: events[j][key].x, y: events[j][key].y };
    const prev = events[j], cur = events[j + 1];
    const span = cur.time - prev.time;
    const p = span > 0 ? (t - prev.time) / span : 1;
    const fx = ba_ease(p, cur.easeTypeX);
    const fy = ba_ease(p, cur.easeTypeY);
    return {
        x: prev[key].x + (cur[key].x - prev[key].x) * fx,
        y: prev[key].y + (cur[key].y - prev[key].y) * fy
    };
};

const ba_sample1D = (t, events, key, def) => {
    if (!events || events.length === 0) return def;
    let j = -1;
    for (let i = 0; i < events.length; i++) {
        if (events[i].time <= t) j = i; else break;
    }
    if (j === -1) return def;
    const n = events.length;
    if (j === n - 1) return events[j][key];
    const prev = events[j], cur = events[j + 1];
    const span = cur.time - prev.time;
    const p = span > 0 ? (t - prev.time) / span : 1;
    return prev[key] + (cur[key] - prev[key]) * ba_ease(p, cur.easeType);
};

const ba_state = (t, ba) => {
    if (t < ba.appearTime) return 'hiddenBefore';
    if (t >= ba.disappearTime) return 'hiddenAfter';
    if (t >= ba.enableTime && t < ba.disableTime) return 'active';
    if (t >= ba.disableTime) return 'disabled';
    const readyStart = Math.max(ba.appearTime, ba.enableTime - 0.5);
    return (t >= readyStart) ? 'ready' : 'disabled';
};

const ba_alpha = (t, ba) => {
    if (t < ba.appearTime || t >= ba.disappearTime) return 0;
    if (ba.appearTime >= ba.enableTime) return 1;
    return Math.min(1, (t - ba.appearTime) / 0.5);
};

const getAnchor = (events, t, def) => {
    if (!events || events.length === 0) return def;
    let j = -1;
    for (let i = 0; i < events.length; i++) {
        if (events[i].time <= t) j = i; else break;
    }
    if (j === -1) return events[0].anchor || def;
    const n = events.length;
    const target = events[j];
    return target.anchor || def;
};

// 噪域离屏 canvas（mask + color）
const baMaskCv = document.createElement("canvas");
const baMaskCtx = baMaskCv.getContext("2d");
const baColorCv = document.createElement("canvas");
const baColorCtx = baColorCv.getContext("2d");

const baFillQuad = (bctx, pts) => {
    bctx.beginPath();
    bctx.moveTo(pts[0].x, pts[0].y);
    bctx.lineTo(pts[1].x, pts[1].y);
    bctx.lineTo(pts[2].x, pts[2].y);
    bctx.lineTo(pts[3].x, pts[3].y);
    bctx.closePath();
    bctx.fill();
};

const prepBlockAreas = (chart) => {
    const list = chart.blockAreaList;
    if (!list) { chart.blockAreaGeoms = null; return; }
    chart.blockAreaGeoms = [];
    for (const ba of list) {
        const bl = ba.bottomLeftPercentage, tr = ba.topRightPercentage;
        const x0 = Math.min(bl.x, tr.x), x1 = Math.max(bl.x, tr.x);
        const y0 = Math.min(bl.y, tr.y), y1 = Math.max(bl.y, tr.y);
        // if (!(x1 > x0) || !(y1 > y0)) { chart.blockAreaGeoms.push(null); continue; }
        chart.blockAreaGeoms.push({
            cx: (x0 + x1) / 2, cy: (y0 + y1) / 2,
            hw: (x1 - x0) / 2, hh: (y1 - y0) / 2,
            isSubtract: ba.isSubtract || false,
        });
    }
};

// 所有坐标均为 { x, y } 形式

const ba_translate = (pt, g, mp) => ({
    x: pt.x + (mp.x - g.cx),
    y: pt.y + (mp.y - g.cy),
});

const ba_rotate = (pt, rot, rA) => {
    const rad = rot * Math.PI / 180;
    const c = Math.cos(rad), s = Math.sin(rad);
    const dx = pt.x - rA.x, dy = pt.y - rA.y;
    return { x: rA.x + dx * c - dy * s, y: rA.y + dx * s + dy * c};
};

const ba_scale = (pt, sc, sA) => ({
    x: sA.x + (pt.x - sA.x) * sc.x,
    y: sA.y + (pt.y - sA.y) * sc.y,
});

const renderBlockAreas = (t, w, h) => {
    const geoms = C.chart.data.blockAreaGeoms;
    const list = C.chart.data.blockAreaList;
    if (!geoms || !list || !C.settings.showBlockArea) return [];
    let traceBAs = [];

    const P = (v) => ({ x: v.x * w, y: (1 - v.y) * h });

    const normals = [], subtracts = [];
    for (let i = 0; i < geoms.length; i++) {
        const g = geoms[i];
        const state = ba_state(t, list[i]);
        const alpha = ba_alpha(t, list[i]);
        const id = 'b' + i;
        // if (state === 'hiddenBefore') break;
        if (!C.settings.traceList.includes(id)) {
            if (!g) continue;
            if (state === 'hiddenAfter') continue;
            if (alpha <= 0) continue;
        }

        const ba = list[i];
        const rot = ba_sample1D(t, ba.rotateEvents, "rotation", 0);
        const rAp = getAnchor(ba.rotateEvents, t, { x: g.cx, y: g.cy });
        const sc = ba_sample2D(t, ba.scaleEvents, "scale", { x: 1, y: 1 });
        const sAp = getAnchor(ba.scaleEvents, t, { x: g.cx, y: g.cy });
        const mpP = ba_sample2D(t, ba.moveEvents, "endPosition", { x: g.cx, y: g.cy });

        const gpx = { cx: g.cx * w, cy: (1 - g.cy) * h, hw: g.hw * w, hh: g.hh * h };
        let rA = P(rAp);
        let sA = P(sAp);
        let mp = P(mpP);

        const cs = [
            { x: gpx.cx - gpx.hw, y: gpx.cy - gpx.hh},
            { x: gpx.cx + gpx.hw, y: gpx.cy - gpx.hh},
            { x: gpx.cx + gpx.hw, y: gpx.cy + gpx.hh},
            { x: gpx.cx - gpx.hw, y: gpx.cy + gpx.hh},
        ];

        const applyAll = (pt) => {
            pt = ba_scale(pt, sc, sA);
            pt = ba_rotate(pt, -rot, rA);
            pt = ba_translate(pt, gpx, mp);
            return pt;
        };

        const pts = cs.map(applyAll);
        const entry = { pts, alpha, state, id, gpx, rot, rA, sc, sA, mp };
        if (C.settings.traceList.includes(id)) {
            traceBAs.push(entry);
        }
        (g.isSubtract ? subtracts : normals).push(entry);
    }
    if (normals.length + subtracts.length === 0) return [];

    if (baMaskCv.width !== w || baMaskCv.height !== h) {
        baMaskCv.width = w; baMaskCv.height = h;
        baColorCv.width = w; baColorCv.height = h;
    }

    // ① 构建对称差 mask（白=显示，透明=取消）
    baMaskCtx.clearRect(0, 0, w, h);
    baMaskCtx.globalCompositeOperation = 'source-over';
    baMaskCtx.fillStyle = '#fff';
    for (const a of normals) baFillQuad(baMaskCtx, a.pts);
    if (subtracts.length > 0) {
        baMaskCtx.globalCompositeOperation = 'xor';
        for (const a of subtracts) baFillQuad(baMaskCtx, a.pts);
    }

    // ② 构建颜色层（按状态上色）
    baColorCtx.clearRect(0, 0, w, h);
    baColorCtx.globalCompositeOperation = 'source-over';
    for (const a of [...normals, ...subtracts]) {
        baColorCtx.globalAlpha = a.alpha * 0.3;
        baColorCtx.fillStyle = a.state === "active" ? 'rgb(180, 0, 0)' : 'rgb(255, 150, 150)';
        baFillQuad(baColorCtx, a.pts);

        if (C.settings.showHitPoint) {
            ctx.fillTextEx(a.id,
                (a.pts[0].x + a.pts[1].x + a.pts[2].x + a.pts[3].x) / 4,
                (a.pts[0].y + a.pts[1].y + a.pts[2].y + a.pts[3].y) / 4,
                `${0.03 * h}px Saira`, 'red', 'middle center');
        }
    }

    // ③ mask 裁剪 color：保留 mask 白色像素，透明处清除
    baColorCtx.globalCompositeOperation = 'destination-in';
    baColorCtx.globalAlpha = 1;
    baColorCtx.drawImage(baMaskCv, 0, 0);

    // ④ 合成到主画布
    ctx.drawImage(baColorCv, 0, 0);
    return traceBAs;
};

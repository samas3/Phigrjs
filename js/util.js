// class
class PressEvent {
    static id = 0;
    constructor(time, key) {
        this.id = PressEvent.id++;
        this.time = time;
        this.key = key;
        this.type = 'pressed';
    }
}

class JudgeManager {
    constructor(numOfNotes) {
        this.numOfNotes = numOfNotes;
        this.combo = 0;
        this.maxCombo = 0;
        this.judges = [0, 0, 0, 0, 0, 0, 0, 0];
        this.error = [];

        this.pool = []; // Event池
        this.time = 0;
        this.ended = false;
        this.allNotes = [];
    }
    get perfect() {
        return this.judges[C.judge_result.PerfectEarly] + this.judges[C.judge_result.PerfectMax] + this.judges[C.judge_result.PerfectLate];
    }
    get good() {
        return this.judges[C.judge_result.GoodEarly] + this.judges[C.judge_result.GoodLate];
    }
    get bad() {
        return this.judges[C.judge_result.BadEarly] + this.judges[C.judge_result.BadLate];
    }
    get miss() {
        return this.judges[C.judge_result.Miss];
    }
    get acc() {
        let total = this.judges.reduce((acc, cur) => acc + cur, 0);
        if (total === 0) return 0;
        return (this.perfect + this.good * 0.65) / total;
    }
    get score() {
        let score = 0;
        score += this.maxCombo / this.numOfNotes * 100000;
        score += (this.perfect + this.good * 0.65) / this.numOfNotes * 900000;
        return score;
    }
    get avgError() {
        if (this.error.length === 0) return 0;
        return this.error.reduce((acc, cur) => acc + cur, 0) / this.error.length;
    }
    get FCAPStatus() { // 2=AP, 1=FC, 0=Other
        if (this.miss + this.bad > 0) return 0;
        if (this.good > 0) return 1;
        return 2;
    }
    reset() {
        this.combo = 0;
        this.maxCombo = 0;
        this.judges = [0, 0, 0, 0, 0, 0, 0, 0, 0];
        this.error.length = 0;
        this.pool.length = 0;
        this.time = 0;
        this.ended = false;
    }
    addError(err) {
        this.error.push(Math.abs(err));
    }
    isPressing() {
        return this.pool.length > 0;
    }
    hasKey(code) {
        return this.pool.some(e => e.key === code);
    }
    findNearestEvent(time) {
        let events = [];
        for (let event of this.pool) {
            if (Math.abs(event.time - time) < C.judgeTime[2] && event.type != 'clicked') events.push(event);
        }
        if (events.length === 0) return null;
        events.sort((a, b) => Math.abs(a.time - time) - Math.abs(b.time - time));
        return events[0];
    }
    addJudge(judge) {
        this.judges[judge]++;
        let combo = [C.judge_result.GoodEarly, C.judge_result.PerfectEarly, C.judge_result.PerfectMax, C.judge_result.PerfectLate, C.judge_result.GoodLate];
        if (combo.includes(judge)) {
            this.combo++;
            this.maxCombo = Math.max(this.maxCombo, this.combo);
        } else {
            this.combo = 0;
        }
    }
}

// algos
const tween = [null,
    pos => pos, //1
	pos => Math.sin(pos * Math.PI / 2), //2
	pos => 1 - Math.cos(pos * Math.PI / 2), //3
	pos => 1 - (pos - 1) ** 2, //4
	pos => pos ** 2, //5
	pos => (1 - Math.cos(pos * Math.PI)) / 2, //6
	pos => ((pos *= 2) < 1 ? pos ** 2 : -((pos - 2) ** 2 - 2)) / 2, //7
	pos => 1 + (pos - 1) ** 3, //8
	pos => pos ** 3, //9
	pos => 1 - (pos - 1) ** 4, //10
	pos => pos ** 4, //11
	pos => ((pos *= 2) < 1 ? pos ** 3 : ((pos - 2) ** 3 + 2)) / 2, //12
	pos => ((pos *= 2) < 1 ? pos ** 4 : -((pos - 2) ** 4 - 2)) / 2, //13
	pos => 1 + (pos - 1) ** 5, //14
	pos => pos ** 5, //15
	pos => 1 - 2 ** (-10 * pos), //16
	pos => 2 ** (10 * (pos - 1)), //17
	pos => Math.sqrt(1 - (pos - 1) ** 2), //18
	pos => 1 - Math.sqrt(1 - pos ** 2), //19
	pos => (2.70158 * pos - 1) * (pos - 1) ** 2 + 1, //20
	pos => (2.70158 * pos - 1.70158) * pos ** 2, //21
	pos => ((pos *= 2) < 1 ? (1 - Math.sqrt(1 - pos ** 2)) : (Math.sqrt(1 - (pos - 2) ** 2) + 1)) / 2, //22
	pos => pos < 0.5 ? (14.379638 * pos - 5.189819) * pos ** 2 : (14.379638 * pos - 9.189819) * (pos - 1) ** 2 + 1, //23
	pos => 1 - 2 ** (-10 * pos) * Math.cos(pos * Math.PI / .15), //24
	pos => 2 ** (10 * (pos - 1)) * Math.cos((pos - 1) * Math.PI / .15), //25
	pos => ((pos *= 11) < 4 ? pos ** 2 : pos < 8 ? (pos - 6) ** 2 + 12 : pos < 10 ? (pos - 9) ** 2 + 15 : (pos - 10.5) ** 2 + 15.75) / 16, //26
	pos => 1 - tween[26](1 - pos), //27
	pos => (pos *= 2) < 1 ? tween[26](pos) / 2 : tween[27](pos - 1) / 2 + .5, //28
	pos => pos < 0.5 ? 2 ** (20 * pos - 11) * Math.sin((160 * pos + 1) * Math.PI / 18) : 1 - 2 ** (9 - 20 * pos) * Math.sin((160 * pos + 1) * Math.PI / 18) //29
];

const easing = (t, st, et, sv, ev, type = 1, el = 0, er = 1) => {
    if (t <= st) return sv;
    if (t >= et) return ev;
    let progress = (t - st) / (et - st);
    progress = el + (er - el) * progress;
    progress = Math.min(1, Math.max(0, progress));

    return sv + (ev - sv) * tween[type](progress);
}

const BEZIER_INTERPOLATION_DENSITY = 256;
const BEZIER_INTERPOLATION_STEP = 1 / BEZIER_INTERPOLATION_DENSITY;

class BezierEasing {
    constructor(cp1, cp2) {
        const xs = new Float64Array(BEZIER_INTERPOLATION_DENSITY - 1);
        const ys = new Float64Array(BEZIER_INTERPOLATION_DENSITY - 1);
        const jumper = new Uint8Array(BEZIER_INTERPOLATION_DENSITY);
        let nextToFill = 0;
        for (let i = 1; i < BEZIER_INTERPOLATION_DENSITY; i++) {
            const t = i * BEZIER_INTERPOLATION_STEP;
            const s = 1 - t;
            const x = 3 * cp1[0] * Math.pow(s, 2) * t + 3 * cp2[0] * Math.pow(t, 2) * s + Math.pow(t, 3);
            xs[i - 1] = x;
            ys[i - 1] = 3 * cp1[1] * Math.pow(s, 2) * t + 3 * cp2[1] * Math.pow(t, 2) * s + Math.pow(t, 3);
            for (; x > nextToFill * BEZIER_INTERPOLATION_STEP; nextToFill++) {
                jumper[nextToFill] = i - 1;
            }
        }

        this.xs = xs;
        this.ys = ys;
        this.jumper = jumper;
        this.cp1 = cp1;
        this.cp2 = cp2;
    }
    getValue(t) {
        if (t === 0 || t === 1) return t;
        let index = this.jumper[Math.floor(t * BEZIER_INTERPOLATION_DENSITY)];
        const xs = this.xs;
        const ys = this.ys;
        let next;
        for (; index < BEZIER_INTERPOLATION_DENSITY - 1; index++) {
            next = xs[index + 1];
            if (t < next) {
                break;
            }
        }
        const atLastSegment = index === BEZIER_INTERPOLATION_DENSITY - 1;
        const here = atLastSegment ? 1 : xs[index];
        const yhere = atLastSegment ? 1 : ys[index];
        const yprev = ys[index - 1] || 0;
        const k = (yprev - yhere) / ((xs[index - 1] || 0) - here);
        return k * (t - here) + yhere;
    }
}

const rotate_point = (x, y, r, deg) => {
    return [
        x + r * Math.cos(deg * Math.PI / 180),
        y + r * Math.sin(deg * Math.PI / 180)
    ];
};

// file
const load_audio = async url => {
    const resp = await fetch(url);
    const arrayBuffer = await resp.arrayBuffer();
    const audioBuffer = await actx.decodeAudioData(arrayBuffer);
    return audioBuffer;
};

const play_sound = async (buf, loop=false) => {
    const source = actx.createBufferSource();
    source.loop = loop;
    source.buffer = buf;
    source.connect(actx.destination);
    source.start();
};

const load_img = async url => {
    const img = new Image();
    await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
    });

    return img;
};

const load_json = async url => {
    const resp = await fetch(url);
    const json = await resp.json();
    return json;
};

const load_chart = async url => {
    const resp = await fetch(url);
    const text = await resp.text();
    try {
        const json = JSON.parse(text);
        if (json.META) {
            // rpe
            throw new Error("RPE format");
        }
        return [json, null];
    } catch (e) {
        if (e instanceof SyntaxError) { // not rpe
            try {
                const res = parse(text);
                return [JSON.parse(res.data), null, null];
            } catch (ex) {
                console.error("PEC parse failed:", ex);
                return [null, null];
            }
        } else if (e.message === "RPE format") { // rpe
            try {
                const res = parseRPE(text);
                return [JSON.parse(res.data), res.info, res.line];
            } catch (ex) {
                console.error("RPE parse failed:", ex);
                return [null, null];
            }
        }
    }
};

const load_csv = async url => {
    const resp = await fetch(url);
    const text = await resp.text();
    const lines = text.split("\n");
    const data = lines.map(line => line.split(","));
    const obj = {};
    for (let i = 0; i < data[0].length; i++) {
        obj[data[0][i].trim()] = data[1][i] ? data[1][i].trim() : "";
    }
    return obj;
};

const load_audioele = async url => {
    const audio = new Audio(url);
    await new Promise((resolve, reject) => {
        audio.oncanplaythrough = resolve;
        audio.onerror = reject;
    });
    return audio;
};

// canvas prototype
CanvasRenderingContext2D.prototype.fillRectEx = function (x, y, w, h, c) {
    this.save();
    this.beginPath();
    this.rect(x, y, w, h);
    this.fillStyle = c;
    this.fill();
    this.restore();
}; 

CanvasRenderingContext2D.prototype.fillTextEx = function (t, x, y, f, color = 'white', align = 'top left') {
    this.save();
    this.font = f;
    this.fillStyle = color;
    const [baseline, alignh] = align.split(' ');
    this.textBaseline = baseline;
    this.textAlign = alignh;
    this.fillText(t, x, y);
    this.restore();
};

CanvasRenderingContext2D.prototype.drawCenterScaledText = function (text, x, y, scaleX, scaleY, f, color = 'white') {
    this.save();
    this.font = f;
    this.fillStyle = color;
    this.translate(x, y);
    this.scale(scaleX, scaleY);
    this.textBaseline = 'middle';
    this.textAlign = 'center';
    this.fillText(text, 0, 0);
    this.restore();
};

CanvasRenderingContext2D.prototype.drawCenterRotateImage = function (img, x, y, w, h, deg, alpha = 1) {
    this.save();
    this.translate(x, y);
    this.rotate(deg * Math.PI / 180);
    this.globalAlpha *= alpha;
    this.drawImage(img, -w / 2, -h / 2, w, h);
    this.restore();
};

CanvasRenderingContext2D.prototype.drawBCRotateImage = function (img, x, y, w, h, deg) {
    this.save();
    this.translate(x, y + h / 2);
    this.rotate(deg * Math.PI / 180);
    this.drawImage(img, -w / 2, -h, w, h);
    this.restore();
};

// image
const clip_img = (img, y0, y1) => {
    const tempcv = document.createElement("canvas");
    tempcv.width = img.width;
    tempcv.height = y1 - y0;
    const tempctx = tempcv.getContext("2d");
    tempctx.drawImage(img, 0, -y0);
    return tempcv;
};

const clip_block_img = (img, x0, y0, x1, y1) => {
    const tempcv = document.createElement("canvas");
    tempcv.width = x1 - x0;
    tempcv.height = y1 - y0;
    const tempctx = tempcv.getContext("2d");
    tempctx.drawImage(img, -x0, -y0);
    return tempcv;
};

const clip_hold = (img, atlas) => {
    const tail = clip_img(img, 0, atlas[0]);
    const body = clip_img(img, atlas[0], img.height - atlas[1]);
    const head = clip_img(img, img.height - atlas[1], atlas[1]);

    return [head, body, tail];
};

const get_blur_img = (img, r) => {
    r *= (img.width + img.height);
    const tempcv = document.createElement("canvas");
    tempcv.width = img.width;
    tempcv.height = img.height;
    const tempctx = tempcv.getContext("2d");
    const morescale = Math.max(r / img.width, r / img.height);
    tempctx.scale(1 + morescale, 1 + morescale);
    tempctx.translate(-r / 2, -r / 2);
    tempctx.filter = `blur(${r}px)`;
    tempctx.drawImage(img, 0, 0);
    return tempcv;
};

const cv_put_color = (cv, color) => {
    const ctx = cv.getContext("2d");
    const imgdata = ctx.getImageData(0, 0, cv.width, cv.height);
    for (let i = 0; i < imgdata.data.length; i += 4) {
        imgdata.data.set([
            Math.floor(imgdata.data[i] * color[0] / 0xff),
            Math.floor(imgdata.data[i + 1] * color[1] / 0xff),
            Math.floor(imgdata.data[i + 2] * color[2] / 0xff),
            imgdata.data[i + 3]
        ], i);
    }
    ctx.putImageData(imgdata, 0, 0);
    return cv;
};

// chart
const find_event = (t, es) => {
    let l = 0, r = es.length - 1;

    while (l <= r) {
        const m = Math.floor((l + r) / 2);
        const e = es[m];

        if (e.startTime <= t && t <= e.endTime) {
            return m;
        } else if (e.startTime > t) {
            r = m - 1;
        } else {
            l = m + 1;
        }
    }

    return -1;
};

const init_speed_events = es => {
    let fp = 0.0;

    for (const e of es) {
        e.floorPosition = fp;
        fp += (e.endTime - e.startTime) * e.value;
    }
};

const merge_notes = (above, below) => {
    for (const note of above) {
        note.is_above = true;
    }
    for (const note of below) {
        note.is_above = false;
    }

    return [...above, ...below];
};

const init_note_fp = (notes, ses) => {
    for (const note of notes) {
        note.floorPosition = get_fp(note.time, ses);
    }
};

const get_event_val = (t, es, sn = "start", en = "end") => {
    const i = find_event(t, es);
    if (i === -1) {
        return null;
    }

    const e = es[i];
    if (typeof e[sn] !== "number") {
        return e[sn];
    }
    if (Array.isArray(e[sn])) {
        const result = [];
        for (let idx = 0; idx < e[sn].length; idx++) {
            result.push(easing(t, e.startTime, e.endTime, e[sn][idx], e[en][idx], e.easingType, e.easingLeft, e.easingRight));
        }
        return result;
    }

    return easing(t, e.startTime, e.endTime, e[sn], e[en], e.easingType || 1, e.easingLeft || 0, e.easingRight || 1);
};

const get_fp = (t, es) => {
    const i = find_event(t, es);
    if (i === -1) {
        return 0.0;
    }

    const e = es[i];
    return e.floorPosition + (t - e.startTime) * e.value;
};

const fill_event = events => {
    if (!events || events.length === 0) return [];
    const result = [];
    if (events[0].startTime > 0) {
        result.push({
            startTime: 0,
            endTime: events[0].startTime,
            start: events[0].start,
            end: events[0].start,
            start2: events[0].start2,
            end2: events[0].start2
        });
    }
    events.forEach((e, i) => {
        result.push(e);
        if (i === events.length - 1) return;
        if (e.endTime < events[i + 1].startTime) {
            result.push({
                startTime: e.endTime,
                endTime: events[i + 1].startTime,
                start: e.end,
                end: e.end,
                start2: e.end2,
                end2: e.end2
            });
        }
    });
    const last = events[events.length - 1];
    result.push({
        startTime: last.endTime,
        endTime: 1e9,
        start: last.end,
        end: last.end,
        start2: last.end2 !== null ? last.end2 : null,
        end2: last.end2 !== null ? last.end2 : null
    });
    return result;
}

const regulate_chart = chart => {
    for (const line of chart.judgeLineList) {
        line.speedEvents.sort((a, b) => a.startTime - b.startTime);
        line.judgeLineRotateEvents.sort((a, b) => a.startTime - b.startTime);
        line.judgeLineMoveEvents.sort((a, b) => a.startTime - b.startTime);
        line.judgeLineDisappearEvents.sort((a, b) => a.startTime - b.startTime);
        if (line.colorEvents) line.colorEvents.sort((a, b) => a.startTime - b.startTime);
        if (line.textEvents) line.textEvents.sort((a, b) => a.startTime - b.startTime);
        if (line.scaleXEvents) line.scaleXEvents.sort((a, b) => a.startTime - b.startTime);
        if (line.scaleYEvents) line.scaleYEvents.sort((a, b) => a.startTime - b.startTime);

        line.speedEvents = fill_event(line.speedEvents);
        line.judgeLineRotateEvents = fill_event(line.judgeLineRotateEvents);
        line.judgeLineMoveEvents = fill_event(line.judgeLineMoveEvents);
        line.judgeLineDisappearEvents = fill_event(line.judgeLineDisappearEvents);
        line.colorEvents = fill_event(line.colorEvents);
        line.textEvents = fill_event(line.textEvents);
        line.scaleXEvents = fill_event(line.scaleXEvents);
        line.scaleYEvents = fill_event(line.scaleYEvents);
        if (line.scaleXEvents.length === 0) {
            line.scaleXEvents.push({
                startTime: 0,
                endTime: 1e9,
                start: 1,
                end: 1
            });
        }
        if (line.scaleYEvents.length === 0) {
            line.scaleYEvents.push({
                startTime: 0,
                endTime: 1e9,
                start: 1,
                end: 1
            });
        }
    }
    
    if (chart.blockAreaList) {
        for (const ba of chart.blockAreaList) {
            if (ba.rotateEvents) ba.rotateEvents.sort((a, b) => a.time - b.time);
            if (ba.moveEvents) ba.moveEvents.sort((a, b) => a.time - b.time);
            if (ba.scaleEvents) ba.scaleEvents.sort((a, b) => a.time - b.time);
        }
    }
    return chart;
};

// tool
const prettify_time = (t) => {
    let m = Math.floor(t / 60);
    let s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
};

const format_number = (x) => {
    if (!Number.isFinite(x)) return x;
    return x.toFixed(2);
}

const removeIf = (arr, predicate) => {
    if (!Array.isArray(arr) || typeof predicate !== 'function') {
        return 0;
    }
    let writeIndex = 0;
    let removedCount = 0;

    for (let readIndex = 0; readIndex < arr.length; readIndex++) {
        const shouldRemove = predicate(arr[readIndex], readIndex, arr);
        
        if (!shouldRemove) {
            if (writeIndex !== readIndex) {
                arr[writeIndex] = arr[readIndex];
            }
            writeIndex++;
        } else {
            removedCount++;
        }
    }
    arr.length = writeIndex;
    return removedCount;
}
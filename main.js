const C = {
    note: {
        tap: 1,
        drag: 2,
        hold: 3,
        flick: 4
    },
    units: {
        pgrw: 0.05625,
        pgrh: 0.6,
        pgrbeat: 60 / 32
    },
    linew: 0.0075,
    lineh: 5.76,
    pcolor: [0xff, 0xec, 0x9f],
    gcolor: [0xa2, 0xee, 0xff],
    bcolor: [0x6c, 0x43, 0x43],
    mcolor: [0xff, 0xff, 0xff],
    palpha: 0xe1 / 0xff,
    click_sounds: {},
    note_imgs: {},
    chart: {},
    hit_fx_perfect: [],
    hit_fx_good: [],
    note_bad: null,
    judgeTime: [0.08, 0.16, 0.18], // p, g, b
    perfect_max: 0.04,
    judge_result: {
        BadEarly: 0,
        GoodEarly: 1,
        PerfectEarly: 2,
        PerfectMax: 3,
        PerfectLate: 4,
        GoodLate: 5,
        BadLate: 6,
        Miss: 7
    }
};

let pressId = 0;

class PressEvent {
    constructor(time, key) {
        this.id = pressId++;
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

const cv = document.querySelector("#main-canvas");
const ctx = cv.getContext("2d");
const actx = new AudioContext();
const loadingOverlay = $("#loading-overlay");
const loadingMessage = $("#loading-message");

const setLoadingMessage = message => {
    loadingMessage.textContent = message;
};

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

const load_audioele = async url => {
    const audio = new Audio(url);
    await new Promise((resolve, reject) => {
        audio.oncanplaythrough = resolve;
        audio.onerror = reject;
    });
    return audio;
};

const easing = (t, st, et, sv, ev, type = 1, el = 0, er = 1) => {
    if (t <= st) return sv;
    if (t >= et) return ev;
    let progress = (t - st) / (et - st);
    progress = el + (er - el) * progress;
    progress = Math.min(1, Math.max(0, progress));

    return sv + (ev - sv) * tween[type](progress);
}

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

const rotate_point = (x, y, r, deg) => {
    return [
        x + r * Math.cos(deg * Math.PI / 180),
        y + r * Math.sin(deg * Math.PI / 180)
    ];
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
    return chart;
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

const prettify_time = (t) => {
    let m = Math.floor(t / 60);
    let s = Math.floor(t % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
};

const format_number = (x) => {
    if (!Number.isFinite(x)) return x;
    return x.toFixed(2);
}

let controller;
let manager;

const render = () => {
    controller.start((fps) => {
        const t = C.chart.music.currentTime - C.chart.data.offset;
        manager.time = t;

        const [w, h] = [cv.width, cv.height];
        const note_width = w * 0.1234375;

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(C.chart.image, 0, 0, w, h);
        ctx.fillRectEx(0, 0, w, h, "rgba(0, 0, 0, 0.6");

        if (C.chart.music.currentTime >= C.chart.music.duration) {
            if (!manager.ended) {
                play_sound(C.ending, true);
            }
            manager.ended = true;
        }

        if (manager.ended) {
            drawEndUI();
            return;
        }

        ctx.fillRectEx(0, 0, t / C.chart.music.duration * w, 2 * h * C.linew, 'rgba(145, 145, 145, 0.5)');
        ctx.fillRectEx(t / C.chart.music.duration * w, 0, 0.5 * h * C.linew, 2 * h * C.linew, "rgba(255, 255, 255, 0.6)");

        ctx.fillTextEx(C.chart.info.Name, 0.02 * w, 0.97 * h, `${0.03 * h}px Saira`, 'white', 'bottom left');
        ctx.fillTextEx(C.chart.info.Level, 0.98 * w, 0.97 * h, `${0.03 * h}px Saira`, 'white', 'bottom right');
        if (C.settings.showFps) {
            ctx.fillTextEx(fps.toFixed(2), 0.99 * w, 0.5 * h, `${0.025 * h}px Saira`, '#ffffff', 'middle right');
        }

        let statusText = prettify_time(C.chart.music.currentTime) + '/' + prettify_time(C.chart.music.duration);
        if (controller.isPaused) {
            statusText += ' Paused';
            controller.seekTimeDisplay.textContent = controller.formatTime(t);
        }
        if (C.settings.showTiming) {
            ctx.fillTextEx(statusText, 0.01 * w, 0.02 * h, `${0.02 * h}px Saira`, 'white', 'top left');
        }

        for (const line of C.chart.data.judgeLineList) {
            let [ texture, shown, lineRotate, lineX, lineY, lineAlpha, color, scaleX, scaleY ] = line.get_state(t);
            lineX *= w; lineY *= h;
            const lineDrawPos = [
                ...rotate_point(lineX, lineY, h * C.lineh * scaleX / 2, lineRotate),
                ...rotate_point(lineX, lineY, h * C.lineh * scaleX / 2, lineRotate + 180),
            ];
            
            if (!C.chart.textures[line.id]) {
                let lineColor = color;
                if (shown) {
                    lineColor = lineColor || ([C.mcolor, C.gcolor, C.pcolor][manager.FCAPStatus]);
                    ctx.drawLine(...lineDrawPos, h * C.linew * scaleY, `rgba(${lineColor.join(", ")}, ${lineAlpha})`);
                } else {
                    lineColor = lineColor || C.mcolor;
                    ctx.drawCenterScaledText(texture, lineX, lineY, scaleX, scaleY, `${0.05 * h}px Saira`, `rgba(${lineColor.join(", ")}, ${lineAlpha})`);
                }

                if (C.settings.showHitPoint) {
                    ctx.fillTextEx('' + line.id, lineX, lineY, `${0.03 * h}px Saira`, 'red', 'middle center');
                }
            } else {
                // todo: images
            }

            const beatt = line.sec2beat(t);
            const linefp = get_fp(beatt, line.speedEvents);

            for (const note of line.notes) {
                if (C.settings.traceID && note.id === C.settings.traceID) {
                    ctx.fillTextEx(`Note ${note.id}${('tdhf')[note.type - 1]} Time=${format_number(line.sec2beat(note.sect))}s isAbove=${note.is_above} isFake=${note.isFake} Speed=${format_number(note.speed)} Alpha=${note.alpha}`, 0, 0, `${0.03 * h}px Saira`, 'white', 'top left');
                }


                if (C.settings.autoPlay) {
                    if (controller.isPaused) {
                        note.judged = false;
                        if (controller.progressUpdating) note.clicked = false;
                    }
                    
                    if (!note.isFake && !note.judged && !controller.isPaused) {
                        if (note.sect < t && !note.clicked && !controller.isPaused) {
                            if (note.type === C.note.hold) {
                                play_sound(C.click_sounds[note.type]);
                            }
                            note.clicked = true;
                            manager.addError(note.sect - t);
                        }
                        if (note.hold_end_time < t) {
                            note.judged = true;
                            manager.addJudge(C.judge_result.PerfectMax);
                            continue;
                        }
                    }
                }
                // judging end

                let note_fp = (note.floorPosition - linefp) * C.units.pgrh * (C.units.pgrbeat / line.bpm) * h;
                if (!note.is_hold) {
                    note_fp *= note.speed;
                }
                if (
                    (note.visibleTime && (note.sect - t > note.visibleTime)) ||
                    (lineAlpha < 0) ||
                    (!note.is_hold && note_fp < -1e6 || note_fp > h * 2) ||
                    (note.type !== C.note.hold && note.judged)
                ) continue;

                const draw_head = note.sect > t; //C.settings.autoPlay ? (note.sect > t) : !note.isFake || (note.sect > t);
                const note_head_img = C.note_head_imgs[note.type][note.morebets];
                const this_note_width = note_width * (note.morebets ? (
                    C.note_head_imgs[note.type][1].width
                    / C.note_head_imgs[note.type][0].width
                ) : 1.0);

                const this_note_head_height = this_note_width / note_head_img.width * note_head_img.height;
                const note_atline_pos = rotate_point(lineX, lineY, note.positionX * C.units.pgrw * w, lineRotate);
                const l2n_rotate = lineRotate - (note.is_above ? 90 : -90)
                const note_head_pos = rotate_point(...note_atline_pos, note_fp, l2n_rotate);

                const note_draw_rotate = lineRotate + (note.is_above ? 0 : 180);
                note.draw_pos = [...note_head_pos, note_draw_rotate];

                if (draw_head) {
                    ctx.drawCenterRotateImage(
                        note_head_img, ...note_head_pos,
                        this_note_width * (note.size || 1), this_note_head_height,
                        note_draw_rotate, note.alpha / 255
                    );
                }

                if (C.settings.showHitPoint) {
                    ctx.fillTextEx('' + note.id, ...note_head_pos, `${0.03 * h}px Saira`, 'red', 'middle center');
                }

                if (note.is_hold) {
                    const note_body_img = C.hold_body_imgs[note.morebets];
                    const note_tail_img = C.hold_tail_imgs[note.morebets];
                    const note_tail_height = this_note_width / note_tail_img.width * note_tail_img.height;

                    const note_body_height = Math.max(
                        note.hold_length * h
                        + Math.min(0, note_fp)
                        + this_note_head_height / 2
                        - note_tail_height / 2
                        , 0
                    );
                    if (note_body_height > 0) {
                        const note_body_pos = rotate_point(
                            ...(note.sect < t ? note_atline_pos : note_head_pos),
                            (note.sect < t ? 0 : this_note_head_height / 2) + note_body_height / 2,
                            l2n_rotate);

                        ctx.drawCenterRotateImage(
                            note_body_img, ...note_body_pos,
                            this_note_width * (note.size || 1), note_body_height,
                            note_draw_rotate, (note.holdBroken ? C.palpha : 1)
                        );
                        
                        note.draw_pos = [...note_atline_pos, note_draw_rotate];

                        const note_tail_pos = rotate_point(
                            ...note_body_pos,
                            note_body_height / 2 + note_tail_height / 2,
                            l2n_rotate
                        );

                        ctx.drawCenterRotateImage(
                            note_tail_img, ...note_tail_pos,
                            this_note_width * (note.size || 1), note_tail_height,
                            note_draw_rotate
                        );
                    }
                }
            }
            if (C.settings.traceID && line.id === C.settings.traceID) {
                let state = line.get_state(t);
                let beatt = line.sec2beat(t);
                let fp = get_fp(beatt, line.speedEvents);
                ctx.fillTextEx(`Line ${line.id} Time=${format_number(beatt)} FP=${format_number(fp)} BPM=${line.bpm} Pos=(${format_number(state[3])}, ${format_number(state[4])}) Rot=${format_number(state[2])} Alpha=${format_number(state[5])} Scale=${format_number(state[7])}x${format_number(state[8])}`, 0, 0, `${0.03 * h}px Saira`, 'white', 'top left');
            }
        }

        if (!C.settings.autoPlay) processJudge(t);

        if (C.settings.hitEffect) {
            let effect_dur;
            for (let [note, effect_t] of C.chart.data.click_effect_collection) {
                if (note.clicked && !note.isFake) {
                    effect_dur = note.type === C.note.hold ? 30 / note.master.bpm : 0.5;
                    if (!note.played_sound) {
                        play_sound(C.click_sounds[note.type]);
                        note.played_sound = true;
                    }
                    if (effect_t > t) break;
                    if (!C.settings.autoPlay) effect_t = note.judgeTime;
                    if (note.type !== C.note.hold) {
                        if (effect_t + effect_dur < t) continue;
                    } else {
                        if (!C.settings.autoPlay && !note.pressing || note.judged) continue;
                    }

                    const [ pars, pos_getter ] = note.get_click_effect(w, h);
                    let [ x, y ] = pos_getter(effect_t);
                    let state = note.master.get_state(t);
                    let rotate = state[2] + (note.is_above ? 0 : 180);
                    if (note.draw_pos) [ badX, badY, r ] = note.draw_pos;

                    if (note.hitColor === C.bcolor) {
                        ctx.save();
                        ctx.drawCenterRotateImage(
                            C.note_bad, badX, badY,
                            note_width, note_width / C.note_bad.width * C.note_bad.height,
                            rotate, C.palpha
                        );
                        ctx.restore();
                        continue;
                    }

                    const hit_fx = (note.hitColor === C.gcolor ? C.hit_fx_good : C.hit_fx_perfect);

                    const p = (t - effect_t) / effect_dur;
                    // const imi = Math.max(0, Math.min(hit_fx.length - 1, Math.floor(p * hit_fx.length)));
                    const imi = Math.floor(p * hit_fx.length) % hit_fx.length;
                    const im = hit_fx[imi];

                    const effect_size = note_width * 1.375 * 1.12;

                    ctx.save();
                    ctx.globalAlpha *= C.palpha;
                    ctx.drawImage(
                        im,
                        x - effect_size / 2, y - effect_size / 2,
                        effect_size, effect_size
                    );
                    ctx.restore();

                    for (const paritem of pars) {
                        const [ rotate, size, r ] = paritem(p);
                        ctx.save();
                        ctx.translate(x, y);
                        const parcenter = rotate_point(0, 0, r, rotate);
                        ctx.fillRectEx(parcenter[0], parcenter[1], size, size, `rgba(${note.hitColor.join(", ")}, ${1.0 - p})`);
                        ctx.restore();
                    }
                }
            }
        }

        if (manager.combo >= 3) {
            ctx.fillTextEx(`${manager.combo}`, 0.5 * w, 0.02 * h, `${0.06 * h}px Saira`, 'white', 'top center');
            ctx.fillTextEx(C.settings.autoPlay ? 'AUTOPLAY' : 'COMBO', 0.5 * w, 0.08 * h, `${0.02 * h}px Saira`, 'white', 'top center');
        }
        manager.maxCombo = Math.max(manager.maxCombo, manager.combo);
        let score = Math.round(manager.score) + '';
        ctx.fillTextEx(score.padStart(7, '0'), 0.99 * w, 0.02 * h, `${0.04 * h}px Saira`, 'white', 'top right');
        if (C.settings.showAcc) {
            let acc;
            if (C.settings.autoPlay) acc = '100%';
            else acc = (manager.acc * 100).toFixed(2) + '%';
            ctx.fillTextEx(acc.padStart(5), 0.99 * w, 0.06 * h, `${0.02 * h}px Saira`, 'white', 'top right');
        }
    });
};

function removeIf(arr, predicate) {
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

function restart() {
    C.chart.music.currentTime = 0;
    manager.reset();
    for (const line of C.chart.data.judgeLineList) {
        for (const note of line.notes) {
            note.clicked = false;
            note.judged = false;
            note.played_sound = false;
        }
    }
}

const processJudge = (t) => {
    if (controller.isPaused) {
        manager.pool.length = 0;
        return;
    }
    for (const note of manager.allNotes) {
        if (note.sect > t + C.judgeTime[2]) break;
        if (note.judged) continue;
        if ((note.type !== C.note.hold && note.hold_end_time < t - C.judgeTime[2]) || 
        (note.type === C.note.hold && note.hold_end_time < t - C.judgeTime[1] && !note.pressing)) {
            note.judged = true;
            manager.addJudge(C.judge_result.Miss);
        }
        let judged = false;
        let event, deltaTime;
        switch (note.type) {
            case C.note.tap:
                event = manager.findNearestEvent(note.sect);
                if (event === null) {
                    break;
                }
                event.type = 'clicked';
                note.judgeTime = event.time;
                deltaTime = note.sect - event.time; // >0: Early, <0: Late
                manager.addError(deltaTime);
                note.judged = true;
                note.clicked = true;
                if (-C.perfect_max <= deltaTime && deltaTime <= C.perfect_max) {
                    manager.addJudge(C.judge_result.PerfectMax);
                } else if (-C.judgeTime[2] <= deltaTime && deltaTime < -C.judgeTime[1]) {
                    manager.addJudge(C.judge_result.BadLate);
                    note.hitColor = C.bcolor;
                } else if (-C.judgeTime[1] <= deltaTime && deltaTime < -C.judgeTime[0]) {
                    manager.addJudge(C.judge_result.GoodLate);
                    note.hitColor = C.gcolor;
                } else if (-C.judgeTime[0] <= deltaTime && deltaTime < -C.perfect_max) {
                    manager.addJudge(C.judge_result.PerfectLate);
                } else if (deltaTime <= C.judgeTime[0]) {
                    manager.addJudge(C.judge_result.PerfectEarly);
                } else if (deltaTime <= C.judgeTime[1]) {
                    manager.addJudge(C.judge_result.GoodEarly);
                    note.hitColor = C.gcolor;
                } else if (deltaTime <= C.judgeTime[2]) {
                    manager.addJudge(C.judge_result.BadEarly);
                    note.hitColor = C.bcolor;
                }
                judged = true;
                break;
            case C.note.drag:
            case C.note.flick:
                if (manager.isPressing() && Math.abs(t - note.sect) < C.judgeTime[0]) {
                    note.judged = true;
                    note.clicked = true;
                    manager.addJudge(C.judge_result.PerfectMax);
                    note.hitColor = C.pcolor;
                }
                note.judgeTime = note.sect;
                judged = true;
                break;
            case C.note.hold:
                if (note.pressing && !note.judged) {
                    if (t - note.last_press_time > 0.1) {
                        note.pressing = false;
                        note.judged = true;
                        note.holdBroken = true;
                        manager.addJudge(C.judge_result.Miss);
                    }
                    if (t > note.hold_end_time) {
                        note.pressing = false;
                        note.judged = true;
                        let deltaTime = note.deltaTime;
                        if (-C.perfect_max <= deltaTime && deltaTime <= C.perfect_max) {
                            manager.addJudge(C.judge_result.PerfectMax);
                        } else if (-C.judgeTime[1] <= deltaTime && deltaTime < -C.judgeTime[0]) {
                            manager.addJudge(C.judge_result.GoodLate);
                        } else if (-C.judgeTime[0] <= deltaTime && deltaTime < -C.perfect_max) {
                            manager.addJudge(C.judge_result.PerfectLate);
                        } else if (deltaTime <= C.judgeTime[0]) {
                            manager.addJudge(C.judge_result.PerfectEarly);
                        } else if (deltaTime <= C.judgeTime[1]) {
                            manager.addJudge(C.judge_result.GoodEarly);
                        }
                    }
                    if (manager.isPressing()) note.last_press_time = t;
                    break;
                }
                event = manager.findNearestEvent(note.sect);
                if (event === null) {
                    break;
                }
                event.type = 'clicked';
                note.judgeTime = event.time;
                deltaTime = note.sect - event.time; // >0: Early, <0: Late
                note.clicked = true;
                note.deltaTime = deltaTime;
                manager.addError(deltaTime);
                if (-C.judgeTime[1] <= deltaTime && deltaTime < -C.judgeTime[0]) {
                    note.hitColor = C.gcolor;
                } else if (C.judgeTime[0] <= deltaTime && deltaTime <= C.judgeTime[1]) {
                    note.hitColor = C.gcolor;
                }
                note.pressing = true;
                note.last_press_time = event.time;
                break;
        }
        if (judged) break;
    }
};

CanvasRenderingContext2D.prototype.drawLine = function (x0, y0, x1, y1, w, c) {
    this.save();
    this.beginPath();
    this.moveTo(x0, y0);
    this.lineTo(x1, y1);
    this.lineWidth = w;
    this.strokeStyle = c;
    this.stroke();
    this.restore();
};

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

const drawEndUI = () => {
    const [w, h] = [cv.width, cv.height];
    const ctx = cv.getContext("2d");
    
    const songName = C.chart.info.Name || "Unknown Song";
    const score = Math.round(manager.score);
    const acc = (manager.acc * 100).toFixed(2);
    const perfect = manager.perfect;
    const good = manager.good;
    const bad = manager.bad;
    const miss = manager.miss;
    const fcapStatus = manager.FCAPStatus;
    
    const earlyPerfect = manager.judges[C.judge_result.PerfectEarly];
    const latePerfect = manager.judges[C.judge_result.PerfectLate];
    const earlyGood = manager.judges[C.judge_result.GoodEarly];
    const lateGood = manager.judges[C.judge_result.GoodLate];
    const earlyBad = manager.judges[C.judge_result.BadEarly];
    const lateBad = manager.judges[C.judge_result.BadLate];

    const avgErr = Math.round(manager.avgError * 1000);
    
    let rating = "";
    let ratingColor = "white";
    
    if (fcapStatus === 2) {
        rating = "φ";
        ratingColor = "gold";
    } else if (fcapStatus === 1) {
        rating = "V";
        ratingColor = "#a2eeff";
    } else {
        if (score >= 960000) {
            rating = "V";
        } else if (score >= 920000) {
            rating = "S";
        } else if (score >= 880000) {
            rating = "A";
        } else if (score >= 820000) {
            rating = "B";
        } else if (score >= 700000) {
            rating = "C";
        } else {
            rating = "F";
        }
    }
    
    const leftWidth = 0.6 * w;
    
    const difficulty = C.chart.info.Level || "SP Lv.?";
    
    if (C.chart.image) {
        const fixedImgWidth = h;
        const fixedImgHeight = fixedImgWidth * 9 / 16;
        
        const imgX = (leftWidth - fixedImgWidth) / 2;
        const imgY = 0.1 * h;
        
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.drawImage(C.chart.raw_image, imgX, imgY, fixedImgWidth, fixedImgHeight);
        ctx.restore();
    }
    
    const maxSongNameWidth = leftWidth * 0.85;
    let songNameFontSize = 0.045 * h;
    
    ctx.save();
    ctx.font = `${songNameFontSize}px Saira`;
    const textMetrics = ctx.measureText(songName);
    if (textMetrics.width > maxSongNameWidth) {
        songNameFontSize = (maxSongNameWidth / textMetrics.width) * songNameFontSize * 0.9;
    }
    ctx.restore();
    
    ctx.fillTextEx(songName, leftWidth * 0.5, h * 0.7, `${songNameFontSize}px Saira`, "white", "top center");
    
    ctx.fillTextEx(`${difficulty}`, leftWidth * 0.5, h * 0.75, `${0.03 * h}px Saira`, "#a2eeff", "top center");
    
    const rightStartX = leftWidth + 0.05 * h;
    const rightEndX = w - 0.05 * h;
    
    ctx.fillTextEx(rating, rightEndX, 0.15 * h, `${0.12 * h}px Saira`, ratingColor, "top right");
    
    ctx.fillTextEx(score.toString().padStart(7, '0'), rightEndX, 0.3 * h, `${0.05 * h}px Saira`, "white", "top right");
    
    ctx.fillTextEx(`${acc}%`, rightEndX, 0.38 * h, `${0.04 * h}px Saira`, "#a2eeff", "top right");
    
    ctx.fillTextEx("MAX COMBO", rightEndX, 0.45 * h, `${0.025 * h}px Saira`, "#aaaaaa", "top right");
    ctx.fillTextEx(manager.maxCombo.toString(), rightEndX - 0.08 * h * 2.5, 0.45 * h, `${0.025 * h}px Saira`, "white", "top right");

    ctx.fillTextEx(C.settings.autoPlay ? "AUTOPLAY" : "", rightStartX, 0.45 * h, `${0.025 * h}px Saira`, "gold", "top left")
    ctx.fillTextEx(`ERROR ±${avgErr}ms`, rightStartX, 0.48 * h, `${0.025 * h}px Saira`, "white", "top left")
    
    const statsYStart = 0.52 * h;
    const statsSpacing = 0.05 * h;
    
    ctx.fillTextEx("PERFECT", rightEndX, statsYStart, `${0.03 * h}px Saira`, "#ffec9f", "top right");
    ctx.fillTextEx(`${perfect}(${perfect - earlyPerfect - latePerfect})`, rightEndX - 0.08 * h * 2.5, statsYStart, `${0.03 * h}px Saira`, "white", "top right");
    
    ctx.fillTextEx("GOOD", rightEndX, statsYStart + statsSpacing, `${0.03 * h}px Saira`, "#a2eeff", "top right");
    ctx.fillTextEx(good.toString(), rightEndX - 0.08 * h * 2.5, statsYStart + statsSpacing, `${0.03 * h}px Saira`, "white", "top right");
    
    ctx.fillTextEx("BAD", rightEndX, statsYStart + 2 * statsSpacing, `${0.03 * h}px Saira`, "#ff6b6b", "top right");
    ctx.fillTextEx(bad.toString(), rightEndX - 0.08 * h * 2.5, statsYStart + 2 * statsSpacing, `${0.03 * h}px Saira`, "white", "top right");
    
    ctx.fillTextEx("MISS", rightEndX, statsYStart + 3 * statsSpacing, `${0.03 * h}px Saira`, "#ff4757", "top right");
    ctx.fillTextEx(miss.toString(), rightEndX - 0.08 * h * 2.5, statsYStart + 3 * statsSpacing, `${0.03 * h}px Saira`, "white", "top right");
    
    const earlyLateYStart = statsYStart + 4.5 * statsSpacing;
    
    ctx.fillTextEx("EARLY/LATE", rightEndX, earlyLateYStart, `${0.025 * h}px Saira`, "#95a5a6", "top right");
    ctx.fillTextEx(`P: ${earlyPerfect}/${latePerfect}`, rightEndX, earlyLateYStart + 0.03 * h, `${0.02 * h}px Saira`, "#bdc3c7", "top right");
    ctx.fillTextEx(`G: ${earlyGood}/${lateGood}`, rightEndX - 0.15 * h * 2.5, earlyLateYStart + 0.03 * h, `${0.02 * h}px Saira`, "#bdc3c7", "top right");
    ctx.fillTextEx(`B: ${earlyBad}/${lateBad}`, rightEndX - 0.3 * h * 2.5, earlyLateYStart + 0.03 * h, `${0.02 * h}px Saira`, "#bdc3c7", "top right");
    
    ctx.drawLine(rightEndX - 0.3 * h * 2.5, earlyLateYStart + 0.06 * h, rightEndX, earlyLateYStart + 0.06 * h, 2, "rgba(255, 255, 255, 0.2)");
}

async function init() {
    setLoadingMessage('Loading resources...');
    cv.width = document.body.clientWidth;
    cv.height = document.body.clientHeight;

    C.click_sounds[C.note.tap] = await load_audio("./res/click.ogg");
    C.click_sounds[C.note.hold] = C.click_sounds[C.note.tap];
    C.click_sounds[C.note.drag] = await load_audio("./res/drag.ogg");
    C.click_sounds[C.note.flick] = await load_audio("./res/flick.ogg");
    C.ending = await load_audio('/res/ending.mp3');

    C.note_imgs.click = await load_img("./res/click.png");
    C.note_imgs.drag = await load_img("./res/drag.png");
    C.note_imgs.hold = await load_img("./res/hold.png");
    C.note_imgs.flick = await load_img("./res/flick.png");

    C.note_imgs.click_mh = await load_img("./res/click_mh.png");
    C.note_imgs.drag_mh = await load_img("./res/drag_mh.png");
    C.note_imgs.hold_mh = await load_img("./res/hold_mh.png");
    C.note_imgs.flick_mh = await load_img("./res/flick_mh.png");

    C.respack_info = await load_json("./res/respack.json");

    [C.note_imgs.hold_head, C.note_imgs.hold_body, C.note_imgs.hold_tail] = clip_hold(C.note_imgs.hold, C.respack_info.holdAtlas);
    [C.note_imgs.hold_mh_head, C.note_imgs.hold_mh_body, C.note_imgs.hold_mh_tail] = clip_hold(C.note_imgs.hold_mh, C.respack_info.holdAtlasMH);
    
    setLoadingMessage('Applying hitFx...');
    C.note_head_imgs = {
        [C.note.tap]: [C.note_imgs.click, C.note_imgs.click_mh],
        [C.note.drag]: [C.note_imgs.drag, C.note_imgs.drag_mh],
        [C.note.flick]: [C.note_imgs.flick, C.note_imgs.flick_mh],
        [C.note.hold]: [C.note_imgs.hold_head, C.note_imgs.hold_mh_head]
    };

    C.hold_body_imgs = [C.note_imgs.hold_body, C.note_imgs.hold_mh_body];
    C.hold_tail_imgs = [C.note_imgs.hold_tail, C.note_imgs.hold_mh_tail];

    C.hit_fx = await load_img("./res/hit_fx.png");

    for (let j = 0; j < C.respack_info.hitFx[1]; j++) {
        for (let i = 0; i < C.respack_info.hitFx[0]; i++) {
            C.hit_fx_perfect.push(
                cv_put_color(clip_block_img(
                    C.hit_fx,
                    (i / C.respack_info.hitFx[0]) * C.hit_fx.width,
                    (j / C.respack_info.hitFx[1]) * C.hit_fx.height,
                    ((i + 1) / C.respack_info.hitFx[0]) * C.hit_fx.width,
                    ((j + 1) / C.respack_info.hitFx[1]) * C.hit_fx.height
                ), C.pcolor)
            );
            C.hit_fx_good.push(
                cv_put_color(clip_block_img(
                    C.hit_fx,
                    (i / C.respack_info.hitFx[0]) * C.hit_fx.width,
                    (j / C.respack_info.hitFx[1]) * C.hit_fx.height,
                    ((i + 1) / C.respack_info.hitFx[0]) * C.hit_fx.width,
                    ((j + 1) / C.respack_info.hitFx[1]) * C.hit_fx.height
                ), C.gcolor)
            );
        }
    }
    C.note_bad = cv_put_color(clip_img(C.note_imgs.click, 0, C.note_imgs.click.height), C.bcolor);
    
    window.onresize = () => {
        cv.width = window.innerWidth;
        cv.height = window.innerHeight;
    };
}
async function load(chart, data, music, image, settings) {
    $('#selector').remove();

    setLoadingMessage('Loading chart...');
    C.chart.info = await load_csv(chart);
    const [ chart_data, chart_info, line_info ] = await load_chart(data);
    C.chart.data = chart_data;
    C.chart.textures = {};
    if (chart_info) {
        C.chart.info = chart_info;
    }
    if (line_info) {
        line_info.forEach((x) => {
            if (x.Image !== "line.png") C.chart.textures[x.LineId] = x.Image;
            else C.chart.textures[x.LineId] = x.attachUI;
        });
    }
    C.chart.data = regulate_chart(C.chart.data);
    setLoadingMessage('Loading music...');
    C.chart.music = await load_audioele(music);
    setLoadingMessage('Loading image...');
    C.chart.raw_image = await load_img(image);
    C.chart.image = get_blur_img(C.chart.raw_image, 0.05);

    C.chart.music.style.display = "none";
    document.body.appendChild(C.chart.music);

    const note_sect_counter = new Map();
    C.chart.data.numOfNotes = 0;
    C.settings = settings;
    controller = new AnimationController(C.chart.music, C.settings.maxFps);
    manager = new JudgeManager(0);

    setLoadingMessage('Parsing chart data...');
    C.chart.data.judgeLineList.forEach((line, i) => {
        line.sec2beat = function (t) {return t / (C.units.pgrbeat / this.bpm)};
        line.beat2sec = function (t) {return t * (C.units.pgrbeat / this.bpm)};
        line.get_state = function (t) {
            const beatt = this.sec2beat(t);
            const rotate = get_event_val(beatt, line.judgeLineRotateEvents) * -1;
            const x = get_event_val(beatt, line.judgeLineMoveEvents);
            const y = 1.0 - get_event_val(beatt, line.judgeLineMoveEvents, "start2", "end2");
            const alpha = get_event_val(beatt, line.judgeLineDisappearEvents);
            let texture = "";
            const text = get_event_val(beatt, line.textEvents);
            if (text !== null) texture = text;
            const color = get_event_val(beatt, line.colorEvents);
            let shown = true;
            if (line.textEvents && line.textEvents.length > 0) {
                shown = false;
            }
            const scaleX = get_event_val(beatt, line.scaleXEvents);
            const scaleY = get_event_val(beatt, line.scaleYEvents);
            return [ texture, shown, rotate, x, y, alpha, color, scaleX, scaleY ];
        };
        line.id = i + "";

        init_speed_events(line.speedEvents);
        line.notes = merge_notes(line.notesAbove, line.notesBelow);
        init_note_fp(line.notes, line.speedEvents);
        line.notes.forEach((note, i) => {
            note.sect = line.beat2sec(note.time);
            note.secht = line.beat2sec(note.holdTime);
            note.hold_end_time = note.sect + note.secht;
            note.hold_length = note.secht * note.speed * C.units.pgrh;
            note.is_hold = note.type === C.note.hold;
            note.clicked = false;
            note.judged = false;
            note.id = `${line.id}_${i}`;
            note.master = line;

            note.headJudged = false;
            note.hitColor = C.pcolor;
            if (!note.isFake) manager.allNotes.push(note);

            if (settings.hlEffect) {
                if (!note_sect_counter.has(note.sect)) {
                    note_sect_counter.set(note.sect, 0);
                }
                note_sect_counter.set(note.sect, note_sect_counter.get(note.sect) + 1);
            }
        });
        manager.allNotes.sort((a, b) => a.sect - b.sect);

        delete line.notesAbove;
        delete line.notesBelow;
    });

    for (const line of C.chart.data.judgeLineList) {
        for (const note of line.notes) {
            note.morebets = +(note_sect_counter.get(note.sect) > 1);
        }
    }

    C.chart.data.click_effect_collection = [];

    for (const line of C.chart.data.judgeLineList) {
        for (const note of line.notes) {
            note.get_click_effect = function (w, h) {
                const pars = new Array(4).fill(0).map(() => {
                    const rotate = Math.random() * 360;
                    const s = w / 4040 * 3;
                    const size = s * 33 * 0.75; // 细节先算了
                    const r = s * (Math.random() * (265 - 185) + 185);
                    return p => {
                        return [ rotate, size, r * (9 * p / (8 * p + 1)) ];
                    };
                });
                this.get_click_effect = () => [ pars, t => {
                    let [ texture, shown, lineRotate, lineX, lineY, alpha, color, scaleX, scaleY ] = line.get_state(t);
                    const pos = rotate_point(
                        lineX * w, lineY * h,
                        this.positionX * C.units.pgrw * w,
                        lineRotate
                    );
                    return pos;
                } ];
                return this.get_click_effect();
            };

            if (!note.isFake) {
                C.chart.data.click_effect_collection.push([ note, note.sect ]);
                C.chart.data.numOfNotes++;
            }

            /*if (note.is_hold) {
                const dt = 30 / line.bpm;
                let st = note.sect + dt;
                while (st < note.hold_end_time) {
                    C.chart.data.click_effect_collection.push([ note, st ]);
                    st += dt;
                }
            }*/
        }
    }

    C.chart.data.click_effect_collection.sort((a, b) => a[1] - b[1]);
    
    setLoadingMessage('Finishing...');
    console.log(C.chart.data);
    console.log(C.settings);
    manager.numOfNotes = C.chart.data.numOfNotes;

    function start() {    
        loadingOverlay.style.display = "none";
        setLoadingMessage("");

        // cv.requestFullscreen();
        C.chart.music.play();
        const font = new FontFace('Saira', 'url(./css/font.ttf)')
        font.load().then(f => {
            document.fonts.add(f);
        }).then(() => {
            render();
        });
    };
    start();

    document.addEventListener('keydown', (e) => {
        if (manager.ended) {
            return;
        }
        if (e.code === 'Space') {
            controller.togglePause();
            e.preventDefault();
            return;
        }
        if (e.code === "Backspace") {
            restart();
            e.preventDefault();
            return;
        }
        if (e.code === 'Escape' || e.code[0] === 'F') {
            return;
        }
        if (!manager.hasKey(e.code)) manager.pool.push(new PressEvent(manager.time, e.code));
    });
    document.addEventListener('keyup', (e) => {
        if (manager.ended) {
            return;
        }
        removeIf(manager.pool, p => p.key === e.code);
    });
};

function getSettings() {
    const settings = {};
    const inputs = document.querySelectorAll("#settings-modal input");
    
    inputs.forEach(input => {
        switch(input.type) {
            case "range":
            case "number":
                settings[input.id] = parseFloat(input.value);
                break;
            case "checkbox":
                settings[input.id] = input.checked;
                break;
            default:
                settings[input.id] = input.value;
        }
    });
    
    return settings;
}

$("#settings-button").onclick = () => {
    $("#settings-modal").style.display = "flex";
};

$("#close-settings").onclick = () => {
    $("#settings-modal").style.display = "none";
};

$("#load-button").onclick = () => {
    const loadingOverlay = $("#loading-overlay");

    const infoFile = $("#chart-file").files[0];
    const chartFile = $("#data-file").files[0];
    const musicFile = $("#music-file").files[0];
    const imageFile = $("#image-file").files[0];

    if (!chartFile || !musicFile || !imageFile) {
        alert("Please select all files.");
        return;
    }
    let infoUrl;
    if (!infoFile) {
        infoUrl = "./res/info.csv";
    } else {
        infoUrl = URL.createObjectURL(infoFile);
    }
    const chartUrl = URL.createObjectURL(chartFile);
    const musicUrl = URL.createObjectURL(musicFile);
    const imageUrl = URL.createObjectURL(imageFile);

    const settings = getSettings();
    loadingOverlay.style.display = "flex";
    load(infoUrl, chartUrl, musicUrl, imageUrl, settings);
};

$("#zip-file").onchange = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    setLoadingMessage('Extracting zip file...');
    loadingOverlay.style.display = "flex";

    try {
        const zip = new JSZip();
        const zipData = await zip.loadAsync(file);
        
        const files = {};
        
        for (const [filename, zipEntry] of Object.entries(zipData.files)) {
            if (!zipEntry.dir) {
                const ext = filename.toLowerCase().split('.').pop();
                
                if (ext === 'json' || ext === 'pec') {
                    files.chart = { filename, zipEntry };
                } else if (ext === 'ogg' || ext === 'mp3' || ext === 'wav') {
                    files.music = { filename, zipEntry };
                } else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
                    files.image = { filename, zipEntry };
                } else if (ext === 'csv') {
                    files.info = { filename, zipEntry };
                }
            }
        }

        for (const [type, fileInfo] of Object.entries(files)) {
            const blob = await fileInfo.zipEntry.async('blob');
            const extractedFile = new File([blob], fileInfo.filename, { type: blob.type });
            
            switch(type) {
                case 'chart':
                    $("#data-file").files = createFileList([extractedFile]);
                    break;
                case 'music':
                    $("#music-file").files = createFileList([extractedFile]);
                    break;
                case 'image':
                    $("#image-file").files = createFileList([extractedFile]);
                    break;
                case 'info':
                    $("#chart-file").files = createFileList([extractedFile]);
                    break;
            }
        }

        function createFileList(files) {
            const dt = new DataTransfer();
            files.forEach(file => dt.items.add(file));
            return dt.files;
        }

        loadingOverlay.style.display = "none";
    } catch (error) {
        console.error('Error extracting zip file:', error);
        alert('Error extracting zip file: ' + error.message);
        loadingOverlay.style.display = "none";
    }
};

window.onload = () => {
    init();
};
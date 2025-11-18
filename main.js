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
    palpha: 0xe1 / 0xff,
    click_sounds: {},
    note_imgs: {},
    chart: {},
    hit_fx_imgs: []
};
const $ = s => document.querySelector(s);

class AnimationController {
    constructor(audioElement) {
        this.audioElement = audioElement;
        this.isPaused = false;
        this.progressBar = $("#progress-bar");
        this.progressContainer = $("#progress-container");
        this.durationDisplay = $("#duration");
        this.seekTimeDisplay = $("#seek-time");

        this.frameCount = 0;
        this.currentFps = 0;
        this.lastFpsUpdate = 0;

        this.progressUpdated = false;

        this.progressBar.addEventListener("input", () => {
            if (this.audioElement.duration) {
                const seekTime = this.audioElement.duration * (this.progressBar.value / 100);
                this.seekTimeDisplay.textContent = `跳转到: ${this.formatTime(seekTime)}`;
            }
        });

        this.progressBar.addEventListener("change", () => {
            if (this.audioElement.duration) {
                this.audioElement.currentTime = this.audioElement.duration * (this.progressBar.value / 100);
                this.seekTimeDisplay.textContent = "";
                this.progressUpdated = true;
            }
        });
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    updateProgress() {
        if (this.audioElement.duration) {
            this.progressBar.value = (this.audioElement.currentTime / this.audioElement.duration) * 100;
            this.durationDisplay.textContent = this.formatTime(this.audioElement.duration);
        }
    }
    
    start(updateCallback) {
        this.updateCallback = updateCallback;
        this.animationId = requestAnimationFrame(this.animate.bind(this));

        this.frameCount = 0;
        this.currentFps = 0;
        this.lastFpsUpdate = performance.now();
    }
    
    animate(currentTime) {
        this.updateCurrentFps(currentTime);
        this.updateCallback(this.currentFps);
        if (!this.isPaused) {
            this.updateProgress();
        }
        this.animationId = requestAnimationFrame(this.animate.bind(this));
    }

    pause() {
        this.audioElement.pause();
        this.progressContainer.style.display = "block";
        this.updateProgress();
    }
    
    resume() {
        this.audioElement.play();
        this.progressContainer.style.display = "none";
        
        this.progressUpdated = false;
    }
    
    togglePause() {
        if (this.isPaused) {
            this.resume();
        } else {
            this.pause();
        }
        this.isPaused = !this.isPaused;
    }
    
    updateCurrentFps(currentTime) {
        this.frameCount++;
        if (currentTime - this.lastFpsUpdate >= 1000) {
            this.currentFps = (this.frameCount * 1000) / (currentTime - this.lastFpsUpdate);
            this.frameCount = 0;
            this.lastFpsUpdate = currentTime;
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

const play_sound = async buf => {
    const source = actx.createBufferSource();
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
                return [JSON.parse(res.data), null];
            } catch (ex) {
                console.error("PEC parse failed:", ex);
                return [null, null];
            }
        } else if (e.message === "RPE format") { // rpe
            try {
                const res = parseRPE(text);
                const info = res.info;
                return [JSON.parse(res.data), info];
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
    if (!(e[sn] instanceof Number)) {
        return e[sn];
    }
    if (e[sn] instanceof Array) {
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
                end: events[i + 1].start,
                start2: e.end2,
                end2: events[i + 1].start2
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
        line.speedEvents = fill_event(line.speedEvents);
        line.judgeLineRotateEvents = fill_event(line.judgeLineRotateEvents);
        line.judgeLineMoveEvents = fill_event(line.judgeLineMoveEvents);
        line.judgeLineDisappearEvents = fill_event(line.judgeLineDisappearEvents);
        line.colorEvents = fill_event(line.colorEvents);
        line.textEvents = fill_event(line.textEvents);
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

let controller;

const render = () => {
    controller.start((fps) => {
        const t = C.chart.music.currentTime - C.chart.data.offset;
        const [w, h] = [cv.width, cv.height];
        const note_width = w * 0.1234375;

        let combo = 0;
        let score = 0;

        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(C.chart.image, 0, 0, w, h);
        ctx.fillRectEx(0, 0, w, h, "rgba(0, 0, 0, 0.6");

        ctx.fillRectEx(0, 0, t / C.chart.music.duration * w, 2 * h * C.linew, 'rgba(145, 145, 145, 0.5)');
        ctx.fillRectEx(t / C.chart.music.duration * w, 0, 0.5 * h * C.linew, 2 * h * C.linew, "rgba(255, 255, 255, 0.6)");

        ctx.fillTextEx(C.chart.info.Name, 0.02 * w, 0.97 * h, `${0.03 * h}px Saira`, 'white', 'bottom left');
        ctx.fillTextEx(C.chart.info.Level, 0.98 * w, 0.97 * h, `${0.03 * h}px Saira`, 'white', 'bottom right');
        if (C.settings.showFps) {
            ctx.fillTextEx(fps.toFixed(2), 0.98 * w, 0.5 * h, `${0.02 * h}px Saira`, 'white', 'middle right');
        }

        let statusText = prettify_time(C.chart.music.currentTime) + '/' + prettify_time(C.chart.music.duration);
        if (controller.isPaused) {
            statusText += ' Paused'
        }
        if (C.settings.showTiming) {
            ctx.fillTextEx(statusText, 0.01 * w, 0.02 * h, `${0.02 * h}px Saira`, 'white', 'top left');
        }

        for (const line of C.chart.data.judgeLineList) {
            let [ texture, shown, lineRotate, lineX, lineY, lineAlpha, color ] = line.get_state(t);
            lineX *= w; lineY *= h;
            const lineDrawPos = [
                ...rotate_point(lineX, lineY, h * C.lineh, lineRotate),
                ...rotate_point(lineX, lineY, h * C.lineh, lineRotate + 180),
            ];

            if (shown) {
                ctx.drawLine(...lineDrawPos, h * C.linew, `rgba(${(color || C.pcolor).join(", ")}, ${lineAlpha})`);
            } else {
                ctx.fillTextEx(texture, lineX, lineY, `${0.05 * h}px Saira`, `rgba(${(color || [255, 255, 255]).join(", ")}, ${lineAlpha})`, 'middle center');
            }

            if (C.settings.showHitPoint) {
                ctx.fillTextEx('' + line.id, lineX, lineY, `${0.03 * h}px Saira`, 'red', 'middle center');
            }

            const beatt = line.sec2beat(t);
            const linefp = get_fp(beatt, line.speedEvents);

            for (const note of line.notes) {
                if (controller.progressUpdated) note.scored = false;
                if (!note.isFake && note.scored) combo++;

                if (!note.isFake && note.sect < t && !note.clicked) {
                    play_sound(C.click_sounds[note.type]);
                    note.clicked = true;
                }

                if (!note.isFake && (!note.is_hold && note.sect < t) || (note.is_hold && note.hold_end_time < t)) {
                    note.scored = true;
                    continue;
                }
                // judging end

                if (note.visibleTime && (note.sect - t > note.visibleTime)) {
                    continue;
                }

                let note_fp = (note.floorPosition - linefp) * C.units.pgrh * (C.units.pgrbeat / line.bpm) * h;

                if (!note.is_hold) {
                    note_fp *= note.speed;
                }

                if (!note.is_hold && note_fp < -1e6) {
                    continue;
                }

                if (note_fp > h * 2) {
                    continue;
                }

                const draw_head = note.sect > t;
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
                        + (note.clicked ? this_note_head_height / 2 : 0)
                        - note_tail_height / 2
                        , 0
                    );

                    const note_body_pos = rotate_point(
                        ...((!note.clicked) ? note_head_pos : note_atline_pos),
                        ((!note.clicked) ? this_note_head_height / 2 : 0) + note_body_height / 2,
                        l2n_rotate);

                    ctx.drawCenterRotateImage(
                        note_body_img, ...note_body_pos,
                        this_note_width, note_body_height,
                        note_draw_rotate
                    );

                    const note_tail_pos = rotate_point(
                        ...note_body_pos,
                        note_body_height / 2 + note_tail_height / 2,
                        l2n_rotate
                    );

                    ctx.drawCenterRotateImage(
                        note_tail_img, ...note_tail_pos,
                        this_note_width, note_tail_height,
                        note_draw_rotate
                    );
                }
            }
        }

        if(C.settings.hitEffect) {
            const effect_dur = 0.5;

            for (const [note, effect_t] of C.chart.data.click_effect_collection) {
                if (effect_t > t) break;
                if (effect_t + effect_dur < t) continue;

                const p = (t - effect_t) / effect_dur;
                const imi = Math.max(0, Math.min(C.hit_fx_imgs.length - 1, Math.floor(p * C.hit_fx_imgs.length)));
                const im = C.hit_fx_imgs[imi];
                const effect_size = note_width * 1.375 * 1.12;
                const [ pars, pos_getter ] = note.get_click_effect(w, h);
                const [ x, y ] = pos_getter(effect_t);

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
                    ctx.fillRectEx(parcenter[0], parcenter[1], size, size, `rgba(${C.pcolor.join(", ")}, ${1.0 - p})`);
                    ctx.restore();
                }
            }
        }

        if (combo >= 3) {
            ctx.fillTextEx(`${combo}`, 0.5 * w, 0.02 * h, `${0.06 * h}px Saira`, 'white', 'top center');
            ctx.fillTextEx('COMBO', 0.5 * w, 0.08 * h, `${0.02 * h}px Saira`, 'white', 'top center');
        }
        score = Math.floor(combo * 1000000 / C.chart.data.numOfNotes) + '';
        ctx.fillTextEx(score.padStart(7, '0'), 0.98 * w, 0.02 * h, `${0.04 * h}px Saira`, 'white', 'top right');
    });
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
async function init() {
    setLoadingMessage('Loading resources...');
    cv.width = document.body.clientWidth;
    cv.height = document.body.clientHeight;

    C.click_sounds[C.note.tap] = await load_audio("/res/click.ogg");
    C.click_sounds[C.note.hold] = C.click_sounds[C.note.tap];
    C.click_sounds[C.note.drag] = await load_audio("/res/drag.ogg");
    C.click_sounds[C.note.flick] = await load_audio("/res/flick.ogg");

    C.note_imgs.click = await load_img("/res/click.png");
    C.note_imgs.drag = await load_img("/res/drag.png");
    C.note_imgs.hold = await load_img("/res/hold.png");
    C.note_imgs.flick = await load_img("/res/flick.png");

    C.note_imgs.click_mh = await load_img("/res/click_mh.png");
    C.note_imgs.drag_mh = await load_img("/res/drag_mh.png");
    C.note_imgs.hold_mh = await load_img("/res/hold_mh.png");
    C.note_imgs.flick_mh = await load_img("/res/flick_mh.png");

    C.respack_info = await load_json("/res/respack.json");

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

    C.hit_fx = await load_img("/res/hit_fx.png");

    for (let j = 0; j < C.respack_info.hitFx[1]; j++) {
        for (let i = 0; i < C.respack_info.hitFx[0]; i++) {
            C.hit_fx_imgs.push(
                cv_put_color(clip_block_img(
                    C.hit_fx,
                    (i / C.respack_info.hitFx[0]) * C.hit_fx.width,
                    (j / C.respack_info.hitFx[1]) * C.hit_fx.height,
                    ((i + 1) / C.respack_info.hitFx[0]) * C.hit_fx.width,
                    ((j + 1) / C.respack_info.hitFx[1]) * C.hit_fx.height
                ), C.pcolor)
            );
        }
    }
    
    window.onresize = () => {
        cv.width = window.innerWidth;
        cv.height = window.innerHeight;
    };
}
async function load(chart, data, music, image, settings) {
    $('#selector').remove();

    setLoadingMessage('Loading chart...');
    C.chart.info = await load_csv(chart);
    const [ chart_data, chart_info ] = await load_chart(data);
    C.chart.data = chart_data;
    if (chart_info) {
        C.chart.info = chart_info;
    }
    C.chart.data = regulate_chart(C.chart.data);
    setLoadingMessage('Loading music...');
    C.chart.music = await load_audioele(music);
    setLoadingMessage('Loading image...');
    C.chart.image = get_blur_img(await load_img(image), 0.05);
    controller = new AnimationController(C.chart.music);

    C.chart.music.style.display = "none";
    document.body.appendChild(C.chart.music);

    const note_sect_counter = new Map();
    C.chart.data.numOfNotes = 0;

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
            const color = get_event_val(beatt, line.colorEvents) || C.pcolor;
            let shown = true;
            if (line.textEvents && line.textEvents.length > 0) {
                shown = false;
            }
            return [ texture, shown, rotate, x, y, alpha, color ];
        };
        line.id = i;

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
            note.scored = false;
            note.id = `${line.id}_${i}`;
            note.master = line;

            C.chart.data.numOfNotes++;

            if (settings.hlEffect) {
                if (!note_sect_counter.has(note.sect)) {
                    note_sect_counter.set(note.sect, 0);
                }
                note_sect_counter.set(note.sect, note_sect_counter.get(note.sect) + 1);
            }
        });

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
                    let [ texture, shown, lineRotate, lineX, lineY, alpha, color ] = line.get_state(t);
                    const pos = rotate_point(
                        lineX * w, lineY * h,
                        this.positionX * C.units.pgrw * w,
                        lineRotate
                    );
                    return pos;
                } ];
                return this.get_click_effect();
            };

            if (!note.isFake) C.chart.data.click_effect_collection.push([ note, note.sect ]);

            if (note.is_hold) {
                const dt = 30 / line.bpm;
                let st = note.sect + dt;
                while (st < note.hold_end_time) {
                    C.chart.data.click_effect_collection.push([ note, st ]);
                    st += dt;
                }
            }
        }
    }

    C.chart.data.click_effect_collection.sort((a, b) => a[1] - b[1]);

    console.log(C.chart.data);
    
    setLoadingMessage('Finishing...');
    C.settings = settings;


    function start() {    
        loadingOverlay.style.display = "none";
        setLoadingMessage("");

        cv.requestFullscreen();
        C.chart.music.play();
        const font = new FontFace('Saira', 'url(/data/font.ttf)')
        font.load().then(f => {
            document.fonts.add(f);
        }).then(() => {
            render();
        });
    };
    start();

    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            controller.togglePause();
        }
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
        infoUrl = "/data/info.csv";
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
// Zip file processing function
$("#zip-file").onchange = async function(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Check if file is zip or pez
    if (!file.name.toLowerCase().endsWith('.zip') && !file.name.toLowerCase().endsWith('.pez')) {
        alert("Please select a .zip or .pez file");
        return;
    }

    setLoadingMessage('Extracting zip file...');
    loadingOverlay.style.display = "flex";

    try {
        const zip = new JSZip();
        const zipData = await zip.loadAsync(file);
        
        // Find files with specific extensions
        const files = {};
        
        for (const [filename, zipEntry] of Object.entries(zipData.files)) {
            if (!zipEntry.dir) {
                const ext = filename.toLowerCase().split('.').pop();
                
                // Check for chart files
                if (ext === 'json' || ext === 'pec') {
                    files.chart = { filename, zipEntry };
                }
                // Check for music files
                else if (ext === 'ogg' || ext === 'mp3' || ext === 'wav') {
                    files.music = { filename, zipEntry };
                }
                // Check for image files
                else if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') {
                    files.image = { filename, zipEntry };
                }
                // Check for chart info files
                else if (ext === 'csv') {
                    files.info = { filename, zipEntry };
                }
            }
        }

        // Create File objects from zip entries and populate file inputs
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

        // Helper function to create FileList
        function createFileList(files) {
            const dt = new DataTransfer();
            files.forEach(file => dt.items.add(file));
            return dt.files;
        }

        setLoadingMessage('Zip file extracted successfully!');
        setTimeout(() => {
            loadingOverlay.style.display = "none";
        }, 1000);

    } catch (error) {
        console.error('Error extracting zip file:', error);
        alert('Error extracting zip file: ' + error.message);
        loadingOverlay.style.display = "none";
    }
};

window.onload = () => {
    init();
};
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
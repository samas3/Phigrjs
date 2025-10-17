class LinePec {
	constructor(bpm) {
		this.bpm = 120;
		this.numOfNotes = 0;
		this.numOfNotesAbove = 0;
		this.numOfNotesBelow = 0;
		this.speedEvents = [];
		this.notes = [];
		this.notesAbove = [];
		this.notesBelow = [];
		this.alphaEvents = [];
		this.moveEvents = [];
		this.rotateEvents = [];
		if (!isNaN(bpm)) this.bpm = bpm;
	}
	pushNote(type, time, positionX, holdTime, speed, isAbove, isFake) {
		this.notes.push({ type, time, positionX, holdTime, speed, isAbove, isFake });
	}
	pushSpeedEvent(time, value) {
		this.speedEvents.push({ time, value });
	}
	pushAlphaEvent(startTime, endTime, value, motionType) {
		this.alphaEvents.push({ startTime, endTime, value, motionType });
	}
	pushMoveEvent(startTime, endTime, value, value2, motionType) {
		this.moveEvents.push({ startTime, endTime, value, value2, motionType });
	}
	pushRotateEvent(startTime, endTime, value, motionType) {
		this.rotateEvents.push({ startTime, endTime, value, motionType });
	}
	format() {
		const sortFn = (a, b) => a.time - b.time;
		const sortFn2 = (a, b) => (a.startTime - b.startTime) + (a.endTime - b.endTime);
		const result = {
			bpm: this.bpm,
			speedEvents: [],
			numOfNotes: 0,
			numOfNotesAbove: 0,
			numOfNotesBelow: 0,
			notesAbove: [],
			notesBelow: [],
			judgeLineDisappearEvents: [],
			judgeLineMoveEvents: [],
			judgeLineRotateEvents: []
		};
		const pushDisappearEvent = (startTime, endTime, start, end) => {
			result.judgeLineDisappearEvents.push({ startTime, endTime, start, end, start2: 0, end2: 0 });
		};
		const pushMoveEvent = (startTime, endTime, start, end, start2, end2) => {
			result.judgeLineMoveEvents.push({ startTime, endTime, start, end, start2, end2 });
		};
		const pushRotateEvent = (startTime, endTime, start, end) => {
			result.judgeLineRotateEvents.push({ startTime, endTime, start, end, start2: 0, end2: 0 });
		};
		const cvp = this.speedEvents.sort(sortFn);
		let s1 = 0;
		for (let i = 0; i < cvp.length; i++) {
			const startTime = Math.max(cvp[i].time, 0);
			const endTime = i < cvp.length - 1 ? cvp[i + 1].time : 1e9;
			const value = cvp[i].value;
			const floorPosition = s1;
			s1 += (endTime - startTime) * value / this.bpm * 1.875;
			s1 = Math.fround(s1);
			result.speedEvents.push({ startTime, endTime, value, floorPosition });
		}
		for (const i of this.notes.sort(sortFn)) {
			const time = i.time;
			let v1 = 0;
			let v2 = 0;
			let v3 = 0;
			for (const e of result.speedEvents) {
				if (time > e.endTime) continue;
				if (time < e.startTime) break;
				v1 = e.floorPosition;
				v2 = e.value;
				v3 = time - e.startTime;
			}
			const note = {
				type: i.type,
				time: time + (i.isFake ? 1e9 : 0),
				positionX: i.positionX,
				holdTime: i.holdTime,
				speed: i.speed * (i.type === 3 ? v2 : 1),
				floorPosition: Math.fround(v1 + v2 * v3 / this.bpm * 1.875),
			};
			if (i.isAbove) {
				result.notesAbove.push(note);
				if (i.isFake) continue;
				result.numOfNotes++;
				result.numOfNotesAbove++;
			} else {
				result.notesBelow.push(note);
				if (i.isFake) continue;
				result.numOfNotes++;
				result.numOfNotesBelow++;
			}
		}
		let dt = 0;
		let d1 = 0;
		for (const e of this.alphaEvents.sort(sortFn2)) {
			pushDisappearEvent(dt, e.startTime, d1, d1);
			if (tween[e.motionType]) {
				const t1 = e.value - d1;
				let x1 = 0;
				let x2 = 0;
				for (let i = e.startTime; i < e.endTime; i++) {
					x1 = x2;
					x2 = tween[e.motionType]((i + 1 - e.startTime) / (e.endTime - e.startTime));
					pushDisappearEvent(i, i + 1, d1 + x1 * t1, d1 + x2 * t1);
				}
			} else if (e.motionType) pushDisappearEvent(e.startTime, e.endTime, d1, e.value);
			dt = e.endTime;
			d1 = e.value;
		}
		pushDisappearEvent(dt, 1e9, d1, d1);
		let mt = 0;
		let m1 = 0;
		let m2 = 0;
		for (const e of this.moveEvents.sort(sortFn2)) {
			pushMoveEvent(mt, e.startTime, m1, m1, m2, m2);
			if (e.motionType !== 1) {
				const t1 = e.value - m1;
				const t2 = e.value2 - m2;
				let x1 = 0;
				let x2 = 0;
				for (let i = e.startTime; i < e.endTime; i++) {
					x1 = x2;
					x2 = tween[e.motionType]((i + 1 - e.startTime) / (e.endTime - e.startTime));
					pushMoveEvent(i, i + 1, m1 + x1 * t1, m1 + x2 * t1, m2 + x1 * t2, m2 + x2 * t2);
				}
			} else pushMoveEvent(e.startTime, e.endTime, m1, e.value, m2, e.value2);
			mt = e.endTime;
			m1 = e.value;
			m2 = e.value2;
		}
		pushMoveEvent(mt, 1e9, m1, m1, m2, m2);
		let rt = 0;
		let r1 = 0;
		for (const e of this.rotateEvents.sort(sortFn2)) {
			pushRotateEvent(rt, e.startTime, r1, r1);
			if (e.motionType !== 1) {
				const t1 = e.value - r1;
				let x1 = 0;
				let x2 = 0;
				for (let i = e.startTime; i < e.endTime; i++) {
					x1 = x2;
					x2 = tween[e.motionType]((i + 1 - e.startTime) / (e.endTime - e.startTime));
					pushRotateEvent(i, i + 1, r1 + x1 * t1, r1 + x2 * t1);
				}
			} else pushRotateEvent(e.startTime, e.endTime, r1, e.value);
			rt = e.endTime;
			r1 = e.value;
		}
		pushRotateEvent(rt, 1e9, r1, r1);
		return result;
	}
}
class BpmList {
	constructor(baseBpm) {
		this.baseBpm = Number(baseBpm) || 120;
		this.accTime = 0;
		this.list = [];
	}
	push(start, end, bpm) {
		const value = this.accTime;
		this.list.push({ start, end, bpm, value });
		this.accTime += (end - start) / bpm;
	}
	calc(beat) {
		let time = 0;
		for (const i of this.list) {
			if (beat > i.end) continue;
			if (beat < i.start) break;
			time = Math.round(((beat - i.start) / i.bpm + i.value) * this.baseBpm * 32);
		}
		return time;
	}
}
function parse(pec) {
	const data = pec.split(/\s+/);
	const data2 = { offset: 0, bpmList: [], notes: [], lines: [] };
	const result = { formatVersion: 3, offset: 0, numOfNotes: 0, judgeLineList: [] };
	let ptr = 0;
	data2.offset = isNaN(data[ptr]) ? 0 : Number(data[ptr++]);
	while (ptr < data.length) {
		const command = data[ptr++];
		if (command === '') continue;
		if (command === 'bp') {
			const time = Number(data[ptr++]);
			const bpm = Number(data[ptr++]);
			data2.bpmList.push({ time, bpm });
		} else if (command[0] === 'n') {
			if (!'1234'.includes(command[1])) throw new Error('Unsupported Command: ' + command);
			const cmd = {};
			const type = command[1];
			cmd.type = Number(type);
			cmd.lineId = Number(data[ptr++]);
			cmd.time = Number(data[ptr++]);
			cmd.time2 = '2'.includes(type) ? Number(data[ptr++]) : cmd.time;
			cmd.offsetX = Number(data[ptr++]);
			cmd.isAbove = Number(data[ptr++]);
			cmd.isFake = Number(data[ptr++]);
			cmd.text = 'n' + Object.values(cmd).join(' ');
			cmd.speed = (data[ptr++] || '')[0] === '#' ? Number(data[ptr++]) : (ptr--, 1);
			cmd.size = (data[ptr++] || '')[0] === '&' ? Number(data[ptr++]) : (ptr--, 1);
			data2.notes.push(cmd);
		} else if (command[0] === 'c') {
			if (!'vpdamrf'.includes(command[1])) throw new Error('Unsupported Command: ' + command);
			const cmd = {};
			const type = command[1];
			cmd.type = type;
			cmd.lineId = Number(data[ptr++]);
			cmd.time = Number(data[ptr++]);
			if ('v'.includes(type)) cmd.speed = Number(data[ptr++]);
			cmd.time2 = 'mrf'.includes(type) ? Number(data[ptr++]) : cmd.time;
			if ('pm'.includes(type)) cmd.offsetX = Number(data[ptr++]);
			if ('pm'.includes(type)) cmd.offsetY = Number(data[ptr++]);
			if ('dr'.includes(type)) cmd.rotation = Number(data[ptr++]);
			if ('af'.includes(type)) cmd.alpha = Number(data[ptr++]);
			if ('mr'.includes(type)) cmd.motionType = Number(data[ptr++]);
			cmd.text = 'c' + Object.values(cmd).join(' ');
			if ('pdaf'.includes(type)) cmd.motionType = 1;
			data2.lines.push(cmd);
		} else throw new Error('Unexpected Command: ' + command);
	}
	result.offset = data2.offset / 1e3 - 0.175;
	if (!data2.bpmList.length) throw new Error('Invalid pec file');
	const bpmList = new BpmList(data2.bpmList[0].bpm);
	data2.bpmList.sort((a, b) => a.time - b.time).forEach((i, idx, arr) => {
		if (arr[idx + 1] && arr[idx + 1].time <= 0) return;
		bpmList.push(i.time < 0 ? 0 : i.time, arr[idx + 1] ? arr[idx + 1].time : 1e9, i.bpm);
	});
	const linesPec = [];
	for (const i of data2.notes) {
		const type = [0, 1, 4, 2, 3].indexOf(i.type);
		const time = bpmList.calc(i.time);
		const holdTime = bpmList.calc(i.time2) - time;
		const speed = isNaN(i.speed) ? 1 : i.speed;
		if (!linesPec[i.lineId]) linesPec[i.lineId] = new LinePec(bpmList.baseBpm);
		linesPec[i.lineId].pushNote(type, time, i.offsetX / 115.2, holdTime, speed, i.isAbove === 1, i.isFake !== 0);
	}
	const isMotion = i => tween[i] || i === 1;
	for (const i of data2.lines) {
		const t1 = bpmList.calc(i.time);
		const t2 = bpmList.calc(i.time2);
		if (t1 > t2) {
			continue;
		}
		if (!linesPec[i.lineId]) linesPec[i.lineId] = new LinePec(bpmList.baseBpm);
		if (i.type === 'v') {
			linesPec[i.lineId].pushSpeedEvent(t1, i.speed / 7.0);
		}
		if (i.type === 'a' || i.type === 'f') {
			linesPec[i.lineId].pushAlphaEvent(t1, t2, Math.max(i.alpha / 255, 0), i.motionType);
		}
		if (i.type === 'p' || i.type === 'm') {
			linesPec[i.lineId].pushMoveEvent(t1, t2, i.offsetX / 2048, i.offsetY / 1400, isMotion(i.motionType) ? i.motionType : 1);
		}
		if (i.type === 'd' || i.type === 'r') {
			linesPec[i.lineId].pushRotateEvent(t1, t2, -i.rotation, isMotion(i.motionType) ? i.motionType : 1);
		}
	}
	for (const i of linesPec) {
		const judgeLine = i.format();
		result.judgeLineList.push(judgeLine);
		result.numOfNotes += judgeLine.numOfNotes;
	}
	return { data: JSON.stringify(result) };
}
function pushLineEvent(ls, le) {
	const { startTime, endTime, start, end, easingType = 1, easingLeft = 0, easingRight = 1 } = le;
	const delta = (end - start) / (endTime - startTime);
	for (let i = ls.length - 1; i >= 0; i--) {
		const e = ls[i];
		if (e.endTime < startTime) {
			ls[i + 1] = { startTime: e.endTime, endTime: startTime, start: e.end, end: e.end, delta: 0 };
			break;
		}
		if (e.startTime === startTime) {
			ls.length = i;
			break;
		}
		if (e.startTime < startTime) {
			e.end = e.start + (startTime - e.startTime) * e.delta;
			e.endTime = startTime;
			e.delta = (e.end - e.start) / (startTime - e.startTime);
			ls.length = i + 1;
			break;
		}
	}
	if (easingType === 1 || start === end) ls.push({ startTime, endTime, start, end, delta });
	else {
		const eHead = tween[easingType](easingLeft);
		const eTail = tween[easingType](easingRight);
		const eSpeed = (easingRight - easingLeft) / (endTime - startTime);
		const eDelta = (eTail - eHead) / (end - start);
		let v1 = 0;
		let v2 = 0;
		for (let j = startTime; j < endTime; j++) {
			v1 = v2;
			v2 = (tween[easingType]((j + 1 - startTime) * eSpeed + easingLeft) - eHead) / eDelta;
			ls.push({ startTime: j, endTime: j + 1, start: start + v1, end: start + v2, delta: v2 - v1 });
		}
	}
}
function toSpeedEvent(le) {
	const result = [];
	for (const i of le) {
		const { startTime, endTime, start, end } = i;
		result.push({ time: startTime, value: start });
		if (start !== end) {
			const t1 = (end - start) / (endTime - startTime);
			for (let j = startTime; j < endTime; j++) {
				const x = j + 1 - startTime;
				result.push({ time: j + 1, value: start + x * t1 });
			}
		}
	}
	return result;
}
function getEventsValue(e, t, d) {
	let result = e[0] ? e[0].start : 0;
	for (const i of e) {
		const { startTime, endTime, start, end, delta } = i;
		if (t < startTime) break;
		if (d && t === startTime) break;
		if (t >= endTime) result = end;
		else result = start + (t - startTime) * delta;
	}
	return result;
}
function getMoveValue(e, t, d) {
	let result = e[0] ? e[0].start : 0;
	let result2 = e[0] ? e[0].start2 : 0;
	for (const i of e) {
		const { startTime, endTime, start, end, start2, end2 } = i;
		if (t < startTime) break;
		if (d && t === startTime) break;
		if (t >= endTime) {
			result = end;
			result2 = end2;
		} else {
			result = start + (t - startTime) * (end - start) / (endTime - startTime);
			result2 = start2 + (t - startTime) * (end2 - start2) / (endTime - startTime);
		}
	}
	return [result, result2];
}
function getRotateValue(e, t, d) {
	let result = e[0] ? e[0].start : 0;
	for (const i of e) {
		const { startTime, endTime, start, end } = i;
		if (t < startTime) break;
		if (d && t === startTime) break;
		if (t >= endTime) result = end;
		else result = start + (t - startTime) * (end - start) / (endTime - startTime);
	}
	return result;
}
function combineXYEvents(xe, ye) {
	const le = [];
	const splits = [];
	for (const i of xe) splits.push(i.startTime, i.endTime);
	for (const i of ye) splits.push(i.startTime, i.endTime);
	splits.sort((a, b) => a - b);
	for (let i = 0; i < splits.length - 1; i++) {
		const startTime = splits[i];
		const endTime = splits[i + 1];
		if (startTime === endTime) continue;
		const startX = getEventsValue(xe, startTime, false);
		const endX = getEventsValue(xe, endTime, true);
		const startY = getEventsValue(ye, startTime, false);
		const endY = getEventsValue(ye, endTime, true);
		le.push({ startTime, endTime, start: startX, end: endX, start2: startY, end2: endY });
	}
	return le;
}
function combineMultiEvents(es) {
	const le = [];
	const splits = [];
	for (const e of es) {
		for (const i of e) splits.push(i.startTime, i.endTime);
	}
	splits.sort((a, b) => a - b);
	for (let i = 0; i < splits.length - 1; i++) {
		const startTime = splits[i];
		const endTime = splits[i + 1];
		if (startTime === endTime) continue;
		const start = es.reduce((i, e) => i + getEventsValue(e, startTime, false), 0);
		const end = es.reduce((i, e) => i + getEventsValue(e, endTime, true), 0);
		le.push({ startTime, endTime, start, end, delta: (end - start) / (endTime - startTime) });
	}
	return le;
}
function mergeFather(child, father) {
	const moveEvents = [];
	const splits = [];
	for (const i of father.moveEvents) splits.push(i.startTime, i.endTime);
	for (const i of father.rotateEvents) splits.push(i.startTime, i.endTime);
	for (const i of child.moveEvents) splits.push(i.startTime, i.endTime);
	splits.sort((a, b) => a - b);
	for (let i = splits[0]; i < splits[splits.length - 1]; i++) {
		const startTime = i;
		const endTime = i + 1;
		if (startTime === endTime) continue;
		const [fatherX, fatherY] = getMoveValue(father.moveEvents, startTime, false);
		const fatherR = getRotateValue(father.rotateEvents, startTime, false) * -Math.PI / 180;
		const [fatherX2, fatherY2] = getMoveValue(father.moveEvents, endTime, true);
		const fatherR2 = getRotateValue(father.rotateEvents, endTime, true) * -Math.PI / 180;
		const [childX, childY] = getMoveValue(child.moveEvents, startTime, false);
		const [childX2, childY2] = getMoveValue(child.moveEvents, endTime, true);
		const start = fatherX + childX * Math.cos(fatherR) - childY * Math.sin(fatherR);
		const end = fatherX2 + childX2 * Math.cos(fatherR2) - childY2 * Math.sin(fatherR2);
		const start2 = fatherY + childX * Math.sin(fatherR) + childY * Math.cos(fatherR);
		const end2 = fatherY2 + childX2 * Math.sin(fatherR2) + childY2 * Math.cos(fatherR2);
		moveEvents.push({ startTime, endTime, start, end, start2, end2 })
	}
	child.moveEvents = moveEvents;
}
class EventLayer {
	constructor() {
		this.moveXEvents = [];
		this.moveYEvents = [];
		this.rotateEvents = [];
		this.alphaEvents = [];
		this.speedEvents = [];
	}
	pushMoveXEvent(startTime, endTime, start, end, easingType, easingLeft, easingRight) {
		this.moveXEvents.push({ startTime, endTime, start, end, easingType, easingLeft, easingRight });
	}
	pushMoveYEvent(startTime, endTime, start, end, easingType, easingLeft, easingRight) {
		this.moveYEvents.push({ startTime, endTime, start, end, easingType, easingLeft, easingRight });
	}
	pushRotateEvent(startTime, endTime, start, end, easingType, easingLeft, easingRight) {
		this.rotateEvents.push({ startTime, endTime, start, end, easingType, easingLeft, easingRight });
	}
	pushAlphaEvent(startTime, endTime, start, end, easingType, easingLeft, easingRight) {
		this.alphaEvents.push({ startTime, endTime, start, end, easingType, easingLeft, easingRight });
	}
	pushSpeedEvent(startTime, endTime, start, end) {
		this.speedEvents.push({ startTime, endTime, start, end });
	}
}
class ExtendedEvent {
	constructor() {
		this.colorEvents = [];
		this.textEvents = [];
	}
	pushColorEvent(startTime, endTime, start, end, easingType, easingLeft, easingRight) {
		this.colorEvents.push({ startTime, endTime, start, end, easingType, easingLeft, easingRight });
	}
	pushTextEvent(startTime, endTime, start, end) {
		this.textEvents.push({ startTime, endTime, start, end });
	}
}
class LineRPE {
	constructor(bpm) {
		this.bpm = 120;
		this.notes = [];
		this.eventLayers = [];
		if (!isNaN(bpm)) this.bpm = bpm;

		this.extendedEvents = [];
	}
	pushNote(type, time, positionX, holdTime, speed, isAbove, isFake, size) {
		this.notes.push({ type, time, positionX, holdTime, speed, isAbove, isFake, size });
	}
	setId(id = NaN) {
		this.id = id;
	}
	setFather(fatherLine) {
		this.father = fatherLine;
	}
	preset() {
		const sortFn2 = (a, b) => a.startTime - b.startTime;
		const events = [];
		for (const e of this.eventLayers) {
			const moveXEvents = [];
			const moveYEvents = [];
			const rotateEvents = [];
			const alphaEvents = [];
			const speedEvents = [];
			for (const i of e.moveXEvents.sort(sortFn2)) pushLineEvent(moveXEvents, i);
			for (const i of e.moveYEvents.sort(sortFn2)) pushLineEvent(moveYEvents, i);
			for (const i of e.rotateEvents.sort(sortFn2)) pushLineEvent(rotateEvents, i);
			for (const i of e.alphaEvents.sort(sortFn2)) pushLineEvent(alphaEvents, i);
			for (const i of e.speedEvents.sort(sortFn2)) pushLineEvent(speedEvents, i);
			events.push({ moveXEvents, moveYEvents, rotateEvents, alphaEvents, speedEvents });
		}
		const moveXEvents = combineMultiEvents(events.map(i => i.moveXEvents));
		const moveYEvents = combineMultiEvents(events.map(i => i.moveYEvents));
		this.moveEvents = combineXYEvents(moveXEvents, moveYEvents);
		this.rotateEvents = combineMultiEvents(events.map(i => i.rotateEvents));
		this.alphaEvents = combineMultiEvents(events.map(i => i.alphaEvents));
		this.speedEvents = toSpeedEvent(combineMultiEvents(events.map(i => i.speedEvents)));
		this.settled = true;
	}
	fitFather(stack = []) {
		if (!this.settled) this.preset();
		if (stack.includes(this)) {
			stack.map(i => i.setFather(null));
			return;
		}
		if (this.father) {
			this.father.fitFather(stack.concat(this));
			if (!this.father) return;
			if (!this.merged) mergeFather(this, this.father);
			this.merged = true;
		}
	}
	format() {
		this.fitFather([]);
		const result = {
			bpm: this.bpm,
			speedEvents: [],
			numOfNotes: 0,
			numOfNotesAbove: 0,
			numOfNotesBelow: 0,
			notesAbove: [],
			notesBelow: [],
			judgeLineDisappearEvents: [],
			judgeLineMoveEvents: [],
			judgeLineRotateEvents: [],
			colorEvents: [],
			textEvents: [],
		};
		for (const i of this.moveEvents) result.judgeLineMoveEvents.push({
			startTime: i.startTime,
			endTime: i.endTime,
			start: (i.start + 675) / 1350,
			end: (i.end + 675) / 1350,
			start2: (i.start2 + 450) / 900,
			end2: (i.end2 + 450) / 900
		});
		for (const i of this.rotateEvents) result.judgeLineRotateEvents.push({
			startTime: i.startTime,
			endTime: i.endTime,
			start: -i.start,
			end: -i.end,
			start2: 0,
			end2: 0
		});
		for (const i of this.alphaEvents) result.judgeLineDisappearEvents.push({
			startTime: i.startTime,
			endTime: i.endTime,
			start: Math.max(0, i.start / 255),
			end: Math.max(0, i.end / 255),
			start2: 0,
			end2: 0
		});
		
		// extended events, parsed by simulator
		for (const i of this.extendedEvents.colorEvents) {
			result.colorEvents.push({
				startTime: i.startTime,
				endTime: i.endTime,
				start: i.start,
				end: i.end,
				easingType: i.easingType || 1,
				easingLeft: i.easingLeft || 0,
				easingRight: i.easingRight || 1
			});
		}
		for (const i of this.extendedEvents.textEvents) {
			result.textEvents.push({
				startTime: i.startTime,
				endTime: i.endTime,
				start: i.start,
				end: i.end
			});
		}

		let floorPos = 0;
		const speedEvents = this.speedEvents;
		for (let i = 0; i < speedEvents.length; i++) {
			const startTime = Math.max(speedEvents[i].time, 0);
			const endTime = i < speedEvents.length - 1 ? speedEvents[i + 1].time : 1e9;
			const value = speedEvents[i].value * 11 / 45;
			const floorPosition = floorPos;
			floorPos += (endTime - startTime) * value / this.bpm * 1.875;
			floorPos = Math.fround(floorPos);
			result.speedEvents.push({ startTime, endTime, value, floorPosition });
		}
		const sortFn = (a, b) => a.time - b.time;
		for (const i of this.notes.sort(sortFn)) {
			const time = i.time;
			let v1 = 0;
			let v2 = 0;
			let v3 = 0;
			for (const e of result.speedEvents) {
				if (time > e.endTime) continue;
				if (time < e.startTime) break;
				v1 = e.floorPosition;
				v2 = e.value;
				v3 = time - e.startTime;
			}
			const note = {
				type: i.type,
				time: time,
				positionX: i.positionX,
				holdTime: i.holdTime,
				speed: i.speed * (i.type === 3 ? v2 : 1),
				floorPosition: Math.fround(v1 + v2 * v3 / this.bpm * 1.875),
                isFake: i.isFake,
                size: i.size
			};
			if (i.isAbove) {
				result.notesAbove.push(note);
				if (i.isFake) continue;
				result.numOfNotes++;
				result.numOfNotesAbove++;
			} else {
				result.notesBelow.push(note);
				if (i.isFake) continue;
				result.numOfNotes++;
				result.numOfNotesBelow++;
			}
		}
		return result;
	}
}

function parseRPE(pec, filename) {
	const data = JSON.parse(pec);
	const meta = data.META || data;
	if (!meta && !meta.RPEVersion) throw new Error('Invalid rpe file');
	const result = { formatVersion: 3, offset: 0, numOfNotes: 0, judgeLineList: [] };
	const info = {};
	info.Chart = filename;
	info.Music = meta.song;
	info.Image = meta.background;
	info.Name = meta.name;
	info.Artist = meta.composer;
	info.Charter = meta.charter;
	info.Level = meta.level;
	result.offset = meta.offset / 1e3;
	const line = [];
	data.judgeLineList.forEach((i, index) => {
		i.LineId = index;
		const texture = String(i.Texture).replace(/\0/g, '');
		if (texture === 'line.png') return;
		const extended = i.extended || {};
		let scaleX = extended.scaleXEvents ? extended.scaleXEvents[extended.scaleXEvents.length - 1].end : 1;
		let scaleY = extended.scaleYEvents ? extended.scaleYEvents[extended.scaleYEvents.length - 1].end : 1;
		line.push({
			Chart: filename,
			LineId: index,
			Image: texture,
			Scale: scaleY,
			Aspect: scaleX / scaleY,
			UseBackgroundDim: 0,
			UseLineColor: 1,
			UseLineScale: 1,
		});
	});
	const bpmList = new BpmList(data.BPMList[0].bpm);
	for (const i of data.BPMList) i.time = i.startTime[0] + i.startTime[1] / i.startTime[2];
	data.BPMList.sort((a, b) => a.time - b.time).forEach((i, idx, arr) => {
		if (arr[idx + 1] && arr[idx + 1].time <= 0) return; //过滤负数
		bpmList.push(i.time < 0 ? 0 : i.time, arr[idx + 1] ? arr[idx + 1].time : 1e9, i.bpm);
	});
	for (const i of data.judgeLineList) {
		if (i.zOrder === undefined) i.zOrder = 0;
		if (i.bpmfactor === undefined) i.bpmfactor = 1;
		if (i.father === undefined) i.father = -1;
        // isCover, zOrder
		const lineRPE = new LineRPE(bpmList.baseBpm / i.bpmfactor);
		lineRPE.setId(i.LineId);
		if (i.notes) {
			for (const note of i.notes) {
				if (note.alpha === undefined) note.alpha = 255;
				if (note.size === undefined) note.size = 1;
                // yOffset, visibleTime, alpha
				const type = [0, 1, 4, 2, 3].indexOf(note.type);
				const time = bpmList.calc(note.startTime[0] + note.startTime[1] / note.startTime[2]);
				const holdTime = bpmList.calc(note.endTime[0] + note.endTime[1] / note.endTime[2]) - time;
				const speed = note.speed;
				const positionX = note.positionX / 75.375;
				lineRPE.pushNote(type, time, positionX, holdTime, speed, note.above === 1, note.isFake !== 0, note.size);
			}
		}
		for (const e of i.eventLayers) {
			if (!e) continue;
			const layer = new EventLayer;
			for (const j of (e.moveXEvents || [])) {
				if (j.linkgroup === undefined) j.linkgroup = 0;
				const startTime = bpmList.calc(j.startTime[0] + j.startTime[1] / j.startTime[2]);
				const endTime = bpmList.calc(j.endTime[0] + j.endTime[1] / j.endTime[2]);
				layer.pushMoveXEvent(startTime, endTime, j.start, j.end, j.easingType, j.easingLeft, j.easingRight);
			}
			for (const j of (e.moveYEvents || [])) {
				if (j.linkgroup === undefined) j.linkgroup = 0;
				const startTime = bpmList.calc(j.startTime[0] + j.startTime[1] / j.startTime[2]);
				const endTime = bpmList.calc(j.endTime[0] + j.endTime[1] / j.endTime[2]);
				layer.pushMoveYEvent(startTime, endTime, j.start, j.end, j.easingType, j.easingLeft, j.easingRight);
			}
			for (const j of (e.rotateEvents || [])) {
				if (j.linkgroup === undefined) j.linkgroup = 0;
				const startTime = bpmList.calc(j.startTime[0] + j.startTime[1] / j.startTime[2]);
				const endTime = bpmList.calc(j.endTime[0] + j.endTime[1] / j.endTime[2]);
				layer.pushRotateEvent(startTime, endTime, j.start, j.end, j.easingType, j.easingLeft, j.easingRight);
			}
			for (const j of (e.alphaEvents || [])) {
				if (j.linkgroup === undefined) j.linkgroup = 0;
				const startTime = bpmList.calc(j.startTime[0] + j.startTime[1] / j.startTime[2]);
				const endTime = bpmList.calc(j.endTime[0] + j.endTime[1] / j.endTime[2]);
				layer.pushAlphaEvent(startTime, endTime, j.start, j.end, j.easingType, j.easingLeft, j.easingRight);
			}
			for (const j of (e.speedEvents || [])) {
				if (j.linkgroup === undefined) j.linkgroup = 0;
				const startTime = bpmList.calc(j.startTime[0] + j.startTime[1] / j.startTime[2]);
				const endTime = bpmList.calc(j.endTime[0] + j.endTime[1] / j.endTime[2]);
				layer.pushSpeedEvent(startTime, endTime, j.start, j.end);
			}
			lineRPE.eventLayers.push(layer);
		}

		const extended = new ExtendedEvent;
		for (const j of (i.extended.colorEvents || [])) {
			const startTime = bpmList.calc(j.startTime[0] + j.startTime[1] / j.startTime[2]);
			const endTime = bpmList.calc(j.endTime[0] + j.endTime[1] / j.endTime[2]);
			extended.pushColorEvent(startTime, endTime, j.start, j.end, j.easingType, j.easingLeft, j.easingRight)
		}
		for (const j of (i.extended.textEvents || [])) {
			const startTime = bpmList.calc(j.startTime[0] + j.startTime[1] / j.startTime[2]);
			const endTime = bpmList.calc(j.endTime[0] + j.endTime[1] / j.endTime[2]);
			extended.pushTextEvent(startTime, endTime, j.start, j.end);
		}
		lineRPE.extendedEvents = extended;
		i.judgeLineRPE = lineRPE;
	}
	for (const i of data.judgeLineList) {
		const lineRPE = i.judgeLineRPE;
		const father = data.judgeLineList[i.father];
		if (father) lineRPE.setFather(father.judgeLineRPE);
	}
	for (const i of data.judgeLineList) {
		const lineRPE = i.judgeLineRPE;
		const judgeLine = lineRPE.format();
		result.judgeLineList.push(judgeLine);
		result.numOfNotes += judgeLine.numOfNotes;
	}
	return { data: JSON.stringify(result), info: info, line: line };
}
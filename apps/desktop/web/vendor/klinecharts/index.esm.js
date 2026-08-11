/**
     * @license
     * KLineChart v10.0.0-beta2
     * Copyright (c) 2019 lihu.
     * Licensed under Apache License 2.0 https://www.apache.org/licenses/LICENSE-2.0
     */
var DEV = false;
function log(templateText, tagStyle, messageStyle, api, invalidParam, append) {
	if (DEV) {
		const apiStr = api !== "" ? `Call api \`${api}\`${invalidParam !== "" || append !== "" ? ", " : "."}` : "";
		const invalidParamStr = invalidParam !== "" ? `invalid parameter \`${invalidParam}\`${append !== "" ? ", " : "."}` : "";
		console.log(templateText, tagStyle, messageStyle, apiStr, invalidParamStr, append !== "" ? append : "");
	}
}
function logWarn(api, invalidParam, append) {
	log("%c😑 klinecharts warning%c %s%s%s", "padding:3px 4px;border-radius:2px;color:#ffffff;background-color:#FF9600", "color:#FF9600", api, invalidParam, append ?? "");
}
function logError(api, invalidParam, append) {
	log("%c😟 klinecharts error%c %s%s%s", "padding:3px 4px;border-radius:2px;color:#ffffff;background-color:#F92855;", "color:#F92855;", api, invalidParam, append ?? "");
}
function logTag() {
	log("%c❤️ Welcome to klinecharts. Version is 10.0.0-beta2", "border-radius:4px;border:dashed 1px #1677FF;line-height:70px;padding:0 20px;margin:16px 0;font-size:14px;color:#1677FF;", "", "", "", "");
}
function merge(target, source) {
	if (!isObject(target) && !isObject(source)) return;
	for (const key in source) if (Object.prototype.hasOwnProperty.call(source, key)) {
		const targetProp = target[key];
		const sourceProp = source[key];
		if (isObject(sourceProp) && isObject(targetProp)) merge(targetProp, sourceProp);
		else target[key] = clone(sourceProp);
	}
}
function clone(target) {
	if (!isObject(target)) return target;
	let copy = null;
	if (isArray(target)) copy = [];
	else copy = {};
	for (const key in target) if (Object.prototype.hasOwnProperty.call(target, key)) {
		const v = target[key];
		if (isObject(v)) copy[key] = clone(v);
		else copy[key] = v;
	}
	return copy;
}
function isArray(value) {
	return Object.prototype.toString.call(value) === "[object Array]";
}
function isFunction(value) {
	return typeof value === "function";
}
function isObject(value) {
	return typeof value === "object" && isValid(value);
}
function isNumber(value) {
	return typeof value === "number" && Number.isFinite(value);
}
function isValid(value) {
	return value !== null && value !== void 0;
}
function isBoolean(value) {
	return typeof value === "boolean";
}
function isString(value) {
	return typeof value === "string";
}
var reEscapeChar = /\\(\\)?/g;
var rePropName = RegExp("[^.[\\]]+|\\[(?:([^\"'][^[]*)|([\"'])((?:(?!\\2)[^\\\\]|\\\\.)*?)\\2)\\]|(?=(?:\\.|\\[\\])(?:\\.|\\[\\]|$))", "g");
function formatValue(data, key, defaultValue) {
	if (isValid(data)) {
		const path = [];
		key.replace(rePropName, (subString, ...args) => {
			let k = subString;
			if (isValid(args[1])) k = args[2].replace(reEscapeChar, "$1");
			else if (isValid(args[0])) k = args[0].trim();
			path.push(k);
			return "";
		});
		let value = data;
		let index = 0;
		const length = path.length;
		while (isValid(value) && index < length) value = value?.[path[index++]];
		return isValid(value) ? value : defaultValue ?? "--";
	}
	return defaultValue ?? "--";
}
function formatTimestampToDateTime(dateTimeFormat, timestamp) {
	const date = {};
	dateTimeFormat.formatToParts(new Date(timestamp)).forEach(({ type, value }) => {
		switch (type) {
			case "year":
				date.YYYY = value;
				break;
			case "month":
				date.MM = value;
				break;
			case "day":
				date.DD = value;
				break;
			case "hour":
				date.HH = value === "24" ? "00" : value;
				break;
			case "minute":
				date.mm = value;
				break;
			case "second":
				date.ss = value;
				break;
			default: break;
		}
	});
	return date;
}
function formatTimestampByTemplate(dateTimeFormat, timestamp, template) {
	const date = formatTimestampToDateTime(dateTimeFormat, timestamp);
	return template.replace(/YYYY|MM|DD|HH|mm|ss/g, (key) => date[key]);
}
function formatPrecision(value, precision) {
	const v = +value;
	if (isNumber(v)) return v.toFixed(precision ?? 2);
	return `${value}`;
}
function formatBigNumber(value) {
	const v = +value;
	if (isNumber(v)) {
		if (v > 1e9) return `${+(v / 1e9).toFixed(3)}B`;
		if (v > 1e6) return `${+(v / 1e6).toFixed(3)}M`;
		if (v > 1e3) return `${+(v / 1e3).toFixed(3)}K`;
	}
	return `${value}`;
}
function formatThousands(value, sign) {
	const vl = `${value}`;
	if (sign.length === 0) return vl;
	if (vl.includes(".")) {
		const arr = vl.split(".");
		return `${arr[0].replace(/(\d)(?=(\d{3})+$)/g, ($1) => `${$1}${sign}`)}.${arr[1]}`;
	}
	return vl.replace(/(\d)(?=(\d{3})+$)/g, ($1) => `${$1}${sign}`);
}
function formatFoldDecimal(value, threshold) {
	const vl = `${value}`;
	if (new RegExp("\\.0{" + threshold + ",}[1-9][0-9]*$").test(vl)) {
		const result = vl.split(".");
		const lastIndex = result.length - 1;
		const v = result[lastIndex];
		const match = /0*/.exec(v);
		if (isValid(match)) {
			const count = match[0].length;
			result[lastIndex] = v.replace(/0*/, `0{${count}}`);
			return result.join(".");
		}
	}
	return vl;
}
function formatTemplateString(template, params) {
	return template.replace(/\{(\w+)\}/g, (_, key) => {
		const value = params[key];
		if (isValid(value)) return value;
		return `{${key}}`;
	});
}
var measureCtx = null;
function getPixelRatio(canvas) {
	return canvas.ownerDocument.defaultView?.devicePixelRatio ?? 1;
}
function createFont(size, weight, family) {
	return `${weight ?? "normal"} ${size ?? 12}px ${family ?? "Helvetica Neue"}`;
}
function calcTextWidth(text, size, weight, family) {
	if (!isValid(measureCtx)) {
		const canvas = document.createElement("canvas");
		const pixelRatio = getPixelRatio(canvas);
		measureCtx = canvas.getContext("2d");
		measureCtx.scale(pixelRatio, pixelRatio);
	}
	measureCtx.font = createFont(size, weight, family);
	return Math.round(measureCtx.measureText(text).width);
}
function createDefaultBounding(bounding) {
	const defaultBounding = {
		width: 0,
		height: 0,
		left: 0,
		right: 0,
		top: 0,
		bottom: 0
	};
	if (isValid(bounding)) merge(defaultBounding, bounding);
	return defaultBounding;
}
var UpdateLevel = function(UpdateLevel) {
	UpdateLevel[UpdateLevel["Main"] = 0] = "Main";
	UpdateLevel[UpdateLevel["Overlay"] = 1] = "Overlay";
	UpdateLevel[UpdateLevel["Separator"] = 2] = "Separator";
	UpdateLevel[UpdateLevel["Drawer"] = 3] = "Drawer";
	UpdateLevel[UpdateLevel["All"] = 4] = "All";
	return UpdateLevel;
}({});
function requestAnimationFrame(fn) {
	if (isFunction(window.requestAnimationFrame)) return window.requestAnimationFrame(fn);
	return window.setTimeout(fn, 20);
}
function cancelAnimationFrame(id) {
	if (isFunction(window.cancelAnimationFrame)) window.cancelAnimationFrame(id);
	else window.clearTimeout(id);
}
var Animation = class {
	constructor(options) {
		this._options = {
			duration: 500,
			iterationCount: 1
		};
		this._currentIterationCount = 0;
		this._running = false;
		this._time = 0;
		merge(this._options, options);
	}
	_loop() {
		this._running = true;
		const step = () => {
			if (this._running) {
				const diffTime = (/* @__PURE__ */ new Date()).getTime() - this._time;
				if (diffTime < this._options.duration) {
					this._doFrameCallback?.(diffTime);
					requestAnimationFrame(step);
				} else {
					this.stop();
					this._currentIterationCount++;
					if (this._currentIterationCount < this._options.iterationCount) this.start();
				}
			}
		};
		requestAnimationFrame(step);
	}
	doFrame(callback) {
		this._doFrameCallback = callback;
		return this;
	}
	setDuration(duration) {
		this._options.duration = duration;
		return this;
	}
	setIterationCount(iterationCount) {
		this._options.iterationCount = iterationCount;
		return this;
	}
	start() {
		if (!this._running) {
			this._time = (/* @__PURE__ */ new Date()).getTime();
			this._loop();
		}
	}
	stop() {
		if (this._running) this._doFrameCallback?.(this._options.duration);
		this._running = false;
	}
};
var baseId = 1;
var prevIdTimestamp = (/* @__PURE__ */ new Date()).getTime();
function createId(prefix) {
	const timestamp = (/* @__PURE__ */ new Date()).getTime();
	if (timestamp === prevIdTimestamp) ++baseId;
	else baseId = 1;
	prevIdTimestamp = timestamp;
	return `${prefix ?? ""}${timestamp}_${baseId}`;
}
function createDom(tagName, styles) {
	const dom = document.createElement(tagName);
	const s = styles ?? {};
	for (const key in s) dom.style[key] = s[key] ?? "";
	return dom;
}
function binarySearchNearest(dataList, valueKey, targetValue) {
	let left = 0;
	let right = 0;
	for (right = dataList.length - 1; left !== right;) {
		const midIndex = Math.floor((right + left) / 2);
		const mid = right - left;
		const midValue = dataList[midIndex][valueKey];
		if (targetValue === dataList[left][valueKey]) return left;
		if (targetValue === dataList[right][valueKey]) return right;
		if (targetValue === midValue) return midIndex;
		if (targetValue > midValue) left = midIndex;
		else right = midIndex;
		if (mid <= 2) break;
	}
	return left;
}
function nice(value) {
	const exponent = Math.floor(log10(value));
	const exp10 = index10(exponent);
	const f = value / exp10;
	let nf = 0;
	if (f < 1.5) nf = 1;
	else if (f < 2.5) nf = 2;
	else if (f < 3.5) nf = 3;
	else if (f < 4.5) nf = 4;
	else if (f < 5.5) nf = 5;
	else if (f < 6.5) nf = 6;
	else nf = 8;
	value = nf * exp10;
	return +value.toFixed(Math.abs(exponent));
}
function round(value, precision) {
	precision = Math.max(0, precision ?? 0);
	const pow = Math.pow(10, precision);
	return Math.round(value * pow) / pow;
}
function getPrecision(value) {
	const str = value.toString();
	const eIndex = str.indexOf("e");
	if (eIndex > 0) {
		const precision = +str.slice(eIndex + 1);
		return precision < 0 ? -precision : 0;
	}
	const dotIndex = str.indexOf(".");
	return dotIndex < 0 ? 0 : str.length - 1 - dotIndex;
}
function getMaxMin(dataList, maxKey, minKey) {
	const maxMin = [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
	const dataLength = dataList.length;
	let index = 0;
	while (index < dataLength) {
		const data = dataList[index];
		maxMin[0] = Math.max(data[maxKey] ?? Number.MIN_SAFE_INTEGER, maxMin[0]);
		maxMin[1] = Math.min(data[minKey] ?? Number.MAX_SAFE_INTEGER, maxMin[1]);
		++index;
	}
	return maxMin;
}
function log10(value) {
	if (value === 0) return 0;
	return Math.log10(value);
}
function index10(value) {
	return Math.pow(10, value);
}
function getDefaultVisibleRange() {
	return {
		from: 0,
		to: 0,
		realFrom: 0,
		realTo: 0
	};
}
var TaskScheduler = class {
	constructor(callback) {
		this._holdingTasks = null;
		this._running = false;
		this._callback = callback;
	}
	add(tasks) {
		if (!this._running) this._runTask(tasks);
		else if (isValid(this._holdingTasks)) this._holdingTasks = {
			...this._holdingTasks,
			...tasks
		};
		else this._holdingTasks = tasks;
	}
	async _runTask(tasks) {
		this._running = true;
		try {
			await Promise.all(Object.values(tasks));
		} finally {
			this._running = false;
			this._callback?.();
			if (isValid(this._holdingTasks)) {
				const next = this._holdingTasks;
				this._runTask(next);
				this._holdingTasks = null;
			}
		}
	}
	clear() {
		this._holdingTasks = null;
	}
};
var SymbolDefaultPrecisionConstants = {
	PRICE: 2,
	VOLUME: 0
};
var Action = class {
	constructor() {
		this._callbacks = [];
	}
	subscribe(callback) {
		if (this._callbacks.indexOf(callback) < 0) this._callbacks.push(callback);
	}
	unsubscribe(callback) {
		if (isFunction(callback)) {
			const index = this._callbacks.indexOf(callback);
			if (index > -1) this._callbacks.splice(index, 1);
		} else this._callbacks = [];
	}
	execute(data) {
		this._callbacks.forEach((callback) => {
			callback(data);
		});
	}
	isEmpty() {
		return this._callbacks.length === 0;
	}
};
function isTransparent(color) {
	return color === "transparent" || color === "none" || /^[rR][gG][Bb][Aa]\(([\s]*(2[0-4][0-9]|25[0-5]|[01]?[0-9][0-9]?)[\s]*,){3}[\s]*0[\s]*\)$/.test(color) || /^[hH][Ss][Ll][Aa]\(([\s]*(360｜3[0-5][0-9]|[012]?[0-9][0-9]?)[\s]*,)([\s]*((100|[0-9][0-9]?)%|0)[\s]*,){2}([\s]*0[\s]*)\)$/.test(color);
}
function hexToRgb(hex, alpha) {
	const h = hex.replace(/^#/, "");
	const i = parseInt(h, 16);
	return `rgba(${i >> 16 & 255}, ${i >> 8 & 255}, ${i & 255}, ${alpha ?? 1})`;
}
var Color = {
	RED: "#F92855",
	GREEN: "#2DC08E",
	WHITE: "#FFFFFF",
	GREY: "#76808F",
	BLUE: "#1677FF"
};
function getDefaultGridStyle() {
	return {
		show: true,
		horizontal: {
			show: true,
			size: 1,
			color: "#EDEDED",
			style: "dashed",
			dashedValue: [2, 2]
		},
		vertical: {
			show: true,
			size: 1,
			color: "#EDEDED",
			style: "dashed",
			dashedValue: [2, 2]
		}
	};
}
function getDefaultCandleStyle() {
	const highLow = {
		show: true,
		color: Color.GREY,
		textOffset: 5,
		textSize: 10,
		textFamily: "Helvetica Neue",
		textWeight: "normal"
	};
	return {
		type: "candle_solid",
		bar: {
			compareRule: "current_open",
			upColor: Color.GREEN,
			downColor: Color.RED,
			noChangeColor: Color.GREY,
			upBorderColor: Color.GREEN,
			downBorderColor: Color.RED,
			noChangeBorderColor: Color.GREY,
			upWickColor: Color.GREEN,
			downWickColor: Color.RED,
			noChangeWickColor: Color.GREY
		},
		area: {
			lineSize: 2,
			lineColor: Color.BLUE,
			smooth: false,
			value: "close",
			backgroundColor: [{
				offset: 0,
				color: hexToRgb(Color.BLUE, .01)
			}, {
				offset: 1,
				color: hexToRgb(Color.BLUE, .2)
			}],
			point: {
				show: true,
				color: Color.BLUE,
				radius: 4,
				rippleColor: hexToRgb(Color.BLUE, .3),
				rippleRadius: 8,
				animation: true,
				animationDuration: 1e3
			}
		},
		priceMark: {
			show: true,
			high: { ...highLow },
			low: { ...highLow },
			last: {
				show: true,
				compareRule: "current_open",
				upColor: Color.GREEN,
				downColor: Color.RED,
				noChangeColor: Color.GREY,
				line: {
					show: true,
					style: "dashed",
					dashedValue: [4, 4],
					size: 1
				},
				text: {
					show: true,
					style: "fill",
					size: 12,
					paddingLeft: 4,
					paddingTop: 4,
					paddingRight: 4,
					paddingBottom: 4,
					borderColor: "transparent",
					borderStyle: "solid",
					borderSize: 0,
					borderDashedValue: [2, 2],
					color: Color.WHITE,
					family: "Helvetica Neue",
					weight: "normal",
					borderRadius: 2
				},
				extendTexts: []
			}
		},
		tooltip: {
			offsetLeft: 4,
			offsetTop: 6,
			offsetRight: 4,
			offsetBottom: 6,
			showRule: "always",
			showType: "standard",
			rect: {
				position: "fixed",
				paddingLeft: 4,
				paddingRight: 4,
				paddingTop: 4,
				paddingBottom: 4,
				offsetLeft: 4,
				offsetTop: 4,
				offsetRight: 4,
				offsetBottom: 4,
				borderRadius: 4,
				borderSize: 1,
				borderColor: "#F2F3F5",
				color: "#FEFEFE"
			},
			title: {
				show: true,
				size: 14,
				family: "Helvetica Neue",
				weight: "normal",
				color: Color.GREY,
				marginLeft: 8,
				marginTop: 4,
				marginRight: 8,
				marginBottom: 4,
				template: "{ticker} · {period}"
			},
			legend: {
				size: 12,
				family: "Helvetica Neue",
				weight: "normal",
				color: Color.GREY,
				marginLeft: 8,
				marginTop: 4,
				marginRight: 8,
				marginBottom: 4,
				defaultValue: "n/a",
				template: [
					{
						title: "time",
						value: "{time}"
					},
					{
						title: "open",
						value: "{open}"
					},
					{
						title: "high",
						value: "{high}"
					},
					{
						title: "low",
						value: "{low}"
					},
					{
						title: "close",
						value: "{close}"
					},
					{
						title: "volume",
						value: "{volume}"
					}
				]
			},
			features: []
		}
	};
}
function getDefaultIndicatorStyle() {
	const alphaGreen = hexToRgb(Color.GREEN, .7);
	const alphaRed = hexToRgb(Color.RED, .7);
	return {
		ohlc: {
			compareRule: "current_open",
			upColor: alphaGreen,
			downColor: alphaRed,
			noChangeColor: Color.GREY
		},
		bars: [{
			style: "fill",
			borderStyle: "solid",
			borderSize: 1,
			borderDashedValue: [2, 2],
			upColor: alphaGreen,
			downColor: alphaRed,
			noChangeColor: Color.GREY
		}],
		lines: [
			"#FF9600",
			"#935EBD",
			Color.BLUE,
			"#E11D74",
			"#01C5C4"
		].map((color) => ({
			style: "solid",
			smooth: false,
			size: 1,
			dashedValue: [2, 2],
			color
		})),
		circles: [{
			style: "fill",
			borderStyle: "solid",
			borderSize: 1,
			borderDashedValue: [2, 2],
			upColor: alphaGreen,
			downColor: alphaRed,
			noChangeColor: Color.GREY
		}],
		texts: [{
			paddingLeft: 0,
			paddingTop: 0,
			paddingRight: 0,
			paddingBottom: 0,
			style: "fill",
			size: 12,
			color: Color.BLUE,
			family: "Helvetica Neue",
			weight: "normal",
			borderStyle: "solid",
			borderDashedValue: [2, 2],
			borderSize: 0,
			borderColor: "transparent",
			borderRadius: 0,
			backgroundColor: "transparent"
		}],
		lastValueMark: {
			show: false,
			text: {
				show: false,
				style: "fill",
				color: Color.WHITE,
				size: 12,
				family: "Helvetica Neue",
				weight: "normal",
				borderStyle: "solid",
				borderColor: "transparent",
				borderSize: 0,
				borderDashedValue: [2, 2],
				paddingLeft: 4,
				paddingTop: 4,
				paddingRight: 4,
				paddingBottom: 4,
				borderRadius: 2
			}
		},
		tooltip: {
			offsetLeft: 4,
			offsetTop: 6,
			offsetRight: 4,
			offsetBottom: 6,
			showRule: "always",
			showType: "standard",
			title: {
				show: true,
				showName: true,
				showParams: true,
				size: 12,
				family: "Helvetica Neue",
				weight: "normal",
				color: Color.GREY,
				marginLeft: 8,
				marginTop: 4,
				marginRight: 8,
				marginBottom: 4
			},
			legend: {
				size: 12,
				family: "Helvetica Neue",
				weight: "normal",
				color: Color.GREY,
				marginLeft: 8,
				marginTop: 4,
				marginRight: 8,
				marginBottom: 4,
				defaultValue: "n/a"
			},
			features: []
		}
	};
}
function getDefaultAxisStyle() {
	return {
		show: true,
		size: "auto",
		axisLine: {
			show: true,
			color: "#DDDDDD",
			size: 1
		},
		tickText: {
			show: true,
			color: Color.GREY,
			size: 12,
			family: "Helvetica Neue",
			weight: "normal",
			marginStart: 4,
			marginEnd: 6
		},
		tickLine: {
			show: true,
			size: 1,
			length: 3,
			color: "#DDDDDD"
		}
	};
}
function getDefaultCrosshairStyle() {
	return {
		show: true,
		horizontal: {
			show: true,
			line: {
				show: true,
				style: "dashed",
				dashedValue: [4, 2],
				size: 1,
				color: Color.GREY
			},
			text: {
				show: true,
				style: "fill",
				color: Color.WHITE,
				size: 12,
				family: "Helvetica Neue",
				weight: "normal",
				borderStyle: "solid",
				borderDashedValue: [2, 2],
				borderSize: 1,
				borderColor: Color.GREY,
				borderRadius: 2,
				paddingLeft: 4,
				paddingRight: 4,
				paddingTop: 4,
				paddingBottom: 4,
				backgroundColor: Color.GREY
			},
			features: []
		},
		vertical: {
			show: true,
			line: {
				show: true,
				style: "dashed",
				dashedValue: [4, 2],
				size: 1,
				color: Color.GREY
			},
			text: {
				show: true,
				style: "fill",
				color: Color.WHITE,
				size: 12,
				family: "Helvetica Neue",
				weight: "normal",
				borderStyle: "solid",
				borderDashedValue: [2, 2],
				borderSize: 1,
				borderColor: Color.GREY,
				borderRadius: 2,
				paddingLeft: 4,
				paddingRight: 4,
				paddingTop: 4,
				paddingBottom: 4,
				backgroundColor: Color.GREY
			}
		}
	};
}
function getDefaultOverlayStyle() {
	const pointBorderColor = hexToRgb(Color.BLUE, .35);
	const alphaBg = hexToRgb(Color.BLUE, .25);
	function text() {
		return {
			style: "fill",
			color: Color.WHITE,
			size: 12,
			family: "Helvetica Neue",
			weight: "normal",
			borderStyle: "solid",
			borderDashedValue: [2, 2],
			borderSize: 1,
			borderRadius: 2,
			borderColor: Color.BLUE,
			paddingLeft: 4,
			paddingRight: 4,
			paddingTop: 4,
			paddingBottom: 4,
			backgroundColor: Color.BLUE
		};
	}
	return {
		point: {
			color: Color.BLUE,
			borderColor: pointBorderColor,
			borderSize: 1,
			radius: 5,
			activeColor: Color.BLUE,
			activeBorderColor: pointBorderColor,
			activeBorderSize: 3,
			activeRadius: 5
		},
		line: {
			style: "solid",
			smooth: false,
			color: Color.BLUE,
			size: 1,
			dashedValue: [2, 2]
		},
		rect: {
			style: "fill",
			color: alphaBg,
			borderColor: Color.BLUE,
			borderSize: 1,
			borderRadius: 0,
			borderStyle: "solid",
			borderDashedValue: [2, 2]
		},
		polygon: {
			style: "fill",
			color: Color.BLUE,
			borderColor: Color.BLUE,
			borderSize: 1,
			borderStyle: "solid",
			borderDashedValue: [2, 2]
		},
		circle: {
			style: "fill",
			color: alphaBg,
			borderColor: Color.BLUE,
			borderSize: 1,
			borderStyle: "solid",
			borderDashedValue: [2, 2]
		},
		arc: {
			style: "solid",
			color: Color.BLUE,
			size: 1,
			dashedValue: [2, 2]
		},
		text: text()
	};
}
function getDefaultSeparatorStyle() {
	return {
		size: 1,
		color: "#DDDDDD",
		fill: true,
		activeBackgroundColor: hexToRgb(Color.BLUE, .08)
	};
}
function getDefaultStyles() {
	return {
		grid: getDefaultGridStyle(),
		candle: getDefaultCandleStyle(),
		indicator: getDefaultIndicatorStyle(),
		xAxis: getDefaultAxisStyle(),
		yAxis: getDefaultAxisStyle(),
		separator: getDefaultSeparatorStyle(),
		crosshair: getDefaultCrosshairStyle(),
		overlay: getDefaultOverlayStyle()
	};
}
var DEFAULT_AXIS_ID = "default";
function getDefaultAxisRange() {
	return {
		from: 0,
		to: 0,
		range: 0,
		realFrom: 0,
		realTo: 0,
		realRange: 0,
		displayFrom: 0,
		displayTo: 0,
		displayRange: 0
	};
}
var AxisImp = class {
	constructor(parent) {
		this.scrollZoomEnabled = true;
		this._range = getDefaultAxisRange();
		this._prevRange = getDefaultAxisRange();
		this._ticks = [];
		this._autoCalcTickFlag = true;
		this._parent = parent;
	}
	getParent() {
		return this._parent;
	}
	buildTicks(force) {
		if (this._autoCalcTickFlag) this._range = this.createRangeImp();
		if (this._prevRange.from !== this._range.from || this._prevRange.to !== this._range.to || force) {
			this._prevRange = this._range;
			this._ticks = this.createTicksImp();
			return true;
		}
		return false;
	}
	getTicks() {
		return this._ticks;
	}
	setRange(range) {
		this._autoCalcTickFlag = false;
		this._range = range;
	}
	getRange() {
		return this._range;
	}
	setAutoCalcTickFlag(flag) {
		this._autoCalcTickFlag = flag;
	}
	getAutoCalcTickFlag() {
		return this._autoCalcTickFlag;
	}
};
function eachFigures(indicator, dataIndex, barSpace, defaultStyles, eachFigureCallback) {
	const result = indicator.result;
	const figures = indicator.figures;
	const styles = indicator.styles;
	const textStyles = formatValue(styles, "texts", defaultStyles.texts);
	const textStyleCount = textStyles.length;
	const circleStyles = formatValue(styles, "circles", defaultStyles.circles);
	const circleStyleCount = circleStyles.length;
	const barStyles = formatValue(styles, "bars", defaultStyles.bars);
	const barStyleCount = barStyles.length;
	const lineStyles = formatValue(styles, "lines", defaultStyles.lines);
	const lineStyleCount = lineStyles.length;
	let textCount = 0;
	let circleCount = 0;
	let barCount = 0;
	let lineCount = 0;
	let defaultFigureStyles;
	let figureIndex = 0;
	figures.forEach((figure) => {
		switch (figure.type) {
			case "text":
				figureIndex = textCount;
				defaultFigureStyles = textStyles[textCount % textStyleCount];
				textCount++;
				break;
			case "circle": {
				figureIndex = circleCount;
				const styles = circleStyles[circleCount % circleStyleCount];
				defaultFigureStyles = {
					...styles,
					color: styles.noChangeColor
				};
				circleCount++;
				break;
			}
			case "bar": {
				figureIndex = barCount;
				const styles = barStyles[barCount % barStyleCount];
				defaultFigureStyles = {
					...styles,
					color: styles.noChangeColor
				};
				barCount++;
				break;
			}
			case "line":
				figureIndex = lineCount;
				defaultFigureStyles = lineStyles[lineCount % lineStyleCount];
				lineCount++;
				break;
			default: break;
		}
		if (isValid(figure.type)) {
			const ss = figure.styles?.({
				data: {
					prev: result[dataIndex - 1],
					current: result[dataIndex],
					next: result[dataIndex + 1]
				},
				indicator,
				barSpace,
				defaultStyles
			});
			eachFigureCallback(figure, {
				...defaultFigureStyles,
				...ss
			}, figureIndex);
		}
	});
}
var IndicatorImp = class {
	constructor(indicator) {
		this.yAxisId = DEFAULT_AXIS_ID;
		this.precision = 4;
		this.calcParams = [];
		this.shouldOhlc = false;
		this.shouldFormatBigNumber = false;
		this.visible = true;
		this.zLevel = 0;
		this.series = "normal";
		this.figures = [];
		this.minValue = null;
		this.maxValue = null;
		this.styles = null;
		this.shouldUpdate = (prev, current) => {
			const calc = JSON.stringify(prev.calcParams) !== JSON.stringify(current.calcParams) || prev.figures !== current.figures || prev.calc !== current.calc;
			return {
				calc,
				draw: calc || prev.shortName !== current.shortName || prev.paneId !== current.paneId || prev.yAxisId !== current.yAxisId || prev.series !== current.series || prev.minValue !== current.minValue || prev.maxValue !== current.maxValue || prev.precision !== current.precision || prev.shouldOhlc !== current.shouldOhlc || prev.shouldFormatBigNumber !== current.shouldFormatBigNumber || prev.visible !== current.visible || prev.zLevel !== current.zLevel || prev.extendData !== current.extendData || prev.regenerateFigures !== current.regenerateFigures || prev.createTooltipDataSource !== current.createTooltipDataSource || prev.draw !== current.draw
			};
		};
		this.calc = () => [];
		this.regenerateFigures = null;
		this.createTooltipDataSource = null;
		this.draw = null;
		this.result = [];
		this._lockSeriesPrecision = false;
		this.override(indicator);
		this._lockSeriesPrecision = false;
	}
	override(indicator) {
		const { result, ...currentOthers } = this;
		this._prevIndicator = {
			...clone(currentOthers),
			result
		};
		const { id, name, shortName, precision, styles, figures, calcParams, ...others } = indicator;
		if (!isString(this.id) && isString(id)) this.id = id;
		if (!isString(this.name)) this.name = name ?? "";
		this.shortName = shortName ?? this.shortName ?? this.name;
		if (isNumber(precision)) {
			this.precision = precision;
			this._lockSeriesPrecision = true;
		}
		if (isValid(styles)) {
			this.styles ??= {};
			merge(this.styles, styles);
		}
		merge(this, others);
		if (isValid(calcParams)) {
			this.calcParams = calcParams;
			if (isFunction(this.regenerateFigures)) this.figures = this.regenerateFigures(this.calcParams);
		}
		this.figures = figures ?? this.figures;
	}
	setSeriesPrecision(precision) {
		if (!this._lockSeriesPrecision) this.precision = precision;
	}
	shouldUpdateImp() {
		const sort = this._prevIndicator.zLevel !== this.zLevel;
		const result = this.shouldUpdate(this._prevIndicator, this);
		if (isBoolean(result)) return {
			calc: result,
			draw: result,
			sort
		};
		return {
			...result,
			sort
		};
	}
	async calcImp(dataList) {
		try {
			const result = await this.calc(dataList, this);
			this.result = result;
			return true;
		} catch (e) {
			return false;
		}
	}
	static extend(template) {
		class Custom extends IndicatorImp {
			constructor() {
				super(template);
			}
		}
		return Custom;
	}
};
var averagePrice = {
	name: "AVP",
	shortName: "AVP",
	series: "price",
	precision: 2,
	figures: [{
		key: "avp",
		title: "AVP: ",
		type: "line"
	}],
	calc: (dataList) => {
		let totalTurnover = 0;
		let totalVolume = 0;
		return dataList.map((kLineData) => {
			const avp = {};
			const turnover = kLineData.turnover ?? 0;
			const volume = kLineData.volume ?? 0;
			totalTurnover += turnover;
			totalVolume += volume;
			if (totalVolume !== 0) avp.avp = totalTurnover / totalVolume;
			return avp;
		});
	}
};
var awesomeOscillator = {
	name: "AO",
	shortName: "AO",
	calcParams: [5, 34],
	figures: [{
		key: "ao",
		title: "AO: ",
		type: "bar",
		baseValue: 0,
		styles: ({ data, indicator, defaultStyles }) => {
			const { prev, current } = data;
			const prevAo = prev?.ao ?? Number.MIN_SAFE_INTEGER;
			const currentAo = current?.ao ?? Number.MIN_SAFE_INTEGER;
			let color = "";
			if (currentAo > prevAo) color = formatValue(indicator.styles, "bars[0].upColor", defaultStyles.bars[0].upColor);
			else color = formatValue(indicator.styles, "bars[0].downColor", defaultStyles.bars[0].downColor);
			return {
				color,
				style: currentAo > prevAo ? "stroke" : "fill",
				borderColor: color
			};
		}
	}],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		const maxPeriod = Math.max(params[0], params[1]);
		let shortSum = 0;
		let longSum = 0;
		let short = 0;
		let long = 0;
		return dataList.map((kLineData, i) => {
			const ao = {};
			const middle = (kLineData.low + kLineData.high) / 2;
			shortSum += middle;
			longSum += middle;
			if (i >= params[0] - 1) {
				short = shortSum / params[0];
				const agoKLineData = dataList[i - (params[0] - 1)];
				shortSum -= (agoKLineData.low + agoKLineData.high) / 2;
			}
			if (i >= params[1] - 1) {
				long = longSum / params[1];
				const agoKLineData = dataList[i - (params[1] - 1)];
				longSum -= (agoKLineData.low + agoKLineData.high) / 2;
			}
			if (i >= maxPeriod - 1) ao.ao = short - long;
			return ao;
		});
	}
};
var bias = {
	name: "BIAS",
	shortName: "BIAS",
	calcParams: [
		6,
		12,
		24
	],
	figures: [
		{
			key: "bias1",
			title: "BIAS6: ",
			type: "line"
		},
		{
			key: "bias2",
			title: "BIAS12: ",
			type: "line"
		},
		{
			key: "bias3",
			title: "BIAS24: ",
			type: "line"
		}
	],
	regenerateFigures: (params) => params.map((p, i) => ({
		key: `bias${i + 1}`,
		title: `BIAS${p}: `,
		type: "line"
	})),
	calc: (dataList, indicator) => {
		const { calcParams: params, figures } = indicator;
		const closeSums = [];
		return dataList.map((kLineData, i) => {
			const bias = {};
			const close = kLineData.close;
			params.forEach((p, index) => {
				closeSums[index] = (closeSums[index] ?? 0) + close;
				if (i >= p - 1) {
					const mean = closeSums[index] / params[index];
					bias[figures[index].key] = (close - mean) / mean * 100;
					closeSums[index] -= dataList[i - (p - 1)].close;
				}
			});
			return bias;
		});
	}
};
function getBollMd(dataList, ma) {
	const dataSize = dataList.length;
	let sum = 0;
	dataList.forEach((data) => {
		const closeMa = data.close - ma;
		sum += closeMa * closeMa;
	});
	sum = Math.abs(sum);
	return Math.sqrt(sum / dataSize);
}
var bollingerBands = {
	name: "BOLL",
	shortName: "BOLL",
	series: "price",
	calcParams: [20, 2],
	precision: 2,
	shouldOhlc: true,
	figures: [
		{
			key: "up",
			title: "UP: ",
			type: "line"
		},
		{
			key: "mid",
			title: "MID: ",
			type: "line"
		},
		{
			key: "dn",
			title: "DN: ",
			type: "line"
		}
	],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		const p = params[0] - 1;
		let closeSum = 0;
		return dataList.map((kLineData, i) => {
			const close = kLineData.close;
			const boll = {};
			closeSum += close;
			if (i >= p) {
				boll.mid = closeSum / params[0];
				const md = getBollMd(dataList.slice(i - p, i + 1), boll.mid);
				boll.up = boll.mid + params[1] * md;
				boll.dn = boll.mid - params[1] * md;
				closeSum -= dataList[i - p].close;
			}
			return boll;
		});
	}
};
var brar = {
	name: "BRAR",
	shortName: "BRAR",
	calcParams: [26],
	figures: [{
		key: "br",
		title: "BR: ",
		type: "line"
	}, {
		key: "ar",
		title: "AR: ",
		type: "line"
	}],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		let hcy = 0;
		let cyl = 0;
		let ho = 0;
		let ol = 0;
		return dataList.map((kLineData, i) => {
			const brar = {};
			const high = kLineData.high;
			const low = kLineData.low;
			const open = kLineData.open;
			const prevClose = (dataList[i - 1] ?? kLineData).close;
			ho += high - open;
			ol += open - low;
			hcy += high - prevClose;
			cyl += prevClose - low;
			if (i >= params[0] - 1) {
				if (ol !== 0) brar.ar = ho / ol * 100;
				else brar.ar = 0;
				if (cyl !== 0) brar.br = hcy / cyl * 100;
				else brar.br = 0;
				const agoKLineData = dataList[i - (params[0] - 1)];
				const agoHigh = agoKLineData.high;
				const agoLow = agoKLineData.low;
				const agoOpen = agoKLineData.open;
				const agoPreClose = (dataList[i - params[0]] ?? dataList[i - (params[0] - 1)]).close;
				hcy -= agoHigh - agoPreClose;
				cyl -= agoPreClose - agoLow;
				ho -= agoHigh - agoOpen;
				ol -= agoOpen - agoLow;
			}
			return brar;
		});
	}
};
var bullAndBearIndex = {
	name: "BBI",
	shortName: "BBI",
	series: "price",
	precision: 2,
	calcParams: [
		3,
		6,
		12,
		24
	],
	shouldOhlc: true,
	figures: [{
		key: "bbi",
		title: "BBI: ",
		type: "line"
	}],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		const maxPeriod = Math.max(...params);
		const closeSums = [];
		const mas = [];
		return dataList.map((kLineData, i) => {
			const bbi = {};
			const close = kLineData.close;
			params.forEach((p, index) => {
				closeSums[index] = (closeSums[index] ?? 0) + close;
				if (i >= p - 1) {
					mas[index] = closeSums[index] / p;
					closeSums[index] -= dataList[i - (p - 1)].close;
				}
			});
			if (i >= maxPeriod - 1) {
				let maSum = 0;
				mas.forEach((ma) => {
					maSum += ma;
				});
				bbi.bbi = maSum / 4;
			}
			return bbi;
		});
	}
};
var commodityChannelIndex = {
	name: "CCI",
	shortName: "CCI",
	calcParams: [20],
	figures: [{
		key: "cci",
		title: "CCI: ",
		type: "line"
	}],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		const p = params[0] - 1;
		let tpSum = 0;
		const tpList = [];
		return dataList.map((kLineData, i) => {
			const cci = {};
			const tp = (kLineData.high + kLineData.low + kLineData.close) / 3;
			tpSum += tp;
			tpList.push(tp);
			if (i >= p) {
				const maTp = tpSum / params[0];
				const sliceTpList = tpList.slice(i - p, i + 1);
				let sum = 0;
				sliceTpList.forEach((tp) => {
					sum += Math.abs(tp - maTp);
				});
				const md = sum / params[0];
				cci.cci = md !== 0 ? (tp - maTp) / md / .015 : 0;
				const agoTp = (dataList[i - p].high + dataList[i - p].low + dataList[i - p].close) / 3;
				tpSum -= agoTp;
			}
			return cci;
		});
	}
};
var currentRatio = {
	name: "CR",
	shortName: "CR",
	calcParams: [
		26,
		10,
		20,
		40,
		60
	],
	figures: [
		{
			key: "cr",
			title: "CR: ",
			type: "line"
		},
		{
			key: "ma1",
			title: "MA1: ",
			type: "line"
		},
		{
			key: "ma2",
			title: "MA2: ",
			type: "line"
		},
		{
			key: "ma3",
			title: "MA3: ",
			type: "line"
		},
		{
			key: "ma4",
			title: "MA4: ",
			type: "line"
		}
	],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		const ma1ForwardPeriod = Math.ceil(params[1] / 2.5 + 1);
		const ma2ForwardPeriod = Math.ceil(params[2] / 2.5 + 1);
		const ma3ForwardPeriod = Math.ceil(params[3] / 2.5 + 1);
		const ma4ForwardPeriod = Math.ceil(params[4] / 2.5 + 1);
		let ma1Sum = 0;
		const ma1List = [];
		let ma2Sum = 0;
		const ma2List = [];
		let ma3Sum = 0;
		const ma3List = [];
		let ma4Sum = 0;
		const ma4List = [];
		const result = [];
		dataList.forEach((kLineData, i) => {
			const cr = {};
			const prevData = dataList[i - 1] ?? kLineData;
			const prevMid = (prevData.high + prevData.close + prevData.low + prevData.open) / 4;
			const highSubPreMid = Math.max(0, kLineData.high - prevMid);
			const preMidSubLow = Math.max(0, prevMid - kLineData.low);
			if (i >= params[0] - 1) {
				if (preMidSubLow !== 0) cr.cr = highSubPreMid / preMidSubLow * 100;
				else cr.cr = 0;
				ma1Sum += cr.cr;
				ma2Sum += cr.cr;
				ma3Sum += cr.cr;
				ma4Sum += cr.cr;
				if (i >= params[0] + params[1] - 2) {
					ma1List.push(ma1Sum / params[1]);
					if (i >= params[0] + params[1] + ma1ForwardPeriod - 3) cr.ma1 = ma1List[ma1List.length - 1 - ma1ForwardPeriod];
					ma1Sum -= result[i - (params[1] - 1)].cr ?? 0;
				}
				if (i >= params[0] + params[2] - 2) {
					ma2List.push(ma2Sum / params[2]);
					if (i >= params[0] + params[2] + ma2ForwardPeriod - 3) cr.ma2 = ma2List[ma2List.length - 1 - ma2ForwardPeriod];
					ma2Sum -= result[i - (params[2] - 1)].cr ?? 0;
				}
				if (i >= params[0] + params[3] - 2) {
					ma3List.push(ma3Sum / params[3]);
					if (i >= params[0] + params[3] + ma3ForwardPeriod - 3) cr.ma3 = ma3List[ma3List.length - 1 - ma3ForwardPeriod];
					ma3Sum -= result[i - (params[3] - 1)].cr ?? 0;
				}
				if (i >= params[0] + params[4] - 2) {
					ma4List.push(ma4Sum / params[4]);
					if (i >= params[0] + params[4] + ma4ForwardPeriod - 3) cr.ma4 = ma4List[ma4List.length - 1 - ma4ForwardPeriod];
					ma4Sum -= result[i - (params[4] - 1)].cr ?? 0;
				}
			}
			result.push(cr);
		});
		return result;
	}
};
var differentOfMovingAverage = {
	name: "DMA",
	shortName: "DMA",
	calcParams: [
		10,
		50,
		10
	],
	figures: [{
		key: "dma",
		title: "DMA: ",
		type: "line"
	}, {
		key: "ama",
		title: "AMA: ",
		type: "line"
	}],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		const maxPeriod = Math.max(params[0], params[1]);
		let closeSum1 = 0;
		let closeSum2 = 0;
		let dmaSum = 0;
		const result = [];
		dataList.forEach((kLineData, i) => {
			const dma = {};
			const close = kLineData.close;
			closeSum1 += close;
			closeSum2 += close;
			let ma1 = 0;
			let ma2 = 0;
			if (i >= params[0] - 1) {
				ma1 = closeSum1 / params[0];
				closeSum1 -= dataList[i - (params[0] - 1)].close;
			}
			if (i >= params[1] - 1) {
				ma2 = closeSum2 / params[1];
				closeSum2 -= dataList[i - (params[1] - 1)].close;
			}
			if (i >= maxPeriod - 1) {
				const dif = ma1 - ma2;
				dma.dma = dif;
				dmaSum += dif;
				if (i >= maxPeriod + params[2] - 2) {
					dma.ama = dmaSum / params[2];
					dmaSum -= result[i - (params[2] - 1)].dma ?? 0;
				}
			}
			result.push(dma);
		});
		return result;
	}
};
var directionalMovementIndex = {
	name: "DMI",
	shortName: "DMI",
	calcParams: [14, 6],
	figures: [
		{
			key: "pdi",
			title: "PDI: ",
			type: "line"
		},
		{
			key: "mdi",
			title: "MDI: ",
			type: "line"
		},
		{
			key: "adx",
			title: "ADX: ",
			type: "line"
		},
		{
			key: "adxr",
			title: "ADXR: ",
			type: "line"
		}
	],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		let trSum = 0;
		let hSum = 0;
		let lSum = 0;
		let mtr = 0;
		let dmp = 0;
		let dmm = 0;
		let dxSum = 0;
		let adx = 0;
		const result = [];
		dataList.forEach((kLineData, i) => {
			const dmi = {};
			const prevKLineData = dataList[i - 1] ?? kLineData;
			const preClose = prevKLineData.close;
			const high = kLineData.high;
			const low = kLineData.low;
			const hl = high - low;
			const hcy = Math.abs(high - preClose);
			const lcy = Math.abs(preClose - low);
			const hhy = high - prevKLineData.high;
			const lyl = prevKLineData.low - low;
			const tr = Math.max(Math.max(hl, hcy), lcy);
			const h = hhy > 0 && hhy > lyl ? hhy : 0;
			const l = lyl > 0 && lyl > hhy ? lyl : 0;
			trSum += tr;
			hSum += h;
			lSum += l;
			if (i >= params[0] - 1) {
				if (i > params[0] - 1) {
					mtr = mtr - mtr / params[0] + tr;
					dmp = dmp - dmp / params[0] + h;
					dmm = dmm - dmm / params[0] + l;
				} else {
					mtr = trSum;
					dmp = hSum;
					dmm = lSum;
				}
				let pdi = 0;
				let mdi = 0;
				if (mtr !== 0) {
					pdi = dmp * 100 / mtr;
					mdi = dmm * 100 / mtr;
				}
				dmi.pdi = pdi;
				dmi.mdi = mdi;
				let dx = 0;
				if (mdi + pdi !== 0) dx = Math.abs(mdi - pdi) / (mdi + pdi) * 100;
				dxSum += dx;
				if (i >= params[0] * 2 - 2) {
					if (i > params[0] * 2 - 2) adx = (adx * (params[0] - 1) + dx) / params[0];
					else adx = dxSum / params[0];
					dmi.adx = adx;
					if (i >= params[0] * 2 + params[1] - 3) dmi.adxr = ((result[i - (params[1] - 1)].adx ?? 0) + adx) / 2;
				}
			}
			result.push(dmi);
		});
		return result;
	}
};
var easeOfMovementValue = {
	name: "EMV",
	shortName: "EMV",
	calcParams: [14, 9],
	figures: [{
		key: "emv",
		title: "EMV: ",
		type: "line"
	}, {
		key: "maEmv",
		title: "MAEMV: ",
		type: "line"
	}],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		let emvValueSum = 0;
		const emvValueList = [];
		return dataList.map((kLineData, i) => {
			const emv = {};
			if (i > 0) {
				const prevKLineData = dataList[i - 1];
				const high = kLineData.high;
				const low = kLineData.low;
				const volume = kLineData.volume ?? 0;
				const distanceMoved = (high + low) / 2 - (prevKLineData.high + prevKLineData.low) / 2;
				if (volume === 0 || high - low === 0) emv.emv = 0;
				else emv.emv = distanceMoved / (volume / 1e8 / (high - low));
				emvValueSum += emv.emv;
				emvValueList.push(emv.emv);
				if (i >= params[0]) {
					emv.maEmv = emvValueSum / params[0];
					emvValueSum -= emvValueList[i - params[0]];
				}
			}
			return emv;
		});
	}
};
var exponentialMovingAverage = {
	name: "EMA",
	shortName: "EMA",
	series: "price",
	calcParams: [
		6,
		12,
		20
	],
	precision: 2,
	shouldOhlc: true,
	figures: [
		{
			key: "ema1",
			title: "EMA6: ",
			type: "line"
		},
		{
			key: "ema2",
			title: "EMA12: ",
			type: "line"
		},
		{
			key: "ema3",
			title: "EMA20: ",
			type: "line"
		}
	],
	regenerateFigures: (params) => params.map((p, i) => ({
		key: `ema${i + 1}`,
		title: `EMA${p}: `,
		type: "line"
	})),
	calc: (dataList, indicator) => {
		const { calcParams: params, figures } = indicator;
		let closeSum = 0;
		const emaValues = [];
		return dataList.map((kLineData, i) => {
			const ema = {};
			const close = kLineData.close;
			closeSum += close;
			params.forEach((p, index) => {
				if (i >= p - 1) {
					if (i > p - 1) emaValues[index] = (2 * close + (p - 1) * emaValues[index]) / (p + 1);
					else emaValues[index] = closeSum / p;
					ema[figures[index].key] = emaValues[index];
				}
			});
			return ema;
		});
	}
};
var momentum = {
	name: "MTM",
	shortName: "MTM",
	calcParams: [12, 6],
	figures: [{
		key: "mtm",
		title: "MTM: ",
		type: "line"
	}, {
		key: "maMtm",
		title: "MAMTM: ",
		type: "line"
	}],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		let mtmSum = 0;
		const result = [];
		dataList.forEach((kLineData, i) => {
			const mtm = {};
			if (i >= params[0]) {
				mtm.mtm = kLineData.close - dataList[i - params[0]].close;
				mtmSum += mtm.mtm;
				if (i >= params[0] + params[1] - 1) {
					mtm.maMtm = mtmSum / params[1];
					mtmSum -= result[i - (params[1] - 1)].mtm ?? 0;
				}
			}
			result.push(mtm);
		});
		return result;
	}
};
var movingAverage = {
	name: "MA",
	shortName: "MA",
	series: "price",
	calcParams: [
		5,
		10,
		30,
		60
	],
	precision: 2,
	shouldOhlc: true,
	figures: [
		{
			key: "ma1",
			title: "MA5: ",
			type: "line"
		},
		{
			key: "ma2",
			title: "MA10: ",
			type: "line"
		},
		{
			key: "ma3",
			title: "MA30: ",
			type: "line"
		},
		{
			key: "ma4",
			title: "MA60: ",
			type: "line"
		}
	],
	regenerateFigures: (params) => params.map((p, i) => ({
		key: `ma${i + 1}`,
		title: `MA${p}: `,
		type: "line"
	})),
	calc: (dataList, indicator) => {
		const { calcParams: params, figures } = indicator;
		const closeSums = [];
		return dataList.map((kLineData, i) => {
			const ma = {};
			const close = kLineData.close;
			params.forEach((p, index) => {
				closeSums[index] = (closeSums[index] ?? 0) + close;
				if (i >= p - 1) {
					ma[figures[index].key] = closeSums[index] / p;
					closeSums[index] -= dataList[i - (p - 1)].close;
				}
			});
			return ma;
		});
	}
};
var movingAverageConvergenceDivergence = {
	name: "MACD",
	shortName: "MACD",
	calcParams: [
		12,
		26,
		9
	],
	figures: [
		{
			key: "dif",
			title: "DIF: ",
			type: "line"
		},
		{
			key: "dea",
			title: "DEA: ",
			type: "line"
		},
		{
			key: "macd",
			title: "MACD: ",
			type: "bar",
			baseValue: 0,
			styles: ({ data, indicator, defaultStyles }) => {
				const { prev, current } = data;
				const prevMacd = prev?.macd ?? Number.MIN_SAFE_INTEGER;
				const currentMacd = current?.macd ?? Number.MIN_SAFE_INTEGER;
				let color = "";
				if (currentMacd > 0) color = formatValue(indicator.styles, "bars[0].upColor", defaultStyles.bars[0].upColor);
				else if (currentMacd < 0) color = formatValue(indicator.styles, "bars[0].downColor", defaultStyles.bars[0].downColor);
				else color = formatValue(indicator.styles, "bars[0].noChangeColor", defaultStyles.bars[0].noChangeColor);
				return {
					style: prevMacd < currentMacd ? "stroke" : "fill",
					color,
					borderColor: color
				};
			}
		}
	],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		let closeSum = 0;
		let emaShort = 0;
		let emaLong = 0;
		let dif = 0;
		let difSum = 0;
		let dea = 0;
		const maxPeriod = Math.max(params[0], params[1]);
		return dataList.map((kLineData, i) => {
			const macd = {};
			const close = kLineData.close;
			closeSum += close;
			if (i >= params[0] - 1) if (i > params[0] - 1) emaShort = (2 * close + (params[0] - 1) * emaShort) / (params[0] + 1);
			else emaShort = closeSum / params[0];
			if (i >= params[1] - 1) if (i > params[1] - 1) emaLong = (2 * close + (params[1] - 1) * emaLong) / (params[1] + 1);
			else emaLong = closeSum / params[1];
			if (i >= maxPeriod - 1) {
				dif = emaShort - emaLong;
				macd.dif = dif;
				difSum += dif;
				if (i >= maxPeriod + params[2] - 2) {
					if (i > maxPeriod + params[2] - 2) dea = (dif * 2 + dea * (params[2] - 1)) / (params[2] + 1);
					else dea = difSum / params[2];
					macd.macd = (dif - dea) * 2;
					macd.dea = dea;
				}
			}
			return macd;
		});
	}
};
var onBalanceVolume = {
	name: "OBV",
	shortName: "OBV",
	calcParams: [30],
	figures: [{
		key: "obv",
		title: "OBV: ",
		type: "line"
	}, {
		key: "maObv",
		title: "MAOBV: ",
		type: "line"
	}],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		let obvSum = 0;
		let oldObv = 0;
		const result = [];
		dataList.forEach((kLineData, i) => {
			const prevKLineData = dataList[i - 1] ?? kLineData;
			if (kLineData.close < prevKLineData.close) oldObv -= kLineData.volume ?? 0;
			else if (kLineData.close > prevKLineData.close) oldObv += kLineData.volume ?? 0;
			const obv = { obv: oldObv };
			obvSum += oldObv;
			if (i >= params[0] - 1) {
				obv.maObv = obvSum / params[0];
				obvSum -= result[i - (params[0] - 1)].obv ?? 0;
			}
			result.push(obv);
		});
		return result;
	}
};
var priceAndVolumeTrend = {
	name: "PVT",
	shortName: "PVT",
	figures: [{
		key: "pvt",
		title: "PVT: ",
		type: "line"
	}],
	calc: (dataList) => {
		let sum = 0;
		return dataList.map((kLineData, i) => {
			const pvt = {};
			const close = kLineData.close;
			const volume = kLineData.volume ?? 1;
			const prevClose = (dataList[i - 1] ?? kLineData).close;
			let x = 0;
			const total = prevClose * volume;
			if (total !== 0) x = (close - prevClose) / total;
			sum += x;
			pvt.pvt = sum;
			return pvt;
		});
	}
};
var psychologicalLine = {
	name: "PSY",
	shortName: "PSY",
	calcParams: [12, 6],
	figures: [{
		key: "psy",
		title: "PSY: ",
		type: "line"
	}, {
		key: "maPsy",
		title: "MAPSY: ",
		type: "line"
	}],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		let upCount = 0;
		let psySum = 0;
		const upList = [];
		const result = [];
		dataList.forEach((kLineData, i) => {
			const psy = {};
			const prevClose = (dataList[i - 1] ?? kLineData).close;
			const upFlag = kLineData.close - prevClose > 0 ? 1 : 0;
			upList.push(upFlag);
			upCount += upFlag;
			if (i >= params[0] - 1) {
				psy.psy = upCount / params[0] * 100;
				psySum += psy.psy;
				if (i >= params[0] + params[1] - 2) {
					psy.maPsy = psySum / params[1];
					psySum -= result[i - (params[1] - 1)].psy ?? 0;
				}
				upCount -= upList[i - (params[0] - 1)];
			}
			result.push(psy);
		});
		return result;
	}
};
var rateOfChange = {
	name: "ROC",
	shortName: "ROC",
	calcParams: [12, 6],
	figures: [{
		key: "roc",
		title: "ROC: ",
		type: "line"
	}, {
		key: "maRoc",
		title: "MAROC: ",
		type: "line"
	}],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		const result = [];
		let rocSum = 0;
		dataList.forEach((kLineData, i) => {
			const roc = {};
			if (i >= params[0] - 1) {
				const close = kLineData.close;
				const agoClose = (dataList[i - params[0]] ?? dataList[i - (params[0] - 1)]).close;
				if (agoClose !== 0) roc.roc = (close - agoClose) / agoClose * 100;
				else roc.roc = 0;
				rocSum += roc.roc;
				if (i >= params[0] - 1 + params[1] - 1) {
					roc.maRoc = rocSum / params[1];
					rocSum -= result[i - (params[1] - 1)].roc ?? 0;
				}
			}
			result.push(roc);
		});
		return result;
	}
};
var relativeStrengthIndex = {
	name: "RSI",
	shortName: "RSI",
	calcParams: [
		6,
		12,
		24
	],
	figures: [
		{
			key: "rsi1",
			title: "RSI1: ",
			type: "line"
		},
		{
			key: "rsi2",
			title: "RSI2: ",
			type: "line"
		},
		{
			key: "rsi3",
			title: "RSI3: ",
			type: "line"
		}
	],
	regenerateFigures: (params) => params.map((_, index) => {
		const num = index + 1;
		return {
			key: `rsi${num}`,
			title: `RSI${num}: `,
			type: "line"
		};
	}),
	calc: (dataList, indicator) => {
		const { calcParams: params, figures } = indicator;
		const sumCloseAs = [];
		const sumCloseBs = [];
		return dataList.map((kLineData, i) => {
			const rsi = {};
			const prevClose = (dataList[i - 1] ?? kLineData).close;
			const tmp = kLineData.close - prevClose;
			params.forEach((p, index) => {
				if (tmp > 0) sumCloseAs[index] = (sumCloseAs[index] ?? 0) + tmp;
				else sumCloseBs[index] = (sumCloseBs[index] ?? 0) + Math.abs(tmp);
				if (i >= p - 1) {
					if (sumCloseBs[index] !== 0) rsi[figures[index].key] = 100 - 100 / (1 + sumCloseAs[index] / sumCloseBs[index]);
					else rsi[figures[index].key] = 0;
					const agoData = dataList[i - (p - 1)];
					const agoPreData = dataList[i - p] ?? agoData;
					const agoTmp = agoData.close - agoPreData.close;
					if (agoTmp > 0) sumCloseAs[index] -= agoTmp;
					else sumCloseBs[index] -= Math.abs(agoTmp);
				}
			});
			return rsi;
		});
	}
};
var simpleMovingAverage = {
	name: "SMA",
	shortName: "SMA",
	series: "price",
	calcParams: [12, 2],
	precision: 2,
	figures: [{
		key: "sma",
		title: "SMA: ",
		type: "line"
	}],
	shouldOhlc: true,
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		let closeSum = 0;
		let smaValue = 0;
		return dataList.map((kLineData, i) => {
			const sma = {};
			const close = kLineData.close;
			closeSum += close;
			if (i >= params[0] - 1) {
				if (i > params[0] - 1) smaValue = (close * params[1] + smaValue * (params[0] - params[1] + 1)) / (params[0] + 1);
				else smaValue = closeSum / params[0];
				sma.sma = smaValue;
			}
			return sma;
		});
	}
};
var stoch = {
	name: "KDJ",
	shortName: "KDJ",
	calcParams: [
		9,
		3,
		3
	],
	figures: [
		{
			key: "k",
			title: "K: ",
			type: "line"
		},
		{
			key: "d",
			title: "D: ",
			type: "line"
		},
		{
			key: "j",
			title: "J: ",
			type: "line"
		}
	],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		const result = [];
		dataList.forEach((kLineData, i) => {
			const kdj = {};
			const close = kLineData.close;
			if (i >= params[0] - 1) {
				const lhn = getMaxMin(dataList.slice(i - (params[0] - 1), i + 1), "high", "low");
				const hn = lhn[0];
				const ln = lhn[1];
				const hnSubLn = hn - ln;
				const rsv = (close - ln) / (hnSubLn === 0 ? 1 : hnSubLn) * 100;
				kdj.k = ((params[1] - 1) * (result[i - 1]?.k ?? 50) + rsv) / params[1];
				kdj.d = ((params[2] - 1) * (result[i - 1]?.d ?? 50) + kdj.k) / params[2];
				kdj.j = 3 * kdj.k - 2 * kdj.d;
			}
			result.push(kdj);
		});
		return result;
	}
};
var stopAndReverse = {
	name: "SAR",
	shortName: "SAR",
	series: "price",
	calcParams: [
		2,
		2,
		20
	],
	precision: 2,
	shouldOhlc: true,
	figures: [{
		key: "sar",
		title: "SAR: ",
		type: "circle",
		styles: ({ data, indicator, defaultStyles }) => {
			const { current } = data;
			return { color: (current?.sar ?? Number.MIN_SAFE_INTEGER) < ((current?.high ?? 0) + (current?.low ?? 0)) / 2 ? formatValue(indicator.styles, "circles[0].upColor", defaultStyles.circles[0].upColor) : formatValue(indicator.styles, "circles[0].downColor", defaultStyles.circles[0].downColor) };
		}
	}],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		const startAf = params[0] / 100;
		const step = params[1] / 100;
		const maxAf = params[2] / 100;
		let af = startAf;
		let ep = -100;
		let isIncreasing = false;
		let sar = 0;
		return dataList.map((kLineData, i) => {
			const preSar = sar;
			const high = kLineData.high;
			const low = kLineData.low;
			if (isIncreasing) {
				if (ep === -100 || ep < high) {
					ep = high;
					af = Math.min(af + step, maxAf);
				}
				sar = preSar + af * (ep - preSar);
				const lowMin = Math.min(dataList[Math.max(1, i) - 1].low, low);
				if (sar > kLineData.low) {
					sar = ep;
					af = startAf;
					ep = -100;
					isIncreasing = !isIncreasing;
				} else if (sar > lowMin) sar = lowMin;
			} else {
				if (ep === -100 || ep > low) {
					ep = low;
					af = Math.min(af + step, maxAf);
				}
				sar = preSar + af * (ep - preSar);
				const highMax = Math.max(dataList[Math.max(1, i) - 1].high, high);
				if (sar < kLineData.high) {
					sar = ep;
					af = 0;
					ep = -100;
					isIncreasing = !isIncreasing;
				} else if (sar < highMax) sar = highMax;
			}
			return {
				high,
				low,
				sar
			};
		});
	}
};
var tripleExponentiallySmoothedAverage = {
	name: "TRIX",
	shortName: "TRIX",
	calcParams: [12, 9],
	figures: [{
		key: "trix",
		title: "TRIX: ",
		type: "line"
	}, {
		key: "maTrix",
		title: "MATRIX: ",
		type: "line"
	}],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		let closeSum = 0;
		let ema1 = 0;
		let ema2 = 0;
		let oldTr = 0;
		let ema1Sum = 0;
		let ema2Sum = 0;
		let trixSum = 0;
		const result = [];
		dataList.forEach((kLineData, i) => {
			const trix = {};
			const close = kLineData.close;
			closeSum += close;
			if (i >= params[0] - 1) {
				if (i > params[0] - 1) ema1 = (2 * close + (params[0] - 1) * ema1) / (params[0] + 1);
				else ema1 = closeSum / params[0];
				ema1Sum += ema1;
				if (i >= params[0] * 2 - 2) {
					if (i > params[0] * 2 - 2) ema2 = (2 * ema1 + (params[0] - 1) * ema2) / (params[0] + 1);
					else ema2 = ema1Sum / params[0];
					ema2Sum += ema2;
					if (i >= params[0] * 3 - 3) {
						let tr = 0;
						let trixValue = 0;
						if (i > params[0] * 3 - 3) {
							tr = (2 * ema2 + (params[0] - 1) * oldTr) / (params[0] + 1);
							trixValue = (tr - oldTr) / oldTr * 100;
						} else tr = ema2Sum / params[0];
						oldTr = tr;
						trix.trix = trixValue;
						trixSum += trixValue;
						if (i >= params[0] * 3 + params[1] - 4) {
							trix.maTrix = trixSum / params[1];
							trixSum -= result[i - (params[1] - 1)].trix ?? 0;
						}
					}
				}
			}
			result.push(trix);
		});
		return result;
	}
};
function getVolumeFigure() {
	return {
		key: "volume",
		title: "VOLUME: ",
		type: "bar",
		baseValue: 0,
		styles: ({ data, indicator, defaultStyles }) => {
			const current = data.current;
			let color = formatValue(indicator.styles, "bars[0].noChangeColor", defaultStyles.bars[0].noChangeColor);
			if (isValid(current)) {
				if (current.close > current.open) color = formatValue(indicator.styles, "bars[0].upColor", defaultStyles.bars[0].upColor);
				else if (current.close < current.open) color = formatValue(indicator.styles, "bars[0].downColor", defaultStyles.bars[0].downColor);
			}
			return { color };
		}
	};
}
var volume = {
	name: "VOL",
	shortName: "VOL",
	series: "volume",
	calcParams: [
		5,
		10,
		20
	],
	shouldFormatBigNumber: true,
	precision: 0,
	minValue: 0,
	figures: [
		{
			key: "ma1",
			title: "MA5: ",
			type: "line"
		},
		{
			key: "ma2",
			title: "MA10: ",
			type: "line"
		},
		{
			key: "ma3",
			title: "MA20: ",
			type: "line"
		},
		getVolumeFigure()
	],
	regenerateFigures: (params) => {
		const figures = params.map((p, i) => ({
			key: `ma${i + 1}`,
			title: `MA${p}: `,
			type: "line"
		}));
		figures.push(getVolumeFigure());
		return figures;
	},
	calc: (dataList, indicator) => {
		const { calcParams: params, figures } = indicator;
		const volSums = [];
		return dataList.map((kLineData, i) => {
			const volume = kLineData.volume ?? 0;
			const vol = {
				volume,
				open: kLineData.open,
				close: kLineData.close
			};
			params.forEach((p, index) => {
				volSums[index] = (volSums[index] ?? 0) + volume;
				if (i >= p - 1) {
					vol[figures[index].key] = volSums[index] / p;
					volSums[index] -= dataList[i - (p - 1)].volume ?? 0;
				}
			});
			return vol;
		});
	}
};
var volumeRatio = {
	name: "VR",
	shortName: "VR",
	calcParams: [26, 6],
	figures: [{
		key: "vr",
		title: "VR: ",
		type: "line"
	}, {
		key: "maVr",
		title: "MAVR: ",
		type: "line"
	}],
	calc: (dataList, indicator) => {
		const params = indicator.calcParams;
		let uvs = 0;
		let dvs = 0;
		let pvs = 0;
		let vrSum = 0;
		const result = [];
		dataList.forEach((kLineData, i) => {
			const vr = {};
			const close = kLineData.close;
			const preClose = (dataList[i - 1] ?? kLineData).close;
			const volume = kLineData.volume ?? 0;
			if (close > preClose) uvs += volume;
			else if (close < preClose) dvs += volume;
			else pvs += volume;
			if (i >= params[0] - 1) {
				const halfPvs = pvs / 2;
				if (dvs + halfPvs === 0) vr.vr = 0;
				else vr.vr = (uvs + halfPvs) / (dvs + halfPvs) * 100;
				vrSum += vr.vr;
				if (i >= params[0] + params[1] - 2) {
					vr.maVr = vrSum / params[1];
					vrSum -= result[i - (params[1] - 1)].vr ?? 0;
				}
				const agoData = dataList[i - (params[0] - 1)];
				const agoPreData = dataList[i - params[0]] ?? agoData;
				const agoClose = agoData.close;
				const agoVolume = agoData.volume ?? 0;
				if (agoClose > agoPreData.close) uvs -= agoVolume;
				else if (agoClose < agoPreData.close) dvs -= agoVolume;
				else pvs -= agoVolume;
			}
			result.push(vr);
		});
		return result;
	}
};
var williamsR = {
	name: "WR",
	shortName: "WR",
	calcParams: [
		6,
		10,
		14
	],
	figures: [
		{
			key: "wr1",
			title: "WR1: ",
			type: "line"
		},
		{
			key: "wr2",
			title: "WR2: ",
			type: "line"
		},
		{
			key: "wr3",
			title: "WR3: ",
			type: "line"
		}
	],
	regenerateFigures: (params) => params.map((_, i) => ({
		key: `wr${i + 1}`,
		title: `WR${i + 1}: `,
		type: "line"
	})),
	calc: (dataList, indicator) => {
		const { calcParams: params, figures } = indicator;
		return dataList.map((kLineData, i) => {
			const wr = {};
			const close = kLineData.close;
			params.forEach((param, index) => {
				const p = param - 1;
				if (i >= p) {
					const hln = getMaxMin(dataList.slice(i - p, i + 1), "high", "low");
					const hn = hln[0];
					const hnSubLn = hn - hln[1];
					wr[figures[index].key] = hnSubLn === 0 ? 0 : (close - hn) / hnSubLn * 100;
				}
			});
			return wr;
		});
	}
};
var indicators = {};
[
	averagePrice,
	awesomeOscillator,
	bias,
	bollingerBands,
	brar,
	bullAndBearIndex,
	commodityChannelIndex,
	currentRatio,
	differentOfMovingAverage,
	directionalMovementIndex,
	easeOfMovementValue,
	exponentialMovingAverage,
	momentum,
	movingAverage,
	movingAverageConvergenceDivergence,
	onBalanceVolume,
	priceAndVolumeTrend,
	psychologicalLine,
	rateOfChange,
	relativeStrengthIndex,
	simpleMovingAverage,
	stoch,
	stopAndReverse,
	tripleExponentiallySmoothedAverage,
	volume,
	volumeRatio,
	williamsR
].forEach((indicator) => {
	indicators[indicator.name] = IndicatorImp.extend(indicator);
});
function registerIndicator(indicator) {
	indicators[indicator.name] = IndicatorImp.extend(indicator);
}
function getIndicatorClass(name) {
	return indicators[name] ?? null;
}
function getSupportedIndicators() {
	return Object.keys(indicators);
}
function checkOverlayFigureEvent(targetEventType, figure) {
	const ignoreEvent = figure?.ignoreEvent ?? false;
	if (isBoolean(ignoreEvent)) return !ignoreEvent;
	return !ignoreEvent.includes(targetEventType);
}
var OVERLAY_DRAW_STEP_START = 1;
var OVERLAY_DRAW_STEP_FINISHED = -1;
var OVERLAY_FIGURE_KEY_PREFIX = "overlay_figure_";
var OverlayImp = class {
	constructor(overlay) {
		this.groupId = "";
		this.totalStep = 1;
		this.currentStep = OVERLAY_DRAW_STEP_START;
		this.lock = false;
		this.visible = true;
		this.zLevel = 0;
		this.needDefaultPointFigure = false;
		this.needDefaultXAxisFigure = false;
		this.needDefaultYAxisFigure = false;
		this.mode = "normal";
		this.modeSensitivity = 8;
		this.points = [];
		this.styles = null;
		this.createPointFigures = null;
		this.createXAxisFigures = null;
		this.createYAxisFigures = null;
		this.performEventPressedMove = null;
		this.performEventMoveForDrawing = null;
		this.onDrawStart = null;
		this.onDrawing = null;
		this.onDrawEnd = null;
		this.onClick = null;
		this.onDoubleClick = null;
		this.onRightClick = null;
		this.onPressedMoveStart = null;
		this.onPressedMoving = null;
		this.onPressedMoveEnd = null;
		this.onMouseMove = null;
		this.onMouseEnter = null;
		this.onMouseLeave = null;
		this.onRemoved = null;
		this.onSelected = null;
		this.onDeselected = null;
		this._prevZLevel = 0;
		this._prevPressedPoint = null;
		this._prevPressedPoints = [];
		this.override(overlay);
	}
	override(overlay) {
		this._prevOverlay = clone({
			...this,
			_prevOverlay: null
		});
		const { id, name, currentStep: _, points, styles, ...others } = overlay;
		merge(this, others);
		if (!isString(this.name)) this.name = name ?? "";
		if (!isString(this.id) && isString(id)) this.id = id;
		if (isValid(styles)) {
			this.styles ??= {};
			merge(this.styles, styles);
		}
		if (isArray(points) && points.length > 0) {
			let repeatTotalStep = 0;
			this.points = [...points];
			if (points.length >= this.totalStep - 1) {
				this.currentStep = OVERLAY_DRAW_STEP_FINISHED;
				repeatTotalStep = this.totalStep - 1;
			} else {
				this.currentStep = points.length + 1;
				repeatTotalStep = points.length;
			}
			if (isFunction(this.performEventMoveForDrawing)) for (let i = 0; i < repeatTotalStep; i++) this.performEventMoveForDrawing({
				currentStep: i + 2,
				mode: this.mode,
				points: this.points,
				performPointIndex: i,
				performPoint: this.points[i]
			});
			if (this.currentStep === OVERLAY_DRAW_STEP_FINISHED) this.performEventPressedMove?.({
				currentStep: this.currentStep,
				mode: this.mode,
				points: this.points,
				performPointIndex: this.points.length - 1,
				performPoint: this.points[this.points.length - 1]
			});
		}
	}
	getPrevZLevel() {
		return this._prevZLevel;
	}
	setPrevZLevel(zLevel) {
		this._prevZLevel = zLevel;
	}
	shouldUpdate() {
		const sort = this._prevOverlay.zLevel !== this.zLevel;
		return {
			sort,
			draw: sort || JSON.stringify(this._prevOverlay.points) !== JSON.stringify(this.points) || this._prevOverlay.visible !== this.visible || this._prevOverlay.extendData !== this.extendData || this._prevOverlay.styles !== this.styles
		};
	}
	nextStep() {
		if (this.currentStep === this.totalStep - 1) this.currentStep = OVERLAY_DRAW_STEP_FINISHED;
		else this.currentStep++;
	}
	forceComplete() {
		this.currentStep = OVERLAY_DRAW_STEP_FINISHED;
	}
	isDrawing() {
		return this.currentStep !== OVERLAY_DRAW_STEP_FINISHED;
	}
	isStart() {
		return this.currentStep === OVERLAY_DRAW_STEP_START;
	}
	eventMoveForDrawing(point) {
		const pointIndex = this.currentStep - 1;
		const newPoint = {};
		if (isNumber(point.timestamp)) newPoint.timestamp = point.timestamp;
		if (isNumber(point.dataIndex)) newPoint.dataIndex = point.dataIndex;
		if (isNumber(point.value)) newPoint.value = point.value;
		this.points[pointIndex] = newPoint;
		this.performEventMoveForDrawing?.({
			currentStep: this.currentStep,
			mode: this.mode,
			points: this.points,
			performPointIndex: pointIndex,
			performPoint: newPoint
		});
	}
	eventPressedPointMove(point, pointIndex) {
		this.points[pointIndex].timestamp = point.timestamp;
		if (isNumber(point.value)) this.points[pointIndex].value = point.value;
		this.performEventPressedMove?.({
			currentStep: this.currentStep,
			points: this.points,
			mode: this.mode,
			performPointIndex: pointIndex,
			performPoint: this.points[pointIndex]
		});
	}
	startPressedMove(point) {
		this._prevPressedPoint = { ...point };
		this._prevPressedPoints = clone(this.points);
	}
	eventPressedOtherMove(point, chartStore) {
		if (this._prevPressedPoint !== null) {
			let difDataIndex = null;
			if (isNumber(point.dataIndex) && isNumber(this._prevPressedPoint.dataIndex)) difDataIndex = point.dataIndex - this._prevPressedPoint.dataIndex;
			let difValue = null;
			if (isNumber(point.value) && isNumber(this._prevPressedPoint.value)) difValue = point.value - this._prevPressedPoint.value;
			this.points = this._prevPressedPoints.map((p) => {
				if (isNumber(p.timestamp)) p.dataIndex = chartStore.timestampToDataIndex(p.timestamp);
				const newPoint = { ...p };
				if (isNumber(difDataIndex) && isNumber(p.dataIndex)) {
					newPoint.dataIndex = p.dataIndex + difDataIndex;
					newPoint.timestamp = chartStore.dataIndexToTimestamp(newPoint.dataIndex) ?? void 0;
				}
				if (isNumber(difValue) && isNumber(p.value)) newPoint.value = p.value + difValue;
				return newPoint;
			});
		}
	}
	static extend(template) {
		class Custom extends OverlayImp {
			constructor() {
				super(template);
			}
		}
		return Custom;
	}
};
var fibonacciLine = {
	name: "fibonacciLine",
	totalStep: 3,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ chart, coordinates, bounding, overlay, yAxis }) => {
		const points = overlay.points;
		if (coordinates.length > 0) {
			let precision = 0;
			if (yAxis?.isInCandle() ?? true) precision = chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE;
			else chart.getIndicators({ paneId: overlay.paneId }).forEach((indicator) => {
				precision = Math.max(precision, indicator.precision);
			});
			const lines = [];
			const texts = [];
			const startX = 0;
			const endX = bounding.width;
			if (coordinates.length > 1 && isNumber(points[0].value) && isNumber(points[1].value)) {
				const percents = [
					1,
					.786,
					.618,
					.5,
					.382,
					.236,
					0
				];
				const yDif = coordinates[0].y - coordinates[1].y;
				const valueDif = points[0].value - points[1].value;
				percents.forEach((percent) => {
					const y = coordinates[1].y + yDif * percent;
					const value = chart.getDecimalFold().format(chart.getThousandsSeparator().format(((points[1].value ?? 0) + valueDif * percent).toFixed(precision)));
					lines.push({ coordinates: [{
						x: startX,
						y
					}, {
						x: endX,
						y
					}] });
					texts.push({
						x: startX,
						y,
						text: `${value} (${(percent * 100).toFixed(1)}%)`,
						baseline: "bottom"
					});
				});
			}
			return [{
				type: "line",
				attrs: lines
			}, {
				type: "text",
				isCheckEvent: false,
				attrs: texts
			}];
		}
		return [];
	}
};
var horizontalRayLine = {
	name: "horizontalRayLine",
	totalStep: 3,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates, bounding }) => {
		const coordinate = {
			x: 0,
			y: coordinates[0].y
		};
		if (isValid(coordinates[1]) && coordinates[0].x < coordinates[1].x) coordinate.x = bounding.width;
		return [{
			type: "line",
			attrs: { coordinates: [coordinates[0], coordinate] }
		}];
	},
	performEventPressedMove: ({ points, performPoint }) => {
		points[0].value = performPoint.value;
		points[1].value = performPoint.value;
	},
	performEventMoveForDrawing: ({ currentStep, points, performPoint }) => {
		if (currentStep === 2) points[0].value = performPoint.value;
	}
};
var horizontalSegment = {
	name: "horizontalSegment",
	totalStep: 3,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates }) => {
		const lines = [];
		if (coordinates.length === 2) lines.push({ coordinates });
		return [{
			type: "line",
			attrs: lines
		}];
	},
	performEventPressedMove: ({ points, performPoint }) => {
		points[0].value = performPoint.value;
		points[1].value = performPoint.value;
	},
	performEventMoveForDrawing: ({ currentStep, points, performPoint }) => {
		if (currentStep === 2) points[0].value = performPoint.value;
	}
};
var horizontalStraightLine = {
	name: "horizontalStraightLine",
	totalStep: 2,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates, bounding }) => [{
		type: "line",
		attrs: { coordinates: [{
			x: 0,
			y: coordinates[0].y
		}, {
			x: bounding.width,
			y: coordinates[0].y
		}] }
	}]
};
var Eventful = class {
	constructor() {
		this._children = [];
		this._callbacks = /* @__PURE__ */ new Map();
	}
	registerEvent(name, callback) {
		this._callbacks.set(name, callback);
		return this;
	}
	onEvent(name, event) {
		const callback = this._callbacks.get(name);
		if (isValid(callback) && this.checkEventOn(event)) return callback(event);
		return false;
	}
	dispatchEventToChildren(name, event) {
		const start = this._children.length - 1;
		if (start > -1) {
			for (let i = start; i > -1; i--) if (this._children[i].dispatchEvent(name, event)) return true;
		}
		return false;
	}
	dispatchEvent(name, event) {
		if (this.dispatchEventToChildren(name, event)) return true;
		return this.onEvent(name, event);
	}
	addChild(eventful) {
		this._children.push(eventful);
		return this;
	}
	clear() {
		this._children = [];
	}
};
var FigureImp = class extends Eventful {
	constructor(figure) {
		super();
		this.attrs = figure.attrs;
		this.styles = figure.styles;
	}
	checkEventOn(event) {
		return this.checkEventOnImp(event, this.attrs, this.styles);
	}
	setAttrs(attrs) {
		this.attrs = attrs;
		return this;
	}
	setStyles(styles) {
		this.styles = styles;
		return this;
	}
	draw(ctx) {
		this.drawImp(ctx, this.attrs, this.styles);
	}
	static extend(figure) {
		class Custom extends FigureImp {
			checkEventOnImp(coordinate, attrs, styles) {
				return figure.checkEventOn(coordinate, attrs, styles);
			}
			drawImp(ctx, attrs, styles) {
				figure.draw(ctx, attrs, styles);
			}
		}
		return Custom;
	}
};
function checkCoordinateOnLine(coordinate, attrs) {
	let lines = [];
	lines = lines.concat(attrs);
	for (const line of lines) {
		const { coordinates } = line;
		if (coordinates.length > 1) for (let i = 1; i < coordinates.length; i++) {
			const prevCoordinate = coordinates[i - 1];
			const currentCoordinate = coordinates[i];
			if (prevCoordinate.x === currentCoordinate.x) {
				if (Math.abs(prevCoordinate.y - coordinate.y) + Math.abs(currentCoordinate.y - coordinate.y) - Math.abs(prevCoordinate.y - currentCoordinate.y) < 4 && Math.abs(coordinate.x - prevCoordinate.x) < 2) return true;
			} else {
				const kb = getLinearSlopeIntercept(prevCoordinate, currentCoordinate);
				const y = getLinearYFromSlopeIntercept(kb, coordinate);
				const yDif = Math.abs(y - coordinate.y);
				if (Math.abs(prevCoordinate.x - coordinate.x) + Math.abs(currentCoordinate.x - coordinate.x) - Math.abs(prevCoordinate.x - currentCoordinate.x) < 4 && yDif * yDif / (kb[0] * kb[0] + 1) < 4) return true;
			}
		}
	}
	return false;
}
function getLinearYFromSlopeIntercept(kb, coordinate) {
	if (kb !== null) return coordinate.x * kb[0] + kb[1];
	return coordinate.y;
}
function getLinearYFromCoordinates(coordinate1, coordinate2, targetCoordinate) {
	return getLinearYFromSlopeIntercept(getLinearSlopeIntercept(coordinate1, coordinate2), targetCoordinate);
}
function getLinearSlopeIntercept(coordinate1, coordinate2) {
	const difX = coordinate1.x - coordinate2.x;
	if (difX !== 0) {
		const k = (coordinate1.y - coordinate2.y) / difX;
		return [k, coordinate1.y - k * coordinate1.x];
	}
	return null;
}
function lineTo(ctx, coordinates, smooth) {
	const length = coordinates.length;
	const smoothParam = isNumber(smooth) ? smooth > 0 && smooth < 1 ? smooth : 0 : smooth ? .5 : 0;
	if (smoothParam > 0 && length > 2) {
		let cpx0 = coordinates[0].x;
		let cpy0 = coordinates[0].y;
		for (let i = 1; i < length - 1; i++) {
			const prevCoordinate = coordinates[i - 1];
			const coordinate = coordinates[i];
			const nextCoordinate = coordinates[i + 1];
			const dx01 = coordinate.x - prevCoordinate.x;
			const dy01 = coordinate.y - prevCoordinate.y;
			const dx12 = nextCoordinate.x - coordinate.x;
			const dy12 = nextCoordinate.y - coordinate.y;
			let dx02 = nextCoordinate.x - prevCoordinate.x;
			let dy02 = nextCoordinate.y - prevCoordinate.y;
			const prevSegmentLength = Math.sqrt(dx01 * dx01 + dy01 * dy01);
			const nextSegmentLength = Math.sqrt(dx12 * dx12 + dy12 * dy12);
			const segmentLengthRatio = nextSegmentLength / (nextSegmentLength + prevSegmentLength);
			let nextCpx = coordinate.x + dx02 * smoothParam * segmentLengthRatio;
			let nextCpy = coordinate.y + dy02 * smoothParam * segmentLengthRatio;
			nextCpx = Math.min(nextCpx, Math.max(nextCoordinate.x, coordinate.x));
			nextCpy = Math.min(nextCpy, Math.max(nextCoordinate.y, coordinate.y));
			nextCpx = Math.max(nextCpx, Math.min(nextCoordinate.x, coordinate.x));
			nextCpy = Math.max(nextCpy, Math.min(nextCoordinate.y, coordinate.y));
			dx02 = nextCpx - coordinate.x;
			dy02 = nextCpy - coordinate.y;
			let cpx1 = coordinate.x - dx02 * prevSegmentLength / nextSegmentLength;
			let cpy1 = coordinate.y - dy02 * prevSegmentLength / nextSegmentLength;
			cpx1 = Math.min(cpx1, Math.max(prevCoordinate.x, coordinate.x));
			cpy1 = Math.min(cpy1, Math.max(prevCoordinate.y, coordinate.y));
			cpx1 = Math.max(cpx1, Math.min(prevCoordinate.x, coordinate.x));
			cpy1 = Math.max(cpy1, Math.min(prevCoordinate.y, coordinate.y));
			dx02 = coordinate.x - cpx1;
			dy02 = coordinate.y - cpy1;
			nextCpx = coordinate.x + dx02 * nextSegmentLength / prevSegmentLength;
			nextCpy = coordinate.y + dy02 * nextSegmentLength / prevSegmentLength;
			ctx.bezierCurveTo(cpx0, cpy0, cpx1, cpy1, coordinate.x, coordinate.y);
			cpx0 = nextCpx;
			cpy0 = nextCpy;
		}
		const lastCoordinate = coordinates[length - 1];
		ctx.bezierCurveTo(cpx0, cpy0, lastCoordinate.x, lastCoordinate.y, lastCoordinate.x, lastCoordinate.y);
	} else for (let i = 1; i < length; i++) ctx.lineTo(coordinates[i].x, coordinates[i].y);
}
function drawLine(ctx, attrs, styles) {
	let lines = [];
	lines = lines.concat(attrs);
	const { style = "solid", smooth = false, size = 1, color = "currentColor", dashedValue = [2, 2] } = styles;
	ctx.lineWidth = size;
	ctx.strokeStyle = color;
	if (style === "dashed") ctx.setLineDash(dashedValue);
	else ctx.setLineDash([]);
	const correction = size % 2 === 1 ? .5 : 0;
	lines.forEach(({ coordinates }) => {
		if (coordinates.length > 1) if (coordinates.length === 2 && (coordinates[0].x === coordinates[1].x || coordinates[0].y === coordinates[1].y)) {
			ctx.beginPath();
			if (coordinates[0].x === coordinates[1].x) {
				ctx.moveTo(coordinates[0].x + correction, coordinates[0].y);
				ctx.lineTo(coordinates[1].x + correction, coordinates[1].y);
			} else {
				ctx.moveTo(coordinates[0].x, coordinates[0].y + correction);
				ctx.lineTo(coordinates[1].x, coordinates[1].y + correction);
			}
			ctx.stroke();
			ctx.closePath();
		} else {
			ctx.save();
			if (size % 2 === 1) ctx.translate(.5, .5);
			ctx.beginPath();
			ctx.moveTo(coordinates[0].x, coordinates[0].y);
			lineTo(ctx, coordinates, smooth);
			ctx.stroke();
			ctx.closePath();
			ctx.restore();
		}
	});
}
var line = {
	name: "line",
	checkEventOn: checkCoordinateOnLine,
	draw: (ctx, attrs, styles) => {
		drawLine(ctx, attrs, styles);
	}
};
function getParallelLines(coordinates, bounding, extendParallelLineCount) {
	const count = extendParallelLineCount ?? 0;
	const lines = [];
	if (coordinates.length > 1) if (coordinates[0].x === coordinates[1].x) {
		const startY = 0;
		const endY = bounding.height;
		lines.push({ coordinates: [{
			x: coordinates[0].x,
			y: startY
		}, {
			x: coordinates[0].x,
			y: endY
		}] });
		if (coordinates.length > 2) {
			lines.push({ coordinates: [{
				x: coordinates[2].x,
				y: startY
			}, {
				x: coordinates[2].x,
				y: endY
			}] });
			const distance = coordinates[0].x - coordinates[2].x;
			for (let i = 0; i < count; i++) {
				const d = distance * (i + 1);
				lines.push({ coordinates: [{
					x: coordinates[0].x + d,
					y: startY
				}, {
					x: coordinates[0].x + d,
					y: endY
				}] });
			}
		}
	} else {
		const startX = 0;
		const endX = bounding.width;
		const kb = getLinearSlopeIntercept(coordinates[0], coordinates[1]);
		const k = kb[0];
		const b = kb[1];
		lines.push({ coordinates: [{
			x: startX,
			y: startX * k + b
		}, {
			x: endX,
			y: endX * k + b
		}] });
		if (coordinates.length > 2) {
			const b1 = coordinates[2].y - k * coordinates[2].x;
			lines.push({ coordinates: [{
				x: startX,
				y: startX * k + b1
			}, {
				x: endX,
				y: endX * k + b1
			}] });
			const distance = b - b1;
			for (let i = 0; i < count; i++) {
				const b2 = b + distance * (i + 1);
				lines.push({ coordinates: [{
					x: startX,
					y: startX * k + b2
				}, {
					x: endX,
					y: endX * k + b2
				}] });
			}
		}
	}
	return lines;
}
var parallelStraightLine = {
	name: "parallelStraightLine",
	totalStep: 4,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates, bounding }) => [{
		type: "line",
		attrs: getParallelLines(coordinates, bounding)
	}]
};
var priceChannelLine = {
	name: "priceChannelLine",
	totalStep: 4,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates, bounding }) => [{
		type: "line",
		attrs: getParallelLines(coordinates, bounding, 1)
	}]
};
var priceLine = {
	name: "priceLine",
	totalStep: 2,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ chart, coordinates, bounding, overlay, yAxis }) => {
		let precision = 0;
		if (yAxis?.isInCandle() ?? true) precision = chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE;
		else chart.getIndicators({ paneId: overlay.paneId }).forEach((indicator) => {
			precision = Math.max(precision, indicator.precision);
		});
		const { value = 0 } = overlay.points[0];
		return [{
			type: "line",
			attrs: { coordinates: [coordinates[0], {
				x: bounding.width,
				y: coordinates[0].y
			}] }
		}, {
			type: "text",
			ignoreEvent: true,
			attrs: {
				x: coordinates[0].x,
				y: coordinates[0].y,
				text: chart.getDecimalFold().format(chart.getThousandsSeparator().format(value.toFixed(precision))),
				baseline: "bottom"
			}
		}];
	}
};
function getRayLine(coordinates, bounding) {
	if (coordinates.length > 1) {
		let coordinate = {
			x: 0,
			y: 0
		};
		if (coordinates[0].x === coordinates[1].x && coordinates[0].y !== coordinates[1].y) if (coordinates[0].y < coordinates[1].y) coordinate = {
			x: coordinates[0].x,
			y: bounding.height
		};
		else coordinate = {
			x: coordinates[0].x,
			y: 0
		};
		else if (coordinates[0].x > coordinates[1].x) coordinate = {
			x: 0,
			y: getLinearYFromCoordinates(coordinates[0], coordinates[1], {
				x: 0,
				y: coordinates[0].y
			})
		};
		else coordinate = {
			x: bounding.width,
			y: getLinearYFromCoordinates(coordinates[0], coordinates[1], {
				x: bounding.width,
				y: coordinates[0].y
			})
		};
		return { coordinates: [coordinates[0], coordinate] };
	}
	return [];
}
var rayLine = {
	name: "rayLine",
	totalStep: 3,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates, bounding }) => [{
		type: "line",
		attrs: getRayLine(coordinates, bounding)
	}]
};
var segment = {
	name: "segment",
	totalStep: 3,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates }) => {
		if (coordinates.length === 2) return [{
			type: "line",
			attrs: { coordinates }
		}];
		return [];
	}
};
var straightLine = {
	name: "straightLine",
	totalStep: 3,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates, bounding }) => {
		if (coordinates.length === 2) {
			if (coordinates[0].x === coordinates[1].x) return [{
				type: "line",
				attrs: { coordinates: [{
					x: coordinates[0].x,
					y: 0
				}, {
					x: coordinates[0].x,
					y: bounding.height
				}] }
			}];
			return [{
				type: "line",
				attrs: { coordinates: [{
					x: 0,
					y: getLinearYFromCoordinates(coordinates[0], coordinates[1], {
						x: 0,
						y: coordinates[0].y
					})
				}, {
					x: bounding.width,
					y: getLinearYFromCoordinates(coordinates[0], coordinates[1], {
						x: bounding.width,
						y: coordinates[0].y
					})
				}] }
			}];
		}
		return [];
	}
};
var verticalRayLine = {
	name: "verticalRayLine",
	totalStep: 3,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates, bounding }) => {
		if (coordinates.length === 2) {
			const coordinate = {
				x: coordinates[0].x,
				y: 0
			};
			if (coordinates[0].y < coordinates[1].y) coordinate.y = bounding.height;
			return [{
				type: "line",
				attrs: { coordinates: [coordinates[0], coordinate] }
			}];
		}
		return [];
	},
	performEventPressedMove: ({ points, performPoint }) => {
		points[0].timestamp = performPoint.timestamp;
		points[0].dataIndex = performPoint.dataIndex;
		points[1].timestamp = performPoint.timestamp;
		points[1].dataIndex = performPoint.dataIndex;
	},
	performEventMoveForDrawing: ({ currentStep, points, performPoint }) => {
		if (currentStep === 2) {
			points[0].timestamp = performPoint.timestamp;
			points[0].dataIndex = performPoint.dataIndex;
		}
	}
};
var verticalSegment = {
	name: "verticalSegment",
	totalStep: 3,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates }) => {
		if (coordinates.length === 2) return [{
			type: "line",
			attrs: { coordinates }
		}];
		return [];
	},
	performEventPressedMove: ({ points, performPoint }) => {
		points[0].timestamp = performPoint.timestamp;
		points[0].dataIndex = performPoint.dataIndex;
		points[1].timestamp = performPoint.timestamp;
		points[1].dataIndex = performPoint.dataIndex;
	},
	performEventMoveForDrawing: ({ currentStep, points, performPoint }) => {
		if (currentStep === 2) {
			points[0].timestamp = performPoint.timestamp;
			points[0].dataIndex = performPoint.dataIndex;
		}
	}
};
var verticalStraightLine = {
	name: "verticalStraightLine",
	totalStep: 2,
	needDefaultPointFigure: true,
	needDefaultXAxisFigure: true,
	needDefaultYAxisFigure: true,
	createPointFigures: ({ coordinates, bounding }) => [{
		type: "line",
		attrs: { coordinates: [{
			x: coordinates[0].x,
			y: 0
		}, {
			x: coordinates[0].x,
			y: bounding.height
		}] }
	}]
};
var simpleAnnotation = {
	name: "simpleAnnotation",
	totalStep: 2,
	styles: { line: { style: "dashed" } },
	createPointFigures: ({ overlay, coordinates }) => {
		let text = "";
		if (isValid(overlay.extendData)) if (!isFunction(overlay.extendData)) text = overlay.extendData ?? "";
		else text = overlay.extendData(overlay);
		const startX = coordinates[0].x;
		const startY = coordinates[0].y - 6;
		const lineEndY = startY - 50;
		const arrowEndY = lineEndY - 5;
		return [
			{
				type: "line",
				attrs: { coordinates: [{
					x: startX,
					y: startY
				}, {
					x: startX,
					y: lineEndY
				}] },
				ignoreEvent: true
			},
			{
				type: "polygon",
				attrs: { coordinates: [
					{
						x: startX,
						y: lineEndY
					},
					{
						x: startX - 4,
						y: arrowEndY
					},
					{
						x: startX + 4,
						y: arrowEndY
					}
				] },
				ignoreEvent: true
			},
			{
				type: "text",
				attrs: {
					x: startX,
					y: arrowEndY,
					text,
					align: "center",
					baseline: "bottom"
				},
				ignoreEvent: true
			}
		];
	}
};
var simpleTag = {
	name: "simpleTag",
	totalStep: 2,
	styles: { line: { style: "dashed" } },
	createPointFigures: ({ bounding, coordinates }) => ({
		type: "line",
		attrs: { coordinates: [{
			x: 0,
			y: coordinates[0].y
		}, {
			x: bounding.width,
			y: coordinates[0].y
		}] },
		ignoreEvent: true
	}),
	createYAxisFigures: ({ chart, overlay, coordinates, bounding, yAxis }) => {
		const isFromZero = yAxis?.isFromZero() ?? false;
		let textAlign = "left";
		let x = 0;
		if (isFromZero) {
			textAlign = "left";
			x = 0;
		} else {
			textAlign = "right";
			x = bounding.width;
		}
		let text = "";
		if (isValid(overlay.extendData)) if (!isFunction(overlay.extendData)) text = overlay.extendData ?? "";
		else text = overlay.extendData(overlay);
		if (!isValid(text) && isNumber(overlay.points[0].value)) text = formatPrecision(overlay.points[0].value, chart.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE);
		return {
			type: "text",
			attrs: {
				x,
				y: coordinates[0].y,
				text,
				align: textAlign,
				baseline: "middle"
			}
		};
	}
};
var overlays = {};
[
	fibonacciLine,
	horizontalRayLine,
	horizontalSegment,
	horizontalStraightLine,
	parallelStraightLine,
	priceChannelLine,
	priceLine,
	rayLine,
	segment,
	straightLine,
	verticalRayLine,
	verticalSegment,
	verticalStraightLine,
	simpleAnnotation,
	simpleTag
].forEach((template) => {
	overlays[template.name] = OverlayImp.extend(template);
});
function registerOverlay(template) {
	overlays[template.name] = OverlayImp.extend(template);
}
function getOverlayInnerClass(name) {
	return overlays[name] ?? null;
}
function getOverlayClass(name) {
	return overlays[name] ?? null;
}
function getSupportedOverlays() {
	return Object.keys(overlays);
}
var styles = {
	light: {
		grid: {
			horizontal: { color: "#EDEDED" },
			vertical: { color: "#EDEDED" }
		},
		candle: {
			priceMark: {
				high: { color: "#76808F" },
				low: { color: "#76808F" }
			},
			tooltip: {
				rect: {
					color: "#FEFEFE",
					borderColor: "#F2F3F5"
				},
				title: { color: "#76808F" },
				legend: { color: "#76808F" }
			}
		},
		indicator: { tooltip: {
			title: { color: "#76808F" },
			legend: { color: "#76808F" }
		} },
		xAxis: {
			axisLine: { color: "#DDDDDD" },
			tickText: { color: "#76808F" },
			tickLine: { color: "#DDDDDD" }
		},
		yAxis: {
			axisLine: { color: "#DDDDDD" },
			tickText: { color: "#76808F" },
			tickLine: { color: "#DDDDDD" }
		},
		separator: { color: "#DDDDDD" },
		crosshair: {
			horizontal: {
				line: { color: "#76808F" },
				text: {
					borderColor: "#686D76",
					backgroundColor: "#686D76"
				}
			},
			vertical: {
				line: { color: "#76808F" },
				text: {
					borderColor: "#686D76",
					backgroundColor: "#686D76"
				}
			}
		}
	},
	dark: {
		grid: {
			horizontal: { color: "#292929" },
			vertical: { color: "#292929" }
		},
		candle: {
			priceMark: {
				high: { color: "#929AA5" },
				low: { color: "#929AA5" }
			},
			tooltip: {
				rect: {
					color: "rgba(10, 10, 10, .6)",
					borderColor: "rgba(10, 10, 10, .6)"
				},
				title: { color: "#929AA5" },
				legend: { color: "#929AA5" }
			}
		},
		indicator: { tooltip: {
			title: { color: "#929AA5" },
			legend: { color: "#929AA5" }
		} },
		xAxis: {
			axisLine: { color: "#333333" },
			tickText: { color: "#929AA5" },
			tickLine: { color: "#333333" }
		},
		yAxis: {
			axisLine: { color: "#333333" },
			tickText: { color: "#929AA5" },
			tickLine: { color: "#333333" }
		},
		separator: { color: "#333333" },
		crosshair: {
			horizontal: {
				line: { color: "#929AA5" },
				text: {
					borderColor: "#373a40",
					backgroundColor: "#373a40"
				}
			},
			vertical: {
				line: { color: "#929AA5" },
				text: {
					borderColor: "#373a40",
					backgroundColor: "#373a40"
				}
			}
		}
	}
};
function registerStyles(name, ss) {
	styles[name] = ss;
}
function getStyles(name) {
	return styles[name] ?? null;
}
var PaneIdConstants = {
	CANDLE: "candle_pane",
	INDICATOR: "indicator_pane_",
	X_AXIS: "x_axis_pane"
};
var BarSpaceLimitConstants = {
	MIN: 1,
	MAX: 50
};
var DEFAULT_LAYOUT_BASIC_PARAMS = {
	barSpaceLimitMin: BarSpaceLimitConstants.MIN,
	barSpaceLimitMax: BarSpaceLimitConstants.MAX,
	yAxisPosition: "right",
	yAxisInside: false,
	paneMinHeight: 30,
	paneHeight: 100
};
var DEFAULT_BAR_SPACE = 10;
var DEFAULT_OFFSET_RIGHT_DISTANCE = 80;
var BAR_GAP_RATIO = .2;
var StoreImp = class {
	constructor(chart, options) {
		this._styles = getDefaultStyles();
		this._formatter = {
			formatDate: ({ dateTimeFormat, timestamp, template }) => formatTimestampByTemplate(dateTimeFormat, timestamp, template),
			formatBigNumber,
			formatExtendText: (_) => ""
		};
		this._innerFormatter = {
			formatDate: (timestamp, template, type) => this._formatter.formatDate({
				dateTimeFormat: this._dateTimeFormat,
				timestamp,
				template,
				type
			}),
			formatBigNumber: (value) => this._formatter.formatBigNumber(value),
			formatExtendText: (params) => this._formatter.formatExtendText(params)
		};
		this._locale = "en-US";
		this._thousandsSeparator = {
			sign: ",",
			format: (value) => formatThousands(value, this._thousandsSeparator.sign)
		};
		this._decimalFold = {
			threshold: 3,
			format: (value) => formatFoldDecimal(value, this._decimalFold.threshold)
		};
		this._symbol = null;
		this._period = null;
		this._dataList = [];
		this._dataLoader = null;
		this._loading = false;
		this._dataLoadMore = {
			forward: false,
			backward: false
		};
		this._zoomEnabled = true;
		this._zoomAnchor = {
			main: "cursor",
			xAxis: "cursor"
		};
		this._scrollEnabled = true;
		this._totalBarSpace = 0;
		this._barSpace = DEFAULT_BAR_SPACE;
		this._layoutBasicParams = { ...DEFAULT_LAYOUT_BASIC_PARAMS };
		this._offsetRightDistance = DEFAULT_OFFSET_RIGHT_DISTANCE;
		this._startLastBarRightSideDiffBarCount = 0;
		this._scrollLimitRole = "bar_count";
		this._minVisibleBarCount = {
			left: 2,
			right: 2
		};
		this._maxOffsetDistance = {
			left: 50,
			right: 50
		};
		this._visibleRange = getDefaultVisibleRange();
		this._visibleRangeDataList = [];
		this._visibleRangeHighLowPrice = [{
			x: 0,
			price: Number.MIN_SAFE_INTEGER
		}, {
			x: 0,
			price: Number.MAX_SAFE_INTEGER
		}];
		this._crosshair = {};
		this._actions = /* @__PURE__ */ new Map();
		this._indicators = /* @__PURE__ */ new Map();
		this._overlays = /* @__PURE__ */ new Map();
		this._progressOverlayInfo = null;
		this._lastPriceMarkExtendTextUpdateTimers = [];
		this._pressedOverlayInfo = {
			paneId: "",
			overlay: null,
			figureType: "none",
			figureIndex: -1,
			figure: null
		};
		this._hoverOverlayInfo = {
			paneId: "",
			overlay: null,
			figureType: "none",
			figureIndex: -1,
			figure: null
		};
		this._clickOverlayInfo = {
			paneId: "",
			overlay: null,
			figureType: "none",
			figureIndex: -1,
			figure: null
		};
		this._chart = chart;
		const { layout } = options ?? {};
		if (isValid(layout) && !isArray(layout)) merge(this._layoutBasicParams, layout.basicParams);
		this._calcOptimalBarSpace();
		this._lastBarRightSideDiffBarCount = this._offsetRightDistance / this._barSpace;
		const { styles, locale, timezone, formatter, thousandsSeparator, decimalFold, zoomAnchor } = options ?? {};
		if (isValid(styles)) this.setStyles(styles);
		if (isString(locale)) this.setLocale(locale);
		this.setTimezone(timezone ?? "");
		if (isValid(formatter)) this.setFormatter(formatter);
		if (isValid(thousandsSeparator)) this.setThousandsSeparator(thousandsSeparator);
		if (isValid(decimalFold)) this.setDecimalFold(decimalFold);
		if (isValid(zoomAnchor)) this.setZoomAnchor(zoomAnchor);
		this._taskScheduler = new TaskScheduler(() => {
			this._chart.layout({
				measureWidth: true,
				update: true,
				buildYAxisTick: true
			});
		});
	}
	setStyles(value) {
		let styles = null;
		if (isString(value)) styles = getStyles(value);
		else styles = value;
		merge(this._styles, styles);
		if (isArray(styles?.candle?.tooltip?.legend?.template)) this._styles.candle.tooltip.legend.template = styles.candle.tooltip.legend.template;
		if (isValid(styles?.candle?.priceMark?.last?.extendTexts)) {
			this._clearLastPriceMarkExtendTextUpdateTimer();
			const intervals = [];
			this._styles.candle.priceMark.last.extendTexts.forEach((item) => {
				const updateInterval = item.updateInterval;
				if (item.show && updateInterval > 0 && !intervals.includes(updateInterval)) {
					intervals.push(updateInterval);
					const timer = setInterval(() => {
						this._chart.updatePane(UpdateLevel.Main, PaneIdConstants.CANDLE);
					}, updateInterval);
					this._lastPriceMarkExtendTextUpdateTimers.push(timer);
				}
			});
		}
	}
	getStyles() {
		return this._styles;
	}
	setFormatter(formatter) {
		merge(this._formatter, formatter);
	}
	getFormatter() {
		return this._formatter;
	}
	getInnerFormatter() {
		return this._innerFormatter;
	}
	setLocale(locale) {
		this._locale = locale;
	}
	getLocale() {
		return this._locale;
	}
	setTimezone(timezone) {
		if (!isValid(this._dateTimeFormat) || this.getTimezone() !== timezone) {
			const options = {
				hour12: false,
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit"
			};
			if (timezone.length > 0) options.timeZone = timezone;
			let dateTimeFormat = null;
			try {
				dateTimeFormat = new Intl.DateTimeFormat("en", options);
			} catch (e) {
				logWarn("", "", "Timezone is error!!!");
			}
			if (dateTimeFormat !== null) this._dateTimeFormat = dateTimeFormat;
		}
	}
	getTimezone() {
		return this._dateTimeFormat.resolvedOptions().timeZone;
	}
	getDateTimeFormat() {
		return this._dateTimeFormat;
	}
	setThousandsSeparator(thousandsSeparator) {
		merge(this._thousandsSeparator, thousandsSeparator);
	}
	getThousandsSeparator() {
		return this._thousandsSeparator;
	}
	setDecimalFold(decimalFold) {
		merge(this._decimalFold, decimalFold);
	}
	getDecimalFold() {
		return this._decimalFold;
	}
	setSymbol(symbol) {
		this.resetData(() => {
			this._symbol = {
				pricePrecision: SymbolDefaultPrecisionConstants.PRICE,
				volumePrecision: SymbolDefaultPrecisionConstants.VOLUME,
				...this._symbol,
				...symbol
			};
			this._synchronizeIndicatorSeriesPrecision();
		});
	}
	getSymbol() {
		return this._symbol;
	}
	setPeriod(period) {
		this.resetData(() => {
			this._period = period;
		});
	}
	getPeriod() {
		return this._period;
	}
	getDataList() {
		return this._dataList;
	}
	getVisibleRangeDataList() {
		return this._visibleRangeDataList;
	}
	getVisibleRangeHighLowPrice() {
		return this._visibleRangeHighLowPrice;
	}
	_addData(data, type, more) {
		let success = false;
		let adjustFlag = false;
		let dataLengthChange = 0;
		if (isArray(data)) {
			const realMore = {
				backward: false,
				forward: false
			};
			if (isBoolean(more)) {
				realMore.backward = more;
				realMore.forward = more;
			} else {
				realMore.backward = more?.backward ?? false;
				realMore.forward = more?.forward ?? false;
			}
			dataLengthChange = data.length;
			switch (type) {
				case "init":
					this._clearData();
					this._dataList = data;
					this._dataLoadMore.backward = realMore.backward;
					this._dataLoadMore.forward = realMore.forward;
					this.setOffsetRightDistance(this._offsetRightDistance);
					adjustFlag = true;
					break;
				case "backward":
					this._dataList = this._dataList.concat(data);
					this._dataLoadMore.backward = realMore.backward;
					this._lastBarRightSideDiffBarCount -= dataLengthChange;
					adjustFlag = dataLengthChange > 0;
					break;
				case "forward":
					this._dataList = data.concat(this._dataList);
					this._dataLoadMore.forward = realMore.forward;
					adjustFlag = dataLengthChange > 0;
					break;
				default: break;
			}
			success = true;
		} else {
			const dataCount = this._dataList.length;
			const timestamp = data.timestamp;
			const lastDataTimestamp = formatValue(this._dataList[dataCount - 1], "timestamp", 0);
			if (timestamp > lastDataTimestamp) {
				this._dataList.push(data);
				let lastBarRightSideDiffBarCount = this.getLastBarRightSideDiffBarCount();
				if (lastBarRightSideDiffBarCount < 0) this.setLastBarRightSideDiffBarCount(--lastBarRightSideDiffBarCount);
				dataLengthChange = 1;
				success = true;
				adjustFlag = true;
			} else if (timestamp === lastDataTimestamp) {
				this._dataList[dataCount - 1] = data;
				success = true;
				adjustFlag = true;
			}
		}
		if (success && adjustFlag) {
			this._adjustVisibleRange();
			this.setCrosshair(this._crosshair, { notInvalidate: true });
			const filterIndicators = this.getIndicatorsByFilter({});
			if (filterIndicators.length > 0) this._calcIndicator(filterIndicators);
			else this._chart.layout({
				measureWidth: true,
				update: true,
				buildYAxisTick: true,
				cacheYAxisWidth: type !== "init"
			});
		}
	}
	setDataLoader(dataLoader) {
		this.resetData(() => {
			this._dataLoader = dataLoader;
		});
	}
	_calcOptimalBarSpace() {
		const specialBarSpace = 4;
		const ratio = 1 - BAR_GAP_RATIO * Math.atan(Math.max(specialBarSpace, this._barSpace) - specialBarSpace) / (Math.PI * .5);
		let gapBarSpace = Math.min(Math.floor(this._barSpace * ratio), Math.floor(this._barSpace));
		if (gapBarSpace % 2 === 0 && gapBarSpace + 2 >= this._barSpace) --gapBarSpace;
		this._gapBarSpace = Math.max(1, gapBarSpace);
	}
	_adjustVisibleRange() {
		const totalBarCount = this._dataList.length;
		const visibleBarCount = this._totalBarSpace / this._barSpace;
		let leftMinVisibleBarCount = 0;
		let rightMinVisibleBarCount = 0;
		if (this._scrollLimitRole === "distance") {
			leftMinVisibleBarCount = (this._totalBarSpace - this._maxOffsetDistance.right) / this._barSpace;
			rightMinVisibleBarCount = (this._totalBarSpace - this._maxOffsetDistance.left) / this._barSpace;
		} else {
			leftMinVisibleBarCount = this._minVisibleBarCount.left;
			rightMinVisibleBarCount = this._minVisibleBarCount.right;
		}
		leftMinVisibleBarCount = Math.max(0, leftMinVisibleBarCount);
		rightMinVisibleBarCount = Math.max(0, rightMinVisibleBarCount);
		const maxRightOffsetBarCount = visibleBarCount - Math.min(leftMinVisibleBarCount, totalBarCount);
		if (this._lastBarRightSideDiffBarCount > maxRightOffsetBarCount) this._lastBarRightSideDiffBarCount = maxRightOffsetBarCount;
		const minRightOffsetBarCount = -totalBarCount + Math.min(rightMinVisibleBarCount, totalBarCount);
		if (this._lastBarRightSideDiffBarCount < minRightOffsetBarCount) this._lastBarRightSideDiffBarCount = minRightOffsetBarCount;
		let to = Math.round(this._lastBarRightSideDiffBarCount + totalBarCount + .5);
		const realTo = to;
		if (to > totalBarCount) to = totalBarCount;
		let from = Math.round(to - visibleBarCount) - 1;
		if (from < 0) from = 0;
		const realFrom = this._lastBarRightSideDiffBarCount > 0 ? Math.round(totalBarCount + this._lastBarRightSideDiffBarCount - visibleBarCount) - 1 : from;
		this._visibleRange = {
			from,
			to,
			realFrom,
			realTo
		};
		this.executeAction("onVisibleRangeChange", this._visibleRange);
		this._visibleRangeDataList = [];
		this._visibleRangeHighLowPrice = [{
			x: 0,
			price: Number.MIN_SAFE_INTEGER
		}, {
			x: 0,
			price: Number.MAX_SAFE_INTEGER
		}];
		for (let i = realFrom; i < realTo; i++) {
			const kLineData = this._dataList[i];
			const x = this.dataIndexToCoordinate(i);
			this._visibleRangeDataList.push({
				dataIndex: i,
				x,
				data: {
					prev: this._dataList[i - 1] ?? kLineData,
					current: kLineData,
					next: this._dataList[i + 1] ?? kLineData
				}
			});
			if (isValid(kLineData)) {
				if (this._visibleRangeHighLowPrice[0].price < kLineData.high) {
					this._visibleRangeHighLowPrice[0].price = kLineData.high;
					this._visibleRangeHighLowPrice[0].x = x;
				}
				if (this._visibleRangeHighLowPrice[1].price > kLineData.low) {
					this._visibleRangeHighLowPrice[1].price = kLineData.low;
					this._visibleRangeHighLowPrice[1].x = x;
				}
			}
		}
		if (from === 0) {
			if (this._dataLoadMore.forward) this._processDataLoad("forward");
		} else if (to === totalBarCount) {
			if (this._dataLoadMore.backward) this._processDataLoad("backward");
		}
	}
	_processDataLoad(type) {
		if (!this._loading && isValid(this._dataLoader) && isValid(this._symbol) && isValid(this._period)) {
			this._loading = true;
			const params = {
				type,
				symbol: this._symbol,
				period: this._period,
				timestamp: null,
				callback: (data, more) => {
					this._loading = false;
					this._addData(data, type, more);
					if (type === "init") this._dataLoader?.subscribeBar?.({
						symbol: this._symbol,
						period: this._period,
						callback: (data) => {
							this._addData(data, "update");
						}
					});
				}
			};
			switch (type) {
				case "backward":
					params.timestamp = this._dataList[this._dataList.length - 1]?.timestamp ?? null;
					break;
				case "forward":
					params.timestamp = this._dataList[0]?.timestamp ?? null;
					break;
				default: break;
			}
			this._dataLoader.getBars(params);
		}
	}
	_processDataUnsubscribe() {
		if (isValid(this._dataLoader) && isValid(this._symbol) && isValid(this._period)) this._dataLoader.unsubscribeBar?.({
			symbol: this._symbol,
			period: this._period
		});
	}
	resetData(fn) {
		this._processDataUnsubscribe();
		fn?.();
		this._loading = false;
		this._processDataLoad("init");
	}
	getBarSpace() {
		return {
			bar: this._barSpace,
			halfBar: this._barSpace / 2,
			gapBar: this._gapBarSpace,
			halfGapBar: Math.floor(this._gapBarSpace / 2)
		};
	}
	setBarSpace(barSpace, adjustBeforeFunc) {
		if (barSpace < this._layoutBasicParams.barSpaceLimitMin || barSpace > this._layoutBasicParams.barSpaceLimitMax || this._barSpace === barSpace) return;
		this._barSpace = barSpace;
		this._calcOptimalBarSpace();
		adjustBeforeFunc?.();
		this._adjustVisibleRange();
		this.setCrosshair(this._crosshair, { notInvalidate: true });
		this._chart.layout({
			measureWidth: true,
			update: true,
			buildYAxisTick: true,
			cacheYAxisWidth: true
		});
	}
	getLayoutBasicParams() {
		return this._layoutBasicParams;
	}
	setTotalBarSpace(totalSpace) {
		if (this._totalBarSpace !== totalSpace) {
			this._totalBarSpace = totalSpace;
			this._adjustVisibleRange();
			this.setCrosshair(this._crosshair, { notInvalidate: true });
		}
	}
	setOffsetRightDistance(distance, isUpdate) {
		this._offsetRightDistance = this._scrollLimitRole === "distance" ? Math.min(this._maxOffsetDistance.right, distance) : distance;
		this._lastBarRightSideDiffBarCount = this._offsetRightDistance / this._barSpace;
		if (isUpdate ?? false) {
			this._adjustVisibleRange();
			this.setCrosshair(this._crosshair, { notInvalidate: true });
			this._chart.layout({
				measureWidth: true,
				update: true,
				buildYAxisTick: true,
				cacheYAxisWidth: true
			});
		}
		return this;
	}
	getInitialOffsetRightDistance() {
		return this._offsetRightDistance;
	}
	getOffsetRightDistance() {
		return Math.max(0, this._lastBarRightSideDiffBarCount * this._barSpace);
	}
	getLastBarRightSideDiffBarCount() {
		return this._lastBarRightSideDiffBarCount;
	}
	setLastBarRightSideDiffBarCount(barCount) {
		this._lastBarRightSideDiffBarCount = barCount;
	}
	setMaxOffsetLeftDistance(distance) {
		this._scrollLimitRole = "distance";
		this._maxOffsetDistance.left = distance;
	}
	setMaxOffsetRightDistance(distance) {
		this._scrollLimitRole = "distance";
		this._maxOffsetDistance.right = distance;
	}
	setLeftMinVisibleBarCount(barCount) {
		this._scrollLimitRole = "bar_count";
		this._minVisibleBarCount.left = barCount;
	}
	setRightMinVisibleBarCount(barCount) {
		this._scrollLimitRole = "bar_count";
		this._minVisibleBarCount.right = barCount;
	}
	getVisibleRange() {
		return this._visibleRange;
	}
	startScroll() {
		this._startLastBarRightSideDiffBarCount = this._lastBarRightSideDiffBarCount;
	}
	scroll(distance) {
		if (!this._scrollEnabled) return;
		const distanceBarCount = distance / this._barSpace;
		const prevLastBarRightSideDistance = this._lastBarRightSideDiffBarCount * this._barSpace;
		this._lastBarRightSideDiffBarCount = this._startLastBarRightSideDiffBarCount - distanceBarCount;
		this._adjustVisibleRange();
		this.setCrosshair(this._crosshair, { notInvalidate: true });
		this._chart.layout({
			measureWidth: true,
			update: true,
			buildYAxisTick: true,
			cacheYAxisWidth: true
		});
		const realDistance = Math.round(prevLastBarRightSideDistance - this._lastBarRightSideDiffBarCount * this._barSpace);
		if (realDistance !== 0) this.executeAction("onScroll", { distance: realDistance });
	}
	getDataByDataIndex(dataIndex) {
		return this._dataList[dataIndex] ?? null;
	}
	coordinateToFloatIndex(x) {
		const dataCount = this._dataList.length;
		const deltaFromRight = (this._totalBarSpace - x) / this._barSpace;
		const index = dataCount + this._lastBarRightSideDiffBarCount - deltaFromRight;
		return Math.round(index * 1e6) / 1e6;
	}
	dataIndexToTimestamp(dataIndex) {
		const length = this._dataList.length;
		if (length === 0) return null;
		const data = this.getDataByDataIndex(dataIndex);
		if (isValid(data)) return data.timestamp;
		if (isValid(this._period)) {
			const lastIndex = length - 1;
			let referenceTimestamp = null;
			let diff = 0;
			if (dataIndex > lastIndex) {
				referenceTimestamp = this._dataList[lastIndex].timestamp;
				diff = dataIndex - lastIndex;
			} else if (dataIndex < 0) {
				referenceTimestamp = this._dataList[0].timestamp;
				diff = dataIndex;
			}
			if (isNumber(referenceTimestamp)) {
				const { type, span } = this._period;
				switch (type) {
					case "second": return referenceTimestamp + span * 1e3 * diff;
					case "minute": return referenceTimestamp + span * 60 * 1e3 * diff;
					case "hour": return referenceTimestamp + span * 60 * 60 * 1e3 * diff;
					case "day": return referenceTimestamp + span * 24 * 60 * 60 * 1e3 * diff;
					case "week": return referenceTimestamp + span * 7 * 24 * 60 * 60 * 1e3 * diff;
					case "month": {
						const date = new Date(referenceTimestamp);
						const referenceDay = date.getDate();
						date.setDate(1);
						date.setMonth(date.getMonth() + span * diff);
						const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
						date.setDate(Math.min(referenceDay, lastDayOfTargetMonth));
						return date.getTime();
					}
					case "year": {
						const date = new Date(referenceTimestamp);
						date.setFullYear(date.getFullYear() + span * diff);
						return date.getTime();
					}
				}
			}
		}
		return null;
	}
	timestampToDataIndex(timestamp) {
		const length = this._dataList.length;
		if (length === 0) return 0;
		if (isValid(this._period)) {
			let referenceTimestamp = null;
			let baseDataIndex = 0;
			const lastIndex = length - 1;
			const lastTimestamp = this._dataList[lastIndex].timestamp;
			if (timestamp > lastTimestamp) {
				referenceTimestamp = lastTimestamp;
				baseDataIndex = lastIndex;
			}
			const firstTimestamp = this._dataList[0].timestamp;
			if (timestamp < firstTimestamp) {
				referenceTimestamp = firstTimestamp;
				baseDataIndex = 0;
			}
			if (isNumber(referenceTimestamp)) {
				const { type, span } = this._period;
				switch (type) {
					case "second": return baseDataIndex + Math.floor((timestamp - referenceTimestamp) / (span * 1e3));
					case "minute": return baseDataIndex + Math.floor((timestamp - referenceTimestamp) / (span * 60 * 1e3));
					case "hour": return baseDataIndex + Math.floor((timestamp - referenceTimestamp) / (span * 60 * 60 * 1e3));
					case "day": return baseDataIndex + Math.floor((timestamp - referenceTimestamp) / (span * 24 * 60 * 60 * 1e3));
					case "week": return baseDataIndex + Math.floor((timestamp - referenceTimestamp) / (span * 7 * 24 * 60 * 60 * 1e3));
					case "month": {
						const referenceDate = new Date(referenceTimestamp);
						const currentDate = new Date(timestamp);
						const referenceYear = referenceDate.getFullYear();
						const currentYear = currentDate.getFullYear();
						const referenceMonth = referenceDate.getMonth();
						const currentMonth = currentDate.getMonth();
						return baseDataIndex + Math.floor(((currentYear - referenceYear) * 12 + (currentMonth - referenceMonth)) / span);
					}
					case "year": {
						const referenceYear = new Date(referenceTimestamp).getFullYear();
						const currentYear = new Date(timestamp).getFullYear();
						return baseDataIndex + Math.floor((currentYear - referenceYear) / span);
					}
				}
			}
		}
		return binarySearchNearest(this._dataList, "timestamp", timestamp);
	}
	dataIndexToCoordinate(dataIndex) {
		const deltaFromRight = this._dataList.length + this._lastBarRightSideDiffBarCount - dataIndex;
		return Math.floor(this._totalBarSpace - (deltaFromRight - .5) * this._barSpace + .5);
	}
	coordinateToDataIndex(x) {
		return Math.ceil(this.coordinateToFloatIndex(x)) - 1;
	}
	zoom(scale, coordinate, position) {
		if (!this._zoomEnabled) return;
		const zoomCoordinate = coordinate ?? { x: this._crosshair.x ?? this._totalBarSpace / 2 };
		if (position === "xAxis") {
			if (this._zoomAnchor.xAxis === "last_bar") zoomCoordinate.x = this.dataIndexToCoordinate(this._dataList.length - 1);
		} else if (this._zoomAnchor.main === "last_bar") zoomCoordinate.x = this.dataIndexToCoordinate(this._dataList.length - 1);
		const x = zoomCoordinate.x;
		const floatIndex = this.coordinateToFloatIndex(x);
		const prevBarSpace = this._barSpace;
		const barSpace = this._barSpace + scale * (this._barSpace / 10);
		this.setBarSpace(barSpace, () => {
			this._lastBarRightSideDiffBarCount += floatIndex - this.coordinateToFloatIndex(x);
		});
		const realScale = this._barSpace / prevBarSpace;
		if (realScale !== 1) this.executeAction("onZoom", { scale: realScale });
	}
	setZoomEnabled(enabled) {
		this._zoomEnabled = enabled;
	}
	isZoomEnabled() {
		return this._zoomEnabled;
	}
	setZoomAnchor(anchor) {
		if (isString(anchor)) {
			this._zoomAnchor.main = anchor;
			this._zoomAnchor.xAxis = anchor;
		} else {
			if (isString(anchor.main)) this._zoomAnchor.main = anchor.main;
			if (isString(anchor.xAxis)) this._zoomAnchor.xAxis = anchor.xAxis;
		}
	}
	getZoomAnchor() {
		return { ...this._zoomAnchor };
	}
	setScrollEnabled(enabled) {
		this._scrollEnabled = enabled;
	}
	isScrollEnabled() {
		return this._scrollEnabled;
	}
	setCrosshair(crosshair, options) {
		const { notInvalidate, notExecuteAction, forceInvalidate } = options ?? {};
		const cr = crosshair ?? {};
		let realDataIndex = 0;
		let dataIndex = 0;
		if (isNumber(cr.x)) {
			realDataIndex = this.coordinateToDataIndex(cr.x);
			if (realDataIndex < 0) dataIndex = 0;
			else if (realDataIndex > this._dataList.length - 1) dataIndex = this._dataList.length - 1;
			else dataIndex = realDataIndex;
		} else {
			realDataIndex = this._dataList.length - 1;
			dataIndex = realDataIndex;
		}
		const kLineData = this._dataList[dataIndex];
		const realX = this.dataIndexToCoordinate(realDataIndex);
		const prevCrosshair = {
			x: this._crosshair.x,
			y: this._crosshair.y,
			paneId: this._crosshair.paneId
		};
		this._crosshair = {
			...cr,
			realX,
			kLineData,
			realDataIndex,
			dataIndex,
			timestamp: this.dataIndexToTimestamp(realDataIndex) ?? void 0
		};
		if (prevCrosshair.x !== cr.x || prevCrosshair.y !== cr.y || prevCrosshair.paneId !== cr.paneId || (forceInvalidate ?? false)) {
			if (isValid(kLineData) && !(notExecuteAction ?? false) && this.hasAction("onCrosshairChange") && isString(this._crosshair.paneId)) this.executeAction("onCrosshairChange", crosshair);
			if (!(notInvalidate ?? false)) this._chart.updatePane(UpdateLevel.Overlay);
		}
	}
	getCrosshair() {
		return this._crosshair;
	}
	executeAction(type, data) {
		this._actions.get(type)?.execute(data);
	}
	subscribeAction(type, callback) {
		if (!this._actions.has(type)) this._actions.set(type, new Action());
		this._actions.get(type)?.subscribe(callback);
	}
	unsubscribeAction(type, callback) {
		const action = this._actions.get(type);
		if (isValid(action)) {
			action.unsubscribe(callback);
			if (action.isEmpty()) this._actions.delete(type);
		}
	}
	hasAction(type) {
		const action = this._actions.get(type);
		return isValid(action) && !action.isEmpty();
	}
	_sortIndicators(paneId) {
		if (isString(paneId)) this._indicators.get(paneId)?.sort((i1, i2) => i1.zLevel - i2.zLevel);
		else this._indicators.forEach((paneIndicators) => {
			paneIndicators.sort((i1, i2) => i1.zLevel - i2.zLevel);
		});
	}
	_calcIndicator(data) {
		let indicators = [];
		indicators = indicators.concat(data);
		if (indicators.length > 0) {
			const tasks = {};
			indicators.forEach((indicator) => {
				tasks[indicator.id] = indicator.calcImp(this._dataList);
			});
			this._taskScheduler.add(tasks);
		}
	}
	addIndicator(create, isStack) {
		const { name } = create;
		if (this.getIndicatorsByFilter(create).length > 0) return false;
		const paneId = create.paneId;
		let paneIndicators = this.getIndicatorsByPaneId(paneId);
		const indicator = new (getIndicatorClass(name))();
		this._synchronizeIndicatorSeriesPrecision(indicator);
		indicator.override(create);
		if (!isStack) {
			this.removeIndicator({ paneId });
			paneIndicators = [];
		}
		paneIndicators.push(indicator);
		this._indicators.set(paneId, paneIndicators);
		this._sortIndicators(paneId);
		this._calcIndicator(indicator);
		return true;
	}
	getIndicatorsByPaneId(paneId) {
		return this._indicators.get(paneId) ?? [];
	}
	getIndicatorsByFilter(filter) {
		const { paneId, name, id } = filter;
		const match = (indicator) => {
			if (isValid(id)) return indicator.id === id;
			return !isValid(name) || indicator.name === name;
		};
		let indicators = [];
		if (isValid(paneId)) indicators = indicators.concat(this.getIndicatorsByPaneId(paneId).filter(match));
		else this._indicators.forEach((paneIndicators) => {
			indicators = indicators.concat(paneIndicators.filter(match));
		});
		return indicators;
	}
	removeIndicator(filter) {
		let removed = false;
		this.getIndicatorsByFilter(filter).forEach((indicator) => {
			const paneIndicators = this.getIndicatorsByPaneId(indicator.paneId);
			const index = paneIndicators.findIndex((ins) => ins.id === indicator.id);
			if (index > -1) {
				paneIndicators.splice(index, 1);
				removed = true;
			}
			if (paneIndicators.length === 0) this._indicators.delete(indicator.paneId);
		});
		return removed;
	}
	hasIndicators(paneId) {
		return this._indicators.has(paneId);
	}
	_synchronizeIndicatorSeriesPrecision(indicator) {
		if (isValid(this._symbol)) {
			const { pricePrecision = SymbolDefaultPrecisionConstants.PRICE, volumePrecision = SymbolDefaultPrecisionConstants.VOLUME } = this._symbol;
			const synchronize = (indicator) => {
				switch (indicator.series) {
					case "price":
						indicator.setSeriesPrecision(pricePrecision);
						break;
					case "volume":
						indicator.setSeriesPrecision(volumePrecision);
						break;
					default: break;
				}
			};
			if (isValid(indicator)) synchronize(indicator);
			else this._indicators.forEach((paneIndicators) => {
				paneIndicators.forEach((indicator) => {
					synchronize(indicator);
				});
			});
		}
	}
	overrideIndicator(override) {
		let updateFlag = false;
		let sortFlag = false;
		this.getIndicatorsByFilter(override).forEach((indicator) => {
			const prevPaneId = indicator.paneId;
			indicator.override(override);
			const currentPaneId = indicator.paneId;
			if (prevPaneId !== currentPaneId) {
				const prevPaneIndicators = this.getIndicatorsByPaneId(prevPaneId);
				const index = prevPaneIndicators.findIndex((ins) => ins.id === indicator.id);
				if (index > -1) prevPaneIndicators.splice(index, 1);
				if (prevPaneIndicators.length === 0) this._indicators.delete(prevPaneId);
				const currentPaneIndicators = this.getIndicatorsByPaneId(currentPaneId);
				if (!currentPaneIndicators.some((ins) => ins.id === indicator.id)) {
					currentPaneIndicators.push(indicator);
					this._indicators.set(currentPaneId, currentPaneIndicators);
				}
				sortFlag = true;
			}
			const { calc, draw, sort } = indicator.shouldUpdateImp();
			if (sort) sortFlag = true;
			if (calc) this._calcIndicator(indicator);
			else if (draw) updateFlag = true;
		});
		if (sortFlag) this._sortIndicators();
		return updateFlag || sortFlag;
	}
	getOverlaysByFilter(filter) {
		const { id, groupId, paneId, name } = filter;
		const match = (overlay) => {
			if (isValid(id)) return overlay.id === id;
			else if (isValid(groupId)) return overlay.groupId === groupId && (!isValid(name) || overlay.name === name);
			return !isValid(name) || overlay.name === name;
		};
		let overlays = [];
		if (isValid(paneId)) overlays = overlays.concat(this.getOverlaysByPaneId(paneId).filter(match));
		else this._overlays.forEach((paneOverlays) => {
			overlays = overlays.concat(paneOverlays.filter(match));
		});
		const progressOverlay = this._progressOverlayInfo?.overlay;
		if (isValid(progressOverlay) && match(progressOverlay)) overlays.push(progressOverlay);
		return overlays;
	}
	getOverlaysByPaneId(paneId) {
		if (!isString(paneId)) {
			let overlays = [];
			this._overlays.forEach((paneOverlays) => {
				overlays = overlays.concat(paneOverlays);
			});
			return overlays;
		}
		return this._overlays.get(paneId) ?? [];
	}
	_sortOverlays(paneId) {
		if (isString(paneId)) this._overlays.get(paneId)?.sort((o1, o2) => o1.zLevel - o2.zLevel);
		else this._overlays.forEach((paneOverlays) => {
			paneOverlays.sort((o1, o2) => o1.zLevel - o2.zLevel);
		});
	}
	addOverlays(os, appointPaneFlags) {
		const updatePaneIds = [];
		const ids = os.map((create, index) => {
			if (isValid(create.id)) {
				let findOverlay = null;
				for (const item of this._overlays) {
					const overlay = item[1].find((o) => o.id === create.id);
					if (isValid(overlay)) {
						findOverlay = overlay;
						break;
					}
				}
				if (isValid(findOverlay)) return create.id;
			}
			const OverlayClazz = getOverlayInnerClass(create.name);
			if (isValid(OverlayClazz)) {
				const id = create.id ?? createId("overlay_");
				const overlay = new OverlayClazz();
				const paneId = create.paneId ?? PaneIdConstants.CANDLE;
				create.id = id;
				create.groupId ??= id;
				const zLevel = this.getOverlaysByPaneId(paneId).length;
				create.zLevel ??= zLevel;
				overlay.override(create);
				if (!updatePaneIds.includes(paneId)) updatePaneIds.push(paneId);
				if (overlay.isDrawing()) this._progressOverlayInfo = {
					paneId,
					overlay,
					appointPaneFlag: appointPaneFlags[index]
				};
				else {
					if (!this._overlays.has(paneId)) this._overlays.set(paneId, []);
					this._overlays.get(paneId)?.push(overlay);
				}
				if (overlay.isStart()) overlay.onDrawStart?.({
					overlay,
					chart: this._chart
				});
				return id;
			}
			return null;
		});
		if (updatePaneIds.length > 0) {
			this._sortOverlays();
			updatePaneIds.forEach((paneId) => {
				this._chart.updatePane(UpdateLevel.Overlay, paneId);
			});
			this._chart.updatePane(UpdateLevel.Overlay, PaneIdConstants.X_AXIS);
		}
		return ids;
	}
	getProgressOverlayInfo() {
		return this._progressOverlayInfo;
	}
	progressOverlayComplete() {
		if (this._progressOverlayInfo !== null) {
			const { overlay, paneId } = this._progressOverlayInfo;
			if (!overlay.isDrawing()) {
				if (!this._overlays.has(paneId)) this._overlays.set(paneId, []);
				this._overlays.get(paneId)?.push(overlay);
				this._sortOverlays(paneId);
				this._progressOverlayInfo = null;
			}
		}
	}
	updateProgressOverlayInfo(paneId, appointPaneFlag) {
		if (this._progressOverlayInfo !== null) {
			if (isBoolean(appointPaneFlag) && appointPaneFlag) this._progressOverlayInfo.appointPaneFlag = appointPaneFlag;
			this._progressOverlayInfo.paneId = paneId;
			this._progressOverlayInfo.overlay.override({ paneId });
		}
	}
	overrideOverlay(override) {
		let sortFlag = false;
		const updatePaneIds = [];
		this.getOverlaysByFilter(override).forEach((overlay) => {
			overlay.override(override);
			const { sort, draw } = overlay.shouldUpdate();
			if (sort) sortFlag = true;
			if (sort || draw) {
				if (!updatePaneIds.includes(overlay.paneId)) updatePaneIds.push(overlay.paneId);
			}
		});
		if (sortFlag) this._sortOverlays();
		if (updatePaneIds.length > 0) {
			updatePaneIds.forEach((paneId) => {
				this._chart.updatePane(UpdateLevel.Overlay, paneId);
			});
			this._chart.updatePane(UpdateLevel.Overlay, PaneIdConstants.X_AXIS);
			return true;
		}
		return false;
	}
	removeOverlay(filter) {
		const updatePaneIds = [];
		this.getOverlaysByFilter(filter).forEach((overlay) => {
			const paneId = overlay.paneId;
			const paneOverlays = this.getOverlaysByPaneId(overlay.paneId);
			overlay.onRemoved?.({
				overlay,
				chart: this._chart
			});
			if (!updatePaneIds.includes(paneId)) updatePaneIds.push(paneId);
			if (overlay.isDrawing()) this._progressOverlayInfo = null;
			else {
				const index = paneOverlays.findIndex((o) => o.id === overlay.id);
				if (index > -1) paneOverlays.splice(index, 1);
			}
			if (paneOverlays.length === 0) this._overlays.delete(paneId);
		});
		if (updatePaneIds.length > 0) {
			updatePaneIds.forEach((paneId) => {
				this._chart.updatePane(UpdateLevel.Overlay, paneId);
			});
			this._chart.updatePane(UpdateLevel.Overlay, PaneIdConstants.X_AXIS);
			return true;
		}
		return false;
	}
	setPressedOverlayInfo(info) {
		this._pressedOverlayInfo = info;
	}
	getPressedOverlayInfo() {
		return this._pressedOverlayInfo;
	}
	setHoverOverlayInfo(info, processOnMouseEnterEvent, processOnMouseLeaveEvent) {
		const { overlay, figureType, figureIndex, figure } = this._hoverOverlayInfo;
		const infoOverlay = info.overlay;
		if (overlay?.id !== infoOverlay?.id || figureType !== info.figureType || figureIndex !== info.figureIndex) {
			this._hoverOverlayInfo = info;
			if (overlay?.id !== infoOverlay?.id) {
				let ignoreUpdateFlag = false;
				let sortFlag = false;
				if (overlay !== null) {
					overlay.override({ zLevel: overlay.getPrevZLevel() });
					sortFlag = true;
					if (processOnMouseLeaveEvent(overlay, figure)) ignoreUpdateFlag = true;
				}
				if (infoOverlay !== null) {
					infoOverlay.setPrevZLevel(infoOverlay.zLevel);
					infoOverlay.override({ zLevel: Number.MAX_SAFE_INTEGER });
					sortFlag = true;
					if (processOnMouseEnterEvent(infoOverlay, info.figure)) ignoreUpdateFlag = true;
				}
				if (sortFlag) this._sortOverlays();
				if (!ignoreUpdateFlag) this._chart.updatePane(UpdateLevel.Overlay);
			}
		}
	}
	getHoverOverlayInfo() {
		return this._hoverOverlayInfo;
	}
	setClickOverlayInfo(info, processOnSelectedEvent, processOnDeselectedEvent) {
		const { paneId, overlay, figureType, figure, figureIndex } = this._clickOverlayInfo;
		const infoOverlay = info.overlay;
		if (overlay?.id !== infoOverlay?.id || figureType !== info.figureType || figureIndex !== info.figureIndex) {
			this._clickOverlayInfo = info;
			if (overlay?.id !== infoOverlay?.id) {
				if (isValid(overlay)) processOnDeselectedEvent(overlay, figure);
				if (isValid(infoOverlay)) processOnSelectedEvent(infoOverlay, info.figure);
				this._chart.updatePane(UpdateLevel.Overlay, info.paneId);
				if (paneId !== info.paneId) this._chart.updatePane(UpdateLevel.Overlay, paneId);
				this._chart.updatePane(UpdateLevel.Overlay, PaneIdConstants.X_AXIS);
			}
		}
	}
	getClickOverlayInfo() {
		return this._clickOverlayInfo;
	}
	isOverlayEmpty() {
		return this._overlays.size === 0 && this._progressOverlayInfo === null;
	}
	isOverlayDrawing() {
		return this._progressOverlayInfo?.overlay.isDrawing() ?? false;
	}
	_clearLastPriceMarkExtendTextUpdateTimer() {
		this._lastPriceMarkExtendTextUpdateTimers.forEach((timer) => {
			clearInterval(timer);
		});
		this._lastPriceMarkExtendTextUpdateTimers = [];
	}
	_clearData() {
		this._dataLoadMore.backward = false;
		this._dataLoadMore.forward = false;
		this._loading = false;
		this._dataList = [];
		this._visibleRangeDataList = [];
		this._visibleRangeHighLowPrice = [{
			x: 0,
			price: Number.MIN_SAFE_INTEGER
		}, {
			x: 0,
			price: Number.MAX_SAFE_INTEGER
		}];
		this._visibleRange = getDefaultVisibleRange();
		this._crosshair = {};
	}
	getChart() {
		return this._chart;
	}
	destroy() {
		this._clearData();
		this._clearLastPriceMarkExtendTextUpdateTimer();
		this._taskScheduler.clear();
		this._overlays.clear();
		this._indicators.clear();
		this._actions.clear();
	}
};
var WidgetNameConstants = {
	MAIN: "main",
	X_AXIS: "xAxis",
	Y_AXIS: "yAxis",
	SEPARATOR: "separator"
};
async function isSupportedDevicePixelContentBox() {
	return await new Promise((resolve) => {
		const ro = new ResizeObserver((entries) => {
			resolve(entries.every((entry) => "devicePixelContentBoxSize" in entry));
			ro.disconnect();
		});
		ro.observe(document.body, { box: "device-pixel-content-box" });
	}).catch(() => false);
}
var Canvas = class {
	constructor(style, listener) {
		this._supportedDevicePixelContentBox = false;
		this._width = 0;
		this._height = 0;
		this._pixelWidth = 0;
		this._pixelHeight = 0;
		this._nextPixelWidth = 0;
		this._nextPixelHeight = 0;
		this._requestAnimationId = -1;
		this._mediaQueryListener = () => {
			const pixelRatio = getPixelRatio(this._element);
			this._nextPixelWidth = Math.round(this._element.clientWidth * pixelRatio);
			this._nextPixelHeight = Math.round(this._element.clientHeight * pixelRatio);
			this._resetPixelRatio();
		};
		this._listener = listener;
		this._element = createDom("canvas", style);
		this._ctx = this._element.getContext("2d");
		isSupportedDevicePixelContentBox().then((result) => {
			this._supportedDevicePixelContentBox = result;
			if (result) {
				this._resizeObserver = new ResizeObserver((entries) => {
					const size = entries.find((entry) => entry.target === this._element)?.devicePixelContentBoxSize[0];
					if (isValid(size)) {
						this._nextPixelWidth = size.inlineSize;
						this._nextPixelHeight = size.blockSize;
						if (this._pixelWidth !== this._nextPixelWidth || this._pixelHeight !== this._nextPixelHeight) this._resetPixelRatio();
					}
				});
				this._resizeObserver.observe(this._element, { box: "device-pixel-content-box" });
			} else {
				this._mediaQueryList = window.matchMedia(`(resolution: ${getPixelRatio(this._element)}dppx)`);
				this._mediaQueryList.addListener(this._mediaQueryListener);
			}
		}).catch((_) => false);
	}
	_resetPixelRatio() {
		this._executeListener(() => {
			const width = this._element.clientWidth;
			const height = this._element.clientHeight;
			this._width = width;
			this._height = height;
			this._pixelWidth = this._nextPixelWidth;
			this._pixelHeight = this._nextPixelHeight;
			this._element.width = this._nextPixelWidth;
			this._element.height = this._nextPixelHeight;
			const horizontalPixelRatio = this._nextPixelWidth / width;
			const verticalPixelRatio = this._nextPixelHeight / height;
			this._ctx.scale(horizontalPixelRatio, verticalPixelRatio);
		});
	}
	_executeListener(fn) {
		if (this._requestAnimationId === -1) this._requestAnimationId = requestAnimationFrame(() => {
			this._ctx.clearRect(0, 0, this._width, this._height);
			fn?.();
			this._listener();
			this._requestAnimationId = -1;
		});
	}
	update(w, h) {
		if (this._width !== w || this._height !== h) {
			this._element.style.width = `${w}px`;
			this._element.style.height = `${h}px`;
			if (!this._supportedDevicePixelContentBox) {
				const pixelRatio = getPixelRatio(this._element);
				this._nextPixelWidth = Math.round(w * pixelRatio);
				this._nextPixelHeight = Math.round(h * pixelRatio);
				this._resetPixelRatio();
			}
		} else this._executeListener();
	}
	getElement() {
		return this._element;
	}
	getContext() {
		return this._ctx;
	}
	destroy() {
		if (isValid(this._resizeObserver)) this._resizeObserver.unobserve(this._element);
		if (isValid(this._mediaQueryList)) this._mediaQueryList.removeListener(this._mediaQueryListener);
	}
};
var Widget = class extends Eventful {
	constructor(rootContainer, pane) {
		super();
		this._bounding = createDefaultBounding();
		this._cursor = "crosshair";
		this._forceCursor = null;
		this._pane = pane;
		this._rootContainer = rootContainer;
		this._container = this.createContainer();
		rootContainer.appendChild(this._container);
	}
	setBounding(bounding) {
		merge(this._bounding, bounding);
		return this;
	}
	getContainer() {
		return this._container;
	}
	getBounding() {
		return this._bounding;
	}
	getPane() {
		return this._pane;
	}
	checkEventOn(_) {
		return true;
	}
	setCursor(cursor) {
		if (!isString(this._forceCursor)) {
			if (cursor !== this._cursor) {
				this._cursor = cursor;
				this._container.style.cursor = this._cursor;
			}
		}
	}
	setForceCursor(cursor) {
		if (cursor !== this._forceCursor) {
			this._forceCursor = cursor;
			this._container.style.cursor = this._forceCursor ?? this._cursor;
		}
	}
	getForceCursor() {
		return this._forceCursor;
	}
	update(level) {
		this.updateImp(this._container, this._bounding, level ?? UpdateLevel.Drawer);
	}
	destroy() {
		this._rootContainer.removeChild(this._container);
	}
};
var DrawWidget = class extends Widget {
	constructor(rootContainer, pane) {
		super(rootContainer, pane);
		this._mainCanvas = new Canvas({
			position: "absolute",
			top: "0",
			left: "0",
			zIndex: "2",
			boxSizing: "border-box"
		}, () => {
			this.updateMain(this._mainCanvas.getContext());
		});
		this._overlayCanvas = new Canvas({
			position: "absolute",
			top: "0",
			left: "0",
			zIndex: "2",
			boxSizing: "border-box"
		}, () => {
			this.updateOverlay(this._overlayCanvas.getContext());
		});
		const container = this.getContainer();
		container.appendChild(this._mainCanvas.getElement());
		container.appendChild(this._overlayCanvas.getElement());
	}
	createContainer() {
		return createDom("div", {
			margin: "0",
			padding: "0",
			position: "absolute",
			top: "0",
			overflow: "hidden",
			boxSizing: "border-box",
			zIndex: "1"
		});
	}
	updateImp(container, bounding, level) {
		const { width, height, left } = bounding;
		container.style.left = `${left}px`;
		let l = level;
		const w = container.clientWidth;
		const h = container.clientHeight;
		if (width !== w || height !== h) {
			container.style.width = `${width}px`;
			container.style.height = `${height}px`;
			l = UpdateLevel.Drawer;
		}
		switch (l) {
			case UpdateLevel.Main:
				this._mainCanvas.update(width, height);
				break;
			case UpdateLevel.Overlay:
				this._overlayCanvas.update(width, height);
				break;
			case UpdateLevel.Drawer:
			case UpdateLevel.All:
				this._mainCanvas.update(width, height);
				this._overlayCanvas.update(width, height);
				break;
			default: break;
		}
	}
	destroy() {
		this._mainCanvas.destroy();
		this._overlayCanvas.destroy();
		super.destroy();
	}
	getImage(includeOverlay) {
		const { width, height } = this.getBounding();
		const canvas = createDom("canvas", {
			width: `${width}px`,
			height: `${height}px`,
			boxSizing: "border-box"
		});
		const ctx = canvas.getContext("2d");
		const pixelRatio = getPixelRatio(canvas);
		canvas.width = width * pixelRatio;
		canvas.height = height * pixelRatio;
		ctx.scale(pixelRatio, pixelRatio);
		ctx.drawImage(this._mainCanvas.getElement(), 0, 0, width, height);
		if (includeOverlay) ctx.drawImage(this._overlayCanvas.getElement(), 0, 0, width, height);
		return canvas;
	}
};
function checkCoordinateOnCircle(coordinate, attrs) {
	let circles = [];
	circles = circles.concat(attrs);
	for (const circle of circles) {
		const { x, y, r } = circle;
		const difX = coordinate.x - x;
		const difY = coordinate.y - y;
		if (!(difX * difX + difY * difY > r * r)) return true;
	}
	return false;
}
function drawCircle(ctx, attrs, styles) {
	let circles = [];
	circles = circles.concat(attrs);
	const { style = "fill", color = "currentColor", borderSize = 1, borderColor = "currentColor", borderStyle = "solid", borderDashedValue = [2, 2] } = styles;
	const solid = (style === "fill" || styles.style === "stroke_fill") && (!isString(color) || !isTransparent(color));
	if (solid) {
		ctx.fillStyle = color;
		circles.forEach(({ x, y, r }) => {
			ctx.beginPath();
			ctx.arc(x, y, r, 0, Math.PI * 2);
			ctx.closePath();
			ctx.fill();
		});
	}
	if ((style === "stroke" || styles.style === "stroke_fill") && borderSize > 0 && !isTransparent(borderColor)) {
		ctx.strokeStyle = borderColor;
		ctx.lineWidth = borderSize;
		if (borderStyle === "dashed") ctx.setLineDash(borderDashedValue);
		else ctx.setLineDash([]);
		circles.forEach(({ x, y, r }) => {
			if (!solid || r > borderSize) {
				ctx.beginPath();
				ctx.arc(x, y, r, 0, Math.PI * 2);
				ctx.closePath();
				ctx.stroke();
			}
		});
	}
}
var circle = {
	name: "circle",
	checkEventOn: checkCoordinateOnCircle,
	draw: (ctx, attrs, styles) => {
		drawCircle(ctx, attrs, styles);
	}
};
function checkCoordinateOnPolygon(coordinate, attrs) {
	let polygons = [];
	polygons = polygons.concat(attrs);
	for (const polygon of polygons) {
		let on = false;
		const { coordinates } = polygon;
		for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) if (coordinates[i].y > coordinate.y !== coordinates[j].y > coordinate.y && coordinate.x < (coordinates[j].x - coordinates[i].x) * (coordinate.y - coordinates[i].y) / (coordinates[j].y - coordinates[i].y) + coordinates[i].x) on = !on;
		if (on) return true;
	}
	return false;
}
function drawPolygon(ctx, attrs, styles) {
	let polygons = [];
	polygons = polygons.concat(attrs);
	const { style = "fill", color = "currentColor", borderSize = 1, borderColor = "currentColor", borderStyle = "solid", borderDashedValue = [2, 2] } = styles;
	if ((style === "fill" || styles.style === "stroke_fill") && (!isString(color) || !isTransparent(color))) {
		ctx.fillStyle = color;
		polygons.forEach(({ coordinates }) => {
			ctx.beginPath();
			ctx.moveTo(coordinates[0].x, coordinates[0].y);
			for (let i = 1; i < coordinates.length; i++) ctx.lineTo(coordinates[i].x, coordinates[i].y);
			ctx.closePath();
			ctx.fill();
		});
	}
	if ((style === "stroke" || styles.style === "stroke_fill") && borderSize > 0 && !isTransparent(borderColor)) {
		ctx.strokeStyle = borderColor;
		ctx.lineWidth = borderSize;
		if (borderStyle === "dashed") ctx.setLineDash(borderDashedValue);
		else ctx.setLineDash([]);
		polygons.forEach(({ coordinates }) => {
			ctx.beginPath();
			ctx.moveTo(coordinates[0].x, coordinates[0].y);
			for (let i = 1; i < coordinates.length; i++) ctx.lineTo(coordinates[i].x, coordinates[i].y);
			ctx.closePath();
			ctx.stroke();
		});
	}
}
var polygon = {
	name: "polygon",
	checkEventOn: checkCoordinateOnPolygon,
	draw: (ctx, attrs, styles) => {
		drawPolygon(ctx, attrs, styles);
	}
};
function checkCoordinateOnRect(coordinate, attrs) {
	let rects = [];
	rects = rects.concat(attrs);
	for (const rect of rects) {
		let x = rect.x;
		let width = rect.width;
		if (width < 4) {
			x -= 2;
			width = 4;
		}
		let y = rect.y;
		let height = rect.height;
		if (height < 4) {
			y -= 2;
			height = 4;
		}
		if (coordinate.x >= x && coordinate.x <= x + width && coordinate.y >= y && coordinate.y <= y + height) return true;
	}
	return false;
}
function drawRect(ctx, attrs, styles) {
	let rects = [];
	rects = rects.concat(attrs);
	const { style = "fill", color = "transparent", borderSize = 1, borderColor = "transparent", borderStyle = "solid", borderRadius: r = 0, borderDashedValue = [2, 2] } = styles;
	const draw = ctx.roundRect ?? ctx.rect;
	const solid = (style === "fill" || styles.style === "stroke_fill") && (!isString(color) || !isTransparent(color));
	if (solid) {
		ctx.fillStyle = color;
		rects.forEach(({ x, y, width: w, height: h }) => {
			ctx.beginPath();
			draw.call(ctx, x, y, w, h, r);
			ctx.closePath();
			ctx.fill();
		});
	}
	if ((style === "stroke" || styles.style === "stroke_fill") && borderSize > 0 && !isTransparent(borderColor)) {
		ctx.strokeStyle = borderColor;
		ctx.fillStyle = borderColor;
		ctx.lineWidth = borderSize;
		if (borderStyle === "dashed") ctx.setLineDash(borderDashedValue);
		else ctx.setLineDash([]);
		const correction = borderSize % 2 === 1 ? .5 : 0;
		const doubleCorrection = Math.round(correction * 2);
		rects.forEach(({ x, y, width: w, height: h }) => {
			if (w > borderSize * 2 && h > borderSize * 2) {
				ctx.beginPath();
				draw.call(ctx, x + correction, y + correction, w - doubleCorrection, h - doubleCorrection, r);
				ctx.closePath();
				ctx.stroke();
			} else if (!solid) ctx.fillRect(x, y, w, h);
		});
	}
}
var rect = {
	name: "rect",
	checkEventOn: checkCoordinateOnRect,
	draw: (ctx, attrs, styles) => {
		drawRect(ctx, attrs, styles);
	}
};
function getTextRect(attrs, styles) {
	const { size = 12, paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0, weight = "normal", family } = styles;
	const { x, y, text, align = "left", baseline = "top", width: w, height: h } = attrs;
	const width = w ?? paddingLeft + calcTextWidth(text, size, weight, family) + paddingRight;
	const height = h ?? paddingTop + size + paddingBottom;
	let startX = 0;
	switch (align) {
		case "left":
		case "start":
			startX = x;
			break;
		case "right":
		case "end":
			startX = x - width;
			break;
		default:
			startX = x - width / 2;
			break;
	}
	let startY = 0;
	switch (baseline) {
		case "top":
		case "hanging":
			startY = y;
			break;
		case "bottom":
		case "ideographic":
		case "alphabetic":
			startY = y - height;
			break;
		default:
			startY = y - height / 2;
			break;
	}
	return {
		x: startX,
		y: startY,
		width,
		height
	};
}
function checkCoordinateOnText(coordinate, attrs, styles) {
	let texts = [];
	texts = texts.concat(attrs);
	for (const text of texts) {
		const { x, y, width, height } = getTextRect(text, styles);
		if (coordinate.x >= x && coordinate.x <= x + width && coordinate.y >= y && coordinate.y <= y + height) return true;
	}
	return false;
}
function drawText(ctx, attrs, styles) {
	let texts = [];
	texts = texts.concat(attrs);
	const { color = "currentColor", size = 12, family, weight, paddingLeft = 0, paddingTop = 0, paddingRight = 0 } = styles;
	const rects = texts.map((text) => getTextRect(text, styles));
	drawRect(ctx, rects, {
		...styles,
		color: styles.backgroundColor
	});
	ctx.textAlign = "left";
	ctx.textBaseline = "top";
	ctx.font = createFont(size, weight, family);
	ctx.fillStyle = color;
	texts.forEach((text, index) => {
		const rect = rects[index];
		ctx.fillText(text.text, rect.x + paddingLeft, rect.y + paddingTop, rect.width - paddingLeft - paddingRight);
	});
}
var text = {
	name: "text",
	checkEventOn: checkCoordinateOnText,
	draw: (ctx, attrs, styles) => {
		drawText(ctx, attrs, styles);
	}
};
function getDistance(coordinate1, coordinate2) {
	const xDif = coordinate1.x - coordinate2.x;
	const yDif = coordinate1.y - coordinate2.y;
	return Math.sqrt(xDif * xDif + yDif * yDif);
}
function checkCoordinateOnArc(coordinate, attrs) {
	let arcs = [];
	arcs = arcs.concat(attrs);
	for (const arc of arcs) if (Math.abs(getDistance(coordinate, arc) - arc.r) < 2) {
		const { r, startAngle, endAngle } = arc;
		const startCoordinateX = r * Math.cos(startAngle) + arc.x;
		const startCoordinateY = r * Math.sin(startAngle) + arc.y;
		const endCoordinateX = r * Math.cos(endAngle) + arc.x;
		const endCoordinateY = r * Math.sin(endAngle) + arc.y;
		if (coordinate.x <= Math.max(startCoordinateX, endCoordinateX) + 2 && coordinate.x >= Math.min(startCoordinateX, endCoordinateX) - 2 && coordinate.y <= Math.max(startCoordinateY, endCoordinateY) + 2 && coordinate.y >= Math.min(startCoordinateY, endCoordinateY) - 2) return true;
	}
	return false;
}
function drawArc(ctx, attrs, styles) {
	let arcs = [];
	arcs = arcs.concat(attrs);
	const { style = "solid", size = 1, color = "currentColor", dashedValue = [2, 2] } = styles;
	ctx.lineWidth = size;
	ctx.strokeStyle = color;
	if (style === "dashed") ctx.setLineDash(dashedValue);
	else ctx.setLineDash([]);
	arcs.forEach(({ x, y, r, startAngle, endAngle }) => {
		ctx.beginPath();
		ctx.arc(x, y, r, startAngle, endAngle);
		ctx.stroke();
		ctx.closePath();
	});
}
var arc = {
	name: "arc",
	checkEventOn: checkCoordinateOnArc,
	draw: (ctx, attrs, styles) => {
		drawArc(ctx, attrs, styles);
	}
};
function drawEllipticalArc(ctx, x1, y1, args, offsetX, offsetY, isRelative) {
	const [rx, ry, rotation, largeArcFlag, sweepFlag, x2, y2] = args;
	ellipticalArcToBeziers(x1, y1, rx, ry, rotation, largeArcFlag, sweepFlag, isRelative ? x1 + x2 : x2 + offsetX, isRelative ? y1 + y2 : y2 + offsetY).forEach((segment) => {
		ctx.bezierCurveTo(segment[0], segment[1], segment[2], segment[3], segment[4], segment[5]);
	});
}
function ellipticalArcToBeziers(x1, y1, rx, ry, rotation, largeArcFlag, sweepFlag, x2, y2) {
	const { cx, cy, startAngle, deltaAngle } = computeEllipticalArcParameters(x1, y1, rx, ry, rotation, largeArcFlag, sweepFlag, x2, y2);
	const segments = [];
	const numSegments = Math.ceil(Math.abs(deltaAngle) / (Math.PI / 2));
	for (let i = 0; i < numSegments; i++) {
		const bezier = ellipticalArcToBezier(cx, cy, rx, ry, rotation, startAngle + i * deltaAngle / numSegments, startAngle + (i + 1) * deltaAngle / numSegments);
		segments.push(bezier);
	}
	return segments;
}
function computeEllipticalArcParameters(x1, y1, rx, ry, rotation, largeArcFlag, sweepFlag, x2, y2) {
	const phi = rotation * Math.PI / 180;
	const dx = (x1 - x2) / 2;
	const dy = (y1 - y2) / 2;
	const x1p = Math.cos(phi) * dx + Math.sin(phi) * dy;
	const y1p = -Math.sin(phi) * dx + Math.cos(phi) * dy;
	const lambda = x1p ** 2 / rx ** 2 + y1p ** 2 / ry ** 2;
	if (lambda > 1) {
		rx *= Math.sqrt(lambda);
		ry *= Math.sqrt(lambda);
	}
	const sign = largeArcFlag === sweepFlag ? -1 : 1;
	const numerator = rx ** 2 * ry ** 2 - rx ** 2 * y1p ** 2 - ry ** 2 * x1p ** 2;
	const denominator = rx ** 2 * y1p ** 2 + ry ** 2 * x1p ** 2;
	const cxp = sign * Math.sqrt(Math.abs(numerator / denominator)) * (rx * y1p / ry);
	const cyp = sign * Math.sqrt(Math.abs(numerator / denominator)) * (-ry * x1p / rx);
	const cx = Math.cos(phi) * cxp - Math.sin(phi) * cyp + (x1 + x2) / 2;
	const cy = Math.sin(phi) * cxp + Math.cos(phi) * cyp + (y1 + y2) / 2;
	const startAngle = Math.atan2((y1p - cyp) / ry, (x1p - cxp) / rx);
	let deltaAngle = Math.atan2((-y1p - cyp) / ry, (-x1p - cxp) / rx) - startAngle;
	if (deltaAngle < 0 && sweepFlag === 1) deltaAngle += 2 * Math.PI;
	else if (deltaAngle > 0 && sweepFlag === 0) deltaAngle -= 2 * Math.PI;
	return {
		cx,
		cy,
		startAngle,
		deltaAngle
	};
}
function ellipticalArcToBezier(cx, cy, rx, ry, rotation, startAngle, endAngle) {
	const alpha = Math.sin(endAngle - startAngle) * (Math.sqrt(4 + 3 * Math.tan((endAngle - startAngle) / 2) ** 2) - 1) / 3;
	const cosPhi = Math.cos(rotation);
	const sinPhi = Math.sin(rotation);
	const x1 = cx + rx * Math.cos(startAngle) * cosPhi - ry * Math.sin(startAngle) * sinPhi;
	const y1 = cy + rx * Math.cos(startAngle) * sinPhi + ry * Math.sin(startAngle) * cosPhi;
	const x2 = cx + rx * Math.cos(endAngle) * cosPhi - ry * Math.sin(endAngle) * sinPhi;
	const y2 = cy + rx * Math.cos(endAngle) * sinPhi + ry * Math.sin(endAngle) * cosPhi;
	return [
		x1 + alpha * (-rx * Math.sin(startAngle) * cosPhi - ry * Math.cos(startAngle) * sinPhi),
		y1 + alpha * (-rx * Math.sin(startAngle) * sinPhi + ry * Math.cos(startAngle) * cosPhi),
		x2 - alpha * (-rx * Math.sin(endAngle) * cosPhi - ry * Math.cos(endAngle) * sinPhi),
		y2 - alpha * (-rx * Math.sin(endAngle) * sinPhi + ry * Math.cos(endAngle) * cosPhi),
		x2,
		y2
	];
}
function drawPath(ctx, attrs, styles) {
	let paths = [];
	paths = paths.concat(attrs);
	const { lineWidth = 1, color = "currentColor" } = styles;
	ctx.lineWidth = lineWidth;
	ctx.strokeStyle = color;
	ctx.setLineDash([]);
	paths.forEach(({ x, y, path }) => {
		const commands = path.match(/[MLHVCSQTAZ][^MLHVCSQTAZ]*/gi);
		if (isValid(commands)) {
			const offsetX = x;
			const offsetY = y;
			ctx.beginPath();
			commands.forEach((command) => {
				let currentX = 0;
				let currentY = 0;
				let startX = 0;
				let startY = 0;
				const type = command[0];
				const args = command.slice(1).trim().split(/[\s,]+/).map(Number);
				switch (type) {
					case "M":
						currentX = args[0] + offsetX;
						currentY = args[1] + offsetY;
						ctx.moveTo(currentX, currentY);
						startX = currentX;
						startY = currentY;
						break;
					case "m":
						currentX += args[0];
						currentY += args[1];
						ctx.moveTo(currentX, currentY);
						startX = currentX;
						startY = currentY;
						break;
					case "L":
						currentX = args[0] + offsetX;
						currentY = args[1] + offsetY;
						ctx.lineTo(currentX, currentY);
						break;
					case "l":
						currentX += args[0];
						currentY += args[1];
						ctx.lineTo(currentX, currentY);
						break;
					case "H":
						currentX = args[0] + offsetX;
						ctx.lineTo(currentX, currentY);
						break;
					case "h":
						currentX += args[0];
						ctx.lineTo(currentX, currentY);
						break;
					case "V":
						currentY = args[0] + offsetY;
						ctx.lineTo(currentX, currentY);
						break;
					case "v":
						currentY += args[0];
						ctx.lineTo(currentX, currentY);
						break;
					case "C":
						ctx.bezierCurveTo(args[0] + offsetX, args[1] + offsetY, args[2] + offsetX, args[3] + offsetY, args[4] + offsetX, args[5] + offsetY);
						currentX = args[4] + offsetX;
						currentY = args[5] + offsetY;
						break;
					case "c":
						ctx.bezierCurveTo(currentX + args[0], currentY + args[1], currentX + args[2], currentY + args[3], currentX + args[4], currentY + args[5]);
						currentX += args[4];
						currentY += args[5];
						break;
					case "S":
						ctx.bezierCurveTo(currentX, currentY, args[0] + offsetX, args[1] + offsetY, args[2] + offsetX, args[3] + offsetY);
						currentX = args[2] + offsetX;
						currentY = args[3] + offsetY;
						break;
					case "s":
						ctx.bezierCurveTo(currentX, currentY, currentX + args[0], currentY + args[1], currentX + args[2], currentY + args[3]);
						currentX += args[2];
						currentY += args[3];
						break;
					case "Q":
						ctx.quadraticCurveTo(args[0] + offsetX, args[1] + offsetY, args[2] + offsetX, args[3] + offsetY);
						currentX = args[2] + offsetX;
						currentY = args[3] + offsetY;
						break;
					case "q":
						ctx.quadraticCurveTo(currentX + args[0], currentY + args[1], currentX + args[2], currentY + args[3]);
						currentX += args[2];
						currentY += args[3];
						break;
					case "T":
						ctx.quadraticCurveTo(currentX, currentY, args[0] + offsetX, args[1] + offsetY);
						currentX = args[0] + offsetX;
						currentY = args[1] + offsetY;
						break;
					case "t":
						ctx.quadraticCurveTo(currentX, currentY, currentX + args[0], currentY + args[1]);
						currentX += args[0];
						currentY += args[1];
						break;
					case "A":
						drawEllipticalArc(ctx, currentX, currentY, args, offsetX, offsetY, false);
						currentX = args[5] + offsetX;
						currentY = args[6] + offsetY;
						break;
					case "a":
						drawEllipticalArc(ctx, currentX, currentY, args, offsetX, offsetY, true);
						currentX += args[5];
						currentY += args[6];
						break;
					case "Z":
					case "z":
						ctx.closePath();
						currentX = startX;
						currentY = startY;
						break;
					default: break;
				}
			});
			if (styles.style === "fill") ctx.fill();
			else ctx.stroke();
		}
	});
}
var path = {
	name: "path",
	checkEventOn: checkCoordinateOnRect,
	draw: (ctx, attrs, styles) => {
		drawPath(ctx, attrs, styles);
	}
};
var figures = {};
[
	circle,
	line,
	polygon,
	rect,
	text,
	arc,
	path
].forEach((figure) => {
	figures[figure.name] = FigureImp.extend(figure);
});
function getSupportedFigures() {
	return Object.keys(figures);
}
function registerFigure(figure) {
	figures[figure.name] = FigureImp.extend(figure);
}
function getInnerFigureClass(name) {
	return figures[name] ?? null;
}
function getFigureClass(name) {
	return figures[name] ?? null;
}
var View = class extends Eventful {
	constructor(widget) {
		super();
		this._widget = widget;
	}
	getWidget() {
		return this._widget;
	}
	createFigure(create, eventHandler) {
		const FigureClazz = getInnerFigureClass(create.name);
		if (FigureClazz !== null) {
			const figure = new FigureClazz(create);
			if (isValid(eventHandler)) {
				for (const key in eventHandler) if (eventHandler.hasOwnProperty(key)) figure.registerEvent(key, eventHandler[key]);
				this.addChild(figure);
			}
			return figure;
		}
		return null;
	}
	draw(ctx) {
		this.clear();
		this.drawImp(ctx);
	}
	checkEventOn(_) {
		return true;
	}
};
var GridView = class extends View {
	drawImp(ctx) {
		const widget = this.getWidget();
		const pane = this.getWidget().getPane();
		const chart = pane.getChart();
		const bounding = widget.getBounding();
		const styles = chart.getStyles().grid;
		if (styles.show) {
			ctx.save();
			ctx.globalCompositeOperation = "destination-over";
			const horizontalStyles = styles.horizontal;
			if (horizontalStyles.show) {
				const attrs = pane.getYAxisComponentById().getTicks().map((tick) => ({ coordinates: [{
					x: 0,
					y: tick.coord
				}, {
					x: bounding.width,
					y: tick.coord
				}] }));
				this.createFigure({
					name: "line",
					attrs,
					styles: horizontalStyles
				})?.draw(ctx);
			}
			const verticalStyles = styles.vertical;
			if (verticalStyles.show) {
				const attrs = chart.getXAxisPane().getXAxisComponent().getTicks().map((tick) => ({ coordinates: [{
					x: tick.coord,
					y: 0
				}, {
					x: tick.coord,
					y: bounding.height
				}] }));
				this.createFigure({
					name: "line",
					attrs,
					styles: verticalStyles
				})?.draw(ctx);
			}
			ctx.restore();
		}
	}
};
var ChildrenView = class extends View {
	eachChildren(childCallback) {
		const chartStore = this.getWidget().getPane().getChart().getChartStore();
		const visibleRangeDataList = chartStore.getVisibleRangeDataList();
		const barSpace = chartStore.getBarSpace();
		const dataLength = visibleRangeDataList.length;
		let index = 0;
		while (index < dataLength) {
			childCallback(visibleRangeDataList[index], barSpace, index);
			++index;
		}
	}
};
var CandleBarView = class extends ChildrenView {
	constructor(..._args) {
		super(..._args);
		this._boundCandleBarClickEvent = (data) => () => {
			this.getWidget().getPane().getChart().getChartStore().executeAction("onCandleBarClick", data);
			return false;
		};
	}
	drawImp(ctx) {
		const pane = this.getWidget().getPane();
		const isMain = pane.getId() === PaneIdConstants.CANDLE;
		const chartStore = pane.getChart().getChartStore();
		const candleBarOptions = this.getCandleBarOptions();
		if (candleBarOptions !== null) {
			const { type, styles } = candleBarOptions;
			let ohlcSize = 0;
			let halfOhlcSize = 0;
			if (candleBarOptions.type === "ohlc") {
				const { gapBar } = chartStore.getBarSpace();
				ohlcSize = Math.min(Math.max(Math.round(gapBar * .2), 1), 8);
				if (ohlcSize > 2 && ohlcSize % 2 === 1) ohlcSize--;
				halfOhlcSize = Math.floor(ohlcSize / 2);
			}
			const yAxis = pane.getYAxisComponentById(candleBarOptions.yAxisId);
			this.eachChildren((visibleData, barSpace) => {
				const { x, data: { current, prev } } = visibleData;
				if (isValid(current)) {
					const { open, high, low, close } = current;
					const comparePrice = styles.compareRule === "current_open" ? open : prev?.close ?? close;
					const colors = [];
					if (close > comparePrice) {
						colors[0] = styles.upColor;
						colors[1] = styles.upBorderColor;
						colors[2] = styles.upWickColor;
					} else if (close < comparePrice) {
						colors[0] = styles.downColor;
						colors[1] = styles.downBorderColor;
						colors[2] = styles.downWickColor;
					} else {
						colors[0] = styles.noChangeColor;
						colors[1] = styles.noChangeBorderColor;
						colors[2] = styles.noChangeWickColor;
					}
					const openY = yAxis.convertToPixel(open);
					const closeY = yAxis.convertToPixel(close);
					const priceY = [
						openY,
						closeY,
						yAxis.convertToPixel(high),
						yAxis.convertToPixel(low)
					];
					priceY.sort((a, b) => a - b);
					const correction = barSpace.gapBar % 2 === 0 ? 1 : 0;
					let rects = [];
					switch (type) {
						case "candle_solid":
							rects = this._createSolidBar(x, priceY, barSpace, colors, correction);
							break;
						case "candle_stroke":
							rects = this._createStrokeBar(x, priceY, barSpace, colors, correction);
							break;
						case "candle_up_stroke":
							if (close > open) rects = this._createStrokeBar(x, priceY, barSpace, colors, correction);
							else rects = this._createSolidBar(x, priceY, barSpace, colors, correction);
							break;
						case "candle_down_stroke":
							if (open > close) rects = this._createStrokeBar(x, priceY, barSpace, colors, correction);
							else rects = this._createSolidBar(x, priceY, barSpace, colors, correction);
							break;
						case "ohlc":
							rects = [{
								name: "rect",
								attrs: [
									{
										x: x - halfOhlcSize,
										y: priceY[0],
										width: ohlcSize,
										height: priceY[3] - priceY[0]
									},
									{
										x: x - barSpace.halfGapBar,
										y: openY + ohlcSize > priceY[3] ? priceY[3] - ohlcSize : openY,
										width: barSpace.halfGapBar - halfOhlcSize,
										height: ohlcSize
									},
									{
										x: x + halfOhlcSize,
										y: closeY + ohlcSize > priceY[3] ? priceY[3] - ohlcSize : closeY,
										width: barSpace.halfGapBar - halfOhlcSize,
										height: ohlcSize
									}
								],
								styles: { color: colors[0] }
							}];
							break;
					}
					rects.forEach((rect) => {
						let handler = null;
						if (isMain) handler = { mouseClickEvent: this._boundCandleBarClickEvent(visibleData) };
						this.createFigure(rect, handler ?? void 0)?.draw(ctx);
					});
				}
			});
		}
	}
	getCandleBarOptions() {
		const candleStyles = this.getWidget().getPane().getChart().getStyles().candle;
		return {
			yAxisId: DEFAULT_AXIS_ID,
			type: candleStyles.type,
			styles: candleStyles.bar
		};
	}
	_createSolidBar(x, priceY, barSpace, colors, correction) {
		return [{
			name: "rect",
			attrs: {
				x,
				y: priceY[0],
				width: 1,
				height: priceY[3] - priceY[0]
			},
			styles: { color: colors[2] }
		}, {
			name: "rect",
			attrs: {
				x: x - barSpace.halfGapBar,
				y: priceY[1],
				width: barSpace.gapBar + correction,
				height: Math.max(1, priceY[2] - priceY[1])
			},
			styles: {
				style: "stroke_fill",
				color: colors[0],
				borderColor: colors[1]
			}
		}];
	}
	_createStrokeBar(x, priceY, barSpace, colors, correction) {
		return [{
			name: "rect",
			attrs: [{
				x,
				y: priceY[0],
				width: 1,
				height: priceY[1] - priceY[0]
			}, {
				x,
				y: priceY[2],
				width: 1,
				height: priceY[3] - priceY[2]
			}],
			styles: { color: colors[2] }
		}, {
			name: "rect",
			attrs: {
				x: x - barSpace.halfGapBar,
				y: priceY[1],
				width: barSpace.gapBar + correction,
				height: Math.max(1, priceY[2] - priceY[1])
			},
			styles: {
				style: "stroke",
				borderColor: colors[1]
			}
		}];
	}
};
var IndicatorView = class extends CandleBarView {
	getCandleBarOptions() {
		const pane = this.getWidget().getPane();
		const chartStore = pane.getChart().getChartStore();
		const indicators = chartStore.getIndicatorsByPaneId(pane.getId());
		for (const indicator of indicators) {
			const yAxis = pane.getYAxisComponentById(indicator.yAxisId);
			if (indicator.shouldOhlc && indicator.visible && !yAxis.isInCandle()) {
				const indicatorStyles = indicator.styles;
				const defaultStyles = chartStore.getStyles().indicator;
				const compareRule = formatValue(indicatorStyles, "ohlc.compareRule", defaultStyles.ohlc.compareRule);
				const upColor = formatValue(indicatorStyles, "ohlc.upColor", defaultStyles.ohlc.upColor);
				const downColor = formatValue(indicatorStyles, "ohlc.downColor", defaultStyles.ohlc.downColor);
				const noChangeColor = formatValue(indicatorStyles, "ohlc.noChangeColor", defaultStyles.ohlc.noChangeColor);
				return {
					yAxisId: indicator.yAxisId,
					type: "ohlc",
					styles: {
						compareRule,
						upColor,
						downColor,
						noChangeColor,
						upBorderColor: upColor,
						downBorderColor: downColor,
						noChangeBorderColor: noChangeColor,
						upWickColor: upColor,
						downWickColor: downColor,
						noChangeWickColor: noChangeColor
					}
				};
			}
		}
		return null;
	}
	drawImp(ctx) {
		super.drawImp(ctx);
		const widget = this.getWidget();
		const pane = widget.getPane();
		const chart = pane.getChart();
		const bounding = widget.getBounding();
		const xAxis = chart.getXAxisPane().getXAxisComponent();
		const chartStore = chart.getChartStore();
		const indicators = chartStore.getIndicatorsByPaneId(pane.getId());
		const defaultStyles = chartStore.getStyles().indicator;
		ctx.save();
		indicators.forEach((indicator) => {
			const yAxis = pane.getYAxisComponentById(indicator.yAxisId);
			if (indicator.visible) {
				if (indicator.zLevel < 0) ctx.globalCompositeOperation = "destination-over";
				else ctx.globalCompositeOperation = "source-over";
				let isCover = false;
				if (indicator.draw !== null) {
					ctx.save();
					isCover = indicator.draw({
						ctx,
						chart,
						indicator,
						bounding,
						xAxis,
						yAxis
					});
					ctx.restore();
				}
				if (!isCover) {
					const result = indicator.result;
					const lines = [];
					this.eachChildren((data, barSpace) => {
						const { halfGapBar } = barSpace;
						const { dataIndex, x } = data;
						const prevX = xAxis.convertToPixel(dataIndex - 1);
						const nextX = xAxis.convertToPixel(dataIndex + 1);
						const prevData = result[dataIndex - 1] ?? null;
						const currentData = result[dataIndex] ?? null;
						const nextData = result[dataIndex + 1] ?? null;
						const prevCoordinate = { x: prevX };
						const currentCoordinate = { x };
						const nextCoordinate = { x: nextX };
						indicator.figures.forEach(({ key }) => {
							const prevValue = prevData?.[key];
							if (isNumber(prevValue)) prevCoordinate[key] = yAxis.convertToPixel(prevValue);
							const currentValue = currentData?.[key];
							if (isNumber(currentValue)) currentCoordinate[key] = yAxis.convertToPixel(currentValue);
							const nextValue = nextData?.[key];
							if (isNumber(nextValue)) nextCoordinate[key] = yAxis.convertToPixel(nextValue);
						});
						eachFigures(indicator, dataIndex, barSpace, defaultStyles, (figure, figureStyles, figureIndex) => {
							if (isValid(currentData?.[figure.key])) {
								const valueY = currentCoordinate[figure.key];
								let attrs = figure.attrs?.({
									data: {
										prev: prevData,
										current: currentData,
										next: nextData
									},
									coordinate: {
										prev: prevCoordinate,
										current: currentCoordinate,
										next: nextCoordinate
									},
									bounding,
									barSpace,
									xAxis,
									yAxis
								});
								switch (figure.type) {
									case "text":
										attrs = {
											x,
											y: valueY,
											text: currentData?.[figure.key],
											align: "center",
											baseline: "middle",
											...attrs
										};
										break;
									case "circle":
										attrs = {
											x,
											y: valueY,
											r: Math.max(1, halfGapBar),
											...attrs
										};
										break;
									case "rect":
									case "bar": {
										const baseValue = figure.baseValue ?? yAxis.getRange().from;
										const baseValueY = yAxis.convertToPixel(baseValue);
										let height = Math.abs(baseValueY - valueY);
										if (baseValue !== currentData?.[figure.key]) height = Math.max(1, height);
										let y = 0;
										if (valueY > baseValueY) y = baseValueY;
										else y = valueY;
										const barWidth = attrs?.width ?? halfGapBar * 2;
										attrs = {
											x: x - barWidth / 2,
											y,
											width: Math.max(1, barWidth),
											height,
											...attrs
										};
										break;
									}
									case "line":
										if (!isValid(lines[figureIndex])) lines[figureIndex] = [];
										if (isNumber(currentCoordinate[figure.key]) && isNumber(nextCoordinate[figure.key])) lines[figureIndex].push({
											coordinates: attrs?.coordinates ?? [{
												x: currentCoordinate.x,
												y: currentCoordinate[figure.key]
											}, {
												x: nextCoordinate.x,
												y: nextCoordinate[figure.key]
											}],
											styles: figureStyles
										});
										break;
									default: break;
								}
								const type = figure.type;
								if (isValid(attrs) && type !== "line") this.createFigure({
									name: type === "bar" ? "rect" : type,
									attrs,
									styles: figureStyles
								})?.draw(ctx);
							}
						});
					});
					lines.forEach((items) => {
						if (items.length > 1) {
							const mergeLines = [{
								coordinates: [items[0].coordinates[0], items[0].coordinates[1]],
								styles: items[0].styles
							}];
							for (let i = 1; i < items.length; i++) {
								const lastMergeLine = mergeLines[mergeLines.length - 1];
								const current = items[i];
								const lastMergeLineLastCoordinate = lastMergeLine.coordinates[lastMergeLine.coordinates.length - 1];
								if (lastMergeLineLastCoordinate.x === current.coordinates[0].x && lastMergeLineLastCoordinate.y === current.coordinates[0].y && lastMergeLine.styles.style === current.styles.style && lastMergeLine.styles.color === current.styles.color && lastMergeLine.styles.size === current.styles.size && lastMergeLine.styles.smooth === current.styles.smooth && lastMergeLine.styles.dashedValue?.[0] === current.styles.dashedValue?.[0] && lastMergeLine.styles.dashedValue?.[1] === current.styles.dashedValue?.[1]) lastMergeLine.coordinates.push(current.coordinates[1]);
								else mergeLines.push({
									coordinates: [current.coordinates[0], current.coordinates[1]],
									styles: current.styles
								});
							}
							mergeLines.forEach(({ coordinates, styles }) => {
								this.createFigure({
									name: "line",
									attrs: { coordinates },
									styles
								})?.draw(ctx);
							});
						}
					});
				}
			}
		});
		ctx.restore();
	}
};
var CrosshairLineView = class extends View {
	drawImp(ctx) {
		const widget = this.getWidget();
		const pane = widget.getPane();
		const bounding = widget.getBounding();
		const chartStore = widget.getPane().getChart().getChartStore();
		const crosshair = chartStore.getCrosshair();
		const styles = chartStore.getStyles().crosshair;
		if (isString(crosshair.paneId) && styles.show) {
			if (crosshair.paneId === pane.getId()) {
				const y = crosshair.y;
				this._drawLine(ctx, [{
					x: 0,
					y
				}, {
					x: bounding.width,
					y
				}], styles.horizontal);
			}
			const x = crosshair.realX;
			this._drawLine(ctx, [{
				x,
				y: 0
			}, {
				x,
				y: bounding.height
			}], styles.vertical);
		}
	}
	_drawLine(ctx, coordinates, styles) {
		if (styles.show) {
			const lineStyles = styles.line;
			if (lineStyles.show) this.createFigure({
				name: "line",
				attrs: { coordinates },
				styles: lineStyles
			})?.draw(ctx);
		}
	}
};
var IndicatorTooltipView = class extends View {
	constructor(widget) {
		super(widget);
		this._activeFeatureInfo = null;
		this._featureClickEvent = (type, featureInfo) => () => {
			this.getWidget().getPane().getChart().getChartStore().executeAction(type, featureInfo);
			return true;
		};
		this._featureMouseMoveEvent = (featureInfo) => () => {
			this._activeFeatureInfo = featureInfo;
			return true;
		};
		this.registerEvent("mouseMoveEvent", (_) => {
			this._activeFeatureInfo = null;
			return false;
		});
	}
	drawImp(ctx) {
		const widget = this.getWidget();
		const chartStore = widget.getPane().getChart().getChartStore();
		if (isValid(chartStore.getCrosshair().kLineData)) {
			const bounding = widget.getBounding();
			const { offsetLeft, offsetTop, offsetRight } = chartStore.getStyles().indicator.tooltip;
			this.drawIndicatorTooltip(ctx, offsetLeft, offsetTop, bounding.width - offsetRight);
		}
	}
	drawIndicatorTooltip(ctx, left, top, maxWidth) {
		const pane = this.getWidget().getPane();
		const chartStore = pane.getChart().getChartStore();
		const tooltipStyles = chartStore.getStyles().indicator.tooltip;
		if (this.isDrawTooltip(chartStore.getCrosshair(), tooltipStyles)) {
			const indicators = chartStore.getIndicatorsByPaneId(pane.getId());
			const tooltipTitleStyles = tooltipStyles.title;
			const tooltipLegendStyles = tooltipStyles.legend;
			indicators.forEach((indicator) => {
				let prevRowHeight = 0;
				const coordinate = {
					x: left,
					y: top
				};
				const { name, calcParamsText, legends, features: featuresStyles } = this.getIndicatorTooltipData(indicator);
				const nameValid = name.length > 0;
				const legendValid = legends.length > 0;
				if (nameValid || legendValid) {
					const features = this.classifyTooltipFeatures(featuresStyles);
					prevRowHeight = this.drawStandardTooltipFeatures(ctx, features[0], coordinate, indicator, left, prevRowHeight, maxWidth);
					if (nameValid) {
						let text = name;
						if (calcParamsText.length > 0) text = `${text}${calcParamsText}`;
						const color = tooltipTitleStyles.color;
						prevRowHeight = this.drawStandardTooltipLegends(ctx, [{
							title: {
								text: "",
								color
							},
							value: {
								text,
								color
							}
						}], coordinate, left, prevRowHeight, maxWidth, tooltipTitleStyles);
					}
					prevRowHeight = this.drawStandardTooltipFeatures(ctx, features[1], coordinate, indicator, left, prevRowHeight, maxWidth);
					if (legendValid) prevRowHeight = this.drawStandardTooltipLegends(ctx, legends, coordinate, left, prevRowHeight, maxWidth, tooltipLegendStyles);
					prevRowHeight = this.drawStandardTooltipFeatures(ctx, features[2], coordinate, indicator, left, prevRowHeight, maxWidth);
					top = coordinate.y + prevRowHeight;
				}
			});
		}
		return top;
	}
	drawStandardTooltipFeatures(ctx, features, coordinate, indicator, left, prevRowHeight, maxWidth) {
		if (features.length > 0) {
			let width = 0;
			let height = 0;
			features.forEach((feature) => {
				const { marginLeft = 0, marginTop = 0, marginRight = 0, marginBottom = 0, paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0, size = 0, type, content } = feature;
				let contentWidth = 0;
				if (type === "icon_font") {
					const iconFont = content;
					ctx.font = createFont(size, "normal", iconFont.family);
					contentWidth = ctx.measureText(iconFont.code).width;
				} else contentWidth = size;
				width += marginLeft + paddingLeft + contentWidth + paddingRight + marginRight;
				height = Math.max(height, marginTop + paddingTop + size + paddingBottom + marginBottom);
			});
			if (coordinate.x + width > maxWidth) {
				coordinate.x = left;
				coordinate.y += prevRowHeight;
				prevRowHeight = height;
			} else prevRowHeight = Math.max(prevRowHeight, height);
			const paneId = this.getWidget().getPane().getId();
			features.forEach((feature) => {
				const { marginLeft = 0, marginTop = 0, marginRight = 0, paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0, backgroundColor, activeBackgroundColor, borderRadius, size = 0, color, activeColor, type, content } = feature;
				let finalColor = color;
				let finalBackgroundColor = backgroundColor;
				if (this._activeFeatureInfo?.paneId === paneId && this._activeFeatureInfo.indicator?.id === indicator?.id && this._activeFeatureInfo.feature.id === feature.id) {
					finalColor = activeColor ?? color;
					finalBackgroundColor = activeBackgroundColor ?? backgroundColor;
				}
				let actionType = "onCandleTooltipFeatureClick";
				const featureInfo = {
					paneId,
					feature
				};
				if (isValid(indicator)) {
					actionType = "onIndicatorTooltipFeatureClick";
					featureInfo.indicator = indicator;
				}
				const eventHandler = {
					mouseDownEvent: this._featureClickEvent(actionType, featureInfo),
					mouseMoveEvent: this._featureMouseMoveEvent(featureInfo)
				};
				let contentWidth = 0;
				if (type === "icon_font") {
					const iconFont = content;
					this.createFigure({
						name: "text",
						attrs: {
							text: iconFont.code,
							x: coordinate.x + marginLeft,
							y: coordinate.y + marginTop
						},
						styles: {
							paddingLeft,
							paddingTop,
							paddingRight,
							paddingBottom,
							borderRadius,
							size,
							family: iconFont.family,
							color: finalColor,
							backgroundColor: finalBackgroundColor
						}
					}, eventHandler)?.draw(ctx);
					contentWidth = ctx.measureText(iconFont.code).width;
				} else {
					this.createFigure({
						name: "rect",
						attrs: {
							x: coordinate.x + marginLeft,
							y: coordinate.y + marginTop,
							width: size,
							height: size
						},
						styles: {
							paddingLeft,
							paddingTop,
							paddingRight,
							paddingBottom,
							color: finalBackgroundColor
						}
					}, eventHandler)?.draw(ctx);
					const path = content;
					this.createFigure({
						name: "path",
						attrs: {
							path: path.path,
							x: coordinate.x + marginLeft + paddingLeft,
							y: coordinate.y + marginTop + paddingTop,
							width: size,
							height: size
						},
						styles: {
							style: path.style,
							lineWidth: path.lineWidth,
							color: finalColor
						}
					})?.draw(ctx);
					contentWidth = size;
				}
				coordinate.x += marginLeft + paddingLeft + contentWidth + paddingRight + marginRight;
			});
		}
		return prevRowHeight;
	}
	drawStandardTooltipLegends(ctx, legends, coordinate, left, prevRowHeight, maxWidth, styles) {
		if (legends.length > 0) {
			const { marginLeft, marginTop, marginRight, marginBottom, size, family, weight } = styles;
			ctx.font = createFont(size, weight, family);
			legends.forEach((data) => {
				const title = data.title;
				const value = data.value;
				const titleTextWidth = ctx.measureText(title.text).width;
				const totalTextWidth = titleTextWidth + ctx.measureText(value.text).width;
				const h = marginTop + size + marginBottom;
				if (coordinate.x + marginLeft + totalTextWidth + marginRight > maxWidth) {
					coordinate.x = left;
					coordinate.y += prevRowHeight;
					prevRowHeight = h;
				} else prevRowHeight = Math.max(prevRowHeight, h);
				if (title.text.length > 0) this.createFigure({
					name: "text",
					attrs: {
						x: coordinate.x + marginLeft,
						y: coordinate.y + marginTop,
						text: title.text
					},
					styles: {
						color: title.color,
						size,
						family,
						weight
					}
				})?.draw(ctx);
				this.createFigure({
					name: "text",
					attrs: {
						x: coordinate.x + marginLeft + titleTextWidth,
						y: coordinate.y + marginTop,
						text: value.text
					},
					styles: {
						color: value.color,
						size,
						family,
						weight
					}
				})?.draw(ctx);
				coordinate.x += marginLeft + totalTextWidth + marginRight;
			});
		}
		return prevRowHeight;
	}
	isDrawTooltip(crosshair, styles) {
		const showRule = styles.showRule;
		return showRule === "always" || showRule === "follow_cross" && isString(crosshair.paneId);
	}
	getIndicatorTooltipData(indicator) {
		const chartStore = this.getWidget().getPane().getChart().getChartStore();
		const styles = chartStore.getStyles().indicator;
		const tooltipStyles = styles.tooltip;
		const tooltipTitleStyles = tooltipStyles.title;
		let name = "";
		let calcParamsText = "";
		if (tooltipTitleStyles.show) {
			if (tooltipTitleStyles.showName) name = indicator.shortName;
			if (tooltipTitleStyles.showParams) {
				const calcParams = indicator.calcParams;
				if (calcParams.length > 0) calcParamsText = `(${calcParams.join(",")})`;
			}
		}
		const tooltipData = {
			name,
			calcParamsText,
			legends: [],
			features: tooltipStyles.features
		};
		const dataIndex = chartStore.getCrosshair().dataIndex;
		const result = indicator.result;
		const formatter = chartStore.getInnerFormatter();
		const decimalFold = chartStore.getDecimalFold();
		const thousandsSeparator = chartStore.getThousandsSeparator();
		const legends = [];
		if (indicator.visible) {
			const barSpace = chartStore.getBarSpace();
			const data = result[dataIndex] ?? {};
			const defaultValue = tooltipStyles.legend.defaultValue;
			eachFigures(indicator, dataIndex, barSpace, styles, (figure, figureStyles) => {
				if (isString(figure.title)) {
					const color = figureStyles.color;
					let value = data[figure.key];
					if (isNumber(value)) {
						value = formatPrecision(value, indicator.precision);
						if (indicator.shouldFormatBigNumber) value = formatter.formatBigNumber(value);
						value = decimalFold.format(thousandsSeparator.format(value));
					}
					legends.push({
						title: {
							text: figure.title,
							color
						},
						value: {
							text: value ?? defaultValue,
							color
						}
					});
				}
			});
			tooltipData.legends = legends;
		}
		if (isFunction(indicator.createTooltipDataSource)) {
			const widget = this.getWidget();
			const pane = widget.getPane();
			const chart = pane.getChart();
			const { name: customName, calcParamsText: customCalcParamsText, legends: customLegends, features: customFeatures } = indicator.createTooltipDataSource({
				chart,
				indicator,
				crosshair: chartStore.getCrosshair(),
				bounding: widget.getBounding(),
				xAxis: pane.getChart().getXAxisPane().getXAxisComponent(),
				yAxis: pane.getYAxisComponentById(indicator.yAxisId)
			});
			if (tooltipTitleStyles.show) {
				if (isString(customName) && tooltipTitleStyles.showName) tooltipData.name = customName;
				if (isString(customCalcParamsText) && tooltipTitleStyles.showParams) tooltipData.calcParamsText = customCalcParamsText;
			}
			if (isValid(customFeatures)) tooltipData.features = customFeatures;
			if (isValid(customLegends) && indicator.visible) {
				const optimizedLegends = [];
				const color = styles.tooltip.legend.color;
				customLegends.forEach((data) => {
					let title = {
						text: "",
						color
					};
					if (isObject(data.title)) title = data.title;
					else title.text = data.title;
					let value = {
						text: "",
						color
					};
					if (isObject(data.value)) value = data.value;
					else value.text = data.value;
					if (isNumber(Number(value.text))) value.text = decimalFold.format(thousandsSeparator.format(value.text));
					optimizedLegends.push({
						title,
						value
					});
				});
				tooltipData.legends = optimizedLegends;
			}
		}
		return tooltipData;
	}
	classifyTooltipFeatures(features) {
		const leftFeatures = [];
		const middleFeatures = [];
		const rightFeatures = [];
		features.forEach((feature) => {
			switch (feature.position) {
				case "left":
					leftFeatures.push(feature);
					break;
				case "middle":
					middleFeatures.push(feature);
					break;
				case "right":
					rightFeatures.push(feature);
					break;
			}
		});
		return [
			leftFeatures,
			middleFeatures,
			rightFeatures
		];
	}
};
var OverlayView = class extends View {
	constructor(widget) {
		super(widget);
		this._initEvent();
	}
	_initEvent() {
		const widget = this.getWidget();
		const pane = widget.getPane();
		const paneId = pane.getId();
		const chart = pane.getChart();
		const chartStore = chart.getChartStore();
		this.registerEvent("mouseMoveEvent", (event) => {
			const progressOverlayInfo = chartStore.getProgressOverlayInfo();
			if (progressOverlayInfo !== null) {
				const overlay = progressOverlayInfo.overlay;
				let progressOverlayPaneId = progressOverlayInfo.paneId;
				if (overlay.isStart()) {
					chartStore.updateProgressOverlayInfo(paneId);
					progressOverlayPaneId = paneId;
				}
				const index = overlay.points.length - 1;
				if (overlay.isDrawing() && progressOverlayPaneId === paneId) {
					overlay.eventMoveForDrawing(this._coordinateToPoint(overlay, event));
					overlay.onDrawing?.({
						chart,
						overlay,
						...event
					});
				}
				return this._figureMouseMoveEvent(overlay, "point", index, {
					key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`,
					type: "circle",
					attrs: {}
				})(event);
			}
			chartStore.setHoverOverlayInfo({
				paneId,
				overlay: null,
				figureType: "none",
				figureIndex: -1,
				figure: null
			}, (o, f) => this._processOverlayMouseEnterEvent(o, f, event), (o, f) => this._processOverlayMouseLeaveEvent(o, f, event));
			widget.setForceCursor(null);
			return false;
		}).registerEvent("mouseClickEvent", (event) => {
			const progressOverlayInfo = chartStore.getProgressOverlayInfo();
			if (progressOverlayInfo !== null) {
				const overlay = progressOverlayInfo.overlay;
				let progressOverlayPaneId = progressOverlayInfo.paneId;
				if (overlay.isStart()) {
					chartStore.updateProgressOverlayInfo(paneId, true);
					progressOverlayPaneId = paneId;
				}
				const index = overlay.points.length - 1;
				if (overlay.isDrawing() && progressOverlayPaneId === paneId) {
					overlay.eventMoveForDrawing(this._coordinateToPoint(overlay, event));
					overlay.onDrawing?.({
						chart,
						overlay,
						...event
					});
					overlay.nextStep();
					if (!overlay.isDrawing()) {
						chartStore.progressOverlayComplete();
						overlay.onDrawEnd?.({
							chart,
							overlay,
							...event
						});
					}
				}
				return this._figureMouseClickEvent(overlay, "point", index, {
					key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`,
					type: "circle",
					attrs: {}
				})(event);
			}
			chartStore.setClickOverlayInfo({
				paneId,
				overlay: null,
				figureType: "none",
				figureIndex: -1,
				figure: null
			}, (o, f) => this._processOverlaySelectedEvent(o, f, event), (o, f) => this._processOverlayDeselectedEvent(o, f, event));
			return false;
		}).registerEvent("mouseDoubleClickEvent", (event) => {
			const progressOverlayInfo = chartStore.getProgressOverlayInfo();
			if (progressOverlayInfo !== null) {
				const overlay = progressOverlayInfo.overlay;
				const progressOverlayPaneId = progressOverlayInfo.paneId;
				if (overlay.isDrawing() && progressOverlayPaneId === paneId) {
					overlay.forceComplete();
					if (!overlay.isDrawing()) {
						chartStore.progressOverlayComplete();
						overlay.onDrawEnd?.({
							chart,
							overlay,
							...event
						});
					}
				}
				const index = overlay.points.length - 1;
				return this._figureMouseClickEvent(overlay, "point", index, {
					key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`,
					type: "circle",
					attrs: {}
				})(event);
			}
			return false;
		}).registerEvent("mouseRightClickEvent", (event) => {
			const progressOverlayInfo = chartStore.getProgressOverlayInfo();
			if (progressOverlayInfo !== null) {
				const overlay = progressOverlayInfo.overlay;
				if (overlay.isDrawing()) {
					const index = overlay.points.length - 1;
					return this._figureMouseRightClickEvent(overlay, "point", index, {
						key: `${OVERLAY_FIGURE_KEY_PREFIX}point_${index}`,
						type: "circle",
						attrs: {}
					})(event);
				}
			}
			return false;
		}).registerEvent("mouseUpEvent", (event) => {
			const { overlay, figure } = chartStore.getPressedOverlayInfo();
			if (overlay !== null) {
				if (checkOverlayFigureEvent("onPressedMoveEnd", figure)) overlay.onPressedMoveEnd?.({
					chart,
					overlay,
					figure: figure ?? void 0,
					...event
				});
			}
			chartStore.setPressedOverlayInfo({
				paneId,
				overlay: null,
				figureType: "none",
				figureIndex: -1,
				figure: null
			});
			return false;
		}).registerEvent("pressedMouseMoveEvent", (event) => {
			const { overlay, figureType, figureIndex, figure } = chartStore.getPressedOverlayInfo();
			if (overlay !== null) {
				if (checkOverlayFigureEvent("onPressedMoving", figure)) {
					if (!overlay.lock) {
						const point = this._coordinateToPoint(overlay, event);
						if (figureType === "point") overlay.eventPressedPointMove(point, figureIndex);
						else overlay.eventPressedOtherMove(point, this.getWidget().getPane().getChart().getChartStore());
						let prevented = false;
						overlay.onPressedMoving?.({
							chart,
							overlay,
							figure: figure ?? void 0,
							...event,
							preventDefault: () => {
								prevented = true;
							}
						});
						if (prevented) this.getWidget().setForceCursor(null);
						else this.getWidget().setForceCursor("pointer");
					}
					return true;
				}
			}
			this.getWidget().setForceCursor(null);
			return false;
		});
	}
	_createFigureEvents(overlay, figureType, figureIndex, figure) {
		if (overlay.isDrawing()) return null;
		return {
			mouseMoveEvent: this._figureMouseMoveEvent(overlay, figureType, figureIndex, figure),
			mouseDownEvent: this._figureMouseDownEvent(overlay, figureType, figureIndex, figure),
			mouseClickEvent: this._figureMouseClickEvent(overlay, figureType, figureIndex, figure),
			mouseRightClickEvent: this._figureMouseRightClickEvent(overlay, figureType, figureIndex, figure),
			mouseDoubleClickEvent: this._figureMouseDoubleClickEvent(overlay, figureType, figureIndex, figure)
		};
	}
	_processOverlayMouseEnterEvent(overlay, figure, event) {
		if (isFunction(overlay.onMouseEnter) && checkOverlayFigureEvent("onMouseEnter", figure)) {
			overlay.onMouseEnter({
				chart: this.getWidget().getPane().getChart(),
				overlay,
				figure: figure ?? void 0,
				...event
			});
			return true;
		}
		return false;
	}
	_processOverlayMouseLeaveEvent(overlay, figure, event) {
		if (isFunction(overlay.onMouseLeave) && checkOverlayFigureEvent("onMouseLeave", figure)) {
			overlay.onMouseLeave({
				chart: this.getWidget().getPane().getChart(),
				overlay,
				figure: figure ?? void 0,
				...event
			});
			return true;
		}
		return false;
	}
	_processOverlaySelectedEvent(overlay, figure, event) {
		if (checkOverlayFigureEvent("onSelected", figure)) {
			overlay.onSelected?.({
				chart: this.getWidget().getPane().getChart(),
				overlay,
				figure: figure ?? void 0,
				...event
			});
			return true;
		}
		return false;
	}
	_processOverlayDeselectedEvent(overlay, figure, event) {
		if (checkOverlayFigureEvent("onDeselected", figure)) {
			overlay.onDeselected?.({
				chart: this.getWidget().getPane().getChart(),
				overlay,
				figure: figure ?? void 0,
				...event
			});
			return true;
		}
		return false;
	}
	_figureMouseMoveEvent(overlay, figureType, figureIndex, figure) {
		return (event) => {
			const pane = this.getWidget().getPane();
			const check = !overlay.isDrawing() && checkOverlayFigureEvent("onMouseMove", figure);
			if (check) {
				let prevented = false;
				overlay.onMouseMove?.({
					chart: pane.getChart(),
					overlay,
					figure,
					...event,
					preventDefault: () => {
						prevented = true;
					}
				});
				if (prevented) this.getWidget().setForceCursor(null);
				else this.getWidget().setForceCursor("pointer");
			}
			pane.getChart().getChartStore().setHoverOverlayInfo({
				paneId: pane.getId(),
				overlay,
				figureType,
				figure,
				figureIndex
			}, (o, f) => this._processOverlayMouseEnterEvent(o, f, event), (o, f) => this._processOverlayMouseLeaveEvent(o, f, event));
			return check;
		};
	}
	_figureMouseDownEvent(overlay, figureType, figureIndex, figure) {
		return (event) => {
			const pane = this.getWidget().getPane();
			const paneId = pane.getId();
			overlay.startPressedMove(this._coordinateToPoint(overlay, event));
			if (checkOverlayFigureEvent("onPressedMoveStart", figure)) {
				overlay.onPressedMoveStart?.({
					chart: pane.getChart(),
					overlay,
					figure,
					...event
				});
				pane.getChart().getChartStore().setPressedOverlayInfo({
					paneId,
					overlay,
					figureType,
					figureIndex,
					figure
				});
				return !overlay.isDrawing();
			}
			return false;
		};
	}
	_figureMouseClickEvent(overlay, figureType, figureIndex, figure) {
		return (event) => {
			const pane = this.getWidget().getPane();
			const paneId = pane.getId();
			const check = !overlay.isDrawing() && checkOverlayFigureEvent("onClick", figure);
			if (check) overlay.onClick?.({
				chart: this.getWidget().getPane().getChart(),
				overlay,
				figure,
				...event
			});
			pane.getChart().getChartStore().setClickOverlayInfo({
				paneId,
				overlay,
				figureType,
				figureIndex,
				figure
			}, (o, f) => this._processOverlaySelectedEvent(o, f, event), (o, f) => this._processOverlayDeselectedEvent(o, f, event));
			return check;
		};
	}
	_figureMouseDoubleClickEvent(overlay, _figureType, _figureIndex, figure) {
		return (event) => {
			if (checkOverlayFigureEvent("onDoubleClick", figure)) {
				overlay.onDoubleClick?.({
					...event,
					chart: this.getWidget().getPane().getChart(),
					figure,
					overlay
				});
				return !overlay.isDrawing();
			}
			return false;
		};
	}
	_figureMouseRightClickEvent(overlay, _figureType, _figureIndex, figure) {
		return (event) => {
			if (checkOverlayFigureEvent("onRightClick", figure)) {
				let prevented = false;
				overlay.onRightClick?.({
					chart: this.getWidget().getPane().getChart(),
					overlay,
					figure,
					...event,
					preventDefault: () => {
						prevented = true;
					}
				});
				if (!prevented) this.getWidget().getPane().getChart().getChartStore().removeOverlay(overlay);
				return !overlay.isDrawing();
			}
			return false;
		};
	}
	_coordinateToPoint(o, coordinate) {
		const point = {};
		const pane = this.getWidget().getPane();
		const chart = pane.getChart();
		const paneId = pane.getId();
		const chartStore = chart.getChartStore();
		if (this.coordinateToPointTimestampDataIndexFlag()) {
			const dataIndex = chart.getXAxisPane().getXAxisComponent().convertFromPixel(coordinate.x);
			point.timestamp = chartStore.dataIndexToTimestamp(dataIndex) ?? void 0;
			point.dataIndex = dataIndex;
		}
		if (this.coordinateToPointValueFlag()) {
			const yAxis = pane.getYAxisComponentById();
			let value = yAxis.convertFromPixel(coordinate.y);
			if (o.mode !== "normal" && paneId === PaneIdConstants.CANDLE && isNumber(point.dataIndex)) {
				const kLineData = chartStore.getDataByDataIndex(point.dataIndex);
				if (kLineData !== null) {
					const modeSensitivity = o.modeSensitivity;
					if (value > kLineData.high) if (o.mode === "weak_magnet") {
						const highY = yAxis.convertToPixel(kLineData.high);
						const buffValue = yAxis.convertFromPixel(highY - modeSensitivity);
						if (value < buffValue) value = kLineData.high;
					} else value = kLineData.high;
					else if (value < kLineData.low) if (o.mode === "weak_magnet") {
						const lowY = yAxis.convertToPixel(kLineData.low);
						const buffValue = yAxis.convertFromPixel(lowY - modeSensitivity);
						if (value > buffValue) value = kLineData.low;
					} else value = kLineData.low;
					else {
						const max = Math.max(kLineData.open, kLineData.close);
						const min = Math.min(kLineData.open, kLineData.close);
						if (value > max) if (value - max < kLineData.high - value) value = max;
						else value = kLineData.high;
						else if (value < min) if (value - kLineData.low < min - value) value = kLineData.low;
						else value = min;
						else if (max - value < value - min) value = max;
						else value = min;
					}
				}
			}
			point.value = value;
		}
		return point;
	}
	coordinateToPointValueFlag() {
		return true;
	}
	coordinateToPointTimestampDataIndexFlag() {
		return true;
	}
	dispatchEvent(name, event) {
		if (this.getWidget().getPane().getChart().getChartStore().isOverlayDrawing()) return this.onEvent(name, event);
		return super.dispatchEvent(name, event);
	}
	drawImp(ctx) {
		this.getCompleteOverlays().forEach((overlay) => {
			if (overlay.visible) this._drawOverlay(ctx, overlay);
		});
		const progressOverlay = this.getProgressOverlay();
		if (isValid(progressOverlay) && progressOverlay.visible) this._drawOverlay(ctx, progressOverlay);
	}
	_drawOverlay(ctx, overlay) {
		const { points } = overlay;
		const pane = this.getWidget().getPane();
		const chart = pane.getChart();
		const chartStore = chart.getChartStore();
		const yAxis = pane.getYAxisComponentById();
		const xAxis = chart.getXAxisPane().getXAxisComponent();
		const coordinates = points.map((point) => {
			let dataIndex = null;
			if (isNumber(point.timestamp)) dataIndex = chartStore.timestampToDataIndex(point.timestamp);
			const coordinate = {
				x: 0,
				y: 0
			};
			if (isNumber(dataIndex)) coordinate.x = xAxis.convertToPixel(dataIndex);
			if (isNumber(point.value)) coordinate.y = yAxis?.convertToPixel(point.value) ?? 0;
			return coordinate;
		});
		if (coordinates.length > 0) {
			const figures = [].concat(this.getFigures(overlay, coordinates));
			this.drawFigures(ctx, overlay, figures);
		}
		this.drawDefaultFigures(ctx, overlay, coordinates);
	}
	drawFigures(ctx, overlay, figures) {
		const defaultStyles = this.getWidget().getPane().getChart().getStyles().overlay;
		figures.forEach((figure, figureIndex) => {
			const { type, styles, attrs } = figure;
			[].concat(attrs).forEach((ats) => {
				const events = this._createFigureEvents(overlay, "other", figureIndex, figure);
				const ss = {
					...defaultStyles[type],
					...overlay.styles?.[type],
					...styles
				};
				this.createFigure({
					name: type,
					attrs: ats,
					styles: ss
				}, events ?? void 0)?.draw(ctx);
			});
		});
	}
	getCompleteOverlays() {
		const pane = this.getWidget().getPane();
		return pane.getChart().getChartStore().getOverlaysByPaneId(pane.getId());
	}
	getProgressOverlay() {
		const pane = this.getWidget().getPane();
		const info = pane.getChart().getChartStore().getProgressOverlayInfo();
		if (isValid(info) && info.paneId === pane.getId()) return info.overlay;
		return null;
	}
	getFigures(o, coordinates) {
		const widget = this.getWidget();
		const pane = widget.getPane();
		const chart = pane.getChart();
		const yAxis = pane.getYAxisComponentById();
		const xAxis = chart.getXAxisPane().getXAxisComponent();
		const bounding = widget.getBounding();
		return o.createPointFigures?.({
			chart,
			overlay: o,
			coordinates,
			bounding,
			xAxis,
			yAxis
		}) ?? [];
	}
	drawDefaultFigures(ctx, overlay, coordinates) {
		if (overlay.needDefaultPointFigure) {
			const chartStore = this.getWidget().getPane().getChart().getChartStore();
			const hoverOverlayInfo = chartStore.getHoverOverlayInfo();
			const clickOverlayInfo = chartStore.getClickOverlayInfo();
			if (hoverOverlayInfo.overlay?.id === overlay.id && hoverOverlayInfo.figureType !== "none" || clickOverlayInfo.overlay?.id === overlay.id && clickOverlayInfo.figureType !== "none") {
				const defaultStyles = chartStore.getStyles().overlay;
				const styles = overlay.styles;
				const pointStyles = {
					...defaultStyles.point,
					...styles?.point
				};
				coordinates.forEach(({ x, y }, index) => {
					let radius = pointStyles.radius;
					let color = pointStyles.color;
					let borderColor = pointStyles.borderColor;
					let borderSize = pointStyles.borderSize;
					if (hoverOverlayInfo.overlay?.id === overlay.id && hoverOverlayInfo.figureType === "point" && hoverOverlayInfo.figure?.key === `overlay_figure_point_${index}`) {
						radius = pointStyles.activeRadius;
						color = pointStyles.activeColor;
						borderColor = pointStyles.activeBorderColor;
						borderSize = pointStyles.activeBorderSize;
					}
					this.createFigure({
						name: "circle",
						attrs: {
							x,
							y,
							r: radius + borderSize
						},
						styles: { color: borderColor }
					}, this._createFigureEvents(overlay, "point", index, {
						key: `overlay_figure_point_${index}`,
						type: "circle",
						attrs: {
							x,
							y,
							r: radius + borderSize
						},
						styles: { color: borderColor }
					}) ?? void 0)?.draw(ctx);
					this.createFigure({
						name: "circle",
						attrs: {
							x,
							y,
							r: radius
						},
						styles: { color }
					})?.draw(ctx);
				});
			}
		}
	}
};
var IndicatorWidget = class extends DrawWidget {
	constructor(rootContainer, pane) {
		super(rootContainer, pane);
		this._gridView = new GridView(this);
		this._indicatorView = new IndicatorView(this);
		this._crosshairLineView = new CrosshairLineView(this);
		this._tooltipView = this.createTooltipView();
		this._overlayView = new OverlayView(this);
		this.addChild(this._tooltipView);
		this.addChild(this._overlayView);
	}
	getName() {
		return WidgetNameConstants.MAIN;
	}
	updateMain(ctx) {
		this.updateMainContent(ctx);
		this._indicatorView.draw(ctx);
		this._gridView.draw(ctx);
	}
	createTooltipView() {
		return new IndicatorTooltipView(this);
	}
	updateMainContent(_ctx) {}
	updateOverlayContent(_ctx) {}
	updateOverlay(ctx) {
		this._overlayView.draw(ctx);
		this._crosshairLineView.draw(ctx);
		this.updateOverlayContent(ctx);
		this._tooltipView.draw(ctx);
	}
};
var CandleAreaView = class extends ChildrenView {
	constructor(..._args) {
		super(..._args);
		this._ripplePoint = this.createFigure({
			name: "circle",
			attrs: {
				x: 0,
				y: 0,
				r: 0
			},
			styles: { style: "fill" }
		});
		this._animationFrameTime = 0;
		this._animation = new Animation({ iterationCount: Infinity }).doFrame((time) => {
			this._animationFrameTime = time;
			const pane = this.getWidget().getPane();
			pane.getChart().updatePane(UpdateLevel.Main, pane.getId());
		});
	}
	drawImp(ctx) {
		const widget = this.getWidget();
		const pane = widget.getPane();
		const chart = pane.getChart();
		const lastDataIndex = chart.getDataList().length - 1;
		const bounding = widget.getBounding();
		const yAxis = pane.getYAxisComponentById();
		const styles = chart.getStyles().candle.area;
		const coordinates = [];
		let minY = Number.MAX_SAFE_INTEGER;
		let areaStartX = Number.MIN_SAFE_INTEGER;
		let ripplePointCoordinate = null;
		this.eachChildren((data) => {
			const x = data.x;
			const { current: kLineData } = data.data;
			const value = kLineData?.[styles.value];
			if (isNumber(value)) {
				const y = yAxis.convertToPixel(value);
				if (areaStartX === Number.MIN_SAFE_INTEGER) areaStartX = x;
				coordinates.push({
					x,
					y
				});
				minY = Math.min(minY, y);
				if (data.dataIndex === lastDataIndex) ripplePointCoordinate = {
					x,
					y
				};
			}
		});
		if (coordinates.length > 0) {
			this.createFigure({
				name: "line",
				attrs: { coordinates },
				styles: {
					color: styles.lineColor,
					size: styles.lineSize,
					smooth: styles.smooth
				}
			})?.draw(ctx);
			const backgroundColor = styles.backgroundColor;
			let color = "";
			if (isArray(backgroundColor)) {
				const gradient = ctx.createLinearGradient(0, bounding.height, 0, minY);
				try {
					backgroundColor.forEach(({ offset, color }) => {
						gradient.addColorStop(offset, color);
					});
				} catch (e) {}
				color = gradient;
			} else color = backgroundColor;
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.moveTo(areaStartX, bounding.height);
			ctx.lineTo(coordinates[0].x, coordinates[0].y);
			lineTo(ctx, coordinates, styles.smooth);
			ctx.lineTo(coordinates[coordinates.length - 1].x, bounding.height);
			ctx.closePath();
			ctx.fill();
		}
		const pointStyles = styles.point;
		if (pointStyles.show && isValid(ripplePointCoordinate)) {
			this.createFigure({
				name: "circle",
				attrs: {
					x: ripplePointCoordinate.x,
					y: ripplePointCoordinate.y,
					r: pointStyles.radius
				},
				styles: {
					style: "fill",
					color: pointStyles.color
				}
			})?.draw(ctx);
			let rippleRadius = pointStyles.rippleRadius;
			if (pointStyles.animation) {
				rippleRadius = pointStyles.radius + this._animationFrameTime / pointStyles.animationDuration * (pointStyles.rippleRadius - pointStyles.radius);
				this._animation.setDuration(pointStyles.animationDuration).start();
			}
			this._ripplePoint?.setAttrs({
				x: ripplePointCoordinate.x,
				y: ripplePointCoordinate.y,
				r: rippleRadius
			}).setStyles({
				style: "fill",
				color: pointStyles.rippleColor
			}).draw(ctx);
		} else this.stopAnimation();
	}
	stopAnimation() {
		this._animation.stop();
	}
};
var CandleHighLowPriceView = class extends View {
	drawImp(ctx) {
		const pane = this.getWidget().getPane();
		const chartStore = pane.getChart().getChartStore();
		const priceMarkStyles = chartStore.getStyles().candle.priceMark;
		const highPriceMarkStyles = priceMarkStyles.high;
		const lowPriceMarkStyles = priceMarkStyles.low;
		if (priceMarkStyles.show && (highPriceMarkStyles.show || lowPriceMarkStyles.show)) {
			const highestLowestPrice = chartStore.getVisibleRangeHighLowPrice();
			const precision = chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE;
			const yAxis = pane.getYAxisComponentById();
			const { price: high, x: highX } = highestLowestPrice[0];
			const { price: low, x: lowX } = highestLowestPrice[1];
			const highY = yAxis.convertToPixel(high);
			const lowY = yAxis.convertToPixel(low);
			const decimalFold = chartStore.getDecimalFold();
			const thousandsSeparator = chartStore.getThousandsSeparator();
			if (highPriceMarkStyles.show && high !== Number.MIN_SAFE_INTEGER) this._drawMark(ctx, decimalFold.format(thousandsSeparator.format(formatPrecision(high, precision))), {
				x: highX,
				y: highY
			}, highY < lowY ? [-2, -5] : [2, 5], highPriceMarkStyles);
			if (lowPriceMarkStyles.show && low !== Number.MAX_SAFE_INTEGER) this._drawMark(ctx, decimalFold.format(thousandsSeparator.format(formatPrecision(low, precision))), {
				x: lowX,
				y: lowY
			}, highY < lowY ? [2, 5] : [-2, -5], lowPriceMarkStyles);
		}
	}
	_drawMark(ctx, text, coordinate, offsets, styles) {
		const startX = coordinate.x;
		const startY = coordinate.y + offsets[0];
		this.createFigure({
			name: "line",
			attrs: { coordinates: [
				{
					x: startX - 2,
					y: startY + offsets[0]
				},
				{
					x: startX,
					y: startY
				},
				{
					x: startX + 2,
					y: startY + offsets[0]
				}
			] },
			styles: { color: styles.color }
		})?.draw(ctx);
		let lineEndX = 0;
		let textStartX = 0;
		let textAlign = "left";
		const { width } = this.getWidget().getBounding();
		if (startX > width / 2) {
			lineEndX = startX - 5;
			textStartX = lineEndX - styles.textOffset;
			textAlign = "right";
		} else {
			lineEndX = startX + 5;
			textAlign = "left";
			textStartX = lineEndX + styles.textOffset;
		}
		const y = startY + offsets[1];
		this.createFigure({
			name: "line",
			attrs: { coordinates: [
				{
					x: startX,
					y: startY
				},
				{
					x: startX,
					y
				},
				{
					x: lineEndX,
					y
				}
			] },
			styles: { color: styles.color }
		})?.draw(ctx);
		this.createFigure({
			name: "text",
			attrs: {
				x: textStartX,
				y,
				text,
				align: textAlign,
				baseline: "middle"
			},
			styles: {
				color: styles.color,
				size: styles.textSize,
				family: styles.textFamily,
				weight: styles.textWeight
			}
		})?.draw(ctx);
	}
};
var CandleLastPriceView = class extends View {
	drawImp(ctx) {
		const widget = this.getWidget();
		const pane = widget.getPane();
		const bounding = widget.getBounding();
		const chartStore = pane.getChart().getChartStore();
		const priceMarkStyles = chartStore.getStyles().candle.priceMark;
		const lastPriceMarkStyles = priceMarkStyles.last;
		const lastPriceMarkLineStyles = lastPriceMarkStyles.line;
		if (priceMarkStyles.show && lastPriceMarkStyles.show && lastPriceMarkLineStyles.show) {
			const yAxis = pane.getYAxisComponentById();
			const dataList = chartStore.getDataList();
			const data = dataList[dataList.length - 1];
			if (isValid(data)) {
				const { close, open } = data;
				const comparePrice = lastPriceMarkStyles.compareRule === "current_open" ? open : dataList[dataList.length - 2]?.close ?? close;
				const priceY = yAxis.convertToNicePixel(close);
				let color = "";
				if (close > comparePrice) color = lastPriceMarkStyles.upColor;
				else if (close < comparePrice) color = lastPriceMarkStyles.downColor;
				else color = lastPriceMarkStyles.noChangeColor;
				this.createFigure({
					name: "line",
					attrs: { coordinates: [{
						x: 0,
						y: priceY
					}, {
						x: bounding.width,
						y: priceY
					}] },
					styles: {
						style: lastPriceMarkLineStyles.style,
						color,
						size: lastPriceMarkLineStyles.size,
						dashedValue: lastPriceMarkLineStyles.dashedValue
					}
				})?.draw(ctx);
			}
		}
	}
};
var PeriodTypeXAxisFormat = {
	second: "HH:mm:ss",
	minute: "HH:mm",
	hour: "MM-DD HH:mm",
	day: "YYYY-MM-DD",
	week: "YYYY-MM-DD",
	month: "YYYY-MM",
	year: "YYYY"
};
var PeriodTypeCrosshairTooltipFormat = {
	second: "HH:mm:ss",
	minute: "YYYY-MM-DD HH:mm",
	hour: "YYYY-MM-DD HH:mm",
	day: "YYYY-MM-DD",
	week: "YYYY-MM-DD",
	month: "YYYY-MM",
	year: "YYYY"
};
var locales = {
	"zh-CN": {
		time: "时间：",
		open: "开：",
		high: "高：",
		low: "低：",
		close: "收：",
		volume: "成交量：",
		turnover: "成交额：",
		change: "涨幅：",
		second: "秒",
		minute: "",
		hour: "小时",
		day: "天",
		week: "周",
		month: "月",
		year: "年"
	},
	"en-US": {
		time: "Time: ",
		open: "Open: ",
		high: "High: ",
		low: "Low: ",
		close: "Close: ",
		volume: "Volume: ",
		turnover: "Turnover: ",
		change: "Change: ",
		second: "S",
		minute: "",
		hour: "H",
		day: "D",
		week: "W",
		month: "M",
		year: "Y"
	}
};
function registerLocale(locale, ls) {
	locales[locale] = {
		...locales[locale],
		...ls
	};
}
function getSupportedLocales() {
	return Object.keys(locales);
}
function i18n(key, locale) {
	return locales[locale][key] ?? key;
}
var CandleTooltipView = class extends IndicatorTooltipView {
	drawImp(ctx) {
		const widget = this.getWidget();
		const chartStore = widget.getPane().getChart().getChartStore();
		const crosshair = chartStore.getCrosshair();
		if (isValid(crosshair.kLineData)) {
			const bounding = widget.getBounding();
			const styles = chartStore.getStyles();
			const candleStyles = styles.candle;
			const indicatorStyles = styles.indicator;
			if (candleStyles.tooltip.showType === "rect" && indicatorStyles.tooltip.showType === "rect") {
				const isDrawCandleTooltip = this.isDrawTooltip(crosshair, candleStyles.tooltip);
				const isDrawIndicatorTooltip = this.isDrawTooltip(crosshair, indicatorStyles.tooltip);
				this._drawRectTooltip(ctx, isDrawCandleTooltip, isDrawIndicatorTooltip, candleStyles.tooltip.offsetTop);
			} else if (candleStyles.tooltip.showType === "standard" && indicatorStyles.tooltip.showType === "standard") {
				const { offsetLeft, offsetTop, offsetRight } = candleStyles.tooltip;
				const maxWidth = bounding.width - offsetRight;
				const top = this._drawCandleStandardTooltip(ctx, offsetLeft, offsetTop, maxWidth);
				this.drawIndicatorTooltip(ctx, offsetLeft, top, maxWidth);
			} else if (candleStyles.tooltip.showType === "rect" && indicatorStyles.tooltip.showType === "standard") {
				const { offsetLeft, offsetTop, offsetRight } = candleStyles.tooltip;
				const maxWidth = bounding.width - offsetRight;
				const top = this.drawIndicatorTooltip(ctx, offsetLeft, offsetTop, maxWidth);
				const isDrawCandleTooltip = this.isDrawTooltip(crosshair, candleStyles.tooltip);
				this._drawRectTooltip(ctx, isDrawCandleTooltip, false, top);
			} else {
				const { offsetLeft, offsetTop, offsetRight } = candleStyles.tooltip;
				const maxWidth = bounding.width - offsetRight;
				const top = this._drawCandleStandardTooltip(ctx, offsetLeft, offsetTop, maxWidth);
				const isDrawIndicatorTooltip = this.isDrawTooltip(crosshair, indicatorStyles.tooltip);
				this._drawRectTooltip(ctx, false, isDrawIndicatorTooltip, top);
			}
		}
	}
	_drawCandleStandardTooltip(ctx, left, top, maxWidth) {
		const chartStore = this.getWidget().getPane().getChart().getChartStore();
		const tooltipStyles = chartStore.getStyles().candle.tooltip;
		const tooltipLegendStyles = tooltipStyles.legend;
		let prevRowHeight = 0;
		const coordinate = {
			x: left,
			y: top
		};
		const crosshair = chartStore.getCrosshair();
		if (this.isDrawTooltip(crosshair, tooltipStyles)) {
			const tooltipTitleStyles = tooltipStyles.title;
			if (tooltipTitleStyles.show) {
				const { type = "", span = "" } = chartStore.getPeriod() ?? {};
				const text = formatTemplateString(tooltipTitleStyles.template, {
					...chartStore.getSymbol(),
					period: `${span}${i18n(type, chartStore.getLocale())}`
				});
				const color = tooltipTitleStyles.color;
				const height = this.drawStandardTooltipLegends(ctx, [{
					title: {
						text: "",
						color
					},
					value: {
						text,
						color
					}
				}], {
					x: left,
					y: top
				}, left, 0, maxWidth, tooltipTitleStyles);
				coordinate.y = coordinate.y + height;
			}
			const legends = this._getCandleTooltipLegends();
			const features = this.classifyTooltipFeatures(tooltipStyles.features);
			prevRowHeight = this.drawStandardTooltipFeatures(ctx, features[0], coordinate, null, left, prevRowHeight, maxWidth);
			prevRowHeight = this.drawStandardTooltipFeatures(ctx, features[1], coordinate, null, left, prevRowHeight, maxWidth);
			if (legends.length > 0) prevRowHeight = this.drawStandardTooltipLegends(ctx, legends, coordinate, left, prevRowHeight, maxWidth, tooltipLegendStyles);
			prevRowHeight = this.drawStandardTooltipFeatures(ctx, features[2], coordinate, null, left, prevRowHeight, maxWidth);
		}
		return coordinate.y + prevRowHeight;
	}
	_drawRectTooltip(ctx, isDrawCandleTooltip, isDrawIndicatorTooltip, top) {
		const widget = this.getWidget();
		const pane = widget.getPane();
		const chartStore = pane.getChart().getChartStore();
		const styles = chartStore.getStyles();
		const candleStyles = styles.candle;
		const indicatorStyles = styles.indicator;
		const candleTooltipStyles = candleStyles.tooltip;
		const indicatorTooltipStyles = indicatorStyles.tooltip;
		if (isDrawCandleTooltip || isDrawIndicatorTooltip) {
			const candleLegends = this._getCandleTooltipLegends();
			const { offsetLeft, offsetTop, offsetRight, offsetBottom } = candleTooltipStyles;
			const { marginLeft: baseLegendMarginLeft, marginRight: baseLegendMarginRight, marginTop: baseLegendMarginTop, marginBottom: baseLegendMarginBottom, size: baseLegendSize, weight: baseLegendWeight, family: baseLegendFamily } = candleTooltipStyles.legend;
			const { position: rectPosition, paddingLeft: rectPaddingLeft, paddingRight: rectPaddingRight, paddingTop: rectPaddingTop, paddingBottom: rectPaddingBottom, offsetLeft: rectOffsetLeft, offsetRight: rectOffsetRight, offsetTop: rectOffsetTop, offsetBottom: rectOffsetBottom, borderSize: rectBorderSize, borderRadius: rectBorderRadius, borderColor: rectBorderColor, color: rectBackgroundColor } = candleTooltipStyles.rect;
			let maxTextWidth = 0;
			let rectWidth = 0;
			let rectHeight = 0;
			if (isDrawCandleTooltip) {
				ctx.font = createFont(baseLegendSize, baseLegendWeight, baseLegendFamily);
				candleLegends.forEach((data) => {
					const title = data.title;
					const value = data.value;
					const text = `${title.text}${value.text}`;
					const labelWidth = ctx.measureText(text).width + baseLegendMarginLeft + baseLegendMarginRight;
					maxTextWidth = Math.max(maxTextWidth, labelWidth);
				});
				rectHeight += (baseLegendMarginBottom + baseLegendMarginTop + baseLegendSize) * candleLegends.length;
			}
			const { marginLeft: indicatorLegendMarginLeft, marginRight: indicatorLegendMarginRight, marginTop: indicatorLegendMarginTop, marginBottom: indicatorLegendMarginBottom, size: indicatorLegendSize, weight: indicatorLegendWeight, family: indicatorLegendFamily } = indicatorTooltipStyles.legend;
			const indicatorLegendsArray = [];
			if (isDrawIndicatorTooltip) {
				const indicators = chartStore.getIndicatorsByPaneId(pane.getId());
				ctx.font = createFont(indicatorLegendSize, indicatorLegendWeight, indicatorLegendFamily);
				indicators.forEach((indicator) => {
					const tooltipDataLegends = this.getIndicatorTooltipData(indicator).legends;
					indicatorLegendsArray.push(tooltipDataLegends);
					tooltipDataLegends.forEach((data) => {
						const title = data.title;
						const value = data.value;
						const text = `${title.text}${value.text}`;
						const textWidth = ctx.measureText(text).width + indicatorLegendMarginLeft + indicatorLegendMarginRight;
						maxTextWidth = Math.max(maxTextWidth, textWidth);
						rectHeight += indicatorLegendMarginTop + indicatorLegendMarginBottom + indicatorLegendSize;
					});
				});
			}
			rectWidth += maxTextWidth;
			if (rectWidth !== 0 && rectHeight !== 0) {
				const crosshair = chartStore.getCrosshair();
				const bounding = widget.getBounding();
				const yAxisBounding = pane.getYAxisWidget().getBounding();
				rectWidth += rectBorderSize * 2 + rectPaddingLeft + rectPaddingRight;
				rectHeight += rectBorderSize * 2 + rectPaddingTop + rectPaddingBottom;
				const centerX = bounding.width / 2;
				const isPointer = rectPosition === "pointer" && crosshair.paneId === PaneIdConstants.CANDLE;
				const isLeft = (crosshair.realX ?? 0) > centerX;
				let rectX = 0;
				if (isPointer) {
					const realX = crosshair.realX;
					if (isLeft) rectX = realX - rectOffsetRight - rectWidth;
					else rectX = realX + rectOffsetLeft;
				} else {
					const yAxis = this.getWidget().getPane().getYAxisComponentById();
					if (isLeft) {
						rectX = rectOffsetLeft + offsetLeft;
						if (yAxis.inside && yAxis.position === "left") rectX += yAxisBounding.width;
					} else {
						rectX = bounding.width - rectOffsetRight - rectWidth - offsetRight;
						if (yAxis.inside && yAxis.position === "right") rectX -= yAxisBounding.width;
					}
				}
				let rectY = top + rectOffsetTop;
				if (isPointer) {
					rectY = crosshair.y - rectHeight / 2;
					if (rectY + rectHeight > bounding.height - rectOffsetBottom - offsetBottom) rectY = bounding.height - rectOffsetBottom - rectHeight - offsetBottom;
					if (rectY < top + rectOffsetTop) rectY = top + rectOffsetTop + offsetTop;
				}
				this.createFigure({
					name: "rect",
					attrs: {
						x: rectX,
						y: rectY,
						width: rectWidth,
						height: rectHeight
					},
					styles: {
						style: "stroke_fill",
						color: rectBackgroundColor,
						borderColor: rectBorderColor,
						borderSize: rectBorderSize,
						borderRadius: rectBorderRadius
					}
				})?.draw(ctx);
				const candleTextX = rectX + rectBorderSize + rectPaddingLeft + baseLegendMarginLeft;
				let textY = rectY + rectBorderSize + rectPaddingTop;
				if (isDrawCandleTooltip) candleLegends.forEach((data) => {
					textY += baseLegendMarginTop;
					const title = data.title;
					this.createFigure({
						name: "text",
						attrs: {
							x: candleTextX,
							y: textY,
							text: title.text
						},
						styles: {
							color: title.color,
							size: baseLegendSize,
							family: baseLegendFamily,
							weight: baseLegendWeight
						}
					})?.draw(ctx);
					const value = data.value;
					this.createFigure({
						name: "text",
						attrs: {
							x: rectX + rectWidth - rectBorderSize - baseLegendMarginRight - rectPaddingRight,
							y: textY,
							text: value.text,
							align: "right"
						},
						styles: {
							color: value.color,
							size: baseLegendSize,
							family: baseLegendFamily,
							weight: baseLegendWeight
						}
					})?.draw(ctx);
					textY += baseLegendSize + baseLegendMarginBottom;
				});
				if (isDrawIndicatorTooltip) {
					const indicatorTextX = rectX + rectBorderSize + rectPaddingLeft + indicatorLegendMarginLeft;
					indicatorLegendsArray.forEach((legends) => {
						legends.forEach((data) => {
							textY += indicatorLegendMarginTop;
							const title = data.title;
							const value = data.value;
							this.createFigure({
								name: "text",
								attrs: {
									x: indicatorTextX,
									y: textY,
									text: title.text
								},
								styles: {
									color: title.color,
									size: indicatorLegendSize,
									family: indicatorLegendFamily,
									weight: indicatorLegendWeight
								}
							})?.draw(ctx);
							this.createFigure({
								name: "text",
								attrs: {
									x: rectX + rectWidth - rectBorderSize - indicatorLegendMarginRight - rectPaddingRight,
									y: textY,
									text: value.text,
									align: "right"
								},
								styles: {
									color: value.color,
									size: indicatorLegendSize,
									family: indicatorLegendFamily,
									weight: indicatorLegendWeight
								}
							})?.draw(ctx);
							textY += indicatorLegendSize + indicatorLegendMarginBottom;
						});
					});
				}
			}
		}
	}
	_getCandleTooltipLegends() {
		const chartStore = this.getWidget().getPane().getChart().getChartStore();
		const styles = chartStore.getStyles().candle;
		const dataList = chartStore.getDataList();
		const formatter = chartStore.getInnerFormatter();
		const decimalFold = chartStore.getDecimalFold();
		const thousandsSeparator = chartStore.getThousandsSeparator();
		const locale = chartStore.getLocale();
		const { pricePrecision = SymbolDefaultPrecisionConstants.PRICE, volumePrecision = SymbolDefaultPrecisionConstants.VOLUME } = chartStore.getSymbol() ?? {};
		const period = chartStore.getPeriod();
		const dataIndex = chartStore.getCrosshair().dataIndex ?? 0;
		const { color: textColor, defaultValue, template } = styles.tooltip.legend;
		const prev = dataList[dataIndex - 1] ?? null;
		const current = dataList[dataIndex];
		const prevClose = prev?.close ?? current.close;
		const changeValue = current.close - prevClose;
		const mapping = {
			...current,
			time: formatter.formatDate(current.timestamp, PeriodTypeCrosshairTooltipFormat[period?.type ?? "day"], "tooltip"),
			open: decimalFold.format(thousandsSeparator.format(formatPrecision(current.open, pricePrecision))),
			high: decimalFold.format(thousandsSeparator.format(formatPrecision(current.high, pricePrecision))),
			low: decimalFold.format(thousandsSeparator.format(formatPrecision(current.low, pricePrecision))),
			close: decimalFold.format(thousandsSeparator.format(formatPrecision(current.close, pricePrecision))),
			volume: decimalFold.format(thousandsSeparator.format(formatter.formatBigNumber(formatPrecision(current.volume ?? defaultValue, volumePrecision)))),
			turnover: decimalFold.format(thousandsSeparator.format(formatPrecision(current.turnover ?? defaultValue, pricePrecision))),
			change: prevClose === 0 ? defaultValue : `${thousandsSeparator.format(formatPrecision(changeValue / prevClose * 100))}%`
		};
		return (isFunction(template) ? template({
			prev,
			current,
			next: dataList[dataIndex + 1] ?? null
		}, styles) : template).map(({ title, value }) => {
			let t = {
				text: "",
				color: textColor
			};
			if (isObject(title)) t = { ...title };
			else t.text = title;
			t.text = i18n(t.text, locale);
			let v = {
				text: defaultValue,
				color: textColor
			};
			if (isObject(value)) v = { ...value };
			else v.text = value;
			if (isValid(/{change}/.exec(v.text))) v.color = changeValue === 0 ? styles.priceMark.last.noChangeColor : changeValue > 0 ? styles.priceMark.last.upColor : styles.priceMark.last.downColor;
			v.text = formatTemplateString(v.text, mapping);
			return {
				title: t,
				value: v
			};
		});
	}
};
var CrosshairFeatureView = class extends View {
	constructor(widget) {
		super(widget);
		this._activeFeatureInfo = null;
		this._featureClickEvent = (featureInfo) => () => {
			this.getWidget().getPane().getChart().getChartStore().executeAction("onCrosshairFeatureClick", featureInfo);
			return true;
		};
		this._featureMouseMoveEvent = (featureInfo) => () => {
			this._activeFeatureInfo = featureInfo;
			this.getWidget().setForceCursor("pointer");
			return true;
		};
		this.registerEvent("mouseMoveEvent", (_) => {
			this._activeFeatureInfo = null;
			this.getWidget().setForceCursor(null);
			return false;
		});
	}
	drawImp(ctx) {
		const widget = this.getWidget();
		const pane = widget.getPane();
		const chartStore = widget.getPane().getChart().getChartStore();
		const crosshair = chartStore.getCrosshair();
		const weight = this.getWidget();
		const yAxis = weight.getPane().getYAxisComponentById();
		if (isString(crosshair.paneId) && crosshair.paneId === pane.getId() && yAxis.isInCandle()) {
			const styles = chartStore.getStyles().crosshair;
			const features = styles.horizontal.features;
			if (styles.show && styles.horizontal.show && features.length > 0) {
				const isRight = yAxis.position === "right";
				const bounding = weight.getBounding();
				let yAxisTextWidth = 0;
				const horizontalTextStyles = styles.horizontal.text;
				if (yAxis.inside && horizontalTextStyles.show) {
					const value = yAxis.convertFromPixel(crosshair.y);
					const range = yAxis.getRange();
					let text = yAxis.displayValueToText(yAxis.realValueToDisplayValue(yAxis.valueToRealValue(value, { range }), { range }), chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE);
					text = chartStore.getDecimalFold().format(chartStore.getThousandsSeparator().format(text));
					yAxisTextWidth = horizontalTextStyles.paddingLeft + calcTextWidth(text, horizontalTextStyles.size, horizontalTextStyles.weight, horizontalTextStyles.family) + horizontalTextStyles.paddingRight;
				}
				let x = yAxisTextWidth;
				if (isRight) x = bounding.width - yAxisTextWidth;
				const y = crosshair.y;
				features.forEach((feature) => {
					const { marginLeft = 0, marginTop = 0, marginRight = 0, paddingLeft = 0, paddingTop = 0, paddingRight = 0, paddingBottom = 0, color, activeColor, backgroundColor, activeBackgroundColor, borderRadius, size = 0, type, content } = feature;
					let width = size;
					if (type === "icon_font") {
						const iconFont = content;
						width = paddingLeft + calcTextWidth(iconFont.code, size, "normal", iconFont.family) + paddingRight;
					}
					if (isRight) x -= width + marginRight;
					else x += marginLeft;
					let finalColor = color;
					let finalBackgroundColor = backgroundColor;
					if (this._activeFeatureInfo?.feature.id === feature.id) {
						finalColor = activeColor ?? color;
						finalBackgroundColor = activeBackgroundColor ?? backgroundColor;
					}
					const eventHandler = {
						mouseDownEvent: this._featureClickEvent({
							crosshair,
							feature
						}),
						mouseMoveEvent: this._featureMouseMoveEvent({
							crosshair,
							feature
						})
					};
					if (type === "icon_font") {
						const iconFont = content;
						this.createFigure({
							name: "text",
							attrs: {
								text: iconFont.code,
								x,
								y: y + marginTop,
								baseline: "middle"
							},
							styles: {
								paddingLeft,
								paddingTop,
								paddingRight,
								paddingBottom,
								borderRadius,
								size,
								family: iconFont.family,
								color: finalColor,
								backgroundColor: finalBackgroundColor
							}
						}, eventHandler)?.draw(ctx);
					} else {
						this.createFigure({
							name: "rect",
							attrs: {
								x,
								y: y + marginTop - size / 2,
								width: size,
								height: size
							},
							styles: {
								paddingLeft,
								paddingTop,
								paddingRight,
								paddingBottom,
								color: finalBackgroundColor
							}
						}, eventHandler)?.draw(ctx);
						const path = content;
						this.createFigure({
							name: "path",
							attrs: {
								path: path.path,
								x,
								y: y + marginTop + paddingTop - size / 2,
								width: size,
								height: size
							},
							styles: {
								style: path.style,
								lineWidth: path.lineWidth,
								color: finalColor
							}
						})?.draw(ctx);
					}
					if (isRight) x -= marginLeft;
					else x += width + marginRight;
				});
			}
		}
	}
};
var CandleWidget = class extends IndicatorWidget {
	constructor(rootContainer, pane) {
		super(rootContainer, pane);
		this._candleBarView = new CandleBarView(this);
		this._candleAreaView = new CandleAreaView(this);
		this._candleHighLowPriceView = new CandleHighLowPriceView(this);
		this._candleLastPriceLineView = new CandleLastPriceView(this);
		this._crosshairFeatureView = new CrosshairFeatureView(this);
		this.addChild(this._candleBarView);
		this.addChild(this._crosshairFeatureView);
	}
	updateMainContent(ctx) {
		if (this.getPane().getChart().getStyles().candle.type !== "area") {
			this._candleBarView.draw(ctx);
			this._candleHighLowPriceView.draw(ctx);
			this._candleAreaView.stopAnimation();
		} else this._candleAreaView.draw(ctx);
		this._candleLastPriceLineView.draw(ctx);
	}
	updateOverlayContent(ctx) {
		this._crosshairFeatureView.draw(ctx);
	}
	createTooltipView() {
		return new CandleTooltipView(this);
	}
};
var AxisView = class extends View {
	drawImp(ctx) {
		const widget = this.getWidget();
		const pane = widget.getPane();
		const bounding = widget.getBounding();
		const axis = this.getAxis();
		const styles = this.getAxisStyles(pane.getChart().getStyles());
		if (styles.show) {
			if (styles.axisLine.show) this.createFigure({
				name: "line",
				attrs: this.createAxisLine(bounding, styles),
				styles: styles.axisLine
			})?.draw(ctx);
			const ticks = axis.getTicks();
			if (styles.tickLine.show) this.createTickLines(ticks, bounding, styles).forEach((line) => {
				this.createFigure({
					name: "line",
					attrs: line,
					styles: styles.tickLine
				})?.draw(ctx);
			});
			if (styles.tickText.show) {
				const texts = this.createTickTexts(ticks, bounding, styles);
				this.createFigure({
					name: "text",
					attrs: texts,
					styles: styles.tickText
				})?.draw(ctx);
			}
		}
	}
};
var YAxisView = class extends AxisView {
	getAxis() {
		return this.getWidget().getAxisComponent();
	}
	getAxisStyles(styles) {
		return styles.yAxis;
	}
	createAxisLine(bounding, styles) {
		const yAxis = this.getAxis();
		const size = styles.axisLine.size;
		let x = 0;
		if (yAxis.isFromZero()) x = 0;
		else x = bounding.width - size;
		return { coordinates: [{
			x,
			y: 0
		}, {
			x,
			y: bounding.height
		}] };
	}
	createTickLines(ticks, bounding, styles) {
		const yAxis = this.getAxis();
		const axisLineStyles = styles.axisLine;
		const tickLineStyles = styles.tickLine;
		let startX = 0;
		let endX = 0;
		if (yAxis.isFromZero()) {
			startX = 0;
			if (axisLineStyles.show) startX += axisLineStyles.size;
			endX = startX + tickLineStyles.length;
		} else {
			startX = bounding.width;
			if (axisLineStyles.show) startX -= axisLineStyles.size;
			endX = startX - tickLineStyles.length;
		}
		return ticks.map((tick) => ({ coordinates: [{
			x: startX,
			y: tick.coord
		}, {
			x: endX,
			y: tick.coord
		}] }));
	}
	createTickTexts(ticks, bounding, styles) {
		const yAxis = this.getAxis();
		const axisLineStyles = styles.axisLine;
		const tickLineStyles = styles.tickLine;
		const tickTextStyles = styles.tickText;
		let x = 0;
		if (yAxis.isFromZero()) {
			x = tickTextStyles.marginStart;
			if (axisLineStyles.show) x += axisLineStyles.size;
			if (tickLineStyles.show) x += tickLineStyles.length;
		} else {
			x = bounding.width - tickTextStyles.marginEnd;
			if (axisLineStyles.show) x -= axisLineStyles.size;
			if (tickLineStyles.show) x -= tickLineStyles.length;
		}
		const textAlign = this.getAxis().isFromZero() ? "left" : "right";
		return ticks.map((tick) => ({
			x,
			y: tick.coord,
			text: tick.text,
			align: textAlign,
			baseline: "middle"
		}));
	}
};
var CandleLastPriceLabelView = class extends View {
	drawImp(ctx) {
		const widget = this.getWidget();
		const pane = widget.getPane();
		const bounding = widget.getBounding();
		const chartStore = pane.getChart().getChartStore();
		const priceMarkStyles = chartStore.getStyles().candle.priceMark;
		const lastPriceMarkStyles = priceMarkStyles.last;
		const lastPriceMarkTextStyles = lastPriceMarkStyles.text;
		if (priceMarkStyles.show && lastPriceMarkStyles.show && lastPriceMarkTextStyles.show) {
			const precision = chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE;
			const yAxis = pane.getYAxisComponentById();
			const dataList = chartStore.getDataList();
			const data = dataList[dataList.length - 1];
			if (isValid(data)) {
				const { close, open } = data;
				const comparePrice = lastPriceMarkStyles.compareRule === "current_open" ? open : dataList[dataList.length - 2]?.close ?? close;
				const priceY = yAxis.convertToNicePixel(close);
				let backgroundColor = "";
				if (close > comparePrice) backgroundColor = lastPriceMarkStyles.upColor;
				else if (close < comparePrice) backgroundColor = lastPriceMarkStyles.downColor;
				else backgroundColor = lastPriceMarkStyles.noChangeColor;
				let x = 0;
				let textAlgin = "left";
				if (yAxis.isFromZero()) {
					x = 0;
					textAlgin = "left";
				} else {
					x = bounding.width;
					textAlgin = "right";
				}
				const textFigures = [];
				const yAxisRange = yAxis.getRange();
				let priceText = yAxis.displayValueToText(yAxis.realValueToDisplayValue(yAxis.valueToRealValue(close, { range: yAxisRange }), { range: yAxisRange }), precision);
				priceText = chartStore.getDecimalFold().format(chartStore.getThousandsSeparator().format(priceText));
				const { paddingLeft, paddingRight, paddingTop, paddingBottom, size, family, weight } = lastPriceMarkTextStyles;
				let textWidth = paddingLeft + calcTextWidth(priceText, size, weight, family) + paddingRight;
				const priceTextHeight = paddingTop + size + paddingBottom;
				textFigures.push({
					name: "text",
					attrs: {
						x,
						y: priceY,
						width: textWidth,
						height: priceTextHeight,
						text: priceText,
						align: textAlgin,
						baseline: "middle"
					},
					styles: {
						...lastPriceMarkTextStyles,
						backgroundColor
					}
				});
				const formatExtendText = chartStore.getInnerFormatter().formatExtendText;
				const priceTextHalfHeight = size / 2;
				let aboveY = priceY - priceTextHalfHeight - paddingTop;
				let belowY = priceY + priceTextHalfHeight + paddingBottom;
				lastPriceMarkStyles.extendTexts.forEach((item, index) => {
					const text = formatExtendText({
						type: "last_price",
						data,
						index
					});
					if (text.length > 0 && item.show) {
						const textHalfHeight = item.size / 2;
						let textY = 0;
						if (item.position === "above_price") {
							aboveY -= item.paddingBottom + textHalfHeight;
							textY = aboveY;
							aboveY -= textHalfHeight + item.paddingTop;
						} else {
							belowY += item.paddingTop + textHalfHeight;
							textY = belowY;
							belowY += textHalfHeight + item.paddingBottom;
						}
						textWidth = Math.max(textWidth, item.paddingLeft + calcTextWidth(text, item.size, item.weight, item.family) + item.paddingRight);
						textFigures.push({
							name: "text",
							attrs: {
								x,
								y: textY,
								width: textWidth,
								height: item.paddingTop + item.size + item.paddingBottom,
								text,
								align: textAlgin,
								baseline: "middle"
							},
							styles: {
								...item,
								backgroundColor
							}
						});
					}
				});
				textFigures.forEach((figure) => {
					figure.attrs.width = textWidth;
					this.createFigure(figure)?.draw(ctx);
				});
			}
		}
	}
};
var IndicatorLastValueView = class extends View {
	drawImp(ctx) {
		const widget = this.getWidget();
		const pane = widget.getPane();
		const bounding = widget.getBounding();
		const chartStore = pane.getChart().getChartStore();
		const defaultStyles = chartStore.getStyles().indicator;
		const lastValueMarkStyles = defaultStyles.lastValueMark;
		const lastValueMarkTextStyles = lastValueMarkStyles.text;
		if (lastValueMarkStyles.show) {
			const yAxis = widget.getAxisComponent();
			const yAxisRange = yAxis.getRange();
			const dataList = chartStore.getDataList();
			const barSpace = chartStore.getBarSpace();
			const dataIndex = dataList.length - 1;
			const indicators = chartStore.getIndicatorsByPaneId(pane.getId()).filter((indicator) => indicator.yAxisId === yAxis.id);
			const formatter = chartStore.getInnerFormatter();
			const decimalFold = chartStore.getDecimalFold();
			const thousandsSeparator = chartStore.getThousandsSeparator();
			indicators.forEach((indicator) => {
				const data = indicator.result[dataIndex] ?? {};
				if (isValid(data) && indicator.visible) {
					const precision = indicator.precision;
					eachFigures(indicator, dataIndex, barSpace, defaultStyles, (figure, figureStyles) => {
						const value = data[figure.key];
						if (isNumber(value)) {
							const y = yAxis.convertToNicePixel(value);
							let text = yAxis.displayValueToText(yAxis.realValueToDisplayValue(yAxis.valueToRealValue(value, { range: yAxisRange }), { range: yAxisRange }), precision);
							if (indicator.shouldFormatBigNumber) text = formatter.formatBigNumber(text);
							text = decimalFold.format(thousandsSeparator.format(text));
							let x = 0;
							let textAlign = "left";
							if (yAxis.isFromZero()) {
								x = 0;
								textAlign = "left";
							} else {
								x = bounding.width;
								textAlign = "right";
							}
							this.createFigure({
								name: "text",
								attrs: {
									x,
									y,
									text,
									align: textAlign,
									baseline: "middle"
								},
								styles: {
									...lastValueMarkTextStyles,
									backgroundColor: figureStyles.color
								}
							})?.draw(ctx);
						}
					});
				}
			});
		}
	}
};
var OverlayYAxisView = class extends OverlayView {
	coordinateToPointTimestampDataIndexFlag() {
		return false;
	}
	drawDefaultFigures(ctx, overlay, coordinates) {
		this.drawFigures(ctx, overlay, this.getDefaultFigures(overlay, coordinates));
	}
	getDefaultFigures(overlay, coordinates) {
		const widget = this.getWidget();
		const pane = widget.getPane();
		const chartStore = pane.getChart().getChartStore();
		const clickOverlayInfo = chartStore.getClickOverlayInfo();
		const figures = [];
		if (overlay.needDefaultYAxisFigure && overlay.id === clickOverlayInfo.overlay?.id && clickOverlayInfo.paneId === pane.getId()) {
			const yAxis = pane.getYAxisComponentById();
			const bounding = widget.getBounding();
			let topY = Number.MAX_SAFE_INTEGER;
			let bottomY = Number.MIN_SAFE_INTEGER;
			const isFromZero = yAxis.isFromZero();
			let textAlign = "left";
			let x = 0;
			if (isFromZero) {
				textAlign = "left";
				x = 0;
			} else {
				textAlign = "right";
				x = bounding.width;
			}
			const decimalFold = chartStore.getDecimalFold();
			const thousandsSeparator = chartStore.getThousandsSeparator();
			coordinates.forEach((coordinate, index) => {
				const point = overlay.points[index];
				if (isNumber(point.value)) {
					topY = Math.min(topY, coordinate.y);
					bottomY = Math.max(bottomY, coordinate.y);
					const text = decimalFold.format(thousandsSeparator.format(formatPrecision(point.value, chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE)));
					figures.push({
						type: "text",
						attrs: {
							x,
							y: coordinate.y,
							text,
							align: textAlign,
							baseline: "middle"
						},
						ignoreEvent: true
					});
				}
			});
			if (coordinates.length > 1) figures.unshift({
				type: "rect",
				attrs: {
					x: 0,
					y: topY,
					width: bounding.width,
					height: bottomY - topY
				},
				ignoreEvent: true
			});
		}
		return figures;
	}
	getFigures(overlay, coordinates) {
		const widget = this.getWidget();
		const pane = widget.getPane();
		const chart = pane.getChart();
		const yAxis = pane.getYAxisComponentById();
		const xAxis = chart.getXAxisPane().getXAxisComponent();
		const bounding = widget.getBounding();
		return overlay.createYAxisFigures?.({
			chart,
			overlay,
			coordinates,
			bounding,
			xAxis,
			yAxis
		}) ?? [];
	}
};
var CrosshairHorizontalLabelView = class extends View {
	drawImp(ctx) {
		const widget = this.getWidget();
		const pane = widget.getPane();
		const chartStore = widget.getPane().getChart().getChartStore();
		const crosshair = chartStore.getCrosshair();
		if (isString(crosshair.paneId) && this.compare(crosshair, pane.getId())) {
			const styles = chartStore.getStyles().crosshair;
			if (styles.show) {
				const directionStyles = this.getDirectionStyles(styles);
				const textStyles = directionStyles.text;
				if (directionStyles.show && textStyles.show) {
					const bounding = widget.getBounding();
					const axis = "getAxisComponent" in widget ? widget.getAxisComponent() : pane.getYAxisComponentById();
					const text = this.getText(crosshair, chartStore, axis);
					ctx.font = createFont(textStyles.size, textStyles.weight, textStyles.family);
					this.createFigure({
						name: "text",
						attrs: this.getTextAttrs(text, ctx.measureText(text).width, crosshair, bounding, axis, textStyles),
						styles: textStyles
					})?.draw(ctx);
				}
			}
		}
	}
	compare(crosshair, paneId) {
		return crosshair.paneId === paneId;
	}
	getDirectionStyles(styles) {
		return styles.horizontal;
	}
	getText(crosshair, chartStore, axis) {
		const yAxis = axis;
		const value = axis.convertFromPixel(crosshair.y);
		let precision = 0;
		let shouldFormatBigNumber = false;
		if (yAxis.isInCandle() && yAxis.id === "default") precision = chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE;
		else chartStore.getIndicatorsByPaneId(crosshair.paneId).filter((indicator) => indicator.yAxisId === yAxis.id).forEach((indicator) => {
			precision = Math.max(indicator.precision, precision);
			shouldFormatBigNumber ||= indicator.shouldFormatBigNumber;
		});
		const yAxisRange = yAxis.getRange();
		let text = yAxis.displayValueToText(yAxis.realValueToDisplayValue(yAxis.valueToRealValue(value, { range: yAxisRange }), { range: yAxisRange }), precision);
		if (shouldFormatBigNumber) text = chartStore.getInnerFormatter().formatBigNumber(text);
		return chartStore.getDecimalFold().format(chartStore.getThousandsSeparator().format(text));
	}
	getTextAttrs(text, _textWidth, crosshair, bounding, axis, _styles) {
		const yAxis = axis;
		let x = 0;
		let textAlign = "left";
		if (yAxis.isFromZero()) {
			x = 0;
			textAlign = "left";
		} else {
			x = bounding.width;
			textAlign = "right";
		}
		return {
			x,
			y: crosshair.y,
			text,
			align: textAlign,
			baseline: "middle"
		};
	}
};
var YAxisWidget = class extends DrawWidget {
	constructor(rootContainer, pane, yAxis) {
		super(rootContainer, pane);
		this._yAxisView = new YAxisView(this);
		this._candleLastPriceLabelView = new CandleLastPriceLabelView(this);
		this._indicatorLastValueView = new IndicatorLastValueView(this);
		this._overlayYAxisView = new OverlayYAxisView(this);
		this._crosshairHorizontalLabelView = new CrosshairHorizontalLabelView(this);
		this._yAxis = yAxis;
		this.setCursor("ns-resize");
		this.addChild(this._overlayYAxisView);
	}
	getAxisComponent() {
		return this._yAxis;
	}
	getName() {
		return WidgetNameConstants.Y_AXIS;
	}
	updateMain(ctx) {
		this._yAxisView.draw(ctx);
		if (this._yAxis.id === "default" && this.getAxisComponent().isInCandle()) this._candleLastPriceLabelView.draw(ctx);
		this._indicatorLastValueView.draw(ctx);
	}
	updateOverlay(ctx) {
		this._overlayYAxisView.draw(ctx);
		this._crosshairHorizontalLabelView.draw(ctx);
	}
};
var YAxisImp = class extends AxisImp {
	constructor(parent, yAxis) {
		super(parent);
		this.id = DEFAULT_AXIS_ID;
		this.paneId = "";
		this.reverse = false;
		this.inside = false;
		this.position = "right";
		this.gap = {
			top: .2,
			bottom: .1
		};
		this.createRange = (params) => params.defaultRange;
		this.minSpan = (precision) => index10(-precision);
		this.valueToRealValue = (value) => value;
		this.realValueToDisplayValue = (value) => value;
		this.displayValueToRealValue = (value) => value;
		this.realValueToValue = (value) => value;
		this.displayValueToText = (value, precision) => formatPrecision(value, precision);
		const { minSpan, valueToRealValue, realValueToDisplayValue, displayValueToRealValue, realValueToValue, displayValueToText, ...others } = yAxis;
		if (isFunction(minSpan)) this.minSpan = minSpan;
		if (isFunction(valueToRealValue)) this.valueToRealValue = valueToRealValue;
		if (isFunction(realValueToDisplayValue)) this.realValueToDisplayValue = realValueToDisplayValue;
		if (isFunction(displayValueToRealValue)) this.displayValueToRealValue = displayValueToRealValue;
		if (isFunction(realValueToValue)) this.realValueToValue = realValueToValue;
		if (isFunction(displayValueToText)) this.displayValueToText = displayValueToText;
		this.override(others);
	}
	override(yAxis) {
		const { id, name, gap, ...others } = yAxis;
		if (isValid(id) && this.id === "default") this.id = id;
		if (!isString(this.name) && isString(name)) this.name = name;
		merge(this.gap, gap);
		merge(this, others);
	}
	createRangeImp() {
		const parent = this.getParent();
		const chart = parent.getChart();
		const chartStore = chart.getChartStore();
		const paneId = parent.getId();
		let min = Number.MAX_SAFE_INTEGER;
		let max = Number.MIN_SAFE_INTEGER;
		let shouldOhlc = false;
		let specifyMin = Number.MAX_SAFE_INTEGER;
		let specifyMax = Number.MIN_SAFE_INTEGER;
		let indicatorPrecision = Number.MAX_SAFE_INTEGER;
		const indicators = chartStore.getIndicatorsByPaneId(paneId).filter((indicator) => indicator.yAxisId === this.id);
		indicators.forEach((indicator) => {
			shouldOhlc ||= indicator.shouldOhlc;
			indicatorPrecision = Math.min(indicatorPrecision, indicator.precision);
			if (isNumber(indicator.minValue)) specifyMin = Math.min(specifyMin, indicator.minValue);
			if (isNumber(indicator.maxValue)) specifyMax = Math.max(specifyMax, indicator.maxValue);
		});
		let precision = 4;
		const inCandle = this.isInCandle();
		const isDefaultYAxis = this.id === DEFAULT_AXIS_ID;
		if (inCandle) {
			const pricePrecision = chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE;
			if (indicatorPrecision !== Number.MAX_SAFE_INTEGER) precision = Math.min(indicatorPrecision, pricePrecision);
			else precision = pricePrecision;
		} else if (indicatorPrecision !== Number.MAX_SAFE_INTEGER) precision = indicatorPrecision;
		const visibleRangeDataList = chartStore.getVisibleRangeDataList();
		const candleStyles = chart.getStyles().candle;
		const isArea = candleStyles.type === "area";
		const areaValueKey = candleStyles.area.value;
		const shouldCompareHighLow = inCandle && isDefaultYAxis && !isArea || !inCandle && shouldOhlc;
		visibleRangeDataList.forEach((visibleData) => {
			const dataIndex = visibleData.dataIndex;
			const data = visibleData.data.current;
			if (isValid(data)) {
				if (shouldCompareHighLow) {
					min = Math.min(min, data.low);
					max = Math.max(max, data.high);
				}
				if (inCandle && isDefaultYAxis && isArea) {
					const value = data[areaValueKey];
					if (isNumber(value)) {
						min = Math.min(min, value);
						max = Math.max(max, value);
					}
				}
			}
			indicators.forEach(({ result, figures }) => {
				const data = result[dataIndex] ?? {};
				figures.forEach((figure) => {
					const value = data[figure.key];
					if (isNumber(value)) {
						min = Math.min(min, value);
						max = Math.max(max, value);
					}
				});
			});
		});
		if (min !== Number.MAX_SAFE_INTEGER && max !== Number.MIN_SAFE_INTEGER) {
			min = Math.min(specifyMin, min);
			max = Math.max(specifyMax, max);
		} else {
			min = 0;
			max = 10;
		}
		const defaultDiff = max - min;
		const defaultRange = {
			from: min,
			to: max,
			range: defaultDiff,
			realFrom: min,
			realTo: max,
			realRange: defaultDiff,
			displayFrom: min,
			displayTo: max,
			displayRange: defaultDiff
		};
		const range = this.createRange({
			chart,
			paneId,
			defaultRange
		});
		let realFrom = range.realFrom;
		let realTo = range.realTo;
		let realRange = range.realRange;
		const minSpan = this.minSpan(precision);
		if (realFrom === realTo || realRange < minSpan) {
			const minCheck = specifyMin === realFrom;
			const maxCheck = specifyMax === realTo;
			const halfTickCount = 8 / 2;
			realFrom = minCheck ? realFrom : maxCheck ? realFrom - 8 * minSpan : realFrom - halfTickCount * minSpan;
			realTo = maxCheck ? realTo : minCheck ? realTo + 8 * minSpan : realTo + halfTickCount * minSpan;
		}
		const height = this.getBounding().height;
		const { top, bottom } = this.gap;
		let topRate = top;
		if (topRate >= 1) topRate = topRate / height;
		let bottomRate = bottom;
		if (bottomRate >= 1) bottomRate = bottomRate / height;
		realRange = realTo - realFrom;
		realFrom = realFrom - realRange * bottomRate;
		realTo = realTo + realRange * topRate;
		const from = this.realValueToValue(realFrom, { range });
		const to = this.realValueToValue(realTo, { range });
		const displayFrom = this.realValueToDisplayValue(realFrom, { range });
		const displayTo = this.realValueToDisplayValue(realTo, { range });
		return {
			from,
			to,
			range: to - from,
			realFrom,
			realTo,
			realRange: realTo - realFrom,
			displayFrom,
			displayTo,
			displayRange: displayTo - displayFrom
		};
	}
	isInCandle() {
		return this.getParent().getId() === PaneIdConstants.CANDLE;
	}
	isFromZero() {
		return this.position === "left" && this.inside || this.position === "right" && !this.inside;
	}
	createTicksImp() {
		const range = this.getRange();
		const { displayFrom, displayTo, displayRange } = range;
		const ticks = [];
		if (displayRange >= 0) {
			const interval = nice(displayRange / 8);
			const precision = getPrecision(interval);
			const first = round(Math.ceil(displayFrom / interval) * interval, precision);
			const last = round(Math.floor(displayTo / interval) * interval, precision);
			let n = 0;
			let f = first;
			if (interval !== 0) while (f <= last) {
				const v = f.toFixed(precision);
				ticks[n] = {
					text: v,
					coord: 0,
					value: v
				};
				++n;
				f += interval;
			}
		}
		const pane = this.getParent();
		const height = this.getBounding().height;
		const chartStore = pane.getChart().getChartStore();
		const optimalTicks = [];
		const indicators = chartStore.getIndicatorsByPaneId(pane.getId()).filter((indicator) => indicator.yAxisId === this.id);
		const styles = chartStore.getStyles();
		let precision = 0;
		let shouldFormatBigNumber = false;
		if (this.isInCandle() && this.id === "default") precision = chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE;
		else indicators.forEach((indicator) => {
			precision = Math.max(precision, indicator.precision);
			shouldFormatBigNumber ||= indicator.shouldFormatBigNumber;
		});
		const formatter = chartStore.getInnerFormatter();
		const thousandsSeparator = chartStore.getThousandsSeparator();
		const decimalFold = chartStore.getDecimalFold();
		const textHeight = styles.xAxis.tickText.size;
		let validY = NaN;
		ticks.forEach(({ value }) => {
			let v = this.displayValueToText(+value, precision);
			const y = this.convertToPixel(this.realValueToValue(this.displayValueToRealValue(+value, { range }), { range }));
			if (shouldFormatBigNumber) v = formatter.formatBigNumber(value);
			v = decimalFold.format(thousandsSeparator.format(v));
			const validYNumber = isNumber(validY);
			if (y > textHeight && y < height - textHeight && (validYNumber && Math.abs(validY - y) > textHeight * 2 || !validYNumber)) {
				optimalTicks.push({
					text: v,
					coord: y,
					value
				});
				validY = y;
			}
		});
		if (isFunction(this.createTicks)) return this.createTicks({
			range: this.getRange(),
			bounding: this.getBounding(),
			defaultTicks: optimalTicks
		});
		return optimalTicks;
	}
	getAutoSize() {
		const pane = this.getParent();
		const chartStore = pane.getChart().getChartStore();
		const styles = chartStore.getStyles();
		const yAxisStyles = styles.yAxis;
		const width = yAxisStyles.size;
		if (width !== "auto") return width;
		let yAxisWidth = 0;
		if (yAxisStyles.show) {
			if (yAxisStyles.axisLine.show) yAxisWidth += yAxisStyles.axisLine.size;
			if (yAxisStyles.tickLine.show) yAxisWidth += yAxisStyles.tickLine.length;
			if (yAxisStyles.tickText.show) {
				let textWidth = 0;
				this.getTicks().forEach((tick) => {
					textWidth = Math.max(textWidth, calcTextWidth(tick.text, yAxisStyles.tickText.size, yAxisStyles.tickText.weight, yAxisStyles.tickText.family));
				});
				yAxisWidth += yAxisStyles.tickText.marginStart + yAxisStyles.tickText.marginEnd + textWidth;
			}
		}
		const priceMarkStyles = styles.candle.priceMark;
		const lastPriceMarkTextVisible = priceMarkStyles.show && priceMarkStyles.last.show && priceMarkStyles.last.text.show;
		let lastPriceTextWidth = 0;
		const crosshairStyles = styles.crosshair;
		const crosshairHorizontalTextVisible = crosshairStyles.show && crosshairStyles.horizontal.show && crosshairStyles.horizontal.text.show;
		let crosshairHorizontalTextWidth = 0;
		if (lastPriceMarkTextVisible || crosshairHorizontalTextVisible) {
			const pricePrecision = chartStore.getSymbol()?.pricePrecision ?? SymbolDefaultPrecisionConstants.PRICE;
			const max = this.getRange().displayTo;
			if (lastPriceMarkTextVisible) {
				const dataList = chartStore.getDataList();
				const data = dataList[dataList.length - 1];
				if (isValid(data)) {
					const { paddingLeft, paddingRight, size, family, weight } = priceMarkStyles.last.text;
					lastPriceTextWidth = paddingLeft + calcTextWidth(formatPrecision(data.close, pricePrecision), size, weight, family) + paddingRight;
					const formatExtendText = chartStore.getInnerFormatter().formatExtendText;
					priceMarkStyles.last.extendTexts.forEach((item, index) => {
						const text = formatExtendText({
							type: "last_price",
							data,
							index
						});
						if (text.length > 0 && item.show) lastPriceTextWidth = Math.max(lastPriceTextWidth, item.paddingLeft + calcTextWidth(text, item.size, item.weight, item.family) + item.paddingRight);
					});
				}
			}
			if (crosshairHorizontalTextVisible) {
				const indicators = chartStore.getIndicatorsByPaneId(pane.getId()).filter((indicator) => indicator.yAxisId === this.id);
				let indicatorPrecision = 0;
				let shouldFormatBigNumber = false;
				indicators.forEach((indicator) => {
					indicatorPrecision = Math.max(indicator.precision, indicatorPrecision);
					shouldFormatBigNumber ||= indicator.shouldFormatBigNumber;
				});
				let precision = 2;
				if (this.isInCandle() && this.id === "default") {
					const lastValueMarkStyles = styles.indicator.lastValueMark;
					if (lastValueMarkStyles.show && lastValueMarkStyles.text.show) precision = Math.max(indicatorPrecision, pricePrecision);
					else precision = pricePrecision;
				} else precision = indicatorPrecision;
				let valueText = formatPrecision(max, precision);
				if (shouldFormatBigNumber) valueText = chartStore.getInnerFormatter().formatBigNumber(valueText);
				valueText = chartStore.getDecimalFold().format(valueText);
				crosshairHorizontalTextWidth += crosshairStyles.horizontal.text.paddingLeft + crosshairStyles.horizontal.text.paddingRight + crosshairStyles.horizontal.text.borderSize * 2 + calcTextWidth(valueText, crosshairStyles.horizontal.text.size, crosshairStyles.horizontal.text.weight, crosshairStyles.horizontal.text.family);
			}
		}
		return Math.max(yAxisWidth, lastPriceTextWidth, crosshairHorizontalTextWidth);
	}
	getBounding() {
		return this.getParent().getYAxisWidgetById(this.id)?.getBounding() ?? this.getParent().getMainWidget().getBounding();
	}
	convertFromPixel(pixel) {
		const height = this.getBounding().height;
		const range = this.getRange();
		const { realFrom, realRange } = range;
		const realValue = (this.reverse ? pixel / height : 1 - pixel / height) * realRange + realFrom;
		return this.realValueToValue(realValue, { range });
	}
	convertToPixel(value) {
		const range = this.getRange();
		const realValue = this.valueToRealValue(value, { range });
		const height = this.getBounding().height;
		const { realFrom, realRange } = range;
		const rate = (realValue - realFrom) / realRange;
		return this.reverse ? Math.round(rate * height) : Math.round((1 - rate) * height);
	}
	convertToNicePixel(value) {
		const height = this.getBounding().height;
		const pixel = this.convertToPixel(value);
		return Math.round(Math.max(height * .05, Math.min(pixel, height * .98)));
	}
	static extend(template) {
		class Custom extends YAxisImp {
			constructor(parent) {
				super(parent, template);
			}
		}
		return Custom;
	}
};
var yAxises = {
	normal: YAxisImp.extend({ name: "normal" }),
	percentage: YAxisImp.extend({
		name: "percentage",
		minSpan: () => Math.pow(10, -2),
		displayValueToText: (value) => `${formatPrecision(value, 2)}%`,
		valueToRealValue: (value, { range }) => (value - range.from) / range.range * range.realRange + range.realFrom,
		realValueToValue: (value, { range }) => (value - range.realFrom) / range.realRange * range.range + range.from,
		createRange: ({ chart, defaultRange }) => {
			const kLineData = chart.getDataList()[chart.getVisibleRange().from];
			if (isValid(kLineData)) {
				const { from, to, range } = defaultRange;
				const realFrom = (defaultRange.from - kLineData.close) / kLineData.close * 100;
				const realTo = (defaultRange.to - kLineData.close) / kLineData.close * 100;
				const realRange = realTo - realFrom;
				return {
					from,
					to,
					range,
					realFrom,
					realTo,
					realRange,
					displayFrom: realFrom,
					displayTo: realTo,
					displayRange: realRange
				};
			}
			return defaultRange;
		}
	}),
	logarithm: YAxisImp.extend({
		name: "logarithm",
		minSpan: (precision) => .05 * index10(-precision),
		valueToRealValue: (value) => value < 0 ? -log10(Math.abs(value)) : log10(value),
		realValueToDisplayValue: (value) => value < 0 ? -index10(Math.abs(value)) : index10(value),
		displayValueToRealValue: (value) => value < 0 ? -log10(Math.abs(value)) : log10(value),
		realValueToValue: (value) => value < 0 ? -index10(Math.abs(value)) : index10(value),
		createRange: ({ defaultRange }) => {
			const { from, to, range } = defaultRange;
			const realFrom = from < 0 ? -log10(Math.abs(from)) : log10(from);
			const realTo = to < 0 ? -log10(Math.abs(to)) : log10(to);
			return {
				from,
				to,
				range,
				realFrom,
				realTo,
				realRange: realTo - realFrom,
				displayFrom: from,
				displayTo: to,
				displayRange: range
			};
		}
	})
};
function registerYAxis(axis) {
	yAxises[axis.name] = YAxisImp.extend(axis);
}
function getYAxisClass(name) {
	return yAxises[name] ?? yAxises.normal;
}
var Pane = class {
	constructor(chart, id) {
		this._bounding = createDefaultBounding();
		this._chart = chart;
		this._id = id;
		this._container = createDom("div", {
			width: "100%",
			margin: "0",
			padding: "0",
			position: "relative",
			overflow: "hidden",
			boxSizing: "border-box"
		});
	}
	getContainer() {
		return this._container;
	}
	getId() {
		return this._id;
	}
	getChart() {
		return this._chart;
	}
	getBounding() {
		return this._bounding;
	}
	update(level) {
		if (this._bounding.height !== this._container.clientHeight) this._container.style.height = `${this._bounding.height}px`;
		this.updateImp(level ?? UpdateLevel.Drawer, this._container, this._bounding);
	}
};
var DrawPane = class extends Pane {
	constructor(chart, options) {
		super(chart, options.id);
		this._yAxisWidgets = /* @__PURE__ */ new Map();
		this._yAxisComponents = /* @__PURE__ */ new Map();
		this._yAxesBounding = {};
		this._options = {
			id: "",
			minHeight: 30,
			dragEnabled: true,
			order: 0,
			height: 100,
			state: "normal"
		};
		const container = this.getContainer();
		this._mainWidget = this.createMainWidget(container);
		this.setOptions(options);
	}
	setOptions(options) {
		merge(this._options, options);
		if (isNumber(options.height) && options.height > 0) this.setBounding({ height: this._options.height });
		return this;
	}
	setAxisCursor(scrollZoomEnabled, yAxisId) {
		let container = null;
		let cursor = "default";
		if (this.getId() === PaneIdConstants.X_AXIS) {
			container = this.getMainWidget().getContainer();
			cursor = "ew-resize";
		} else {
			container = this.getYAxisWidgetById(yAxisId)?.getContainer() ?? null;
			cursor = "ns-resize";
		}
		if (!isValid(container) || !isBoolean(scrollZoomEnabled)) return;
		if (scrollZoomEnabled) container.style.cursor = cursor;
		else container.style.cursor = "default";
	}
	createYAxis(axis) {
		const yAxisId = axis.id ?? "default";
		const yAxisName = axis.name ?? "normal";
		const needWidget = axis.needWidget ?? true;
		let yAxis = this._yAxisComponents.get(yAxisId);
		if (!isValid(yAxis) || isValid(axis.name) && yAxis.name !== axis.name) {
			this._yAxisWidgets.get(yAxisId)?.destroy();
			this._yAxisWidgets.delete(yAxisId);
			yAxis = this.createYAxisComponent(yAxisName);
			yAxis.id = yAxisId;
			yAxis.paneId = this.getId();
			this._yAxisComponents.set(yAxisId, yAxis);
			if (needWidget) {
				const yAxisWidget = this.createYAxisWidget(this.getContainer(), yAxis);
				if (isValid(yAxisWidget)) this._yAxisWidgets.set(yAxisId, yAxisWidget);
			}
		}
		if (!isValid(yAxis)) throw new Error("create yAxis failed.");
		yAxis.setAutoCalcTickFlag(true);
		yAxis.override({
			...axis,
			name: yAxisName
		});
		this.setAxisCursor(yAxis.scrollZoomEnabled, yAxisId);
		return yAxis;
	}
	getOptions() {
		return this._options;
	}
	getYAxisComponents() {
		return Array.from(this._yAxisComponents.values());
	}
	getWidgetYAxisComponents() {
		return Array.from(this._yAxisWidgets.keys()).map((id) => this._yAxisComponents.get(id));
	}
	hasYAxisComponent(yAxisId) {
		return this._yAxisComponents.has(yAxisId);
	}
	removeYAxis(yAxisId) {
		if (!isValid(this._yAxisComponents.get(yAxisId))) return false;
		this._yAxisComponents.delete(yAxisId);
		const yAxisWidget = this._yAxisWidgets.get(yAxisId);
		if (isValid(yAxisWidget)) {
			yAxisWidget.destroy();
			this._yAxisWidgets.delete(yAxisId);
		}
		this._yAxesBounding = Object.keys(this._yAxesBounding).reduce((bounding, id) => {
			if (id !== yAxisId) bounding[id] = this._yAxesBounding[id];
			return bounding;
		}, {});
		return true;
	}
	_getDefaultYAxisId() {
		if (this._yAxisComponents.has("default")) return DEFAULT_AXIS_ID;
		return this._yAxisComponents.keys().next().value ?? null;
	}
	getYAxisComponentById(yAxisId) {
		const id = yAxisId ?? this._getDefaultYAxisId();
		return this._yAxisComponents.get(id);
	}
	getYAxisWidgetById(yAxisId) {
		const id = yAxisId ?? this._getDefaultYAxisId();
		return isValid(id) ? this._yAxisWidgets.get(id) ?? null : null;
	}
	setYAxesBounding(bounding) {
		this._yAxesBounding = bounding;
	}
	setBounding(rootBounding, mainBounding, leftYAxisBounding, rightYAxisBounding) {
		merge(this.getBounding(), rootBounding);
		const contentBounding = {};
		if (isValid(rootBounding.height)) contentBounding.height = rootBounding.height;
		if (isValid(rootBounding.top)) contentBounding.top = rootBounding.top;
		this._mainWidget.setBounding(contentBounding);
		const mainBoundingValid = isValid(mainBounding);
		if (mainBoundingValid) this._mainWidget.setBounding(mainBounding);
		if (this._yAxisWidgets.size > 0) this._yAxisWidgets.forEach((yAxisWidget, yAxisId) => {
			yAxisWidget.setBounding(contentBounding);
			if (isValid(this._yAxesBounding[yAxisId])) {
				yAxisWidget.setBounding(this._yAxesBounding[yAxisId]);
				return;
			}
			if (this.getYAxisComponentById(yAxisId).position === "left") {
				if (isValid(leftYAxisBounding)) yAxisWidget.setBounding({
					...leftYAxisBounding,
					left: 0
				});
			} else if (isValid(rightYAxisBounding)) {
				yAxisWidget.setBounding(rightYAxisBounding);
				if (mainBoundingValid) yAxisWidget.setBounding({ left: (mainBounding.left ?? 0) + (mainBounding.width ?? 0) + (mainBounding.right ?? 0) - (rightYAxisBounding.width ?? 0) });
			}
		});
		return this;
	}
	getMainWidget() {
		return this._mainWidget;
	}
	getYAxisWidget() {
		return this.getYAxisWidgetById();
	}
	getYAxisWidgets() {
		return Array.from(this._yAxisWidgets.values());
	}
	updateImp(level) {
		this._mainWidget.update(level);
		this._yAxisWidgets.forEach((widget) => {
			widget.update(level);
		});
	}
	destroy() {
		this._mainWidget.destroy();
		this._yAxisWidgets.forEach((widget) => {
			widget.destroy();
		});
	}
	getImage(includeOverlay) {
		const { width, height } = this.getBounding();
		const canvas = createDom("canvas", {
			width: `${width}px`,
			height: `${height}px`,
			boxSizing: "border-box"
		});
		const ctx = canvas.getContext("2d");
		const pixelRatio = getPixelRatio(canvas);
		canvas.width = width * pixelRatio;
		canvas.height = height * pixelRatio;
		ctx.scale(pixelRatio, pixelRatio);
		const mainBounding = this._mainWidget.getBounding();
		ctx.drawImage(this._mainWidget.getImage(includeOverlay), mainBounding.left, 0, mainBounding.width, mainBounding.height);
		this._yAxisWidgets.forEach((yAxisWidget) => {
			const yAxisBounding = yAxisWidget.getBounding();
			ctx.drawImage(yAxisWidget.getImage(includeOverlay), yAxisBounding.left, 0, yAxisBounding.width, yAxisBounding.height);
		});
		return canvas;
	}
	createYAxisComponent(_name) {
		throw new Error("createYAxisComponent is not implemented.");
	}
	createYAxisWidget(_container, _yAxis) {
		return null;
	}
};
var IndicatorPane = class extends DrawPane {
	createYAxisComponent(name) {
		return new (getYAxisClass(name ?? "default"))(this);
	}
	createMainWidget(container) {
		return new IndicatorWidget(container, this);
	}
	createYAxisWidget(container, yAxis) {
		return new YAxisWidget(container, this, yAxis);
	}
};
var CandlePane = class extends IndicatorPane {
	createMainWidget(container) {
		return new CandleWidget(container, this);
	}
};
var XAxisView = class extends AxisView {
	getAxis() {
		return this.getWidget().getPane().getXAxisComponent();
	}
	getAxisStyles(styles) {
		return styles.xAxis;
	}
	createAxisLine(bounding) {
		return { coordinates: [{
			x: 0,
			y: 0
		}, {
			x: bounding.width,
			y: 0
		}] };
	}
	createTickLines(ticks, _bounding, styles) {
		const tickLineStyles = styles.tickLine;
		const axisLineSize = styles.axisLine.size;
		return ticks.map((tick) => ({ coordinates: [{
			x: tick.coord,
			y: 0
		}, {
			x: tick.coord,
			y: axisLineSize + tickLineStyles.length
		}] }));
	}
	createTickTexts(ticks, _bounding, styles) {
		const tickTickStyles = styles.tickText;
		const axisLineSize = styles.axisLine.size;
		const tickLineLength = styles.tickLine.length;
		return ticks.map((tick) => ({
			x: tick.coord,
			y: axisLineSize + tickLineLength + tickTickStyles.marginStart,
			text: tick.text,
			align: "center",
			baseline: "top"
		}));
	}
};
var OverlayXAxisView = class extends OverlayYAxisView {
	coordinateToPointTimestampDataIndexFlag() {
		return true;
	}
	coordinateToPointValueFlag() {
		return false;
	}
	getCompleteOverlays() {
		return this.getWidget().getPane().getChart().getChartStore().getOverlaysByPaneId();
	}
	getProgressOverlay() {
		return this.getWidget().getPane().getChart().getChartStore().getProgressOverlayInfo()?.overlay ?? null;
	}
	getDefaultFigures(overlay, coordinates) {
		const figures = [];
		const widget = this.getWidget();
		const chartStore = widget.getPane().getChart().getChartStore();
		const clickOverlayInfo = chartStore.getClickOverlayInfo();
		if (overlay.needDefaultXAxisFigure && overlay.id === clickOverlayInfo.overlay?.id) {
			let leftX = Number.MAX_SAFE_INTEGER;
			let rightX = Number.MIN_SAFE_INTEGER;
			coordinates.forEach((coordinate, index) => {
				leftX = Math.min(leftX, coordinate.x);
				rightX = Math.max(rightX, coordinate.x);
				const point = overlay.points[index];
				if (isNumber(point.timestamp)) {
					const text = chartStore.getInnerFormatter().formatDate(point.timestamp, "YYYY-MM-DD HH:mm", "crosshair");
					figures.push({
						type: "text",
						attrs: {
							x: coordinate.x,
							y: 0,
							text,
							align: "center"
						},
						ignoreEvent: true
					});
				}
			});
			if (coordinates.length > 1) figures.unshift({
				type: "rect",
				attrs: {
					x: leftX,
					y: 0,
					width: rightX - leftX,
					height: widget.getBounding().height
				},
				ignoreEvent: true
			});
		}
		return figures;
	}
	getFigures(o, coordinates) {
		const widget = this.getWidget();
		const pane = widget.getPane();
		const chart = pane.getChart();
		const yAxis = pane.getYAxisComponentById();
		const xAxis = chart.getXAxisPane().getXAxisComponent();
		const bounding = widget.getBounding();
		return o.createXAxisFigures?.({
			chart,
			overlay: o,
			coordinates,
			bounding,
			xAxis,
			yAxis
		}) ?? [];
	}
};
var CrosshairVerticalLabelView = class extends CrosshairHorizontalLabelView {
	compare(crosshair) {
		return isValid(crosshair.timestamp);
	}
	getDirectionStyles(styles) {
		return styles.vertical;
	}
	getText(crosshair, chartStore) {
		const timestamp = crosshair.timestamp;
		return chartStore.getInnerFormatter().formatDate(timestamp, PeriodTypeCrosshairTooltipFormat[chartStore.getPeriod()?.type ?? "day"], "crosshair");
	}
	getTextAttrs(text, textWidth, crosshair, bounding, _axis, styles) {
		const x = crosshair.realX;
		let optimalX = 0;
		let align = "center";
		if (x - textWidth / 2 - styles.paddingLeft < 0) {
			optimalX = 0;
			align = "left";
		} else if (x + textWidth / 2 + styles.paddingRight > bounding.width) {
			optimalX = bounding.width;
			align = "right";
		} else optimalX = x;
		return {
			x: optimalX,
			y: 0,
			text,
			align,
			baseline: "top"
		};
	}
};
var XAxisWidget = class extends DrawWidget {
	constructor(rootContainer, pane) {
		super(rootContainer, pane);
		this._xAxisView = new XAxisView(this);
		this._overlayXAxisView = new OverlayXAxisView(this);
		this._crosshairVerticalLabelView = new CrosshairVerticalLabelView(this);
		this.setCursor("ew-resize");
		this.addChild(this._overlayXAxisView);
	}
	getName() {
		return WidgetNameConstants.X_AXIS;
	}
	updateMain(ctx) {
		this._xAxisView.draw(ctx);
	}
	updateOverlay(ctx) {
		this._overlayXAxisView.draw(ctx);
		this._crosshairVerticalLabelView.draw(ctx);
	}
};
var XAxisImp = class extends AxisImp {
	constructor(parent, xAxis) {
		super(parent);
		this.override(xAxis);
	}
	override(xAxis) {
		const { name, scrollZoomEnabled, createTicks } = xAxis;
		if (!isString(this.name) && isString(name)) this.name = name;
		this.scrollZoomEnabled = scrollZoomEnabled ?? this.scrollZoomEnabled;
		this.createTicks = createTicks ?? this.createTicks;
	}
	createRangeImp() {
		const { realFrom, realTo } = this.getParent().getChart().getChartStore().getVisibleRange();
		const af = realFrom;
		const at = realTo;
		const diff = realTo - realFrom + 1;
		return {
			from: af,
			to: at,
			range: diff,
			realFrom: af,
			realTo: at,
			realRange: diff,
			displayFrom: af,
			displayTo: at,
			displayRange: diff
		};
	}
	createTicksImp() {
		const { realFrom, realTo, from } = this.getRange();
		const chartStore = this.getParent().getChart().getChartStore();
		const formatDate = chartStore.getInnerFormatter().formatDate;
		const period = chartStore.getPeriod();
		const ticks = [];
		const barSpace = chartStore.getBarSpace().bar;
		const textStyles = chartStore.getStyles().xAxis.tickText;
		const tickTextWidth = Math.max(calcTextWidth("YYYY-MM-DD HH:mm:ss", textStyles.size, textStyles.weight, textStyles.family), this.getBounding().width / 8);
		let tickBetweenBarCount = Math.ceil(tickTextWidth / barSpace);
		if (tickBetweenBarCount % 2 !== 0) tickBetweenBarCount += 1;
		const startDataIndex = Math.max(0, Math.floor(realFrom / tickBetweenBarCount) * tickBetweenBarCount);
		for (let i = startDataIndex; i < realTo; i += tickBetweenBarCount) if (i >= from) {
			const timestamp = chartStore.dataIndexToTimestamp(i);
			if (isNumber(timestamp)) ticks.push({
				coord: this.convertToPixel(i),
				value: timestamp,
				text: formatDate(timestamp, PeriodTypeXAxisFormat[period?.type ?? "day"], "xAxis")
			});
		}
		if (isFunction(this.createTicks)) return this.createTicks({
			range: this.getRange(),
			bounding: this.getBounding(),
			defaultTicks: ticks
		});
		return ticks;
	}
	getAutoSize() {
		const styles = this.getParent().getChart().getStyles();
		const xAxisStyles = styles.xAxis;
		const height = xAxisStyles.size;
		if (height !== "auto") return height;
		const crosshairStyles = styles.crosshair;
		let xAxisHeight = 0;
		if (xAxisStyles.show) {
			if (xAxisStyles.axisLine.show) xAxisHeight += xAxisStyles.axisLine.size;
			if (xAxisStyles.tickLine.show) xAxisHeight += xAxisStyles.tickLine.length;
			if (xAxisStyles.tickText.show) xAxisHeight += xAxisStyles.tickText.marginStart + xAxisStyles.tickText.marginEnd + xAxisStyles.tickText.size;
		}
		let crosshairVerticalTextHeight = 0;
		if (crosshairStyles.show && crosshairStyles.vertical.show && crosshairStyles.vertical.text.show) crosshairVerticalTextHeight += crosshairStyles.vertical.text.paddingTop + crosshairStyles.vertical.text.paddingBottom + crosshairStyles.vertical.text.borderSize * 2 + crosshairStyles.vertical.text.size;
		return Math.max(xAxisHeight, crosshairVerticalTextHeight);
	}
	getBounding() {
		return this.getParent().getMainWidget().getBounding();
	}
	convertTimestampFromPixel(pixel) {
		const chartStore = this.getParent().getChart().getChartStore();
		const dataIndex = chartStore.coordinateToDataIndex(pixel);
		return chartStore.dataIndexToTimestamp(dataIndex);
	}
	convertTimestampToPixel(timestamp) {
		const chartStore = this.getParent().getChart().getChartStore();
		const dataIndex = chartStore.timestampToDataIndex(timestamp);
		return chartStore.dataIndexToCoordinate(dataIndex);
	}
	convertFromPixel(pixel) {
		return this.getParent().getChart().getChartStore().coordinateToDataIndex(pixel);
	}
	convertToPixel(value) {
		return this.getParent().getChart().getChartStore().dataIndexToCoordinate(value);
	}
	static extend(template) {
		class Custom extends XAxisImp {
			constructor(parent) {
				super(parent, template);
			}
		}
		return Custom;
	}
};
var xAxises = { normal: XAxisImp.extend({ name: "normal" }) };
function registerXAxis(axis) {
	xAxises[axis.name] = XAxisImp.extend(axis);
}
function getXAxisClass(name) {
	return xAxises[name] ?? xAxises.normal;
}
var XAxisPane = class extends DrawPane {
	constructor(chart, options) {
		super(chart, options);
		this.overrideXAxis({
			name: "normal",
			scrollZoomEnabled: true
		});
	}
	setOptions(options) {
		return super.setOptions(options);
	}
	overrideXAxis(xAxis) {
		const axisName = xAxis.name;
		if (!isValid(this._xAxis) || isValid(axisName) && this._xAxis.name !== axisName) this._xAxis = this.createXAxisComponent(axisName ?? "normal");
		this._xAxis.override(xAxis);
		this.setAxisCursor(this._xAxis.scrollZoomEnabled);
		return this;
	}
	getXAxisComponent() {
		return this._xAxis;
	}
	createXAxisComponent(name) {
		return new (getXAxisClass(name))(this);
	}
	createMainWidget(container) {
		return new XAxisWidget(container, this);
	}
};
function throttle(func, wait) {
	let previous = 0;
	return function() {
		const now = Date.now();
		if (now - previous > (wait ?? 20)) {
			func.apply(this, arguments);
			previous = now;
		}
	};
}
var SeparatorWidget = class extends Widget {
	constructor(rootContainer, pane) {
		super(rootContainer, pane);
		this._dragFlag = false;
		this._dragStartY = 0;
		this._topPaneHeight = 0;
		this._bottomPaneHeight = 0;
		this._topPane = null;
		this._bottomPane = null;
		this._pressedMouseMoveEvent = throttle(this._pressedTouchMouseMoveEvent, 20);
		this.registerEvent("touchStartEvent", this._mouseDownEvent.bind(this)).registerEvent("touchMoveEvent", this._pressedMouseMoveEvent.bind(this)).registerEvent("touchEndEvent", this._mouseUpEvent.bind(this)).registerEvent("mouseDownEvent", this._mouseDownEvent.bind(this)).registerEvent("mouseUpEvent", this._mouseUpEvent.bind(this)).registerEvent("pressedMouseMoveEvent", this._pressedMouseMoveEvent.bind(this)).registerEvent("mouseEnterEvent", this._mouseEnterEvent.bind(this)).registerEvent("mouseLeaveEvent", this._mouseLeaveEvent.bind(this));
	}
	getName() {
		return WidgetNameConstants.SEPARATOR;
	}
	_dragEnabled(topPane, bottomPane) {
		return topPane.getOptions().state === "normal" && bottomPane.getOptions().state === "normal" && bottomPane.getOptions().dragEnabled;
	}
	_findAdjustablePane(startIndex, step) {
		const drawPanes = this.getPane().getChart().getDrawPanes();
		for (let i = startIndex; i >= 0 && i < drawPanes.length; i += step) {
			const pane = drawPanes[i];
			if (pane.getId() !== PaneIdConstants.X_AXIS && pane.getOptions().state === "normal") return pane;
		}
		return null;
	}
	_findDragPanes() {
		const currentPane = this.getPane();
		const drawPanes = currentPane.getChart().getDrawPanes();
		const topPaneIndex = drawPanes.indexOf(currentPane.getTopPane());
		const bottomPaneIndex = drawPanes.indexOf(currentPane.getBottomPane());
		if (topPaneIndex === -1 || bottomPaneIndex === -1) return null;
		const topPane = this._findAdjustablePane(topPaneIndex, -1);
		const bottomPane = this._findAdjustablePane(bottomPaneIndex, 1);
		if (isValid(topPane) && isValid(bottomPane) && this._dragEnabled(topPane, bottomPane)) return {
			topPane,
			bottomPane
		};
		return null;
	}
	_mouseDownEvent(event) {
		const dragPanes = this._findDragPanes();
		if (!isValid(dragPanes)) {
			this._topPane = null;
			this._bottomPane = null;
			return false;
		}
		this._topPane = dragPanes.topPane;
		this._bottomPane = dragPanes.bottomPane;
		this._dragFlag = true;
		this._dragStartY = event.pageY;
		this._topPaneHeight = this._topPane.getBounding().height;
		this._bottomPaneHeight = this._bottomPane.getBounding().height;
		return true;
	}
	_mouseUpEvent() {
		this._dragFlag = false;
		this._topPane = null;
		this._bottomPane = null;
		this._topPaneHeight = 0;
		this._bottomPaneHeight = 0;
		return this._mouseLeaveEvent();
	}
	_pressedTouchMouseMoveEvent(event) {
		const dragDistance = event.pageY - this._dragStartY;
		const isUpDrag = dragDistance < 0;
		if (isValid(this._topPane) && isValid(this._bottomPane)) {
			if (this._dragEnabled(this._topPane, this._bottomPane)) {
				let reducedPane = null;
				let increasedPane = null;
				let startDragReducedPaneHeight = 0;
				let startDragIncreasedPaneHeight = 0;
				if (isUpDrag) {
					reducedPane = this._topPane;
					increasedPane = this._bottomPane;
					startDragReducedPaneHeight = this._topPaneHeight;
					startDragIncreasedPaneHeight = this._bottomPaneHeight;
				} else {
					reducedPane = this._bottomPane;
					increasedPane = this._topPane;
					startDragReducedPaneHeight = this._bottomPaneHeight;
					startDragIncreasedPaneHeight = this._topPaneHeight;
				}
				const reducedPaneMinHeight = reducedPane.getOptions().minHeight;
				if (startDragReducedPaneHeight > reducedPaneMinHeight) {
					const reducedPaneHeight = Math.max(startDragReducedPaneHeight - Math.abs(dragDistance), reducedPaneMinHeight);
					const diffHeight = startDragReducedPaneHeight - reducedPaneHeight;
					reducedPane.setBounding({ height: reducedPaneHeight });
					const increasedPaneHeight = startDragIncreasedPaneHeight + diffHeight;
					increasedPane.setBounding({ height: increasedPaneHeight });
					reducedPane.setOptions({ height: reducedPaneHeight });
					increasedPane.setOptions({ height: increasedPaneHeight });
					const currentPane = this.getPane();
					const chart = currentPane.getChart();
					chart.getChartStore().executeAction("onPaneDrag", { paneId: currentPane.getId() });
					chart.layout({
						measureHeight: true,
						measureWidth: true,
						update: true,
						buildYAxisTick: true,
						forceBuildYAxisTick: true
					});
				}
			}
		}
		return true;
	}
	_mouseEnterEvent() {
		if (isValid(this._findDragPanes())) {
			const styles = this.getPane().getChart().getStyles().separator;
			this.getContainer().style.background = styles.activeBackgroundColor;
			return true;
		}
		return false;
	}
	_mouseLeaveEvent() {
		if (!this._dragFlag) {
			this.getContainer().style.background = "transparent";
			return true;
		}
		return false;
	}
	createContainer() {
		return createDom("div", {
			width: "100%",
			height: `7px`,
			margin: "0",
			padding: "0",
			position: "absolute",
			top: "-3px",
			zIndex: "20",
			boxSizing: "border-box",
			cursor: "ns-resize"
		});
	}
	updateImp(container, _bounding, level) {
		if (level === UpdateLevel.All || level === UpdateLevel.Separator) {
			const styles = this.getPane().getChart().getStyles().separator;
			container.style.top = `${-Math.floor((7 - styles.size) / 2)}px`;
			container.style.height = `7px`;
		}
	}
};
var SeparatorPane = class extends Pane {
	constructor(chart, id, topPane, bottomPane) {
		super(chart, id);
		this.getContainer().style.overflow = "";
		this._topPane = topPane;
		this._bottomPane = bottomPane;
		this._separatorWidget = new SeparatorWidget(this.getContainer(), this);
	}
	setBounding(rootBounding) {
		merge(this.getBounding(), rootBounding);
		return this;
	}
	getTopPane() {
		return this._topPane;
	}
	setTopPane(pane) {
		this._topPane = pane;
		return this;
	}
	getBottomPane() {
		return this._bottomPane;
	}
	setBottomPane(pane) {
		this._bottomPane = pane;
		return this;
	}
	getWidget() {
		return this._separatorWidget;
	}
	getImage(_includeOverlay) {
		const { width, height } = this.getBounding();
		const styles = this.getChart().getStyles().separator;
		const canvas = createDom("canvas", {
			width: `${width}px`,
			height: `${height}px`,
			boxSizing: "border-box"
		});
		const ctx = canvas.getContext("2d");
		const pixelRatio = getPixelRatio(canvas);
		canvas.width = width * pixelRatio;
		canvas.height = height * pixelRatio;
		ctx.scale(pixelRatio, pixelRatio);
		ctx.fillStyle = styles.color;
		ctx.fillRect(0, 0, width, height);
		return canvas;
	}
	updateImp(level, container, bounding) {
		if (level === UpdateLevel.All || level === UpdateLevel.Separator) {
			const styles = this.getChart().getStyles().separator;
			container.style.backgroundColor = styles.color;
			container.style.height = `${bounding.height}px`;
			container.style.marginLeft = `${bounding.left}px`;
			container.style.width = `${bounding.width}px`;
			this._separatorWidget.update(level);
		}
	}
};
function isFF() {
	if (typeof window === "undefined") return false;
	return window.navigator.userAgent.toLowerCase().includes("firefox");
}
function isIOS() {
	if (typeof window === "undefined") return false;
	return /iPhone|iPad|iPod|iOS/.test(window.navigator.userAgent);
}
var Delay = {
	ResetClick: 500,
	LongTap: 500,
	PreventFiresTouchEvents: 500
};
var ManhattanDistance = {
	CancelClick: 5,
	CancelTap: 5,
	DoubleClick: 5,
	DoubleTap: 30
};
var MouseEventButton = {
	Left: 0,
	Middle: 1,
	Right: 2
};
var EventHandlerImp = class {
	constructor(target, handler, options) {
		this._clickCount = 0;
		this._clickTimeoutId = null;
		this._clickCoordinate = {
			x: Number.NEGATIVE_INFINITY,
			y: Number.POSITIVE_INFINITY
		};
		this._tapCount = 0;
		this._tapTimeoutId = null;
		this._tapCoordinate = {
			x: Number.NEGATIVE_INFINITY,
			y: Number.POSITIVE_INFINITY
		};
		this._longTapTimeoutId = null;
		this._longTapActive = false;
		this._mouseMoveStartCoordinate = null;
		this._touchMoveStartCoordinate = null;
		this._touchMoveExceededManhattanDistance = false;
		this._cancelClick = false;
		this._cancelTap = false;
		this._unsubscribeOutsideMouseEvents = null;
		this._unsubscribeOutsideTouchEvents = null;
		this._unsubscribeMobileSafariEvents = null;
		this._unsubscribeMousemove = null;
		this._unsubscribeMouseWheel = null;
		this._unsubscribeContextMenu = null;
		this._unsubscribeRootMouseEvents = null;
		this._unsubscribeRootTouchEvents = null;
		this._startPinchMiddleCoordinate = null;
		this._startPinchDistance = 0;
		this._pinchPrevented = false;
		this._preventTouchDragProcess = false;
		this._mousePressed = false;
		this._lastTouchEventTimeStamp = 0;
		this._activeTouchId = null;
		this._acceptMouseLeave = !isIOS();
		this._onFirefoxOutsideMouseUp = (mouseUpEvent) => {
			this._mouseUpHandler(mouseUpEvent);
		};
		this._onMobileSafariDoubleClick = (dblClickEvent) => {
			if (this._firesTouchEvents(dblClickEvent)) {
				++this._tapCount;
				if (this._tapTimeoutId !== null && this._tapCount > 1) {
					const { manhattanDistance } = this._mouseTouchMoveWithDownInfo(this._getCoordinate(dblClickEvent), this._tapCoordinate);
					if (manhattanDistance < ManhattanDistance.DoubleTap && !this._cancelTap) this._processEvent(this._makeCompatEvent(dblClickEvent), this._handler.doubleTapEvent);
					this._resetTapTimeout();
				}
			} else {
				++this._clickCount;
				if (this._clickTimeoutId !== null && this._clickCount > 1) {
					const { manhattanDistance } = this._mouseTouchMoveWithDownInfo(this._getCoordinate(dblClickEvent), this._clickCoordinate);
					if (manhattanDistance < ManhattanDistance.DoubleClick && !this._cancelClick) this._processEvent(this._makeCompatEvent(dblClickEvent), this._handler.mouseDoubleClickEvent);
					this._resetClickTimeout();
				}
			}
		};
		this._target = target;
		this._handler = handler;
		this._options = options;
		this._init();
	}
	destroy() {
		if (this._unsubscribeOutsideMouseEvents !== null) {
			this._unsubscribeOutsideMouseEvents();
			this._unsubscribeOutsideMouseEvents = null;
		}
		if (this._unsubscribeOutsideTouchEvents !== null) {
			this._unsubscribeOutsideTouchEvents();
			this._unsubscribeOutsideTouchEvents = null;
		}
		if (this._unsubscribeMousemove !== null) {
			this._unsubscribeMousemove();
			this._unsubscribeMousemove = null;
		}
		if (this._unsubscribeMouseWheel !== null) {
			this._unsubscribeMouseWheel();
			this._unsubscribeMouseWheel = null;
		}
		if (this._unsubscribeContextMenu !== null) {
			this._unsubscribeContextMenu();
			this._unsubscribeContextMenu = null;
		}
		if (this._unsubscribeRootMouseEvents !== null) {
			this._unsubscribeRootMouseEvents();
			this._unsubscribeRootMouseEvents = null;
		}
		if (this._unsubscribeRootTouchEvents !== null) {
			this._unsubscribeRootTouchEvents();
			this._unsubscribeRootTouchEvents = null;
		}
		if (this._unsubscribeMobileSafariEvents !== null) {
			this._unsubscribeMobileSafariEvents();
			this._unsubscribeMobileSafariEvents = null;
		}
		this._clearLongTapTimeout();
		this._resetClickTimeout();
	}
	_mouseEnterHandler(enterEvent) {
		this._unsubscribeMousemove?.();
		this._unsubscribeMouseWheel?.();
		this._unsubscribeContextMenu?.();
		const boundMouseMoveHandler = this._mouseMoveHandler.bind(this);
		this._unsubscribeMousemove = () => {
			this._target.removeEventListener("mousemove", boundMouseMoveHandler);
		};
		this._target.addEventListener("mousemove", boundMouseMoveHandler);
		const boundMouseWheel = this._mouseWheelHandler.bind(this);
		this._unsubscribeMouseWheel = () => {
			this._target.removeEventListener("wheel", boundMouseWheel);
		};
		this._target.addEventListener("wheel", boundMouseWheel, { passive: false });
		const boundContextMenu = this._contextMenuHandler.bind(this);
		this._unsubscribeContextMenu = () => {
			this._target.removeEventListener("contextmenu", boundContextMenu);
		};
		this._target.addEventListener("contextmenu", boundContextMenu, { passive: false });
		if (this._firesTouchEvents(enterEvent)) return;
		this._processEvent(this._makeCompatEvent(enterEvent), this._handler.mouseEnterEvent);
		this._acceptMouseLeave = true;
	}
	_resetClickTimeout() {
		if (this._clickTimeoutId !== null) clearTimeout(this._clickTimeoutId);
		this._clickCount = 0;
		this._clickTimeoutId = null;
		this._clickCoordinate = {
			x: Number.NEGATIVE_INFINITY,
			y: Number.POSITIVE_INFINITY
		};
	}
	_resetTapTimeout() {
		if (this._tapTimeoutId !== null) clearTimeout(this._tapTimeoutId);
		this._tapCount = 0;
		this._tapTimeoutId = null;
		this._tapCoordinate = {
			x: Number.NEGATIVE_INFINITY,
			y: Number.POSITIVE_INFINITY
		};
	}
	_mouseMoveHandler(moveEvent) {
		if (this._mousePressed || this._touchMoveStartCoordinate !== null) return;
		if (this._firesTouchEvents(moveEvent)) return;
		this._processEvent(this._makeCompatEvent(moveEvent), this._handler.mouseMoveEvent);
		this._acceptMouseLeave = true;
	}
	_mouseWheelHandler(wheelEvent) {
		if (Math.abs(wheelEvent.deltaX) > Math.abs(wheelEvent.deltaY)) {
			if (!isValid(this._handler.mouseWheelHortEvent)) return;
			this._preventDefault(wheelEvent);
			if (Math.abs(wheelEvent.deltaX) === 0) return;
			this._handler.mouseWheelHortEvent(this._makeCompatEvent(wheelEvent), -wheelEvent.deltaX);
		} else {
			if (!isValid(this._handler.mouseWheelVertEvent)) return;
			let deltaY = -(wheelEvent.deltaY / 100);
			if (deltaY === 0) return;
			this._preventDefault(wheelEvent);
			switch (wheelEvent.deltaMode) {
				case wheelEvent.DOM_DELTA_PAGE:
					deltaY *= 120;
					break;
				case wheelEvent.DOM_DELTA_LINE:
					deltaY *= 32;
					break;
			}
			if (deltaY !== 0) {
				const scale = Math.sign(deltaY) * Math.min(1, Math.abs(deltaY));
				this._handler.mouseWheelVertEvent(this._makeCompatEvent(wheelEvent), scale);
			}
		}
	}
	_contextMenuHandler(mouseEvent) {
		this._preventDefault(mouseEvent);
	}
	_touchMoveHandler(moveEvent) {
		const touch = this._touchWithId(moveEvent.changedTouches, this._activeTouchId);
		if (touch === null) return;
		this._lastTouchEventTimeStamp = this._eventTimeStamp(moveEvent);
		if (this._startPinchMiddleCoordinate !== null) return;
		if (this._preventTouchDragProcess) return;
		this._pinchPrevented = true;
		const { xOffset, yOffset, manhattanDistance } = this._mouseTouchMoveWithDownInfo(this._getCoordinate(touch), this._touchMoveStartCoordinate);
		if (!this._touchMoveExceededManhattanDistance && manhattanDistance < ManhattanDistance.CancelTap) return;
		if (!this._touchMoveExceededManhattanDistance) {
			const correctedXOffset = xOffset * .5;
			const isVertDrag = yOffset >= correctedXOffset && !this._options.treatVertDragAsPageScroll();
			const isHorzDrag = correctedXOffset > yOffset && !this._options.treatHorzDragAsPageScroll();
			if (!isVertDrag && !isHorzDrag) this._preventTouchDragProcess = true;
			this._touchMoveExceededManhattanDistance = true;
			this._cancelTap = true;
			this._clearLongTapTimeout();
			this._resetTapTimeout();
		}
		if (!this._preventTouchDragProcess) this._processEvent(this._makeCompatEvent(moveEvent, touch), this._handler.touchMoveEvent);
	}
	_mouseMoveWithDownHandler(moveEvent) {
		if (moveEvent.button !== MouseEventButton.Left) return;
		const { manhattanDistance } = this._mouseTouchMoveWithDownInfo(this._getCoordinate(moveEvent), this._mouseMoveStartCoordinate);
		if (manhattanDistance >= ManhattanDistance.CancelClick) {
			this._cancelClick = true;
			this._resetClickTimeout();
		}
		if (this._cancelClick) this._processEvent(this._makeCompatEvent(moveEvent), this._handler.pressedMouseMoveEvent);
	}
	_mouseTouchMoveWithDownInfo(currentCoordinate, startCoordinate) {
		const xOffset = Math.abs(startCoordinate.x - currentCoordinate.x);
		const yOffset = Math.abs(startCoordinate.y - currentCoordinate.y);
		return {
			xOffset,
			yOffset,
			manhattanDistance: xOffset + yOffset
		};
	}
	_touchEndHandler(touchEndEvent) {
		let touch = this._touchWithId(touchEndEvent.changedTouches, this._activeTouchId);
		if (touch === null && touchEndEvent.touches.length === 0) touch = touchEndEvent.changedTouches[0];
		if (touch === null) return;
		this._activeTouchId = null;
		this._lastTouchEventTimeStamp = this._eventTimeStamp(touchEndEvent);
		this._clearLongTapTimeout();
		this._touchMoveStartCoordinate = null;
		if (this._unsubscribeRootTouchEvents !== null) {
			this._unsubscribeRootTouchEvents();
			this._unsubscribeRootTouchEvents = null;
		}
		const compatEvent = this._makeCompatEvent(touchEndEvent, touch);
		this._processEvent(compatEvent, this._handler.touchEndEvent);
		++this._tapCount;
		if (this._tapTimeoutId !== null && this._tapCount > 1) {
			const { manhattanDistance } = this._mouseTouchMoveWithDownInfo(this._getCoordinate(touch), this._tapCoordinate);
			if (manhattanDistance < ManhattanDistance.DoubleTap && !this._cancelTap) this._processEvent(compatEvent, this._handler.doubleTapEvent);
			this._resetTapTimeout();
		} else if (!this._cancelTap) {
			this._processEvent(compatEvent, this._handler.tapEvent);
			if (isValid(this._handler.tapEvent)) this._preventDefault(touchEndEvent);
		}
		if (this._tapCount === 0) this._preventDefault(touchEndEvent);
		if (touchEndEvent.touches.length === 0) {
			if (this._longTapActive) {
				this._longTapActive = false;
				this._preventDefault(touchEndEvent);
			}
		}
	}
	_mouseUpHandler(mouseUpEvent) {
		if (mouseUpEvent.button !== MouseEventButton.Left) return;
		const compatEvent = this._makeCompatEvent(mouseUpEvent);
		this._mouseMoveStartCoordinate = null;
		this._mousePressed = false;
		if (this._unsubscribeRootMouseEvents !== null) {
			this._unsubscribeRootMouseEvents();
			this._unsubscribeRootMouseEvents = null;
		}
		if (isFF()) this._target.ownerDocument.documentElement.removeEventListener("mouseleave", this._onFirefoxOutsideMouseUp);
		if (this._firesTouchEvents(mouseUpEvent)) return;
		this._processEvent(compatEvent, this._handler.mouseUpEvent);
		++this._clickCount;
		if (this._clickTimeoutId !== null && this._clickCount > 1) {
			const { manhattanDistance } = this._mouseTouchMoveWithDownInfo(this._getCoordinate(mouseUpEvent), this._clickCoordinate);
			if (manhattanDistance < ManhattanDistance.DoubleClick && !this._cancelClick) this._processEvent(compatEvent, this._handler.mouseDoubleClickEvent);
			this._resetClickTimeout();
		} else if (!this._cancelClick) this._processEvent(compatEvent, this._handler.mouseClickEvent);
	}
	_clearLongTapTimeout() {
		if (this._longTapTimeoutId === null) return;
		clearTimeout(this._longTapTimeoutId);
		this._longTapTimeoutId = null;
	}
	_touchStartHandler(downEvent) {
		if (this._activeTouchId !== null) return;
		const touch = downEvent.changedTouches[0];
		this._activeTouchId = touch.identifier;
		this._lastTouchEventTimeStamp = this._eventTimeStamp(downEvent);
		const rootElement = this._target.ownerDocument.documentElement;
		this._cancelTap = false;
		this._touchMoveExceededManhattanDistance = false;
		this._preventTouchDragProcess = false;
		this._touchMoveStartCoordinate = this._getCoordinate(touch);
		if (this._unsubscribeRootTouchEvents !== null) {
			this._unsubscribeRootTouchEvents();
			this._unsubscribeRootTouchEvents = null;
		}
		{
			const boundTouchMoveWithDownHandler = this._touchMoveHandler.bind(this);
			const boundTouchEndHandler = this._touchEndHandler.bind(this);
			this._unsubscribeRootTouchEvents = () => {
				rootElement.removeEventListener("touchmove", boundTouchMoveWithDownHandler);
				rootElement.removeEventListener("touchend", boundTouchEndHandler);
			};
			rootElement.addEventListener("touchmove", boundTouchMoveWithDownHandler, { passive: false });
			rootElement.addEventListener("touchend", boundTouchEndHandler, { passive: false });
			this._clearLongTapTimeout();
			this._longTapTimeoutId = setTimeout(this._longTapHandler.bind(this, downEvent), Delay.LongTap);
		}
		this._processEvent(this._makeCompatEvent(downEvent, touch), this._handler.touchStartEvent);
		if (this._tapTimeoutId === null) {
			this._tapCount = 0;
			this._tapTimeoutId = setTimeout(this._resetTapTimeout.bind(this), Delay.ResetClick);
			this._tapCoordinate = this._getCoordinate(touch);
		}
	}
	_mouseDownHandler(downEvent) {
		if (downEvent.button === MouseEventButton.Right) {
			this._preventDefault(downEvent);
			this._processEvent(this._makeCompatEvent(downEvent), this._handler.mouseRightClickEvent);
			return;
		}
		if (downEvent.button !== MouseEventButton.Left) return;
		const rootElement = this._target.ownerDocument.documentElement;
		if (isFF()) rootElement.addEventListener("mouseleave", this._onFirefoxOutsideMouseUp);
		this._cancelClick = false;
		this._mouseMoveStartCoordinate = this._getCoordinate(downEvent);
		if (this._unsubscribeRootMouseEvents !== null) {
			this._unsubscribeRootMouseEvents();
			this._unsubscribeRootMouseEvents = null;
		}
		{
			const boundMouseMoveWithDownHandler = this._mouseMoveWithDownHandler.bind(this);
			const boundMouseUpHandler = this._mouseUpHandler.bind(this);
			this._unsubscribeRootMouseEvents = () => {
				rootElement.removeEventListener("mousemove", boundMouseMoveWithDownHandler);
				rootElement.removeEventListener("mouseup", boundMouseUpHandler);
			};
			rootElement.addEventListener("mousemove", boundMouseMoveWithDownHandler);
			rootElement.addEventListener("mouseup", boundMouseUpHandler);
		}
		this._mousePressed = true;
		if (this._firesTouchEvents(downEvent)) return;
		this._processEvent(this._makeCompatEvent(downEvent), this._handler.mouseDownEvent);
		if (this._clickTimeoutId === null) {
			this._clickCount = 0;
			this._clickTimeoutId = setTimeout(this._resetClickTimeout.bind(this), Delay.ResetClick);
			this._clickCoordinate = this._getCoordinate(downEvent);
		}
	}
	_init() {
		this._target.addEventListener("mouseenter", this._mouseEnterHandler.bind(this));
		this._target.addEventListener("touchcancel", this._clearLongTapTimeout.bind(this));
		{
			const doc = this._target.ownerDocument;
			const outsideHandler = (event) => {
				if (this._handler.mouseDownOutsideEvent == null) return;
				if (event.composed && this._target.contains(event.composedPath()[0])) return;
				if (event.target !== null && this._target.contains(event.target)) return;
				this._handler.mouseDownOutsideEvent({
					x: 0,
					y: 0,
					pageX: 0,
					pageY: 0
				});
			};
			this._unsubscribeOutsideTouchEvents = () => {
				doc.removeEventListener("touchstart", outsideHandler);
			};
			this._unsubscribeOutsideMouseEvents = () => {
				doc.removeEventListener("mousedown", outsideHandler);
			};
			doc.addEventListener("mousedown", outsideHandler);
			doc.addEventListener("touchstart", outsideHandler, { passive: true });
		}
		if (isIOS()) {
			this._unsubscribeMobileSafariEvents = () => {
				this._target.removeEventListener("dblclick", this._onMobileSafariDoubleClick);
			};
			this._target.addEventListener("dblclick", this._onMobileSafariDoubleClick);
		}
		this._target.addEventListener("mouseleave", this._mouseLeaveHandler.bind(this));
		this._target.addEventListener("touchstart", this._touchStartHandler.bind(this), { passive: true });
		this._target.addEventListener("mousedown", (e) => {
			if (e.button === MouseEventButton.Middle) {
				e.preventDefault();
				return false;
			}
		});
		this._target.addEventListener("mousedown", this._mouseDownHandler.bind(this));
		this._initPinch();
		this._target.addEventListener("touchmove", () => {}, { passive: false });
	}
	_initPinch() {
		if (!isValid(this._handler.pinchStartEvent) && !isValid(this._handler.pinchEvent) && !isValid(this._handler.pinchEndEvent)) return;
		this._target.addEventListener("touchstart", (event) => {
			this._checkPinchState(event.touches);
		}, { passive: true });
		this._target.addEventListener("touchmove", (event) => {
			if (event.touches.length !== 2 || this._startPinchMiddleCoordinate === null) return;
			if (isValid(this._handler.pinchEvent)) {
				const scale = this._getTouchDistance(event.touches[0], event.touches[1]) / this._startPinchDistance;
				this._handler.pinchEvent({
					...this._startPinchMiddleCoordinate,
					pageX: 0,
					pageY: 0
				}, scale);
				this._preventDefault(event);
			}
		}, { passive: false });
		this._target.addEventListener("touchend", (event) => {
			this._checkPinchState(event.touches);
		});
	}
	_checkPinchState(touches) {
		if (touches.length === 1) this._pinchPrevented = false;
		if (touches.length !== 2 || this._pinchPrevented || this._longTapActive) this._stopPinch();
		else this._startPinch(touches);
	}
	_startPinch(touches) {
		const box = this._target.getBoundingClientRect();
		this._startPinchMiddleCoordinate = {
			x: (touches[0].clientX - box.left + (touches[1].clientX - box.left)) / 2,
			y: (touches[0].clientY - box.top + (touches[1].clientY - box.top)) / 2
		};
		this._startPinchDistance = this._getTouchDistance(touches[0], touches[1]);
		if (isValid(this._handler.pinchStartEvent)) this._handler.pinchStartEvent({
			x: 0,
			y: 0,
			pageX: 0,
			pageY: 0
		});
		this._clearLongTapTimeout();
	}
	_stopPinch() {
		if (this._startPinchMiddleCoordinate === null) return;
		this._startPinchMiddleCoordinate = null;
		if (isValid(this._handler.pinchEndEvent)) this._handler.pinchEndEvent({
			x: 0,
			y: 0,
			pageX: 0,
			pageY: 0
		});
	}
	_mouseLeaveHandler(event) {
		this._unsubscribeMousemove?.();
		this._unsubscribeMouseWheel?.();
		this._unsubscribeContextMenu?.();
		if (this._firesTouchEvents(event)) return;
		if (!this._acceptMouseLeave) return;
		this._processEvent(this._makeCompatEvent(event), this._handler.mouseLeaveEvent);
		this._acceptMouseLeave = !isIOS();
	}
	_longTapHandler(event) {
		const touch = this._touchWithId(event.touches, this._activeTouchId);
		if (touch === null) return;
		this._processEvent(this._makeCompatEvent(event, touch), this._handler.longTapEvent);
		this._cancelTap = true;
		this._longTapActive = true;
	}
	_firesTouchEvents(e) {
		if (isValid(e.sourceCapabilities?.firesTouchEvents)) return e.sourceCapabilities.firesTouchEvents;
		return this._eventTimeStamp(e) < this._lastTouchEventTimeStamp + Delay.PreventFiresTouchEvents;
	}
	_processEvent(event, callback) {
		callback?.call(this._handler, event);
	}
	_makeCompatEvent(event, touch) {
		const eventLike = touch ?? event;
		const box = this._target.getBoundingClientRect();
		return {
			x: eventLike.clientX - box.left,
			y: eventLike.clientY - box.top,
			pageX: eventLike.pageX,
			pageY: eventLike.pageY,
			isTouch: !event.type.startsWith("mouse") && event.type !== "contextmenu" && event.type !== "click" && event.type !== "wheel",
			preventDefault: () => {
				if (event.type !== "touchstart") this._preventDefault(event);
			}
		};
	}
	_getTouchDistance(p1, p2) {
		const xDiff = p1.clientX - p2.clientX;
		const yDiff = p1.clientY - p2.clientY;
		return Math.sqrt(xDiff * xDiff + yDiff * yDiff);
	}
	_preventDefault(event) {
		if (event.cancelable) event.preventDefault();
	}
	_getCoordinate(eventLike) {
		return {
			x: eventLike.pageX,
			y: eventLike.pageY
		};
	}
	_eventTimeStamp(e) {
		return e.timeStamp ?? performance.now();
	}
	_touchWithId(touches, id) {
		for (let i = 0; i < touches.length; ++i) if (touches[i].identifier === id) return touches[i];
		return null;
	}
};
var Event = class {
	_getYAxisByWidget(widget) {
		if (widget.getName() === WidgetNameConstants.Y_AXIS) return widget.getAxisComponent();
		return widget.getPane().getYAxisComponentById();
	}
	constructor(container, chart) {
		this._flingStartTime = (/* @__PURE__ */ new Date()).getTime();
		this._flingScrollRequestId = null;
		this._startScrollCoordinate = null;
		this._touchCoordinate = null;
		this._touchCancelCrosshair = false;
		this._touchZoomed = false;
		this._pinchScale = 1;
		this._mouseDownWidget = null;
		this._prevYAxisRanges = /* @__PURE__ */ new Map();
		this._xAxisStartScaleCoordinate = null;
		this._xAxisStartScaleDistance = 0;
		this._xAxisScale = 1;
		this._yAxisStartScaleDistance = 0;
		this._mouseMoveTriggerWidgetInfo = {
			pane: null,
			widget: null
		};
		this._boundKeyBoardDownEvent = (event) => {
			if (event.shiftKey) switch (event.code) {
				case "Equal":
					this._chart.getChartStore().zoom(.5, null, "main");
					break;
				case "Minus":
					this._chart.getChartStore().zoom(-.5, null, "main");
					break;
				case "ArrowLeft": {
					const store = this._chart.getChartStore();
					store.startScroll();
					store.scroll(-3 * store.getBarSpace().bar);
					break;
				}
				case "ArrowRight": {
					const store = this._chart.getChartStore();
					store.startScroll();
					store.scroll(3 * store.getBarSpace().bar);
					break;
				}
				default: break;
			}
		};
		this._container = container;
		this._chart = chart;
		this._event = new EventHandlerImp(container, this, {
			treatVertDragAsPageScroll: () => false,
			treatHorzDragAsPageScroll: () => false
		});
		container.addEventListener("keydown", this._boundKeyBoardDownEvent);
	}
	pinchStartEvent() {
		this._touchZoomed = true;
		this._pinchScale = 1;
		return true;
	}
	pinchEvent(e, scale) {
		const { pane, widget } = this._findWidgetByEvent(e);
		if (pane?.getId() !== PaneIdConstants.X_AXIS && widget?.getName() === WidgetNameConstants.MAIN) {
			const event = this._makeWidgetEvent(e, widget);
			const zoomScale = (scale - this._pinchScale) * 5;
			this._pinchScale = scale;
			this._chart.getChartStore().zoom(zoomScale, {
				x: event.x,
				y: event.y
			}, "main");
			return true;
		}
		return false;
	}
	mouseWheelHortEvent(_, distance) {
		const store = this._chart.getChartStore();
		store.startScroll();
		store.scroll(distance);
		return true;
	}
	mouseWheelVertEvent(e, scale) {
		const { widget } = this._findWidgetByEvent(e);
		const event = this._makeWidgetEvent(e, widget);
		if (widget?.getName() === WidgetNameConstants.MAIN) {
			this._chart.getChartStore().zoom(scale, {
				x: event.x,
				y: event.y
			}, "main");
			return true;
		}
		return false;
	}
	mouseDownEvent(e) {
		const { pane, widget } = this._findWidgetByEvent(e);
		this._mouseDownWidget = widget;
		if (widget !== null) {
			const event = this._makeWidgetEvent(e, widget);
			switch (widget.getName()) {
				case WidgetNameConstants.SEPARATOR: return widget.dispatchEvent("mouseDownEvent", event);
				case WidgetNameConstants.MAIN: {
					const yAxes = pane.getYAxisComponents();
					for (const item of yAxes) {
						const yAxis = item;
						if (!yAxis.getAutoCalcTickFlag()) {
							const range = yAxis.getRange();
							this._prevYAxisRanges.set(yAxis, { ...range });
						}
					}
					this._startScrollCoordinate = {
						x: event.x,
						y: event.y
					};
					this._chart.getChartStore().startScroll();
					return widget.dispatchEvent("mouseDownEvent", event);
				}
				case WidgetNameConstants.X_AXIS: return this._processXAxisScrollStartEvent(widget, event);
				case WidgetNameConstants.Y_AXIS: return this._processYAxisScaleStartEvent(widget, event);
			}
		}
		return false;
	}
	mouseMoveEvent(e) {
		const { pane, widget } = this._findWidgetByEvent(e);
		const event = this._makeWidgetEvent(e, widget);
		if (this._mouseMoveTriggerWidgetInfo.pane?.getId() !== pane?.getId() || this._mouseMoveTriggerWidgetInfo.widget?.getName() !== widget?.getName()) {
			widget?.dispatchEvent("mouseEnterEvent", event);
			this._mouseMoveTriggerWidgetInfo.widget?.dispatchEvent("mouseLeaveEvent", event);
			this._mouseMoveTriggerWidgetInfo = {
				pane,
				widget
			};
		}
		if (widget !== null) switch (widget.getName()) {
			case WidgetNameConstants.MAIN: {
				const consumed = widget.dispatchEvent("mouseMoveEvent", event);
				let crosshair = {
					x: event.x,
					y: event.y,
					paneId: pane?.getId()
				};
				if (consumed) {
					if (widget.getForceCursor() !== "pointer") crosshair = void 0;
					widget.setCursor("pointer");
				} else widget.setCursor("crosshair");
				this._chart.getChartStore().setCrosshair(crosshair);
				return consumed;
			}
			case WidgetNameConstants.SEPARATOR:
			case WidgetNameConstants.X_AXIS:
			case WidgetNameConstants.Y_AXIS: {
				const consumed = widget.dispatchEvent("mouseMoveEvent", event);
				this._chart.getChartStore().setCrosshair();
				return consumed;
			}
		}
		return false;
	}
	pressedMouseMoveEvent(e) {
		if (this._mouseDownWidget !== null && this._mouseDownWidget.getName() === WidgetNameConstants.SEPARATOR) return this._mouseDownWidget.dispatchEvent("pressedMouseMoveEvent", e);
		const { pane, widget } = this._findWidgetByEvent(e);
		if (widget !== null && this._mouseDownWidget?.getPane().getId() === pane?.getId() && this._mouseDownWidget?.getName() === widget.getName()) {
			const event = this._makeWidgetEvent(e, widget);
			switch (widget.getName()) {
				case WidgetNameConstants.MAIN: {
					let crosshair;
					const consumed = widget.dispatchEvent("pressedMouseMoveEvent", event);
					if (!consumed) this._processMainScrollingEvent(widget, event);
					if (!consumed || widget.getForceCursor() === "pointer") crosshair = {
						x: event.x,
						y: event.y,
						paneId: pane?.getId()
					};
					this._chart.getChartStore().setCrosshair(crosshair, { forceInvalidate: true });
					return consumed;
				}
				case WidgetNameConstants.X_AXIS: return this._processXAxisScrollingEvent(widget, event);
				case WidgetNameConstants.Y_AXIS: return this._processYAxisScalingEvent(widget, event);
			}
		}
		return false;
	}
	mouseUpEvent(e) {
		const { widget } = this._findWidgetByEvent(e);
		let consumed = false;
		if (widget !== null) {
			const event = this._makeWidgetEvent(e, widget);
			switch (widget.getName()) {
				case WidgetNameConstants.MAIN:
				case WidgetNameConstants.SEPARATOR:
				case WidgetNameConstants.X_AXIS:
				case WidgetNameConstants.Y_AXIS:
					consumed = widget.dispatchEvent("mouseUpEvent", event);
					break;
			}
			if (consumed) this._chart.updatePane(UpdateLevel.Overlay);
		}
		this._mouseDownWidget = null;
		this._startScrollCoordinate = null;
		this._prevYAxisRanges.clear();
		this._xAxisStartScaleCoordinate = null;
		this._xAxisStartScaleDistance = 0;
		this._xAxisScale = 1;
		this._yAxisStartScaleDistance = 0;
		return consumed;
	}
	mouseClickEvent(e) {
		const { widget } = this._findWidgetByEvent(e);
		if (widget !== null) {
			const event = this._makeWidgetEvent(e, widget);
			return widget.dispatchEvent("mouseClickEvent", event);
		}
		return false;
	}
	mouseRightClickEvent(e) {
		const { widget } = this._findWidgetByEvent(e);
		let consumed = false;
		if (widget !== null) {
			const event = this._makeWidgetEvent(e, widget);
			switch (widget.getName()) {
				case WidgetNameConstants.MAIN:
				case WidgetNameConstants.X_AXIS:
				case WidgetNameConstants.Y_AXIS:
					consumed = widget.dispatchEvent("mouseRightClickEvent", event);
					break;
			}
			if (consumed) this._chart.updatePane(UpdateLevel.Overlay);
		}
		return false;
	}
	mouseDoubleClickEvent(e) {
		const { widget } = this._findWidgetByEvent(e);
		if (widget !== null) switch (widget.getName()) {
			case WidgetNameConstants.MAIN: {
				const event = this._makeWidgetEvent(e, widget);
				return widget.dispatchEvent("mouseDoubleClickEvent", event);
			}
			case WidgetNameConstants.Y_AXIS: {
				const yAxis = this._getYAxisByWidget(widget);
				if (!yAxis.getAutoCalcTickFlag()) {
					yAxis.setAutoCalcTickFlag(true);
					this._chart.layout({
						measureWidth: true,
						update: true,
						buildYAxisTick: true
					});
					return true;
				}
				break;
			}
		}
		return false;
	}
	mouseLeaveEvent() {
		this._chart.getChartStore().setCrosshair();
		return true;
	}
	touchStartEvent(e) {
		const { pane, widget } = this._findWidgetByEvent(e);
		if (widget !== null) {
			const event = this._makeWidgetEvent(e, widget);
			event.preventDefault?.();
			switch (widget.getName()) {
				case WidgetNameConstants.MAIN: {
					const chartStore = this._chart.getChartStore();
					if (widget.dispatchEvent("mouseDownEvent", event)) {
						this._touchCancelCrosshair = true;
						this._touchCoordinate = null;
						chartStore.setCrosshair(void 0, { notInvalidate: true });
						this._chart.updatePane(UpdateLevel.Overlay);
						return true;
					}
					if (this._flingScrollRequestId !== null) {
						cancelAnimationFrame(this._flingScrollRequestId);
						this._flingScrollRequestId = null;
					}
					this._flingStartTime = (/* @__PURE__ */ new Date()).getTime();
					const yAxes = pane.getYAxisComponents();
					for (const item of yAxes) {
						const yAxis = item;
						if (!yAxis.getAutoCalcTickFlag()) {
							const range = yAxis.getRange();
							this._prevYAxisRanges.set(yAxis, { ...range });
						}
					}
					this._startScrollCoordinate = {
						x: event.x,
						y: event.y
					};
					chartStore.startScroll();
					this._touchZoomed = false;
					if (this._touchCoordinate !== null) {
						const xDif = event.x - this._touchCoordinate.x;
						const yDif = event.y - this._touchCoordinate.y;
						if (Math.sqrt(xDif * xDif + yDif * yDif) < 10) {
							this._touchCoordinate = {
								x: event.x,
								y: event.y
							};
							chartStore.setCrosshair({
								x: event.x,
								y: event.y,
								paneId: pane?.getId()
							});
						} else {
							this._touchCoordinate = null;
							this._touchCancelCrosshair = true;
							chartStore.setCrosshair();
						}
					}
					return true;
				}
				case WidgetNameConstants.X_AXIS: return this._processXAxisScrollStartEvent(widget, event);
				case WidgetNameConstants.Y_AXIS: return this._processYAxisScaleStartEvent(widget, event);
			}
		}
		return false;
	}
	touchMoveEvent(e) {
		const { pane, widget } = this._findWidgetByEvent(e);
		if (widget !== null) {
			const event = this._makeWidgetEvent(e, widget);
			const name = widget.getName();
			const chartStore = this._chart.getChartStore();
			switch (name) {
				case WidgetNameConstants.MAIN:
					if (widget.dispatchEvent("pressedMouseMoveEvent", event)) {
						event.preventDefault?.();
						chartStore.setCrosshair(void 0, { notInvalidate: true });
						this._chart.updatePane(UpdateLevel.Overlay);
						return true;
					}
					if (this._touchCoordinate !== null) {
						event.preventDefault?.();
						chartStore.setCrosshair({
							x: event.x,
							y: event.y,
							paneId: pane?.getId()
						});
					} else this._processMainScrollingEvent(widget, event);
					return true;
				case WidgetNameConstants.X_AXIS:
					event.preventDefault?.();
					return this._processXAxisScrollingEvent(widget, event);
				case WidgetNameConstants.Y_AXIS: return this._processYAxisScalingEvent(widget, event);
			}
		}
		return false;
	}
	touchEndEvent(e) {
		const { widget } = this._findWidgetByEvent(e);
		if (widget !== null) {
			const event = this._makeWidgetEvent(e, widget);
			switch (widget.getName()) {
				case WidgetNameConstants.MAIN:
					widget.dispatchEvent("mouseUpEvent", event);
					if (this._startScrollCoordinate !== null) {
						const time = (/* @__PURE__ */ new Date()).getTime() - this._flingStartTime;
						let v = (event.x - this._startScrollCoordinate.x) / (time > 0 ? time : 1) * 20;
						if (time < 200 && Math.abs(v) > 0) {
							const store = this._chart.getChartStore();
							const flingScroll = () => {
								this._flingScrollRequestId = requestAnimationFrame(() => {
									store.startScroll();
									store.scroll(v);
									v = v * .975;
									if (Math.abs(v) < 1) {
										if (this._flingScrollRequestId !== null) {
											cancelAnimationFrame(this._flingScrollRequestId);
											this._flingScrollRequestId = null;
										}
									} else flingScroll();
								});
							};
							flingScroll();
						}
					}
					return true;
				case WidgetNameConstants.X_AXIS:
				case WidgetNameConstants.Y_AXIS: if (widget.dispatchEvent("mouseUpEvent", event)) this._chart.updatePane(UpdateLevel.Overlay);
			}
			this._startScrollCoordinate = null;
			this._prevYAxisRanges.clear();
			this._xAxisStartScaleCoordinate = null;
			this._xAxisStartScaleDistance = 0;
			this._xAxisScale = 1;
			this._yAxisStartScaleDistance = 0;
		}
		return false;
	}
	tapEvent(e) {
		const { pane, widget } = this._findWidgetByEvent(e);
		let consumed = false;
		if (widget !== null) {
			const event = this._makeWidgetEvent(e, widget);
			const result = widget.dispatchEvent("mouseClickEvent", event);
			if (widget.getName() === WidgetNameConstants.MAIN) {
				const event = this._makeWidgetEvent(e, widget);
				const chartStore = this._chart.getChartStore();
				if (result) {
					this._touchCancelCrosshair = true;
					this._touchCoordinate = null;
					chartStore.setCrosshair(void 0, { notInvalidate: true });
					consumed = true;
				} else {
					if (!this._touchCancelCrosshair && !this._touchZoomed) {
						this._touchCoordinate = {
							x: event.x,
							y: event.y
						};
						chartStore.setCrosshair({
							x: event.x,
							y: event.y,
							paneId: pane?.getId()
						}, { notInvalidate: true });
						consumed = true;
					}
					this._touchCancelCrosshair = false;
				}
			}
			if (consumed || result) this._chart.updatePane(UpdateLevel.Overlay);
		}
		return consumed;
	}
	doubleTapEvent(e) {
		return this.mouseDoubleClickEvent(e);
	}
	longTapEvent(e) {
		const { pane, widget } = this._findWidgetByEvent(e);
		if (widget !== null && widget.getName() === WidgetNameConstants.MAIN) {
			const event = this._makeWidgetEvent(e, widget);
			this._touchCoordinate = {
				x: event.x,
				y: event.y
			};
			this._chart.getChartStore().setCrosshair({
				x: event.x,
				y: event.y,
				paneId: pane?.getId()
			});
			return true;
		}
		return false;
	}
	_processMainScrollingEvent(widget, event) {
		if (this._startScrollCoordinate !== null) {
			const yAxes = widget.getPane().getYAxisComponents();
			for (const item of yAxes) {
				const yAxis = item;
				const prevRange = this._prevYAxisRanges.get(yAxis);
				if (isValid(prevRange) && !yAxis.getAutoCalcTickFlag() && yAxis.scrollZoomEnabled) {
					event.preventDefault?.();
					const { from, to, range } = prevRange;
					let distance = 0;
					if (yAxis.reverse) distance = this._startScrollCoordinate.y - event.y;
					else distance = event.y - this._startScrollCoordinate.y;
					const bounding = widget.getBounding();
					const difRange = range * (distance / bounding.height);
					const newFrom = from + difRange;
					const newTo = to + difRange;
					const newRealFrom = yAxis.valueToRealValue(newFrom, { range: prevRange });
					const newRealTo = yAxis.valueToRealValue(newTo, { range: prevRange });
					const newDisplayFrom = yAxis.realValueToDisplayValue(newRealFrom, { range: prevRange });
					const newDisplayTo = yAxis.realValueToDisplayValue(newRealTo, { range: prevRange });
					yAxis.setRange({
						from: newFrom,
						to: newTo,
						range: newTo - newFrom,
						realFrom: newRealFrom,
						realTo: newRealTo,
						realRange: newRealTo - newRealFrom,
						displayFrom: newDisplayFrom,
						displayTo: newDisplayTo,
						displayRange: newDisplayTo - newDisplayFrom
					});
				}
			}
			const distance = event.x - this._startScrollCoordinate.x;
			this._chart.getChartStore().scroll(distance);
		}
	}
	_processXAxisScrollStartEvent(widget, event) {
		const consumed = widget.dispatchEvent("mouseDownEvent", event);
		if (consumed) this._chart.updatePane(UpdateLevel.Overlay);
		this._xAxisStartScaleCoordinate = {
			x: event.x,
			y: event.y
		};
		this._xAxisStartScaleDistance = event.pageX;
		return consumed;
	}
	_processXAxisScrollingEvent(widget, event) {
		const consumed = widget.dispatchEvent("pressedMouseMoveEvent", event);
		if (!consumed) {
			if (widget.getPane().getXAxisComponent().scrollZoomEnabled && this._xAxisStartScaleDistance !== 0) {
				const scale = this._xAxisStartScaleDistance / event.pageX;
				if (Number.isFinite(scale)) {
					const zoomScale = (scale - this._xAxisScale) * 10;
					this._xAxisScale = scale;
					this._chart.getChartStore().zoom(zoomScale, this._xAxisStartScaleCoordinate, "xAxis");
				}
			}
		} else this._chart.updatePane(UpdateLevel.Overlay);
		return consumed;
	}
	_processYAxisScaleStartEvent(widget, event) {
		const consumed = widget.dispatchEvent("mouseDownEvent", event);
		if (consumed) this._chart.updatePane(UpdateLevel.Overlay);
		const yAxis = this._getYAxisByWidget(widget);
		const range = yAxis.getRange();
		this._prevYAxisRanges.set(yAxis, { ...range });
		this._yAxisStartScaleDistance = event.pageY;
		return consumed;
	}
	_processYAxisScalingEvent(widget, event) {
		const consumed = widget.dispatchEvent("pressedMouseMoveEvent", event);
		if (!consumed) {
			const yAxis = this._getYAxisByWidget(widget);
			const prevYAxisRange = this._prevYAxisRanges.get(yAxis);
			if (isValid(prevYAxisRange) && yAxis.scrollZoomEnabled && this._yAxisStartScaleDistance !== 0) {
				event.preventDefault?.();
				const { from, to, range } = prevYAxisRange;
				const newRange = range * (event.pageY / this._yAxisStartScaleDistance);
				const difRange = (newRange - range) / 2;
				const newFrom = from - difRange;
				const newTo = to + difRange;
				const newRealFrom = yAxis.valueToRealValue(newFrom, { range: prevYAxisRange });
				const newRealTo = yAxis.valueToRealValue(newTo, { range: prevYAxisRange });
				const newDisplayFrom = yAxis.realValueToDisplayValue(newRealFrom, { range: prevYAxisRange });
				const newDisplayTo = yAxis.realValueToDisplayValue(newRealTo, { range: prevYAxisRange });
				yAxis.setRange({
					from: newFrom,
					to: newTo,
					range: newRange,
					realFrom: newRealFrom,
					realTo: newRealTo,
					realRange: newRealTo - newRealFrom,
					displayFrom: newDisplayFrom,
					displayTo: newDisplayTo,
					displayRange: newDisplayTo - newDisplayFrom
				});
				this._chart.layout({
					measureWidth: true,
					update: true,
					buildYAxisTick: true
				});
			}
		} else this._chart.updatePane(UpdateLevel.Overlay);
		return consumed;
	}
	_findWidgetByEvent(event) {
		const { x, y } = event;
		const separatorPanes = this._chart.getSeparatorPanes();
		const separatorSize = this._chart.getStyles().separator.size;
		for (const items of separatorPanes) {
			const pane = items[1];
			const bounding = pane.getBounding();
			const top = bounding.top - Math.round((7 - separatorSize) / 2);
			if (x >= bounding.left && x <= bounding.left + bounding.width && y >= top && y <= top + 7) return {
				pane,
				widget: pane.getWidget()
			};
		}
		const drawPanes = this._chart.getDrawPanes();
		let pane = null;
		for (const p of drawPanes) {
			const bounding = p.getBounding();
			if (x >= bounding.left && x <= bounding.left + bounding.width && y >= bounding.top && y <= bounding.top + bounding.height) {
				pane = p;
				break;
			}
		}
		let widget = null;
		if (pane !== null) {
			if (!isValid(widget)) {
				const mainWidget = pane.getMainWidget();
				const mainBounding = mainWidget.getBounding();
				if (x >= mainBounding.left && x <= mainBounding.left + mainBounding.width && y >= mainBounding.top && y <= mainBounding.top + mainBounding.height) widget = mainWidget;
			}
			if (!isValid(widget)) for (const yAxisWidget of pane.getYAxisWidgets()) {
				const yAxisBounding = yAxisWidget.getBounding();
				if (x >= yAxisBounding.left && x <= yAxisBounding.left + yAxisBounding.width && y >= yAxisBounding.top && y <= yAxisBounding.top + yAxisBounding.height) {
					widget = yAxisWidget;
					break;
				}
			}
		}
		return {
			pane,
			widget
		};
	}
	_makeWidgetEvent(event, widget) {
		const bounding = widget?.getBounding() ?? null;
		return {
			...event,
			x: event.x - (bounding?.left ?? 0),
			y: event.y - (bounding?.top ?? 0)
		};
	}
	destroy() {
		this._container.removeEventListener("keydown", this._boundKeyBoardDownEvent);
		this._event.destroy();
	}
};
var ChartImp = class {
	constructor(container, options) {
		this._chartBounding = createDefaultBounding();
		this._drawPanes = [];
		this._separatorPanes = /* @__PURE__ */ new Map();
		this._layoutUpdateOptions = {
			sort: true,
			measureHeight: true,
			measureWidth: true,
			update: true,
			buildYAxisTick: false,
			cacheYAxisWidth: false,
			forceBuildYAxisTick: false
		};
		this._layoutPending = false;
		this._resizeObserver = null;
		this._resizeRequestAnimationId = -1;
		this._boundWindowResize = () => {
			this._scheduleResize();
		};
		this._cacheYAxisWidth = {
			left: 0,
			right: 0
		};
		this._initContainer(container);
		this._chartEvent = new Event(this._chartContainer, this);
		this._chartStore = new StoreImp(this, options);
		const defaultPaneOptions = this._getLayoutDefaultPaneOptions(this._chartStore.getLayoutBasicParams());
		const defaultYAxis = this._getLayoutDefaultYAxis(this._chartStore.getLayoutBasicParams());
		this._candlePane = this._createPane(CandlePane, {
			...defaultPaneOptions,
			id: PaneIdConstants.CANDLE
		});
		this._candlePane.createYAxis({
			...defaultYAxis,
			id: DEFAULT_AXIS_ID
		});
		this._xAxisPane = this._createPane(XAxisPane, {
			...defaultPaneOptions,
			id: PaneIdConstants.X_AXIS,
			order: Number.MAX_SAFE_INTEGER
		});
		this._applyLayout(options?.layout);
		this._layout();
		this._initResizeListener();
	}
	_initContainer(container) {
		this._container = container;
		this._chartContainer = createDom("div", {
			position: "relative",
			width: "100%",
			height: "100%",
			outline: "none",
			borderStyle: "none",
			cursor: "crosshair",
			boxSizing: "border-box",
			userSelect: "none",
			webkitUserSelect: "none",
			overflow: "hidden",
			msUserSelect: "none",
			MozUserSelect: "none",
			webkitTapHighlightColor: "transparent"
		});
		this._chartContainer.tabIndex = 1;
		container.appendChild(this._chartContainer);
		this._cacheChartBounding();
	}
	_cacheChartBounding() {
		this._chartBounding.width = Math.floor(this._chartContainer.clientWidth);
		this._chartBounding.height = Math.floor(this._chartContainer.clientHeight);
	}
	_isChartBoundingChanged() {
		return this._chartBounding.width !== Math.floor(this._chartContainer.clientWidth) || this._chartBounding.height !== Math.floor(this._chartContainer.clientHeight);
	}
	_initResizeListener() {
		if (isValid(ResizeObserver)) {
			this._resizeObserver = new ResizeObserver(() => {
				this._scheduleResize();
			});
			this._resizeObserver.observe(this._chartContainer);
		} else window.addEventListener("resize", this._boundWindowResize);
	}
	_scheduleResize() {
		if (this._resizeRequestAnimationId === -1) this._resizeRequestAnimationId = requestAnimationFrame(() => {
			this._resizeRequestAnimationId = -1;
			if (this._isChartBoundingChanged()) this.resize();
		});
	}
	_createPane(DrawPaneClass, options) {
		const pane = new DrawPaneClass(this, options);
		this._drawPanes.push(pane);
		return pane;
	}
	getDrawPaneById(paneId) {
		if (paneId === PaneIdConstants.CANDLE) return this._candlePane;
		if (paneId === PaneIdConstants.X_AXIS) return this._xAxisPane;
		return this._drawPanes.find((p) => p.getId() === paneId) ?? null;
	}
	getContainer() {
		return this._container;
	}
	getChartStore() {
		return this._chartStore;
	}
	getXAxisPane() {
		return this._xAxisPane;
	}
	getDrawPanes() {
		return this._drawPanes;
	}
	getSeparatorPanes() {
		return this._separatorPanes;
	}
	_getLayoutDefaultPaneOptions(basicParams) {
		const options = {};
		if (isNumber(basicParams.paneMinHeight)) options.minHeight = basicParams.paneMinHeight;
		if (isNumber(basicParams.paneHeight)) options.height = basicParams.paneHeight;
		return options;
	}
	_getLayoutDefaultYAxis(basicParams) {
		const yAxis = {};
		if (isString(basicParams.yAxisPosition)) yAxis.position = basicParams.yAxisPosition;
		if (isValid(basicParams.yAxisInside)) yAxis.inside = basicParams.yAxisInside;
		return yAxis;
	}
	_createLayoutIndicator(paneId, content, paneOptions, yAxis) {
		let indicator = "";
		let contentYAxis = null;
		if (isString(content)) indicator = content;
		else if (isValid(content.indicator)) {
			const child = content;
			indicator = child.indicator;
			contentYAxis = child.yAxis ?? null;
		} else indicator = content;
		this.createIndicator(indicator, {
			isStack: true,
			pane: {
				...paneOptions,
				id: paneId
			},
			yAxis: {
				...yAxis,
				...contentYAxis
			}
		});
	}
	_applyLayout(layout) {
		if (!isValid(layout)) return;
		const basicParams = this._chartStore.getLayoutBasicParams();
		const defaultPaneOptions = this._getLayoutDefaultPaneOptions(basicParams);
		const defaultYAxis = this._getLayoutDefaultYAxis(basicParams);
		(layout.panes ?? []).forEach((pane, index) => {
			const paneOptions = {
				...defaultPaneOptions,
				...pane.options
			};
			switch (pane.type) {
				case "candle":
					this._candlePane.setOptions({
						...paneOptions,
						id: PaneIdConstants.CANDLE
					});
					this._candlePane.createYAxis({
						...defaultYAxis,
						id: DEFAULT_AXIS_ID,
						paneId: PaneIdConstants.CANDLE
					});
					pane.content?.forEach((content) => {
						this._createLayoutIndicator(PaneIdConstants.CANDLE, content, {
							...paneOptions,
							id: PaneIdConstants.CANDLE
						}, defaultYAxis);
					});
					break;
				case "indicator": {
					const paneId = paneOptions.id ?? createId(PaneIdConstants.INDICATOR);
					let currentPane = this.getDrawPaneById(paneId);
					if (!isValid(currentPane)) currentPane = this._createPane(IndicatorPane, {
						...paneOptions,
						id: paneId,
						order: paneOptions.order ?? index + 1
					});
					else currentPane.setOptions({
						...paneOptions,
						id: paneId
					});
					currentPane.createYAxis({
						...defaultYAxis,
						id: DEFAULT_AXIS_ID,
						paneId
					});
					pane.content?.forEach((content) => {
						this._createLayoutIndicator(paneId, content, {
							...paneOptions,
							id: paneId
						}, defaultYAxis);
					});
					break;
				}
				case "xAxis":
					this._xAxisPane.setOptions({
						...paneOptions,
						id: PaneIdConstants.X_AXIS
					});
					break;
			}
		});
	}
	layout(options) {
		if (options.sort ?? false) this._layoutUpdateOptions.sort = options.sort;
		if (options.measureHeight ?? false) this._layoutUpdateOptions.measureHeight = options.measureHeight;
		if (options.measureWidth ?? false) this._layoutUpdateOptions.measureWidth = options.measureWidth;
		if (options.update ?? false) this._layoutUpdateOptions.update = options.update;
		if (options.buildYAxisTick ?? false) this._layoutUpdateOptions.buildYAxisTick = options.buildYAxisTick;
		if (options.cacheYAxisWidth ?? false) this._layoutUpdateOptions.cacheYAxisWidth = options.cacheYAxisWidth;
		if (options.forceBuildYAxisTick ?? false) this._layoutUpdateOptions.forceBuildYAxisTick = options.forceBuildYAxisTick;
		if (!this._layoutPending) {
			this._layoutPending = true;
			Promise.resolve().then((_) => {
				this._layout();
				this._layoutPending = false;
			}).catch((_) => {});
		}
	}
	_layout() {
		const { sort, measureHeight, measureWidth, update, buildYAxisTick, cacheYAxisWidth, forceBuildYAxisTick } = this._layoutUpdateOptions;
		if (sort) {
			while (isValid(this._chartContainer.firstChild)) this._chartContainer.removeChild(this._chartContainer.firstChild);
			this._separatorPanes.clear();
			this._drawPanes.sort((a, b) => a.getOptions().order - b.getOptions().order);
			let prevPane = null;
			this._drawPanes.forEach((pane) => {
				if (pane.getId() !== PaneIdConstants.X_AXIS) {
					if (isValid(prevPane)) {
						const separatorPane = new SeparatorPane(this, "", prevPane, pane);
						this._chartContainer.appendChild(separatorPane.getContainer());
						this._separatorPanes.set(pane, separatorPane);
					}
					prevPane = pane;
				}
				this._chartContainer.appendChild(pane.getContainer());
			});
		}
		if (measureHeight) {
			const totalHeight = this._chartBounding.height;
			const separatorSize = this.getStyles().separator.size;
			const xAxisHeight = this._xAxisPane.getXAxisComponent().getAutoSize();
			const contentPanes = this._drawPanes.filter((pane) => pane.getId() !== PaneIdConstants.X_AXIS);
			const maximizedPane = contentPanes.find((pane) => pane.getOptions().state === "maximize");
			let remainingHeight = Math.max(totalHeight - xAxisHeight, 0);
			const paneHeights = /* @__PURE__ */ new Map();
			let actualSeparatorSize = separatorSize;
			if (isValid(maximizedPane)) {
				actualSeparatorSize = 0;
				contentPanes.forEach((pane) => {
					paneHeights.set(pane, pane === maximizedPane ? remainingHeight : 0);
				});
			} else {
				remainingHeight = Math.max(remainingHeight - this._separatorPanes.size * separatorSize, 0);
				const flexiblePane = contentPanes.find((pane) => pane.getId() === PaneIdConstants.CANDLE && pane.getOptions().state === "normal") ?? contentPanes.find((pane) => pane.getOptions().state === "normal");
				contentPanes.forEach((pane) => {
					if (pane === flexiblePane) return;
					const options = pane.getOptions();
					let paneHeight = 30;
					if (options.state === "normal") {
						paneHeight = Math.max(options.minHeight, options.height);
						const availableHeight = Math.max(remainingHeight, 0);
						if (paneHeight > availableHeight) paneHeight = availableHeight;
					}
					remainingHeight -= paneHeight;
					paneHeights.set(pane, paneHeight);
				});
				if (isValid(flexiblePane)) paneHeights.set(flexiblePane, Math.max(remainingHeight, 0));
			}
			this._drawPanes.forEach((pane) => {
				if (pane.getId() !== PaneIdConstants.X_AXIS) pane.setBounding({ height: paneHeights.get(pane) ?? 0 });
			});
			this._xAxisPane.setBounding({ height: xAxisHeight });
			let top = 0;
			this._drawPanes.forEach((pane) => {
				const separatorPane = this._separatorPanes.get(pane);
				if (isValid(separatorPane)) {
					separatorPane.setBounding({
						height: actualSeparatorSize,
						top
					});
					top += actualSeparatorSize;
				}
				pane.setBounding({ top });
				top += pane.getBounding().height;
			});
		}
		let forceMeasureWidth = measureWidth;
		if (buildYAxisTick || forceBuildYAxisTick) this._drawPanes.forEach((pane) => {
			pane.getYAxisComponents().forEach((axis) => {
				const success = axis.buildTicks(forceBuildYAxisTick);
				forceMeasureWidth ||= success;
			});
		});
		if (forceMeasureWidth) {
			const totalWidth = this._chartBounding.width;
			const styles = this.getStyles();
			const leftOutsideYAxisWidths = [];
			const leftInsideYAxisWidths = [];
			const rightInsideYAxisWidths = [];
			const rightOutsideYAxisWidths = [];
			const updateColumnWidth = (widths, index, width) => {
				widths[index] = Math.max(widths[index] ?? 0, width);
			};
			this._drawPanes.forEach((pane) => {
				const leftOutsideAxes = [];
				const leftInsideAxes = [];
				const rightInsideAxes = [];
				const rightOutsideAxes = [];
				if (pane.getId() !== PaneIdConstants.X_AXIS) pane.getWidgetYAxisComponents().forEach((axis) => {
					const yAxis = axis;
					if (yAxis.position === "left") if (yAxis.inside) leftInsideAxes.push(yAxis);
					else leftOutsideAxes.push(yAxis);
					else if (yAxis.inside) rightInsideAxes.push(yAxis);
					else rightOutsideAxes.push(yAxis);
				});
				leftOutsideAxes.forEach((yAxis, index) => {
					updateColumnWidth(leftOutsideYAxisWidths, index, yAxis.getAutoSize());
				});
				leftInsideAxes.forEach((yAxis, index) => {
					updateColumnWidth(leftInsideYAxisWidths, index, yAxis.getAutoSize());
				});
				rightInsideAxes.forEach((yAxis, index) => {
					updateColumnWidth(rightInsideYAxisWidths, index, yAxis.getAutoSize());
				});
				rightOutsideAxes.forEach((yAxis, index) => {
					updateColumnWidth(rightOutsideYAxisWidths, index, yAxis.getAutoSize());
				});
			});
			let leftYAxisWidth = leftOutsideYAxisWidths.reduce((total, width) => total + width, 0);
			let rightYAxisWidth = rightOutsideYAxisWidths.reduce((total, width) => total + width, 0);
			if (cacheYAxisWidth) {
				leftYAxisWidth = Math.max(this._cacheYAxisWidth.left, leftYAxisWidth);
				rightYAxisWidth = Math.max(this._cacheYAxisWidth.right, rightYAxisWidth);
			}
			this._cacheYAxisWidth.left = leftYAxisWidth;
			this._cacheYAxisWidth.right = rightYAxisWidth;
			let mainWidth = totalWidth;
			let mainLeft = 0;
			let mainRight = 0;
			mainWidth -= leftYAxisWidth;
			mainLeft = leftYAxisWidth;
			mainWidth -= rightYAxisWidth;
			mainRight = rightYAxisWidth;
			this._chartStore.setTotalBarSpace(mainWidth);
			const paneBounding = { width: totalWidth };
			const mainBounding = {
				width: mainWidth,
				left: mainLeft,
				right: mainRight
			};
			const leftYAxisBounding = { width: leftYAxisWidth };
			const rightYAxisBounding = { width: rightYAxisWidth };
			const separatorFill = styles.separator.fill;
			let separatorBounding = {};
			if (!separatorFill) separatorBounding = mainBounding;
			else separatorBounding = paneBounding;
			this._drawPanes.forEach((pane) => {
				this._separatorPanes.get(pane)?.setBounding(separatorBounding);
				const yAxisBounding = {};
				let leftOutsideOffset = 0;
				let leftInsideOffset = 0;
				let rightInsideOffset = 0;
				let rightOutsideOffset = 0;
				const leftOutsideAxes = [];
				const leftInsideAxes = [];
				const rightInsideAxes = [];
				const rightOutsideAxes = [];
				if (pane.getId() !== PaneIdConstants.X_AXIS) pane.getWidgetYAxisComponents().forEach((axis) => {
					const yAxis = axis;
					if (yAxis.position === "left") if (yAxis.inside) leftInsideAxes.push(yAxis);
					else leftOutsideAxes.push(yAxis);
					else if (yAxis.inside) rightInsideAxes.push(yAxis);
					else rightOutsideAxes.push(yAxis);
				});
				const paneLeftOutsideYAxisWidth = leftOutsideAxes.reduce((total, _yAxis, index) => total + (leftOutsideYAxisWidths[index] ?? 0), 0);
				leftOutsideOffset = leftYAxisWidth - paneLeftOutsideYAxisWidth;
				for (let index = leftOutsideAxes.length - 1; index >= 0; index--) {
					const yAxis = leftOutsideAxes[index];
					const width = leftOutsideYAxisWidths[index] ?? 0;
					yAxisBounding[yAxis.id] = {
						width,
						left: leftOutsideOffset
					};
					leftOutsideOffset += width;
				}
				leftInsideAxes.forEach((yAxis, index) => {
					const width = leftInsideYAxisWidths[index] ?? 0;
					yAxisBounding[yAxis.id] = {
						width,
						left: mainLeft + leftInsideOffset
					};
					leftInsideOffset += width;
				});
				rightInsideAxes.forEach((yAxis, index) => {
					const width = rightInsideYAxisWidths[index] ?? 0;
					rightInsideOffset += width;
					yAxisBounding[yAxis.id] = {
						width,
						left: mainLeft + mainWidth - rightInsideOffset
					};
				});
				rightOutsideAxes.forEach((yAxis, index) => {
					const width = rightOutsideYAxisWidths[index] ?? 0;
					yAxisBounding[yAxis.id] = {
						width,
						left: mainLeft + mainWidth + rightOutsideOffset
					};
					rightOutsideOffset += width;
				});
				pane.setYAxesBounding(yAxisBounding);
				pane.setBounding(paneBounding, mainBounding, leftYAxisBounding, rightYAxisBounding);
			});
		}
		if (update) {
			this._xAxisPane.getXAxisComponent().buildTicks(true);
			this.updatePane(UpdateLevel.All);
		}
		this._layoutUpdateOptions = {
			sort: false,
			measureHeight: false,
			measureWidth: false,
			update: false,
			buildYAxisTick: false,
			cacheYAxisWidth: false,
			forceBuildYAxisTick: false
		};
	}
	updatePane(level, paneId) {
		if (isValid(paneId)) this.getDrawPaneById(paneId)?.update(level);
		else this._drawPanes.forEach((pane) => {
			pane.update(level);
			this._separatorPanes.get(pane)?.update(level);
		});
	}
	getDom(paneId, position) {
		if (isValid(paneId)) {
			const pane = this.getDrawPaneById(paneId);
			if (isValid(pane)) switch (position ?? "root") {
				case "root": return pane.getContainer();
				case "main": return pane.getMainWidget().getContainer();
				case "yAxis": return pane.getYAxisWidget()?.getContainer() ?? null;
			}
		} else return this._chartContainer;
		return null;
	}
	getSize(paneId, position) {
		if (isValid(paneId)) {
			const pane = this.getDrawPaneById(paneId);
			if (isValid(pane)) switch (position ?? "root") {
				case "root": return pane.getBounding();
				case "main": return pane.getMainWidget().getBounding();
				case "yAxis": return pane.getYAxisWidget()?.getBounding() ?? null;
			}
		} else return this._chartBounding;
		return null;
	}
	_resetYAxisAutoCalcTickFlag() {
		this._drawPanes.forEach((pane) => {
			pane.getYAxisComponents().forEach((axis) => {
				axis.setAutoCalcTickFlag(true);
			});
		});
	}
	setSymbol(symbol) {
		if (symbol !== this.getSymbol()) {
			this._resetYAxisAutoCalcTickFlag();
			this._chartStore.setSymbol(symbol);
		}
	}
	getSymbol() {
		return this._chartStore.getSymbol();
	}
	setPeriod(period) {
		if (period !== this.getPeriod()) {
			this._resetYAxisAutoCalcTickFlag();
			this._chartStore.setPeriod(period);
		}
	}
	getPeriod() {
		return this._chartStore.getPeriod();
	}
	setStyles(value) {
		this._setOptions(() => {
			this._chartStore.setStyles(value);
		});
	}
	getStyles() {
		return this._chartStore.getStyles();
	}
	setFormatter(formatter) {
		this._setOptions(() => {
			this._chartStore.setFormatter(formatter);
		});
	}
	getFormatter() {
		return this._chartStore.getFormatter();
	}
	setLocale(locale) {
		this._setOptions(() => {
			this._chartStore.setLocale(locale);
		});
	}
	getLocale() {
		return this._chartStore.getLocale();
	}
	setTimezone(timezone) {
		this._setOptions(() => {
			this._chartStore.setTimezone(timezone);
		});
	}
	getTimezone() {
		return this._chartStore.getTimezone();
	}
	setThousandsSeparator(thousandsSeparator) {
		this._setOptions(() => {
			this._chartStore.setThousandsSeparator(thousandsSeparator);
		});
	}
	getThousandsSeparator() {
		return this._chartStore.getThousandsSeparator();
	}
	setDecimalFold(decimalFold) {
		this._setOptions(() => {
			this._chartStore.setDecimalFold(decimalFold);
		});
	}
	getDecimalFold() {
		return this._chartStore.getDecimalFold();
	}
	_setOptions(fuc) {
		fuc();
		this.layout({
			measureHeight: true,
			measureWidth: true,
			update: true,
			buildYAxisTick: true,
			forceBuildYAxisTick: true
		});
	}
	setOffsetRightDistance(distance) {
		this._chartStore.setOffsetRightDistance(distance, true);
	}
	getOffsetRightDistance() {
		return this._chartStore.getOffsetRightDistance();
	}
	setMaxOffsetLeftDistance(distance) {
		if (distance < 0) {
			logWarn("setMaxOffsetLeftDistance", "distance", "distance must greater than zero!!!");
			return;
		}
		this._chartStore.setMaxOffsetLeftDistance(distance);
	}
	setMaxOffsetRightDistance(distance) {
		if (distance < 0) {
			logWarn("setMaxOffsetRightDistance", "distance", "distance must greater than zero!!!");
			return;
		}
		this._chartStore.setMaxOffsetRightDistance(distance);
	}
	setLeftMinVisibleBarCount(barCount) {
		if (barCount < 0) {
			logWarn("setLeftMinVisibleBarCount", "barCount", "barCount must greater than zero!!!");
			return;
		}
		this._chartStore.setLeftMinVisibleBarCount(Math.ceil(barCount));
	}
	setRightMinVisibleBarCount(barCount) {
		if (barCount < 0) {
			logWarn("setRightMinVisibleBarCount", "barCount", "barCount must greater than zero!!!");
			return;
		}
		this._chartStore.setRightMinVisibleBarCount(Math.ceil(barCount));
	}
	setBarSpace(space) {
		this._chartStore.setBarSpace(space);
	}
	getBarSpace() {
		return this._chartStore.getBarSpace();
	}
	getVisibleRange() {
		return this._chartStore.getVisibleRange();
	}
	_syncIndicatorPanesByData() {
		let changed = false;
		const usedPaneIds = new Set([PaneIdConstants.CANDLE, PaneIdConstants.X_AXIS]);
		const defaultPaneOptions = this._getLayoutDefaultPaneOptions(this._chartStore.getLayoutBasicParams());
		this._chartStore.getIndicatorsByFilter({}).forEach((indicator) => {
			usedPaneIds.add(indicator.paneId);
			if (!isValid(this.getDrawPaneById(indicator.paneId))) {
				this._createPane(IndicatorPane, {
					...defaultPaneOptions,
					id: indicator.paneId
				});
				changed = true;
			}
		});
		const removePaneIds = [];
		this._drawPanes.forEach((pane) => {
			const paneId = pane.getId();
			if (!usedPaneIds.has(paneId)) removePaneIds.push(paneId);
		});
		removePaneIds.forEach((paneId) => {
			const index = this._drawPanes.findIndex((pane) => pane.getId() === paneId);
			const pane = this._drawPanes[index];
			if (isValid(pane)) {
				this._drawPanes.splice(index, 1);
				pane.destroy();
				changed = true;
			}
		});
		return changed;
	}
	_syncYAxesByData() {
		let changed = false;
		const defaultYAxis = this._getLayoutDefaultYAxis(this._chartStore.getLayoutBasicParams());
		this._drawPanes.forEach((pane) => {
			const paneId = pane.getId();
			if (paneId === PaneIdConstants.X_AXIS) return;
			const usedYAxisIds = /* @__PURE__ */ new Set();
			if (paneId === PaneIdConstants.CANDLE) usedYAxisIds.add(DEFAULT_AXIS_ID);
			this._chartStore.getIndicatorsByPaneId(paneId).forEach((indicator) => {
				usedYAxisIds.add(indicator.yAxisId);
				if (!pane.hasYAxisComponent(indicator.yAxisId)) {
					pane.createYAxis({
						...defaultYAxis,
						id: indicator.yAxisId,
						paneId
					});
					changed = true;
				}
			});
			pane.getYAxisComponents().forEach((yAxis) => {
				if (!usedYAxisIds.has(yAxis.id)) changed = pane.removeYAxis(yAxis.id) || changed;
			});
		});
		return changed;
	}
	resetData() {
		this._chartStore.resetData();
	}
	getDataList() {
		return this._chartStore.getDataList();
	}
	setDataLoader(dataLoader) {
		this._resetYAxisAutoCalcTickFlag();
		this._chartStore.setDataLoader(dataLoader);
	}
	createIndicator(value, options) {
		const indicator = isString(value) ? { name: value } : value;
		if (getIndicatorClass(indicator.name) === null) {
			logWarn("createIndicator", "value", "indicator not supported, you may need to use registerIndicator to add one!!!");
			return null;
		}
		const paneId = options?.pane?.id ?? createId(PaneIdConstants.INDICATOR);
		const yAxisId = options?.yAxis?.id ?? "default";
		indicator.paneId = paneId;
		indicator.yAxisId = yAxisId;
		if (!isString(indicator.id)) indicator.id = createId(indicator.name);
		if (this._chartStore.addIndicator(indicator, options?.isStack ?? false)) {
			let shouldSort = false;
			let pane = this.getDrawPaneById(paneId);
			const defaultPaneOptions = this._getLayoutDefaultPaneOptions(this._chartStore.getLayoutBasicParams());
			const defaultYAxis = this._getLayoutDefaultYAxis(this._chartStore.getLayoutBasicParams());
			if (!isValid(pane)) {
				pane = this._createPane(IndicatorPane, {
					...defaultPaneOptions,
					...options?.pane,
					id: paneId
				});
				shouldSort = true;
			} else if (isValid(options?.pane)) {
				pane.setOptions({
					...options.pane,
					id: paneId
				});
				shouldSort = isNumber(options.pane.order);
			}
			pane.createYAxis({
				...defaultYAxis,
				...options?.yAxis,
				id: yAxisId,
				paneId
			});
			this._syncYAxesByData();
			this.layout({
				sort: shouldSort,
				measureHeight: true,
				measureWidth: true,
				update: true,
				buildYAxisTick: true,
				forceBuildYAxisTick: true
			});
			return indicator.id;
		}
		return null;
	}
	overrideIndicator(override) {
		if (this._chartStore.getIndicatorsByFilter(override).length === 0) return false;
		const updated = this._chartStore.overrideIndicator(override);
		if (updated) this.layout({
			measureWidth: true,
			update: true,
			buildYAxisTick: true,
			forceBuildYAxisTick: true
		});
		return updated;
	}
	getIndicators(filter) {
		return this._chartStore.getIndicatorsByFilter(filter ?? {});
	}
	removeIndicator(filter) {
		const removed = this._chartStore.removeIndicator(filter ?? {});
		if (removed) {
			const panesChanged = this._syncIndicatorPanesByData();
			this._syncYAxesByData();
			this.layout({
				sort: panesChanged,
				measureHeight: panesChanged,
				measureWidth: true,
				update: true,
				buildYAxisTick: true,
				forceBuildYAxisTick: true
			});
		}
		return removed;
	}
	createOverlay(value) {
		const overlays = [];
		const appointPaneFlags = [];
		const build = (overlay) => {
			if (!isValid(overlay.paneId) || this.getDrawPaneById(overlay.paneId) === null) {
				overlay.paneId = PaneIdConstants.CANDLE;
				appointPaneFlags.push(false);
			} else appointPaneFlags.push(true);
			overlays.push(overlay);
		};
		if (isString(value)) build({ name: value });
		else if (isArray(value)) value.forEach((v) => {
			let overlay = null;
			if (isString(v)) overlay = { name: v };
			else overlay = v;
			build(overlay);
		});
		else build(value);
		const ids = this._chartStore.addOverlays(overlays, appointPaneFlags);
		if (isArray(value)) return ids;
		return ids[0];
	}
	getOverlays(filter) {
		return this._chartStore.getOverlaysByFilter(filter ?? {});
	}
	overrideOverlay(override) {
		return this._chartStore.overrideOverlay(override);
	}
	removeOverlay(filter) {
		return this._chartStore.removeOverlay(filter ?? {});
	}
	setPaneOptions(options) {
		let shouldMeasureHeight = false;
		let shouldLayout = false;
		let shouldSort = false;
		const validId = isValid(options.id);
		for (const currentPane of this._drawPanes) {
			const currentPaneId = currentPane.getId();
			if (validId && options.id === currentPaneId || !validId) {
				if (currentPaneId !== PaneIdConstants.X_AXIS) {
					const currentPaneOptions = currentPane.getOptions();
					const currentState = currentPaneOptions.state;
					if (isNumber(options.height) && options.height > 0) {
						const minHeight = Math.max(options.minHeight ?? currentPaneOptions.minHeight, 0);
						const height = Math.max(minHeight, options.height);
						shouldLayout = true;
						shouldMeasureHeight = true;
						currentPane.setBounding({ height });
					}
					if (isValid(options.state)) {
						shouldLayout = true;
						shouldMeasureHeight = true;
						if (currentState === "normal" && options.state !== "normal") currentPane.setOptions({ height: currentPane.getBounding().height });
						else if (currentState !== "normal" && options.state === "normal" && !isNumber(options.height)) currentPane.setBounding({ height: Math.max(currentPaneOptions.minHeight, currentPaneOptions.height) });
					}
				}
				if (isNumber(options.order)) {
					shouldLayout = true;
					shouldSort = true;
				}
				currentPane.setOptions(options);
				if (currentPaneId === options.id) break;
			}
		}
		if (shouldLayout) this.layout({
			sort: shouldSort,
			measureHeight: shouldMeasureHeight,
			measureWidth: true,
			update: true,
			buildYAxisTick: true,
			forceBuildYAxisTick: true
		});
	}
	overrideYAxis(yAxis) {
		const validPaneId = isValid(yAxis.paneId);
		let shouldLayout = false;
		for (const currentPane of this._drawPanes) {
			const currentPaneId = currentPane.getId();
			if (currentPaneId !== PaneIdConstants.X_AXIS && (validPaneId && yAxis.paneId === currentPaneId || !validPaneId)) {
				currentPane.createYAxis(yAxis);
				shouldLayout = true;
				if (currentPaneId === yAxis.paneId) break;
			}
		}
		if (shouldLayout) this.layout({
			measureWidth: true,
			update: true,
			buildYAxisTick: true,
			forceBuildYAxisTick: true
		});
	}
	overrideXAxis(xAxis) {
		this._xAxisPane.overrideXAxis(xAxis);
		this.layout({
			measureHeight: true,
			update: true,
			buildYAxisTick: true,
			forceBuildYAxisTick: true
		});
	}
	getPaneOptions(id) {
		if (isValid(id)) return this.getDrawPaneById(id)?.getOptions() ?? null;
		return this._drawPanes.map((pane) => pane.getOptions());
	}
	setZoomEnabled(enabled) {
		this._chartStore.setZoomEnabled(enabled);
	}
	isZoomEnabled() {
		return this._chartStore.isZoomEnabled();
	}
	setZoomAnchor(anchor) {
		this._chartStore.setZoomAnchor(anchor);
	}
	getZoomAnchor() {
		return this._chartStore.getZoomAnchor();
	}
	setScrollEnabled(enabled) {
		this._chartStore.setScrollEnabled(enabled);
	}
	isScrollEnabled() {
		return this._chartStore.isScrollEnabled();
	}
	scrollByDistance(distance, animationDuration) {
		const duration = isNumber(animationDuration) && animationDuration > 0 ? animationDuration : 0;
		this._chartStore.startScroll();
		if (duration > 0) {
			const animation = new Animation({ duration });
			animation.doFrame((frameTime) => {
				const progressDistance = distance * (frameTime / duration);
				this._chartStore.scroll(progressDistance);
			});
			animation.start();
		} else this._chartStore.scroll(distance);
	}
	scrollToRealTime(animationDuration) {
		const { bar: barSpace } = this._chartStore.getBarSpace();
		const distance = (this._chartStore.getLastBarRightSideDiffBarCount() - this._chartStore.getInitialOffsetRightDistance() / barSpace) * barSpace;
		this.scrollByDistance(distance, animationDuration);
	}
	scrollToDataIndex(dataIndex, animationDuration) {
		const distance = (this._chartStore.getLastBarRightSideDiffBarCount() + (this.getDataList().length - 1 - dataIndex)) * this._chartStore.getBarSpace().bar;
		this.scrollByDistance(distance, animationDuration);
	}
	scrollToTimestamp(timestamp, animationDuration) {
		const dataIndex = binarySearchNearest(this.getDataList(), "timestamp", timestamp);
		this.scrollToDataIndex(dataIndex, animationDuration);
	}
	zoomAtCoordinate(scale, coordinate, animationDuration) {
		const duration = isNumber(animationDuration) && animationDuration > 0 ? animationDuration : 0;
		const { bar: barSpace } = this._chartStore.getBarSpace();
		const difSpace = barSpace * scale - barSpace;
		if (duration > 0) {
			let prevProgressBarSpace = 0;
			const animation = new Animation({ duration });
			animation.doFrame((frameTime) => {
				const progressBarSpace = difSpace * (frameTime / duration);
				const scale = (progressBarSpace - prevProgressBarSpace) / this._chartStore.getBarSpace().bar * 10;
				this._chartStore.zoom(scale, coordinate ?? null, "main");
				prevProgressBarSpace = progressBarSpace;
			});
			animation.start();
		} else this._chartStore.zoom(difSpace / barSpace * 10, coordinate ?? null, "main");
	}
	zoomAtDataIndex(scale, dataIndex, animationDuration) {
		const x = this._chartStore.dataIndexToCoordinate(dataIndex);
		this.zoomAtCoordinate(scale, {
			x,
			y: 0
		}, animationDuration);
	}
	zoomAtTimestamp(scale, timestamp, animationDuration) {
		const dataIndex = binarySearchNearest(this.getDataList(), "timestamp", timestamp);
		this.zoomAtDataIndex(scale, dataIndex, animationDuration);
	}
	convertToPixel(points, filter) {
		const { paneId = PaneIdConstants.CANDLE, yAxisId, absolute = false } = filter ?? {};
		let coordinates = [];
		if (paneId !== PaneIdConstants.X_AXIS) {
			const pane = this.getDrawPaneById(paneId);
			if (pane !== null) {
				const bounding = pane.getBounding();
				const ps = [].concat(points);
				const xAxis = this._xAxisPane.getXAxisComponent();
				const yAxis = pane.getYAxisComponentById(yAxisId);
				coordinates = ps.map((point) => {
					const coordinate = {};
					let dataIndex = point.dataIndex;
					if (isNumber(point.timestamp)) dataIndex = this._chartStore.timestampToDataIndex(point.timestamp);
					if (isNumber(dataIndex)) coordinate.x = xAxis.convertToPixel(dataIndex);
					if (isNumber(point.value)) {
						const y = yAxis.convertToPixel(point.value);
						coordinate.y = absolute ? bounding.top + y : y;
					}
					return coordinate;
				});
			}
		}
		return isArray(points) ? coordinates : coordinates[0] ?? {};
	}
	convertFromPixel(coordinates, filter) {
		const { paneId = PaneIdConstants.CANDLE, yAxisId, absolute = false } = filter ?? {};
		let points = [];
		if (paneId !== PaneIdConstants.X_AXIS) {
			const pane = this.getDrawPaneById(paneId);
			if (pane !== null) {
				const bounding = pane.getBounding();
				const cs = [].concat(coordinates);
				const xAxis = this._xAxisPane.getXAxisComponent();
				const yAxis = pane.getYAxisComponentById(yAxisId);
				points = cs.map((coordinate) => {
					const point = {};
					if (isNumber(coordinate.x)) {
						const dataIndex = xAxis.convertFromPixel(coordinate.x);
						point.dataIndex = dataIndex;
						point.timestamp = this._chartStore.dataIndexToTimestamp(dataIndex) ?? void 0;
					}
					if (isNumber(coordinate.y)) {
						const y = absolute ? coordinate.y - bounding.top : coordinate.y;
						point.value = yAxis.convertFromPixel(y);
					}
					return point;
				});
			}
		}
		return isArray(coordinates) ? points : points[0] ?? {};
	}
	executeAction(type, data) {
		switch (type) {
			case "onCrosshairChange": {
				let crosshair = null;
				if (isValid(data)) {
					crosshair = { ...data };
					crosshair.paneId ??= PaneIdConstants.CANDLE;
				}
				this._chartStore.setCrosshair(crosshair, { notExecuteAction: true });
				break;
			}
			default: break;
		}
	}
	subscribeAction(type, callback) {
		this._chartStore.subscribeAction(type, callback);
	}
	unsubscribeAction(type, callback) {
		this._chartStore.unsubscribeAction(type, callback);
	}
	getConvertPictureUrl(includeOverlay, type, backgroundColor) {
		const { width, height } = this._chartBounding;
		const canvas = createDom("canvas", {
			width: `${width}px`,
			height: `${height}px`,
			boxSizing: "border-box"
		});
		const ctx = canvas.getContext("2d");
		const pixelRatio = getPixelRatio(canvas);
		canvas.width = width * pixelRatio;
		canvas.height = height * pixelRatio;
		ctx.scale(pixelRatio, pixelRatio);
		ctx.fillStyle = backgroundColor ?? "#FFFFFF";
		ctx.fillRect(0, 0, width, height);
		const overlayFlag = includeOverlay ?? false;
		this._drawPanes.forEach((pane) => {
			const separatorPane = this._separatorPanes.get(pane);
			if (isValid(separatorPane)) {
				const separatorBounding = separatorPane.getBounding();
				ctx.drawImage(separatorPane.getImage(overlayFlag), separatorBounding.left, separatorBounding.top, separatorBounding.width, separatorBounding.height);
			}
			const bounding = pane.getBounding();
			ctx.drawImage(pane.getImage(overlayFlag), 0, bounding.top, width, bounding.height);
		});
		return canvas.toDataURL(`image/${type ?? "jpeg"}`);
	}
	resize() {
		this._cacheChartBounding();
		this.layout({
			measureHeight: true,
			measureWidth: true,
			update: true,
			buildYAxisTick: true,
			forceBuildYAxisTick: true
		});
	}
	destroy() {
		if (this._resizeRequestAnimationId !== -1) {
			cancelAnimationFrame(this._resizeRequestAnimationId);
			this._resizeRequestAnimationId = -1;
		}
		if (isValid(this._resizeObserver)) {
			this._resizeObserver.disconnect();
			this._resizeObserver = null;
		} else window.removeEventListener("resize", this._boundWindowResize);
		this._chartEvent.destroy();
		this._drawPanes.forEach((pane) => {
			pane.destroy();
		});
		this._drawPanes = [];
		this._separatorPanes.clear();
		this._chartStore.destroy();
		this._container.removeChild(this._chartContainer);
	}
};
var charts = /* @__PURE__ */ new Map();
var chartBaseId = 1;
function version() {
	return "10.0.0-beta2";
}
function init(ds, options) {
	logTag();
	let dom = null;
	if (isString(ds)) dom = document.getElementById(ds);
	else dom = ds;
	if (dom === null) {
		logError("", "", "The chart cannot be initialized correctly. Please check the parameters. The chart container cannot be null and child elements need to be added!!!");
		return null;
	}
	let chart = charts.get(dom.id);
	if (isValid(chart)) {
		logWarn("", "", "The chart has been initialized on the dom！！！");
		return chart;
	}
	const id = `k_line_chart_${chartBaseId++}`;
	chart = new ChartImp(dom, options);
	chart.id = id;
	dom.setAttribute("k-line-chart-id", id);
	charts.set(id, chart);
	return chart;
}
function dispose(dcs) {
	let id = null;
	if (dcs instanceof ChartImp) id = dcs.id;
	else {
		let dom = null;
		if (isString(dcs)) dom = document.getElementById(dcs);
		else dom = dcs;
		id = dom?.getAttribute("k-line-chart-id") ?? null;
	}
	if (id !== null) {
		charts.get(id)?.destroy();
		charts.delete(id);
	}
}
var utils = {
	clone,
	merge,
	isString,
	isNumber,
	isValid,
	isObject,
	isArray,
	isFunction,
	isBoolean,
	formatValue,
	formatPrecision,
	formatBigNumber,
	formatDate: formatTimestampByTemplate,
	formatThousands,
	formatFoldDecimal,
	calcTextWidth,
	getLinearSlopeIntercept,
	getLinearYFromSlopeIntercept,
	getLinearYFromCoordinates,
	checkCoordinateOnArc,
	checkCoordinateOnCircle,
	checkCoordinateOnLine,
	checkCoordinateOnPolygon,
	checkCoordinateOnRect,
	checkCoordinateOnText
};
export { dispose, getFigureClass, getOverlayClass, getSupportedFigures, getSupportedIndicators, getSupportedLocales, getSupportedOverlays, init, registerFigure, registerIndicator, registerLocale, registerOverlay, registerStyles, registerXAxis, registerYAxis, utils, version };

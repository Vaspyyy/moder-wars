import assert from "node:assert/strict";
import "./register-types.mjs";
const { MapCamera } = await import("../src/map-camera.ts");
const { mapRuntime } = await import("../src/map-runtime.ts");
class Element {
	clientWidth = 960;
	clientHeight = 600;
	classList = { add() {} };
	style = {};
	listeners = new Map();
	captures = new Set();
	children = [];
	getBoundingClientRect() {
		return { left: 0, top: 0 };
	}
	appendChild(child) {
		this.children.push(child);
		child.parent = this;
	}
	remove() {
		this.parent.children.splice(this.parent.children.indexOf(this), 1);
	}
	addEventListener(name, fn) {
		this.listeners.set(name, fn);
	}
	removeEventListener(name) {
		this.listeners.delete(name);
	}
	setPointerCapture(id) {
		this.captures.add(id);
	}
	emit(name, data = {}) {
		this.listeners.get(name)?.({
			pointerId: 1,
			button: 0,
			clientX: 480,
			clientY: 300,
			stopPropagation() {},
			...data,
		});
	}
}
globalThis.document = { createElement: () => new Element() };
globalThis.Image = class {};
const element = new Element();
const map = new MapCamera(element, { center: [0, 0], zoom: 4 });
let changes = 0;
map.on("referencechange", () => changes++);
const image = mapRuntime
	.imageOverlay(
		"test.png",
		[
			[-10, -10],
			[10, 10],
		],
		{},
	)
	.addTo(map);
image.getElement().onload();
image.setBounds([
	[-5, -5],
	[5, 5],
]);
image.setOpacity(0.3);
assert.equal(changes, 3);
map.removeLayer(image);
image.setBounds([
	[-1, -1],
	[1, 1],
]);
assert.equal(
	changes,
	3,
	"removed reference images stop invalidating the renderer",
);
const handle = mapRuntime
	.marker([0, 0], {
		draggable: true,
		icon: {
			className: "ref-handle",
			html: "",
			iconAnchor: [7, 7],
			iconSize: [14, 14],
		},
	})
	.addTo(map);
const control = element.children[0];
let starts = 0,
	ends = 0,
	moves = 0;
handle.on("dragstart", () => {
	starts++;
	map.dragging.disable();
});
handle.on("drag", () => moves++);
handle.on("dragend", () => {
	ends++;
	map.dragging.enable();
});
control.emit("pointerdown");
control.emit("pointermove", { clientX: 550 });
assert.equal(starts, 1);
assert.equal(moves, 1);
assert.equal(map.dragging.enabled(), false);
assert.ok(
	Math.abs(map.latLngToContainerPoint(handle.getLatLng()).x - 550) < 1e-8,
);
control.emit("pointercancel");
assert.equal(ends, 1);
assert.equal(map.dragging.enabled(), true);
control.emit("pointerdown");
map.removeLayer(handle);
assert.equal(
	map.dragging.enabled(),
	true,
	"removing an active handle releases map ownership",
);
assert.equal(control.listeners.size, 0);
assert.equal(element.children.length, 0);
map.setView([10, 10], 5);
map.destroy();
console.log(
	"Native reference invalidation, pointer dragging/cancellation and layer cleanup passed in Node; no browser",
);

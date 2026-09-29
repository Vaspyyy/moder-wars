import { getCookie, setCookie } from "./preferences.js";
export let isMuted = false;
export function setSecretSounds(value) {
	useSecretSounds = value;
}
export function setCustomTrack(value) {
	customTrackUrl = value;
}
export function stopBackgroundMusic() {
	if (bgMusicSource) bgMusicSource.stop();
	bgMusicSource = null;
}
export const explosionUrl = "assets/audio/explosion-pas-61639.mp3";
export const clickUrl = "assets/audio/low-button-click-331780.mp3";

// Background music playlist: Replaced with MW ST folder assets
export const bgMusicUrls = [
	"/mw st/mw new ost/Stormfront.m4a",
	"/mw st/mw new ost/All This.m4a",
	"/mw st/mw new ost/Movement Proposition - Kevin MacLeod (Audio).m4a",
	"/mw st/mw new ost/Hitman.m4a",
	"/mw st/mw new ost/Satiate.m4a",
	"/mw st/mw new ost/Industrial Revolution - Kevin MacLeod.m4a",
	"/mw st/mw new ost/Red Alert 3 Theme - Soviet March.m4a",
	"/mw st/mw new ost/Марк Бернес ＂Темная ночь＂ (1943).m4a",
	"/mw st/mw new ost/Failing Defense.m4a",
	"/mw st/mw new ost/Kevin MacLeod [Official] - Killers - incompetech.com.m4a",
];

export const warStartUrl = "assets/audio/war.wav";
export const peaceUrl = "assets/audio/peace.wav";
export const warAmbianceUrl = "assets/audio/modern-war-129016.mp3";
export const secretWarDeclaredUrl =
	"super-secret-settings/hoi4-war-declared.mp3";
export const secretPeaceDealUrl = "super-secret-settings/hoi4-peace-deal.mp3";

// Initialize Audio Context immediately so it's ready for early decoding
export const audioCtx = new (
	window.AudioContext || window.webkitAudioContext
)();
export let explosionBuffer = null;
export let clickBuffer = null;
// Background music buffers keyed by URL
export const bgMusicBuffers = {};
export let isAudioLoading = false;
export let warStartBuffer = null;
export let peaceBuffer = null;
export let warAmbianceBuffer = null;
export let secretWarDeclaredBuffer = null;
export let secretPeaceDealBuffer = null;
export let useSecretSounds = true;
export let bgMusicSource = null;
export let bgMusicGain = null;
// Track index currently playing from bgMusicUrls
export let currentBgTrackIndex = null;
export let customTrackUrl = getCookie("mw_custom_track") || null;
export let warAmbianceSource = null;
export let warAmbianceGain = null;

/**
 * High-priority loader for small UI elements.
 * This runs as soon as the script executes to minimize interaction latency.
 */
export const loadImmediate = async (url) => {
	try {
		const response = await fetch(url);
		const arrayBuffer = await response.arrayBuffer();
		return await audioCtx.decodeAudioData(arrayBuffer);
	} catch (e) {
		console.warn(`Audio Error (Immediate): Failed to load ${url}`, e);
		return null;
	}
};

let _clickLoadPromise = null;

/** Unlock audio from a user gesture without starting the full soundtrack download. */
export async function primeAudio() {
	if (audioCtx.state === "suspended") {
		try {
			await audioCtx.resume();
		} catch (error) {
			console.warn("AudioContext resume failed", error);
		}
	}
	if (!clickBuffer) {
		_clickLoadPromise ||= loadImmediate(clickUrl).then((buffer) => {
			if (buffer) clickBuffer = buffer;
			return buffer;
		});
	}
	return _clickLoadPromise;
}

export async function initAudio() {
	await primeAudio();

	if (isAudioLoading) return;

	const needsMusic = !bgMusicSource;
	const needsBuffers =
		!explosionBuffer ||
		!clickBuffer ||
		!warStartBuffer ||
		!peaceBuffer ||
		!warAmbianceBuffer;

	if (!needsMusic && !needsBuffers) return;

	isAudioLoading = true;

	const load = async (url) => {
		try {
			// Encode URI to handle spaces and non-ASCII characters in asset paths
			const response = await fetch(encodeURI(url));
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const arrayBuffer = await response.arrayBuffer();
			return await new Promise((resolve, reject) => {
				audioCtx.decodeAudioData(arrayBuffer, resolve, (err) => {
					console.warn(`Decoding failure for ${url}:`, err);
					reject(err);
				});
			});
		} catch (e) {
			console.warn(`Audio Force-Load Error: Failed for ${url}`, e);
			return null;
		}
	};

	// Helper to start playing a specific background track index
	const playBackgroundTrack = async (index) => {
		// Force resume on every track change attempt to stay ahead of browser suspension
		if (audioCtx.state === "suspended") {
			try {
				await audioCtx.resume();
			} catch (_e) {}
		}

		let url;
		if (customTrackUrl) {
			url = customTrackUrl;
		} else {
			if (index == null || index < 0 || index >= bgMusicUrls.length) {
				index = Math.floor(Math.random() * bgMusicUrls.length);
			}
			url = bgMusicUrls[index];
		}

		while (!bgMusicBuffers[url]) {
			const buf = await load(url);
			if (!buf) {
				console.warn(`Force-skipping broken track: ${url}`);
				index = (index + 1) % bgMusicUrls.length;
				url = customTrackUrl || bgMusicUrls[index];
				continue;
			}
			bgMusicBuffers[url] = buf;
		}

		// Stop any existing source to ensure only one plays
		if (bgMusicSource) {
			try {
				bgMusicSource.onended = null;
				bgMusicSource.stop();
				bgMusicSource.disconnect();
			} catch (_e) {}
			bgMusicSource = null;
		}

		bgMusicSource = audioCtx.createBufferSource();
		bgMusicSource.buffer = bgMusicBuffers[url];
		bgMusicSource.loop = false;

		if (!bgMusicGain) {
			bgMusicGain = audioCtx.createGain();
			const savedVol = getCookie("mw_music_vol");
			const initialVol = savedVol !== "" ? parseFloat(savedVol) : 0.45; // Increased default volume
			bgMusicGain.gain.setValueAtTime(initialVol, audioCtx.currentTime);

			const slider = document.getElementById("music-volume-slider");
			const valLabel = document.getElementById("music-vol-val");
			if (slider && valLabel) {
				slider.value = initialVol;
				valLabel.innerText = `${Math.round(initialVol * 100)}%`;
			}

			bgMusicGain.connect(audioCtx.destination);
		}

		bgMusicSource.connect(bgMusicGain);

		try {
			bgMusicSource.start(0);
		} catch (e) {
			console.warn("Force play failed at start phase:", e);
		}

		currentBgTrackIndex = index;

		// When track ends, pick a different random one
		bgMusicSource.onended = () => {
			bgMusicSource = null;
			if (customTrackUrl) {
				playBackgroundTrack(0); // Loop custom track
				return;
			}
			if (!bgMusicUrls.length) return;
			let next = Math.floor(Math.random() * bgMusicUrls.length);
			if (bgMusicUrls.length > 1 && next === currentBgTrackIndex) {
				next = (next + 1) % bgMusicUrls.length;
			}
			playBackgroundTrack(next);
		};
	};

	// Prioritize loading and playing background music immediately
	const startMusic = async () => {
		if (bgMusicSource || isAudioLoading) return;
		// Pick a random starting track
		const startIndex = Math.floor(Math.random() * bgMusicUrls.length);
		await playBackgroundTrack(startIndex);
	};

	// Fire off music load/play and other sounds in parallel
	const effectTasks = [
		load(explosionUrl).then((b) => (explosionBuffer = b || explosionBuffer)),
		!clickBuffer
			? load(clickUrl).then((b) => (clickBuffer = b || clickBuffer))
			: Promise.resolve(),
		load(warStartUrl).then((b) => (warStartBuffer = b || warStartBuffer)),
		load(peaceUrl).then((b) => (peaceBuffer = b || peaceBuffer)),
		load(secretWarDeclaredUrl).then(
			(b) => (secretWarDeclaredBuffer = b || secretWarDeclaredBuffer),
		),
		load(secretPeaceDealUrl).then(
			(b) => (secretPeaceDealBuffer = b || secretPeaceDealBuffer),
		),
		load(warAmbianceUrl).then(
			(b) => (warAmbianceBuffer = b || warAmbianceBuffer),
		),
	];

	try {
		await Promise.all([startMusic(), ...effectTasks]);
	} catch (e) {
		console.error("Audio initialization error:", e);
	} finally {
		isAudioLoading = false;
	}
}

export function playWarAmbiance() {
	if (!audioCtx || !warAmbianceBuffer || warAmbianceSource) return;

	warAmbianceSource = audioCtx.createBufferSource();
	warAmbianceSource.buffer = warAmbianceBuffer;
	warAmbianceSource.loop = true;

	warAmbianceGain = audioCtx.createGain();
	// Play "really quietly" as requested
	warAmbianceGain.gain.setValueAtTime(0, audioCtx.currentTime);
	warAmbianceGain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 2);

	warAmbianceSource.connect(warAmbianceGain);
	warAmbianceGain.connect(audioCtx.destination);
	warAmbianceSource.start(0);
}

export function stopWarAmbiance() {
	if (warAmbianceSource) {
		const sourceToStop = warAmbianceSource;
		const gainToStop = warAmbianceGain;

		if (gainToStop) {
			gainToStop.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.5);
		}

		setTimeout(() => {
			try {
				sourceToStop.stop();
			} catch (_e) {}
		}, 1600);

		warAmbianceSource = null;
		warAmbianceGain = null;
	}
}

export function playExplosionSound() {
	if (isMuted || !audioCtx || !explosionBuffer) return;
	const source = audioCtx.createBufferSource();
	source.buffer = explosionBuffer;

	// Create a filter but make it less aggressive (higher cutoff)
	const filterNode = audioCtx.createBiquadFilter();
	filterNode.type = "lowpass";
	filterNode.frequency.setValueAtTime(1800, audioCtx.currentTime);
	filterNode.Q.setValueAtTime(1, audioCtx.currentTime);

	const gainNode = audioCtx.createGain();
	const startVol = 0.45; // Significantly increased volume for clarity
	gainNode.gain.setValueAtTime(startVol, audioCtx.currentTime);
	// Linear ramp is often more predictable for short samples
	gainNode.gain.linearRampToValueAtTime(
		0,
		audioCtx.currentTime + explosionBuffer.duration,
	);

	source.connect(filterNode);
	filterNode.connect(gainNode);
	gainNode.connect(audioCtx.destination);
	source.start(0);
}

export function playClickSound() {
	if (isMuted || !audioCtx || !clickBuffer) return;
	const source = audioCtx.createBufferSource();
	source.buffer = clickBuffer;
	const gainNode = audioCtx.createGain();
	// Reduced gain to 0.1 to address the "too loud" feedback while maintaining auditability
	gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
	source.connect(gainNode);
	gainNode.connect(audioCtx.destination);
	source.start(0);
}

export function playWarStartSound() {
	if (isMuted || !audioCtx) return;
	const buffer =
		useSecretSounds && secretWarDeclaredBuffer
			? secretWarDeclaredBuffer
			: warStartBuffer;
	if (!buffer) return;
	const source = audioCtx.createBufferSource();
	source.buffer = buffer;
	const gainNode = audioCtx.createGain();
	gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime); // Quiet start
	source.connect(gainNode);
	gainNode.connect(audioCtx.destination);
	source.start(0);
}

export function playPeaceSound() {
	if (isMuted || !audioCtx) return;
	const buffer =
		useSecretSounds && secretPeaceDealBuffer
			? secretPeaceDealBuffer
			: peaceBuffer;
	if (!buffer) return;
	const source = audioCtx.createBufferSource();
	source.buffer = buffer;
	const gainNode = audioCtx.createGain();
	gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
	source.connect(gainNode);
	gainNode.connect(audioCtx.destination);
	source.start(0);
}

// Global click listener using capture phase to ensure sounds play even when stopPropagation is used
document.addEventListener(
	"click",
	(e) => {
		// Resume context if suspended (common browser policy on first click)
		if (audioCtx && audioCtx.state === "suspended") {
			audioCtx.resume().catch(() => {});
		}

		// Unlock only the tiny click sound here. Full soundtrack/effect downloads
		// begin after the selected world has finished loading.
		primeAudio();

		const interactiveSelector =
			'button, .menu-card, input, select, [role="button"], .side-header';
		if (e.target.closest(interactiveSelector)) {
			playClickSound();
		}
	},
	true,
);

export function wireAudioControls({
	musicVolumeSlider,
	musicVolVal,
	muteBtn,
	isSimulating,
}) {
	musicVolumeSlider.addEventListener("input", (e) => {
		const vol = parseFloat(e.target.value);
		musicVolVal.innerText = `${Math.round(vol * 100)}%`;
		if (bgMusicGain && !isMuted) {
			bgMusicGain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.05);
		}
		setCookie("mw_music_vol", vol);
	});

	muteBtn.addEventListener("click", () => {
		isMuted = !isMuted;
		muteBtn.innerText = isMuted ? "Sound: off" : "Sound: on";
		muteBtn.setAttribute("aria-pressed", String(isMuted));

		if (!audioCtx) return;

		if (isMuted) {
			if (bgMusicGain)
				bgMusicGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
			if (warAmbianceGain)
				warAmbianceGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.1);
		} else {
			const savedVol = getCookie("mw_music_vol");
			const musicVol = savedVol !== "" ? parseFloat(savedVol) : 0.15;
			if (bgMusicGain)
				bgMusicGain.gain.setTargetAtTime(musicVol, audioCtx.currentTime, 0.1);
			if (warAmbianceGain && isSimulating()) {
				warAmbianceGain.gain.setTargetAtTime(0.05, audioCtx.currentTime, 0.1);
			}
		}
	});
}

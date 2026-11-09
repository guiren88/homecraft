// Shared English speech for the treasure hunt and the quiz gate.
//
// Playback chain (all fallbacks automatic and silent):
//   1. Pre-generated local MP3 (world/audio-manifest.js, made by
//      tools/gen-audio.py) - every fixed text the site speaks has a clip, so
//      this is the normal path and needs no network or TTS service.
//   2. Unknown short text (<= 3 words): Youdao dictvoice (real dictionary
//      audio), then Baidu fanyi gettts.
//   3. Unknown sentence: Baidu fanyi gettts.
//   4. Browser speechSynthesis with the best natural English voice
//      (selection adapted from daughter-english-app/src/utils/speech.js).
//
// Volume is shared by every speak() caller and persisted in localStorage
// ('homecraft_volume', 0..5 = 0%..500%, default 1 = 100%). createVolumeControl()
// renders the same slider component for the quest bar and the quiz modal;
// moving either updates the other and the volume of anything already playing.
// Above 100%: local clips are boosted through a WebAudio GainNode (an
// HTMLAudioElement alone cannot exceed 1.0). Remote fallback audio and
// speechSynthesis cannot be boosted (cross-origin media through WebAudio
// would be silenced, and utterance.volume caps at 1), so they clamp to 100%.

import { AUDIO_CLIPS } from './audio-manifest.js';

export function pickAudioSource(text) {
  const t = (text || '').trim();
  if (!t) return { kind: 'none', urls: [] };
  if (AUDIO_CLIPS[t]) return { kind: 'local', urls: [AUDIO_CLIPS[t]] };
  const enc = encodeURIComponent(t);
  const youdao = `https://dict.youdao.com/dictvoice?audio=${enc}&type=2`;
  const baidu = `https://fanyi.baidu.com/gettts?lan=en&text=${enc}&spd=3&source=web`;
  const words = t.split(/\s+/).length;
  return { kind: 'remote', urls: words <= 3 ? [youdao, baidu] : [baidu] };
}

// ---------- Shared volume (0..5, i.e. 0%..500%) ----------
export const VOLUME_KEY = 'homecraft_volume';
export const VOLUME_MAX = 5;
const clampVol = v => Math.min(VOLUME_MAX, Math.max(0, Number.isFinite(v) ? v : 1));
function loadVolume() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(VOLUME_KEY);
    return raw == null || raw === '' ? 1 : clampVol(parseFloat(raw));
  } catch { return 1; }
}
let volume = loadVolume();
const volumeListeners = new Set();
export function getVolume() { return volume; }
export function setVolume(v) {
  volume = clampVol(Number(v));
  try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* private mode */ }
  applyVolumes();
  for (const fn of volumeListeners) { try { fn(volume); } catch { /* ignore */ } }
}
export function onVolumeChange(fn) {
  volumeListeners.add(fn);
  return () => volumeListeners.delete(fn);
}

const VOL_CSS = `
.vol-control{display:inline-flex;align-items:center;gap:6px;font-size:15px}
.vol-control input[type=range]{width:92px;accent-color:#7cb342;cursor:pointer}
.vol-control .vol-pct{min-width:3.4em;font-size:13px;color:#5b4636}
`;
let volStyleDone = false;
export function createVolumeControl() {
  if (!volStyleDone && typeof document !== 'undefined') {
    volStyleDone = true;
    const st = document.createElement('style');
    st.textContent = VOL_CSS;
    document.head.appendChild(st);
  }
  const label = document.createElement('label');
  label.className = 'vol-control';
  label.title = '朗读音量';
  const icon = document.createElement('span');
  icon.textContent = '🔊';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = String(VOLUME_MAX * 100);
  slider.step = '5';
  slider.value = String(Math.round(volume * 100));
  slider.setAttribute('aria-label', '朗读音量');
  const pct = document.createElement('span');
  pct.className = 'vol-pct';
  pct.textContent = `${Math.round(volume * 100)}%`;
  slider.addEventListener('input', () => setVolume(slider.value / 100));
  onVolumeChange(v => { slider.value = String(Math.round(v * 100)); pct.textContent = `${Math.round(v * 100)}%`; });
  label.append(icon, slider, pct);
  return label;
}

// ---------- speechSynthesis fallback (best-voice picker) ----------
const US_PREFERRED = [
  'Microsoft Jenny Online (Natural)', 'Microsoft Aria Online (Natural)',
  'Microsoft Guy Online (Natural)', 'Ava (Premium)', 'Ava (Enhanced)',
  'Samantha (Enhanced)', 'Samantha (Premium)', 'Samantha',
  'Google US English', 'Zoe (Premium)', 'Allison (Enhanced)', 'Susan', 'Victoria',
];
const ROBOTIC = ['alex', 'fred', 'albert', 'bad news', 'bahh', 'bells', 'boing',
  'bubbles', 'cellos', 'deranged', 'good news', 'hysterical', 'pipe organ',
  'trinoids', 'whisper', 'zarvox'];
let cachedVoices = [];
function refreshVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  cachedVoices = window.speechSynthesis.getVoices() || [];
}
function bestEnglishVoice() {
  const voices = cachedVoices.length ? cachedVoices : (window.speechSynthesis?.getVoices() || []);
  const en = voices.filter(v => v.lang && v.lang.toLowerCase().startsWith('en'));
  if (!en.length) return null;
  for (const name of US_PREFERRED) {
    const hit = en.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
    if (hit) return hit;
  }
  const natural = en.find(v => !ROBOTIC.some(bad => v.name.toLowerCase().includes(bad)));
  return natural || en[0];
}
function synthSpeak(text) {
  try {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.85;
    u.pitch = 1.0;
    u.volume = Math.min(1, volume); // utterance.volume cannot exceed 1
    const voice = bestEnglishVoice();
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
    window.speechSynthesis.speak(u);
  } catch { /* speech is a bonus; never break the game */ }
}

// ---------- Playback ----------
// Two reusable elements: localEl for same-origin clips (boostable past 100%
// via WebAudio), remoteEl for cross-origin fallback audio (direct playback,
// capped at 100% — routing it through WebAudio without CORS would silence it).
let localEl = null;
let remoteEl = null;
let audioCtx = null;
let gainNode = null;
let boosted = false;

function applyVolumes() {
  try {
    if (remoteEl) remoteEl.volume = Math.min(1, volume);
    if (localEl) localEl.volume = boosted ? 1 : Math.min(1, volume);
    if (gainNode) gainNode.gain.value = volume;
  } catch { /* ignore */ }
}

function ensureBoost() {
  if (boosted) { try { audioCtx?.resume?.(); } catch { /* ignore */ } return; }
  try {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC || !localEl) return;
    audioCtx = new AC();
    const src = audioCtx.createMediaElementSource(localEl);
    gainNode = audioCtx.createGain();
    gainNode.gain.value = volume;
    src.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    boosted = true;
    localEl.volume = 1;
    audioCtx.resume?.();
  } catch { /* direct playback still works, capped at 100% */ }
}

function stopEl(el) {
  if (!el) return;
  try { el.pause(); el.removeAttribute('src'); } catch { /* ignore */ }
  el.onerror = null;
}
function stopCurrent() {
  stopEl(localEl);
  stopEl(remoteEl);
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

export function speak(text) {
  const t = (text || '').trim();
  if (!t) return;
  stopCurrent();
  const { urls } = pickAudioSource(t);
  if (!urls.length || typeof Audio === 'undefined') { synthSpeak(t); return; }
  let i = 0;
  const tryNext = () => {
    if (i >= urls.length) { synthSpeak(t); return; }
    const url = urls[i++];
    const isLocal = !/^https?:\/\//i.test(url);
    if (isLocal) { if (!localEl) localEl = new Audio(); } else if (!remoteEl) remoteEl = new Audio();
    const el = isLocal ? localEl : remoteEl;
    stopEl(isLocal ? remoteEl : localEl);
    el.onerror = tryNext;
    el.src = url;
    applyVolumes();
    if (isLocal) ensureBoost();
    const p = el.play();
    if (p && typeof p.catch === 'function') p.catch(tryNext);
  };
  tryNext();
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

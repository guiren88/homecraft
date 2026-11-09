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
// ('homecraft_volume', 0..1, default 1). createVolumeControl() renders the
// same slider component for the quest bar and the quiz modal; moving either
// updates the other and the volume of anything already playing.

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

// ---------- Shared volume ----------
export const VOLUME_KEY = 'homecraft_volume';
const clamp01 = v => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 1));
function loadVolume() {
  try {
    const raw = typeof localStorage !== 'undefined' && localStorage.getItem(VOLUME_KEY);
    return raw == null || raw === '' ? 1 : clamp01(parseFloat(raw));
  } catch { return 1; }
}
let volume = loadVolume();
const volumeListeners = new Set();
export function getVolume() { return volume; }
export function setVolume(v) {
  volume = clamp01(Number(v));
  try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* private mode */ }
  if (audioEl) { try { audioEl.volume = volume; } catch { /* ignore */ } }
  for (const fn of volumeListeners) { try { fn(volume); } catch { /* ignore */ } }
}
export function onVolumeChange(fn) {
  volumeListeners.add(fn);
  return () => volumeListeners.delete(fn);
}

const VOL_CSS = `
.vol-control{display:inline-flex;align-items:center;gap:6px;font-size:15px}
.vol-control input[type=range]{width:92px;accent-color:#7cb342;cursor:pointer}
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
  slider.max = '100';
  slider.value = String(Math.round(volume * 100));
  slider.setAttribute('aria-label', '朗读音量');
  slider.addEventListener('input', () => setVolume(slider.value / 100));
  onVolumeChange(v => { slider.value = String(Math.round(v * 100)); });
  label.append(icon, slider);
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
    u.volume = volume;
    const voice = bestEnglishVoice();
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
    window.speechSynthesis.speak(u);
  } catch { /* speech is a bonus; never break the game */ }
}

// ---------- Playback ----------
let audioEl = null; // single reusable element: a new speak() stops the old one
function stopCurrent() {
  if (audioEl) {
    try { audioEl.pause(); audioEl.removeAttribute('src'); } catch { /* ignore */ }
    audioEl.onerror = null;
  }
  try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
}

export function speak(text) {
  const t = (text || '').trim();
  if (!t) return;
  stopCurrent();
  const { urls } = pickAudioSource(t);
  if (!urls.length || typeof Audio === 'undefined') { synthSpeak(t); return; }
  if (!audioEl) audioEl = new Audio();
  let i = 0;
  const tryNext = () => {
    if (i >= urls.length) { synthSpeak(t); return; }
    const url = urls[i++];
    audioEl.onerror = tryNext;
    audioEl.src = url;
    try { audioEl.volume = volume; } catch { /* ignore */ }
    const p = audioEl.play();
    if (p && typeof p.catch === 'function') p.catch(tryNext);
  };
  tryNext();
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}

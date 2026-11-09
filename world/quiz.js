// Mandatory quiz gate for the treasure hunt.
//
// Rules (set by the parent, implemented literally):
//   - After QUIZ_INTERVAL_MS of actual play, a full-screen quiz appears and
//     blocks the game until the question is answered correctly.
//   - A wrong answer locks the options for QUIZ_PENALTY_MS, then the SAME
//     question is asked again (options may reshuffle). Loops until correct.
//   - There is no way to dismiss the quiz without a correct answer: no close
//     button, and Escape is swallowed while it is open.
// Questions come from the generated unit data (world/hunt-data.js): the
// current chapter's unit when a hunt is active, otherwise U2 + U5 combined.
// Speech goes through world/speak.js, so questions are read aloud with the
// pre-generated clips, and the modal carries the shared volume slider.

import { createVolumeControl } from './speak.js';

export const QUIZ_INTERVAL_MS = 180000; // play time between quizzes: 3 minutes
export const QUIZ_PENALTY_MS = 60000; // wait after a wrong answer: 1 minute

const PRAISE_MS = 1200; // how long "Well done!" shows before the modal closes

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Build one question from unit word lists. direction 'en-zh': hear/see the
// English, pick the Chinese meaning. 'zh-en': see the Chinese, pick the
// English word (the answer is never spoken aloud in that direction).
export function buildQuestion(units, rng = Math.random) {
  const pool = [];
  for (const u of units || []) for (const w of u.words || []) {
    if (w.word && w.translation) pool.push(w);
  }
  if (pool.length < 3) return null;
  const target = pool[Math.floor(rng() * pool.length)];
  const direction = rng() < 0.25 ? 'zh-en' : 'en-zh';
  const keyOf = direction === 'en-zh' ? 'translation' : 'word';
  const correctText = target[keyOf];
  const others = shuffle(pool.filter(w => w !== target && w[keyOf] !== correctText), rng);
  const picked = [];
  const used = new Set([correctText]);
  for (const w of others) {
    if (picked.length >= 2) break;
    if (used.has(w[keyOf])) continue;
    used.add(w[keyOf]);
    picked.push(w[keyOf]);
  }
  if (picked.length < 2) return null;
  return {
    direction,
    word: target.word,
    translation: target.translation,
    speakText: direction === 'en-zh' ? target.word : null,
    prompt: direction === 'en-zh' ? target.word : target.translation,
    options: shuffle([correctText, ...picked], rng),
    correctText,
  };
}

// DOM-free quiz state machine. tick() is driven by the controller with real
// elapsed time; `counting` is false while the tab is hidden, so hidden time
// never counts toward the 3 minutes. States: idle -> open -> penalty ->
// open (same question) -> idle (correct, timer reset).
export class QuizCore {
  constructor({ intervalMs = QUIZ_INTERVAL_MS, penaltyMs = QUIZ_PENALTY_MS } = {}) {
    this.intervalMs = intervalMs;
    this.penaltyMs = penaltyMs;
    this.state = 'idle';
    this.playMs = 0;
    this.penaltyLeftMs = 0;
    this.question = null;
  }
  // Returns 'open' on the tick where the quiz should appear, else null.
  tick(dtMs, counting = true) {
    if (this.state === 'penalty') {
      this.penaltyLeftMs -= dtMs;
      if (this.penaltyLeftMs <= 0) { this.penaltyLeftMs = 0; this.state = 'open'; }
      return null;
    }
    if (this.state !== 'idle' || !counting) return null;
    this.playMs += dtMs;
    if (this.playMs >= this.intervalMs) { this.state = 'open'; return 'open'; }
    return null;
  }
  setQuestion(q) { this.question = q; }
  // Returns 'correct' | 'wrong' | null (not answerable right now).
  answer(text) {
    if (this.state !== 'open' || !this.question) return null;
    if (text === this.question.correctText) {
      this.state = 'idle';
      this.playMs = 0;
      this.question = null;
      return 'correct';
    }
    this.state = 'penalty';
    this.penaltyLeftMs = this.penaltyMs;
    return 'wrong';
  }
  penaltySeconds() { return Math.ceil(this.penaltyLeftMs / 1000); }
}

const CSS = `
#quiz-overlay{position:fixed;inset:0;z-index:200;background:rgba(10,14,10,.78);
  display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;
  font:16px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#fff}
#quiz-overlay .qz-card{width:min(520px,100%);background:#20301c;border:3px solid #5a4632;
  border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.5);padding:18px 18px 14px;text-align:center}
#quiz-overlay .qz-title{font-size:19px;font-weight:700}
#quiz-overlay .qz-sub{font-size:14px;color:#c5e1a5;margin-top:2px}
#quiz-overlay .qz-prompt{font-size:34px;font-weight:800;margin:12px 0 4px;word-break:break-word}
#quiz-overlay .qz-options{display:flex;flex-direction:column;gap:10px;margin-top:12px}
#quiz-overlay .qz-options button{font:inherit;font-size:21px;font-weight:700;cursor:pointer;
  border:0;border-radius:12px;padding:14px 10px;background:#558b2f;color:#fff}
#quiz-overlay .qz-options button:disabled{opacity:.45;cursor:default}
#quiz-overlay .qz-options button.qz-right{background:#7cb342;outline:3px solid #ffd54f}
#quiz-overlay .qz-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:14px}
#quiz-overlay .qz-speak{font:inherit;cursor:pointer;border:0;border-radius:9px;padding:8px 14px;
  background:#7cb342;color:#fff;font-weight:600}
#quiz-overlay .qz-msg{font-size:19px;min-height:28px;margin-top:8px}
#quiz-overlay .qz-count{font-size:26px;font-weight:800;color:#ffd54f}
#quiz-overlay [hidden]{display:none!important}
#quiz-overlay[hidden]{display:none!important}
`;

// DOM controller. Options for tests: intervalMs / penaltyMs / rng / now
// overrides. Timing is WALL-CLOCK (performance.now deltas), not summed frame
// dt: the engine caps frame dt at 0.05 s, so on a slow device summed dt runs
// slower than real time and the quiz would arrive late. Hidden-tab spans are
// excluded by resetting the clock baseline on visibilitychange (rAF also
// stops while hidden, so no ticks are delivered then anyway).
export function createQuizGate({ speak, getUnits, intervalMs, penaltyMs, rng = Math.random, now = () => performance.now() } = {}) {
  const core = new QuizCore({ intervalMs, penaltyMs });
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'quiz-overlay';
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="qz-card" role="dialog" aria-modal="true" aria-label="答题时间">
      <div class="qz-title">⭐ Question time! 答题时间 ⭐</div>
      <div class="qz-sub"></div>
      <div class="qz-prompt"></div>
      <div class="qz-options"></div>
      <div class="qz-msg"></div>
      <div class="qz-count" hidden></div>
      <div class="qz-foot">
        <button type="button" class="qz-speak">🔊 再听一遍</button>
        <span class="qz-vol"></span>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.qz-vol').appendChild(createVolumeControl());

  const el = {
    sub: overlay.querySelector('.qz-sub'),
    prompt: overlay.querySelector('.qz-prompt'),
    options: overlay.querySelector('.qz-options'),
    msg: overlay.querySelector('.qz-msg'),
    count: overlay.querySelector('.qz-count'),
    speakBtn: overlay.querySelector('.qz-speak'),
  };

  let praiseUntil = 0;

  // While the modal is open, game keys never reach the engine: this listener
  // runs in the capture phase, before the engine's own window keydown.
  // Keys pressed inside the modal (e.g. Tab between options) still work.
  const keyGuard = e => {
    if (overlay.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return; }
    if (!overlay.contains(e.target)) { e.stopPropagation(); e.preventDefault(); }
  };
  addEventListener('keydown', keyGuard, true);
  addEventListener('keyup', keyGuard, true);

  function renderOptions() {
    const q = core.question;
    el.options.innerHTML = '';
    for (const text of shuffle(q.options, rng)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = text;
      b.addEventListener('click', () => onAnswer(text, b));
      el.options.appendChild(b);
    }
  }

  function renderQuestion() {
    const q = core.question;
    el.sub.textContent = q.direction === 'en-zh' ? 'What does this word mean? 这个词是什么意思？' : '哪个是它的英语？点一点！';
    el.prompt.textContent = q.prompt;
    el.msg.textContent = '';
    el.count.hidden = true;
    el.speakBtn.hidden = !q.speakText;
    renderOptions();
  }

  function openQuiz() {
    const q = buildQuestion(getUnits(), rng);
    if (!q) { core.state = 'idle'; core.playMs = 0; return; }
    core.setQuestion(q);
    overlay.hidden = false;
    renderQuestion();
    if (q.speakText) speak?.(q.speakText);
  }

  function onAnswer(text, btn) {
    const result = core.answer(text);
    if (result === 'correct') {
      btn.classList.add('qz-right');
      for (const b of el.options.children) b.disabled = true;
      el.msg.textContent = 'Well done! ⭐ 答对啦！';
      speak?.('Well done!');
      praiseUntil = performance.now() + PRAISE_MS;
    } else if (result === 'wrong') {
      for (const b of el.options.children) b.disabled = true;
      el.msg.textContent = '不对哦，再想一想 🤔';
      speak?.('Try again!');
    }
  }

  el.speakBtn.addEventListener('click', () => {
    if (core.question?.speakText) speak?.(core.question.speakText);
  });

  let lastNow = null;
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { lastNow = null; });
  }

  return {
    core,
    overlay,
    openNow: openQuiz, // for tests / manual triggering
    // Seconds until the next quiz while idle; null while a quiz is up.
    nextInSeconds() {
      if (core.state !== 'idle') return null;
      return Math.max(0, Math.ceil((core.intervalMs - core.playMs) / 1000));
    },
    update() {
      const t = now();
      const dtMs = lastNow == null ? 0 : Math.max(0, t - lastNow);
      lastNow = t;
      const wasHidden = overlay.hidden;
      if (!wasHidden && praiseUntil && performance.now() >= praiseUntil) {
        praiseUntil = 0;
        overlay.hidden = true;
        return;
      }
      const counting = typeof document === 'undefined' || document.visibilityState !== 'hidden';
      const event = core.tick(dtMs, counting && overlay.hidden);
      if (event === 'open') openQuiz();
      if (core.state === 'penalty') {
        el.count.hidden = false;
        el.count.textContent = `⏳ ${core.penaltySeconds()} 秒后可以再试`;
      } else if (core.state === 'open' && el.count.hidden === false && !overlay.hidden && !praiseUntil) {
        // Penalty just ended: the same question, options reshuffled.
        el.count.hidden = true;
        el.msg.textContent = '再试一次，你可以的！';
        renderOptions();
      }
    },
  };
}

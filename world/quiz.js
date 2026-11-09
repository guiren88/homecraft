// Mandatory quiz gate for the treasure hunt.
//
// Rules (set by the parent, implemented literally):
//   - After QUIZ_INTERVAL_MS of actual play, a full-screen quiz appears and
//     blocks the game until a round of QUIZ_QUESTIONS_PER_ROUND questions has
//     been answered correctly — all of them, one after another.
//   - A wrong answer locks the options for QUIZ_PENALTY_MS, then the SAME
//     question is asked again (options may reshuffle). Loops until correct,
//     then the round continues with the next question.
//   - There is no way to dismiss the quiz before the round is complete: no
//     close button, and Escape is swallowed while it is open.
// Questions come from the generated unit data (world/hunt-data.js): the
// current chapter's unit when a hunt is active, otherwise U2 + U5 combined.
// Speech goes through world/speak.js, so questions are read aloud with the
// pre-generated clips, and the modal carries the shared volume slider.

import { createVolumeControl } from './speak.js';
import { MistakeBook } from './mistake-book.js';

export const QUIZ_INTERVAL_MS = 180000; // play time between quizzes: 3 minutes
export const QUIZ_PENALTY_MS = 60000; // wait after a wrong answer: 1 minute
export const QUIZ_QUESTIONS_PER_ROUND = 5; // questions per round, all must be answered correctly
export const REVIEW_INTERVAL_MS = 900000; // play time between mistake-book reviews: 15 minutes
export const REVIEW_MAX_QUESTIONS = 5; // words per review session

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
export function buildQuestion(units, rng = Math.random, excludeWords = null) {
  let pool = [];
  for (const u of units || []) for (const w of u.words || []) {
    if (w.word && w.translation) pool.push(w);
  }
  // Within one round, do not ask the same word twice (when avoidable).
  if (excludeWords && excludeWords.size) {
    const fresh = pool.filter(w => !excludeWords.has(w.word));
    if (fresh.length >= 3) pool = fresh;
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

// Build one review question for a specific mistake-book entry: the target is
// fixed (that word), distractors come from the unit word pool.
export function buildReviewQuestion(entry, units, rng = Math.random) {
  if (!entry?.word || !entry?.translation) return null;
  const pool = [];
  for (const u of units || []) for (const w of u.words || []) {
    if (w.word && w.translation) pool.push(w);
  }
  const direction = rng() < 0.25 ? 'zh-en' : 'en-zh';
  const keyOf = direction === 'en-zh' ? 'translation' : 'word';
  const correctText = entry[keyOf];
  const others = shuffle(pool.filter(w => w.word !== entry.word && w[keyOf] !== correctText), rng);
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
    word: entry.word,
    translation: entry.translation,
    speakText: direction === 'en-zh' ? entry.word : null,
    prompt: direction === 'en-zh' ? entry.word : entry.translation,
    options: shuffle([correctText, ...picked], rng),
    correctText,
  };
}

// DOM-free quiz state machine. tick() is driven by the controller with real
// elapsed time; `counting` is false while the tab is hidden, so hidden time
// never counts toward the 3 minutes. States: idle -> open -> penalty ->
// open (same question) -> open (next question) -> ... -> idle (round
// complete after questionsPerRound correct answers, timer reset).
export class QuizCore {
  constructor({ intervalMs = QUIZ_INTERVAL_MS, penaltyMs = QUIZ_PENALTY_MS, questionsPerRound = QUIZ_QUESTIONS_PER_ROUND, reviewIntervalMs = REVIEW_INTERVAL_MS } = {}) {
    this.intervalMs = intervalMs;
    this.penaltyMs = penaltyMs;
    this.questionsPerRound = questionsPerRound; // regular round size
    this.sessionSize = questionsPerRound; // questions in the current session (round or review)
    this.reviewIntervalMs = reviewIntervalMs;
    this.state = 'idle';
    this.playMs = 0;
    this.reviewMs = 0; // play time accumulated toward the next mistake-book review
    this.penaltyLeftMs = 0;
    this.question = null;
    this.answered = 0; // correct answers so far in the current round
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
    this.reviewMs += dtMs;
    if (this.playMs >= this.intervalMs) { this.state = 'open'; this.answered = 0; this.sessionSize = this.questionsPerRound; return 'open'; }
    return null;
  }
  // A review is due when enough play time passed; the controller only opens
  // one when the mistake book is non-empty.
  get reviewDue() { return this.reviewMs >= this.reviewIntervalMs; }
  resetReviewTimer() { this.reviewMs = 0; }
  // Start a review session of `count` questions (reuses the round machinery:
  // answer() then counts progress against `count` via sessionSize).
  startReview(count) {
    this.state = 'open';
    this.answered = 0;
    this.sessionSize = count;
  }
  setQuestion(q) { this.question = q; }
  // Returns 'correct' (round continues) | 'round-complete' | 'wrong' | null.
  answer(text) {
    if (this.state !== 'open' || !this.question) return null;
    if (text === this.question.correctText) {
      this.answered += 1;
      this.question = null;
      if (this.answered >= this.sessionSize) {
        this.state = 'idle';
        this.playMs = 0;
        this.answered = 0;
        return 'round-complete';
      }
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
export function createQuizGate({ speak, getUnits, intervalMs, penaltyMs, questionsPerRound, reviewIntervalMs, reviewMaxQuestions = REVIEW_MAX_QUESTIONS, mistakeBook = new MistakeBook(), rng = Math.random, now = () => performance.now() } = {}) {
  const core = new QuizCore({ intervalMs, penaltyMs, questionsPerRound, reviewIntervalMs });
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
    title: overlay.querySelector('.qz-title'),
    sub: overlay.querySelector('.qz-sub'),
    prompt: overlay.querySelector('.qz-prompt'),
    options: overlay.querySelector('.qz-options'),
    msg: overlay.querySelector('.qz-msg'),
    count: overlay.querySelector('.qz-count'),
    speakBtn: overlay.querySelector('.qz-speak'),
  };

  let praiseUntil = 0;
  let nextAt = 0; // when the next question of the round appears (after a correct answer)
  let usedWords = new Set(); // words already asked in the current round
  let sessionType = 'round'; // 'round' | 'review'
  let reviewQueue = []; // mistake-book entries for the current review session
  let currentHadWrong = false; // the current question was missed at least once

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
    const progress = sessionType === 'review'
      ? `错题 第 ${core.answered + 1} / ${core.sessionSize} 题 · `
      : `第 ${core.answered + 1} / ${core.sessionSize} 题 · `;
    el.sub.textContent = progress + (q.direction === 'en-zh' ? 'What does this word mean? 这个词是什么意思？' : '哪个是它的英语？点一点！');
    el.prompt.textContent = q.prompt;
    el.msg.textContent = '';
    el.count.hidden = true;
    el.speakBtn.hidden = !q.speakText;
    renderOptions();
  }

  function presentNextQuestion() {
    currentHadWrong = false;
    let q = null;
    if (sessionType === 'review') {
      const entry = reviewQueue[core.answered];
      if (entry) q = buildReviewQuestion(entry, getUnits(), rng);
    } else {
      q = buildQuestion(getUnits(), rng, usedWords);
    }
    if (!q) { // no usable question bank: end the session gracefully
      core.state = 'idle'; core.playMs = 0; core.answered = 0;
      overlay.hidden = true;
      return;
    }
    usedWords.add(q.word);
    core.setQuestion(q);
    renderQuestion();
    if (q.speakText) speak?.(q.speakText);
  }

  function openQuiz() {
    sessionType = 'round';
    el.title.textContent = '⭐ Question time! 答题时间 ⭐';
    core.answered = 0;
    usedWords = new Set();
    overlay.hidden = false;
    presentNextQuestion(); // hides the overlay again if no question can be built
  }

  // Open a mistake-book review session. Returns false (and does nothing)
  // when the book is empty.
  function openReview() {
    if (!mistakeBook.size) return false;
    sessionType = 'review';
    el.title.textContent = '📕 错题本复习时间';
    reviewQueue = mistakeBook.list().slice(0, reviewMaxQuestions);
    core.startReview(reviewQueue.length);
    core.resetReviewTimer();
    usedWords = new Set();
    overlay.hidden = false;
    presentNextQuestion();
    return core.state !== 'idle';
  }

  function onAnswer(text, btn) {
    const q = core.question; // capture before answer() clears it
    const result = core.answer(text);
    if (result === 'correct' || result === 'round-complete') {
      btn.classList.add('qz-right');
      for (const b of el.options.children) b.disabled = true;
      // In a review, a word leaves the book only when answered correctly on
      // the first try; if it needed a penalty retry it stays for next time.
      const mastered = sessionType === 'review' && !currentHadWrong;
      if (sessionType === 'review' && q) {
        if (mastered) mistakeBook.remove(q.word);
      }
      if (result === 'correct') {
        el.msg.textContent = sessionType === 'review'
          ? (mastered ? 'Well done! ⭐ 答对啦！这个词学会了，从错题本划掉 ✓' : 'Well done! ⭐ 答对啦！（这个词下次复习还会再出现）')
          : `Well done! ⭐ 答对啦！（已答对 ${core.answered} / ${core.sessionSize}）`;
        speak?.('Well done!');
        nextAt = performance.now() + 900; // brief cheer, then the next question
      } else {
        el.msg.textContent = sessionType === 'review'
          ? '复习完成！🎉 错题本里的词又学会了一些'
          : `Well done! ⭐⭐ ${core.sessionSize} 道题全部答对，太棒了！`;
        speak?.('Well done!');
        praiseUntil = performance.now() + PRAISE_MS;
      }
    } else if (result === 'wrong') {
      currentHadWrong = true;
      if (q) mistakeBook.add(q.word, q.translation);
      for (const b of el.options.children) b.disabled = true;
      el.msg.textContent = '不对哦，再想一想 🤔（这个词记进错题本了）';
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
    mistakeBook,
    openNow: openQuiz, // for tests / manual triggering
    openReviewNow: openReview, // for tests / manual triggering
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
      if (!wasHidden && nextAt && performance.now() >= nextAt) {
        nextAt = 0;
        presentNextQuestion();
        return;
      }
      const counting = typeof document === 'undefined' || document.visibilityState !== 'hidden';
      const prevState = core.state;
      const event = core.tick(dtMs, counting && overlay.hidden);
      if (event === 'open') openQuiz();
      // Mistake-book review: every REVIEW_INTERVAL_MS of play, when the book
      // has entries. A regular round opening on the same tick goes first;
      // the review then opens as soon as that round finishes.
      if (overlay.hidden && core.state === 'idle' && core.reviewDue && mistakeBook.size) {
        openReview();
      }
      if (core.state === 'penalty') {
        el.count.hidden = false;
        el.count.textContent = `⏳ ${core.penaltySeconds()} 秒后可以再试`;
      } else if (prevState === 'penalty' && core.state === 'open' && !overlay.hidden) {
        // Penalty just ended (detected by the state transition itself, so a
        // single long frame that crosses the whole wait still works): the
        // same question, options reshuffled and re-enabled.
        el.count.hidden = true;
        el.msg.textContent = '再试一次，你可以的！';
        renderOptions();
      }
    },
  };
}

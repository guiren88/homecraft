// Logic tests for world/speak.js (pre-generated audio + shared volume) and
// world/quiz.js (mandatory quiz gate). Run: node tools/treasure-features.test.mjs
// Uses jsdom for the DOM parts; jsdom is a dev-only test dependency
// (install with: npm install --no-save jsdom). Not part of the site.
import assert from 'node:assert';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost/' });
global.window = dom.window;
global.document = dom.window.document;
global.localStorage = dom.window.localStorage;
global.addEventListener = dom.window.addEventListener.bind(dom.window);

// Fake speechSynthesis: one decent voice; records utterances.
const utterances = [];
dom.window.speechSynthesis = {
  getVoices: () => [{ name: 'Samantha', lang: 'en-US' }],
  speak: u => utterances.push(u),
  cancel: () => {},
};
global.SpeechSynthesisUtterance = class {
  constructor(text) { this.text = text; }
};

// Fake Audio element: succeeds for local files, fails for remote TTS hosts.
class FakeAudio {
  static instances = [];
  constructor() { this.volume = 1; this.src = ''; FakeAudio.instances.push(this); }
  play() {
    return this.src.includes('dictvoice') || this.src.includes('fanyi.baidu')
      ? Promise.reject(new Error('remote blocked in test'))
      : Promise.resolve();
  }
  pause() {}
  removeAttribute() {}
}
global.Audio = FakeAudio;
const tick = () => new Promise(r => setTimeout(r, 0));

const speakMod = await import('../world/speak.js');
const { speak, pickAudioSource, getVolume, setVolume, createVolumeControl, VOLUME_KEY } = speakMod;
const quizMod = await import('../world/quiz.js');
const { QuizCore, buildQuestion, buildReviewQuestion, createQuizGate, QUIZ_INTERVAL_MS, QUIZ_PENALTY_MS, QUIZ_QUESTIONS_PER_ROUND, REVIEW_INTERVAL_MS } = quizMod;
const { MistakeBook, MISTAKE_BOOK_KEY } = await import('../world/mistake-book.js');
const { HUNT_UNITS } = await import('../world/hunt-data.js');

let n = 0;
const ok = (cond, name) => { assert.ok(cond, name); n++; console.log(`ok ${n} - ${name}`); };

// ---------- pickAudioSource ----------
{
  const local = pickAudioSource('Well done!');
  ok(local.kind === 'local' && local.urls[0] === 'assets/audio/well-done.mp3', 'manifest text uses local MP3');
  const clue = pickAudioSource("Where's my ball? Look under the bed!");
  ok(clue.kind === 'local', 'hunt clue uses local MP3');
  const word = pickAudioSource('zebra');
  ok(word.urls.length === 2 && word.urls[0].includes('dict.youdao.com') && word.urls[1].includes('fanyi.baidu.com'),
    'unknown short word: Youdao then Baidu');
  const sent = pickAudioSource('The quick brown fox jumps high.');
  ok(sent.urls.length === 1 && sent.urls[0].includes('fanyi.baidu.com'), 'unknown sentence: Baidu only');
}

// ---------- Volume: default, persistence, application ----------
{
  ok(getVolume() === 1, 'default volume is 1');
  setVolume(0.4);
  ok(localStorage.getItem(VOLUME_KEY) === '0.4', 'volume persisted to localStorage');
  speak('Well done!');
  const el = FakeAudio.instances[FakeAudio.instances.length - 1];
  ok(el.src === 'assets/audio/well-done.mp3' && el.volume === 0.4, 'volume applied to Audio element on speak');
  setVolume(0.7);
  ok(el.volume === 0.7, 'setVolume adjusts the playing Audio element live');

  // Remote failure falls back to speechSynthesis with the same volume.
  speak('The quick brown fox jumps high.');
  await tick(); await tick();
  const u = utterances[utterances.length - 1];
  ok(u && u.text === 'The quick brown fox jumps high.' && u.volume === 0.7,
    'utterance volume follows the shared setting after remote failure');

  // Slider component: change persists and syncs a second control.
  setVolume(1);
  const c1 = createVolumeControl();
  const c2 = createVolumeControl();
  document.body.append(c1, c2);
  const s1 = c1.querySelector('input[type=range]');
  const s2 = c2.querySelector('input[type=range]');
  s1.value = '25';
  s1.dispatchEvent(new dom.window.Event('input'));
  ok(getVolume() === 0.25 && localStorage.getItem(VOLUME_KEY) === '0.25', 'slider change persists');
  ok(s2.value === '25', 'second slider reflects the shared setting');
  // Boost range: slider goes to 500% and values above 1 persist unclamped.
  ok(s1.max === '500', 'slider max is 500%');
  s1.value = '300';
  s1.dispatchEvent(new dom.window.Event('input'));
  ok(getVolume() === 3 && localStorage.getItem(VOLUME_KEY) === '3', 'volume above 100% persists');
  ok(c1.querySelector('.vol-pct').textContent === '300%', 'percentage readout shows 300%');
  setVolume(99);
  ok(getVolume() === 5, 'volume clamps at 500%');
  setVolume(1);
}

// ---------- QuizCore timing ----------
{
  ok(QUIZ_INTERVAL_MS === 180000 && QUIZ_PENALTY_MS === 60000, 'constants are 180000 / 60000');
  const core = new QuizCore({});
  ok(core.tick(179000, true) === null && core.state === 'idle', 'no quiz before 180 s');
  ok(core.tick(999, true) === null, 'no quiz at 179.999 s');
  ok(core.tick(1, true) === 'open' && core.state === 'open', 'quiz triggers at 180 accumulated seconds');
  const hidden = new QuizCore({});
  ok(hidden.tick(999999, false) === null && hidden.playMs === 0, 'hidden time does not accumulate');
  // A round needs ALL questions correct; a wrong answer keeps the same one.
  ok(QUIZ_QUESTIONS_PER_ROUND === 5, 'default round is 5 questions');
  const round = new QuizCore({ questionsPerRound: 3 });
  round.tick(180000, true);
  const mk = w => ({ word: w, correctText: `zh-${w}` });
  round.setQuestion(mk('a'));
  ok(round.answer('zh-a') === 'correct' && round.state === 'open' && round.answered === 1, 'first correct keeps the round open');
  round.setQuestion(mk('b'));
  ok(round.answer('nope') === 'wrong' && round.state === 'penalty' && round.answered === 1, 'wrong answer does not advance the round');
  round.tick(60000, true);
  ok(round.state === 'open' && round.question.word === 'b', 'same question returns after the penalty');
  ok(round.answer('zh-b') === 'correct' && round.answered === 2, 'second correct advances to 2');
  round.setQuestion(mk('c'));
  ok(round.answer('zh-c') === 'round-complete' && round.state === 'idle' && round.playMs === 0, 'final correct completes the round and resets the timer');
}

// ---------- buildQuestion ----------
{
  let seed = 42;
  const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  let sawBoth = new Set();
  for (let i = 0; i < 40; i++) {
    const q = buildQuestion([HUNT_UNITS.u2, HUNT_UNITS.u5], rng);
    assert.equal(q.options.length, 3);
    assert.equal(new Set(q.options).size, 3);
    assert.ok(q.options.includes(q.correctText));
    const src = [...HUNT_UNITS.u2.words, ...HUNT_UNITS.u5.words].find(w => w.word === q.word);
    if (q.direction === 'en-zh') assert.equal(q.correctText, src.translation);
    else assert.equal(q.correctText, q.word);
    sawBoth.add(q.direction);
  }
  n++; console.log(`ok ${n} - buildQuestion: 3 unique options, exactly one correct (directions seen: ${[...sawBoth].join(', ')})`);
}

// ---------- Quiz gate DOM flow ----------
{
  let seed = 7;
  const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const spoken = [];
  let fakeNow = 0;
  const gate = createQuizGate({
    speak: t => spoken.push(t),
    getUnits: () => [HUNT_UNITS.u2],
    intervalMs: 3000, penaltyMs: 60000, questionsPerRound: 2, rng,
    now: () => fakeNow,
  });
  const advance = ms => { fakeNow += ms; gate.update(); };
  const overlay = gate.overlay;
  ok(overlay.hidden, 'overlay starts hidden');
  gate.update(); // first tick only sets the wall-clock baseline
  advance(2999);
  ok(overlay.hidden, 'overlay still hidden at 2.999 s of play');
  ok(gate.nextInSeconds() === 1, 'nextInSeconds reports the remaining second');
  advance(1);
  ok(!overlay.hidden, 'overlay opens at the interval');
  ok(gate.nextInSeconds() === null, 'nextInSeconds is null while the quiz is up');
  const q = gate.core.question;
  ok(!!q, 'a question was built');
  if (q.speakText) ok(spoken.includes(q.speakText), 'question word is auto-spoken on open');
  ok(!!overlay.querySelector('.vol-control input[type=range]'), 'quiz modal has the volume slider');

  const buttons = [...overlay.querySelectorAll('.qz-options button')];
  ok(buttons.length === 3, 'three big option buttons');
  const allButtons = [...overlay.querySelectorAll('button')];
  ok(!allButtons.some(b => /✕|×|close|关闭/i.test(b.textContent)), 'no close/dismiss button exists');
  ok(typeof gate.core.dismiss === 'undefined' && typeof gate.core.close === 'undefined', 'core has no dismiss API');
  dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
  ok(!overlay.hidden, 'Escape does not dismiss the quiz');

  const wrongBtn = buttons.find(b => b.textContent !== q.correctText);
  wrongBtn.click();
  ok(gate.core.state === 'penalty', 'wrong answer enters penalty state');
  ok([...overlay.querySelectorAll('.qz-options button')].every(b => b.disabled), 'options lock during penalty');
  advance(1000);
  ok(overlay.querySelector('.qz-count').textContent.includes('59'), 'countdown shows 59 s after 1 s');
  advance(59000);
  ok(gate.core.state === 'open', 'penalty ends and the quiz reopens');
  ok(gate.core.question === q, 'the SAME question returns after the penalty');
  ok([...overlay.querySelectorAll('.qz-options button')].every(b => !b.disabled), 'options unlock after the penalty');

  const rightBtn = [...overlay.querySelectorAll('.qz-options button')].find(b => b.textContent === q.correctText);
  rightBtn.click();
  ok(gate.core.state === 'open' && gate.core.answered === 1, 'first correct advances the round, modal stays open');
  ok(overlay.querySelector('.qz-sub').textContent.includes('第 1 / 2 题'), 'progress shows question 1 of 2');
  await new Promise(r => setTimeout(r, 1000));
  gate.update();
  const q2 = gate.core.question;
  ok(!!q2 && q2.word !== q.word, 'next question appears and is a different word');
  ok(overlay.querySelector('.qz-sub').textContent.includes('第 2 / 2 题'), 'progress shows question 2 of 2');
  const rightBtn2 = [...overlay.querySelectorAll('.qz-options button')].find(b => b.textContent === q2.correctText);
  rightBtn2.click();
  ok(gate.core.state === 'idle' && gate.core.playMs === 0, 'final correct completes the round and resets the timer');
  ok(overlay.querySelector('.qz-msg').textContent.includes('全部答对'), 'round-complete praise is shown');
  await new Promise(r => setTimeout(r, 1300));
  gate.update();
  ok(overlay.hidden, 'modal closes after praise');
  advance(2999);
  ok(overlay.hidden && gate.core.playMs === 2999, 'next cycle counts up from zero on the wall clock');
}

// ---------- Mistake book （错题本） ----------
{
  ok(REVIEW_INTERVAL_MS === 900000, 'review interval constant is 15 minutes');
  const store = new Map();
  const fakeStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  const book = new MistakeBook(fakeStorage);
  ok(book.size === 0, 'book starts empty');
  book.add('ball', '球', 1000);
  book.add('desk', '书桌', 2000);
  book.add('ball', '球', 3000);
  ok(book.size === 2 && book.get('ball').wrong === 2, 'repeat misses bump the count');
  ok(store.has(MISTAKE_BOOK_KEY), 'book persists to storage');
  const reloaded = new MistakeBook(fakeStorage);
  ok(reloaded.size === 2 && reloaded.list()[0].word === 'ball', 'book reloads, most-missed first');
  reloaded.remove('ball');
  ok(reloaded.size === 1 && !reloaded.has('ball'), 'remove deletes the entry');

  const rq = buildReviewQuestion({ word: 'ball', translation: '球' }, [HUNT_UNITS.u2], () => 0.6);
  ok(rq && rq.word === 'ball' && rq.options.includes(rq.correctText) && rq.options.length === 3, 'review question targets the book word');
}

// ---------- Review session flow (every 15 min, first-try correct removes) ----------
{
  let seed = 99;
  const rng = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const store = new Map();
  const fakeStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
  const book = new MistakeBook(fakeStorage);
  const w1 = HUNT_UNITS.u2.words[0], w2 = HUNT_UNITS.u2.words[1];
  book.add(w1.word, w1.translation, 1000);
  book.add(w2.word, w2.translation, 2000);
  let fakeNow = 0;
  const gate = createQuizGate({
    speak: () => {}, getUnits: () => [HUNT_UNITS.u2],
    intervalMs: 3600000, penaltyMs: 60000, reviewIntervalMs: 4000,
    mistakeBook: book, rng, now: () => fakeNow,
  });
  const advance = ms => { fakeNow += ms; gate.update(); };
  gate.update(); // baseline
  advance(3999);
  ok(gate.overlay.hidden, 'no review before 15-minute mark (scaled: 4 s)');
  advance(1);
  ok(!gate.overlay.hidden, 'review opens when due and the book is non-empty');
  ok(gate.overlay.querySelector('.qz-title').textContent.includes('错题本'), 'review title shows');
  const clickCorrect = () => {
    const q = gate.core.question;
    [...gate.overlay.querySelectorAll('.qz-options button')].find(b => b.textContent === q.correctText).click();
    return q;
  };
  const clickWrong = () => {
    const q = gate.core.question;
    [...gate.overlay.querySelectorAll('.qz-options button')].find(b => b.textContent !== q.correctText).click();
    return q;
  };
  const first = clickCorrect();
  ok(!book.has(first.word), 'first-try correct removes the word from the book');
  await new Promise(r => setTimeout(r, 1000));
  gate.update(); // next review question
  const second = clickWrong();
  ok(book.get(second.word)?.wrong === 2, 'wrong answer in review bumps the miss count');
  advance(60000); // penalty elapses (wall clock)
  ok(gate.core.state === 'open' && gate.core.question?.word === second.word, 'same review question returns after penalty');
  clickCorrect();
  ok(book.has(second.word), 'correct after a penalty retry keeps the word in the book');
  await new Promise(r => setTimeout(r, 1300));
  gate.update();
  ok(gate.overlay.hidden, 'review session closes after the last word');
  advance(3999);
  ok(gate.overlay.hidden, 'no review reopens before the next interval even with entries left');

  // Empty book: a due review never opens.
  let fakeNow2 = 0;
  const gate2 = createQuizGate({
    speak: () => {}, getUnits: () => [HUNT_UNITS.u2],
    intervalMs: 3600000, reviewIntervalMs: 4000,
    mistakeBook: new MistakeBook({ getItem: () => null, setItem: () => {} }),
    rng, now: () => fakeNow2,
  });
  gate2.update();
  fakeNow2 += 99999; gate2.update();
  ok(gate2.overlay.hidden, 'no review when the book is empty');

  // A wrong answer in a regular round lands in the book.
  const book3 = new MistakeBook({ getItem: () => null, setItem: () => {} });
  let fakeNow3 = 0;
  const gate3 = createQuizGate({
    speak: () => {}, getUnits: () => [HUNT_UNITS.u2],
    intervalMs: 3000, penaltyMs: 60000, questionsPerRound: 1,
    mistakeBook: book3, rng, now: () => fakeNow3,
  });
  gate3.update();
  fakeNow3 += 3000; gate3.update();
  const gq = gate3.core.question;
  [...gate3.overlay.querySelectorAll('.qz-options button')].find(b => b.textContent !== gq.correctText).click();
  ok(book3.has(gq.word) && book3.get(gq.word).wrong === 1, 'regular-round miss is recorded in the book');
}

// ---------- Treasure hunt smoke test (bar + volume + quiz coexist) ----------
{
  localStorage.clear();
  const { createTreasureHunt } = await import('../world/treasure.js');
  const hunt = createTreasureHunt({
    player: { pos: { x: 1000, z: 1000 } },
    world: { hotspots: [] },
  });
  ok(!!document.querySelector('#treasure-bar'), 'quest bar renders');
  ok(!!document.querySelector('#treasure-bar .vol-control input[type=range]'), 'quest bar has the volume slider');
  hunt.update(0.016);
  n++; console.log(`ok ${n} - treasure update() runs alongside the quiz gate`);
}

console.log(`\nALL ${n} ASSERTIONS PASSED`);

// The mistake book （错题本）: every word the player answers wrongly — in a
// regular quiz round or in a review session — is recorded here and comes
// back in the 15-minute review sessions (world/quiz.js) until it is answered
// correctly on the first try there.
//
// Persisted in localStorage ('homecraft_mistake_book') as a list of
// { word, translation, wrong, lastWrongAt }: `wrong` counts how many times
// the word has been missed, `lastWrongAt` is a Date.now() timestamp. The
// storage backend is injectable for tests.

export const MISTAKE_BOOK_KEY = 'homecraft_mistake_book';

function defaultStorage() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; }
  catch { return null; }
}

export class MistakeBook {
  constructor(storage = defaultStorage()) {
    this.storage = storage;
    this.items = [];
    try {
      const raw = this.storage?.getItem(MISTAKE_BOOK_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        this.items = parsed.filter(i => i && i.word && i.translation);
      }
    } catch { this.items = []; }
  }

  save() {
    try { this.storage?.setItem(MISTAKE_BOOK_KEY, JSON.stringify(this.items)); } catch { /* private mode */ }
  }

  get size() { return this.items.length; }

  get(word) { return this.items.find(i => i.word === word) || null; }

  has(word) { return !!this.get(word); }

  // Record a missed word (new entry, or bump the miss count).
  add(word, translation, now = Date.now()) {
    const hit = this.get(word);
    if (hit) {
      hit.wrong = (hit.wrong || 1) + 1;
      hit.translation = translation || hit.translation;
      hit.lastWrongAt = now;
    } else {
      this.items.push({ word, translation, wrong: 1, lastWrongAt: now });
    }
    this.save();
  }

  // The word was mastered (answered correctly on the first try in review).
  remove(word) {
    const before = this.items.length;
    this.items = this.items.filter(i => i.word !== word);
    if (this.items.length !== before) this.save();
  }

  // Review order: most-missed first, then the longest-waiting.
  list() {
    return this.items.slice().sort((a, b) =>
      (b.wrong || 1) - (a.wrong || 1) || (a.lastWrongAt || 0) - (b.lastWrongAt || 0));
  }
}

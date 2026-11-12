import test from "node:test";
import assert from "node:assert/strict";
import {
  defaults,
  parseImport,
  key,
  rate,
  choose,
  showQuestion,
  grade,
  validateBackup,
} from "../core.js";
const phrase = (id = "a") => ({
  id,
  ja: "今日は寝よう。",
  en: "Let’s sleep.",
  alternatives: [],
  notes: [],
  hint: "Let’s ____.",
  correct: 0,
  attempts: 0,
  mastered: false,
  createdAt: new Date().toISOString(),
  lastAsked: null,
  lastWrong: false,
});
const stage = () => {
  const s = defaults();
  s.phrases = [phrase()];
  s.session = {
    ids: ["a"],
    index: 0,
    results: [],
    shown: false,
    hinted: false,
    graded: false,
  };
  return s;
};
test("single and multiple imports, optional defaults, schema errors", () => {
  assert.equal(
    parseImport('{"phrases":[{"ja":"はい","en":"Yes"}]}')[0].notes.length,
    0,
  );
  assert.equal(
    parseImport(JSON.stringify({ phrases: [phrase(), phrase()] })).length,
    2,
  );
  for (const bad of [
    "x",
    "{}",
    '{"phrases":[{"ja":""}]}',
    '{"phrases":[{"ja":"a","en":"b","notes":[null]}]}',
  ])
    assert.throws(() => parseImport(bad));
});
test("normalized duplicate keys handle width, spaces, case and curly quotes", () =>
  assert.equal(
    key({ ja: " はい ", en: "I’m HERE" }),
    key({ ja: "はい", en: "i'm here" }),
  ));
test("stages cap at ten, unique IDs, mastered excluded and can return", () => {
  const ps = Array.from({ length: 15 }, (_, i) => phrase(String(i)));
  ps[0].mastered = true;
  for (const mode of ["weak", "random"]) {
    const ids = choose(ps, mode);
    assert.equal(ids.length, 10);
    assert.equal(new Set(ids).size, 10);
    assert.ok(!ids.includes("0"));
  }
  assert.equal(choose(ps.slice(0, 2), "weak").length, 1);
  ps[0].mastered = false;
  assert.equal(choose(ps.slice(0, 2), "weak").length, 2);
});
test("question presentation and correct answer recorded once across restart", () => {
  let s = stage();
  showQuestion(s);
  showQuestion(s);
  s = structuredClone(s);
  showQuestion(s);
  grade(s, true);
  grade(s, true);
  assert.equal(s.phrases[0].attempts, 1);
  assert.equal(s.phrases[0].correct, 1);
  assert.equal(s.history.length, 1);
  assert.equal(rate(s.phrases[0]), 100);
});
test("hint forbids correct grade and unfinished attempt stays consistent", () => {
  const s = stage();
  showQuestion(s);
  s.session.hinted = true;
  grade(s, true);
  grade(s, false);
  assert.equal(s.phrases[0].correct, 0);
  assert.equal(s.history[0].result, false);
  assert.equal(s.history[0].hinted, true);
  const unfinished = stage();
  showQuestion(unfinished);
  assert.equal(rate(unfinished.phrases[0]), 0);
  assert.equal(rate(phrase()), null);
  assert.equal(rate({ ...phrase(), correct: 5, attempts: 6 }), 83);
});
test("backup validation checks version, counters, history and uniqueness", () => {
  const s = stage();
  showQuestion(s);
  grade(s, true);
  const b = { type: "midnight-english-backup", version: 1, data: s };
  assert.equal(validateBackup(structuredClone(b)).session, null);
  for (const mutate of [
    (x) => (x.version = 2),
    (x) => (x.data.phrases[0].correct = 99),
    (x) => x.data.phrases.push({ ...x.data.phrases[0] }),
    (x) => (x.data.history[0].hinted = true),
    (x) => (x.data.settings.speed = 99),
  ]) {
    const bad = structuredClone(b);
    mutate(bad);
    assert.throws(() => validateBackup(bad));
  }
});

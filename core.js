export const normalize = (s) =>
  s
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
export const key = (p) => normalize(p.ja) + "\n" + normalize(p.en);
export const rate = (p) =>
  p.attempts ? Math.round((p.correct / p.attempts) * 100) : null;
export const defaults = () => ({
  phrases: [],
  history: [],
  session: null,
  settings: { mode: "weak", speed: 1 },
});
export function content(p, where = "フレーズ") {
  if (
    !p ||
    typeof p.ja !== "string" ||
    !p.ja.trim() ||
    typeof p.en !== "string" ||
    !p.en.trim()
  )
    throw Error(where + "：ja と en は空でない文字列が必要です。");
  for (const k of ["alternatives", "notes"])
    if (p[k] !== undefined && !Array.isArray(p[k]))
      throw Error(where + "：" + k + " は配列にしてください。");
  if (p.hint !== undefined && typeof p.hint !== "string")
    throw Error(where + "：hint は文字列にしてください。");
  if ((p.alternatives || []).some((x) => typeof x !== "string"))
    throw Error(where + "：言い換えは文字列にしてください。");
  if (
    (p.notes || []).some(
      (n) =>
        !n ||
        ["expression", "meaning", "example"].some(
          (k) => n[k] !== undefined && typeof n[k] !== "string",
        ),
    )
  )
    throw Error(where + "：ノートの各項目は文字列にしてください。");
  return {
    ja: p.ja.trim(),
    en: p.en.trim(),
    alternatives: p.alternatives || [],
    hint: p.hint || "",
    notes: (p.notes || []).map((n) => ({
      expression: n.expression || "",
      meaning: n.meaning || "",
      example: n.example || "",
    })),
  };
}
export function parseImport(text) {
  const data = JSON.parse(text);
  if (data.type || !Array.isArray(data.phrases) || !data.phrases.length)
    throw Error('追加用の {"phrases": [...]} を入力してください。');
  return data.phrases.map((p, i) => content(p, `${i + 1}件目`));
}
export function choose(phrases, mode, random = Math.random) {
  return phrases
    .filter((p) => !p.mastered)
    .map((p) => ({
      p,
      score:
        mode === "random"
          ? random()
          : -Math.log(Math.max(random(), 0.000001)) /
            (1 +
              (1 - (p.attempts ? p.correct / p.attempts : 0)) * 3 +
              2 / (p.attempts + 1) +
              (p.lastWrong && p.lastAsked
                ? 2 /
                  (1 +
                    Math.max(0, Date.now() - Date.parse(p.lastAsked)) /
                      86400000)
                : 0)),
    }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 10)
    .map((x) => x.p.id);
}
export function showQuestion(s) {
  const q = s.session;
  if (!q || q.index >= q.ids.length) return;
  const p = s.phrases.find((p) => p.id === q.ids[q.index]);
  if (!p) throw Error("出題フレーズが見つかりません。");
  if (!q.shown) {
    p.attempts++;
    p.lastAsked = new Date().toISOString();
    q.shown = true;
    s.history.push({
      id: crypto.randomUUID(),
      phraseId: p.id,
      at: p.lastAsked,
      result: null,
      hinted: false,
    });
    q.eventId = s.history.at(-1).id;
  }
}
export function grade(s, correct) {
  const q = s.session;
  if (!q || q.graded) return;
  const p = s.phrases.find((p) => p.id === q.ids[q.index]);
  const h = s.history.find((h) => h.id === q.eventId);
  const ok = !!correct && !q.hinted;
  q.graded = true;
  q.results.push({ id: p.id, correct: ok });
  if (ok) p.correct++;
  p.lastWrong = !ok;
  h.result = ok;
  h.hinted = !!q.hinted;
}
export function validateBackup(data) {
  if (
    data.type !== "midnight-english-backup" ||
    data.version !== 1 ||
    !data.data
  )
    throw Error("対応していないバックアップ形式です。");
  const s = data.data;
  if (
    !Array.isArray(s.phrases) ||
    !Array.isArray(s.history) ||
    !s.settings ||
    !["weak", "random"].includes(s.settings.mode) ||
    ![1, 0.75].includes(s.settings.speed)
  )
    throw Error("バックアップの設定または履歴が不正です。");
  const ids = new Set();
  for (const p of s.phrases) {
    Object.assign(p, content(p));
    if (
      typeof p.id !== "string" ||
      !p.id ||
      ids.has(p.id) ||
      !Number.isSafeInteger(p.attempts) ||
      !Number.isSafeInteger(p.correct) ||
      p.correct < 0 ||
      p.attempts < p.correct ||
      typeof p.mastered !== "boolean" ||
      !Number.isFinite(Date.parse(p.createdAt)) ||
      (p.lastAsked !== null && !Number.isFinite(Date.parse(p.lastAsked))) ||
      typeof p.lastWrong !== "boolean"
    )
      throw Error("フレーズの成績またはIDが不正です。");
    ids.add(p.id);
  }
  const events = new Set();
  for (const h of s.history) {
    if (
      !h ||
      typeof h.id !== "string" ||
      events.has(h.id) ||
      typeof h.phraseId !== "string" ||
      !Number.isFinite(Date.parse(h.at)) ||
      ![null, true, false].includes(h.result) ||
      typeof h.hinted !== "boolean" ||
      (h.hinted && h.result === true)
    )
      throw Error("学習履歴が不正です。");
    events.add(h.id);
  }
  return { ...s, session: null };
}

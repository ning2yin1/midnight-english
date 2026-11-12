import { read, write } from "./db.js";
import {
  key,
  rate,
  content,
  parseImport,
  choose,
  showQuestion,
  grade,
  validateBackup,
} from "./core.js";
const app = document.querySelector("#app");
let state,
  candidates = [],
  busy = false,
  search = "",
  filter = "all",
  sort = "new";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const pct = (p) => (rate(p) === null ? "—%" : rate(p) + "%");
const button = (text, action, cls = "", extra = "") =>
  `<button type="button" class="${cls}" data-action="${action}" ${extra}>${text}</button>`;
const say = (text) =>
  button(
    "▷ 音声",
    "speak",
    "speak",
    `data-text="${esc(text)}" aria-label="${esc(text)} を再生"`,
  );
function notice(message) {
  const n = document.querySelector("#notice");
  n.textContent = message;
  n.style.display = "block";
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => (n.style.display = "none"), 5000);
}
async function commit(change) {
  const draft = structuredClone(state);
  change(draft);
  await write(draft);
  state = draft;
}
function go(path) {
  location.hash = path;
}
function notes(p) {
  return `${p.alternatives.length ? "<h3>ANOTHER WAY · 言い換え</h3>" + p.alternatives.map((t) => `<div class="note"><p>${esc(t)}</p>${say(t)}</div>`).join("") : ""}${p.notes.length ? "<h3>NOTE · ことばの引き出し</h3>" + p.notes.map((n) => `<div class="note"><strong>${esc(n.expression)}</strong><p>${esc(n.meaning)}</p>${n.example ? `<p>${esc(n.example)}</p>${say(n.example)}` : ""}</div>`).join("") : ""}`;
}
function fields(p, prefix = "") {
  return `<label>日本語<input name="${prefix}ja" value="${esc(p.ja)}" required></label><label>メイン英文<textarea name="${prefix}en" required>${esc(p.en)}</textarea></label><label>言い換え（1行に1つ）<textarea name="${prefix}alternatives">${esc(p.alternatives.join("\n"))}</textarea></label><label>ヒント<textarea name="${prefix}hint">${esc(p.hint)}</textarea></label><label>ノート（JSON配列）<textarea name="${prefix}notes" spellcheck="false">${esc(JSON.stringify(p.notes, null, 2))}</textarea></label>`;
}
function getFields(form, prefix = "") {
  const f = new FormData(form);
  return content({
    ja: f.get(prefix + "ja"),
    en: f.get(prefix + "en"),
    alternatives: f
      .get(prefix + "alternatives")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
    hint: f.get(prefix + "hint"),
    notes: JSON.parse(f.get(prefix + "notes") || "[]"),
  });
}
function card(p) {
  return `<a class="card phrase-link" href="#detail/${p.id}"><div class="row"><span class="pill">${p.mastered ? "✦ 覚えた" : "☾ 学習中"}</span><small>${pct(p)}</small></div><p class="ja">${esc(p.ja)}</p><p class="en">${esc(p.en)}</p><small>正解 ${p.correct} / 出題 ${p.attempts} 回</small></a>`;
}
function render() {
  if (!state) return;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches)
    app.animate([{ opacity: 0.5 }, { opacity: 1 }], { duration: 180 });
  const [page = "home", id] = location.hash.slice(1).split("/");
  document
    .querySelectorAll("nav a")
    .forEach((a) =>
      a.setAttribute("aria-current", a.hash === "#" + page ? "page" : "false"),
    );
  if (page === "home") {
    const a = state.phrases.reduce((n, p) => n + p.attempts, 0),
      c = state.phrases.reduce((n, p) => n + p.correct, 0);
    app.innerHTML = `<section class="hero"><div class="eyebrow">A LITTLE PRACTICE, EVERY NIGHT</div><div class="moon" aria-hidden="true">☾</div><div class="cat" aria-hidden="true"> /ᐠ − ˕ −マ 𓈒 𓏸</div><h1>Good evening.</h1><p>今日のひとことを、明日の自分へ。</p></section><div class="stats"><div><strong>${state.phrases.length}</strong><span>登録フレーズ</span></div><div><strong>${state.phrases.filter((p) => p.mastered).length}</strong><span>覚えた</span></div><div><strong>${a ? Math.round((c / a) * 100) : "—"}<small>%</small></strong><span>全体の正解率</span></div></div><section class="card"><h2>今夜も、少しだけ英語時間。</h2><p class="muted">日本語を見て、声に出して。<br>あなたのペースで練習しましょう。</p><label for="mode">出題モード</label><select id="mode"><option value="weak" ${state.settings.mode === "weak" ? "selected" : ""}>苦手優先モード</option><option value="random" ${state.settings.mode === "random" ? "selected" : ""}>ランダムモード</option></select>${button(state.session ? "途中から再開する →" : "クイズをはじめる →", state.session ? "resume" : "start", "primary full")}<small>1ステージ最大10問 · 学習中のフレーズから出題</small></section><div class="row"><a class="button" href="#list">▤ フレーズ一覧</a><a class="button" href="#add">＋ フレーズ追加</a></div>${state.phrases.length ? "" : '<p class="footer">最初の一歩は、あなたの日常から。<br>ChatGPTのJSONを「追加」に貼り付けてください。</p>'}`;
  } else if (page === "list") {
    app.innerHTML = `<div class="eyebrow">YOUR LITTLE COLLECTION</div><h1>フレーズ一覧 <small>${state.phrases.length}</small></h1><label for="search">ことばを探す</label><input id="search" type="search" placeholder="日本語・英文・ノートを検索" value="${esc(search)}"><div class="row"><label>表示<select id="filter"><option value="all">すべて</option><option value="learning">学習中</option><option value="mastered">覚えた</option></select></label><label>並び替え<select id="sort"><option value="new">登録が新しい順</option><option value="old">登録が古い順</option><option value="low">正解率が低い順</option><option value="high">正解率が高い順</option><option value="few">出題回数が少ない順</option></select></label></div><div id="cards"></div>`;
    app.querySelector("#filter").value = filter;
    app.querySelector("#sort").value = sort;
    renderCards();
  } else if (page === "detail" || page === "edit") {
    const p = state.phrases.find((p) => p.id === id);
    if (!p) {
      go("list");
      return;
    }
    app.innerHTML =
      page === "edit"
        ? `<a href="#detail/${id}">← 詳細に戻る</a><h1>フレーズを編集</h1><form id="edit-form" data-id="${id}">${fields(p)}<button class="primary full">変更を保存</button><p class="error" id="form-error" role="alert"></p></form>`
        : `<a href="#list">← フレーズ一覧</a><div class="card"><span class="pill">${p.mastered ? "✦ 覚えた" : "☾ 学習中"}</span><h1 class="ja">${esc(p.ja)}</h1><p class="en">${esc(p.en)}</p>${say(p.en)}${p.hint ? `<h3>HINT</h3><p class="hint">${esc(p.hint)}</p>` : ""}${notes(p)}</div><div class="stats"><div><strong>${p.correct}</strong><span>正解回数</span></div><div><strong>${p.attempts}</strong><span>出題回数</span></div><div><strong>${pct(p)}</strong><span>正解率</span></div></div>${button(p.mastered ? "学習中に戻す" : "✦ 覚えた", "master", "primary full", `data-id="${id}"`)}<div class="row"><a class="button" href="#edit/${id}">編集</a>${button("削除", "delete", "danger", `data-id="${id}"`)}</div>`;
  } else if (page === "add") {
    app.innerHTML = `<div class="eyebrow">COLLECT YOUR EVERYDAY</div><h1>フレーズを追加</h1><p class="muted">ChatGPTで作ったJSONを貼り付けて、<br>あなただけのことばを集めましょう。</p><form id="parse-form"><label for="json">追加用JSON</label><textarea id="json" rows="9" spellcheck="false" placeholder='{"phrases": [{"ja": "日本語", "en": "English"}]}'></textarea><button class="primary full">内容を確認する</button><p id="form-error" class="error" role="alert"></p></form><details><summary>JSONの形式を見る</summary><pre style="white-space:pre-wrap">${esc(JSON.stringify({ phrases: [{ ja: "今日は早く寝よう。", en: "I'll go to bed early tonight.", alternatives: [], hint: "I'll ____ to bed early tonight.", notes: [] }] }, null, 2))}</pre></details><div id="previews"></div>`;
    renderPreviews();
  } else if (page === "quiz") {
    renderQuiz();
  } else if (page === "result") {
    const q = state.session;
    if (!q) {
      go("home");
      return;
    }
    if (q.index < q.ids.length) {
      go("quiz");
      return;
    }
    const c = q.results.filter((r) => r.correct).length;
    app.innerHTML = `<div class="success-star">✧ ☾ ✧</div><div class="hero"><div class="eyebrow">TONIGHT’S LITTLE ACHIEVEMENT</div><h1>おつかれさまでした。</h1><p>少しずつ、あなたのことばに。</p><h1>${c} / ${q.ids.length}</h1><p>今回の正解率 ${Math.round((c / q.ids.length) * 100)}%</p></div><h2>もう一度、覚えたいことば</h2>${
      q.results
        .filter((r) => !r.correct)
        .map((r) => state.phrases.find((p) => p.id === r.id))
        .filter(Boolean)
        .map(card)
        .join("") || '<p class="card">✦ すべて言えました！</p>'
    }${button("もう一度練習", "retry", "primary full")}${button("ホームに戻る", "finish", "full")}`;
  } else if (page === "settings") {
    app.innerHTML = `<div class="eyebrow">MAKE YOURSELF AT HOME</div><h1>設定</h1><section class="card"><h2>音声</h2><label for="speed">再生速度</label><select id="speed"><option value="1">通常速度</option><option value="0.75">ゆっくり</option></select><p><small>英語音声のオフライン再生は端末の音声環境によって異なります。</small></p>${say("Welcome to Midnight English.")}</section><section class="card"><h2>大切なことばのバックアップ</h2><p class="muted">フレーズ・成績・履歴・設定をJSONに保存します。定期的な保存がおすすめです。</p>${button("↓ バックアップを書き出す", "export", "primary full")}<label for="restore">バックアップから復元<input id="restore" type="file" accept=".json,application/json"></label><small>復元すると現在の全データを置き換えます。進行中のクイズは終了します。</small></section><section class="card"><h2>ホーム画面に追加</h2><p>iPhoneのSafariで共有ボタン →「ホーム画面に追加」を選んでください。</p><p class="muted">一度オンラインで開いたあとは、オフラインでも学習できます。音声は端末環境によります。</p><small>データはこの端末・ブラウザー内に保存されます。サイトデータの消去やアプリ削除に備え、バックアップを残してください。</small>${button("保存領域の保護をリクエスト", "persist", "full")}</section><p class="footer">Midnight English · Moonlit Lavender<br>Version 1.0 · あなたのペースで、ひとことずつ。</p>`;
    app.querySelector("#speed").value = state.settings.speed;
  } else go("home");
}
function renderCards() {
  let ps = state.phrases.filter(
    (p) =>
      (filter === "all" || p.mastered === (filter === "mastered")) &&
      [
        p.ja,
        p.en,
        ...p.alternatives,
        ...p.notes.flatMap((n) => [n.expression, n.meaning, n.example]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  ps.sort((a, b) => {
    if (sort === "few") return a.attempts - b.attempts;
    if (sort === "low" || sort === "high") {
      if (!a.attempts || !b.attempts) return !a.attempts - !b.attempts;
      return (rate(a) - rate(b)) * (sort === "high" ? -1 : 1);
    }
    return a.createdAt.localeCompare(b.createdAt) * (sort === "new" ? -1 : 1);
  });
  app.querySelector("#cards").innerHTML =
    ps.map(card).join("") ||
    '<div class="empty">まだ、ことばが見つかりません。<br><a class="button" href="#add">＋ フレーズを追加</a></div>';
}
function renderPreviews() {
  const el = app.querySelector("#previews");
  if (!el || !candidates.length) return;
  el.innerHTML = `<h2>${candidates.length}件のプレビュー</h2><p class="muted">重複は最初の選択から除外しています。内容を編集してから登録できます。</p><p id="selected-count" aria-live="polite">登録予定 ${candidates.filter((p) => p.selected).length}件</p><form id="save-import">${candidates.map((p, i) => `<section class="card"><label class="row"><input type="checkbox" name="pick" value="${i}" ${p.selected ? "checked" : ""}><span>${i + 1}件目 ${p.duplicate ? "・重複あり" : ""}</span></label><details class="preview"><summary>${esc(p.ja)}<br><small>${esc(p.en)}</small></summary>${fields(p, i + "-")}</details></section>`).join("")}<button class="primary full">選択したフレーズを一括保存</button><p class="error" id="import-error" role="alert"></p></form>`;
}
function renderQuiz() {
  const q = state.session;
  if (!q) {
    go("home");
    return;
  }
  if (q.index >= q.ids.length) {
    go("result");
    return;
  }
  const p = state.phrases.find((p) => p.id === q.ids[q.index]);
  app.innerHTML = `<div class="row"><span class="eyebrow">QUIET MOMENT · ${q.index + 1} / ${q.ids.length}</span>${button("終了", "quit", "ghost")}</div><div class="progress" role="progressbar" aria-label="クイズ進捗" aria-valuenow="${q.index}" aria-valuemin="0" aria-valuemax="${q.ids.length}"><div style="width:${(q.index / q.ids.length) * 100}%"></div></div><section class="card quiz-card"><small>英語で言ってみましょう</small><h1 class="ja">${esc(p.ja)}</h1>${q.hinted ? `<p class="hint">${esc(p.hint || "このフレーズにはヒントがありません。答えを確認しましょう。")}</p><small>ヒントを見たので、この問題は不正解として記録されます。</small>` : ""}</section>${!q.revealed ? `${button("ヒントを見る", "hint", "full", q.hinted ? "disabled" : "")}${button("答えを見る", "reveal", "primary full")}<p class="footer">頭の中でも、小さな声でも。<br>言えたら、答えを確かめましょう。</p>` : `<section class="card"><h3>ANSWER</h3><p class="en">${esc(p.en)}</p>${say(p.en)}${notes(p)}</section>${q.graded ? `<p class="hint">${q.results.at(-1)?.correct ? "✦ 言えた！よくできました。" : "☾ 次の一歩につながる練習です。"}</p>${button(q.index + 1 === q.ids.length ? "結果を見る" : "次の問題へ →", "next", "primary full")}` : `<p class="muted">答えを見る前に、自力で言えましたか？</p><div class="row">${button("言えなかった", "wrong")}${button("言えた！", "correct", "primary", q.hinted ? "disabled" : "")}</div>`}`}`;
}
async function start() {
  const ids = choose(state.phrases, state.settings.mode);
  if (!ids.length) {
    notice("学習中のフレーズを追加するか、「学習中に戻す」を選んでください。");
    return;
  }
  await commit((s) => {
    s.session = {
      ids,
      index: 0,
      shown: false,
      hinted: false,
      revealed: false,
      graded: false,
      results: [],
    };
    showQuestion(s);
  });
  go("quiz");
  render();
}
async function speak(text) {
  if (!("speechSynthesis" in window)) {
    notice(
      "この端末では音声再生を利用できません。学習はそのまま続けられます。",
    );
    return;
  }
  const voices = speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("en"));
  if (!voices.length) {
    notice("英語音声が見つかりません。端末の英語音声設定を確認してください。");
    return;
  }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voices[0];
  u.lang = voices[0].lang;
  u.rate = state.settings.speed;
  u.onerror = () => notice("音声を再生できませんでした。学習は続けられます。");
  speechSynthesis.speak(u);
}
app.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b || busy || b.disabled) return;
  busy = true;
  app.setAttribute("aria-busy", "true");
  b.disabled = true;
  try {
    const a = b.dataset.action,
      id = b.dataset.id;
    if (a === "speak") await speak(b.dataset.text);
    else if (a === "start" || a === "retry") await start();
    else if (a === "resume")
      go(state.session.index >= state.session.ids.length ? "result" : "quiz");
    else if (a === "master") {
      await commit((s) => {
        const p = s.phrases.find((p) => p.id === id);
        p.mastered = !p.mastered;
      });
      render();
    } else if (a === "delete") {
      if (state.session?.ids.includes(id)) {
        notice("クイズを終了してから削除してください。");
        return;
      }
      if (confirm("このフレーズを削除しますか？この操作は取り消せません。")) {
        await commit((s) => (s.phrases = s.phrases.filter((p) => p.id !== id)));
        go("list");
      }
    } else if (["hint", "reveal", "wrong", "correct", "next"].includes(a)) {
      await commit((s) => {
        const q = s.session;
        if (!q || q.index >= q.ids.length) return;
        if (a === "hint" && !q.revealed) {
          q.hinted = true;
          const h = s.history.find((h) => h.id === q.eventId);
          h.hinted = true;
          h.result = false;
          s.phrases.find((p) => p.id === q.ids[q.index]).lastWrong = true;
        }
        if (a === "reveal") q.revealed = true;
        if ((a === "wrong" || a === "correct") && q.revealed)
          grade(s, a === "correct");
        if (a === "next" && q.graded) {
          q.index++;
          q.shown = false;
          q.hinted = false;
          q.revealed = false;
          q.graded = false;
          showQuestion(s);
        }
      });
      render();
    } else if (a === "quit" || a === "finish") {
      if (
        a === "quit" &&
        !confirm("練習を終了しますか？記録済みの成績は残ります。")
      )
        return;
      await commit((s) => (s.session = null));
      go("home");
    } else if (a === "export") {
      const blob = new Blob(
        [
          JSON.stringify(
            {
              type: "midnight-english-backup",
              version: 1,
              exportedAt: new Date().toISOString(),
              data: state,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = url;
      const now = new Date(),
        date = [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, "0"),
          String(now.getDate()).padStart(2, "0"),
        ].join("-");
      link.download = `midnight-english-backup-${date}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      notice("バックアップを書き出しました。ファイルを保存してください。");
    } else if (a === "persist") {
      const ok = await navigator.storage?.persist?.();
      notice(
        ok
          ? "保存領域の保護が有効です。"
          : "端末が保護を許可しませんでした。定期的にバックアップしてください。",
      );
    }
  } catch (err) {
    notice("操作を完了できませんでした：" + err.message);
  } finally {
    busy = false;
    app.setAttribute("aria-busy", "false");
    if (b.isConnected) b.disabled = false;
  }
});
app.addEventListener("input", (e) => {
  if (e.target.id === "search") {
    search = e.target.value;
    renderCards();
  }
});
app.addEventListener("change", async (e) => {
  if (e.target.name === "pick") {
    candidates[Number(e.target.value)].selected = e.target.checked;
    app.querySelector("#selected-count").textContent =
      `登録予定 ${app.querySelectorAll("input[name=pick]:checked").length}件`;
  }
  try {
    if (e.target.id === "filter") {
      filter = e.target.value;
      renderCards();
    }
    if (e.target.id === "sort") {
      sort = e.target.value;
      renderCards();
    }
    if (e.target.id === "mode")
      await commit((s) => (s.settings.mode = e.target.value));
    if (e.target.id === "speed")
      await commit((s) => (s.settings.speed = Number(e.target.value)));
    if (e.target.id === "restore") {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 20 * 1024 * 1024)
        throw Error("ファイルが大きすぎます（最大20MB）。");
      const restored = validateBackup(JSON.parse(await file.text()));
      if (
        confirm(
          `${restored.phrases.length}件のフレーズで現在の全データを置き換えます。復元しますか？`,
        )
      ) {
        await write(restored);
        state = restored;
        candidates = [];
        render();
        notice("バックアップを復元しました。");
      } else e.target.value = "";
    }
  } catch (err) {
    notice("読み込み・保存に失敗しました：" + err.message);
    if (e.target.type === "file") e.target.value = "";
  }
});
app.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (busy) return;
  busy = true;
  app.setAttribute("aria-busy", "true");
  const form = e.target,
    submit = form.querySelector("button");
  submit.disabled = true;
  try {
    if (form.id === "parse-form") {
      const ps = parseImport(app.querySelector("#json").value),
        seen = new Set(state.phrases.map(key));
      candidates = ps.map((p) => {
        const duplicate = seen.has(key(p));
        seen.add(key(p));
        return { ...p, duplicate, selected: !duplicate };
      });
      app.querySelector("#form-error").textContent = "";
      renderPreviews();
    }
    if (form.id === "save-import") {
      const selected = new FormData(form).getAll("pick").map(Number);
      if (!selected.length) throw Error("登録するフレーズを選択してください。");
      const ps = selected.map((i) => getFields(form, i + "-"));
      const seen = new Set(state.phrases.map(key));
      let duplicates = 0;
      for (const p of ps) {
        if (seen.has(key(p))) duplicates++;
        seen.add(key(p));
      }
      if (
        duplicates &&
        !confirm(
          `${duplicates}件の重複が含まれます。別のフレーズとして登録しますか？`,
        )
      )
        return;
      await commit((s) =>
        s.phrases.push(
          ...ps.map((p) => ({
            ...p,
            id: crypto.randomUUID(),
            attempts: 0,
            correct: 0,
            mastered: false,
            createdAt: new Date().toISOString(),
            lastAsked: null,
            lastWrong: false,
          })),
        ),
      );
      candidates = [];
      render();
      notice(`${ps.length}件のフレーズを登録しました。`);
    }
    if (form.id === "edit-form") {
      const p = getFields(form);
      await commit((s) =>
        Object.assign(
          s.phrases.find((p) => p.id === form.dataset.id),
          p,
        ),
      );
      go("detail/" + form.dataset.id);
      notice("変更を保存しました。");
    }
  } catch (err) {
    const error = form.querySelector(".error");
    if (error) error.textContent = err.message;
    else notice(err.message);
  } finally {
    busy = false;
    app.setAttribute("aria-busy", "false");
    if (submit.isConnected) submit.disabled = false;
  }
});
window.addEventListener("hashchange", () => {
  window.speechSynthesis?.cancel();
  render();
  window.scrollTo(0, 0);
});
try {
  state = await read();
  render();
  if ("speechSynthesis" in window) speechSynthesis.getVoices();
} catch (err) {
  app.innerHTML = `<h1>保存データを開けませんでした</h1><p>ブラウザーのストレージ設定と空き容量を確認して、再読み込みしてください。</p><p class="error">${esc(err.message)}</p>`;
}
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register("./sw.js")
    .catch(() =>
      notice(
        "オフラインの準備ができませんでした。オンラインで再度開いてください。",
      ),
    );

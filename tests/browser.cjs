const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  let errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const base = "http://127.0.0.1:4173/midnight-english/";
  const nav = async (hash) => {
    await page.goto(base + "#" + hash);
    await page.waitForTimeout(100);
  };
  const click = async (label) => {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("#app").getAttribute("aria-busy") !== "true",
    );
  };
  const sample = (i) => ({
    ja: `テストの日本語 ${i}`,
    en: `This is phrase ${i}.`,
    alternatives: [`Alternative ${i}.`],
    hint: "This is ____ .",
    notes: [
      { expression: "phrase", meaning: "表現", example: `Example ${i}.` },
    ],
  });
  const imported = async (phrases) => {
    await nav("add");
    await page.locator("#json").fill(JSON.stringify({ phrases }));
    await click("内容を確認する");
    await click("選択したフレーズを一括保存");
    await page.waitForTimeout(150);
  };
  const load = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open("midnight-english", 1);
          r.onsuccess = () => {
            const db = r.result,
              g = db.transaction("state").objectStore("state").get("app");
            g.onsuccess = () => {
              resolve(g.result);
              db.close();
            };
            g.onerror = () => reject(g.error);
          };
        }),
    );
  await nav("home");
  assert.equal(await page.locator("h1").innerText(), "Good evening.");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await nav("add");
  await page.locator("#json").fill("invalid");
  await click("内容を確認する");
  assert.ok(await page.locator("#form-error").innerText());
  await imported([sample(0)]);
  assert.equal((await load()).phrases.length, 1);
  await imported(Array.from({ length: 11 }, (_, i) => sample(i + 1)));
  assert.equal((await load()).phrases.length, 12);
  await nav("add");
  await page
    .locator("#json")
    .fill(JSON.stringify({ phrases: [sample(0), sample(0)] }));
  await click("内容を確認する");
  assert.equal(await page.locator("input[name=pick]:checked").count(), 0);
  assert.ok((await page.locator("#previews").innerText()).includes("重複あり"));
  let s = await load();
  const id = s.phrases[0].id;
  await nav("edit/" + id);
  await page.locator("input[name=ja]").fill("編集した日本語");
  await click("変更を保存");
  await page.waitForTimeout(100);
  assert.equal((await load()).phrases[0].ja, "編集した日本語");
  await click("✦ 覚えた");
  await page.waitForTimeout(100);
  await nav("home");
  await click("クイズをはじめる →");
  await page.waitForTimeout(100);
  s = await load();
  assert.equal(s.session.ids.length, 10);
  assert.equal(new Set(s.session.ids).size, 10);
  assert.ok(!s.session.ids.includes(id));
  assert.equal(
    s.phrases.reduce((n, p) => n + p.attempts, 0),
    1,
  );
  await click("ヒントを見る");
  await click("答えを見る");
  assert.equal(
    await page
      .getByRole("button", { name: "言えた！", exact: true })
      .isDisabled(),
    true,
  );
  await click("言えなかった");
  await page.reload();
  await page.waitForTimeout(100);
  s = await load();
  assert.equal(
    s.phrases.reduce((n, p) => n + p.attempts, 0),
    1,
  );
  assert.equal(s.session.results.length, 1);
  await click("次の問題へ →");
  await click("答えを見る");
  await click("言えた！");
  await page.waitForTimeout(100);
  assert.equal(
    (await load()).phrases.reduce((n, p) => n + p.correct, 0),
    1,
  );
  for (let i = 2; i < 10; i++) {
    await click("次の問題へ →");
    await click("答えを見る");
    await click("言えた！");
  }
  await click("結果を見る");
  await page.waitForTimeout(100);
  assert.ok((await page.locator("main").innerText()).includes("9 / 10"));
  s = await load();
  assert.equal(s.history.length, 10);
  assert.equal(
    s.phrases.reduce((n, p) => n + p.correct, 0),
    9,
  );
  assert.equal(
    s.phrases.reduce((n, p) => n + p.attempts, 0),
    10,
  );
  await click("ホームに戻る");
  await nav("detail/" + id);
  await click("学習中に戻す");
  await page.waitForTimeout(100);
  assert.equal((await load()).phrases[0].mastered, false);
  await nav("list");
  await page.locator("#search").fill("Example 0.");
  assert.equal(await page.locator(".phrase-link").count(), 1);
  await page.locator("#search").fill("");
  await nav("settings");
  const downloadP = page.waitForEvent("download");
  await click("↓ バックアップを書き出す");
  const download = await downloadP;
  const file = await download.path();
  const fs = require("node:fs");
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(backup.data.phrases.length, 12);
  await nav("detail/" + id);
  await click("削除");
  await page.waitForTimeout(100);
  assert.equal((await load()).phrases.length, 11);
  await nav("settings");
  await page
    .locator("#restore")
    .setInputFiles({
      name: "broken.json",
      mimeType: "application/json",
      buffer: Buffer.from("{bad"),
    });
  await page.waitForTimeout(100);
  assert.equal((await load()).phrases.length, 11);
  await page
    .locator("#restore")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(backup)),
    });
  await page.waitForTimeout(150);
  assert.equal((await load()).phrases.length, 12);
  assert.equal((await load()).history.length, 10);
  // Verify manual speech without automatic playback, with a deterministic browser voice.
  await page.evaluate(() => {
    window.spoken = [];
    window.SpeechSynthesisUtterance = class {
      constructor(text) {
        this.text = text;
      }
    };
    speechSynthesis.getVoices = () => [{ lang: "en-US", name: "Test" }];
    speechSynthesis.speak = (u) => window.spoken.push(u.text);
  });
  await page.locator("[data-action=speak]").first().click();
  await page.waitForFunction(
    () => document.querySelector("#app").getAttribute("aria-busy") !== "true",
  );
  assert.deepEqual(await page.evaluate(() => window.spoken), [
    "Welcome to Midnight English.",
  ]);
  await page.evaluate(() => (speechSynthesis.getVoices = () => []));
  await page.locator("[data-action=speak]").first().click();
  await page.waitForFunction(
    () => document.querySelector("#app").getAttribute("aria-busy") !== "true",
  );
  assert.ok((await page.locator("#notice").innerText()).includes("英語音声"));
  for (const hash of [
    "home",
    "list",
    "add",
    "settings",
    "detail/" + id,
    "edit/" + id,
  ]) {
    await nav(hash);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
      hash + " horizontal overflow",
    );
  }
  await nav("home");
  await page.screenshot({ path: "/tmp/midnight-home.png", fullPage: true });
  await context.setOffline(true);
  await page.reload();
  await page.waitForTimeout(200);
  assert.equal(await page.locator("h1").innerText(), "Good evening.");
  await page.locator('nav a[href="#list"]').click();
  assert.equal(await page.locator(".phrase-link").count(), 12);
  await page.locator('nav a[href="#home"]').click();
  await click("クイズをはじめる →");
  await click("答えを見る");
  await click("言えた！");
  await page.reload();
  await page.waitForTimeout(150);
  assert.equal((await load()).session.results.length, 1);
  await context.setOffline(false);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: imports, invalid JSON, duplicates, edit/delete, 10 unique questions, hint gating, restart counts, mastery, search, speech paths, backup/restore, 390px layouts, subpath and offline quiz persistence.",
  );
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

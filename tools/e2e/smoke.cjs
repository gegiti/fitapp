// End-to-end smoke test: drives every screen in headless Chromium at iPhone size,
// with a paused fake clock so the session countdown is deterministic.
// Not part of `npm test` (needs Playwright). To run:
//   npm i --no-save playwright@1.47 && npx playwright install --with-deps chromium
//   python3 -m http.server 8080 &      # serve the repo root
//   node tools/e2e/smoke.cjs            # writes screenshots to docs/screenshots/
const { chromium, devices } = require("playwright");
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "..", "..", "docs", "screenshots");
const URL = process.env.APP_URL || "http://127.0.0.1:8080/";
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  page.on("requestfailed", r => errors.push("requestfailed: " + r.url()));
  page.on("response", r => { if (r.status() >= 400) errors.push(`http ${r.status()}: ${r.url()}`); });
  let dialogPolicy = "accept", dialogs = 0;
  page.on("dialog", d => { dialogs++; dialogPolicy === "accept" ? d.accept() : d.dismiss(); });
  const shot = async (name) => { await page.evaluate(() => { document.getElementById("toast").hidden = true; }); await page.screenshot({ path: `${OUT}/${name}.png` }); };
  const overlay = () => page.evaluate(() => { const o = document.querySelector(".overlay"); return o && !o.hidden ? o.innerText : null; });
  const text = async (sel) => (await page.locator(sel).first().textContent())?.trim();
  let failed = false;
  const step = async (name, fn) => { if (failed) return; try { await fn(); console.log("ok  ", name); } catch (e) { failed = true; console.log("FAIL", name, "-", e.message.split("\n")[0]); errors.push(`step ${name}: ${e.message.split("\n")[0]}`); await shot("FAIL"); console.log("URL:", page.url()); console.log("VIEW:", (await page.locator("#view").innerText()).slice(0, 600)); console.log("SHEETS:", await page.locator(".sheet, .sheet-backdrop").count()); } };

  await page.clock.install({ time: new Date("2026-09-04T06:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-04T06:00:01Z"));

  await step("plan: seeded workout shows 4:50", async () => {
    await page.goto(URL + "#/plan");
    await page.waitForSelector(".card .name");
    if (await text(".card .name") !== "Morning") throw new Error("name " + await text(".card .name"));
    if (await text(".card .dur") !== "4:50") throw new Error("dur " + await text(".card .dur"));
    if (await text("#toast") !== "No saved workouts found, loaded defaults") throw new Error("toast " + await text("#toast"));
    await shot("P1_plan");
  });

  await step("workout editor: rows, totals, inert last rest", async () => {
    await page.click(".card:has-text('Morning')");
    await page.waitForSelector("#steps .row-item");
    const rows = await page.locator("#steps .row-item").count();
    if (rows !== 4) throw new Error("rows " + rows);
    const total = await text("#view .sub");
    if (!total.startsWith("Total 4:50")) throw new Error(total);
    const inert = await page.locator("#steps .row-item .rest.inert").count();
    if (inert !== 1) throw new Error("inert " + inert);
    await shot("P2_workout");
  });

  await step("step sheet: change time and rest, persists after reload", async () => {
    await page.click("#steps .row-item:nth-child(1) .label");
    await page.waitForSelector(".sheet");
    await shot("P2b_step_sheet");
    await page.click(".sheet [aria-label='More Exercise time']");
    await page.click(".sheet [aria-label='Less Rest after']");
    await page.click(".sheet .btn.primary");
    await page.waitForSelector(".sheet", { state: "detached" });
    let t = await text("#steps .row-item:nth-child(1) .time");
    if (t !== "65s") throw new Error("time " + t);
    let r = await text("#steps .row-item:nth-child(1) .rest");
    if (r !== "+15s") throw new Error("rest " + r);
    await page.reload();
    await page.waitForSelector("#steps .row-item");
    t = await text("#steps .row-item:nth-child(1) .time");
    if (t !== "65s") throw new Error("after reload " + t);
    const total = await text("#view .sub");
    if (!total.startsWith("Total 4:50")) throw new Error("total " + total);   // +5 work, -5 rest
  });

  await step("step sheet: move down + remove", async () => {
    await page.click("#steps .row-item:nth-child(1) .label");
    await page.click(".sheet .move-row button:nth-child(2)");
    await page.waitForSelector(".sheet", { state: "detached" });
    const first = await text("#steps .row-item:nth-child(1) .label");
    if (first !== "Jackknife sit-ups") throw new Error("first " + first);
    await page.click("#steps .row-item:nth-child(4) .label");
    await page.click(".sheet .text-danger");
    await page.waitForSelector(".sheet", { state: "detached" });
    if (await page.locator("#steps .row-item").count() !== 3) throw new Error("count");
  });

  await step("bank pick: adds cobra back", async () => {
    await page.click("text=+ Add exercise");
    await page.waitForSelector(".chips");
    if (await text(".header .title") !== "Add to Morning") throw new Error(await text(".header .title"));
    await shot("P3b_bank_pick");
    await page.click(".row-item:has-text('Cobra')");
    await page.waitForSelector("#steps .row-item:nth-child(4)");
    if (await text("#steps .row-item:nth-child(4) .label") !== "Cobra") throw new Error("not added");
  });

  await step("rename workout", async () => {
    await page.fill(".title-input", "Morning A");
    await page.press(".title-input", "Enter");
    await page.goto(URL + "#/plan");
    await page.waitForSelector(".card .name");
    if (await text(".card .name") !== "Morning A") throw new Error(await text(".card .name"));
  });

  await step("bank browse + detail sheet + filter", async () => {
    await page.click(".card:has-text('Exercise bank')");
    await page.waitForSelector(".chips");
    if (await page.locator(".row-item").count() !== 4) throw new Error("rows");
    await page.click(".chip:has-text('Stretch')");
    if (await page.locator(".row-item").count() !== 2) throw new Error("filter");
    await shot("P3_bank");
    await page.click(".row-item:has-text('Cobra')");
    await page.waitForSelector(".sheet .figs img");
    await shot("P3c_bank_detail");
    await page.click(".sheet .btn.raised");
    await page.waitForSelector(".sheet .card");
    await page.click(".sheet .card");
    await page.waitForSelector("#steps .row-item:nth-child(5)");
    // remove the extra cobra again
    await page.click("#steps .row-item:nth-child(5) .label");
    await page.click(".sheet .text-danger");
    await page.waitForSelector(".sheet", { state: "detached" });
  });

  await step("new workout + delete", async () => {
    await page.goto(URL + "#/plan");
    await page.click(".plus");
    await page.waitForSelector(".title-input");
    if (await page.inputValue(".title-input") !== "Workout 2") throw new Error(await page.inputValue(".title-input"));
    await page.click("text=Delete workout");
    await page.waitForSelector(".card .name");
    if (await page.locator(".card .name").count() !== 1) throw new Error("not deleted");
  });

  await step("backup marks date; restore round-trips", async () => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("text=Backup")]);
    const path = await dl.path();
    const json = JSON.parse(fs.readFileSync(path, "utf8"));
    if (json.workouts[0].name !== "Morning A") throw new Error("backup content");
    if (!(await text(".links .sub")).startsWith("last backup")) throw new Error(await text(".links .sub"));
    json.workouts[0].name = "Restored";
    json.workouts[0].steps.push({ exerciseId: "gone", seconds: 10, restSeconds: 0 });
    const tmp = require("os").tmpdir() + "/morning-fit-restore.json";
    fs.writeFileSync(tmp, JSON.stringify(json));
    await page.setInputFiles("input[type=file]", tmp);
    await page.waitForSelector(".card:has-text('Restored')");
    if (await text("#toast") !== "Workouts restored") throw new Error("toast " + await text("#toast"));
    await page.setInputFiles("input[type=file]", { name: "bad.json", mimeType: "application/json", buffer: Buffer.from('{"version":9}') });
    await page.waitForFunction(() => document.getElementById("toast").textContent.startsWith("Unsupported"));
  });

  await step("train: pick + get-ready + session", async () => {
    await page.click("#tabs a[data-tab=train]");
    await page.waitForSelector(".card .btn.primary");
    if (await text(".card .sub") !== "4 exercises") throw new Error(await text(".card .sub"));
    await shot("T1_train");
    await page.click(".card .btn.primary");
    if ((await overlay()) !== "3\nGet ready\nRestored") throw new Error("ready " + JSON.stringify(await overlay()));
    if (!(await page.locator("#tabs").isHidden())) throw new Error("tabs visible");
    await shot("T2a_get_ready");
    await page.clock.runFor(1000);
    if (!(await overlay()).startsWith("2")) throw new Error("ready2 " + await overlay());
    await page.clock.runFor(2300);
    if ((await overlay()) !== null) throw new Error("overlay still shown: " + await overlay());
    if (await text(".session h1") !== "JACKKNIFE SIT-UPS") throw new Error(await text(".session h1"));
    if (await text(".timer") !== "1:00") throw new Error("timer " + await text(".timer"));
    if (await text(".where") !== "Restored  1/4") throw new Error(await text(".where"));
    if (!(await text(".next")).startsWith("Next: Push-ups 65s (after 20s rest)")) throw new Error(await text(".next"));
    await page.clock.runFor(22_000);
    if (await text(".timer") !== "0:38") throw new Error("timer " + await text(".timer"));
    await shot("T2_session");
  });

  await step("session: pause overlay, resume, tap-to-pause", async () => {
    await page.click(".pause");
    if (!(await overlay())?.includes("Paused")) throw new Error("no paused overlay");
    await shot("T2d_paused");
    await page.clock.runFor(10_000);
    await page.click(".overlay");
    await page.clock.runFor(300);
    if ((await overlay()) !== null) throw new Error("still paused");
    if (await text(".timer") !== "0:38") throw new Error("timer after pause " + await text(".timer"));
    await page.click(".stage");
    if (!(await overlay())?.includes("Paused")) throw new Error("tap did not pause");
    await page.click(".overlay");
    await page.clock.runFor(300);
    if ((await overlay()) !== null) throw new Error("tap did not resume");
  });

  await step("session: rest phase after countdown, then skip, back twice", async () => {
    await page.clock.runFor(38_500);
    if (await text(".session h1") !== "REST") throw new Error(await text(".session h1"));
    if (await text(".session .type") !== "20s · after Jackknife sit-ups") throw new Error(await text(".session .type"));
    if (await text(".next") !== "Next: Push-ups 65s") throw new Error(await text(".next"));
    await shot("T2c_rest");
    await page.click("[aria-label=Skip]");
    await page.clock.runFor(300);
    if (await text(".session h1") !== "PUSH-UPS") throw new Error(await text(".session h1"));
    await page.clock.runFor(10_000);
    await page.click("[aria-label=Back]");
    await page.clock.runFor(300);
    if (await text(".timer") !== "1:05") throw new Error("restart " + await text(".timer"));
    await page.click("[aria-label=Back]");
    await page.clock.runFor(300);
    if (await text(".session h1") !== "JACKKNIFE SIT-UPS") throw new Error("back twice " + await text(".session h1"));
  });

  await step("session: exit confirm, then run to done", async () => {
    dialogs = 0; dialogPolicy = "dismiss";
    await page.click("[aria-label='End session']");
    await page.clock.runFor(300);
    dialogPolicy = "accept";
    if (dialogs !== 1) throw new Error("no confirm");
    if (await text(".session h1") !== "JACKKNIFE SIT-UPS") throw new Error("left session");
    await page.clock.runFor(60 * 5 * 1000);
    await page.waitForSelector(".done", { timeout: 5000 });
    if (await text(".done .sub") !== "Restored · 4:50") throw new Error(await text(".done .sub"));
    await shot("T3_done");
    await page.click(".done .btn");
    await page.waitForSelector("#tabs:not([hidden])");
  });

  await step("last phase: exit without confirm", async () => {
    await page.click(".card .btn.primary");
    await page.clock.runFor(3300);
    for (let i = 0; i < 6; i++) { await page.click("[aria-label=Skip]"); await page.clock.runFor(200); }
    if (await text(".session h1") !== "COBRA") throw new Error(await text(".session h1"));
    if (await text(".next") !== "Last one") throw new Error(await text(".next"));
    dialogs = 0;
    await page.click("[aria-label='End session']");
    await page.waitForSelector("#tabs:not([hidden])");
    if (dialogs !== 0) throw new Error("confirm shown on last exercise");
  });

  await step("reload keeps data (dual storage)", async () => {
    await page.goto(URL + "#/plan");
    await page.reload();
    await page.waitForSelector(".card .name");
    if (await text(".card .name") !== "Restored") throw new Error(await text(".card .name"));
    const both = await page.evaluate(async () => {
      const ls = localStorage.getItem("morningfit.v1");
      const idb = await new Promise(res => { const r = indexedDB.open("morningfit", 1); r.onsuccess = () => { const t = r.result.transaction("kv").objectStore("kv").get("state"); t.onsuccess = () => res(t.result); }; });
      return ls === idb;
    });
    if (!both) throw new Error("copies differ");
  });

  await browser.close();
  console.log(errors.length ? "\nERRORS:\n" + errors.join("\n") : "\nno errors");
  process.exit(errors.length ? 1 : 0);
})();

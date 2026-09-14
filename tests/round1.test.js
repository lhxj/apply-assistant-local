/* Round 1 regression tests. Run with: node tests/round1.test.js */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const seed = JSON.parse(fs.readFileSync(path.join(ROOT, "extension/rules/seed.json"), "utf8"));

function loadScript(file, context) {
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), "utf8"), context, { filename: file });
}

function baseContext(extra = {}) {
  const ctx = {
    window: { __WSZ: {} },
    document: { querySelectorAll: () => [], activeElement: null, body: { click() {} } },
    location: { hostname: "example.com" },
    setTimeout,
    clearTimeout,
    Date,
    MouseEvent: class MouseEvent { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    KeyboardEvent: class KeyboardEvent { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    Event: class Event { constructor(type, init) { this.type = type; Object.assign(this, init); } },
    ...extra,
  };
  vm.createContext(ctx);
  return ctx;
}

async function testDetection() {
  const ctx = baseContext();
  loadScript("extension/content/detect.js", ctx);
  const detect = (host) => {
    ctx.location.hostname = host;
    return ctx.window.__WSZ.detectProvider(seed);
  };
  assert.equal(detect("app.mokahr.com").key, "moka");
  assert.equal(detect("szly.zhiye.com").key, "beisen");
  assert.equal(detect("flyaitalent.zhiye.com").key, "beisen");
  assert.equal(detect("fake-mokahr.com").key, null);
}

async function testMatchingSafety() {
  const ctx = baseContext();
  loadScript("extension/lib/util.js", ctx);
  loadScript("extension/content/matcher.js", ctx);
  const merged = ctx.window.__WSZ.mergedRules(seed, "beisen");
  const personalName = { label: "姓名", section: "个人信息", index: 0, kind: "text" };
  assert.equal(ctx.window.__WSZ.resolvePath(personalName, merged), "basicInfo.name");
  const familyName = { label: "姓名", section: "家庭情况", index: 0, kind: "text" };
  const familyPhone = { label: "联系电话", section: "家庭情况", index: 0, kind: "text" };
  assert.equal(ctx.window.__WSZ.resolvePath(familyName, merged), null);
  assert.equal(ctx.window.__WSZ.resolvePath(familyPhone, merged), null);
  const phoneInFamily = { label: "联系电话", section: "家庭情况", index: 0, kind: "text" };
  const phoneForReferrer = { label: "联系电话", section: "推荐人", index: 0, kind: "text" };
  assert.equal(ctx.window.__WSZ.resolvePath(phoneInFamily, merged), null);
  assert.equal(ctx.window.__WSZ.resolvePath(phoneForReferrer, merged), null);
  assert.equal(ctx.window.__WSZ.resolvePath({ label: "籍贯", section: "个人信息", index: 0, kind: "select" }, merged), "basicInfo.nativePlace");
  for (const label of ["户籍", "户籍所在地"]) {
    assert.equal(ctx.window.__WSZ.resolvePath({ label, section: "个人信息", index: 0, kind: "select" }, merged), null);
  }
  const mokaMerged = ctx.window.__WSZ.mergedRules(seed, "moka");
  assert.equal(ctx.window.__WSZ.resolvePath({ label: "籍贯", section: "个人信息", index: 0, kind: "select" }, mokaMerged), null);
  assert.equal(
    ctx.window.__WSZ.resolvePath({ label: "意向工作城市", section: "未知区块", index: 0, kind: "select" }, mokaMerged),
    "intent.cities",
  );

  const radio = { label: "性别", section: "个人信息", index: 0, kind: "radio" };
  const radioPlan = ctx.window.__WSZ.buildPlan([radio], merged, { basicInfo: { gender: "男" } });
  assert.equal(radioPlan.plan[0].kind, "radio");

  const file = { label: "简历文件", section: "上传简历", index: 0, kind: "file" };
  const filePlan = ctx.window.__WSZ.buildPlan([file], merged, { basicInfo: {} });
  assert.equal(filePlan.plan.length, 0);
  assert.equal(filePlan.manual.length, 1);
  const unlabeledFilePlan = ctx.window.__WSZ.buildPlan([{ label: "", section: "", index: 0, kind: "file" }], merged, { basicInfo: {} });
  assert.equal(unlabeledFilePlan.manual.length, 1);
}

async function testScannerInvariants() {
  const source = fs.readFileSync(path.join(ROOT, "extension/content/scanner.js"), "utf8");
  assert.match(source, /const CONTROL_SEL = .*input/);
  assert.doesNotMatch(source, /not\(\[type=file\]\)/);
  assert.match(source, /let kind = "unknown"/);
  assert.match(source, /const fileControls/);
  assert.doesNotMatch(source, /selectControls\.length\s*>=\s*4\)\s*kind\s*=\s*"range"/);
}

async function testAutoAddDisabled() {
  const mainSource = fs.readFileSync(path.join(ROOT, "extension/content/main.js"), "utf8");
  assert.doesNotMatch(mainSource, /ensureItemCount/);

  const storage = { wsz_settings: { delayMs: 0, autoAddItems: true } };
  const chrome = {
    runtime: { getURL: (x) => x },
    storage: {
      local: {
        get(keys, cb) {
          const names = Array.isArray(keys) ? keys : [keys];
          cb(Object.fromEntries(names.filter((k) => Object.prototype.hasOwnProperty.call(storage, k)).map((k) => [k, storage[k]])));
        },
        set(obj, cb) { Object.assign(storage, obj); if (cb) cb(); },
      },
    },
  };
  const ctx = baseContext({ chrome, fetch: async () => ({ json: async () => seed }) });
  loadScript("extension/lib/store.js", ctx);
  const settings = await ctx.window.__WSZ.store.loadSettings();
  assert.equal(settings.autoAddItems, false);
}

function writerContext() {
  const ctx = baseContext();
  loadScript("extension/lib/util.js", ctx);
  const NS = ctx.window.__WSZ;
  NS.sleep = async () => {};
  NS.emitInputEvents = () => {};
  NS.toOptionText = (_merged, value) => String(value);
  NS.radioOptionText = (el) => el.getAttribute("aria-label");
  NS.hasValue = (f) => {
    if (f.kind === "radio") return f.radioControls.some((x) => x.checked);
    return Boolean(f.textControls && f.textControls[0] && f.textControls[0].value);
  };
  NS.readFieldValue = (f) => {
    if (f.kind === "radio") {
      const r = f.radioControls.find((x) => x.checked);
      return r ? NS.radioOptionText(r) : "";
    }
    if (f.kind === "select") return f.selectControls[0].selectedText || "";
    return f.textControls[0].value || "";
  };
  loadScript("extension/content/writer.js", ctx);
  return ctx;
}

function input(value = "") {
  return {
    tagName: "INPUT",
    type: "text",
    value,
    scrollIntoView() {},
    focus() {},
    blur() {},
    dispatchEvent() {},
  };
}

async function testWriter() {
  const ctx = writerContext();
  const NS = ctx.window.__WSZ;
  const good = input();
  const goodResult = await NS.executePlan(
    [{ field: { kind: "text", label: "姓名", section: "个人信息", textControls: [good], controls: [good] }, kind: "text", path: "basicInfo.name", value: "张三" }],
    {},
    { delayMs: 0 },
  );
  assert.equal(goodResult.verified, 1);
  assert.equal(goodResult.failed.length, 0);

  const bad = input();
  Object.defineProperty(bad, "value", { get: () => "", set: () => {} });
  const badResult = await NS.executePlan(
    [{ field: { kind: "text", label: "姓名", section: "个人信息", textControls: [bad], controls: [bad] }, kind: "text", path: "basicInfo.name", value: "张三" }],
    {},
    { delayMs: 0 },
  );
  assert.equal(badResult.verified, 0);
  assert.equal(badResult.failed[0].reason, "写后校验失败");

  const male = { checked: false, click() { this.checked = true; }, getAttribute: (n) => n === "aria-label" ? "男" : null, dispatchEvent() {} };
  const female = { checked: false, click() { this.checked = true; }, getAttribute: (n) => n === "aria-label" ? "女" : null, dispatchEvent() {} };
  const radioField = { kind: "radio", label: "性别", section: "个人信息", radioControls: [male, female], controls: [male, female] };
  const radioResult = await NS.executePlan(
    [{ field: radioField, kind: "radio", path: "basicInfo.gender", value: "男" }],
    {},
    { delayMs: 0 },
  );
  assert.equal(radioResult.verified, 1);
  assert.equal(male.checked, true);
  assert.equal(female.checked, false);

  let unstableReads = 0;
  const originalRead = NS.readFieldValue;
  NS.readFieldValue = (field) => {
    if (field.unstable) {
      unstableReads++;
      return unstableReads === 1 ? "张三" : "";
    }
    return originalRead(field);
  };
  const unstable = input();
  const unstableField = {
    kind: "text",
    label: "姓名",
    section: "个人信息",
    unstable,
    textControls: [unstable],
    controls: [unstable],
  };
  const unstableResult = await NS.executePlan(
    [{ field: unstableField, kind: "text", path: "basicInfo.name", value: "张三" }],
    {},
    { delayMs: 0 },
  );
  assert.equal(unstableReads, 2);
  assert.equal(unstableResult.verified, 0);
  assert.equal(unstableResult.failed[0].reason, "写后校验失败");
}

async function testSelectAmbiguity() {
  const ctx = writerContext();
  const NS = ctx.window.__WSZ;
  let candidateClicks = 0;
  const candidates = [1, 2].map(() => ({
    textContent: "本科",
    isConnected: true,
    getBoundingClientRect: () => ({ width: 1, height: 1 }),
    dispatchEvent() {},
    click() { candidateClicks++; },
  }));
  ctx.document.querySelectorAll = () => candidates;
  const select = {
    tagName: "INPUT",
    value: "",
    scrollIntoView() {},
    focus() {},
    dispatchEvent() {},
    click() {},
    closest() { return this; },
  };
  const field = { kind: "select", label: "学历", section: "个人信息", selectControls: [select], controls: [select] };
  const result = await NS.executePlan(
    [{ field, kind: "select", path: "basicInfo.highestEducation", value: "本科" }],
    {},
    { delayMs: 0 },
  );
  assert.equal(candidateClicks, 0);
  assert.equal(result.verified, 0);
  assert.equal(result.failed.length, 1);
}

async function testRuleLayerMigration() {
  const v1 = JSON.parse(fs.readFileSync(path.join(ROOT, "extension/rules/seed.v1.json"), "utf8"));
  const legacy = JSON.parse(JSON.stringify(v1));
  legacy.global.aliases["用户自定义别名"] = "basicInfo.name";
  const storage = { wsz_rules: legacy };
  const chrome = {
    runtime: { getURL: (x) => x },
    storage: {
      local: {
        get(keys, cb) {
          const names = Array.isArray(keys) ? keys : [keys];
          cb(Object.fromEntries(names.filter((k) => Object.prototype.hasOwnProperty.call(storage, k)).map((k) => [k, storage[k]])));
        },
        set(obj, cb) { Object.assign(storage, obj); if (cb) cb(); },
      },
    },
  };
  const ctx = baseContext({
    chrome,
    fetch: async (url) => ({ json: async () => String(url).includes("seed.v1") ? v1 : seed }),
  });
  loadScript("extension/lib/store.js", ctx);
  const rules = await ctx.window.__WSZ.store.loadRules();
  assert.equal(rules.providers.moka.aliases["意向工作城市"], "intent.cities");
  assert.equal(rules.global.aliases["用户自定义别名"], "basicInfo.name");
  assert.equal(rules.global.aliases["联系电话"], undefined);
  assert.equal(rules.global.aliases["籍贯"], undefined);
  assert.equal(rules.global.aliases["户籍"], undefined);
  assert.equal(rules.global.aliases["户籍所在地"], undefined);
  assert.equal(storage.wsz_seed_rules.version, 2);
  assert.equal(storage.wsz_user_rules.global.aliases["用户自定义别名"], "basicInfo.name");
  assert.equal(storage.wsz_user_rules.global.aliases["姓名"], undefined);
  assert.equal(storage.wsz_user_rules.global.aliases["联系电话"], undefined);
  assert.equal(storage.wsz_user_rules.global.aliases["期望工作地点"], undefined);
}

async function main() {
  await testDetection();
  await testMatchingSafety();
  await testScannerInvariants();
  await testAutoAddDisabled();
  await testWriter();
  await testSelectAmbiguity();
  await testRuleLayerMigration();
  console.log("PASS round1 regression tests");
}

main().catch((err) => {
  console.error(err.stack || err);
  process.exitCode = 1;
});

/* Round 2.5 Adapter Contract tests. Run with: node tests/adapter-contract.test.js */
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
    ...extra,
  };
  vm.createContext(ctx);
  return ctx;
}

function loadAdapterContext(extra = {}, withMatcher = true) {
  const ctx = baseContext(extra);
  loadScript("extension/lib/util.js", ctx);
  loadScript("extension/lib/schema.js", ctx);
  loadScript("extension/content/scanner.js", ctx);
  loadScript("extension/content/adapters/generic.js", ctx);
  loadScript("extension/content/adapters/moka.js", ctx);
  loadScript("extension/content/adapters/beisen.js", ctx);
  loadScript("extension/content/adapters/registry.js", ctx);
  if (withMatcher) loadScript("extension/content/matcher.js", ctx);
  return ctx;
}

async function testRegistrySelectionAndFallback() {
  const ctx = loadAdapterContext();
  const NS = ctx.window.__WSZ;
  const registry = NS.adapterRegistry;
  assert.equal(registry.get("moka").key, "moka");
  assert.equal(registry.get("beisen").key, "beisen");
  assert.equal(registry.get("unknown-platform").key, "generic");
  assert.equal(registry.get("moka").writeControl, undefined);
  const genericContainers = registry.invoke("moka", "getFieldContainers", [{}]);
  assert.equal(Array.isArray(genericContainers), true);
  assert.equal(genericContainers.length, 0);

  const field = { kind: "text", label: "姓名", section: "个人信息", textControls: [], controls: [] };
  assert.equal(registry.invoke("moka", "classifyControl", [field]), "text");

  const custom = { key: "test-provider", classifyControl: () => "provider-kind" };
  registry.register(custom);
  assert.equal(registry.get("test-provider"), custom);
  assert.equal(registry.invoke("test-provider", "classifyControl", [field]), "provider-kind");
  assert.equal(registry.invoke("test-provider", "findAddButton", [{}, {}]), null);
}

async function testFieldDescriptorAndCanonicalPath() {
  const ctx = loadAdapterContext();
  const NS = ctx.window.__WSZ;
  const merged = NS.mergedRules(seed, "beisen");
  const raw0 = {
    container: { nodeName: "DIV" },
    label: "学校",
    rawLabel: "学校（必填）",
    section: "教育经历",
    index: 0,
    kind: "text",
    controls: [],
    required: true,
  };
  const raw1 = Object.assign({}, raw0, { index: 1, container: { nodeName: "DIV", item: 1 } });
  const fields = NS.adapterRegistry.normalizeFields([raw0, raw1], { providerKey: "beisen", mergedRules: merged });
  assert.equal(fields[0].provider, "beisen");
  assert.equal(fields[0].section, "教育经历");
  assert.equal(fields[0].sectionKey, "education");
  assert.equal(fields[0].repeater.itemIndex, 0);
  assert.equal(fields[1].repeater.itemIndex, 1);
  assert.equal(fields[0].repeater.itemElement, null);
  assert.equal(fields[0].rawLabel, "学校（必填）");
  assert.equal(fields[0].required, true);
  assert.equal(fields[0].kind, "text");
  assert.equal(NS.resolvePath(fields[0], merged), "education[0].school");
  assert.equal(NS.resolvePath(fields[1], merged), "education[1].school");
  assert.equal(fields[0].sectionKey, "education");
  assert.equal(Object.prototype.hasOwnProperty.call(fields[0], "id"), false);

  const providerIndex = Object.assign({}, raw0, { index: 99, repeater: { itemIndex: 1, itemElement: raw1.container } });
  assert.equal(NS.resolvePath(providerIndex, merged), "education[1].school");
}

async function testUnknownManualAndEmptyProviderShells() {
  const ctx = loadAdapterContext();
  const NS = ctx.window.__WSZ;
  const merged = NS.mergedRules(seed, "beisen");
  const unknown = NS.adapterRegistry.normalizeField({
    label: "未知控件",
    rawLabel: "未知控件",
    section: "个人信息",
    kind: "unknown",
    controls: [],
  }, { providerKey: "moka", mergedRules: merged });
  const result = NS.buildPlan([unknown], merged, NS.emptySnapshot());
  assert.equal(result.plan.length, 0);
  assert.equal(result.manual.length, 1);

  const personal = { label: "姓名", rawLabel: "姓名", section: "个人信息", kind: "text", index: 0, controls: [] };
  const moka = NS.adapterRegistry.normalizeField(personal, { providerKey: "moka", mergedRules: merged });
  const beisen = NS.adapterRegistry.normalizeField(personal, { providerKey: "beisen", mergedRules: merged });
  assert.equal(NS.resolvePath(moka, merged), "basicInfo.name");
  assert.equal(NS.resolvePath(beisen, merged), "basicInfo.name");
  assert.equal(moka.sectionKey, null);
  assert.equal(beisen.sectionKey, null);
}

async function testGenericWriteReadVerifyFallback() {
  const ctx = loadAdapterContext();
  const NS = ctx.window.__WSZ;
  NS.sleep = async () => {};
  NS.emitInputEvents = () => {};
  NS.readFieldValue = (field) => field.textControls[0].value || "";
  NS.toOptionText = (_merged, value) => String(value);
  loadScript("extension/content/writer.js", ctx);

  const input = {
    tagName: "INPUT",
    type: "text",
    value: "",
    scrollIntoView() {},
    focus() {},
    blur() {},
    dispatchEvent() {},
  };
  const field = { kind: "text", label: "姓名", section: "个人信息", textControls: [input], controls: [input] };
  const context = { kind: "text", merged: {}, providerKey: "moka" };
  assert.equal(await NS.adapterRegistry.invoke("moka", "writeControl", [field, "张三", context]), true);
  assert.equal(await NS.adapterRegistry.invoke("moka", "readControl", [field, context]), "张三");
  assert.equal(await NS.adapterRegistry.invoke("moka", "verifyControl", [field, "张三", context]), true);

  input.value = "";
  const result = await NS.executePlan(
    [{ field, kind: "text", path: "basicInfo.name", value: "李四" }],
    {},
    { delayMs: 0, adapterRegistry: NS.adapterRegistry, providerKey: "moka" },
  );
  assert.equal(result.verified, 1);
  assert.equal(input.value, "李四");
}

async function testLearningTargetScopes() {
  const ctx = loadAdapterContext();
  const NS = ctx.window.__WSZ;
  const merged = NS.mergedRules(seed, "beisen");
  const flat = NS.adapterRegistry.learningTarget({ section: "个人信息" }, "basicInfo.name", { mergedRules: merged });
  assert.equal(flat.kind, "flat");
  assert.equal(flat.path, "basicInfo.name");

  const repeater = NS.adapterRegistry.learningTarget({ section: "教育经历" }, "education[1].school", { mergedRules: merged });
  assert.equal(repeater.kind, "repeater");
  assert.equal(repeater.scope, "repeater");
  assert.equal(repeater.sectionKey, "education");
  assert.equal(repeater.itemIndex, 1);
  assert.equal(repeater.fieldPath, "school");

  const family = NS.adapterRegistry.learningTarget({ section: "家庭情况" }, "familyMembers[0].name", { mergedRules: merged });
  assert.equal(family.kind, "section-scoped");
  assert.equal(family.scope, "section");
  assert.equal(family.sectionKey, "familyMembers");
  assert.equal(family.itemIndex, 0);
  assert.equal(family.fieldPath, "name");
  assert.notEqual(family.kind, "flat");
}

async function testAddItemDisabled() {
  const ctx = loadAdapterContext();
  const registry = ctx.window.__WSZ.adapterRegistry;
  for (const provider of ["generic", "moka", "beisen"]) {
    assert.equal(registry.canAddItem(provider, "education"), false, provider);
    assert.equal(registry.canAddItem(provider, "work"), false, provider);
    assert.equal(registry.findAddButton(provider, {}, {}), null, provider);
  }
  const main = fs.readFileSync(path.join(ROOT, "extension/content/main.js"), "utf8");
  assert.doesNotMatch(main, /ensureItemCount/);
  assert.match(main, /adapterRegistry\.normalizeFields/);
  assert.match(main, /learningTarget/);
}

async function main() {
  await testRegistrySelectionAndFallback();
  await testFieldDescriptorAndCanonicalPath();
  await testUnknownManualAndEmptyProviderShells();
  await testGenericWriteReadVerifyFallback();
  await testLearningTargetScopes();
  await testAddItemDisabled();
  console.log("PASS adapter contract tests");
}

main().catch((err) => {
  console.error(err.stack || err);
  process.exitCode = 1;
});

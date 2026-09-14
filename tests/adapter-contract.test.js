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

function loadCaptureClearContext(extra = {}) {
  const ctx = loadAdapterContext(extra);
  loadScript("extension/content/writer.js", ctx);
  loadScript("extension/content/learn.js", ctx);
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

async function testProviderScanFieldsAndSyncBoundary() {
  const ctx = loadAdapterContext();
  const NS = ctx.window.__WSZ;
  const registry = NS.adapterRegistry;
  const genericField = { label: "姓名", rawLabel: "姓名", section: "个人信息", kind: "text", controls: [] };
  NS.scanFields = () => [genericField];
  const merged = NS.mergedRules(seed, "moka");
  const provider = {
    key: "scan-provider",
    scanFields(context) {
      const fields = context.genericScanFields();
      fields.push({ label: "平台专属字段", rawLabel: "平台专属字段", section: "个人信息", kind: "text", controls: [] });
      return fields;
    },
  };
  registry.register(provider);
  const fields = registry.scanFields("scan-provider", { mergedRules: merged, domConfig: {} });
  assert.deepEqual(fields.map((field) => field.label), ["姓名", "平台专属字段"]);
  assert.equal(fields[0].provider, "scan-provider");
  assert.equal(NS.resolvePath(fields[0], merged), "basicInfo.name");

  // Empty provider shells must use the same Generic scanner, for both known
  // providers, without putting a Promise into the structural result.
  for (const providerKey of ["moka", "beisen"]) {
    const fallbackFields = registry.scanFields(providerKey, { mergedRules: merged, domConfig: {} });
    assert.equal(fallbackFields.length, 1, providerKey);
    assert.equal(fallbackFields[0].label, "姓名", providerKey);
    assert.equal(fallbackFields[0].provider, providerKey, providerKey);
  }

  registry.register({
    key: "async-scan-provider",
    scanFields: () => Promise.resolve([{ label: "不能同步扫描", kind: "text", controls: [] }]),
  });
  const asyncFallback = registry.scanFields("async-scan-provider", { mergedRules: merged, domConfig: {} });
  assert.equal(asyncFallback[0].label, "姓名");
  assert.equal(asyncFallback.some((field) => field.label === "不能同步扫描"), false);

  registry.register({
    key: "async-structure-provider",
    getSection: () => Promise.resolve({ section: "错误区块", sectionKey: "wrong" }),
    getRepeaterItem: () => Promise.resolve({ itemIndex: 99, itemElement: {} }),
    classifyControl: () => Promise.resolve("wrong-kind"),
  });
  const normalized = registry.normalizeField(
    { label: "学校", section: "教育经历", kind: "text", index: 0, controls: [] },
    { providerKey: "async-structure-provider", mergedRules: NS.mergedRules(seed, "beisen") },
  );
  assert.equal(normalized.section, "教育经历");
  assert.equal(normalized.sectionKey, "education");
  assert.equal(normalized.repeater.itemIndex, 0);
  assert.equal(normalized.kind, "text");
  assert.equal(typeof normalized.section.then, "undefined");
  assert.equal(typeof normalized.repeater.then, "undefined");
}

async function testCaptureControlBoundary() {
  const ctx = loadCaptureClearContext();
  const NS = ctx.window.__WSZ;
  const registry = NS.adapterRegistry;
  const merged = NS.mergedRules(seed, "moka");
  const field = {
    label: "姓名",
    rawLabel: "姓名",
    section: "个人信息",
    kind: "text",
    textControls: [{ value: "GenericValue" }],
    controls: [],
  };
  let providerCalls = 0;
  registry.register({
    key: "capture-provider",
    captureControl: async (currentField, context) => {
      providerCalls++;
      assert.equal(currentField, field);
      assert.equal(context.providerKey, "capture-provider");
      return "ProviderValue";
    },
  });
  const snapshot = NS.emptySnapshot();
  const result = await NS.captureSnapshot([field], merged, snapshot, {
    adapterRegistry: registry,
    providerKey: "capture-provider",
  });
  assert.equal(result.updated, 1);
  assert.equal(snapshot.basicInfo.name, "ProviderValue");
  assert.equal(providerCalls, 1);

  for (const providerKey of ["moka", "beisen"]) {
    field.textControls[0].value = `${providerKey}-generic`;
    const fallbackSnapshot = NS.emptySnapshot();
    await NS.captureSnapshot([field], merged, fallbackSnapshot, {
      adapterRegistry: registry,
      providerKey,
    });
    assert.equal(fallbackSnapshot.basicInfo.name, `${providerKey}-generic`, providerKey);
  }
}

async function testClearControlBoundary() {
  const ctx = loadCaptureClearContext();
  const NS = ctx.window.__WSZ;
  const registry = NS.adapterRegistry;
  NS.sleep = async () => {};
  NS.emitInputEvents = () => {};
  NS.hasValue = () => true;
  const input = {
    tagName: "INPUT",
    type: "text",
    value: "existing",
    scrollIntoView() {},
    focus() {},
    blur() {},
  };
  const field = { label: "姓名", section: "个人信息", kind: "text", textControls: [input], controls: [input] };
  let providerCalls = 0;
  registry.register({
    key: "clear-provider",
    clearControl: async (currentField, context) => {
      providerCalls++;
      assert.equal(currentField, field);
      assert.equal(context.providerKey, "clear-provider");
      return true;
    },
  });
  const providerResult = await NS.clearForm([field], {
    delayMs: 0,
    adapterRegistry: registry,
    providerKey: "clear-provider",
  });
  assert.equal(providerResult.cleared, 1);
  assert.equal(providerResult.failed.length, 0);
  assert.equal(providerCalls, 1);

  input.value = "moka-existing";
  const genericResult = await NS.clearForm([field], {
    delayMs: 0,
    adapterRegistry: registry,
    providerKey: "moka",
  });
  assert.equal(genericResult.cleared, 1);
  assert.equal(input.value, "");

  const unsupported = { label: "未知控件", section: "个人信息", kind: "unknown", controls: [] };
  assert.equal(await registry.clearControl("moka", unsupported, {}), false);
  const unsupportedResult = await NS.clearForm([unsupported], {
    delayMs: 0,
    adapterRegistry: registry,
    providerKey: "moka",
  });
  assert.equal(unsupportedResult.cleared, 0);
  assert.equal(unsupportedResult.failed.length, 1);
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
  assert.match(main, /adapterRegistry\.scanFields/);
  assert.doesNotMatch(main, /NS\.scanFields/);
  assert.match(main, /captureSnapshot[\s\S]*adapterRegistry/);
  assert.match(main, /clearForm[\s\S]*adapterRegistry/);
  assert.match(main, /learningTarget/);
}

async function main() {
  await testRegistrySelectionAndFallback();
  await testFieldDescriptorAndCanonicalPath();
  await testUnknownManualAndEmptyProviderShells();
  await testGenericWriteReadVerifyFallback();
  await testProviderScanFieldsAndSyncBoundary();
  await testCaptureControlBoundary();
  await testClearControlBoundary();
  await testLearningTargetScopes();
  await testAddItemDisabled();
  console.log("PASS adapter contract tests");
}

main().catch((err) => {
  console.error(err.stack || err);
  process.exitCode = 1;
});

/* Round 2 Schema v2 regression tests. Run with: node tests/round2.test.js */
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

function loadSchemaContext(extra = {}) {
  const ctx = baseContext(extra);
  loadScript("extension/lib/util.js", ctx);
  loadScript("extension/lib/schema.js", ctx);
  return ctx;
}

function chromeStorage(storage) {
  return {
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
}

async function testEmptyV2() {
  const ctx = loadSchemaContext();
  const NS = ctx.window.__WSZ;
  const empty = NS.emptySnapshot();
  assert.equal(empty.schemaVersion, 2);
  for (const key of ["ethnicity", "politicalStatus", "maritalStatus", "nativePlace", "hukouLocation", "currentLocation", "highestEducation"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(empty.basicInfo, key), key);
  }
  assert.equal(JSON.stringify(empty.intent.expectedSalary), JSON.stringify({ amount: "", period: "unknown", currency: "CNY" }));
  assert.equal(JSON.stringify(empty.intent.currentSalary), JSON.stringify({ amount: "", period: "unknown", currency: "CNY" }));
  for (const key of ["skills", "certificates", "languageTests", "familyMembers", "referrers"]) {
    assert.equal(empty[key].length, 0, key);
  }
  assert.equal(Object.keys(empty.legacy).length, 0);
}

async function testMigrationAndIdempotence() {
  const ctx = loadSchemaContext();
  const NS = ctx.window.__WSZ;
  const v1 = {
    basicInfo: {
      name: "张三",
      hukou: "旧籍贯/户籍值",
      city: "上海",
      political: "群众",
      highestDegree: "硕士",
    },
    intent: { salary: "20k", currentSalary: "10k" },
    education: [{ school: "A大学", degree: "本科", major: "计算机" }],
    work: [{ company: "甲公司", title: "工程师" }],
    internship: [{ company: "乙公司" }],
    project: [{ name: "项目 A" }],
    language: [{ lang: "英语", level: "熟练" }],
    award: [{ name: "奖项 A", date: "2024.06" }],
  };
  const migrated = NS.migrateSnapshot(v1);
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.basicInfo.currentLocation, "上海");
  assert.equal(migrated.basicInfo.politicalStatus, "群众");
  assert.equal(migrated.basicInfo.highestEducation, "硕士");
  assert.equal(migrated.basicInfo.nativePlace, "");
  assert.equal(migrated.basicInfo.hukouLocation, "");
  assert.equal(migrated.legacy.hukou, "旧籍贯/户籍值");
  assert.equal(migrated.basicInfo.hukou, undefined);
  assert.equal(migrated.education[0].educationLevel, "本科");
  assert.equal(migrated.education[0].degreeName, undefined);
  assert.equal(migrated.education[0].degree, undefined);
  assert.equal(migrated.intent.expectedSalary.amount, "20k");
  assert.equal(migrated.intent.expectedSalary.period, "unknown");
  assert.equal(migrated.intent.currentSalary.amount, "10k");
  assert.equal(migrated.intent.currentSalary.period, "unknown");
  assert.equal(migrated.intent.salary, undefined);
  for (const key of ["education", "work", "internship", "project", "language", "award"]) {
    assert.ok(migrated[key][0].id.startsWith(`${key === "education" ? "edu" : key}_`));
  }
  assert.equal(JSON.stringify(NS.migrateSnapshot(migrated)), JSON.stringify(migrated));
}

async function testStoreMigrationAndStableIds() {
  const legacy = {
    basicInfo: { hukou: "待确认" },
    education: [{ school: "A大学", degree: "本科" }],
    work: [{ company: "甲公司" }],
  };
  const storage = { wsz_snapshot: legacy };
  const ctx = loadSchemaContext({ chrome: chromeStorage(storage) });
  loadScript("extension/lib/store.js", ctx);
  const first = await ctx.window.__WSZ.store.loadSnapshot();
  const firstIds = { education: first.education[0].id, work: first.work[0].id };
  assert.equal(storage.wsz_snapshot.schemaVersion, 2);
  assert.equal(storage.wsz_snapshot.legacy.hukou, "待确认");
  const second = await ctx.window.__WSZ.store.loadSnapshot();
  assert.equal(JSON.stringify(second), JSON.stringify(first));
  assert.equal(second.education[0].id, firstIds.education);
  assert.equal(second.work[0].id, firstIds.work);

  first.skills.push({ name: "JavaScript" });
  const saved = await ctx.window.__WSZ.store.saveSnapshot(first);
  assert.equal(saved.schemaVersion, 2);
  assert.equal(storage.wsz_snapshot.skills[0].id, saved.skills[0].id);
  const reloaded = await ctx.window.__WSZ.store.loadSnapshot();
  assert.equal(reloaded.skills[0].id, saved.skills[0].id);
}

async function testImportV2WithoutIdsAndLegacyBoundary() {
  const ctx = loadSchemaContext();
  const NS = ctx.window.__WSZ;
  const imported = NS.emptySnapshot();
  imported.skills = [{ name: "C++" }];
  imported.certificates = [{ name: "证书" }];
  imported.familyMembers = [{ name: "家人" }];
  imported.referrers = [{ name: "推荐人" }];
  const migrated = NS.migrateSnapshot(imported);
  for (const [key, prefix] of [["skills", "skill"], ["certificates", "certificate"], ["familyMembers", "family"], ["referrers", "referrer"]]) {
    assert.match(migrated[key][0].id, new RegExp(`^${prefix}_`), key);
  }
  const skillId = migrated.skills[0].id;
  migrated.skills[0].name = "C++17";
  assert.equal(NS.migrateSnapshot(migrated).skills[0].id, skillId);

  const storage = { wsz_snapshot: imported };
  const storeCtx = loadSchemaContext({ chrome: chromeStorage(storage) });
  loadScript("extension/lib/store.js", storeCtx);
  const loaded = await storeCtx.window.__WSZ.store.loadSnapshot();
  assert.equal(loaded.skills[0].id, skillId);
  assert.equal(storage.wsz_snapshot.skills[0].id, skillId);
  assert.equal((await storeCtx.window.__WSZ.store.loadSnapshot()).skills[0].id, skillId);

  assert.equal(NS.canonicalPath("legacy.hukou"), null);
  assert.equal(NS.canonicalPath("legacy.anything"), null);
  const tree = NS.fieldTree(migrated);
  assert.equal(tree.some((node) => node.path.startsWith("legacy.")), false);

  loadScript("extension/content/matcher.js", ctx);
  const merged = NS.mergedRules({
    global: { aliases: { 历史籍贯: "legacy.hukou" }, sectionAliases: {}, scopedAliases: {} },
    providers: {},
  });
  assert.equal(NS.resolvePath({ label: "历史籍贯", section: "", index: 0 }, merged), null);
}

async function testRuleSaveUsesCurrentSeed() {
  const storage = { wsz_seed_rules: seed };
  const ctx = loadSchemaContext({ chrome: chromeStorage(storage) });
  loadScript("extension/lib/store.js", ctx);
  const rules = JSON.parse(JSON.stringify(seed));
  rules.global.aliases["用户薪资别名"] = "intent.salary";
  rules.global.aliases["用户姓名别名"] = "basicInfo.name";
  await ctx.window.__WSZ.store.saveRules(rules);
  assert.equal(storage.wsz_user_rules.global.aliases["用户薪资别名"], "intent.expectedSalary.amount");
  assert.equal(storage.wsz_user_rules.global.aliases["用户姓名别名"], "basicInfo.name");
  assert.equal(storage.wsz_user_rules.global.aliases["姓名"], undefined);
  assert.equal(storage.wsz_user_rules.providers.moka, undefined);
}

async function testNewModulesAndFieldTree() {
  const ctx = loadSchemaContext();
  const NS = ctx.window.__WSZ;
  const snap = NS.emptySnapshot();
  const tree = NS.fieldTree(snap);
  const paths = new Set(tree.map((x) => x.path));
  for (const p of [
    "education[0].educationLevel",
    "skills[0].name",
    "certificates[0].name",
    "languageTests[0].testName",
    "familyMembers[0].phone",
    "referrers[0].name",
    "intent.expectedSalary.amount",
    "intent.currentSalary.period",
  ]) assert.ok(paths.has(p), p);
  assert.equal([...paths].some((p) => p.endsWith(".id")), false);
  assert.equal([...paths].some((p) => p.endsWith(".degree")), false);

  NS.deepSet(snap, "skills[0].name", "JavaScript");
  NS.deepSet(snap, "familyMembers[0].phone", "13800000000");
  NS.deepSet(snap, "referrers[0].name", "推荐人甲");
  NS.deepSet(snap, "languageTests[0].testName", "CET-6");
  assert.equal(NS.deepGet(snap, "skills[0].name"), "JavaScript");
  assert.equal(NS.deepGet(snap, "familyMembers[0].phone"), "13800000000");
  assert.equal(NS.deepGet(snap, "referrers[0].name"), "推荐人甲");
  assert.equal(NS.deepGet(snap, "languageTests[0].testName"), "CET-6");
}

async function testCanonicalRules() {
  const ctx = loadSchemaContext();
  loadScript("extension/content/matcher.js", ctx);
  const NS = ctx.window.__WSZ;
  const merged = NS.mergedRules(seed, "beisen");
  assert.equal(NS.resolvePath({ label: "学历", section: "教育经历", repeater: { itemIndex: 0, itemElement: {} }, index: 0 }, merged), "education[0].educationLevel");
  assert.equal(NS.resolvePath({ label: "学历", section: "教育经历", repeater: { itemIndex: null, itemElement: null }, index: 0 }, merged), null);
  assert.equal(NS.resolvePath({ label: "最高学历", section: "个人信息", index: 0 }, merged), "basicInfo.highestEducation");
  assert.equal(NS.resolvePath({ label: "期望薪资", section: "求职意向", index: 0 }, merged), "intent.expectedSalary.amount");
  assert.equal(NS.resolvePath({ label: "当前薪资", section: "求职意向", index: 0 }, merged), "intent.currentSalary.amount");
  assert.equal(NS.resolvePath({ label: "家庭成员", section: "家庭情况", index: 0 }, merged), null);
  assert.equal(NS.resolvePath({ label: "联系电话", section: "家庭情况", index: 0 }, merged), null);
  assert.equal(NS.canonicalPath("education[0].degree"), "education[0].educationLevel");
  assert.equal(NS.canonicalPath("basicInfo.hukou"), null);
}

async function testSalaryUnitSafety() {
  const ctx = loadSchemaContext();
  loadScript("extension/content/matcher.js", ctx);
  const NS = ctx.window.__WSZ;
  const merged = NS.mergedRules(seed, "beisen");
  assert.deepEqual(seed.global.salaryAliases["期望月薪"], {
    path: "intent.expectedSalary.amount",
    period: "month",
  });
  assert.deepEqual(seed.global.salaryAliases["期望年薪"], {
    path: "intent.expectedSalary.amount",
    period: "year",
  });
  assert.equal(seed.global.aliases["期望月薪"], undefined);
  assert.equal(seed.global.aliases["期望年薪"], undefined);

  const snapshot = NS.emptySnapshot();
  snapshot.intent.expectedSalary.amount = "20k";
  snapshot.intent.currentSalary.amount = "10k";
  const month = { label: "期望月薪", section: "求职意向", index: 0, kind: "text" };
  const year = { label: "期望年薪", section: "求职意向", index: 0, kind: "text" };
  const generic = { label: "期望薪资", section: "求职意向", index: 0, kind: "text" };
  const annotatedMonth = { label: "期望薪资", rawLabel: "期望薪资（元/月）", section: "求职意向", index: 0, kind: "text" };
  const parenthesizedYear = { label: "期望薪资", rawLabel: "期望薪资（年）", section: "求职意向", index: 0, kind: "text" };

  let result = NS.buildPlan([month, year], merged, snapshot);
  assert.equal(result.plan.length, 0);
  assert.equal(result.unmatched.length, 2);
  assert.ok(result.unmatched.every((item) => item.reason.includes("薪资周期")));

  result = NS.buildPlan([generic], merged, snapshot);
  assert.equal(result.plan.length, 1);
  assert.equal(result.plan[0].path, "intent.expectedSalary.amount");
  result = NS.buildPlan([annotatedMonth], merged, snapshot);
  assert.equal(result.plan.length, 0);
  assert.equal(result.unmatched.length, 1);
  result = NS.buildPlan([parenthesizedYear], merged, snapshot);
  assert.equal(result.plan.length, 0);
  assert.equal(result.unmatched.length, 1);

  snapshot.intent.expectedSalary.period = "month";
  result = NS.buildPlan([month, annotatedMonth], merged, snapshot);
  assert.equal(result.plan.length, 2);
  assert.equal(result.plan[0].value, "20k");
  snapshot.intent.expectedSalary.period = "year";
  result = NS.buildPlan([month, year], merged, snapshot);
  assert.equal(result.plan.length, 1);
  assert.equal(result.plan[0].field.label, "期望年薪");

  snapshot.intent.currentSalary.period = "unknown";
  const currentMonthly = { label: "当前月薪", section: "求职意向", index: 0, kind: "text" };
  result = NS.buildPlan([currentMonthly], merged, snapshot);
  assert.equal(result.plan.length, 0);
  assert.equal(result.unmatched.length, 1);
}

async function testEditorUsesSchemaDrivenV2() {
  const source = fs.readFileSync(path.join(ROOT, "extension/editor/editor.js"), "utf8");
  assert.match(source, /NS\.schemaFieldPath/);
  assert.match(source, /NS\.migrateSnapshot/);
  assert.match(source, /inputType === "select"/);
  assert.match(source, /旧版“籍贯\/户籍”存在历史值/);
  assert.match(source, /hasOwnProperty\.call\(snap\.legacy, "hukou"\)/);
  const schema = fs.readFileSync(path.join(ROOT, "extension/lib/schema.js"), "utf8");
  assert.match(schema, /key: "skills"/);
  assert.match(schema, /key: "familyMembers"/);
  assert.match(schema, /key: "referrers"/);
  assert.doesNotMatch(schema, /key: "id", label/);
}

async function main() {
  await testEmptyV2();
  await testMigrationAndIdempotence();
  await testStoreMigrationAndStableIds();
  await testImportV2WithoutIdsAndLegacyBoundary();
  await testRuleSaveUsesCurrentSeed();
  await testNewModulesAndFieldTree();
  await testCanonicalRules();
  await testSalaryUnitSafety();
  await testEditorUsesSchemaDrivenV2();
  console.log("PASS round2 schema v2 tests");
}

main().catch((err) => {
  console.error(err.stack || err);
  process.exitCode = 1;
});

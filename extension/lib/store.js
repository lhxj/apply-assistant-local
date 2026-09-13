/* 网申助手 · 本地存储（chrome.storage.local：快照 + 规则库 + 设置） */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});
  const K_SNAP = "wsz_snapshot";
  const K_LEGACY_RULES = "wsz_rules";
  const K_SEED_RULES = "wsz_seed_rules";
  const K_USER_RULES = "wsz_user_rules";
  const K_LEGACY_SEED = "wsz_seed_v1_baseline";
  const K_SETTINGS = "wsz_settings";

  const get = (keys) => new Promise((r) => chrome.storage.local.get(keys, r));
  const set = (obj) => new Promise((r) => chrome.storage.local.set(obj, r));

  const clone = (obj) => JSON.parse(JSON.stringify(obj || {}));

  function emptyUserRules() {
    return { global: { aliases: {}, sectionAliases: {}, optionValueAliases: {}, scopedAliases: {} }, providers: {} };
  }

  function diffMap(current, baseline) {
    const out = {};
    for (const [key, value] of Object.entries(current || {})) {
      if (!Object.prototype.hasOwnProperty.call(baseline || {}, key) || JSON.stringify(value) !== JSON.stringify(baseline[key])) {
        out[key] = value;
      }
    }
    return out;
  }

  function diffNested(current, baseline) {
    const out = {};
    for (const [key, value] of Object.entries(current || {})) {
      const delta = diffMap(value, (baseline || {})[key]);
      if (Object.keys(delta).length) out[key] = delta;
    }
    return out;
  }

  function canonicalAliasMap(map) {
    const out = {};
    for (const [label, target] of Object.entries(map || {})) {
      const path = NS.canonicalPath ? NS.canonicalPath(target) : target;
      if (path) out[label] = path;
    }
    return out;
  }

  function sanitizeUserLayer(raw) {
    const out = emptyUserRules();
    const g = (raw && raw.global) || {};
    out.global.aliases = canonicalAliasMap(g.aliases);
    out.global.sectionAliases = Object.assign({}, g.sectionAliases || {});
    out.global.optionValueAliases = Object.assign({}, g.optionValueAliases || {});
    out.global.scopedAliases = clone(g.scopedAliases || {});
    for (const [key, p] of Object.entries((raw && raw.providers) || {})) {
      if (!p || typeof p !== "object") continue;
      out.providers[key] = {
        aliases: canonicalAliasMap(p.aliases),
        sectionAliases: Object.assign({}, p.sectionAliases || {}),
        optionValueAliases: Object.assign({}, p.optionValueAliases || {}),
        scopedAliases: clone(p.scopedAliases || {}),
      };
    }
    for (const label of ["联系电话", "籍贯", "户籍", "户籍所在地"]) delete out.global.aliases[label];
    return out;
  }

  // 旧版规则是 Seed v1 与用户增量的合并体；这里只提取相对 v1 baseline 的差异。
  function userLayerFrom(raw, baseline) {
    const out = emptyUserRules();
    if (!raw || typeof raw !== "object") return out;
    const g = raw.global || {};
    const bg = (baseline && baseline.global) || {};
    out.global.aliases = canonicalAliasMap(diffMap(g.aliases, bg.aliases));
    out.global.sectionAliases = diffMap(g.sectionAliases, bg.sectionAliases);
    out.global.optionValueAliases = diffMap(g.optionValueAliases, bg.optionValueAliases);
    out.global.scopedAliases = diffNested(g.scopedAliases, bg.scopedAliases);
    for (const [key, p] of Object.entries(raw.providers || {})) {
      const bp = (baseline && baseline.providers && baseline.providers[key]) || {};
      const item = {
        aliases: canonicalAliasMap(diffMap((p && p.aliases), bp.aliases)),
        sectionAliases: diffMap((p && p.sectionAliases), bp.sectionAliases),
        optionValueAliases: diffMap((p && p.optionValueAliases), bp.optionValueAliases),
        scopedAliases: diffNested((p && p.scopedAliases), bp.scopedAliases),
      };
      if (Object.values(item).some((v) => Object.keys(v || {}).length)) out.providers[key] = item;
    }
    // 这些字段在 v2 中已明确禁用，旧 seed 或旧学习层都不能复活它们。
    return sanitizeUserLayer(out);
  }

  function mergeNested(a, b) {
    const out = {};
    for (const [key, value] of Object.entries(a || {})) out[key] = Object.assign({}, value || {});
    for (const [key, value] of Object.entries(b || {})) out[key] = Object.assign(out[key] || {}, value || {});
    return out;
  }

  function mergeRuleLayers(seed, user) {
    const s = seed || {};
    const u = user || emptyUserRules();
    const result = clone(s);
    result.global = Object.assign({}, s.global || {});
    result.global.aliases = Object.assign({}, (s.global && s.global.aliases) || {}, (u.global && u.global.aliases) || {});
    result.global.sectionAliases = Object.assign({}, (s.global && s.global.sectionAliases) || {}, (u.global && u.global.sectionAliases) || {});
    result.global.optionValueAliases = Object.assign({}, (s.global && s.global.optionValueAliases) || {}, (u.global && u.global.optionValueAliases) || {});
    result.global.scopedAliases = mergeNested(s.global && s.global.scopedAliases, u.global && u.global.scopedAliases);
    result.providers = Object.assign({}, s.providers || {});
    for (const [key, p] of Object.entries(u.providers || {})) {
      const base = result.providers[key] || {};
      result.providers[key] = Object.assign({}, base, {
        aliases: Object.assign({}, base.aliases || {}, p.aliases || {}),
        sectionAliases: Object.assign({}, base.sectionAliases || {}, p.sectionAliases || {}),
        optionValueAliases: Object.assign({}, base.optionValueAliases || {}, p.optionValueAliases || {}),
        scopedAliases: mergeNested(base.scopedAliases, p.scopedAliases),
      });
    }
    return result;
  }

  async function loadBundledJson(resource, cached) {
    try {
      const url = chrome.runtime.getURL(resource);
      return await (await fetch(url)).json();
    } catch (e) {
      return cached || null;
    }
  }

  async function loadSeedAndUser() {
    const d = await get([K_SEED_RULES, K_USER_RULES, K_LEGACY_RULES, K_LEGACY_SEED]);
    const freshSeed = await loadBundledJson("rules/seed.json", d[K_SEED_RULES]);
    if (!freshSeed) throw new Error("无法加载内置规则");

    // 每次加载都以插件内 seed 为准；版本变化时刷新缓存，用户规则仍在独立 key 中。
    if (!d[K_SEED_RULES] || d[K_SEED_RULES].version !== freshSeed.version || JSON.stringify(d[K_SEED_RULES]) !== JSON.stringify(freshSeed)) {
      await set({ [K_SEED_RULES]: freshSeed });
    }
    const legacySeed = await loadBundledJson("rules/seed.v1.json", d[K_LEGACY_SEED]);
    if (legacySeed && (!d[K_LEGACY_SEED] || d[K_LEGACY_SEED].version !== legacySeed.version)) {
      await set({ [K_LEGACY_SEED]: legacySeed });
    }
    const legacyRules = d[K_LEGACY_RULES];
    const rawUser = d[K_USER_RULES] || legacyRules;
    // 没有 v1 baseline 时不把 legacy 整体当作用户层，避免旧 seed 误盖当前 seed；保留原 key 等待下次可迁移。
    const user = d[K_USER_RULES]
      ? sanitizeUserLayer(d[K_USER_RULES])
      : legacyRules && legacySeed ? userLayerFrom(legacyRules, legacySeed) : emptyUserRules();
    if (rawUser && legacySeed && (!d[K_USER_RULES] || JSON.stringify(user) !== JSON.stringify(d[K_USER_RULES]))) {
      await set({ [K_USER_RULES]: user });
    }
    return { seed: freshSeed, user };
  }

  NS.store = {
    async loadSnapshot() {
      const d = await get(K_SNAP);
      const raw = d[K_SNAP];
      const snapshot = NS.migrateSnapshot ? NS.migrateSnapshot(raw) : (raw || NS.emptySnapshot());
      if (!raw || JSON.stringify(raw) !== JSON.stringify(snapshot)) await set({ [K_SNAP]: snapshot });
      return snapshot;
    },
    async saveSnapshot(snap) {
      const snapshot = NS.migrateSnapshot ? NS.migrateSnapshot(snap) : snap;
      await set({ [K_SNAP]: snapshot });
      return snapshot;
    },

    async loadRules() {
      const { seed, user } = await loadSeedAndUser();
      return mergeRuleLayers(seed, user);
    },
    async saveRules(rules) {
      let d = await get(K_SEED_RULES);
      if (!d[K_SEED_RULES]) {
        await loadSeedAndUser();
        d = await get(K_SEED_RULES);
      }
      if (!d[K_SEED_RULES]) return;
      await set({ [K_USER_RULES]: userLayerFrom(rules, d[K_SEED_RULES]) });
    },

    async loadSettings() {
      const d = await get(K_SETTINGS);
      const settings = Object.assign({ delayMs: 100, autoAddItems: false }, d[K_SETTINGS] || {});
      // Generic 添加经历尚未经过平台 Adapter 验证，本轮硬关闭，即使旧设置曾为 true。
      settings.autoAddItems = false;
      return settings;
    },

    // 给某服务商（或全局）追加一条别名规则
    async addAlias(providerKey, scope, label, targetPath) {
      const { user } = await loadSeedAndUser();
      const canonicalTarget = NS.canonicalPath ? NS.canonicalPath(targetPath) : targetPath;
      if (!canonicalTarget) return;
      const bag = providerKey ? (user.providers[providerKey] = user.providers[providerKey] || { aliases: {}, scopedAliases: {} }) : user.global;
      if (scope) {
        bag.scopedAliases = bag.scopedAliases || {};
        bag.scopedAliases[scope] = bag.scopedAliases[scope] || {};
        bag.scopedAliases[scope][label] = canonicalTarget;
      } else {
        bag.aliases = bag.aliases || {};
        bag.aliases[label] = canonicalTarget;
      }
      await set({ [K_USER_RULES]: user });
    },
  };
})();

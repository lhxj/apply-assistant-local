/* 网申助手 · 本地存储（chrome.storage.local：快照 + 规则库 + 设置） */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});
  const K_SNAP = "wsz_snapshot";
  const K_LEGACY_RULES = "wsz_rules";
  const K_SEED_RULES = "wsz_seed_rules";
  const K_USER_RULES = "wsz_user_rules";
  const K_SETTINGS = "wsz_settings";

  const get = (keys) => new Promise((r) => chrome.storage.local.get(keys, r));
  const set = (obj) => new Promise((r) => chrome.storage.local.set(obj, r));

  const clone = (obj) => JSON.parse(JSON.stringify(obj || {}));

  function emptyUserRules() {
    return { global: { aliases: {}, sectionAliases: {}, optionValueAliases: {}, scopedAliases: {} }, providers: {} };
  }

  // 只保留用户可学习的规则，避免把内置 provider 元数据复制到用户层。
  function userLayerFrom(raw) {
    const out = emptyUserRules();
    if (!raw || typeof raw !== "object") return out;
    const g = raw.global || {};
    out.global.aliases = Object.assign({}, g.aliases || {});
    // 旧版本把不安全的全局“联系电话”种子也持久化了，迁移时一并移除。
    delete out.global.aliases["联系电话"];
    out.global.sectionAliases = Object.assign({}, g.sectionAliases || {});
    out.global.optionValueAliases = Object.assign({}, g.optionValueAliases || {});
    out.global.scopedAliases = clone(g.scopedAliases || {});
    for (const [key, p] of Object.entries(raw.providers || {})) {
      out.providers[key] = {
        aliases: Object.assign({}, (p && p.aliases) || {}),
        sectionAliases: Object.assign({}, (p && p.sectionAliases) || {}),
        optionValueAliases: Object.assign({}, (p && p.optionValueAliases) || {}),
        scopedAliases: clone((p && p.scopedAliases) || {}),
      };
    }
    return out;
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

  async function loadSeedAndUser() {
    const d = await get([K_SEED_RULES, K_USER_RULES, K_LEGACY_RULES]);
    let freshSeed = null;
    try {
      const url = chrome.runtime.getURL("rules/seed.json");
      freshSeed = await (await fetch(url)).json();
    } catch (e) {
      freshSeed = d[K_SEED_RULES] || null;
    }
    if (!freshSeed) throw new Error("无法加载内置规则");

    // 每次加载都以插件内 seed 为准；版本变化时刷新缓存，用户规则仍在独立 key 中。
    if (!d[K_SEED_RULES] || d[K_SEED_RULES].version !== freshSeed.version) {
      await set({ [K_SEED_RULES]: freshSeed });
    }
    let user = d[K_USER_RULES];
    if (!user && d[K_LEGACY_RULES]) {
      user = userLayerFrom(d[K_LEGACY_RULES]);
      await set({ [K_USER_RULES]: user });
    }
    return { seed: freshSeed, user: user || emptyUserRules() };
  }

  NS.store = {
    async loadSnapshot() {
      const d = await get(K_SNAP);
      return d[K_SNAP] || NS.emptySnapshot();
    },
    async saveSnapshot(snap) {
      await set({ [K_SNAP]: snap });
    },

    async loadRules() {
      const { seed, user } = await loadSeedAndUser();
      return mergeRuleLayers(seed, user);
    },
    async saveRules(rules) {
      await set({ [K_USER_RULES]: userLayerFrom(rules) });
    },

    async loadSettings() {
      const d = await get(K_SETTINGS);
      return Object.assign({ delayMs: 100, autoAddItems: true }, d[K_SETTINGS] || {});
    },

    // 给某服务商（或全局）追加一条别名规则
    async addAlias(providerKey, scope, label, targetPath) {
      const d = await get([K_USER_RULES, K_LEGACY_RULES]);
      const user = userLayerFrom(d[K_USER_RULES] || d[K_LEGACY_RULES]);
      const bag = providerKey ? (user.providers[providerKey] = user.providers[providerKey] || { aliases: {}, scopedAliases: {} }) : user.global;
      if (scope) {
        bag.scopedAliases = bag.scopedAliases || {};
        bag.scopedAliases[scope] = bag.scopedAliases[scope] || {};
        bag.scopedAliases[scope][label] = targetPath;
      } else {
        bag.aliases = bag.aliases || {};
        bag.aliases[label] = targetPath;
      }
      await set({ [K_USER_RULES]: userLayerFrom(user) });
    },
  };
})();

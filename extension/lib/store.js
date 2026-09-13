/* 网申助手 · 本地存储（chrome.storage.local：快照 + 规则库 + 设置） */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});
  const K_SNAP = "wsz_snapshot";
  const K_RULES = "wsz_rules";
  const K_SETTINGS = "wsz_settings";

  const get = (keys) => new Promise((r) => chrome.storage.local.get(keys, r));
  const set = (obj) => new Promise((r) => chrome.storage.local.set(obj, r));

  NS.store = {
    async loadSnapshot() {
      const d = await get(K_SNAP);
      return d[K_SNAP] || NS.emptySnapshot();
    },
    async saveSnapshot(snap) {
      await set({ [K_SNAP]: snap });
    },

    async loadRules() {
      const d = await get(K_RULES);
      if (d[K_RULES]) return d[K_RULES];
      // 首次运行：导入种子规则
      const url = chrome.runtime.getURL("rules/seed.json");
      const seed = await (await fetch(url)).json();
      await set({ [K_RULES]: seed });
      return seed;
    },
    async saveRules(rules) {
      await set({ [K_RULES]: rules });
    },

    async loadSettings() {
      const d = await get(K_SETTINGS);
      return Object.assign({ delayMs: 100, autoAddItems: true }, d[K_SETTINGS] || {});
    },

    // 给某服务商（或全局）追加一条别名规则
    async addAlias(providerKey, scope, label, targetPath) {
      const rules = await this.loadRules();
      const bag = providerKey ? (rules.providers[providerKey] = rules.providers[providerKey] || { aliases: {}, scopedAliases: {} }) : rules.global;
      if (scope) {
        bag.scopedAliases = bag.scopedAliases || {};
        bag.scopedAliases[scope] = bag.scopedAliases[scope] || {};
        bag.scopedAliases[scope][label] = targetPath;
      } else {
        bag.aliases = bag.aliases || {};
        bag.aliases[label] = targetPath;
      }
      await this.saveRules(rules);
    },
  };
})();

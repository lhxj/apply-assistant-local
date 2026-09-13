/* 网申助手 · 匹配器：规则库 x 扫描结果 -> 填写计划 */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});

  function normMap(obj) {
    const m = {};
    for (const [k, v] of Object.entries(obj || {})) m[NS.normalizeLabel(k)] = v;
    return m;
  }

  // 合并：全局 <- 服务商
  NS.mergedRules = function (rules, providerKey) {
    const g = rules.global || {};
    const p = (providerKey && rules.providers[providerKey]) || {};
    const merged = {
      aliases: Object.assign({}, g.aliases, p.aliases),
      sectionAliases: Object.assign({}, g.sectionAliases, p.sectionAliases),
      optionValueAliases: Object.assign({}, g.optionValueAliases, p.optionValueAliases),
      scopedAliases: {},
      dom: p.dom || {},
    };
    const blocks = new Set([...Object.keys(g.scopedAliases || {}), ...Object.keys(p.scopedAliases || {})]);
    for (const b of blocks) {
      merged.scopedAliases[b] = Object.assign({}, (g.scopedAliases || {})[b], (p.scopedAliases || {})[b]);
    }
    merged._n = {
      aliases: normMap(merged.aliases),
      sectionAliases: normMap(merged.sectionAliases),
      optionValueAliases: normMap(merged.optionValueAliases),
      scopedAliases: Object.fromEntries(Object.entries(merged.scopedAliases).map(([b, m]) => [b, normMap(m)])),
    };
    return merged;
  };

  // fields: scanner 产物；返回 {plan, unmatched, noData}
  // plan item: {field, kind, path, value}  value 依 kind 而定
  NS.buildPlan = function (fields, merged, snapshot) {
    const plan = [], unmatched = [], noData = [];
    for (const f of fields) {
      if (!f.label) { unmatched.push({ field: f, reason: "无标签" }); continue; }
      const sectionNorm = NS.normalizeLabel(f.section);
      const block = merged._n.sectionAliases[sectionNorm];
      let path = null, value, kind = f.kind;

      if (block && block !== "_flat") {
        const alias = (merged._n.scopedAliases[block] || {})[f.label];
        if (alias) {
          const arr = snapshot[block] || [];
          const item = arr[f.index];
          if (alias === "range") {
            if (item && (item.start || item.end)) {
              path = `${block}[${f.index}].start~end`;
              value = { start: item.start || "", end: item.end || "" };
              kind = "range";
            }
          } else {
            path = `${block}[${f.index}].${alias}`;
            value = item ? item[alias] : undefined;
          }
        }
      } else {
        const target = merged._n.aliases[f.label];
        if (target) { path = target; value = NS.deepGet(snapshot, target); }
      }

      if (!path) { unmatched.push({ field: f, reason: "无匹配规则" }); continue; }
      if (value == null || value === "" || (typeof value === "object" && !value.start && !value.end)) {
        noData.push({ field: f, path });
        continue;
      }
      plan.push({ field: f, kind, path, value });
    }
    return { plan, unmatched, noData };
  };

  // 快照值 -> 页面选项文字（经过 optionValueAliases）
  NS.toOptionText = function (merged, value) {
    const v = String(value).trim();
    return merged._n.optionValueAliases[NS.normalizeLabel(v)] || v;
  };
})();

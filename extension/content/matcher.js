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

  // 单字段的路径解析（填写计划与规则管理视图共用）
  // 返回 "basicInfo.name" / "work[0].company" / "work[0].start~end" / null
  NS.resolvePath = function (f, merged) {
    if (!f.label) return null;
    const block = merged._n.sectionAliases[NS.normalizeLabel(f.section)];
    if (block && block !== "_flat") {
      const alias = (merged._n.scopedAliases[block] || {})[f.label];
      if (!alias) return null;
      return alias === "range" ? `${block}[${f.index}].start~end` : `${block}[${f.index}].${alias}`;
    }
    return merged._n.aliases[f.label] || null;
  };

  const MANUAL_ONLY_RE = /声明|隐私|提交|同步更新|上传|附件|证件照/;

  function manualReason(f) {
    if (f.kind === "file") return "文件控件仅允许手动上传";
    if (MANUAL_ONLY_RE.test(f.label || "")) return "声明/隐私/提交类字段仅允许手动处理";
    return "控件类型不明确，跳过";
  }

  // fields: scanner 产物；返回 {plan, unmatched, noData, manual}
  // plan item: {field, kind, path, value}  value 依 kind 而定
  NS.buildPlan = function (fields, merged, snapshot) {
    const plan = [], unmatched = [], noData = [], manual = [];
    for (const f of fields) {
      if (f.kind === "file") {
        manual.push({ field: f, reason: manualReason(f) });
        continue;
      }
      if (!f.label) { unmatched.push({ field: f, reason: "无标签" }); continue; }
      if (MANUAL_ONLY_RE.test(f.label) || f.kind === "unknown") {
        manual.push({ field: f, reason: manualReason(f) });
        continue;
      }
      const path = NS.resolvePath(f, merged);
      let value, kind = f.kind;

      if (path) {
        if (path.endsWith(".start~end")) {
          const block = path.slice(0, path.indexOf("["));
          const item = (snapshot[block] || [])[f.index];
          if (item && (item.start || item.end)) {
            value = { start: item.start || "", end: item.end || "" };
            kind = "range";
          }
        } else {
          value = NS.deepGet(snapshot, path);
        }
      }

      if (!path) { unmatched.push({ field: f, reason: "无匹配规则" }); continue; }
      if (value == null || value === "" || (typeof value === "object" && !value.start && !value.end)) {
        noData.push({ field: f, path });
        continue;
      }
      plan.push({ field: f, kind, path, value });
    }
    return { plan, unmatched, noData, manual };
  };

  // 快照值 -> 页面选项文字（经过 optionValueAliases）
  NS.toOptionText = function (merged, value) {
    const v = String(value).trim();
    return merged._n.optionValueAliases[NS.normalizeLabel(v)] || v;
  };
})();

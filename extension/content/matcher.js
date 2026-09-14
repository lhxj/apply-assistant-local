/* 网申助手 · 匹配器：规则库 x 扫描结果 -> 填写计划 */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});

  const BLOCKED_AMBIGUOUS_LABELS = new Set(["籍贯", "户籍", "户籍所在地"]);

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
      salaryAliases: Object.assign({}, g.salaryAliases, p.salaryAliases),
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
      salaryAliases: normMap(merged.salaryAliases),
      providerAliases: normMap(p.aliases),
      providerSalaryAliases: normMap(p.salaryAliases),
      sectionAliases: normMap(merged.sectionAliases),
      optionValueAliases: normMap(merged.optionValueAliases),
      scopedAliases: Object.fromEntries(Object.entries(merged.scopedAliases).map(([b, m]) => [b, normMap(m)])),
    };
    return merged;
  };

  function aliasPath(rule) {
    return rule && typeof rule === "object" ? rule.path : rule;
  }

  function repeaterBlockOf(field, merged) {
    const section = NS.normalizeLabel(field && field.section);
    const sectionAliases = merged && merged._n && merged._n.sectionAliases || {};
    const configured = sectionAliases[section];
    if (configured && configured !== "_flat") return configured;
    const canonical = field && field.sectionKey;
    const scopedAliases = merged && merged._n && merged._n.scopedAliases || {};
    return canonical && Object.prototype.hasOwnProperty.call(scopedAliases, canonical) ? canonical : null;
  }

  function itemIndexOf(field, merged) {
    const repeater = field && field.repeater;
    if (repeater && Object.prototype.hasOwnProperty.call(repeater, "itemIndex")) {
      return Number.isInteger(repeater.itemIndex) && repeater.itemIndex >= 0 ? repeater.itemIndex : null;
    }
    // A known repeater must have a provider-confirmed item index. The legacy
    // `field.index` means label occurrence, not repeater identity.
    if (repeaterBlockOf(field, merged)) return null;
    if (Number.isInteger(field && field.itemIndex) && field.itemIndex >= 0) return field.itemIndex;
    return Number.isInteger(field && field.index) && field.index >= 0 ? field.index : 0;
  }

  // Salary aliases retain unit metadata in seed.json. For learned legacy
  // aliases, the label itself remains a conservative fallback guard.
  NS.resolveSalaryRule = function (f, merged) {
    const label = NS.normalizeLabel(f.label);
    const section = NS.normalizeLabel(f.section);
    const block = merged._n.sectionAliases[section];
    if (block && block !== "_flat") return null;
    if (section && !block) return (merged._n.providerSalaryAliases || {})[label] || null;
    return (merged._n.salaryAliases || {})[label] || null;
  };

  // 单字段的路径解析（填写计划与规则管理视图共用）
  // 返回 "basicInfo.name" / "work[0].company" / "work[0].start~end" / null
  NS.resolvePath = function (f, merged) {
    if (!f.label) return null;
    const label = NS.normalizeLabel(f.label);
    if (BLOCKED_AMBIGUOUS_LABELS.has(label)) return null;
    const section = NS.normalizeLabel(f.section);
    const block = merged._n.sectionAliases[NS.normalizeLabel(f.section)];
    const canonical = (path) => NS.canonicalPath ? NS.canonicalPath(path) : path;
    if (block && block !== "_flat") {
      const alias = (merged._n.scopedAliases[block] || {})[label];
      if (!alias) return null;
      const index = itemIndexOf(f, merged);
      if (index == null) return null;
      return alias === "range" ? `${block}[${index}].start~end` : canonical(`${block}[${index}].${alias}`);
    }
    if (section && !block) {
      const providerSalary = NS.resolveSalaryRule(f, merged);
      if (providerSalary) return canonical(aliasPath(providerSalary));
      return canonical(merged._n.providerAliases[label] || null);
    }
    const salary = NS.resolveSalaryRule(f, merged);
    if (salary) return canonical(aliasPath(salary));
    return canonical(merged._n.aliases[label] || null);
  };

  function salaryRoot(path) {
    if (path === "intent.expectedSalary.amount") return "expectedSalary";
    if (path === "intent.currentSalary.amount") return "currentSalary";
    return null;
  }

  function labelSalaryPeriod(label) {
    const value = String(label || "").replace(/[\s 　]/g, "");
    if (/月薪|月工资|月收入|每月|月度|\/月|月/.test(value)) return "month";
    if (/年薪|年工资|年收入|每年|年度|\/年|年/.test(value)) return "year";
    return null;
  }

  function salaryPathAllowed(field, path, snapshot, merged) {
    const root = salaryRoot(path);
    if (!root) return true;
    const rule = NS.resolveSalaryRule(field, merged);
    const required = rule && (rule.period === "month" || rule.period === "year")
      ? rule.period
      : labelSalaryPeriod(field.rawLabel || field.label);
    if (!required) return true;
    const actual = snapshot && snapshot.intent && snapshot.intent[root]
      ? snapshot.intent[root].period
      : null;
    return actual === required;
  }

  const MANUAL_ONLY_RE = /声明|隐私|提交|同步更新|上传|附件|证件照/;

  function manualReason(f) {
    if (f.manualReason) return f.manualReason;
    if (f.kind === "file") return "文件控件仅允许手动上传";
    if (MANUAL_ONLY_RE.test(f.label || "")) return "声明/隐私/提交类字段仅允许手动处理";
    return "控件类型不明确，跳过";
  }

  // fields: scanner 产物；返回 {plan, unmatched, noData, manual}
  // plan item: {field, kind, path, value}  value 依 kind 而定
  NS.buildPlan = function (fields, merged, snapshot) {
    const plan = [], unmatched = [], noData = [], manual = [];
    for (const f of fields) {
      if (f.manualOnly === true) {
        manual.push({ field: f, reason: manualReason(f) });
        continue;
      }
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
      if (path && !salaryPathAllowed(f, path, snapshot, merged)) {
        unmatched.push({ field: f, path, reason: "薪资周期未明确或与页面单位不一致，跳过" });
        continue;
      }
      let value, kind = f.kind;

      if (path) {
        if (path.endsWith(".start~end")) {
          const block = path.slice(0, path.indexOf("["));
          const item = (snapshot[block] || [])[itemIndexOf(f, merged)];
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

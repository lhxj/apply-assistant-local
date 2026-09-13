/* 网申助手 · 主流程编排 */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});
  if (window.__WSZ_MAIN_LOADED__) return;
  window.__WSZ_MAIN_LOADED__ = true;

  let rules, merged, provider, snapshot, settings;

  async function refresh() {
    rules = await NS.store.loadRules();
    provider = NS.detectProvider(rules);
    merged = NS.mergedRules(rules, provider.key);
    snapshot = await NS.store.loadSnapshot();
    settings = await NS.store.loadSettings();
    NS.panel.setProvider(provider.name);
  }

  function scanFields() {
    const fields = NS.scanFields(merged.dom);
    return NS.adapterRegistry
      ? NS.adapterRegistry.normalizeFields(fields, {
          providerKey: provider.key || "generic",
          provider,
          rules,
          mergedRules: merged,
          document,
        })
      : fields;
  }

  async function doFill() {
    await refresh();
    NS.panel.resetCancel();
    NS.panel.setFilling(true);
    NS.panel.status("扫描表单…");
    try {
      const fields = scanFields();

      const { plan, unmatched, noData, manual } = NS.buildPlan(fields, merged, snapshot);
      NS.panel.status(`识别 ${fields.length} 格 · 计划填写 ${plan.length} 格`);
      const results = await NS.executePlan(plan, merged, {
        delayMs: settings.delayMs,
        adapterRegistry: NS.adapterRegistry,
        providerKey: provider.key || "generic",
        shouldCancel: NS.panel.shouldCancel,
        onProgress: (i, total) => NS.panel.progress(i + 1, total),
      });
      NS.panel.report({
        filled: results.filled, skipped: results.skipped, failed: results.failed,
        unmatched, noData, manual, onLearn: learnRule,
      });
      NS.panel.status(results.cancelled ? "已取消（已填入的内容不会回退，可用「清空表单」）" : "完成");
    } finally {
      NS.panel.setFilling(false);
    }
  }

  async function doCapture() {
    await refresh();
    NS.panel.status("抓取页面内容…");
    const fields = scanFields();
    const { updated, candidates } = await NS.captureSnapshot(fields, merged, snapshot);
    await NS.store.saveSnapshot(snapshot);
    NS.panel.report({
      filled: 0, skipped: 0, failed: [], noData: [],
      unmatched: candidates.map((c) => ({ field: { label: c.label, section: c.section }, reason: "快照候选" })),
      manual: [],
      onLearn: learnRule,
    });
    NS.panel.status(`已写回快照 ${updated} 项 · ${candidates.length} 项可学规则`);
  }

  // 规则管理：列出每个格子的当前映射，点击可改
  async function doRules() {
    await refresh();
    const fields = scanFields();
    const entries = fields.map((f) => ({ field: f, path: NS.resolvePath(f, merged) }));
    NS.panel.showRules(entries, provider.name, async (field, path) => {
      await learnRule(field, path);
      doRules(); // 学完重绘
    });
    NS.panel.status(`本页共 ${fields.length} 格 · 规则归属：${provider.name}${provider.key ? "" : "（通用）"}`);
  }

  // 清空表单
  async function doClear() {
    if (!confirm("确定清空本页表单的全部已填内容？（包括你手动填的，此操作不可撤销）")) return;
    await refresh();
    NS.panel.resetCancel();
    const fields = scanFields();
    NS.panel.status("清空中…");
    const results = await NS.clearForm(fields, {
      delayMs: 60,
      shouldCancel: NS.panel.shouldCancel,
      onProgress: (i, total) => NS.panel.progress(i + 1, total),
    });
    NS.panel.clearReport(results);
    NS.panel.status(results.cancelled ? "已取消" : "清空完成");
  }

  // 学规则：选定快照路径后，给当前服务商追加别名
  async function learnRule(field, targetPath) {
    const learningTarget = NS.adapterRegistry && NS.adapterRegistry.learningTarget
      ? NS.adapterRegistry.learningTarget(field, targetPath, { mergedRules: merged })
      : { kind: "flat", path: targetPath };
    if (!learningTarget) return;
    if (learningTarget.kind === "repeater") {
      await NS.store.addAlias(provider.key, learningTarget.sectionKey, field.label, learningTarget.fieldPath);
    } else if (learningTarget.kind === "flat") {
      await NS.store.addAlias(provider.key, null, field.label, learningTarget.path);
    } else {
      // Section-scoped persistence is reserved for the platform Adapter round;
      // never flatten a repeater target into a provider/global alias here.
      NS.panel.status(`需 section-scoped 规则：${learningTarget.sectionLabel || field.section}，本轮不写入扁平 alias`);
      return;
    }
    await refresh();
    NS.panel.status(`已学习（${provider.name}）：${field.label} → ${targetPath}`);
  }

  function openEditor() {
    window.open(chrome.runtime.getURL("editor/editor.html"), "_blank");
  }

  async function boot() {
    // 激活门槛：识别到服务商，或页面像网申表单
    const probeRules = await NS.store.loadRules();
    provider = NS.detectProvider(probeRules);
    if (!provider.key && !NS.looksLikeApplicationForm()) return;
    await refresh();
    NS.panel.mount(provider, { fill: doFill, capture: doCapture, rules: doRules, clear: doClear, openEditor });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 800));
  } else {
    setTimeout(boot, 800);
  }
})();

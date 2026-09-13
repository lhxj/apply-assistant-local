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

  async function doFill() {
    await refresh();
    NS.panel.resetCancel();
    NS.panel.status("扫描表单…");
    let fields = NS.scanFields(merged.dom);

    // 自动补条目（点「添加」）
    if (settings.autoAddItems) {
      const added = await NS.ensureItemCount(fields, snapshot, merged, merged.dom);
      if (added) { await NS.sleep(500); fields = NS.scanFields(merged.dom); }
    }

    const { plan, unmatched, noData } = NS.buildPlan(fields, merged, snapshot);
    NS.panel.status(`识别 ${fields.length} 格 · 计划填写 ${plan.length} 格`);
    const results = await NS.executePlan(plan, merged, {
      delayMs: settings.delayMs,
      shouldCancel: NS.panel.shouldCancel,
      onProgress: (i, total) => NS.panel.progress(i + 1, total),
    });
    NS.panel.report({
      filled: results.filled, skipped: results.skipped, failed: results.failed,
      unmatched, noData, onLearn: learnRule,
    });
    NS.panel.status(results.cancelled ? "已取消" : "完成");
  }

  async function doCapture() {
    await refresh();
    NS.panel.status("抓取页面内容…");
    const fields = NS.scanFields(merged.dom);
    const { updated, candidates } = await NS.captureSnapshot(fields, merged, snapshot);
    await NS.store.saveSnapshot(snapshot);
    NS.panel.report({
      filled: 0, skipped: 0, failed: [], noData: [],
      unmatched: candidates.map((c) => ({ field: { label: c.label, section: c.section }, reason: "快照候选" })),
      onLearn: learnRule,
    });
    NS.panel.status(`已写回快照 ${updated} 项 · ${candidates.length} 项可学规则`);
  }

  // 学规则：选定快照路径后，给当前服务商追加别名
  async function learnRule(field, targetPath) {
    const block = merged._n.sectionAliases[NS.normalizeLabel(field.section)];
    if (block && block !== "_flat" && targetPath.startsWith(block + "[")) {
      const key = targetPath.slice(targetPath.indexOf("].") + 2);
      await NS.store.addAlias(provider.key, block, field.label, key);
    } else {
      await NS.store.addAlias(provider.key, null, field.label, targetPath);
    }
    await refresh();
    NS.panel.status(`已学习：${field.label} → ${targetPath}`);
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
    NS.panel.mount(provider, { fill: doFill, capture: doCapture, openEditor });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 800));
  } else {
    setTimeout(boot, 800);
  }
})();

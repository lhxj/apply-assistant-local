/* 网申助手 · 学习：页面 -> 快照（更新快照）与规则学习辅助 */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});

  function selectShownText(el) {
    const wrap = el.closest('[class*="Select-"], [class*="Dropdown"]') || el.parentElement;
    const dv = wrap.querySelector('[class*="display-value"], [class*="selection"], [class*="single-value"]');
    let t = ((dv && dv.textContent) || "").replace(/\s+/g, "").trim();
    if (!t && el.tagName === "SELECT") t = el.options[el.selectedIndex] ? el.options[el.selectedIndex].textContent.trim() : "";
    if (/^(请选择|请填写|选择)?$/.test(t)) t = (el.value || "").trim();
    return t.replace(/^请选择/, "");
  }

  function ymOf(el) {
    const t = selectShownText(el);
    const m = t.match(/(\d{4})/);
    if (m) return { y: m[1] };
    const n = t.match(/(\d{1,2})/);
    return n ? { n: n[1] } : null;
  }

  // 从页面读取一个字段的值，返回可写入快照的值
  function captureValue(f) {
    if (f.kind === "select") return selectShownText(f.selectControls[0]);
    if (f.kind === "text" || f.kind === "textarea") return (f.textControls[0] || f.controls[0]).value.trim();
    if (f.kind === "date") {
      const a = f.selectControls.map(ymOf);
      const y = a.find((x) => x && x.y), m = a.find((x) => x && x.n && !x.y);
      if (y && m) return `${y.y}.${String(m.n).padStart(2, "0")}`;
      if (y) return y.y;
      return "";
    }
    if (f.kind === "range") {
      const a = f.selectControls.map(ymOf);
      const parts = [];
      for (const x of a) parts.push(x ? (x.y || x.n) : "");
      const start = parts[0] ? (parts[1] ? `${parts[0]}.${String(parts[1]).padStart(2, "0")}` : parts[0]) : "";
      let end = "";
      if (f.checkbox && f.checkbox.checked) end = "至今";
      else if (parts[2]) end = parts[3] ? `${parts[2]}.${String(parts[3]).padStart(2, "0")}` : parts[2];
      return { start, end };
    }
    if (f.kind === "checkbox") return f.checkbox.checked;
    if (f.kind === "radio") return NS.readFieldValue(f);
    if (f.kind === "file" || f.kind === "unknown") return "";
    return "";
  }

  // 整页抓回：识别到路径的写回快照；未识别但有值的进候选
  NS.captureSnapshot = async function (fields, merged, snapshot) {
    let updated = 0;
    const candidates = [];
    for (const f of fields) {
      if (!f.label) continue;
      if (f.kind === "file" || /声明|隐私|提交|同步更新|上传|附件|证件照/.test(f.label)) continue;
      const block = merged._n.sectionAliases[NS.normalizeLabel(f.section)];
      const value = captureValue(f);
      const empty = value == null || value === "" || (typeof value === "object" && !value.start && !value.end);
      if (empty) continue;
      let path = null;
      if (block && block !== "_flat") {
        const alias = (merged._n.scopedAliases[block] || {})[f.label];
        if (alias) {
          if (alias === "range") {
            snapshot[block] = snapshot[block] || [];
            snapshot[block][f.index] = snapshot[block][f.index] || {};
            if (typeof value === "object") {
              snapshot[block][f.index].start = value.start || "";
              snapshot[block][f.index].end = value.end || "";
              updated++;
            }
            continue;
          }
          path = `${block}[${f.index}].${alias}`;
        }
      } else {
        path = merged._n.aliases[f.label] || null;
      }
      if (path) {
        NS.deepSet(snapshot, path, value);
        updated++;
      } else {
        candidates.push({ label: f.label, section: f.section, value });
      }
    }
    return { updated, candidates };
  };

  // 条目补齐：点击「添加」直到页面组数 >= 快照条数；返回是否有点击
  NS.ensureItemCount = async function (fields, snapshot, merged, domCfg) {
    const addText = (domCfg && domCfg.addButtonText) || "添加";
    const groupsOnPage = {}; // block -> maxIndex+1
    for (const f of fields) {
      const block = merged._n.sectionAliases[NS.normalizeLabel(f.section)];
      if (!block || block === "_flat") continue;
      groupsOnPage[block] = Math.max(groupsOnPage[block] || 0, f.index + 1);
    }
    let clicked = false;
    for (const [block, have] of Object.entries(groupsOnPage)) {
      const need = (snapshot[block] || []).length;
      if (need <= have) continue;
      // 找该区块的「添加」按钮：区块标题所在块内、文字匹配的可见元素
      const sectionNames = Object.keys(merged.sectionAliases).filter((k) => merged.sectionAliases[k] === block);
      let btn = null;
      for (const el of document.querySelectorAll("button, a, div, span")) {
        if (!NS.isVisible(el)) continue;
        const t = (el.textContent || "").replace(/\s+/g, "");
        if (t !== addText && t !== "+" + addText) continue;
        // 按钮需与某区块标题同处一个祖先块
        let p = el.parentElement, ok = false;
        for (let i = 0; i < 8 && p; i++, p = p.parentElement) {
          const title = p.querySelector((domCfg && domCfg.blockTitle) || '[class*="block-title-"]');
          if (title && sectionNames.some((n) => NS.normalizeLabel(title.textContent) === NS.normalizeLabel(n))) { ok = true; break; }
        }
        if (ok) { btn = el; break; }
      }
      if (!btn) continue;
      for (let i = 0; i < need - have; i++) {
        btn.click();
        clicked = true;
        await NS.sleep(400);
      }
    }
    return clicked;
  };
})();

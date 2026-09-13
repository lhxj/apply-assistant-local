/* 网申助手 · 扫描器：页面控件 -> (区块, 条目序号, 标签) 三元组 */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});

  const CONTROL_SEL = "input:not([type=hidden]):not([type=file]):not([type=submit]):not([type=button]), textarea, select";

  // 字段容器：含控件、且不再嵌套字段容器的最小块
  function findFieldContainers() {
    const cands = [...document.querySelectorAll('div[class*="apply-field-"], div[class*="field-"], div[class*="form-item"], div[class*="FormItem"], li[class*="field-"]')];
    const out = [];
    for (const c of cands) {
      const cls = typeof c.className === "string" ? c.className : "";
      if (/fields-|form-items/i.test(cls)) continue; // 列表包装层
      if (!c.querySelector(CONTROL_SEL)) continue;
      if (c.querySelector('div[class*="apply-field-"] ' + CONTROL_SEL + ", " + 'div[class*="field-"] ' + CONTROL_SEL)) {
        // 内部还有更小的字段容器且含控件 -> 让更小的来
        const inner = c.querySelectorAll('div[class*="apply-field-"], div[class*="field-"]');
        let hasInnerField = false;
        for (const ic of inner) {
          if (ic !== c && ic.querySelector(CONTROL_SEL)) { hasInnerField = true; break; }
        }
        if (hasInnerField) continue;
      }
      out.push(c);
    }
    return out;
  }

  // 区块标题文字：剔除标题里嵌的「添加」按钮等可点元素
  function titleText(t) {
    const clone = t.cloneNode(true);
    clone.querySelectorAll('button, a, [class*="add"], [class*="Add"], [class*="btn"], [class*="Btn"], svg').forEach((n) => n.remove());
    return NS.normalizeLabel(clone.textContent);
  }

  // 区块：最近的"区块容器"内的区块标题
  function sectionOf(container, domCfg) {
    const titleSel = (domCfg && domCfg.blockTitle) || '[class*="block-title-"], [class*="blockTitle-"], [class*="section-title"], [class*="SectionTitle"], legend, h3, h4';
    // 优先：最近的区块容器（Moka: apply-block- / basic-block-）
    const block = container.closest('[class*="apply-block-"], [class*="basic-block-"], section[class*="block"], div[class*="Block-"]');
    if (block) {
      const t = block.querySelector(titleSel);
      if (t) {
        const txt = titleText(t);
        if (txt && txt.length <= 12) return txt;
      }
    }
    // 兜底：向上找最近的标题元素（取该层文档顺序最后一个，离容器最近）
    let p = container.parentElement;
    for (let i = 0; i < 10 && p; i++, p = p.parentElement) {
      const ts = [...p.querySelectorAll(titleSel)].filter((t) => !container.contains(t) && NS.isVisible(t));
      if (ts.length) {
        const txt = titleText(ts[ts.length - 1]);
        if (txt && txt.length <= 12) return txt;
      }
    }
    return "";
  }

  function labelOf(container, domCfg) {
    const titleSel = (domCfg && domCfg.fieldTitle) || '[class*="filed-title-"], [class*="title-"], [class*="field-title"], [class*="label"], label';
    const t = container.querySelector(titleSel);
    let raw = t && t.textContent ? t.textContent : "";
    let label = NS.normalizeLabel(raw);
    if (label && label.length <= 20) return label;
    // 退化：用第一个控件的 placeholder
    const el = container.querySelector(CONTROL_SEL);
    if (el && el.placeholder) {
      label = NS.normalizeLabel(el.placeholder);
      if (label && !["请选择", "内容", "请填写"].includes(label) && label.length <= 20) return label;
    }
    return "";
  }

  function isSelectControl(el) {
    if (el.tagName === "SELECT") return true;
    if (el.closest('[class*="Select-"], [class*="select-container"], [class*="Dropdown"]')) return true;
    return el.getAttribute("role") === "combobox";
  }

  // 单字段扫描 -> {container, label, section, index, kind, controls}
  NS.scanFields = function (domCfg) {
    const containers = findFieldContainers();
    const fields = [];
    const seenBySectionLabel = {}; // section|label -> count（条目序号）
    for (const c of containers) {
      if (!NS.isVisible(c)) continue;
      const controls = [...c.querySelectorAll(CONTROL_SEL)].filter((el) => {
        if (!NS.isVisible(el)) return false;
        if (el.type === "file") return false;
        return true;
      });
      if (!controls.length) continue;
      const label = labelOf(c, domCfg);
      const section = sectionOf(c, domCfg);
      const key = section + "|" + label;
      const index = seenBySectionLabel[key] || 0;
      seenBySectionLabel[key] = index + 1;

      const inputs = controls.filter((el) => el.tagName !== "SELECT" || true);
      const textControls = controls.filter((el) => !isSelectControl(el) && el.type !== "checkbox" && el.type !== "radio");
      const selectControls = controls.filter((el) => isSelectControl(el));
      const checkbox = controls.find((el) => el.type === "checkbox");

      let kind = "text";
      if (selectControls.length >= 4) kind = "range";       // 年月 x 起止
      else if (selectControls.length >= 2) kind = "date";   // 年月
      else if (selectControls.length === 1 && textControls.length === 0) kind = "select";
      // 混合容器（如下拉+真实文本框，例：证件类型+证件号码）按文本处理，只填文本框
      else if (textControls.length > 0) kind = controls[0].tagName === "TEXTAREA" ? "textarea" : "text";
      else if (checkbox && controls.length === 1) kind = "checkbox";

      fields.push({ container: c, label, section, index, kind, controls, selectControls, textControls, checkbox });
    }
    return fields;
  };

  // 读取字段当前显示值（尽力而为，下拉取显示值）
  NS.readFieldValue = function (f) {
    if (f.kind === "select") {
      const el = f.selectControls[0];
      const wrap = el.closest('[class*="Select-"], [class*="Dropdown"]') || el.parentElement;
      const shown = wrap.querySelector('[class*="display-value"], [class*="selection"], [class*="single-value"]');
      let txt = (shown && shown.textContent) || "";
      if (!txt && el.tagName === "SELECT") txt = el.options[el.selectedIndex] ? el.options[el.selectedIndex].textContent : "";
      txt = txt.trim();
      return /^(请选择|请填写|选择)$/.test(txt) ? "" : txt;
    }
    if (f.kind === "text" || f.kind === "textarea") {
      return (f.textControls[0] && f.textControls[0].value || "").trim();
    }
    if (f.kind === "date" || f.kind === "range") {
      const vals = f.selectControls.map((el) => {
        const wrap = el.closest('[class*="Select-"], [class*="Dropdown"]') || el.parentElement;
        const shown = wrap.querySelector('[class*="display-value"], [class*="selection"]');
        return ((shown && shown.textContent) || "").replace(/\s+/g, "");
      });
      return vals.filter(Boolean).join(" ");
    }
    if (f.kind === "checkbox") return f.checkbox.checked;
    return "";
  };

  NS.hasValue = function (f) {
    const v = NS.readFieldValue(f);
    if (typeof v === "boolean") return v;
    return String(v).length > 0 && !/^(请选择|请填写|选择|\/|--)$/.test(String(v));
  };
})();

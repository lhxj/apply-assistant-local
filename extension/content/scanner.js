/* 网申助手 · 扫描器：页面控件 -> (区块, 条目序号, 标签) 三元组 */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});

  const CONTROL_SEL = "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]), textarea, select";
  const FIELD_CONTAINER_SEL = 'div[class*="apply-field-"], div[class*="field-"], div[class*="form-item"], div[class*="FormItem"], div[class*="Recruitment_extPerfect"], li[class*="field-"]';

  // 字段容器：含控件、且不再嵌套字段容器的最小块
  function findFieldContainers() {
    const cands = [...document.querySelectorAll(FIELD_CONTAINER_SEL)];
    const out = [];
    for (const c of cands) {
      const cls = typeof c.className === "string" ? c.className : "";
      if (/fields-|form-items/i.test(cls)) continue; // 列表包装层
      if (!c.querySelector(CONTROL_SEL)) continue;
      if (c.querySelector('div[class*="apply-field-"] ' + CONTROL_SEL + ", " + 'div[class*="field-"] ' + CONTROL_SEL + ", " + 'div[class*="Recruitment_extPerfect"] ' + CONTROL_SEL)) {
        // 内部还有更小的字段容器且含控件 -> 让更小的来
        const inner = c.querySelectorAll('div[class*="apply-field-"], div[class*="field-"], div[class*="Recruitment_extPerfect"]');
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
    // 北森部分页面的字段标题没有稳定 class：退化到第一个可见、无控件的短文本节点。
    const textNodes = [...container.querySelectorAll("*")]
      .filter((n) => NS.isVisible(n) && !n.querySelector(CONTROL_SEL))
      .map((n) => ({ n, text: NS.normalizeLabel(n.textContent || "") }))
      .filter(({ text }) => text && text.length <= 20 && !["请选择", "上传文件", "至今"].includes(text));
    if (textNodes.length) return textNodes[0].text;
    return "";
  }

  // Adapter Contract 的兼容入口；不改变现有 scanFields 行为。
  NS.getGenericFieldContainers = findFieldContainers;

  // 保留未归一化标题给少数需要读取单位语义的安全门禁（例如“薪资（元/月）”）。
  // 普通匹配仍使用 label，避免括号注释影响现有 alias。
  function rawLabelOf(container, domCfg) {
    const titleSel = (domCfg && domCfg.fieldTitle) || '[class*="filed-title-"], [class*="title-"], [class*="field-title"], [class*="label"], label';
    const t = container.querySelector(titleSel);
    const raw = t && t.textContent ? t.textContent.trim() : "";
    if (raw && NS.normalizeLabel(raw).length <= 20) return raw;
    const el = container.querySelector(CONTROL_SEL);
    if (el && el.placeholder) {
      const placeholder = String(el.placeholder).trim();
      if (placeholder && !["请选择", "内容", "请填写"].includes(NS.normalizeLabel(placeholder)) && NS.normalizeLabel(placeholder).length <= 20) return placeholder;
    }
    const textNodes = [...container.querySelectorAll("*")]
      .filter((n) => NS.isVisible(n) && !n.querySelector(CONTROL_SEL))
      .map((n) => ({ raw: (n.textContent || "").trim(), text: NS.normalizeLabel(n.textContent || "") }))
      .filter(({ text }) => text && text.length <= 20 && !["请选择", "上传文件", "至今"].includes(text));
    return textNodes.length ? textNodes[0].raw : "";
  }

  function isSelectControl(el) {
    if (el.tagName === "SELECT") return true;
    if (el.closest('[class*="Select-"], [class*="select-container"], [class*="Dropdown"]')) return true;
    return el.getAttribute("role") === "combobox";
  }

  function radioOptionText(el) {
    const direct = el.getAttribute("aria-label") || el.getAttribute("data-label") || el.getAttribute("title");
    if (direct) return NS.normalizeLabel(direct);
    const label = el.closest("label");
    if (label) return NS.normalizeLabel(label.textContent || "");
    const parent = el.parentElement;
    return parent ? NS.normalizeLabel(parent.textContent || "") : "";
  }

  function shownText(el) {
    const wrap = el.closest('[class*="Select-"], [class*="Dropdown"], [role="combobox"]') || el.parentElement;
    const shown = wrap && wrap.querySelector('[class*="display-value"], [class*="selection"], [class*="single-value"], [class*="selected"], [role="combobox"]');
    let txt = (shown && (shown.textContent || shown.value)) || "";
    if (!txt && el.tagName === "SELECT") txt = el.options && el.options[el.selectedIndex] ? el.options[el.selectedIndex].textContent : "";
    if (!txt && el.value) txt = el.value;
    return NS.normalizeLabel(txt);
  }

  function isDateSemantic(text) {
    return /日期|年月|时间|入学|毕业|就读|出生|获奖|开始|结束/.test(text);
  }

  function isRangeSemantic(text) {
    return /起止|就读|在校|工作时间|实习时间|项目时间|开始.*结束|结束.*开始|至今/.test(text);
  }

  NS.radioOptionText = radioOptionText;

  // 单字段扫描 -> {container, label, section, index, kind, controls}
  NS.scanFields = function (domCfg) {
    const containers = findFieldContainers();
    const fields = [];
    const seenBySectionLabel = {}; // section|label -> count（条目序号）
    for (const c of containers) {
      if (!NS.isVisible(c)) continue;
      const controls = [...c.querySelectorAll(CONTROL_SEL)].filter((el) => {
        if (!NS.isVisible(el)) {
          // 许多自绘 radio/file 会把真实 input 隐藏在可见 label/上传容器内，仍需识别。
          if (el.type !== "radio" && el.type !== "file") return false;
          const host = el.closest("label") || el.parentElement;
          if (!host || !NS.isVisible(host)) return false;
        }
        return true;
      });
      if (!controls.length) continue;
      const label = labelOf(c, domCfg);
      const rawLabel = rawLabelOf(c, domCfg);
      const section = sectionOf(c, domCfg);
      const key = section + "|" + label;
      const index = seenBySectionLabel[key] || 0;
      seenBySectionLabel[key] = index + 1;

      const textControls = controls.filter((el) => !isSelectControl(el) && el.type !== "checkbox" && el.type !== "radio");
      const selectControls = controls.filter((el) => isSelectControl(el));
      const checkbox = controls.find((el) => el.type === "checkbox");
      const radioControls = controls.filter((el) => el.type === "radio");
      const fileControls = controls.filter((el) => el.type === "file");
      const semantic = NS.normalizeLabel(`${section} ${label} ${c.textContent || ""}`);

      // 默认 unknown。只有语义和控件形态都足够明确时才给出可写类型。
      let kind = "unknown";
      if (fileControls.length) kind = "file";
      else if (radioControls.length) kind = "radio";
      else if (checkbox && controls.length === 1) kind = "checkbox";
      else if (selectControls.length && isDateSemantic(semantic) && isRangeSemantic(semantic)) kind = "range";
      else if (selectControls.length && isDateSemantic(semantic)) kind = "date";
      else if (selectControls.length === 1 && textControls.length === 0) kind = "select";
      // 混合容器（如下拉+真实文本框）不强行猜测，只在存在明确文本框时处理文本。
      else if (textControls.length > 0) kind = textControls.some((el) => el.tagName === "TEXTAREA") ? "textarea" : "text";

      fields.push({ container: c, label, rawLabel, section, index, kind, controls, selectControls, textControls, checkbox, radioControls, fileControls });
    }
    return fields;
  };

  // 读取字段当前显示值（尽力而为，下拉取显示值）
  NS.readFieldValue = function (f) {
    if (f.kind === "select") {
      const el = f.selectControls[0];
      const txt = shownText(el);
      return /^(请选择|请填写|选择)$/.test(txt) ? "" : txt;
    }
    if (f.kind === "text" || f.kind === "textarea") {
      return (f.textControls[0] && f.textControls[0].value || "").trim();
    }
    if (f.kind === "date" || f.kind === "range") {
      const vals = f.selectControls.map(shownText);
      if (!vals.length) return (f.textControls[0] && f.textControls[0].value || "").trim();
      if (f.kind === "range" && f.checkbox && f.checkbox.checked) vals.push("至今");
      return vals.filter(Boolean).join(" ");
    }
    if (f.kind === "checkbox") return f.checkbox.checked;
    if (f.kind === "radio") {
      const checked = f.radioControls.find((el) => el.checked);
      return checked ? radioOptionText(checked) : "";
    }
    if (f.kind === "file") return f.fileControls.some((el) => el.files && el.files.length > 0);
    return "";
  };

  NS.hasValue = function (f) {
    const v = NS.readFieldValue(f);
    if (typeof v === "boolean") return v;
    return String(v).length > 0 && !/^(请选择|请填写|选择|\/|--)$/.test(String(v));
  };
})();

/* 网申助手 · Moka Adapter
 *
 * 只使用真实 Moka 网申页面（app.mokahr.com 投递页 / 简历页）确认过的结构：
 * - 字段容器：div[class*="apply-field-"]（简历页基础信息为 div[class*="field-"]）
 * - 字段标签：容器内 [class*="title-"] / [class*="filed-title-"]
 * - 区块容器：[class*="apply-block-"] / [class*="basic-block-"]，
 *   区块标题：[class*="block-title-"] / [class*="blockTitle-"]（剔除内嵌「添加」按钮文字）
 * - 重复条目：同一 apply-block 下的 apply-fields 容器即 repeater item，
 *   itemIndex 由 itemElement 在区块内 DOM 顺序决定（禁止"同名字段第 N 次出现"）
 * - 控件语义类（apply-field 上的稳定前缀）：
 *   string_info 文本 | text_info 多行 | Select-/select_info 自绘下拉
 *   date_info 年月（2 下拉）或起止年月（4 下拉 + 至今 checkbox）
 *   day_info 日历选择 | location_info/cascader 级联 | file_upload 文件 | confirm_info 声明
 * - 自绘下拉选项就地渲染在本控件容器内：[class*="option-label-"]
 * 哈希后缀（如 title-IWWQ0Xa4L7）不作为长期 identity。
 * 填对 > 少填 > 多填：不确定的控件（日历/级联）不写入，只读。
 */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});
  NS.adapterDefinitions = NS.adapterDefinitions || {};

  const APPLY_FIELD_SEL = 'div[class*="apply-field-"]';
  const BASIC_FIELD_SEL = 'div[class*="field-"]';
  const TITLE_SEL = '[class*="title-"], [class*="filed-title-"]';
  const BLOCK_SEL = '[class*="apply-block-"], [class*="basic-block-"]';
  const BLOCK_TITLE_SEL = '[class*="block-title-"], [class*="blockTitle-"]';
  const FIELDS_WRAPPER_SEL = '[class*="apply-fields-"]';
  const SELECT_COMPONENT_SEL = '[class*="sd-Select-container"]';
  const DROPDOWN_SEL = '[class*="sd-Dropdown-container"]';
  const OPTION_SEL = '[class*="option-label-"]';
  const DISPLAY_VALUE_SEL = '[class*="display-value"]';

  const SECTION_DEFS = [
    { label: "申请信息", key: "_flat", repeatable: false },
    { label: "校招站点", key: "_flat", repeatable: false },
    { label: "上传", key: "_flat", repeatable: false },
    { label: "基础信息", key: "_flat", repeatable: false },
    { label: "个人信息", key: "_flat", repeatable: false },
    { label: "求职意向", key: "_flat", repeatable: false },
    { label: "其他信息", key: "_flat", repeatable: false },
    { label: "自我描述", key: "_flat", repeatable: false },
    { label: "声明", key: "_flat", repeatable: false },
    { label: "更新说明", key: "_flat", repeatable: false },
    { label: "工作经历", key: "work", repeatable: true },
    { label: "实习经历", key: "internship", repeatable: true },
    { label: "项目经验", key: "project", repeatable: true },
    { label: "项目经历", key: "project", repeatable: true },
    { label: "教育背景", key: "education", repeatable: true },
    { label: "教育经历", key: "education", repeatable: true },
    { label: "语言能力", key: "language", repeatable: true },
    { label: "获奖经历", key: "award", repeatable: true },
  ];
  const SECTION_BY_LABEL = Object.fromEntries(SECTION_DEFS.map((s) => [s.label, s]));

  function docOf(context) {
    if (context && context.document) return context.document;
    return typeof document !== "undefined" ? document : null;
  }

  function locationOf(context) {
    if (context && context.location) return context.location;
    return typeof location !== "undefined" ? location : {};
  }

  function qsa(root, selector) {
    if (!root || typeof root.querySelectorAll !== "function") return [];
    try { return Array.from(root.querySelectorAll(selector)); } catch (e) { return []; }
  }

  function first(root, selector) { return qsa(root, selector)[0] || null; }

  function normalize(value) {
    return NS.normalizeLabel ? NS.normalizeLabel(value) : String(value || "").replace(/[\s*＊:：]/g, "");
  }

  function classText(element) {
    return element && typeof element.className === "string" ? element.className : "";
  }

  function isVisible(element) {
    if (!element) return false;
    try {
      if (typeof NS.isVisible === "function" && NS.isVisible(element)) return true;
    } catch (e) { /* fall through */ }
    if (element.hidden) return false;
    const style = element.style || {};
    if (style.display === "none" || style.visibility === "hidden") return false;
    return true;
  }

  function contains(parent, child) {
    return Boolean(parent && child && typeof parent.contains === "function" && parent.contains(child));
  }

  function closest(element, selector) {
    if (!element) return null;
    if (typeof element.closest === "function") {
      try { return element.closest(selector); } catch (e) { /* parent walk */ }
    }
    for (let current = element; current; current = current.parentElement) {
      if (typeof current.matches === "function") {
        try { if (current.matches(selector)) return current; } catch (e) { /* ignore */ }
      }
    }
    return null;
  }

  function isMokaHost(context) {
    const host = locationOf(context).hostname;
    return NS.hostMatchesPattern ? NS.hostMatchesPattern(host, "mokahr.com") : /(^|\.)mokahr\.com$/.test(String(host || "").toLowerCase());
  }

  function textOf(element) {
    if (!element) return "";
    return String(element.textContent || element.value || "").trim();
  }

  // 区块标题文字：剔除内嵌的「添加」按钮等可点元素
  function titleText(titleEl) {
    if (!titleEl) return "";
    let clone = titleEl;
    if (typeof titleEl.cloneNode === "function") {
      clone = titleEl.cloneNode(true);
      for (const junk of qsa(clone, 'button, a, [class*="add"], [class*="Add"], [class*="btn"], [class*="Btn"], svg')) junk.remove();
    }
    return normalize(textOf(clone));
  }

  // 精确匹配优先；长标题（如「校招站点（本次校招主要采取……）」）按前缀归并
  function canonicalSection(rawTitle) {
    const t = normalize(rawTitle);
    if (!t) return null;
    if (SECTION_BY_LABEL[t]) return SECTION_BY_LABEL[t];
    for (const def of SECTION_DEFS) {
      if (t.length > def.label.length && t.startsWith(def.label)) return def;
    }
    return null;
  }

  function blockOf(element) { return closest(element, BLOCK_SEL); }

  function sectionDefOf(element) {
    const block = blockOf(element);
    if (!block) return null;
    const titleEl = first(block, BLOCK_TITLE_SEL);
    return canonicalSection(titleText(titleEl));
  }

  function rawSectionOf(element) {
    const block = blockOf(element);
    if (!block) return "";
    return titleText(first(block, BLOCK_TITLE_SEL));
  }

  // ---- repeater：以真实 DOM item（apply-fields 容器）为准 ----
  function itemElementOf(container) { return closest(container, FIELDS_WRAPPER_SEL); }

  function repeaterFor(container, sectionDef) {
    if (!sectionDef || !sectionDef.repeatable) return { itemIndex: null, itemElement: null };
    const item = itemElementOf(container);
    const block = blockOf(container);
    if (!item || !block) return { itemIndex: null, itemElement: null };
    const items = qsa(block, FIELDS_WRAPPER_SEL).filter((el) => el.parentElement === block || contains(block, el));
    // 只统计与本 item 同层（直接属于该 block 的）wrapper，防止嵌套误计
    const siblings = items.filter((el) => {
      const parentBlock = closest(el.parentElement, BLOCK_SEL);
      return parentBlock === block;
    });
    const index = siblings.indexOf(item);
    return { itemIndex: index < 0 ? null : index, itemElement: item };
  }

  // ---- 控件分类：语义类优先，结构兜底 ----
  const SEMANTIC_KINDS = [
    ["file_upload", "file"],
    ["confirm_info", "checkbox"],
    ["cascader-", "cascader"],
    ["location_info", "cascader"],
    ["day_info", "day"],
    ["date_info", "month"],      // 再由下拉数量细分 date / range
    ["text_info", "textarea"],
    ["string_info", "text"],
    ["select_info", "select"],
    ["Select-", "select"],
  ];

  function semanticKind(container) {
    const cls = classText(container);
    for (const [token, kind] of SEMANTIC_KINDS) {
      if (cls.includes(token)) return kind;
    }
    return null;
  }

  function controlParts(container) {
    const all = qsa(container, "input, textarea, select").filter((el) => {
      const type = String(el.type || "").toLowerCase();
      return !["hidden", "submit", "button", "reset"].includes(type);
    });
    const selectComponents = qsa(container, SELECT_COMPONENT_SEL).filter(isVisible);
    const inSelect = (el) => selectComponents.some((c) => contains(c, el));
    const textControls = all.filter((el) => {
      const type = String(el.type || "").toLowerCase();
      if (["checkbox", "radio", "file"].includes(type)) return false;
      return !inSelect(el) && isVisible(el);
    });
    const selectControls = selectComponents.map((c) => first(c, "input") || c);
    const checkbox = all.find((el) => String(el.type || "").toLowerCase() === "checkbox") || null;
    const fileControls = all.filter((el) => String(el.type || "").toLowerCase() === "file");
    const controls = [];
    for (const el of textControls.concat(selectControls, checkbox ? [checkbox] : [], fileControls)) {
      if (!controls.includes(el)) controls.push(el);
    }
    return { controls, textControls, selectComponents, selectControls, checkbox, fileControls };
  }

  function kindOf(container, parts) {
    const sem = semanticKind(container);
    if (sem === "month") {
      // date_info：4 个下拉 = 起止年月 range；2 个 = 单点年月 date
      if (parts.selectComponents.length >= 4) return "range";
      if (parts.selectComponents.length >= 2) return "date";
      return parts.selectComponents.length === 1 ? "date" : "unknown";
    }
    if (sem) return sem;
    // 简历页基础信息等无语义类容器：按结构判断
    if (parts.fileControls.length) return "file";
    if (parts.selectComponents.length >= 4) return "range";
    if (parts.selectComponents.length >= 2) return "date";
    if (parts.selectComponents.length === 1 && !parts.textControls.length) return "select";
    if (parts.textControls.some((el) => String(el.tagName || "").toUpperCase() === "TEXTAREA")) return "textarea";
    if (parts.textControls.length) return "text";
    if (parts.checkbox && parts.controls.length <= 1) return "checkbox";
    return "unknown";
  }

  function labelOf(container) {
    const titleEl = first(container, TITLE_SEL);
    const raw = textOf(titleEl);
    const label = normalize(raw);
    if (label && label.length <= 20) return { label, rawLabel: raw.trim(), titleEl };
    const input = first(container, "input[placeholder], textarea[placeholder]");
    const ph = normalize(input && input.placeholder);
    if (ph && !["请选择", "请填写", "内容"].includes(ph) && ph.length <= 20) {
      return { label: ph, rawLabel: input.placeholder, titleEl: null };
    }
    return { label: "", rawLabel: raw.trim(), titleEl };
  }

  function requiredOf(titleEl, rawLabel) {
    if (titleEl && first(titleEl, '[class*="required"], [class*="asterisk"]')) return true;
    if (/[*＊]/.test(rawLabel || "")) return true;
    return null;
  }

  function isFieldContainer(el) {
    const cls = classText(el);
    if (/apply-fields-|fields-wrapper/i.test(cls)) return false;
    if (!qsa(el, "input, textarea, select").length && !first(el, SELECT_COMPONENT_SEL)) return false;
    // 嵌套时只取最小容器
    for (const inner of qsa(el, APPLY_FIELD_SEL)) {
      if (inner !== el && (qsa(inner, "input, textarea, select").length || first(inner, SELECT_COMPONENT_SEL))) return false;
    }
    return true;
  }

  function fieldContainers(doc) {
    const apply = qsa(doc, APPLY_FIELD_SEL).filter(isFieldContainer);
    // 简历页基础信息：field-* 但不属于任何 apply-field
    const basic = qsa(doc, BASIC_FIELD_SEL).filter((el) => {
      if (closest(el, APPLY_FIELD_SEL)) return false;
      return isFieldContainer(el);
    });
    const seen = new Set();
    return apply.concat(basic).filter((el) => {
      if (seen.has(el)) return false;
      seen.add(el);
      return isVisible(el);
    });
  }

  function formEvidence(context) {
    const doc = docOf(context);
    const hasApplyFields = Boolean(doc && typeof doc.querySelector === "function" && doc.querySelector(APPLY_FIELD_SEL + " " + 'input, ' + APPLY_FIELD_SEL + " textarea"));
    const hasSdComponents = Boolean(doc && typeof doc.querySelector === "function" && doc.querySelector(SELECT_COMPONENT_SEL));
    const hasBlocks = Boolean(doc && typeof doc.querySelector === "function" && doc.querySelector(BLOCK_SEL));
    let status = "MOKA_UNCERTAIN";
    if (isMokaHost(context) && !(hasApplyFields && hasBlocks)) status = "MOKA_NON_FORM";
    else if (isMokaHost(context) && hasApplyFields && hasBlocks) status = "MOKA_FORM_CONFIRMED";
    return { status, evidence: { hasApplyFields, hasSdComponents, hasBlocks } };
  }

  function descriptorFor(container, context) {
    const parts = controlParts(container);
    const { label, rawLabel, titleEl } = labelOf(container);
    const def = sectionDefOf(container);
    const kind = kindOf(container, parts);
    const repeater = repeaterFor(container, def);
    const sectionKey = def && def.key !== "_flat" ? def.key : null;
    const manualOnly = kind === "file" || kind === "cascader" || kind === "day";
    return {
      provider: "moka",
      section: def ? def.label : rawSectionOf(container),
      sectionKey,
      repeater,
      identity: { sectionKey, itemIndex: repeater.itemIndex, fieldKey: label },
      label,
      rawLabel: rawLabel || label,
      kind: kind === "cascader" || kind === "day" ? "unknown" : kind,
      mokaKind: kind,
      container,
      controls: parts.controls,
      required: requiredOf(titleEl, rawLabel),
      confidence: kind === "unknown" ? 0.25 : 0.95,
      confidenceReason: "真实页面确认的 apply-field / 语义类 / 区块结构",
      textControls: parts.textControls,
      selectComponents: parts.selectComponents,
      selectControls: parts.selectControls,
      checkbox: parts.checkbox,
      fileControls: parts.fileControls,
      manualOnly,
      safetyRole: kind === "file" ? "file" : null,
    };
  }

  // 声明/更新说明（confirm_info）：manual-only
  function declarationPatch(field) {
    return Object.assign(field, {
      manualOnly: true,
      safetyRole: "declaration",
      confidenceReason: "真实页面确认的 confirm_info 声明控件",
    });
  }

  function safetyDescriptor(label, section, kind, element, extra) {
    return Object.assign({
      provider: "moka",
      section,
      sectionKey: null,
      repeater: { itemIndex: null, itemElement: null },
      identity: { sectionKey: null, itemIndex: null, fieldKey: label },
      label,
      rawLabel: label,
      kind,
      container: element,
      controls: element ? [element] : [],
      required: false,
      confidence: 0.95,
      confidenceReason: "真实页面确认的安全边界控件",
      manualOnly: true,
    }, extra || {});
  }

  function submitDescriptor(doc, covered) {
    const button = qsa(doc, 'button, [role="button"], input[type="submit"]').find((el) => {
      if (covered.has(el) || !isVisible(el)) return false;
      return /^(保存|提交|提交申请|预览并提交|确认提交)$/.test(normalize(textOf(el)));
    });
    if (!button) return null;
    covered.add(button);
    return safetyDescriptor(normalize(textOf(button)), "提交", "unknown", button, { safetyRole: "submit" });
  }

  // 简历页的「同步更新在线简历」类入口：禁止自动处理
  function syncDescriptor(doc, covered) {
    const candidates = qsa(doc, 'button, [role="button"], a, span, div').filter((el) => {
      if (covered.has(el) || !isVisible(el)) return false;
      const t = normalize(textOf(el));
      return t.length <= 20 && /同步.*简历|更新在线简历|重新解析/.test(t);
    });
    if (!candidates.length) return null;
    // 取文字最短（最内层）的候选，避免框住整段区块标题
    const button = candidates.sort((a, b) => normalize(textOf(a)).length - normalize(textOf(b)).length)[0];
    covered.add(button);
    return safetyDescriptor(normalize(textOf(button)), "同步简历", "unknown", button, { safetyRole: "sync" });
  }

  function captchaDescriptor(doc, covered) {
    const input = qsa(doc, "input").find((el) => {
      if (covered.has(el)) return false;
      const hint = normalize(`${el.placeholder || ""} ${textOf(el.parentElement)}`);
      return hint.includes("验证码");
    });
    if (!input) return null;
    covered.add(input);
    return safetyDescriptor("验证码", "安全校验", "unknown", input, { safetyRole: "captcha" });
  }

  // ---- 值读取 ----
  function shownTextOfComponent(component) {
    const dv = first(component, DISPLAY_VALUE_SEL);
    const text = normalize(textOf(dv));
    if (text && !/^(请选择|请填写|选择)$/.test(text)) return text;
    return "";
  }

  function readSelect(field) {
    const component = field.selectComponents && field.selectComponents[0];
    if (!component) return "";
    return shownTextOfComponent(component);
  }

  function normalizeYM(value) {
    if (NS.parseYearMonth) {
      const p = NS.parseYearMonth(value);
      if (p) return `${p.y}.${String(p.m).padStart(2, "0")}`;
    }
    return normalize(value);
  }

  function readYearMonth(component) {
    return shownTextOfComponent(component);
  }

  function readControl(field) {
    if (!field) return undefined;
    const kind = field.mokaKind || field.kind;
    if (kind === "text" || kind === "textarea") {
      const input = field.textControls && field.textControls[0];
      return input ? String(input.value || "").trim() : "";
    }
    if (kind === "select") return readSelect(field);
    if (kind === "date") {
      const parts = (field.selectComponents || []).map(readYearMonth);
      const y = parts[0] || "";
      const m = parts[1] || "";
      return y ? (m ? normalizeYM(`${y}.${m}`) : y) : "";
    }
    if (kind === "range") {
      const parts = (field.selectComponents || []).map(readYearMonth);
      const start = parts[0] ? (parts[1] ? normalizeYM(`${parts[0]}.${parts[1]}`) : parts[0]) : "";
      const forever = Boolean(field.checkbox && field.checkbox.checked);
      let end = "";
      if (forever) end = "至今";
      else if (parts[2]) end = parts[3] ? normalizeYM(`${parts[2]}.${parts[3]}`) : parts[2];
      return { start, end };
    }
    if (kind === "day") {
      const input = field.controls && field.controls[0];
      return input ? String(input.value || "").trim() : "";
    }
    if (kind === "cascader") {
      const tag = first(field.container, '[class*="tag"], ' + DISPLAY_VALUE_SEL);
      return normalize(textOf(tag)) || readSelect(field);
    }
    if (kind === "checkbox") return Boolean(field.checkbox && field.checkbox.checked);
    if (kind === "file") return Boolean((field.fileControls || []).some((f) => f.files && f.files.length));
    return undefined;
  }

  // ---- 写入 ----
  function dispatchClick(element) {
    if (!element || typeof element.click !== "function") return false;
    try {
      if (typeof MouseEvent !== "undefined" && element.dispatchEvent) element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    } catch (e) { /* click 才是关键动作 */ }
    element.click();
    return true;
  }

  function closePopup(context, scope) {
    try {
      const doc = docOf(context);
      const active = doc && doc.activeElement;
      if (active && active.dispatchEvent && typeof KeyboardEvent !== "undefined") {
        active.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      }
    } catch (e) { /* 不点 body，避免影响其他字段 */ }
  }

  // 选项就地渲染在被点开组件的容器内——只在 scope 内找，绝不动别的控件的弹层。
  // 唯一精确候选才点击；0 个或多个同名候选一律放弃。
  async function pickOption(scope, wantText, context) {
    const want = normalize(wantText);
    if (!want) return false;
    const deadline = Date.now() + 2500;
    while (Date.now() < deadline) {
      const options = qsa(scope, OPTION_SEL).filter(isVisible);
      const matches = options.filter((o) => normalize(textOf(o)) === want);
      if (matches.length === 1) return dispatchClick(matches[0]);
      if (matches.length > 1) return false;
      if (NS.sleep) await NS.sleep(60);
      else await new Promise((r) => setTimeout(r, 60));
    }
    return false;
  }

  // 打开下拉：点击组件，等待选项出现
  async function openSelect(component, context) {
    if (!dispatchClick(component)) return false;
    if (NS.sleep) await NS.sleep(120);
    return true;
  }

  async function writeSelect(field, value, context) {
    const component = field.selectComponents && field.selectComponents[0];
    if (!component) return false;
    const want = NS.toOptionText ? NS.toOptionText((context && context.merged) || {}, value) : value;
    if (!(await openSelect(component, context))) return false;
    const scope = closest(component, DROPDOWN_SEL) || component;
    let ok = await pickOption(scope, want, context);
    if (!ok) {
      // search-select：输入过滤后重试一次（输入不提交，只缩小候选）
      const input = first(component, "input");
      const readonly = input && (input.readOnly || input.getAttribute && input.getAttribute("readonly") !== null && input.getAttribute("readonly") !== undefined);
      if (input && !readonly && typeof input.value === "string") {
        try {
          input.focus && input.focus();
          input.value = String(want);
          if (NS.emitInputEvents) NS.emitInputEvents(input);
          if (NS.sleep) await NS.sleep(200);
          ok = await pickOption(scope, want, context);
        } catch (e) { ok = false; }
      }
    }
    if (!ok) closePopup(context, scope);
    return ok;
  }

  async function writeYearMonthPair(components, ym, context) {
    const p = NS.parseYearMonth ? NS.parseYearMonth(ym) : null;
    if (!p || components.length < 2) return false;
    for (const [i, v] of [[0, p.y], [1, p.m]]) {
      if (!(await openSelect(components[i], context))) return false;
      const scope = closest(components[i], DROPDOWN_SEL) || components[i];
      const ok = await pickOption(scope, v, context);
      if (!ok) { closePopup(context, scope); return false; }
      if (NS.sleep) await NS.sleep(60);
    }
    return true;
  }

  async function writeRange(field, value, context) {
    const components = field.selectComponents || [];
    if (components.length < 2) return false;
    if (!(await writeYearMonthPair(components.slice(0, 2), value.start, context))) return false;
    if (NS.isForever && NS.isForever(value.end)) {
      if (field.checkbox && !field.checkbox.checked) {
        field.checkbox.click();
        if (NS.emitInputEvents) NS.emitInputEvents(field.checkbox);
      }
      return true;
    }
    if (components.length < 4) return false;
    return writeYearMonthPair(components.slice(2, 4), value.end, context);
  }

  function verifyControl(field, value, context) {
    const actual = context && Object.prototype.hasOwnProperty.call(context, "actual") ? context.actual : readControl(field);
    if (actual === undefined || actual === null) return false;
    const kind = (context && context.kind) || field.mokaKind || field.kind;
    if (kind === "text" || kind === "textarea") return String(actual).trim() === String(value).trim();
    if (kind === "select") {
      const want = NS.toOptionText ? NS.toOptionText((context && context.merged) || {}, value) : value;
      return normalize(actual) === normalize(want);
    }
    if (kind === "date") return normalizeYM(actual) === normalizeYM(value);
    if (kind === "range") {
      if (!actual || typeof actual !== "object") return false;
      const startOk = normalizeYM(actual.start || "") === normalizeYM(value.start || "");
      const endOk = (NS.isForever && NS.isForever(value.end))
        ? actual.end === "至今"
        : normalizeYM(actual.end || "") === normalizeYM(value.end || "");
      return startOk && endOk;
    }
    if (kind === "checkbox") return Boolean(actual) === Boolean(value);
    return false;
  }

  // ---- 清空 ----
  async function clearSelectComponent(component, context) {
    if (!component) return false;
    if (!shownTextOfComponent(component)) return true;
    // Moka sd-Select 有值时会出现清除按钮（×）；找不到就诚实失败
    const target = qsa(component, '[class*="clear"], [class*="Clear"]').find(isVisible);
    if (!target || !dispatchClick(target)) return false;
    if (NS.sleep) await NS.sleep(80);
    return !shownTextOfComponent(component);
  }

  const moka = {
    key: "moka",
    capabilities: {
      addItem: {
        education: false, work: false, internship: false, project: false,
        award: false, language: false,
      },
    },

    getFormState(context) {
      return formEvidence(context || {});
    },

    scanFields(context) {
      const ctx = context || {};
      if (!isMokaHost(ctx)) return undefined; // 非 Moka 页面：交回 Generic
      const state = formEvidence(ctx);
      if (state.status !== "MOKA_FORM_CONFIRMED") return [];
      const doc = docOf(ctx);
      const fields = [];
      const covered = new Set();
      for (const container of fieldContainers(doc)) {
        covered.add(container);
        for (const c of qsa(container, "input, textarea, select")) covered.add(c);
        let field = descriptorFor(container, ctx);
        if (field.mokaKind === "checkbox" && field.kind === "checkbox" && /声明|确认|承诺|更新说明/.test(field.section + field.label)) {
          field = declarationPatch(field);
        }
        fields.push(field);
      }
      const submit = submitDescriptor(doc, covered);
      if (submit) fields.push(submit);
      const sync = syncDescriptor(doc, covered);
      if (sync) fields.push(sync);
      const captcha = captchaDescriptor(doc, covered);
      if (captcha) fields.push(captcha);
      return fields;
    },

    getFieldContainers(context) {
      return fieldContainers(docOf(context));
    },

    getSection(container, context) {
      const field = context && context.field;
      if (field && field.safetyRole) return { section: field.section || "", sectionKey: "_flat" };
      const def = sectionDefOf(container);
      if (!def) return { section: (field && field.section) || rawSectionOf(container), sectionKey: (field && field.sectionKey) || null };
      return { section: def.label, sectionKey: def.key };
    },

    getRepeaterItem(container, context) {
      const field = context && context.field;
      if (field && field.safetyRole) return { itemIndex: null, itemElement: null };
      const def = sectionDefOf(container);
      return repeaterFor(container, def);
    },

    classifyControl(field) {
      return (field && (field.mokaKind || field.kind)) || "unknown";
    },

    readControl(field) {
      return readControl(field);
    },

    captureControl(field) {
      return readControl(field);
    },

    async writeControl(field, value, context) {
      if (!field || field.manualOnly || field.safetyRole) return false;
      const kind = (context && context.kind) || field.mokaKind || field.kind;
      if (kind === "text" || kind === "textarea" || kind === "checkbox") {
        return Boolean(NS.writeControlCore && await NS.writeControlCore(field, value, Object.assign({}, context || {}, { kind })));
      }
      if (kind === "select") return writeSelect(field, value, context || {});
      if (kind === "date") return writeYearMonthPair((field.selectComponents || []).slice(0, 2), value, context || {});
      if (kind === "range") return writeRange(field, value, context || {});
      // day / cascader / file / unknown：不确定，不写入
      return false;
    },

    verifyControl(field, value, context) {
      return verifyControl(field, value, context || {});
    },

    async clearControl(field, context) {
      if (!field || field.manualOnly || field.safetyRole) return false;
      const kind = (context && context.kind) || field.mokaKind || field.kind;
      if (kind === "text" || kind === "textarea" || kind === "checkbox") {
        return Boolean(NS.clearControlCore && await NS.clearControlCore(field, Object.assign({}, context || {}, { kind })));
      }
      if (kind === "select") return clearSelectComponent(field.selectComponents && field.selectComponents[0], context || {});
      if (kind === "date" || kind === "range") {
        let ok = true;
        for (const component of field.selectComponents || []) {
          if (!(await clearSelectComponent(component, context || {}))) ok = false;
        }
        if (field.checkbox && field.checkbox.checked) {
          field.checkbox.click();
          if (NS.emitInputEvents) NS.emitInputEvents(field.checkbox);
        }
        return ok;
      }
      return false;
    },

    // 「添加」按钮真实存在，但自动新增经历保持关闭（capabilities.addItem.* = false），
    // 待后续轮次证明点击-重扫-写后验证链路后再开启。
    findAddButton() {
      return null;
    },
  };

  NS.mokaFormState = formEvidence;
  NS.adapterDefinitions.moka = moka;
})();

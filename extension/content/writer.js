/* 网申助手 · 写入器：按计划把快照值写进页面控件（拟人节奏，可取消） */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(el, value);
    NS.emitInputEvents(el);
  }

  async function fillText(el, value) {
    el.scrollIntoView({ block: "center", behavior: "instant" });
    el.focus();
    setNativeValue(el, String(value));
    el.blur();
  }

  // 在弹出的下拉列表里按文字找选项并点击
  async function pickFromPopup(wantText, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 2500);
    const want = NS.normalizeLabel(wantText);
    while (Date.now() < deadline) {
      const cands = [...document.querySelectorAll(
        '[class*="option"], [class*="Option"], [role="option"], [role="menuitem"], li[class*="item"], [class*="dropdown"] li, [class*="Dropdown"] li'
      )].filter(NS.isVisible);
      for (const c of cands) {
        const t = NS.normalizeLabel(c.textContent);
        if (t === want || (t && want && (t.includes(want) || want.includes(t)) && t.length <= want.length + 6)) {
          c.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
          c.click();
          return true;
        }
      }
      await NS.sleep(80);
    }
    // 找不到就收起弹层
    document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.body.click();
    return false;
  }

  async function fillSelect(el, wantText) {
    el.scrollIntoView({ block: "center", behavior: "instant" });
    const clickTarget = el.closest('[class*="Select-"], [class*="Dropdown"]') || el;
    clickTarget.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    clickTarget.click();
    el.focus && el.focus();
    await NS.sleep(120);
    return pickFromPopup(wantText);
  }

  // 原生 <select>
  function fillNativeSelect(el, wantText) {
    const want = NS.normalizeLabel(wantText);
    const opt = [...el.options].find((o) => {
      const t = NS.normalizeLabel(o.textContent);
      return t === want || t.includes(want) || want.includes(t);
    });
    if (!opt) return false;
    el.value = opt.value;
    NS.emitInputEvents(el);
    return true;
  }

  // 主入口：items = plan；opts {delayMs, autoAddItems, onProgress(i,total,item,ok), shouldCancel()}
  NS.executePlan = async function (items, merged, opts) {
    const delay = (opts && opts.delayMs) ?? 100;
    const results = { filled: 0, failed: [], skipped: 0 };
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (opts && opts.shouldCancel && opts.shouldCancel()) { results.cancelled = true; break; }
      if (NS.hasValue(it.field)) { results.skipped++; opts && opts.onProgress && opts.onProgress(i, items.length, it, "skip"); continue; }
      let ok = false;
      try {
        if (it.kind === "text" || it.kind === "textarea") {
          await fillText(it.field.textControls[0] || it.field.controls[0], it.value);
          ok = true;
        } else if (it.kind === "select") {
          const el = it.field.selectControls[0];
          ok = el.tagName === "SELECT" ? fillNativeSelect(el, NS.toOptionText(merged, it.value))
                                       : await fillSelect(el, NS.toOptionText(merged, it.value));
        } else if (it.kind === "date") {
          ok = await fillYearMonth(it.field.selectControls, it.value);
        } else if (it.kind === "range") {
          ok = await fillRange(it.field, it.value);
        } else if (it.kind === "checkbox") {
          it.field.checkbox.checked = Boolean(it.value);
          NS.emitInputEvents(it.field.checkbox);
          ok = true;
        }
      } catch (e) { ok = false; }
      if (ok) results.filled++;
      else results.failed.push({ path: it.path, label: it.field.label, section: it.field.section });
      opts && opts.onProgress && opts.onProgress(i, items.length, it, ok ? "ok" : "fail");
      await NS.sleep(delay);
    }
    return results;
  };

  async function fillYearMonth(selects, value) {
    const p = NS.parseYearMonth(value);
    if (!p) return false;
    const seq = [p.y, p.m];
    let ok = true;
    for (let i = 0; i < Math.min(selects.length, 2); i++) {
      const r = await fillSelect(selects[i], seq[i]);
      if (!r) ok = false;
      await NS.sleep(60);
    }
    return ok;
  }

  // 起止时间：年/月/年/月 四下拉 + 至今勾选
  async function fillRange(field, value) {
    const s = NS.parseYearMonth(value.start);
    if (!s) return false;
    let ok = true;
    const sels = field.selectControls;
    if (sels.length >= 2) {
      if (!(await fillSelect(sels[0], s.y))) ok = false;
      await NS.sleep(60);
      if (!(await fillSelect(sels[1], s.m))) ok = false;
      await NS.sleep(60);
    }
    if (NS.isForever(value.end)) {
      if (field.checkbox && !field.checkbox.checked) {
        field.checkbox.click();
        NS.emitInputEvents(field.checkbox);
      }
      return ok;
    }
    const e = NS.parseYearMonth(value.end);
    if (e && sels.length >= 4) {
      if (!(await fillSelect(sels[2], e.y))) ok = false;
      await NS.sleep(60);
      if (!(await fillSelect(sels[3], e.m))) ok = false;
    }
    return ok;
  }

  async function clearSelect(el) {
    if (el.tagName === "SELECT") { el.value = ""; NS.emitInputEvents(el); return true; }
    const wrap = el.closest('[class*="Select-"], [class*="Dropdown"]') || el.parentElement;
    const dv = wrap.querySelector('[class*="display-value"], [class*="selection"], [class*="single-value"]');
    const txt = dv ? dv.textContent.trim() : "";
    if (!txt || /^(请选择|请填写|选择)$/.test(txt)) return true; // 本来就空
    // 自绘下拉优先找自带的清除按钮（×）
    const btn = [...wrap.querySelectorAll(
      '[class*="clear"], [class*="Clear"], [class*="close"], [class*="Close"], [class*="delete"], [class*="Delete"]'
    )].find((b) => NS.isVisible(b) && b !== dv && !dv.contains(b));
    if (btn) {
      btn.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      btn.click();
      await NS.sleep(80);
      const after = wrap.querySelector('[class*="display-value"], [class*="selection"]');
      return !after || !after.textContent.trim() || /^请选择/.test(after.textContent.trim());
    }
    return false; // 没有清除按钮，放弃（报告里列出）
  }

  // 清空表单：把页面上所有已填内容清掉
  NS.clearForm = async function (fields, opts) {
    const results = { cleared: 0, failed: [] };
    const delay = (opts && opts.delayMs) ?? 60;
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (opts && opts.shouldCancel && opts.shouldCancel()) { results.cancelled = true; break; }
      if (!NS.hasValue(f)) { opts && opts.onProgress && opts.onProgress(i, fields.length, f); continue; }
      let ok = true;
      try {
        if (f.kind === "text" || f.kind === "textarea") {
          const el = f.textControls[0] || f.controls[0];
          el.scrollIntoView({ block: "center", behavior: "instant" });
          el.focus();
          setNativeValue(el, "");
          el.blur();
        } else if (f.kind === "checkbox") {
          if (f.checkbox.checked) { f.checkbox.click(); NS.emitInputEvents(f.checkbox); }
        } else if (f.kind === "select") {
          ok = await clearSelect(f.selectControls[0]);
        } else if (f.kind === "date" || f.kind === "range") {
          for (const s of f.selectControls) { if (!(await clearSelect(s))) ok = false; await NS.sleep(50); }
          if (f.checkbox && f.checkbox.checked) { f.checkbox.click(); NS.emitInputEvents(f.checkbox); }
        }
      } catch (e) { ok = false; }
      if (ok) results.cleared++;
      else results.failed.push({ label: f.label, section: f.section });
      opts && opts.onProgress && opts.onProgress(i, fields.length, f);
      await NS.sleep(delay);
    }
    return results;
  };
})();

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
})();

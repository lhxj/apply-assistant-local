/* 网申助手 · 写入器：按计划把快照值写进页面控件（拟人节奏，可取消） */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});

  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? (typeof HTMLTextAreaElement !== "undefined" && HTMLTextAreaElement.prototype)
      : (typeof HTMLInputElement !== "undefined" && HTMLInputElement.prototype);
    const desc = proto && Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
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
      const matches = cands.filter((c) => NS.normalizeLabel(c.textContent) === want);
      if (matches.length === 1) {
        const c = matches[0];
        c.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        c.click();
        return true;
      }
      if (matches.length > 1) {
        // 同名候选无法证明对应关系，宁可跳过，避免误选。
        document.activeElement && document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        return false;
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
    const matches = [...el.options].filter((o) => NS.normalizeLabel(o.textContent) === want);
    if (matches.length !== 1) return false;
    const opt = matches[0];
    el.value = opt.value;
    NS.emitInputEvents(el);
    return true;
  }

  function fillRadio(controls, wantText) {
    const want = NS.normalizeLabel(wantText);
    const matches = controls.filter((el) => NS.normalizeLabel(NS.radioOptionText(el)) === want);
    if (matches.length !== 1) return false;
    const target = matches[0];
    if (!target.checked) target.click();
    NS.emitInputEvents(target);
    return Boolean(target.checked);
  }

  function hasYearMonth(actual, value) {
    const p = NS.parseYearMonth(value);
    if (!p) return false;
    const raw = NS.normalizeLabel(actual).replace(/\s+/g, "");
    const month = String(Number(p.m));
    return raw.includes(String(p.y)) && (raw.includes(String(p.m)) || raw.includes(month));
  }

  function verifyFieldValue(item, actual, merged) {
    const f = item.field;
    if (item.kind === "text" || item.kind === "textarea") return String(actual).trim() === String(item.value).trim();
    if (item.kind === "select" || item.kind === "radio") {
      return NS.normalizeLabel(actual) === NS.normalizeLabel(NS.toOptionText(merged, item.value));
    }
    if (item.kind === "checkbox") return actual === Boolean(item.value);
    if (item.kind === "date") return hasYearMonth(actual, item.value);
    if (item.kind === "range") {
      if (!hasYearMonth(actual, item.value.start)) return false;
      if (NS.isForever(item.value.end)) return Boolean(f.checkbox && f.checkbox.checked);
      return hasYearMonth(actual, item.value.end);
    }
    return false;
  }

  function verifyField(item, merged) {
    return verifyFieldValue(item, NS.readFieldValue(item.field), merged);
  }

  // Generic Adapter calls these Core hooks; provider Adapters can override the
  // contract methods without moving the existing write/verify implementation.
  NS.readControlCore = function (field) {
    return NS.readFieldValue(field);
  };

  NS.verifyControlCore = function (field, value, context) {
    const ctx = context || {};
    const item = { field, kind: ctx.kind || field.kind, value };
    const actual = Object.prototype.hasOwnProperty.call(ctx, "actual") ? ctx.actual : NS.readFieldValue(field);
    return verifyFieldValue(item, actual, ctx.merged || {});
  };

  NS.writeControlCore = async function (field, value, context) {
    const ctx = context || {};
    const kind = ctx.kind || field.kind;
    const merged = ctx.merged || {};
    if (kind === "text" || kind === "textarea") {
      await fillText(field.textControls[0] || field.controls[0], value);
      return true;
    }
    if (kind === "select") {
      const el = field.selectControls[0];
      return el.tagName === "SELECT" ? fillNativeSelect(el, NS.toOptionText(merged, value))
                                      : await fillSelect(el, NS.toOptionText(merged, value));
    }
    if (kind === "date") return fillYearMonth(field.selectControls, value);
    if (kind === "range") return fillRange(field, value);
    if (kind === "radio") return fillRadio(field.radioControls || [], NS.toOptionText(merged, value));
    if (kind === "checkbox") {
      field.checkbox.checked = Boolean(value);
      NS.emitInputEvents(field.checkbox);
      return true;
    }
    return false;
  };

  async function verifyWithAdapter(item, merged, opts) {
    const registry = opts && opts.adapterRegistry;
    if (!registry) return verifyField(item, merged);
    const providerKey = (opts && opts.providerKey) || "generic";
    const context = Object.assign({}, opts, { item, kind: item.kind, merged, providerKey });
    const actual = await registry.invoke(providerKey, "readControl", [item.field, context]);
    return Boolean(await registry.invoke(providerKey, "verifyControl", [item.field, item.value, Object.assign({}, context, { actual })]));
  }

  async function hasExistingValue(field, opts) {
    const registry = opts && opts.adapterRegistry;
    if (!registry) return NS.hasValue(field);
    const providerKey = opts.providerKey || "generic";
    const context = Object.assign({}, opts, { field, providerKey });
    const actual = await registry.invoke(providerKey, "readControl", [field, context]);
    if (actual === undefined) return NS.hasValue(field);
    if (typeof actual === "boolean") return actual;
    const text = String(actual == null ? "" : actual).trim();
    return text.length > 0 && !/^(请选择|请填写|选择|\/|--)$/.test(text);
  }

  async function verifyStable(item, merged, opts) {
    // 自绘控件可能在 input/change 后异步回写；等待稳定窗口并连续两次回读。
    await NS.sleep(120);
    const first = await verifyWithAdapter(item, merged, opts);
    await NS.sleep(120);
    const second = await verifyWithAdapter(item, merged, opts);
    return first && second;
  }

  // 主入口：items = plan；opts {delayMs, autoAddItems, onProgress(i,total,item,ok), shouldCancel()}
  NS.executePlan = async function (items, merged, opts) {
    const delay = (opts && opts.delayMs) ?? 100;
    const results = { filled: 0, verified: 0, failed: [], skipped: 0 };
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (opts && opts.shouldCancel && opts.shouldCancel()) { results.cancelled = true; break; }
      if (await hasExistingValue(it.field, opts)) { results.skipped++; opts && opts.onProgress && opts.onProgress(i, items.length, it, "skip"); continue; }
      let ok = false;
      try {
        const context = Object.assign({}, opts || {}, { item: it, kind: it.kind, merged, providerKey: (opts && opts.providerKey) || "generic" });
        if (opts && opts.adapterRegistry) {
          ok = Boolean(await opts.adapterRegistry.invoke(context.providerKey, "writeControl", [it.field, it.value, context]));
        } else {
          ok = Boolean(await NS.writeControlCore(it.field, it.value, context));
        }
      } catch (e) { ok = false; }
      const verified = ok && await verifyStable(it, merged, opts);
      if (verified) {
        results.filled++;
        results.verified++;
      } else {
        results.failed.push({ path: it.path, label: it.field.label, section: it.field.section, reason: ok ? "写后校验失败" : "写入失败" });
      }
      opts && opts.onProgress && opts.onProgress(i, items.length, it, verified ? "verified" : "fail");
      await NS.sleep(delay);
    }
    return results;
  };

  async function fillYearMonth(selects, value) {
    const p = NS.parseYearMonth(value);
    if (!p || selects.length < 2) return false;
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
    if (!s || field.selectControls.length < 2) return false;
    const forever = NS.isForever(value.end);
    const e = forever ? null : NS.parseYearMonth(value.end);
    if (!forever && (!e || field.selectControls.length < 4)) return false;
    let ok = true;
    const sels = field.selectControls;
    if (sels.length >= 2) {
      if (!(await fillSelect(sels[0], s.y))) ok = false;
      await NS.sleep(60);
      if (!(await fillSelect(sels[1], s.m))) ok = false;
      await NS.sleep(60);
    }
    if (forever) {
      if (field.checkbox && !field.checkbox.checked) {
        field.checkbox.click();
        NS.emitInputEvents(field.checkbox);
      }
      return ok;
    }
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
        } else if (f.kind === "radio" || f.kind === "file" || f.kind === "unknown") {
          ok = false;
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

/* 网申助手 · 悬浮球面板 UI */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});
  let ball, panel, reportEl, statusEl, progressEl, progressBar, modal, btnFill;
  let cancelFlag = false;
  let filling = false;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  NS.panel = {
    mount(provider, actions) {
      if (ball) return;
      ball = el("div"); ball.id = "wsz-ball"; ball.textContent = "申";
      ball.title = "网申助手 · 本地版";
      document.documentElement.appendChild(ball);

      panel = el("div"); panel.id = "wsz-panel";
      const head = el("div", "wsz-head");
      head.appendChild(el("span", "wsz-title", "网申助手"));
      head.appendChild(el("span", "wsz-badge", provider.name));
      const close = el("span", "wsz-close", "✕");
      close.onclick = () => panel.classList.remove("open");
      head.appendChild(close);

      const body = el("div", "wsz-body");
      const row1 = el("div", "wsz-row");
      btnFill = el("button", "wsz-btn", "一键填写");
      btnFill.onclick = () => {
        if (filling) { cancelFlag = true; return; }
        actions.fill();
      };
      row1.appendChild(btnFill);

      const row2 = el("div", "wsz-row");
      const btnSnap = el("button", "wsz-btn ghost", "更新快照");
      btnSnap.onclick = () => actions.capture();
      const btnRules = el("button", "wsz-btn ghost", "更新规则");
      btnRules.onclick = () => actions.rules();
      row2.appendChild(btnSnap); row2.appendChild(btnRules);

      const row3 = el("div", "wsz-row");
      const btnEdit = el("button", "wsz-btn ghost", "编辑快照");
      btnEdit.onclick = () => actions.openEditor();
      const btnClear = el("button", "wsz-btn ghost danger", "清空表单");
      btnClear.onclick = () => actions.clear();
      row3.appendChild(btnEdit); row3.appendChild(btnClear);

      progressEl = el("div", "wsz-progress");
      progressBar = el("div"); progressEl.appendChild(progressBar);
      statusEl = el("div", "wsz-status");
      reportEl = el("div", "wsz-report");

      body.append(row1, row2, row3, progressEl, statusEl, reportEl);
      panel.append(head, body);
      document.documentElement.appendChild(panel);

      ball.onclick = () => panel.classList.toggle("open");

      // 学规则弹层
      modal = el("div"); modal.id = "wsz-modal";
      modal.onclick = (e) => { if (e.target === modal) modal.classList.remove("open"); };
      document.documentElement.appendChild(modal);
    },

    setProvider(name) {
      const b = panel && panel.querySelector(".wsz-badge");
      if (b) b.textContent = name;
    },

    setFilling(on) {
      filling = on;
      if (btnFill) {
        btnFill.textContent = on ? "取消填写" : "一键填写";
        btnFill.classList.toggle("cancel", on);
      }
    },

    status(text) { if (statusEl) statusEl.textContent = text; },

    progress(i, total) {
      if (!progressEl) return;
      progressEl.style.display = total > 0 ? "block" : "none";
      progressBar.style.width = total ? Math.round((i / total) * 100) + "%" : "0";
    },

    shouldCancel: () => cancelFlag,
    resetCancel() { cancelFlag = false; },

    // report: {filled, skipped, failed[], unmatched[], noData[], onLearn(field, path)}
    report(r) {
      reportEl.innerHTML = "";
      const okLine = el("div", "wsz-status");
      okLine.innerHTML = `<span class="wsz-ok">✔ 已填 ${r.filled}</span> · 跳过(已有值) ${r.skipped} · 失败 ${r.failed.length} · 未匹配 ${r.unmatched.length} · 快照无数据 ${r.noData.length}`;
      reportEl.appendChild(okLine);

      const addList = (title, arr, render) => {
        if (!arr.length) return;
        reportEl.appendChild(el("h4", null, `${title}（${arr.length}）`));
        arr.forEach((x) => reportEl.appendChild(render(x)));
      };

      addList("未匹配 · 点「学规则」告诉我它是什么", r.unmatched, (u) => {
        const item = el("div", "wsz-item");
        item.appendChild(el("span", "l", u.field.label || "(无标签)"));
        item.appendChild(el("span", "s", u.field.section || ""));
        const b = el("button", "learn", "学规则");
        b.onclick = () => NS.panel.openPicker(u.field, r.onLearn);
        item.appendChild(b);
        return item;
      });
      addList("填写失败", r.failed, (f) => {
        const item = el("div", "wsz-item");
        item.appendChild(el("span", "l", `${f.section || ""} ${f.label}`));
        item.appendChild(el("span", "s", f.path || ""));
        return item;
      });
      addList("快照无数据（去「编辑快照」补全）", r.noData, (n) => {
        const item = el("div", "wsz-item");
        item.appendChild(el("span", "l", `${n.field.section || ""} ${n.field.label}`));
        item.appendChild(el("span", "s", n.path));
        return item;
      });
    },

    // 规则管理视图：列出每个格子的当前映射，点击可改
    // entries: [{field, path|null}]；onLearn(field, path) 学完会重绘
    showRules(entries, providerName, onLearn) {
      reportEl.innerHTML = "";
      reportEl.appendChild(el("h4", null, `规则管理 · ${providerName}（点任意一行改映射）`));
      for (const { field, path } of entries) {
        const item = el("div", "wsz-item rule");
        const label = el("span", "l", `${field.section ? field.section + " · " : ""}${field.label || "(无标签)"}`);
        item.appendChild(label);
        const s = el("span", "s" + (path ? "" : " miss"), path || "未匹配");
        item.appendChild(s);
        item.onclick = () => NS.panel.openPicker(field, onLearn);
        reportEl.appendChild(item);
      }
    },

    clearReport(r) {
      reportEl.innerHTML = "";
      const line = el("div", "wsz-status");
      line.innerHTML = `<span class="wsz-ok">✔ 已清空 ${r.cleared} 格</span>${r.failed.length ? ` · ${r.failed.length} 格无法自动清空（请手动或刷新页面）` : ""}`;
      reportEl.appendChild(line);
      for (const f of r.failed) {
        const item = el("div", "wsz-item");
        item.appendChild(el("span", "l", `${f.section || ""} ${f.label}`));
        item.appendChild(el("span", "s miss", "未清空"));
        reportEl.appendChild(item);
      }
    },

    // 快照字段树选择器
    openPicker(field, onPick) {
      modal.innerHTML = "";
      const card = el("div", "wsz-modal-card");
      card.appendChild(el("div", "wsz-modal-head", `「${field.label}」对应快照里的哪个字段？`));
      const list = el("div", "wsz-modal-list");
      NS.store.loadSnapshot().then((snap) => {
        let lastGroup = null;
        for (const node of NS.fieldTree(snap)) {
          if (node.group !== lastGroup) { list.appendChild(el("div", "g", node.group)); lastGroup = node.group; }
          const p = el("div", "p", node.label);
          p.onclick = () => { modal.classList.remove("open"); onPick(field, node.path); };
          list.appendChild(p);
        }
        // 新自定义字段
        list.appendChild(el("div", "g", "自定义字段"));
        const add = el("div", "p", "＋ 以「" + field.label + "」新建自定义字段（取页面当前值）");
        add.onclick = async () => {
          modal.classList.remove("open");
          const snap2 = await NS.store.loadSnapshot();
          snap2.customFields = snap2.customFields || {};
          snap2.customFields[field.label] = String(NS.readFieldValue(field) || "");
          await NS.store.saveSnapshot(snap2);
          onPick(field, `customFields.${field.label}`);
        };
        list.appendChild(add);
      });
      modal.appendChild(card);
      modal.classList.add("open");
    },
  };
})();

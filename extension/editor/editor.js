/* 网申助手 · 快照编辑器 */
(function () {
  const NS = window.__WSZ;
  let snap;
  const app = document.getElementById("app");

  function toast(msg) {
    let t = document.getElementById("toast");
    if (!t) { t = document.createElement("div"); t.id = "toast"; document.body.appendChild(t); }
    t.textContent = msg;
    t.style.opacity = 1;
    setTimeout(() => (t.style.opacity = 0), 1600);
  }

  function makeInput(path, label, value, isTextarea) {
    const wrap = document.createElement("div");
    wrap.className = "field";
    const lab = document.createElement("label");
    lab.textContent = label;
    const el = document.createElement(isTextarea ? "textarea" : "input");
    el.value = value || "";
    el.dataset.path = path;
    if (!el.value) el.classList.add("empty");
    el.oninput = () => el.classList.toggle("empty", !el.value);
    wrap.append(lab, el);
    return wrap;
  }

  function render() {
    app.innerHTML = "";
    for (const b of NS.SCHEMA) {
      const sec = document.createElement("section");
      sec.className = "block";
      const h2 = document.createElement("h2");
      h2.textContent = b.title;
      sec.appendChild(h2);

      if (b.type === "object") {
        const grid = document.createElement("div");
        grid.className = "grid";
        for (const f of b.fields) {
          grid.appendChild(makeInput(`${b.key}.${f.key}`, f.label, (snap[b.key] || {})[f.key]));
        }
        sec.appendChild(grid);
      } else if (b.type === "array") {
        const arr = snap[b.key] = snap[b.key] || [];
        arr.forEach((item, i) => {
          const box = document.createElement("div");
          box.className = "item";
          const head = document.createElement("div");
          head.className = "item-head";
          const tag = document.createElement("span");
          tag.textContent = `${b.title} ${i + 1}`;
          const del = document.createElement("button");
          del.className = "small danger";
          del.textContent = "删除";
          del.onclick = () => { arr.splice(i, 1); render(); };
          head.append(tag, del);
          box.appendChild(head);
          const grid = document.createElement("div");
          grid.className = "grid";
          for (const f of b.fields) {
            grid.appendChild(makeInput(`${b.key}[${i}].${f.key}`, f.label, item[f.key], f.key === "desc" || f.key === "resp"));
          }
          box.appendChild(grid);
          sec.appendChild(box);
        });
        const add = document.createElement("button");
        add.className = "small";
        add.textContent = `＋ 添加${b.title}`;
        add.onclick = () => { arr.push({}); render(); };
        sec.appendChild(add);
      } else if (b.type === "text") {
        sec.appendChild(makeInput(b.key, b.title, snap[b.key], true));
      } else if (b.type === "map") {
        const map = snap[b.key] = snap[b.key] || {};
        Object.keys(map).forEach((k) => {
          const row = document.createElement("div");
          row.className = "map-row";
          const keyIn = document.createElement("input");
          keyIn.value = k; keyIn.disabled = true;
          const valIn = document.createElement("input");
          valIn.value = map[k] || "";
          valIn.dataset.path = `${b.key}.${k}`;
          const del = document.createElement("button");
          del.className = "small danger";
          del.textContent = "删除";
          del.onclick = () => { delete map[k]; render(); };
          row.append(keyIn, valIn, del);
          sec.appendChild(row);
        });
        const add = document.createElement("button");
        add.className = "small";
        add.textContent = "＋ 添加自定义字段";
        add.onclick = () => {
          const k = prompt("字段名（如：期望工作性质）");
          if (k && !map[k]) { map[k] = ""; render(); }
        };
        sec.appendChild(add);
      }
      app.appendChild(sec);
    }
  }

  function collect() {
    for (const el of app.querySelectorAll("[data-path]")) {
      NS.deepSet(snap, el.dataset.path, el.value);
    }
  }

  document.getElementById("btn-save").onclick = async () => {
    collect();
    await NS.store.saveSnapshot(snap);
    toast("已保存");
  };

  document.getElementById("btn-export").onclick = () => {
    collect();
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "wsz-snapshot.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  document.getElementById("btn-import").onclick = () => document.getElementById("file-input").click();
  document.getElementById("file-input").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const replace = confirm("「确定」= 替换整个快照；「取消」= 合并进当前快照");
      snap = replace ? Object.assign(NS.emptySnapshot(), data) : mergeDeep(snap, data);
      await NS.store.saveSnapshot(snap);
      render();
      toast("已导入");
    } catch (err) { alert("JSON 解析失败：" + err.message); }
    e.target.value = "";
  };

  function mergeDeep(dst, src) {
    for (const k of Object.keys(src || {})) {
      if (Array.isArray(src[k])) dst[k] = src[k];
      else if (src[k] && typeof src[k] === "object") dst[k] = mergeDeep(dst[k] || {}, src[k]);
      else if (src[k] !== "" && src[k] != null) dst[k] = src[k];
    }
    return dst;
  }

  (async () => { snap = await NS.store.loadSnapshot(); render(); })();
})();

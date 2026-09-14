/* 网申助手 · 通用工具（content / editor 共用） */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});

  // 标签归一化：去括号注释、星号、冒号、空白
  NS.normalizeLabel = function (s) {
    if (!s) return "";
    return String(s)
      .replace(/（[^（）]*）/g, "")
      .replace(/\([^()]*\)/g, "")
      .replace(/[*＊:：\s 　]/g, "")
      .trim();
  };

  // "education[0].school" -> ["education","0","school"]
  NS.parsePath = function (p) {
    return String(p).replace(/\[(\d+)\]/g, ".$1").split(".");
  };

  NS.deepGet = function (obj, path) {
    if (!obj || !path) return undefined;
    let cur = obj;
    for (const k of NS.parsePath(path)) {
      if (cur == null) return undefined;
      cur = cur[k];
    }
    return cur;
  };

  NS.deepSet = function (obj, path, value) {
    const keys = NS.parsePath(path);
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      const nextIsIndex = /^\d+$/.test(keys[i + 1]);
      if (cur[k] == null) cur[k] = nextIsIndex ? [] : {};
      cur = cur[k];
    }
    cur[keys[keys.length - 1]] = value;
  };

  // Schema v2 canonical paths. Old aliases/rules are accepted at the boundary,
  // but the rest of the extension only reads and writes the v2 paths.
  NS.canonicalPath = function (path) {
    if (!path) return null;
    let p = String(path);
    if (p === "basicInfo.hukou" || p === "legacy" || p.startsWith("legacy.")) return null;
    const flat = {
      "basicInfo.city": "basicInfo.currentLocation",
      "basicInfo.political": "basicInfo.politicalStatus",
      "basicInfo.highestDegree": "basicInfo.highestEducation",
      "intent.salary": "intent.expectedSalary.amount",
      "intent.currentSalary": "intent.currentSalary.amount",
    };
    if (flat[p]) return flat[p];
    p = p.replace(/^(education\[\d+\])\.degree$/, "$1.educationLevel");
    return p;
  };

  NS.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 触发框架可感知的事件序列
  NS.emitInputEvents = function (el) {
    for (const type of ["input", "change"]) {
      el.dispatchEvent(new Event(type, { bubbles: true, composed: true }));
    }
  };

  // 可见性判断
  NS.isVisible = function (el) {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none";
  };

  // "2021.07" / "2021-07" / "2021/7" / "2021.07.15" -> {y:"2021", m:"7", d:"15"|null}
  NS.parseYearMonth = function (s) {
    if (!s) return null;
    const m = String(s).trim().match(/^(\d{4})\s*[.\-\/年]\s*(\d{1,2})(?:\s*[.\-\/月]\s*(\d{1,2}))?/);
    if (!m) return null;
    return { y: m[1], m: String(Number(m[2])), d: m[3] ? String(Number(m[3])) : null };
  };

  NS.isForever = (s) => /至今|现在|今/.test(String(s || ""));

  // YYYY.MM 或 YYYY.MM.DD 归一
  NS.normalizeDate = function (s) {
    const p = NS.parseYearMonth(s);
    if (!p) return String(s || "").trim();
    return p.d ? `${p.y}.${String(p.m).padStart(2, "0")}.${String(p.d).padStart(2, "0")}`
               : `${p.y}.${String(p.m).padStart(2, "0")}`;
  };
})();

/* 网申助手 · 服务商识别 */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});

  // 只按完整主机名边界匹配，避免 fake-mokahr.com 这类相似域名误识别。
  function hostMatchesPattern(host, pattern) {
    const h = String(host || "").toLowerCase().replace(/\.$/, "");
    const p = String(pattern || "").toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
    return Boolean(h && p) && (h === p || h.endsWith("." + p));
  }

  NS.hostMatchesPattern = hostMatchesPattern;

  // 返回 {key, name}；key 为 null 表示未识别（走通用规则）
  NS.detectProvider = function (rules) {
    const host = location.hostname;
    for (const [key, p] of Object.entries(rules.providers || {})) {
      if ((p.urlPatterns || []).some((pat) => hostMatchesPattern(host, pat))) {
        return { key, name: p.name || key };
      }
    }
    return { key: null, name: "通用" };
  };

  // 页面是否像网申表单（密度门槛，避免插件在无关页面激活）
  NS.looksLikeApplicationForm = function () {
    const n = [...document.querySelectorAll("input, textarea, select")].filter(NS.isVisible).length;
    return n >= 8;
  };
})();

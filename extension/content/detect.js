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

  // Hostname is only a platform signal. Beisen's full adapter activates only
  // after the current DOM also proves a form page. The status strings are kept
  // explicit so a zhiye job page cannot be mistaken for an application form.
  NS.detectProviderState = function (rules) {
    const provider = NS.detectProvider(rules);
    if (provider.key !== "beisen") return { provider, status: provider.key ? "PROVIDER_DETECTED" : "GENERIC" };
    const doc = typeof document !== "undefined" ? document : null;
    const path = String((typeof location !== "undefined" && location.pathname) || "");
    const pathLooksLikeForm = path === "/form" || /\/form\/$/.test(path);
    const hasWrapper = Boolean(doc && doc.querySelector && doc.querySelector(".form-item .form-item__text") && doc.querySelector(".form-item .form-item__control"));
    const hasGeneratedGroup = Boolean(doc && doc.querySelector && doc.querySelector('div.form[id*="Recruitment_extPerfect"]'));
    const hasPhoenix = Boolean(doc && doc.querySelector && doc.querySelector('[class*="phoenix-"]'));
    const hasBrand = Boolean(doc && doc.body && /Powered\s+by\s+Beisen/i.test(doc.body.textContent || ""));
    let status = "BEISEN_UNCERTAIN";
    if (!pathLooksLikeForm) status = "BEISEN_SITE_NON_FORM";
    else if (hasWrapper && (hasGeneratedGroup || hasPhoenix || hasBrand)) status = "BEISEN_FORM_CONFIRMED";
    return { provider, status, evidence: { pathLooksLikeForm, hasWrapper, hasGeneratedGroup, hasPhoenix, hasBrand } };
  };

  // 页面是否像网申表单（密度门槛，避免插件在无关页面激活）
  NS.looksLikeApplicationForm = function () {
    const n = [...document.querySelectorAll("input, textarea, select")].filter(NS.isVisible).length;
    return n >= 8;
  };
})();

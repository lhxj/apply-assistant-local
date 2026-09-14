/* 网申助手 · 北森 Adapter 占位壳
 * Round 2.5 不放入任何北森 DOM 选择器或平台行为。
 */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});
  NS.adapterDefinitions = NS.adapterDefinitions || {};
  NS.adapterDefinitions.beisen = {
    key: "beisen",
    capabilities: {
      addItem: { education: false, work: false, internship: false, project: false },
    },
  };
})();

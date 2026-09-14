/* 网申助手 · Moka Adapter 占位壳
 * Round 2.5 不放入任何 Moka DOM 选择器或平台行为。
 */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});
  NS.adapterDefinitions = NS.adapterDefinitions || {};
  NS.adapterDefinitions.moka = {
    key: "moka",
    capabilities: {
      addItem: { education: false, work: false, internship: false, project: false },
    },
  };
})();

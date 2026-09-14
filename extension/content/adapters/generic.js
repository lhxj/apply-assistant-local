/* 网申助手 · Generic Adapter（平台适配器的安全后备实现） */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});
  NS.adapterDefinitions = NS.adapterDefinitions || {};

  const generic = {
    key: "generic",
    capabilities: {
      addItem: { education: false, work: false, internship: false, project: false },
    },

    // Generic scanner boundary: keep the existing scanner as the source of
    // truth until a provider proves a complete or augmenting scan.
    scanFields(context) {
      return typeof NS.scanFields === "function"
        ? NS.scanFields((context && context.domConfig) || {})
        : [];
    },

    // DOM container discovery remains available as a lower-level compatibility
    // hook for future provider adapters.
    getFieldContainers(context) {
      return typeof NS.getGenericFieldContainers === "function"
        ? NS.getGenericFieldContainers(context && context.domConfig)
        : undefined;
    },

    getSection(container, context) {
      const field = (context && context.field) || {};
      return { section: field.section || "", sectionKey: field.sectionKey || null };
    },

    getRepeaterItem(container, context) {
      const field = (context && context.field) || {};
      if (field.repeater && typeof field.repeater === "object") return field.repeater;
      const sectionKey = context && context.sectionKey;
      if (!sectionKey || sectionKey === "_flat") return { itemIndex: null, itemElement: null };
      return {
        // 这是旧 scanner.index 到新 itemIndex 的兼容桥；平台 Adapter 必须提供真实 itemIndex。
        itemIndex: Number.isInteger(field.index) ? field.index : null,
        itemElement: null,
      };
    },

    classifyControl(field) {
      return field && field.kind ? field.kind : "unknown";
    },

    readControl(field, context) {
      if (typeof NS.readControlCore === "function") return NS.readControlCore(field, context);
      return typeof NS.readFieldValue === "function" ? NS.readFieldValue(field) : undefined;
    },

    writeControl(field, value, context) {
      if (typeof NS.writeControlCore === "function") return NS.writeControlCore(field, value, context || {});
      return false;
    },

    verifyControl(field, value, context) {
      if (typeof NS.verifyControlCore === "function") return NS.verifyControlCore(field, value, context || {});
      return false;
    },

    captureControl(field, context) {
      if (typeof NS.captureControlCore === "function") return NS.captureControlCore(field, context || {});
      return undefined;
    },

    clearControl(field, context) {
      if (typeof NS.clearControlCore === "function") return NS.clearControlCore(field, context || {});
      return false;
    },

    // Generic 不具备安全证明过的添加经历能力。
    findAddButton() {
      return null;
    },
  };

  NS.adapterDefinitions.generic = generic;
  NS.genericAdapter = generic;
})();

/* 网申助手 · Adapter Registry 与 FieldDescriptor 兼容边界 */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});
  const definitions = NS.adapterDefinitions || {};
  const generic = definitions.generic || NS.genericAdapter;

  function call(adapter, method, args, fallback) {
    const fn = adapter && adapter[method];
    if (typeof fn === "function") {
      try {
        const result = fn.apply(adapter, args || []);
        if (result && typeof result.then === "function") {
          return result.then((value) => value === undefined ? call(fallback, method, args, null) : value)
            .catch(() => call(fallback, method, args, null));
        }
        if (result !== undefined) return result;
      } catch (e) {
        // Provider implementation failure is isolated at the field boundary.
      }
    }
    return fallback ? call(fallback, method, args, null) : undefined;
  }

  function sectionInfo(raw, field) {
    if (raw && typeof raw === "object") {
      return {
        section: raw.section || raw.label || raw.title || field.section || "",
        sectionKey: raw.sectionKey || raw.key || field.sectionKey || null,
      };
    }
    return { section: raw || field.section || "", sectionKey: field.sectionKey || null };
  }

  function configuredSectionKey(field, context, section) {
    if (field.sectionKey) return field.sectionKey;
    const merged = context && context.mergedRules;
    return merged && merged._n && merged._n.sectionAliases
      ? merged._n.sectionAliases[NS.normalizeLabel(section)] || null
      : null;
  }

  const registry = {
    get(providerKey) {
      return definitions[providerKey] || generic;
    },

    register(adapter) {
      if (!adapter || !adapter.key) throw new Error("Adapter key is required");
      definitions[adapter.key] = adapter;
      return adapter;
    },

    // Provider method first; missing/undefined/failed method falls back to Generic.
    invoke(providerOrAdapter, method, args) {
      const adapter = typeof providerOrAdapter === "string" ? this.get(providerOrAdapter) : (providerOrAdapter || generic);
      return call(adapter, method, args || [], adapter === generic ? null : generic);
    },

    normalizeField(field, context = {}) {
      const providerKey = context.providerKey || field.provider || "generic";
      const adapter = this.get(providerKey);
      const callContext = Object.assign({}, context, { field, providerKey });
      const rawSection = this.invoke(adapter, "getSection", [field.container, callContext]);
      const info = sectionInfo(rawSection, field);
      const sectionKey = configuredSectionKey(field, context, info.section) || info.sectionKey;
      const canonicalSectionKey = sectionKey && sectionKey !== "_flat" ? sectionKey : null;
      const repeater = this.invoke(adapter, "getRepeaterItem", [field.container, Object.assign({}, callContext, { sectionKey: canonicalSectionKey })]) || {};
      const kind = this.invoke(adapter, "classifyControl", [field, callContext]) || field.kind || "unknown";
      const inheritedRepeater = field.repeater && typeof field.repeater === "object" ? field.repeater : {};
      const itemIndex = inheritedRepeater.itemIndex != null
        ? inheritedRepeater.itemIndex
        : field.itemIndex != null
          ? field.itemIndex
          : repeater.itemIndex != null
            ? repeater.itemIndex
            : canonicalSectionKey && Number.isInteger(field.index) ? field.index : null;

      return Object.assign({}, field, {
        provider: providerKey,
        section: info.section || "",
        sectionKey: canonicalSectionKey,
        label: field.label || "",
        rawLabel: field.rawLabel || field.label || "",
        kind: kind || "unknown",
        container: field.container || null,
        controls: field.controls || [],
        repeater: {
          itemIndex: canonicalSectionKey ? itemIndex : null,
          itemElement: inheritedRepeater.itemElement || repeater.itemElement || null,
        },
        required: field.required == null ? null : Boolean(field.required),
        confidence: field.confidence == null ? (kind === "unknown" ? 0 : 0.5) : field.confidence,
        // Keep current matcher/writer compatible while new code reads repeater.itemIndex.
        index: field.index == null ? (itemIndex == null ? 0 : itemIndex) : field.index,
      });
    },

    normalizeFields(fields, context = {}) {
      return (Array.isArray(fields) ? fields : []).map((field) => this.normalizeField(field, context));
    },

    findAddButton(providerKey, section, context) {
      return this.invoke(providerKey, "findAddButton", [section, context]) || null;
    },

    canAddItem(providerKey, sectionKey) {
      const adapter = this.get(providerKey);
      const addItem = adapter && adapter.capabilities && adapter.capabilities.addItem;
      return Boolean(addItem && addItem[sectionKey] === true);
    },

    // Learning target classification is intentionally separate from persistence.
    // It prevents a repeater target from becoming a global/provider flat alias.
    learningTarget(field, targetPath, context = {}) {
      const path = NS.canonicalPath ? NS.canonicalPath(targetPath) : targetPath;
      if (!path) return null;
      const section = field.section || "";
      const merged = context.mergedRules;
      const configured = field.sectionKey || (merged && merged._n && merged._n.sectionAliases
        ? merged._n.sectionAliases[NS.normalizeLabel(section)] || null
        : null);
      const isFlatSection = configured === "_flat";
      const match = path.match(/^([A-Za-z][A-Za-z0-9_]*)\[(\d+)\]\.([^.[].+)$/);
      if (match) {
        const target = {
          kind: configured && configured === match[1] ? "repeater" : "section-scoped",
          scope: configured && configured === match[1] ? "repeater" : "section",
          sectionKey: match[1],
          sectionLabel: section,
          itemIndex: Number(match[2]),
          fieldPath: match[3],
          path,
        };
        return target;
      }
      if (section && !isFlatSection) {
        return { kind: "section-scoped", scope: "section", sectionKey: configured || null, sectionLabel: section, itemIndex: null, fieldPath: null, path };
      }
      return { kind: "flat", scope: "flat", sectionKey: null, sectionLabel: section, itemIndex: null, fieldPath: null, path };
    },
  };

  NS.adapterRegistry = registry;
})();

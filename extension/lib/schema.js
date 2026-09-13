/* 网申助手 · 简历快照数据模型（唯一信息源的结构定义） */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});
  const SCHEMA_VERSION = 2;

  const salaryPeriodOptions = [
    { value: "unknown", label: "未确定" },
    { value: "month", label: "月薪" },
    { value: "year", label: "年薪" },
  ];

  // type: object(平铺/嵌套字段) | array(可重复区块) | text(长文本) | map(自由键值)
  // array 区块的 start/end 字段用于"起止时间"类复合控件；id 是内部字段，不放进 fields。
  NS.SCHEMA = [
    { key: "basicInfo", title: "基本信息", type: "object", fields: [
      { key: "name", label: "姓名" }, { key: "gender", label: "性别" },
      { key: "birthday", label: "出生日期" }, { key: "phone", label: "手机号码" },
      { key: "email", label: "邮箱" }, { key: "idType", label: "证件类型" },
      { key: "idNumber", label: "证件号码" }, { key: "ethnicity", label: "民族" },
      { key: "politicalStatus", label: "政治面貌" }, { key: "maritalStatus", label: "婚姻状况" },
      { key: "nativePlace", label: "籍贯" }, { key: "hukouLocation", label: "户籍所在地" },
      { key: "currentLocation", label: "现居住地" },
      { key: "highestEducation", label: "最高学历" }, { key: "workYears", label: "工作经验" },
      { key: "recentCompany", label: "最近公司" },
    ]},
    { key: "intent", title: "求职意向", type: "object", fields: [
      { key: "position", label: "期望职位" }, { key: "cities", label: "期望城市" },
      { key: "expectedSalary.amount", label: "期望薪资金额" },
      { key: "expectedSalary.period", label: "期望薪资周期", inputType: "select", options: salaryPeriodOptions, defaultValue: "unknown" },
      { key: "expectedSalary.currency", label: "期望薪资币种", defaultValue: "CNY" },
      { key: "currentSalary.amount", label: "当前薪资金额" },
      { key: "currentSalary.period", label: "当前薪资周期", inputType: "select", options: salaryPeriodOptions, defaultValue: "unknown" },
      { key: "currentSalary.currency", label: "当前薪资币种", defaultValue: "CNY" },
    ]},
    { key: "education", title: "教育经历", type: "array", range: true, fields: [
      { key: "school", label: "学校名称" }, { key: "major", label: "专业名称" },
      { key: "educationLevel", label: "学历" }, { key: "degreeName", label: "学位" },
      { key: "start", label: "入学时间" }, { key: "end", label: "毕业时间" },
      { key: "studyMode", label: "学习形式" }, { key: "fulltime", label: "是否全日制" },
      { key: "gpa", label: "GPA" }, { key: "gpaScale", label: "GPA 满分" },
      { key: "rank", label: "成绩排名" },
    ]},
    { key: "work", title: "工作经历", type: "array", range: true, fields: [
      { key: "company", label: "公司名称" }, { key: "title", label: "职位名称" },
      { key: "start", label: "开始时间" }, { key: "end", label: "结束时间" },
      { key: "desc", label: "工作职责", inputType: "textarea" },
    ]},
    { key: "internship", title: "实习经历", type: "array", range: true, fields: [
      { key: "company", label: "公司名称" }, { key: "title", label: "职位名称" },
      { key: "start", label: "开始时间" }, { key: "end", label: "结束时间" },
      { key: "desc", label: "工作职责", inputType: "textarea" },
    ]},
    { key: "project", title: "项目经验", type: "array", range: true, fields: [
      { key: "name", label: "项目名称" }, { key: "role", label: "职责" },
      { key: "start", label: "开始时间" }, { key: "end", label: "结束时间" },
      { key: "desc", label: "项目描述", inputType: "textarea" },
      { key: "resp", label: "项目中职责", inputType: "textarea" },
    ]},
    { key: "language", title: "语言能力", type: "array", fields: [
      { key: "lang", label: "语言类型" }, { key: "level", label: "掌握程度" },
      { key: "listening", label: "听说" }, { key: "reading", label: "读写" },
    ]},
    { key: "languageTests", title: "语言考试", type: "array", fields: [
      { key: "language", label: "语言" }, { key: "testName", label: "考试名称" },
      { key: "level", label: "等级" }, { key: "score", label: "成绩" },
    ]},
    { key: "award", title: "获奖经历", type: "array", fields: [
      { key: "name", label: "奖项名称" }, { key: "date", label: "获奖时间" },
      { key: "level", label: "获奖级别" }, { key: "description", label: "获奖描述", inputType: "textarea" },
    ]},
    { key: "skills", title: "技能", type: "array", fields: [
      { key: "name", label: "技能名称" }, { key: "level", label: "熟练度" },
      { key: "duration", label: "使用时长" }, { key: "description", label: "技能描述", inputType: "textarea" },
    ]},
    { key: "certificates", title: "证书", type: "array", fields: [
      { key: "name", label: "证书名称" }, { key: "date", label: "获得时间" },
      { key: "description", label: "证书描述", inputType: "textarea" },
    ]},
    { key: "familyMembers", title: "家庭成员", type: "array", fields: [
      { key: "name", label: "姓名" }, { key: "relationship", label: "与本人关系" },
      { key: "age", label: "年龄" }, { key: "employer", label: "工作单位" },
      { key: "phone", label: "联系电话" },
    ]},
    { key: "referrers", title: "推荐人", type: "array", fields: [
      { key: "name", label: "姓名" }, { key: "relationship", label: "关系" },
      { key: "employer", label: "工作单位" }, { key: "phone", label: "联系电话" },
    ]},
    { key: "selfEval", title: "自我描述", type: "text" },
    { key: "customFields", title: "自定义字段", type: "map" },
  ];

  NS.SCHEMA_VERSION = SCHEMA_VERSION;

  function isObject(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    if (value === undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }

  function hasValue(value) {
    return value !== undefined && value !== null && value !== "";
  }

  function setLocal(obj, path, value) {
    const keys = String(path).split(".");
    let cur = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      cur[keys[i]] = isObject(cur[keys[i]]) ? cur[keys[i]] : {};
      cur = cur[keys[i]];
    }
    cur[keys[keys.length - 1]] = value;
  }

  function emptyObject(block) {
    const out = {};
    for (const f of block.fields || []) setLocal(out, f.key, f.defaultValue !== undefined ? clone(f.defaultValue) : "");
    return out;
  }

  NS.schemaFieldPath = function (block, field) {
    return field.path || `${block.key}.${field.key}`;
  };

  NS.emptySnapshot = function () {
    const snap = { schemaVersion: SCHEMA_VERSION };
    for (const b of NS.SCHEMA) {
      if (b.type === "object") snap[b.key] = emptyObject(b);
      else if (b.type === "array") snap[b.key] = [];
      else if (b.type === "map") snap[b.key] = {};
      else snap[b.key] = "";
    }
    // Empty-object defaults above already create these values; keep this explicit
    // so the storage contract is clear even if the field list changes later.
    snap.intent.expectedSalary = { amount: "", period: "unknown", currency: "CNY" };
    snap.intent.currentSalary = { amount: "", period: "unknown", currency: "CNY" };
    // Historical ambiguous values live here and are never part of automatic filling.
    snap.legacy = {};
    return snap;
  };

  function stableHash(value) {
    const text = JSON.stringify(value);
    let hash = 2166136261;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
  }

  function ensureArrayIds(values, prefix, transform) {
    const used = new Set();
    return (Array.isArray(values) ? values : []).map((raw, index) => {
      const item = transform(isObject(raw) ? clone(raw) : {}, index);
      const withoutId = clone(item) || {};
      delete withoutId.id;
      let id = hasValue(item.id) ? String(item.id) : `${prefix}_${stableHash({ index, item: withoutId })}`;
      if (used.has(id)) {
        let serial = 2;
        let candidate = `${id}_${serial}`;
        while (used.has(candidate)) { serial++; candidate = `${id}_${serial}`; }
        id = candidate;
      }
      item.id = id;
      used.add(id);
      return item;
    });
  }

  function normalizeSalary(value) {
    if (isObject(value)) {
      return {
        amount: hasValue(value.amount) ? String(value.amount) : "",
        period: ["month", "year", "unknown"].includes(value.period) ? value.period : "unknown",
        currency: hasValue(value.currency) ? String(value.currency) : "CNY",
      };
    }
    return {
      amount: hasValue(value) ? String(value) : "",
      period: "unknown",
      currency: "CNY",
    };
  }

  function normalizeBasicInfo(raw, defaults, legacy) {
    const basic = Object.assign({}, defaults, isObject(raw) ? clone(raw) : {});
    const moves = [
      ["politicalStatus", "political"],
      ["highestEducation", "highestDegree"],
      ["currentLocation", "city"],
    ];
    for (const [newKey, oldKey] of moves) {
      if (!hasValue(basic[newKey]) && hasValue(basic[oldKey])) basic[newKey] = basic[oldKey];
      delete basic[oldKey];
    }
    if (hasValue(basic.hukou)) {
      if (!hasValue(legacy.hukou)) legacy.hukou = basic.hukou;
      delete basic.hukou;
    }
    return basic;
  }

  function normalizeEducation(item) {
    if (!hasValue(item.educationLevel) && hasValue(item.degree)) item.educationLevel = item.degree;
    delete item.degree;
    return item;
  }

  // v1 -> v2 is deliberately conservative: values with ambiguous meaning are
  // retained under legacy instead of being guessed into a new canonical field.
  NS.migrateSnapshot = function (snapshot) {
    const source = isObject(snapshot) ? clone(snapshot) : {};
    const defaults = NS.emptySnapshot();
    const out = Object.assign({}, source, { schemaVersion: SCHEMA_VERSION });
    const legacy = Object.assign({}, isObject(source.legacy) ? source.legacy : {});

    out.basicInfo = normalizeBasicInfo(source.basicInfo, defaults.basicInfo, legacy);

    const oldIntent = isObject(source.intent) ? source.intent : {};
    const intent = Object.assign({}, defaults.intent, clone(oldIntent));
    const expectedRaw = isObject(oldIntent.expectedSalary) ? oldIntent.expectedSalary : oldIntent.salary;
    intent.expectedSalary = normalizeSalary(expectedRaw);
    intent.currentSalary = normalizeSalary(oldIntent.currentSalary);
    delete intent.salary;
    out.intent = intent;

    out.education = ensureArrayIds(source.education, "edu", normalizeEducation);
    out.work = ensureArrayIds(source.work, "work", (item) => item);
    out.internship = ensureArrayIds(source.internship, "internship", (item) => item);
    out.project = ensureArrayIds(source.project, "project", (item) => item);
    out.language = ensureArrayIds(source.language, "language", (item) => item);
    out.award = ensureArrayIds(source.award, "award", (item) => item);
    out.skills = ensureArrayIds(source.skills, "skill", (item) => item);
    out.certificates = ensureArrayIds(source.certificates, "certificate", (item) => item);
    out.languageTests = ensureArrayIds(source.languageTests, "langtest", (item) => item);
    out.familyMembers = ensureArrayIds(source.familyMembers, "family", (item) => item);
    out.referrers = ensureArrayIds(source.referrers, "referrer", (item) => item);

    out.selfEval = hasValue(source.selfEval) ? source.selfEval : "";
    out.customFields = isObject(source.customFields) ? clone(source.customFields) : {};
    out.legacy = legacy;
    return out;
  };

  // 字段树（更新规则时点选目标路径用）；内部 id 不进入可学习路径。
  // 返回 [{path, label, group}]
  NS.fieldTree = function (snapshot) {
    const out = [];
    for (const b of NS.SCHEMA) {
      if (b.type === "object") {
        for (const f of b.fields) out.push({ path: NS.schemaFieldPath(b, f), label: f.label, group: b.title });
      } else if (b.type === "array") {
        const n = Math.max((snapshot && snapshot[b.key] && snapshot[b.key].length) || 0, 1);
        for (let i = 0; i < n; i++) {
          for (const f of b.fields) {
            out.push({ path: `${b.key}[${i}].${f.key}`, label: `${b.title}${n > 1 ? " " + (i + 1) : ""} · ${f.label}`, group: b.title });
          }
        }
      } else if (b.type === "text") {
        out.push({ path: b.key, label: b.title, group: b.title });
      } else if (b.type === "map" && snapshot) {
        for (const k of Object.keys(snapshot.customFields || {})) {
          out.push({ path: `customFields.${k}`, label: k, group: b.title });
        }
      }
    }
    return out;
  };
})();

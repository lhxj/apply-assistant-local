/* 网申助手 · 简历快照数据模型（唯一信息源的结构定义） */
(function () {
  const NS = (window.__WSZ = window.__WSZ || {});

  // type: object(平铺) | array(可重复区块) | text(长文本) | map(自由键值)
  // array 区块的 start/end 字段用于"起止时间"类复合控件
  NS.SCHEMA = [
    { key: "basicInfo", title: "基本信息", type: "object", fields: [
      { key: "name", label: "姓名" }, { key: "gender", label: "性别" },
      { key: "phone", label: "手机号码" }, { key: "email", label: "邮箱" },
      { key: "birthday", label: "出生日期" }, { key: "idType", label: "证件类型" },
      { key: "idNumber", label: "证件号码" }, { key: "city", label: "所在地" },
      { key: "hukou", label: "籍贯/户籍" }, { key: "political", label: "政治面貌" },
      { key: "highestDegree", label: "最高学历" }, { key: "workYears", label: "工作经验" },
      { key: "recentCompany", label: "最近公司" },
    ]},
    { key: "intent", title: "求职意向", type: "object", fields: [
      { key: "position", label: "期望职位" }, { key: "cities", label: "期望城市" },
      { key: "salary", label: "期望薪资" }, { key: "currentSalary", label: "当前薪资" },
    ]},
    { key: "education", title: "教育经历", type: "array", range: true, fields: [
      { key: "school", label: "学校名称" }, { key: "major", label: "专业名称" },
      { key: "degree", label: "学历" }, { key: "start", label: "入学时间" },
      { key: "end", label: "毕业时间" }, { key: "fulltime", label: "是否全日制" },
      { key: "rank", label: "成绩排名" },
    ]},
    { key: "work", title: "工作经历", type: "array", range: true, fields: [
      { key: "company", label: "公司名称" }, { key: "title", label: "职位名称" },
      { key: "start", label: "开始时间" }, { key: "end", label: "结束时间" },
      { key: "desc", label: "工作职责" },
    ]},
    { key: "internship", title: "实习经历", type: "array", range: true, fields: [
      { key: "company", label: "公司名称" }, { key: "title", label: "职位名称" },
      { key: "start", label: "开始时间" }, { key: "end", label: "结束时间" },
      { key: "desc", label: "工作职责" },
    ]},
    { key: "project", title: "项目经验", type: "array", range: true, fields: [
      { key: "name", label: "项目名称" }, { key: "role", label: "职责" },
      { key: "start", label: "开始时间" }, { key: "end", label: "结束时间" },
      { key: "desc", label: "项目描述" }, { key: "resp", label: "项目中职责" },
    ]},
    { key: "language", title: "语言能力", type: "array", fields: [
      { key: "lang", label: "语言类型" }, { key: "level", label: "掌握程度" },
      { key: "listening", label: "听说" }, { key: "reading", label: "读写" },
    ]},
    { key: "award", title: "获奖经历", type: "array", fields: [
      { key: "name", label: "奖项名称" }, { key: "date", label: "获奖时间" },
    ]},
    { key: "selfEval", title: "自我描述", type: "text" },
    { key: "customFields", title: "自定义字段", type: "map" },
  ];

  NS.emptySnapshot = function () {
    const snap = {};
    for (const b of NS.SCHEMA) {
      if (b.type === "object") snap[b.key] = {};
      else if (b.type === "array") snap[b.key] = [];
      else if (b.type === "map") snap[b.key] = {};
      else snap[b.key] = "";
    }
    return snap;
  };

  // 字段树（更新规则时点选目标路径用）
  // 返回 [{path, label, group}]
  NS.fieldTree = function (snapshot) {
    const out = [];
    for (const b of NS.SCHEMA) {
      if (b.type === "object") {
        for (const f of b.fields) out.push({ path: `${b.key}.${f.key}`, label: f.label, group: b.title });
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

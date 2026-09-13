# Snapshot Schema v2

Snapshot 从 `schemaVersion: 2` 开始使用以下统一模型。`extension/lib/schema.js` 是结构定义、默认值和迁移逻辑的唯一信息源；`extension/lib/store.js` 负责加载后迁移并回写 storage。

## 完整结构

```js
{
  schemaVersion: 2,

  basicInfo: {
    name: "",
    gender: "",
    birthday: "",
    phone: "",
    email: "",
    idType: "",
    idNumber: "",
    ethnicity: "",
    politicalStatus: "",
    maritalStatus: "",
    nativePlace: "",
    hukouLocation: "",
    currentLocation: "",
    highestEducation: "",
    workYears: "",
    recentCompany: ""
  },

  intent: {
    position: "",
    cities: "",
    expectedSalary: { amount: "", period: "unknown", currency: "CNY" },
    currentSalary: { amount: "", period: "unknown", currency: "CNY" }
  },

  education: [{
    id: "edu_...",
    school: "",
    major: "",
    educationLevel: "",
    degreeName: "",
    start: "",
    end: "",
    studyMode: "",
    fulltime: "",
    gpa: "",
    gpaScale: "",
    rank: ""
  }],

  work: [{ id: "work_...", company: "", title: "", start: "", end: "", desc: "" }],
  internship: [{ id: "internship_...", company: "", title: "", start: "", end: "", desc: "" }],
  project: [{ id: "project_...", name: "", role: "", start: "", end: "", desc: "", resp: "" }],
  language: [{ id: "language_...", lang: "", level: "", listening: "", reading: "" }],
  languageTests: [{ id: "langtest_...", language: "", testName: "", level: "", score: "" }],
  award: [{ id: "award_...", name: "", date: "", level: "", description: "" }],
  skills: [{ id: "skill_...", name: "", level: "", duration: "", description: "" }],
  certificates: [{ id: "certificate_...", name: "", date: "", description: "" }],
  familyMembers: [{ id: "family_...", name: "", relationship: "", age: "", employer: "", phone: "" }],
  referrers: [{ id: "referrer_...", name: "", relationship: "", employer: "", phone: "" }],

  selfEval: "",
  customFields: {},
  legacy: {}
}
```

数组记录的 `id` 是内部稳定标识，不是普通资料字段，不会出现在 Editor 或规则学习的 fieldTree 中。新记录由迁移/保存边界自动补齐 ID；已有 ID 在删除、重排和再次加载时保留。

薪资 `period` 只允许 `month`、`year`、`unknown`。旧字符串无法证明周期时一律使用 `unknown`，不把“薪资”猜成月薪或年薪。`seed.json` 中带单位的“期望月薪/期望年薪”规则保留 `{ path, period }` 元数据；匹配器只有在快照周期完全一致时才会生成填写计划，周期为 `unknown` 或不一致时跳过。无明确单位的“期望薪资/当前薪资”才可以保守读取对应的 `amount`。

`language` 保留 Round 1 的语言能力路径；语言考试另用 `languageTests`，以覆盖 CET-4、CET-6、IELTS、TOEFL、JLPT 等资料。

## v1 → v2 迁移

`migrateSnapshot(snapshot)` 可重复调用，且是幂等的。`loadSnapshot()` 的流程是：读取 storage → 检测/迁移 → 规范化数组 ID 和默认结构 → 如有变化回写 → 返回 v2 Snapshot。`saveSnapshot()` 也经过同一迁移边界。

| v1 数据 | v2 数据 | 处理 |
| --- | --- | --- |
| 无 `schemaVersion` 或 v1 | `schemaVersion: 2` | 视为旧 Snapshot 并迁移 |
| `basicInfo.political` | `basicInfo.politicalStatus` | 仅在新字段为空时移动 |
| `basicInfo.highestDegree` | `basicInfo.highestEducation` | 仅在新字段为空时移动 |
| `basicInfo.city` | `basicInfo.currentLocation` | 仅在新字段为空时移动 |
| `basicInfo.hukou` | `legacy.hukou` | 保留历史值，不猜是籍贯或户籍所在地 |
| `intent.salary` 字符串 | `intent.expectedSalary.amount` | 周期固定为 `unknown` |
| 旧字符串 `intent.currentSalary` | `intent.currentSalary.amount` | 周期固定为 `unknown` |
| `education[i].degree` | `education[i].educationLevel` | `degreeName` 不从学历推断 |
| education/work/internship/project/language/award 旧数组 | 对应 v2 数组 | 缺失 ID 时按本地稳定算法补 ID |

重复迁移不会重新生成已有 ID，也不会把历史 `hukou` 写入 `nativePlace`、`hukouLocation` 或 `currentLocation`。

## 暂不自动迁移/填写的内容

- 旧 `basicInfo.hukou` 只进入 `legacy.hukou`，Editor 会提示“旧版‘籍贯/户籍’存在历史值，请手动确认应该填入‘籍贯’还是‘户籍所在地’”。
- `nativePlace`、`hukouLocation` 没有本轮无上下文全局 alias；页面中的“籍贯”“户籍”“户籍所在地”仍 unmatched。
- `skills`、`certificates`、`languageTests`、`familyMembers`、`referrers` 目前只提供存储、Editor 和 fieldTree 能力，不添加高风险通用 alias。
- `gpa`、`gpaScale`、`studyMode`、婚姻状况等虽然有正式路径，仍要等待页面 section 和控件语义确认。
- `customFields` 保留给真正无法归类的自由字段；家庭成员、推荐人、技能、证书和 GPA 不再放入 customFields。

本轮没有实现 Moka/北森 Adapter、scopedAnswers、自动新增经历、条件问答、附件上传、声明/隐私勾选或提交。

## Canonical path 调整

新代码和 fieldTree 使用以下 canonical paths：

| 旧路径 | 新路径 |
| --- | --- |
| `basicInfo.city` | `basicInfo.currentLocation` |
| `basicInfo.political` | `basicInfo.politicalStatus` |
| `basicInfo.highestDegree` | `basicInfo.highestEducation` |
| `basicInfo.hukou` | 不自动映射；保留在 `legacy.hukou` |
| `intent.salary` | `intent.expectedSalary.amount` |
| 旧字符串 `intent.currentSalary` | `intent.currentSalary.amount` |
| `education[i].degree` | `education[i].educationLevel` |

规则入口通过 `canonicalPath()` 兼容旧 alias 目标；因此旧学习规则不会因为路径改名直接读取不到已迁移数据，同时被禁用的 `basicInfo.hukou` 不会被重新激活。

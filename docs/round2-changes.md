# Round 2 变更记录：Schema v2

基线提交：`590a53a89a858b298ecc77e4bb31810360f010ad`

生成日期：2026-09-14

本轮只处理 Snapshot Schema v2、旧 Snapshot 迁移、Editor、canonical path、seed/matcher 兼容和回归测试。Round 1.1 的安全边界保持不变；没有实现 Moka/北森 Adapter、自动新增经历、scopedAnswers、条件问答、自动上传、自动勾选声明/隐私或自动提交。

## 修改文件

- `extension/lib/schema.js`
  - Snapshot 增加 `schemaVersion: 2`。
  - 拆分 `basicInfo` 的民族、政治面貌、婚姻状况、籍贯、户籍所在地、现居住地和最高学历。
  - 将薪资定义为 `{ amount, period, currency }`，周期只接受 `month` / `year` / `unknown`。
  - 教育经历改用 `educationLevel`、`degreeName`、`studyMode`、`gpa`、`gpaScale` 等字段。
  - 为 `skills`、`certificates`、`languageTests`、`familyMembers`、`referrers` 增加正式数组模块；扩展 `award`。
  - 为所有重复记录自动补稳定 ID；ID 不进入 fieldTree。
  - 新增幂等 `migrateSnapshot()`。
- `extension/lib/util.js`
  - 增加旧路径到 v2 canonical path 的兼容转换；`basicInfo.hukou` 明确返回不可自动映射。
- `extension/lib/store.js`
  - `loadSnapshot()` / `saveSnapshot()` 经过 Snapshot migration 边界，迁移后回写 storage。
  - 保留已有 Round 1.1 rules seed/user layer 分离逻辑；规则目标也兼容 canonical path。
- `extension/editor/editor.js`、`extension/editor/editor.css`
  - Editor 继续由 Schema 驱动，支持嵌套薪资字段、新数组模块和选择项。
  - 新增记录时自动获得 ID；不显示 ID 输入框。
  - 检测到 `legacy.hukou` 时显示人工确认提示。
- `extension/content/scanner.js`、`extension/content/matcher.js`、`extension/content/learn.js`
  - 匹配和整页抓回统一经过 canonical path；保留未知 section 不使用 global alias 的安全规则。
  - 薪资 seed 使用带 `period` 的结构化 alias；显式月薪/年薪在快照周期未知或不一致时不会进入填写计划，并保留标题原文以识别括号中的单位。
- `extension/manifest.json`
  - 版本升至 `0.4.0`，与 Schema v2 编辑器和迁移代码一同发布。
- `extension/rules/seed.json`
  - 将学历、最高学历、政治面貌、所在地和薪资 alias 调整为 v2 路径。
  - 增加少量语义明确的民族、婚姻状况、教育经历字段 alias。
  - 不增加家庭成员、推荐人、技能、证书的危险通用 alias；籍贯/户籍仍不加全局 alias。
- `tests/round2.test.js`
  - 新增 Schema 默认结构、迁移、幂等、稳定 ID、fieldTree、canonical path 和 Editor 结构回归测试。
- `docs/schema-v2.md`
  - 记录完整 v2 结构、迁移规则、歧义边界和 canonical path。
- `docs/field-baseline.md`、`README.md`
  - 更新 Schema v2 字段和当前“只建模、不自动填写”的边界。

## Schema v2 最终结构

正式模块包括：

`basicInfo`、`intent`、`education[]`、`work[]`、`internship[]`、`project[]`、`language[]`、`languageTests[]`、`award[]`、`skills[]`、`certificates[]`、`familyMembers[]`、`referrers[]`、`selfEval`、`customFields`。

重复记录均有内部 `id`；`legacy` 只用于保留无法安全判断的历史值，不作为自动填写模块。

## v1 → v2 迁移规则

- 缺失 `schemaVersion` 视为 v1，返回 `schemaVersion: 2`。
- `education[i].degree` → `education[i].educationLevel`，不生成 `degreeName`。
- 旧 `intent.salary` → `intent.expectedSalary.amount`；旧字符串 `intent.currentSalary` → `intent.currentSalary.amount`；两者周期均为 `unknown`。
- `basicInfo.political`、`highestDegree`、`city` 分别迁移到 `politicalStatus`、`highestEducation`、`currentLocation`。
- 旧 `basicInfo.hukou` 仅保存为 `legacy.hukou`，不猜测目标字段。
- education/work/internship/project/language/award 以及新增数组中的旧记录缺 ID 时自动补稳定 ID。
- migration 及 store load/save 均幂等，二次加载不会更换已有 ID。

## 不能自动迁移的字段

`basicInfo.hukou` 无法区分籍贯和户籍所在地；`nativePlace`、`hukouLocation`、`currentLocation` 不从它猜测。Editor 会提醒用户手动确认。家庭成员、推荐人、技能、证书和语言考试只建模并存储，不因 Schema 新增就自动填写。

## Editor 新增模块

Editor 已显示民族、婚姻状况、籍贯、户籍所在地、现居住地；教育的学历/学位/学习形式/GPA/排名；技能、证书、语言考试、获奖扩展、家庭成员和推荐人。数组 ID 由系统维护，不显示为可编辑字段。

## 测试结果

- `node tests/round1.test.js`：PASS，Round 1.1 安全回归全部通过。
- `node tests/round2.test.js`：PASS，Schema v2 专项测试全部通过。
- 修改后的 JS `node --check`：PASS。
- `seed.json` / `manifest.json` JSON 解析：PASS。

覆盖重点：旧 Snapshot 保守迁移、迁移幂等、ID 稳定、薪资周期不猜测、hukou 不误迁移、新模块 deepGet/deepSet、fieldTree 不暴露 ID、学历 canonical path 和 Round 1.1 matcher 安全机制。

## 尚未解决的问题

- Moka/北森平台真实 section-scoped mapping、search-select 候选定位和日期 Adapter 尚未实现。
- 技能、证书、家庭成员、推荐人、GPA 等虽已能编辑和存储，尚未接入安全自动填写计划。
- 现有通用经历“添加”按钮仍关闭，未验证重复块索引和平台状态更新。

## Round 3 建议

先基于真实页面只读 DOM 和人工确认结果，为 Moka/北森分别设计小范围 Adapter 与 section-scoped alias；逐类验证 search-select、日期、重复经历添加和回读，再决定是否把新模块接入自动填写。继续保持文件、声明、隐私和提交 manual-only。

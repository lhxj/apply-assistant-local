# BEISEN_REAL_FORM_ADAPTER_01

## 样本与安全边界

本次只读检查使用任务开始时已经打开的真实页面，不重新搜索站点：

- hostname：`flyaitalent.zhiye.com`
- pathname：`/form`
- hash：空
- query：仅记录键名 `fromPage`、`jobAdId`，未保存值
- 页面状态：真实填报页，页面标题为“泛联新安x校招门户”
- 平台证据：页面包含 `Powered by Beisen`、`.form-item` 字段结构和 Phoenix 控件
- 检测结果：`BEISEN_FORM_CONFIRMED`

没有点击最终提交、预览提交、声明 checkbox、验证码或上传控件；没有输入、覆盖或保存个人敏感值。学历下拉只打开确认候选层，随后关闭，未点击候选项。

完整脱敏产物位于 `artifacts/beisen/`；它们只保存结构、标签、计数和布尔状态，不保存实际姓名、手机号、邮箱、学校、URL 参数值、token 或附件。逐字段的属性/placeholder/状态记录见 `BEISEN_REAL_SAMPLE_01_FIELD_INVENTORY.json`。

## 真实 DOM inventory

真实样本中可见区块为：个人信息、教育经历、实习经历、项目经历、获奖情况、工作经历、技能、证书、声明，以及页面外的简历上传和底部操作按钮。

字段边界是：

```text
.form-item
  ├─ .form-item__title > .form-item__text   label
  └─ .form-item__control                   control wrapper
```

确认的控件结构：

| 类型 | 真实样本结构 | 读取/交互结论 |
| --- | --- | --- |
| text | `.phoenix-input__input` | 读写 `value`，写后回读 |
| textarea | `.phoenix-textarea__realTextarea` | 读写 `value`，写后回读 |
| select | `.phoenix-select` + `.phoenix-select__input` | 必须打开 Phoenix popup，再唯一精确点击 `.phoenix-selectList__listItem` |
| date | 日期标签下的单个 Phoenix select，打开后 portal 到 `.phoenix-date-picker__wrap` | 由当前弹层真实结构区分：出生日期是完整日历；教育/经历/获奖/证书时间是年月面板；开始/结束是两个独立字段，不按 select 数量猜测 |
| radio | `.phoenix-radio-group__radioItem` / `.phoenix-radio` | 点击 option；空样本没有 selected marker 时读状态为 unknown，禁止覆盖 |
| checkbox | 原生 checkbox | 3 个“至今”属于重复经历；声明 checkbox 为 manual-only |
| file | `input[type=file]`，隐藏于上传容器 | 只识别，不设置文件、不上传、不删除 |
| submit | `button` 文本“预览并提交” | 识别为 `unknown` + `safetyRole=submit`，不进入自动填报 |

观察到 43 个可见 `.form-item`、7 个重复表单组、2 个 file input、4 个 checkbox 和 3 个底部 button。没有观察到 native select、native radio、cascader、验证码、错误提示或删除按钮。required 标记只在可访问性树中可见，DOM 没有稳定的 `aria-required`、`name`、`id` 或 required class，因此 Adapter 返回 `required=null`，不猜测 required。

下拉候选层通过 body portal 出现，打开“最高学历”时观察到候选项：小学、初中、高中、中技（中专/技校/职高）、高技、大专、本科、硕士研究生、MBA、博士研究生、EMBA、MPA。没有点击候选项，也没有改变页面值。

## 本轮 Phoenix 日期与获奖级别调查

本轮仍使用同一个 `BEISEN_REAL_SAMPLE_01`，只打开控件读取 DOM，没有点击任何候选、输入值或改变字段。

- 出生日期打开后出现一个可见 `.phoenix-date-picker__wrap`，内部是 `.phoenix-calendar-table`，有 `.phoenix-calendar-year-select`、`.phoenix-calendar-month-select` 和 `td.phoenix-calendar-cell`；跨月日期带 `last-month` / `next-month` class，当前月日期没有该标记。该控件是完整 date picker，支持 `YYYY-MM-DD`。
- 教育开始时间打开后出现 `.phoenix-calendar-month-panel`，内部是 `.phoenix-calendar-month-panel-year-select` 和 `.phoenix-calendar-month-panel-cell`；年份按钮会打开 `.phoenix-calendar-year-panel`。该控件是年月选择，支持 `YYYY-MM`，不应猜测日。
- 日期 popup 不是全局候选列表。当前实现要求触发控件带 `.phoenix-select--active`，且页面上恰好只有一个可见 `.phoenix-date-picker__wrap`；候选只在该 popup 内查找。无法证明关联关系时安全失败。
- 普通 Phoenix select 同样要求当前控件是唯一 active 控件，并且只在唯一可见 `.phoenix-selectList` 内做精确匹配。
- 获奖级别真实候选为：班组级、院校级、县市级、省区级、国家级、国际级、公司级、集团级。Snapshot 的“省级”因此只做已证实的精确转换 `省级 → 省区级`；“国家级”保持原文。没有加入 contains 或候选顺序匹配。

本轮代码新增 `readDate` / `writeDate` / `verifyDate` / `clearDate`，日期写入按“年份 → 月份 →（完整日期时）日期”执行，并在 Adapter 内先做一次真实 readback；最终仍由 Core 的双回读验证负责确认。实习经历在 Beisen provider scoped aliases 中补齐：`单位名称 → company`、`职位名称 → title`、`开始时间 → start`、`结束时间 → end`、`实习内容 → desc`。未知 section 的“单位名称”不生成 internship path。

## 重复组与 identity

样本重复组使用生成的 `div.form`，其 id 含 `Recruitment_extPerfect`。生成 id 不是长期 identity；Adapter 使用区块标题和同区块 DOM 顺序：

```text
sectionKey + itemIndex + fieldKey
education + 0 + school
education + 1 + school
```

当前样本每个教育/实习/项目/工作/获奖/技能/证书区块有一个 item，运行时 `itemIndex=0`。结构允许后续多个 item，但“添加经历”按钮只被识别为候选结构，`findAddButton()` 始终返回 `null`，所有 `capabilities.addItem` 都是 `false`。

## 修复前 baseline

修复前基线来自同一页面的原 scanner 逻辑，未编辑 JSON：

- 80 条结果：text 66、textarea 12、file 2
- 40 个 `.form-item` 被内部 `.form-item__control` 再扫描一次
- section 全为空，重复经历没有稳定 item identity
- 17 个 Phoenix select/date 被误判为 text
- 自定义 radio 为 0
- “至今”、声明、简历上传和最终提交均未进入扫描结果
- 手机号只保留 `hasValue=true`，不保存实际值

分类：`WRONG_WRAPPER`、`WRONG_LABEL`、`WRONG_CONTROL_TYPE`、`DUPLICATE_FIELD`、`HIDDEN_INTERNAL_NODE`、`DYNAMIC_GROUP_LOSS`、`FIELD_NOT_DISCOVERED`、`UNKNOWN_BUT_VALID`、`READBACK_MISMATCH`、`OTHER`。条件显示在本样本未触发，不能据此声称已经覆盖。

原始脱敏结果：`artifacts/beisen/BEISEN_SCAN_BASELINE.json`，人工摘要：`BEISEN_SCAN_BASELINE.md`。

## 修复内容与 after scan

`BeisenAdapter.scanFields()` 仅在 `/form` 且同时存在真实表单 DOM 证据时工作；非表单 zhiye 页面返回空结果，其他 hostname 返回 `undefined` 由 Registry 回退 Generic。当前 Adapter：

- 以 `.form-item` 为唯一业务字段 wrapper；不把内部 control wrapper 当成字段。
- 从 `.form-item__text` 恢复 label，并保留 rawLabel。
- 识别 text、textarea、Phoenix select、date、radio、checkbox、file。
- 将动态“至今”、声明、file、提交隔离为独立安全边界。
- select 只允许唯一精确候选；多候选或无法回读时失败。
- radio 没有可靠 selected marker 时标记 `readStateUnknown`，已有值保护优先。
- `captureControl`、`readControl`、`writeControl`、`verifyControl`、`clearControl` 走 provider-first；不支持的 kind 返回安全失败。
- 籍贯虽能发现，但 seed/matcher 不提供无上下文自动路径。
- 不自动新增经历、不上传附件、不勾选声明、不触发提交。

after 结果为 49 条：43 条业务字段和 6 条安全/人工边界字段；text 16、textarea 6、select 6、date 11、radio 3、checkbox 4、file 2、unknown 1。相对于 baseline：字段 80→49，减少 31 条；重复字段 40→0；radio 0→3；Phoenix select/date 从 text 中恢复为 select/date；重复组获得 sectionKey + itemIndex；安全控件进入 manual-only/unknown。

after 与差异文件：

- `artifacts/beisen/BEISEN_SCAN_AFTER.json`
- `artifacts/beisen/BEISEN_SCAN_AFTER.md`
- `artifacts/beisen/BEISEN_SCAN_DIFF.json`

## 规则证据等级

sample-confirmed：`.form-item` wrapper/label/control 关系、Phoenix select/radio/textarea/file class、候选 portal、生成表单组的结构、当前页面的区块标题和字段语义。

保守通用化：严格 hostname 边界、`/form` + DOM evidence 门禁、sectionKey 使用 Schema v2 block、同 section DOM 顺序作为运行时 itemIndex、provider-first fallback。

尚未确认：第二个北森站点的 wrapper 变体、真正多条经历新增后的索引、已选 radio 的所有 class/aria 变体、已填日期/下拉的全部回读格式、cascader、验证码、错误态和条件字段。它们没有被提前实现。

## Fixture 与测试

新增 `tests/fixtures/beisen/real-form-01.html`，只保留脱敏后的 wrapper、控件关系、重复组、文件、声明和提交按钮；没有真实个人数据或真实 URL 参数。

新增 `tests/beisen-adapter.test.js`，覆盖：hostname 边界、真实表单证据、非表单隔离、wrapper/label、hidden file、radio、Phoenix select、date、重复组 identity、已填保护、capture、clear、submit/declaration manual-only、重复候选安全失败和 Generic fallback。测试使用最小 fixture，不宣称它替代第二个真实站点样本。

## 与 Moka / Core 的影响

没有修改 Moka Adapter、Moka selector 或 Moka fixture。共享 Core 只做了必要的 provider 入口/安全门禁调整：`detect.js`、`main.js` 和 writer 的清空前读取保护；现有 Round 1/2 与 Adapter Contract 测试继续回归。

## 后续缺口

在统一审查前不继续扩展。下一次若要提高覆盖，应先采集另一家 zhiye.com 填报页，并在脱敏 fixture 中确认：已选 radio、已填 select/date、真实多 item 新增后的重扫、地区/学校 cascader、条件显示和错误提示。仍需保持附件、声明、验证码和最终提交 manual-only。

## 本轮二次 E2E 环境状态

本轮代码与脱敏 fixture/unit 测试已完成，但当前连接的 Codex 内置浏览器没有加载该扩展：页面运行时不存在 `window.__WSZ`，且真实页面当前只有一个教育经历区块。因此没有执行 Snapshot 导入、一键填写或真实页面写入，也没有生成虚假的 plan/filled/verified 统计。要执行二次 E2E，需要用户连接一个已加载扩展的浏览器，并先手动准备两个教育经历区块；仍不得开启 `addItem`。

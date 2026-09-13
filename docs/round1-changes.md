# Round 1 变更记录

生成日期：2026-09-13

## 本轮范围

本轮只处理 Moka 和北森，目标是建立真实页面字段/结构基线并修复高风险误填路径。没有实现完整 MokaAdapter、BeisenAdapter、Schema v2、scopedAnswers、自动提交或自动附件上传。

## 修改文件

- `extension/content/detect.js`
  - 改为完整主机名边界匹配，不再使用宽松的 `includes`。
  - `app.mokahr.com` 识别为 Moka；`*.zhiye.com` 通过 `zhiye.com` 根域规则识别为北森。
- `extension/content/scanner.js`
  - 默认控件类型改为 `unknown`。
  - 纳入 `input[type=file]`，并识别 radio/file 控件。
  - 对隐藏在可见 label/上传容器中的 radio/file 保留识别机会。
  - 日期/range 需要标签语义确认，不再用 2 个或 4 个 select 直接猜测。
  - 增加北森动态字段容器的保守兜底选择器和短文本标签退化识别。
- `extension/content/matcher.js`
  - file、声明/隐私/提交类和 unknown 字段进入 manual 报告，不进入自动填写计划。
- `extension/content/writer.js`
  - 增加 radio 写入。
  - 原生和自绘下拉均改为唯一精确候选；多候选或无精确候选时跳过。
  - 每次写入后回读；只有回读匹配才计入 `verified`/“已验证”。
  - 日期范围写入前先检查结构是否足够，不对不完整范围做部分猜填。
  - 清空流程不自动处理 file/radio/unknown。
- `extension/content/learn.js`
  - 支持读取 radio；跳过 file、声明/隐私/提交类字段，避免将敏感操作学习成自动规则。
- `extension/content/main.js`、`extension/content/panel.js`
  - 面板显示已验证数量和 manual-only 数量/原因。
- `extension/lib/store.js`
  - 内置 seed 存在 `wsz_seed_rules`，用户学习规则存在 `wsz_user_rules`。
  - 从旧版 `wsz_rules` 迁移用户规则；插件 seed 版本升级时刷新 seed，同时合并保留用户规则。
  - 迁移旧规则时移除不安全的全局“联系电话”映射。
- `extension/rules/seed.json`
  - 版本升至 2。
  - 北森增加 `zhiye.com` 根域规则。
  - 移除全局 `联系电话` → `basicInfo.phone`。
  - 仅补充少量低风险 alias：Moka“意向工作城市”、北森“意向工作地点/地” → `intent.cities`；北森“期望从事职业” → `intent.position`。
- `extension/manifest.json`
  - 版本升至 `0.3.0`。
- `README.md`
  - 更新域名识别、写后验证、manual-only 和规则分层说明。
- `tests/round1.test.js`
  - 新增 Node 内置断言回归测试。
- `docs/field-baseline.md`、`docs/platform-dom-notes.md`
  - 新增 Excel 字段基线和真实页面结构基线。

`extension/lib/schema.js` 本轮保持不变，避免扩大为 Schema v2。

## Excel 中的 Moka/北森统计

从 `docs/网申字段填写模板_三平台.xlsx` 明细行统计，并排除顶部汇总行：

| 平台 | 明细行 | 明确必填 | 选填 | 条件 | 提交相关 |
| --- | ---: | ---: | ---: | ---: | ---: |
| MokaHR | 38 | 3 | 34 | 0 | 1 个提交选项 |
| 北森 | 110 | 56 | 50 | 3 | 1 个提交条件 |

字段分类和完整字段清单见 [field-baseline.md](field-baseline.md)。前程无忧没有纳入本轮统计和代码处理。

## 真实页面验证到的控件

### Moka

只读结构中确认了申请信息、个人信息、求职意向、工作/教育/实习/项目经历、语言能力、自我描述、获奖经历和更新说明区块。确认了：

- 普通文本输入、textarea。
- 个人信息和语言能力中的自绘选择框。
- 工作/实习/项目四段年月起止选择、教育四段就读时间选择、获奖年月选择。
- 重复经历区块及“添加”按钮。
- “至今”和“同步更新在线简历”复选框。
- “预览并提交”按钮。

当前 Moka 页面没有看到可见的文件上传或 radio group。

### 北森

只读结构中确认了上传简历、个人信息、教育、实习、项目、获奖、工作、技能、证书和声明区块。确认了：

- 简历/证件照上传入口。
- 文本输入和带字数提示的 textarea。
- 性别、是否全日制、是否可提前实习等单选组。
- 出生日期、籍贯、学历、政治面貌和经历日期的自绘 search-select/date 入口。
- 教育、实习、项目、获奖、工作、技能、证书重复块及对应“添加”按钮。
- “至今”复选框和声明复选框。
- 暂存、取消、预览并提交按钮，以及页面隐私政策入口。

本次没有展开候选列表、点击候选、上传文件或修改任何字段值；因此下拉的安全实现采用“真实打开 + 唯一精确候选 + 回读验证”。

## 测试结果

执行命令：`node tests/round1.test.js`，结果为 `PASS round1 regression tests`。

| 测试项 | 结果 |
| --- | --- |
| `app.mokahr.com` → Moka | PASS |
| `szly.zhiye.com` → 北森 | PASS |
| `flyaitalent.zhiye.com` → 北森 | PASS |
| `fake-mokahr.com` 不误识别 | PASS |
| 家庭成员/推荐人“联系电话”不映射本人手机号 | PASS |
| radio 生成计划并精确写入 | PASS |
| file 进入 manual-only，不生成写入计划 | PASS |
| 写入成功后回读并计为 verified | PASS |
| 写入失败/回读不一致不计为 verified | PASS |
| 下拉多候选不自动点击 | PASS |
| 新 seed 与用户旧规则同时保留 | PASS |
| Scanner 默认 unknown、保留 file、取消数量猜测 | PASS（源码不变量回归） |
| 修改脚本语法检查 | PASS |

真实页面端到端写入、上传、勾选声明/隐私和提交均未执行，这是本轮明确的保护性限制，不是测试失败。

## 第二轮候选

- 完整北森 section-scoped mapping，尤其是家庭情况、推荐人和附加信息。
- Moka/北森各类 search-select 的平台专用候选层定位和回读策略。
- 出生日期、年月、起止年月的真实日期组件 Adapter。
- 重复经历的添加、删除和索引稳定性验证。
- 技能、证书、家庭、推荐人等 Schema 扩展设计。
- 条件问答的前置条件关联；不引入无作用域的全局 alias。
- 在用户明确确认后，设计人工确认清单；本轮仍不自动提交、不自动上传、不自动勾选声明/隐私。
- 前程无忧第三平台基线与实现。

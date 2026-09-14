# Adapter 协作底座（Round 2.5 / 2.6）

本文件冻结 Core 与平台 Adapter 之间的协作边界。Round 2.5/2.6 先建立接口；本轮 `beisen.js` 在真实样本 `BEISEN_REAL_SAMPLE_01` 上增加了保守的北森表单识别和控件处理。它不是“所有 zhiye.com 页面都可直接填报”的承诺，未被样本确认的控件仍然降级为 `unknown`/manual。

```text
Core scanner
  ↓ legacy field → FieldDescriptor 兼容入口
Adapter Registry
  ├─ Generic
  ├─ Moka（空壳）
  └─ Beisen（真实样本确认的保守实现）
  ↓ provider-first、field-level fallback
Core matcher → writer → verify
Core learn → capture / clear
```

## Adapter Contract

Adapter 以普通对象提供 `key`、`capabilities` 和可选方法。当前约定的方法签名如下：

```js
{
  key,

  scanFields(context),

  getFieldContainers(context),
  getSection(container, context),
  getRepeaterItem(container, context),

  classifyControl(field, context),

  readControl(field, context),
  writeControl(field, value, context),
  verifyControl(field, value, context),
  captureControl(field, context),
  clearControl(field, context),

  findAddButton(section, context)
}
```

所有方法都是可选的。调用统一经过 Registry：

- `scanFields(providerKey, context)`：Provider 优先的主扫描入口。Provider 可以完整返回字段，也可以调用 `context.genericScanFields()` 后增补或修正结果。Generic 实现直接调用现有 `NS.scanFields()`。
- `captureControl(providerKey, field, context)`：更新 Snapshot 的字段读取入口。
- `clearControl(providerKey, field, context)`：清空字段入口。
- 其他方法通过 `NS.adapterRegistry.invoke(providerKey, method, args)` 调用。

Provider-first 的回退顺序固定为：

1. 先调用当前 Provider Adapter；
2. 方法缺失、返回 `undefined` 或抛出异常时，回退 Generic；
3. Generic 也无法处理时返回 `undefined`/安全失败值，由 Core 报告为 unsupported/manual。

结构方法的同步边界固定如下：

- 同步：`scanFields`、`getFieldContainers`、`getSection`、`getRepeaterItem`、`classifyControl`、`findAddButton`；
- 可异步：`readControl`、`writeControl`、`verifyControl`、`captureControl`、`clearControl`。

Registry 对同步结构方法使用 `invokeSync()`。如果 Provider 错误地返回 Promise，会立即视为该方法不可用并回退 Generic；`normalizeField()` 不等待也不保存 Promise，因此 `section`、`repeater`、`kind` 等描述字段始终是同步值。

Provider Adapter 不应修改全局 `NS` 的匹配规则，也不应绕过 Core 的写后双回读验证。

`NS.adapterRegistry.get("moka")` 返回空壳；`get("beisen")` 返回真实样本确认的保守实现。未知 key 返回 Generic。可以使用 `register(adapter)` 添加未来的 Provider 实现。Core 的 `detect.js` 只根据 hostname 返回 provider；Beisen Adapter 自己在 `formEvidence()`/`scanFields()` 中检查 `/form`、`.form-item`/`.form-item__text`/`.form-item__control` 与 Phoenix/生成表单证据。证据不足时返回空字段列表，不把职位详情页交给 Generic 自动填写。

## FieldDescriptor

平台无关的字段描述至少包含：

```js
{
  provider: "moka" | "beisen" | "generic",
  section: "教育经历",
  sectionKey: "education", // Schema v2 canonical block；flat 区块为 null

  repeater: {
    itemIndex: 0,            // 非重复区块为 null
    itemElement: HTMLElement | null
  },

  label: "学校",
  rawLabel: "学校（必填）",
  kind: "text" | "textarea" | "select" | "search-select" | "radio" | "checkbox" | "date" | "range" | "file" | "unknown",
  container: HTMLElement | null,
  controls: HTMLElement[],
  required: true | false | null,
  confidence: 0.0
}
```

当前 `scanner.js` 不重写。它只额外暴露现有容器发现函数作为 Generic 的兼容入口；`NS.adapterRegistry.normalizeField(s)` 将旧字段结果转换为上述兼容结构，并保留 `index`、`textControls`、`selectControls` 等旧字段供 Round 1/2 Core 使用。已知 Schema v2 重复区块的旧 `index` 只作为过渡性的 `itemIndex`；后续 Moka/北森 Adapter 必须从真实 repeater item 提供准确的 `itemIndex` 和 `itemElement`。

`container`、`controls`、`repeater.itemElement` 只存在于运行时，不能写入 Snapshot、规则 storage 或导入导出 JSON。

## Generic Adapter 与 Core 边界

Generic 保留当前通用 scanner 结果的字段级行为：控件分类、读值、写值、验证和“添加经历”安全失败。Writer 将实际写入与验证核心实现暴露为内部 hook，由 Generic 调用；Provider Adapter 可以在字段级覆盖这些 Contract 方法。

当前主流程统一通过 `adapterRegistry.scanFields()` 获取并规范化扫描结果，不再直接调用 `NS.scanFields()`。填写、读取和验证通过 Registry 传给 Writer；更新 Snapshot 的读取通过 `adapterRegistry.captureControl()` 传给 learn.js；清空通过 `adapterRegistry.clearControl()` 传给 Writer。Matcher 仍负责 Schema/canonical path，Writer 仍负责节奏、控件动作和至少两次稳定回读。

Generic 的 `captureControl()` 保留现有 `captureValue()` 行为；Generic 的 `clearControl()` 保留通用安全清空能力。`file`、`unknown` 和其他不支持的 kind 返回失败，不会被计为已清空。空壳 Moka 不实现这些方法，自动回退 Generic；Beisen 对本样本确认的 Phoenix text/textarea/select/date/radio/checkbox 提供 provider-first 处理，file、声明、提交、验证码仍 manual-only。

`manualOnly === true` 是 Matcher 的第一优先级安全门：字段直接进入 `manual`，不会解析 alias、读取 Snapshot 或进入 `plan`。可选的 `manualReason` 优先作为人工原因；缺失时使用通用原因。该能力适用于所有 Provider，不是 Beisen 专属规则。

`container`、控件动作和页面读取只存在运行时。Provider 可以返回自己的 FieldDescriptor，但不得把 DOM Element 或运行时 context 写入 storage。

## 学习范围

`NS.adapterRegistry.learningTarget(field, targetPath, context)` 只负责分类，不在本轮扩展 storage schema：

- `flat`：例如 `个人信息 / 姓名 → basicInfo.name`；
- `repeater`：例如 `教育经历 / 学校 → education[1].school`，返回 `sectionKey: "education"`、`itemIndex: 1`、`fieldPath: "school"`；
- `section-scoped`：例如 `家庭情况 / 姓名 → familyMembers[0].name`，返回 `sectionKey: "familyMembers"`、`itemIndex: 0`、`fieldPath: "name"`。

重复模块绝不能被保存成：

```text
provider alias: 姓名 → familyMembers[0].name
```

正确的后续表达应当是：

```text
sectionAliases:
  家庭情况 → familyMembers

scopedAliases:
  familyMembers:
    姓名 → name
```

本轮对 `section-scoped` 目标只做分类并阻止扁平 alias 写入；具体 section alias、家庭成员/推荐人自动填写留到后续平台 Adapter 设计。

## Add Item 能力

Contract 保留 `findAddButton()`，但 Generic、Moka、Beisen 的 `capabilities.addItem` 当前均为关闭状态，`findAddButton()` 返回 `null`，主流程不调用 `ensureItemCount()`。任何未来启用都必须按 section 明确声明，例如：

```js
capabilities: {
  addItem: {
    education: false,
    work: false
  }
}
```

并先完成真实 DOM、点击后重扫和写后验证测试。

## Core 冻结清单

以下文件属于共享 Core，平台开发者默认不能直接修改：

```text
extension/lib/schema.js
extension/lib/store.js
extension/lib/util.js
extension/content/scanner.js
extension/content/matcher.js
extension/content/writer.js
extension/content/learn.js
extension/content/main.js
extension/content/adapters/registry.js
extension/content/adapters/generic.js
```

平台开发者主要修改：

```text
extension/content/adapters/moka.js
extension/content/adapters/beisen.js
tests/fixtures/moka/*
tests/fixtures/beisen/*
tests/moka-adapter.test.js
tests/beisen-adapter.test.js
```

以及各自 provider rule。Beisen 的选择器只使用真实样本确认的结构关系和语义 class，不使用客户名、职位 ID、随机 group id 或 hash class 作为长期 identity。

## Beisen 样本规则边界

- `BEISEN_REAL_SAMPLE_01`：`flyaitalent.zhiye.com/form`，只保存 hostname/path/query key，不保存 query value 或表单个人数据。
- sample-confirmed：`.form-item` 字段边界、`.form-item__text` 标签、`.form-item__control` 控件容器、Phoenix select/radio/textarea/file 结构、`div.form[id*="Recruitment_extPerfect"]` 重复组、body portal 下的 `.phoenix-selectList__listItem` 候选。
- 保守推断：同一 section 的 DOM 顺序用于当前运行时 `itemIndex`；后续仍需第二个北森站点和新增/删除后的样本复核。
- 未确认：cascader、验证码、错误态、已选 radio 的真实 class 变体、已填日期/下拉的全部回读格式。未确认内容不自动升级为可填写规则。
- Generic 的 `ensureItemCount` 和所有 Adapter 的 `addItem` 仍关闭。

## Core Change Request

平台 Adapter 遇到 Core 无法解决的问题时，先提交以下格式的请求，不要把平台逻辑直接塞进 Core：

```text
问题：
为什么平台 Adapter 自身无法解决：

建议新增的公共接口：

是否可能影响另一平台：

最小修改范围：
```

Core 变更必须保持 Generic fallback、安全门禁、manual-only 和现有 Round 1/2 回归测试通过。

# Moka 真实样本证据（结构记录，不含任何个人数据）

样本页面：`app.mokahr.com` 投递页（`#/job/<id>/apply`）与简历编辑页（`#/candidateHome/resume`）。
只记录结构与语义 class 前缀；哈希后缀（如 `title-IWWQ0Xa4L7`）不作为长期 identity。
本目录不放含真实表单值/姓名/联系方式的快照或 HTML。

## 区块结构

```
div.apply-block-*                区块容器（基础信息为 basic-block-*）
├─ div.blockTitle-*              区块标题（重复区块内嵌「添加」按钮，取标题需剔除）
└─ div.apply-fields-*.multi-*    repeater item；同一 block 下出现 N 个 = N 条经历
   └─ div.apply-field-*.<语义类>-*.apply-filed-padding-*
      ├─ div.title-*             字段标签（必填带 span.required-asterisk-*）
      │                          （简历页基础信息为 filed-title-*）
      └─ div.ctrl-*              控件容器
```

## 字段语义类（apply-field 上的稳定前缀）

| 语义类 | 控件 | 适配 |
| --- | --- | --- |
| `string_info` | 单行文本 | 读写清 |
| `text_info` | 多行文本 | 读写清 |
| `Select-` / `select_info` | sd-Select 自绘下拉（可输入过滤） | 读写清 |
| `date_info` | `month-range-select`：2 下拉=单点年月，4 下拉+至今 checkbox=起止年月 | 读写清 |
| `day_info` | 日历选择（readonly input） | 只读；不写入 |
| `location_info` / `cascader-` | 级联选择 | 只读；不写入 |
| `file_upload` | 文件上传 | manual-only |
| `confirm_info` | 声明/承诺勾选 | manual-only |

## 自绘下拉弹层

选项**就地渲染在被点开控件自己的 `sd-Dropdown-container` 内**（不是 body portal）：

```
sd-Select-menu-* > sd-Select-scrollable-* > sd-Select-common-item-*
> sd-Menu-container-* > sd-Menu-content-* > span.option-label-*
```

**年月下拉（`month-range-select` 内）的选项结构不同**：选项是
`span[data-key="sugar.select.label"]`（没有 `option-label-*` 类）。
年份列表倒序渲染（2126 → 1926）；有的表单全量渲染（201 项直接在 DOM），
有的表单是虚拟列表，必须先向输入框键入文本过滤、目标年份才会出现在 DOM。

写入策略：点开 → 只在该控件容器内找 `[class*="option-label-"], [data-key="sugar.select.label"]`
→ 唯一精确候选才点击；0/多候选放弃；失败且输入框非只读时，输入目标文本过滤后重试点选；
点击后由 Core 双回读验证。

## 远程搜索下拉（学校/专业）

`string_info` 语义但输入框在 `sd-Select-container` 内（`sd-Dropdown-container > label`），
是"键入检索型"组合框：

- 键入文本触发**服务端检索**（需要完整键序列：keydown → 原生赋值 → input/change → keyup），
  候选行渲染在同一 `sd-Dropdown-container` 内，结构为嵌套两行
  （外层 `sd-list-item-*` / `内层 sd-Menu-*-item-*`），列表底部固定有
  「没有找到学校？添加学校全称」兜底行（不是候选，禁止点击）。
- 写入：唯一精确匹配的**叶子行**才点击；提交后值进入 display-value，输入框被清空（过滤盒）。
- 清除：hover 组件才渲染 `sd-Input-clear-*`（×），点击即清空（已实证）。

## 基础信息（账号级只读）

简历页「基础信息」区块（`basic-block-*` > `field-*`）的姓名/手机/邮箱输入框带 `disabled`，
属于账号信息，页面本身禁止修改 → 分类 manual-only，不计入填写失败。

## 安全边界（真实页面确认存在）

- `file_upload`（上传简历）、`confirm_info`（个人声明/更新说明）：manual-only
- 「保存」提交按钮、「同步更新在线简历」入口：标记 safetyRole，禁止自动处理
- 自动新增经历：`capabilities.addItem.* = true`（education/work/internship/project/award/language），
  `findAddButton` 定位区块标题行内「添加」按钮，`ensureItemCount` 按快照条数补齐后重扫（已实证）

## 单元测试

`tests/moka-adapter.test.js` 用 FakeElement 按上述结构构造 fixture（无真实数据），
覆盖：section 识别、repeater itemIndex 与 DOM 乱序不串项、语义类控件分类、
下拉唯一/多候选、date/range/至今、年份虚拟列表输入过滤、搜索下拉写读清、
禁用控件 manual-only、range 空读不跳已有值、ensureItemCount 添加-重扫、
capture、clear、manual-only、Generic fallback。

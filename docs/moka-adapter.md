# Moka Adapter 开发文档

基于真实 Moka 网申页面（`app.mokahr.com` 投递页 + 简历编辑页）确认的保守实现。
原则：**填对 > 少填 > 多填**。不确定的控件只读不写入，绝不猜。

## 激活边界

- 仅 hostname 匹配 `mokahr.com`（完整主机名边界，排除 `fake-mokahr.com`）；
- DOM 需同时具备 `apply-field-*`（含 input/textarea）与 `apply-block-*`/`basic-block-*` 才判定 `MOKA_FORM_CONFIRMED`；
- Moka 域名但无表单结构（职位列表等）→ 返回 `[]`，不接管；非 Moka 域名 → `undefined`，回退 Generic。

## 已支持 section

申请信息 / 校招站点 / 上传 / 基础信息 / 个人信息 / 求职意向 / 其他信息 / 自我描述 /
声明 / 更新说明（flat）；工作经历 / 实习经历 / 项目经验（项目经历）/ 教育背景（教育经历）/
语言能力 / 获奖经历（repeater）。长标题变体（如「校招站点（本次校招……）」）按前缀归并。

## repeater（真实 DOM item，禁止"同名字段第 N 次"）

- `itemElement` = 字段容器最近的 `[class*="apply-fields-"]` 祖先；
- `itemIndex` = 该 itemElement 在同一 `apply-block` 内、同层 apply-fields 序列中的 DOM 顺序；
- 区块标题剔除内嵌「添加」按钮文字后再归一化；
- 测试覆盖 DOM 乱序重扫不串项（identity 跟随 itemElement）。

## 已支持控件（read / write / verify / capture / clear）

| 控件 | 语义类 | write | 说明 |
| --- | --- | --- | --- |
| 单行文本 | `string_info` | ✔（Core） | |
| 多行文本 | `text_info` | ✔（Core） | |
| 自绘下拉 / search-select | `Select-` / `select_info` | ✔ | 选项就地渲染在本控件容器内（`option-label-*`）；唯一精确候选才点击；0/多候选跳过；失败可输入过滤重试一次；写后 Core 双回读 |
| 单点年月 | `date_info`（2 下拉） | ✔ | 拆 `YYYY.MM` 为年/月两次下拉选择 |
| 起止年月 | `date_info`（4 下拉 + 至今） | ✔ | start/end 各两次选择；`至今` 走 checkbox |
| 勾选框 | 普通 checkbox | ✔（Core） | |

## unsupported / manual-only（只读或完全不动）

| 控件 | 原因 |
| --- | --- |
| `day_info` 日历选择 | readonly + 日历组件，写不稳；可 capture |
| `location_info` / `cascader-` 级联 | 多级联动未验证；可 capture 显示文本 |
| `file_upload` 文件上传 | 安全边界 |
| `confirm_info` 声明/更新说明 | 安全边界（safetyRole: declaration） |
| 「保存」提交按钮 | safetyRole: submit |
| 「同步更新在线简历」 | safetyRole: sync |
| 验证码 | safetyRole: captcha |
| 自动新增经历 | `capabilities.addItem.* = false`，`findAddButton()` 返回 null |

## seed.json（仅 providers.moka）

- `sectionAliases`：申请信息/校招站点/上传/声明/更新说明/自我描述 → `_flat`
- `aliases`：籍贯 → `basicInfo.nativePlace`（location_info 级联为 manual，别名供 capture/规则视图使用）

## Core Change Request

无。全部需求均在 Adapter Contract 内解决，未修改任何 Core 冻结文件。
唯一测试侧调整：`tests/adapter-contract.test.js` 空壳期断言
`moka.writeControl === undefined` 已更新为 `typeof === "function"`（实现落地的必然结果）。

## 测试

`node tests/moka-adapter.test.js`：section / repeater itemIndex / DOM 乱序不串项 /
Generic fallback / search-select 唯一候选 / 多候选拒绝 / date / range / 至今 /
capture / clear / manual-only / addItem 关闭。fixture 为 FakeElement 构造，无个人数据；
真实页面结构证据见 `tests/fixtures/moka/README.md`。

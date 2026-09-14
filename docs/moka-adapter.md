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
| 单行文本 | `string_info` | ✔（Core） | 输入框被页面 `disabled`（基础信息 姓名/手机/邮箱为账号级只读）时转 manual-only，不判填写失败 |
| 多行文本 | `text_info` | ✔（Core） | |
| 远程搜索下拉（学校/专业等） | `string_info` + `sd-Select-container` | ✔ | `searchCombo`：键入完整键序列触发服务端检索 → 候选行（`[class*="-item-"]`，嵌套取叶子）唯一精确匹配才点击；无候选/多候选清掉键入文本并诚实失败；回读取 display-value |
| 自绘下拉 / search-select | `Select-` / `select_info` | ✔ | 选项就地渲染在本控件容器内（`option-label-*` 或 `span[data-key="sugar.select.label"]`）；唯一精确候选才点击；0/多候选跳过；失败可输入过滤重试一次；写后 Core 双回读 |
| 单点年月 | `date_info`（2 下拉） | ✔ | 拆 `YYYY.MM` 为年/月两次下拉选择；年月选项为 `span[data-key="sugar.select.label"]`，年份列表可能是虚拟/倒序渲染，直接点选失败时自动改走「输入过滤后点选」（只读输入框除外） |
| 起止年月 | `date_info`（4 下拉 + 至今） | ✔ | start/end 各两次选择，同样享有输入过滤兜底；`至今` 走 checkbox |
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
| 页面 `disabled` 的控件（如基础信息 姓名/手机/邮箱） | 账号级只读，写入必失败；manual-only 转人工 |

## 清空（clear）真实页面结论

- 普通下拉 / 搜索下拉：有值且 **hover 时才渲染** `sd-Input-clear-*`（×），先 hover 再点，可清空（已实证）。
- 年月下拉（`month-range-select` 内 4 个 select）：**无清除按钮**（hover 也只有箭头）、菜单内无清除项、
  反点已选选项不会取消、合成/真实 Backspace 均无效 → `clearControl` 对 date/range 诚实返回 false，
  「清空表单」时这些字段需用户手动处理（Moka 该版本 UI 本身也不提供清除）。
- 未点「保存」前刷新页面即可丢弃全部未保存修改（Moka 简历页不自动保存，已实证）。

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
年份虚拟列表输入过滤 / 只读输入框放弃过滤 / capture / clear / manual-only / addItem 关闭。
fixture 为 FakeElement 构造，无个人数据；真实页面结构证据见 `tests/fixtures/moka/README.md`。

## 真实页面验证记录

- 2026-09-14，博世校招 Moka 表单（`app.mokahr.com/campus-recruitment/bosch/...#/candidateHome/resume`）：
  扫描识别 38 个字段（教育背景/工作经历/实习经历/项目经验等 repeater 均正确），
  对「教育背景 · 就读时间」执行 `writeControl {start:"2024.09", end:"2027.07"}` 返回 true，
  回读 `{start:"2024.09", end:"2027.07"}`，并截图确认页面显示一致。
- 该页面年份列表实际为全量渲染（2126–1926 共 201 项，倒序），直接点选即可命中；
  输入过滤路径作为其他 Moka 表单虚拟列表的兜底保留。
- 2026-09-14，openloong Moka 表单（`app.mokahr.com/campus-recruitment/openloong/...#/candidateHome/resume`）回归：
  38 字段识别一致；「教育背景 · 学校名称」搜索下拉写入「华中科技大学」成功（回读/验证一致），
  hover 唤出 × 后清空成功；「基础信息 · 邮箱」确认为 `disabled`，分类 manualOnly、写入拒绝；
  起止年月 range 写入-回读-验证通过；实验残留值已通过 × 清空与刷新（未保存）全部还原。
- 排障经验：后台/被冻结标签页中 `setTimeout` 会被浏览器节流甚至完全暂停，
  依赖 `sleep` 的写入链会表现得像"卡死"。真实使用场景是用户在当前标签页主动点击插件，
  标签页处于前台，不受影响；做 WebBridge 远程验证时可先 `Page.bringToFront` 激活标签页，
  或把 `NS.sleep` 换成微任务让权（仅限无网络往返的场景——搜索下拉的服务端检索必须真实计时器）。

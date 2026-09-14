请负责开发 `MokaAdapter`。

上游仓库：

`https://github.com/zhourunnan1210/apply-assistant-local`

当前 `main` 已包含 Schema v2 和 Adapter Contract。请从最新 `main` 创建：

`feat/moka-adapter`

不要直接在 `main` 开发。

## 目标

基于真实 Moka 网申页面，实现可靠的：

- section 识别
- repeater item 识别
- 控件分类
- read / write / verify
- capture / clear

原则：

**填对 > 少填 > 多填。**

不确定就 skip / unsupported，不猜。

## 主要修改范围

优先只修改：

```text
extension/content/adapters/moka.js
tests/fixtures/moka/*
tests/moka-adapter.test.js
docs/moka-adapter.md
```

`seed.json` 只允许修改 `providers.moka`。

不要直接修改：

```text
schema.js
store.js
util.js
scanner.js
matcher.js
writer.js
learn.js
main.js
adapters/registry.js
adapters/generic.js
```

如果 Adapter 无法解决，先提出 Core Change Request，不要把 Moka 特殊逻辑塞进 Core。

## 开发重点

先完成扫描：

```text
申请信息
个人信息
求职意向
工作经历
教育背景
实习经历
项目经验
语言能力
自我描述
获奖经历
```

重复模块必须按真实 DOM item 确定：

```text
repeater.itemIndex
repeater.itemElement
```

禁止继续使用“同名字段第 N 次出现 = 第 N 条经历”。

优先复用 Generic 的 text / textarea / checkbox 等能力。

重点自行适配 Moka：

- 自绘 select / search-select
- 年月选择
- 起止年月 range
- “至今”

自绘下拉要求：

- 只定位当前控件对应 popup；
- 只允许唯一精确候选；
- 0 个或多个同名候选都跳过；
- 点击后必须回读并通过 Core 双回读验证。

## 安全边界

禁止自动处理：

- 文件上传
- 同步更新在线简历
- 声明/隐私
- 验证码
- 预览/提交

自动新增经历继续保持：

```text
capabilities.addItem.* = false
```

本轮先保证已有多条经历不会串项。

## 测试

新增：

`tests/moka-adapter.test.js`

至少覆盖：

- section
- repeater itemIndex
- DOM 顺序变化不串项
- Generic fallback
- search-select 唯一候选
- 多候选拒绝
- date / range / 至今
- capture
- clear
- manual-only
- addItem 仍关闭

提交前运行：

```bash
node tests/round1.test.js
node tests/round2.test.js
node tests/adapter-contract.test.js
node tests/moka-adapter.test.js
git diff --check
```

全部 PASS。

真实页面或 fixture 中不得保存手机号、邮箱、姓名、token、sourceToken、用户 ID 等个人数据。

完成后提交到：

`feat/moka-adapter`

并向：

`zhourunnan1210/apply-assistant-local:main`

提交 PR。

最终汇报：

- commit SHA
- 修改文件
- 已支持 section
- 已支持控件
- repeater 验证结果
- unsupported / manual-only
- 是否需要 Core Change Request
- 测试结果

完成后停止，不处理 Beisen。
# BEISEN_SCAN_BASELINE

- 样本：BEISEN_REAL_SAMPLE_01
- 来源：同一真实页面的只读 scanner.js 逻辑复现，修复前保存。
- 页面：flyaitalent.zhiye.com/form；query value 未保存。
- 结果：80 条：text 66、textarea 12、file 2。

问题摘要：

- 40 个真实 .form-item 各被内部 .form-item__control 再拆出一条结果。
- 所有 section 为空；重复经历没有可靠 item identity。
- 17 个 Phoenix 自定义下拉/日期被归为 text；native select 为 0。
- 自定义 radio 为 0 条，内部 placeholder 造成空标签或“请输入”等错误标签。
- CV 上传、声明、3 个“至今”复选框和最终提交按钮未进入结果。
- 手机字段仅记录 hasValue=true，未保存实际值。

完整脱敏结果见同目录 JSON。


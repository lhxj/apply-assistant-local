# BEISEN_SCAN_AFTER

- 样本：BEISEN_REAL_SAMPLE_01
- 来源：同一真实页面的只读最终北森扫描形状；未写入任何字段。
- 状态：BEISEN_FORM_CONFIRMED。
- 结果：49 条：业务字段 43 条，安全/人工边界 6 条。

控件分类：text 16、textarea 6、select 6、date 11、radio 3、checkbox 4、file 2、unknown 1（最终提交，manual-only）。

改进：

- 每个 .form-item 只产生一个字段；label 从 .form-item__text 恢复。
- sectionKey 使用 education / internship / project / award / work / skills / certificates；itemIndex 使用同 section 的 DOM item 顺序。
- Phoenix select 与 date 已分开；不是通过“几个 select”猜测，日期字段在样本中均为独立 Phoenix select，起止字段彼此独立。
- 自定义 radio 按组识别；空样本没有 selected marker 时标记 readStateUnknown，防止覆盖。
- file、声明、提交进入 manual/safety 边界；没有上传、勾选或提交。
- “籍贯”仍被 matcher 安全阻断；“是否全日制/是否可提前实习”没有危险通用 alias。

完整脱敏结果见同目录 JSON。


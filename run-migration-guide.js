#!/usr/bin/env node

/**
 * 数据库迁移执行指南
 *
 * 由于SQL DDL操作需要管理员权限，请按以下步骤手动执行：
 */

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          数据库迁移执行指南 - V2.0 优化                       ║
╚═══════════════════════════════════════════════════════════════╝

📋 需要执行的SQL文件：
   supabase/migrations/20251120150000_enhance_hybrid_search_level_matching.sql

🔧 执行步骤：

步骤 1: 登录 Supabase Dashboard
   👉 访问: https://app.supabase.com
   👉 选择项目: jrynjbgyrmwvkdnmifph

步骤 2: 打开 SQL Editor
   👉 左侧菜单 → SQL Editor
   👉 点击 "New Query"

步骤 3: 复制并执行SQL
   👉 打开文件: supabase/migrations/20251120150000_enhance_hybrid_search_level_matching.sql
   👉 复制全部内容
   👉 粘贴到SQL Editor
   👉 点击 "Run" 按钮

步骤 4: 验证执行结果
   ✅ 看到 "Success. No rows returned" 表示成功
   ✅ 函数已创建: level_matches() 和 hybrid_search()

📝 SQL 内容预览：
   - 创建 level_matches() 函数：实现职级范围匹配
   - 重建 hybrid_search() 函数：增加匹配度加权

⚠️  重要提示：
   1. 此操作会删除旧的 hybrid_search 函数并重建
   2. 不会影响现有数据，只是优化查询逻辑
   3. 执行后立即生效，无需重启应用

🎯 优化效果：
   ✅ P2用户可以检索到"P1-P3"标签的文档
   ✅ 专属内容优先级高于通用内容
   ✅ 提升检索准确性和召回率

════════════════════════════════════════════════════════════════

按任意键继续启动开发服务器...
`);

process.stdin.once('data', () => {
  console.log('\n✅ 继续执行...\n');
  process.exit(0);
});

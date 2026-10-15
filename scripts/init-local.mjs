import { lstat, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve from this script, never from the caller's working directory.
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const localRoot = resolve(projectRoot, '.local');

const directories = new Map([
  ['', `# 本地工作材料

此目录整体被 Git 忽略，不是应用运行数据目录，也不受 Git 备份保护。

- Docs：草稿、讨论记录和个人参考资料。
- Script：长期保留的本机辅助工具。
- Test：本地测试驱动、结果和截图。
- Tmp/<任务名>：按任务隔离的一次性探针与中间材料。

正式构建和测试不能依赖这里的内容。真实凭据和主机数据库放在仓库外。
需要共享的内容先整理、脱敏，再迁移到正式目录；不要清空整个本地工作区。
完整规则见 [目录说明](../docs/directory-map.md)。
`],
  ['Docs', `# 本地文档

存放个人草稿、讨论记录和参考材料，不纳入 Git。
团队需要的架构、协议和使用说明应整理到正式 docs/，不能仅留在这里。
请另行备份有保留价值的材料，不存放真实凭据。
`],
  ['Script', `# 本机辅助工具

存放长期保留但仅供本机使用的非测试辅助工具，不纳入 Git。
正式构建、打包和项目初始化脚本应放入 scripts/；不得依赖这里的工具完成正式交付。
测试驱动放到 ../Test/，一次性探针放到 ../Tmp/<任务名>/。
`],
  ['Test', `# 本地测试材料

存放尚未纳入正式回归的本地测试驱动、结果、截图和调试材料，不纳入 Git。
可重复且需要团队共享的检查整理到 tests/ 或对应包的正式测试位置。
保存结果前脱敏；不得记录真实密码、私钥、Token 或未经脱敏的连接资料。
`],
  ['Tmp', `# 任务临时材料

为每个任务创建独立子目录，保存一次性探针、临时下载和中间产物，不纳入 Git。
清理前确认完整路径和归属，只处理目标任务目录，不批量清空其他任务材料。
需要长期保存的内容整理到 Docs、Script、Test 或正式目录。
`],
]);

async function ensureDirectory(directory) {
  try {
    await mkdir(directory);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }

  const entry = await lstat(directory);
  if (entry.isSymbolicLink() || !entry.isDirectory()) {
    throw new Error(`Refusing a linked or non-directory local workspace path: ${directory}`);
  }
}

async function initialize() {
  for (const [name, documentation] of directories) {
    const directory = resolve(localRoot, name);
    await ensureDirectory(directory);
    try {
      await writeFile(resolve(directory, 'README.md'), documentation, {
        encoding: 'utf8',
        flag: 'wx',
      });
    } catch (error) {
      // Preserve every existing file, including user-edited instructions.
      if (error.code !== 'EEXIST') throw error;
    }
  }

  console.log(`Local workspace ready: ${localRoot}`);
  console.log('Existing files preserved. No dependencies installed or remote hosts contacted.');
}

initialize().catch((error) => {
  console.error(`Local workspace initialization failed: ${error.message}`);
  process.exitCode = 1;
});

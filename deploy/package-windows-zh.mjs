// Simplified Chinese local deployment helper; see MODIFICATIONS.md.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('请在 Windows x64 上运行此本地打包命令。')
}
const root = resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const npmCli = [
  process.env.npm_execpath,
  resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
].find(candidate => candidate && existsSync(candidate))
if (!npmCli) throw new Error('未找到 npm。请使用附带 npm 的 Node.js 24 LTS 安装版本。')
const environment = {
  ...process.env,
  BLOCKOUT_APP_ID: 'com.blockout.zhcn',
  BLOCKOUT_WINDOWS_CONFIG_NAMESPACE: 'blockout-zh-cn'
}
for (const script of ['prepare:ffmpeg:win', 'verify:release-assets', 'fetch:ffmpeg-source', 'build']) {
  execFileSync(process.execPath, [npmCli, 'run', script], { cwd: root, env: environment, stdio: 'inherit' })
}
execFileSync(process.execPath, [
  require.resolve('electron-builder/cli.js'), '--win', 'nsis', 'zip', '--x64',
  '--config', 'deploy/electron-builder.zh-CN.yml', '--publish', 'never'
], { cwd: root, env: environment, stdio: 'inherit' })

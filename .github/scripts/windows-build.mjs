// Simplified Chinese Windows build diagnostics; see MODIFICATIONS.md.
import { spawnSync } from 'node:child_process'

const result = spawnSync(process.execPath, ['deploy/package-windows-zh.mjs'], {
  cwd: process.cwd(), env: process.env, encoding: 'utf8',
  maxBuffer: 50 * 1024 * 1024, timeout: 45 * 60 * 1000
})
const output = [result.stdout, result.stderr, result.error?.message]
  .filter(Boolean).join('\n')
  .replace(/github_pat_[A-Za-z0-9_]+|gh[pousr]_[A-Za-z0-9_]+/g, '[credential omitted]')
  .replace(/https?:\/\/[^\s]+/gi, '[URL omitted]')
// Child output cannot inject workflow commands into the runner.
for (const line of output.split(/\r?\n/)) {
  console.log(`build | ${line.replaceAll('::', ': :').replaceAll('##[', '## [')}`)
}
const status = result.status ?? 1
if (status !== 0) {
  const detail = output.split(/\r?\n/).slice(-80).join('\n')
    .replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A')
  console.log(`::error title=Windows packaging failed::${detail}`)
}
process.exitCode = status

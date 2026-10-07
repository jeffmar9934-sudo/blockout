// Simplified Chinese Windows draft delivery; see MODIFICATIONS.md.
// Only uploads missing assets to an existing draft, with SHA256 verification.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const TAG = 'v5.1.1-zh-CN-local.1'
const VERSION = '5.1.1'
const root = process.cwd()
const output = resolve(root, 'release')
const manifestPath = resolve(output, 'upload-manifest.json')
const receiptPath = resolve(output, 'draft-upload-receipt.json')
const names = [
  `Blockout-zh-CN-${VERSION}-win-x64-Setup.exe`,
  `Blockout-zh-CN-${VERSION}-win-x64.zip`,
  `Blockout-zh-CN-${VERSION}-source.zip`,
  'DEPLOY-WINDOWS.zh-CN.md'
]
class DeliveryError extends Error {}
function fail(message) { throw new DeliveryError(message) }

async function info(name) {
  if (name !== name.split(/[\\/]/).at(-1) || name.includes('\0')) fail('资产名称无效。')
  const path = resolve(output, name)
  const details = await stat(path)
  if (!details.isFile() || details.size === 0) fail(`缺少完整构建文件：${name}`)
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return { name, bytes: details.size, sha256: hash.digest('hex') }
}

function gh(args) {
  try {
    return execFileSync('gh', args, {
      cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15 * 60 * 1000, maxBuffer: 10 * 1024 * 1024
    })
  } catch {
    fail('GitHub 请求失败；未输出认证数据或可能包含临时 URL 的错误响应。')
  }
}
function api(endpoint) {
  return JSON.parse(gh(['api', endpoint, '--hostname', 'github.com', '--method', 'GET',
    '--header', 'X-GitHub-Api-Version: 2022-11-28']))
}
function list(endpoint) {
  const all = []
  for (let page = 1; ; page++) {
    const batch = api(`${endpoint}?per_page=100&page=${page}`)
    if (!Array.isArray(batch)) fail('GitHub 分页响应格式错误。')
    all.push(...batch)
    if (batch.length < 100) return all
  }
}
function requireDraft(release) {
  if (release.draft !== true || release.tag_name !== TAG || !Number.isSafeInteger(release.id)) {
    fail('目标必须是既有同 tag 的草稿；不修改已发布 Release。')
  }
}
function matches(remote, local) {
  if (remote.state !== 'uploaded' || remote.size !== local.bytes || remote.digest !== `sha256:${local.sha256}`) {
    fail(`已有同名资产大小、状态或 digest 不同/无法验证；拒绝覆盖：${local.name}`)
  }
}
function safeUrl(value, repo) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.host !== 'github.com' || url.username || url.password ||
      url.search || url.hash || !url.pathname.toLowerCase().startsWith(`/${repo}/releases/`.toLowerCase())) {
    fail('拒绝记录非标准 GitHub URL 或临时签名 URL。')
  }
  return value
}

async function prepare() {
  const assets = await Promise.all(names.map(info))
  await writeFile(resolve(output, 'SHA256SUMS.txt'),
    assets.map(asset => `${asset.sha256}  ${asset.name}\n`).join(''), 'utf8')
  assets.push(await info('SHA256SUMS.txt'))
  await writeFile(manifestPath, JSON.stringify({ tag: TAG, version: VERSION,
    source_commit: process.env.GITHUB_SHA || null, assets }, null, 2) + '\n')
  console.log(`已校验 ${assets.length} 个构建文件，并生成 SHA256SUMS.txt。`)
}

async function upload() {
  const repo = process.env.GITHUB_REPOSITORY
  if (repo !== 'jeffmar9934-sudo/blockout') fail('只允许目标仓库 jeffmar9934-sudo/blockout。')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  if (manifest.tag !== TAG || manifest.version !== VERSION ||
      manifest.assets?.map(asset => asset.name).join('\n') !== [...names, 'SHA256SUMS.txt'].join('\n')) {
    fail('资产 manifest 与固定交付清单不符。')
  }
  for (const asset of manifest.assets) {
    const actual = await info(asset.name)
    if (actual.bytes !== asset.bytes || actual.sha256 !== asset.sha256) fail(`构建资产被改变：${asset.name}`)
  }
  const prefix = `repos/${repo}`
  const releases = list(`${prefix}/releases`).filter(release => release.tag_name === TAG)
  if (releases.length !== 1) fail('找不到唯一的既有同 tag 草稿；不会创建新 Release。')
  const release = releases[0]
  requireDraft(release)
  const endpoint = `${prefix}/releases/${release.id}`
  function currentAssets() {
    requireDraft(api(endpoint))
    const assets = list(`${endpoint}/assets`)
    if (new Set(assets.map(asset => asset.name)).size !== assets.length) fail('远端存在重复资产名称。')
    return new Map(assets.map(asset => [asset.name, asset]))
  }
  const existing = currentAssets()
  for (const asset of manifest.assets) {
    if (existing.has(asset.name)) matches(existing.get(asset.name), asset)
  }
  const receipt = { repository: repo, tag: TAG, release_id: release.id, draft: true,
    draft_page_url: safeUrl(release.html_url, repo), assets: [] }
  for (const asset of manifest.assets) {
    let remote = currentAssets().get(asset.name)
    if (!remote) {
      gh(['release', 'upload', TAG, resolve(output, asset.name), '--repo', repo])
      remote = currentAssets().get(asset.name)
    }
    if (!remote) fail(`上传后缺少预期资产：${asset.name}`)
    matches(remote, asset)
    receipt.assets.push({ ...asset, id: remote.id,
      browser_download_url: safeUrl(remote.browser_download_url, repo) })
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n')
  }
  requireDraft(api(endpoint))
  console.log(`已核对 ${receipt.assets.length} 个草稿资产；未发布：${receipt.draft_page_url}`)
}

try {
  const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
  if (pkg.version !== VERSION) fail('版本已变化；请先审查 tag 和文件命名。')
  if (process.argv.length !== 3) fail('仅支持 --prepare 或 --upload。')
  if (process.argv[2] === '--prepare') await prepare()
  else if (process.argv[2] === '--upload') await upload()
  else fail('仅支持 --prepare 或 --upload。')
} catch (error) {
  console.error(error instanceof DeliveryError ? error.message : '本地文件或响应格式错误；详情未输出。')
  process.exitCode = 1
}

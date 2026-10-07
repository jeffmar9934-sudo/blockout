// Modified for cross-platform Windows support in 2026; see MODIFICATIONS.md.
/**
 * The Deliver pipeline. Exports are deterministic: the timeline is stepped
 * at exactly the shot's fps and every frame is rendered from the same
 * ShotEvaluator state used in playback, then piped as PNG to ffmpeg in the
 * main process. Output never depends on playback performance.
 */

import * as THREE from 'three'
import { ASPECT_RATIOS } from '@engine/camera'
import { generatePrompt } from '@engine/prompt'
import { getProfile, BUILTIN_PROFILES, type GeneratorProfile } from '@engine/profiles'
import { ShotEvaluator } from '@engine/evaluate'
import type { ProjectDoc, Scene, Shot } from '@engine/types'
import { useStore } from '../store'
import { zh } from '../i18n/zh-CN'
import { getSceneManager, type SceneManager } from './scene-access'
import { buildComfyWorkflow } from './comfy'

/** 'auto' = the profile's native size; 720p/1080p pin the SHORT edge. */
export type ExportResolution = 'auto' | '720p' | '1080p'

export interface ExportOptions {
  profileId: string
  passes: { clean: boolean; depth: boolean; normal: boolean }
  labels: 'on' | 'stillsOnly' | 'off'
  resolution?: ExportResolution
}

export interface ExportResult {
  ok: boolean
  packagePath?: string
  error?: string
}

import { sanitizeName as sanitize } from '@engine/strings'

function evenDim(n: number): number {
  const r = Math.round(n)
  return r % 2 === 0 ? r : r + 1
}

export function exportDims(
  profile: GeneratorProfile,
  aspect: keyof typeof ASPECT_RATIOS,
  resolution: ExportResolution = 'auto'
): {
  width: number
  height: number
} {
  const ratio = ASPECT_RATIOS[aspect]
  if (resolution !== 'auto') {
    // Pin the short edge (720p → 1280×720 at 16:9, 720×1280 at 9:16) —
    // Seedance only accepts 720p reference files.
    const short = resolution === '720p' ? 720 : 1080
    if (ratio >= 1) return { width: evenDim(short * ratio), height: short }
    return { width: short, height: evenDim(short / ratio) }
  }
  if (ratio >= 1) {
    const width = evenDim(profile.exportWidth)
    return { width, height: evenDim(width / ratio) }
  }
  // Portrait: cap the LONG edge at exportWidth.
  const height = evenDim(profile.exportWidth)
  return { width: evenDim(height * ratio), height }
}

let exportCanvas: HTMLCanvasElement | null = null
let exportRenderer: THREE.WebGLRenderer | null = null

function getExportRenderer(): { canvas: HTMLCanvasElement; renderer: THREE.WebGLRenderer } {
  if (!exportCanvas || !exportRenderer) {
    exportCanvas = document.createElement('canvas')
    exportRenderer = new THREE.WebGLRenderer({
      canvas: exportCanvas,
      antialias: true,
      preserveDrawingBuffer: true
    })
    exportRenderer.shadowMap.enabled = true
    exportRenderer.shadowMap.type = THREE.PCFSoftShadowMap
    exportRenderer.setPixelRatio(1)
  }
  return { canvas: exportCanvas, renderer: exportRenderer }
}

async function canvasPng(canvas: HTMLCanvasElement): Promise<ArrayBuffer> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('PNG 编码失败')
  return blob.arrayBuffer()
}

/** Wait for an ffmpeg job to close; resolves with exit code. */
function waitForClose(jobId: string): Promise<{ code: number; log: string }> {
  return new Promise((resolve) => {
    const off = window.blockout.onExportClosed((id, code, log) => {
      if (id === jobId) {
        off()
        resolve({ code, log })
      }
    })
  })
}

async function renderPassToMp4(
  manager: SceneManager,
  outPath: string,
  pass: 'clean' | 'depth' | 'normal',
  shot: Shot,
  width: number,
  height: number,
  showLabels: boolean,
  progress: (frame: number) => void,
  isCancelled: () => boolean
): Promise<{ ok: boolean; error?: string }> {
  const { canvas, renderer } = getExportRenderer()
  canvas.width = width
  canvas.height = height
  const totalFrames = Math.max(1, Math.round(shot.duration * shot.fps))
  const jobId = `job-${Date.now()}-${pass}`
  // Subscribe before spawning so an immediate ENOENT/encoder failure cannot
  // race past the renderer and leave the export waiting forever.
  const closed = waitForClose(jobId)
  await window.blockout.exportBegin(jobId, outPath, {
    fps: shot.fps,
    width,
    height,
    framesExpected: totalFrames
  })
  const gl = renderer.getContext()
  const pixels = new Uint8Array(width * height * 4)
  // Depth normalization range is fixed across the whole shot so the
  // gradient doesn't pump as subjects approach the camera.
  const depthRange = pass === 'depth' ? manager.computeShotDepthRange(shot.duration) : undefined
  for (let i = 0; i < totalFrames; i++) {
    if (isCancelled()) {
      await window.blockout.exportCancel(jobId)
      return { ok: false, error: 'cancelled' }
    }
    const t = i / shot.fps
    manager.renderFrameAt(renderer, t, width, height, pass, { showLabels, depthRange })
    // Raw RGBA straight from the framebuffer — deterministic bytes, no
    // canvas PNG encode in the hot loop. ffmpeg vflips (GL is bottom-up).
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    await window.blockout.exportFrame(jobId, pixels.slice().buffer)
    progress(i + 1)
    // Yield so the progress UI paints.
    if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0))
  }
  await window.blockout.exportEnd(jobId)
  const { code, log } = await closed
  if (code !== 0) return { ok: false, error: `ffmpeg exited ${code}: ${log.slice(-500)}` }
  return { ok: true }
}

function buildMetadata(scene: Scene, shot: Shot, profile: GeneratorProfile): string {
  const evaluator = new ShotEvaluator(scene, shot)
  const take = scene.blocking.find((b) => b.id === shot.blockingTakeId)
  const meta = {
    generator: { app: 'Blockout', schema: 1 },
    profile: { id: profile.id, name: profile.name },
    shot: {
      name: shot.name,
      duration: shot.duration,
      fps: shot.fps,
      aspect: shot.aspect,
      sensor: shot.camera.sensorId,
      rig: shot.camera.rig,
      rigIntensity: shot.camera.rigIntensity,
      seed: shot.camera.seed
    },
    cameraMarks: [...shot.camera.marks]
      .sort((a, b) => a.time - b.time)
      .map((m, i) => ({
        index: i + 1,
        time: m.time,
        hold: m.hold,
        position: m.position,
        panDeg: (m.pan * 180) / Math.PI,
        tiltDeg: (m.tilt * 180) / Math.PI,
        focalLength: m.focalLength,
        focusDistance: m.focusDistance ?? null
      })),
    subjects: (take?.tracks ?? []).map((track) => {
      const entity = scene.entities.find((e) => e.id === track.entityId)
      return {
        name: entity?.label?.text || entity?.name || track.entityId,
        asset: entity?.assetId,
        labelColor: entity?.label?.color ?? null,
        marks: [...track.marks]
          .sort((a, b) => a.time - b.time)
          .map((m, i) => ({
            index: i + 1,
            time: m.time,
            hold: m.hold,
            position: m.position,
            gait: m.gait
          }))
      }
    }),
    warnings: evaluator.warnings().map((w) => ({
      subject: w.entityName,
      issue: w.verdict.kind,
      impliedSpeedMs: Math.round(w.verdict.impliedSpeed * 10) / 10,
      suggestion: w.verdict.suggestion
    }))
  }
  return JSON.stringify(meta, null, 2) + '\n'
}

/**
 * Test hook: render one clean frame at time t and return the PNG bytes.
 * The smoke test calls this twice and asserts byte-identical output — the
 * cheap, strong check that state(t) rendering is deterministic.
 */
export async function renderStillPngForTest(t: number, width = 320, height = 180): Promise<ArrayBuffer> {
  const manager = getSceneManager()
  if (!manager) throw new Error('no scene manager')
  const { canvas, renderer } = getExportRenderer()
  canvas.width = width
  canvas.height = height
  manager.renderFrameAt(renderer, t, width, height, 'clean', { showLabels: true })
  return canvasPng(canvas)
}

/** Raw-pixel variant for the determinism diagnostic. */
export function renderRawForTest(t: number, width = 320, height = 180, doubleRender = false): number[] {
  const manager = getSceneManager()
  if (!manager) throw new Error('no scene manager')
  const { canvas, renderer } = getExportRenderer()
  canvas.width = width
  canvas.height = height
  manager.renderFrameAt(renderer, t, width, height, 'clean', { showLabels: true })
  if (doubleRender) manager.renderFrameAt(renderer, t, width, height, 'clean', { showLabels: true })
  const gl = renderer.getContext()
  const px = new Uint8Array(width * height * 4)
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, px)
  return Array.from(px)
}

export async function exportShot(opts: ExportOptions): Promise<ExportResult> {
  const s = useStore.getState()
  const doc = s.doc
  const scene = s.scene()
  const shot = s.shot()
  const folder = s.projectFolder
  const manager = getSceneManager()
  if (!doc || !scene || !shot || !folder || !manager) {
    const missing = !doc
      ? '尚未打开项目'
      : !scene || !shot
        ? '尚未选择镜头'
        : !folder
          ? '项目没有保存文件夹'
          : '视口尚未就绪'
    return { ok: false, error: `无法导出：${missing}。` }
  }
  if (useStore.getState().exportProgress.running) {
    return { ok: false, error: '已有导出任务正在运行。' }
  }
  const profile = getProfile(opts.profileId)
  const { width, height } = exportDims(profile, shot.aspect, opts.resolution ?? 'auto')

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const pkg = `${folder}/exports/${sanitize(scene.name)}/Shot-${sanitize(shot.name)}/export-${stamp}`

  const passes: ('clean' | 'depth' | 'normal')[] = []
  if (opts.passes.clean) passes.push('clean')
  if (opts.passes.depth) passes.push('depth')
  if (opts.passes.normal) passes.push('normal')
  const totalFrames = Math.max(1, Math.round(shot.duration * shot.fps)) * passes.length

  s.setExportProgress({
    running: true,
    label: `正在导出 ${shot.name}…`,
    frame: 0,
    totalFrames,
    cancelRequested: false,
    error: undefined
  })
  const isCancelled = (): boolean => useStore.getState().exportProgress.cancelRequested

  manager.suspendLive = true
  try {
    let done = 0
    for (const pass of passes) {
      const suffix = pass === 'clean' ? 'reference' : pass
      const result = await renderPassToMp4(
        manager,
        `${pkg}/${sanitize(shot.name)}_${suffix}.mp4`,
        pass,
        shot,
        width,
        height,
        opts.labels === 'on',
        (f) => {
          const passName = pass === 'clean' ? '参考视频' : pass === 'depth' ? '深度' : '法线'
          s.setExportProgress({ frame: done + f, label: `正在渲染${passName}通道…` })
        },
        isCancelled
      )
      if (!result.ok) {
        s.setExportProgress({ running: false, error: result.error })
        return { ok: false, error: result.error }
      }
      done += Math.max(1, Math.round(shot.duration * shot.fps))
    }

    // --- Stills: every camera mark + first/last frame
    s.setExportProgress({ label: '正在渲染静帧…' })
    const { canvas, renderer } = getExportRenderer()
    canvas.width = width
    canvas.height = height
    const stillLabels = opts.labels !== 'off'
    const stillTimes: { name: string; t: number }[] = [
      { name: 'first', t: 0 },
      { name: 'last', t: Math.max(0, shot.duration - 1 / shot.fps) },
      ...[...shot.camera.marks]
        .sort((a, b) => a.time - b.time)
        .map((m, i) => ({ name: `mark-${i + 1}`, t: m.time }))
    ]
    for (const { name, t } of stillTimes) {
      if (isCancelled()) break
      manager.renderFrameAt(renderer, t, width, height, 'clean', { showLabels: stillLabels })
      const png = await canvasPng(canvas)
      await window.blockout.exportWriteFile(
        `${pkg}/stills/${sanitize(shot.name)}_${name}.png`,
        png
      )
    }

    // --- Top-down blocking diagram
    manager.renderTopDown(renderer, 1600, 1600)
    await window.blockout.exportWriteFile(
      `${pkg}/stills/${sanitize(shot.name)}_topdown.png`,
      await canvasPng(canvas)
    )

    // --- Prompt, metadata, ComfyUI workflow
    await window.blockout.exportWriteFile(`${pkg}/prompt.txt`, generatePrompt(scene, shot, profile) + '\n')
    await window.blockout.exportWriteFile(`${pkg}/metadata.json`, buildMetadata(scene, shot, profile))
    if (profile.refModes.includes('depthVideo') || profile.id.startsWith('wan') || profile.id.startsWith('ltx')) {
      const workflow = buildComfyWorkflow(profile, shot, `${sanitize(shot.name)}_depth.mp4`, generatePrompt(scene, shot, profile))
      await window.blockout.exportWriteFile(`${pkg}/comfyui-workflow.json`, workflow)
    }
    await window.blockout.exportWriteFile(
      `${pkg}/README.txt`,
      [
        `Blockout 导出包 — ${scene.name} / 镜头 ${shot.name}`,
        ``,
        `目标工具：${profile.name} (${profile.vendor})`,
        zh(profile.attachHint),
        ``,
        `文件说明：`,
        `  *_reference.mp4   无界面元素的运动参考视频`,
        opts.passes.depth ? `  *_depth.mp4       深度通道（用于结构控制）` : null,
        opts.passes.normal ? `  *_normal.mp4      法线通道` : null,
        `  stills/           各摄影机走位点的静帧、首尾帧和俯视走位图`,
        `  prompt.txt        为 ${profile.name} 生成的英文提示词，可直接复制粘贴`,
        `  metadata.json     可供程序读取的走位点、镜头参数和时间信息`,
        ``
      ]
        .filter((l): l is string => l !== null)
        .join('\n')
    )

    const cancelled = isCancelled()
    s.setExportProgress({
      running: false,
      lastPackagePath: cancelled ? undefined : pkg,
      error: cancelled ? 'cancelled' : undefined
    })
    if (cancelled) return { ok: false, error: 'cancelled' }
    return { ok: true, packagePath: pkg }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    s.setExportProgress({ running: false, error })
    return { ok: false, error }
  } finally {
    manager.suspendLive = false
  }
}

/**
 * Export ONE frame — the playhead — as a full-quality still PNG. For pulling
 * specific reference frames (a key pose, the moment of impact) without
 * rendering the whole shot.
 */
export async function exportStillAtPlayhead(
  profileId: string,
  resolution: ExportResolution = 'auto',
  showLabels = true
): Promise<ExportResult> {
  const s = useStore.getState()
  const scene = s.scene()
  const shot = s.shot()
  const folder = s.projectFolder
  const manager = getSceneManager()
  if (!scene || !shot || !folder || !manager) {
    return { ok: false, error: '请先打开项目并选择镜头。' }
  }
  const t = s.time
  const { width, height } = exportDims(getProfile(profileId), shot.aspect, resolution)
  const { canvas, renderer } = getExportRenderer()
  canvas.width = width
  canvas.height = height
  manager.suspendLive = true
  try {
    manager.renderFrameAt(renderer, t, width, height, 'clean', { showLabels })
    const png = await canvasPng(canvas)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const out = `${folder}/exports/${sanitize(scene.name)}/Shot-${sanitize(shot.name)}/frames/${sanitize(shot.name)}_${t.toFixed(2)}s_${stamp}.png`
    await window.blockout.exportWriteFile(out, png)
    s.setExportProgress({ lastPackagePath: out })
    return { ok: true, packagePath: out }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  } finally {
    manager.suspendLive = false
  }
}

/** Export every shot in the scene in order and stitch an animatic. */
export async function exportAnimatic(
  profileId: string,
  resolution: ExportResolution = 'auto'
): Promise<ExportResult> {
  const s = useStore.getState()
  const scene = s.scene()
  const folder = s.projectFolder
  if (!scene || !folder) return { ok: false, error: '尚未选择场景。' }
  // Stream-copy concat requires uniform codec parameters — mixed aspects or
  // frame rates would produce a file most players choke on.
  const formats = new Set(scene.shots.map((sh) => `${sh.aspect}@${sh.fps}`))
  if (formats.size > 1) {
    return {
      ok: false,
      error: `镜头格式不一致（${[...formats].join(', ')}）。导出动态分镜前，请将场景中所有镜头的画幅比例和帧率设为一致。`
    }
  }
  const originalShot = s.shotId

  const clips: string[] = []
  for (const shot of scene.shots) {
    s.selectShot(shot.id)
    // Give the SceneManager a tick to rebuild for the new shot.
    await new Promise((r) => setTimeout(r, 50))
    const res = await exportShot({
      profileId,
      passes: { clean: true, depth: false, normal: false },
      labels: 'off',
      resolution
    })
    if (!res.ok || !res.packagePath) {
      if (originalShot) s.selectShot(originalShot)
      return { ok: false, error: res.error ?? '镜头导出失败' }
    }
    clips.push(`${res.packagePath}/${sanitize(shot.name)}_reference.mp4`)
  }
  if (originalShot) s.selectShot(originalShot)

  const out = `${folder}/exports/${sanitize(scene.name)}/animatic.mp4`
  const concat = await window.blockout.exportConcat(out, clips)
  if (!concat.ok) return { ok: false, error: concat.error }
  s.setExportProgress({ running: false, lastPackagePath: out })
  return { ok: true, packagePath: out }
}

/** Contact sheet: first frame of every shot in a grid PNG. */
export async function exportContactSheet(): Promise<ExportResult> {
  const s = useStore.getState()
  const scene = s.scene()
  const folder = s.projectFolder
  const manager = getSceneManager()
  if (!scene || !folder || !manager) return { ok: false, error: '尚未选择场景。' }
  const originalShot = s.shotId

  const cell = { w: 640, h: 360 }
  const cols = Math.min(3, Math.max(1, scene.shots.length))
  const rows = Math.ceil(scene.shots.length / cols)
  const pad = 24
  const captionH = 44
  const sheet = document.createElement('canvas')
  sheet.width = cols * cell.w + (cols + 1) * pad
  sheet.height = rows * (cell.h + captionH) + (rows + 1) * pad + 60
  const ctx = sheet.getContext('2d')!
  ctx.fillStyle = '#111113'
  ctx.fillRect(0, 0, sheet.width, sheet.height)
  ctx.fillStyle = '#ececf1'
  ctx.font = 'bold 28px -apple-system, "Noto Sans CJK SC", "Microsoft YaHei", sans-serif'
  ctx.fillText(`${scene.name} — 镜头一览`, pad, 42)

  const { canvas, renderer } = getExportRenderer()
  canvas.width = cell.w
  canvas.height = cell.h

  for (let i = 0; i < scene.shots.length; i++) {
    const shot = scene.shots[i]!
    s.selectShot(shot.id)
    await new Promise((r) => setTimeout(r, 50))
    // Render at the shot's own aspect, contain-fit into the cell — a 9:16
    // shot must show its real framing, not a 16:9 crop of it.
    const ratio = ASPECT_RATIOS[shot.aspect]
    let tw = cell.w
    let th = Math.round(cell.w / ratio)
    if (th > cell.h) {
      th = cell.h
      tw = Math.round(cell.h * ratio)
    }
    canvas.width = tw
    canvas.height = th
    manager.renderFrameAt(renderer, 0, tw, th, 'clean', { showLabels: true })
    const col = i % cols
    const row = Math.floor(i / cols)
    const cellX = pad + col * (cell.w + pad)
    const cellY = 60 + pad + row * (cell.h + captionH + pad)
    ctx.drawImage(canvas, cellX + Math.floor((cell.w - tw) / 2), cellY + Math.floor((cell.h - th) / 2))
    ctx.fillStyle = '#9b9ba6'
    ctx.font = '600 16px -apple-system, sans-serif'
    const lens = [...shot.camera.marks].sort((a, b) => a.time - b.time)[0]?.focalLength ?? 35
    ctx.fillText(
      `${shot.name} · ${Math.round(lens)}mm · ${shot.duration.toFixed(1)}s · ${shot.aspect}`,
      cellX,
      cellY + cell.h + 26
    )
  }
  if (originalShot) s.selectShot(originalShot)
  await new Promise((r) => setTimeout(r, 50))

  const blob = await new Promise<Blob | null>((r) => sheet.toBlob(r, 'image/png'))
  if (!blob) return { ok: false, error: 'PNG 编码失败' }
  const out = `${folder}/exports/${sanitize(scene.name)}/contact-sheet.png`
  await window.blockout.exportWriteFile(out, await blob.arrayBuffer())
  return { ok: true, packagePath: out }
}

export { BUILTIN_PROFILES }
export type { ProjectDoc }

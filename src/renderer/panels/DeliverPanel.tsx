// Modified for cross-platform Windows support in 2026; see MODIFICATIONS.md.
/**
 * Deliver mode: pick a generator profile, choose passes, export the
 * package, copy the generated prompt, and hand off to Blender/ComfyUI.
 */

import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { BUILTIN_PROFILES, getProfile } from '@engine/profiles'
import { generatePrompt } from '@engine/prompt'
import {
  exportShot,
  exportAnimatic,
  exportContactSheet,
  exportDims,
  exportStillAtPlayhead,
  type ExportResolution
} from '../export/exporter'
import { exportGlb } from '../export/gltf'
import { zh } from '../i18n/zh-CN'

export function DeliverPanel(): JSX.Element {
  const doc = useStore((s) => s.doc)
  const sceneId = useStore((s) => s.sceneId)
  const shotId = useStore((s) => s.shotId)
  const progress = useStore((s) => s.exportProgress)
  const setExportProgress = useStore((s) => s.setExportProgress)
  const toast = useStore((s) => s.toast)
  const mutate = useStore((s) => s.mutate)

  const scene = doc?.scenes.find((s) => s.id === sceneId)
  const shot = scene?.shots.find((s) => s.id === shotId)

  const [profileId, setProfileId] = useState(doc?.settings.defaultProfileId ?? 'seedance-2')
  const [passes, setPasses] = useState({ clean: true, depth: true, normal: false })
  const [labels, setLabels] = useState<'on' | 'stillsOnly' | 'off'>('stillsOnly')
  const [resolution, setResolution] = useState<ExportResolution>('auto')

  const profile = getProfile(profileId)
  const prompt = useMemo(
    () => (scene && shot ? generatePrompt(scene, shot, profile) : ''),
    [scene, shot, profile]
  )

  if (!scene || !shot) {
    return (
      <div className="deliver-panel">
        <div className="panel-title">导出</div>
        <p style={{ color: 'var(--text-dim)' }}>请选择要导出的镜头。</p>
      </div>
    )
  }

  const dims = exportDims(profile, shot.aspect, resolution)
  const overCap = profile.maxDuration !== undefined && shot.duration > profile.maxDuration
  const pct =
    progress.totalFrames > 0 ? Math.round((progress.frame / progress.totalFrames) * 100) : 0

  const run = async (): Promise<void> => {
    const res = await exportShot({ profileId, passes, labels, resolution })
    if (res.ok && res.packagePath) {
      toast('导出完成。', 'success')
      void window.blockout.showFolder(res.packagePath)
    } else if (res.error && res.error !== 'cancelled') {
      toast(`导出失败：${zh(res.error)}`, 'error')
    }
  }

  return (
    <div className="deliver-panel">
      <div className="panel-title">导出 — {scene.name} / 镜头 {shot.name}</div>

      <div className="field">
        <label>目标生成器</label>
        <select
          value={profileId}
          onChange={(e) => {
            setProfileId(e.target.value)
            mutate('default profile', (doc) => {
              doc.settings.defaultProfileId = e.target.value
            })
          }}
        >
          {BUILTIN_PROFILES.map((p) => (
            <option key={p.id} value={p.id}>
              {zh(p.name)} ({p.vendor})
            </option>
          ))}
        </select>
      </div>

      <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
        {zh(profile.attachHint)}
      </p>

      {overCap && (
        <div className="warning-chip" style={{ marginBottom: 10 }}>
          ⚠ 镜头时长为 {shot.duration.toFixed(1)} 秒，{zh(profile.name)} 的片段上限为{' '}
          {profile.maxDuration} 秒，建议缩短镜头。
        </div>
      )}

      <div className="field">
        <label>
          输出 — {dims.width}×{dims.height} @ {shot.fps} 帧/秒 · {shot.aspect}
        </label>
        <div className="seg">
          <button className={passes.clean ? 'active' : ''} onClick={() => setPasses((p) => ({ ...p, clean: !p.clean }))}>
            纯净画面
          </button>
          <button className={passes.depth ? 'active' : ''} onClick={() => setPasses((p) => ({ ...p, depth: !p.depth }))}>
            深度
          </button>
          <button className={passes.normal ? 'active' : ''} onClick={() => setPasses((p) => ({ ...p, normal: !p.normal }))}>
            法线
          </button>
        </div>
        <p style={{ color: 'var(--text-dim)', fontSize: 11, marginTop: 6, lineHeight: 1.5 }}>
          物理天空预设会渲染到<b>纯净画面</b>中，输出可逐字节复现；深度和法线通道不包含天空。
          导入的 3D 扫描仅用于场景布置，不会出现在任何导出通道中；扫描信息会列在导出包的{' '}
          <code>metadata.json</code> 中。
        </p>
      </div>

      <div className="field">
        <label>分辨率</label>
        <div className="seg">
          <button
            className={resolution === 'auto' ? 'active' : ''}
            onClick={() => setResolution('auto')}
            title="使用生成器预设的原始尺寸"
          >
            自动
          </button>
          <button
            className={resolution === '720p' ? 'active' : ''}
            onClick={() => setResolution('720p')}
            title="720p — Seedance 接受的参考文件分辨率。适用于视频、静帧和动态分镜。"
          >
            720p
          </button>
          <button
            className={resolution === '1080p' ? 'active' : ''}
            onClick={() => setResolution('1080p')}
            title="1080p"
          >
            1080p
          </button>
        </div>
      </div>

      <div className="field">
        <label>标签</label>
        <div className="seg">
          <button className={labels === 'on' ? 'active' : ''} onClick={() => setLabels('on')}>
            包含在视频中
          </button>
          <button className={labels === 'stillsOnly' ? 'active' : ''} onClick={() => setLabels('stillsOnly')}>
            仅静帧
          </button>
          <button className={labels === 'off' ? 'active' : ''} onClick={() => setLabels('off')}>
            关闭
          </button>
        </div>
      </div>

      {progress.running ? (
        <div className="field">
          <label>
            {zh(progress.label)} {progress.frame}/{progress.totalFrames}
          </label>
          <div className="progress-bar">
            <div style={{ width: `${pct}%` }} />
          </div>
          <button
            className="btn small danger"
            style={{ marginTop: 8 }}
            onClick={() => setExportProgress({ cancelRequested: true })}
          >
            取消
          </button>
        </div>
      ) : (
        <button
          className="btn primary"
          style={{ width: '100%', marginBottom: 10 }}
          disabled={!passes.clean && !passes.depth && !passes.normal}
          onClick={() => void run()}
        >
          导出镜头包
        </button>
      )}

      <button
        className="btn"
        style={{ width: '100%', marginBottom: 10 }}
        disabled={progress.running}
        onClick={() =>
          void exportStillAtPlayhead(profileId, resolution, labels !== 'off').then((r) => {
            if (r.ok && r.packagePath) {
              toast('静帧已导出。', 'success')
              void window.blockout.showFolder(r.packagePath)
            } else if (r.error) toast(`静帧导出失败：${zh(r.error)}`, 'error')
          })
        }
        title="将播放头所在帧导出为全画质 PNG，请先将播放头移到所需时刻"
      >
        📸 导出当前帧（播放头位置）
      </button>

      {progress.lastPackagePath && !progress.running && (
        <button
          className="btn small"
          style={{ width: '100%', marginBottom: 14 }}
          onClick={() => void window.blockout.showFolder(progress.lastPackagePath!)}
        >
          {window.blockout.platform.isMac ? '在访达中显示上次导出' : '在文件夹中显示上次导出'}
        </button>
      )}

      <div className="panel-title" style={{ marginTop: 10 }}>
        {zh(profile.name)} 提示词
      </div>
      <div className="prompt-box">{prompt}</div>
      <button
        className="btn small"
        style={{ width: '100%', margin: '8px 0 18px' }}
        onClick={() => {
          void navigator.clipboard.writeText(prompt)
          toast('提示词已复制。', 'success')
        }}
      >
        复制提示词
      </button>

      <div className="panel-title">场景工具</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          className="btn"
          disabled={progress.running}
          onClick={() =>
            void exportAnimatic(profileId, resolution).then((r) => {
              if (r.ok && r.packagePath) {
                toast('动态分镜已导出。', 'success')
                void window.blockout.showFolder(r.packagePath)
              } else if (r.error && r.error !== 'cancelled') toast(`动态分镜导出失败：${zh(r.error)}`, 'error')
            })
          }
        >
          导出场景动态分镜（{scene.shots.length} 个镜头）
        </button>
        <button
          className="btn"
          disabled={progress.running}
          onClick={() =>
            void exportContactSheet().then((r) => {
              if (r.ok && r.packagePath) {
                toast('分镜总览已导出。', 'success')
                void window.blockout.showFolder(r.packagePath)
              } else if (r.error) toast(`分镜总览导出失败：${zh(r.error)}`, 'error')
            })
          }
        >
          导出分镜总览
        </button>
        <button
          className="btn"
          disabled={progress.running}
          onClick={() =>
            void exportGlb(profileId).then((r) => {
              if (r.ok && r.packagePath) {
                toast('Blender 文件包已导出（.glb + 导入脚本）。', 'success')
                void window.blockout.showFolder(r.packagePath)
              } else if (r.error) toast(`glTF 导出失败：${zh(r.error)}`, 'error')
            })
          }
        >
          导出到 Blender（.glb）
        </button>
      </div>
    </div>
  )
}

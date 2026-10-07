// Modified for cross-platform Windows support in 2026; see MODIFICATIONS.md.
/**
 * Viewport — React shell around SceneManager: canvas lifecycle, the shot
 * HUD, look-through framing overlays (thirds grid), placement/mark hints,
 * empty states, and the reference-video underlay.
 */

import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { emit, type FramingKind } from '../bus'
import { SceneManager } from './SceneManager'
import { registerSceneManager, getSceneManager as getSceneManagerSafe } from '../export/scene-access'
import { ReferenceUnderlay, ReferenceControls } from './ReferenceUnderlay'
import { zh } from '../i18n/zh-CN'
import { LENS_SET, SHOT_SIZES } from '@engine/camera'
import type { AspectId, ShotSizeId } from '@engine/types'

const ASPECT_ORDER: AspectId[] = ['16:9', '9:16', '2.39:1', '4:3', '1:1']

function Hud(): JSX.Element | null {
  const doc = useStore((s) => s.doc)
  const sceneId = useStore((s) => s.sceneId)
  const shotId = useStore((s) => s.shotId)
  const time = useStore((s) => s.time)
  const mutate = useStore((s) => s.mutate)
  const mode = useStore((s) => s.mode)
  const showMarks = useStore((s) => s.showMarks)
  const showPaths = useStore((s) => s.showPaths)
  const setShowMarks = useStore((s) => s.setShowMarks)
  const setShowPaths = useStore((s) => s.setShowPaths)

  const scene = doc?.scenes.find((s) => s.id === sceneId)
  const shot = scene?.shots.find((s) => s.id === shotId)
  if (!shot) return null

  // Lens at playhead (from marks; default 35).
  const sorted = [...shot.camera.marks].sort((a, b) => a.time - b.time)
  let lens = sorted[0]?.focalLength ?? 35
  for (const m of sorted) if (m.time <= time + 1e-6) lens = m.focalLength

  const cycleLens = (): void => {
    const idx = LENS_SET.findIndex((l) => l >= Math.round(lens))
    const next = LENS_SET[(Math.max(0, idx) + 1) % LENS_SET.length]!
    emit('setLens', { focalLength: next })
  }

  const cycleAspect = (): void => {
    const idx = ASPECT_ORDER.indexOf(shot.aspect)
    const next = ASPECT_ORDER[(idx + 1) % ASPECT_ORDER.length]!
    mutate('aspect', (doc) => {
      for (const sc of doc.scenes) {
        const sh = sc.shots.find((x) => x.id === shot.id)
        if (sh) sh.aspect = next
      }
    })
  }

  return (
    <div className="hud">
      <button onClick={cycleLens} title="焦距（点击切换）">
        <span className="hud-label">焦距</span>
        {Math.round(lens)}mm
      </button>
      <button onClick={cycleAspect} title="画幅比例（点击切换）">
        <span className="hud-label">画幅</span>
        {shot.aspect}
      </button>
      <button title="镜头时长 · 在时间轴中编辑">
        <span className="hud-label">时长</span>
        {shot.duration.toFixed(1)}秒
      </button>
      <button title="帧率">
        <span className="hud-label">帧率</span>
        {shot.fps}
      </button>
      {mode === 'shoot' && (
        <button title="此镜头中的摄影机走位点">
          <span className="hud-label">走位点</span>
          {shot.camera.marks.length}
        </button>
      )}
      <button
        className={showMarks ? 'active' : ''}
        onClick={() => setShowMarks(!showMarks)}
        title="显示或隐藏地面的走位胶带标记（仅在编辑器中显示，不会导出）"
      >
        <span className="hud-label">{showMarks ? '👁' : '🚫'}</span>
        走位点
      </button>
      <button
        className={showPaths ? 'active' : ''}
        onClick={() => setShowPaths(!showPaths)}
        title="显示或隐藏路径带、方向箭头和时间标签（仅在编辑器中显示）"
      >
        <span className="hud-label">{showPaths ? '👁' : '🚫'}</span>
        路径
      </button>
    </div>
  )
}

function ShotSizeRow(): JSX.Element {
  const sizes: ShotSizeId[] = ['WS', 'FS', 'MS', 'MCU', 'CU']
  return (
    <div className="tool-row">
      {sizes.map((size) => (
        <button
          key={size}
          className="btn small"
          title={`自动构图：${zh(SHOT_SIZES[size].name)}`}
          onClick={() => emit('frameSubject', { size })}
        >
          {zh(SHOT_SIZES[size].name)}
        </button>
      ))}
    </div>
  )
}

/** Recording feel: how tightly recordings chase the mouse. */
function RecordControlToggle(): JSX.Element {
  const recordControl = useStore((s) => s.recordControl)
  const setRecordControl = useStore((s) => s.setRecordControl)
  const next = { precise: 'normal', normal: 'fast', fast: 'precise' } as const
  const label = { precise: '🎯 精准', normal: '✋ 标准', fast: '⚡ 快速' } as const
  return (
    <button
      className="btn small"
      onClick={() => setRecordControl(next[recordControl])}
      title="录制操控：精准 = 强平滑和速度限制（缓慢、精确的移动）；标准 = 均衡；快速 = 直接、迅速。适用于演员操控和摄影机运动。点击切换。"
    >
      {label[recordControl]}
    </button>
  )
}

/** One-click cinematography framings — writes the active camera mark. */
function FramingRow(): JSX.Element {
  const framings: { kind: FramingKind; label: string; title: string }[] = [
    { kind: '2S', label: '双人镜头', title: '双人镜头：将两位角色并排纳入画面（选择 3–4 人可拍摄群像）' },
    { kind: 'OTS', label: '过肩镜头', title: '过肩镜头：从近处角色的肩后拍摄另一位角色' },
    { kind: 'REV', label: '反打', title: '反打镜头：将摄影机绕拍摄主体旋转 180°' },
    { kind: 'TOP', label: '俯拍', title: '俯拍镜头：垂直向下拍摄，将所有角色纳入画面' },
    { kind: 'LOW', label: '仰拍', title: '仰拍镜头：从膝盖高度向上拍摄主体' },
    { kind: 'DUTCH', label: '倾斜镜头', title: '倾斜镜头：倾斜地平线（再次点击反向倾斜，再点一次恢复水平）' }
  ]
  return (
    <div className="tool-row">
      {framings.map((f) => (
        <button key={f.kind} className="btn small" title={f.title} onClick={() => emit('applyFraming', { kind: f.kind })}>
          {f.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Take bar — the Rehearse → Record → Review loop. Purely composes existing
 * store/SceneManager calls: it wraps beginRecording/finishRecording with a
 * 3-2-1 countdown and forces path ribbons on while rehearsing.
 */
function TakeBar(): JSX.Element {
  const recording = useStore((s) => s.recording)
  const selection = useStore((s) => s.selection)
  const [countdown, setCountdown] = useState<number | null>(null)
  const [pending, setPending] = useState<'camera' | 'performer' | null>(null)

  const singleEntity = selection?.kind === 'entity'

  // Tick the 3-2-1 countdown; at zero, arm the selection and start recording.
  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) {
      const s = useStore.getState()
      if (pending === 'camera') s.setSelection({ kind: 'camera' })
      s.setLookThrough(false)
      s.setTime(0)
      s.setRecording(true)
      setCountdown(null)
      setPending(null)
      return
    }
    const id = window.setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 800)
    return () => window.clearTimeout(id)
  }, [countdown, pending])

  const rehearse = (): void => {
    const s = useStore.getState()
    s.setShowPaths(true)
    s.setRecording(false)
    s.setLookThrough(false)
    s.setTime(0)
    s.setPlaying(true)
  }
  const review = (): void => {
    const s = useStore.getState()
    s.setRecording(false)
    s.setLookThrough(true)
    s.setTime(0)
    s.setPlaying(true)
  }
  const startCountdown = (which: 'camera' | 'performer'): void => {
    const s = useStore.getState()
    s.setPlaying(false)
    setPending(which)
    setCountdown(3)
  }
  const cancel = (): void => {
    setCountdown(null)
    setPending(null)
  }

  return (
    <>
      <div className="tool-row" title="排练 → 录制 → 回看：一条拍摄的工作流程">
        <button
          className="btn small"
          onClick={rehearse}
          disabled={recording || countdown !== null}
          title="排练：从头播放并显示路径带，拍摄前检查走位安排"
        >
          🔁 排练
        </button>
        {recording ? (
          <button
            className="btn small"
            style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
            onClick={() => useStore.getState().setRecording(false)}
            title="停止录制并保存这一条"
          >
            ■ 停止录制
          </button>
        ) : (
          <>
            <button
              className="btn small"
              onClick={() => startCountdown('camera')}
              disabled={countdown !== null}
              title="倒数 3、2、1 后录制摄影机运动：操控视图时会同步播放已有走位"
            >
              ⏺ 录制摄影机
            </button>
            <button
              className="btn small"
              onClick={() => startCountdown('performer')}
              disabled={countdown !== null || !singleEntity}
              title={
                singleEntity
                  ? '倒数 3、2、1 后录制此演员：用光标操控其表演'
                  : '先选择一位角色或一辆载具，再录制其表演'
              }
            >
              ⏺ 录制表演
            </button>
          </>
        )}
        <button
          className="btn small"
          onClick={review}
          disabled={recording || countdown !== null}
          title="回看：通过镜头摄影机播放（开启摄影机视角），画面与导出结果一致"
        >
          ▶ 回看
        </button>
      </div>
      {countdown !== null && countdown > 0 && (
        <div
          onClick={cancel}
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 60,
            pointerEvents: 'auto',
            cursor: 'pointer',
            background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.35), rgba(0,0,0,0.55))'
          }}
          title="点击取消"
        >
          <div
            style={{
              fontSize: 120,
              fontWeight: 800,
              color: 'var(--danger)',
              textShadow: '0 2px 24px rgba(0,0,0,0.6)',
              lineHeight: 1
            }}
          >
            {countdown}
          </div>
          <div style={{ marginTop: 10, fontSize: 13, letterSpacing: '0.14em', color: 'var(--text-faint)' }}>
            {pending === 'performer' ? '即将录制表演…' : '即将录制摄影机…'} · 点击取消
          </div>
        </div>
      )}
    </>
  )
}

function GizmoModeRow(): JSX.Element {
  const [mode, setMode] = useState<'translate' | 'rotate'>('translate')
  const apply = (m: 'translate' | 'rotate'): void => {
    setMode(m)
    getSceneManagerSafe()?.setGizmoMode(m)
  }
  return (
    <div className="tool-row">
      <button
        className={`btn small ${mode === 'translate' ? 'active' : ''}`}
        onClick={() => apply('translate')}
        title="使用操控箭头移动所选对象（G）"
      >
        ⇄ 移动
      </button>
      <button
        className={`btn small ${mode === 'rotate' ? 'active' : ''}`}
        onClick={() => apply('rotate')}
        title="旋转所选角色、车辆、道具或摄影机（R）"
      >
        ⟳ 旋转
      </button>
    </div>
  )
}

export function Viewport(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [viewRect, setViewRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [pipRect, setPipRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  const mode = useStore((s) => s.mode)
  const lookThrough = useStore((s) => s.lookThrough)
  const setLookThrough = useStore((s) => s.setLookThrough)
  const pipSize = useStore((s) => s.pipSize)
  const setPipSize = useStore((s) => s.setPipSize)
  const recording = useStore((s) => s.recording)
  const setRecording = useStore((s) => s.setRecording)
  const placingAssetId = useStore((s) => s.placingAssetId)
  const placingSequence = useStore((s) => s.placingSequence)
  const placingChoreography = useStore((s) => s.placingChoreography)
  const droppingMarks = useStore((s) => s.droppingMarks)
  const selection = useStore((s) => s.selection)
  const doc = useStore((s) => s.doc)
  const sceneId = useStore((s) => s.sceneId)
  const setSelection = useStore((s) => s.setSelection)
  const setDroppingMarks = useStore((s) => s.setDroppingMarks)

  const scene = doc?.scenes.find((s) => s.id === sceneId)
  const hasEntities = (scene?.entities.length ?? 0) > 0
  const hasMarks =
    (scene?.shots.some((sh) => sh.camera.marks.length > 0) ?? false) ||
    (scene?.blocking.some((b) => b.tracks.some((t) => t.marks.length > 0)) ?? false)

  useEffect(() => {
    if (!canvasRef.current) return
    const manager = new SceneManager(canvasRef.current)
    manager.onViewRect = (rect) => setViewRect(rect)
    manager.onPipRect = (rect) =>
      setPipRect((prev) =>
        prev?.x === rect?.x && prev?.y === rect?.y && prev?.w === rect?.w && prev?.h === rect?.h
          ? prev
          : rect
      )
    registerSceneManager(manager)
    return () => {
      registerSceneManager(null)
      manager.dispose()
    }
  }, [])

  const showLetterbox = (lookThrough || mode === 'deliver') && viewRect

  const singleEntitySelected = selection?.kind === 'entity'

  let hint: string | null = null
  if (placingChoreography)
    hint = `点击地面放置${{ dance: '舞蹈', fight: '打斗', chase: '追逐' }[placingChoreography.kind]}编排（面向你）· Esc 取消`
  else if (placingSequence)
    hint = `点击地面放置 ${placingSequence.count} 位演员（面向你）· Esc 取消`
  else if (placingAssetId) hint = `点击地面放置 · 按住 ${window.blockout.platform.alternateModifier} 点击可连续放置 · Esc 取消`
  else if (droppingMarks && selection?.kind === 'entity')
    hint = '按顺序点击地面添加走位点 · 完成后按 Esc'
  else if (droppingMarks && selection?.kind === 'camera')
    hint = '点击地面添加摄影机走位点 · 或使用“在当前视图添加摄影机走位点”'
  else if (selection?.kind === 'entities')
    hint = `已选择 ${selection.entityIds.length} 个对象 · 拖动可整体移动 · 可在属性面板中绑定 · ⌫ 删除全部`

  return (
    <>
      <canvas ref={canvasRef} />
      {mode !== 'deliver' && <Hud />}
      {mode !== 'deliver' && (
        <div className="viewport-tools">
          {mode === 'shoot' && (
            <div className="tool-row">
              <button
                className="btn small primary"
                onClick={() => {
                  const s = useStore.getState()
                  s.setLookThrough(true)
                  s.setTime(0)
                  s.setPlaying(true)
                }}
                title="观看镜头：通过镜头摄影机从头播放，构图与导出结果一致"
              >
                ▶ 播放镜头
              </button>
              <button
                className={`btn small ${lookThrough ? 'active' : ''}`}
                onClick={() => setLookThrough(!lookThrough)}
                title="切换到镜头摄影机视角（C）"
              >
                🎥 摄影机视角
              </button>
              <button
                className="btn small"
                onClick={() => {
                  setSelection({ kind: 'camera' })
                  emit('dropCameraMarkAtView', {})
                }}
                title="在当前视图添加摄影机走位点"
              >
                + 摄影机走位点
              </button>
              <button
                className={`btn small ${droppingMarks ? 'active' : ''}`}
                onClick={() => setDroppingMarks(!droppingMarks)}
                disabled={!selection}
                title="点击地面，为所选对象添加走位点（M）"
              >
                + 走位点
              </button>
              <button
                className={`btn small ${recording ? 'active' : ''}`}
                style={recording ? { color: 'var(--danger)', borderColor: 'var(--danger)' } : undefined}
                onClick={() => setRecording(!recording)}
                title={
                  singleEntitySelected
                    ? '录制所选角色或载具：用光标操控，同时播放其他对象的动作'
                    : '录制摄影机：操控视图，录制时会同步播放已有走位'
                }
              >
                {recording ? '■ 停止' : singleEntitySelected ? '● 录制演员' : '● 录制摄影机'}
              </button>
              <RecordControlToggle />
              <ReferenceControls />
            </div>
          )}
          {mode === 'shoot' && <ShotSizeRow />}
          {mode === 'shoot' && <FramingRow />}
          {mode === 'shoot' && <TakeBar />}
          <GizmoModeRow />
          <div className="tool-row">
            <button
              className="btn small"
              disabled={!selection || (selection.kind !== 'entity' && selection.kind !== 'entities')}
              onClick={() => getSceneManagerSafe()?.snapSelectionToGround()}
              title="将所选对象贴合到下方表面，例如地面、桌面或货车车厢"
            >
              ⬇ 贴合地面
            </button>
          </div>
        </div>
      )}
      {mode === 'shoot' && <ReferenceUnderlay />}

      {/* PiP live shot preview chrome */}
      {pipRect && !lookThrough && mode !== 'deliver' && (
        <div
          style={{
            position: 'absolute',
            left: pipRect.x - 1,
            top: pipRect.y - 1,
            width: pipRect.w + 2,
            height: pipRect.h + 2,
            border: '1px solid var(--border-strong)',
            borderRadius: 4,
            zIndex: 5,
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -26,
              left: 0,
              right: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              pointerEvents: 'auto'
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-faint)' }}>
              镜头预览
            </span>
            <span style={{ flex: 1 }} />
            <button
              className="btn small"
              style={{ padding: '2px 7px', fontSize: 10 }}
              title="切换预览大小"
              onClick={() =>
                setPipSize(pipSize === 'small' ? 'medium' : pipSize === 'medium' ? 'large' : 'small')
              }
            >
              {pipSize === 'small' ? '小' : pipSize === 'medium' ? '中' : '大'}
            </button>
            <button
              className="btn small"
              style={{ padding: '2px 7px', fontSize: 10 }}
              title="隐藏预览"
              onClick={() => setPipSize('off')}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      {pipSize === 'off' && !lookThrough && mode !== 'deliver' && (
        <button
          className="btn small"
          style={{ position: 'absolute', right: 14, bottom: 14, zIndex: 5 }}
          onClick={() => setPipSize('medium')}
          title="显示实时镜头预览"
        >
          🎥 预览
        </button>
      )}
      {recording && (
        <div className="viewport-hint" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          {singleEntitySelected
            ? '● 录制中 · 在地面上移动光标，演员会跟随移动。点击“■ 停止”保存表演。'
            : '● 录制中 · 操控视图（环绕、平移、缩放）来录制镜头。点击“■ 停止”保存摄影机运动。'}
        </div>
      )}

      {showLetterbox && viewRect && (
        <div
          style={{
            position: 'absolute',
            left: viewRect.x,
            top: viewRect.y,
            width: viewRect.w,
            height: viewRect.h,
            pointerEvents: 'none',
            zIndex: 4
          }}
        >
          {/* Rule-of-thirds grid */}
          {[1, 2].map((i) => (
            <div
              key={`v${i}`}
              style={{
                position: 'absolute',
                left: `${(i / 3) * 100}%`,
                top: 0,
                bottom: 0,
                width: 1,
                background: 'rgba(255,255,255,0.14)'
              }}
            />
          ))}
          {[1, 2].map((i) => (
            <div
              key={`h${i}`}
              style={{
                position: 'absolute',
                top: `${(i / 3) * 100}%`,
                left: 0,
                right: 0,
                height: 1,
                background: 'rgba(255,255,255,0.14)'
              }}
            />
          ))}
          {/* Action-safe area */}
          <div
            style={{
              position: 'absolute',
              inset: '5%',
              border: '1px solid rgba(255,255,255,0.10)'
            }}
          />
        </div>
      )}

      {hint && <div className="viewport-hint">{hint}</div>}

      {!hasEntities && mode === 'stage' && (
        <div className="empty-state">
          <div style={{ fontSize: 36 }}>🎬</div>
          <div>先点击资源库中的对象，再点击地面放置。</div>
        </div>
      )}
      {hasEntities && !hasMarks && mode === 'shoot' && !droppingMarks && (
        <div className="empty-state">
          <div>选择演员或摄影机，按 M，再点击地面添加走位点。</div>
        </div>
      )}
    </>
  )
}

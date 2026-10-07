/**
 * Context-sensitive right panel. Content is driven by store.selection and the
 * current mode: nothing selected → scene/lighting/shot; an entity, the shot
 * camera, or a single mark → their editors. Every write goes through
 * store.mutate or a store action; angles are radians in the doc and shown as
 * degrees where a filmmaker expects degrees.
 */

import { useStore } from '../store'
import { zh } from '../i18n/zh-CN'
import { emit } from '../bus'
import { useState } from 'react'
import { SENSORS, LENS_SET, SHOT_SIZES } from '@engine/camera'
import { GAITS } from '@engine/gaits'
import { RIGS } from '@engine/rigs'
import { MOTION_PRESETS, type MotionPreset } from '@engine/motions'
import { CAMERA_MOVE_PRESETS } from '@engine/camera-moves'
import { ACTION_PRESETS } from '@engine/action-presets'
import { ShotEvaluator } from '@engine/evaluate'
import { newId } from '@engine/ids'
import { getSceneManager } from '../export/scene-access'
import type {
  ActorMark,
  CameraMark,
  Entity,
  GaitId,
  LightingPresetId,
  RigId,
  SensorId,
  ShotSizeId,
  AspectId,
  ProjectDoc,
  Scene,
  Shot
} from '@engine/types'

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi)
const toDeg = (rad: number): number => Math.round((rad * 180) / Math.PI)
const toRad = (deg: number): number => (deg * Math.PI) / 180

const SWATCHES = ['#e5484d', '#f5a524', '#46a758', '#3b82f6', '#a855f7', '#ec4899', '#14b8a6', '#f97316']

const LIGHTING: { id: LightingPresetId; label: string }[] = [
  { id: 'day', label: '白天' },
  { id: 'goldenHour', label: '黄金时段' },
  { id: 'night', label: '夜晚' },
  { id: 'interiorWarm', label: '暖色室内' },
  { id: 'interiorCool', label: '冷色室内' },
  { id: 'club', label: '夜店' },
  // Physical-sky presets (real atmospheric dome, deterministic).
  { id: 'middaySky', label: '正午天空' },
  { id: 'goldenHourSky', label: '黄金时段天空' },
  { id: 'blueHourSky', label: '蓝调时刻天空' }
]

const ASPECTS: AspectId[] = ['16:9', '9:16', '2.39:1', '4:3', '1:1']
const SHOT_SIZE_BTNS: ShotSizeId[] = ['WS', 'FS', 'MS', 'MCU', 'CU']

function num(v: string): number | null {
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

/* ---------------------------------------------------------------------- */

export function Inspector(): JSX.Element {
  const selection = useStore((s) => s.selection)
  const scene = useStore((s) => s.scene())
  const shot = useStore((s) => s.shot())
  // Pinned tabs: camera controls and character animation reachable at ANY
  // time, whatever is selected.
  const [tab, setTab] = useState<'auto' | 'camera' | 'animate'>('auto')

  if (!scene || !shot) return <div />

  let body: JSX.Element
  if (tab === 'camera') {
    body = <CameraInspector scene={scene} shot={shot} />
  } else if (tab === 'animate') {
    body = <AnimateTab scene={scene} shot={shot} />
  } else if (selection === null) {
    body = <SceneInspector scene={scene} shot={shot} />
  } else if (selection.kind === 'entity') {
    body = <EntityInspector scene={scene} shot={shot} entityId={selection.entityId} />
  } else if (selection.kind === 'entities') {
    body = <MultiEntityInspector scene={scene} entityIds={selection.entityIds} />
  } else if (selection.kind === 'camera') {
    body = <CameraInspector scene={scene} shot={shot} />
  } else if (selection.kind === 'scan') {
    body = <ScanInspector scene={scene} scanId={selection.scanId} />
  } else if (selection.kind === 'marks') {
    body = (
      <MultiMarkInspector
        scene={scene}
        shot={shot}
        entityId={selection.entityId}
        markIds={selection.markIds}
      />
    )
  } else {
    body = (
      <MarkInspector
        scene={scene}
        shot={shot}
        entityId={selection.entityId}
        markId={selection.markId}
      />
    )
  }

  return (
    <div>
      <div className="panel-section" style={{ paddingBottom: 0 }}>
        <div className="seg">
          <button
            className={tab === 'auto' ? 'active' : ''}
            onClick={() => setTab('auto')}
            title="显示当前选择的属性"
          >
            当前选择
          </button>
          <button
            className={tab === 'camera' ? 'active' : ''}
            onClick={() => setTab('camera')}
            title="固定显示摄影机控制：焦距、位置、朝向、支撑方式、运镜和跟踪，不受当前选择影响"
          >
            🎥 摄影机
          </button>
          <button
            className={tab === 'animate' ? 'active' : ''}
            onClick={() => setTab('animate')}
            title="为所选对象添加打斗、舞蹈、坐下、喝水、跳跃、飞行或驾驶动作，也可一次调整整组选中对象"
          >
            ✨ 动作
          </button>
        </div>
      </div>
      {body}
    </div>
  )
}

/* --------------------------- ✨ Animate tab ---------------------------- */

/**
 * One obvious place to make things PERFORM. Single character → the full
 * motion + action libraries. A shift-click group → restyle everyone at
 * once (swap the dance, change the chase). Nothing selected → how-to.
 */
function AnimateTab({ scene, shot }: { scene: Scene; shot: Shot }): JSX.Element {
  const selection = useStore((s) => s.selection)

  if (selection?.kind === 'entity') {
    const entity = scene.entities.find((e) => e.id === selection.entityId)
    if (!entity) return <div className="panel-section">未找到对象。</div>
    return (
      <div>
        <div className="panel-section">
          <div className="panel-title">动作对象： {entity.label?.text || entity.name}</div>
          <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4 }}>
            预设会从播放头位置添加可编辑的标记。应用后按 ▶ 预览，再调整各个标记。
          </p>
        </div>
        {entity.assetId.startsWith('person.') && (
          <MotionPresetsSection scene={scene} shot={shot} entity={entity} />
        )}
        <ActionPresetsSection scene={scene} shot={shot} entity={entity} />
      </div>
    )
  }

  if (selection?.kind === 'entities') {
    return <GroupAnimateSection entityIds={selection.entityIds} />
  }

  return (
    <div className="panel-section">
      <div className="panel-title">✨ 动作</div>
      <p style={{ color: 'var(--text-dim)', fontSize: 12, lineHeight: 1.6 }}>
        选择一名<b>角色</b>，为其添加打斗、舞蹈、坐下或喝水等动作；也可选择
        <b>车辆或道具</b>，添加起飞、追逐或坠落动作。
        <br />
        <br />
        按住 ⇧ 点击选择<b>多名角色</b>（或从资源库添加动作序列），即可在此一次调整全组动作，例如更换舞蹈风格。
      </p>
    </div>
  )
}

/** Restyle a whole selected group in one click. */
function GroupAnimateSection({ entityIds }: { entityIds: string[] }): JSX.Element {
  const scene = useStore((s) => s.scene())
  const applyMotionToEntities = useStore((s) => s.applyMotionToEntities)
  const applyActionToEntities = useStore((s) => s.applyActionToEntities)
  const [motionId, setMotionId] = useState(MOTION_PRESETS[0]!.id)
  const [actionId, setActionId] = useState(ACTION_PRESETS[0]!.id)

  const people = entityIds.filter((id) =>
    scene?.entities.find((e) => e.id === id)?.assetId.startsWith('person.')
  )
  const motionCats = [...new Set(MOTION_PRESETS.map((p) => p.category))]
  const actionCats = [...new Set(ACTION_PRESETS.map((p) => p.category))]

  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">让 {entityIds.length} 个对象一起表演</div>
        <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4 }}>
          在当前位置替换每名角色的动作编排。已添加的序列只是起点，一次撤销即可还原。
        </p>
      </div>
      {people.length > 0 && (
        <div className="panel-section">
          <div className="panel-title">全员表演 ({people.length} 人)</div>
          <div className="field">
            <select value={motionId} onChange={(e) => setMotionId(e.target.value)}>
              {motionCats.map((cat) => (
                <optgroup key={cat} label={zh(cat)}>
                  {MOTION_PRESETS.filter((p) => p.category === cat).map((p) => (
                    <option key={p.id} value={p.id}>
                      {zh(p.name)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <button
            className="btn primary"
            style={{ width: '100%' }}
            onClick={() => applyMotionToEntities(people, motionId)}
          >
            应用到全部 {people.length} 名角色
          </button>
        </div>
      )}
      <div className="panel-section">
        <div className="panel-title">全员移动 ({entityIds.length})</div>
        <div className="field">
          <select value={actionId} onChange={(e) => setActionId(e.target.value)}>
            {actionCats.map((cat) => (
              <optgroup key={cat} label={zh(cat)}>
                {ACTION_PRESETS.filter((p) => p.category === cat).map((p) => (
                  <option key={p.id} value={p.id}>
                    {zh(p.name)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <button
          className="btn"
          style={{ width: '100%' }}
          onClick={() => applyActionToEntities(entityIds, actionId)}
          title="每个所选对象都从自身位置和朝向沿此路径移动，可用于编队起飞或同步追逐"
        >
          为全组选用此路径
        </button>
      </div>
    </div>
  )
}

/* ------------------------------ helpers -------------------------------- */

function useMutate(): (label: string, fn: (doc: ProjectDoc) => void) => void {
  return useStore((s) => s.mutate)
}

function findScene(doc: ProjectDoc, sceneId: string): Scene | undefined {
  return doc.scenes.find((s) => s.id === sceneId)
}
function findShot(doc: ProjectDoc, sceneId: string, shotId: string): Shot | undefined {
  return findScene(doc, sceneId)?.shots.find((s) => s.id === shotId)
}
/** Find a shot that may live in scene.shots OR scene.drafts (a draft is the current shot). */
function findShotOrDraft(doc: ProjectDoc, sceneId: string, shotId: string): Shot | undefined {
  const sc = findScene(doc, sceneId)
  return sc?.shots.find((s) => s.id === shotId) ?? sc?.drafts?.find((s) => s.id === shotId)
}
function findEntity(doc: ProjectDoc, sceneId: string, entityId: string): Entity | undefined {
  return findScene(doc, sceneId)?.entities.find((e) => e.id === entityId)
}

/* =========================== A) Scene =============================== */

/** Scene-level list of imported 3D scans (Gaussian splats). */
function ScansSection({ scene }: { scene: Scene }): JSX.Element {
  const setScanVisible = useStore((s) => s.setScanVisible)
  const removeScan = useStore((s) => s.removeScan)
  const setSelection = (scanId: string): void => useStore.setState({ selection: { kind: 'scan', scanId } })

  return (
    <div className="panel-section">
      <div className="panel-title">3D 扫描</div>
      {(scene.scans ?? []).map((scan) => (
        <div key={scan.id} className="field-row" style={{ alignItems: 'center', gap: 6 }}>
          <button
            className="btn"
            style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis' }}
            onClick={() => setSelection(scan.id)}
            title="选择此扫描，编辑位置、旋转和缩放"
          >
            🏙 {scan.name}
          </button>
          <button
            className="btn"
            onClick={() => setScanVisible(scan.id, !scan.visible)}
            title={scan.visible ? '在编辑器视口中隐藏' : '在编辑器视口中显示'}
          >
            {scan.visible ? '👁' : '—'}
          </button>
          <button className="btn" onClick={() => removeScan(scan.id)} title="从场景移除（文件仍保留在项目中）">
            ✕
          </button>
        </div>
      ))}
      <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4, margin: '4px 0 0' }}>
        扫描仅用于编辑器中的布景和走位，不会出现在导出画面中。
      </p>
    </div>
  )
}

/** Transform editor for a selected 3D scan. */
function ScanInspector({ scene, scanId }: { scene: Scene; scanId: string }): JSX.Element {
  const updateScanTransform = useStore((s) => s.updateScanTransform)
  const scan = scene.scans?.find((s) => s.id === scanId)
  if (!scan) return <div className="panel-section">未找到扫描。</div>

  const num = (v: number): string => String(Math.round(v * 100) / 100)

  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">🏙 {scan.name}</div>
        <div className="field-row">
          {(['x', 'y', 'z'] as const).map((axis) => (
            <div className="field" key={axis} style={{ flex: 1 }}>
              <label>{axis.toUpperCase()} (m)</label>
              <input
                type="number"
                step={0.5}
                value={num(scan.position[axis])}
                onChange={(e) =>
                  updateScanTransform(scanId, {
                    position: { ...scan.position, [axis]: Number(e.target.value) || 0 }
                  })
                }
              />
            </div>
          ))}
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>旋转 (°)</label>
            <input
              type="number"
              step={5}
              value={Math.round((scan.rotationY * 180) / Math.PI)}
              onChange={(e) =>
                updateScanTransform(scanId, { rotationY: ((Number(e.target.value) || 0) * Math.PI) / 180 })
              }
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>缩放</label>
            <input
              type="number"
              step={0.1}
              min={0.01}
              value={num(scan.scale)}
              onChange={(e) => updateScanTransform(scanId, { scale: Math.max(0.01, Number(e.target.value) || 1) })}
            />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, margin: '6px 0' }}>
          <input
            type="checkbox"
            checked={scan.flipped === true}
            onChange={(e) => updateScanTransform(scanId, { flipped: e.target.checked })}
          />
          扫描上下颠倒（翻转）
        </label>
        <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4 }}>
          先将扫描地面对齐网格，再在其中布景和安排走位。部分手机扫描或 .splat 文件载入后会上下颠倒，此时勾选翻转。扫描仅用于编辑，不会出现在导出画面中。
        </p>
      </div>
    </div>
  )
}

function SceneInspector({ scene, shot }: { scene: Scene; shot: Shot }): JSX.Element {
  const mode = useStore((s) => s.mode)
  const mutate = useMutate()
  const env = scene.environment

  const setEnv = (label: string, fn: (e: Scene['environment']) => void): void => {
    mutate(label, (doc) => {
      const sc = findScene(doc, scene.id)
      if (sc) fn(sc.environment)
    })
  }

  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">场景</div>
        <div className="field">
          <label>名称</label>
          <input
            type="text"
            value={scene.name}
            onChange={(e) =>
              mutate('scene name', (doc) => {
                const sc = findScene(doc, scene.id)
                if (sc) sc.name = e.target.value
              })
            }
          />
        </div>
        {mode === 'stage' && (
          <p style={{ color: 'var(--text-faint)', fontSize: 12, lineHeight: 1.5 }}>
            点击资源库中的对象，再点击地面放置。
          </p>
        )}
      </div>

      {(scene.scans?.length ?? 0) > 0 && <ScansSection scene={scene} />}

      <div className="panel-section">
        <div className="panel-title">灯光</div>
        <div className="seg" style={{ marginBottom: 10 }}>
          {LIGHTING.map((l) => (
            <button
              key={l.id}
              className={env.lighting === l.id ? 'active' : ''}
              onClick={() => setEnv('lighting', (e) => (e.lighting = l.id))}
            >
              {l.label}
            </button>
          ))}
        </div>
        <div className="field">
          <label>太阳方位角</label>
          <input
            type="range"
            min={0}
            max={Math.PI * 2}
            step={0.01}
            value={env.sunAzimuth}
            onChange={(e) => {
              const v = num(e.target.value)
              if (v !== null) setEnv('sun azimuth', (env2) => (env2.sunAzimuth = v))
            }}
          />
        </div>
        <div className="field">
          <label>太阳高度角</label>
          <input
            type="range"
            min={0.1}
            max={1.5}
            step={0.01}
            value={env.sunElevation}
            onChange={(e) => {
              const v = num(e.target.value)
              if (v !== null) setEnv('sun elevation', (env2) => (env2.sunElevation = v))
            }}
          />
        </div>
        <div className="field">
          <label>雾</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={env.fog}
            onChange={(e) => {
              const v = num(e.target.value)
              if (v !== null) setEnv('fog', (env2) => (env2.fog = v))
            }}
          />
        </div>
      </div>

      <ShotSection scene={scene} shot={shot} />
    </div>
  )
}

function ShotSection({ scene, shot }: { scene: Scene; shot: Shot }): JSX.Element {
  const mutate = useMutate()
  const setTime = useStore((s) => s.setTime)
  const time = useStore((s) => s.time)

  return (
    <div className="panel-section">
      <div className="panel-title">镜头</div>
      <div className="field">
        <label>时长 (s)</label>
        <input
          type="number"
          min={0.5}
          max={60}
          step={0.5}
          value={shot.duration}
          onChange={(e) => {
            const v = num(e.target.value)
            if (v === null) return
            const next = clamp(v, 0.5, 60)
            mutate('shot duration', (doc) => {
              const sh = findShot(doc, scene.id, shot.id)
              if (!sh) return
              // Duration only — never clamp marks: the blocking take is
              // shared across shots (coverage model) and out-of-range marks
              // are harmless to the evaluator.
              sh.duration = next
            })
            if (time > next) setTime(next)
          }}
        />
      </div>
      <div className="field">
        <label>画幅比例</label>
        <div className="seg">
          {ASPECTS.map((a) => (
            <button
              key={a}
              className={shot.aspect === a ? 'active' : ''}
              onClick={() =>
                mutate('shot aspect', (doc) => {
                  const sh = findShot(doc, scene.id, shot.id)
                  if (sh) sh.aspect = a
                })
              }
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>备注</label>
        <textarea
          rows={3}
          value={shot.notes ?? ''}
          onChange={(e) =>
            mutate('shot notes', (doc) => {
              const sh = findShot(doc, scene.id, shot.id)
              if (sh) sh.notes = e.target.value
            })
          }
        />
      </div>
    </div>
  )
}

/* =========================== B) Entity ============================= */

function EntityInspector({
  scene,
  shot,
  entityId
}: {
  scene: Scene
  shot: Shot
  entityId: string
}): JSX.Element {
  const mode = useStore((s) => s.mode)
  const mutate = useMutate()
  const setSelection = useStore((s) => s.setSelection)
  const setDroppingMarks = useStore((s) => s.setDroppingMarks)

  const entity = scene.entities.find((e) => e.id === entityId)
  if (!entity) return <div className="panel-section">未找到对象。</div>

  const isPerson = entity.assetId.startsWith('person.')

  const editEntity = (label: string, fn: (e: Entity) => void): void => {
    mutate(label, (doc) => {
      const en = findEntity(doc, scene.id, entityId)
      if (en) fn(en)
    })
  }

  const heightParam = typeof entity.params?.height === 'number' ? entity.params.height : 1
  const buildParam = typeof entity.params?.build === 'number' ? entity.params.build : 1

  // Marks for this entity in the current take.
  const take = scene.blocking.find((b) => b.id === shot.blockingTakeId)
  const track = take?.tracks.find((t) => t.entityId === entityId)
  const marks = [...(track?.marks ?? [])].sort((a, b) => a.time - b.time)

  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">对象</div>
        <div className="field">
          <label>名称</label>
          <input
            type="text"
            value={entity.name}
            onChange={(e) => editEntity('entity name', (en) => (en.name = e.target.value))}
          />
        </div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>X</label>
            <input
              type="number"
              step={0.1}
              value={entity.transform.position.x}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editEntity('move entity', (en) => (en.transform.position.x = v))
              }}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Y</label>
            <input
              type="number"
              step={0.1}
              value={entity.transform.position.y}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editEntity('move entity', (en) => (en.transform.position.y = v))
              }}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Z</label>
            <input
              type="number"
              step={0.1}
              value={entity.transform.position.z}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editEntity('move entity', (en) => (en.transform.position.z = v))
              }}
            />
          </div>
        </div>
        <div className="field">
          <label>旋转角度 (°)</label>
          <input
            type="number"
            step={1}
            value={toDeg(entity.transform.rotationY)}
            onChange={(e) => {
              const v = num(e.target.value)
              if (v !== null) editEntity('rotate entity', (en) => (en.transform.rotationY = toRad(v)))
            }}
          />
        </div>
        <div className="field">
          <label>缩放比例 ({entity.transform.scale.toFixed(2)})</label>
          <input
            type="range"
            min={0.3}
            max={3}
            step={0.01}
            value={entity.transform.scale}
            onChange={(e) => {
              const v = num(e.target.value)
              if (v !== null) editEntity('scale entity', (en) => (en.transform.scale = v))
            }}
          />
        </div>
        {isPerson && (
          <>
            <div className="field">
              <label>身高系数 ({heightParam.toFixed(2)})</label>
              <input
                type="range"
                min={0.8}
                max={1.2}
                step={0.01}
                value={heightParam}
                onChange={(e) => {
                  const v = num(e.target.value)
                  if (v !== null)
                    editEntity('entity height', (en) => {
                      en.params = { ...en.params, height: v }
                    })
                }}
              />
            </div>
            <div className="field">
              <label>体型系数 ({buildParam.toFixed(2)})</label>
              <input
                type="range"
                min={0.8}
                max={1.3}
                step={0.01}
                value={buildParam}
                onChange={(e) => {
                  const v = num(e.target.value)
                  if (v !== null)
                    editEntity('entity build', (en) => {
                      en.params = { ...en.params, build: v }
                    })
                }}
              />
            </div>
          </>
        )}
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={entity.excludeFromExport === true}
              onChange={(e) => {
                const hide = e.target.checked
                editEntity('hide in exports', (en) => {
                  if (hide) en.excludeFromExport = true
                  else delete en.excludeFromExport
                })
              }}
              style={{ width: 'auto', marginRight: 6 }}
            />
            导出时隐藏
          </label>
        </div>
      </div>

      {isPerson && <PoseSection entity={entity} editEntity={editEntity} />}

      <MarriageSection scene={scene} entity={entity} />


      <div className="panel-section">
        <div className="panel-title">标签</div>
        <div className="field-row" style={{ marginBottom: 8 }}>
          <input
            type="text"
            placeholder="标签文字"
            value={entity.label?.text ?? ''}
            onChange={(e) => {
              const text = e.target.value
              editEntity('entity label', (en) => {
                if (text.trim() === '') {
                  delete en.label
                } else {
                  en.label = { text, color: en.label?.color ?? '#f5a524' }
                }
              })
            }}
          />
          <input
            type="color"
            value={entity.label?.color ?? '#f5a524'}
            onChange={(e) => {
              const color = e.target.value
              editEntity('label color', (en) => {
                en.label = { text: en.label?.text ?? '', color }
              })
            }}
          />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {SWATCHES.map((c) => (
            <button
              key={c}
              className="swatch"
              style={{ background: c }}
              onClick={() =>
                editEntity('label color', (en) => {
                  en.label = { text: en.label?.text ?? '', color: c }
                })
              }
            />
          ))}
        </div>
      </div>

      {mode === 'shoot' && (
        <div className="panel-section">
          <div className="panel-title">走位</div>
          <button
            className="btn"
            style={{ width: '100%', marginBottom: 8 }}
            onClick={() => setDroppingMarks(true)}
          >
            放置标记 (M)
          </button>
          {marks.map((m, i) => (
            <div
              key={m.id}
              className="mark-row"
              onClick={() => setSelection({ kind: 'mark', entityId, markId: m.id })}
            >
              标记 {i + 1} — {m.time.toFixed(1)}s — {zh(GAITS[(m as ActorMark).gait].name)}
            </div>
          ))}
        </div>
      )}

      {mode === 'shoot' && entity.assetId.startsWith('person.') && (
        <MotionPresetsSection scene={scene} shot={shot} entity={entity} />
      )}

      {mode === 'shoot' && <ActionPresetsSection scene={scene} shot={shot} entity={entity} />}

      <div className="panel-section">
        <div className="panel-title">删除操作</div>
        <button
          className="btn danger"
          style={{ width: '100%' }}
          onClick={() => {
            mutate('delete entity', (doc) => {
              const sc = findScene(doc, scene.id)
              if (!sc) return
              sc.entities = sc.entities.filter((e) => e.id !== entityId)
              for (const take2 of sc.blocking) {
                take2.tracks = take2.tracks.filter((t) => t.entityId !== entityId)
              }
              // Unmount any camera parented to the deleted entity — its
              // local-frame marks would otherwise re-base to world space.
              for (const sh of sc.shots) {
                if (sh.camera.mountEntityId === entityId) delete sh.camera.mountEntityId
              }
            })
            setSelection(null)
          }}
        >
          删除对象
        </button>
      </div>
    </div>
  )
}

/* ------------------------- motion presets ------------------------------ */

const MOTION_CATEGORIES: { key: MotionPreset['category']; label: string }[] = [
  { key: 'fight', label: '打斗' },
  { key: 'dance', label: '舞蹈' },
  { key: 'gesture', label: '手势' },
  { key: 'everyday', label: '日常' },
  { key: 'sport', label: '运动' },
  { key: 'stunt', label: '特技' }
]

/**
 * Mixamo-style motion library: applying a preset lays down pose keyframes
 * as marks starting at the playhead — punch, dance, dodge without hand-
 * animating every joint. Marks stay editable afterwards.
 */
function MotionPresetsSection({
  scene,
  shot,
  entity
}: {
  scene: Scene
  shot: Shot
  entity: Entity
}): JSX.Element {
  const mutate = useMutate()
  const time = useStore((s) => s.time)
  const toast = useStore((s) => s.toast)
  const [category, setCategory] = useState<MotionPreset['category']>('fight')

  const apply = (preset: MotionPreset): void => {
    // Where the character stands at the playhead — the motion plays from
    // there. Keyframe `move` offsets (jump height, crawl distance, stair
    // climb) are applied along the character's heading.
    const state = new ShotEvaluator(scene, shot).evaluate(time)
    const es = state.entities.find((e) => e.entityId === entity.id)
    const pos = es
      ? { x: es.position.x, y: es.position.y, z: es.position.z }
      : { ...entity.transform.position }
    const heading = es?.heading ?? entity.transform.rotationY
    const fwd = { x: -Math.sin(heading), z: -Math.cos(heading) }
    let added = 0
    mutate(`motion: ${preset.name}`, (doc) => {
      const sc = findScene(doc, scene.id)
      const sh = findShot(doc, scene.id, shot.id)
      const take = sc?.blocking.find((b) => b.id === sh?.blockingTakeId)
      if (!sc || !sh || !take) return
      let track = take.tracks.find((t) => t.entityId === entity.id)
      if (!track) {
        track = { entityId: entity.id, marks: [] }
        take.tracks.push(track)
      }
      for (const kf of preset.keyframes) {
        const t = time + kf.t
        if (t > sh.duration + 1e-6) break
        const forward = kf.move?.forward ?? 0
        const up = kf.move?.up ?? 0
        track.marks.push({
          id: newId('mark'),
          time: t,
          hold: 0,
          easeIn: 0,
          easeOut: 0,
          position: {
            x: pos.x + fwd.x * forward,
            y: Math.max(0, pos.y + up),
            z: pos.z + fwd.z * forward
          },
          gait: 'stand',
          joints: { ...kf.joints }
        })
        added++
      }
    })
    if (added > 0) {
      toast(
        `${zh(preset.name)}，从 ${time.toFixed(1)}s 开始（${added} 个姿态${added < preset.keyframes.length ? '，延长镜头可播放完整动作' : ''}）。按 ▶ 预览。`,
        'success'
      )
    } else {
      toast('镜头剩余时长不足，请将播放头前移。', 'info')
    }
  }

  const items = MOTION_PRESETS.filter((p) => p.category === category)
  return (
    <div className="panel-section">
      <div className="panel-title">动作预设</div>
      <div className="seg" style={{ marginBottom: 8 }}>
        {MOTION_CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={category === c.key ? 'active' : ''}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>
      {items.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ flex: 1, fontSize: 12 }}>
            {zh(p.name)}
            <span style={{ opacity: 0.55 }}> · {p.duration.toFixed(1)}s</span>
          </span>
          <button
            className="btn small"
            onClick={() => apply(p)}
            title={`在播放头处插入“${zh(p.name)}”，生成可编辑的姿态标记`}
          >
            应用
          </button>
        </div>
      ))}
    </div>
  )
}

/* --------------------------- action presets ---------------------------- */

/**
 * Motion-path presets for anything that flies, drives, falls, or gets
 * thrown: plane takeoffs and landings, helicopter orbits, bird swoops, car
 * chases, collapsing debris. Applying one lays a full flight/drive path of
 * marks (with altitude) from the entity's pose at the playhead.
 */
function ActionPresetsSection({
  scene,
  shot,
  entity
}: {
  scene: Scene
  shot: Shot
  entity: Entity
}): JSX.Element {
  const mutate = useMutate()
  const time = useStore((s) => s.time)
  const toast = useStore((s) => s.toast)
  const [presetId, setPresetId] = useState(ACTION_PRESETS[0]!.id)
  const preset = ACTION_PRESETS.find((p) => p.id === presetId)
  const categories = [...new Set(ACTION_PRESETS.map((p) => p.category))]

  const apply = (): void => {
    if (!preset) return
    const remaining = shot.duration - time
    if (remaining < 1) {
      toast('播放头之后的镜头时长不足，请将播放头前移。', 'info')
      return
    }
    // Pose at the playhead: the path starts where the entity IS.
    const state = new ShotEvaluator(scene, shot).evaluate(time)
    const es = state.entities.find((e) => e.entityId === entity.id)
    const start = es
      ? { x: es.position.x, y: es.position.y, z: es.position.z, heading: es.heading }
      : {
          x: entity.transform.position.x,
          y: entity.transform.position.y,
          z: entity.transform.position.z,
          heading: entity.transform.rotationY
        }
    const specs = preset.generate({ start, duration: remaining })
    mutate(`action: ${preset.name}`, (doc) => {
      const sc = findScene(doc, scene.id)
      const sh = findShot(doc, scene.id, shot.id)
      const take = sc?.blocking.find((b) => b.id === sh?.blockingTakeId)
      if (!sc || !take) return
      let track = take.tracks.find((t) => t.entityId === entity.id)
      if (!track) {
        track = { entityId: entity.id, marks: [] }
        take.tracks.push(track)
      }
      // The action owns the timeline from the playhead on — clear the way.
      track.marks = track.marks.filter((m) => m.time < time - 1e-6)
      for (const spec of specs) {
        track.marks.push({
          id: newId('mark'),
          time: time + spec.time,
          hold: spec.hold,
          easeIn: spec.easeIn,
          easeOut: spec.easeOut,
          position: { ...spec.position },
          gait: spec.gait
        })
      }
    })
    toast(`${zh(preset.name)}，从 ${time.toFixed(1)}s 开始。按 ▶ 预览，每个标记均可编辑。`, 'success')
  }

  return (
    <div className="panel-section">
      <div className="panel-title">路径预设</div>
      <div className="field">
        <label>飞行、驾驶与特技路径，从播放头位置开始</label>
        <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
          {categories.map((cat) => (
            <optgroup key={cat} label={zh(cat)}>
              {ACTION_PRESETS.filter((p) => p.category === cat).map((p) => (
                <option key={p.id} value={p.id}>
                  {zh(p.name)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {preset && (
        <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>
          {zh(preset.description)}
        </p>
      )}
      <button className="btn primary" style={{ width: '100%' }} onClick={apply}>
        应用路径
      </button>
    </div>
  )
}

/* ---------------------------- marriage --------------------------------- */

function MarriageSection({ scene, entity }: { scene: Scene; entity: Entity }): JSX.Element {
  const unmarryEntities = useStore((s) => s.unmarryEntities)
  const marryEntities = useStore((s) => s.marryEntities)

  const parent = entity.attachedTo
    ? scene.entities.find((e) => e.id === entity.attachedTo)
    : undefined
  const parentName = parent ? parent.label?.text || parent.name : entity.attachedTo

  return (
    <div className="panel-section">
      <div className="panel-title">跟随绑定</div>
      {entity.attachedTo ? (
        <>
          <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 4 }}>
            已绑定到 {parentName}
          </p>
          <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>
            此对象会跟随绑定目标移动。拖动此对象可调整其相对位置。
          </p>
          <button
            className="btn"
            style={{ width: '100%' }}
            onClick={() => unmarryEntities([entity.id])}
          >
            解除绑定
          </button>
        </>
      ) : (
        <div className="field">
          <label>绑定到…</label>
          <select
            value=""
            onChange={(e) => {
              const id = e.target.value
              if (id) marryEntities([entity.id], id)
            }}
          >
            <option value="">— 选择跟随目标 —</option>
            {scene.entities
              .filter((e) => e.id !== entity.id)
              .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label?.text || e.name}
                </option>
              ))}
          </select>
        </div>
      )}
    </div>
  )
}

/* ===================== B2) Multi-entity selection ==================== */

function MultiEntityInspector({
  scene,
  entityIds
}: {
  scene: Scene
  entityIds: string[]
}): JSX.Element {
  const mutate = useMutate()
  const setSelection = useStore((s) => s.setSelection)
  const marryEntities = useStore((s) => s.marryEntities)
  const unmarryEntities = useStore((s) => s.unmarryEntities)

  const entities = entityIds
    .map((id) => scene.entities.find((e) => e.id === id))
    .filter((e): e is Entity => e != null)

  const anchor = entities[entities.length - 1]
  const anchorName = anchor ? anchor.label?.text || anchor.name : '—'
  const anyMarried = entities.some((e) => e.attachedTo)

  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">{entities.length} 个对象已选中</div>
        {entities.map((e) => (
          <div key={e.id} style={{ color: 'var(--text-dim)', fontSize: 11, padding: '2px 0' }}>
            {e.label?.text || e.name}
          </div>
        ))}
      </div>

      {entities.length >= 2 && (
        <div className="panel-section">
          <div className="panel-title">绑定</div>
          <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>
            最后选中的对象作为跟随目标，其余对象会跟随它移动。
          </p>
          <button
            className="btn primary"
            style={{ width: '100%', marginBottom: anyMarried ? 8 : 0 }}
            onClick={() => marryEntities(entityIds.slice(0, -1), entityIds[entityIds.length - 1]!)}
          >
            绑定到 {anchorName}
          </button>
          {anyMarried && (
            <button
              className="btn"
              style={{ width: '100%' }}
              onClick={() => unmarryEntities(entityIds)}
            >
              解除所选对象的绑定
            </button>
          )}
        </div>
      )}

      <div className="panel-section">
        <div className="panel-title">删除操作</div>
        <button
          className="btn danger"
          style={{ width: '100%' }}
          onClick={() => {
            const idSet = new Set(entityIds)
            mutate('delete entities', (doc) => {
              const sc = findScene(doc, scene.id)
              if (!sc) return
              sc.entities = sc.entities.filter((e) => !idSet.has(e.id))
              // Clean blocking tracks for the removed entities.
              for (const take of sc.blocking) {
                take.tracks = take.tracks.filter((t) => !idSet.has(t.entityId))
              }
              // Widow any attachedTo pointers into the removed set.
              for (const e of sc.entities) {
                if (e.attachedTo && idSet.has(e.attachedTo)) {
                  delete e.attachedTo
                  delete e.attachedLocal
                }
              }
              // Clear camera mounts across both shots and drafts.
              const clearMounts = (shots: Shot[] | undefined): void => {
                for (const sh of shots ?? []) {
                  if (sh.camera.mountEntityId && idSet.has(sh.camera.mountEntityId)) {
                    delete sh.camera.mountEntityId
                  }
                  for (const b of sh.cameraBank ?? []) {
                    if (b.camera.mountEntityId && idSet.has(b.camera.mountEntityId)) {
                      delete b.camera.mountEntityId
                    }
                  }
                }
              }
              clearMounts(sc.shots)
              clearMounts(sc.drafts)
            })
            setSelection(null)
          }}
        >
          删除 {entities.length} 个对象
        </button>
      </div>
    </div>
  )
}

/* ===================== D2) Multi-mark selection ===================== */

function MultiMarkInspector({
  scene,
  shot,
  entityId,
  markIds
}: {
  scene: Scene
  shot: Shot
  entityId: string | 'camera'
  markIds: string[]
}): JSX.Element {
  const mutate = useMutate()
  const [offset, setOffset] = useState(0)

  const isCamera = entityId === 'camera'
  const allLanes = entityId === '*' // "select all marks" spans every lane
  const idSet = new Set(markIds)

  /** Every mark array this selection can touch (camera and/or tracks). */
  const eachTargetList = (
    doc: ProjectDoc,
    fn: (marks: { id: string; time: number }[]) => void
  ): void => {
    const sh = findShotOrDraft(doc, scene.id, shot.id)
    if (!sh) return
    if (allLanes || isCamera) fn(sh.camera.marks)
    if (allLanes || !isCamera) {
      const sc = findScene(doc, scene.id)
      const tk = sc?.blocking.find((b) => b.id === sh.blockingTakeId)
      for (const tr of tk?.tracks ?? []) {
        if (allLanes || tr.entityId === entityId) fn(tr.marks)
      }
    }
  }

  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">{markIds.length} 个标记已选中</div>
      </div>

      <div className="panel-section">
        <div className="panel-title">整体调整时间</div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>时间偏移 (s)</label>
            <input
              type="number"
              step={0.1}
              value={offset}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) setOffset(v)
              }}
            />
          </div>
          <button
            className="btn"
            style={{ alignSelf: 'flex-end' }}
            onClick={() => {
              mutate('shift marks', (doc) => {
                eachTargetList(doc, (marks) => {
                  for (const m of marks) {
                    if (idSet.has(m.id)) m.time = Math.max(0, m.time + offset)
                  }
                })
              })
            }}
          >
            应用
          </button>
        </div>
      </div>

      <div className="panel-section">
        <button
          className="btn danger"
          style={{ width: '100%' }}
          onClick={() => useStore.getState().deleteSelectedMarks()}
        >
          删除 {markIds.length} 个标记
        </button>
      </div>
    </div>
  )
}

/* ------------------------ camera pose fields ------------------------ */

/**
 * Direct numeric control of the camera: position, aim, and lens of the
 * ACTIVE camera mark (the one at/before the playhead) — always available
 * from the pinned 🎥 Camera tab, no viewport clicking required.
 */
function CameraPoseSection({ scene, shot }: { scene: Scene; shot: Shot }): JSX.Element {
  const mutate = useMutate()
  const time = useStore((s) => s.time)

  const ordered = [...shot.camera.marks].sort((a, b) => a.time - b.time)
  let active: CameraMark | undefined = ordered[0]
  for (const m of ordered) if (m.time <= time + 1e-6) active = m

  const editActive = (label: string, fn: (m: CameraMark) => void): void => {
    if (!active) return
    const id = active.id
    mutate(label, (doc) => {
      const sh = findShotOrDraft(doc, scene.id, shot.id)
      const m = sh?.camera.marks.find((x) => x.id === id)
      if (m) fn(m)
    })
  }

  if (!active) {
    return (
      <div className="panel-section">
        <div className="panel-title">位置与朝向</div>
        <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>
          尚无摄影机标记。先添加一个，即可用这些字段直接调整。
        </p>
        <button
          className="btn"
          style={{ width: '100%' }}
          onClick={() => emit('dropCameraMarkAtView', {})}
        >
          + 将当前视图设为摄影机标记
        </button>
      </div>
    )
  }

  const numField = (
    label: string,
    value: number,
    step: number,
    apply: (m: CameraMark, v: number) => void,
    unit?: string
  ): JSX.Element => (
    <div className="field" style={{ flex: 1 }}>
      <label>
        {zh(label)}
        {unit ? ` (${unit})` : ''}
      </label>
      <input
        type="number"
        step={step}
        value={Number(value.toFixed(2))}
        onChange={(e) => {
          const v = num(e.target.value)
          if (v !== null) editActive(`camera ${label.toLowerCase()}`, (m) => apply(m, v))
        }}
      />
    </div>
  )

  const markIndex = ordered.findIndex((m) => m.id === active!.id) + 1
  return (
    <div className="panel-section">
      <div className="panel-title">
        位置与朝向 — 标记 {markIndex}/{ordered.length}
      </div>
      <div className="field-row">
        {numField('X', active.position.x, 0.1, (m, v) => (m.position.x = v))}
        {numField('Height', active.position.y, 0.1, (m, v) => (m.position.y = Math.max(0, v)))}
        {numField('Z', active.position.z, 0.1, (m, v) => (m.position.z = v))}
      </div>
      <div className="field-row">
        {numField('Pan', toDeg(active.pan), 1, (m, v) => (m.pan = toRad(v)), '°')}
        {numField('Tilt', toDeg(active.tilt), 1, (m, v) => (m.tilt = toRad(clamp(v, -89, 89))), '°')}
        {numField('Roll', toDeg(active.roll), 1, (m, v) => (m.roll = toRad(clamp(v, -180, 180))), '°')}
      </div>
      <div className="field-row">
        {numField('Lens', active.focalLength, 1, (m, v) => (m.focalLength = clamp(v, 8, 300)), 'mm')}
        {numField('At time', active.time, 0.1, (m, v) => (m.time = clamp(v, 0, shot.duration)), 's')}
      </div>
      <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4 }}>
        编辑播放头当前或之前的最近标记。拖动时间线播放头可切换到其他标记。
      </p>
    </div>
  )
}

/* ----------------------- camera move presets ------------------------ */

/**
 * Classic camera moves as one-click starting points: pick one, it lays down
 * a full set of marks built around your subject (riding along if the subject
 * moves), then every mark stays editable. Track-style moves also switch on
 * the aim lock.
 */
function CameraMovesSection({ scene }: { scene: Scene }): JSX.Element {
  const [presetId, setPresetId] = useState(CAMERA_MOVE_PRESETS[0]!.id)
  const selection = useStore((s) => s.selection)
  const preset = CAMERA_MOVE_PRESETS.find((p) => p.id === presetId)

  const categories = [...new Set(CAMERA_MOVE_PRESETS.map((p) => p.category))]
  const subjectHint =
    selection?.kind === 'entity'
      ? scene.entities.find((e) => e.id === selection.entityId)
      : scene.entities.find((e) => e.assetId.startsWith('person.'))

  return (
    <div className="panel-section">
      <div className="panel-title">运镜预设</div>
      <div className="field">
        <label>
          {CAMERA_MOVE_PRESETS.length} 种经典运镜，围绕{' '}
          {subjectHint ? subjectHint.label?.text || subjectHint.name : '主体'}
        </label>
        <select value={presetId} onChange={(e) => setPresetId(e.target.value)}>
          {categories.map((cat) => (
            <optgroup key={cat} label={zh(cat)}>
              {CAMERA_MOVE_PRESETS.filter((p) => p.category === cat).map((p) => (
                <option key={p.id} value={p.id}>
                  {zh(p.name)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {preset && (
        <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>
          {zh(preset.description)}
          {preset.track ? ' 摄影机朝向将锁定主体。' : ''}
        </p>
      )}
      <button
        className="btn primary"
        style={{ width: '100%' }}
        onClick={() => getSceneManager()?.applyCameraMove(presetId)}
        title="用此运镜替换当前摄影机的标记，一次撤销即可还原。先选择对象可围绕它构建运镜，否则使用第一名角色。"
      >
        应用运镜
      </button>
    </div>
  )
}

/* =========================== C) Camera ============================= */

function CameraInspector({ scene, shot }: { scene: Scene; shot: Shot }): JSX.Element {
  const mutate = useMutate()
  const setSelection = useStore((s) => s.setSelection)
  const switchCamera = useStore((s) => s.switchCamera)
  const addCameraToShot = useStore((s) => s.addCameraToShot)
  const clearCameraMarks = useStore((s) => s.clearCameraMarks)

  const cam = shot.camera
  const orderedMarks = [...cam.marks].sort((a, b) => a.time - b.time)
  const lastMark = orderedMarks[orderedMarks.length - 1]
  const currentFocal = lastMark?.focalLength ?? 35
  const rigSpec = RIGS[cam.rig]
  const activeCamName = shot.cameraName ?? 'A'

  // A camera edit may target the current shot even when it is a draft.
  const editCam = (label: string, fn: (c: Shot['camera']) => void): void => {
    mutate(label, (doc) => {
      const sh = findShotOrDraft(doc, scene.id, shot.id)
      if (sh) fn(sh.camera)
    })
  }

  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">摄影机 (A/B/C)</div>
        <div className="seg">
          <button
            className="active"
            onClick={() => switchCamera(activeCamName)}
          >
            {activeCamName}
          </button>
          {(shot.cameraBank ?? []).map((b) => (
            <button key={b.name} onClick={() => switchCamera(b.name)}>
              {b.name}
            </button>
          ))}
          <button onClick={() => addCameraToShot()} title="添加摄影机">
            +
          </button>
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-title">摄影机</div>
        <div className="field">
          <label>传感器</label>
          <select
            value={cam.sensorId}
            onChange={(e) => {
              const id = e.target.value as SensorId
              editCam('sensor', (c) => (c.sensorId = id))
            }}
          >
            {Object.values(SENSORS).map((s) => (
              <option key={s.id} value={s.id}>
                {zh(s.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>焦距</label>
          <div className="seg">
            {LENS_SET.map((fl) => (
              <button
                key={fl}
                className={currentFocal === fl ? 'active' : ''}
                onClick={() => emit('setLens', { focalLength: fl })}
              >
                {fl}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>自动构图</label>
          <div className="seg">
            {SHOT_SIZE_BTNS.map((sz) => (
              <button
                key={sz}
                title={zh(SHOT_SIZES[sz].name)}
                onClick={() => emit('frameSubject', { size: sz })}
              >
                {sz}
              </button>
            ))}
          </div>
        </div>
      </div>

      <CameraPoseSection scene={scene} shot={shot} />

      <div className="panel-section">
        <div className="panel-title">跟踪主体</div>
        <div className="field">
          <label>使摄影机始终朝向…</label>
          <select
            value={cam.trackEntityId ?? ''}
            onChange={(e) =>
              editCam('track subject', (c) => {
                if (e.target.value) c.trackEntityId = e.target.value
                else delete c.trackEntityId
              })
            }
            title="锁定朝向：无论通过标记、录制飞行还是预设移动摄影机，它都会始终朝向主体。可用于无人机跟拍飞机或摄影师跟拍演员。"
          >
            <option value="">— 按标记朝向（关闭跟踪）—</option>
            {scene.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label?.text || e.name}
              </option>
            ))}
          </select>
        </div>
        {cam.trackEntityId && (
          <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4 }}>
            跟踪已开启：放置标记、录制飞行或应用运镜预设时，摄影机都会始终朝向主体。如果标记设置了对焦距离，焦点也会跟随主体。
          </p>
        )}
      </div>

      <CameraMovesSection scene={scene} />

      <div className="panel-section">
        <div className="panel-title">摄影机支撑方式</div>
        <div className="seg" style={{ marginBottom: 10 }}>
          {(Object.keys(RIGS) as RigId[]).map((id) => (
            <button
              key={id}
              className={cam.rig === id ? 'active' : ''}
              onClick={() => editCam('rig', (c) => (c.rig = id))}
            >
              {zh(RIGS[id].name)}
            </button>
          ))}
        </div>
        <p style={{ color: 'var(--text-faint)', fontSize: 11, marginBottom: 10 }}>
          {zh(rigSpec.description)}
        </p>
        {(cam.rig === 'handheld' || cam.rig === 'steadicam') && (
          <div className="field">
            <label>强度 ({cam.rigIntensity.toFixed(2)})</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={cam.rigIntensity}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editCam('rig intensity', (c) => (c.rigIntensity = v))
              }}
            />
          </div>
        )}
        {cam.rig === 'carMount' && (
          <div className="field">
            <label>安装到</label>
            <select
              value={cam.mountEntityId ?? ''}
              onChange={(e) => {
                const id = e.target.value || undefined
                editCam('mount entity', (c) => (c.mountEntityId = id))
              }}
            >
              <option value="">— 无 —</option>
              {scene.entities.map((en) => (
                <option key={en.id} value={en.id}>
                  {en.label?.text || en.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="panel-section">
        <div className="panel-title">标记</div>
        <button
          className="btn primary"
          style={{ width: '100%', marginBottom: 8 }}
          onClick={() => emit('dropCameraMarkAtView', {})}
        >
          将当前视图设为摄影机标记 (M)
        </button>
        {orderedMarks.map((m, i) => (
          <div
            key={m.id}
            className="mark-row"
            onClick={() => setSelection({ kind: 'mark', entityId: 'camera', markId: m.id })}
          >
            标记 {i + 1} — {m.time.toFixed(1)}s — {m.focalLength}mm
          </div>
        ))}
        {orderedMarks.length > 0 && (
          <button
            className="btn danger"
            style={{ width: '100%', marginTop: 8 }}
            onClick={() => clearCameraMarks()}
          >
            清除运镜（删除全部标记）
          </button>
        )}
      </div>
    </div>
  )
}

/* =========================== D) Mark =============================== */

function MarkInspector({
  scene,
  shot,
  entityId,
  markId
}: {
  scene: Scene
  shot: Shot
  entityId: string | 'camera'
  markId: string
}): JSX.Element {
  const mutate = useMutate()
  const setSelection = useStore((s) => s.setSelection)

  const isCamera = entityId === 'camera'
  const take = scene.blocking.find((b) => b.id === shot.blockingTakeId)
  const track = isCamera ? null : take?.tracks.find((t) => t.entityId === entityId)
  const list: (CameraMark | ActorMark)[] = isCamera ? shot.camera.marks : (track?.marks ?? [])
  const ordered = [...list].sort((a, b) => a.time - b.time)
  const mark = list.find((m) => m.id === markId)

  if (!mark) return <div className="panel-section">未找到标记。</div>

  const index = ordered.findIndex((m) => m.id === markId) + 1
  const actorMark = isCamera ? null : (mark as ActorMark)
  const cameraMark = isCamera ? (mark as CameraMark) : null
  const duration = shot.duration

  const editMark = (label: string, fn: (m: CameraMark | ActorMark) => void): void => {
    mutate(label, (doc) => {
      const sh = findShot(doc, scene.id, shot.id)
      if (!sh) return
      let target: (CameraMark | ActorMark) | undefined
      if (isCamera) {
        target = sh.camera.marks.find((m) => m.id === markId)
      } else {
        const sc = findScene(doc, scene.id)
        const tk = sc?.blocking.find((b) => b.id === sh.blockingTakeId)
        target = tk?.tracks.find((t) => t.entityId === entityId)?.marks.find((m) => m.id === markId)
      }
      if (target) fn(target)
    })
  }

  return (
    <div>
      <div className="panel-section">
        <div className="panel-title">标记 {index}</div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>到达时间 (s)</label>
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              value={mark.time}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editMark('mark time', (m) => (m.time = clamp(v, 0, duration)))
              }}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>停留时间 (s)</label>
            <input
              type="number"
              min={0}
              max={duration}
              step={0.1}
              value={mark.hold}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editMark('mark hold', (m) => (m.hold = clamp(v, 0, duration)))
              }}
            />
          </div>
        </div>
        <div className="field">
          <label>缓出 ({mark.easeOut.toFixed(2)})</label>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={mark.easeOut}
            onChange={(e) => {
              const v = num(e.target.value)
              if (v !== null) editMark('ease out', (m) => (m.easeOut = v))
            }}
          />
        </div>
        <div className="field">
          <label>缓入 ({mark.easeIn.toFixed(2)})</label>
          <input
            type="range"
            min={0}
            max={0.5}
            step={0.01}
            value={mark.easeIn}
            onChange={(e) => {
              const v = num(e.target.value)
              if (v !== null) editMark('ease in', (m) => (m.easeIn = v))
            }}
          />
        </div>
      </div>

      {actorMark && (
        <div className="panel-section">
          <div className="panel-title">步态</div>
          <div className="seg gait-grid">
            {(Object.keys(GAITS) as GaitId[]).map((g) => (
              <button
                key={g}
                className={actorMark.gait === g ? 'active' : ''}
                onClick={() => editMark('gait', (m) => ((m as ActorMark).gait = g))}
              >
                {zh(GAITS[g].name)}
              </button>
            ))}
          </div>
          <div className="field" style={{ marginTop: 8 }}>
            <label>高度 (m)，0 为地面；升高可飞行</label>
            <input
              type="number"
              min={0}
              max={200}
              step={0.1}
              value={actorMark.position.y}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editMark('mark altitude', (m) => (m.position.y = clamp(v, 0, 200)))
              }}
            />
          </div>
        </div>
      )}

      {actorMark && (
        <div className="panel-section">
          <div className="panel-title">到达后搭乘</div>
          <div className="field">
            <label>到达此标记后搭乘…</label>
            <select
              value={actorMark.attachTo ?? ''}
              onChange={(e) =>
                editMark('board target', (m) => {
                  (m as ActorMark).attachTo = e.target.value || undefined
                })
              }
              title="搭乘：走到此标记后，绑定到车辆或道具并随其移动，例如上车后随车离开"
            >
              <option value="">— 保持步行 —</option>
              {scene.entities
                .filter((e) => e.id !== entityId)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      {actorMark && <MarkPoseSection mark={actorMark} editMark={editMark} />}

      {cameraMark && (
        <div className="panel-section">
          <div className="panel-title">光学</div>
          <div className="field">
            <label>焦距 (mm)</label>
            <input
              type="number"
              min={8}
              max={300}
              step={1}
              value={cameraMark.focalLength}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null)
                  editMark('focal length', (m) => ((m as CameraMark).focalLength = clamp(v, 8, 300)))
              }}
            />
          </div>
          <div className="field">
            <label>
              <input
                type="checkbox"
                checked={cameraMark.focusDistance === undefined}
                onChange={(e) => {
                  const deep = e.target.checked
                  editMark('focus mode', (m) => {
                    (m as CameraMark).focusDistance = deep ? undefined : 3
                  })
                }}
                style={{ width: 'auto', marginRight: 6 }}
              />
              ∞ 大景深
            </label>
          </div>
          {cameraMark.focusDistance !== undefined && (
            <div className="field">
              <label>对焦距离 (m)</label>
              <input
                type="number"
                min={0.3}
                max={100}
                step={0.1}
                value={cameraMark.focusDistance}
                onChange={(e) => {
                  const v = num(e.target.value)
                  if (v !== null)
                    editMark('focus distance', (m) => ((m as CameraMark).focusDistance = clamp(v, 0.3, 100)))
                }}
              />
            </div>
          )}
        </div>
      )}

      <div className="panel-section">
        <div className="panel-title">位置</div>
        <div className="field-row">
          <div className="field" style={{ flex: 1 }}>
            <label>X</label>
            <input
              type="number"
              step={0.1}
              value={mark.position.x}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editMark('mark X', (m) => (m.position.x = v))
              }}
            />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Z</label>
            <input
              type="number"
              step={0.1}
              value={mark.position.z}
              onChange={(e) => {
                const v = num(e.target.value)
                if (v !== null) editMark('mark Z', (m) => (m.position.z = v))
              }}
            />
          </div>
        </div>
      </div>

      <div className="panel-section">
        <button
          className="btn danger"
          style={{ width: '100%' }}
          onClick={() => {
            mutate('delete mark', (doc) => {
              const sh = findShot(doc, scene.id, shot.id)
              if (!sh) return
              if (isCamera) {
                sh.camera.marks = sh.camera.marks.filter((m) => m.id !== markId)
              } else {
                const sc = findScene(doc, scene.id)
                const tk = sc?.blocking.find((b) => b.id === sh.blockingTakeId)
                const tr = tk?.tracks.find((t) => t.entityId === entityId)
                if (tr) tr.marks = tr.marks.filter((m) => m.id !== markId)
              }
            })
            setSelection(null)
          }}
        >
          删除标记
        </button>
      </div>
    </div>
  )
}

/* ------------------------------- pose ----------------------------------- */

const POSES: { id: GaitId; label: string }[] = [
  { id: 'stand', label: '站立' },
  { id: 'sit', label: '坐下' },
  { id: 'crouch', label: '蹲下' },
  { id: 'lie', label: '躺下' },
  { id: 'gesture', label: '交流' },
  { id: 'fall', label: '倒地' }
]

const JOINTS: { key: string; label: string; range: number }[] = [
  { key: 'shoulderLX', label: '左臂前摆', range: 180 },
  { key: 'shoulderRX', label: '右臂前摆', range: 180 },
  { key: 'shoulderLZ', label: '左臂外展', range: 150 },
  { key: 'shoulderRZ', label: '右臂外展', range: 150 },
  { key: 'elbowL', label: '左肘', range: 150 },
  { key: 'elbowR', label: '右肘', range: 150 },
  { key: 'hipLX', label: '左腿前摆', range: 120 },
  { key: 'hipRX', label: '右腿前摆', range: 120 },
  { key: 'hipLZ', label: '左腿外展', range: 90 },
  { key: 'hipRZ', label: '右腿外展', range: 90 },
  { key: 'kneeL', label: '左膝', range: 150 },
  { key: 'kneeR', label: '右膝', range: 150 },
  { key: 'torsoX', label: '躯干前倾', range: 60 },
  { key: 'torsoY', label: '躯干扭转', range: 80 },
  { key: 'torsoZ', label: '躯干侧倾', range: 50 },
  { key: 'headY', label: '头部转向', range: 80 },
  { key: 'headX', label: '头部俯仰', range: 45 },
  { key: 'headZ', label: '头部侧倾', range: 45 }
]

const DEG = 180 / Math.PI

function PoseSection({
  entity,
  editEntity
}: {
  entity: Entity
  editEntity: (label: string, fn: (e: Entity) => void) => void
}): JSX.Element {
  const pose = typeof entity.params?.pose === 'string' ? entity.params.pose : 'stand'
  const hasOverrides = Object.keys(entity.params ?? {}).some(
    (k) => k.startsWith('joint_') && entity.params![k] !== 0
  )

  return (
    <div className="panel-section">
      <div className="panel-title">姿态</div>
      <div className="seg gait-grid" style={{ marginBottom: 10 }}>
        {POSES.map((p) => (
          <button
            key={p.id}
            className={pose === p.id ? 'active' : ''}
            onClick={() =>
              editEntity('entity pose', (en) => {
                en.params = { ...en.params, pose: p.id }
              })
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>
        角色没有标记时使用此姿态；存在标记时，使用标记各自设置的步态。
      </p>
      <details open={hasOverrides}>
        <summary
          style={{ cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}
        >
          肢体姿态（打斗 / 舞蹈走位）
        </summary>
        {JOINTS.map((j) => {
          const raw = entity.params?.[`joint_${j.key}`]
          const rad = typeof raw === 'number' ? raw : 0
          const deg = Math.round(rad * DEG)
          return (
            <div className="field" key={j.key} style={{ marginBottom: 6 }}>
              <label>
                {j.label} ({deg}°)
              </label>
              <input
                type="range"
                min={-j.range}
                max={j.range}
                step={1}
                value={deg}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isNaN(v)) return
                  editEntity('pose joint', (en) => {
                    en.params = { ...en.params, [`joint_${j.key}`]: v / DEG }
                  })
                }}
              />
            </div>
          )
        })}
        <button
          className="btn small"
          style={{ width: '100%', marginTop: 4 }}
          onClick={() =>
            editEntity('reset pose', (en) => {
              if (!en.params) return
              for (const k of Object.keys(en.params)) {
                if (k.startsWith('joint_')) delete en.params[k]
              }
            })
          }
        >
          重置肢体
        </button>
      </details>
    </div>
  )
}

/**
 * Pose at a mark: joint offsets held at this mark and interpolated between
 * marks by the evaluator — keyframed limb choreography (fights, dances).
 * Reuses the same JOINTS table as the entity-level PoseSection.
 */
function MarkPoseSection({
  mark,
  editMark
}: {
  mark: ActorMark
  editMark: (label: string, fn: (m: CameraMark | ActorMark) => void) => void
}): JSX.Element {
  const hasPose = Object.values(mark.joints ?? {}).some((v) => v !== 0)

  return (
    <div className="panel-section">
      <div className="panel-title">此标记处的姿态</div>
      <p style={{ color: 'var(--text-faint)', fontSize: 11, lineHeight: 1.4, marginBottom: 8 }}>
        移动过程中，肢体从上一标记的姿态过渡到此姿态。为连续标记设置不同姿态，即可编排动作。
      </p>
      <details open={hasPose}>
        <summary
          style={{ cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8 }}
        >
          关节关键帧
        </summary>
        {JOINTS.map((j) => {
          const rad = mark.joints?.[j.key] ?? 0
          const deg = Math.round(rad * DEG)
          return (
            <div className="field" key={j.key} style={{ marginBottom: 6 }}>
              <label>
                {j.label} ({deg}°)
              </label>
              <input
                type="range"
                min={-j.range}
                max={j.range}
                step={1}
                value={deg}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isNaN(v)) return
                  editMark('mark pose', (m) => {
                    const am = m as ActorMark
                    am.joints = { ...am.joints, [j.key]: v / DEG }
                  })
                }}
              />
            </div>
          )
        })}
        <button
          className="btn small"
          style={{ width: '100%', marginTop: 4 }}
          onClick={() =>
            editMark('reset mark pose', (m) => {
              delete (m as ActorMark).joints
            })
          }
        >
          重置此标记的姿态
        </button>
      </details>
    </div>
  )
}

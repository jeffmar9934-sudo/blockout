/**
 * Stage-mode asset palette. Browse the built-in catalog grouped by category,
 * filter by name, and arm click-to-place (the Viewport does the drop).
 * Also imports custom 3D models into the project.
 */

import { useEffect, useMemo, useState } from 'react'
import { ASSET_CATALOG, type AssetSpec } from '@engine/assets'
import type { EntityCategory } from '@engine/types'
import { sequenceStyles, type SequenceType } from '@engine/sequences'
import {
  choreoStyles,
  choreoEndings,
  choreoFormations,
  type ChoreoKind,
  type FormationId,
  type RoutineSpec
} from '@engine/choreography'
import { useStore } from '../store'
import { populateFromReference } from '../ai/populate'
import { zh } from '../i18n/zh-CN'

interface PresetInfo {
  id: string
  name: string
  savedAt: string
  entityCount: number
}

/**
 * Globally persistent stage presets ("Dinner scene", "Driving scene"):
 * save the current staging once, reuse it as a starting point in any
 * project — applying stages a fresh copy, never touching the original.
 */
function StagePresets(): JSX.Element {
  const [presets, setPresets] = useState<PresetInfo[]>([])
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const saveStagePreset = useStore((s) => s.saveStagePreset)
  const applyStagePreset = useStore((s) => s.applyStagePreset)
  const scene = useStore((s) => s.doc?.scenes.find((sc) => sc.id === s.sceneId))
  const toast = useStore((s) => s.toast)

  const refresh = async (): Promise<void> => {
    try {
      setPresets(await window.blockout.presetsList())
    } catch {
      /* first run: presets dir may not exist yet */
    }
  }
  useEffect(() => {
    void refresh()
  }, [])

  const onSave = async (): Promise<void> => {
    const trimmed = name.trim()
    if (!trimmed) return
    await saveStagePreset(trimmed)
    setNaming(false)
    setName('')
    await refresh()
  }

  const onDelete = async (p: PresetInfo): Promise<void> => {
    await window.blockout.presetDelete(p.id)
    toast(`已删除预设“${p.name}”。`, 'info')
    await refresh()
  }

  return (
    <div className="panel-section">
      <div className="panel-title">场景预设</div>
      {presets.length === 0 && !naming && (
        <div className="empty-hint" style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
          保存可重复使用的场景布置，例如聚餐场景或驾驶场景，之后可在任何项目中使用。
        </div>
      )}
      {presets.map((p) => (
        <div
          key={p.id}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}
        >
          <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={`${p.entityCount} 个对象 · 保存于 ${new Date(p.savedAt).toLocaleDateString('zh-CN')}`}>
            {p.name}
          </span>
          <button
            className="btn small"
            onClick={() => void applyStagePreset(p.id)}
            title="用此预设创建新场景，预设本身保持不变"
          >
            布置
          </button>
          <button className="btn small" onClick={() => void onDelete(p)} title="删除此预设">
            ✕
          </button>
        </div>
      ))}
      {naming ? (
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            type="text"
            autoFocus
            placeholder="预设名称…例如：聚餐场景"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onSave()
              if (e.key === 'Escape') setNaming(false)
            }}
            style={{ flex: 1 }}
          />
          <button className="btn small primary" onClick={() => void onSave()}>
            保存
          </button>
        </div>
      ) : (
        <button
          className="btn"
          style={{ width: '100%', marginTop: 6 }}
          disabled={(scene?.entities.length ?? 0) === 0}
          onClick={() => setNaming(true)}
          title="将此场景的布景、角色和调度保存为可在任何项目中使用的预设"
        >
          ＋ 将当前场景布置保存为预设
        </button>
      )}
    </div>
  )
}

/**
 * Sequence director: one click drops a whole choreographed crowd — a dance
 * number, a brawl, a foot chase, a car chase — sized and styled to taste,
 * staged where the viewport is looking.
 */
function Sequences(): JSX.Element {
  const [type, setType] = useState<SequenceType>('dance')
  const [count, setCount] = useState(12)
  const [style, setStyle] = useState('mixed')
  const placingSequence = useStore((s) => s.placingSequence)
  const setPlacingSequence = useStore((s) => s.setPlacingSequence)

  const styles = sequenceStyles(type)
  const activeStyle = styles.some((s) => s.id === style) ? style : styles[0]!.id

  const TYPE_LABELS: { id: SequenceType; label: string }[] = [
    { id: 'dance', label: '💃 舞蹈表演' },
    { id: 'fight', label: '🥊 打斗' },
    { id: 'footChase', label: '🏃 徒步追逐' },
    { id: 'carChase', label: '🚗 汽车追逐' }
  ]

  return (
    <div className="panel-section">
      <div className="panel-title">群体动作</div>
      <div className="field">
        <label>类型</label>
        <select value={type} onChange={(e) => setType(e.target.value as SequenceType)}>
          {TYPE_LABELS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: 1 }}>
          <label>表演者人数</label>
          <input
            type="number"
            min={2}
            max={60}
            value={count}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (!Number.isNaN(v)) setCount(Math.max(2, Math.min(60, Math.round(v))))
            }}
          />
        </div>
        <div className="field" style={{ flex: 2 }}>
          <label>风格</label>
          <select value={activeStyle} onChange={(e) => setStyle(e.target.value)}>
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {zh(s.name)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        className={`btn primary${placingSequence ? ' active' : ''}`}
        style={{ width: '100%' }}
        onClick={() =>
          setPlacingSequence(placingSequence ? null : { type, count, style: activeStyle })
        }
        title="进入放置模式，然后点击地面指定人群位置。人物面向摄影机；按 Esc 取消。可一次撤销，且每位表演者均可单独编辑。"
      >
        {placingSequence ? '⟳ 点击地面放置…（Esc 取消）' : `🎬 布置 ${count} 位表演者`}
      </button>
    </div>
  )
}

const randomSeed = (): number => Math.floor(Math.random() * 1_000_000_000)

/**
 * Choreographer: author a staged routine (dance number, paired fight, chase)
 * and either spawn fresh performers (click the floor) or apply it to the
 * currently selected characters.
 */
function Choreographer(): JSX.Element {
  const [kind, setKind] = useState<ChoreoKind>('dance')
  const [style, setStyle] = useState('mixed')
  const [performers, setPerformers] = useState(8)
  const [duration, setDuration] = useState(8)
  const [bpm, setBpm] = useState(116)
  const [formation, setFormation] = useState<FormationId>('line')
  const [canon, setCanon] = useState(false)
  const [mirror, setMirror] = useState(false)
  const [formationChange, setFormationChange] = useState(false)
  const [ending, setEnding] = useState('finish')
  const [seed, setSeed] = useState(randomSeed)

  const placing = useStore((s) => s.placingChoreography)
  const setPlacing = useStore((s) => s.setPlacingChoreography)
  const choreographSelected = useStore((s) => s.choreographSelected)
  const selection = useStore((s) => s.selection)
  const toast = useStore((s) => s.toast)

  const styles = choreoStyles(kind)
  const activeStyle = styles.some((s) => s.id === style) ? style : styles[0]!.id
  const endings = choreoEndings(kind)
  const activeEnding = endings.some((e) => e.id === ending) ? ending : endings[0]!.id

  const spec = (): RoutineSpec => ({
    kind,
    performers,
    durationS: duration,
    seed,
    bpm,
    style: activeStyle,
    formation,
    canon,
    mirror,
    formationChange,
    ending: activeEnding
  })

  const selCount =
    selection?.kind === 'entities' ? selection.entityIds.length : selection?.kind === 'entity' ? 1 : 0

  const onApply = (): void => {
    if (selCount === 0) {
      toast('请先选择需要编排动作的表演者。', 'info')
      return
    }
    if (!window.confirm(`替换 ${selCount} 位已选表演者的动作编排？`))
      return
    choreographSelected(spec())
  }

  const KIND_LABELS: { id: ChoreoKind; label: string }[] = [
    { id: 'dance', label: '💃 舞蹈表演' },
    { id: 'fight', label: '🥋 打斗' },
    { id: 'chase', label: '🏃 追逐' }
  ]

  return (
    <div className="panel-section">
      <div className="panel-title">动作编排</div>
      <div className="field">
        <label>编排类型</label>
        <select value={kind} onChange={(e) => setKind(e.target.value as ChoreoKind)}>
          {KIND_LABELS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: 2 }}>
          <label>风格</label>
          <select value={activeStyle} onChange={(e) => setStyle(e.target.value)}>
            {styles.map((s) => (
              <option key={s.id} value={s.id}>
                {zh(s.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>表演者人数</label>
          <input
            type="number"
            min={kind === 'dance' ? 1 : 2}
            max={kind === 'dance' ? 40 : kind === 'fight' ? 8 : 6}
            value={performers}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (!Number.isNaN(v)) setPerformers(Math.max(1, Math.round(v)))
            }}
          />
        </div>
      </div>
      <div className="field-row">
        <div className="field" style={{ flex: 1 }}>
          <label>时长（秒）</label>
          <input
            type="number"
            min={2}
            max={60}
            value={duration}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (!Number.isNaN(v)) setDuration(Math.max(2, Math.min(60, Math.round(v))))
            }}
          />
        </div>
        {kind === 'dance' && (
          <div className="field" style={{ flex: 1 }}>
            <label>节拍（BPM）</label>
            <input
              type="number"
              min={60}
              max={180}
              value={bpm}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (!Number.isNaN(v)) setBpm(Math.max(60, Math.min(180, Math.round(v))))
              }}
            />
          </div>
        )}
        {(kind === 'fight' || kind === 'chase') && (
          <div className="field" style={{ flex: 2 }}>
            <label>结局</label>
            <select value={activeEnding} onChange={(e) => setEnding(e.target.value)}>
              {endings.map((en) => (
                <option key={en.id} value={en.id}>
                  {zh(en.name)}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {kind === 'dance' && (
        <>
          <div className="field">
            <label>队形</label>
            <select value={formation} onChange={(e) => setFormation(e.target.value as FormationId)}>
              {choreoFormations().map((f) => (
                <option key={f.id} value={f.id}>
                  {zh(f.name)}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row" style={{ gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <input type="checkbox" checked={canon} onChange={(e) => setCanon(e.target.checked)} /> 依次跟随
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> 镜像动作
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={formationChange}
                onChange={(e) => setFormationChange(e.target.checked)}
              />{' '}
              队形变化
            </label>
          </div>
        </>
      )}
      {kind === 'fight' && (
        <div className="field-row" style={{ gap: 12, marginBottom: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
            <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> 镜像站姿
          </label>
        </div>
      )}
      <div className="field">
        <label>随机种子</label>
        <div className="field-row" style={{ gap: 6 }}>
          <input
            type="number"
            style={{ flex: 1 }}
            value={seed}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (!Number.isNaN(v)) setSeed(Math.max(0, Math.round(v)))
            }}
          />
          <button className="btn small" title="重新生成随机种子" onClick={() => setSeed(randomSeed())}>
            🎲
          </button>
        </div>
      </div>
      <button
        className={`btn primary${placing ? ' active' : ''}`}
        style={{ width: '100%', marginBottom: 6 }}
        onClick={() => setPlacing(placing ? null : spec())}
        title="进入放置模式，点击地面指定编排位置。人物面向摄影机；按 Esc 取消。可一次撤销，每位表演者均可编辑。"
      >
        {placing ? '⟳ 点击地面放置…（Esc 取消）' : '🎬 创建动作编排'}
      </button>
      <button
        className="btn"
        style={{ width: '100%' }}
        onClick={onApply}
        title="用此编排替换已选表演者的动作，保留其外观。"
      >
        {selCount > 0 ? `应用到 ${selCount} 位已选表演者` : '应用到所选表演者'}
      </button>
    </div>
  )
}

/** Emoji thumb per catalog id. '📦' is the fallback for anything unmapped. */
const THUMBS: Record<string, string> = {
  // People
  'person.man': '🚶',
  'person.woman': '👩',
  'person.child': '🧒',
  'person.elderly': '🧓',
  // Animals
  'animal.dog': '🐕',
  'animal.cat': '🐈',
  'animal.horse': '🐎',
  'animal.bird': '🐦',
  // Vehicles
  'vehicle.sedan': '🚗',
  'vehicle.suv': '🚙',
  'vehicle.pickup': '🛻',
  'vehicle.van': '🚐',
  'vehicle.bus': '🚌',
  'vehicle.truck': '🚚',
  'vehicle.tank': '🪖',
  'vehicle.train': '🚆',
  'vehicle.motorcycle': '🏍',
  'vehicle.bicycle': '🚲',
  'vehicle.plane': '✈️',
  'vehicle.boat': '🛥',
  // Furniture & props
  'furniture.bed': '🛏',
  'furniture.couch': '🛋',
  'furniture.armchair': '🛋',
  'furniture.diningTable': '🍽',
  'furniture.kitchenTable': '🍽',
  'furniture.desk': '🖥',
  'furniture.sideTable': '🪵',
  'furniture.lamp': '💡',
  'furniture.chair': '🪑',
  'furniture.stool': '🪑',
  'furniture.bar': '🍸',
  'furniture.counter': '🍳',
  'furniture.shelf': '🗄',
  'furniture.tv': '📺',
  'furniture.tableSetting': '🍽',
  'furniture.door': '🚪',
  'furniture.window': '🪟',
  'furniture.fridge': '🧊',
  'furniture.stove': '🍳',
  'furniture.sinkCounter': '🚰',
  'furniture.toilet': '🚽',
  'furniture.bathtub': '🛁',
  'furniture.showerStall': '🚿',
  'furniture.officeChair': '🪑',
  'furniture.filingCabinet': '🗄',
  'furniture.whiteboard': '📋',
  'furniture.podium': '🎤',
  'furniture.monitor': '🖥',
  'furniture.pianoUpright': '🎹',
  'furniture.poolTable': '🎱',
  'furniture.hospitalBed': '🛏',
  'furniture.wheelchair': '🦽',
  'furniture.crib': '🍼',
  'furniture.fireplace': '🔥',
  'furniture.chandelier': '💡',
  'furniture.rug': '🟫',
  'furniture.curtain': '🪟',
  'furniture.bookshelfFull': '📚',
  'furniture.doorOpen': '🚪',
  // Props
  'prop.phone': '📱',
  'prop.laptop': '💻',
  'prop.cup': '🥤',
  'prop.mug': '☕',
  'prop.bowl': '🥣',
  'prop.plate': '🍽',
  'prop.bottle': '🍾',
  'prop.wineglass': '🍷',
  'prop.book': '📕',
  'prop.newspaper': '📰',
  'prop.briefcase': '💼',
  'prop.suitcase': '🧳',
  'prop.backpack': '🎒',
  'prop.umbrella': '🌂',
  'prop.hat': '🎩',
  'prop.baseballBat': '🏏',
  'prop.sword': '🗡',
  'prop.torch': '🔦',
  'prop.candle': '🕯',
  'prop.lantern': '🏮',
  'prop.pictureFrame': '🖼',
  'prop.poster': '📃',
  'prop.mirror': '🪞',
  'prop.clock': '🕐',
  'prop.ball': '⚽',
  'prop.balloon': '🎈',
  'prop.microphone': '🎤',
  'prop.guitar': '🎸',
  'prop.camera': '🎥',
  'prop.tripod': '📷',
  'prop.tree': '🌳',
  'prop.bush': '🌿',
  'prop.rock': '🪨',
  'prop.streetlightSingle': '🏮',
  'prop.trafficLight': '🚦',
  'prop.stopSign': '🛑',
  'prop.fireHydrant': '🧯',
  'prop.mailbox': '📮',
  'prop.trashcan': '🗑',
  'prop.dumpster': '🗑',
  'prop.trafficCone': '🚧',
  'prop.barrier': '🚧',
  'prop.fence': '🚧',
  'prop.bench': '🪑',
  'prop.phoneBooth': '☎️',
  'prop.atm': '🏧',
  'prop.vendingMachine': '🥤',
  'prop.shoppingCart': '🛒',
  'prop.ladder': '🪜',
  'prop.scaffold': '🏗',
  'prop.crate': '📦',
  'prop.barrel': '🛢',
  'prop.pallet': '🪵',
  'prop.tent': '⛺',
  'prop.campfire': '🔥',
  'prop.poolWater': '💧',
  'prop.fountain': '⛲',
  'prop.flagpole': '🚩',
  'prop.helicopter': '🚁',
  // Props — backyard / recreation
  'prop.hotTub': '🛁',
  'prop.bbqGrill': '🍖',
  'prop.firepit': '🔥',
  'prop.poolLounger': '🏖',
  'prop.patioUmbrellaTable': '⛱',
  'prop.picnicTable': '🧺',
  'prop.swingSet': '🎠',
  'prop.slide': '🛝',
  'prop.seesaw': '🪅',
  'prop.sandbox': '🏖',
  'prop.trampoline': '🤸',
  'prop.kiddiePool': '💧',
  'prop.basketballHoop': '🏀',
  'prop.soccerGoal': '🥅',
  'prop.doghouse': '🐕',
  'prop.shed': '🛖',
  'prop.gazebo': '⛺',
  'prop.hammock': '🌴',
  'prop.lawnmower': '🚜',
  // Props — commercial / street
  'prop.cashRegister': '🧾',
  'prop.kiosk': '🏪',
  'prop.gasPump': '⛽',
  'prop.parkingMeter': '🅿️',
  'prop.busShelter': '🚏',
  'prop.slotMachine': '🎰',
  'prop.cloud': '☁️',
  'prop.squirtGun': '🔫',
  // Environments
  'env.houseInterior': '🏠',
  'env.houseExterior': '🏡',
  'env.cityStreet': '🏙',
  'env.store': '🏪',
  'env.nightclub': '🪩',
  'env.office': '🏢',
  'env.warehouse': '🏭',
  'env.carInterior': '💺',
  'env.busInterior': '💺',
  'env.planeCabin': '✈️',
  'env.field': '🌾',
  'env.desert': '🏜',
  'env.parkingLot': '🅿️',
  'env.alley': '🌃',
  'env.rooftop': '🏙',
  'env.restaurant': '🍽',
  'env.hospitalRoom': '🏥',
  'env.classroom': '🏫',
  'env.gym': '🏋',
  'env.courtroom': '⚖️',
  'env.subwayPlatform': '🚇',
  'env.beach': '🏖',
  'env.forest': '🌲',
  'env.bar': '🍺',
  'env.stage': '🎭',
  // Environments — round 5 interiors
  'env.trainInterior': '🚃',
  'env.boatInterior': '⛵',
  'env.postOffice': '📮',
  'env.supermarket': '🛒',
  'env.movieTheater': '🎬',
  'env.indoorMall': '🛍',
  'env.hotelLobby': '🏨',
  'env.hotelRoom': '🛎',
  'env.diner': '🍔',
  'env.coffeeShop': '☕',
  'env.policeStation': '🚓',
  'env.church': '⛪',
  'env.schoolHallway': '🏫',
  'env.airportTerminal': '🛫',
  'env.casino': '🎰',
  'env.parkingGarage': '🅿️',
  // Environments — round 5 exteriors
  'env.stripMall': '🏬',
  'env.outdoorMall': '🛍',
  'env.residentialStreet': '🏘',
  'env.downtown': '🌆',
  'env.trainStation': '🚉',
  'env.gasStation': '⛽',
  'env.park': '🏞',
  'env.playgroundPark': '🛝',
  'env.backyard': '🏡',
  'env.constructionSite': '🏗',
  'env.cemetery': '🪦',
  'env.stadium': '🏟',
  'env.sky': '☁️',
  'env.houseFull': '🏠',
  // Primitives
  'prim.cube': '⬜',
  'prim.cylinder': '⚪',
  'prim.ramp': '📐',
  'prim.wall': '🧱',
  'prim.stairs': '🪜'
}

function thumbFor(id: string): string {
  return THUMBS[id] ?? '📦'
}

/** Fixed display order of categories with human-readable titles. */
const CATEGORY_ORDER: { key: EntityCategory; title: string }[] = [
  { key: 'people', title: '人物' },
  { key: 'animals', title: '动物' },
  { key: 'vehicles', title: '交通工具' },
  { key: 'furniture', title: '家具' },
  { key: 'props', title: '道具' },
  { key: 'environment', title: '环境' },
  { key: 'primitives', title: '基础几何体' }
]

export function Library(): JSX.Element {
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<EntityCategory | 'all'>('all')
  const [collapsed, setCollapsed] = useState<Partial<Record<EntityCategory, boolean>>>({})
  const placingAssetId = useStore((s) => s.placingAssetId)
  const setPlacingAsset = useStore((s) => s.setPlacingAsset)
  const addEntity = useStore((s) => s.addEntity)
  const mutate = useStore((s) => s.mutate)
  const projectFolder = useStore((s) => s.projectFolder)
  const importScan = useStore((s) => s.importScan)
  const toast = useStore((s) => s.toast)

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const matches = (a: AssetSpec): boolean =>
      q === '' ||
      zh(a.name).toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      zh(a.category).toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q)
    return CATEGORY_ORDER.filter(
      ({ key }) => categoryFilter === 'all' || key === categoryFilter
    ).map(({ key, title }) => ({
      key,
      title,
      items: ASSET_CATALOG.filter((a) => a.category === key && matches(a))
    })).filter((g) => g.items.length > 0)
  }, [query, categoryFilter])

  const toggleCollapsed = (key: EntityCategory): void =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }))

  const onPick = (id: string): void => {
    if (placingAssetId === id) setPlacingAsset(null)
    else setPlacingAsset(id)
  }

  const onImportScan = async (): Promise<void> => {
    const path = await window.blockout.pickFile([
      { name: '3D 扫描（高斯泼溅）', extensions: ['ply', 'splat', 'ksplat', 'spz'] }
    ])
    if (!path) return
    await importScan(path)
  }

  const onImport = async (): Promise<void> => {
    const path = await window.blockout.pickFile([
      { name: '3D 模型', extensions: ['glb', 'gltf', 'obj'] }
    ])
    if (!path) return
    if (!projectFolder) {
      toast('导入模型前，请先打开或保存项目。', 'error')
      return
    }
    try {
      const result = await window.blockout.importAsset(projectFolder, path)
      const entityId = addEntity(`custom.${result.name}`, { x: 0, y: 0, z: 0 })
      mutate('import model', (doc) => {
        for (const scene of doc.scenes) {
          const entity = scene.entities.find((e) => e.id === entityId)
          if (entity) {
            entity.sourceFile = result.relativePath
            break
          }
        }
      })
      toast(`已导入 ${result.name}`, 'success')
    } catch (e) {
      toast(`导入失败：${(e as Error).message}`, 'error')
    }
  }

  return (
    <>
      <Sequences />
      <Choreographer />
      <StagePresets />

      <div className="library-search">
        <input
          type="text"
          placeholder="搜索资源…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Browse controls: filter to one category, or place from a list. */}
      <div className="panel-section" style={{ paddingBottom: 4 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as EntityCategory | 'all')}
            title="仅显示所选分类"
          >
            <option value="all">全部分类</option>
            {CATEGORY_ORDER.map((c) => (
              <option key={c.key} value={c.key}>
                {c.title}
              </option>
            ))}
          </select>
          <select
            value={placingAssetId && ASSET_CATALOG.some((a) => a.id === placingAssetId) ? placingAssetId : ''}
            onChange={(e) => setPlacingAsset(e.target.value || null)}
            title="从完整列表中选择资源，再点击地面放置"
          >
            <option value="">从列表中选择资源…</option>
            {CATEGORY_ORDER.map((c) => (
              <optgroup key={c.key} label={c.title}>
                {ASSET_CATALOG.filter((a) => a.category === c.key).map((a) => (
                  <option key={a.id} value={a.id}>
                    {thumbFor(a.id)} {zh(a.name)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {groups.map((group) => (
        <div className="panel-section" key={group.key}>
          <div
            className="panel-title"
            style={{ cursor: 'pointer', userSelect: 'none', display: 'flex', justifyContent: 'space-between' }}
            onClick={() => toggleCollapsed(group.key)}
            title={collapsed[group.key] ? '展开' : '折叠'}
          >
            <span>
              {group.title} <span style={{ opacity: 0.5 }}>({group.items.length})</span>
            </span>
            <span style={{ opacity: 0.6 }}>{collapsed[group.key] ? '▸' : '▾'}</span>
          </div>
          {collapsed[group.key] ? null : (
            <div className="library-grid">
              {group.items.map((asset) => (
                <div
                  key={asset.id}
                  className={`library-item${placingAssetId === asset.id ? ' placing' : ''}`}
                  onClick={() => onPick(asset.id)}
                >
                  <span className="thumb">{thumbFor(asset.id)}</span>
                  <span className="name">{zh(asset.name)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="panel-section">
        <button
          className="btn primary"
          style={{ width: '100%', marginBottom: 8 }}
          onClick={() => void populateFromReference()}
          title="给 Claude 一张参考照片或视频帧，即可匹配人物、家具、姿态、灯光和摄影机构图来布置场景"
        >
          ✨ 根据参考图布置场景…
        </button>
        <button className="btn" style={{ width: '100%', marginBottom: 8 }} onClick={() => void onImport()}>
          导入 3D 模型…
        </button>
        <button
          className="btn"
          style={{ width: '100%' }}
          onClick={() => void onImportScan()}
          title="加载真实地点的高斯泼溅扫描（.ply/.splat/.ksplat/.spz），在其中进行场景调度。可使用 Polycam、Luma、Scaniverse 等手机应用或视频转 3D 工具扫描。扫描仅用于编辑器布置，不会出现在导出画面中。"
        >
          🏙 导入 3D 扫描…
        </button>
        <p style={{ color: 'var(--text-faint)', fontSize: 10.5, lineHeight: 1.4, margin: '6px 0 0' }}>
          用手机扫描真实地点，即可在其中布置场景并安排调度。
        </p>
      </div>
    </>
  )
}

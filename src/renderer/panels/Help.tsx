// Modified for cross-platform Windows support in 2026; see MODIFICATIONS.md.
/**
 * Help overlay, redesigned for a filmmaker skimming (not reading):
 *   • Quick start — six visual cards, the whole app at a glance.
 *   • How do I…? — a live-searchable task list distilled from the reference.
 *   • Shortcuts — the keyboard reference as a tidy kbd grid.
 * Opened from the titlebar ?, the welcome screen, or the ? key. Esc closes
 * (wired outside via the helpOpen store flag).
 */

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'

const MOD = window.blockout.platform.primaryModifier
const ALT = window.blockout.platform.alternateModifier

function Kbd({ children }: { children: string }): JSX.Element {
  return <kbd className="help-kbd">{children}</kbd>
}

/* ---------------------------- Quick start cards --------------------------- */

interface Card {
  emoji: string
  title: string
  body: string
  then: string
}

const CARDS: Card[] = [
  {
    emoji: '🏗',
    title: '搭建布景',
    body: '从资源库选择环境和人物，再点击地面放置。',
    then: '接下来：为主角设置标签，并调整灯光。'
  },
  {
    emoji: '🎬',
    title: '一键编排动作',
    body: '选择已编排好的舞蹈、打斗或追逐，再点击地面放置整组演员。',
    then: '接下来：每位演员仍可单独编辑。'
  },
  {
    emoji: '🚶',
    title: '让角色动起来',
    body: '选择角色，按 M 并点击地面设置走位点，也可点击“● 录制”，用鼠标控制角色。',
    then: '接下来：在时间线上调整走位点的时间。'
  },
  {
    emoji: '✨',
    title: '动作选项卡',
    body: '一键为角色添加打斗、舞蹈、坐下、喝水、跳跃等动作。',
    then: '接下来：像其他走位点一样调整姿态关键点。'
  },
  {
    emoji: '🎥',
    title: '构图与运镜',
    body: '选择构图和 39 种运镜预设，或开启主体跟踪，让摄影机始终对准主体。',
    then: '接下来：点击“▶ 播放镜头”查看实际导出画面。'
  },
  {
    emoji: '📦',
    title: '交付',
    body: '选择视频生成工具，导出包含视频、深度通道、静帧和提示词的参考包。',
    then: '接下来：将提示词直接粘贴到生成工具中。'
  }
]

/* ------------------------------- How do I…? ------------------------------- */

interface Task {
  q: string
  a: JSX.Element
}

const TASKS: { area: string; items: Task[] }[] = [
  {
    area: '布景',
    items: [
      {
        q: '如何在场景中放置布景和人物？',
        a: (
          <>
            在<b>布景</b>模式中，点击资源库中的人物、道具或整套环境，再点击地面放置。
            按住 <Kbd>{ALT}</Kbd> 可连续放置多个；按 <Kbd>Esc</Kbd> 取消。
          </>
        )
      },
      {
        q: '如何移动、旋转或复制物体？',
        a: (
          <>
            点击选中物体，拖动箭头移动。按 <Kbd>R</Kbd> 切换为旋转，按 <Kbd>G</Kbd> 切回移动，
            按 <Kbd>{`${MOD}D`}</Kbd> 复制，按 <Kbd>⌫</Kbd> 删除。
          </>
        )
      },
      {
        q: '如何为 AI 视频生成工具设置角色标签？',
        a: (
          <>
            选中人物，在属性面板中输入<b>主角</b>等标签，再选择颜色。
            标签会显示在角色上方，模型也会着色，帮助生成工具区分角色。
          </>
        )
      },
      {
        q: '如何只设置人物姿态，不添加动画？',
        a: (
          <>
            在属性面板的<b>姿态</b>区域选择站立、坐下、蹲下、躺下、说话或倒地。
            展开<b>肢体姿态</b>，通过滑块调整打斗或舞蹈姿势。
          </>
        )
      },
      {
        q: '如何让骑手与自行车一起移动？',
        a: (
          <>
            放置人物后，在人物的属性面板中选择<b>绑定到…</b>并指定自行车。
            拖动自行车时骑手会随之移动；点击<b>解除绑定</b>可将两者分开。
          </>
        )
      },
      {
        q: '如何一起移动已放置的一群人物？',
        a: (
          <>
            将所有演员绑定到一位领队，移动领队时整组会跟随。也可按住 <Kbd>⇧</Kbd>
            逐个点击选中，再拖动整个多选组。
          </>
        )
      },
      {
        q: '如何设置灯光？',
        a: (
          <>
            取消所有选择后，属性面板会显示场景设置。选择日间、黄金时刻、夜晚、夜店等预设，
            调整太阳位置并添加雾。视频生成工具会从参考画面中识别光照方向。
          </>
        )
      },
      {
        q: '如何为场景添加真实天空？',
        a: (
          <>
            在场景属性面板中选择物理天空预设：<b>正午天空</b>、<b>黄金时段天空</b>或<b>蓝调时刻天空</b>。
            天空光照由太阳方位角和高度角决定，会出现在纯净画面导出中，但不会进入深度或法线通道。
          </>
        )
      },
      {
        q: '如何根据照片搭建场景？',
        a: (
          <>
            资源库底部的<b>根据参考图布置场景…</b>可根据图像生成人物、姿态、灯光和匹配的摄影机构图。
            此功能需要 Claude API 密钥；按一次 <Kbd>{`${MOD}Z`}</Kbd> 即可撤销全部生成内容。
          </>
        )
      },
      {
        q: '如何导入自己的 3D 模型？',
        a: (
          <>
            点击资源库中的<b>导入 3D 模型…</b>，载入 GLB/glTF 文件并复制到项目中。
          </>
        )
      },
      {
        q: '如何在扫描得到的真实场地中编排走位？',
        a: (
          <>
            用手机上的 Polycam、Luma、Scaniverse 或视频转 3D 工具扫描场地，再点击资源库中的
            <b>导入 3D 扫描…</b>。在属性面板的扫描设置中调整位置，然后在场地内编排动作。
            扫描内容用于辅助布景，不会出现在任何导出中。
          </>
        )
      },
      {
        q: '如何让物体在编辑时可见，但不出现在导出中？',
        a: (
          <>
            选中物体，在属性面板中勾选<b>导出时隐藏</b>。
            物体仍会显示在编辑器中，但所有渲染通道都会将其隐藏。
          </>
        )
      }
    ]
  },
  {
    area: '拍摄',
    items: [
      {
        q: '如何让人物沿路径行走？',
        a: (
          <>
            在<b>拍摄</b>模式中选中人物，按 <Kbd>M</Kbd>，再点击地面放置走位点。
            人物会按时间线在走位点之间行走；选中走位点可设置步态或停留时间。
          </>
        )
      },
      {
        q: '如何用鼠标直接控制角色移动？',
        a: (
          <>
            选中角色或车辆，点击<b>● 录制演员</b>，用鼠标引导移动，步态会自动匹配移动速度。
            点击<b>■ 停止</b>保存；重新录制会替换此前的动作。
          </>
        )
      },
      {
        q: '如何完成排练、录制和回看？',
        a: (
          <>
            拍摄模式的<b>拍摄控制栏</b>涵盖完整流程：<b>🔁 排练</b>会显示路径并播放走位；
            <b>⏺ 录制摄影机</b>或<b>⏺ 录制表演</b>会在 3、2、1 倒计时后开始录制；
            <b>▶ 回看</b>通过当前镜头的摄影机回放。点击倒计时可取消。
          </>
        )
      },
      {
        q: '如何显示或隐藏地面走位点和路径？',
        a: (
          <>
            视口工具栏中的<b>走位点</b>和<b>路径</b>可切换显示。走位点是带编号的 T 形地面标记；
            选中演员或摄影机时，其路径上会显示方向箭头和 <b>t=2.4s</b> 等时间标签。
            这些辅助标记仅用于编辑，不会出现在导出画面中。
          </>
        )
      },
      {
        q: '如何逐步学习编排走位？',
        a: (
          <>
            从快速入门选项卡打开<b>设置走位点</b>引导。
            选择演员、放置两个走位点、播放、录制并打开交付面板后，清单会自动勾选已完成的步骤。
          </>
        )
      },
      {
        q: '如何让两个人物打斗？',
        a: (
          <>
            选中人物，打开<b>动作</b>选项卡并应用打斗动作，播放头处会添加可编辑的姿态关键点。
            为对手也添加动作，即可编排双方的攻防。
          </>
        )
      },
      {
        q: '如何让角色跳舞？',
        a: (
          <>
            选中角色，从<b>动作</b>选项卡应用街舞、萨尔萨、太空步、霹雳舞等舞蹈。
            也可在布景模式中一次性放置完整的<b>舞蹈表演</b>动作序列。
          </>
        )
      },
      {
        q: '如何让盘子飞过房间？',
        a: (
          <>
            选中任意物体，从<b>路径预设</b>应用飞行动作，或点击<b>● 录制</b>并用<b>鼠标滚轮调整高度</b>。
            之后也可手动设置走位点的<b>高度</b>。
          </>
        )
      },
      {
        q: '如何让飞机降落或建筑倒塌？',
        a: (
          <>
            先调整物体朝向，再从<b>路径预设</b>中应用飞机起飞、降落、掠过、直升机盘旋、
            汽车追逐、碎片坠落或建筑倒塌等动作。路径从物体当前位置开始。
          </>
        )
      },
      {
        q: '如何让人物上公交车或下飞机？',
        a: (
          <>
            选中演员的最后一个走位点，将<b>到达后搭乘</b>设为公交车。
            要让人物下飞机，先将人物绑定到停放的飞机，再添加从飞机落地后开始的走位点。
          </>
        )
      },
      {
        q: '如何在时间线上调整动作时间或删除动作？',
        a: (
          <>
            拖动走位点块可调整时间，拖动右边缘可添加停留，双击可删除。
            按住 <Kbd>⇧</Kbd> 并点击可多选走位点。
          </>
        )
      },
      {
        q: '如何一次性放置整组已编排好动作的演员？',
        a: (
          <>
            在布景模式的<b>群体动作</b>中选择舞蹈表演、打斗、徒步追逐或汽车追逐。
            设置人数和风格后即可放置整组演员，动作已自动编排。
          </>
        )
      },
      {
        q: '如何编排带节奏、攻防配合和队形的完整动作？',
        a: (
          <>
            <b>动作编排</b>面板可生成分段舞蹈、双人攻防和追逐，并支持队形、错拍跟随和镜像。
            点击<b>创建动作编排</b>放置新角色，或选中已有角色后点击<b>应用到所选表演者</b>。
            点击骰子可随机更换种子。
          </>
        )
      }
    ]
  },
  {
    area: '摄影机',
    items: [
      {
        q: '如何为镜头构图？',
        a: (
          <>
            选中摄影机并按 <Kbd>C</Kbd> 切换到摄影机视角，再选择远景、中景或特写（WS/MS/CU）
            自动构图，也可选择<b>双人／过肩／反打／俯拍／仰拍／荷兰角</b>等构图方式。
          </>
        )
      },
      {
        q: '如何在镜头中移动摄影机？',
        a: (
          <>
            完成构图后点击<b>+ 摄影机走位点</b>，移动摄影机并重新构图，再添加下一个走位点。
            摄影机会在这些点之间运动。选择轨道、斯坦尼康、手持、摇臂或无人机等<b>摄影机支撑方式</b>来调整运动质感。
          </>
        )
      },
      {
        q: '如何使用预设运镜？',
        a: (
          <>
            摄影机属性面板提供<b>39 种运镜</b>，包括环绕、摇臂、无人机跟随、甩镜、滑动变焦、
            螺旋推近或拉远、急速变焦和荷兰角滚转。一键即可在主体周围生成可编辑的摄影机走位点。
          </>
        )
      },
      {
        q: '如何让摄影机跟踪飞机？',
        a: (
          <>
            在摄影机属性面板中启用<b>跟踪主体</b>并选择主体。
            无论主体如何移动，摄影机都会持续对准它，焦点也会跟随。
          </>
        )
      },
      {
        q: '如何像摄影师一样操控摄影机？',
        a: (
          <>
            选中摄影机并点击<b>● 录制摄影机</b>。角色走位会同步回放，
            你可环绕、平移和缩放视图，操作轨迹会录制为与角色动作同步的运镜。
          </>
        )
      },
      {
        q: '如何添加第二台摄影机？',
        a: (
          <>
            在摄影机属性面板顶部的<b>摄影机（A/B/C）</b>区域点击<b>+</b>，添加拥有独立走位点和支撑方式的摄影机 B。
            点击摄影机按钮可切换；导出时会使用当前摄影机。
          </>
        )
      },
      {
        q: '如何查看实际导出的画面？',
        a: (
          <>
            点击<b>▶ 播放镜头</b>，从镜头摄影机视角查看实际导出画面。
            <b>镜头预览</b>窗口会实时显示画面；按 <Kbd>Space</Kbd> 播放，按 <Kbd>1–9</Kbd> 跳到对应的摄影机走位点。
          </>
        )
      },
      {
        q: '如何复现已有镜头？',
        a: (
          <>
            <b>🎞 参考</b>可将视频（包括深度图视频）半透明叠加在视口上，并与时间线同步。
            对照画面复现走位，可调整透明度和时间偏移。
          </>
        )
      },
      {
        q: '如何尝试新的镜头方案并保留原镜头？',
        a: (
          <>
            将鼠标移到左侧列表中的镜头上，点击<b>+ 草稿</b>，即可保存为“1A v1”等快照版本。
            草稿可像正式镜头一样播放和导出；点击<b>▲</b>可将草稿设为正式镜头。
          </>
        )
      }
    ]
  },
  {
    area: '交付',
    items: [
      {
        q: '如何导出供视频生成工具使用的参考包？',
        a: (
          <>
            在<b>交付</b>模式中选择 Seedance、Veo、Kling、LTX、Wan 等目标工具，然后点击
            <b>导出镜头包</b>，生成纯净 MP4、深度通道、静帧、俯视示意图和提示词。
          </>
        )
      },
      {
        q: '如何导出适用于 Seedance 的 720p 文件？',
        a: (
          <>
            在交付面板中将<b>分辨率</b>设为 720p，这是 Seedance 接受的参考文件分辨率。
            此设置会应用到视频、静帧和动态分镜。
          </>
        )
      },
      {
        q: '如何只导出一帧？',
        a: (
          <>
            将播放头移到所需时刻，点击<b>📸 导出当前帧</b>，即可将这一帧保存为全画质 PNG。
          </>
        )
      },
      {
        q: '如何控制导出画面中的标签？',
        a: (
          <>
            在交付面板中选择标签显示方式：直接叠加到视频、仅显示在静帧中（默认），或完全隐藏。
          </>
        )
      },
      {
        q: '如何将所有镜头拼成一个视频？',
        a: (
          <>
            <b>动态分镜</b>会将当前场景的所有镜头拼接为一个视频；<b>分镜总览</b>会生成分镜网格图。
          </>
        )
      },
      {
        q: '如何将走位导入 Blender？',
        a: (
          <>
            <b>导出到 Blender</b>会生成包含摄影机动画和角色走位的 .glb 文件，并附上一键导入脚本。
          </>
        )
      }
    ]
  },
  {
    area: '项目',
    items: [
      {
        q: '如何保存布景以便在其他项目中复用？',
        a: (
          <>
            <b>场景预设</b>会全局保存当前的布景、角色和走位。
            可在任意项目中将其作为新场景使用，原场景不会改变。
          </>
        )
      },
      {
        q: '如何从另一角度拍摄同一段动作？',
        a: (
          <>
            角色走位属于场景，每个镜头都有自己的摄影机。因此只需<b>新建镜头</b>并重新构图，
            无须再次编排动作。
          </>
        )
      },
      {
        q: '如何在崩溃后恢复内容？',
        a: (
          <>
            应用每分钟自动保存一次备份。崩溃后使用<b>打开项目</b>可恢复未保存的内容。
            项目是包含可读 JSON 文件的文件夹，可自行备份或使用 Git 管理。
          </>
        )
      },
      {
        q: '如何让 AI 智能体操控应用？',
        a: (
          <>
            在 Claude Code、Codex 或 Hermes 中注册 <b>mcp/blockout-mcp.mjs</b>，
            智能体即可搭建场景、调整构图并截取视口画面。详见 AGENTS.md。
          </>
        )
      }
    ]
  }
]

/* ------------------------------- Shortcuts -------------------------------- */

const SHORTCUTS: [string, string][] = [
  ['Space', '播放／暂停镜头'],
  ['M', '为所选对象放置走位点（点击地面）'],
  ['C', '切换到镜头摄影机视角'],
  ['G / R', '操控器：移动／旋转'],
  ['⇧-点击', '多选物体或时间线上的走位点'],
  [`${MOD}A / ⇧${MOD}A`, '选择镜头内／当前轨道的所有走位点'],
  [`${MOD}D`, '复制所选对象'],
  ['⌫', '删除所选对象（包括多选的全部对象）'],
  [`${MOD}Z / ⇧${MOD}Z`, '撤销／重做，所有操作均可撤销'],
  [`${MOD}S`, '保存项目'],
  ['1–9', '跳到对应编号的摄影机走位点'],
  [`${ALT}-点击`, '布景时连续放置多个副本'],
  ['Esc', '取消放置、设置走位点或当前选择'],
  ['?', '打开帮助']
]

/* --------------------------- Blocking coach ------------------------------ */

interface CoachStep {
  key: string
  label: string
  hint: string
}

const COACH_STEPS: CoachStep[] = [
  { key: 'select', label: '选择演员或车辆', hint: '点击视口中的角色。' },
  { key: 'mark1', label: '按 M 放置第一个走位点', hint: '按 M，再点击地面上的起始位置。' },
  { key: 'mark2', label: '放置第二个走位点', hint: '点击更远处，角色会在两个走位点之间行走。' },
  { key: 'play', label: '按 Space 查看行走效果', hint: '按空格键播放镜头，路径线会显示行进路线。' },
  { key: 'record', label: '尝试 ⏺ 录制并直接操控', hint: '从拍摄控制栏录制摄影机或表演。' },
  { key: 'export', label: '打开交付面板导出', hint: '切换到交付模式，生成动态参考包。' }
]

/**
 * "Set your marks" walkthrough. A lightweight renderer-side component that
 * watches the store: each step ticks itself off when the app reaches the
 * matching state. Dismissible; re-openable from Help. Mounted at the app root.
 */
export function BlockingCoach(): JSX.Element | null {
  const open = useStore((s) => s.coachOpen)
  const setOpen = useStore((s) => s.setCoachOpen)
  const [done, setDone] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!open) return
    const check = (): void => {
      const s = useStore.getState()
      setDone((prev) => {
        const next = { ...prev }
        if (s.selection?.kind === 'entity' || s.selection?.kind === 'entities') next.select = true
        const scene = s.scene()
        const shot = s.shot()
        const take = scene?.blocking.find((b) => b.id === shot?.blockingTakeId)
        const maxMarks = take ? Math.max(0, ...take.tracks.map((t) => t.marks.length)) : 0
        if (maxMarks >= 1) next.mark1 = true
        if (maxMarks >= 2) next.mark2 = true
        if (s.playing) next.play = true
        if (s.recording) next.record = true
        if (s.mode === 'deliver') next.export = true
        return next
      })
    }
    check()
    const unsub = useStore.subscribe(check)
    return unsub
  }, [open])

  if (!open) return null
  const currentIdx = COACH_STEPS.findIndex((st) => !done[st.key])
  const allDone = currentIdx === -1

  return (
    <div
      style={{
        position: 'absolute',
        left: 16,
        bottom: 16,
        width: 300,
        zIndex: 30,
        background: 'var(--panel, #16181d)',
        border: '1px solid var(--border-strong, #33343a)',
        borderRadius: 10,
        padding: '14px 16px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.45)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 15 }}>🎯</span>
        <b style={{ fontSize: 13 }}>设置走位点</b>
        <span style={{ flex: 1 }} />
        <button className="btn small" style={{ padding: '2px 8px' }} onClick={() => setOpen(false)} title="关闭（可从帮助中重新打开）">
          ✕
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {COACH_STEPS.map((st, i) => {
          const isDone = !!done[st.key]
          const isCurrent = i === currentIdx
          return (
            <div key={st.key} style={{ display: 'flex', gap: 8, opacity: isDone ? 0.7 : isCurrent ? 1 : 0.5 }}>
              <span style={{ fontSize: 13 }}>{isDone ? '✅' : isCurrent ? '▶' : '○'}</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: isCurrent ? 700 : 500, textDecoration: isDone ? 'line-through' : 'none' }}>
                  {st.label}
                </div>
                {isCurrent && <div style={{ fontSize: 11, color: 'var(--text-faint, #8a8d96)', marginTop: 2 }}>{st.hint}</div>}
              </div>
            </div>
          )
        })}
      </div>
      {allDone && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--success, #46a758)' }}>
          已完成全部流程，可以随时关闭引导。
        </div>
      )}
    </div>
  )
}

/* -------------------------------- overlay -------------------------------- */

type Tab = 'quickstart' | 'tasks' | 'shortcuts'

export function HelpOverlay(): JSX.Element | null {
  const helpOpen = useStore((s) => s.helpOpen)
  const setHelpOpen = useStore((s) => s.setHelpOpen)
  const setCoachOpen = useStore((s) => s.setCoachOpen)
  const [tab, setTab] = useState<Tab>('quickstart')
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TASKS
    const matches = (t: Task): boolean => {
      if (t.q.toLowerCase().includes(q)) return true
      // Answer text lives in JSX children; join their string leaves to search.
      const text = JSON.stringify(t.a).toLowerCase()
      return text.includes(q)
    }
    return TASKS.map((g) => ({ area: g.area, items: g.items.filter(matches) })).filter(
      (g) => g.items.length > 0
    )
  }, [query])

  if (!helpOpen) return null

  return (
    <div className="help-backdrop" onClick={() => setHelpOpen(false)}>
      <div className="help-modal help-v4" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <div className="seg help-tabs">
            <button
              className={tab === 'quickstart' ? 'active' : ''}
              onClick={() => setTab('quickstart')}
            >
              快速入门
            </button>
            <button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}>
              常见操作
            </button>
            <button
              className={tab === 'shortcuts' ? 'active' : ''}
              onClick={() => setTab('shortcuts')}
            >
              快捷键
            </button>
          </div>
          <span style={{ flex: 1 }} />
          <button className="btn small" onClick={() => setHelpOpen(false)}>
            完成
          </button>
        </div>

        <div className="help-body help-v4-body">
          {tab === 'quickstart' && (
            <div className="help-v4-inner">
              <p className="help-intro">
                应用的工作流程分为三步：<b>布景</b>搭建场景，<b>拍摄</b>编排运动，
                <b>交付</b>为 AI 视频生成工具导出参考包。下面带你快速了解整个流程。
              </p>
              <div className="help-cards">
                {CARDS.map((c) => (
                  <div key={c.title} className="help-card">
                    <div className="help-card-emoji">{c.emoji}</div>
                    <div className="help-card-title">{c.title}</div>
                    <div className="help-card-body">{c.body}</div>
                    <div className="help-card-then">{c.then}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  className="btn"
                  onClick={() => {
                    setCoachOpen(true)
                    setHelpOpen(false)
                  }}
                  title="打开“设置走位点”交互引导"
                >
                  🎯 开始“设置走位点”引导
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                  编排第一个动作时，清单会自动勾选已完成的步骤。
                </span>
              </div>
            </div>
          )}

          {tab === 'tasks' && (
            <div className="help-v4-inner">
              <input
                className="help-search"
                type="text"
                placeholder="搜索操作，例如“打斗”“跟踪飞机”“720p”…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
              />
              {filtered.length === 0 ? (
                <p className="help-empty">未找到与“{query}”匹配的操作。</p>
              ) : (
                filtered.map((group) => (
                  <div key={group.area} className="help-task-group">
                    <div className="help-task-area">{group.area}</div>
                    {group.items.map((t) => (
                      <div key={t.q} className="help-task">
                        <div className="help-task-q">{t.q}</div>
                        <div className="help-task-a">{t.a}</div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'shortcuts' && (
            <div className="help-v4-inner">
              <p className="help-intro">键盘快捷键：所有操作均可撤销。</p>
              <div className="help-kbd-grid">
                {SHORTCUTS.map(([key, desc]) => (
                  <div key={key} className="help-kbd-row">
                    <div className="help-kbd-keys">
                      {key.split(' / ').map((k, i, arr) => (
                        <span key={k}>
                          <Kbd>{k}</Kbd>
                          {i < arr.length - 1 ? <span className="help-kbd-sep"> / </span> : null}
                        </span>
                      ))}
                    </div>
                    <div className="help-kbd-desc">{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

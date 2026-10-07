// Modified for cross-platform Windows support in 2026; see MODIFICATIONS.md.
/**
 * App shell: welcome screen, titlebar with the three-mode switch, the
 * Stage/Shoot/Deliver layouts, global keyboard map, and autosave.
 */

import { useCallback, useEffect } from 'react'
import { useStore, currentProjectJson } from './store'
import { Viewport } from './viewport/Viewport'
import { Library } from './panels/Library'
import { Inspector } from './panels/Inspector'
import { ProjectRail } from './panels/ProjectRail'
import { Timeline } from './panels/Timeline'
import { DeliverPanel } from './panels/DeliverPanel'
import { Toasts } from './panels/Toasts'
import { HelpOverlay, BlockingCoach } from './panels/Help'
import logoUrl from './assets/logo.png'
import { DISTRIBUTION } from '../shared/distribution'

const PLATFORM_CLASS = `platform-${window.blockout.platform.platform}`

function CreditLink({ url, children }: { url: string; children: string }): JSX.Element {
  return (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault()
        void window.blockout.openExternal(url)
      }}
      style={{ color: 'var(--accent)', textDecoration: 'none', cursor: 'pointer' }}
      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = 'underline')}
      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = 'none')}
    >
      {children}
    </a>
  )
}

export function Credits({ compact = false }: { compact?: boolean }): JSX.Element {
  return (
    <div
      style={{
        color: 'var(--text-faint)',
        fontSize: compact ? 10 : 12,
        textAlign: 'center',
        lineHeight: 1.6,
        padding: compact ? '10px 12px' : 0
      }}
    >
      由 Sam Wasserman 创作
      {compact ? <br /> : ' · '}
      <CreditLink url="https://wassermanproductions.com">wassermanproductions.com</CreditLink>
      {' · '}
      <CreditLink url="https://wasserman.ai">wasserman.ai</CreditLink>
      {!compact && (
        <>
          <br />
          基于 Apache-2.0 许可证开源，使用或创建分支时请保留此署名。
          {DISTRIBUTION.maintainerCredit && (
            <>
              <br />
              {DISTRIBUTION.maintainerCredit}
            </>
          )}
        </>
      )}
    </div>
  )
}

function Welcome(): JSX.Element {
  const newProject = useStore((s) => s.newProject)
  const loadFromJson = useStore((s) => s.loadFromJson)
  const toast = useStore((s) => s.toast)

  const onNew = useCallback(async () => {
    const project = await window.blockout.newProjectDialog()
    if (!project) return
    const { folder, name } = project
    newProject(folder, name)
    const json = currentProjectJson()
    if (json) await window.blockout.saveProject(folder, json)
  }, [newProject])

  const onOpen = useCallback(async () => {
    const folder = await window.blockout.openProjectDialog()
    if (!folder) return
    const { json, backupJson, backupNewer } = await window.blockout.loadProject(folder)
    if (!json && !backupJson) {
      toast('该文件夹中未找到 project.json。', 'error')
      return
    }
    // A meaningfully-newer autosave means the app died with unsaved work —
    // restore it (undo history is fresh either way; ⌘S makes it permanent).
    if (backupNewer && backupJson && loadFromJson(folder, backupJson)) {
      toast('已从自动保存备份恢复未保存的内容，请保存以保留。', 'success')
      return
    }
    if (json && loadFromJson(folder, json)) return
    if (backupJson && loadFromJson(folder, backupJson)) {
      toast('已从自动保存备份恢复。', 'success')
    }
  }, [loadFromJson, toast])

  return (
    <div className="welcome">
      <img
        src={logoUrl}
        alt="Blockout"
        style={{ width: 260, height: 260, objectFit: 'contain', borderRadius: 16, marginBottom: -8 }}
      />
      <p>
        搭建场景，用走位点编排摄影机与角色的运动，并导出供 AI 视频生成工具使用的动态参考包。
      </p>
      <div className="actions">
        <button className="btn primary" onClick={onNew}>
          新建项目
        </button>
        <button className="btn" onClick={onOpen}>
          打开项目…
        </button>
        <button className="btn" onClick={() => useStore.getState().setHelpOpen(true)}>
          ? 教程
        </button>
      </div>
      <Credits />
    </div>
  )
}

function useAutosave(): void {
  // Depend on WHETHER a doc is open, not on the doc object — every mutation
  // replaces the doc, and re-arming a 60s timer on each edit means autosave
  // never fires for anyone actively working (the exact crash window it
  // exists to cover). The tick reads the latest doc from the store.
  const hasDoc = useStore((s) => s.doc !== null)
  const folder = useStore((s) => s.projectFolder)

  useEffect(() => {
    if (!hasDoc || !folder) return
    const interval = setInterval(() => {
      const json = currentProjectJson()
      if (json) void window.blockout.saveBackup(folder, json)
    }, 60_000)
    return () => clearInterval(interval)
  }, [hasDoc, folder])
}

function useKeyboard(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const s = useStore.getState()
      if (!s.doc) return
      const inField =
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement
      if (inField) return

      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        s.undo()
      } else if (meta && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        s.redo()
      } else if (meta && e.key === 's') {
        e.preventDefault()
        const json = currentProjectJson()
        if (json && s.projectFolder) {
          void window.blockout.saveProject(s.projectFolder, json).then(() => s.markSaved())
        }
      } else if (e.key === ' ') {
        e.preventDefault()
        s.setPlaying(!s.playing)
      } else if (e.key === 'm' || e.key === 'M') {
        if (s.mode === 'shoot' && s.selection) s.setDroppingMarks(!s.droppingMarks)
      } else if (e.key === 'c' || e.key === 'C') {
        // Toggle everywhere except Deliver (which is always the shot view) —
        // being stuck in look-through with no exit was a real trap.
        if (s.mode !== 'deliver') s.setLookThrough(!s.lookThrough)
      } else if (e.key === '?') {
        s.setHelpOpen(!s.helpOpen)
      } else if (e.key === 'Escape') {
        if (s.helpOpen) {
          s.setHelpOpen(false)
          return
        }
        s.setPlacingAsset(null)
        s.setPlacingSequence(null)
        s.setPlacingChoreography(null)
        s.setDroppingMarks(false)
        s.setSelection(null)
      } else if (e.key >= '1' && e.key <= '9') {
        // Jump to camera mark N.
        const shot = s.shot()
        const idx = Number(e.key) - 1
        const mark = shot ? [...shot.camera.marks].sort((a, b) => a.time - b.time)[idx] : undefined
        if (mark) s.setTime(mark.time)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

export function App(): JSX.Element {
  const doc = useStore((s) => s.doc)
  const mode = useStore((s) => s.mode)
  const setMode = useStore((s) => s.setMode)
  const dirty = useStore((s) => s.dirty)
  const markSaved = useStore((s) => s.markSaved)
  const folder = useStore((s) => s.projectFolder)

  useAutosave()
  useKeyboard()

  const onSave = useCallback(async () => {
    const json = currentProjectJson()
    if (json && folder) {
      await window.blockout.saveProject(folder, json)
      markSaved()
    }
  }, [folder, markSaved])

  if (!doc) {
    return (
      <div className={`app ${PLATFORM_CLASS}`}>
        <div className="titlebar">
          <span className="app-name">BLOCKOUT</span>
        </div>
        <Welcome />
        <Toasts />
        <HelpOverlay />
      </div>
    )
  }

  return (
    <div className={`app ${PLATFORM_CLASS}`}>
      <div className="titlebar">
        <span className="app-name">BLOCKOUT</span>
        <span style={{ color: 'var(--text-faint)', fontSize: 12 }}>
          {doc.name}
          {dirty ? ' •' : ''}
        </span>
        <div className="mode-switch">
          <button className={mode === 'stage' ? 'active' : ''} onClick={() => setMode('stage')}>
            布景
          </button>
          <button className={mode === 'shoot' ? 'active' : ''} onClick={() => setMode('shoot')}>
            拍摄
          </button>
          <button className={mode === 'deliver' ? 'active' : ''} onClick={() => setMode('deliver')}>
            交付
          </button>
        </div>
        <button className="btn small" onClick={onSave}>
          保存
        </button>
        <button
          className="btn small"
          title="帮助：快速入门、常见操作、快捷键（?）"
          onClick={() => useStore.getState().setHelpOpen(true)}
        >
          ? 帮助
        </button>
      </div>

      {mode === 'deliver' ? (
        <div className="deliver-layout">
          <div className="deliver-preview">
            <Viewport />
          </div>
          <DeliverPanel />
        </div>
      ) : (
        <div className="main">
          <div className="panel">
            <ProjectRail />
            {mode === 'stage' && <Library />}
            <Credits compact />
          </div>
          <div className="center-column">
            <div className="viewport-wrap">
              <Viewport />
            </div>
            {mode === 'shoot' && <Timeline />}
          </div>
          <div className="panel right">
            <Inspector />
          </div>
        </div>
      )}
      <Toasts />
      <HelpOverlay />
      <BlockingCoach />
    </div>
  )
}

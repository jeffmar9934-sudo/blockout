import { describe, expect, it } from 'vitest'
import { ASSET_CATALOG } from '@engine/assets'
import { ACTION_PRESETS } from '@engine/action-presets'
import { CAMERA_MOVE_PRESETS } from '@engine/camera-moves'
import { SHOT_SIZES } from '@engine/camera'
import { GAITS } from '@engine/gaits'
import { MOTION_PRESETS } from '@engine/motions'
import { zh } from '../../src/renderer/i18n/zh-CN'

describe('Simplified Chinese display vocabulary', () => {
  it('covers the built-in catalogs used by asset, motion and camera panels', () => {
    const catalogs = [
      ASSET_CATALOG,
      MOTION_PRESETS,
      ACTION_PRESETS,
      CAMERA_MOVE_PRESETS,
      Object.values(GAITS),
      Object.values(SHOT_SIZES)
    ]
    for (const catalog of catalogs) {
      for (const entry of catalog) {
        expect(zh(entry.name), `${entry.id}: ${entry.name}`).toMatch(/\p{Script=Han}/u)
      }
    }
  })

  it('preserves custom names and strings containing a built-in label', () => {
    for (const text of [
      '我的自定义演员',
      'Custom hero',
      "Man's stunt double",
      'Man 2',
      'Walk across my set',
      '  Man  ',
      '__proto__',
      'constructor',
      ''
    ]) {
      expect(zh(text)).toBe(text)
    }
  })

  it('translates display names without changing IDs or engine prompt metadata', () => {
    const before = JSON.stringify(ASSET_CATALOG)
    const man = ASSET_CATALOG.find((entry) => entry.id === 'person.man')!
    expect(zh(man.name)).toBe('男性')
    for (const catalog of [ASSET_CATALOG, MOTION_PRESETS, ACTION_PRESETS, CAMERA_MOVE_PRESETS]) {
      for (const entry of catalog) {
        zh(entry.name)
        expect(zh(entry.id)).toBe(entry.id)
      }
    }
    expect(man.name).toBe('Man')
    expect(man.promptNoun).toBe('a man')
    expect(JSON.stringify(ASSET_CATALOG)).toBe(before)
  })
})

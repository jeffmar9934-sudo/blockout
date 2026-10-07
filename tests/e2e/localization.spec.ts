import { _electron as electron, test, expect } from '@playwright/test'
import { mkdtempSync, mkdirSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

test('Simplified Chinese UI supports the scene, camera, motion and help workflow', async () => {
  const root = process.env.BLOCKOUT_E2E_ROOT || tmpdir()
  mkdirSync(root, { recursive: true })
  const smokeDir = mkdtempSync(join(root, 'blockout-zh-'))
  const app = await electron.launch({
    args: ['out/main/index.js'],
    env: {
      ...process.env,
      BLOCKOUT_SMOKE_DIR: smokeDir,
      BLOCKOUT_CONFIG_DIR: join(smokeDir, 'config')
    }
  })

  try {
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    await expect(page.locator('.welcome')).toContainText('搭建场景，用走位点编排摄影机与角色的运动')
    await page.getByRole('button', { name: '新建项目', exact: true }).click()
    await expect(page.locator('.mode-switch')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible()

    // Exercise the translated catalog search and actual viewport placement.
    await page.getByPlaceholder('搜索资源…').fill('男性')
    const asset = page.locator('.library-item').filter({
      has: page.getByText('男性', { exact: true })
    })
    await expect(asset).toHaveCount(1)
    await asset.click()
    const canvas = page.locator('.viewport-wrap canvas')
    const box = (await canvas.boundingBox())!
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.62)
    await expect.poll(() => page.evaluate(() => {
      const s = (window as any).__blockout.store.getState()
      return s.scene().entities.map((entity: any) => entity.assetId)
    })).toEqual(['person.man'])

    await page.locator('.mode-switch').getByRole('button', { name: '拍摄', exact: true }).click()
    await expect(page.getByRole('button', { name: '▶ 播放镜头', exact: true })).toBeVisible()
    await expect(page.locator('.timeline-track-label').first()).toContainText('摄影机')
    await page.getByRole('button', { name: '🎥 摄影机', exact: true }).click()
    await expect(page.getByText('位置与朝向', { exact: true })).toBeVisible()
    await expect(page.getByText('跟踪主体', { exact: true })).toBeVisible()
    await expect(page.getByText('运镜预设', { exact: true })).toBeVisible()

    await page.getByRole('button', { name: '✨ 动作', exact: true }).click()
    const motion = page.locator('.panel-section').filter({
      has: page.getByText('动作预设', { exact: true })
    })
    await motion.getByRole('button', { name: '打斗', exact: true }).click()
    await expect(motion.getByText('刺拳／后手直拳')).toBeVisible()
    await expect(page.getByText('路径预设', { exact: true })).toBeVisible()
    await motion.getByRole('button', { name: '应用', exact: true }).first().click()
    await expect.poll(() => page.evaluate(() => {
      const s = (window as any).__blockout.store.getState()
      const take = s.scene().blocking.find((item: any) => item.id === s.shot().blockingTakeId)
      return take.tracks.some((track: any) => track.marks.some((mark: any) => mark.joints))
    })).toBe(true)

    await page.getByRole('button', { name: '? 帮助', exact: true }).click()
    await page.getByRole('button', { name: '常见操作', exact: true }).click()
    const search = page.getByPlaceholder('搜索操作，例如“打斗”“跟踪飞机”“720p”…')
    await search.fill('打斗')
    await expect(page.getByText('如何让两个人物打斗？', { exact: true })).toBeVisible()
    await expect(page.getByText('如何设置灯光？', { exact: true })).not.toBeVisible()
    await search.fill('跟踪飞机')
    await expect(page.getByText('如何让摄影机跟踪飞机？', { exact: true })).toBeVisible()
    await search.fill('不存在的帮助主题')
    await expect(page.getByText('未找到与“不存在的帮助主题”匹配的操作。', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: '完成', exact: true }).click()

    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect.poll(() => page.evaluate(() => (window as any).__blockout.store.getState().dirty)).toBe(false)
    const saved = JSON.parse(readFileSync(join(smokeDir, 'Smoke.blockout', 'project.json'), 'utf8'))
    expect(saved.scenes[0].entities[0].assetId).toBe('person.man')
    expect(saved.scenes[0].blocking[0].tracks[0].marks.length).toBeGreaterThan(0)

    const screenshotPath = process.env.BLOCKOUT_ZH_PREVIEW || test.info().outputPath('zh-preview.png')
    mkdirSync(dirname(screenshotPath), { recursive: true })
    await page.screenshot({ path: screenshotPath })
  } finally {
    await app.close()
  }
})

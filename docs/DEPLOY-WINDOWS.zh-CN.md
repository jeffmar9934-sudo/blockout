# Blockout 简体中文版：Windows 本地部署

支持 Windows 10 / 11 的 64 位 x64 电脑。中文版可在本机离线编辑、保存场景并导出视频，不需要在云端运行。

## 下载入口

打开 [中文版 Windows 构建](https://github.com/jeffmar9934-sudo/blockout/actions/workflows/windows-zh-release.yml)，选择最新成功的运行。登录 GitHub 后，在页面的 Artifacts 下载 `Blockout-zh-CN-5.1.1-windows-x64`；构建产物保留 14 天。先解压这个下载文件，再选择其中的中文安装向导或免安装 ZIP。文件旁附 `SHA256SUMS.txt`。

同一批文件会上传至仓库的既有草稿 Release。Release 保持草稿，需登录仓库拥有者或有写权限的协作者账号查看 Assets。

## 免安装包

下载 Windows x64 ZIP，使用系统“全部解压”将整个文件夹解压到本机目录，再打开里面的 `Blockout 简体中文版.exe`。保留 `resources`、DLL、语言包等其他文件，不要单独移动 EXE，也不要直接在 ZIP 中启动。应用本身免安装，设置仍保存于 `%APPDATA%\blockout-zh-cn`。

Windows 原生构建流程提供中文安装向导（`-Setup.exe`）、免安装 ZIP 和源码 ZIP。免安装包包含 Electron、应用依赖及经过固定 SHA256 校验的 FFmpeg / ffprobe，无需另装 Node.js 或 FFmpeg。此版本未进行 Authenticode 签名，Windows 可能显示未知发布者；可先按下文核对下载文件的 SHA256。

## 首次使用

1. 点击“新建项目”，选择本地 `.blockout` 项目目录。
2. 在“布景”中搜索中文资源名称并放置对象。
3. 在“拍摄”中设置摄影机和走位点；在“交付”中导出镜头包。
4. 视频和静帧写入项目目录下的 `exports`；项目可再次打开。

核心流程不需要联网。可选的 Claude 参考素材分析另需网络及有效凭据。生成给视频模型使用的 `prompt.txt` 保留英文，导出包使用说明为中文。

## 从源码运行或重新打包

源码 ZIP 用于修改、开发和自行构建，不包含 `node_modules`。先安装 Node.js 24 LTS 并确保网络可访问 npm 与 GitHub，然后解压整个源码包并双击根目录的 `Start-Windows.cmd`。它会按锁文件安装依赖、校验 Electron 与 FFmpeg、构建并启动应用。

如需自行生成中文版安装包及免安装 ZIP，在源码根目录的终端执行：

```powershell
npm ci
node node_modules/electron/install.js
node deploy/package-windows-zh.mjs
```

构建产物保存在 `release`。脚本保留固定依赖和 FFmpeg 校验，下载 FFmpeg 对应源码，使用独立的中文版应用标识与配置目录。

生成的 `-Setup.exe` 可双击运行，按中文向导选择安装位置，然后从桌面或开始菜单打开应用。安装包由 GitHub Actions 的 Windows 环境原生构建，也可在本机执行上述命令重新生成。

## 可选：连接支持 MCP 的 AI 客户端

先启动中文版应用，再在 AI 客户端中添加下面的 MCP 配置。此功能另需安装 Node.js；把示例路径替换为实际安装或解压目录。源码运行时，桥文件位于源码根目录的 `mcp` 文件夹。

```json
{
  "mcpServers": {
    "blockout-zh-cn": {
      "command": "node",
      "args": ["C:\\你的安装目录\\resources\\mcp\\blockout-mcp.mjs"],
      "env": { "BLOCKOUT_CONFIG_NAMESPACE": "blockout-zh-cn" }
    }
  }
}
```

环境变量让 MCP 桥找到中文版独立的设置目录；详细工具列表见随包的 `resources\mcp\README.md`。

## 校验与故障排查

Windows PowerShell 校验下载文件：

```powershell
Get-FileHash .\Blockout-zh-CN-5.1.1-win-x64.zip -Algorithm SHA256
```

把结果与同目录的 `SHA256SUMS.txt` 对比。源码 ZIP 也可用同样方法校验。

无法导出时，请检查项目目录是否可写，以及 `resources\ffmpeg\ffmpeg.exe` 是否存在。保存好项目后可重新完整解压 ZIP 或重新安装。不要覆盖 `.blockout` 项目目录。

云端构建与 Wine 检查无法代替在真实 Windows 硬件上的测试；如遇到启动或显卡兼容问题，请提供 Windows 版本与错误信息。

## 署名及许可

Blockout 由 Sam Wasserman 创建：[wassermanproductions.com](https://wassermanproductions.com) · [wasserman.ai](https://wasserman.ai)。保留原 Apache-2.0 `LICENSE`、`NOTICE`、`MODIFICATIONS.md` 与第三方声明。Windows FFmpeg / ffprobe 为独立 GPL-3.0-or-later 组件，对应许可、来源与源码档案保留在应用资源目录。

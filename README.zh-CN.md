# Blockout 简体中文版

这是固定使用简体中文界面的 Blockout。它用于搭建预演场景、编排角色走位和摄影机运动，并导出供 AI 视频生成工具使用的运动参考包。

Windows 10 / 11 本地安装、免安装运行与源码构建方法见 [Windows 本地部署说明](docs/DEPLOY-WINDOWS.zh-CN.md)。

界面包含布景、拍摄、交付、资源库、属性面板、时间线、教程和文件对话框。内置资源与动作以中文显示，资源搜索同时支持中文和英文。用户已有项目、资源 ID、快捷键和自定义名称保持兼容。视频生成模型名称、专业缩写和底层工具诊断保留原文；`prompt.txt` 仍生成英文提示词，导出包的 `README.txt` 提供中文使用说明。

## Windows 下载

打开 [中文版 Windows 构建](https://github.com/jeffmar9934-sudo/blockout/actions/workflows/windows-zh-release.yml)，选择最新成功的运行。登录 GitHub 后，在运行页面的 Artifacts 下载 `Blockout-zh-CN-5.1.1-windows-x64`（保留 14 天）。解压后可选择中文 `-Setup.exe` 安装向导，或完整解压其中的免安装 ZIP。包内另附源码、中文说明及 SHA256 校验文件。

构建完成后，文件也会上传至仓库的既有草稿 Release；草稿附件需要仓库拥有者或有写权限的协作者登录查看。安装包未签名。

## 从源码运行

需要 Node.js 22.12 或更新版本，以及 FFmpeg / ffprobe。Linux 的共享库要求见 [Linux 安装说明](docs/INSTALL-linux.md)。

```bash
npm ci
node node_modules/electron/install.js
npm run dev
```

生产构建与启动：

```bash
npm run build
npm start
```

## 此云环境

云端使用 Node.js 24、虚拟显示器和软件 WebGL，并已安装中文字体。每个新终端先执行：

```bash
cd /workspace/blockout
source /workspace/.blockout-cloud/env.sh
xvfb-run -a -s '-screen 0 1920x1080x24 -nolisten tcp' npm run dev -- --noSandbox
```

`--noSandbox` 仅用于此隔离的 Linux 云环境。安装和启动说明已保存到环境配置草稿；审阅并发布后，后续任务可复用准备好的文件系统。运行中的进程需要重新启动。

## 验证

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run smoke
```

云端运行 smoke 或其他 Electron 端到端测试时，需要先加载上述 `env.sh`，并在命令外使用 `xvfb-run`。端到端检查会创建临时项目并验证实际导出内容。

Windows 安装包和免安装 ZIP 由上述 Windows 构建流程生成，也可按照部署说明在本机重新打包。macOS 使用原仓库的打包流程。更多产品说明见 [README](README.md) 和 [AGENTS.md](AGENTS.md)。

## 署名与许可证

Blockout 由 **Sam Wasserman** 创建：[wassermanproductions.com](https://wassermanproductions.com) · [wasserman.ai](https://wasserman.ai)。

项目使用 Apache-2.0 许可证。分发时须保留原项目的 [LICENSE](LICENSE)、[NOTICE](NOTICE) 和作者署名。Windows 支持由 Gumbii Digital 贡献，详见 [MODIFICATIONS.md](MODIFICATIONS.md)。

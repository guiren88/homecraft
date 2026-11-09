# 英语寻宝试点（U2 + U5）

基于 Homecraft 样板间（examples/terry-home）改编的英语寻宝原型，给二年级上（上海牛津 2A）学到 Unit 5 的孩子玩。根目录站点已经换成样板间的完整世界（房子、主卧、球场、车库、泳池、后山），`examples/` 原样保留，`engine/` 一行未改。

## 玩法

打开页面后，屏幕顶部有 “Treasure Hunt 英语寻宝” 任务栏：

- 先选章节：**U2 · The Mystery of the Messy Room**（5 步）或 **U5 · Rita's Magical Sky Log**（4 步）。
- 每步给一句英文线索，走到线索说的地方（3 米内）就算找到：得一颗星 ⭐，任务栏会显示这一步的目标词和课本原句，然后自动给下一条线索。
- **🔊 朗读** 按钮（或每步开始时自动）用浏览器 Web Speech 朗读线索，音色选择思路移植自英语站 `src/utils/speech.js`（优先自然音色、避开机器人音色、语速 0.85）。
- **中文提示** 默认不显示，点一下才展开。
- U5 章节会随着步数切换世界时间：morning → day → dusk → night，结束切回 day。
- 进度存在浏览器 `localStorage`（键 `homecraft_hunt_progress`）：星星总数、各章完成情况、未完成章节的步数（下次可继续）。
- 通关后有回到英语学习站的链接。链接地址是 `world/treasure.js` 顶部的常量 **`HUNT_APP_URL`**，已指向英语站的 Vercel 线上地址 https://daughter-english-app.vercel.app（以仓库 About 栏的主页链接为准）。

## 数据管道（单词/句子不在这边手抄）

词、句、故事数据只有一个源头：英语站仓库 daughter-english-app 的 `src/data/vocabulary.json` 和 `src/data/stories.json`。

```sh
# 一行重新生成（参数是英语站仓库路径，省略时依次找 DAUGHTER_APP_DIR、/tmp/daughter-english-app、../daughter-english-app）
node tools/gen-hunt.mjs [path-to-daughter-english-app]
```

它把 grade_2a 的 Unit 2、Unit 5（单元标题、全部词与翻译、全部句子、tips、故事标题/简介/coreWords）生成到 `world/hunt-data.js`。**不要手改 hunt-data.js**，改数据去英语站改，再跑一遍脚本。

手工写的内容只有线索本身，在 `world/hunt-steps.js`：每步只引用生成数据里的词（`word`）和句子序号（`sentence`），外加目标地点和中文提示，以后加 U1/U3/U4 章节也照这个格式加。

寻宝逻辑在 `world/treasure.js`，由 `world/build.js` 的 `setup()` 接入（原来的 Vertec 和帆船行为都保留）。一个实现细节：当前引擎传给 `setup()` 的对象里没有 `setTimeMode`（它挂在 `window.__home` 上，引擎在 setup 之后才赋值），所以 treasure.js 是惰性地从 `window.__home` 取的，没有改引擎。

目标地点的选择说明：

- U2 第 3 步“书架”：这个世界没有独立的书架站。真实书柜是主卧旁秘密房间的整墙书柜（`world/house.js` 用 `bookshelf` 砌的墙），`world/furnish.js` 在那面墙上有 `secret` 热点，所以这一步的到达点用该热点的中心（约 [-15.9, -9.5]，在楼上）。
- U2 第 4 步“箱子”：用车库（`lab` 站）当储物间，里面有车和钢制储物架。
- 其余步都用站点的站立点（STATIONS 的 `at`）：主卧床边 writing、工作台 works、客厅沙发 about、信箱 mailbox、后山 mountain、泳池 pool。

## 本地运行

```sh
python3 tools/serve.py          # 自动选空闲端口并打开浏览器；Windows 用 python
node tools/check-site.mjs       # 项目自带站点检查（元数据/皮肤/引擎差异）
```

## 没做的事

- **没有改 `engine/`**，也没有改 `examples/`；样板间是复制到根目录的。
- **没有推送到 GitHub**，只是本地仓库（含本地提交）。要发布时再 push 到 guiren88/homecraft，并按 docs/deploy.md 走 GitHub Pages。
- **只做了 U2 + U5 两章试点**，U1/U3/U4 章节未做；U5 朗读没有用英语站的有道 TTS 代理，用的是浏览器自带 Web Speech。
- 进度只存在本机浏览器 localStorage，没有和英语站的星星系统打通（两个站同域部署后才能共享，这是后续阶段的事）。
- 本机无头浏览器环境受限（Playwright 浏览器下载超时、系统 Chromium 被策略锁定），未做真实浏览器游玩截图验证；寻宝逻辑用 jsdom 做了逻辑级自动化测试（选章、走到每步、星星、昼夜顺序、持久化都过），真实手感请在手机/电脑浏览器上打开确认一次。

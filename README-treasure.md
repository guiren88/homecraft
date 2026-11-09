# 英语寻宝试点（U2 + U5）

基于 Homecraft 样板间（examples/terry-home）改编的英语寻宝原型，给二年级上（上海牛津 2A）学到 Unit 5 的孩子玩。根目录站点已经换成样板间的完整世界（房子、主卧、球场、车库、泳池、后山），`examples/` 原样保留，`engine/` 只有一处已批准的骑乘补丁（见“小动物与骑乘”）。

## 玩法

打开页面后，屏幕顶部有 “Treasure Hunt 英语寻宝” 任务栏：

- 先选章节：**U2 · The Mystery of the Messy Room**（5 步）或 **U5 · Rita's Magical Sky Log**（4 步）。
- 每步给一句英文线索，走到线索说的地方（3 米内）就算找到：得一颗星 ⭐，任务栏会显示这一步的目标词和课本原句，然后自动给下一条线索。
- **🔊 朗读** 按钮（或每步开始时自动）朗读线索。固定文本全部用预生成录音片段播放（见下面“语音片段”），不再依赖设备自带的机械 TTS 音色；任务栏右上角有**音量滑杆**（0–500%，100% 为原音量；超过 100% 的放大只对预录音片段生效，走 WebAudio 增益，远程备用音源和系统语音封顶 100%），和答题弹窗里的滑杆共用一个设置，存在 `localStorage`（键 `homecraft_volume`）。
- **中文提示** 默认不显示，点一下才展开。
- U5 章节会随着步数切换世界时间：morning → day → dusk → night，结束切回 day。
- 进度存在浏览器 `localStorage`（键 `homecraft_hunt_progress`）：星星总数、各章完成情况、未完成章节的步数（下次可继续）。
- 通关后有回到英语学习站的链接。链接地址是 `world/treasure.js` 顶部的常量 **`HUNT_APP_URL`**，已指向英语站的 Vercel 线上地址 https://daughter-english-app.vercel.app（以仓库 About 栏的主页链接为准）。

## 答题闸门（每 3 分钟一次，不过关不能继续玩）

逻辑在 `world/quiz.js`，从寻宝模块接入：

- 累计游玩满 **3 分钟**（常量 `QUIZ_INTERVAL_MS = 180000`，在 quiz.js 顶部）就弹出全屏答题弹窗，游戏键盘输入被拦截，弹窗没有关闭按钮、按 Esc 也关不掉。
- 题目从**当前章节的单元词表**出（没选章节时从 U2+U5 合并出）：朗读并显示一个英文词/短语，3 个大按钮选中文意思（约 1/4 概率反过来：显示中文选英文）。
- 每轮共 **5 道题**（常量 `QUIZ_QUESTIONS_PER_ROUND = 5`），弹窗顶部显示“第 X / 5 题”，同一轮内不重复出同一个词。答对一题进入下一题；**5 题全部答对**才表扬关弹窗、3 分钟重新计时。答错：选项锁定 **60 秒**（常量 `QUIZ_PENALTY_MS = 60000`）并显示倒计时，然后**同一道题**重新出（选项可换顺序），循环直到答对（不计入轮次进度）。
- 计时只累计页面可见且弹窗关闭的时间；切到后台不计时。

## 小动物与骑乘

模拟逻辑在 `world/critter-logic.js`，渲染与骑乘 UI 在 `world/critters.js`，由 `world/build.js` 的 `setup()` 接入：

- 草地上养了 12 只方块小动物：小猪 ×2、小羊 ×2、兔子 ×3（其中一只灰色）、小鸡 ×3、鸭子 ×2。每种动物一个 InstancedMesh（共 5 次绘制）。它们在各自的活动范围里闲逛：兔子蹦着走、小鸡 idle 时会啄地、鸭子只在泳池北边的岸边活动，不会进水；泳池和房子是禁区，进不去。
- **骑乘**：走近任意一只（2 米内），屏幕下方中间会出现大按钮 “🐷 骑上小猪”（按当前最近的那只命名），点它或按 **F** 骑上；骑上后动物朝着镜头方向转弯，按住 **W / ↑** 或按住屏幕上的 “🐾 走” 按钮前进，点 “⬇️ 下来” 或再按 F 下马，下马后动物停 2 秒再继续闲逛。
- 骑乘依赖引擎的一处已批准本地补丁：`engine/world/player.js` 的 `setSeatY`（仅渲染层把人物抬到动物背高，不影响物理/导航，代码里有 `LOCAL FORK PATCH` 注释，同步上游引擎时要保留）。这是整个项目里唯一改过的引擎文件。

## 语音片段（预生成，不依赖在线 TTS）

朗读走 `world/speak.js`：先查 `world/audio-manifest.js`，有片段就播本地 MP3；没有的文本才走在线回退（短词：有道词典发音 → 百度翻译 TTS；句子：百度翻译 TTS），再失败才用浏览器自带语音（挑自然音色、语速 0.85、避开机器人音色，思路移植自英语站 `src/utils/speech.js`）。

片段用 Google Translate TTS 一次性生成（国内运行时不依赖它）：

```sh
python3 tools/gen-audio.py   # 收集 hunt-steps 线索 + hunt-data 全部词句 + 答题 UI 字符串，生成 assets/audio/*.mp3 和 world/audio-manifest.js
```

当前 65 个片段共约 0.81 MiB，`tools/build.sh` 会把 `assets/` 整目录拷进 dist，已验证 MP3 在构建产物里。

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

- `examples/` 没有改；`engine/` 只有一处已批准的本地补丁（`world/player.js` 的 `setSeatY` 骑乘座位高度，见上面“小动物与骑乘”），其余引擎文件未动；样板间是复制到根目录的。
- 试点本体、语音片段 + 答题闸门 + 音量（含 0–500% 放大）均已推送并上线 GitHub Pages，后续推送会自动重新部署。
- **只做了 U2 + U5 两章试点**，U1/U3/U4 章节未做。
- 引擎自带的环境音效（engine/ui/sound.js）只有开关、没有音量接口，world 层改不到，所以音量滑杆只管朗读语音；环境音量仍用引擎自己的声音按钮开关。
- 进度只存在本机浏览器 localStorage，没有和英语站的星星系统打通（两个站同域部署后才能共享，这是后续阶段的事）。
- 本机无头浏览器环境受限，未做真实浏览器游玩截图验证；逻辑做了自动化测试：`tools/treasure-features.test.mjs`（语音选源、音量持久化与生效、答题计时/罚时/同题重出/不可关闭，共 46 项断言）和 `tools/critters.test.mjs`（动物物种/闲逛/禁区阻挡/骑乘转向与上下马，共 54 项断言），真实手感请在手机/电脑浏览器上打开确认一次。

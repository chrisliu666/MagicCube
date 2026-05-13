# AGENTS.md — MagicCube 项目开发指南

## 项目概述

MagicCube 是一个基于 Three.js 的 3D 魔方模拟器，纯前端运行。支持鼠标拖拽旋转视角、手动逐面旋转、自动打乱、自动还原。

## 技术栈

- **Three.js** (r170) — 3D 渲染引擎
- **OrbitControls** — 视角控制（鼠标拖拽、缩放）
- **ES Modules** — 模块化组织代码
- 无构建工具，通过 `importmap` 加载 CDN

## 目录结构

```
magiccube/
├── index.html          # 入口页面
├── style.css           # 样式
├── AGENTS.md           # AI agent 项目开发指南（本文件）
├── README.md           # 用户文档
└── src/
    ├── cube.js          # 魔方核心模型
    └── main.js          # 应用入口 / 场景 / UI 绑定
```

## 核心架构

### `src/cube.js` — 魔方模型

`RubiksCube` 类：

| 方法 | 功能 |
|---|---|
| `constructor(scene, opts)` | 构建 27 个小方块（3×3×3） |
| `rotateFace(face, dir)` | 旋转一个面（异步动画） |
| `doMove(face, dir)` | 旋转 + 记录历史 |
| `scramble(moves)` | 随机打乱 N 步 |
| `solve()` | 逆序还原 |
| `reset()` | 重置到初始状态 |

**面命名约定：** R / L / U / D / F / B（标准魔方记法）

**旋向：** `dir = 1` 顺时针，`dir = -1` 逆时针。顺时针定义：从该面外侧向中心看。

**坐标系统：**
- Y 轴朝上，白色面朝上 (U)
- X 轴朝右，红色面朝右 (R)
- Z 轴朝前，绿色面朝前 (F)

**动画机制：** 创建一个临时 Object3D 作为 pivot，将目标层的小方块 attach 到 pivot，通过 `requestAnimationFrame` 缓动旋转，完成后用 `scene.attach()` 拆回场景并取整坐标。

### `src/main.js` — 应用入口

职责：
1. 初始化 Three.js 场景 / 相机 / 渲染器
2. 初始化 OrbitControls（阻尼、距离限制）
3. 配置灯光（环境光 + 方向光 + 补光）
4. 创建 `RubiksCube` 实例
5. 绑定 UI 按钮事件和键盘快捷键
6. 主渲染循环

**灯光布局：**
- 环境光 `0x444466` 强度 0.6
- 主方向光 (5, 8, 6) 强度 2.5
- 补光 (-4, 1, -3) 强度 0.8
- 底光 (0, -5, 0) 强度 0.4

### `index.html` — UI 布局

控制面板（固定底部）包含：
- 面操作按钮（12 个：6 个面 × 顺时针/逆时针）
- 打乱步数输入框
- 打乱 / 还原 / 重置按钮
- 步数 / 状态信息

## 键盘快捷键

| 按键 | 操作 |
|---|---|
| `r` / `R` | 右面 顺时针/逆时针 |
| `l` / `L` | 左面 顺时针/逆时针 |
| `u` / `U` | 上面 顺时针/逆时针 |
| `d` / `D` | 下面 顺时针/逆时针 |
| `f` / `F` | 前面 顺时针/逆时针 |
| `b` / `B` | 后面 顺时针/逆时针 |
| `s` | 打乱 |
| `z` | 还原 |

## 运行方式

由于使用了 ES Module 和 importmap，需要从 HTTP 服务器运行：

```bash
# 使用 Python
python -m http.server 8000
# 打开 http://localhost:8000

# 或使用 Node.js
npx serve .

# 直接双击 index.html 会在某些浏览器因 CORS 无法加载 module
```

## 常见修改需求指南

### 修改颜色

编辑 `cube.js` 中的 `FACE_COLORS` 对象：

```js
const FACE_COLORS = {
  right: 0xe53935,   // 亮红
  left:  0xff7518,   // 亮橙
  up:    0xffffff,   // 白
  down:  0xffd700,   // 亮黄
  front: 0x00c853,   // 亮绿
  back:  0x1a73e8,   // 亮蓝
  inner: 0x1a1a1a,   // 内部黑色（缝隙）
};
```

### 修改动画速度

在 `main.js` 中创建魔方时传入 `animSpeedMs`：

```js
const cube = new RubiksCube(scene, { animSpeedMs: 80 });
```

### 调整视角

修改相机位置和 OrbitControls 的 min/maxDistance：

```js
camera.position.set(4.2, 3.0, 4.8);
controls.minDistance = 3.5;
controls.maxDistance = 12;
```

## 已知限制

- 还原算法采用"反转历史"策略，不支持从任意已打乱状态求解（需要完整 Kociemba 算法）
- 不支持中间层旋转（M/E/S）—— 始终单层操作
- 不支持触摸拖动旋转面（仅 OrbitControls 操控视角）

## 开发原则

1. **无状态文件** — 所有状态在运行时构建，页面刷新即重置
2. **异步动画** — 面旋转返回 Promise，外部可 await
3. **防并发** — `isAnimating` 标志防止动画重叠
4. **坐标取整** — 每次旋转后对 position 四舍五入，防止浮点漂移

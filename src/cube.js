/**
 * cube.js — 魔方核心模型
 *
 * 管理 27 个 Cubelet（小方块），提供面旋转、打乱、还原功能。
 * 每一层选择通过 layer 坐标 + 阈值判定，旋转完成后对坐标取整避免浮点漂移。
 */

import * as THREE from 'three';

/* ─── 颜色配置 ─── */
const FACE_COLORS = {
  right: 0xe53935,   // 亮红
  left:  0xff7518,   // 亮橙
  up:    0xffffff,   // 白
  down:  0xffd700,   // 亮黄
  front: 0x00c853,   // 亮绿
  back:  0x1a73e8,   // 亮蓝
  inner: 0x1a1a1a,   // 内部黑色
};

/* ─── 面定义 ─── */
const FACE_DEFS = {
  R: { axis: 'x', layer:  1, sign:  1 },
  L: { axis: 'x', layer: -1, sign: -1 },
  U: { axis: 'y', layer:  1, sign:  1 },
  D: { axis: 'y', layer: -1, sign: -1 },
  F: { axis: 'z', layer:  1, sign:  1 },
  B: { axis: 'z', layer: -1, sign: -1 },
};

const FACE_NAMES = Object.keys(FACE_DEFS); // ['R','L','U','D','F','B']

/* ─── 辅助函数 ─── */
function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/* ════════════════════════════════════════
   RubiksCube
   ════════════════════════════════════════ */
export class RubiksCube {
  /**
   * @param {THREE.Scene} scene
   * @param {object}      opts
   * @param {number}      [opts.cubieSize=0.95]  单个小方块尺寸
   * @param {number}      [opts.gap=0.05]        方块间缝隙
   * @param {number}      [opts.animSpeedMs=150]  每次旋转动画时长
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.cubieSize = opts.cubieSize ?? 0.95;
    this.gap = opts.gap ?? 0.05;
    this.animSpeedMs = opts.animSpeedMs ?? 150;

    /** @type {THREE.Mesh[]} 所有小方块 mesh */
    this.cubelets = [];
    /** @type {{ face: string, dir: number }[]} 操作历史 */
    this.moveHistory = [];
    /** @type {boolean} */
    this.isAnimating = false;
    /** 当前正在执行动画的 Promise（用于外部等待） */
    this._animPromise = null;

    this._build();
  }

  /* ─── 构建 ─── */
  _build() {
    const s = this.cubieSize;
    const colors = FACE_COLORS;

    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          // 六个面的材质
          const materials = [
            new THREE.MeshStandardMaterial({
              color: x === 1 ? colors.right : colors.inner,
              roughness: 0.35,
              metalness: 0.05,
            }),
            new THREE.MeshStandardMaterial({
              color: x === -1 ? colors.left : colors.inner,
              roughness: 0.35,
              metalness: 0.05,
            }),
            new THREE.MeshStandardMaterial({
              color: y === 1 ? colors.up : colors.inner,
              roughness: 0.35,
              metalness: 0.05,
            }),
            new THREE.MeshStandardMaterial({
              color: y === -1 ? colors.down : colors.inner,
              roughness: 0.35,
              metalness: 0.05,
            }),
            new THREE.MeshStandardMaterial({
              color: z === 1 ? colors.front : colors.inner,
              roughness: 0.35,
              metalness: 0.05,
            }),
            new THREE.MeshStandardMaterial({
              color: z === -1 ? colors.back : colors.inner,
              roughness: 0.35,
              metalness: 0.05,
            }),
          ];

          const geo = new THREE.BoxGeometry(s, s, s);
          const mesh = new THREE.Mesh(geo, materials);
          mesh.position.set(x, y, z);

          // 黑色边框
          const edges = new THREE.EdgesGeometry(geo);
          const line = new THREE.LineSegments(
            edges,
            new THREE.LineBasicMaterial({ color: 0x000000 }),
          );
          mesh.add(line);

          this.scene.add(mesh);
          this.cubelets.push(mesh);
        }
      }
    }
  }

  /* ─── 面旋转 ─── */
  /**
   * @param {string}  face  'R'|'L'|'U'|'D'|'F'|'B'
   * @param {number}  dir   1 顺时针, -1 逆时针
   */
  async rotateFace(face, dir = 1) {
    if (this.isAnimating) return;
    this.isAnimating = true;

    const def = FACE_DEFS[face];
    if (!def) throw new Error(`Unknown face: ${face}`);

    const { axis, layer, sign } = def;
    const angle = sign * dir * Math.PI / 2;

    // 选出该层小方块
    const selected = this.cubelets.filter(
      c => Math.abs(c.position[axis] - layer) < 0.5,
    );

    // 创建临时轴心
    const pivot = new THREE.Object3D();
    this.scene.add(pivot);
    selected.forEach(c => pivot.attach(c));

    // 动画
    const duration = this.animSpeedMs;
    const start = performance.now();

    await new Promise(resolve => {
      const tick = () => {
        const elapsed = performance.now() - start;
        const t = Math.min(elapsed / duration, 1);
        const eased = easeInOutCubic(t);

        pivot.rotation[axis] = angle * eased;

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          // 最终位置对齐
          pivot.rotation[axis] = angle;
          pivot.updateMatrixWorld(true);

          // 拆回场景，取整坐标
          selected.forEach(c => {
            this.scene.attach(c);
            c.position.x = Math.round(c.position.x);
            c.position.y = Math.round(c.position.y);
            c.position.z = Math.round(c.position.z);
          });

          // 清理 pivot
          // detached 后会得到一个空 pivot，扔掉
          while (pivot.children.length > 0) {
            pivot.remove(pivot.children[0]);
          }
          this.scene.remove(pivot);

          this.isAnimating = false;
          resolve();
        }
      };
      tick();
    });
  }

  /* ─── 辅助：选中某一面的所有小方块 ─── */
  _selectCubiesForFace(face) {
    const d = FACE_DEFS[face];
    return this.cubelets.filter(c => Math.abs(c.position[d.axis] - d.layer) < 0.5);
  }

  /* ─── 辅助：创建 pivot 并将小方块挂上去 ─── */
  _createPivot(cubies) {
    const pivot = new THREE.Object3D();
    this.scene.add(pivot);
    cubies.forEach(c => pivot.attach(c));
    return pivot;
  }

  /* ─── 辅助：将小方块从 pivot 拆回场景并取整 ─── */
  _finalizeDrag({ pivot, cubies }) {
    pivot.updateMatrixWorld(true);
    cubies.forEach(c => {
      this.scene.attach(c);
      c.position.x = Math.round(c.position.x);
      c.position.y = Math.round(c.position.y);
      c.position.z = Math.round(c.position.z);
    });
    this.scene.remove(pivot);
    this.isAnimating = false;
  }

  /* ─── 获取面定义（供外界拖拽计算角度用） ─── */
  static getFaceDef(face) {
    return FACE_DEFS[face];
  }

  /* ─── 拖拽：开始 ─── */
  /**
   * 在面上按下时调用，创建 pivot 并将该层小方块挂上去。
   * @param {string} face  'R'|'L'|'U'|'D'|'F'|'B'
   * @returns {object|null} drag 句柄，返回 null 表示无法开始（动画中）
   */
  startDrag(face) {
    if (this.isAnimating) return null;
    this.isAnimating = true;

    const cubies = this._selectCubiesForFace(face);
    const pivot = this._createPivot(cubies);
    return {
      pivot,
      axis:     FACE_DEFS[face].axis,
      sign:     FACE_DEFS[face].sign,
      cubies,
      face,
    };
  }

  /* ─── 拖拽：更新旋转角度 ─── */
  /**
   * 鼠标拖动过程中持续调用，让该面跟随鼠标旋转。
   * @param {object} drag      startDrag 返回的句柄
   * @param {number} angleRad  累计旋转弧度（正值为面上顺时针方向）
   */
  updateDrag(drag, angleRad) {
    drag.pivot.rotation[drag.axis] = drag.sign * angleRad;
  }

  /* ─── 拖拽：结束（吸附到最近 90° + 记录历史） ─── */
  /**
   * 鼠标松开时调用，吸附到最近的 90° 位置并拆回场景。
   * @param {object} drag  startDrag 返回的句柄
   * @returns {{ snappedDir: number }}  旋转方向：1 顺 / -1 逆 / 0 取消
   */
  async endDrag(drag) {
    const currentAngle = drag.pivot.rotation[drag.axis];
    const faceAngle = currentAngle / drag.sign;   // 去掉符号得到「面空间」角度

    // 吸附到最近的 90°
    let snapped = Math.round(faceAngle / (Math.PI / 2)) * (Math.PI / 2);

    // 如果不足 30° 则回弹取消
    if (Math.abs(snapped) < Math.PI / 6) {
      snapped = 0;
    }

    const targetAngle = drag.sign * snapped;

    // 短动画平滑吸附 / 回弹
    const startAngle = currentAngle;
    const duration = 70;
    const startTime = performance.now();

    await new Promise(resolve => {
      const tick = () => {
        const elapsed = performance.now() - startTime;
        const t = Math.min(elapsed / duration, 1);
        const eased = easeInOutCubic(t);
        drag.pivot.rotation[drag.axis] = startAngle + (targetAngle - startAngle) * eased;

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          drag.pivot.rotation[drag.axis] = targetAngle;
          this._finalizeDrag(drag);
          resolve();
        }
      };
      tick();
    });

    if (snapped !== 0) {
      const dir = snapped > 0 ? 1 : -1;
      this.moveHistory.push({ face: drag.face, direction: dir });
      return { snappedDir: dir };
    }
    return { snappedDir: 0 };
  }

  /* ─── 便捷方法：一次旋转+记录 ─── */
  async doMove(face, dir = 1) {
    await this.rotateFace(face, dir);
    this.moveHistory.push({ face, direction: dir });
  }

  /* ─── 打乱 ─── */
  /**
   * @param {number} moves  随机步数
   */
  async scramble(moves = 20) {
    if (this.isAnimating) return;

    let last = '';
    for (let i = 0; i < moves; i++) {
      let face;
      do {
        face = FACE_NAMES[Math.floor(Math.random() * FACE_NAMES.length)];
      } while (face === last);
      last = face;

      const dir = Math.random() < 0.5 ? 1 : -1;
      await this.doMove(face, dir);
    }
  }

  /* ─── 还原（反转历史） ─── */
  async solve() {
    if (this.isAnimating || this.moveHistory.length === 0) return;
    const reversed = [...this.moveHistory].reverse();

    for (const m of reversed) {
      await this.rotateFace(m.face, -m.direction);
    }

    this.moveHistory = [];
  }

  /* ─── 获取当前打乱步数 ─── */
  get moveCount() {
    return this.moveHistory.length;
  }

  /* ─── 重置到初始状态 ─── */
  reset() {
    if (this.isAnimating) return;
    // 直接重建 cube
    this.cubelets.forEach(c => {
      this.scene.remove(c);
      c.geometry.dispose();
      if (Array.isArray(c.material)) c.material.forEach(m => m.dispose());
      else c.material.dispose();
    });
    this.cubelets = [];
    this.moveHistory = [];
    this._build();
  }
}

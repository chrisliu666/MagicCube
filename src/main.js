/**
 * main.js — 应用入口
 *
 * 初始化 Three.js 场景、相机、渲染器、OrbitControls，绑定 UI 事件。
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RubiksCube } from './cube.js';

/* ─── DOM refs ─── */
const container = document.getElementById('canvas-container');
const statusEl  = document.getElementById('status');
const moveCountEl = document.getElementById('move-count');
const scrambleBtn  = document.getElementById('btn-scramble');
const solveBtn     = document.getElementById('btn-solve');
const resetBtn     = document.getElementById('btn-reset');
const scrambleCountInput = document.getElementById('scramble-count');

/* ─── 场景 ─── */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf5f0eb);
scene.fog = new THREE.Fog(0xf5f0eb, 10, 20);

/* ─── 相机 ─── */
const camera = new THREE.PerspectiveCamera(
  40,
  container.clientWidth / container.clientHeight,
  0.1,
  20,
);
camera.position.set(4.2, 3.0, 4.8);
camera.lookAt(0, 0, 0);

/* ─── 渲染器 ─── */
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// 标准 sRGB 输出，颜色保持鲜艳
renderer.outputColorSpace = THREE.SRGBColorSpace;
container.appendChild(renderer.domElement);

/* ─── 控制器 ─── */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 3.5;
controls.maxDistance = 12;
controls.target.set(0, 0, 0);
controls.update();

/* ─── 灯光 ─── */
// 环境光（中性白，不偏蓝）
const ambient = new THREE.AmbientLight(0x888888, 0.7);
scene.add(ambient);

// 主光
const mainLight = new THREE.DirectionalLight(0xffffff, 2.5);
mainLight.position.set(5, 8, 6);
mainLight.castShadow = true;
scene.add(mainLight);

// 补光（中性白）
const fillLight = new THREE.DirectionalLight(0xffffff, 0.7);
fillLight.position.set(-4, 1, -3);
scene.add(fillLight);

// 底光
const bottomLight = new THREE.DirectionalLight(0xffffff, 0.4);
bottomLight.position.set(0, -5, 0);
scene.add(bottomLight);

/* ─── 魔方 ─── */
const cube = new RubiksCube(scene, { animSpeedMs: 150 });
updateUI();

/* ─── 窗口调整 ─── */
function onResize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

/* ─── 渲染循环 ─── */
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

/* ─── 更新 UI ─── */
function updateUI() {
  moveCountEl.textContent = cube.moveCount;
  const isAnimating = cube.isAnimating;
  statusEl.textContent = isAnimating ? '动画中…' : '就绪';
  statusEl.className = isAnimating ? 'status-animating' : 'status-ready';
}

// 定期刷新 UI（动画期间）
setInterval(updateUI, 100);

/* ─── 按键绑定 ─── */
const FACE_KEYS = {
  'r': { face: 'R', dir:  1 },
  'R': { face: 'R', dir: -1 },
  'l': { face: 'L', dir:  1 },
  'L': { face: 'L', dir: -1 },
  'u': { face: 'U', dir:  1 },
  'U': { face: 'U', dir: -1 },
  'd': { face: 'D', dir:  1 },
  'D': { face: 'D', dir: -1 },
  'f': { face: 'F', dir:  1 },
  'F': { face: 'F', dir: -1 },
  'b': { face: 'B', dir:  1 },
  'B': { face: 'B', dir: -1 },
};

document.addEventListener('keydown', async (e) => {
  const binding = FACE_KEYS[e.key];
  if (binding) {
    e.preventDefault();
    await cube.doMove(binding.face, binding.dir);
    updateUI();
  }
  if (e.key === 's' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    await onScramble();
  }
  if (e.key === 'z' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    await onSolve();
  }
});

/* ─── UI 按钮事件 ─── */

// 面旋转按钮
document.querySelectorAll('[data-face]').forEach(btn => {
  btn.addEventListener('click', async () => {
    const face = btn.dataset.face;
    const dir  = parseInt(btn.dataset.dir ?? '1', 10);
    await cube.doMove(face, dir);
    updateUI();
  });
});

async function onScramble() {
  const moves = parseInt(scrambleCountInput?.value ?? '20', 10);
  await cube.scramble(moves);
  updateUI();
}

async function onSolve() {
  await cube.solve();
  updateUI();
}

scrambleBtn?.addEventListener('click', onScramble);
solveBtn?.addEventListener('click', onSolve);
resetBtn?.addEventListener('click', () => {
  cube.reset();
  updateUI();
});

/* ─── 高亮蒙版 ─── */
const _overlayMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0,
  depthWrite: false,
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -1,
});
const _overlay = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 3.0), _overlayMat);
_overlay.visible = false;
scene.add(_overlay);

let _lastHoverFace = null;

function _showOverlay(face, opacity) {
  const d = RubiksCube.getFaceDef(face);
  _overlay.rotation.set(0, 0, 0);

  const pos = new THREE.Vector3();
  pos[d.axis] = d.layer * 1.02;
  _overlay.position.copy(pos);

  // 平面朝向法线方向
  const target = new THREE.Vector3();
  target[d.axis] = d.layer * 2;
  _overlay.lookAt(target);

  _overlayMat.opacity = opacity;
  _overlay.visible = true;
}

function _hideOverlay() {
  _overlay.visible = false;
  _lastHoverFace = null;
}

/* ─── 鼠标拖拽旋转面（实时跟随） ─── */
const _rc = new THREE.Raycaster();
const _pt = new THREE.Vector2();

/** @type {{ drag: object, plane: THREE.Plane, axis: string, initAngle: number }|null} */
let _dragState = null;

function _ndc(event) {
  const r = renderer.domElement.getBoundingClientRect();
  _pt.x = ((event.clientX - r.left) / r.width) * 2 - 1;
  _pt.y = -((event.clientY - r.top) / r.height) * 2 + 1;
}

function _faceFromNormal(normal) {
  const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
  if (ax >= ay && ax >= az) return normal.x > 0 ? 'R' : 'L';
  if (ay >= ax && ay >= az) return normal.y > 0 ? 'U' : 'D';
  return normal.z > 0 ? 'F' : 'B';
}

/** 将鼠标射线与平面（过原点垂直于法线）相交，返回 3D 交点 */
function _rayPlaneHit(event, plane) {
  _ndc(event);
  _rc.setFromCamera(_pt, camera);
  const d = plane.normal.dot(_rc.ray.direction);
  if (Math.abs(d) < 0.0001) return null;
  const t = -(plane.normal.dot(_rc.ray.origin) + plane.constant) / d;
  if (t < 0) return null;
  return _rc.ray.origin.clone().add(_rc.ray.direction.clone().multiplyScalar(t));
}

/** 在面的 2D 平面坐标系中计算点的角度（弧度） */
function _angleInFace(axis, point) {
  switch (axis) {
    case 'x': return Math.atan2(point.z, point.y);
    case 'y': return Math.atan2(point.z, point.x);
    case 'z': return Math.atan2(point.y, point.x);
    default:  return 0;
  }
}

/* ─── pointerdown ─── */
renderer.domElement.addEventListener('pointerdown', (event) => {
  if (cube.isAnimating) return;

  _ndc(event);
  _rc.setFromCamera(_pt, camera);
  const hits = _rc.intersectObjects(cube.cubelets, false);
  if (!hits.length) return;

  const hit = hits[0];
  const normal = hit.face.normal.clone();
  normal.transformDirection(hit.object.matrixWorld);
  normal.x = Math.round(normal.x);
  normal.y = Math.round(normal.y);
  normal.z = Math.round(normal.z);
  const face = _faceFromNormal(normal);

  // 开始拖拽（传入蒙版，使其旋转跟随）
  const drag = cube.startDrag(face, _overlay);
  if (!drag) return;

  // 垂直于面法线的平面（过原点）
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, 0, 0));

  // 初始角度（鼠标按下时的角度）
  const start3d = _rayPlaneHit(event, plane) ?? (() => {
    const p = new THREE.Vector3();
    plane.projectPoint(hit.point, p);
    return p;
  })();

  const axis = RubiksCube.getFaceDef(face).axis;
  const initAngle = _angleInFace(axis, start3d);

  _dragState = { drag, plane, axis, initAngle };
  controls.enabled = false;
  renderer.domElement.style.cursor = 'grabbing';
});

/* ─── pointermove ─── */
renderer.domElement.addEventListener('pointermove', (event) => {
  // 拖拽中：实时更新面旋转
  if (_dragState) {
    const cur3d = _rayPlaneHit(event, _dragState.plane);
    if (cur3d) {
      const curAngle = _angleInFace(_dragState.axis, cur3d);
      let delta = curAngle - _dragState.initAngle;
      // 归一化到 [-π, π]
      while (delta > Math.PI)  delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      cube.updateDrag(_dragState.drag, delta);
    }
    renderer.domElement.style.cursor = 'grabbing';
    return;
  }

  // 非拖拽：悬停检测 + 高亮蒙版
  if (cube.isAnimating) {
    _hideOverlay();
    renderer.domElement.style.cursor = 'wait';
    return;
  }
  _ndc(event);
  _rc.setFromCamera(_pt, camera);
  const hits = _rc.intersectObjects(cube.cubelets, false);

  if (hits.length) {
    const hit = hits[0];
    const n = hit.face.normal.clone();
    n.transformDirection(hit.object.matrixWorld);
    n.x = Math.round(n.x);
    n.y = Math.round(n.y);
    n.z = Math.round(n.z);
    const face = _faceFromNormal(n);
    const ax = RubiksCube.getFaceDef(face).axis;

    // 只在鼠标所落小方块正对的面显示蒙版，避免边缘误触
    if (Math.abs(n[ax]) > 0.9) {
      if (face !== _lastHoverFace) {
        _lastHoverFace = face;
        _showOverlay(face, 0.1);
      }
      renderer.domElement.style.cursor = 'grab';
    } else {
      _hideOverlay();
      renderer.domElement.style.cursor = '';
    }
  } else {
    _hideOverlay();
    renderer.domElement.style.cursor = '';
  }
});

/* ─── pointerup ─── */
renderer.domElement.addEventListener('pointerup', async () => {
  if (!_dragState) return;
  const { drag } = _dragState;
  _dragState = null;

  await cube.endDrag(drag, _overlay);
  _hideOverlay();
  controls.enabled = true;
  updateUI();
  renderer.domElement.style.cursor = '';
});

/* ─── pointerleave / pointercancel ─── */
renderer.domElement.addEventListener('pointerleave', () => {
  _hideOverlay();
  if (!_dragState) return;
  const { drag } = _dragState;
  _dragState = null;
  cube.endDrag(drag, _overlay).then(() => {
    _hideOverlay();
    controls.enabled = true;
    updateUI();
    renderer.domElement.style.cursor = '';
  });
});

renderer.domElement.addEventListener('pointercancel', () => {
  _hideOverlay();
  if (!_dragState) return;
  const { drag } = _dragState;
  _dragState = null;
  cube.endDrag(drag, _overlay).then(() => {
    _hideOverlay();
    controls.enabled = true;
    updateUI();
    renderer.domElement.style.cursor = '';
  });
});

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

/* ─── 鼠标拖拽旋转面 ─── */
const _raycaster = new THREE.Raycaster();
const _pointer = new THREE.Vector2();

let _dragState = null; // { face, plane, startPoint, normal, screenX, screenY }

function _ndcFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  _pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  _pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function _faceFromNormal(normal) {
  const ax = Math.abs(normal.x), ay = Math.abs(normal.y), az = Math.abs(normal.z);
  if (ax >= ay && ax >= az) return normal.x > 0 ? 'R' : 'L';
  if (ay >= ax && ay >= az) return normal.y > 0 ? 'U' : 'D';
  return normal.z > 0 ? 'F' : 'B';
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (cube.isAnimating) return;

  _ndcFromEvent(event);
  _raycaster.setFromCamera(_pointer, camera);

  const hits = _raycaster.intersectObjects(cube.cubelets, false);
  if (!hits.length) return;

  const hit = hits[0];
  const normal = hit.face.normal.clone();
  normal.transformDirection(hit.object.matrixWorld);
  normal.x = Math.round(normal.x);
  normal.y = Math.round(normal.y);
  normal.z = Math.round(normal.z);

  const face = _faceFromNormal(normal);

  // 垂直于面法线的平面（过原点）
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, 0, 0));

  const startPoint = new THREE.Vector3();
  plane.projectPoint(hit.point, startPoint);

  _dragState = { face, plane, startPoint, normal, screenX: event.clientX, screenY: event.clientY };
  controls.enabled = false;
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (_dragState) return; // 拖拽中，不改变光标

  if (cube.isAnimating) {
    renderer.domElement.style.cursor = 'wait';
    return;
  }

  _ndcFromEvent(event);
  _raycaster.setFromCamera(_pointer, camera);
  const hits = _raycaster.intersectObjects(cube.cubelets, false);
  renderer.domElement.style.cursor = hits.length ? 'grab' : '';
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (!_dragState) return;

  const dx = event.clientX - _dragState.screenX;
  const dy = event.clientY - _dragState.screenY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 25) {
    // 将当前鼠标投影到面平面上，确定拖拽方向
    _ndcFromEvent(event);
    _raycaster.setFromCamera(_pointer, camera);

    const ray = _raycaster.ray;
    const plane = _dragState.plane;
    const denom = plane.normal.dot(ray.direction);

    if (Math.abs(denom) > 0.0001) {
      const t = -(plane.normal.dot(ray.origin) + plane.constant) / denom;
      if (t > 0) {
        const endPoint = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));

        // v1×v2 与法线点积 → 判断顺时针/逆时针
        const v1 = _dragState.startPoint.clone().normalize();
        const v2 = endPoint.clone().normalize();
        const cross = new THREE.Vector3().crossVectors(v1, v2);
        const dot = cross.dot(_dragState.normal);

        const dir = dot < 0 ? 1 : -1;
        cube.doMove(_dragState.face, dir).then(updateUI);
      }
    }
  }

  _dragState = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = '';
});

renderer.domElement.addEventListener('pointerleave', () => {
  if (_dragState) {
    _dragState = null;
    controls.enabled = true;
    renderer.domElement.style.cursor = '';
  }
});

renderer.domElement.addEventListener('pointercancel', () => {
  _dragState = null;
  controls.enabled = true;
  renderer.domElement.style.cursor = '';
});

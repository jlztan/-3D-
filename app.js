// 关键说明：坐标与布局约定与相机默认视角
// - 坐标轴方向：Three.js 标准坐标，+X 指向世界右侧、+Y 向上、+Z 向前。
//   为了让默认视角下 AA 在左侧，机柜沿 X 向右使用负值排布（AA x≈0，越往右 x 越负）。
// - 列（排）沿 Z 轴：A/B 为前两排，C/D 为后两排；前后两组之间插入 INTER_GROUP_GAP_Z 间隙。
// - 相机默认距 A 排前方的固定距离（CAMERA_FRONT_OFFSET），切换楼层时保持正对 A 排、水平视角一致。
// - 人物固定放在 B/C 中间的 Z 位置，X 略偏左，Y 高于机柜高度的一半。
// Basic 3D config
const U_HEIGHT = 0.2; // unit height per U
const RACK_U = 42;
const RACK_WIDTH = 1.0; // rack width
const RACK_DEPTH = 1.0; // rack depth
const RACK_MARGIN = 0.15; // gap around devices inside rack

const COL_SPACING = 3.0;
const CAB_SPACING = 2.2;
const FLOOR_SPACING_Y = 10.0; // vertical spacing between floors
// Default distance of camera in front of the first row
const CAMERA_FRONT_OFFSET = 17.0;
// Extra front–back gap inserted between front two rows (A,B) and back two rows (C,D)
const INTER_GROUP_GAP_Z = 6.0;
// Margin to place world origin further outside AA's left-front corner
const ORIGIN_MARGIN = 0.6;

const TYPE_COLORS = {
  'IDS': 0x2e86de,
  'IPS': 0x1abc9c,
  '防火墙': 0xe74c3c,
  'WAF': 0x9b59b6,
  'VPN网关': 0xf1c40f,
  '日志审计': 0x34495e,
  '堡垒机': 0xe67e22,
  '网闸': 0x16a085,
};

// Global materials for shell with enhanced face differentiation
const MATTE_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9, metalness: 0.05, side: THREE.DoubleSide });
const GLASS_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.18, depthWrite: false });

// Distinct materials for each face to enhance depth
const MATTE_LEFT = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.95, metalness: 0.02, side: THREE.DoubleSide }); // Darker left
const MATTE_RIGHT = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85, metalness: 0.08, side: THREE.DoubleSide }); // Lighter right
const MATTE_TOP = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8, metalness: 0.12, side: THREE.DoubleSide }); // Brightest top
const MATTE_BOTTOM = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.92, metalness: 0.04, side: THREE.DoubleSide }); // Medium bottom
const MATTE_BACK = new THREE.MeshStandardMaterial({ color: 0x0f1419, roughness: 0.98, metalness: 0.01, side: THREE.DoubleSide }); // Darkest back

const container = document.getElementById('canvas-container');
const toolbar = document.getElementById('toolbar');
const hoverInfo = document.getElementById('hover-info');
const floorSelectorEl = document.getElementById('floor-selector');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

// Ensure canvas sits below the toolbar regardless of its dynamic height
function updateCanvasTopAndSize() {
  const h = toolbar ? toolbar.offsetHeight : 42;
  container.style.top = `${h}px`;
  renderer.setSize(container.clientWidth, container.clientHeight);
  if (typeof camera !== 'undefined') {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
  }
}
// Set initial top before camera is created
container.style.top = `${toolbar ? toolbar.offsetHeight : 42}px`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1222);

const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
camera.position.set(10, 12, 20);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = true;
controls.enableZoom = true;
controls.target.set(8, 6, 8);

// Now that camera exists, ensure canvas size and aspect are correct
updateCanvasTopAndSize();

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.45));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.75);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);
// Hemisphere light to add sky/ground shading for better volume
const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1f2937, 0.55);
scene.add(hemiLight);
// Soft rim light to accent silhouettes without wireframe
const rimLight = new THREE.DirectionalLight(0xffffff, 0.25);
rimLight.position.set(-18, 18, -22);
scene.add(rimLight);

// Grid floor helper per floor
function addFloorGrid(y, size = 50, divisions = 50, color = 0x334155) {
  const grid = new THREE.GridHelper(size, divisions, color, color);
  grid.position.y = y;
  grid.material.opacity = 0.35;
  grid.material.transparent = true;
  scene.add(grid);
  return grid;
}

// Create rack frame and U scale
function createRackGroup() {
  const rackGroup = new THREE.Group();
  const height = RACK_U * U_HEIGHT;

  // Removed outer wireframe to avoid visible yellow lines when highlighted

  // Solid shell with distinct materials for each face to enhance depth
  const shellGeom = new THREE.BoxGeometry(RACK_WIDTH, height, RACK_DEPTH);
  // BoxGeometry material groups order: +X, -X, +Y, -Y, +Z (front), -Z (back)
  // Use distinct materials for each face to enhance 3D effect
  const shellMats = [MATTE_RIGHT, MATTE_LEFT, MATTE_TOP, MATTE_BOTTOM, GLASS_MATERIAL, MATTE_BACK];
  const shell = new THREE.Mesh(shellGeom, shellMats);
  shell.position.y = height / 2;
  rackGroup.add(shell);

  // Removed U-scale plane to eliminate bottom tick marks

  return rackGroup;
}

// Ensure the camera-facing side is glass and the opposite is opaque
function updateCabinetFrontBackMaterials() {
  const group = floorGroups.get(selectedFloor);
  if (!group) return;
  const tmp = new THREE.Vector3();
  group.traverse((obj) => {
    if (obj.type === 'Mesh' && Array.isArray(obj.material) && obj.material.length === 6 && obj.geometry && obj.geometry.type === 'BoxGeometry') {
      obj.getWorldPosition(tmp);
      const cameraInFront = camera.position.z > tmp.z; // camera on +Z side of this mesh
      // Index 4 is +Z (front), 5 is -Z (back)
      if (cameraInFront) {
        obj.material[4] = GLASS_MATERIAL; // face toward camera
        obj.material[5] = MATTE_MATERIAL; // opposite
      } else {
        obj.material[4] = MATTE_MATERIAL;
        obj.material[5] = GLASS_MATERIAL;
      }
    }
  });
}

function makeUScaleTexture(U = 42) {
  const h = 800; // canvas height
  const w = 120; // canvas width
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, w, h);

  // draw ticks and numbers every 1U, label every 5U
  ctx.strokeStyle = '#94a3b8';
  ctx.fillStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.font = '12px Segoe UI, Arial';

  for (let u = 1; u <= U; u++) {
    const y = h - (u / U) * h; // bottom is 1U
    const tickLen = (u % 5 === 0) ? 20 : 10;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(tickLen, y);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// Device box with label
function createDeviceBox(type, uStart, uEnd) {
  const uLen = uEnd - uStart + 1;
  const height = uLen * U_HEIGHT - RACK_MARGIN * 0.6;
  const geom = new THREE.BoxGeometry(RACK_WIDTH - RACK_MARGIN, height, RACK_DEPTH - RACK_MARGIN);
  const color = TYPE_COLORS[type] ?? 0x999999;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1 });
  const box = new THREE.Mesh(geom, mat);
  box.position.y = (uStart - 1) * U_HEIGHT + height / 2 + RACK_MARGIN * 0.2;

  // Device front label removed to avoid visual noise and flicker
  box.userData = { type, uStart, uEnd };
  return box;
}

function makeFrontLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px Segoe UI, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = String(text).split(/\n/);
  lines.forEach((line, i) => {
    ctx.fillText(line, c.width / 2, c.height / 2 + (i - (lines.length - 1)/2) * 22);
  });
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.2, 0.6, 1);
  return spr;
}

// Rack registry grouped by floor
const racks = new Map();
const floorGroups = new Map();
const floorGrids = new Map();
const floorAxes = new Map();
let selectedFloor = 1;
const visibleColumns = new Set(['A','B','C','D']);
let reverseRowOrder = false; // 是否从右到左显示每排机柜
let sceneCharacter = null; // 全局唯一的虚拟人物模型
let characterLoading = false; // 加载中避免重复加载
// Column labels per floor: Map<floor, Map<col, THREE.Sprite>>
const floorColumnLabels = new Map();
// Top labels per rack: Map<rackKey, THREE.Sprite>
const rackTopLabels = new Map();

function rackKey(floor, col, cab) { return `${floor}-${col}-${cab}`; }
function ensureFloorGroup(floor) {
  if (floorGroups.has(floor)) return floorGroups.get(floor);
  const g = new THREE.Group();
  g.name = `floor-${floor}`;
  const floorOffsetY = (floor - 1) * FLOOR_SPACING_Y;
  g.position.set(0, floorOffsetY, 0);
  scene.add(g);
  floorGroups.set(floor, g);
  return g;
}

function addAxesRulerForFloor(floor) {
  if (floorAxes.has(floor)) return floorAxes.get(floor);
  const group = ensureFloorGroup(floor);
  const axesGroup = new THREE.Group();
  axesGroup.name = `axes-${floor}`;
  const helper = new THREE.AxesHelper(3.0);
  axesGroup.add(helper);
  const labelX = makeColumnLabel('X');
  labelX.position.set(3.4, 0.3, 0);
  axesGroup.add(labelX);
  const labelZ = makeColumnLabel('Z');
  labelZ.position.set(0, 0.3, 3.4);
  axesGroup.add(labelZ);
  axesGroup.position.set(0, 0, 0);
  // 仅镜像坐标轴辅助的 X 显示（红轴朝左），便于视觉参考；
  // 世界坐标仍是 Three.js 标准：+X 右侧、+Y 向上、+Z 向前。
  axesGroup.scale.x = -1;
  group.add(axesGroup);
  floorAxes.set(floor, axesGroup);
  return axesGroup;
}

function ensureRack(floor, col, cab) {
  // 关键：机柜位置计算（核心布局逻辑）
  // - X 轴依据机柜字母（A/B/C...）等距排布；Three.js 中 +X 指向右侧，
  //   本场景将向右使用负 X，使 AA 在最左（x≈0，越往右 x 越负）。
  // - Z 轴依据列字母（A/B/C/D）前后排布；C/D 前插入组间隙（INTER_GROUP_GAP_Z），形成前后两组。
  const key = rackKey(floor, col, cab);
  if (racks.has(key)) return racks.get(key);
  const group = ensureFloorGroup(floor);

  const rack = createRackGroup();
  // Map cab letter to X (left→right), col letter to Z (front→back)
  // 行内向右采用负 X：AA 在 x≈0，后续机柜 x = -idx * CAB_SPACING（越往右越负）
  const xOffset = - (cab.charCodeAt(0) - 'A'.charCodeAt(0)) * CAB_SPACING;
  const rowIdx = (col.charCodeAt(0) - 'A'.charCodeAt(0));
  const extraGapZ = rowIdx >= 2 ? INTER_GROUP_GAP_Z : 0; // add gap before C、D rows
  const zOffset = rowIdx * COL_SPACING + extraGapZ;
  rack.position.set(xOffset, 0, zOffset);
  group.add(rack);
  racks.set(key, rack);
  // Update column label position to reflect new extent
  createOrUpdateColumnLabel(floor, col);
  return rack;
}

function setSelectedFloor(floor) {
  // 关键：切换楼层时的视角控制（始终正对 A 排）
  // - 保持与默认视角一致：取 A 排的 X 居中与 Z 中心作为目标点；相机位于 A 排前方固定距离。
  // - 仅调整垂直高度到目标楼层（保持相机与目标点的相对高度 deltaY），避免水平视角飘移。
  selectedFloor = floor;
  for (let f = 1; f <= 5; f++) {
    const grp = floorGroups.get(f);
    if (grp) grp.visible = (f === floor);
    const grid = floorGrids.get(f);
    if (grid) grid.visible = (f === floor);
    const axes = floorAxes.get(f);
    if (axes) axes.visible = (f === floor);
  }
  const yCenter = (floor - 1) * FLOOR_SPACING_Y + 6;
  // 重新对准 A 排：X 居中到 A 排，Z 指向 A 排中心，保持与默认视角一致
  const deltaY = camera.position.y - controls.target.y; // 保持相机与目标点的相对高度
  normalizeRowXPositions();
  adjustFloorOriginToBottomLeft(floor);
  const centerX = computeVisibleColumnsCenterX();
  const frontZ = computeFrontRowZCenter(floor); // 优先使用 A 排
  // 锁定对准 A 排
  controls.target.set(centerX, yCenter, frontZ);
  camera.position.set(centerX, yCenter + deltaY, frontZ - CAMERA_FRONT_OFFSET);
  camera.lookAt(controls.target);
  // 确保单个人物跟随当前楼层
  placeOrUpdateCharacter(floor);
  // Ensure camera-facing side is transparent glass and opposite is opaque
  updateCabinetFrontBackMaterials();
  document.querySelectorAll('.floor-btn').forEach(btn => {
    const f = parseInt(btn.dataset.floor, 10);
    btn.classList.toggle('active', f === floor);
  });
  // Apply column filter when floor changes
  applyColumnFilter();
  updateColumnLabelsVisibility();
}

// Hover raycaster
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let hoveredObject = null;
let selectedCabinet = null;

// Handle mouse events for hover effects and selection
function onMouseMove(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  const device = intersects.find(x => x.object?.userData?.uStart);
  
  if (device) {
    const d = device.object.userData;
    const p = device.object.getWorldPosition(new THREE.Vector3());
    const screen = p.clone().project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    const x = (screen.x * 0.5 + 0.5) * rect.width + rect.left;
    const y = (-screen.y * 0.5 + 0.5) * rect.height + rect.top;
    hoverInfo.style.left = `${x + 12}px`;
    hoverInfo.style.top = `${y + 12}px`;
    hoverInfo.innerHTML = `类型：${d.type}<br>U：${d.uStart}–${d.uEnd}`;
    hoverInfo.classList.remove('hidden');
    
    // Hover effect
    if (hoveredObject !== device.object) {
      if (hoveredObject && hoveredObject.material) {
        hoveredObject.material.emissive.setHex(0x000000);
      }
      hoveredObject = device.object;
      if (hoveredObject.material) {
        hoveredObject.material.emissive.setHex(0x444444);
      }
    }
  } else {
    hoverInfo.classList.add('hidden');
    if (hoveredObject && hoveredObject.material) {
      hoveredObject.material.emissive.setHex(0x000000);
      hoveredObject = null;
    }
  }
}

// Handle click events for cabinet selection
function onMouseClick(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(scene.children, true);
  
  if (intersects.length > 0) {
    const intersected = intersects[0].object;
    
    // Find rack object by traversing up the hierarchy
    let rackObj = intersected;
    while (rackObj && rackObj.parent && rackObj.parent.type !== 'Scene') {
      rackObj = rackObj.parent;
    }
    
    if (rackObj) {
      highlightCabinet(rackObj);
    }
  }
}

// Highlight selected cabinet
function highlightCabinet(rackObj) {
  // Clear previous selection
  if (selectedCabinet) {
    resetCabinetHighlight();
  }
  
  selectedCabinet = rackObj;
  
  // Apply highlight to selected cabinet
  const currentFloorGroup = floorGroups.get(selectedFloor);
  if (!currentFloorGroup) return;
  
  currentFloorGroup.traverse((child) => {
    if (child === rackObj) {
      // Highlight this cabinet's frame
      child.traverse((subChild) => {
        if (subChild.material && subChild.material.type === 'LineBasicMaterial') {
          subChild.material.color.setHex(0xffff00); // Yellow highlight
        }
      });
    } else if (child.type === 'Group' && child !== rackObj) {
      // Dim other cabinets
      child.traverse((subChild) => {
        if (subChild.material && subChild.material.type === 'LineBasicMaterial') {
          subChild.material.opacity = 0.3;
          subChild.material.transparent = true;
        }
      });
    }
  });
}

// Reset cabinet highlight
function resetCabinetHighlight() {
  const currentFloorGroup = floorGroups.get(selectedFloor);
  if (!currentFloorGroup) return;
  
  currentFloorGroup.traverse((child) => {
    if (child.material && child.material.type === 'LineBasicMaterial') {
      child.material.color.setHex(0x9aa1b0); // Reset to original color
      child.material.opacity = 1.0;
      child.material.transparent = false;
    }
  });
  
  selectedCabinet = null;
}

renderer.domElement.addEventListener('mousemove', onMouseMove);
renderer.domElement.addEventListener('click', onMouseClick);

renderer.domElement.addEventListener('mouseleave', () => {
  hoverInfo.classList.add('hidden');
  if (hoveredObject && hoveredObject.material) {
    hoveredObject.material.emissive.setHex(0x000000);
    hoveredObject = null;
  }
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  // Update cabinet materials to match current camera orientation
  updateCabinetFrontBackMaterials();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  updateCanvasTopAndSize();
  // Keep front/back materials consistent on resize
  updateCabinetFrontBackMaterials();
});

// Add grid for each floor and store references
for (let floor = 1; floor <= 5; floor++) {
  const grid = addFloorGrid((floor - 1) * FLOOR_SPACING_Y);
  floorGrids.set(floor, grid);
  addAxesRulerForFloor(floor);
}

// Load CSV and build scene
function loadCSVAndBuild() {
  // 关键：数据加载与场景搭建
  // - 解析 CSV 并创建机柜与设备。
  // - 机柜顶部标签通过机房字段生成前缀（如 501），缺失时回退为楼层前缀（如 5F）。
  return new Promise((resolve, reject) => {
    Papa.parse('机房设备测试用例_v3.csv', {
      download: true,
      header: true,
      worker: false,
      skipEmptyLines: true,
      encoding: 'utf-8',
      complete: (res) => {
        try {
          const rows = res.data.filter(r => !!r && r['楼层'] && r['列'] && r['机柜']);
          rows.forEach(r => {
            const floor = parseInt(r['楼层']);
            const col = String(r['列']).trim();
            const cab = String(r['机柜']).trim();
            const uStart = parseInt(r['U起']);
            const uEnd = parseInt(r['U止']);
          const type = String(r['设备类型']).trim();
          // 方案A：完全以 CSV 为准，不做楼层或机房映射
          let room = String(r['机房'] || '').trim();

          const rack = ensureRack(floor, col, cab);
          const dev = createDeviceBox(type, uStart, uEnd);
          rack.add(dev);
          // Create or update cabinet top label, e.g., 901-AA
          createOrUpdateRackTopLabel(floor, col, cab, room, rack);
        });
        // Normalize X positions so that within each row (col) on a floor,
        // the smallest cabinet letter is at the left (most negative X)
        normalizeRowXPositions();
        resolve(rows);
      } catch (e) {
        reject(e);
      }
      },
      error: (err) => reject(err)
    });
  });
}

// Reposition racks along X so that left-to-right shows AA, AB, AC...
function normalizeRowXPositions() {
  // 关键：行内 X 对齐与缺失机柜补齐
  // - 按机柜字母顺序等距对齐，可切换从右到左显示（reverseRowOrder）。
  // - 为保持行连续性，自动补齐缺失机柜；补齐时若机房为空，顶部标签会使用楼层 F 前缀。
  const perRowMax = new Map(); // key: `${floor}-${col}` -> max cab index
  const rowSamples = new Map(); // key: `${floor}-${col}` -> { sampleCab, hasTwo }
  const rowExistingIdxs = new Map(); // key: `${floor}-${col}` -> Set(idx)
  const floorMaxIdx = new Map(); // key: floor -> global max idx across rows

  // First pass: gather max index, sample name pattern, and existing indices
  racks.forEach((rack, key) => {
    const [floorStr, col, cab] = key.split('-');
    const f = parseInt(floorStr, 10);
    const idx = cab.length >= 2
      ? cab.charCodeAt(1) - 'A'.charCodeAt(0)
      : cab.charCodeAt(0) - 'A'.charCodeAt(0);
    const k = `${f}-${col}`;
    const cur = perRowMax.get(k);
    if (cur === undefined || idx > cur) perRowMax.set(k, idx);
    if (!rowSamples.has(k)) rowSamples.set(k, { sampleCab: cab, hasTwo: cab.length >= 2 });
    if (!rowExistingIdxs.has(k)) rowExistingIdxs.set(k, new Set());
    rowExistingIdxs.get(k).add(idx);
    const curF = floorMaxIdx.get(f);
    if (curF === undefined || idx > curF) floorMaxIdx.set(f, idx);
  });

  // Second pass: ensure missing racks are created to fill the row
  perRowMax.forEach((maxIdx, k) => {
    const sample = rowSamples.get(k);
    if (!sample) return;
    const [floorStr, col] = k.split('-');
    const f = parseInt(floorStr, 10);
    const existing = rowExistingIdxs.get(k) || new Set();
    for (let idx = 0; idx <= maxIdx; idx++) {
      if (!existing.has(idx)) {
        const letter = String.fromCharCode('A'.charCodeAt(0) + idx);
        const cab = sample.hasTwo ? `${sample.sampleCab[0]}${letter}` : letter;
        const rack = ensureRack(f, col, cab);
        // Optional: add a top label for empty racks with default room code
        createOrUpdateRackTopLabel(f, col, cab, '', rack);
        existing.add(idx);
      }
    }
  });

  // Final pass: position all racks with even spacing (left align, AA at x=0)
  racks.forEach((rack, key) => {
    const [floorStr, col, cab] = key.split('-');
    const f = parseInt(floorStr, 10);
    const k = `${f}-${col}`;
    const maxIdx = perRowMax.get(k);
    if (maxIdx === undefined) return;
    const idx = cab.length >= 2
      ? cab.charCodeAt(1) - 'A'.charCodeAt(0)
      : cab.charCodeAt(0) - 'A'.charCodeAt(0);
    // 右向使用负 X：AA 在 x=0；启用反序时从右到左显示
    const useIdx = reverseRowOrder ? (maxIdx - idx) : idx;
    rack.position.x = -useIdx * CAB_SPACING;
  });
  // 排序变化后更新当前层人物X位置
  placeOrUpdateCharacter(selectedFloor);
}

// Initialize floor selector
function initFloorSelector() {
  const buttons = document.querySelectorAll('.floor-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class from all buttons
      buttons.forEach(b => b.classList.remove('active'));
      // Add active class to clicked button
      btn.classList.add('active');
      
      const floor = parseInt(btn.dataset.floor);
      setSelectedFloor(floor);
    });
  });
}


// UI: floor selector click handlers
  if (floorSelectorEl) {
    initFloorSelector();
    initColumnSelector();
    initRowOrderControl();
  }

// Initially show only selected floor
setSelectedFloor(selectedFloor);

loadCSVAndBuild().then(() => {
  setSelectedFloor(selectedFloor);
  initFloorSelector();
  initColumnSelector();
  buildColumnLabelsForAllFloors();
  animate();
  // 仅在当前选中楼层放置/更新单个人物
  placeOrUpdateCharacter(selectedFloor);
}).catch(err => {
  console.error('CSV加载失败', err);
});
function computeVisibleColumnsCenterX() {
  // 关键：相机目标的 X 居中逻辑
  // - 若存在 A 排，优先基于 A 排的 X 范围居中；否则基于当前可见列的范围居中。
  // Prefer centering to the A row's X extent if present
  let hasARow = false;
  let minX = Infinity, maxX = -Infinity;
  racks.forEach((rack, key) => {
    const [floorStr, col] = key.split('-');
    const f = parseInt(floorStr, 10);
    if (f === selectedFloor && col === 'A') {
      hasARow = true;
    }
  });
  racks.forEach((rack, key) => {
    const [floorStr, col] = key.split('-');
    const f = parseInt(floorStr, 10);
    if (f === selectedFloor) {
      // If A row exists, only use A row for centering; otherwise use visible columns
      if ((hasARow && col === 'A') || (!hasARow && (visibleColumns.size === 0 || visibleColumns.has(col)))) {
        const x = rack.position.x;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  });
  if (!isFinite(minX) || !isFinite(maxX)) return 0;
  const groupOffsetX = (floorGroups.get(selectedFloor)?.position.x || 0);
  return (minX + maxX) / 2 + groupOffsetX;
}

function applyColumnFilter() {
  racks.forEach((rack, key) => {
    const [floorStr, col, cab] = key.split('-');
    const floor = parseInt(floorStr, 10);
    if (floor === selectedFloor) {
      rack.visible = visibleColumns.has(col);
    } else {
      // Non-selected floors remain hidden by floorGroups visibility
      rack.visible = false;
    }
  });
  // Ensure left alignment applied after visibility changes
  normalizeRowXPositions();
  // Do NOT recenter camera or target on column toggle; preserve current view
  // Ensure the camera-facing side remains glass after filtering and recentering
  updateCabinetFrontBackMaterials();
  updateColumnLabelsVisibility();
}

function initColumnSelector() {
  const container = document.getElementById('column-selector');
  if (!container) return;
  const checkboxes = container.querySelectorAll('.col-chk');
  checkboxes.forEach(chk => {
    chk.addEventListener('change', () => {
      const col = chk.dataset.col;
      if (chk.checked) visibleColumns.add(col); else visibleColumns.delete(col);
      applyColumnFilter();
    });
  });
  const selectAllBtn = document.getElementById('colSelectAll');
  const clearAllBtn = document.getElementById('colClearAll');
  if (selectAllBtn) selectAllBtn.addEventListener('click', () => {
    ['A','B','C','D'].forEach(c => visibleColumns.add(c));
    checkboxes.forEach(chk => { chk.checked = true; });
    applyColumnFilter();
  });
  if (clearAllBtn) clearAllBtn.addEventListener('click', () => {
    visibleColumns.clear();
    checkboxes.forEach(chk => { chk.checked = false; });
    applyColumnFilter();
  });
}

// 初始化机柜顺序切换控件
function initRowOrderControl() {
  const chk = document.getElementById('reverse-row-order');
  if (!chk) return;
  chk.checked = reverseRowOrder;
  chk.addEventListener('change', () => {
    reverseRowOrder = chk.checked;
    normalizeRowXPositions();
    buildColumnLabelsForAllFloors();
  });
}

// Compute the Z center of the front-most row for a floor,
// considering only currently visible columns.
function computeFrontRowZCenter(floor) {
  // 关键：相机目标的 Z 对准逻辑
  // - 优先对准 A 排的 Z 中心；若 A 不存在，则取当前可见列中最前的排作为对准目标。
  // Prefer the 'A' row explicitly if present
  let zA = null;
  racks.forEach((rack, key) => {
    const [floorStr, col] = key.split('-');
    const f = parseInt(floorStr, 10);
    if (f === floor && col === 'A') {
      zA = rack.position.z;
    }
  });
  if (zA !== null) {
    const groupOffsetZ = (floorGroups.get(floor)?.position.z || 0);
    return zA + groupOffsetZ;
  }
  // Otherwise, compute front-most among visible columns
  let minZ = Infinity;
  racks.forEach((rack, key) => {
    const [floorStr, col] = key.split('-');
    const f = parseInt(floorStr, 10);
    if (f === floor) {
      if (visibleColumns.size === 0 || visibleColumns.has(col)) {
        if (rack.position.z < minZ) minZ = rack.position.z;
      }
    }
  });
  if (!isFinite(minZ)) return 0;
  const groupOffsetZ = (floorGroups.get(floor)?.position.z || 0);
  return minZ + groupOffsetZ;
}

// 静态计算 B 与 C 两排之间的Z轴中点（不依赖是否有机柜存在）
function computeMiddleGapZ(floor) {
  // 关键：人物 Z 定位
  // - 静态计算 B 与 C 两排之间的中点作为人物 Z 位置；不依赖机柜是否存在。
  const groupOffsetZ = (floorGroups.get(floor)?.position.z || 0);
  const rowIdxB = 'B'.charCodeAt(0) - 'A'.charCodeAt(0);
  const rowIdxC = 'C'.charCodeAt(0) - 'A'.charCodeAt(0);
  const zBLocal = rowIdxB * COL_SPACING; // B 行无额外间隙
  const zCLocal = rowIdxC * COL_SPACING + INTER_GROUP_GAP_Z; // C 行含组间隙
  const zMidLocal = (zBLocal + zCLocal) / 2;
  return groupOffsetZ + zMidLocal;
}

// 计算该楼层的最左侧 X：由于行内 x 通常为非正值（AA 为 0，向右为负），
// 左侧通常对应当前行的 x 最大值（接近 0）。
function computeFloorLeftmostX(floor) {
  let maxX = -Infinity;
  racks.forEach((rack, key) => {
    const [floorStr] = key.split('-');
    const f = parseInt(floorStr, 10);
    if (f === floor) {
      if (rack.position.x > maxX) maxX = rack.position.x;
    }
  });
  if (!isFinite(maxX)) maxX = 0;
  const groupOffsetX = (floorGroups.get(floor)?.position.x || 0);
  // 人物略偏左于最左机柜外缘
  return maxX + groupOffsetX + (RACK_WIDTH / 2 + 0.6);
}

// 在指定楼层放置或更新虚拟人物位置
function placeOrUpdateCharacter(floor) {
  // 关键：人物放置与更新
  // - X 固定在左侧偏移，Z 固定在 B/C 中点，Y 为机柜高度的 60%。
  // - 缩放至 2.2，并绕 Y 轴旋转 180°（面向 -X）。
  const group = ensureFloorGroup(floor);
  // 固定 X（局部坐标），不随机柜左右顺序变化
  const targetXLocal = RACK_WIDTH / 2 + 1.2; // 更靠左，稍微远离机柜
  // Z 取 B/C 中点（局部坐标，静态计算）
  const rowIdxB = 'B'.charCodeAt(0) - 'A'.charCodeAt(0);
  const rowIdxC = 'C'.charCodeAt(0) - 'A'.charCodeAt(0);
  const zBLocal = rowIdxB * COL_SPACING;
  const zCLocal = rowIdxC * COL_SPACING + INTER_GROUP_GAP_Z;
  const targetZLocal = (zBLocal + zCLocal) / 2;
  const targetYLocal = RACK_U * U_HEIGHT * 0.6; // 高于机柜高度的一半

  // 如果已加载过，直接移动并保证挂载到当前楼层组
  if (sceneCharacter) {
    if (sceneCharacter.parent !== group) {
      sceneCharacter.parent?.remove(sceneCharacter);
      group.add(sceneCharacter);
    }
    // 放大模型（更新路径也应用新尺寸）
    sceneCharacter.scale.set(2.2, 2.2, 2.2);
    sceneCharacter.position.set(targetXLocal, targetYLocal, targetZLocal);
    // 旋转 180°（绕 Y 轴），面向 -X
    sceneCharacter.rotation.y = -Math.PI / 2;
    return;
  }
  // 防止重复触发加载
  if (characterLoading) return;
  characterLoading = true;
  try {
    const loader = new THREE.GLTFLoader();
    loader.load('./model/model.gltf', (gltf) => {
      const character = gltf.scene || gltf.scenes?.[0];
      if (!character) { characterLoading = false; return; }
      sceneCharacter = character;
      // 放大模型
      sceneCharacter.scale.set(2.2, 2.2, 2.2);
      sceneCharacter.position.set(targetXLocal, targetYLocal, targetZLocal);
      // 旋转 180°（绕 Y 轴），面向 -X
      sceneCharacter.rotation.y = -Math.PI / 2;
      // 修正材质以避免透明排序导致的穿模问题（例如从正面看到后方辫子）
      try {
        sceneCharacter.traverse(obj => {
          if (obj.isMesh) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(m => {
              if (!m) return;
              // 强化深度写入与测试，避免后面物体透过前面可见
              m.depthWrite = true;
              m.depthTest = true;
              m.side = THREE.FrontSide;
              // 对有透明的材质使用 alphaTest（遮罩）提高排序稳定性
              if (m.transparent) {
                m.alphaTest = 0.5; // 根据贴图透明度裁剪
                m.transparent = true; // 保留透明以支持贴图
              } else {
                m.alphaTest = 0.0;
              }
              m.needsUpdate = true;
            });
          }
        });
      } catch (matErr) {
        console.warn('调整人物材质时出错:', matErr);
      }
      group.add(sceneCharacter);
      characterLoading = false;
    }, undefined, (err) => {
      console.error('GLTF加载失败:', err);
      characterLoading = false;
    });
  } catch (e) {
    console.error('初始化GLTFLoader失败:', e);
    characterLoading = false;
  }
}

// Anchor the selected floor's world origin to its left-front corner (near A排AA)
function adjustFloorOriginToBottomLeft(floor) {
  // 关键：楼层组原点锚定
  // - 将当前楼层组的世界原点锚定到 A 排 AA 的左前角之外，方便统一的相机与标签定位。
  // - 同步更新坐标轴辅助的位置，使其显示在世界原点。
  const group = floorGroups.get(floor);
  if (!group) return;
  let maxX = -Infinity, minZ = Infinity;
  racks.forEach((rack, key) => {
    const [floorStr] = key.split('-');
    const f = parseInt(floorStr, 10);
    if (f === floor) {
      const x = rack.position.x;
      const z = rack.position.z;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
    }
  });
  if (!isFinite(maxX)) maxX = 0;
  if (!isFinite(minZ)) minZ = 0;
  // Place origin just outside AA rack: left of its left face and in front of its front face
  const leftOuterX = maxX + RACK_WIDTH / 2;
  const frontOuterZ = minZ - RACK_DEPTH / 2;
  group.position.x = -(leftOuterX + ORIGIN_MARGIN);
  group.position.z = -(frontOuterZ - ORIGIN_MARGIN);
  const axes = floorAxes.get(floor);
  // Place axes at world origin (compensate group translation)
  if (axes) axes.position.set(-group.position.x, 0, -group.position.z);
}

// Helpers to build per-cabinet top labels
function makeCabinetTopLabel(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(15,23,42,0.75)';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#e5e7eb';
  ctx.font = '28px Segoe UI, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text), c.width/2, c.height/2);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.6, 0.6, 1);
  return spr;
}

function extractRoomCode(room, floor) {
  // 关键：机柜顶部标签前缀生成
  // - 优先解析“机房”字段中的数字（如 501机房 → 501），用于标签前缀。
  // - 若“机房”为空或无数字，则回退使用楼层前缀（如 5F）。
  const m = String(room || '').match(/\d+/);
  if (m) return m[0];
  // Fallback to floor-based prefix
  return `${floor}F`;
}

function createOrUpdateRackTopLabel(floor, col, cab, room, rack) {
  // 关键：顶部标签文本与位置
  // - 文本格式为：前缀-列机柜（如 501-AA、5F-AA）。
  // - 标签放置在机柜顶部稍上方。
  const key = rackKey(floor, col, cab);
  let spr = rackTopLabels.get(key);
  const code = extractRoomCode(room, floor);
  const text = `${code}-${col}${cab}`;
  if (!spr) {
    spr = makeCabinetTopLabel(text);
    rack.add(spr);
    rackTopLabels.set(key, spr);
  } else {
    // Update texture if text changed
    const c = document.createElement('canvas');
    c.width = 256; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(15,23,42,0.75)';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.strokeRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#e5e7eb';
    ctx.font = '28px Segoe UI, Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(text), c.width/2, c.height/2);
    spr.material.map = new THREE.CanvasTexture(c);
    spr.material.needsUpdate = true;
  }
  // Position above the rack top
  const height = RACK_U * U_HEIGHT;
  spr.position.set(0, height + 0.4, 0);
}

// Create a simple column label sprite
function makeColumnLabel(text) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(15,23,42,0.75)'; // slate-900 translucent
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#e5e7eb'; // gray-200
  ctx.font = '28px Segoe UI, Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text), c.width/2, c.height/2);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.2, 0.6, 1);
  return spr;
}

function getColumnZExtent(floor, col) {
  let minZ = Infinity, maxZ = -Infinity;
  racks.forEach((rack, key) => {
    const [floorStr, c, cab] = key.split('-');
    const f = parseInt(floorStr, 10);
    if (f === floor && c === col) {
      const z = rack.position.z;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  });
  if (!isFinite(minZ) || !isFinite(maxZ)) {
    // Fallback to a reasonable center if no racks yet
    return { minZ: 0, maxZ: CAB_SPACING * 8 };
  }
  return { minZ, maxZ };
}

function createOrUpdateColumnLabel(floor, col) {
  const group = ensureFloorGroup(floor);
  if (!floorColumnLabels.has(floor)) floorColumnLabels.set(floor, new Map());
  const map = floorColumnLabels.get(floor);
  let spr = map.get(col);
  if (!spr) {
    spr = makeColumnLabel(col);
    group.add(spr);
    map.set(col, spr);
  }
  // Position to the left side of the row (row is along X; col letter locates Z)
  const { minZ, maxZ } = getColumnZExtent(floor, col);
  const zCenter = (minZ + maxZ) / 2;
  // 在本场景的排布约定下：行内向右为负 X，左侧通常为 x 最大值（接近 0）
  let maxX = -Infinity;
  racks.forEach((rack, key) => {
    const [floorStr, c] = key.split('-');
    const f = parseInt(floorStr, 10);
    if (f === floor && c === col) {
      if (rack.position.x > maxX) maxX = rack.position.x;
    }
  });
  if (!isFinite(maxX)) maxX = 0;
  const height = RACK_U * U_HEIGHT;
  // Place label slightly to the left of the left-most cabinet
  spr.position.set(maxX + (RACK_WIDTH/2 + 0.6), height/2, zCenter);
}

function buildColumnLabelsForAllFloors() {
  for (let floor = 1; floor <= 5; floor++) {
    // Build labels for known columns (A-D) or those present
    const cols = ['A','B','C','D'];
    cols.forEach(col => {
      createOrUpdateColumnLabel(floor, col);
    });
  }
  updateColumnLabelsVisibility();
}

function updateColumnLabelsVisibility() {
  const map = floorColumnLabels.get(selectedFloor);
  if (!map) return;
  map.forEach((spr, col) => {
    spr.visible = visibleColumns.has(col);
  });
}
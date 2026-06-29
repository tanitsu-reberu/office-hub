/**
 * Team Office 3D — agents walk between cubicles, type at monitors,
 * speech bubbles projected above heads + top notification bar.
 */
window.Office3DLegacy = (function () {
  const AGENTS = {
    orchestrator: { name: 'Оркестратор', emoji: '🎯', color: '#8b5cf6' },
    designer: { name: 'Дизайнер', emoji: '🎨', color: '#ec4899' },
    frontend: { name: 'Фронтенд', emoji: '⚡', color: '#06b6d4' },
    backend: { name: 'Бэкенд', emoji: '🔧', color: '#22c55e' },
    owencloud: { name: 'OwenCloud', emoji: '🏭', color: '#f59e0b' },
  };

  const DESK = {
    orchestrator: { x: 0, z: -6.2, rot: 0 },
    designer: { x: -7.2, z: 3.2, rot: Math.PI * 0.12 },
    frontend: { x: 7.2, z: 3.2, rot: -Math.PI * 0.12 },
    backend: { x: -7.2, z: -5.2, rot: Math.PI * 0.08 },
    owencloud: { x: 7.2, z: -5.2, rot: -Math.PI * 0.08 },
  };

  const MEETING = {
    orchestrator: { x: 0, z: -1.8 },
    designer: { x: -2.4, z: 0.6 },
    frontend: { x: 2.4, z: 0.6 },
    backend: { x: -2.4, z: -1.2 },
    owencloud: { x: 2.4, z: -1.2 },
  };

  const USER_DESK = { x: 0, z: 5.8 };

  let currentThemeId = 'light';
  let onThemeChange = null;
  const themeMeshes = { desks: [], partitions: [], partitionTops: [], woods: [], chairs: [], monitors: [] };
  const themeParts = { floor: null, grid: null, table: null, tableRing: null };
  const sceneLights = { hemi: null, ambient: null, sun: null, fill: null, rim: null };

  function getScenePal() {
    const packs = window.OFFICE_THEMES?.scene3d;
    return (packs && (packs[currentThemeId] || packs.light)) || packs?.light || {};
  }

  function trackCubicleMats(floor, back, topTrim, deskTop, monitorFrame, chair) {
    themeMeshes.desks.push(floor.material);
    themeMeshes.partitions.push(back.material);
    themeMeshes.partitionTops.push(topTrim.material);
    themeMeshes.woods.push(deskTop.material);
    themeMeshes.monitors.push(monitorFrame.material);
    themeMeshes.chairs.push(chair.material);
  }

  function applySceneTheme(themeId) {
    const packs = window.OFFICE_THEMES?.scene3d;
    if (!packs || !scene) return;
    const pal = packs[themeId] || packs.light;
    if (!pal) return;
    currentThemeId = themeId;

    scene.background.set(pal.bg);
    if (scene.fog) scene.fog.color.set(pal.fog);

    if (themeParts.floor?.material?.color) themeParts.floor.material.color.set(pal.floor);
    if (themeParts.grid?.material) {
      const mats = Array.isArray(themeParts.grid.material)
        ? themeParts.grid.material
        : [themeParts.grid.material];
      if (mats[0]?.color) mats[0].color.set(pal.gridMain);
      if (mats[1]?.color) mats[1].color.set(pal.gridSub);
      else if (mats[0]?.color) mats[0].color.set(pal.gridSub);
    }
    if (themeParts.table?.material?.color) themeParts.table.material.color.set(pal.platform);
    if (themeParts.tableRing?.material?.color) {
      themeParts.tableRing.material.color.set(pal.platformRing);
      if (themeParts.tableRing.material.emissive?.set) {
        themeParts.tableRing.material.emissive.set(pal.platformRing);
      }
    }

    themeMeshes.desks.forEach((m) => m?.color?.set(pal.desk));
    themeMeshes.partitions.forEach((m) => m?.color?.set(pal.partition));
    themeMeshes.partitionTops.forEach((m) => m?.color?.set(pal.partitionTop));
    themeMeshes.woods.forEach((m) => m?.color?.set(pal.wood));
    themeMeshes.monitors.forEach((m) => m?.color?.set(pal.monitor));
    themeMeshes.chairs.forEach((m) => m?.color?.set(pal.chair));

    if (sceneLights.hemi) {
      sceneLights.hemi.color.set(pal.hemiSky);
      sceneLights.hemi.groundColor.set(pal.hemiGround);
    }
    if (sceneLights.ambient) sceneLights.ambient.color.set(pal.ambient);
    if (sceneLights.sun) sceneLights.sun.color.set(pal.sun);
    if (sceneLights.fill) sceneLights.fill.color.set(pal.fill);
    if (sceneLights.rim) sceneLights.rim.color.set(pal.rim);
  }

  const VISIT_TARGETS = {
    orchestrator: ['designer', 'frontend', 'backend', 'owencloud'],
    designer: ['orchestrator', 'frontend'],
    frontend: ['designer', 'backend'],
    backend: ['frontend', 'owencloud'],
    owencloud: ['backend', 'orchestrator'],
  };

  let container, canvas, labelLayer, notifyStack, errorEl, userNameTag;
  let scene, camera, renderer;
  let agents = {};
  let monitors = {};
  let cubicles = {};
  let onAgentDeskClick = null;
  let raycaster = null;
  let pointerNdc = null;
  let clock, meetingActive = false;
  let visitIndex = {};
  let animId = null;
  let tmpVec = null;
  let controls = null;
  let controlState = null;
  const toastQueue = [];
  let toastVisible = 0;
  const MAX_TOAST = 2;

  function makeEmojiSprite(emoji, color) {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');
    ctx.fillStyle = color + '33';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '72px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, size / 2, size / 2 + 4);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.9, 0.9, 1);
    sprite.position.y = 1.35;
    return sprite;
  }

  function createAgent(id, meta) {
    const group = new THREE.Group();
    group.userData.id = id;

    const bodyMat = new THREE.MeshStandardMaterial({
      color: meta.color,
      roughness: 0.55,
      metalness: 0.1,
    });
    const skinMat = new THREE.MeshStandardMaterial({ color: '#f1c9a2', roughness: 0.8 });
    const pantsMat = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.7 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.28), bodyMat);
    torso.position.y = 0.85;
    torso.castShadow = true;

    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.45, 0.26), pantsMat);
    legs.position.y = 0.38;
    legs.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), skinMat);
    head.position.y = 1.28;
    head.castShadow = true;

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.1), bodyMat);
    leftArm.position.set(-0.3, 0.88, 0);
    leftArm.geometry.translate(0, -0.1, 0);
    leftArm.userData.isArm = true;

    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.38, 0.1), bodyMat);
    rightArm.position.set(0.3, 0.88, 0);
    rightArm.geometry.translate(0, -0.1, 0);
    rightArm.userData.isArm = true;

    const emoji = makeEmojiSprite(meta.emoji, meta.color);
    group.add(torso, legs, head, leftArm, rightArm, emoji);

    const desk = DESK[id];
    group.position.set(desk.x, 0, desk.z);
    group.rotation.y = desk.rot;

    const label = document.createElement('div');
    label.className = 'head-bubble hidden';
    label.innerHTML = `<span class="head-bubble-name"></span><span class="head-bubble-text"></span>`;
    labelLayer.appendChild(label);

    const nameTag = document.createElement('div');
    nameTag.className = 'name-tag';
    nameTag.textContent = meta.name;
    nameTag.style.borderColor = meta.color;
    labelLayer.appendChild(nameTag);

    agents[id] = {
      id,
      meta,
      group,
      label,
      nameTag,
      state: 'idle',
      target: { x: desk.x, z: desk.z },
      pos: { x: desk.x, z: desk.z },
      typing: false,
      typingPhase: 0,
      bubbleTimer: null,
      visitCooldown: 0,
    };

    scene.add(group);
    return agents[id];
  }

  function buildCubicle(x, z, rot, accent, label) {
    const pal = getScenePal();
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.08, 3.2),
      new THREE.MeshStandardMaterial({ color: pal.desk, roughness: 0.58, metalness: 0.06 })
    );
    floor.position.y = 0.04;
    floor.receiveShadow = true;

    const wallMat = new THREE.MeshStandardMaterial({ color: pal.partition, roughness: 0.72, metalness: 0.04 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.2, 0.12), wallMat);
    back.position.set(0, 1.1, -1.5);
    const topTrim = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.06, 0.14),
      new THREE.MeshStandardMaterial({ color: pal.partitionTop, roughness: 0.65, metalness: 0.06 })
    );
    topTrim.position.set(0, 2.2, -1.5);

    const deskTop = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.06, 0.8),
      new THREE.MeshStandardMaterial({ color: pal.wood, roughness: 0.5, metalness: 0.1 })
    );
    deskTop.position.set(0, 0.78, 0.2);
    deskTop.castShadow = true;

    const monitorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.48, 0.05),
      new THREE.MeshStandardMaterial({ color: pal.monitor, roughness: 0.4 })
    );
    monitorFrame.position.set(0, 1.12, 0.35);

    const screenMat = new THREE.MeshStandardMaterial({
      color: accent,
      emissive: accent,
      emissiveIntensity: 0.32,
      roughness: 0.3,
    });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.4), screenMat);
    screen.position.set(0, 1.12, 0.38);
    screen.userData.isScreen = true;

    const chair = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.5, 0.55),
      new THREE.MeshStandardMaterial({ color: pal.chair, roughness: 0.7 })
    );
    chair.position.set(0, 0.45, 1.15);

    const lamp = new THREE.PointLight(accent, 0.28, 4);
    lamp.position.set(0.5, 1.8, 0.2);

    trackCubicleMats(floor, back, topTrim, deskTop, monitorFrame, chair);
    g.userData.agentId = label;
    g.add(floor, back, topTrim, deskTop, monitorFrame, screen, chair, lamp);
    scene.add(g);
    cubicles[label] = g;
    return screen;
  }

  function buildUserCubicle() {
    const pal = getScenePal();
    const g = new THREE.Group();
    g.position.set(0, 0, 5.5);
    g.rotation.y = Math.PI;

    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.08, 3.2),
      new THREE.MeshStandardMaterial({ color: pal.desk, roughness: 0.58, metalness: 0.06 })
    );
    floor.position.y = 0.04;
    floor.receiveShadow = true;

    const wallMat = new THREE.MeshStandardMaterial({ color: pal.partition, roughness: 0.72, metalness: 0.04 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.2, 0.12), wallMat);
    back.position.set(0, 1.1, -1.5);
    const topTrim = new THREE.Mesh(
      new THREE.BoxGeometry(3.8, 0.06, 0.14),
      new THREE.MeshStandardMaterial({ color: pal.partitionTop, roughness: 0.65, metalness: 0.06 })
    );
    topTrim.position.set(0, 2.2, -1.5);

    const deskTop = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.06, 0.8),
      new THREE.MeshStandardMaterial({ color: pal.wood, roughness: 0.5, metalness: 0.1 })
    );
    deskTop.position.set(0, 0.78, 0.2);

    const monitorFrame = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.01, 0.01),
      new THREE.MeshStandardMaterial({ color: pal.monitor, visible: false })
    );

    const chair = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.01, 0.01),
      new THREE.MeshStandardMaterial({ color: pal.chair, visible: false })
    );
    trackCubicleMats(floor, back, topTrim, deskTop, monitorFrame, chair);

    const laptop = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.02, 0.6),
      new THREE.MeshStandardMaterial({ color: '#e8edf4', roughness: 0.9 })
    );
    laptop.position.set(0, 0.81, 0.2);
    laptop.rotation.x = -0.1;

    const namePlate = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.14),
      new THREE.MeshBasicMaterial({ color: '#94a3b8' })
    );
    namePlate.position.set(0, 1.55, -1.44);

    g.add(floor, back, topTrim, deskTop, laptop, namePlate);
    scene.add(g);
  }

  function buildOffice() {
    const pal = getScenePal();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 22),
      new THREE.MeshStandardMaterial({ color: pal.floor, roughness: 0.82, metalness: 0.08 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    themeParts.floor = floor;

    const grid = new THREE.GridHelper(28, 28, pal.gridMain, pal.gridSub);
    grid.position.y = 0.02;
    scene.add(grid);
    themeParts.grid = grid;

    const table = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 0.12, 32),
      new THREE.MeshStandardMaterial({ color: pal.platform, roughness: 0.55, metalness: 0.08 })
    );
    table.position.set(0, 0.45, 0);
    table.castShadow = true;
    scene.add(table);
    themeParts.table = table;

    const tableRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.2, 0.06, 8, 48),
      new THREE.MeshStandardMaterial({ color: pal.platformRing, emissive: pal.platformRing, emissiveIntensity: 0.2 })
    );
    tableRing.rotation.x = Math.PI / 2;
    tableRing.position.set(0, 0.52, 0);
    scene.add(tableRing);
    themeParts.tableRing = tableRing;

    const rooms = [
      [0, -6, 0, '#8b5cf6', 'orchestrator'],
      [-7, 3, 0.3, '#ec4899', 'designer'],
      [7, 3, -0.3, '#06b6d4', 'frontend'],
      [-7, -5, 0.2, '#22c55e', 'backend'],
      [7, -5, -0.2, '#f59e0b', 'owencloud'],
    ];
    rooms.forEach(([x, z, rot, color, id]) => {
      monitors[id] = buildCubicle(x, z, rot, color, id);
      addFloorLabel(x, z, AGENTS[id].name, color);
    });

    buildUserCubicle();
  }

  function addFloorLabel(x, z, text, color) {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = getScenePal().labelBg || 'rgba(240, 244, 250, 0.9)';
    ctx.fillRect(0, 0, size, 64);
    ctx.font = 'bold 28px system-ui,sans-serif';
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, size / 2, 42);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.7), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, 0.09, z + 1.2);
    scene.add(plane);
  }

  function walkTo(agent, x, z) {
    agent.target.x = x;
    agent.target.z = z;
    agent.state = 'walking';
  }

  function goToDesk(id) {
    const a = agents[id];
    if (!a) return;
    const d = DESK[id];
    walkTo(a, d.x, d.z);
    a.group.rotation.y = d.rot;
    a.state = 'walking';
  }

  function goToMeeting(id) {
    const a = agents[id];
    if (!a) return;
    const m = MEETING[id];
    walkTo(a, m.x, m.z);
    a.group.rotation.y = Math.atan2(-m.x, -m.z + 0.01);
  }

  function visitColleague(fromId) {
    const a = agents[fromId];
    if (!a || meetingActive) return;
    const targets = VISIT_TARGETS[fromId];
    if (!targets) return;
    const idx = visitIndex[fromId] || 0;
    const toId = targets[idx % targets.length];
    visitIndex[fromId] = idx + 1;
    const desk = DESK[toId];
    const offset = 0.9;
    walkTo(a, desk.x + offset * Math.sign(desk.x || 1), desk.z + 0.5);
    a.group.rotation.y = Math.atan2(desk.x - a.pos.x, desk.z - a.pos.z) + Math.PI;
    a.state = 'visiting';
    setTimeout(() => goToDesk(fromId), 6000);
  }

  function setTyping(id, on) {
    const a = agents[id];
    if (!a) return;
    a.typing = on;
    a.state = on ? 'typing' : 'idle';
    const screen = monitors[id];
    if (screen && screen.material) {
      screen.material.emissiveIntensity = on ? 0.85 : 0.15;
    }
    if (on) {
      const d = DESK[id];
      walkTo(a, d.x, d.z);
      a.group.rotation.y = d.rot;
    }
  }

  function showHeadBubble(id, text) {
    const a = agents[id];
    if (!a) return;
    const short = text.length > 90 ? text.slice(0, 87) + '…' : text;
    a.label.querySelector('.head-bubble-name').textContent = a.meta.name;
    a.label.querySelector('.head-bubble-text').textContent = short;
    a.label.classList.remove('hidden');
    a.label.style.borderColor = a.meta.color;
    clearTimeout(a.bubbleTimer);
    a.bubbleTimer = setTimeout(() => a.label.classList.add('hidden'), 9000);
  }

  function flushToastQueue() {
    while (toastVisible < MAX_TOAST && toastQueue.length > 0) {
      const item = toastQueue.shift();
      showToastNow(item.meta, item.text);
    }
  }

  function showToastNow(meta, text) {
    if (!notifyStack) return;
    toastVisible += 1;
    const el = document.createElement('div');
    el.className = 'notify-toast';
    el.style.borderLeftColor = meta.color || '#8b5cf6';
    const short = text.length > 120 ? text.slice(0, 117) + '…' : text;
    el.innerHTML = `
      <span class="notify-emoji">${meta.emoji || '💬'}</span>
      <div class="notify-body">
        <strong style="color:${meta.color}">${escapeHtml(meta.name || 'Агент')}</strong>
        <span>печатает…</span>
        <p>${escapeHtml(short)}</p>
      </div>
    `;
    notifyStack.prepend(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => {
        el.remove();
        toastVisible = Math.max(0, toastVisible - 1);
        flushToastQueue();
      }, 400);
    }, 5500);
  }

  function pushTopNotification(meta, text) {
    if (toastVisible < MAX_TOAST) showToastNow(meta, text);
    else toastQueue.push({ meta, text });
    if (toastQueue.length > 8) toastQueue.shift();
  }

  function clearNotifications() {
    if (notifyStack) notifyStack.innerHTML = '';
    toastQueue.length = 0;
    toastVisible = 0;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function updateAgentMotion(a, dt) {
    const speed = a.state === 'visiting' ? 3.2 : 2.4;
    const dx = a.target.x - a.pos.x;
    const dz = a.target.z - a.pos.z;
    const dist = Math.hypot(dx, dz);

    if (dist > 0.06) {
      const step = Math.min(dist, speed * dt);
      a.pos.x += (dx / dist) * step;
      a.pos.z += (dz / dist) * step;
      a.group.position.set(a.pos.x, 0, a.pos.z);
      if (a.state === 'walking' || a.state === 'visiting') {
        a.group.rotation.y = Math.atan2(dx, dz);
        a.group.position.y = Math.abs(Math.sin(clock.elapsedTime * 12)) * 0.06;
      }
    } else {
      a.pos.x = a.target.x;
      a.pos.z = a.target.z;
      a.group.position.y = 0;
      if (a.state === 'walking') a.state = a.typing ? 'typing' : 'idle';
    }

    const arms = a.group.children.filter((c) => c.userData.isArm);
    if (a.typing && arms.length === 2) {
      a.typingPhase += dt * 9;
      arms[0].rotation.x = -0.6 + Math.sin(a.typingPhase) * 0.25;
      arms[1].rotation.x = -0.5 + Math.cos(a.typingPhase * 1.2) * 0.3;
      a.group.position.y = Math.sin(a.typingPhase * 0.5) * 0.02;
    } else if (arms.length === 2) {
      arms[0].rotation.x *= 0.9;
      arms[1].rotation.x *= 0.9;
    }
  }

  function getContainerSize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w > 50 && h > 50) return { w, h };
    const parent = container.parentElement;
    return {
      w: Math.max(w, parent?.clientWidth || 640, 320),
      h: Math.max(h, parent?.clientHeight || 480, 240),
    };
  }

  function createSimpleControls(cam, dom) {
    const target = new THREE.Vector3(0, 0, -0.5);
    const state = { theta: 0.65, phi: 0.95, radius: 16 };
    controlState = state;
    let drag = false;
    let lx = 0;
    let ly = 0;
    let pinchDist = 0;

    function apply() {
      const x = state.radius * Math.sin(state.phi) * Math.sin(state.theta);
      const y = state.radius * Math.cos(state.phi);
      const z = state.radius * Math.sin(state.phi) * Math.cos(state.theta);
      cam.position.set(target.x + x, Math.max(4, target.y + y), target.z + z);
      cam.lookAt(target);
    }

    function rotate(dx, dy) {
      state.theta -= dx * 0.005;
      state.phi = Math.max(0.35, Math.min(1.35, state.phi + dy * 0.004));
      apply();
    }

    dom.addEventListener('mousedown', (e) => {
      drag = true;
      lx = e.clientX;
      ly = e.clientY;
    });
    window.addEventListener('mouseup', () => {
      drag = false;
    });
    dom.addEventListener('mousemove', (e) => {
      if (!drag) return;
      rotate(e.clientX - lx, e.clientY - ly);
      lx = e.clientX;
      ly = e.clientY;
    });
    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        state.radius = Math.max(8, Math.min(24, state.radius + e.deltaY * 0.015));
        apply();
      },
      { passive: false }
    );

    dom.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length === 1) {
          drag = true;
          lx = e.touches[0].clientX;
          ly = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
          drag = false;
          pinchDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
        }
      },
      { passive: true }
    );
    dom.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length === 1 && drag) {
          e.preventDefault();
          rotate(e.touches[0].clientX - lx, e.touches[0].clientY - ly);
          lx = e.touches[0].clientX;
          ly = e.touches[0].clientY;
        } else if (e.touches.length === 2) {
          e.preventDefault();
          const d = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          state.radius = Math.max(8, Math.min(24, state.radius - (d - pinchDist) * 0.02));
          pinchDist = d;
          apply();
        }
      },
      { passive: false }
    );
    dom.addEventListener('touchend', () => {
      drag = false;
    });

    apply();
    return { update: () => {}, reset: () => {
      state.theta = 0.65;
      state.phi = 0.95;
      state.radius = 16;
      apply();
    }};
  }

  function resetCamera() {
    controls?.reset?.();
  }

  function focusAgent(id) {
    const a = agents[id];
    const d = DESK[id];
    if (!a || !d || !camera) return;
    if (controlState) {
      controlState.theta = Math.atan2(d.x, d.z + 0.01);
      controlState.phi = 0.82;
      controlState.radius = 11;
    }
    camera.position.set(d.x + 2, 7, d.z + 5);
    camera.lookAt(d.x, 1, d.z);
    showHeadBubble(id, `${a.meta.name} — кабинет`);
  }

  function setAgentDeskClickHandler(fn) {
    onAgentDeskClick = typeof fn === 'function' ? fn : null;
  }

  function pickAgentAt(clientX, clientY) {
    if (!raycaster || !pointerNdc || !camera || !canvas) return null;
    const rect = canvas.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, camera);
    const groups = Object.values(cubicles);
    const hits = raycaster.intersectObjects(groups, true);
    for (const hit of hits) {
      let obj = hit.object;
      while (obj) {
        if (obj.userData?.agentId) return obj.userData.agentId;
        obj = obj.parent;
      }
    }
    return null;
  }

  function setupDeskClicks() {
    if (!canvas) return;
    let dragMoved = false;
    let downX = 0;
    let downY = 0;

    canvas.addEventListener('pointerdown', (e) => {
      dragMoved = false;
      downX = e.clientX;
      downY = e.clientY;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) dragMoved = true;
    });
    canvas.addEventListener('pointerup', (e) => {
      if (dragMoved || e.button !== 0) return;
      const id = pickAgentAt(e.clientX, e.clientY);
      if (id && onAgentDeskClick) onAgentDeskClick(id);
    });
  }

  function showInitError(msg) {
    if (!errorEl) {
      errorEl = document.createElement('div');
      errorEl.className = 'office-3d-error';
      container?.appendChild(errorEl);
    }
    errorEl.innerHTML = `<strong>3D офис не загрузился</strong><p>${escapeHtml(msg)}</p><p>Обновите страницу (Ctrl+F5). Чат справа работает.</p>`;
  }

  function projectLabels() {
    if (!tmpVec) return;
    const { w, h } = getContainerSize();
    Object.values(agents).forEach((a) => {
      tmpVec.set(a.pos.x, 1.75, a.pos.z);
      tmpVec.project(camera);
      const x = (tmpVec.x * 0.5 + 0.5) * w;
      const y = (-tmpVec.y * 0.5 + 0.5) * h;
      const visible = tmpVec.z < 1 && x > 0 && x < w && y > 0 && y < h;
      a.label.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - 18}px)`;
      a.label.style.opacity = visible && !a.label.classList.contains('hidden') ? '1' : '0';
      a.nameTag.style.transform = `translate(-50%, 0) translate(${x}px, ${y + 8}px)`;
      a.nameTag.style.opacity = visible ? '1' : '0';
    });
    if (userNameTag) {
      tmpVec.set(USER_DESK.x, 1.75, USER_DESK.z);
      tmpVec.project(camera);
      const x = (tmpVec.x * 0.5 + 0.5) * w;
      const y = (-tmpVec.y * 0.5 + 0.5) * h;
      const visible = tmpVec.z < 1;
      userNameTag.style.transform = `translate(-50%, 0) translate(${x}px, ${y + 8}px)`;
      userNameTag.style.opacity = visible ? '1' : '0';
    }
  }

  function animate() {
    animId = requestAnimationFrame(animate);
    const dt = clock.getDelta();
    Object.values(agents).forEach((a) => {
      updateAgentMotion(a, dt);
      if (a.visitCooldown > 0) a.visitCooldown -= dt;
    });
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
    projectLabels();
  }

  function onResize() {
    if (!container || !camera || !renderer) return;
    const { w, h } = getContainerSize();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  function init(el, labelsEl, notifyEl) {
    container = el;
    try {
      if (typeof THREE === 'undefined') {
        showInitError('Three.js не загрузился. Проверьте интернет или CDN.');
        return false;
      }
      labelLayer = labelsEl;
      notifyStack = notifyEl;
      tmpVec = new THREE.Vector3();

      canvas = document.createElement('canvas');
      canvas.className = 'office-canvas';
      container.appendChild(canvas);

      const { w, h } = getContainerSize();

      const pal = getScenePal();
      scene = new THREE.Scene();
      scene.background = new THREE.Color(pal.bg);
      scene.fog = new THREE.Fog(pal.fog, 28, 52);

      camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 100);
      camera.position.set(0, 11, 14);
      camera.lookAt(0, 0, -1);

      const lowPower = navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4;
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !lowPower,
        alpha: false,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1 : 2));
      renderer.setSize(w, h, false);
      renderer.shadowMap.enabled = !lowPower;

      controls = createSimpleControls(camera, canvas);
      raycaster = new THREE.Raycaster();
      pointerNdc = new THREE.Vector2();
      setupDeskClicks();

      const hemi = new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, 0.9);
      scene.add(hemi);
      sceneLights.hemi = hemi;
      const ambient = new THREE.AmbientLight(pal.ambient, 0.48);
      scene.add(ambient);
      sceneLights.ambient = ambient;
      const sun = new THREE.DirectionalLight(pal.sun, 1.05);
      sun.position.set(8, 16, 10);
      sun.castShadow = !lowPower;
      if (sun.castShadow) sun.shadow.mapSize.set(512, 512);
      scene.add(sun);
      sceneLights.sun = sun;
      const fill = new THREE.DirectionalLight(pal.fill, 0.55);
      fill.position.set(-6, 8, -4);
      scene.add(fill);
      sceneLights.fill = fill;
      const rim = new THREE.DirectionalLight(pal.rim, 0.25);
      rim.position.set(0, 6, -12);
      scene.add(rim);
      sceneLights.rim = rim;

      buildOffice();
      userNameTag = document.createElement('div');
      userNameTag.className = 'name-tag user-desk-tag';
      userNameTag.textContent = '👤 Вы · Заказчик';
      userNameTag.style.borderColor = '#94a3b8';
      labelLayer.appendChild(userNameTag);

      Object.entries(AGENTS).forEach(([id, meta]) => createAgent(id, meta));

      clock = new THREE.Clock();
      window.addEventListener('resize', onResize);

      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => onResize());
        ro.observe(container);
      }

      currentThemeId = document.documentElement.dataset.theme || 'light';
      applySceneTheme(currentThemeId);
      onThemeChange = (ev) => applySceneTheme(ev.detail?.themeId || 'light');
      window.addEventListener('office-theme-change', onThemeChange);

      animate();
      return true;
    } catch (err) {
      console.error('Office3D init failed:', err);
      showInitError(err.message || String(err));
      return false;
    }
  }

  function gatherAtMeeting() {
    meetingActive = true;
    Object.keys(agents).forEach((id) => goToMeeting(id));
    setTimeout(() => {
      meetingActive = false;
    }, 12000);
  }

  function scatterToDesks() {
    meetingActive = false;
    Object.keys(agents).forEach((id) => goToDesk(id));
  }

  function onMessage(agentId, text, meta) {
    if (!agents[agentId]) return;
    const m = meta || agents[agentId].meta;
    setTyping(agentId, true);
    showHeadBubble(agentId, text);
    pushTopNotification(
      { name: m.agent_name || m.name, emoji: m.emoji, color: m.color },
      text
    );
    if (Math.random() < 0.35 && agents[agentId].visitCooldown <= 0) {
      agents[agentId].visitCooldown = 14;
      setTimeout(() => visitColleague(agentId), 1200);
    }
    setTimeout(() => setTyping(agentId, false), 5000 + Math.random() * 3000);
  }

  function onStatus(agentId, status) {
    if (!agents[agentId]) return;
    if (status === 'thinking' || status === 'working') {
      setTyping(agentId, true);
      goToDesk(agentId);
    } else if (status === 'talking') {
      if (meetingActive) goToMeeting(agentId);
      else goToDesk(agentId);
    } else if (status === 'idle') {
      setTyping(agentId, false);
    }
  }

  function destroy() {
    if (animId) cancelAnimationFrame(animId);
    window.removeEventListener('resize', onResize);
    if (onThemeChange) window.removeEventListener('office-theme-change', onThemeChange);
    onThemeChange = null;
    onAgentDeskClick = null;
    cubicles = {};
    userNameTag = null;
    themeParts.floor = null;
    themeParts.grid = null;
    themeParts.table = null;
    themeParts.tableRing = null;
    Object.keys(themeMeshes).forEach((k) => { themeMeshes[k] = []; });
  }

  return {
    init,
    destroy,
    gatherAtMeeting,
    scatterToDesks,
    onMessage,
    onStatus,
    goToDesk,
    visitColleague,
    pushTopNotification,
    clearNotifications,
    resetCamera,
    focusAgent,
    setAgentDeskClickHandler,
  };
})();
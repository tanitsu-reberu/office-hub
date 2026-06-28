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

  let scene, camera, renderer, controls;
  let agents = {};
  let clock;
  let labelsLayer;
  let notifyStack;
  let focusedAgent = null;
  let quality = 'medium';

  function init(container, opts = {}) {
    quality = opts.quality || 'medium';
    if (!window.THREE) {
      showError(container, 'THREE.js not loaded');
      return;
    }
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd0dae6);
    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 200);
    camera.position.set(0, 14, 18);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', alpha: false });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1.25));
    renderer.shadowMap.enabled = quality !== 'low';
    container.appendChild(renderer.domElement);
    renderer.domElement.classList.add('office-canvas');

    if (window.THREE.OrbitControls) {
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.maxPolarAngle = Math.PI / 2.1;
      controls.minDistance = 8;
      controls.maxDistance = 35;
    }

    addLights();
    addFloor();
    addDesks();
    addAgents();
    setupLabels(container);
    setupNotifications();

    clock = new THREE.Clock();
    window.addEventListener('resize', () => onResize(container));
    animate();
  }

  function addLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.55);
    dir.position.set(10, 20, 10);
    dir.castShadow = quality !== 'low';
    scene.add(dir);
  }

  function addFloor() {
    const geo = new THREE.PlaneGeometry(40, 40);
    const mat = new THREE.MeshStandardMaterial({ color: 0xc8d2e0 });
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
  }

  function addDesks() {
    Object.entries(DESK).forEach(([id, pos]) => {
      const desk = new THREE.Mesh(
        new THREE.BoxGeometry(2.2, 0.15, 1.2),
        new THREE.MeshStandardMaterial({ color: 0xd4ccc0 })
      );
      desk.position.set(pos.x, 0.4, pos.z);
      desk.rotation.y = pos.rot;
      desk.castShadow = true;
      scene.add(desk);
    });
    const userDesk = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.15, 1.4),
      new THREE.MeshStandardMaterial({ color: 0xe8e0d8 })
    );
    userDesk.position.set(USER_DESK.x, 0.4, USER_DESK.z);
    scene.add(userDesk);
  }

  function addAgents() {
    Object.entries(AGENTS).forEach(([id, info]) => {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 1.2, 0.4),
        new THREE.MeshStandardMaterial({ color: info.color })
      );
      body.position.y = 0.6;
      body.castShadow = true;
      group.add(body);
      const pos = DESK[id];
      group.position.set(pos.x, 0, pos.z);
      group.rotation.y = pos.rot;
      scene.add(group);
      agents[id] = { group, info, state: 'idle', target: null, bubble: null };
    });
  }

  function setupLabels(container) {
    labelsLayer = document.createElement('div');
    labelsLayer.className = 'head-labels-layer';
    container.appendChild(labelsLayer);
  }

  function setupNotifications() {
    notifyStack = document.getElementById('notify-stack');
  }

  function showError(container, msg) {
    const el = document.createElement('div');
    el.className = 'office-3d-error';
    el.innerHTML = `<strong>3D error</strong><span>${msg}</span>`;
    container.appendChild(el);
  }

  function onResize(container) {
    if (!renderer || !camera) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    updateAgents(dt);
    updateLabels();
    if (controls) controls.update();
    renderer.render(scene, camera);
  }

  function updateAgents(dt) {
    Object.entries(agents).forEach(([id, a]) => {
      if (a.target) {
        const g = a.group;
        const dx = a.target.x - g.position.x;
        const dz = a.target.z - g.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.05) {
          g.position.x = a.target.x;
          g.position.z = a.target.z;
          a.target = null;
          a.state = 'idle';
        } else {
          const speed = 2.5 * dt;
          g.position.x += (dx / dist) * speed;
          g.position.z += (dz / dist) * speed;
          g.rotation.y = Math.atan2(dx, dz);
          a.state = 'walking';
        }
      }
    });
  }

  function updateLabels() {
    if (!labelsLayer || !camera) return;
    Object.entries(agents).forEach(([id, a]) => {
      let label = a.labelEl;
      if (!label) {
        label = document.createElement('div');
        label.className = 'name-tag';
        label.textContent = `${a.info.emoji} ${a.info.name}`;
        label.style.setProperty('--accent', a.info.color);
        labelsLayer.appendChild(label);
        a.labelEl = label;
      }
      const pos = a.group.position.clone();
      pos.y += 1.6;
      pos.project(camera);
      const x = (pos.x * 0.5 + 0.5) * labelsLayer.clientWidth;
      const y = (-pos.y * 0.5 + 0.5) * labelsLayer.clientHeight;
      label.style.transform = `translate(${x}px, ${y}px)`;
      label.classList.toggle('talking', a.state === 'talking');
    });
  }

  function goToDesk(agentId) {
    const a = agents[agentId];
    if (!a) return;
    const pos = DESK[agentId];
    a.target = { x: pos.x, z: pos.z + 0.8 };
  }

  function goToMeeting(agentId) {
    const a = agents[agentId];
    if (!a) return;
    const pos = MEETING[agentId];
    a.target = { x: pos.x, z: pos.z };
  }

  function scatterToDesks() {
    Object.keys(agents).forEach(goToDesk);
  }

  function visitColleague(fromId, toId) {
    const a = agents[fromId];
    const target = DESK[toId];
    if (!a || !target) return;
    a.target = { x: target.x + 1.2, z: target.z + 0.5 };
  }

  function onMessage(agentId, text) {
    const a = agents[agentId];
    if (!a) return;
    a.state = 'talking';
    showBubble(a, text);
    setTimeout(() => { a.state = 'idle'; hideBubble(a); }, 4000);
  }

  function onStatus(agentId, status) {
    const a = agents[agentId];
    if (!a) return;
    if (status === 'working' || status === 'thinking') goToDesk(agentId);
    if (status === 'meeting') goToMeeting(agentId);
  }

  function showBubble(a, text) {
    hideBubble(a);
    const bubble = document.createElement('div');
    bubble.className = 'head-bubble';
    bubble.innerHTML = `<span class="head-bubble-name">${a.info.name}</span>${text}`;
    labelsLayer.appendChild(bubble);
    a.bubble = bubble;
  }

  function hideBubble(a) {
    if (a.bubble) {
      a.bubble.remove();
      a.bubble = null;
    }
  }

  function pushTopNotification(agentId, text) {
    if (!notifyStack) return;
    const info = AGENTS[agentId] || { emoji: '💬', name: agentId };
    const toast = document.createElement('div');
    toast.className = 'notify-toast';
    toast.style.borderLeftColor = info.color || '#8b5cf6';
    toast.innerHTML = `<span class="notify-emoji">${info.emoji}</span><div class="notify-body"><strong>${info.name}</strong><p>${text}</p></div>`;
    notifyStack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }

  function clearNotifications() {
    if (notifyStack) notifyStack.innerHTML = '';
  }

  function resetCamera() {
    if (!camera) return;
    camera.position.set(0, 14, 18);
    camera.lookAt(0, 0, 0);
    if (controls) controls.target.set(0, 0, 0);
  }

  function focusAgent(agentId) {
    const a = agents[agentId];
    if (!a || !camera) return;
    focusedAgent = agentId;
    const p = a.group.position;
    camera.position.set(p.x + 4, 8, p.z + 6);
    if (controls) controls.target.copy(p);
  }

  return {
    init,
    scatterToDesks,
    onMessage,
    onStatus,
    goToDesk,
    visitColleague,
    pushTopNotification,
    clearNotifications,
    resetCamera,
    focusAgent,
  };
})();
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { AGENT_IDS, AGENTS, USER_DESK } from '../constants';
import type { OfficeStore } from '../state/officeStore';

let labelLayer: HTMLElement | null = null;

export function setLabelLayer(el: HTMLElement | null) {
  labelLayer = el;
}

interface DomLabelsProps {
  store: OfficeStore;
}

export function DomLabels({ store }: DomLabelsProps) {
  const { camera, size } = useThree();
  const state = useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getState(),
    () => store.getState()
  );
  const vec = useRef(new THREE.Vector3());
  const nodes = useRef<Map<string, { bubble: HTMLDivElement; tag: HTMLDivElement }>>(new Map());
  const userTagRef = useRef<HTMLDivElement | null>(null);
  const frameSkip = useRef(0);

  useEffect(() => {
    const layer = labelLayer;
    if (!layer) return;

    layer.innerHTML = '';
    nodes.current.clear();

    const userTag = document.createElement('div');
    userTag.className = 'name-tag user-desk-tag';
    userTag.textContent = '👤 Вы · Заказчик';
    userTag.style.borderColor = '#94a3b8';
    layer.appendChild(userTag);
    userTagRef.current = userTag;

    for (const id of AGENT_IDS) {
      const meta = AGENTS[id];
      const bubble = document.createElement('div');
      bubble.className = 'head-bubble hidden';
      bubble.innerHTML = `<span class="head-bubble-name">${meta.name}</span><span></span>`;

      const tag = document.createElement('div');
      tag.className = 'name-tag';
      tag.textContent = `${meta.emoji} ${meta.name}`;
      tag.style.borderColor = meta.color;

      layer.appendChild(bubble);
      layer.appendChild(tag);
      nodes.current.set(id, { bubble, tag });
    }

    return () => {
      layer.innerHTML = '';
      nodes.current.clear();
    };
  }, []);

  useFrame(() => {
    const layer = labelLayer;
    if (!layer) return;

    frameSkip.current += 1;
    if (frameSkip.current % 2 !== 0) return;

    if (userTagRef.current) {
      vec.current.set(USER_DESK.x, 1.75, USER_DESK.z);
      vec.current.project(camera);
      const ux = (vec.current.x * 0.5 + 0.5) * size.width;
      const uy = (-vec.current.y * 0.5 + 0.5) * size.height;
      const uvis = vec.current.z < 1;
      userTagRef.current.style.transform = `translate(-50%, 0) translate(${ux}px, ${uy + 8}px)`;
      userTagRef.current.style.opacity = uvis ? '1' : '0';
    }

    for (const id of AGENT_IDS) {
      const agent = state.agents[id];
      const meta = AGENTS[id];
      const node = nodes.current.get(id);
      if (!node) continue;

      vec.current.set(agent.pos.x, 1.75, agent.pos.z);
      vec.current.project(camera);

      const x = (vec.current.x * 0.5 + 0.5) * size.width;
      const y = (-vec.current.y * 0.5 + 0.5) * size.height;
      const visible = vec.current.z < 1 && x > 0 && x < size.width && y > 0 && y < size.height;

      const talking = agent.talkingGlow > 0.08 || agent.state === 'talking';
      node.tag.classList.toggle('talking', talking);
      node.tag.style.setProperty('--accent', meta.color);
      node.tag.style.transform = `translate(-50%, 0) translate(${x}px, ${y + 8}px)`;
      node.tag.style.opacity = visible ? '1' : '0';

      if (agent.bubbleVisible && agent.bubbleText) {
        node.bubble.classList.remove('hidden');
        const textEl = node.bubble.querySelector('span:last-child');
        if (textEl) textEl.textContent = agent.bubbleText;
        node.bubble.style.transform = `translate(-50%, -100%) translate(${x}px, ${y - 18}px)`;
        node.bubble.style.opacity = visible ? '1' : '0';
      } else {
        node.bubble.classList.add('hidden');
        node.bubble.style.opacity = '0';
      }
    }
  });

  return null;
}
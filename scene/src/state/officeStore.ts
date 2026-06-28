import {
  AGENT_IDS,
  DESK,
  MEETING,
  USER_DESK,
  VISIT_TARGETS,
  type AgentId,
  type AgentMeta,
  type AgentState,
} from '../constants';

export interface AgentRuntime {
  id: AgentId;
  meta: AgentMeta;
  state: AgentState;
  target: { x: number; z: number };
  pos: { x: number; z: number };
  rot: number;
  typing: boolean;
  typingPhase: number;
  visitCooldown: number;
  visitIndex: number;
  bubbleText: string | null;
  bubbleVisible: boolean;
  talkingGlow: number;
  headTurn: number;
  idlePhase: number;
}

export interface OfficeStoreState {
  agents: Record<AgentId, AgentRuntime>;
  meetingActive: boolean;
  screenIntensity: Record<AgentId, number>;
  version: number;
}

type Listener = () => void;

function createAgent(id: AgentId): AgentRuntime {
  const desk = DESK[id];
  return {
    id,
    meta: { name: '', emoji: '', color: '' },
    state: 'idle',
    target: { x: desk.x, z: desk.z },
    pos: { x: desk.x, z: desk.z },
    rot: desk.rot,
    typing: false,
    typingPhase: 0,
    visitCooldown: 0,
    visitIndex: 0,
    bubbleText: null,
    bubbleVisible: false,
    talkingGlow: 0,
    headTurn: 0,
    idlePhase: Math.random() * Math.PI * 2,
  };
}

export function createInitialState(meta: Record<AgentId, AgentMeta>): OfficeStoreState {
  const agents = {} as Record<AgentId, AgentRuntime>;
  const screenIntensity = {} as Record<AgentId, number>;
  for (const id of AGENT_IDS) {
    const a = createAgent(id);
    a.meta = meta[id];
    agents[id] = a;
    screenIntensity[id] = 0.2;
  }
  return { agents, meetingActive: false, screenIntensity, version: 0 };
}

export class OfficeStore {
  private state: OfficeStoreState;
  private listeners = new Set<Listener>();

  constructor(meta: Record<AgentId, AgentMeta>) {
    this.state = createInitialState(meta);
  }

  getState() {
    return this.state;
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private bump() {
    this.state = { ...this.state, version: this.state.version + 1 };
    this.listeners.forEach((fn) => fn());
  }

  private patchAgent(id: AgentId, patch: Partial<AgentRuntime>) {
    this.state.agents[id] = { ...this.state.agents[id], ...patch };
    this.bump();
  }

  walkTo(id: AgentId, x: number, z: number, state: AgentState = 'walking') {
    this.patchAgent(id, { target: { x, z }, state });
  }

  goToDesk(id: AgentId) {
    const d = DESK[id];
    this.patchAgent(id, { target: { x: d.x, z: d.z }, rot: d.rot, state: 'walking' });
  }

  goToMeeting(id: AgentId) {
    const m = MEETING[id];
    const rot = Math.atan2(-m.x, -m.z + 0.01);
    this.patchAgent(id, { target: { x: m.x, z: m.z }, rot, state: 'walking' });
  }

  setTyping(id: AgentId, on: boolean) {
    this.state.screenIntensity[id] = on ? 0.9 : 0.2;
    this.patchAgent(id, { typing: on, state: on ? 'typing' : 'idle' });
    if (on) this.goToDesk(id);
  }

  setScreenIntensity(id: AgentId, v: number) {
    this.state.screenIntensity[id] = v;
    this.bump();
  }

  showBubble(id: AgentId, text: string) {
    const short = text.length > 90 ? `${text.slice(0, 87)}…` : text;
    this.patchAgent(id, { bubbleText: short, bubbleVisible: true, talkingGlow: 1 });
  }

  hideBubble(id: AgentId) {
    this.patchAgent(id, { bubbleVisible: false, talkingGlow: 0 });
  }

  setMeeting(active: boolean) {
    this.state.meetingActive = active;
    this.bump();
  }

  gatherAtMeeting() {
    this.setMeeting(true);
    AGENT_IDS.forEach((id) => this.goToMeeting(id));
    setTimeout(() => this.setMeeting(false), 12000);
  }

  scatterToDesks() {
    this.setMeeting(false);
    AGENT_IDS.forEach((id) => this.goToDesk(id));
  }

  visitUser(fromId: AgentId) {
    const a = this.state.agents[fromId];
    const offset = 0.85;
    this.walkTo(
      fromId,
      USER_DESK.x + offset * Math.sin(USER_DESK.rot),
      USER_DESK.z + offset * Math.cos(USER_DESK.rot),
      'visiting'
    );
    this.patchAgent(fromId, {
      rot: Math.atan2(USER_DESK.x - a.pos.x, USER_DESK.z - a.pos.z) + Math.PI,
      state: 'talking',
      talkingGlow: 0.8,
    });
  }

  leaveUser(fromId: AgentId) {
    this.hideBubble(fromId);
    this.patchAgent(fromId, { talkingGlow: 0 });
    this.goToDesk(fromId);
  }

  visitColleague(fromId: AgentId) {
    const a = this.state.agents[fromId];
    if (this.state.meetingActive) return;
    const targets = VISIT_TARGETS[fromId];
    const toId = targets[a.visitIndex % targets.length];
    this.patchAgent(fromId, { visitIndex: a.visitIndex + 1 });
    const desk = DESK[toId];
    const offset = 0.9;
    this.walkTo(
      fromId,
      desk.x + offset * Math.sign(desk.x || 1),
      desk.z + 0.5,
      'visiting'
    );
    this.patchAgent(fromId, {
      rot: Math.atan2(desk.x - a.pos.x, desk.z - a.pos.z) + Math.PI,
    });
    setTimeout(() => this.goToDesk(fromId), 6000);
  }

  onMessage(id: AgentId, text: string) {
    this.setTyping(id, true);
    this.showBubble(id, text);
    const a = this.state.agents[id];
    if (Math.random() < 0.35 && a.visitCooldown <= 0) {
      this.patchAgent(id, { visitCooldown: 14 });
      setTimeout(() => this.visitColleague(id), 1200);
    }
    setTimeout(() => this.setTyping(id, false), 5000 + Math.random() * 3000);
    setTimeout(() => this.hideBubble(id), 9000);
  }

  onStatus(id: AgentId, status: string) {
    if (status === 'thinking' || status === 'working') {
      this.setTyping(id, true);
      this.goToDesk(id);
    } else if (status === 'talking') {
      if (this.state.meetingActive) this.goToMeeting(id);
      else this.goToDesk(id);
      this.patchAgent(id, { talkingGlow: 0.6 });
    } else if (status === 'idle') {
      this.setTyping(id, false);
      this.patchAgent(id, { talkingGlow: 0 });
    }
  }

  tickAgentMotion(id: AgentId, dt: number, elapsed: number): boolean {
    const a = this.state.agents[id];
    let changed = false;
    const speed = a.state === 'visiting' ? 3.2 : 2.4;
    const dx = a.target.x - a.pos.x;
    const dz = a.target.z - a.pos.z;
    const dist = Math.hypot(dx, dz);
    let pos = { ...a.pos };
    let state = a.state;
    let rot = a.rot;
    let yBob = 0;

    if (dist > 0.06) {
      const step = Math.min(dist, speed * dt);
      pos.x += (dx / dist) * step;
      pos.z += (dz / dist) * step;
      if (state === 'walking' || state === 'visiting') {
        rot = Math.atan2(dx, dz);
        yBob = Math.abs(Math.sin(elapsed * 12)) * 0.06;
      }
      changed = true;
    } else {
      pos = { x: a.target.x, z: a.target.z };
      if (state === 'walking') state = a.typing ? 'typing' : 'idle';
      changed = true;
    }

    let typingPhase = a.typingPhase;
    if (a.typing) {
      typingPhase += dt * 9;
      yBob = Math.sin(typingPhase * 0.5) * 0.02;
      changed = true;
    }

    let visitCooldown = a.visitCooldown;
    if (visitCooldown > 0) {
      visitCooldown = Math.max(0, visitCooldown - dt);
      changed = true;
    }

    let talkingGlow = a.talkingGlow;
    if (talkingGlow > 0 && !a.bubbleVisible) {
      talkingGlow = Math.max(0, talkingGlow - dt * 0.3);
      changed = true;
    }

    if (changed) {
      this.state.agents[id] = {
        ...a,
        pos,
        state,
        rot,
        typingPhase,
        visitCooldown,
        talkingGlow,
        idlePhase: a.idlePhase + dt,
      };
      return true;
    }
    return false;
  }

  tickAllMotion(dt: number, elapsed: number) {
    let any = false;
    for (const id of AGENT_IDS) {
      if (this.tickAgentMotion(id, dt, elapsed)) any = true;
    }
    if (any) this.bump();
  }
}
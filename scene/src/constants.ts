export type AgentId =
  | 'orchestrator'
  | 'designer'
  | 'frontend'
  | 'backend'
  | 'owencloud';

export type AgentState = 'idle' | 'walking' | 'typing' | 'visiting' | 'talking';

export interface AgentMeta {
  name: string;
  emoji: string;
  color: string;
}

export const AGENTS: Record<AgentId, AgentMeta> = {
  orchestrator: { name: 'Оркестратор', emoji: '🎯', color: '#8b5cf6' },
  designer: { name: 'Дизайнер', emoji: '🎨', color: '#ec4899' },
  frontend: { name: 'Фронтенд', emoji: '⚡', color: '#06b6d4' },
  backend: { name: 'Бэкенд', emoji: '🔧', color: '#22c55e' },
  owencloud: { name: 'OwenCloud', emoji: '🏭', color: '#f59e0b' },
};

export const AGENT_IDS = Object.keys(AGENTS) as AgentId[];

export const USER_DESK = { x: 0, z: 5.8, rot: Math.PI } as const;

export const DESK: Record<AgentId, { x: number; z: number; rot: number }> = {
  orchestrator: { x: 0, z: -6.2, rot: 0 },
  designer: { x: -7.2, z: 3.2, rot: Math.PI * 0.12 },
  frontend: { x: 7.2, z: 3.2, rot: -Math.PI * 0.12 },
  backend: { x: -7.2, z: -5.2, rot: Math.PI * 0.08 },
  owencloud: { x: 7.2, z: -5.2, rot: -Math.PI * 0.08 },
};

export const MEETING: Record<AgentId, { x: number; z: number }> = {
  orchestrator: { x: 0, z: -1.8 },
  designer: { x: -2.4, z: 0.6 },
  frontend: { x: 2.4, z: 0.6 },
  backend: { x: -2.4, z: -1.2 },
  owencloud: { x: 2.4, z: -1.2 },
};

export const VISIT_TARGETS: Record<AgentId, AgentId[]> = {
  orchestrator: ['designer', 'frontend', 'backend', 'owencloud'],
  designer: ['orchestrator', 'frontend'],
  frontend: ['designer', 'backend'],
  backend: ['frontend', 'owencloud'],
  owencloud: ['backend', 'orchestrator'],
};

export const CUBICLES: Array<[number, number, number, string, AgentId]> = [
  [0, -6, 0, '#8b5cf6', 'orchestrator'],
  [-7, 3, 0.3, '#ec4899', 'designer'],
  [7, 3, -0.3, '#06b6d4', 'frontend'],
  [-7, -5, 0.2, '#22c55e', 'backend'],
  [7, -5, -0.2, '#f59e0b', 'owencloud'],
];

export const BLOOM_LAYER = 1;

export type QualityTier = 'high' | 'medium' | 'low';

export { detectQualityTier, getQualityProfile } from './quality';
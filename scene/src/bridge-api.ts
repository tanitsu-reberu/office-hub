import type { AgentId } from './constants';

export interface Office3DApi {
  init: (el: HTMLElement, labelsEl: HTMLElement | null, notifyEl: HTMLElement | null) => boolean;
  destroy: () => void;
  gatherAtMeeting: () => void;
  scatterToDesks: () => void;
  onMessage: (agentId: string, text: string, meta?: Record<string, unknown>) => void;
  onStatus: (agentId: string, status: string) => void;
  goToDesk: (id: string) => void;
  visitColleague: (id: string) => void;
  pushTopNotification: (meta: Record<string, unknown>, text: string) => void;
  clearNotifications: () => void;
  resetCamera: () => void;
  focusAgent: (id: string) => void;
  setAgentDeskClickHandler: (fn: ((id: string) => void) | null) => void;
  onQuestion: (agentId: string, payload: Record<string, unknown>) => void;
  onQuestionAnswered: (agentId: string) => void;
  onAction: (agentId: string, payload: Record<string, unknown>) => void;
  onActionResolved: (agentId: string) => void;
  getGfxTier?: () => string;
}

export function isAgentId(id: string): id is AgentId {
  return ['orchestrator', 'designer', 'frontend', 'backend', 'owencloud'].includes(id);
}
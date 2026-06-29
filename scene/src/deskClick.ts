import type { AgentId } from './constants';
import { isAgentId } from './bridge-api';

let onAgentDeskClick: ((id: AgentId) => void) | null = null;

export function setAgentDeskClickHandler(fn: ((id: AgentId) => void) | null) {
  onAgentDeskClick = typeof fn === 'function' ? fn : null;
}

export function invokeAgentDeskClick(id: string) {
  if (!isAgentId(id)) return;
  onAgentDeskClick?.(id);
}
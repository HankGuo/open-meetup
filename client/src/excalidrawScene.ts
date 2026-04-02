import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import { PageContent } from './types';

export function getInitialExcalidrawData(content: PageContent | undefined): ExcalidrawInitialDataState {
  if (!content || content.type !== 'canvas') {
    return { elements: [] };
  }

  const parsed = safeParseJson(content.content);
  if (!isExcalidrawData(parsed)) {
    return { elements: [] };
  }

  return parsed;
}

function safeParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isExcalidrawData(value: unknown): value is ExcalidrawInitialDataState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return Array.isArray(record.elements);
}

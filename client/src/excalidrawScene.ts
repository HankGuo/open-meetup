import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawInitialDataState } from '@excalidraw/excalidraw/types';
import { PageContent } from './types';

interface LegacyCanvasBlock {
  type?: string;
  title?: string;
  url?: string;
  html?: string;
  text?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
}

interface LegacyCanvasDocument {
  blocks?: LegacyCanvasBlock[];
}

export function getInitialExcalidrawData(content: PageContent | undefined): ExcalidrawInitialDataState {
  if (!content) {
    return { elements: [] };
  }

  if (content.type === 'canvas') {
    const parsed = safeParseJson(content.content);
    if (isExcalidrawData(parsed)) {
      return parsed;
    }
    const maybeLegacyCanvas = parsed as LegacyCanvasDocument | null;
    if (maybeLegacyCanvas?.blocks?.length) {
      return convertLegacyBlocksToScene(maybeLegacyCanvas.blocks);
    }
  }

  return convertSingleContentToScene(content);
}

function convertSingleContentToScene(content: PageContent): ExcalidrawInitialDataState {
  if (content.type === 'canvas') {
    return { elements: [] };
  }

  const block: LegacyCanvasBlock = {
    type: content.type,
    x: 120,
    y: 100,
    w: 980,
    h: 560,
  };

  if (content.type === 'markdown') {
    block.text = content.content;
  } else if (content.type === 'html') {
    if (looksLikeUrl(content.content)) {
      block.url = content.content;
    } else {
      block.html = content.content;
    }
  } else {
    block.url = content.content;
  }

  return convertLegacyBlocksToScene([block]);
}

function convertLegacyBlocksToScene(blocks: LegacyCanvasBlock[]): ExcalidrawInitialDataState {
  const skeletons = [] as Array<Record<string, unknown>>;

  for (const block of blocks) {
    const x = normalizeNumber(block.x, 120);
    const y = normalizeNumber(block.y, 100);
    const width = normalizeNumber(block.w, 900);
    const height = normalizeNumber(block.h, 520);
    const typeLabel = normalizeLabel(block.type);
    const title = (block.title || typeLabel).trim();
    const details = summarizeBlock(block);
    const link = extractLink(block);

    skeletons.push({
      type: 'rectangle',
      x,
      y,
      width,
      height,
      roundness: { type: 3 },
      strokeColor: '#1e1e1e',
      backgroundColor: '#f8fafc',
      fillStyle: 'solid',
      link,
    });

    skeletons.push({
      type: 'text',
      x: x + 20,
      y: y + 20,
      text: `${title}\n\n${details}`,
      fontSize: 20,
      width: Math.max(120, width - 40),
      height: Math.max(80, height - 40),
      lineHeight: 1.25,
    });
  }

  const elements = convertToExcalidrawElements(skeletons as Parameters<typeof convertToExcalidrawElements>[0]);
  return {
    elements,
    appState: {
      viewBackgroundColor: '#ffffff',
    },
  };
}

function summarizeBlock(block: LegacyCanvasBlock): string {
  if (block.type === 'markdown') {
    const text = (block.text || '').trim();
    return text || 'Markdown 文本块';
  }
  if (block.type === 'html') {
    if (block.url) {
      return block.url;
    }
    const html = (block.html || '').trim();
    return html ? html.slice(0, 300) : 'HTML 内容块';
  }
  if (block.url) {
    return block.url;
  }
  return '内容块';
}

function extractLink(block: LegacyCanvasBlock): string | undefined {
  if (block.url && looksLikeUrl(block.url)) {
    return block.url;
  }
  return undefined;
}

function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith('/uploads/')) {
    return true;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeLabel(type: string | undefined): string {
  if (type === 'web' || type === 'url') {
    return '网页块';
  }
  if (type === 'image') {
    return '图片块';
  }
  if (type === 'html') {
    return 'HTML 块';
  }
  if (type === 'markdown') {
    return 'Markdown 块';
  }
  return '内容块';
}

function normalizeNumber(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return value;
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

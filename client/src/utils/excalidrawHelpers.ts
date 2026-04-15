import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';

export type SceneElements = ReturnType<ExcalidrawImperativeAPI['getSceneElements']>;
export type SceneAppState = ReturnType<ExcalidrawImperativeAPI['getAppState']>;

export const LOCKED_SCROLL_EPSILON = 0.5;
export const LOCKED_ZOOM_VALUE = 1;
export const MIN_VIEWPORT_SIZE = 1;

export function isSupportedEmbeddableUrl(link: string): boolean {
  try {
    const parsed = new URL(link);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function lockViewportAppState<T extends { scrollX: number; scrollY: number; zoom: { value: number } }>(
  appState: T,
): T;
export function lockViewportAppState(appState: null | undefined): undefined;
export function lockViewportAppState<T extends { scrollX: number; scrollY: number; zoom: { value: number } }>(
  appState: T | null | undefined,
): T | undefined {
  if (!appState) {
    return undefined;
  }

  const shouldLock =
    Math.abs(appState.scrollX) > LOCKED_SCROLL_EPSILON ||
    Math.abs(appState.scrollY) > LOCKED_SCROLL_EPSILON ||
    Math.abs(appState.zoom.value - LOCKED_ZOOM_VALUE) > 0.001;

  if (!shouldLock) {
    return appState;
  }

  return {
    ...appState,
    scrollX: 0,
    scrollY: 0,
    zoom: { value: LOCKED_ZOOM_VALUE as T['zoom']['value'] },
  };
}

export function constrainElementsToViewport(elements: SceneElements, appState: SceneAppState): SceneElements {
  const viewportWidth = Math.floor(appState.width);
  const viewportHeight = Math.floor(appState.height);
  if (
    !Number.isFinite(viewportWidth) ||
    !Number.isFinite(viewportHeight) ||
    viewportWidth < MIN_VIEWPORT_SIZE ||
    viewportHeight < MIN_VIEWPORT_SIZE
  ) {
    return elements;
  }

  let changed = false;
  const constrained = elements.map((element) => {
    if (element.isDeleted) {
      return element;
    }

    const elementWidth = Math.max(0, Math.abs(element.width ?? 0));
    const elementHeight = Math.max(0, Math.abs(element.height ?? 0));
    const maxX = Math.max(0, viewportWidth - elementWidth);
    const maxY = Math.max(0, viewportHeight - elementHeight);

    const clampedX = clampNumber(element.x, 0, maxX);
    const clampedY = clampNumber(element.y, 0, maxY);
    if (clampedX === element.x && clampedY === element.y) {
      return element;
    }

    changed = true;
    return {
      ...element,
      x: clampedX,
      y: clampedY,
    };
  }) as SceneElements;

  return changed ? constrained : elements;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

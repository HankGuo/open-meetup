import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useMeeting } from '../context/MeetingContext';
import { getInitialExcalidrawData } from '../excalidrawScene';

interface ContentViewerProps {
  pageId: string;
  pageIndex: number;
}

const ExcalidrawCanvas = lazy(() =>
  import('@excalidraw/excalidraw').then((module) => ({ default: module.Excalidraw })),
);

type SceneElements = ReturnType<ExcalidrawImperativeAPI['getSceneElements']>;
type SceneAppState = ReturnType<ExcalidrawImperativeAPI['getAppState']>;

const LOCKED_SCROLL_EPSILON = 0.5;
const LOCKED_ZOOM_VALUE = 1;
const MIN_VIEWPORT_SIZE = 1;

export function ContentViewer({ pageId, pageIndex }: ContentViewerProps) {
  const { pageContents } = useMeeting();
  const [sceneVersion, setSceneVersion] = useState(0);
  const lockingSceneRef = useRef(false);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const content = pageContents.get(pageId);
  const hasSavedContent = Boolean(content?.content?.trim());

  const initialData = useMemo(() => getInitialExcalidrawData(content), [content]);
  const sceneKey = `${pageIndex}-${sceneVersion}`;

  useEffect(() => {
    // Excalidraw only consumes initialData on mount.
    // Remount viewer scene whenever server-synced content changes.
    setSceneVersion((prev) => prev + 1);
  }, [content, pageIndex, pageId]);

  return (
    <div className="h-full w-full p-3 md:p-4">
      <section className="playback-excalidraw relative h-full w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(170deg,var(--panel-light),var(--panel-soft))] shadow-[var(--shadow-1)]">
        <div className="pointer-events-none absolute right-3 top-3 z-10">
          <span className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-2.5 py-1 text-xs font-medium text-[var(--text-soft)]">
            第 {pageIndex + 1} 页
          </span>
        </div>

        {!hasSavedContent ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--text-soft)]">
              主持人尚未在本页放置内容
            </div>
          </div>
        ) : null}

        <div className="h-full w-full">
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center text-sm text-[var(--text-soft)]">画布加载中...</div>
            }
          >
            <ExcalidrawCanvas
              key={sceneKey}
              initialData={initialData}
              viewModeEnabled={true}
              zenModeEnabled={true}
              gridModeEnabled={false}
              validateEmbeddable={isSupportedEmbeddableUrl}
              excalidrawAPI={(api) => {
                excalidrawApiRef.current = api;
                lockViewerScene(api, lockingSceneRef);
              }}
              onChange={(elements, appState) => {
                lockViewerScene(excalidrawApiRef.current, lockingSceneRef, elements, appState);
              }}
              UIOptions={{
                canvasActions: {
                  changeViewBackgroundColor: false,
                  clearCanvas: false,
                  export: false,
                  loadScene: false,
                  saveToActiveFile: false,
                  saveAsImage: false,
                  toggleTheme: false,
                },
              }}
            />
          </Suspense>
        </div>
      </section>
    </div>
  );
}

function isSupportedEmbeddableUrl(link: string): boolean {
  try {
    const parsed = new URL(link);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function lockViewerScene(
  api: ExcalidrawImperativeAPI | null,
  lockingRef: MutableRefObject<boolean>,
  currentElements?: SceneElements,
  currentAppState?: SceneAppState,
) {
  if (!api || lockingRef.current) {
    return;
  }

  const appState = currentAppState || api.getAppState();
  const normalizedAppState = lockViewportAppState(appState);
  const elements = currentElements || api.getSceneElements();
  const constrainedElements = constrainElementsToViewport(elements, normalizedAppState);

  const appStateChanged = normalizedAppState !== appState;
  const elementsChanged = constrainedElements !== elements;
  if (!appStateChanged && !elementsChanged) {
    return;
  }

  lockingRef.current = true;
  api.updateScene({
    ...(appStateChanged ? { appState: normalizedAppState } : {}),
    ...(elementsChanged ? { elements: constrainedElements } : {}),
  });
  requestAnimationFrame(() => {
    lockingRef.current = false;
  });
}

function lockViewportAppState<T extends { scrollX: number; scrollY: number; zoom: { value: number } }>(appState: T): T {
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

function constrainElementsToViewport(elements: SceneElements, appState: SceneAppState): SceneElements {
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

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  if (max < min) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

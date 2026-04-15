import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import { useMeeting } from '../context/MeetingContext';
import { getInitialExcalidrawData } from '../excalidrawScene';
import {
  constrainElementsToViewport,
  isSupportedEmbeddableUrl,
  lockViewportAppState,
  type SceneAppState,
  type SceneElements,
} from '../utils/excalidrawHelpers';

interface ContentViewerProps {
  pageId: string;
  pageIndex: number;
  pageTitle: string;
  totalPages: number;
}

const ExcalidrawCanvas = lazy(() =>
  import('@excalidraw/excalidraw').then((module) => ({ default: module.Excalidraw })),
);

export function ContentViewer({ pageId, pageIndex, pageTitle, totalPages }: ContentViewerProps) {
  const { pageContents } = useMeeting();
  const [sceneVersion, setSceneVersion] = useState(0);
  const lockingSceneRef = useRef(false);
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const content = pageContents.get(pageId);
  const hasSavedContent = Boolean(content?.content?.trim());

  const initialData = useMemo(() => getInitialExcalidrawData(content), [content]);
  const sceneKey = `${pageIndex}-${sceneVersion}`;

  useEffect(() => {
    setSceneVersion((prev) => prev + 1);
  }, [content, pageIndex, pageId]);

  return (
    <div className="h-full w-full p-3 md:p-4">
      <section className="playback-excalidraw relative h-full w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[linear-gradient(170deg,var(--panel-light),var(--panel-soft))] shadow-[var(--shadow-1)]">
        <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[78%] items-center gap-2">
          <span className="status-pill shrink-0">
            第 {pageIndex + 1} / {totalPages} 页
          </span>
          <span className="status-pill truncate" title={pageTitle}>
            {pageTitle}
          </span>
        </div>

        {!hasSavedContent ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-sm text-[var(--text-soft)]">
              主持人尚未在本页配置内容
            </div>
          </div>
        ) : null}

        <div className="h-full w-full">
          <Suspense
            fallback={
              <div className="flex h-full w-full items-center justify-center text-sm text-[var(--text-soft)]">
                画布加载中...
              </div>
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

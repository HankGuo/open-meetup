import type { ReactNode } from 'react';
import { useMeeting } from '../context/MeetingContext';
import { getDefaultPageTitle } from '../pageCatalog';
import { ContentViewer } from './ContentViewer';
import { ParticipantRosterBar } from './ParticipantRosterBar';
import { ShowcasePage } from './ShowcasePage';

interface MeetingStageProps {
  topActions?: ReactNode;
}

export function MeetingStage({ topActions }: MeetingStageProps) {
  const { currentStep, pages } = useMeeting();
  const currentPage = pages[currentStep];
  const pageTitle =
    currentPage?.title?.trim() || (currentPage ? getDefaultPageTitle(currentPage.kind) : '自由画布');

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden pt-11 md:pt-12">
      <ParticipantRosterBar topActions={topActions} />

      <div className="mx-auto flex min-h-0 w-full max-w-[1480px] flex-1 px-3 pb-4 md:px-5">
        {!currentPage && (
          <div className="glass-panel flex h-full w-full items-center justify-center">
            <p className="text-sm text-[var(--text-soft)]">内容加载中...</p>
          </div>
        )}

        {currentPage?.kind === 'showcase' && (
          <div className="flex-1 min-h-0">
            <ShowcasePage />
          </div>
        )}

        {currentPage?.kind === 'canvas' && (
          <div className="flex-1 min-h-0">
            <ContentViewer
              pageId={currentPage.id}
              pageIndex={currentStep}
              pageTitle={pageTitle}
              totalPages={pages.length}
            />
          </div>
        )}
      </div>
    </div>
  );
}

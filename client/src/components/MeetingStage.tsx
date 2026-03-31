import type { ReactNode } from 'react';
import { useMeeting } from '../context/MeetingContext';
import { ContentViewer } from './ContentViewer';
import { ParticipantRosterBar } from './ParticipantRosterBar';
import { SelfIntroPage } from './SelfIntroPage';
import { ShowcasePage } from './ShowcasePage';

interface MeetingStageProps {
  topActions?: ReactNode;
}

export function MeetingStage({ topActions }: MeetingStageProps) {
  const { currentStep, pages } = useMeeting();
  const currentPage = pages[currentStep];
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden pt-11 md:pt-12">
      <ParticipantRosterBar topActions={topActions} />

      {!currentPage && (
        <div className="flex flex-1 items-center justify-center bg-[var(--panel-soft)]">
          <p className="text-sm text-[var(--text-soft)]">内容加载中...</p>
        </div>
      )}

      {currentPage?.kind === 'selfIntro' && (
        <div className="flex-1 min-h-0">
          <SelfIntroPage />
        </div>
      )}

      {currentPage?.kind === 'showcase' && (
        <div className="flex-1 min-h-0">
          <ShowcasePage />
        </div>
      )}

      {currentPage?.kind === 'canvas' && (
        <div className="flex-1 min-h-0">
          <ContentViewer pageId={currentPage.id} pageIndex={currentStep} />
        </div>
      )}
    </div>
  );
}

import { useMeeting } from '../context/MeetingContext';
import { ContentViewer } from './ContentViewer';
import { ParticipantRosterBar } from './ParticipantRosterBar';
import { SelfIntroPage } from './SelfIntroPage';
import { ShowcasePage } from './ShowcasePage';

export function MeetingStage() {
  const { currentStep, pages } = useMeeting();
  const currentPage = pages[currentStep];
  return (
    <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
      <ParticipantRosterBar pageTitle={currentPage?.title} />

      {!currentPage && (
        <div className="flex-1 flex items-center justify-center bg-gray-50">
          <p className="text-gray-400">内容加载中...</p>
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

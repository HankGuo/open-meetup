import { useState } from 'react';
import { useMeeting } from '../context/MeetingContext';
import { MeetingStage } from '../components/MeetingStage';
import { HostControls } from '../components/HostControls';
import { HostSetupBoard } from '../components/HostSetupBoard';
import { ArrowLeftCircle, LogOut, XCircle } from 'lucide-react';

export function HostPage() {
  const { leaveRoom, endRoom, phase, returnToSetup, pages, currentStep } = useMeeting();
  const [setupFocusPageId, setSetupFocusPageId] = useState<string | null>(null);

  async function handleEndRoom() {
    if (!confirm('确定要结束房间吗？结束后所有用户都将被退出。')) {
      return;
    }
    await endRoom();
  }

  async function handleReturnToSetup() {
    const focusedPageId = pages[currentStep]?.id || null;
    setSetupFocusPageId(focusedPageId);
    await returnToSetup();
  }

  const liveTopActions = (
    <>
      <button
        type="button"
        onClick={() => void leaveRoom()}
        aria-label="退出"
        title="退出"
        className="stage-action-btn"
      >
        <LogOut className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={handleReturnToSetup}
        aria-label="返回编辑页"
        title="返回编辑页"
        className="stage-action-btn stage-action-btn--accent"
      >
        <ArrowLeftCircle className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={handleEndRoom}
        aria-label="结束房间"
        title="结束房间"
        className="stage-action-btn stage-action-btn--danger"
      >
        <XCircle className="h-3.5 w-3.5" />
      </button>
    </>
  );

  return (
    <div className="page-enter relative flex h-full w-full flex-col overflow-hidden">
      {phase === 'setup' ? (
        <HostSetupBoard defaultSelectedPageId={setupFocusPageId} />
      ) : (
        <MeetingStage topActions={liveTopActions} />
      )}

      {phase === 'live' ? <HostControls /> : null}
    </div>
  );
}

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

  return (
    <div className="h-full w-full overflow-hidden flex flex-col bg-gray-900">
      {phase === 'setup' ? <HostSetupBoard defaultSelectedPageId={setupFocusPageId} /> : <MeetingStage />}

      {phase === 'live' ? <HostControls /> : null}

      {phase === 'live' ? (
        <button
          onClick={handleReturnToSetup}
          className="absolute right-40 top-20 z-30 flex items-center gap-2 rounded-md bg-amber-500/90 px-4 py-2 text-white transition-colors hover:bg-amber-500"
        >
          <ArrowLeftCircle className="h-4 w-4" />
          返回编辑页
        </button>
      ) : null}

      <button
        onClick={handleEndRoom}
        className="absolute right-4 top-20 z-30 flex items-center gap-2 rounded-md bg-red-600/80 px-4 py-2 text-white transition-colors hover:bg-red-600"
      >
        <XCircle className="w-4 h-4" />
        结束房间
      </button>

      <button
        onClick={() => void leaveRoom()}
        className="absolute left-4 top-20 z-30 flex items-center gap-2 rounded-md bg-white/10 px-4 py-2 text-white transition-colors hover:bg-white/20"
      >
        <LogOut className="w-4 h-4" />
        退出
      </button>
    </div>
  );
}

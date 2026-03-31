import { useMeeting } from '../context/MeetingContext';
import { MeetingStage } from '../components/MeetingStage';
import { LogOut } from 'lucide-react';

export function ParticipantPage() {
  const { leaveRoom, phase, title } = useMeeting();

  const liveTopActions = (
    <button
      type="button"
      onClick={() => void leaveRoom()}
      aria-label="退出"
      title="退出"
      className="stage-action-btn"
    >
      <LogOut className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className="page-enter relative flex h-full w-full flex-col overflow-hidden">
      {phase === 'setup' ? (
        <div className="flex h-full w-full items-center justify-center px-6">
          <div className="glass-panel max-w-lg p-8 text-center">
            <p className="status-pill mx-auto w-max border-[var(--border-light)] bg-[var(--panel-light)] text-[var(--accent)]">准备中</p>
            <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">{title || '会议'}</h2>
            <p className="mt-3 text-sm text-[var(--text-soft)]">主持人正在编排页面，确认后会自动进入播放环节。</p>
          </div>
        </div>
      ) : (
        <MeetingStage topActions={liveTopActions} />
      )}
    </div>
  );
}

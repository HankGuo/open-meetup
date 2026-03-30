import { useMeeting } from '../context/MeetingContext';
import { MeetingStage } from '../components/MeetingStage';
import { LogOut } from 'lucide-react';

export function ParticipantPage() {
  const { leaveRoom, phase, title } = useMeeting();

  return (
    <div className="h-full w-full overflow-hidden flex flex-col bg-gray-900">
      {phase === 'setup' ? (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 p-6">
          <div className="max-w-lg rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white backdrop-blur">
            <p className="text-xs uppercase tracking-[0.22em] text-emerald-300">准备中</p>
            <h2 className="mt-2 text-2xl font-semibold">{title || '会议'}</h2>
            <p className="mt-3 text-sm text-slate-200">主持人正在编排页面，确认后会自动进入播放环节。</p>
          </div>
        </div>
      ) : (
        <MeetingStage />
      )}

      <button
        onClick={() => void leaveRoom()}
        className="absolute top-20 right-4 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors z-20"
      >
        <LogOut className="w-4 h-4" />
        退出
      </button>
    </div>
  );
}

import { useMeeting } from '../context/MeetingContext';
import { MeetingStage } from '../components/MeetingStage';
import { LogOut } from 'lucide-react';

export function ParticipantPage() {
  const { leaveRoom, myTicket, currentStep } = useMeeting();

  return (
    <div className="min-h-screen bg-gray-900 relative">
      <MeetingStage />

      {myTicket && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-white/70 text-sm">
          您的Ticket: <span className="font-mono font-bold text-yellow-400">{myTicket}</span>
        </div>
      )}

      <button
        onClick={() => void leaveRoom()}
        className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-md transition-colors"
      >
        <LogOut className="w-4 h-4" />
        退出
      </button>

      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white/50 text-sm">
        第 {currentStep + 1} / 5 页
      </div>
    </div>
  );
}
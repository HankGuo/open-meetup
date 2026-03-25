import { useMeeting } from '../context/MeetingContext';
import { MeetingStage } from '../components/MeetingStage';
import { ParticipantList } from '../components/ParticipantList';
import { LogOut, Copy } from 'lucide-react';

export function ParticipantPage() {
  const { roomId, leaveRoom, myName, status, currentStep } = useMeeting();

  async function copyRoomId() {
    try {
      await navigator.clipboard.writeText(roomId);
      alert('房间ID已复制到剪贴板');
    } catch {
      alert('复制失败，请手动复制房间ID');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Open Meetup</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-gray-500">房间ID: </span>
              <code className="px-2 py-1 bg-gray-200 rounded text-sm font-mono">
                {roomId}
              </code>
              <button
                onClick={copyRoomId}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="复制房间ID"
              >
                <Copy className="w-4 h-4 text-gray-500" />
              </button>
              <span className="text-sm text-gray-500">•</span>
              <span className="text-sm text-gray-500">您: {myName}</span>
            </div>
          </div>
          <button
            onClick={() => void leaveRoom()}
            className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
          >
            <LogOut className="w-4 h-4" />
            离开会议
          </button>
        </header>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <MeetingStage />
          </div>
          <div className="space-y-4">
            <ParticipantList />
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">会议状态</span>
                <span
                  className={`px-2 py-1 rounded text-xs font-medium ${
                    status === 'idle'
                      ? 'bg-gray-100 text-gray-600'
                      : status === 'active'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {status === 'idle' ? '等待开始' : status === 'active' ? '进行中' : '已结束'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">当前步骤</span>
                <span className="text-xl font-bold text-blue-600">
                  {status !== 'idle' ? status === 'ended' ? '—' : currentStep : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

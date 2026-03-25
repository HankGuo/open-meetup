import { useState } from 'react';
import { useMeeting } from '../context/MeetingContext';
import { Play, StepForward, Square } from 'lucide-react';

export function HostControls() {
  const { status, currentStep, startMeeting, nextStep, endMeeting, isConnected } = useMeeting();
  const [busyAction, setBusyAction] = useState<'start' | 'next' | 'end' | null>(null);

  async function runAction(action: 'start' | 'next' | 'end') {
    setBusyAction(action);
    try {
      if (action === 'start') {
        await startMeeting();
        return;
      }
      if (action === 'next') {
        await nextStep();
        return;
      }
      await endMeeting();
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h3 className="text-lg font-medium text-gray-900 mb-4">主持人控制</h3>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">当前状态</span>
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
          <span className="text-lg font-bold text-blue-600">{currentStep}</span>
        </div>
      </div>

      <div className="space-y-2">
        {status === 'idle' && (
          <button
            className="w-full flex items-center justify-center gap-2 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
            onClick={() => runAction('start')}
            disabled={!isConnected || busyAction !== null}
          >
            <Play className="w-4 h-4" />
            {busyAction === 'start' ? '处理中...' : '开始会议'}
          </button>
        )}

        {status === 'active' && (
          <>
            <button
              className="w-full flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
              onClick={() => runAction('next')}
              disabled={!isConnected || busyAction !== null}
            >
              <StepForward className="w-4 h-4" />
              {busyAction === 'next' ? '处理中...' : '下一步'}
            </button>
            <button
              className="w-full flex items-center justify-center gap-2 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
              onClick={() => runAction('end')}
              disabled={!isConnected || busyAction !== null}
            >
              <Square className="w-4 h-4" />
              {busyAction === 'end' ? '处理中...' : '结束会议'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

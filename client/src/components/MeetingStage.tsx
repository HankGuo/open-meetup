import { useMeeting } from '../context/MeetingContext';

export function MeetingStage() {
  const { status, currentStep, myRole } = useMeeting();

  const getStatusText = () => {
    switch (status) {
      case 'idle':
        return '会议即将开始';
      case 'active':
        return '会议进行中';
      case 'ended':
        return '会议已结束';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-8 min-h-[400px] flex flex-col items-center justify-center">
      {status === 'idle' && (
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-700 mb-2">
            {myRole === 'host' ? '点击右侧按钮开始会议' : '等待主持人开始会议'}
          </h2>
          <p className="text-gray-500">所有参与者已就绪</p>
        </div>
      )}

      {status === 'active' && (
        <div className="text-center w-full">
          <div className="mb-6">
            <span className="inline-block px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium mb-3">
              {getStatusText()}
            </span>
            <div className="text-6xl font-bold text-gray-800 mb-2">
              Step {currentStep}
            </div>
            <p className="text-gray-500">当前步骤</p>
          </div>
          <div className="mt-8 p-6 bg-gray-50 rounded-lg">
            <p className="text-gray-600">
              此处可以根据当前步骤展示不同的内容。<br />
              在实际应用中，你可以在这里展示幻灯片、讨论议题、投票等内容。
            </p>
          </div>
        </div>
      )}

      {status === 'ended' && (
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-700 mb-2">会议已结束</h2>
          <p className="text-gray-500">感谢参与本次会议</p>
        </div>
      )}
    </div>
  );
}

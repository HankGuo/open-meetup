import { MeetingProvider, useMeeting } from './context/MeetingContext';
import { Lobby } from './components/Lobby';
import { HostPage } from './pages/HostPage';
import { ParticipantPage } from './pages/ParticipantPage';

function AppContent() {
  const { roomId, myRole, isReconnecting } = useMeeting();

  if (!roomId && isReconnecting) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-700 font-medium">正在恢复会议会话...</p>
          <p className="text-sm text-gray-500 mt-2">请稍候，正在尝试自动重连</p>
        </div>
      </div>
    );
  }

  if (!roomId) {
    return <Lobby />;
  }

  if (myRole === 'host') {
    return <HostPage />;
  }

  return <ParticipantPage />;
}

function App() {
  return (
    <MeetingProvider>
      <AppContent />
    </MeetingProvider>
  );
}

export default App;

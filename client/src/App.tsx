import { useState, useEffect } from 'react';
import { MeetingProvider, useMeeting } from './context/MeetingContext';
import { Lobby } from './components/Lobby';
import { JoinPage } from './components/JoinPage';
import { HostPage } from './pages/HostPage';
import { ParticipantPage } from './pages/ParticipantPage';

function getRoomIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('room');
}

function AppContent() {
  const { roomId, myRole, isReconnecting } = useMeeting();
  const [joinRoomId, setJoinRoomId] = useState<string | null>(null);
  const [checkingRoom, setCheckingRoom] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  useEffect(() => {
    if (roomId || joinRoomId || checkingRoom || initialCheckDone) {
      return;
    }

    const roomIdFromUrl = getRoomIdFromUrl();
    const isHost = localStorage.getItem('open-meetup:isHost') === 'true';
    const hostRoomId = localStorage.getItem('open-meetup:hostRoomId');

    if (roomIdFromUrl) {
      setCheckingRoom(true);
      setRoomError(null);

      const checkRoom = async () => {
        try {
          const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/room/check?roomId=${encodeURIComponent(roomIdFromUrl)}`);
          const data = await response.json();

          if (data.exists) {
            setJoinRoomId(roomIdFromUrl.toUpperCase());
          } else {
            setRoomError('房间不存在或已关闭');
            localStorage.removeItem('open-meetup:isHost');
            localStorage.removeItem('open-meetup:hostRoomId');
          }
        } catch (error) {
          setRoomError('无法验证房间，请稍后重试');
        } finally {
          setCheckingRoom(false);
          setInitialCheckDone(true);
        }
      };

      checkRoom();
    } else if (isHost && hostRoomId) {
      setCheckingRoom(true);

      const checkHostRoom = async () => {
        try {
          const response = await fetch(`${import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'}/api/room/check?roomId=${encodeURIComponent(hostRoomId)}`);
          const data = await response.json();

          if (data.exists) {
            window.location.href = `/?room=${hostRoomId}`;
          } else {
            localStorage.removeItem('open-meetup:isHost');
            localStorage.removeItem('open-meetup:hostRoomId');
          }
        } catch (error) {
          // ignore
        } finally {
          setCheckingRoom(false);
          setInitialCheckDone(true);
        }
      };

      checkHostRoom();
    } else {
      setInitialCheckDone(true);
    }
  }, [roomId, joinRoomId, checkingRoom, initialCheckDone]);

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

  if (!roomId && checkingRoom) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-6 text-center">
          <p className="text-gray-700 font-medium">正在验证房间...</p>
          <p className="text-sm text-gray-500 mt-2">请稍候</p>
        </div>
      </div>
    );
  }

  if (!roomId && roomError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow p-6 text-center max-w-md">
          <p className="text-red-600 font-medium mb-2">无法加入房间</p>
          <p className="text-gray-600 text-sm mb-4">{roomError}</p>
          <a
            href="/"
            className="inline-block px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            返回首页
          </a>
        </div>
      </div>
    );
  }

  if (!roomId && joinRoomId) {
    return <JoinPage roomId={joinRoomId} />;
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
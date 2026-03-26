import { useState } from 'react';
import { useMeeting } from '../context/MeetingContext';
import { Wifi, WifiOff } from 'lucide-react';

export function Lobby() {
  const { createRoom, isConnected, isReconnecting, error, clearError } = useMeeting();
  const [userName, setUserName] = useState('');
  const [roomId, setRoomId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreateRoom() {
    if (!userName.trim()) {
      alert('请输入您的姓名');
      return;
    }
    if (!roomId.trim()) {
      alert('请输入房间ID');
      return;
    }
    if (!password.trim()) {
      alert('请输入授权口令');
      return;
    }
    clearError();
    setLoading(true);
    const success = await createRoom(userName.trim(), roomId.trim().toUpperCase(), password.trim());
    setLoading(false);
    if (!success) {
      setPassword('');
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Open Meetup</h1>
          {isConnected ? (
            <span className="flex items-center text-green-600 text-sm">
              <Wifi className="w-4 h-4 mr-1" /> Connected
            </span>
          ) : (
            <span className="flex items-center text-red-600 text-sm">
              <WifiOff className="w-4 h-4 mr-1" /> Disconnected
            </span>
          )}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              您的姓名
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入姓名"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              房间ID
            </label>
            <input
              type="text"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入房间ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              授权口令
            </label>
            <input
              type="password"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="请输入授权口令"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium rounded-md transition-colors"
            onClick={handleCreateRoom}
            disabled={loading || !isConnected || isReconnecting}
          >
            {loading ? '创建中...' : '创建新会议'}
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          <p>实时协作会议 · Powered by Socket.IO</p>
        </div>
      </div>
    </div>
  );
}
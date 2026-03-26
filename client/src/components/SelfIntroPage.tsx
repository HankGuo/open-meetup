import { useState } from 'react';
import { useMeeting } from '../context/MeetingContext';
import { QRCodeSVG } from 'qrcode.react';
import { Copy, Check } from 'lucide-react';

export function SelfIntroPage() {
  const { participants, roomId, hostId } = useMeeting();
  const [copied, setCopied] = useState(false);

  const onlineParticipants = participants.filter((p) => p.online && p.userId !== hostId);
  const joinUrl = `${window.location.origin}?room=${roomId}`;

  function copyLink() {
    navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-[500px] flex flex-col items-center justify-center bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-xl p-8">
      <div className="text-center mb-8">
        <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-5xl shadow-lg">
          👋
        </div>
        <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-4">
          自我介绍环节
        </h1>
        <p className="text-xl text-gray-600">
          欢迎各位参与者，请开始自我介绍吧！
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-8 max-w-4xl">
        {onlineParticipants.map((participant) => (
          <div
            key={participant.userId}
            className="flex flex-col items-center p-3 bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow"
          >
            {participant.avatar ? (
              <img
                src={participant.avatar}
                alt={participant.userName}
                className="w-16 h-16 rounded-full object-cover border-2 border-indigo-100 mb-2"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xl font-bold border-2 border-indigo-100 mb-2">
                {participant.userName?.charAt(0)?.toUpperCase() || '?'}
              </div>
            )}
            <span className="text-sm font-medium text-gray-800 truncate max-w-full">
              {participant.userName}
            </span>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl shadow-lg p-6 max-w-2xl w-full">
        <div className="flex flex-col md:flex-row items-center gap-6">
          <div className="flex-shrink-0">
            <div className="p-3 bg-gray-50 rounded-xl">
              <QRCodeSVG value={joinUrl} size={120} level="H" />
            </div>
          </div>
          <div className="flex-1 text-center md:text-left">
            <h3 className="text-lg font-bold text-gray-800 mb-2">扫码加入自我介绍</h3>
            <p className="text-sm text-gray-500 mb-3">房间ID: <span className="font-bold text-indigo-600">{roomId}</span></p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={joinUrl}
                className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-600 font-mono truncate"
              />
              <button
                onClick={copyLink}
                className="flex-shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? '已复制' : '复制链接'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
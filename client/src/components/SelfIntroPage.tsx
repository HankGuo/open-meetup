import { useState } from 'react';
import { useMeeting } from '../context/MeetingContext';
import { X } from 'lucide-react';
import { User } from '../types';

export function SelfIntroPage() {
  const { participants, hostId } = useMeeting();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const onlineParticipants = participants.filter((p) => p.online && p.userId !== hostId);

  return (
    <div className="flex flex-col items-center justify-center flex-1 bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 p-8 overflow-hidden">
      <div className="text-center mb-6 flex-shrink-0">
        <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-3xl shadow-lg">
          👋
        </div>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
          自我介绍环节
        </h1>
        <p className="text-base text-gray-600">
          欢迎各位参与者，请开始自我介绍吧！
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 max-w-4xl">
        {onlineParticipants.map((participant) => (
          <div
            key={participant.userId}
            className="flex flex-col items-center p-3 bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow cursor-pointer"
            onClick={() => setSelectedUser(participant)}
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

      {selectedUser && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedUser(null)}
        >
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-gray-900">参与者信息</h3>
              <button
                onClick={() => setSelectedUser(null)}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="flex flex-col items-center">
              {selectedUser.avatar ? (
                <img
                  src={selectedUser.avatar}
                  alt={selectedUser.userName}
                  className="w-32 h-32 rounded-full object-cover border-4 border-indigo-100 mb-4"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-4xl font-bold border-4 border-indigo-100 mb-4">
                  {selectedUser.userName?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              <h4 className="text-2xl font-bold text-gray-900 mb-2">{selectedUser.userName}</h4>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

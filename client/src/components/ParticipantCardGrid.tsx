import { useState } from 'react';
import { User } from '../types';
import { X, Crown } from 'lucide-react';

interface ParticipantCardGridProps {
  participants: User[];
  myUserId: string;
}

export function ParticipantCardGrid({ participants, myUserId }: ParticipantCardGridProps) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const onlineParticipants = participants.filter((p) => p.online);

  return (
    <>
      <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-3 p-4">
        {onlineParticipants.map((participant) => (
          <button
            key={participant.userId}
            onClick={() => setSelectedUser(participant)}
            className={`flex flex-col items-center p-2 rounded-xl transition-all hover:bg-white/10 ${
              participant.userId === myUserId ? 'ring-2 ring-blue-500 ring-offset-2' : ''
            }`}
          >
            <div className="relative">
              {participant.avatar ? (
                <img
                  src={participant.avatar}
                  alt={participant.userName}
                  className="w-14 h-14 rounded-full object-cover border-2 border-white/20"
                />
              ) : (
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-xl font-bold border-2 border-white/20">
                  {participant.userName?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}
              {participant.role === 'host' && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-yellow-400 rounded-full flex items-center justify-center">
                  <Crown className="w-3 h-3 text-yellow-800" />
                </div>
              )}
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-500 rounded-full border-2 border-gray-900"></div>
            </div>
            <span className="mt-1 text-xs text-white/80 truncate max-w-full">
              {participant.userName}
            </span>
            {participant.userId === myUserId && (
              <span className="text-[10px] text-blue-400">我</span>
            )}
          </button>
        ))}
      </div>

      {selectedUser && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedUser(null)}
        >
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setSelectedUser(null)}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full"
            >
              <X className="w-6 h-6 text-gray-500" />
            </button>

            <div className="flex flex-col items-center">
              {selectedUser.avatar ? (
                <img
                  src={selectedUser.avatar}
                  alt={selectedUser.userName}
                  className="w-32 h-32 rounded-full object-cover mb-4"
                />
              ) : (
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white text-4xl font-bold mb-4">
                  {selectedUser.userName?.charAt(0)?.toUpperCase() || '?'}
                </div>
              )}

              <h3 className="text-xl font-bold text-gray-900 mb-1">
                {selectedUser.userName}
              </h3>

              {selectedUser.role === 'host' && (
                <span className="inline-flex items-center gap-1 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium mb-2">
                  <Crown className="w-4 h-4" />
                  主持人
                </span>
              )}

              {selectedUser.ticket && (
                <div className="mt-4 w-full bg-gray-50 rounded-xl p-4 text-center">
                  <p className="text-xs text-gray-500 mb-1">Ticket</p>
                  <p className="text-lg font-mono font-bold text-indigo-600">
                    {selectedUser.ticket}
                  </p>
                </div>
              )}

              {selectedUser.userId === myUserId && (
                <p className="mt-4 text-sm text-blue-600 font-medium">这是您</p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
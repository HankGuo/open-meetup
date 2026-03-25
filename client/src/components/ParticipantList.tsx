import { useMeeting } from '../context/MeetingContext';
import { User, Crown, Users, WifiOff } from 'lucide-react';

export function ParticipantList() {
  const { participants, hostId } = useMeeting();

  return (
    <div className="bg-white rounded-lg shadow p-4">
      <div className="flex items-center gap-2 mb-3 text-gray-700 font-medium">
        <Users className="w-4 h-4" />
        <span>参与者 ({participants.length})</span>
      </div>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {participants.map((participant) => (
          <div
            key={participant.userId}
            className="flex items-center gap-2 p-2 rounded hover:bg-gray-50"
          >
            {participant.userId === hostId ? (
              <Crown className="w-4 h-4 text-yellow-500" />
            ) : (
              <User className="w-4 h-4 text-gray-400" />
            )}
            <span className="text-sm text-gray-700">
              {participant.userName}
              {participant.userId === hostId && (
                <span className="ml-2 text-xs text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded">
                  主持人
                </span>
              )}
              {!participant.online && (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  <WifiOff className="w-3 h-3" />
                  离线
                </span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

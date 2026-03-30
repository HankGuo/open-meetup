import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useMeeting } from '../context/MeetingContext';
import { User } from '../types';

const MAX_VISIBLE_OTHERS = 10;
const MEDAL_TEXT = ['金', '银', '铜'];
const MEDAL_STYLE = [
  'bg-amber-300 text-amber-950 border-amber-200',
  'bg-slate-300 text-slate-900 border-slate-200',
  'bg-orange-300 text-orange-950 border-orange-200',
];

interface ParticipantRosterBarProps {
  pageTitle?: string;
}

export function ParticipantRosterBar({ pageTitle }: ParticipantRosterBarProps) {
  const { participants, hostId, myUserId } = useMeeting();
  const [showFullList, setShowFullList] = useState(false);

  const sortedParticipants = useMemo(
    () => [...participants].sort((a, b) => a.joinedAt - b.joinedAt),
    [participants],
  );

  const host = sortedParticipants.find((participant) => participant.userId === hostId) ?? null;
  const me = sortedParticipants.find((participant) => participant.userId === myUserId) ?? null;

  const others = useMemo(
    () => sortedParticipants.filter((participant) => participant.userId !== hostId && participant.userId !== myUserId),
    [hostId, myUserId, sortedParticipants],
  );

  const visibleOthers = others.slice(0, MAX_VISIBLE_OTHERS);
  const hiddenCount = Math.max(0, others.length - MAX_VISIBLE_OTHERS);
  const onlineCount = sortedParticipants.filter((participant) => participant.online).length;

  const otherRankMap = useMemo(() => {
    const rankMap = new Map<string, number>();
    others.forEach((participant, index) => {
      rankMap.set(participant.userId, index + 1);
    });
    return rankMap;
  }, [others]);

  const hostAndMeAreSame = host && me && host.userId === me.userId;

  return (
    <>
      <div className="flex-shrink-0 border-b border-white/10 bg-slate-900/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3">
          <PersonBadge person={host} label={hostAndMeAreSame ? '主持人 / 我' : '主持人'} />
          {!hostAndMeAreSame && <PersonBadge person={me} label="我" />}

          <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">
                加入成员（按加入时间）
              </p>
              <div className="flex items-center gap-2">
                {pageTitle ? <p className="truncate text-xs text-slate-400">{pageTitle}</p> : null}
                <p className="whitespace-nowrap text-xs text-slate-400">
                  在线 {onlineCount}/{sortedParticipants.length}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {visibleOthers.map((participant, index) => (
                <AvatarChip key={participant.userId} participant={participant} rank={index + 1} />
              ))}

              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowFullList(true)}
                  className="flex h-10 min-w-[64px] items-center justify-center rounded-full border border-dashed border-slate-500 px-3 text-xs font-medium text-slate-200 transition-colors hover:border-slate-300 hover:text-white"
                  title="查看完整人员名单"
                >
                  ... +{hiddenCount}
                </button>
              )}

              {others.length === 0 && <p className="text-xs text-slate-400">暂无其他参与者</p>}
            </div>
          </div>
        </div>
      </div>

      {showFullList && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-20" onClick={() => setShowFullList(false)}>
          <div
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h3 className="text-base font-semibold text-slate-900">完整人员名单（按加入时间）</h3>
              <button
                type="button"
                onClick={() => setShowFullList(false)}
                className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
              {sortedParticipants.map((participant, index) => {
                const isHost = participant.userId === hostId;
                const isMe = participant.userId === myUserId;
                const rank = otherRankMap.get(participant.userId) ?? null;
                const badgeText = buildIdentityBadgeText(isHost, isMe);

                return (
                  <div key={participant.userId} className="flex items-center gap-3 border-b border-slate-100 px-5 py-3 last:border-b-0">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {index + 1}
                    </div>

                    <AvatarCircle participant={participant} sizeClassName="h-10 w-10" />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{participant.userName}</p>
                      <div className="mt-1 flex items-center gap-2">
                        {badgeText ? (
                          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{badgeText}</span>
                        ) : null}
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            participant.online ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {participant.online ? '在线' : '离线'}
                        </span>
                      </div>
                    </div>

                    {rank && rank <= 3 ? <Medal rank={rank} /> : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PersonBadge({ person, label }: { person: User | null; label: string }) {
  return (
    <div className="flex w-[128px] flex-shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-2 py-2">
      <AvatarCircle participant={person} sizeClassName="h-9 w-9" />
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-slate-400">{label}</p>
        <p className="truncate text-xs font-semibold text-white">{person?.userName || '未加入'}</p>
      </div>
    </div>
  );
}

function AvatarChip({ participant, rank }: { participant: User; rank: number }) {
  return (
    <div className={`group relative flex items-center ${participant.online ? '' : 'opacity-50'}`}>
      <AvatarCircle participant={participant} sizeClassName="h-10 w-10 border-2 border-slate-900" />
      {rank <= 3 ? <Medal rank={rank} /> : null}
      <span className="pointer-events-none absolute left-1/2 top-12 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-950 px-2 py-1 text-xs text-white group-hover:block">
        {participant.userName}
      </span>
    </div>
  );
}

function Medal({ rank }: { rank: number }) {
  const text = MEDAL_TEXT[rank - 1];
  const style = MEDAL_STYLE[rank - 1];
  return (
    <span
      className={`absolute -right-1 -top-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold shadow-sm ${style}`}
    >
      {text}
    </span>
  );
}

function AvatarCircle({ participant, sizeClassName }: { participant: User | null; sizeClassName: string }) {
  const fallbackText = getFallbackAvatarText(participant);

  if (participant?.avatar) {
    return (
      <img
        src={participant.avatar}
        alt={participant.userName}
        className={`${sizeClassName} rounded-full object-cover`}
      />
    );
  }

  return (
    <div
      className={`${sizeClassName} flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-sm font-semibold text-white`}
    >
      {fallbackText}
    </div>
  );
}

function getFallbackAvatarText(participant: User | null): string {
  if (!participant?.userName?.trim()) {
    return '?';
  }
  return participant.userName.trim().charAt(0).toUpperCase();
}

function buildIdentityBadgeText(isHost: boolean, isMe: boolean): string {
  if (isHost && isMe) {
    return '主持人 / 我';
  }
  if (isHost) {
    return '主持人';
  }
  if (isMe) {
    return '我';
  }
  return '';
}

import { useMemo, useState } from 'react';
import { BadgeInfo, CircleDot, Crown, UserRound, X } from 'lucide-react';
import { useMeeting } from '../context/MeetingContext';
import { User } from '../types';

export function SelfIntroPage() {
  const { participants, hostId } = useMeeting();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const members = useMemo(
    () =>
      participants
        .filter((participant) => participant.userId !== hostId)
        .sort((a, b) => a.joinedAt - b.joinedAt),
    [hostId, participants],
  );

  const onlineCount = members.filter((member) => member.online).length;

  return (
    <div className="h-full w-full p-3 md:p-4">
      <section className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[linear-gradient(170deg,var(--panel-light),var(--panel-soft))] shadow-[var(--shadow-1)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 md:px-5">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel-soft)] px-3 py-1 text-xs font-semibold text-[var(--text-soft)]">
            <BadgeInfo className="h-3.5 w-3.5" />
            名牌广场
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-soft)]">
            <span className="status-pill">
              在线 {onlineCount}/{members.length}
            </span>
            <span className="status-pill">按加入时间排列</span>
          </div>
        </header>

        {members.length === 0 ? (
          <div className="flex min-h-0 flex-1 items-center justify-center px-6">
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--panel-soft)] px-6 py-5 text-center">
              <p className="text-sm font-semibold text-[var(--text)]">暂无成员加入</p>
              <p className="mt-1 text-sm text-[var(--text-soft)]">成员进入后会自动生成名牌并展示在这里。</p>
            </div>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto px-4 py-4 md:px-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
              {members.map((member, index) => {
                const rank = index + 1;
                return (
                  <button
                    key={member.userId}
                    type="button"
                    onClick={() => setSelectedUser(member)}
                    className="group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-3 text-left transition hover:-translate-y-0.5 hover:border-[var(--primary)]/50 hover:bg-[var(--panel-light)]"
                  >
                    <div className="absolute inset-x-0 top-0 h-8 bg-[linear-gradient(90deg,oklch(0.92_0.04_265_/0.75),oklch(0.9_0.04_208_/0.6))]" />
                    {rank <= 3 ? <RankCrown rank={rank as 1 | 2 | 3} /> : null}

                    <div className="relative mt-1 flex items-start justify-between gap-2">
                      <Avatar participant={member} sizeClassName="h-12 w-12" />
                      <span
                        className={`status-pill px-2 py-0.5 text-[10px] ${
                          member.online ? 'status-pill--online' : ''
                        }`}
                      >
                        {member.online ? '在线' : '离线'}
                      </span>
                    </div>

                    <div className="relative mt-3">
                      <p className="truncate text-sm font-semibold text-[var(--text)]">{member.userName}</p>
                      <p className="mt-1 text-xs text-[var(--text-soft)]">点击查看名牌详情</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {selectedUser && (
        <div
          className="dialog-overlay fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="dialog-panel w-full max-w-sm overflow-hidden"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-4">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--text)]">
                <UserRound className="h-4 w-4" />
                成员名牌
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className="btn-base h-9 w-9 rounded-full border border-[var(--border)] bg-[var(--panel-light)] p-0 text-[var(--text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-6">
              <div className="mx-auto flex w-full max-w-[260px] flex-col items-center rounded-2xl border border-[var(--border)] bg-[var(--panel)] p-5 text-center">
                <Avatar participant={selectedUser} sizeClassName="h-24 w-24" />
                <h4 className="mt-4 text-xl font-semibold text-[var(--text)]">{selectedUser.userName}</h4>
                <div className="mt-3 inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1 text-xs text-[var(--text-soft)]">
                  <CircleDot className={`h-3 w-3 ${selectedUser.online ? 'text-[var(--primary)]' : 'text-[var(--text-soft)]'}`} />
                  {selectedUser.online ? '当前在线' : '当前离线'}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RankCrown({ rank }: { rank: 1 | 2 | 3 }) {
  const label = rank === 1 ? '金' : rank === 2 ? '银' : '铜';
  const style =
    rank === 1
      ? 'border-amber-300 bg-amber-100/95 text-amber-700'
      : rank === 2
        ? 'border-slate-300 bg-slate-100/95 text-slate-700'
        : 'border-orange-300 bg-orange-100/95 text-orange-700';

  return (
    <span
      className={`absolute right-2 top-2 z-10 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold shadow-sm ${style}`}
      title={`第 ${rank} 位加入`}
    >
      <Crown className="h-3 w-3" />
      {label}
    </span>
  );
}

function Avatar({ participant, sizeClassName }: { participant: User; sizeClassName: string }) {
  const fallback = participant.userName?.trim()?.charAt(0)?.toUpperCase() || '?';
  if (participant.avatar) {
    return (
      <img
        src={participant.avatar}
        alt={participant.userName}
        className={`${sizeClassName} rounded-full border border-[var(--border)] object-cover`}
      />
    );
  }
  return (
    <div
      className={`${sizeClassName} avatar-fallback text-lg font-semibold`}
    >
      {fallback}
    </div>
  );
}

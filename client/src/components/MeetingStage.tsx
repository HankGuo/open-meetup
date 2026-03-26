import { useMeeting } from '../context/MeetingContext';
import { WelcomePage } from './WelcomePage';
import { HackathonDetailPage } from './HackathonDetailPage';
import { NewsPage } from './NewsPage';
import { DoubaoPage } from './DoubaoPage';
import { SelfIntroPage } from './SelfIntroPage';

export function MeetingStage() {
  const { currentStep, participants, hostId } = useMeeting();

  const host = participants.find((p) => p.userId === hostId) || null;

  if (currentStep === 0) {
    return <WelcomePage host={host} />;
  }

  if (currentStep === 1) {
    return <HackathonDetailPage />;
  }

  if (currentStep === 2) {
    return <NewsPage />;
  }

  if (currentStep === 3) {
    return <DoubaoPage />;
  }

  if (currentStep === 4) {
    return <SelfIntroPage />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <p className="text-gray-500">内容加载中...</p>
    </div>
  );
}
import { User } from '../types';

interface WelcomePageProps {
  host: User | null;
}

export function WelcomePage({ host }: WelcomePageProps) {
  return (
    <div className="min-h-[500px] flex flex-col items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl p-8">
      <div className="mb-8">
        <div className="w-32 h-32 mx-auto rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-5xl font-bold shadow-lg">
          {host?.userName?.charAt(0)?.toUpperCase() || 'H'}
        </div>
      </div>

      <h1 className="text-4xl font-bold text-gray-800 mb-4 text-center">
        欢迎来到 HELLO 黑客松
      </h1>

      <p className="text-xl text-gray-600 mb-2 text-center">
        主持人：{host?.userName || '主持人'}
      </p>

      <p className="text-gray-500 text-center max-w-2xl mt-6 leading-relaxed">
        感谢各位的到来！在这场黑客松中，我们将一起探索创新的边界，<br />
        挑战技术的极限，创造令人惊叹的作品。<br />
        让我们开始这段激动人心的旅程吧！
      </p>
    </div>
  );
}
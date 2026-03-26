export function HackathonDetailPage() {
  return (
    <div className="min-h-[500px] bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50 rounded-xl p-8 overflow-y-auto">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 bg-clip-text text-transparent mb-4">
            HELLO 黑客松
          </h1>
          <p className="text-xl text-gray-600">
            48小时极限挑战 · 创新与技术的完美碰撞
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-10">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="w-full h-48 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-xl flex items-center justify-center mb-4">
              <span className="text-6xl">🚀</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">创新挑战</h3>
            <p className="text-gray-600">
              围绕AI、大数据、云原生等前沿技术，提出创新解决方案，将创意转化为实际产品。
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="w-full h-48 bg-gradient-to-br from-purple-400 to-pink-500 rounded-xl flex items-center justify-center mb-4">
              <span className="text-6xl">👥</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">团队协作</h3>
            <p className="text-gray-600">
              与来自各地的开发者、设计师、产品经理组建团队，发挥各自专长，协同作战。
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="w-full h-48 bg-gradient-to-br from-pink-400 to-red-500 rounded-xl flex items-center justify-center mb-4">
              <span className="text-6xl">🏆</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">丰厚奖励</h3>
            <p className="text-gray-600">
              设立多个奖项，包括最佳创新奖、最佳技术奖、最佳商业价值奖等，总奖金池超过10万元。
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="w-full h-48 bg-gradient-to-br from-orange-400 to-red-500 rounded-xl flex items-center justify-center mb-4">
              <span className="text-6xl">🎓</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">学习成长</h3>
            <p className="text-gray-600">
              行业大咖技术分享，专业导师全程指导，快速提升技术能力和创新思维。
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">活动时间</h2>
          <div className="flex flex-wrap justify-center gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-indigo-600">48</div>
              <div className="text-gray-500">小时挑战</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-purple-600">5</div>
              <div className="text-gray-500">大主题方向</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-pink-600">100+</div>
              <div className="text-gray-500">参赛选手</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-orange-600">10</div>
              <div className="text-gray-500">万元奖金</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
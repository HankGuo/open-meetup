interface NewsItem {
  id: number;
  title: string;
  summary: string;
  category: string;
  time: string;
}

const newsList: NewsItem[] = [
  {
    id: 1,
    title: 'AI 技术在2026年迎来重大突破',
    summary: '多模态大模型展现出前所未有的理解与生成能力，从文本、图像到视频，AI正在重塑各行各业的工作方式。',
    category: '科技前沿',
    time: '2小时前',
  },
  {
    id: 2,
    title: '全球黑客松热潮持续升温',
    summary: '越来越多的企业和组织举办黑客松活动，为开发者提供创新平台，推动技术边界不断拓展。',
    category: '行业动态',
    time: '5小时前',
  },
  {
    id: 3,
    title: '开源生态持续繁荣发展',
    summary: '开源项目数量持续增长，社区协作模式日益成熟，为全球开发者提供了丰富的技术资源和创新灵感。',
    category: '开源社区',
    time: '1天前',
  },
];

export function NewsPage() {
  return (
    <div className="min-h-[500px] bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">
          📰 新闻资讯
        </h1>
        <p className="text-gray-500 text-center mb-10">热点资讯 · 实时更新</p>

        <div className="space-y-6">
          {newsList.map((news) => (
            <div
              key={news.id}
              className="bg-white rounded-xl shadow-md p-6 hover:shadow-lg transition-shadow duration-300"
            >
              <div className="flex items-start justify-between mb-3">
                <span className="inline-block px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-medium rounded-full">
                  {news.category}
                </span>
                <span className="text-gray-400 text-sm">{news.time}</span>
              </div>

              <h3 className="text-xl font-bold text-gray-800 mb-3 hover:text-indigo-600 transition-colors cursor-pointer">
                {news.title}
              </h3>

              <p className="text-gray-600 leading-relaxed">
                {news.summary}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-gray-100 rounded-full text-gray-500 text-sm">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            资讯实时更新中
          </div>
        </div>
      </div>
    </div>
  );
}
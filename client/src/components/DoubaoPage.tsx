export function DoubaoPage() {
  return (
    <div className="min-h-[500px] bg-gradient-to-br from-orange-50 via-yellow-50 to-amber-100 rounded-xl p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-orange-600 to-amber-600 bg-clip-text text-transparent mb-4">
            重新认识你的豆包
          </h1>
          <p className="text-xl text-gray-600">
            你的AI智能助手，不仅仅是聊天
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-400 to-amber-500 rounded-2xl flex items-center justify-center mb-4">
              <span className="text-3xl">💬</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">智能对话</h3>
            <p className="text-gray-600">
              支持多轮对话、上下文理解，可以进行深入的技术讨论、代码编写和创意头脑风暴。
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-400 to-cyan-500 rounded-2xl flex items-center justify-center mb-4">
              <span className="text-3xl">📝</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">内容创作</h3>
            <p className="text-gray-600">
              协助撰写文档、邮件、报告、营销文案，支持中英文双语创作，风格多样可选。
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-purple-400 to-pink-500 rounded-2xl flex items-center justify-center mb-4">
              <span className="text-3xl">🔍</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">信息检索</h3>
            <p className="text-gray-600">
              快速理解并总结长文本、论文、报告，提取关键信息，提高阅读效率。
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-lg p-6">
            <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl flex items-center justify-center mb-4">
              <span className="text-3xl">💻</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">代码助手</h3>
            <p className="text-gray-600">
              支持代码生成、调试、优化和问题解答，覆盖多种编程语言和框架。
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">为什么选择豆包？</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600 mb-2">安全</div>
              <p className="text-gray-600 text-sm">企业级数据安全保障</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600 mb-2">高效</div>
              <p className="text-gray-600 text-sm">秒级响应，快速解决问题</p>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-orange-600 mb-2">专业</div>
              <p className="text-gray-600 text-sm">持续学习，跟上技术发展</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
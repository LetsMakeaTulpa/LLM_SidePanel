import { useEffect, useState } from 'react';

export default function Hero() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-[128px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-[128px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-indigo-600/10 rounded-full blur-[128px]" />
      </div>

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:64px_64px]" />

      <div className={`relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center transition-all duration-1000 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}`}>
        {/* Badge */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 mb-8">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm text-gray-300">Available on Chrome, Edge & Mobile</span>
        </div>

        {/* Heading */}
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold leading-tight mb-6">
          <span className="block text-white">All Your AI Tools</span>
          <span className="block bg-gradient-to-r from-purple-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
            One Side Panel
          </span>
        </h1>

        {/* Subtitle */}
        <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          Instantly access ChatGPT, Gemini, Claude, Copilot, DeepSeek and more AI tools
          from a sleek side panel. Boost your productivity with seamless AI integration
          while you browse.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <a
            href="https://chromewebstore.google.com/detail/ai-side-panel/icapcpllhdnnpcmfdcgpnbgchfenmjmg"
            target="_blank"
            rel="noopener noreferrer"
            className="group px-8 py-3.5 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 font-medium hover:from-purple-500 hover:to-blue-500 transition-all shadow-xl shadow-purple-500/25 flex items-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-5l-3.5 3.5-1.42-1.42L9.67 10H4.5V8.5h5.17L6.08 4.92 7.5 3.5l11 11-1.42 1.42L13.5 12.33v4.17h-1.5z"/>
            </svg>
            Add to Chrome — Free
          </a>
          <a
            href="#demo"
            className="px-8 py-3.5 rounded-full border border-white/20 font-medium hover:bg-white/5 transition-all flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            See Demo
          </a>
        </div>

        {/* Keyboard shortcut hint */}
        <div className="inline-flex items-center gap-2 text-sm text-gray-500">
          <span>Quick toggle with</span>
          <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/20 text-xs font-mono">ALT</kbd>
          <span>+</span>
          <kbd className="px-2 py-0.5 rounded bg-white/10 border border-white/20 text-xs font-mono">Q</kbd>
        </div>

        {/* Browser mockup */}
        <div className="mt-16 relative max-w-5xl mx-auto">
          <div className="relative rounded-xl border border-white/10 bg-[#1a1a2e]/80 backdrop-blur-sm overflow-hidden shadow-2xl shadow-purple-500/10">
            {/* Browser chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-white/5 bg-[#12121f]">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <div className="flex-1 mx-4">
                <div className="bg-white/5 rounded-md px-3 py-1.5 text-xs text-gray-400 max-w-md mx-auto">
                  🔒 example.com/article/interesting-topic
                </div>
              </div>
            </div>
            {/* Content area */}
            <div className="flex h-[400px] sm:h-[450px]">
              {/* Main content */}
              <div className="flex-1 p-6 overflow-hidden">
                <div className="space-y-4">
                  <div className="h-6 bg-white/10 rounded w-3/4" />
                  <div className="h-4 bg-white/5 rounded w-full" />
                  <div className="h-4 bg-white/5 rounded w-5/6" />
                  <div className="h-4 bg-white/5 rounded w-full" />
                  <div className="h-4 bg-white/5 rounded w-4/5" />
                  <div className="mt-6 h-32 bg-white/5 rounded-lg border border-white/5" />
                  <div className="h-4 bg-white/5 rounded w-full" />
                  <div className="h-4 bg-white/5 rounded w-3/4" />
                  <div className="h-4 bg-white/5 rounded w-5/6" />
                </div>
              </div>
              {/* Side panel */}
              <div className="w-[280px] sm:w-[320px] border-l border-white/10 bg-[#12121f] flex flex-col animate-slide-in">
                <div className="p-3 border-b border-white/5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                      <span className="text-[10px]">AI</span>
                    </div>
                    <span className="text-xs font-medium text-gray-300">AI Side Panel</span>
                  </div>
                </div>
                <div className="flex-1 p-3 space-y-2">
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 flex items-center justify-center text-[8px]">G</div>
                    <span className="text-xs text-gray-300">ChatGPT</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-400 to-cyan-500 flex items-center justify-center text-[8px]">✦</div>
                    <span className="text-xs text-gray-300">Gemini</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-orange-400 to-amber-500 flex items-center justify-center text-[8px]">C</div>
                    <span className="text-xs text-gray-300">Claude</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center text-[8px]">M</div>
                    <span className="text-xs text-gray-300">Copilot</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-white/5 transition-colors">
                    <div className="w-6 h-6 rounded-full bg-gradient-to-r from-cyan-400 to-blue-400 flex items-center justify-center text-[8px]">D</div>
                    <span className="text-xs text-gray-300">DeepSeek</span>
                  </div>
                </div>
                <div className="p-3 border-t border-white/5">
                  <div className="bg-white/5 rounded-lg p-2">
                    <div className="text-[10px] text-gray-400 mb-1">Ask AI anything...</div>
                    <div className="h-6 bg-white/5 rounded" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Glow effect */}
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-3/4 h-20 bg-purple-500/20 blur-[60px] rounded-full" />
        </div>
      </div>
    </section>
  );
}

import { useState } from 'react';

export default function SidePanelDemo() {
  const [activeTab, setActiveTab] = useState(0);

  const tabs = [
    { name: 'ChatGPT', color: 'from-green-400 to-emerald-500' },
    { name: 'Gemini', color: 'from-blue-400 to-cyan-500' },
    { name: 'Claude', color: 'from-orange-400 to-amber-500' },
  ];

  const conversations = [
    {
      messages: [
        { role: 'user', text: 'Explain quantum computing in simple terms' },
        { role: 'ai', text: 'Quantum computing uses quantum bits (qubits) that can exist in multiple states simultaneously, unlike regular bits that are either 0 or 1. This allows quantum computers to process many possibilities at once, making them incredibly powerful for certain types of problems.' },
        { role: 'user', text: 'What are some practical applications?' },
        { role: 'ai', text: 'Key applications include: drug discovery, cryptography, optimization problems, weather forecasting, and financial modeling. These areas benefit from quantum computing\'s ability to explore vast solution spaces simultaneously.' },
      ],
    },
    {
      messages: [
        { role: 'user', text: 'Help me write a React component for a todo list' },
        { role: 'ai', text: 'Here\'s a clean React todo component with state management, add/delete functionality, and localStorage persistence. Let me break it down step by step...' },
        { role: 'user', text: 'Can you add drag and drop reordering?' },
        { role: 'ai', text: 'Sure! I\'ll integrate react-beautiful-dnd for smooth drag-and-drop reordering. Here\'s the updated component with the new functionality...' },
      ],
    },
    {
      messages: [
        { role: 'user', text: 'Summarize this research paper for me' },
        { role: 'ai', text: 'This paper presents a novel approach to transformer architectures that reduces computational complexity from O(n²) to O(n log n) while maintaining performance on standard benchmarks.' },
        { role: 'user', text: 'What are the limitations mentioned?' },
        { role: 'ai', text: 'The authors note three key limitations: 1) Performance degrades on sequences longer than 8K tokens, 2) Training requires 3x more memory than standard transformers, 3) Results are primarily validated on English text.' },
      ],
    },
  ];

  return (
    <section id="demo" className="relative py-24 sm:py-32">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <span className="text-sm font-medium text-cyan-400 uppercase tracking-wider">Live Demo</span>
          <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold">
            See It In Action
            <span className="block bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Right Here
            </span>
          </h2>
          <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
            Experience the seamless side panel interface. Switch between AI services and manage conversations effortlessly.
          </p>
        </div>

        {/* Demo container */}
        <div className="max-w-lg mx-auto">
          <div className="rounded-2xl border border-white/10 bg-[#12121f] overflow-hidden shadow-2xl shadow-purple-500/10">
            {/* Panel header */}
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  <span className="text-[10px] font-bold">AI</span>
                </div>
                <span className="text-sm font-medium text-gray-200">AI Side Panel</span>
              </div>
              <div className="flex items-center gap-1">
                <button className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Service tabs */}
            <div className="flex border-b border-white/5">
              {tabs.map((tab, index) => (
                <button
                  key={index}
                  onClick={() => setActiveTab(index)}
                  className={`flex-1 py-3 text-xs font-medium transition-all relative ${
                    activeTab === index ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <div className={`w-4 h-4 rounded-full bg-gradient-to-r ${tab.color} flex items-center justify-center text-[7px] text-white font-bold`}>
                      {tab.name[0]}
                    </div>
                    {tab.name}
                  </div>
                  {activeTab === index && (
                    <div className={`absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r ${tab.color}`} />
                  )}
                </button>
              ))}
            </div>

            {/* Chat area */}
            <div className="h-[350px] overflow-y-auto p-4 space-y-4">
              {conversations[activeTab].messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] px-3 py-2 rounded-2xl text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-br-sm'
                        : 'bg-white/5 text-gray-300 border border-white/5 rounded-bl-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              ))}
            </div>

            {/* Input area */}
            <div className="p-3 border-t border-white/5">
              <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10">
                <input
                  type="text"
                  placeholder="Ask anything..."
                  className="flex-1 bg-transparent text-xs text-white placeholder-gray-500 outline-none"
                  readOnly
                />
                <button className="w-7 h-7 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center hover:from-purple-500 hover:to-blue-500 transition-all">
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Caption */}
          <p className="text-center text-sm text-gray-500 mt-4">
            ↑ Interactive demo — Click tabs to switch between AI services
          </p>
        </div>
      </div>
    </section>
  );
}

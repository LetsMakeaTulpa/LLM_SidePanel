import { useState } from 'react';

const services = [
  {
    name: 'ChatGPT',
    letter: 'G',
    gradient: 'from-green-400 to-emerald-500',
    description: 'OpenAI\'s conversational AI for writing, analysis, and coding.',
    url: 'chat.openai.com',
  },
  {
    name: 'Gemini',
    letter: '✦',
    gradient: 'from-blue-400 to-cyan-500',
    description: 'Google\'s multimodal AI for research and creative tasks.',
    url: 'gemini.google.com',
  },
  {
    name: 'Claude',
    letter: 'C',
    gradient: 'from-orange-400 to-amber-500',
    description: 'Anthropic\'s AI assistant for thoughtful analysis and writing.',
    url: 'claude.ai',
  },
  {
    name: 'Copilot',
    letter: 'M',
    gradient: 'from-blue-500 to-indigo-500',
    description: 'Microsoft\'s AI companion powered by GPT-4.',
    url: 'copilot.microsoft.com',
  },
  {
    name: 'DeepSeek',
    letter: 'D',
    gradient: 'from-cyan-400 to-blue-400',
    description: 'Advanced AI for coding, math, and complex reasoning.',
    url: 'chat.deepseek.com',
  },
  {
    name: 'Grok',
    letter: '𝕏',
    gradient: 'from-gray-400 to-gray-600',
    description: 'xAI\'s witty AI with real-time knowledge.',
    url: 'grok.x.ai',
  },
  {
    name: 'Mistral',
    letter: 'M',
    gradient: 'from-orange-500 to-red-500',
    description: 'European AI powerhouse for efficient reasoning.',
    url: 'chat.mistral.ai',
  },
  {
    name: 'Qwen',
    letter: 'Q',
    gradient: 'from-purple-400 to-violet-500',
    description: 'Alibaba\'s multilingual AI for diverse tasks.',
    url: 'qwenlm.ai',
  },
  {
    name: 'GitHub Copilot',
    letter: '⌥',
    gradient: 'from-gray-600 to-gray-800',
    description: 'AI pair programmer for code completion and review.',
    url: 'github.com/copilot',
  },
];

export default function AIServices() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <section id="services" className="relative py-24 sm:py-32">
      {/* Background accent */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-950/10 to-transparent" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="text-center mb-16">
          <span className="text-sm font-medium text-blue-400 uppercase tracking-wider">AI Services</span>
          <h2 className="mt-3 text-3xl sm:text-4xl md:text-5xl font-bold">
            All Your Favorite AI Tools
            <span className="block bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              In One Place
            </span>
          </h2>
          <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
            Access every major AI service from a single panel. Plus, add your own custom services.
          </p>
        </div>

        {/* Services grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-4 sm:gap-6 max-w-4xl mx-auto">
          {services.map((service, index) => (
            <div
              key={index}
              className="group relative"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <div className="relative p-5 sm:p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-all duration-300 hover:bg-white/[0.04] hover:-translate-y-1">
                {/* Icon */}
                <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-gradient-to-br ${service.gradient} flex items-center justify-center text-white font-bold text-lg sm:text-xl mb-3 group-hover:scale-110 transition-transform shadow-lg`}>
                  {service.letter}
                </div>
                {/* Name */}
                <h3 className="text-sm sm:text-base font-semibold text-white mb-1">{service.name}</h3>
                {/* URL */}
                <p className="text-xs text-gray-500 mb-2">{service.url}</p>
                {/* Description */}
                <p className={`text-xs text-gray-400 leading-relaxed transition-all duration-300 ${
                  hoveredIndex === index ? 'opacity-100 max-h-20' : 'opacity-0 max-h-0'
                } overflow-hidden`}>
                  {service.description}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Custom service note */}
        <div className="mt-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10">
            <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm text-gray-300">Add any custom AI service via Settings</span>
          </div>
        </div>
      </div>
    </section>
  );
}

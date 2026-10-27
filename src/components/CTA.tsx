export default function CTA() {
  return (
    <section className="relative py-24 sm:py-32">
      {/* Background effects */}
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[128px]" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Card */}
        <div className="relative rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-8 sm:p-12 overflow-hidden">
          {/* Decorative elements */}
          <div className="absolute top-0 left-1/4 w-32 h-32 bg-purple-500/20 rounded-full blur-[60px]" />
          <div className="absolute bottom-0 right-1/4 w-32 h-32 bg-blue-500/20 rounded-full blur-[60px]" />

          <div className="relative">
            {/* Icon */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center mx-auto mb-6 shadow-lg shadow-purple-500/25">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
              </svg>
            </div>

            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Ready to Supercharge
              <span className="block bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                Your Browsing?
              </span>
            </h2>

            <p className="text-lg text-gray-400 mb-8 max-w-xl mx-auto">
              Join thousands of users who have transformed their productivity with AI Side Panel.
              Free to use, always.
            </p>

            {/* Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a
                href="https://chromewebstore.google.com/detail/ai-side-panel/icapcpllhdnnpcmfdcgpnbgchfenmjmg"
                target="_blank"
                rel="noopener noreferrer"
                className="group px-8 py-3.5 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 font-medium hover:from-purple-500 hover:to-blue-500 transition-all shadow-xl shadow-purple-500/25 flex items-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-5l-3.5 3.5-1.42-1.42L9.67 10H4.5V8.5h5.17L6.08 4.92 7.5 3.5l11 11-1.42 1.42L13.5 12.33v4.17h-1.5z"/>
                </svg>
                Chrome Web Store
              </a>
              <a
                href="https://microsoftedge.microsoft.com/addons/detail/ai-side-panel/okldldohcpoeldjackkdakhoflphiipn"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-3.5 rounded-full border border-white/20 font-medium hover:bg-white/5 transition-all flex items-center gap-2"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
                Edge Add-ons
              </a>
            </div>

            {/* Stats */}
            <div className="mt-10 grid grid-cols-3 gap-6 max-w-md mx-auto">
              <div>
                <div className="text-2xl font-bold text-white">80+</div>
                <div className="text-xs text-gray-500">GitHub Stars</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">9+</div>
                <div className="text-xs text-gray-500">AI Services</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-white">Free</div>
                <div className="text-xs text-gray-500">Forever</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

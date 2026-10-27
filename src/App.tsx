import { useState, useEffect } from 'react';
import Hero from './components/Hero';
import Features from './components/Features';
import AIServices from './components/AIServices';
import HowItWorks from './components/HowItWorks';
import SidePanelDemo from './components/SidePanelDemo';
import CTA from './components/CTA';
import Footer from './components/Footer';
import Navbar from './components/Navbar';

export default function App() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white overflow-x-hidden">
      <Navbar scrollY={scrollY} />
      <Hero />
      <Features />
      <AIServices />
      <SidePanelDemo />
      <HowItWorks />
      <CTA />
      <Footer />
    </div>
  );
}

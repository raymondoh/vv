import React from 'react';
import { Video, Sparkles, Calendar, Search, MapPin, Building2, PhoneCall } from 'lucide-react';
import { WalkthroughBooking } from '../types';

interface NavbarProps {
  onOpenAiMatcher: () => void;
  onOpenBookings: () => void;
  onBackToHome: () => void;
  bookings: WalkthroughBooking[];
  activeView: 'landing' | 'detail';
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAiMatcher,
  onOpenBookings,
  onBackToHome,
  bookings,
  activeView,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-[#0d0f12]/90 border-b border-[#232731]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <button
          id="nav-brand-logo"
          onClick={onBackToHome}
          className="flex items-center gap-3 group text-left transition-opacity hover:opacity-95"
        >
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#d4af37] via-[#c59b27] to-[#8c6b1b] p-[1px] shadow-lg shadow-[#d4af37]/20 flex items-center justify-center">
            <div className="w-full h-full bg-[#11141a] rounded-xl flex items-center justify-center group-hover:bg-[#151922] transition-colors">
              <Video className="w-5 h-5 text-[#f3d98b] group-hover:scale-110 transition-transform" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white font-serif-luxury">
                Venue<span className="text-[#e5c064]">Stream</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#d4af37] bg-[#d4af37]/10 border border-[#d4af37]/30 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[#d4af37] animate-pulse"></span>
                Live 4K Tours
              </span>
            </div>
            <p className="text-[11px] text-gray-400 font-normal">Virtual Venue Walkthroughs & Booking</p>
          </div>
        </button>

        {/* Action Controls */}
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            id="nav-ai-matcher-btn"
            onClick={onOpenAiMatcher}
            className="flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-amber-200 bg-gradient-to-r from-[#292212] to-[#1f1a10] border border-[#d4af37]/40 rounded-lg hover:border-[#d4af37] hover:shadow-md hover:shadow-[#d4af37]/10 transition-all active:scale-95"
          >
            <Sparkles className="w-4 h-4 text-[#e5c064] animate-spin-slow" />
            <span className="hidden md:inline">AI Venue Matcher</span>
            <span className="md:hidden">AI Match</span>
          </button>

          <button
            id="nav-my-bookings-btn"
            onClick={onOpenBookings}
            className="relative flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-gray-200 bg-[#161a22] border border-[#2b313d] rounded-lg hover:bg-[#1d222d] hover:text-white transition-all active:scale-95"
          >
            <Calendar className="w-4 h-4 text-gray-300" />
            <span className="hidden sm:inline">My Walkthroughs</span>
            {bookings.length > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold bg-[#d4af37] text-black rounded-full min-w-[18px]">
                {bookings.length}
              </span>
            )}
          </button>

          {activeView === 'detail' && (
            <button
              id="nav-back-explore-btn"
              onClick={onBackToHome}
              className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-gray-400 hover:text-white transition-colors"
            >
              <Building2 className="w-4 h-4" />
              <span className="hidden sm:inline">Browse Venues</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

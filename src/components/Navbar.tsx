import React from 'react';
import { Video, Sparkles, Calendar, Building2, LayoutDashboard, Bookmark } from 'lucide-react';
import { WalkthroughBooking, VenueBooking } from '../types';

interface NavbarProps {
  onOpenAiMatcher: () => void;
  onOpenEventsHub: () => void;
  onBackToHome: () => void;
  onOpenVenuePortal: () => void;
  walkthroughBookings: WalkthroughBooking[];
  venueBookings: VenueBooking[];
  savedCount: number;
  activeView: 'landing' | 'detail' | 'venue_portal';
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAiMatcher,
  onOpenEventsHub,
  onBackToHome,
  onOpenVenuePortal,
  walkthroughBookings,
  venueBookings,
  savedCount,
  activeView,
}) => {
  const totalCustomerItems = venueBookings.length + walkthroughBookings.length;

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-[#F4F1EA]/95 border-b border-[#DDD8CF] shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand Logo */}
        <button
          id="nav-brand-logo"
          onClick={onBackToHome}
          className="flex items-center gap-3 group text-left transition-opacity hover:opacity-95"
        >
          <div className="w-10 h-10 rounded-xl bg-white border border-[#DDD8CF] shadow-xs flex items-center justify-center group-hover:border-[#26343D] transition-colors">
            <Video className="w-5 h-5 text-[#A86445] group-hover:scale-105 transition-transform" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-[#26343D]">
                Venue<span className="text-[#A86445]">Stream</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-medium text-[#66737A] bg-white border border-[#DDD8CF] rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-[#A86445]"></span>
                Marketplace Prototype
              </span>
            </div>
            <p className="text-[11px] text-[#66737A] font-normal">Virtual Venue Discovery & Booking</p>
          </div>
        </button>

        {/* Action Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Discover Venues (when not in landing) */}
          {activeView !== 'landing' && (
            <button
              id="nav-browse-venues-btn"
              onClick={onBackToHome}
              className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-[#66737A] hover:text-[#26343D] transition-colors"
            >
              <Building2 className="w-4 h-4" />
              <span className="hidden md:inline">Discover Venues</span>
            </button>
          )}

          {/* AI Matcher */}
          <button
            id="nav-ai-matcher-btn"
            onClick={onOpenAiMatcher}
            className="flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-[#26343D] bg-white border border-[#DDD8CF] rounded-xl hover:border-[#26343D] hover:bg-[#F4F1EA] transition-all active:scale-95 shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#A86445]" />
            <span className="hidden md:inline">Smart Venue Match</span>
            <span className="md:hidden">Match</span>
          </button>

          {/* Customer Hub: My Events / Bookings */}
          <button
            id="nav-my-events-btn"
            onClick={onOpenEventsHub}
            className="relative flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium text-[#26343D] bg-white border border-[#DDD8CF] rounded-xl hover:bg-[#F4F1EA] hover:border-[#26343D] shadow-xs transition-all active:scale-95"
          >
            <Calendar className="w-4 h-4 text-[#66737A]" />
            <span className="hidden sm:inline">My Events & Bookings</span>
            <span className="sm:hidden">Events</span>
            {totalCustomerItems > 0 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold bg-[#A86445] text-white rounded-full min-w-[18px] shadow-xs">
                {totalCustomerItems}
              </span>
            )}
          </button>

          {/* Venue Owner Portal Switcher */}
          <button
            id="nav-venue-portal-toggle-btn"
            onClick={onOpenVenuePortal}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl transition-all shadow-xs active:scale-95 ${
              activeView === 'venue_portal'
                ? 'bg-[#26343D] text-white ring-2 ring-[#A86445]'
                : 'bg-[#F4F1EA] text-[#26343D] border border-[#DDD8CF] hover:bg-white hover:border-[#26343D]'
            }`}
          >
            <LayoutDashboard className={`w-3.5 h-3.5 ${activeView === 'venue_portal' ? 'text-[#A86445]' : 'text-[#A86445]'}`} />
            <span className="hidden sm:inline">Venue Owner Portal</span>
            <span className="sm:hidden">Host</span>
          </button>
        </div>
      </div>
    </header>
  );
};


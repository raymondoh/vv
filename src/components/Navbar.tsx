import React from 'react';
import { Video, Sparkles, Calendar, Building2, LayoutDashboard, Sliders, Shield } from 'lucide-react';
import { WalkthroughBooking, VenueBooking } from '../types';

interface NavbarProps {
  onOpenAiMatcher: () => void;
  onOpenEventsHub: () => void;
  onBackToHome: () => void;
  onSelectRole: (role: 'customer_discovery' | 'my_events' | 'venue_portal' | 'platform_admin') => void;
  onOpenOnboardingModal?: () => void;
  walkthroughBookings: WalkthroughBooking[];
  venueBookings: VenueBooking[];
  savedCount: number;
  activeView: 'landing' | 'detail' | 'my_events' | 'venue_portal' | 'platform_admin';
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenAiMatcher,
  onOpenEventsHub,
  onBackToHome,
  onSelectRole,
  onOpenOnboardingModal,
  walkthroughBookings,
  venueBookings,
  savedCount,
  activeView,
}) => {
  const totalCustomerItems = venueBookings.length + walkthroughBookings.length;
  const pendingActionsCount = venueBookings.filter(
    (b) => b.status === 'deposit_due' || b.status === 'final_payment_due'
  ).length;

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
          {/* AI Matcher */}
          <button
            id="nav-ai-matcher-btn"
            onClick={onOpenAiMatcher}
            className="hidden md:flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-[#26343D] bg-white border border-[#DDD8CF] rounded-xl hover:border-[#26343D] hover:bg-[#F4F1EA] transition-all active:scale-95 shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#A86445]" />
            <span>Smart Match</span>
          </button>

          {/* List Your Space / Host Onboarding */}
          {onOpenOnboardingModal && (
            <button
              id="nav-list-space-btn"
              onClick={onOpenOnboardingModal}
              className="hidden lg:flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-bold text-[#A86445] bg-[#F3E7DF]/80 hover:bg-[#F3E7DF] border border-[#A86445]/30 rounded-xl transition-all active:scale-95 shadow-xs"
            >
              <Building2 className="w-3.5 h-3.5 text-[#A86445]" />
              <span>List Your Venue</span>
            </button>
          )}

          {/* Customer Hub: My Events / Full-Page Dashboard */}
          <button
            id="nav-my-events-btn"
            onClick={onOpenEventsHub}
            className={`relative flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-medium rounded-xl shadow-xs transition-all active:scale-95 border ${
              activeView === 'my_events'
                ? 'bg-[#26343D] text-white border-[#26343D]'
                : 'bg-white text-[#26343D] border-[#DDD8CF] hover:bg-[#F4F1EA] hover:border-[#26343D]'
            }`}
          >
            <Calendar className={`w-4 h-4 ${activeView === 'my_events' ? 'text-white' : 'text-[#66737A]'}`} />
            <span className="hidden sm:inline">My Events</span>
            <span className="sm:hidden">Events</span>
            {totalCustomerItems > 0 && (
              <span
                className={`inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold rounded-full min-w-[18px] shadow-xs ${
                  pendingActionsCount > 0
                    ? 'bg-amber-500 text-white animate-pulse'
                    : activeView === 'my_events'
                    ? 'bg-[#A86445] text-white'
                    : 'bg-[#A86445] text-white'
                }`}
              >
                {totalCustomerItems}
              </span>
            )}
          </button>

          {/* Role Switcher Pill Group */}
          <div className="flex items-center bg-white border border-[#DDD8CF] p-1 rounded-xl shadow-xs">
            <button
              id="role-switch-customer-btn"
              onClick={() => onSelectRole('customer_discovery')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeView === 'landing' || activeView === 'detail'
                  ? 'bg-[#26343D] text-white shadow-xs'
                  : 'text-[#66737A] hover:text-[#26343D]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Customer</span>
            </button>

            <button
              id="role-switch-venue-btn"
              onClick={() => onSelectRole('venue_portal')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeView === 'venue_portal'
                  ? 'bg-[#26343D] text-white shadow-xs'
                  : 'text-[#66737A] hover:text-[#26343D]'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Venue Host</span>
              <span className="lg:hidden">Host</span>
            </button>

            <button
              id="role-switch-admin-btn"
              onClick={() => onSelectRole('platform_admin')}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeView === 'platform_admin'
                  ? 'bg-[#A86445] text-white shadow-xs'
                  : 'text-[#66737A] hover:text-[#A86445]'
              }`}
              title="Platform Admin: Commission & Commercial Rules"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">Admin</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};


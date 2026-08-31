import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Video,
  CreditCard,
  FileText,
  Building2,
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  MapPin,
  Heart,
  ChevronRight,
  ExternalLink,
  Copy,
  Info,
  Check,
  HelpCircle,
  XCircle,
} from 'lucide-react';
import { VenueBooking, WalkthroughBooking, Venue, VenueBookingStatus } from '../types';
import { getStatusDisplay } from '../utils/bookingStatus';

interface CustomerDashboardProps {
  venueBookings: VenueBooking[];
  walkthroughBookings: WalkthroughBooking[];
  venues: Venue[];
  favorites: string[];
  onOpenDepositModal: (booking: VenueBooking) => void;
  onOpenEventPlanner: (booking: VenueBooking) => void;
  onOpenLiveSimulator: (booking: WalkthroughBooking) => void;
  onExploreVenue: (venueId: string) => void;
  onBrowseVenues: () => void;
  onOpenAiMatcher: () => void;
  onRequestToBookVenue: (venue: Venue) => void;
  onToggleFavorite: (venueId: string) => void;
}

export const CustomerDashboard: React.FC<CustomerDashboardProps> = ({
  venueBookings,
  walkthroughBookings,
  venues,
  favorites,
  onOpenDepositModal,
  onOpenEventPlanner,
  onOpenLiveSimulator,
  onExploreVenue,
  onBrowseVenues,
  onOpenAiMatcher,
  onRequestToBookVenue,
  onToggleFavorite,
}) => {
  const [activeTab, setActiveTab] = useState<
    'all' | 'action_required' | 'pending' | 'confirmed' | 'walkthroughs' | 'saved'
  >('all');
  const [copiedTourId, setCopiedTourId] = useState<string | null>(null);

  const handleCopyLink = (booking: WalkthroughBooking) => {
    navigator.clipboard.writeText(booking.meetingUrl);
    setCopiedTourId(booking.id);
    setTimeout(() => setCopiedTourId(null), 2500);
  };

  // Indicators calculation
  const pendingRequestsCount = venueBookings.filter((b) => b.status === 'requested').length;
  const paymentsDueCount = venueBookings.filter(
    (b) => b.status === 'deposit_due' || b.status === 'final_payment_due'
  ).length;
  const confirmedEventsCount = venueBookings.filter(
    (b) => b.status === 'confirmed' || b.status === 'fully_paid' || b.status === 'completed'
  ).length;
  const walkthroughsCount = walkthroughBookings.length;

  const savedVenuesList = venues.filter((v) => favorites.includes(v.id));

  // Filter bookings according to active tab
  const filteredBookings = venueBookings.filter((b) => {
    if (activeTab === 'action_required') {
      return b.status === 'deposit_due' || b.status === 'final_payment_due';
    }
    if (activeTab === 'pending') {
      return b.status === 'requested';
    }
    if (activeTab === 'confirmed') {
      return b.status === 'confirmed' || b.status === 'fully_paid' || b.status === 'completed';
    }
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Top Banner: Customer Account Experience Header */}
      <div className="bg-[#26343D] text-white rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm border border-[#26343D]">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#A86445] text-white">
              Customer Account & Event Hub
            </span>
            <span className="text-xs text-stone-300">
              Live Reservations, Milestones & Space Coordination
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            My Events & Discovery Hub
          </h1>
          <p className="text-xs sm:text-sm text-stone-300 max-w-2xl leading-relaxed">
            Manage your venue booking requests, track coordinator reviews, pay deposits, collaborate on floor plans, and access scheduled 4K virtual tours.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            id="customer-dashboard-browse-btn"
            onClick={onBrowseVenues}
            className="px-4 py-2.5 rounded-xl bg-white text-[#26343D] text-xs font-semibold hover:bg-[#F4F1EA] transition-all flex items-center gap-2 shadow-xs active:scale-95"
          >
            <Building2 className="w-4 h-4 text-[#A86445]" />
            <span>Discover Venues</span>
          </button>
          <button
            id="customer-dashboard-smart-match-btn"
            onClick={onOpenAiMatcher}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/20 transition-all flex items-center gap-1.5 active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#A86445]" />
            <span>Smart Match</span>
          </button>
        </div>
      </div>

      {/* Summary Indicator Cards (Calm & Consumer-Friendly) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Booking Requests */}
        <div
          onClick={() => setActiveTab('pending')}
          className={`bg-white border rounded-2xl p-5 space-y-2 cursor-pointer transition-all shadow-xs hover:border-[#26343D] ${
            activeTab === 'pending' ? 'ring-2 ring-[#26343D] border-[#26343D]' : 'border-[#DDD8CF]'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#66737A]">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Booking Requests</span>
            <Calendar className="w-4 h-4 text-[#A86445]" />
          </div>
          <div className="text-2xl font-bold text-[#26343D]">
            {pendingRequestsCount}
          </div>
          <div className="text-[11px] text-[#66737A]">
            {pendingRequestsCount === 1
              ? '1 request awaiting host review'
              : `${pendingRequestsCount} requests awaiting host review`}
          </div>
        </div>

        {/* Card 2: Payments Due (Action Required) */}
        <div
          onClick={() => setActiveTab('action_required')}
          className={`bg-white border rounded-2xl p-5 space-y-2 cursor-pointer transition-all shadow-xs hover:border-[#26343D] ${
            paymentsDueCount > 0
              ? 'border-amber-300 bg-amber-50/30'
              : 'border-[#DDD8CF]'
          } ${activeTab === 'action_required' ? 'ring-2 ring-[#A86445]' : ''}`}
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-amber-900">
              Payments Due
            </span>
            <CreditCard className="w-4 h-4 text-[#A86445]" />
          </div>
          <div className="text-2xl font-bold text-[#A86445]">
            {paymentsDueCount}
          </div>
          <div className="text-[11px] text-amber-800/80">
            {paymentsDueCount === 0
              ? 'No pending balance payments'
              : `${paymentsDueCount} deposit or balance ready to pay`}
          </div>
        </div>

        {/* Card 3: Confirmed Events */}
        <div
          onClick={() => setActiveTab('confirmed')}
          className={`bg-white border rounded-2xl p-5 space-y-2 cursor-pointer transition-all shadow-xs hover:border-[#26343D] ${
            activeTab === 'confirmed' ? 'ring-2 ring-[#26343D] border-[#26343D]' : 'border-[#DDD8CF]'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#66737A]">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Confirmed Events</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-bold text-emerald-800">
            {confirmedEventsCount}
          </div>
          <div className="text-[11px] text-[#66737A]">
            Dates secured & checklist in progress
          </div>
        </div>

        {/* Card 4: Upcoming Walkthroughs */}
        <div
          onClick={() => setActiveTab('walkthroughs')}
          className={`bg-white border rounded-2xl p-5 space-y-2 cursor-pointer transition-all shadow-xs hover:border-[#26343D] ${
            activeTab === 'walkthroughs' ? 'ring-2 ring-[#26343D] border-[#26343D]' : 'border-[#DDD8CF]'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#66737A]">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Upcoming Walkthroughs</span>
            <Video className="w-4 h-4 text-[#26343D]" />
          </div>
          <div className="text-2xl font-bold text-[#26343D]">
            {walkthroughsCount}
          </div>
          <div className="text-[11px] text-[#66737A]">
            Live virtual inspections with coordinators
          </div>
        </div>
      </div>

      {/* Tabs Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDD8CF] pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            id="tab-all-bookings"
            onClick={() => setActiveTab('all')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'all'
                ? 'bg-[#26343D] text-white shadow-xs'
                : 'bg-white text-[#66737A] hover:text-[#26343D] border border-[#DDD8CF]'
            }`}
          >
            All Bookings ({venueBookings.length})
          </button>

          <button
            id="tab-payments-due"
            onClick={() => setActiveTab('action_required')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'action_required'
                ? 'bg-[#A86445] text-white shadow-xs'
                : 'bg-white text-[#66737A] hover:text-[#A86445] border border-[#DDD8CF]'
            }`}
          >
            <span>Payments Due</span>
            {paymentsDueCount > 0 && (
              <span className="px-1.5 py-0.2 bg-white text-[#A86445] rounded-full text-[10px] font-bold">
                {paymentsDueCount}
              </span>
            )}
          </button>

          <button
            id="tab-pending-requests"
            onClick={() => setActiveTab('pending')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'pending'
                ? 'bg-[#26343D] text-white shadow-xs'
                : 'bg-white text-[#66737A] hover:text-[#26343D] border border-[#DDD8CF]'
            }`}
          >
            Pending Host Review ({pendingRequestsCount})
          </button>

          <button
            id="tab-confirmed-events"
            onClick={() => setActiveTab('confirmed')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === 'confirmed'
                ? 'bg-[#26343D] text-white shadow-xs'
                : 'bg-white text-[#66737A] hover:text-[#26343D] border border-[#DDD8CF]'
            }`}
          >
            Confirmed ({confirmedEventsCount})
          </button>

          <button
            id="tab-walkthroughs"
            onClick={() => setActiveTab('walkthroughs')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'walkthroughs'
                ? 'bg-[#26343D] text-white shadow-xs'
                : 'bg-white text-[#66737A] hover:text-[#26343D] border border-[#DDD8CF]'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            <span>Virtual Tours ({walkthroughsCount})</span>
          </button>

          <button
            id="tab-saved-venues"
            onClick={() => setActiveTab('saved')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'saved'
                ? 'bg-[#26343D] text-white shadow-xs'
                : 'bg-white text-[#66737A] hover:text-[#26343D] border border-[#DDD8CF]'
            }`}
          >
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-current" />
            <span>Saved Spaces ({savedVenuesList.length})</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'walkthroughs' ? (
        /* ================= WALKTHROUGHS VIEW ================= */
        <div className="space-y-4">
          {walkthroughBookings.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-[#DDD8CF] p-8 space-y-4">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-[#F4F1EA] border border-[#DDD8CF] flex items-center justify-center text-[#A86445]">
                <Video className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-[#26343D]">No Live Walkthroughs Scheduled</h4>
                <p className="text-xs text-[#66737A] max-w-sm mx-auto leading-relaxed">
                  Schedule a real-time virtual walkthrough with venue hosts in Seattle, Chicago, or Napa to inspect floor plans and spatial lighting.
                </p>
              </div>
              <button
                onClick={onBrowseVenues}
                className="px-4 py-2 bg-[#26343D] text-white font-semibold text-xs rounded-xl hover:bg-[#1E2930] shadow-xs"
              >
                Browse Venue Catalog
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {walkthroughBookings.map((tour) => (
                <div
                  key={tour.id}
                  className="bg-white border border-[#DDD8CF] rounded-2xl p-5 space-y-4 shadow-xs hover:border-[#26343D] transition-all"
                >
                  <div className="flex items-start gap-3.5">
                    <img
                      src={tour.venueImage}
                      alt={tour.venueName}
                      className="w-16 h-16 rounded-xl object-cover border border-[#DDD8CF] shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Confirmed Tour
                        </span>
                        <span className="text-[10px] font-mono text-[#66737A]">{tour.meetingCode}</span>
                      </div>
                      <h4 className="text-sm font-bold text-[#26343D] truncate mt-1">
                        {tour.venueName}
                      </h4>
                      <p className="text-xs text-[#66737A] flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-[#A86445]" />
                        <span>{tour.venueLocation}</span>
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#F4F1EA] p-3 rounded-xl border border-[#DDD8CF] space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-[#26343D]">
                      <span className="text-[#66737A]">Scheduled Appointment:</span>
                      <strong className="text-[#26343D] font-semibold">
                        {tour.scheduledDate} • {tour.scheduledTime}
                      </strong>
                    </div>
                    <div className="flex items-center justify-between text-[#26343D]">
                      <span className="text-[#66737A]">Host Coordinator:</span>
                      <span className="text-[#26343D] font-medium">{tour.hostName}</span>
                    </div>
                    <div className="flex items-center justify-between text-[#26343D]">
                      <span className="text-[#66737A]">Event Type:</span>
                      <span className="capitalize">{tour.eventType} ({tour.estimatedGuests} guests)</span>
                    </div>
                  </div>

                  {tour.specialRequests && (
                    <div className="text-xs text-[#66737A] italic bg-white p-2.5 rounded-lg border border-[#DDD8CF]">
                      "{tour.specialRequests}"
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handleCopyLink(tour)}
                      className="py-2.5 px-3 rounded-xl bg-white border border-[#DDD8CF] text-xs font-semibold text-[#26343D] hover:bg-[#F4F1EA] flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedTourId === tour.id ? 'Link Copied!' : 'Copy Meeting Link'}</span>
                    </button>

                    <button
                      onClick={() => onOpenLiveSimulator(tour)}
                      className="py-2.5 px-3 rounded-xl bg-[#26343D] text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-xs hover:bg-[#1E2930] active:scale-95 transition-all"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Join Live Call</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'saved' ? (
        /* ================= SAVED SPACES VIEW ================= */
        <div className="space-y-4">
          {savedVenuesList.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-[#DDD8CF] p-8 space-y-4">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-[#F4F1EA] border border-[#DDD8CF] flex items-center justify-center text-rose-500">
                <Heart className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-[#26343D]">No Saved Venues Yet</h4>
                <p className="text-xs text-[#66737A] max-w-sm mx-auto leading-relaxed">
                  Click the heart icon on any venue card to save spaces for easy side-by-side comparison and event planning.
                </p>
              </div>
              <button
                onClick={onBrowseVenues}
                className="px-4 py-2 bg-[#26343D] text-white font-semibold text-xs rounded-xl hover:bg-[#1E2930] shadow-xs"
              >
                Explore Venues
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {savedVenuesList.map((venue) => (
                <div
                  key={venue.id}
                  className="bg-white border border-[#DDD8CF] rounded-2xl overflow-hidden shadow-xs hover:border-[#26343D] transition-all flex flex-col"
                >
                  <div className="relative h-44">
                    <img
                      src={venue.heroImage}
                      alt={venue.name}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => onToggleFavorite(venue.id)}
                      className="absolute top-3 right-3 p-2 bg-white/90 rounded-full text-rose-500 shadow-xs hover:bg-white transition-all"
                    >
                      <Heart className="w-4 h-4 fill-current" />
                    </button>
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                    <div>
                      <span className="text-[10px] font-semibold text-[#A86445] uppercase tracking-wider">
                        {venue.location.city}, {venue.location.state}
                      </span>
                      <h4 className="text-base font-bold text-[#26343D] mt-0.5">{venue.name}</h4>
                      <p className="text-xs text-[#66737A] mt-1 line-clamp-2">{venue.tagline}</p>
                    </div>
                    <div className="pt-2 border-t border-[#DDD8CF] flex items-center justify-between">
                      <div className="text-xs">
                        <span className="text-[#66737A]">From </span>
                        <strong className="text-[#26343D]">${venue.pricing.startingPrice.toLocaleString()}</strong>
                      </div>
                      <button
                        onClick={() => onExploreVenue(venue.id)}
                        className="px-3 py-1.5 bg-[#26343D] text-white text-xs font-semibold rounded-xl hover:bg-[#1E2930] shadow-xs"
                      >
                        Inspect Space
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* ================= VENUE BOOKINGS LIST ================= */
        <div className="space-y-4">
          {filteredBookings.length === 0 ? (
            <div className="py-16 text-center bg-white rounded-2xl border border-[#DDD8CF] p-8 space-y-4">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-[#F4F1EA] border border-[#DDD8CF] flex items-center justify-center text-[#A86445]">
                <Calendar className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-base font-bold text-[#26343D]">No Bookings in This Section</h4>
                <p className="text-xs text-[#66737A] max-w-sm mx-auto leading-relaxed">
                  Browse spaces in Seattle, Chicago, or Napa, inspect 4K layouts, and submit a "Request to Book" to reserve your date.
                </p>
              </div>
              <button
                onClick={onBrowseVenues}
                className="px-4 py-2 bg-[#26343D] text-white font-semibold text-xs rounded-xl hover:bg-[#1E2930] shadow-xs"
              >
                Browse Venue Catalog
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5">
              {filteredBookings.map((booking) => {
                const statusInfo = getStatusDisplay(booking.status);
                const isRequested = booking.status === 'requested';
                const isDepositDue = booking.status === 'deposit_due';
                const isConfirmed = booking.status === 'confirmed';
                const isFinalPaymentDue = booking.status === 'final_payment_due';
                const isFullyPaid = booking.status === 'fully_paid';
                const isCompleted = booking.status === 'completed';
                const isDeclined = booking.status === 'declined';
                const isCancelled = booking.status === 'cancelled';

                const isPaidOrConfirmed = isConfirmed || isFullyPaid || isCompleted;

                return (
                  <div
                    key={booking.id}
                    className={`bg-white border rounded-2xl p-5 sm:p-6 space-y-5 transition-all shadow-xs hover:border-[#26343D] ${
                      isDepositDue
                        ? 'border-amber-300 ring-1 ring-amber-300'
                        : isRequested
                        ? 'border-[#A86445]/40'
                        : 'border-[#DDD8CF]'
                    }`}
                  >
                    {/* Header Row: Venue & Booking Identity */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <img
                          src={booking.venueImage}
                          alt={booking.venueName}
                          className="w-20 h-20 rounded-xl object-cover border border-[#DDD8CF] shrink-0"
                        />
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded border ${statusInfo.badgeClass}`}
                            >
                              {statusInfo.customerLabel}
                            </span>
                            <span className="text-xs font-mono text-[#66737A]">
                              Ref: {booking.bookingNumber}
                            </span>
                          </div>

                          <h3 className="text-lg font-bold text-[#26343D]">
                            {booking.venueName}
                          </h3>

                          <p className="text-xs text-[#66737A] flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-[#26343D]">{booking.eventDate}</span>
                            {booking.startTime && (
                              <span>• {booking.startTime} – {booking.endTime}</span>
                            )}
                            <span>• {booking.guestCount} Guests</span>
                            <span>• {booking.venueLocation}</span>
                          </p>
                        </div>
                      </div>

                      {/* Status Explanation Card */}
                      <div className="sm:text-right text-xs bg-[#F4F1EA] p-3 rounded-xl border border-[#DDD8CF] sm:max-w-xs">
                        <span className="font-semibold text-[#26343D] block mb-0.5">
                          {statusInfo.customerLabel}
                        </span>
                        <p className="text-[11px] text-[#66737A] leading-relaxed">
                          {statusInfo.description}
                        </p>
                      </div>
                    </div>

                    {/* Financial Summary & Layout Details (No platform fees shown to customer) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      {/* Box 1: Financial Schedule */}
                      <div className="bg-[#F4F1EA]/60 p-3.5 rounded-xl border border-[#DDD8CF] space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#66737A] block">
                          Venue Pricing & Schedule
                        </span>
                        <div className="flex justify-between text-[#26343D]">
                          <span>Venue Total:</span>
                          <strong className="font-semibold">${booking.grossAmount.toLocaleString()}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-[#66737A]">Deposit ({booking.depositPercentage}%):</span>
                          <strong className={isPaidOrConfirmed ? 'text-emerald-700' : 'text-[#A86445]'}>
                            ${booking.depositAmount.toLocaleString()} {isPaidOrConfirmed ? '(Paid)' : '(Due)'}
                          </strong>
                        </div>
                        <div className="flex justify-between text-[#66737A] pt-1 border-t border-[#DDD8CF]">
                          <span>Final Balance:</span>
                          <span className={isFullyPaid || isCompleted ? 'text-emerald-700 font-semibold' : 'text-[#26343D]'}>
                            ${booking.finalBalance?.toLocaleString()} {isFullyPaid || isCompleted ? '(Paid)' : ''}
                          </span>
                        </div>
                      </div>

                      {/* Box 2: Spatial Layout & Spec */}
                      <div className="bg-[#F4F1EA]/60 p-3.5 rounded-xl border border-[#DDD8CF] space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#66737A] block">
                          Room Layout & Event Type
                        </span>
                        <div>
                          <span className="text-[#66737A] block">Preferred Floor Plan:</span>
                          <strong className="text-[#26343D] truncate block">{booking.selectedLayout}</strong>
                        </div>
                        <div>
                          <span className="text-[#66737A] block">Event Category:</span>
                          <span className="text-[#26343D] capitalize">{booking.eventType}</span>
                        </div>
                      </div>

                      {/* Box 3: Coordinator & Logistics */}
                      <div className="bg-[#F4F1EA]/60 p-3.5 rounded-xl border border-[#DDD8CF] space-y-1.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#66737A] block">
                          Venue Coordinator
                        </span>
                        <div>
                          <span className="text-[#66737A] block">Host Contact:</span>
                          <strong className="text-[#26343D]">{booking.hostName}</strong>
                        </div>
                        {booking.specialRequirements ? (
                          <div>
                            <span className="text-[#66737A] block">Special Specs:</span>
                            <span className="text-[#26343D] line-clamp-1 italic">{booking.specialRequirements}</span>
                          </div>
                        ) : (
                          <div className="text-[#66737A] text-[11px]">
                            Checklists and floor plans synced with Event Planner.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Bar with Contextual Next Step Buttons */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#DDD8CF]">
                      <div className="text-xs text-[#66737A] flex items-center gap-1.5">
                        {isDepositDue && (
                          <span className="text-amber-800 font-semibold flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                            Next Step: Pay initial deposit to confirm date and lock venue.
                          </span>
                        )}
                        {isRequested && (
                          <span className="text-[#A86445] font-medium flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Awaiting host calendar confirmation. You will be notified to pay deposit once approved.
                          </span>
                        )}
                        {isConfirmed && (
                          <span className="text-emerald-700 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Date locked! Use the Event Planner to finalize catering, AV, and vendor COIs.
                          </span>
                        )}
                        {isFinalPaymentDue && (
                          <span className="text-orange-800 font-medium flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Final payment window is open. Settle balance prior to event.
                          </span>
                        )}
                        {isFullyPaid && (
                          <span className="text-emerald-700 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Fully paid. Ready for event execution.
                          </span>
                        )}
                        {isDeclined && (
                          <span className="text-rose-700 font-medium flex items-center gap-1">
                            <XCircle className="w-3.5 h-3.5" />
                            Venue unavailable for this date. Explore similar venues below.
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {/* Primary Action Button (Deposit Payment) */}
                        {isDepositDue && (
                          <button
                            id={`customer-pay-deposit-btn-${booking.id}`}
                            onClick={() => onOpenDepositModal(booking)}
                            className="px-4 py-2.5 rounded-xl bg-[#A86445] text-xs font-semibold text-white flex items-center gap-1.5 shadow-xs hover:bg-[#8F5439] active:scale-95 transition-all"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Pay Deposit (Simulated) — ${booking.depositAmount.toLocaleString()}</span>
                          </button>
                        )}

                        {/* Final Balance Payment */}
                        {isFinalPaymentDue && (
                          <button
                            id={`customer-pay-balance-btn-${booking.id}`}
                            onClick={() => onOpenEventPlanner(booking)}
                            className="px-4 py-2.5 rounded-xl bg-emerald-700 text-xs font-semibold text-white flex items-center gap-1.5 shadow-xs hover:bg-emerald-800 active:scale-95 transition-all"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Pay Final Balance (Simulated) — ${booking.finalBalance?.toLocaleString()}</span>
                          </button>
                        )}

                        {/* Event Planner Button */}
                        {!isDeclined && !isCancelled && (
                          <button
                            id={`customer-open-planner-btn-${booking.id}`}
                            onClick={() => onOpenEventPlanner(booking)}
                            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs ${
                              isConfirmed || isFullyPaid
                                ? 'bg-[#26343D] text-white hover:bg-[#1E2930]'
                                : 'bg-white border border-[#DDD8CF] text-[#26343D] hover:bg-[#F4F1EA]'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5 text-[#A86445]" />
                            <span>Open Event Planner</span>
                          </button>
                        )}

                        {/* Declined Alternative CTA */}
                        {isDeclined && (
                          <button
                            onClick={onOpenAiMatcher}
                            className="px-4 py-2 rounded-xl bg-[#A86445] text-white text-xs font-semibold hover:bg-[#8F5439] flex items-center gap-1.5 shadow-xs"
                          >
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>Find Alternative Venues</span>
                          </button>
                        )}

                        {/* Inspect 4K Tour Link */}
                        <button
                          onClick={() => onExploreVenue(booking.venueId)}
                          className="px-3 py-2 rounded-xl bg-white border border-[#DDD8CF] text-xs font-medium text-[#66737A] hover:text-[#26343D] hover:bg-[#F4F1EA] flex items-center gap-1.5 transition-colors shadow-xs"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Inspect 4K Tour</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

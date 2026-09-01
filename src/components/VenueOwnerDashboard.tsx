import React, { useState } from 'react';
import {
  Building2,
  Calendar,
  DollarSign,
  TrendingUp,
  Percent,
  CheckCircle2,
  XCircle,
  Clock,
  Users,
  Video,
  Eye,
  Sparkles,
  Info,
  ArrowRight,
  ShieldCheck,
  Check,
  ChevronDown,
  Filter,
  Layers,
  MapPin,
} from 'lucide-react';
import { Venue, VenueBooking, WalkthroughBooking, MarketplaceConfig, VenueBookingStatus } from '../types';
import { getStatusDisplay } from '../utils/bookingStatus';

interface VenueOwnerDashboardProps {
  venues: Venue[];
  venueBookings: VenueBooking[];
  walkthroughBookings: WalkthroughBooking[];
  marketplaceConfig: MarketplaceConfig;
  onUpdateBookingStatus: (bookingId: string, newStatus: VenueBookingStatus) => void;
  onOpenLiveSimulator: (booking: WalkthroughBooking) => void;
  onInspectVenue: (venue: Venue) => void;
  onSwitchToCustomerView: () => void;
}

export const VenueOwnerDashboard: React.FC<VenueOwnerDashboardProps> = ({
  venues,
  venueBookings,
  walkthroughBookings,
  marketplaceConfig,
  onUpdateBookingStatus,
  onOpenLiveSimulator,
  onInspectVenue,
  onSwitchToCustomerView,
}) => {
  const [selectedVenueId, setSelectedVenueId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'bookings' | 'walkthroughs' | 'spaces'>('bookings');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed'>('all');

  const selectedVenue = venues.find((v) => v.id === selectedVenueId) || venues[0];

  const commissionRate = marketplaceConfig.commissionPercentage || 12;

  // Filter bookings for the selected venue (or all)
  const filteredBookings = venueBookings.filter((b) => {
    if (selectedVenueId !== 'all' && b.venueId !== selectedVenueId) return false;
    if (statusFilter === 'pending') return b.status === 'requested';
    if (statusFilter === 'confirmed') {
      return (
        b.status === 'deposit_due' ||
        b.status === 'confirmed' ||
        b.status === 'final_payment_due' ||
        b.status === 'fully_paid' ||
        b.status === 'completed'
      );
    }
    return true;
  });

  const filteredWalkthroughs = walkthroughBookings.filter((w) => {
    if (selectedVenueId !== 'all' && w.venueId !== selectedVenueId) return false;
    return true;
  });

  // Calculate financials for active bookings
  const allVenueBookings = selectedVenueId === 'all'
    ? venueBookings
    : venueBookings.filter((b) => b.venueId === selectedVenueId);

  // Prominent global pending requests queue across all managed properties
  const globalPendingRequests = venueBookings.filter((b) => b.status === 'requested');

  const activeBookings = allVenueBookings.filter(
    (b) => b.status !== 'cancelled' && b.status !== 'declined'
  );

  const grossBookingsTotal = activeBookings.reduce((sum, b) => sum + b.grossAmount, 0);
  const platformCommissionTotal = Math.round((grossBookingsTotal * commissionRate) / 100);
  const venueNetPayoutTotal = grossBookingsTotal - platformCommissionTotal;

  const pendingRequestsCount = allVenueBookings.filter((b) => b.status === 'requested').length;
  const confirmedCount = allVenueBookings.filter(
    (b) => b.status === 'confirmed' || b.status === 'deposit_due' || b.status === 'final_payment_due' || b.status === 'fully_paid'
  ).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Top Banner: Venue Portal Role Indicator */}
      <div className="bg-[#26343D] text-white rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm border border-[#26343D]">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#A86445] text-white">
              Venue Host & Operations Portal
            </span>
            <span className="text-xs text-stone-300">
              Commercial Operations, Availability & Walkthrough Logistics
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {selectedVenueId === 'all' ? 'All Managed Venues' : selectedVenue.name}
          </h1>
          <p className="text-xs sm:text-sm text-stone-300 max-w-2xl leading-relaxed">
            Review incoming space booking requests, host live virtual walkthroughs, inspect floor plan setups, and track gross booking volume and net venue payouts.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Venue Switcher */}
          <div className="relative">
            <select
              id="venue-portal-select"
              value={selectedVenueId}
              onChange={(e) => setSelectedVenueId(e.target.value)}
              className="w-full sm:w-auto bg-white/10 hover:bg-white/15 text-white text-xs font-semibold px-4 py-2.5 rounded-xl border border-white/20 focus:outline-none focus:ring-2 focus:ring-[#A86445] cursor-pointer"
            >
              <option value="all" className="text-[#26343D]">All Managed Venues ({venues.length} properties)</option>
              <option value="the-glasshouse-luminary" className="text-[#26343D]">The Glasshouse Luminary (Chicago)</option>
              <option value="chateau-de-mirabelle" className="text-[#26343D]">Château de Mirabelle (Napa)</option>
              <option value="the-foundry-machine-shop" className="text-[#26343D]">The Foundry Machine Shop (Seattle)</option>
            </select>
          </div>

          <button
            id="switch-to-customer-view-btn"
            onClick={onSwitchToCustomerView}
            className="px-4 py-2.5 rounded-xl bg-white text-[#26343D] text-xs font-semibold hover:bg-[#F4F1EA] transition-all flex items-center justify-center gap-1.5 shadow-xs"
          >
            <span>Customer Discovery</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Commercial Overview Cards (Read-only for Venue Owner) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gross Booking Volume */}
        <div className="bg-white border border-[#DDD8CF] rounded-2xl p-5 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#66737A]">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Gross Bookings</span>
            <DollarSign className="w-4 h-4 text-[#A86445]" />
          </div>
          <div className="text-2xl font-bold text-[#26343D]">
            ${grossBookingsTotal.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#66737A]">
            Total customer space hire value
          </div>
        </div>

        {/* Platform Commission (Fixed / Non-editable by Venue Owner) */}
        <div className="bg-white border border-[#DDD8CF] rounded-2xl p-5 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#66737A]">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Platform Commission</span>
            <span className="text-xs font-bold text-[#A86445] font-mono bg-[#F3E7DF] px-2 py-0.5 rounded border border-[#A86445]/20">
              {commissionRate}%
            </span>
          </div>
          <div className="text-2xl font-bold text-[#A86445]">
            -${platformCommissionTotal.toLocaleString()}
          </div>
          <div className="text-[11px] text-[#66737A]">
            Contract commission rate on bookings
          </div>
        </div>

        {/* Estimated Venue Net Payout */}
        <div className="bg-white border border-[#DDD8CF] rounded-2xl p-5 space-y-2 shadow-xs bg-emerald-50/40">
          <div className="flex items-center justify-between text-xs text-[#66737A]">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-emerald-800">Venue Net Payout</span>
            <TrendingUp className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-bold text-emerald-800">
            ${venueNetPayoutTotal.toLocaleString()}
          </div>
          <div className="text-[11px] text-emerald-700/80">
            Net revenue disbursed to venue
          </div>
        </div>

        {/* Operational Pipeline Counts */}
        <div className="bg-white border border-[#DDD8CF] rounded-2xl p-5 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#66737A]">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Operations Pipeline</span>
            <Calendar className="w-4 h-4 text-[#26343D]" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-[#26343D]">{pendingRequestsCount}</span>
            <span className="text-xs text-[#66737A]">pending / {confirmedCount} active</span>
          </div>
          <div className="text-[11px] text-[#66737A]">
            {filteredWalkthroughs.length} scheduled live walkthroughs
          </div>
        </div>
      </div>

      {/* Prominent Host Area: New Booking Requests Queue */}
      <div className="bg-white border-2 border-[#A86445]/40 rounded-2xl p-5 sm:p-6 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#DDD8CF] pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#F3E7DF] border border-[#A86445]/30 flex items-center justify-center text-[#A86445]">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#26343D] flex items-center gap-2">
                <span>New Booking Requests Queue</span>
                {globalPendingRequests.length > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#A86445] text-white">
                    {globalPendingRequests.length} Awaiting Host Review
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    All Caught Up
                  </span>
                )}
              </h2>
              <p className="text-xs text-[#66737A]">
                Incoming reservation requests across all properties. Review customer specs and accept to request initial deposit or decline.
              </p>
            </div>
          </div>
        </div>

        {globalPendingRequests.length === 0 ? (
          <div className="p-6 text-center bg-[#F4F1EA]/60 rounded-xl border border-[#DDD8CF] text-xs text-[#66737A] space-y-1">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto" />
            <p className="font-semibold text-[#26343D]">No New Booking Requests Pending Review</p>
            <p>When customers submit booking requests for any of your venues, they will instantly appear here for one-click review and acceptance.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {globalPendingRequests.map((request) => {
              const reqCommission = Math.round((request.grossAmount * commissionRate) / 100);
              const reqNet = request.grossAmount - reqCommission;

              return (
                <div
                  key={request.id}
                  id={`pending-request-card-${request.id}`}
                  className="bg-[#F4F1EA] border border-[#A86445]/40 rounded-xl p-4 sm:p-5 space-y-4 shadow-xs"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    {/* Customer & Space Identification */}
                    <div className="flex items-start gap-3.5">
                      <img
                        src={request.venueImage}
                        alt={request.venueName}
                        className="w-16 h-16 rounded-xl object-cover border border-[#DDD8CF] shrink-0"
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider bg-[#A86445] text-white px-2 py-0.5 rounded">
                            New Request
                          </span>
                          <span className="text-xs font-mono text-[#66737A]">{request.bookingNumber}</span>
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-[#26343D]">
                          {request.clientName} {request.clientCompany ? `• ${request.clientCompany}` : ''}
                        </h3>
                        <p className="text-xs text-[#66737A]">
                          Requested Space: <strong className="text-[#26343D]">{request.venueName}</strong> ({request.venueLocation})
                        </p>
                      </div>
                    </div>

                    {/* Financial Payout Summary */}
                    <div className="bg-white p-3 rounded-xl border border-[#DDD8CF] text-xs min-w-[240px] space-y-1">
                      <div className="flex justify-between text-[#66737A]">
                        <span>Space Hire (Gross):</span>
                        <strong className="text-[#26343D]">${request.grossAmount.toLocaleString()}</strong>
                      </div>
                      <div className="flex justify-between text-[#A86445]">
                        <span>Commission ({commissionRate}%):</span>
                        <span>-${reqCommission.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-emerald-800 font-bold pt-1 border-t border-[#DDD8CF]">
                        <span>Expected Net Payout:</span>
                        <span>${reqNet.toLocaleString()}</span>
                      </div>
                      <div className="text-[10px] text-[#66737A] pt-0.5 flex justify-between">
                        <span>Client Deposit:</span>
                        <span className="font-semibold text-[#26343D]">${request.depositAmount.toLocaleString()} ({request.depositPercentage}%)</span>
                      </div>
                    </div>
                  </div>

                  {/* Event Specifics Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs bg-white p-3 rounded-xl border border-[#DDD8CF]">
                    <div>
                      <span className="text-[#66737A] block">Date & Timing:</span>
                      <strong className="text-[#26343D]">{request.eventDate} ({request.startTime} – {request.endTime})</strong>
                    </div>
                    <div>
                      <span className="text-[#66737A] block">Event Type & Attendance:</span>
                      <strong className="text-[#26343D] capitalize">{request.eventType} ({request.guestCount} guests)</strong>
                    </div>
                    <div>
                      <span className="text-[#66737A] block">Selected Layout:</span>
                      <strong className="text-[#26343D] truncate block">{request.selectedLayout}</strong>
                    </div>
                    {request.specialRequirements && (
                      <div className="sm:col-span-3 pt-1 border-t border-[#DDD8CF]">
                        <span className="text-[#66737A] block">Customer Requirements:</span>
                        <span className="text-[#26343D] italic">"{request.specialRequirements}"</span>
                      </div>
                    )}
                    <div className="sm:col-span-3 pt-1 border-t border-[#DDD8CF] flex flex-wrap items-center justify-between text-[11px] text-[#66737A]">
                      <span>Customer Contact: {request.clientEmail} • {request.clientPhone}</span>
                      <span>Submitted: {new Date(request.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Real Action Buttons for Host */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-[#66737A]">
                      Accepting confirms space availability and automatically prompts the customer to pay their {request.depositPercentage}% deposit.
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        id={`queue-accept-booking-btn-${request.id}`}
                        onClick={() => onUpdateBookingStatus(request.id, 'deposit_due')}
                        className="px-4 py-2 bg-emerald-700 text-white font-semibold text-xs rounded-xl hover:bg-emerald-800 active:scale-95 transition-all flex items-center gap-1.5 shadow-xs"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept Booking Request</span>
                      </button>
                      <button
                        id={`queue-decline-booking-btn-${request.id}`}
                        onClick={() => onUpdateBookingStatus(request.id, 'declined')}
                        className="px-3.5 py-2 bg-white border border-rose-200 text-rose-700 font-semibold text-xs rounded-xl hover:bg-rose-50 active:scale-95 transition-all"
                      >
                        Decline Request
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Commercial Terms & Marketplace Policy Box */}
      <div className="bg-[#F4F1EA] border border-[#DDD8CF] rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#A86445]" />
            <h3 className="text-sm font-bold text-[#26343D]">
              Marketplace Commercial Terms & Payout Formula
            </h3>
          </div>
          <p className="text-xs text-[#66737A] leading-relaxed">
            Customers pay the standard venue hire fee with zero surcharge. VenueStream retains an agreed <strong>{commissionRate}% platform commission</strong> upon confirmed space booking, with net payouts disbursed post-event.
          </p>
          <div className="p-2.5 rounded-xl bg-white border border-[#DDD8CF] text-xs font-mono text-[#26343D] inline-block">
            <strong>Gross Booking (${grossBookingsTotal.toLocaleString()})</strong> − <strong>Platform Commission ({commissionRate}% = ${platformCommissionTotal.toLocaleString()})</strong> = <strong className="text-emerald-700">Venue Net (${venueNetPayoutTotal.toLocaleString()})</strong>
          </div>
        </div>
      </div>

      {/* Navigation Tabs and Content */}
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDD8CF] pb-3">
          <div className="flex items-center gap-2">
            <button
              id="venue-tab-bookings-btn"
              onClick={() => setActiveTab('bookings')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'bookings'
                  ? 'bg-[#26343D] text-white shadow-xs'
                  : 'bg-white text-[#66737A] hover:text-[#26343D] border border-[#DDD8CF]'
              }`}
            >
              Booking Requests & Pipeline ({allVenueBookings.length})
            </button>

            <button
              id="venue-tab-walkthroughs-btn"
              onClick={() => setActiveTab('walkthroughs')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'walkthroughs'
                  ? 'bg-[#26343D] text-white shadow-xs'
                  : 'bg-white text-[#66737A] hover:text-[#26343D] border border-[#DDD8CF]'
              }`}
            >
              Scheduled Walkthroughs ({filteredWalkthroughs.length})
            </button>

            <button
              id="venue-tab-spaces-btn"
              onClick={() => setActiveTab('spaces')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'spaces'
                  ? 'bg-[#26343D] text-white shadow-xs'
                  : 'bg-white text-[#66737A] hover:text-[#26343D] border border-[#DDD8CF]'
              }`}
            >
              Space & Layout Blueprints
            </button>
          </div>

          {activeTab === 'bookings' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#66737A]">Filter:</span>
              <button
                onClick={() => setStatusFilter('all')}
                className={`text-xs px-2.5 py-1 rounded-lg ${
                  statusFilter === 'all' ? 'bg-[#26343D] text-white font-semibold' : 'text-[#66737A] hover:text-[#26343D]'
                }`}
              >
                All ({allVenueBookings.length})
              </button>
              <button
                onClick={() => setStatusFilter('pending')}
                className={`text-xs px-2.5 py-1 rounded-lg ${
                  statusFilter === 'pending' ? 'bg-[#26343D] text-white font-semibold' : 'text-[#66737A] hover:text-[#26343D]'
                }`}
              >
                Pending Review ({pendingRequestsCount})
              </button>
              <button
                onClick={() => setStatusFilter('confirmed')}
                className={`text-xs px-2.5 py-1 rounded-lg ${
                  statusFilter === 'confirmed' ? 'bg-[#26343D] text-white font-semibold' : 'text-[#66737A] hover:text-[#26343D]'
                }`}
              >
                Active / Confirmed ({confirmedCount})
              </button>
            </div>
          )}
        </div>

        {/* TAB 1: BOOKING REQUESTS MANAGEMENT */}
        {activeTab === 'bookings' && (
          <div className="space-y-4">
            {filteredBookings.length === 0 ? (
              <div className="py-16 text-center bg-white rounded-2xl border border-[#DDD8CF] p-8 space-y-3">
                <Calendar className="w-10 h-10 text-[#A86445] mx-auto" />
                <h4 className="text-base font-bold text-[#26343D]">No Bookings in This Filter</h4>
                <p className="text-xs text-[#66737A]">
                  New client booking requests submitted from venue detail pages will appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {filteredBookings.map((booking) => {
                  const commissionAmount = Math.round((booking.grossAmount * commissionRate) / 100);
                  const venueNetAmount = booking.grossAmount - commissionAmount;
                  const statusInfo = getStatusDisplay(booking.status);

                  const isRequested = booking.status === 'requested';
                  const isDepositDue = booking.status === 'deposit_due';
                  const isConfirmed = booking.status === 'confirmed';
                  const isFinalPaymentDue = booking.status === 'final_payment_due';
                  const isFullyPaid = booking.status === 'fully_paid';
                  const isCompleted = booking.status === 'completed';

                  return (
                    <div
                      key={booking.id}
                      className={`bg-white border rounded-2xl p-5 space-y-4 transition-all shadow-xs ${
                        isRequested ? 'border-[#A86445] ring-1 ring-[#A86445]/30' : 'border-[#DDD8CF]'
                      }`}
                    >
                      {/* Top Row: Client & Booking Metadata */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2.5">
                            <span className={`text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded border ${statusInfo.badgeClass}`}>
                              {statusInfo.venueLabel}
                            </span>
                            <span className="text-xs font-mono text-[#66737A]">{booking.bookingNumber}</span>
                          </div>
                          <h4 className="text-base font-bold text-[#26343D]">
                            {booking.clientName} {booking.clientCompany ? `(${booking.clientCompany})` : ''}
                          </h4>
                          <p className="text-xs text-[#66737A]">
                            Event Date: <strong className="text-[#26343D]">{booking.eventDate}</strong> ({booking.startTime} – {booking.endTime}) • <strong className="text-[#26343D]">{booking.guestCount} Guests</strong> • Venue: {booking.venueName}
                          </p>
                        </div>

                        {/* Financial calculation breakdown for this specific booking */}
                        <div className="bg-[#F4F1EA] p-3 rounded-xl border border-[#DDD8CF] text-xs text-right min-w-[220px]">
                          <div className="flex justify-between text-[#66737A]">
                            <span>Gross Booking:</span>
                            <span className="font-bold text-[#26343D]">${booking.grossAmount.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-[#A86445]">
                            <span>Commission ({commissionRate}%):</span>
                            <span>-${commissionAmount.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between font-bold text-emerald-800 pt-1 border-t border-[#DDD8CF]">
                            <span>Expected Net:</span>
                            <span>${venueNetAmount.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* Event Details & Requirements */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#F4F1EA]/50 p-3 rounded-xl border border-[#DDD8CF]">
                        <div>
                          <span className="text-[#66737A] block">Selected Layout & Space:</span>
                          <strong className="text-[#26343D]">{booking.selectedLayout}</strong>
                        </div>
                        <div>
                          <span className="text-[#66737A] block">Customer Contact:</span>
                          <span className="text-[#26343D]">{booking.clientEmail} • {booking.clientPhone}</span>
                        </div>
                        {booking.specialRequirements && (
                          <div className="sm:col-span-2">
                            <span className="text-[#66737A] block">Client Logistics Notes:</span>
                            <span className="text-[#26343D] italic">{booking.specialRequirements}</span>
                          </div>
                        )}
                      </div>

                      {/* Action Bar for Venue Host */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[#DDD8CF]">
                        <div className="text-xs text-[#66737A]">
                          {isCompleted && (
                            <span className="text-stone-700 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-stone-600" />
                              Event successfully executed and completed.
                            </span>
                          )}
                          {isFullyPaid && (
                            <span className="text-emerald-700 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Fully paid by client ($0 balance remaining). Ready for event execution.
                            </span>
                          )}
                          {isFinalPaymentDue && (
                            <span className="text-amber-800 font-medium">
                              Final balance due ($ {booking.finalBalance?.toLocaleString()} remaining). Awaiting client balance payment.
                            </span>
                          )}
                          {isConfirmed && (
                            <span className="text-emerald-700 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Client paid ${booking.depositAmount.toLocaleString()} deposit ({booking.depositPercentage}%). Date secured.
                            </span>
                          )}
                          {isDepositDue && (
                            <span className="text-amber-800 font-medium">
                              Space approved by venue. Awaiting client deposit payment of ${booking.depositAmount.toLocaleString()} ({booking.depositPercentage}%).
                            </span>
                          )}
                          {isRequested && (
                            <span className="text-[#A86445] font-medium">
                              Action required: Verify space availability and accept or decline this request.
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {isRequested && (
                            <>
                              <button
                                id={`accept-booking-btn-${booking.id}`}
                                onClick={() => onUpdateBookingStatus(booking.id, 'deposit_due')}
                                className="px-4 py-2 bg-emerald-700 text-white font-semibold text-xs rounded-xl hover:bg-emerald-800 active:scale-95 transition-all flex items-center gap-1.5 shadow-xs"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Accept & Request Deposit</span>
                              </button>
                              <button
                                id={`decline-booking-btn-${booking.id}`}
                                onClick={() => onUpdateBookingStatus(booking.id, 'declined')}
                                className="px-3 py-2 bg-white border border-rose-200 text-rose-700 font-semibold text-xs rounded-xl hover:bg-rose-50 active:scale-95 transition-all"
                              >
                                Decline
                              </button>
                            </>
                          )}

                          {isDepositDue && (
                            <span
                              id={`awaiting-deposit-status-${booking.id}`}
                              className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                            >
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              <span>Awaiting customer deposit</span>
                            </span>
                          )}

                          {isConfirmed && (
                            <button
                              id={`trigger-final-payment-window-btn-${booking.id}`}
                              onClick={() => onUpdateBookingStatus(booking.id, 'final_payment_due')}
                              className="px-3.5 py-1.5 bg-white border border-[#DDD8CF] text-xs font-semibold text-[#26343D] hover:bg-[#F4F1EA] rounded-xl transition-all shadow-xs"
                            >
                              Advance to Final Payment Window
                            </button>
                          )}

                          {isFinalPaymentDue && (
                            <button
                              id={`simulate-final-payment-btn-${booking.id}`}
                              onClick={() => onUpdateBookingStatus(booking.id, 'fully_paid')}
                              className="px-3.5 py-1.5 bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800 rounded-xl transition-all shadow-xs"
                            >
                              Simulate Full Balance Payment
                            </button>
                          )}

                          {isFullyPaid && (
                            <button
                              id={`complete-event-btn-${booking.id}`}
                              onClick={() => onUpdateBookingStatus(booking.id, 'completed')}
                              className="px-3.5 py-1.5 bg-[#26343D] text-white text-xs font-semibold hover:bg-[#1E2930] rounded-xl transition-all shadow-xs"
                            >
                              Mark Event Completed
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SCHEDULED WALKTHROUGHS */}
        {activeTab === 'walkthroughs' && (
          <div className="space-y-4">
            {filteredWalkthroughs.length === 0 ? (
              <div className="py-16 text-center bg-white rounded-2xl border border-[#DDD8CF] p-8 space-y-3">
                <Video className="w-10 h-10 text-[#A86445] mx-auto" />
                <h4 className="text-base font-bold text-[#26343D]">No Live Walkthroughs Scheduled</h4>
                <p className="text-xs text-[#66737A]">
                  When clients schedule a live virtual walkthrough, appointments will appear here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredWalkthroughs.map((tour) => (
                  <div
                    key={tour.id}
                    className="bg-white border border-[#DDD8CF] rounded-2xl p-5 space-y-3.5 shadow-xs"
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-mono text-[#66737A]">{tour.meetingCode}</span>
                        <h4 className="text-sm font-bold text-[#26343D]">{tour.clientName}</h4>
                        <p className="text-xs text-[#66737A]">{tour.clientEmail} • {tour.clientPhone}</p>
                      </div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Confirmed Tour
                      </span>
                    </div>

                    <div className="bg-[#F4F1EA] p-3 rounded-xl border border-[#DDD8CF] space-y-1 text-xs">
                      <div className="flex items-center justify-between text-[#26343D]">
                        <span className="text-[#66737A]">Tour Date:</span>
                        <strong>{tour.scheduledDate} • {tour.scheduledTime}</strong>
                      </div>
                      <div className="flex items-center justify-between text-[#26343D]">
                        <span className="text-[#66737A]">Event Type & Guests:</span>
                        <span>{tour.eventType} • {tour.estimatedGuests} guests</span>
                      </div>
                    </div>

                    {tour.specialRequests && (
                      <p className="text-xs text-[#66737A] italic bg-white p-2.5 rounded-lg border border-[#DDD8CF]">
                        "{tour.specialRequests}"
                      </p>
                    )}

                    <div className="pt-1 flex items-center justify-between gap-2">
                      <button
                        onClick={() => onOpenLiveSimulator(tour)}
                        className="w-full py-2.5 px-3 rounded-xl bg-[#26343D] text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-xs hover:bg-[#1E2930] active:scale-95 transition-all"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Launch Host Video Stream</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SPACES & LAYOUT SPECIFICATIONS */}
        {activeTab === 'spaces' && (
          <div className="bg-white border border-[#DDD8CF] rounded-2xl p-6 space-y-6 shadow-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-[#26343D]">
                  {selectedVenue.name} — Space Directory & Walkthroughs
                </h3>
                <p className="text-xs text-[#66737A]">
                  Configured room setups, capacities, and high-definition video walkthrough assets.
                </p>
              </div>
              <button
                onClick={() => onInspectVenue(selectedVenue)}
                className="px-4 py-2 bg-[#F4F1EA] text-[#26343D] text-xs font-semibold rounded-xl border border-[#DDD8CF] hover:bg-white flex items-center gap-1.5 shadow-xs"
              >
                <Eye className="w-3.5 h-3.5 text-[#A86445]" />
                <span>View Public Page</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedVenue.walkthroughClips.map((clip) => (
                <div
                  key={clip.id}
                  className="bg-[#F4F1EA] rounded-xl border border-[#DDD8CF] overflow-hidden p-4 space-y-3"
                >
                  <img
                    src={clip.thumbnail}
                    alt={clip.title}
                    className="w-full h-32 rounded-lg object-cover border border-[#DDD8CF]"
                  />
                  <div>
                    <h4 className="text-xs font-bold text-[#26343D] truncate">{clip.title}</h4>
                    <span className="text-[11px] text-[#66737A] block">
                      Max Capacity: <strong>{clip.maxCapacityForLayout} guests</strong>
                    </span>
                    <span className="text-[11px] text-[#66737A] block">
                      Duration: {Math.floor(clip.durationSec / 60)}m {clip.durationSec % 60}s • 4K Recorded
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {clip.cameraAngles.map((angle, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] bg-white border border-[#DDD8CF] px-2 py-0.5 rounded text-[#26343D]"
                      >
                        {angle}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};


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
  Plus,
  Edit3,
  Sliders,
  Maximize2,
  Grid,
  FileText,
  Lock,
  Globe,
  ImageIcon,
} from 'lucide-react';
import { Venue, VenueBooking, WalkthroughBooking, MarketplaceConfig, VenueBookingStatus, BusinessOrganisation, VenueSpace } from '../types';
import { getStatusDisplay } from '../utils/bookingStatus';
import { calculateCompleteness, getQualityTierBadge } from '../utils/completeness';
import { formatCurrency, formatLocation, formatDateDisplay } from '../utils/formatters';

interface VenueOwnerDashboardProps {
  venues: Venue[];
  venueBookings: VenueBooking[];
  walkthroughBookings: WalkthroughBooking[];
  marketplaceConfig: MarketplaceConfig;
  organisations?: BusinessOrganisation[];
  onOpenOnboardingModal?: (venueToEdit?: Venue | null, organisationId?: string) => void;
  onToggleVenuePublishStatus?: (venueId: string, currentStatus: 'draft' | 'published') => Promise<void> | void;
  onUpdateBookingStatus: (
    bookingId: string,
    newStatus: VenueBookingStatus
  ) => Promise<{ success: boolean; error?: string; booking?: VenueBooking }> | void;
  onOpenLiveSimulator: (booking: WalkthroughBooking) => void;
  onInspectVenue: (venue: Venue) => void;
  onSwitchToCustomerView: () => void;
  onOpenAdminSettings?: () => void;
}

export const VenueOwnerDashboard: React.FC<VenueOwnerDashboardProps> = ({
  venues,
  venueBookings,
  walkthroughBookings,
  marketplaceConfig,
  organisations = [],
  onOpenOnboardingModal,
  onToggleVenuePublishStatus,
  onUpdateBookingStatus,
  onOpenLiveSimulator,
  onInspectVenue,
  onSwitchToCustomerView,
  onOpenAdminSettings,
}) => {
  const [selectedVenueId, setSelectedVenueId] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'venues' | 'bookings' | 'walkthroughs' | 'spaces'>('venues');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'confirmed'>('all');
  const [processingBookingId, setProcessingBookingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<{ id: string; message: string } | null>(null);
  const [acceptedBookingIds, setAcceptedBookingIds] = useState<string[]>([]);
  const [highlightedBookingId, setHighlightedBookingId] = useState<string | null>(null);

  const selectedVenue = venues.find((v) => v.id === selectedVenueId) || venues[0];

  const commissionRate = marketplaceConfig.commissionPercentage ?? 12;

  const handleHostAction = async (bookingId: string, newStatus: VenueBookingStatus) => {
    if (processingBookingId === bookingId) return; // Prevent duplicate submissions
    setProcessingBookingId(bookingId);
    setActionError(null);

    try {
      const result = await onUpdateBookingStatus(bookingId, newStatus);
      if (result && !result.success && result.error) {
        setActionError({ id: bookingId, message: result.error });
      } else if (result && result.success && newStatus === 'deposit_due') {
        // Retain visual identity in the queue so the host sees the clear accepted feedback
        setAcceptedBookingIds((prev) => (prev.includes(bookingId) ? prev : [...prev, bookingId]));
      }
    } catch (err: any) {
      setActionError({
        id: bookingId,
        message: err?.message || 'Failed to update booking. Please try again.',
      });
    } finally {
      setProcessingBookingId(null);
    }
  };

  const handleDismissAcceptedBooking = (bookingId: string) => {
    setAcceptedBookingIds((prev) => prev.filter((id) => id !== bookingId));
  };

  const handleNavigateToBooking = (bookingId: string) => {
    setActiveTab('bookings');
    setStatusFilter('all');
    setHighlightedBookingId(bookingId);
    setAcceptedBookingIds((prev) => prev.filter((id) => id !== bookingId));
    setTimeout(() => {
      const el = document.getElementById(`host-booking-card-${bookingId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

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
  // Includes pending 'requested' items and any recently accepted items awaiting dismissal
  const queueBookings = venueBookings.filter(
    (b) => b.status === 'requested' || acceptedBookingIds.includes(b.id)
  );
  const pendingRequestsCount = allVenueBookings.filter((b) => b.status === 'requested').length;
  const globalPendingRequestsCount = venueBookings.filter((b) => b.status === 'requested').length;

  const activeBookings = allVenueBookings.filter(
    (b) => b.status !== 'cancelled' && b.status !== 'declined'
  );

  const selectedVenueObj = venues.find((v) => v.id === selectedVenueId);
  const hostCurrency = selectedVenueObj?.pricing?.currency || activeBookings[0]?.currency || 'GBP';

  const grossBookingsTotal = activeBookings.reduce((sum, b) => sum + b.grossAmount, 0);
  const platformCommissionTotal = Math.round((grossBookingsTotal * commissionRate) / 100);
  const venueNetPayoutTotal = grossBookingsTotal - platformCommissionTotal;

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
            {selectedVenueId === 'all' ? 'All Managed Properties' : selectedVenue.name}
          </h1>
          <p className="text-xs sm:text-sm text-stone-300 max-w-2xl leading-relaxed">
            Review incoming space booking requests, host live virtual walkthroughs, inspect floor plan setups, and manage your property portfolio.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {onOpenOnboardingModal && (
            <button
              id="host-onboard-new-venue-btn"
              onClick={() => onOpenOnboardingModal(null)}
              className="px-4 py-2.5 rounded-xl bg-[#A86445] hover:bg-[#8F5236] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>List New Venue</span>
            </button>
          )}

          {/* Venue Switcher */}
          <div className="relative">
            <select
              id="venue-portal-select"
              value={selectedVenueId}
              onChange={(e) => setSelectedVenueId(e.target.value)}
              className="w-full sm:w-auto bg-white/10 hover:bg-white/15 text-white text-xs font-semibold px-4 py-2.5 rounded-xl border border-white/20 focus:outline-hidden focus:ring-2 focus:ring-[#A86445] cursor-pointer"
            >
              <option value="all" className="text-[#26343D]">All Managed Properties ({venues.length} listed)</option>
              {venues.map((v) => (
                <option key={v.id} value={v.id} className="text-[#26343D]">
                  {v.name} ({v.location.city} · {v.status === 'draft' ? 'Draft' : 'Live'})
                </option>
              ))}
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
            {formatCurrency(grossBookingsTotal, hostCurrency)}
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
            -{formatCurrency(platformCommissionTotal, hostCurrency)}
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
            {formatCurrency(venueNetPayoutTotal, hostCurrency)}
          </div>
          <div className="text-[11px] text-emerald-700/80">
            Net revenue payable to venue
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
                {globalPendingRequestsCount > 0 ? (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#A86445] text-white">
                    {globalPendingRequestsCount} Awaiting Host Review
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

        {queueBookings.length === 0 ? (
          <div className="p-6 text-center bg-[#F4F1EA]/60 rounded-xl border border-[#DDD8CF] text-xs text-[#66737A] space-y-1">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mx-auto" />
            <p className="font-semibold text-[#26343D]">No New Booking Requests Pending Review</p>
            <p>When customers submit booking requests for any of your venues, they will instantly appear here for one-click review and acceptance.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {queueBookings.map((request) => {
              const reqCommission = Math.round((request.grossAmount * commissionRate) / 100);
              const reqNet = request.grossAmount - reqCommission;
              const isAccepted = acceptedBookingIds.includes(request.id) && request.status !== 'requested';
              const reqCurrency = request.currency || 'GBP';

              // Post-Acceptance Success Feedback State
              if (isAccepted) {
                return (
                  <div
                    key={request.id}
                    id={`accepted-request-card-${request.id}`}
                    className="bg-[#FDFCF7] border-2 border-emerald-600/40 rounded-xl p-5 space-y-4 shadow-xs transition-all animate-fadeIn"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center justify-center shrink-0">
                          <Check className="w-5 h-5 stroke-[2.5]" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-700 text-white flex items-center gap-1">
                              <Check className="w-3 h-3 stroke-[2.5]" />
                              <span>Booking accepted — deposit requested</span>
                            </span>
                            <span className="text-xs font-mono text-[#66737A]">{request.bookingNumber}</span>
                          </div>
                          <h3 className="text-base font-bold text-[#26343D]">
                            {request.venueName} · {request.clientName} {request.clientCompany ? `(${request.clientCompany})` : ''}
                          </h3>
                          <p className="text-xs text-[#26343D]">
                            <strong className="text-emerald-800 font-bold">
                              {formatCurrency(request.depositAmount, reqCurrency)} deposit requested from customer
                            </strong>
                            {' '}·{' '}
                            <span className="text-[#66737A]">
                              Event date: <strong className="text-[#26343D]">{formatDateDisplay(request.eventDate, 'readable')}</strong> ({request.guestCount} guests · {request.selectedLayout})
                            </span>
                          </p>
                        </div>
                      </div>

                      {/* Financial Snapshot */}
                      <div className="bg-white p-3 rounded-xl border border-[#DDD8CF] text-xs text-right min-w-[200px] shrink-0">
                        <div className="flex justify-between text-[#66737A]">
                          <span>Gross Hire:</span>
                          <span className="font-bold text-[#26343D]">{formatCurrency(request.grossAmount, reqCurrency)}</span>
                        </div>
                        <div className="flex justify-between text-emerald-800 font-bold pt-1 border-t border-[#DDD8CF]">
                          <span>Deposit ({request.depositPercentage}%):</span>
                          <span>{formatCurrency(request.depositAmount, reqCurrency)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-emerald-50/70 rounded-xl border border-emerald-200/70 text-xs text-emerald-900 flex items-center justify-between gap-3">
                      <span>
                        This reservation is now active in <strong>Bookings & Payments</strong> awaiting customer deposit payment. The customer has been prompted to complete their deposit.
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-[#DDD8CF]">
                      <div className="text-xs text-[#66737A]">
                        Status: <strong className="text-emerald-800 font-semibold">Accepted — Awaiting Deposit</strong>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          id={`queue-view-in-pipeline-btn-${request.id}`}
                          onClick={() => handleNavigateToBooking(request.id)}
                          className="px-4 py-2 bg-[#26343D] hover:bg-[#1E2930] text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span>View in Bookings & Payments</span>
                        </button>
                        <button
                          id={`queue-dismiss-accepted-btn-${request.id}`}
                          onClick={() => handleDismissAcceptedBooking(request.id)}
                          className="px-3.5 py-2 bg-white border border-[#DDD8CF] hover:bg-[#F4F1EA] text-[#26343D] font-semibold text-xs rounded-xl transition-all active:scale-95"
                        >
                          Dismiss / Continue
                        </button>
                      </div>
                    </div>
                  </div>
                );
              }

              // Standard Pending Review State
              return (
                <div
                  key={request.id}
                  id={`pending-request-card-${request.id}`}
                  className="bg-[#F4F1EA] border border-[#A86445]/40 rounded-xl p-4 sm:p-5 space-y-4 shadow-xs"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    {/* Customer & Space Identification */}
                    <div className="flex items-start gap-3.5">
                      {request.venueImage ? (
                        <img
                          src={request.venueImage}
                          alt={request.venueName}
                          className="w-16 h-16 rounded-xl object-cover border border-[#DDD8CF] shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-[#EAE5DC] border border-[#DDD8CF] shrink-0 flex flex-col items-center justify-center p-1 text-center">
                          <ImageIcon className="w-4 h-4 text-[#A86445] mb-0.5" />
                          <span className="text-[9px] font-bold text-[#26343D] leading-tight line-clamp-1 max-w-[90%]">
                            {request.venueName ? request.venueName.slice(0, 8) : 'Venue'}
                          </span>
                          <span className="text-[8px] text-[#66737A]">No photo</span>
                        </div>
                      )}
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
                    {(() => {
                      return (
                        <div className="bg-white p-3 rounded-xl border border-[#DDD8CF] text-xs min-w-[240px] space-y-1">
                          <div className="flex justify-between text-[#66737A]">
                            <span>Space Hire (Gross):</span>
                            <strong className="text-[#26343D]">{formatCurrency(request.grossAmount, reqCurrency)}</strong>
                          </div>
                          <div className="flex justify-between text-[#A86445]">
                            <span>Commission ({commissionRate}%):</span>
                            <span>-{formatCurrency(reqCommission, reqCurrency)}</span>
                          </div>
                          <div className="flex justify-between text-emerald-800 font-bold pt-1 border-t border-[#DDD8CF]">
                            <span>Expected Net Payout:</span>
                            <span>{formatCurrency(reqNet, reqCurrency)}</span>
                          </div>
                          <div className="text-[10px] text-[#66737A] pt-0.5 flex justify-between">
                            <span>Client Deposit:</span>
                            <span className="font-semibold text-[#26343D]">{formatCurrency(request.depositAmount, reqCurrency)} ({request.depositPercentage}%)</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Event Specifics Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs bg-white p-3 rounded-xl border border-[#DDD8CF]">
                    <div>
                      <span className="text-[#66737A] block">Date & Timing:</span>
                      <strong className="text-[#26343D]">{formatDateDisplay(request.eventDate, 'readable')} ({request.startTime} – {request.endTime})</strong>
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
                      <span>Submitted: {formatDateDisplay(request.createdAt, 'compact')}</span>
                    </div>
                  </div>

                  {/* Real Action Buttons for Host */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                    <span className="text-xs text-[#66737A]">
                      Accepting confirms space availability and automatically prompts the customer to pay their {request.depositPercentage}% deposit.
                    </span>

                    {actionError && actionError.id === request.id && (
                      <div className="p-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
                        {actionError.message}
                      </div>
                    )}

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        id={`queue-accept-booking-btn-${request.id}`}
                        disabled={processingBookingId === request.id}
                        onClick={() => handleHostAction(request.id, 'deposit_due')}
                        className={`px-4 py-2 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-all ${
                          processingBookingId === request.id
                            ? 'bg-emerald-600 opacity-80 cursor-not-allowed'
                            : 'bg-emerald-700 hover:bg-emerald-800 active:scale-95'
                        }`}
                      >
                        {processingBookingId === request.id ? (
                          <>
                            <Clock className="w-3.5 h-3.5 animate-spin" />
                            <span>Accepting...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Accept Booking Request</span>
                          </>
                        )}
                      </button>
                      <button
                        id={`queue-decline-booking-btn-${request.id}`}
                        disabled={processingBookingId === request.id}
                        onClick={() => handleHostAction(request.id, 'declined')}
                        className={`px-3.5 py-2 bg-white border border-rose-200 text-rose-700 font-semibold text-xs rounded-xl transition-all ${
                          processingBookingId === request.id
                            ? 'opacity-50 cursor-not-allowed'
                            : 'hover:bg-rose-50 active:scale-95'
                        }`}
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
            Customers pay the standard venue hire fee with zero surcharge. VenueStream retains an agreed <strong>{commissionRate}% platform commission</strong> upon confirmed space booking, with net payouts payable post-event.
          </p>
          <div className="p-2.5 rounded-xl bg-white border border-[#DDD8CF] text-xs font-mono text-[#26343D] inline-block">
            <strong>Gross Booking ({formatCurrency(grossBookingsTotal, hostCurrency)})</strong> − <strong>Platform Commission ({commissionRate}% = {formatCurrency(platformCommissionTotal, hostCurrency)})</strong> = <strong className="text-emerald-700">Venue Net ({formatCurrency(venueNetPayoutTotal, hostCurrency)})</strong>
          </div>
        </div>
      </div>

      {/* Navigation Tabs and Content */}
      <div className="space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#DDD8CF] pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="venue-tab-venues-btn"
              onClick={() => setActiveTab('venues')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'venues'
                  ? 'bg-[#26343D] text-white shadow-xs'
                  : 'bg-white text-[#66737A] hover:text-[#26343D] border border-[#DDD8CF]'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>My Venues & Spaces ({venues.length})</span>
            </button>

            <button
              id="venue-tab-bookings-btn"
              onClick={() => setActiveTab('bookings')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${
                activeTab === 'bookings'
                  ? 'bg-[#26343D] text-white shadow-xs'
                  : 'bg-white text-[#66737A] hover:text-[#26343D] border border-[#DDD8CF]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Bookings & Payments</span>
              {pendingRequestsCount > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#A86445] text-white">
                  {pendingRequestsCount} new
                </span>
              ) : (
                <span className="text-[11px] opacity-75 font-mono">({allVenueBookings.length})</span>
              )}
            </button>

            <button
              id="venue-tab-walkthroughs-btn"
              onClick={() => setActiveTab('walkthroughs')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'walkthroughs'
                  ? 'bg-[#26343D] text-white shadow-xs'
                  : 'bg-white text-[#66737A] hover:text-[#26343D] border border-[#DDD8CF]'
              }`}
            >
              <Video className="w-3.5 h-3.5" />
              <span>Scheduled Walkthroughs ({filteredWalkthroughs.length})</span>
            </button>

            <button
              id="venue-tab-spaces-btn"
              onClick={() => setActiveTab('spaces')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                activeTab === 'spaces'
                  ? 'bg-[#26343D] text-white shadow-xs'
                  : 'bg-white text-[#66737A] hover:text-[#26343D] border border-[#DDD8CF]'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Space & Layout Blueprints</span>
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

        {/* TAB 0: MY VENUES & SPACES PORTFOLIO */}
        {activeTab === 'venues' && (
          <div className="space-y-6">
            {/* Prominent Deposit Received / Booking Confirmed Alert Cards */}
            {(() => {
              const confirmedBookings = venueBookings.filter((b) => b.status === 'confirmed');
              if (confirmedBookings.length === 0) return null;

              return (
                <div className="space-y-3">
                  {confirmedBookings.map((b) => {
                    const bCurrency = b.currency || 'GBP';
                    return (
                      <div
                        key={b.id}
                        id={`deposit-received-highlight-${b.id}`}
                        className="bg-emerald-50/90 border-2 border-emerald-600/30 rounded-2xl p-5 sm:p-6 shadow-xs transition-all"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-3.5">
                            <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                              <CheckCircle2 className="w-5 h-5" />
                            </div>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-700 text-white">
                                  Deposit received — booking confirmed
                                </span>
                                <span className="text-xs font-mono text-[#66737A]">{b.bookingNumber}</span>
                              </div>
                              <h3 className="text-base font-bold text-[#26343D]">
                                {b.venueName} · {b.clientName} {b.clientCompany ? `(${b.clientCompany})` : ''}
                              </h3>
                              <p className="text-xs text-[#26343D] flex flex-wrap items-center gap-1.5">
                                <strong className="text-emerald-800 font-bold">
                                  {formatCurrency(b.depositAmount, bCurrency)} received
                                </strong>
                                <span>·</span>
                                <strong className="text-[#26343D]">
                                  {formatDateDisplay(b.eventDate, 'readable')} secured
                                </strong>
                                <span className="text-[#66737A]">
                                  ({b.startTime} – {b.endTime} · {b.guestCount} guests · {b.selectedLayout})
                                </span>
                              </p>
                            </div>
                          </div>

                          <button
                            id={`view-confirmed-booking-btn-${b.id}`}
                            onClick={() => handleNavigateToBooking(b.id)}
                            className="px-4 py-2.5 bg-[#26343D] hover:bg-[#1E2930] text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition-all shrink-0 active:scale-95"
                          >
                            <span>View booking</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Compact Recent Booking Activity & Operational Updates */}
            {(() => {
              const recentActivityBookings = venueBookings
                .filter((b) => b.status !== 'requested' && b.status !== 'declined' && b.status !== 'cancelled')
                .slice(0, 4);
              if (recentActivityBookings.length === 0) return null;

              return (
                <div className="bg-white border border-[#DDD8CF] rounded-2xl p-5 space-y-3.5 shadow-xs">
                  <div className="flex items-center justify-between border-b border-[#DDD8CF] pb-2.5">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-[#A86445]" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#26343D]">
                        Recent Booking Activity & Updates
                      </h3>
                    </div>
                    <button
                      onClick={() => {
                        setActiveTab('bookings');
                        setStatusFilter('all');
                      }}
                      className="text-xs font-semibold text-[#A86445] hover:text-[#8F5236] flex items-center gap-1"
                    >
                      <span>View in Bookings & Payments</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {recentActivityBookings.map((b) => {
                      const bCurrency = b.currency || 'GBP';
                      const statusInfo = getStatusDisplay(b.status);
                      return (
                        <div
                          key={b.id}
                          className="p-3 bg-[#FDFCF7] border border-[#DDD8CF] rounded-xl flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${statusInfo.badgeClass}`}>
                                {statusInfo.venueLabel}
                              </span>
                              <span className="text-[11px] font-mono text-[#66737A] truncate">{b.bookingNumber}</span>
                            </div>
                            <div className="font-bold text-[#26343D] truncate">
                              {b.venueName} · {b.clientName}
                            </div>
                            <div className="text-[11px] text-[#66737A]">
                              {formatDateDisplay(b.eventDate, 'short')} · {b.status === 'confirmed' ? `${formatCurrency(b.depositAmount, bCurrency)} deposit paid` : `Hire: ${formatCurrency(b.grossAmount, bCurrency)}`}
                            </div>
                          </div>
                          <button
                            onClick={() => handleNavigateToBooking(b.id)}
                            className="px-2.5 py-1.5 bg-white border border-[#DDD8CF] hover:bg-[#F4F1EA] text-[#26343D] text-[11px] font-bold rounded-lg transition-all shrink-0 flex items-center gap-1"
                          >
                            <span>View</span>
                            <ArrowRight className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#F4F1EA] p-5 rounded-2xl border border-[#DDD8CF]">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#26343D] flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#A86445]" />
                  <span>Business Organisation & Venue Portfolio</span>
                </h3>
                <p className="text-xs text-[#66737A]">
                  Manage multiple properties, room inventories, layout blueprints, and listing quality tiers under your company account.
                </p>
              </div>

              {onOpenOnboardingModal && (
                <button
                  type="button"
                  onClick={() => onOpenOnboardingModal(null)}
                  className="px-4 py-2.5 rounded-xl bg-[#26343D] hover:bg-[#1E2930] text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Onboard New Venue</span>
                </button>
              )}
            </div>

            {/* Venue Cards List */}
            <div className="grid grid-cols-1 gap-5">
              {venues.map((venue) => {
                const comp = calculateCompleteness(venue);
                const tier = getQualityTierBadge(comp.tier);
                const isDraft = venue.status === 'draft';
                const spacesCount = venue.spaces?.length || 1;
                const layoutsTotal = venue.spaces?.reduce((acc, s) => acc + (s.layouts?.length || 1), 0) || venue.walkthroughClips.length;
                const venueThumbSrc = venue.heroImage || (venue.galleryImages && venue.galleryImages[0]) || '';

                return (
                  <div
                    key={venue.id}
                    className="bg-white rounded-2xl border border-[#DDD8CF] p-5 space-y-4 shadow-xs hover:border-[#26343D]/30 transition-all"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        {venueThumbSrc ? (
                          <img
                            src={venueThumbSrc}
                            alt={venue.name}
                            className="w-24 h-24 rounded-xl object-cover border border-[#DDD8CF] shrink-0"
                          />
                        ) : (
                          <div className="w-24 h-24 rounded-xl bg-[#EAE5DC] border border-[#DDD8CF] shrink-0 flex flex-col items-center justify-center p-2 text-center">
                            <div className="w-8 h-8 rounded-lg bg-[#DDD8CF] flex items-center justify-center text-[#A86445] mb-1 shadow-2xs">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                            <span className="text-[10px] font-bold text-[#26343D] leading-tight line-clamp-1 max-w-[90%]">
                              {venue.name || 'Venue'}
                            </span>
                            <span className="text-[9px] text-[#66737A] mt-0.5">No photo added</span>
                          </div>
                        )}
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-base font-bold text-[#26343D]">{venue.name}</h4>
                            <span
                              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                                isDraft
                                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              }`}
                            >
                              {isDraft ? 'Draft (Unpublished)' : 'Live on Marketplace'}
                            </span>
                            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${tier.bg} ${tier.color} ${tier.border}`}>
                              {tier.label} ({comp.score}%)
                            </span>
                          </div>

                          <p className="text-xs text-[#66737A] flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-[#A86445]" />
                            <span>{formatLocation(venue.location)}</span>
                          </p>

                          <div className="flex flex-wrap items-center gap-3 text-xs text-[#66737A] pt-1">
                            <span className="font-semibold text-[#26343D]">
                              {spacesCount} Spaces / Rooms
                            </span>
                            <span>•</span>
                            <span>{layoutsTotal} Configured Layouts</span>
                            <span>•</span>
                            <span>
                              {(() => {
                                const derivedMax =
                                  (venue.capacity?.cocktail && venue.capacity.cocktail > 0 ? venue.capacity.cocktail : 0) ||
                                  (venue.capacity?.seatedBanquet && venue.capacity.seatedBanquet > 0 ? venue.capacity.seatedBanquet : 0) ||
                                  (venue.spaces && venue.spaces.length > 0
                                    ? Math.max(...venue.spaces.map((s) => s.maxCapacity || s.standingCapacity || s.seatedCapacity || s.theatreCapacity || 0))
                                    : 0);
                                return derivedMax > 0 ? `Max ${derivedMax} Guests` : 'Capacity on Request';
                              })()}
                            </span>
                            <span>•</span>
                            <span className="font-bold text-[#A86445]">
                              {formatCurrency(venue.pricing.startingPrice, venue.pricing.currency)} {venue.pricing.priceUnit}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        {onToggleVenuePublishStatus && (
                          <button
                            type="button"
                            onClick={() => onToggleVenuePublishStatus(venue.id, isDraft ? 'draft' : 'published')}
                            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all ${
                              isDraft
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                : 'bg-white text-[#66737A] border-[#DDD8CF] hover:text-[#26343D]'
                            }`}
                          >
                            {isDraft ? 'Publish Venue' : 'Unpublish'}
                          </button>
                        )}

                        {onOpenOnboardingModal && (
                          <button
                            type="button"
                            onClick={() => onOpenOnboardingModal(venue, venue.organisationId)}
                            className="px-3.5 py-2 bg-white text-[#26343D] hover:bg-[#F4F1EA] border border-[#DDD8CF] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-[#A86445]" />
                            <span>Edit Spaces & Details</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => onInspectVenue(venue)}
                          className="px-3.5 py-2 bg-[#26343D] text-white hover:bg-[#1E2930] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Public Page</span>
                        </button>
                      </div>
                    </div>

                    {/* Spaces & Layouts Chips within the card */}
                    {venue.spaces && venue.spaces.length > 0 && (
                      <div className="pt-3 border-t border-[#DDD8CF]/60 bg-[#FDFCF7] p-3 rounded-xl space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-[#66737A] block">
                          Configured Rooms & Spaces:
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                          {venue.spaces.map((sp) => (
                            <div key={sp.id} className="bg-white p-2.5 rounded-lg border border-[#DDD8CF] space-y-1">
                              <div className="flex items-center justify-between text-xs font-bold text-[#26343D]">
                                <span className="truncate">{sp.name}</span>
                                <span className="text-[10px] text-[#A86445] bg-[#F3E7DF] px-1.5 py-0.5 rounded">
                                  {(() => {
                                    const cap = sp.maxCapacity || sp.standingCapacity || sp.seatedCapacity || sp.theatreCapacity || 0;
                                    return cap > 0 ? `Max ${cap}` : 'Flexible';
                                  })()}
                                </span>
                              </div>
                              <div className="text-[10px] text-[#66737A] truncate">
                                {sp.layouts?.length || 0} Layouts · {sp.floorLocation || 'Ground Floor'}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 1: BOOKINGS & COMMERCIAL PAYMENTS */}
        {activeTab === 'bookings' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F4F1EA] p-4 sm:p-5 rounded-2xl border border-[#DDD8CF]">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-[#26343D] flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#A86445]" />
                  <span>Bookings & Commercial Payments</span>
                </h3>
                <p className="text-xs text-[#66737A]">
                  Manage incoming reservation requests, accepted booking deposits, confirmed dates, final balances, and completed events.
                </p>
              </div>
            </div>

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
                  const isHighlighted = highlightedBookingId === booking.id;

                  return (
                    <div
                      key={booking.id}
                      id={`host-booking-card-${booking.id}`}
                      className={`bg-white border rounded-2xl p-5 space-y-4 transition-all shadow-xs ${
                        isHighlighted
                          ? 'border-[#A86445] ring-2 ring-[#A86445] bg-[#FDFCF7]'
                          : isRequested
                          ? 'border-[#A86445] ring-1 ring-[#A86445]/30'
                          : 'border-[#DDD8CF]'
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
                            {isHighlighted && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#A86445] text-white">
                                Selected Booking
                              </span>
                            )}
                          </div>
                          <h4 className="text-base font-bold text-[#26343D]">
                            {booking.clientName} {booking.clientCompany ? `(${booking.clientCompany})` : ''}
                          </h4>
                          <p className="text-xs text-[#66737A]">
                            Event Date: <strong className="text-[#26343D]">{formatDateDisplay(booking.eventDate, 'readable')}</strong> ({booking.startTime} – {booking.endTime}) • <strong className="text-[#26343D]">{booking.guestCount} Guests</strong> • Venue: {booking.venueName}
                          </p>
                        </div>

                        {/* Financial calculation breakdown for this specific booking */}
                        {(() => {
                          const bookingCurrency = booking.currency || 'GBP';
                          return (
                            <div className="bg-[#F4F1EA] p-3 rounded-xl border border-[#DDD8CF] text-xs text-right min-w-[220px]">
                              <div className="flex justify-between text-[#66737A]">
                                <span>Gross Booking:</span>
                                <span className="font-bold text-[#26343D]">{formatCurrency(booking.grossAmount, bookingCurrency)}</span>
                              </div>
                              <div className="flex justify-between text-[#A86445]">
                                <span>Commission ({commissionRate}%):</span>
                                <span>-{formatCurrency(commissionAmount, bookingCurrency)}</span>
                              </div>
                              <div className="flex justify-between font-bold text-emerald-800 pt-1 border-t border-[#DDD8CF]">
                                <span>Expected Net:</span>
                                <span>{formatCurrency(venueNetAmount, bookingCurrency)}</span>
                              </div>
                            </div>
                          );
                        })()}
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
                          {(() => {
                            const bCurr = booking.currency || 'GBP';
                            if (isCompleted) {
                              return (
                                <span className="text-stone-700 font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-stone-600" />
                                  Event successfully executed and completed.
                                </span>
                              );
                            }
                            if (isFullyPaid) {
                              return (
                                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Fully paid by client ({formatCurrency(0, bCurr)} balance remaining). Ready for event execution.
                                </span>
                              );
                            }
                            if (isFinalPaymentDue) {
                              return (
                                <span className="text-amber-800 font-medium">
                                  Final balance due ({formatCurrency(booking.finalBalance || 0, bCurr)} remaining). Awaiting client balance payment.
                                </span>
                              );
                            }
                            if (isConfirmed) {
                              return (
                                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Client paid {formatCurrency(booking.depositAmount, bCurr)} deposit ({booking.depositPercentage}%). Date secured.
                                </span>
                              );
                            }
                            if (isDepositDue) {
                              return (
                                <span className="text-amber-800 font-medium">
                                  Space approved by venue. Awaiting client deposit payment of {formatCurrency(booking.depositAmount, bCurr)} ({booking.depositPercentage}%).
                                </span>
                              );
                            }
                            if (isRequested) {
                              return (
                                <span className="text-[#A86445] font-medium">
                                  Action required: Verify space availability and accept or decline this request.
                                </span>
                              );
                            }
                            return null;
                          })()}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {actionError && actionError.id === booking.id && (
                            <span className="text-xs text-rose-700 bg-rose-50 border border-rose-200 px-2 py-1 rounded-lg">
                              {actionError.message}
                            </span>
                          )}

                          {isRequested && (
                            <>
                              <button
                                id={`accept-booking-btn-${booking.id}`}
                                disabled={processingBookingId === booking.id}
                                onClick={() => handleHostAction(booking.id, 'deposit_due')}
                                className={`px-4 py-2 text-white font-semibold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-all ${
                                  processingBookingId === booking.id
                                    ? 'bg-emerald-600 opacity-80 cursor-not-allowed'
                                    : 'bg-emerald-700 hover:bg-emerald-800 active:scale-95'
                                }`}
                              >
                                {processingBookingId === booking.id ? (
                                  <>
                                    <Clock className="w-3.5 h-3.5 animate-spin" />
                                    <span>Accepting...</span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Accept & Request Deposit</span>
                                  </>
                                )}
                              </button>
                              <button
                                id={`decline-booking-btn-${booking.id}`}
                                disabled={processingBookingId === booking.id}
                                onClick={() => handleHostAction(booking.id, 'declined')}
                                className={`px-3 py-2 bg-white border border-rose-200 text-rose-700 font-semibold text-xs rounded-xl transition-all ${
                                  processingBookingId === booking.id
                                    ? 'opacity-50 cursor-not-allowed'
                                    : 'hover:bg-rose-50 active:scale-95'
                                }`}
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
                              disabled={processingBookingId === booking.id}
                              onClick={() => handleHostAction(booking.id, 'final_payment_due')}
                              className="px-3.5 py-1.5 bg-white border border-[#DDD8CF] text-xs font-semibold text-[#26343D] hover:bg-[#F4F1EA] rounded-xl transition-all shadow-xs"
                            >
                              Advance to Final Payment Window
                            </button>
                          )}

                          {isFinalPaymentDue && (
                            <span
                              id={`awaiting-final-payment-status-${booking.id}`}
                              className="px-3 py-1.5 bg-orange-50 text-orange-800 border border-orange-200 text-xs font-semibold rounded-xl flex items-center gap-1.5"
                            >
                              <Clock className="w-3.5 h-3.5 text-orange-600" />
                              <span>Awaiting customer final payment</span>
                            </span>
                          )}

                          {isFullyPaid && (
                            <button
                              id={`complete-event-btn-${booking.id}`}
                              disabled={processingBookingId === booking.id}
                              onClick={() => handleHostAction(booking.id, 'completed')}
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
                        <strong>{formatDateDisplay(tour.scheduledDate, 'readable')} • {tour.scheduledTime}</strong>
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#DDD8CF] pb-4">
              <div>
                <h3 className="text-base font-bold text-[#26343D]">
                  {selectedVenue.name} — Space Directory & Walkthroughs
                </h3>
                <p className="text-xs text-[#66737A]">
                  Configured room setups, capacities, dimensions, floor plan blueprints, and high-definition video walkthrough assets.
                </p>
              </div>
              <div className="flex items-center gap-2">
                {onOpenOnboardingModal && (
                  <button
                    onClick={() => onOpenOnboardingModal(selectedVenue, selectedVenue.organisationId)}
                    className="px-3.5 py-2 bg-white text-[#26343D] hover:bg-[#F4F1EA] text-xs font-bold rounded-xl border border-[#DDD8CF] flex items-center gap-1.5 shadow-xs transition-all"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#A86445]" />
                    <span>Edit Spaces & Layouts</span>
                  </button>
                )}
                <button
                  onClick={() => onInspectVenue(selectedVenue)}
                  className="px-4 py-2 bg-[#26343D] text-white text-xs font-bold rounded-xl hover:bg-[#1E2930] flex items-center gap-1.5 shadow-xs transition-all"
                >
                  <Eye className="w-3.5 h-3.5 text-white" />
                  <span>View Public Page</span>
                </button>
              </div>
            </div>

            {/* If venue has spaces defined, list them */}
            {selectedVenue.spaces && selectedVenue.spaces.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#26343D]">
                  Configured Rooms & Functional Areas ({selectedVenue.spaces.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {selectedVenue.spaces.map((sp) => (
                    <div
                      key={sp.id}
                      className="bg-[#FDFCF7] border border-[#DDD8CF] rounded-xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#26343D]">{sp.name}</span>
                            <span className="text-[10px] bg-[#F3E7DF] text-[#A86445] font-bold px-2 py-0.5 rounded">
                              {sp.floorLocation || 'Main Floor'}
                            </span>
                          </div>
                          <p className="text-xs text-[#66737A] mt-0.5">{sp.description}</p>
                        </div>
                        <span className="text-xs font-bold text-[#26343D] bg-white border border-[#DDD8CF] px-2.5 py-1 rounded-lg shrink-0">
                          {(() => {
                            const cap = sp.maxCapacity || sp.standingCapacity || sp.seatedCapacity || sp.theatreCapacity || 0;
                            return cap > 0 ? `Max ${cap}` : 'Flexible';
                          })()}
                        </span>
                      </div>

                      {/* Layouts for this space */}
                      {sp.layouts && sp.layouts.length > 0 && (
                        <div className="pt-2 border-t border-[#DDD8CF]/60 space-y-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#66737A]">
                            Layout Formats:
                          </span>
                          <div className="grid grid-cols-2 gap-2">
                            {sp.layouts.map((ly) => (
                              <div key={ly.id} className="bg-white p-2 rounded-lg border border-[#DDD8CF] text-xs">
                                <div className="flex items-center justify-between text-[11px] font-semibold text-[#26343D]">
                                  <span className="truncate">{ly.title}</span>
                                  <span className="text-[#A86445] font-bold">{ly.capacity}</span>
                                </div>
                                <span className="text-[10px] text-[#66737A] uppercase">{ly.layoutType}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Video Walkthrough Clips */}
            <div className="space-y-3 pt-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#26343D]">
                Virtual Walkthrough Video Clips ({selectedVenue.walkthroughClips.length})
              </h4>
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
          </div>
        )}
      </div>
    </div>
  );
};


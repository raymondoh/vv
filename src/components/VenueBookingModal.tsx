import React, { useState } from 'react';
import {
  Calendar,
  Users,
  Building2,
  Clock,
  CheckCircle2,
  X,
  FileText,
  DollarSign,
  ArrowRight,
  Sparkles,
  Info,
  ShieldCheck,
} from 'lucide-react';
import { Venue, VenueBooking, LayoutCategory, MarketplaceConfig } from '../types';
import { DEFAULT_MARKETPLACE_CONFIG, calculateBookingFinancials } from '../config/marketplaceConfig';
import { formatCurrency } from '../utils/formatters';

interface VenueBookingModalProps {
  venue: Venue;
  isOpen: boolean;
  onClose: () => void;
  onBookingSubmitted: (booking: VenueBooking) => void;
  selectedLayoutCategory?: LayoutCategory;
  marketplaceConfig?: MarketplaceConfig;
  onViewInMyEvents?: () => void;
}

export const VenueBookingModal: React.FC<VenueBookingModalProps> = ({
  venue,
  isOpen,
  onClose,
  onBookingSubmitted,
  selectedLayoutCategory,
  marketplaceConfig = DEFAULT_MARKETPLACE_CONFIG,
  onViewInMyEvents,
}) => {
  const [step, setStep] = useState<'details' | 'contact' | 'review' | 'confirmed'>('details');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [eventType, setEventType] = useState<string>(venue.eventTypes?.[0] || 'meetings-conferences');
  const [eventDate, setEventDate] = useState<string>('2026-11-18');
  const [startTime, setStartTime] = useState<string>('09:00 AM');
  const [endTime, setEndTime] = useState<string>('05:30 PM');
  const [guestCount, setGuestCount] = useState<number>(
    Math.min(100, venue.capacity?.seatedBanquet || venue.capacity?.cocktail || 100)
  );
  const [selectedLayout, setSelectedLayout] = useState<string>(
    selectedLayoutCategory
      ? `${selectedLayoutCategory.charAt(0).toUpperCase() + selectedLayoutCategory.slice(1)} Setup`
      : venue.walkthroughClips?.[0]?.title || venue.spaces?.[0]?.name || 'Standard Setup'
  );
  const [specialRequirements, setSpecialRequirements] = useState<string>('');

  // Customer Contact Info
  const [clientName, setClientName] = useState<string>('Sarah Jenkins');
  const [clientEmail, setClientEmail] = useState<string>('s.jenkins@apexlead.io');
  const [clientPhone, setClientPhone] = useState<string>('+1 (312) 555-0144');
  const [clientCompany, setClientCompany] = useState<string>('Apex Leadership Group');

  const [createdBooking, setCreatedBooking] = useState<VenueBooking | null>(null);

  if (!isOpen) return null;

  // Calculation based on active MarketplaceConfig (Standard venue pricing - NO customer platform fees)
  const grossAmount = venue.pricing?.startingPrice || 0;
  const financials = calculateBookingFinancials(grossAmount, marketplaceConfig, eventDate);
  const depositPercentage = financials.depositPercentage;
  const depositAmount = financials.depositAmount;
  const remainingBalance = financials.finalBalance;
  const balanceDueDays = marketplaceConfig.balanceDueDaysBeforeEvent || 14;

  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/venue-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId: venue.id,
          clientName,
          clientEmail,
          clientPhone,
          clientCompany,
          eventType,
          guestCount,
          eventDate,
          startTime,
          endTime,
          selectedLayout,
          specialRequirements,
          grossAmount,
        }),
      });

      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success || !data?.booking) {
        throw new Error(data?.error || `Booking submission failed (${response.status})`);
      }

      setCreatedBooking(data.booking);
      onBookingSubmitted(data.booking);
      setStep('confirmed');
    } catch (err: any) {
      console.error('Booking submission error:', err);
      setError(err?.message || 'Failed to submit booking request. Please check your details and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white border border-[#DDD8CF] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#DDD8CF] flex items-center justify-between bg-[#F4F1EA]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-[#DDD8CF] flex items-center justify-center shadow-xs">
              <Building2 className="w-5 h-5 text-[#A86445]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#26343D] tracking-tight">
                {step === 'confirmed' ? 'Booking Request Submitted' : `Request to Book — ${venue.name}`}
              </h2>
              <p className="text-xs text-[#66737A]">
                {venue.location.city}{venue.location.state ? `, ${venue.location.state}` : ''}
                {venue.host?.name ? ` • Coordinator: ${venue.host.name}` : ''}
              </p>
            </div>
          </div>
          <button
            id="close-booking-modal-btn"
            onClick={onClose}
            className="p-2 text-[#66737A] hover:text-[#26343D] rounded-lg hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Step Indicator (for pre-confirmation) */}
        {step !== 'confirmed' && (
          <div className="px-6 py-3 bg-[#F4F1EA]/60 border-b border-[#DDD8CF] flex items-center justify-between text-xs font-medium text-[#66737A]">
            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 'details'
                    ? 'bg-[#26343D] text-white'
                    : 'bg-[#DDD8CF] text-[#26343D]'
                }`}
              >
                1
              </span>
              <span className={step === 'details' ? 'text-[#26343D] font-semibold' : ''}>Event Details</span>
            </div>
            <div className="h-[1px] w-8 bg-[#DDD8CF]" />
            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 'contact'
                    ? 'bg-[#26343D] text-white'
                    : 'bg-[#DDD8CF] text-[#26343D]'
                }`}
              >
                2
              </span>
              <span className={step === 'contact' ? 'text-[#26343D] font-semibold' : ''}>Contact Info</span>
            </div>
            <div className="h-[1px] w-8 bg-[#DDD8CF]" />
            <div className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  step === 'review'
                    ? 'bg-[#26343D] text-white'
                    : 'bg-[#DDD8CF] text-[#26343D]'
                }`}
              >
                3
              </span>
              <span className={step === 'review' ? 'text-[#26343D] font-semibold' : ''}>Review & Terms</span>
            </div>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
              {error}
            </div>
          )}

          {/* STEP 1: EVENT DETAILS */}
          {step === 'details' && (
            <div className="space-y-5">
              <div className="p-3.5 rounded-xl bg-[#F4F1EA] border border-[#DDD8CF] flex items-start gap-3">
                <Info className="w-4 h-4 text-[#A86445] shrink-0 mt-0.5" />
                <div className="text-xs text-[#66737A] leading-relaxed">
                  <strong className="text-[#26343D] block mb-0.5">Direct Venue Marketplace Booking</strong>
                  Submit your space requirements and date. The venue coordinator will verify calendar availability and hold the space for your deposit.
                </div>
              </div>

              {/* Event Type & Guests */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                    Event Type
                  </label>
                  <select
                    id="booking-event-type-select"
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    className="w-full bg-[#F4F1EA] text-[#26343D] text-xs px-3.5 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                  >
                    <option value="meetings-conferences">Business Meeting / Conference</option>
                    <option value="training-workshops">Training / Educational Workshop</option>
                    <option value="private-dining">Private Dining / Reception</option>
                    <option value="weddings">Wedding Ceremony & Reception</option>
                    <option value="parties-celebrations">Private Celebration / Social</option>
                    <option value="exhibitions-events">Exhibition / Showcase / Launch</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                      Expected Guest Count
                    </label>
                    <span className="text-xs font-bold text-[#26343D]">{guestCount} Guests</span>
                  </div>
                  <input
                    id="booking-guest-count-input"
                    type="number"
                    min="1"
                    max={venue.capacity?.cocktail || venue.capacity?.seatedBanquet || 500}
                    value={guestCount}
                    onChange={(e) => setGuestCount(Number(e.target.value))}
                    className="w-full bg-[#F4F1EA] text-[#26343D] text-xs px-3.5 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                  />
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5 sm:col-span-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                    Target Event Date
                  </label>
                  <input
                    id="booking-event-date-input"
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full bg-[#F4F1EA] text-[#26343D] text-xs px-3 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                    Start Time
                  </label>
                  <input
                    type="text"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    placeholder="09:00 AM"
                    className="w-full bg-[#F4F1EA] text-[#26343D] text-xs px-3 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                    End Time
                  </label>
                  <input
                    type="text"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    placeholder="05:30 PM"
                    className="w-full bg-[#F4F1EA] text-[#26343D] text-xs px-3 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                  />
                </div>
              </div>

              {/* Room Setup / Layout Preference */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                  Preferred Floor Plan / Layout Configuration
                </label>
                <select
                  value={selectedLayout}
                  onChange={(e) => setSelectedLayout(e.target.value)}
                  className="w-full bg-[#F4F1EA] text-[#26343D] text-xs px-3.5 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                >
                  {venue.walkthroughClips?.map((clip) => (
                    <option key={clip.id} value={clip.title}>
                      {clip.title} (Cap: {clip.maxCapacityForLayout} guests)
                    </option>
                  ))}
                  {venue.spaces?.map((space) => {
                    const cap = space.maxCapacity || space.standingCapacity || space.seatedCapacity || 0;
                    return (
                      <option key={space.id} value={space.name}>
                        {space.name} {cap > 0 ? `(Cap: ${cap} guests)` : ''}
                      </option>
                    );
                  })}
                  <option value="Main Hall - Standard Setup">Main Hall - Standard Setup</option>
                  <option value="Custom Modular Configuration">Custom Modular Configuration</option>
                </select>
              </div>

              {/* Special Requirements / Notes */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                  Special Logistics, Catering or AV Requirements (Optional)
                </label>
                <textarea
                  rows={2}
                  value={specialRequirements}
                  onChange={(e) => setSpecialRequirements(e.target.value)}
                  placeholder="e.g. Need dedicated 1Gbps livestream fiber, stage riser, or early 7:00 AM caterer load-in..."
                  className="w-full bg-[#F4F1EA] text-[#26343D] text-xs p-3 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D] placeholder:text-[#66737A]/70 resize-none"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  id="booking-next-to-contact-btn"
                  onClick={() => setStep('contact')}
                  className="px-5 py-2.5 bg-[#26343D] text-white font-semibold text-xs rounded-xl hover:bg-[#1E2930] transition-all flex items-center gap-1.5 active:scale-95 shadow-xs"
                >
                  <span>Continue to Contact Info</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: CONTACT INFO */}
          {step === 'contact' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                    Full Name *
                  </label>
                  <input
                    id="booking-client-name"
                    type="text"
                    required
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full bg-[#F4F1EA] text-[#26343D] text-xs px-3.5 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                    Email Address *
                  </label>
                  <input
                    id="booking-client-email"
                    type="email"
                    required
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    className="w-full bg-[#F4F1EA] text-[#26343D] text-xs px-3.5 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                    Phone Number
                  </label>
                  <input
                    id="booking-client-phone"
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    className="w-full bg-[#F4F1EA] text-[#26343D] text-xs px-3.5 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                    Organization / Company (Optional)
                  </label>
                  <input
                    type="text"
                    value={clientCompany}
                    onChange={(e) => setClientCompany(e.target.value)}
                    placeholder="e.g. Apex Leadership Group"
                    className="w-full bg-[#F4F1EA] text-[#26343D] text-xs px-3.5 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                  />
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep('details')}
                  className="px-4 py-2 text-xs font-medium text-[#66737A] hover:text-[#26343D] transition-colors"
                >
                  Back
                </button>
                <button
                  id="booking-next-to-review-btn"
                  onClick={() => setStep('review')}
                  disabled={!clientName || !clientEmail}
                  className="px-5 py-2.5 bg-[#26343D] text-white font-semibold text-xs rounded-xl hover:bg-[#1E2930] disabled:opacity-50 transition-all flex items-center gap-1.5 active:scale-95 shadow-xs"
                >
                  <span>Review Booking & Pricing</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: REVIEW & PRICING */}
          {step === 'review' && (
            <div className="space-y-5">
              {/* Event Summary Card */}
              <div className="bg-[#F4F1EA] border border-[#DDD8CF] rounded-xl p-4 space-y-2.5 text-xs">
                <div className="flex items-center justify-between border-b border-[#DDD8CF] pb-2">
                  <span className="font-semibold text-[#26343D]">Space & Date:</span>
                  <span className="text-[#26343D] font-bold">{venue.name} • {eventDate}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[#66737A]">
                  <div>
                    <span>Timing:</span> <strong className="text-[#26343D]">{startTime} – {endTime}</strong>
                  </div>
                  <div>
                    <span>Guests:</span> <strong className="text-[#26343D]">{guestCount} attendees</strong>
                  </div>
                  <div>
                    <span>Layout:</span> <strong className="text-[#26343D]">{selectedLayout}</strong>
                  </div>
                  <div>
                    <span>Client:</span> <strong className="text-[#26343D]">{clientName}</strong>
                  </div>
                </div>
              </div>

              {/* Customer Pricing & Deposit Terms (No platform fees shown to customer) */}
              <div className="bg-white border border-[#DDD8CF] rounded-xl p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#26343D]">
                  Venue Booking Rate & Schedule
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[#66737A]">
                    <span>Venue Daily Hire Rate:</span>
                    <span className="font-medium text-[#26343D]">{formatCurrency(grossAmount, venue.pricing.currency || 'GBP')}</span>
                  </div>
                  <div className="flex items-center justify-between text-[#26343D] font-medium pt-1 border-t border-[#DDD8CF]">
                    <span>Total Venue Price:</span>
                    <span className="text-sm font-bold text-[#26343D]">{formatCurrency(grossAmount, venue.pricing.currency || 'GBP')}</span>
                  </div>
                </div>

                <div className="p-3 bg-[#F3E7DF] border border-[#A86445]/20 rounded-xl space-y-1.5 text-xs">
                  <div className="flex items-center justify-between font-semibold text-[#26343D]">
                    <span>Initial Deposit Required ({depositPercentage}%):</span>
                    <span className="text-sm font-bold text-[#A86445]">{formatCurrency(depositAmount, venue.pricing.currency || 'GBP')}</span>
                  </div>
                  <div className="flex items-center justify-between text-[#66737A] text-[11px]">
                    <span>Remaining Balance:</span>
                    <span>{formatCurrency(remainingBalance, venue.pricing.currency || 'GBP')} (Due {balanceDueDays} days prior to event)</span>
                  </div>
                  <p className="text-[10px] text-[#66737A] pt-1">
                    *Deposit is only requested once {venue.host?.name ? venue.host.name : 'the venue team'} reviews and confirms your date.
                  </p>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep('contact')}
                  className="px-4 py-2 text-xs font-medium text-[#66737A] hover:text-[#26343D] transition-colors"
                >
                  Back
                </button>
                <button
                  id="submit-booking-request-btn"
                  onClick={handleSubmitBooking}
                  disabled={loading}
                  className="px-6 py-3 bg-[#A86445] text-white font-semibold text-xs sm:text-sm rounded-xl hover:bg-[#8F5439] disabled:opacity-50 transition-all flex items-center gap-2 active:scale-95 shadow-sm"
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span>{loading ? 'Submitting Request...' : 'Submit Booking Request'}</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: CONFIRMED / SUBMITTED SUMMARY */}
          {step === 'confirmed' && createdBooking && (
            <div className="space-y-6 text-center py-4 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-1.5">
                <h3 className="text-xl font-bold text-[#26343D] tracking-tight">
                  Booking Request Submitted!
                </h3>
                <p className="text-xs text-[#66737A] max-w-md mx-auto leading-relaxed">
                  Your reservation request <strong className="text-[#26343D] font-mono">{createdBooking.bookingNumber}</strong> has been transmitted to {createdBooking.hostName ? <>venue coordinator <strong>{createdBooking.hostName}</strong></> : 'the venue management team'}.
                </p>
              </div>

              {/* Next Steps Journey */}
              <div className="bg-[#F4F1EA] border border-[#DDD8CF] rounded-xl p-4 text-left space-y-3 text-xs">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#26343D] block">
                  What Happens Next:
                </span>
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5 text-[#66737A]">
                    <div className="w-5 h-5 rounded-full bg-white border border-[#DDD8CF] flex items-center justify-center text-[10px] font-bold text-[#26343D] shrink-0 mt-0.5">
                      1
                    </div>
                    <div>
                      <strong className="text-[#26343D] block">Venue Reviews Calendar</strong>
                      <span>{createdBooking.hostName || 'Venue team'} verifies floor plan setup and date hold ({createdBooking.eventDate}).</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 text-[#66737A]">
                    <div className="w-5 h-5 rounded-full bg-white border border-[#DDD8CF] flex items-center justify-center text-[10px] font-bold text-[#26343D] shrink-0 mt-0.5">
                      2
                    </div>
                    <div>
                      <strong className="text-[#26343D] block">Deposit Payment (${createdBooking.depositAmount.toLocaleString()})</strong>
                      <span>Once approved, you will be invited to pay the {createdBooking.depositPercentage}% deposit to lock the reservation.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 text-[#66737A]">
                    <div className="w-5 h-5 rounded-full bg-white border border-[#DDD8CF] flex items-center justify-center text-[10px] font-bold text-[#26343D] shrink-0 mt-0.5">
                      3
                    </div>
                    <div>
                      <strong className="text-[#26343D] block">Customer Event Planner</strong>
                      <span>Manage catering checklists, vendor riders, and layout blueprints in your event dashboard.</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
                {onViewInMyEvents && (
                  <button
                    id="view-booking-in-my-events-btn"
                    onClick={() => {
                      onClose();
                      onViewInMyEvents();
                    }}
                    className="w-full sm:w-auto px-6 py-2.5 bg-[#A86445] text-white font-semibold text-xs rounded-xl hover:bg-[#8F5439] shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>View in My Events</span>
                  </button>
                )}
                <button
                  id="close-booking-success-btn"
                  onClick={onClose}
                  className="w-full sm:w-auto px-6 py-2.5 bg-[#26343D] text-white font-semibold text-xs rounded-xl hover:bg-[#1E2930] shadow-xs transition-all"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import {
  X,
  Calendar,
  Clock,
  Video,
  User,
  Mail,
  Phone,
  Sparkles,
  CheckCircle2,
  Copy,
  ExternalLink,
  ChevronRight,
  Shield,
  Radio,
} from 'lucide-react';
import { Venue, WalkthroughBooking } from '../types';

interface BookWalkthroughModalProps {
  venue: Venue;
  isOpen: boolean;
  onClose: () => void;
  onBookingConfirmed: (booking: WalkthroughBooking) => void;
  onOpenLiveSimulator: (booking: WalkthroughBooking) => void;
}

export const BookWalkthroughModal: React.FC<BookWalkthroughModalProps> = ({
  venue,
  isOpen,
  onClose,
  onBookingConfirmed,
  onOpenLiveSimulator,
}) => {
  const [step, setStep] = useState<'schedule' | 'confirmed'>('schedule');
  const [selectedDate, setSelectedDate] = useState<string>(
    venue.availableSlots[0]?.date || '2026-09-01'
  );
  const [selectedTime, setSelectedTime] = useState<string>(
    venue.availableSlots[0]?.times[0]?.time || '10:00 AM'
  );
  const [walkthroughType, setWalkthroughType] = useState<'private-director' | 'group-preview' | 'technical-av'>('private-director');
  
  // Form fields
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [eventType, setEventType] = useState('wedding');
  const [estimatedGuests, setEstimatedGuests] = useState(150);
  const [targetEventDate, setTargetEventDate] = useState('2027-06-20');
  const [specialRequests, setSpecialRequests] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<WalkthroughBooking | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  if (!isOpen) return null;

  const currentSlot = venue.availableSlots.find((s) => s.date === selectedDate) || venue.availableSlots[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientName || !clientEmail) {
      setError('Please provide your name and email address.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/walkthroughs/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venueId: venue.id,
          clientName,
          clientEmail,
          clientPhone,
          eventType,
          estimatedGuests,
          targetEventDate,
          scheduledDate: selectedDate,
          scheduledTime: selectedTime,
          walkthroughType,
          specialRequests,
        }),
      });

      const data = await response.json();
      if (data.success && data.booking) {
        setConfirmedBooking(data.booking);
        onBookingConfirmed(data.booking);
        setStep('confirmed');

        // Trigger celebratory confetti
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#A86445', '#8F5439', '#DDD8CF', '#F3E7DF', '#26343D'],
        });
      } else {
        throw new Error(data.error || 'Booking failed');
      }
    } catch (err: any) {
      console.error('Booking failed:', err);
      setError(err.message || 'Unable to schedule live walkthrough. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyMeetingLink = () => {
    if (confirmedBooking) {
      navigator.clipboard.writeText(confirmedBooking.meetingUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white border border-[#DDD8CF] rounded-2xl shadow-xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-[#DDD8CF] flex items-center justify-between bg-[#F4F1EA]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-[#DDD8CF] flex items-center justify-center shadow-xs">
              <Video className="w-5 h-5 text-[#A86445]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#26343D]">
                {step === 'schedule' ? 'Schedule Live Walkthrough' : 'Walkthrough Confirmed'}
              </h2>
              <p className="text-xs text-[#66737A]">
                {venue.name} • Coordinator: {venue.host.name}
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

        {/* STEP 1: SCHEDULING FORM */}
        {step === 'schedule' && (
          <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {error}
              </div>
            )}

            {/* Walkthrough Format Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                1. Select Walkthrough Focus
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setWalkthroughType('private-director')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    walkthroughType === 'private-director'
                      ? 'bg-[#F3E7DF] border-[#A86445] ring-1 ring-[#A86445]'
                      : 'bg-[#F4F1EA] border-[#DDD8CF] hover:border-[#26343D]'
                  }`}
                >
                  <span className="text-xs font-bold text-[#26343D] block">1-on-1 Live Tour</span>
                  <p className="text-[11px] text-[#66737A] mt-1">Direct live video walkthrough with venue coordinator {venue.host.name}</p>
                </button>

                <button
                  type="button"
                  onClick={() => setWalkthroughType('technical-av')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    walkthroughType === 'technical-av'
                      ? 'bg-[#F3E7DF] border-[#A86445] ring-1 ring-[#A86445]'
                      : 'bg-[#F4F1EA] border-[#DDD8CF] hover:border-[#26343D]'
                  }`}
                >
                  <span className="text-xs font-bold text-[#26343D] block">Technical & AV Check</span>
                  <p className="text-[11px] text-[#66737A] mt-1">Lighting, sound, screens, power drops & stage inspection</p>
                </button>

                <button
                  type="button"
                  onClick={() => setWalkthroughType('group-preview')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    walkthroughType === 'group-preview'
                      ? 'bg-[#F3E7DF] border-[#A86445] ring-1 ring-[#A86445]'
                      : 'bg-[#F4F1EA] border-[#DDD8CF] hover:border-[#26343D]'
                  }`}
                >
                  <span className="text-xs font-bold text-[#26343D] block">Virtual Open House</span>
                  <p className="text-[11px] text-[#66737A] mt-1">Scheduled group walkthrough and space overview</p>
                </button>
              </div>
            </div>

            {/* Date & Time Slot Selection */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                2. Select Date & Time Slot
              </label>

              {/* Date Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {venue.availableSlots.map((slot) => {
                  const isSelected = slot.date === selectedDate;
                  const dateObj = new Date(slot.date + 'T00:00:00');
                  const weekday = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
                  const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                  return (
                    <button
                      key={slot.date}
                      type="button"
                      onClick={() => {
                        setSelectedDate(slot.date);
                        if (slot.times.length > 0) setSelectedTime(slot.times[0].time);
                      }}
                      className={`px-4 py-2.5 rounded-xl border text-center shrink-0 transition-all ${
                        isSelected
                          ? 'bg-[#A86445] text-white font-semibold shadow-xs'
                          : 'bg-[#F4F1EA] text-[#66737A] border-[#DDD8CF] hover:border-[#A86445]/60'
                      }`}
                    >
                      <span className="text-[10px] uppercase block">{weekday}</span>
                      <span className="text-xs">{monthDay}</span>
                    </button>
                  );
                })}
              </div>

              {/* Available Time Slots */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                {currentSlot?.times.map((timeItem) => {
                  const isSelected = timeItem.time === selectedTime;
                  return (
                    <button
                      key={timeItem.time}
                      type="button"
                      disabled={!timeItem.available}
                      onClick={() => setSelectedTime(timeItem.time)}
                      className={`p-2.5 rounded-xl border text-xs text-center transition-all ${
                        !timeItem.available
                          ? 'bg-stone-200/50 text-stone-400 border-[#DDD8CF] cursor-not-allowed line-through'
                          : isSelected
                          ? 'bg-[#F3E7DF] border-[#A86445] text-[#A86445] font-bold shadow-xs'
                          : 'bg-[#F4F1EA] text-[#66737A] border-[#DDD8CF] hover:border-[#A86445]/60'
                      }`}
                    >
                      <span>{timeItem.time}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Event & Contact Details Form */}
            <div className="space-y-3 pt-2 border-t border-[#DDD8CF]">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                3. Your Event & Contact Details
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-[#66737A] mb-1">Your Full Name *</label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-[#66737A] absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Eleanor Vance"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full bg-[#F4F1EA] text-[#26343D] text-xs pl-9 pr-3 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#A86445]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-[#66737A] mb-1">Email Address *</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-[#66737A] absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      placeholder="eleanor@example.com"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      className="w-full bg-[#F4F1EA] text-[#26343D] text-xs pl-9 pr-3 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#A86445]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-[#66737A] mb-1">Phone (SMS reminders)</label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-[#66737A] absolute left-3 top-3" />
                    <input
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      className="w-full bg-[#F4F1EA] text-[#26343D] text-xs pl-9 pr-3 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#A86445]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-[#66737A] mb-1">Event Type</label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    className="w-full bg-[#F4F1EA] text-[#26343D] text-xs px-3 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                  >
                    <option value="meeting">Business Meeting / Presentation</option>
                    <option value="conference">Conference / Training Workshop</option>
                    <option value="dining">Private Dining / Reception</option>
                    <option value="wedding">Wedding Ceremony & Reception</option>
                    <option value="party">Party / Social Celebration</option>
                    <option value="exhibition">Exhibition / Showcase / Event</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-[#66737A] mb-1">Estimated Guest Count</label>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    value={estimatedGuests}
                    onChange={(e) => setEstimatedGuests(Number(e.target.value))}
                    className="w-full bg-[#F4F1EA] text-[#26343D] text-xs px-3 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#A86445]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-[#66737A] mb-1">Target Event Date</label>
                  <input
                    type="date"
                    value={targetEventDate}
                    onChange={(e) => setTargetEventDate(e.target.value)}
                    className="w-full bg-[#F4F1EA] text-[#26343D] text-xs px-3 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#A86445]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-[#66737A] mb-1">Specific Areas / Layout Questions to Focus On</label>
                <textarea
                  rows={2}
                  placeholder="e.g. 'I want to see the breakout spaces and the presentation AV setups'..."
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  className="w-full bg-[#F4F1EA] text-[#26343D] text-xs p-3 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#A86445] placeholder:text-[#66737A]/70 resize-none"
                />
              </div>
            </div>

            {/* Submission Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 rounded-xl bg-[#A86445] text-white font-semibold text-sm shadow-sm hover:bg-[#8F5439] active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Scheduling Walkthrough...</span>
                ) : (
                  <>
                    <Calendar className="w-4 h-4" />
                    <span>Confirm Live Walkthrough with {venue.host.name}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: CONFIRMATION STATE */}
        {step === 'confirmed' && confirmedBooking && (
          <div className="p-6 space-y-6 animate-in fade-in duration-300">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h3 className="text-xl font-bold text-[#26343D]">
                Live Walkthrough Confirmed!
              </h3>
              <p className="text-xs text-[#66737A] max-w-md mx-auto">
                A calendar invitation and video link have been sent to <strong className="text-[#26343D]">{confirmedBooking.clientEmail}</strong>.
              </p>
            </div>

            {/* Booking Summary Card */}
            <div className="bg-[#F4F1EA] border border-[#DDD8CF] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#DDD8CF] pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#A86445]">Scheduled Date & Time</span>
                  <p className="text-sm font-bold text-[#26343D]">{confirmedBooking.scheduledDate} at {confirmedBooking.scheduledTime}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#66737A]">Meeting Room Code</span>
                  <p className="text-xs font-mono font-bold text-[#A86445]">{confirmedBooking.meetingCode}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-[#66737A]">
                <div>
                  <span className="text-[10px] text-[#66737A] block">Host & Tour Guide</span>
                  <span className="font-semibold text-[#26343D]">{venue.host.name} ({venue.host.title})</span>
                </div>
                <div>
                  <span className="text-[10px] text-[#66737A] block">Target Event Date</span>
                  <span className="font-semibold text-[#26343D]">{confirmedBooking.targetEventDate || 'TBD'}</span>
                </div>
              </div>

              {/* Meeting Link Box */}
              <div className="p-3 bg-white rounded-xl border border-[#DDD8CF] flex items-center justify-between gap-2 shadow-xs">
                <div className="truncate text-xs font-mono text-[#26343D]">
                  {confirmedBooking.meetingUrl}
                </div>
                <button
                  type="button"
                  onClick={copyMeetingLink}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#F3E7DF] border border-[#A86445]/30 text-xs font-semibold text-[#A86445] hover:bg-[#F3E7DF]/70 transition-colors shrink-0"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2.5">
              <button
                type="button"
                id="launch-live-simulator-btn"
                onClick={() => {
                  onClose();
                  onOpenLiveSimulator(confirmedBooking);
                }}
                className="w-full py-3 px-4 rounded-xl bg-[#A86445] text-white font-semibold text-xs sm:text-sm hover:bg-[#8F5439] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xs"
              >
                <Video className="w-4 h-4" />
                <span>Join Live Video Room Simulator</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-xl bg-white border border-[#DDD8CF] text-[#66737A] hover:text-[#26343D] hover:bg-[#F4F1EA] text-xs font-semibold transition-colors"
              >
                Done / Return to Directory
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

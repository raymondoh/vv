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
          colors: ['#d4af37', '#f3d98b', '#ffffff', '#e5c064'],
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#11141b] border border-[#2b313d] rounded-2xl shadow-2xl overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Top Header */}
        <div className="px-6 py-4 border-b border-[#232731] flex items-center justify-between bg-gradient-to-r from-[#171b24] to-[#12151d]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#d4af37] to-[#8c6b1b] p-[1px] flex items-center justify-center shadow-lg shadow-[#d4af37]/20">
              <div className="w-full h-full bg-[#11141a] rounded-xl flex items-center justify-center">
                <Video className="w-5 h-5 text-[#f3d98b]" />
              </div>
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white font-serif-luxury">
                {step === 'schedule' ? 'Schedule Live Walkthrough' : 'Walkthrough Confirmed!'}
              </h2>
              <p className="text-xs text-gray-400">
                {venue.name} • Host: {venue.host.name}
              </p>
            </div>
          </div>
          <button
            id="close-booking-modal-btn"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-[#1f2430] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: SCHEDULING FORM */}
        {step === 'schedule' && (
          <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-200 text-xs">
                {error}
              </div>
            )}

            {/* Walkthrough Format Selection */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300">
                1. Select Walkthrough Style
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <button
                  type="button"
                  onClick={() => setWalkthroughType('private-director')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    walkthroughType === 'private-director'
                      ? 'bg-[#241e12] border-[#d4af37] ring-1 ring-[#d4af37]'
                      : 'bg-[#161a22] border-[#293142] hover:border-gray-500'
                  }`}
                >
                  <span className="text-xs font-bold text-white block">1-on-1 Director Tour</span>
                  <p className="text-[11px] text-gray-400 mt-1">Dedicated private video call with host {venue.host.name}</p>
                </button>

                <button
                  type="button"
                  onClick={() => setWalkthroughType('technical-av')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    walkthroughType === 'technical-av'
                      ? 'bg-[#241e12] border-[#d4af37] ring-1 ring-[#d4af37]'
                      : 'bg-[#161a22] border-[#293142] hover:border-gray-500'
                  }`}
                >
                  <span className="text-xs font-bold text-white block">AV & Tech Walkthrough</span>
                  <p className="text-[11px] text-gray-400 mt-1">Lighting, soundboard, and rigging inspection</p>
                </button>

                <button
                  type="button"
                  onClick={() => setWalkthroughType('group-preview')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    walkthroughType === 'group-preview'
                      ? 'bg-[#241e12] border-[#d4af37] ring-1 ring-[#d4af37]'
                      : 'bg-[#161a22] border-[#293142] hover:border-gray-500'
                  }`}
                >
                  <span className="text-xs font-bold text-white block">VIP Open House</span>
                  <p className="text-[11px] text-gray-400 mt-1">Join multi-client curated evening overview</p>
                </button>
              </div>
            </div>

            {/* Date & Time Slot Selection */}
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300">
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
                          ? 'bg-[#d4af37] text-black font-bold shadow-md'
                          : 'bg-[#161a22] text-gray-300 border-[#293142] hover:border-gray-500'
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
                          ? 'bg-[#12141a] text-gray-600 border-[#1f2430] cursor-not-allowed line-through'
                          : isSelected
                          ? 'bg-gradient-to-r from-[#241f11] to-[#1c180e] border-[#d4af37] text-[#fae29c] font-bold shadow'
                          : 'bg-[#161a22] text-gray-300 border-[#293142] hover:border-gray-500'
                      }`}
                    >
                      <span>{timeItem.time}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Event & Contact Details Form */}
            <div className="space-y-3 pt-2 border-t border-[#232836]">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-300">
                3. Your Event & Contact Details
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Your Full Name *</label>
                  <div className="relative">
                    <User className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. Eleanor Vance"
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      className="w-full bg-[#161a22] text-white text-xs pl-9 pr-3 py-2.5 rounded-xl border border-[#2b3342] focus:outline-none focus:border-[#d4af37]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Email Address *</label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      placeholder="eleanor@example.com"
                      value={clientEmail}
                      onChange={(e) => setClientEmail(e.target.value)}
                      className="w-full bg-[#161a22] text-white text-xs pl-9 pr-3 py-2.5 rounded-xl border border-[#2b3342] focus:outline-none focus:border-[#d4af37]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Phone (SMS reminders)</label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
                    <input
                      type="tel"
                      placeholder="+1 (555) 000-0000"
                      value={clientPhone}
                      onChange={(e) => setClientPhone(e.target.value)}
                      className="w-full bg-[#161a22] text-white text-xs pl-9 pr-3 py-2.5 rounded-xl border border-[#2b3342] focus:outline-none focus:border-[#d4af37]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Event Type</label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                    className="w-full bg-[#161a22] text-white text-xs px-3 py-2.5 rounded-xl border border-[#2b3342] focus:outline-none focus:border-[#d4af37]"
                  >
                    <option value="wedding">Wedding Ceremony & Reception</option>
                    <option value="corporate">Corporate Summit / Keynote</option>
                    <option value="gala">Charity Gala / Black Tie</option>
                    <option value="party">Milestone Celebration / Birthday</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Estimated Guest Count</label>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    value={estimatedGuests}
                    onChange={(e) => setEstimatedGuests(Number(e.target.value))}
                    className="w-full bg-[#161a22] text-white text-xs px-3 py-2.5 rounded-xl border border-[#2b3342] focus:outline-none focus:border-[#d4af37]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-gray-400 mb-1">Target Event Date</label>
                  <input
                    type="date"
                    value={targetEventDate}
                    onChange={(e) => setTargetEventDate(e.target.value)}
                    className="w-full bg-[#161a22] text-white text-xs px-3 py-2.5 rounded-xl border border-[#2b3342] focus:outline-none focus:border-[#d4af37]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-gray-400 mb-1">Specific Areas / Layout Questions to Focus On</label>
                <textarea
                  rows={2}
                  placeholder="e.g. 'I want to see the bridal dressing suite mirrors and the outdoor cocktail heating lamps'..."
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  className="w-full bg-[#161a22] text-white text-xs p-3 rounded-xl border border-[#2b3342] focus:outline-none focus:border-[#d4af37] placeholder:text-gray-500 resize-none"
                />
              </div>
            </div>

            {/* Submission Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#e5c064] to-[#b38622] text-black font-bold text-sm shadow-xl shadow-[#d4af37]/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
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
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center shadow-lg shadow-emerald-500/10">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <h3 className="text-xl font-bold text-white font-serif-luxury">
                Live Walkthrough Confirmed!
              </h3>
              <p className="text-xs text-gray-300 max-w-md mx-auto">
                A calendar invitation and video link have been sent to <strong className="text-white">{confirmedBooking.clientEmail}</strong>.
              </p>
            </div>

            {/* Booking Summary Card */}
            <div className="bg-[#161a22] border border-[#2b3342] rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[#242a38] pb-3">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Scheduled Date & Time</span>
                  <p className="text-sm font-bold text-white">{confirmedBooking.scheduledDate} at {confirmedBooking.scheduledTime}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Meeting Room Code</span>
                  <p className="text-xs font-mono font-bold text-[#fae29c]">{confirmedBooking.meetingCode}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs text-gray-300">
                <div>
                  <span className="text-[10px] text-gray-500 block">Host & Tour Guide</span>
                  <span className="font-semibold text-white">{venue.host.name} ({venue.host.title})</span>
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">Target Event Date</span>
                  <span className="font-semibold text-white">{confirmedBooking.targetEventDate || 'TBD'}</span>
                </div>
              </div>

              {/* Meeting Link Box */}
              <div className="p-3 bg-[#11141b] rounded-xl border border-[#242b3a] flex items-center justify-between gap-2">
                <div className="truncate text-xs font-mono text-gray-300">
                  {confirmedBooking.meetingUrl}
                </div>
                <button
                  type="button"
                  onClick={copyMeetingLink}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#212735] text-xs font-semibold text-gray-200 hover:text-white transition-colors shrink-0"
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
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#d4af37] to-[#b38622] text-black font-bold text-xs sm:text-sm hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#d4af37]/20"
              >
                <Video className="w-4 h-4" />
                <span>Join Live Video Room Simulator</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 px-4 rounded-xl bg-[#161a22] border border-[#293142] text-gray-300 hover:text-white text-xs font-semibold transition-colors"
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

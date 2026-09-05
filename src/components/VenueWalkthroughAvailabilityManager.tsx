import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Video,
  Info,
} from 'lucide-react';
import { Venue, AvailableDaySlot, WalkthroughBooking } from '../types';
import { formatDateDisplay } from '../utils/formatters';
import {
  getVenueTodayDateString,
  isSlotInFuture,
  determineTimePeriod,
  parseTimeStringTo24H,
  getHostFutureSlots,
} from '../utils/walkthroughAvailabilityHelpers';

interface VenueWalkthroughAvailabilityManagerProps {
  venues: Venue[];
  selectedVenueId?: string;
  onSelectVenue?: (venueId: string) => void;
  walkthroughBookings: WalkthroughBooking[];
  onUpdateAvailability: (venueId: string, updatedSlots: AvailableDaySlot[]) => Promise<void> | void;
}

export const VenueWalkthroughAvailabilityManager: React.FC<VenueWalkthroughAvailabilityManagerProps> = ({
  venues,
  selectedVenueId: controlledVenueId,
  onSelectVenue,
  walkthroughBookings,
  onUpdateAvailability,
}) => {
  const [internalVenueId, setInternalVenueId] = useState<string>(
    controlledVenueId || venues[0]?.id || ''
  );

  const activeVenueId = controlledVenueId || internalVenueId;
  const currentVenue = venues.find((v) => v.id === activeVenueId) || venues[0];

  const venueTz = currentVenue?.location?.timezone || 'Europe/London';
  const todayStr = getVenueTodayDateString(venueTz);

  const [newDate, setNewDate] = useState<string>(todayStr);
  const [newTime, setNewTime] = useState<string>('14:00');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleVenueChange = (venueId: string) => {
    setInternalVenueId(venueId);
    if (onSelectVenue) onSelectVenue(venueId);
    setFeedback(null);
  };

  const futureSlots = getHostFutureSlots(currentVenue);

  const formatTimeToDisplay = (rawTime: string): string => {
    const parsed = parseTimeStringTo24H(rawTime);
    if (!parsed) return rawTime;
    const hh = String(parsed.hour).padStart(2, '0');
    const mm = String(parsed.minute).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const handleAddSlot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentVenue) return;

    if (!newDate) {
      setFeedback({ type: 'error', message: 'Please select a date.' });
      return;
    }

    if (!newTime) {
      setFeedback({ type: 'error', message: 'Please select or enter a time.' });
      return;
    }

    const formattedTime = formatTimeToDisplay(newTime);

    // Validate that slot is in the future
    if (!isSlotInFuture(newDate, formattedTime, venueTz)) {
      setFeedback({
        type: 'error',
        message: 'The selected date and time must be in the future (venue local time).',
      });
      return;
    }

    // Ensure slot does not overwrite an existing confirmed walkthrough booking
    const hasExistingBooking = walkthroughBookings.some(
      (b) =>
        b.venueId === currentVenue.id &&
        b.scheduledDate === newDate &&
        b.status !== 'cancelled' &&
        (b.scheduledTime.trim().toLowerCase() === formattedTime.toLowerCase() ||
          formatTimeToDisplay(b.scheduledTime) === formattedTime)
    );

    if (hasExistingBooking) {
      setFeedback({
        type: 'error',
        message: `${formattedTime} on ${formatDateDisplay(newDate, 'readable')} has a confirmed walkthrough booking and cannot be overwritten.`,
      });
      return;
    }

    const currentSlots: AvailableDaySlot[] = currentVenue.availableSlots ? [...currentVenue.availableSlots] : [];
    const dayIndex = currentSlots.findIndex((s) => s.date === newDate);

    if (dayIndex >= 0) {
      const existingTimes = currentSlots[dayIndex].times || [];
      const timeExists = existingTimes.some(
        (t) =>
          t.time.trim().toLowerCase() === formattedTime.toLowerCase() ||
          formatTimeToDisplay(t.time) === formattedTime
      );

      if (timeExists) {
        setFeedback({
          type: 'error',
          message: `${formattedTime} is already configured for ${formatDateDisplay(newDate, 'readable')}.`,
        });
        return;
      }

      const updatedTimes = [
        ...existingTimes,
        {
          time: formattedTime,
          period: determineTimePeriod(formattedTime),
          available: true,
        },
      ].sort((a, b) => {
        const pa = parseTimeStringTo24H(a.time);
        const pb = parseTimeStringTo24H(b.time);
        if (!pa || !pb) return a.time.localeCompare(b.time);
        return pa.hour * 60 + pa.minute - (pb.hour * 60 + pb.minute);
      });

      currentSlots[dayIndex] = {
        ...currentSlots[dayIndex],
        times: updatedTimes,
      };
    } else {
      currentSlots.push({
        date: newDate,
        times: [
          {
            time: formattedTime,
            period: determineTimePeriod(formattedTime),
            available: true,
          },
        ],
      });
    }

    // Sort days chronologically
    currentSlots.sort((a, b) => a.date.localeCompare(b.date));

    // Preserve all confirmed/consumed slot states so booked slots are never reopened
    const preservedSlots = currentSlots.map((day) => ({
      ...day,
      times: (day.times || []).map((t) => {
        const isBooked =
          t.available === false ||
          walkthroughBookings.some(
            (b) =>
              b.venueId === currentVenue.id &&
              b.scheduledDate === day.date &&
              b.status !== 'cancelled' &&
              (b.scheduledTime.trim().toLowerCase() === t.time.trim().toLowerCase() ||
                formatTimeToDisplay(b.scheduledTime) === formatTimeToDisplay(t.time))
          );
        return isBooked ? { ...t, available: false } : t;
      }),
    }));

    try {
      setIsSubmitting(true);
      await onUpdateAvailability(currentVenue.id, preservedSlots);
      setFeedback({
        type: 'success',
        message: `Added ${formattedTime} on ${formatDateDisplay(newDate, 'readable')}.`,
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to update availability. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveSlot = async (dateStr: string, timeStr: string) => {
    if (!currentVenue) return;

    const currentSlots: AvailableDaySlot[] = currentVenue.availableSlots ? [...currentVenue.availableSlots] : [];
    const dayIndex = currentSlots.findIndex((s) => s.date === dateStr);

    if (dayIndex < 0) return;

    const targetDay = currentSlots[dayIndex];
    const updatedTimes = (targetDay.times || []).filter(
      (t) =>
        t.time.trim().toLowerCase() !== timeStr.trim().toLowerCase() &&
        formatTimeToDisplay(t.time) !== formatTimeToDisplay(timeStr)
    );

    if (updatedTimes.length === 0) {
      // Remove empty date automatically
      currentSlots.splice(dayIndex, 1);
    } else {
      currentSlots[dayIndex] = {
        ...targetDay,
        times: updatedTimes,
      };
    }

    // Preserve all confirmed/consumed slot states so booked slots are never reopened
    const preservedSlots = currentSlots.map((day) => ({
      ...day,
      times: (day.times || []).map((t) => {
        const isBooked =
          t.available === false ||
          walkthroughBookings.some(
            (b) =>
              b.venueId === currentVenue.id &&
              b.scheduledDate === day.date &&
              b.status !== 'cancelled' &&
              (b.scheduledTime.trim().toLowerCase() === t.time.trim().toLowerCase() ||
                formatTimeToDisplay(b.scheduledTime) === formatTimeToDisplay(t.time))
          );
        return isBooked ? { ...t, available: false } : t;
      }),
    }));

    try {
      setIsSubmitting(true);
      await onUpdateAvailability(currentVenue.id, preservedSlots);
      setFeedback({
        type: 'success',
        message: `Removed ${timeStr} on ${formatDateDisplay(dateStr, 'readable')}.`,
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to remove slot.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!currentVenue) {
    return null;
  }

  return (
    <div className="bg-white border border-[#DDD8CF] rounded-2xl p-5 sm:p-6 space-y-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#DDD8CF] pb-4">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-[#26343D] flex items-center gap-2">
            <Video className="w-4 h-4 text-[#A86445]" />
            <span>Live Walkthrough Availability</span>
          </h3>
          <p className="text-xs text-[#66737A] mt-0.5">
            Configure dates and times when clients can book live virtual walkthroughs with you.
          </p>
        </div>

        {venues.length > 1 && (
          <div className="flex items-center gap-2">
            <label htmlFor="availability-venue-select" className="text-xs font-semibold text-[#26343D] shrink-0">
              Venue:
            </label>
            <select
              id="availability-venue-select"
              value={activeVenueId}
              onChange={(e) => handleVenueChange(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-[#DDD8CF] bg-[#F4F1EA] text-xs font-semibold text-[#26343D] focus:bg-white focus:outline-none focus:border-[#A86445] transition-colors"
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Add Time Form */}
      <form onSubmit={handleAddSlot} className="bg-[#F4F1EA] border border-[#DDD8CF] rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#26343D] uppercase tracking-wider">
            Add Available Walkthrough Time
          </span>
          <span className="text-[11px] text-[#66737A]">
            Times shown in venue local time ({venueTz})
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] text-[#66737A] mb-1 font-medium">Date *</label>
            <div className="relative">
              <input
                type="date"
                required
                id="walkthrough-slot-date-input"
                min={todayStr}
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-lg border border-[#DDD8CF] text-xs text-[#26343D] font-medium focus:outline-none focus:border-[#A86445]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-[#66737A] mb-1 font-medium">Time *</label>
            <div className="flex items-center gap-2">
              <input
                type="time"
                required
                id="walkthrough-slot-time-input"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-lg border border-[#DDD8CF] text-xs text-[#26343D] font-medium focus:outline-none focus:border-[#A86445]"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              id="add-walkthrough-time-btn"
              disabled={isSubmitting}
              className="w-full py-2 px-4 rounded-lg bg-[#A86445] text-white text-xs font-semibold hover:bg-[#8F5439] active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Saving...' : 'Add Available Time'}</span>
            </button>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <span className="text-[10px] text-[#66737A]">Popular presets:</span>
          {['10:00', '11:30', '14:00', '16:30', '18:00'].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setNewTime(preset)}
              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                newTime === preset
                  ? 'bg-[#F3E7DF] border-[#A86445] text-[#A86445]'
                  : 'bg-white border-[#DDD8CF] text-[#66737A] hover:text-[#26343D]'
              }`}
            >
              {preset}
            </button>
          ))}
        </div>

        {feedback && (
          <div
            className={`p-2.5 rounded-lg border text-xs flex items-center gap-2 ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            )}
            <span>{feedback.message}</span>
          </div>
        )}
      </form>

      {/* Configured Future Availability List */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold text-[#26343D] uppercase tracking-wider flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#A86445]" />
            <span>Configured Walkthrough Schedule ({currentVenue.name})</span>
          </h4>
          <span className="text-[11px] text-[#66737A]">
            {futureSlots.length} {futureSlots.length === 1 ? 'date' : 'dates'} scheduled
          </span>
        </div>

        {futureSlots.length === 0 ? (
          <div className="p-6 rounded-xl bg-[#F4F1EA] border border-[#DDD8CF] text-center space-y-1">
            <p className="text-xs font-semibold text-[#26343D]">No Live Walkthrough Availability Configured</p>
            <p className="text-[11px] text-[#66737A]">
              Add dates and times above to enable prospective clients to book virtual walkthroughs with this venue.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {futureSlots.map((daySlot) => {
              const formattedDate = formatDateDisplay(daySlot.date, 'readable');

              return (
                <div
                  key={daySlot.date}
                  className="p-3.5 rounded-xl border border-[#DDD8CF] bg-white space-y-2 hover:border-[#A86445]/40 transition-colors"
                >
                  <div className="flex items-center justify-between border-b border-[#DDD8CF]/60 pb-2">
                    <span className="text-xs font-bold text-[#26343D]">{formattedDate}</span>
                    <span className="text-[10px] text-[#66737A]">
                      {daySlot.times.length} {daySlot.times.length === 1 ? 'slot' : 'slots'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {daySlot.times.map((t) => {
                      // Determine whether this slot is booked
                      const isBooked =
                        t.available === false ||
                        walkthroughBookings.some(
                          (b) =>
                            b.venueId === currentVenue.id &&
                            b.scheduledDate === daySlot.date &&
                            b.status !== 'cancelled' &&
                            (b.scheduledTime.trim().toLowerCase() === t.time.trim().toLowerCase() ||
                              b.scheduledTime.includes(t.time) ||
                              t.time.includes(b.scheduledTime))
                        );

                      const cleanIdTime = t.time.replace(/[^a-zA-Z0-9]/g, '-');

                      return (
                        <div
                          key={t.time}
                          className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 text-xs transition-colors ${
                            isBooked
                              ? 'bg-amber-50/70 border-amber-200 text-[#26343D]'
                              : 'bg-[#F4F1EA] border-[#DDD8CF] text-[#26343D]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-[#66737A]" />
                            <span className="font-semibold">{t.time}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            {isBooked ? (
                              <span
                                id={`booked-badge-${daySlot.date}-${cleanIdTime}`}
                                className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300"
                              >
                                Booked
                              </span>
                            ) : (
                              <>
                                <span
                                  id={`available-badge-${daySlot.date}-${cleanIdTime}`}
                                  className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
                                >
                                  Available
                                </span>
                                <button
                                  type="button"
                                  id={`remove-slot-${daySlot.date}-${cleanIdTime}`}
                                  disabled={isSubmitting}
                                  onClick={() => handleRemoveSlot(daySlot.date, t.time)}
                                  className="text-xs text-rose-600 hover:text-rose-800 hover:underline p-1 transition-colors"
                                  title="Remove available slot"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

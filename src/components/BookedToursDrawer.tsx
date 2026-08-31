import React from 'react';
import { X, Calendar, Clock, Video, MapPin, Copy, ExternalLink, Trash2, ArrowRight } from 'lucide-react';
import { WalkthroughBooking } from '../types';

interface BookedToursDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  bookings: WalkthroughBooking[];
  onOpenLiveSimulator: (booking: WalkthroughBooking) => void;
}

export const BookedToursDrawer: React.FC<BookedToursDrawerProps> = ({
  isOpen,
  onClose,
  bookings,
  onOpenLiveSimulator,
}) => {
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopyLink = (booking: WalkthroughBooking) => {
    navigator.clipboard.writeText(booking.meetingUrl);
    setCopiedId(booking.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-[#DDD8CF] shadow-2xl flex flex-col justify-between">
          {/* Header */}
          <div className="px-6 py-5 border-b border-[#DDD8CF] flex items-center justify-between bg-[#F4F1EA]">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-[#A86445]" />
              <h3 className="text-base font-bold text-[#26343D]">
                My Scheduled Walkthroughs ({bookings.length})
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-[#66737A] hover:text-[#26343D] rounded-lg hover:bg-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Bookings List */}
          <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-[#F4F1EA]">
            {bookings.length === 0 ? (
              <div className="text-center py-16 space-y-3 bg-white border border-[#DDD8CF] rounded-2xl p-8 shadow-xs">
                <div className="w-12 h-12 mx-auto rounded-xl bg-[#F4F1EA] border border-[#DDD8CF] flex items-center justify-center text-[#66737A]">
                  <Calendar className="w-6 h-6 text-[#A86445]" />
                </div>
                <p className="text-sm font-semibold text-[#26343D]">No Scheduled Tours Yet</p>
                <p className="text-xs text-[#66737A] max-w-xs mx-auto leading-relaxed">
                  Browse spaces and click "Live Tour" or "Book Walkthrough" to schedule a remote inspection with the venue coordinator.
                </p>
              </div>
            ) : (
              bookings.map((booking) => (
                <div
                  key={booking.id}
                  className="bg-white border border-[#DDD8CF] rounded-xl overflow-hidden hover:border-[#26343D] transition-all p-4 space-y-3.5 shadow-xs"
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={booking.venueImage}
                      alt={booking.venueName}
                      className="w-16 h-16 rounded-lg object-cover border border-[#DDD8CF]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          Confirmed
                        </span>
                        <span className="text-[10px] font-mono text-[#66737A]">{booking.meetingCode}</span>
                      </div>
                      <h4 className="text-sm font-bold text-[#26343D] truncate mt-1">{booking.venueName}</h4>
                      <p className="text-xs text-[#66737A] flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-[#A86445]" />
                        {booking.venueLocation}
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#F4F1EA] p-3 rounded-lg border border-[#DDD8CF] space-y-1 text-xs">
                    <div className="flex items-center justify-between text-[#26343D]">
                      <span className="text-[#66737A]">Date & Time:</span>
                      <strong className="text-[#26343D] font-semibold">{booking.scheduledDate} • {booking.scheduledTime}</strong>
                    </div>
                    <div className="flex items-center justify-between text-[#26343D]">
                      <span className="text-[#66737A]">Coordinator:</span>
                      <span className="text-[#26343D] font-medium">{booking.hostName}</span>
                    </div>
                    <div className="flex items-center justify-between text-[#26343D]">
                      <span className="text-[#66737A]">Event:</span>
                      <span className="capitalize text-[#26343D]">{booking.eventType} ({booking.estimatedGuests} guests)</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handleCopyLink(booking)}
                      className="py-2 px-3 rounded-lg bg-white border border-[#DDD8CF] text-xs font-medium text-[#26343D] hover:bg-[#F4F1EA] flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedId === booking.id ? 'Copied!' : 'Copy Link'}</span>
                    </button>

                    <button
                      onClick={() => {
                        onClose();
                        onOpenLiveSimulator(booking);
                      }}
                      className="py-2 px-3 rounded-lg bg-[#26343D] text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-xs hover:bg-[#1E2930] active:scale-95 transition-all"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Join Live Call</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[#DDD8CF] bg-[#F4F1EA] text-center text-xs text-[#66737A]">
            VenueStream: High-resolution live tours with interactive pan-tilt-zoom inspection.
          </div>
        </div>
      </div>
    </div>
  );
};

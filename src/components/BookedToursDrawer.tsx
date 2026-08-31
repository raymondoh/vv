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
      {/* Dark backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[#11141b] border-l border-[#262c3a] shadow-2xl flex flex-col justify-between">
          {/* Header */}
          <div className="px-6 py-5 border-b border-[#232731] flex items-center justify-between bg-[#141822]">
            <div className="flex items-center gap-2.5">
              <Calendar className="w-5 h-5 text-[#d4af37]" />
              <h3 className="text-base font-bold text-white font-serif-luxury">
                My Scheduled Walkthroughs ({bookings.length})
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-[#1d222e]"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Bookings List */}
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            {bookings.length === 0 ? (
              <div className="text-center py-16 space-y-3">
                <div className="w-12 h-12 mx-auto rounded-xl bg-[#1a1f2c] border border-[#273042] flex items-center justify-center text-gray-400">
                  <Calendar className="w-6 h-6 text-gray-500" />
                </div>
                <p className="text-sm font-semibold text-white">No Scheduled Tours Yet</p>
                <p className="text-xs text-gray-400 max-w-xs mx-auto">
                  Browse our curated venues and click "Book Live Call" to schedule a personalized 4K walkthrough with a venue director.
                </p>
              </div>
            ) : (
              bookings.map((booking) => (
                <div
                  key={booking.id}
                  className="bg-[#161a22] border border-[#272f3e] rounded-xl overflow-hidden hover:border-[#d4af37]/60 transition-all p-4 space-y-3.5 shadow-lg"
                >
                  <div className="flex items-start gap-3">
                    <img
                      src={booking.venueImage}
                      alt={booking.venueName}
                      className="w-16 h-16 rounded-lg object-cover border border-[#2a3447]"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                          Confirmed
                        </span>
                        <span className="text-[10px] font-mono text-gray-400">{booking.meetingCode}</span>
                      </div>
                      <h4 className="text-sm font-bold text-white truncate mt-1">{booking.venueName}</h4>
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-amber-500" />
                        {booking.venueLocation}
                      </p>
                    </div>
                  </div>

                  <div className="bg-[#12151d] p-3 rounded-lg border border-[#212634] space-y-1 text-xs">
                    <div className="flex items-center justify-between text-gray-300">
                      <span className="text-gray-400">Date & Time:</span>
                      <strong className="text-[#fae29c]">{booking.scheduledDate} • {booking.scheduledTime}</strong>
                    </div>
                    <div className="flex items-center justify-between text-gray-300">
                      <span className="text-gray-400">Host:</span>
                      <span className="text-white">{booking.hostName}</span>
                    </div>
                    <div className="flex items-center justify-between text-gray-300">
                      <span className="text-gray-400">Event:</span>
                      <span className="capitalize">{booking.eventType} ({booking.estimatedGuests} guests)</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <button
                      onClick={() => handleCopyLink(booking)}
                      className="py-2 px-3 rounded-lg bg-[#1e2432] border border-[#2b3447] text-xs font-semibold text-gray-200 hover:text-white flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>{copiedId === booking.id ? 'Copied!' : 'Copy Link'}</span>
                    </button>

                    <button
                      onClick={() => {
                        onClose();
                        onOpenLiveSimulator(booking);
                      }}
                      className="py-2 px-3 rounded-lg bg-gradient-to-r from-[#d4af37] to-[#b38622] text-xs font-bold text-black flex items-center justify-center gap-1.5 shadow-md shadow-[#d4af37]/20 hover:brightness-110 active:scale-95 transition-all"
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
          <div className="p-4 border-t border-[#232731] bg-[#141822] text-center text-xs text-gray-400">
            VenueStream Concierge: Live tours are conducted in 4K with spatial audio.
          </div>
        </div>
      </div>
    </div>
  );
};

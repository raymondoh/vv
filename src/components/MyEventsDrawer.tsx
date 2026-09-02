import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Video,
  X,
  Copy,
  ExternalLink,
  CreditCard,
  FileText,
  Building2,
  Users,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Image as ImageIcon,
} from 'lucide-react';
import { VenueBooking, WalkthroughBooking, Venue } from '../types';
import { getStatusDisplay, getDepositStatusDisplay, getFinalBalanceStatusDisplay } from '../utils/bookingStatus';
import { formatCurrency, formatDateDisplay } from '../utils/formatters';

interface MyEventsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  venueBookings: VenueBooking[];
  walkthroughBookings: WalkthroughBooking[];
  onOpenLiveSimulator: (booking: WalkthroughBooking) => void;
  onOpenDepositModal: (booking: VenueBooking) => void;
  onOpenEventPlanner: (booking: VenueBooking) => void;
  onExploreVenue: (venueId: string) => void;
  venues?: Venue[];
}

export const MyEventsDrawer: React.FC<MyEventsDrawerProps> = ({
  isOpen,
  onClose,
  venueBookings,
  walkthroughBookings,
  onOpenLiveSimulator,
  onOpenDepositModal,
  onOpenEventPlanner,
  onExploreVenue,
  venues = [],
}) => {
  const [activeTab, setActiveTab] = useState<'bookings' | 'walkthroughs'>('bookings');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopyLink = (booking: WalkthroughBooking) => {
    navigator.clipboard.writeText(booking.meetingUrl);
    setCopiedId(booking.id);
    setTimeout(() => setCopiedId(null), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl bg-white shadow-2xl border-l border-[#DDD8CF] flex flex-col animate-in slide-in-from-right duration-300">
          {/* Header */}
          <div className="px-6 py-5 border-b border-[#DDD8CF] flex items-center justify-between bg-[#F4F1EA]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-white border border-[#DDD8CF] flex items-center justify-center text-[#A86445] shadow-xs">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-[#26343D] tracking-tight">
                  My Events & Discovery Hub
                </h3>
                <p className="text-[11px] text-[#66737A]">
                  Track space reservations, deposit payments, and scheduled virtual tours
                </p>
              </div>
            </div>
            <button
              id="close-events-drawer-btn"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#66737A] hover:text-[#26343D] hover:bg-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="px-6 py-2.5 bg-[#F4F1EA]/60 border-b border-[#DDD8CF] flex items-center gap-2">
            <button
              id="events-tab-bookings-btn"
              onClick={() => setActiveTab('bookings')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'bookings'
                  ? 'bg-[#26343D] text-white shadow-xs'
                  : 'text-[#66737A] hover:text-[#26343D] bg-white border border-[#DDD8CF]'
              }`}
            >
              Venue Bookings ({venueBookings.length})
            </button>
            <button
              id="events-tab-walkthroughs-btn"
              onClick={() => setActiveTab('walkthroughs')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'walkthroughs'
                  ? 'bg-[#26343D] text-white shadow-xs'
                  : 'text-[#66737A] hover:text-[#26343D] bg-white border border-[#DDD8CF]'
              }`}
            >
              Live Walkthroughs ({walkthroughBookings.length})
            </button>
          </div>

          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {activeTab === 'bookings' ? (
              /* VENUE BOOKINGS LIST */
              venueBookings.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-[#F4F1EA] border border-[#DDD8CF] flex items-center justify-center text-[#A86445]">
                    <Building2 className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-[#26343D]">No Venue Bookings Yet</p>
                  <p className="text-xs text-[#66737A] max-w-xs mx-auto leading-relaxed">
                    Explore our curated venues, inspect 4K layouts, and submit a "Request to Book" to reserve your date.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {venueBookings.map((booking) => {
                    const statusInfo = getStatusDisplay(booking.status);
                    const depositStatus = getDepositStatusDisplay(booking.status);
                    const finalBalanceStatus = getFinalBalanceStatusDisplay(booking.status);
                    const isDepositDue = booking.status === 'deposit_due';
                    const isFinalPaymentDue = booking.status === 'final_payment_due';
                    const isPaidOrConfirmed =
                      booking.status === 'confirmed' ||
                      booking.status === 'fully_paid' ||
                      booking.status === 'completed';
                    const venueObj = venues.find((v) => v.id === booking.venueId);
                    const hasWalkthrough = Boolean(venueObj && venueObj.walkthroughClips && venueObj.walkthroughClips.length > 0);
                    const bookingCurrency = booking.currency || venueObj?.pricing?.currency || 'GBP';

                    return (
                      <div
                        key={booking.id}
                        className="bg-white border border-[#DDD8CF] rounded-2xl overflow-hidden hover:border-[#26343D] transition-all p-4 space-y-3.5 shadow-xs"
                      >
                        {/* Top Info */}
                        <div className="flex items-start gap-3">
                          {booking.venueImage ? (
                            <img
                              src={booking.venueImage}
                              alt={booking.venueName}
                              className="w-16 h-16 rounded-xl object-cover border border-[#DDD8CF] shrink-0"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-[#EAE5DC] border border-[#DDD8CF] shrink-0 flex flex-col items-center justify-center p-1 text-center">
                              <ImageIcon className="w-4 h-4 text-[#A86445] mb-0.5" />
                              <span className="text-[9px] font-bold text-[#26343D] leading-tight line-clamp-1 max-w-[90%]">
                                {booking.venueName ? booking.venueName.slice(0, 8) : 'Venue'}
                              </span>
                              <span className="text-[8px] text-[#66737A]">No photo</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded border ${statusInfo.badgeClass}`}
                              >
                                {statusInfo.customerLabel}
                              </span>
                              <span className="text-[10px] font-mono text-[#66737A]">
                                {booking.bookingNumber}
                              </span>
                            </div>
                            <h4 className="text-sm font-bold text-[#26343D] truncate mt-1">
                              {booking.venueName}
                            </h4>
                            <p className="text-xs text-[#66737A]">
                              {formatDateDisplay(booking.eventDate, 'readable')} • {booking.guestCount} Guests
                            </p>
                          </div>
                        </div>

                        {/* Financial and Coordinator Details (Customer view - No platform commission) */}
                        <div className="bg-[#F4F1EA] p-3 rounded-xl border border-[#DDD8CF] space-y-1.5 text-xs">
                          <div className="flex items-center justify-between text-[#26343D]">
                            <span className="text-[#66737A]">Venue Total:</span>
                            <span className="font-semibold">{formatCurrency(booking.grossAmount, bookingCurrency)}</span>
                          </div>
                          <div className="flex items-center justify-between text-[#26343D]">
                            <span className="text-[#66737A]">Deposit ({booking.depositPercentage}%):</span>
                            <strong className={depositStatus.badgeClass}>
                              {formatCurrency(booking.depositAmount, bookingCurrency)} {depositStatus.label}
                            </strong>
                          </div>
                          <div className="flex items-center justify-between text-[#26343D]">
                            <span className="text-[#66737A]">Final Balance:</span>
                            <span className={finalBalanceStatus.badgeClass}>
                              {formatCurrency(booking.finalBalance || 0, bookingCurrency)} {finalBalanceStatus.label}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[#26343D]">
                            <span className="text-[#66737A]">Layout Setup:</span>
                            <span className="truncate max-w-[220px] font-medium">{booking.selectedLayout}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          {isDepositDue && (
                            <button
                              id={`pay-deposit-btn-${booking.id}`}
                              onClick={() => onOpenDepositModal(booking)}
                              className="col-span-2 py-2.5 px-3 rounded-xl bg-[#A86445] text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-xs hover:bg-[#8F5439] active:scale-95 transition-all"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Pay {formatCurrency(booking.depositAmount, bookingCurrency)} Deposit</span>
                            </button>
                          )}

                          {isFinalPaymentDue && (
                            <button
                              id={`pay-balance-btn-${booking.id}`}
                              onClick={() => onOpenEventPlanner(booking)}
                              className="col-span-2 py-2.5 px-3 rounded-xl bg-emerald-700 text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-xs hover:bg-emerald-800 active:scale-95 transition-all"
                            >
                              <CreditCard className="w-3.5 h-3.5" />
                              <span>Pay Final Balance ({formatCurrency(booking.finalBalance || 0, bookingCurrency)})</span>
                            </button>
                          )}

                          <button
                            id={`open-planner-btn-${booking.id}`}
                            onClick={() => onOpenEventPlanner(booking)}
                            className="py-2 px-3 rounded-xl bg-white border border-[#DDD8CF] text-xs font-semibold text-[#26343D] hover:bg-[#F4F1EA] flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                          >
                            <FileText className="w-3.5 h-3.5 text-[#A86445]" />
                            <span>Event Planner</span>
                          </button>

                          {hasWalkthrough ? (
                            <button
                              onClick={() => {
                                onClose();
                                onExploreVenue(booking.venueId);
                              }}
                              className="py-2 px-3 rounded-xl bg-white border border-[#DDD8CF] text-xs font-medium text-[#66737A] hover:text-[#26343D] hover:bg-[#F4F1EA] flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                            >
                              <Video className="w-3.5 h-3.5" />
                              <span>Inspect 4K Tour</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                onClose();
                                onExploreVenue(booking.venueId);
                              }}
                              className="py-2 px-3 rounded-xl bg-white border border-[#DDD8CF] text-xs font-medium text-[#66737A] hover:text-[#26343D] hover:bg-[#F4F1EA] flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                            >
                              <Building2 className="w-3.5 h-3.5" />
                              <span>View Details</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : (
              /* WALKTHROUGHS LIST */
              walkthroughBookings.length === 0 ? (
                <div className="py-16 text-center space-y-3">
                  <div className="w-12 h-12 mx-auto rounded-2xl bg-[#F4F1EA] border border-[#DDD8CF] flex items-center justify-center text-[#A86445]">
                    <Video className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-[#26343D]">No Scheduled Tours Yet</p>
                  <p className="text-xs text-[#66737A] max-w-xs mx-auto leading-relaxed">
                    Browse spaces and click "Live Tour" to schedule a remote inspection with the venue coordinator.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {walkthroughBookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="bg-white border border-[#DDD8CF] rounded-2xl overflow-hidden hover:border-[#26343D] transition-all p-4 space-y-3.5 shadow-xs"
                    >
                      <div className="flex items-start gap-3">
                        {booking.venueImage ? (
                          <img
                            src={booking.venueImage}
                            alt={booking.venueName}
                            className="w-14 h-14 rounded-xl object-cover border border-[#DDD8CF] shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-[#EAE5DC] border border-[#DDD8CF] shrink-0 flex flex-col items-center justify-center p-1 text-center">
                            <ImageIcon className="w-3.5 h-3.5 text-[#A86445] mb-0.5" />
                            <span className="text-[8px] font-bold text-[#26343D] leading-tight line-clamp-1 max-w-[90%]">
                              {booking.venueName ? booking.venueName.slice(0, 6) : 'Venue'}
                            </span>
                            <span className="text-[7px] text-[#66737A]">No photo</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              Confirmed
                            </span>
                            <span className="text-[10px] font-mono text-[#66737A]">{booking.meetingCode}</span>
                          </div>
                          <h4 className="text-sm font-bold text-[#26343D] truncate mt-1">
                            {booking.venueName}
                          </h4>
                          <p className="text-xs text-[#66737A]">{booking.venueLocation}</p>
                        </div>
                      </div>

                      <div className="bg-[#F4F1EA] p-3 rounded-xl border border-[#DDD8CF] space-y-1 text-xs">
                        <div className="flex items-center justify-between text-[#26343D]">
                          <span className="text-[#66737A]">Date & Time:</span>
                          <strong className="text-[#26343D] font-semibold">{formatDateDisplay(booking.scheduledDate, 'readable')} • {booking.scheduledTime}</strong>
                        </div>
                        <div className="flex items-center justify-between text-[#26343D]">
                          <span className="text-[#66737A]">Coordinator:</span>
                          <span className="text-[#26343D] font-medium">{booking.hostName}</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          onClick={() => handleCopyLink(booking)}
                          className="py-2 px-3 rounded-xl bg-white border border-[#DDD8CF] text-xs font-medium text-[#26343D] hover:bg-[#F4F1EA] flex items-center justify-center gap-1.5 transition-colors shadow-xs"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          <span>{copiedId === booking.id ? 'Copied!' : 'Copy Link'}</span>
                        </button>
                        <button
                          onClick={() => {
                            onClose();
                            onOpenLiveSimulator(booking);
                          }}
                          className="py-2 px-3 rounded-xl bg-[#26343D] text-xs font-semibold text-white flex items-center justify-center gap-1.5 shadow-xs hover:bg-[#1E2930] active:scale-95 transition-all"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Join Live Call</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-[#DDD8CF] bg-[#F4F1EA] text-center text-xs text-[#66737A]">
            VenueStream: Two-Sided Spatial Inspection & Booking Marketplace
          </div>
        </div>
      </div>
    </div>
  );
};

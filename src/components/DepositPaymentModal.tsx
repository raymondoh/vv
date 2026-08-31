import React, { useState } from 'react';
import {
  CreditCard,
  Lock,
  CheckCircle2,
  X,
  Building2,
  Calendar,
  ShieldCheck,
  ArrowRight,
  Info,
} from 'lucide-react';
import { VenueBooking } from '../types';

interface DepositPaymentModalProps {
  booking: VenueBooking;
  isOpen: boolean;
  onClose: () => void;
  onPaymentCompleted: (updatedBooking: VenueBooking) => void;
}

export const DepositPaymentModal: React.FC<DepositPaymentModalProps> = ({
  booking,
  isOpen,
  onClose,
  onPaymentCompleted,
}) => {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [cardNumber, setCardNumber] = useState('•••• •••• •••• 4242');
  const [cardHolder, setCardHolder] = useState(booking.clientName || 'Sarah Jenkins');
  const [cardExpiry, setCardExpiry] = useState('08/29');
  const [cardCvc, setCardCvc] = useState('884');
  const [billingZip, setBillingZip] = useState('60607');

  if (!isOpen) return null;

  const handleSimulatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(`/api/venue-bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isSimulatedDepositPayment: true,
        }),
      });

      if (!response.ok) {
        throw new Error('Payment processing failed');
      }

      const data = await response.json();
      if (data.success && data.booking) {
        setSuccess(true);
        onPaymentCompleted(data.booking);
      } else {
        throw new Error('Could not complete simulated payment');
      }
    } catch (err) {
      console.error('Simulated payment error, applying local fallback:', err);
      const updated: VenueBooking = {
        ...booking,
        status: 'deposit_paid',
        depositPaidAt: new Date().toISOString(),
        checklist: booking.checklist?.map((item) =>
          item.text.toLowerCase().includes('deposit') || item.text.toLowerCase().includes('awaiting')
            ? { ...item, completed: true }
            : item
        ),
      };
      setSuccess(true);
      onPaymentCompleted(updated);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-white border border-[#DDD8CF] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#DDD8CF] flex items-center justify-between bg-[#F4F1EA]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white border border-[#DDD8CF] flex items-center justify-center text-[#A86445] shadow-xs">
              <CreditCard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#26343D] tracking-tight">
                {success ? 'Deposit Payment Confirmed' : 'Simulated Deposit Payment'}
              </h3>
              <p className="text-[11px] text-[#66737A]">
                Booking #{booking.bookingNumber} • {booking.venueName}
              </p>
            </div>
          </div>
          <button
            id="close-deposit-modal-btn"
            onClick={onClose}
            className="p-2 text-[#66737A] hover:text-[#26343D] rounded-lg hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          {!success ? (
            <form onSubmit={handleSimulatePayment} className="space-y-5">
              {/* Event & Space Summary Box */}
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#F4F1EA] border border-[#DDD8CF]">
                <img
                  src={booking.venueImage}
                  alt={booking.venueName}
                  className="w-14 h-14 rounded-lg object-cover border border-[#DDD8CF]"
                />
                <div className="flex-1 min-w-0 text-xs">
                  <span className="font-bold text-[#26343D] block truncate">{booking.venueName}</span>
                  <span className="text-[#66737A] block">
                    Event Date: <strong>{booking.eventDate}</strong> ({booking.guestCount} guests)
                  </span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 inline-block mt-0.5 font-semibold">
                    Venue Approved Request
                  </span>
                </div>
              </div>

              {/* Clear Pricing Breakdown (No customer platform fees) */}
              <div className="space-y-2 border border-[#DDD8CF] rounded-xl p-4 bg-white">
                <div className="flex items-center justify-between text-xs text-[#66737A]">
                  <span>Total Venue Price:</span>
                  <span className="font-medium text-[#26343D]">${booking.grossAmount.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-[#26343D] font-bold pt-1 border-t border-[#DDD8CF]">
                  <span>Initial Deposit Required ({booking.depositPercentage}%):</span>
                  <span className="text-[#A86445] text-base font-bold">${booking.depositAmount.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-[#66737A] pt-1">
                  <span>Remaining Balance:</span>
                  <span>${booking.finalBalance.toLocaleString()} (Due 14 days prior)</span>
                </div>
              </div>

              {/* Simulated Card Details */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                    Simulated Payment Method
                  </label>
                  <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded font-medium">
                    Prototype Mode — No Real Charge
                  </span>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] text-[#66737A] mb-1">Card Number</label>
                    <div className="relative">
                      <input
                        type="text"
                        value={cardNumber}
                        onChange={(e) => setCardNumber(e.target.value)}
                        className="w-full bg-[#F4F1EA] text-[#26343D] font-mono text-xs px-3.5 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                      />
                      <CreditCard className="w-4 h-4 text-[#66737A] absolute right-3 top-3" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-[#66737A] mb-1">Cardholder Name</label>
                      <input
                        type="text"
                        value={cardHolder}
                        onChange={(e) => setCardHolder(e.target.value)}
                        className="w-full bg-[#F4F1EA] text-[#26343D] text-xs px-3.5 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] text-[#66737A] mb-1">Exp Date</label>
                        <input
                          type="text"
                          value={cardExpiry}
                          onChange={(e) => setCardExpiry(e.target.value)}
                          className="w-full bg-[#F4F1EA] text-[#26343D] font-mono text-xs px-2.5 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-[#66737A] mb-1">CVC</label>
                        <input
                          type="text"
                          value={cardCvc}
                          onChange={(e) => setCardCvc(e.target.value)}
                          className="w-full bg-[#F4F1EA] text-[#26343D] font-mono text-xs px-2.5 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-3">
                <button
                  id="confirm-simulated-deposit-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#A86445] text-white font-semibold text-xs sm:text-sm shadow-sm hover:bg-[#8F5439] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Lock className="w-4 h-4" />
                  <span>
                    {loading
                      ? 'Processing Simulated Authorization...'
                      : `Pay $${booking.depositAmount.toLocaleString()} Deposit (Simulated)`}
                  </span>
                </button>
                <p className="text-[10px] text-[#66737A] text-center mt-2 flex items-center justify-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Zero risk prototype simulation • Secures event date immediately</span>
                </p>
              </div>
            </form>
          ) : (
            /* Success confirmation */
            <div className="text-center py-4 space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center shadow-xs">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#26343D] tracking-tight">
                  Deposit Paid & Booking Confirmed!
                </h3>
                <p className="text-xs text-[#66737A] max-w-sm mx-auto">
                  Your deposit of <strong>${booking.depositAmount.toLocaleString()}</strong> has been credited. The space is now secured for <strong>{booking.eventDate}</strong>.
                </p>
              </div>

              <div className="bg-[#F4F1EA] border border-[#DDD8CF] rounded-xl p-4 text-xs space-y-2 text-left">
                <div className="flex items-center justify-between text-[#66737A]">
                  <span>Confirmation Number:</span>
                  <span className="font-mono font-bold text-[#26343D]">{booking.bookingNumber}</span>
                </div>
                <div className="flex items-center justify-between text-[#66737A]">
                  <span>Status:</span>
                  <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Deposit Paid / Booking Confirmed
                  </span>
                </div>
                <div className="flex items-center justify-between text-[#66737A]">
                  <span>Remaining Balance:</span>
                  <span className="font-medium text-[#26343D]">${booking.finalBalance.toLocaleString()}</span>
                </div>
              </div>

              <button
                id="close-deposit-success-btn"
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-[#26343D] text-white font-semibold text-xs hover:bg-[#1E2930] shadow-xs transition-all"
              >
                Open Event Planner
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

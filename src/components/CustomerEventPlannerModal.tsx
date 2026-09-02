import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Save,
  Video,
  CreditCard,
  FileText,
  Clock,
  Building2,
  Users,
  MapPin,
  X,
  ExternalLink,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { VenueBooking, ChecklistItem, MarketplaceConfig } from '../types';
import { getStatusDisplay } from '../utils/bookingStatus';
import { formatCurrency, formatDateDisplay } from '../utils/formatters';

interface CustomerEventPlannerModalProps {
  booking: VenueBooking;
  isOpen: boolean;
  onClose: () => void;
  onUpdateBooking: (updated: VenueBooking) => void;
  onOpenDepositModal: (booking: VenueBooking) => void;
  onExploreWalkthrough: (venueId: string) => void;
  marketplaceConfig?: MarketplaceConfig;
}

export const CustomerEventPlannerModal: React.FC<CustomerEventPlannerModalProps> = ({
  booking,
  isOpen,
  onClose,
  onUpdateBooking,
  onOpenDepositModal,
  onExploreWalkthrough,
  marketplaceConfig,
}) => {
  const [checklist, setChecklist] = useState<ChecklistItem[]>(booking.checklist || []);
  const [personalNotes, setPersonalNotes] = useState<string>(booking.personalNotes || '');
  const [guestCount, setGuestCount] = useState<number>(booking.guestCount);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskCategory, setNewTaskCategory] = useState<'Inspection' | 'Contract & Payment' | 'Catering & AV' | 'Logistics'>('Catering & AV');
  const [isSaving, setIsSaving] = useState(false);
  const [isPayingFinal, setIsPayingFinal] = useState(false);
  const [activeTab, setActiveTab] = useState<'checklist' | 'notes' | 'overview'>('checklist');

  if (!isOpen) return null;

  const statusInfo = getStatusDisplay(booking.status);
  const isDepositDue = booking.status === 'deposit_due';
  const isFinalPaymentDue = booking.status === 'final_payment_due';
  const isPaidOrConfirmed =
    booking.status === 'confirmed' ||
    booking.status === 'fully_paid' ||
    booking.status === 'completed';

  const handleToggleTask = (taskId: string) => {
    const updated = checklist.map((item) =>
      item.id === taskId ? { ...item, completed: !item.completed } : item
    );
    setChecklist(updated);
    saveChanges(updated, personalNotes, guestCount);
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskText.trim()) return;

    const newItem: ChecklistItem = {
      id: `task-${Date.now()}`,
      text: newTaskText.trim(),
      completed: false,
      category: newTaskCategory,
    };

    const updated = [...checklist, newItem];
    setChecklist(updated);
    setNewTaskText('');
    saveChanges(updated, personalNotes, guestCount);
  };

  const handleDeleteTask = (taskId: string) => {
    const updated = checklist.filter((item) => item.id !== taskId);
    setChecklist(updated);
    saveChanges(updated, personalNotes, guestCount);
  };

  const handlePayFinalBalance = async () => {
    setIsPayingFinal(true);
    try {
      const response = await fetch(`/api/venue-bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isSimulatedFinalPayment: true,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.booking) {
          onUpdateBooking(data.booking);
        }
      }
    } catch (err) {
      console.error('Error simulating final balance payment:', err);
    } finally {
      setIsPayingFinal(false);
    }
  };

  const saveChanges = async (
    currentChecklist: ChecklistItem[],
    currentNotes: string,
    currentGuests: number
  ) => {
    setIsSaving(true);
    const updatedBooking: VenueBooking = {
      ...booking,
      checklist: currentChecklist,
      personalNotes: currentNotes,
      guestCount: currentGuests,
    };

    try {
      await fetch(`/api/venue-bookings/${booking.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          checklist: currentChecklist,
          personalNotes: currentNotes,
          guestCount: currentGuests,
        }),
      });
      onUpdateBooking(updatedBooking);
    } catch (err) {
      console.error('Failed to sync planner update:', err);
      onUpdateBooking(updatedBooking);
    } finally {
      setIsSaving(false);
    }
  };

  const completedCount = checklist.filter((i) => i.completed).length;
  const progressPercent = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl bg-white border border-[#DDD8CF] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-[#DDD8CF] flex items-center justify-between bg-[#F4F1EA]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white border border-[#DDD8CF] flex items-center justify-center shadow-xs">
              <FileText className="w-5 h-5 text-[#A86445]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-[#26343D] tracking-tight">
                  Event Planner & Space Hub
                </h2>
                <span className="text-[10px] font-mono text-[#66737A] bg-white border border-[#DDD8CF] px-2 py-0.5 rounded">
                  {booking.bookingNumber}
                </span>
              </div>
              <p className="text-xs text-[#66737A]">
                {booking.venueName} • {booking.eventDate} ({booking.guestCount} guests)
              </p>
            </div>
          </div>
          <button
            id="close-event-planner-btn"
            onClick={onClose}
            className="p-2 text-[#66737A] hover:text-[#26343D] rounded-lg hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Nav / Tab Bar */}
        <div className="px-6 py-2.5 bg-[#F4F1EA]/50 border-b border-[#DDD8CF] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('checklist')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'checklist'
                  ? 'bg-[#26343D] text-white shadow-xs'
                  : 'text-[#66737A] hover:text-[#26343D] bg-white border border-[#DDD8CF]'
              }`}
            >
              Event Checklist ({completedCount}/{checklist.length})
            </button>
            <button
              onClick={() => setActiveTab('notes')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'notes'
                  ? 'bg-[#26343D] text-white shadow-xs'
                  : 'text-[#66737A] hover:text-[#26343D] bg-white border border-[#DDD8CF]'
              }`}
            >
              Personal Notes & Logistics
            </button>
            <button
              onClick={() => setActiveTab('overview')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === 'overview'
                  ? 'bg-[#26343D] text-white shadow-xs'
                  : 'text-[#66737A] hover:text-[#26343D] bg-white border border-[#DDD8CF]'
              }`}
            >
              Space & Pricing Overview
            </button>
          </div>

          <button
            onClick={() => {
              onClose();
              onExploreWalkthrough(booking.venueId);
            }}
            className="hidden sm:flex items-center gap-1.5 text-xs text-[#A86445] hover:text-[#8F5439] font-medium bg-white px-2.5 py-1 rounded-lg border border-[#DDD8CF] shadow-xs"
          >
            <Video className="w-3.5 h-3.5" />
            <span>Open 4K Walkthrough</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Status & Payment Banner */}
          <div className="p-4 rounded-xl border border-[#DDD8CF] bg-[#F4F1EA] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#66737A]">Booking Status:</span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded border ${statusInfo.badgeClass}`}
                >
                  {statusInfo.customerLabel}
                </span>
              </div>
              <p className="text-xs text-[#66737A]">
                Venue Rate: <strong>{formatCurrency(booking.grossAmount, booking.currency || 'GBP')}</strong> • Deposit ({booking.depositPercentage}%): <strong>{formatCurrency(booking.depositAmount, booking.currency || 'GBP')}</strong>
              </p>
            </div>

            {isDepositDue && (
              <button
                id="planner-pay-deposit-btn"
                onClick={() => onOpenDepositModal(booking)}
                className="px-4 py-2 bg-[#A86445] text-white font-semibold text-xs rounded-xl hover:bg-[#8F5439] shadow-xs transition-all flex items-center gap-1.5 shrink-0"
              >
                <CreditCard className="w-4 h-4" />
                <span>Pay Deposit ({formatCurrency(booking.depositAmount, booking.currency || 'GBP')})</span>
              </button>
            )}

            {isFinalPaymentDue && (
              <button
                id="planner-pay-final-btn"
                onClick={handlePayFinalBalance}
                disabled={isPayingFinal}
                className="px-4 py-2 bg-emerald-700 text-white font-semibold text-xs rounded-xl hover:bg-emerald-800 shadow-xs transition-all flex items-center gap-1.5 shrink-0"
              >
                <CreditCard className="w-4 h-4" />
                <span>{isPayingFinal ? 'Processing...' : `Pay Final Balance (${formatCurrency(booking.finalBalance || 0, booking.currency || 'GBP')})`}</span>
              </button>
            )}
          </div>

          {/* TAB 1: CHECKLIST */}
          {activeTab === 'checklist' && (
            <div className="space-y-5">
              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[#66737A]">
                  <span className="font-semibold text-[#26343D]">Planning Progress</span>
                  <span>{progressPercent}% completed ({completedCount}/{checklist.length} items)</span>
                </div>
                <div className="w-full h-2 bg-[#DDD8CF] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#26343D] transition-all duration-300 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Tasks List */}
              <div className="space-y-2">
                {checklist.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-start justify-between gap-3 p-3 rounded-xl border transition-all ${
                      item.completed
                        ? 'bg-[#F4F1EA]/60 border-[#DDD8CF] opacity-75'
                        : 'bg-white border-[#DDD8CF] hover:border-[#26343D]'
                    }`}
                  >
                    <div
                      onClick={() => handleToggleTask(item.id)}
                      className="flex items-start gap-3 flex-1 cursor-pointer"
                    >
                      <button type="button" className="mt-0.5 text-[#26343D]">
                        {item.completed ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-50" />
                        ) : (
                          <Circle className="w-4 h-4 text-[#66737A]" />
                        )}
                      </button>
                      <div>
                        <span
                          className={`text-xs font-medium text-[#26343D] block ${
                            item.completed ? 'line-through text-[#66737A]' : ''
                          }`}
                        >
                          {item.text}
                        </span>
                        {item.category && (
                          <span className="text-[10px] text-[#66737A] uppercase tracking-wider">
                            {item.category}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteTask(item.id)}
                      className="text-[#66737A] hover:text-rose-600 p-1 transition-colors"
                      title="Remove item"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add Task Form */}
              <form onSubmit={handleAddTask} className="flex gap-2 pt-2">
                <input
                  type="text"
                  placeholder="Add custom task (e.g. Schedule rehearsal sound check)..."
                  value={newTaskText}
                  onChange={(e) => setNewTaskText(e.target.value)}
                  className="flex-1 bg-[#F4F1EA] text-[#26343D] text-xs px-3.5 py-2 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D]"
                />
                <select
                  value={newTaskCategory}
                  onChange={(e) => setNewTaskCategory(e.target.value as any)}
                  className="bg-[#F4F1EA] text-[#26343D] text-xs px-2.5 py-2 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none"
                >
                  <option value="Inspection">Inspection</option>
                  <option value="Contract & Payment">Contract</option>
                  <option value="Catering & AV">Catering & AV</option>
                  <option value="Logistics">Logistics</option>
                </select>
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#26343D] text-white font-semibold text-xs rounded-xl hover:bg-[#1E2930] flex items-center gap-1 shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
              </form>
            </div>
          )}

          {/* TAB 2: NOTES */}
          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-semibold uppercase tracking-wider text-[#26343D]">
                  Event Coordinator & Logistics Scratchpad
                </label>
                {isSaving && <span className="text-[10px] text-[#A86445]">Saving changes...</span>}
              </div>
              <textarea
                rows={8}
                value={personalNotes}
                onChange={(e) => {
                  setPersonalNotes(e.target.value);
                  saveChanges(checklist, e.target.value, guestCount);
                }}
                placeholder="Type your notes, vendor phone numbers, setup timelines, dietary restrictions, or AV requirements..."
                className="w-full bg-[#F4F1EA] text-[#26343D] text-xs p-4 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#26343D] leading-relaxed"
              />
              <p className="text-[10px] text-[#66737A]">
                *Notes are securely attached to this event booking and persisted locally.
              </p>
            </div>
          )}

          {/* TAB 3: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#F4F1EA] border border-[#DDD8CF] space-y-2">
                  <span className="font-bold text-[#26343D] block">Space & Logistics</span>
                  <div className="space-y-1 text-[#66737A]">
                    <div>Location: <strong className="text-[#26343D]">{booking.venueLocation}</strong></div>
                    <div>Event Date: <strong className="text-[#26343D]">{booking.eventDate}</strong></div>
                    <div>Timing: <strong className="text-[#26343D]">{booking.startTime} – {booking.endTime}</strong></div>
                    <div>Layout: <strong className="text-[#26343D]">{booking.selectedLayout}</strong></div>
                    <div>Guest Count: <strong className="text-[#26343D]">{booking.guestCount} guests</strong></div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-[#F4F1EA] border border-[#DDD8CF] space-y-2">
                  <span className="font-bold text-[#26343D] block">Financial Summary</span>
                  <div className="space-y-1 text-[#66737A]">
                    <div>Venue Booking Price: <strong className="text-[#26343D]">{formatCurrency(booking.grossAmount, booking.currency || 'GBP')}</strong></div>
                    <div>Deposit Required ({booking.depositPercentage}%): <strong className="text-[#26343D]">{formatCurrency(booking.depositAmount, booking.currency || 'GBP')}</strong></div>
                    <div>Deposit Status: <strong className={
                      booking.status === 'confirmed' || booking.status === 'fully_paid' || booking.status === 'completed'
                        ? 'text-emerald-700'
                        : booking.status === 'deposit_due'
                        ? 'text-amber-700'
                        : 'text-[#66737A]'
                    }>
                      {booking.status === 'confirmed' || booking.status === 'fully_paid' || booking.status === 'completed'
                        ? 'Paid & Receipted'
                        : booking.status === 'deposit_due'
                        ? 'Due Now'
                        : 'Not due yet (Awaiting Host Review)'}
                    </strong></div>
                    <div>Remaining Balance: <strong className="text-[#26343D]">{formatCurrency(booking.finalBalance, booking.currency || 'GBP')}</strong></div>
                    <div>Balance Due Date: <strong className="text-[#26343D]">{booking.finalBalanceDueDate ? formatDateDisplay(booking.finalBalanceDueDate, 'readable') : `${marketplaceConfig?.balanceDueDaysBeforeEvent ?? 14} days prior to event`}</strong></div>
                  </div>
                </div>
              </div>

              {booking.specialRequirements && (
                <div className="p-4 rounded-xl bg-white border border-[#DDD8CF] space-y-1">
                  <span className="font-bold text-[#26343D] block">Special Requirements Noted</span>
                  <p className="text-[#66737A] leading-relaxed">{booking.specialRequirements}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-[#DDD8CF] bg-[#F4F1EA] flex items-center justify-between text-xs text-[#66737A]">
          <span>Coordinator: <strong className="text-[#26343D]">{booking.hostName}</strong></span>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-[#26343D] text-white font-semibold rounded-xl hover:bg-[#1E2930] shadow-xs transition-all"
          >
            Close Planner
          </button>
        </div>
      </div>
    </div>
  );
};

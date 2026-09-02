import React, { useState } from 'react';
import {
  Sliders,
  ShieldAlert,
  Save,
  RotateCcw,
  CheckCircle2,
  Percent,
  Calendar,
  DollarSign,
  Info,
  TrendingUp,
  Building2,
  Users,
  Check,
  XCircle,
  Clock,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { Venue, VenueBooking, MarketplaceConfig, VenueBookingStatus } from '../types';
import { DEFAULT_MARKETPLACE_CONFIG } from '../config/marketplaceConfig';
import { getStatusDisplay, ALLOWED_STATUS_TRANSITIONS } from '../utils/bookingStatus';
import { formatCurrency, formatDateDisplay } from '../utils/formatters';

interface PlatformAdminDashboardProps {
  venues: Venue[];
  venueBookings: VenueBooking[];
  marketplaceConfig: MarketplaceConfig;
  onSaveConfig: (updated: MarketplaceConfig) => void;
  onUpdateBookingStatus: (bookingId: string, newStatus: VenueBookingStatus) => void;
  onSwitchRole: (role: 'customer' | 'venue_owner') => void;
}

export const PlatformAdminDashboard: React.FC<PlatformAdminDashboardProps> = ({
  venues,
  venueBookings,
  marketplaceConfig,
  onSaveConfig,
  onUpdateBookingStatus,
  onSwitchRole,
}) => {
  const [commissionRate, setCommissionRate] = useState<number>(
    marketplaceConfig.commissionPercentage || DEFAULT_MARKETPLACE_CONFIG.commissionPercentage
  );
  const [depositPercent, setDepositPercent] = useState<number>(
    marketplaceConfig.depositPercentage || DEFAULT_MARKETPLACE_CONFIG.depositPercentage
  );
  const [balanceDays, setBalanceDays] = useState<number>(
    marketplaceConfig.balanceDueDaysBeforeEvent || DEFAULT_MARKETPLACE_CONFIG.balanceDueDaysBeforeEvent || 14
  );
  const [cancellationHours, setCancellationHours] = useState<number>(
    marketplaceConfig.freeCancellationHours || DEFAULT_MARKETPLACE_CONFIG.freeCancellationHours || 48
  );
  const [isSaved, setIsSaved] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | VenueBookingStatus>('all');

  // Keep local form in sync if external config changes
  React.useEffect(() => {
    setCommissionRate(marketplaceConfig.commissionPercentage || 12);
    setDepositPercent(marketplaceConfig.depositPercentage || 25);
    setBalanceDays(marketplaceConfig.balanceDueDaysBeforeEvent || 14);
    setCancellationHours(marketplaceConfig.freeCancellationHours || 48);
  }, [marketplaceConfig]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: MarketplaceConfig = {
      ...marketplaceConfig,
      commissionPercentage: commissionRate,
      depositPercentage: depositPercent,
      balanceDueDaysBeforeEvent: balanceDays,
      freeCancellationHours: cancellationHours,
    };
    onSaveConfig(updated);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleResetDefaults = () => {
    setCommissionRate(DEFAULT_MARKETPLACE_CONFIG.commissionPercentage);
    setDepositPercent(DEFAULT_MARKETPLACE_CONFIG.depositPercentage);
    setBalanceDays(DEFAULT_MARKETPLACE_CONFIG.balanceDueDaysBeforeEvent || 14);
    setCancellationHours(DEFAULT_MARKETPLACE_CONFIG.freeCancellationHours || 48);
  };

  // Marketplace financial calculations across all non-cancelled bookings
  const activeBookings = venueBookings.filter(
    (b) => b.status !== 'cancelled' && b.status !== 'declined'
  );
  const platformCurrency = activeBookings[0]?.currency || 'GBP';
  const totalGrossVolume = activeBookings.reduce((sum, b) => sum + b.grossAmount, 0);
  const totalPlatformCommission = Math.round((totalGrossVolume * (marketplaceConfig.commissionPercentage || 12)) / 100);
  const totalVenuePayouts = totalGrossVolume - totalPlatformCommission;

  const filteredBookings = venueBookings.filter((b) => {
    if (activeFilter === 'all') return true;
    return b.status === activeFilter;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 animate-in fade-in duration-200">
      {/* Top Banner: Platform Admin Overview */}
      <div className="bg-[#26343D] text-white rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 shadow-sm border border-[#26343D]">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#A86445] text-white">
              Platform Admin Control Center
            </span>
            <span className="text-xs text-stone-300">
              Global Marketplace Rules & Financial Governance
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            Marketplace Rules & Commercial Commission
          </h1>
          <p className="text-xs sm:text-sm text-stone-300 max-w-2xl leading-relaxed">
            Centralized authority to set platform commission rates, booking deposit percentages, payment windows, and cancellation policies. Changes apply immediately across all customer and venue views.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <button
            id="admin-switch-to-customer-btn"
            onClick={() => onSwitchRole('customer')}
            className="px-4 py-2.5 rounded-xl bg-white text-[#26343D] text-xs font-semibold hover:bg-[#F4F1EA] transition-all flex items-center justify-center gap-1.5 shadow-xs"
          >
            <span>Customer View</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            id="admin-switch-to-venue-btn"
            onClick={() => onSwitchRole('venue_owner')}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold border border-white/20 transition-all flex items-center justify-center gap-1.5"
          >
            <span>Venue Host Portal</span>
            <Building2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Platform Macro Performance Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-[#DDD8CF] rounded-2xl p-5 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#66737A]">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Gross Platform GMV</span>
            <DollarSign className="w-4 h-4 text-[#26343D]" />
          </div>
          <div className="text-2xl font-bold text-[#26343D]">
            {formatCurrency(totalGrossVolume, platformCurrency)}
          </div>
          <div className="text-[11px] text-[#66737A]">
            {activeBookings.length} active customer bookings
          </div>
        </div>

        <div className="bg-white border border-[#DDD8CF] rounded-2xl p-5 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#66737A]">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Platform Commission Retained</span>
            <span className="text-xs font-bold text-[#A86445] font-mono bg-[#F3E7DF] px-2 py-0.5 rounded border border-[#A86445]/20">
              {marketplaceConfig.commissionPercentage}%
            </span>
          </div>
          <div className="text-2xl font-bold text-[#A86445]">
            {formatCurrency(totalPlatformCommission, platformCurrency)}
          </div>
          <div className="text-[11px] text-[#66737A]">
            Platform net revenue from host fees
          </div>
        </div>

        <div className="bg-white border border-[#DDD8CF] rounded-2xl p-5 space-y-2 shadow-xs bg-emerald-50/30">
          <div className="flex items-center justify-between text-xs text-[#66737A]">
            <span className="font-semibold uppercase tracking-wider text-[11px] text-emerald-800">Venue Net Disbursed</span>
            <TrendingUp className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-bold text-emerald-800">
            {formatCurrency(totalVenuePayouts, platformCurrency)}
          </div>
          <div className="text-[11px] text-emerald-700/80">
            Disbursed post-event execution
          </div>
        </div>

        <div className="bg-white border border-[#DDD8CF] rounded-2xl p-5 space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[#66737A]">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Venues in Marketplace</span>
            <Building2 className="w-4 h-4 text-[#26343D]" />
          </div>
          <div className="text-2xl font-bold text-[#26343D]">
            {venues.length} Spaces
          </div>
          <div className="text-[11px] text-[#66737A]">
            Across {new Set(venues.map((v) => v.location.city)).size} major metropolitan markets
          </div>
        </div>
      </div>

      {/* Global Marketplace Configuration Form */}
      <div className="bg-white border border-[#DDD8CF] rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs">
        <div className="flex items-center justify-between border-b border-[#DDD8CF] pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-[#A86445]" />
              <h2 className="text-lg font-bold text-[#26343D]">
                Marketplace Business Rule Parameters
              </h2>
            </div>
            <p className="text-xs text-[#66737A]">
              Adjusting any value below immediately updates all customer pricing breakdowns, venue payout calculations, and checklist milestones across the platform.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Commission Rate */}
            <div className="p-5 rounded-xl bg-[#F4F1EA]/60 border border-[#DDD8CF] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-[#26343D] block">
                    Platform Commission Rate (%)
                  </label>
                  <span className="text-[11px] text-[#66737A]">
                    Deducted from venue gross payout upon booking
                  </span>
                </div>
                <span className="text-base font-bold text-[#A86445] font-mono bg-white px-3 py-1 rounded-lg border border-[#DDD8CF]">
                  {commissionRate}%
                </span>
              </div>
              <input
                id="admin-commission-rate-slider"
                type="range"
                min="5"
                max="30"
                step="1"
                value={commissionRate}
                onChange={(e) => setCommissionRate(Number(e.target.value))}
                className="w-full h-2 bg-[#DDD8CF] rounded-lg appearance-none cursor-pointer accent-[#A86445]"
              />
              <div className="flex justify-between text-[10px] text-[#66737A]">
                <span>5% (Partner Tier)</span>
                <span>12% (Standard Default)</span>
                <span>30% (Full Concierge)</span>
              </div>
            </div>

            {/* Deposit Rate */}
            <div className="p-5 rounded-xl bg-[#F4F1EA]/60 border border-[#DDD8CF] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-[#26343D] block">
                    Customer Booking Deposit (%)
                  </label>
                  <span className="text-[11px] text-[#66737A]">
                    Required from client upon venue acceptance
                  </span>
                </div>
                <span className="text-base font-bold text-[#26343D] font-mono bg-white px-3 py-1 rounded-lg border border-[#DDD8CF]">
                  {depositPercent}%
                </span>
              </div>
              <input
                id="admin-deposit-rate-slider"
                type="range"
                min="10"
                max="50"
                step="5"
                value={depositPercent}
                onChange={(e) => setDepositPercent(Number(e.target.value))}
                className="w-full h-2 bg-[#DDD8CF] rounded-lg appearance-none cursor-pointer accent-[#26343D]"
              />
              <div className="flex justify-between text-[10px] text-[#66737A]">
                <span>10% Low Deposit</span>
                <span>25% Standard Default</span>
                <span>50% Custom Reserve</span>
              </div>
            </div>

            {/* Balance Due Window */}
            <div className="p-5 rounded-xl bg-[#F4F1EA]/60 border border-[#DDD8CF] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-[#26343D] block">
                    Final Balance Due Window (Days)
                  </label>
                  <span className="text-[11px] text-[#66737A]">
                    Days before event date when remaining balance is due
                  </span>
                </div>
                <input
                  id="admin-balance-days-input"
                  type="number"
                  min="3"
                  max="60"
                  value={balanceDays}
                  onChange={(e) => setBalanceDays(Number(e.target.value))}
                  className="w-20 bg-white text-[#26343D] text-xs font-bold px-3 py-1.5 rounded-lg border border-[#DDD8CF] text-right font-mono"
                />
              </div>
              <p className="text-[11px] text-[#66737A]">
                Automatically generates final balance due dates on all customer bookings and planners.
              </p>
            </div>

            {/* Cancellation Window */}
            <div className="p-5 rounded-xl bg-[#F4F1EA]/60 border border-[#DDD8CF] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-bold text-[#26343D] block">
                    Free Cancellation Window (Hours)
                  </label>
                  <span className="text-[11px] text-[#66737A]">
                    Full refund eligibility window following venue approval
                  </span>
                </div>
                <input
                  id="admin-cancellation-hours-input"
                  type="number"
                  min="0"
                  max="120"
                  value={cancellationHours}
                  onChange={(e) => setCancellationHours(Number(e.target.value))}
                  className="w-20 bg-white text-[#26343D] text-xs font-bold px-3 py-1.5 rounded-lg border border-[#DDD8CF] text-right font-mono"
                />
              </div>
              <p className="text-[11px] text-[#66737A]">
                Displayed in venue terms and customer booking confirmations.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-[#DDD8CF]">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="text-xs text-[#66737A] hover:text-[#26343D] flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-[#F4F1EA] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Standard Defaults</span>
            </button>

            <button
              id="admin-save-rules-btn"
              type="submit"
              className="px-6 py-2.5 bg-[#26343D] text-white font-semibold text-xs rounded-xl hover:bg-[#1E2930] transition-all flex items-center gap-2 shadow-xs active:scale-95"
            >
              {isSaved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Marketplace Rules Updated!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-[#A86445]" />
                  <span>Save Marketplace Rules</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Platform-Wide Bookings Audit & Transition Manager */}
      <div className="bg-white border border-[#DDD8CF] rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#DDD8CF] pb-4">
          <div>
            <h2 className="text-lg font-bold text-[#26343D]">
              Platform Bookings Audit & State Lifecycle
            </h2>
            <p className="text-xs text-[#66737A]">
              Canonical booking statuses: requested → deposit_due → confirmed → final_payment_due → fully_paid → completed
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', 'requested', 'deposit_due', 'confirmed', 'final_payment_due', 'fully_paid', 'completed', 'declined', 'cancelled'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setActiveFilter(st)}
                className={`text-[11px] px-2.5 py-1 rounded-lg transition-all ${
                  activeFilter === st
                    ? 'bg-[#26343D] text-white font-bold'
                    : 'bg-[#F4F1EA] text-[#66737A] hover:text-[#26343D]'
                }`}
              >
                {st === 'all' ? 'All' : st}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#DDD8CF] text-[#66737A] bg-[#F4F1EA]/50">
                <th className="py-3 px-3 font-semibold">Booking ID</th>
                <th className="py-3 px-3 font-semibold">Space & Date</th>
                <th className="py-3 px-3 font-semibold">Client</th>
                <th className="py-3 px-3 font-semibold">Gross</th>
                <th className="py-3 px-3 font-semibold">Deposit</th>
                <th className="py-3 px-3 font-semibold">Status</th>
                <th className="py-3 px-3 font-semibold text-right">Transition Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#DDD8CF]">
              {filteredBookings.map((b) => {
                const statusInfo = getStatusDisplay(b.status);
                const allowedTransitions = ALLOWED_STATUS_TRANSITIONS[b.status] || [];

                return (
                  <tr key={b.id} className="hover:bg-[#F4F1EA]/30 transition-colors">
                    <td className="py-3.5 px-3 font-mono font-bold text-[#26343D]">
                      {b.bookingNumber}
                    </td>
                    <td className="py-3.5 px-3">
                      <strong className="text-[#26343D] block">{b.venueName}</strong>
                      <span className="text-[#66737A] text-[11px]">{formatDateDisplay(b.eventDate, 'readable')} ({b.guestCount} guests)</span>
                    </td>
                    <td className="py-3.5 px-3">
                      <span className="font-semibold text-[#26343D] block">{b.clientName}</span>
                      <span className="text-[#66737A] text-[11px]">{b.clientEmail}</span>
                    </td>
                    <td className="py-3.5 px-3 font-semibold text-[#26343D]">
                      {formatCurrency(b.grossAmount, b.currency || 'GBP')}
                    </td>
                    <td className="py-3.5 px-3 text-[#66737A]">
                      {formatCurrency(b.depositAmount, b.currency || 'GBP')} ({b.depositPercentage}%)
                    </td>
                    <td className="py-3.5 px-3">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded border inline-block ${statusInfo.badgeClass}`}>
                        {statusInfo.adminLabel}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {allowedTransitions.map((nextSt) => (
                          <button
                            key={nextSt}
                            onClick={() => onUpdateBookingStatus(b.id, nextSt)}
                            className="px-2 py-1 bg-white border border-[#DDD8CF] text-[10px] font-semibold text-[#26343D] hover:bg-[#26343D] hover:text-white rounded-lg transition-all shadow-2xs"
                            title={`Transition to ${nextSt}`}
                          >
                            → {nextSt}
                          </button>
                        ))}
                        {allowedTransitions.length === 0 && (
                          <span className="text-[11px] text-[#66737A] italic">Terminal state</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

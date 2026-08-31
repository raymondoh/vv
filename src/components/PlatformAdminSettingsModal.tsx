import React, { useState } from 'react';
import {
  Sliders,
  ShieldAlert,
  Save,
  RotateCcw,
  X,
  CheckCircle2,
  Percent,
  Calendar,
  DollarSign,
  Info,
} from 'lucide-react';
import { MarketplaceConfig } from '../types';
import { DEFAULT_MARKETPLACE_CONFIG } from '../config/marketplaceConfig';

interface PlatformAdminSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentConfig: MarketplaceConfig;
  onSaveConfig: (updated: MarketplaceConfig) => void;
}

export const PlatformAdminSettingsModal: React.FC<PlatformAdminSettingsModalProps> = ({
  isOpen,
  onClose,
  currentConfig,
  onSaveConfig,
}) => {
  const [commissionRate, setCommissionRate] = useState<number>(
    currentConfig.commissionPercentage || DEFAULT_MARKETPLACE_CONFIG.commissionPercentage
  );
  const [depositPercent, setDepositPercent] = useState<number>(
    currentConfig.depositPercentage || DEFAULT_MARKETPLACE_CONFIG.depositPercentage
  );
  const [balanceDays, setBalanceDays] = useState<number>(
    currentConfig.balanceDueDaysBeforeEvent || DEFAULT_MARKETPLACE_CONFIG.balanceDueDaysBeforeEvent || 14
  );
  const [cancellationHours, setCancellationHours] = useState<number>(
    currentConfig.freeCancellationHours || DEFAULT_MARKETPLACE_CONFIG.freeCancellationHours || 48
  );
  const [isSaved, setIsSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: MarketplaceConfig = {
      ...currentConfig,
      commissionPercentage: commissionRate,
      depositPercentage: depositPercent,
      balanceDueDaysBeforeEvent: balanceDays,
      freeCancellationHours: cancellationHours,
    };
    onSaveConfig(updated);
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
      onClose();
    }, 1200);
  };

  const handleResetDefaults = () => {
    setCommissionRate(DEFAULT_MARKETPLACE_CONFIG.commissionPercentage);
    setDepositPercent(DEFAULT_MARKETPLACE_CONFIG.depositPercentage);
    setBalanceDays(DEFAULT_MARKETPLACE_CONFIG.balanceDueDaysBeforeEvent || 14);
    setCancellationHours(DEFAULT_MARKETPLACE_CONFIG.freeCancellationHours || 48);
  };

  // Example formula simulation based on $8,000 standard booking
  const sampleGross = 8000;
  const sampleDeposit = Math.round((sampleGross * depositPercent) / 100);
  const sampleCommission = Math.round((sampleGross * commissionRate) / 100);
  const sampleVenueNet = sampleGross - sampleCommission;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl bg-white border border-[#DDD8CF] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-[#DDD8CF] flex items-center justify-between bg-[#F4F1EA]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#26343D] text-white flex items-center justify-center shadow-xs">
              <Sliders className="w-5 h-5 text-[#A86445]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-[#26343D] tracking-tight">
                  Platform Admin Commercial Rules
                </h2>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#A86445] text-white">
                  Internal Settings
                </span>
              </div>
              <p className="text-xs text-[#66737A]">
                Global business logic and marketplace commission configuration
              </p>
            </div>
          </div>
          <button
            id="close-admin-settings-modal-btn"
            onClick={onClose}
            className="p-2 text-[#66737A] hover:text-[#26343D] rounded-lg hover:bg-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Role Separation Notice */}
          <div className="p-3.5 rounded-xl bg-[#F4F1EA] border border-[#DDD8CF] flex items-start gap-3">
            <Info className="w-4 h-4 text-[#A86445] shrink-0 mt-0.5" />
            <div className="text-xs text-[#66737A] leading-relaxed">
              <strong className="text-[#26343D] block mb-0.5">Strict Role Separation Active</strong>
              Ordinary venue owners view their financial breakdown (Gross, Commission, and Net Payout) as fixed contract terms. Only platform operators can adjust these global marketplace rates. Customers never see platform fee calculations.
            </div>
          </div>

          {/* Setting 1: Commission Percentage */}
          <div className="bg-white border border-[#DDD8CF] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-[#26343D] block">
                  Platform Commission Rate (% of Gross Hire)
                </label>
                <span className="text-[11px] text-[#66737A]">
                  Deducted from venue payout upon confirmed booking
                </span>
              </div>
              <span className="text-base font-bold text-[#A86445] font-mono bg-[#F3E7DF] px-2.5 py-1 rounded-lg border border-[#A86445]/20">
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
              <span>5% (Partner Rate)</span>
              <span>12% (Standard Prototype Default)</span>
              <span>25% (High-Touch Concierge)</span>
            </div>
          </div>

          {/* Setting 2: Deposit Percentage */}
          <div className="bg-white border border-[#DDD8CF] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-[#26343D] block">
                  Customer Booking Deposit (% of Gross Hire)
                </label>
                <span className="text-[11px] text-[#66737A]">
                  Required from client to lock and confirm space
                </span>
              </div>
              <span className="text-base font-bold text-[#26343D] font-mono bg-[#F4F1EA] px-2.5 py-1 rounded-lg border border-[#DDD8CF]">
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
              <span>25% Standard (Demonstration Assumption)</span>
              <span>50% Custom Reserve</span>
            </div>
          </div>

          {/* Setting 3: Timelines */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-[#DDD8CF] rounded-xl p-4 space-y-2">
              <label className="text-xs font-bold text-[#26343D] block">
                Final Balance Due Window
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="3"
                  max="60"
                  value={balanceDays}
                  onChange={(e) => setBalanceDays(Number(e.target.value))}
                  className="w-20 bg-[#F4F1EA] text-[#26343D] text-xs font-bold px-3 py-2 rounded-lg border border-[#DDD8CF]"
                />
                <span className="text-xs text-[#66737A]">days prior to event</span>
              </div>
            </div>

            <div className="bg-white border border-[#DDD8CF] rounded-xl p-4 space-y-2">
              <label className="text-xs font-bold text-[#26343D] block">
                Free Cancellation Period
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="12"
                  max="120"
                  value={cancellationHours}
                  onChange={(e) => setCancellationHours(Number(e.target.value))}
                  className="w-20 bg-[#F4F1EA] text-[#26343D] text-xs font-bold px-3 py-2 rounded-lg border border-[#DDD8CF]"
                />
                <span className="text-xs text-[#66737A]">hours post-approval</span>
              </div>
            </div>
          </div>

          {/* Formula Live Preview */}
          <div className="bg-[#F4F1EA] border border-[#DDD8CF] rounded-xl p-4 space-y-2 text-xs">
            <span className="font-bold text-[#26343D] block">
              Live Commercial Formula Preview (Example: ${sampleGross.toLocaleString()} Event)
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div className="bg-white p-2 rounded-lg border border-[#DDD8CF]">
                <span className="text-[10px] text-[#66737A] block">Customer Pays</span>
                <strong className="text-[#26343D]">${sampleGross.toLocaleString()}</strong>
              </div>
              <div className="bg-white p-2 rounded-lg border border-[#DDD8CF]">
                <span className="text-[10px] text-[#66737A] block">Deposit ({depositPercent}%)</span>
                <strong className="text-[#26343D]">${sampleDeposit.toLocaleString()}</strong>
              </div>
              <div className="bg-white p-2 rounded-lg border border-[#DDD8CF]">
                <span className="text-[10px] text-[#A86445] block">Commission ({commissionRate}%)</span>
                <strong className="text-[#A86445]">-${sampleCommission.toLocaleString()}</strong>
              </div>
              <div className="bg-white p-2 rounded-lg border border-[#DDD8CF]">
                <span className="text-[10px] text-emerald-700 block">Venue Receives</span>
                <strong className="text-emerald-700">${sampleVenueNet.toLocaleString()}</strong>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center justify-between">
            <button
              type="button"
              onClick={handleResetDefaults}
              className="text-xs text-[#66737A] hover:text-[#26343D] flex items-center gap-1.5 px-3 py-2 rounded-lg hover:bg-[#F4F1EA] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Defaults</span>
            </button>

            <button
              id="admin-save-config-btn"
              type="submit"
              className="px-6 py-2.5 bg-[#26343D] text-white font-semibold text-xs rounded-xl hover:bg-[#1E2930] transition-all flex items-center gap-2 shadow-xs active:scale-95"
            >
              {isSaved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Settings Applied!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 text-[#A86445]" />
                  <span>Apply Platform Rules</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

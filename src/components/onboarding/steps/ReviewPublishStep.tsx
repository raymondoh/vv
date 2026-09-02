import React from 'react';
import { CheckCircle2, Building2, MapPin, Layers, Grid, Coins, Image as ImageIcon, Sparkles, AlertCircle, ArrowRight } from 'lucide-react';
import { Venue, BusinessOrganisation } from '../../../types';
import { calculateCompleteness, getQualityTierBadge } from '../../../utils/completeness';
import { formatCurrency, formatLocation } from '../../../utils/formatters';

interface ReviewPublishStepProps {
  organisation: Partial<BusinessOrganisation>;
  venue: Partial<Venue>;
  onJumpToStep: (stepNumber: number) => void;
  onSaveDraft: () => void;
  onPublish: () => void;
  isSaving: boolean;
}

export const ReviewPublishStep: React.FC<ReviewPublishStepProps> = ({
  organisation,
  venue,
  onJumpToStep,
  onSaveDraft,
  onPublish,
  isSaving,
}) => {
  const completeness = calculateCompleteness(venue as Venue);
  const tierBadge = getQualityTierBadge(completeness.tier);

  const isPublishValid = Boolean(
    organisation.name?.trim() &&
    organisation.contactName?.trim() &&
    organisation.email?.trim() &&
    venue.name?.trim() &&
    venue.location?.city?.trim() &&
    venue.pricing?.startingPrice &&
    venue.pricing.startingPrice > 0
  );
  const missingCrucial = !isPublishValid;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-[#26343D] flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5 text-emerald-700" />
          <span>Review & Ready to Publish</span>
        </h3>
        <p className="text-xs text-[#66737A] mt-1">
          Verify your business account, venue spaces, pricing, and visual media before publishing to the marketplace catalog.
        </p>
      </div>

      {/* Completeness Banner */}
      <div className="bg-[#F4F1EA] p-5 rounded-2xl border border-[#DDD8CF] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#26343D]">Listing Completeness:</span>
              <span className="text-sm font-extrabold text-[#A86445]">{completeness.score}%</span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${tierBadge.bg} ${tierBadge.color} ${tierBadge.border}`}>
                {tierBadge.label}
              </span>
            </div>
            <p className="text-xs text-[#66737A]">
              {completeness.score >= 80
                ? 'Excellent! Your venue has complete spaces, configurations, photos, and virtual viewing.'
                : 'Your venue meets all publication criteria. You can publish now or add more media anytime.'}
            </p>
          </div>

          <div className="w-full sm:w-48 bg-white h-3 rounded-full border border-[#DDD8CF] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#A86445] to-[#26343D] transition-all duration-500"
              style={{ width: `${completeness.score}%` }}
            />
          </div>
        </div>
      </div>

      {/* Structured Review Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Business Account */}
        <div className="bg-white p-4 rounded-xl border border-[#DDD8CF] space-y-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-[#A86445]" />
              <span>Business Account</span>
            </h4>
            <button
              type="button"
              onClick={() => onJumpToStep(1)}
              className="text-[11px] text-[#A86445] hover:underline font-semibold"
            >
              Edit
            </button>
          </div>
          <div className="text-xs space-y-1 text-[#26343D]">
            <p className="font-bold">{organisation.name || 'Unnamed Business'}</p>
            <p className="text-[#66737A]">Contact: {organisation.contactName || 'Not specified'}</p>
            <p className="text-[#66737A]">Email: {organisation.email || 'Not specified'}</p>
          </div>
        </div>

        {/* Venue & Location */}
        <div className="bg-white p-4 rounded-xl border border-[#DDD8CF] space-y-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#A86445]" />
              <span>Venue Identity & Address</span>
            </h4>
            <button
              type="button"
              onClick={() => onJumpToStep(2)}
              className="text-[11px] text-[#A86445] hover:underline font-semibold"
            >
              Edit
            </button>
          </div>
          <div className="text-xs space-y-1 text-[#26343D]">
            <p className="font-bold">{venue.name || 'Unnamed Venue'}</p>
            <p className="text-[#66737A]">
              {venue.location ? formatLocation(venue.location) : 'Address not specified'}
            </p>
            <p className="text-[#66737A]">Aesthetic: {venue.aesthetic || 'Contemporary'}</p>
          </div>
        </div>

        {/* Spaces & Layouts */}
        <div className="bg-white p-4 rounded-xl border border-[#DDD8CF] space-y-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[#A86445]" />
              <span>Spaces & Layouts ({venue.spaces?.length || 0} Spaces)</span>
            </h4>
            <button
              type="button"
              onClick={() => onJumpToStep(3)}
              className="text-[11px] text-[#A86445] hover:underline font-semibold"
            >
              Edit
            </button>
          </div>
          <div className="text-xs space-y-1.5">
            {venue.spaces && venue.spaces.length > 0 ? (
              venue.spaces.map((sp) => (
                <div key={sp.id} className="flex items-center justify-between border-b border-[#DDD8CF]/40 pb-1">
                  <span className="font-medium text-[#26343D]">{sp.name}</span>
                  <span className="text-[11px] text-[#66737A]">
                    Max {sp.maxCapacity || sp.standingCapacity || sp.seatedCapacity || sp.theatreCapacity || 0} · {sp.layouts?.length || 0} Setups
                  </span>
                </div>
              ))
            ) : (
              <p className="text-[#66737A]">No distinct spaces added.</p>
            )}
          </div>
        </div>

        {/* Pricing & Commercials */}
        <div className="bg-white p-4 rounded-xl border border-[#DDD8CF] space-y-2.5 shadow-xs">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-[#A86445]" />
              <span>Commercial Terms</span>
            </h4>
            <button
              type="button"
              onClick={() => onJumpToStep(5)}
              className="text-[11px] text-[#A86445] hover:underline font-semibold"
            >
              Edit
            </button>
          </div>
          <div className="text-xs space-y-1 text-[#26343D]">
            <p className="font-bold text-[#A86445]">
              Starting Rate: {venue.pricing?.startingPrice ? formatCurrency(venue.pricing.startingPrice, venue.pricing.currency) : '£0'}{' '}
              <span className="text-[#66737A] font-normal">{venue.pricing?.priceUnit || 'per day'}</span>
            </p>
            <p className="text-[#66737A]">
              Cleaning: {formatCurrency(venue.pricing?.cleaningFee || 0, venue.pricing?.currency)} · Deposit: {formatCurrency(venue.pricing?.securityDeposit || 0, venue.pricing?.currency)}
            </p>
            <p className="text-[#66737A]">Amenities configured: {venue.amenities?.length || 0}</p>
          </div>
        </div>
      </div>

      {missingCrucial && (
        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2.5 text-xs text-amber-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>Please complete required business details (name, contact, email), venue name, city, and a starting price greater than 0 before publishing.</span>
        </div>
      )}

      {/* Action Footer */}
      <div className="pt-4 border-t border-[#DDD8CF] flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          type="button"
          disabled={isSaving}
          onClick={onSaveDraft}
          className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-[#F4F1EA] text-[#26343D] border border-[#DDD8CF] rounded-xl text-xs font-bold transition-all shadow-xs"
        >
          {isSaving ? 'Saving Draft...' : 'Save as Draft (Unpublished)'}
        </button>

        <button
          type="button"
          disabled={isSaving || missingCrucial}
          onClick={onPublish}
          className={`w-full sm:w-auto px-6 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm ${
            missingCrucial
              ? 'bg-[#DDD8CF] text-[#66737A] cursor-not-allowed'
              : 'bg-[#A86445] hover:bg-[#8F5236] text-white'
          }`}
        >
          <span>{isSaving ? 'Publishing...' : 'Publish Venue to Marketplace'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

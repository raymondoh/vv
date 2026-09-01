import React from 'react';
import { Coins, Check, Sparkles, Wifi, Volume2, Truck, Accessibility, Wine, Utensils, ShieldCheck } from 'lucide-react';
import { VenuePricing, Amenity } from '../../../types';
import { getCurrencySymbol } from '../../../utils/formatters';

interface PricingAmenitiesStepProps {
  pricing: Partial<VenuePricing>;
  amenities: Amenity[];
  onPricingChange: (field: keyof VenuePricing, value: any) => void;
  onAmenitiesChange: (amenities: Amenity[]) => void;
}

const COMMON_AMENITY_OPTIONS: Amenity[] = [
  { name: 'L-Acoustics Concert Audio & Lighting', category: 'Audio/Visual', icon: 'Volume2' },
  { name: '1Gbps Synchronous Dedicated Fiber WiFi', category: 'Audio/Visual', icon: 'Wifi' },
  { name: 'Full Accessible Step-Free & Passenger Lifts', category: 'Access & Logistics', icon: 'Accessibility' },
  { name: 'Dedicated Ground-Level Freight Loading Dock', category: 'Access & Logistics', icon: 'Truck' },
  { name: 'BYO Alcohol Permitted (Certified Bartenders)', category: 'Policies', icon: 'Wine' },
  { name: 'Commercial Chef Prep Kitchen on Site', category: 'Access & Logistics', icon: 'Utensils' },
  { name: 'Private VIP Dressing Suites & Green Rooms', category: 'Hospitality', icon: 'Sparkles' },
  { name: '24/7 On-site Security & Door Attendants', category: 'Access & Logistics', icon: 'ShieldCheck' },
  { name: 'Heated Outdoor Garden / Terrace Zone', category: 'Hospitality', icon: 'Sparkles' },
];

export const PricingAmenitiesStep: React.FC<PricingAmenitiesStepProps> = ({
  pricing,
  amenities,
  onPricingChange,
  onAmenitiesChange,
}) => {
  const currentCurrency = pricing.currency || 'GBP';
  const symbol = getCurrencySymbol(currentCurrency);

  const toggleAmenity = (item: Amenity) => {
    const exists = amenities.some((a) => a.name === item.name);
    if (exists) {
      onAmenitiesChange(amenities.filter((a) => a.name !== item.name));
    } else {
      onAmenitiesChange([...amenities, item]);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold text-[#26343D] flex items-center gap-2">
          <Coins className="w-5 h-5 text-[#A86445]" />
          <span>Pricing & Key Amenities</span>
        </h3>
        <p className="text-xs text-[#66737A] mt-1">
          Set transparent hire rates in your native currency and highlight key infrastructure assets.
        </p>
      </div>

      {/* Pricing Grid */}
      <div className="bg-[#F4F1EA] p-5 rounded-2xl border border-[#DDD8CF] space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#26343D]">
            Hire Rates & Commercial Terms
          </h4>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold text-[#66737A]">Currency:</span>
            <select
              value={currentCurrency}
              onChange={(e) => {
                const curr = e.target.value;
                onPricingChange('currency', curr);
                onPricingChange('currencySymbol', getCurrencySymbol(curr));
              }}
              className="px-2.5 py-1 bg-white border border-[#DDD8CF] rounded-lg text-xs font-bold text-[#26343D]"
            >
              <option value="GBP">GBP (£) - British Pound</option>
              <option value="USD">USD ($) - US Dollar</option>
              <option value="EUR">EUR (€) - Euro</option>
              <option value="CAD">CAD ($) - Canadian Dollar</option>
              <option value="AUD">AUD ($) - Australian Dollar</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#26343D]">Starting Base Hire Price *</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#66737A]">
                {symbol}
              </span>
              <input
                type="number"
                min="0"
                value={pricing.startingPrice || 0}
                onChange={(e) => onPricingChange('startingPrice', parseInt(e.target.value, 10) || 0)}
                placeholder="4500"
                className="w-full pl-8 pr-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs font-bold text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#26343D]">Pricing Basis / Unit *</label>
            <select
              value={pricing.priceUnit || 'per day'}
              onChange={(e) => onPricingChange('priceUnit', e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
            >
              <option value="per day">per day</option>
              <option value="per hour">per hour</option>
              <option value="per session">per session</option>
              <option value="per evening">per evening</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#66737A]">Hourly Overtime / Extra Rate</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#66737A]">
                {symbol}
              </span>
              <input
                type="number"
                min="0"
                value={pricing.hourlyRate || 0}
                onChange={(e) => onPricingChange('hourlyRate', parseInt(e.target.value, 10) || 0)}
                placeholder="600"
                className="w-full pl-8 pr-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#66737A]">Minimum Event Spend (Optional)</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#66737A]">
                {symbol}
              </span>
              <input
                type="number"
                min="0"
                value={pricing.minimumSpend || 0}
                onChange={(e) => onPricingChange('minimumSpend', parseInt(e.target.value, 10) || 0)}
                placeholder="3000"
                className="w-full pl-8 pr-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#26343D]">Standard Cleaning Fee</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#66737A]">
                {symbol}
              </span>
              <input
                type="number"
                min="0"
                value={pricing.cleaningFee || 0}
                onChange={(e) => onPricingChange('cleaningFee', parseInt(e.target.value, 10) || 0)}
                placeholder="400"
                className="w-full pl-8 pr-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-semibold text-[#26343D]">Refundable Security Deposit</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-[#66737A]">
                {symbol}
              </span>
              <input
                type="number"
                min="0"
                value={pricing.securityDeposit || 0}
                onChange={(e) => onPricingChange('securityDeposit', parseInt(e.target.value, 10) || 0)}
                placeholder="1500"
                className="w-full pl-8 pr-3 py-2 bg-white border border-[#DDD8CF] rounded-xl text-xs text-[#26343D] focus:outline-hidden focus:border-[#A86445]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Key Amenities Checklist */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[#26343D]">
          Key Amenities & Infrastructure Features
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
          {COMMON_AMENITY_OPTIONS.map((item) => {
            const isSelected = amenities.some((a) => a.name === item.name);
            return (
              <button
                key={item.name}
                type="button"
                onClick={() => toggleAmenity(item)}
                className={`p-3 rounded-xl text-xs text-left transition-all border flex items-start justify-between gap-2 ${
                  isSelected
                    ? 'bg-white border-[#A86445] ring-2 ring-[#A86445]/20 shadow-xs'
                    : 'bg-[#F4F1EA] hover:bg-white border-[#DDD8CF] text-[#26343D]'
                }`}
              >
                <div className="space-y-0.5">
                  <span className="font-semibold block text-[#26343D]">{item.name}</span>
                  <span className="text-[10px] text-[#66737A] uppercase tracking-wider">{item.category}</span>
                </div>
                <div
                  className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 mt-0.5 ${
                    isSelected ? 'bg-[#A86445] border-[#A86445] text-white' : 'border-[#DDD8CF] bg-white'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

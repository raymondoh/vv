import React from 'react';
import { Search, MapPin, Users, DollarSign, Filter, Sparkles, X, SlidersHorizontal, Check } from 'lucide-react';
import { EventType, FilterState } from '../types';

interface HeroSectionProps {
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onResetFilters: () => void;
  onQuickAiPrompt: (promptText: string) => void;
  totalVenuesCount: number;
}

const CITIES = [
  { label: 'All Cities', value: 'all' },
  { label: 'Chicago, IL', value: 'chicago' },
  { label: 'Napa Valley, CA', value: 'napa' },
  { label: 'New York, NY', value: 'new york' },
  { label: 'Austin, TX', value: 'austin' },
  { label: 'Seattle, WA', value: 'seattle' },
  { label: 'Miami, FL', value: 'miami' },
  { label: 'Aspen, CO', value: 'aspen' },
  { label: 'San Francisco, CA', value: 'san francisco' },
];

const EVENT_TYPE_TABS: { label: string; value: EventType; icon: string }[] = [
  { label: 'All Venues', value: 'all', icon: '✨' },
  { label: 'Weddings', value: 'wedding', icon: '💍' },
  { label: 'Corporate & Summits', value: 'corporate', icon: '💼' },
  { label: 'Galas & Parties', value: 'party', icon: '🍸' },
];

const QUICK_INSPIRATION = [
  { label: '🌿 Industrial Glasshouse in Chicago', prompt: 'I need an industrial chic glasshouse venue for 150 guests in Chicago under $6,000' },
  { label: '🍷 Napa Vineyard Estate Wedding', prompt: 'Luxury outdoor wedding ceremony and barrel room banquet for 200 in Napa Valley' },
  { label: '🏙️ Manhattan Skyline Rooftop Gala', prompt: 'Modern skyline penthouse for 200 corporate guests in New York with late curfew' },
  { label: '🌊 Waterfront Miami Villa', prompt: 'Mediterranean waterfront villa with yacht dock for 200 guests in Miami' },
];

export const HeroSection: React.FC<HeroSectionProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  onQuickAiPrompt,
  totalVenuesCount,
}) => {
  const [showAdvancedFilters, setShowAdvancedFilters] = React.useState(false);

  const hasActiveFilters =
    filters.eventType !== 'all' ||
    filters.location !== 'all' ||
    filters.minCapacity > 0 ||
    filters.maxBudget < 10000 ||
    filters.searchQuery.trim() !== '';

  return (
    <section className="relative pt-8 pb-12 overflow-hidden">
      {/* Background ambient luxury glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[450px] bg-gradient-to-b from-[#d4af37]/10 via-[#99731e]/5 to-transparent blur-3xl pointer-events-none rounded-full" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Main Hero Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#181c24] border border-[#2b313d] text-xs font-medium text-[#d4af37]">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Virtual Walkthroughs & Layout Switchers</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white font-serif-luxury leading-[1.15]">
            Tour Luxury Event Venues <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-[#fae29c] via-[#e5c064] to-[#b38622] bg-clip-text text-transparent">
              In High-Definition Video
            </span>
          </h1>

          <p className="text-sm sm:text-base text-gray-300 max-w-2xl mx-auto leading-relaxed">
            Experience banquet, cocktail, and theater configurations before booking an in-person visit. Schedule live video walkthroughs directly with venue directors.
          </p>
        </div>

        {/* Event Type Filter Tabs */}
        <div className="flex items-center justify-center gap-2 flex-wrap mb-6">
          {EVENT_TYPE_TABS.map((tab) => {
            const isActive = filters.eventType === tab.value;
            return (
              <button
                key={tab.value}
                id={`filter-tab-${tab.value}`}
                onClick={() => onFilterChange({ eventType: tab.value })}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-[#d4af37] to-[#b38622] text-black font-semibold shadow-lg shadow-[#d4af37]/20 scale-105'
                    : 'bg-[#161a22] text-gray-300 border border-[#242a35] hover:border-[#3d4657] hover:text-white'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Primary Search & Filter Bar */}
        <div className="bg-[#13171f] border border-[#262c3a] rounded-2xl p-3 sm:p-4 shadow-2xl shadow-black/60 max-w-4xl mx-auto backdrop-blur-xl">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            {/* Search Input */}
            <div className="sm:col-span-4 relative">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 px-1">
                Venue Name or Keyword
              </label>
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
                <input
                  id="search-input"
                  type="text"
                  placeholder="e.g. Glasshouse, Rooftop, Vault..."
                  value={filters.searchQuery}
                  onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
                  className="w-full bg-[#1a1f2c] text-white text-xs sm:text-sm pl-9 pr-3 py-2.5 rounded-xl border border-[#2b3342] focus:outline-none focus:border-[#d4af37] placeholder:text-gray-500"
                />
                {filters.searchQuery && (
                  <button
                    onClick={() => onFilterChange({ searchQuery: '' })}
                    className="absolute right-2.5 text-gray-400 hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* City / Location Dropdown */}
            <div className="sm:col-span-3">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 px-1">
                City / Region
              </label>
              <div className="relative flex items-center">
                <MapPin className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
                <select
                  id="location-select"
                  value={filters.location}
                  onChange={(e) => onFilterChange({ location: e.target.value })}
                  className="w-full bg-[#1a1f2c] text-white text-xs sm:text-sm pl-9 pr-8 py-2.5 rounded-xl border border-[#2b3342] focus:outline-none focus:border-[#d4af37] appearance-none cursor-pointer"
                >
                  {CITIES.map((c) => (
                    <option key={c.value} value={c.value} className="bg-[#161a22] text-white">
                      {c.label}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 pointer-events-none text-gray-400 text-xs">▼</div>
              </div>
            </div>

            {/* Guest Capacity */}
            <div className="sm:col-span-3">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 px-1 flex justify-between">
                <span>Guest Count</span>
                <span className="text-[#d4af37] font-bold">
                  {filters.minCapacity === 0 ? 'Any Size' : `${filters.minCapacity}+ guests`}
                </span>
              </label>
              <div className="relative flex items-center">
                <Users className="w-4 h-4 text-gray-400 absolute left-3 pointer-events-none" />
                <select
                  id="capacity-select"
                  value={filters.minCapacity}
                  onChange={(e) => onFilterChange({ minCapacity: Number(e.target.value) })}
                  className="w-full bg-[#1a1f2c] text-white text-xs sm:text-sm pl-9 pr-8 py-2.5 rounded-xl border border-[#2b3342] focus:outline-none focus:border-[#d4af37] appearance-none cursor-pointer"
                >
                  <option value={0} className="bg-[#161a22]">Any Capacity</option>
                  <option value={50} className="bg-[#161a22]">50+ Guests</option>
                  <option value={100} className="bg-[#161a22]">100+ Guests</option>
                  <option value={150} className="bg-[#161a22]">150+ Guests</option>
                  <option value={200} className="bg-[#161a22]">200+ Guests</option>
                  <option value={300} className="bg-[#161a22]">300+ Guests</option>
                </select>
                <div className="absolute right-3 pointer-events-none text-gray-400 text-xs">▼</div>
              </div>
            </div>

            {/* Filter Toggle & Clear */}
            <div className="sm:col-span-2 flex items-center gap-2 pt-4 sm:pt-4">
              <button
                id="toggle-advanced-filters-btn"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
                  showAdvancedFilters
                    ? 'bg-[#d4af37]/20 border border-[#d4af37] text-[#fae29c]'
                    : 'bg-[#1a1f2c] border border-[#2b3342] text-gray-300 hover:text-white hover:border-gray-500'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Filters</span>
              </button>

              {hasActiveFilters && (
                <button
                  id="reset-filters-btn"
                  onClick={onResetFilters}
                  title="Reset all filters"
                  className="p-2.5 rounded-xl bg-[#232a38] text-gray-300 hover:text-rose-300 hover:bg-rose-950/40 border border-transparent hover:border-rose-900 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Advanced Filter Drawer Section */}
          {showAdvancedFilters && (
            <div className="mt-4 pt-4 border-t border-[#262c3a] grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-200">
              {/* Budget Range Slider */}
              <div className="bg-[#181d28] p-3 rounded-xl border border-[#2b3342]">
                <div className="flex items-center justify-between text-xs font-medium text-gray-300 mb-2">
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-[#d4af37]" />
                    Max Starting Rate
                  </span>
                  <span className="text-[#fae29c] font-bold">
                    {filters.maxBudget >= 10000 ? 'No Limit ($10k+)' : `$${filters.maxBudget.toLocaleString()}`}
                  </span>
                </div>
                <input
                  id="budget-range-slider"
                  type="range"
                  min="3000"
                  max="10000"
                  step="500"
                  value={filters.maxBudget}
                  onChange={(e) => onFilterChange({ maxBudget: Number(e.target.value) })}
                  className="w-full h-1.5 bg-[#262c3a] rounded-lg appearance-none cursor-pointer accent-[#d4af37]"
                />
                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                  <span>$3,000</span>
                  <span>$6,500</span>
                  <span>$10,000+</span>
                </div>
              </div>

              {/* Sort By Dropdown */}
              <div className="bg-[#181d28] p-3 rounded-xl border border-[#2b3342]">
                <label className="block text-xs font-medium text-gray-300 mb-2">
                  Sort Venues By
                </label>
                <select
                  id="sort-by-select"
                  value={filters.sortBy}
                  onChange={(e) => onFilterChange({ sortBy: e.target.value as FilterState['sortBy'] })}
                  className="w-full bg-[#13171f] text-white text-xs px-3 py-2 rounded-lg border border-[#2b3342] focus:outline-none focus:border-[#d4af37]"
                >
                  <option value="recommended">Featured & Recommended</option>
                  <option value="rating-desc">Highest Rated (5.0 ★)</option>
                  <option value="capacity-desc">Highest Guest Capacity</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Quick Inspiration Prompts */}
        <div className="mt-5 flex items-center justify-center gap-2 flex-wrap text-xs text-gray-400">
          <span className="font-semibold text-gray-300 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
            Try searching:
          </span>
          {QUICK_INSPIRATION.map((item, idx) => (
            <button
              key={idx}
              onClick={() => onQuickAiPrompt(item.prompt)}
              className="px-2.5 py-1 rounded-full bg-[#181c25] border border-[#272f3d] text-gray-300 hover:text-[#fae29c] hover:border-[#d4af37]/50 transition-colors text-[11px]"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

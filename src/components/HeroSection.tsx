import React from 'react';
import { Search, MapPin, Users, DollarSign, X, SlidersHorizontal, Video, Layers, Compass, CalendarCheck } from 'lucide-react';
import { EventType, FilterState } from '../types';

interface HeroSectionProps {
  filters: FilterState;
  onFilterChange: (newFilters: Partial<FilterState>) => void;
  onResetFilters: () => void;
  onQuickAiPrompt: (promptText: string) => void;
  totalVenuesCount: number;
}

const CITIES = [
  { label: 'All Locations', value: 'all' },
  { label: 'Chicago, IL', value: 'chicago' },
  { label: 'Napa Valley, CA', value: 'napa' },
  { label: 'New York, NY', value: 'new york' },
  { label: 'Austin, TX', value: 'austin' },
  { label: 'Seattle, WA', value: 'seattle' },
  { label: 'Miami, FL', value: 'miami' },
  { label: 'Aspen, CO', value: 'aspen' },
  { label: 'San Francisco, CA', value: 'san francisco' },
];

const EVENT_TYPE_TABS: { label: string; value: EventType }[] = [
  { label: 'All Spaces', value: 'all' },
  { label: 'Meetings & Conferences', value: 'meetings-conferences' },
  { label: 'Weddings', value: 'weddings' },
  { label: 'Parties & Celebrations', value: 'parties-celebrations' },
  { label: 'Training & Workshops', value: 'training-workshops' },
  { label: 'Private Dining', value: 'private-dining' },
  { label: 'Exhibitions & Events', value: 'exhibitions-events' },
];

const QUICK_INSPIRATION = [
  { label: 'Executive Board Summit (NYC)', prompt: 'Modern skyline venue for an executive summit of 40 guests in New York with terrace access' },
  { label: 'Daylight Workshop (Chicago)', prompt: 'High-ceiling glasshouse with daylight and breakout seating for 120 people in Chicago' },
  { label: 'Private Wine Dinner (Napa)', prompt: 'Intimate private dining and barrel cellar setting for 60 guests in Napa Valley' },
  { label: 'Tech Conference Hall (SF)', prompt: 'Auditorium with 300+ theater capacity, stage projection, and high-density fiber in San Francisco' },
  { label: 'Product Exhibition (Seattle)', prompt: 'Historic industrial space with ground loading dock and 3-phase power in Seattle' },
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
    <section className="relative pt-10 pb-10 overflow-hidden border-b border-[#DDD8CF]/70">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Main Hero Header */}
        <div className="text-center max-w-4xl mx-auto space-y-4 mb-9">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-[#DDD8CF] text-xs font-semibold text-[#26343D] shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#A86445]" />
            <span className="text-[#66737A]">Virtual Venue Discovery & Spatial Inspection</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-[3.25rem] font-bold tracking-tight text-[#26343D] leading-[1.12]">
            Discover venues. Explore the space remotely. <br className="hidden sm:inline" />
            <span className="text-[#A86445]">
              Decide what is worth visiting in person.
            </span>
          </h1>

          <p className="text-sm sm:text-base text-[#66737A] max-w-2xl mx-auto leading-relaxed">
            High-definition recorded walkthroughs, interactive floor plans, and layout simulations for conferences, meetings, weddings, workshops, private dining, and events.
          </p>

          {/* Core Platform Capabilities Strip */}
          <div className="pt-3 grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-3xl mx-auto text-left">
            <div className="p-3 bg-white rounded-xl border border-[#DDD8CF] shadow-xs flex items-start gap-2.5">
              <Video className="w-4 h-4 text-[#A86445] shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-[#26343D] block">4K Walkthroughs</span>
                <span className="text-[11px] text-[#66737A] leading-tight block">Continuous spatial video tours</span>
              </div>
            </div>
            <div className="p-3 bg-white rounded-xl border border-[#DDD8CF] shadow-xs flex items-start gap-2.5">
              <Layers className="w-4 h-4 text-[#A86445] shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-[#26343D] block">Layout Switcher</span>
                <span className="text-[11px] text-[#66737A] leading-tight block">Banquet, Theater & Cocktail</span>
              </div>
            </div>
            <div className="p-3 bg-white rounded-xl border border-[#DDD8CF] shadow-xs flex items-start gap-2.5">
              <Compass className="w-4 h-4 text-[#A86445] shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-[#26343D] block">Architectural Specs</span>
                <span className="text-[11px] text-[#66737A] leading-tight block">Exact sq ft, ceilings & power</span>
              </div>
            </div>
            <div className="p-3 bg-white rounded-xl border border-[#DDD8CF] shadow-xs flex items-start gap-2.5">
              <CalendarCheck className="w-4 h-4 text-[#A86445] shrink-0 mt-0.5" />
              <div>
                <span className="text-xs font-bold text-[#26343D] block">Live Remote Tours</span>
                <span className="text-[11px] text-[#66737A] leading-tight block">Guided host inspections</span>
              </div>
            </div>
          </div>
        </div>

        {/* Event Category Filter Tabs */}
        <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap mb-6 max-w-5xl mx-auto">
          {EVENT_TYPE_TABS.map((tab) => {
            const isActive = filters.eventType === tab.value;
            return (
              <button
                key={tab.value}
                id={`filter-tab-${tab.value}`}
                onClick={() => onFilterChange({ eventType: tab.value })}
                className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-all ${
                  isActive
                    ? 'bg-[#26343D] text-white font-semibold shadow-sm'
                    : 'bg-white text-[#66737A] border border-[#DDD8CF] hover:border-[#26343D] hover:text-[#26343D] shadow-xs'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Primary Search & Filter Bar */}
        <div className="bg-white border border-[#DDD8CF] rounded-2xl p-3 sm:p-4 shadow-sm max-w-4xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
            {/* Search Input */}
            <div className="sm:col-span-4 relative">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#66737A] mb-1 px-1">
                Venue Name or Keyword
              </label>
              <div className="relative flex items-center">
                <Search className="w-4 h-4 text-[#66737A] absolute left-3 pointer-events-none" />
                <input
                  id="search-input"
                  type="text"
                  placeholder="e.g. Glasshouse, Boardroom, Vault..."
                  value={filters.searchQuery}
                  onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
                  className="w-full bg-[#F4F1EA] text-[#26343D] text-xs sm:text-sm pl-9 pr-3 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#A86445] placeholder:text-[#66737A]/70 transition-colors"
                />
                {filters.searchQuery && (
                  <button
                    onClick={() => onFilterChange({ searchQuery: '' })}
                    className="absolute right-2.5 text-[#66737A] hover:text-[#26343D]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* City / Location Dropdown */}
            <div className="sm:col-span-3">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#66737A] mb-1 px-1">
                City / Region
              </label>
              <div className="relative flex items-center">
                <MapPin className="w-4 h-4 text-[#66737A] absolute left-3 pointer-events-none" />
                <select
                  id="location-select"
                  value={filters.location}
                  onChange={(e) => onFilterChange({ location: e.target.value })}
                  className="w-full bg-[#F4F1EA] text-[#26343D] text-xs sm:text-sm pl-9 pr-8 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#A86445] appearance-none cursor-pointer transition-colors"
                >
                  {CITIES.map((c) => (
                    <option key={c.value} value={c.value} className="bg-white text-[#26343D]">
                      {c.label}
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 pointer-events-none text-[#66737A] text-xs">▼</div>
              </div>
            </div>

            {/* Guest Capacity */}
            <div className="sm:col-span-3">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#66737A] mb-1 px-1 flex justify-between">
                <span>Guest Count</span>
                <span className="text-[#A86445] font-bold">
                  {filters.minCapacity === 0 ? 'Any Size' : `${filters.minCapacity}+ guests`}
                </span>
              </label>
              <div className="relative flex items-center">
                <Users className="w-4 h-4 text-[#66737A] absolute left-3 pointer-events-none" />
                <select
                  id="capacity-select"
                  value={filters.minCapacity}
                  onChange={(e) => onFilterChange({ minCapacity: Number(e.target.value) })}
                  className="w-full bg-[#F4F1EA] text-[#26343D] text-xs sm:text-sm pl-9 pr-8 py-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#A86445] appearance-none cursor-pointer transition-colors"
                >
                  <option value={0} className="bg-white text-[#26343D]">Any Capacity</option>
                  <option value={30} className="bg-white text-[#26343D]">30+ Guests</option>
                  <option value={50} className="bg-white text-[#26343D]">50+ Guests</option>
                  <option value={100} className="bg-white text-[#26343D]">100+ Guests</option>
                  <option value={150} className="bg-white text-[#26343D]">150+ Guests</option>
                  <option value={200} className="bg-white text-[#26343D]">200+ Guests</option>
                  <option value={300} className="bg-white text-[#26343D]">300+ Guests</option>
                </select>
                <div className="absolute right-3 pointer-events-none text-[#66737A] text-xs">▼</div>
              </div>
            </div>

            {/* Filter Toggle & Clear */}
            <div className="sm:col-span-2 flex items-center gap-2 pt-4 sm:pt-4">
              <button
                id="toggle-advanced-filters-btn"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                className={`w-full flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
                  showAdvancedFilters
                    ? 'bg-[#F3E7DF] border border-[#A86445] text-[#A86445]'
                    : 'bg-[#F4F1EA] border border-[#DDD8CF] text-[#66737A] hover:text-[#26343D] hover:border-[#A86445]/60 shadow-xs'
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
                  className="p-2.5 rounded-xl bg-stone-100 text-stone-600 hover:text-rose-600 hover:bg-rose-50 border border-[#DDD8CF] hover:border-rose-200 transition-colors shadow-xs"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Advanced Filter Drawer Section */}
          {showAdvancedFilters && (
            <div className="mt-4 pt-4 border-t border-[#DDD8CF] grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-200">
              {/* Budget Range Slider */}
              <div className="bg-[#F4F1EA] p-3.5 rounded-xl border border-[#DDD8CF]">
                <div className="flex items-center justify-between text-xs font-medium text-[#66737A] mb-2">
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5 text-[#A86445]" />
                    Max Starting Rate
                  </span>
                  <span className="text-[#A86445] font-bold">
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
                  className="w-full h-1.5 bg-[#DDD8CF] rounded-lg appearance-none cursor-pointer accent-[#A86445]"
                />
                <div className="flex justify-between text-[10px] text-[#66737A] mt-1">
                  <span>$3,000</span>
                  <span>$6,500</span>
                  <span>$10,000+</span>
                </div>
              </div>

              {/* Sort By Dropdown */}
              <div className="bg-[#F4F1EA] p-3.5 rounded-xl border border-[#DDD8CF]">
                <label className="block text-xs font-medium text-[#66737A] mb-2">
                  Sort Venues By
                </label>
                <select
                  id="sort-by-select"
                  value={filters.sortBy}
                  onChange={(e) => onFilterChange({ sortBy: e.target.value as FilterState['sortBy'] })}
                  className="w-full bg-white text-[#26343D] text-xs px-3 py-2 rounded-lg border border-[#DDD8CF] focus:outline-none focus:border-[#A86445]"
                >
                  <option value="recommended">Featured Spaces</option>
                  <option value="rating-desc">Highest Rated</option>
                  <option value="capacity-desc">Highest Guest Capacity</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Search Shortcuts */}
        <div className="mt-4 flex items-center justify-center gap-1.5 flex-wrap text-xs text-[#66737A]">
          <span className="font-semibold text-[#26343D] text-[11px]">
            Quick Searches:
          </span>
          {QUICK_INSPIRATION.map((item, idx) => (
            <button
              key={idx}
              onClick={() => onQuickAiPrompt(item.prompt)}
              className="px-2.5 py-1 rounded-lg bg-white border border-[#DDD8CF] text-[#66737A] hover:text-[#26343D] hover:border-[#26343D] hover:bg-[#F4F1EA] shadow-xs transition-all text-[11px]"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
};

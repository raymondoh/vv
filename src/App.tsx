/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { VenueCard } from './components/VenueCard';
import { VenueDetailView } from './components/VenueDetailView';
import { AiVenueMatcher } from './components/AiVenueMatcher';
import { BookWalkthroughModal } from './components/BookWalkthroughModal';
import { BookedToursDrawer } from './components/BookedToursDrawer';
import { LiveMeetingSimulatorModal } from './components/LiveMeetingSimulatorModal';
import { Venue, FilterState, WalkthroughBooking } from './types';
import { VENUES } from './data/venues';
import { Sparkles, Building2, Video, Calendar, ShieldCheck, Heart, Filter, ArrowRight } from 'lucide-react';

export default function App() {
  const [venues, setVenues] = useState<Venue[]>(VENUES);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [isAiMatcherOpen, setIsAiMatcherOpen] = useState(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState('');
  const [aiMatchedVenueIds, setAiMatchedVenueIds] = useState<string[]>([]);
  const [bookingVenue, setBookingVenue] = useState<Venue | null>(null);
  const [isBookingsDrawerOpen, setIsBookingsDrawerOpen] = useState(false);
  const [activeLiveSimulatorBooking, setActiveLiveSimulatorBooking] = useState<WalkthroughBooking | null>(null);

  // Favorites state with localStorage
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('venuestream_favorites');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Bookings list state with localStorage / server sync
  const [bookings, setBookings] = useState<WalkthroughBooking[]>([]);

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    eventType: 'all',
    location: 'all',
    minCapacity: 0,
    maxBudget: 10000,
    searchQuery: '',
    selectedLayout: 'all',
    sortBy: 'recommended',
  });

  const [activeTab, setActiveTab] = useState<'all' | 'favorites'>('all');

  // Fetch initial venues and bookings from backend API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [venuesRes, bookingsRes] = await Promise.all([
          fetch('/api/venues'),
          fetch('/api/walkthroughs'),
        ]);

        if (venuesRes.ok) {
          const venuesData = await venuesRes.json();
          if (venuesData.venues && venuesData.venues.length > 0) {
            setVenues(venuesData.venues);
          }
        }

        if (bookingsRes.ok) {
          const bookingsData = await bookingsRes.json();
          if (bookingsData.bookings) {
            setBookings(bookingsData.bookings);
          }
        }
      } catch (err) {
        console.error('Failed to fetch from API, using client fallback:', err);
      }
    };

    fetchData();
  }, []);

  // Save favorites to localStorage
  const handleToggleFavorite = (venueId: string) => {
    setFavorites((prev) => {
      const next = prev.includes(venueId)
        ? prev.filter((id) => id !== venueId)
        : [...prev, venueId];
      try {
        localStorage.setItem('venuestream_favorites', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  // Filter and sort venues
  const filteredVenues = useMemo(() => {
    let list = [...venues];

    if (activeTab === 'favorites') {
      list = list.filter((v) => favorites.includes(v.id));
    }

    if (filters.eventType !== 'all') {
      list = list.filter((v) =>
        v.eventTypes.includes(filters.eventType as any)
      );
    }

    if (filters.location !== 'all') {
      const loc = filters.location.toLowerCase();
      list = list.filter(
        (v) =>
          v.location.city.toLowerCase().includes(loc) ||
          v.location.state.toLowerCase().includes(loc)
      );
    }

    if (filters.minCapacity > 0) {
      list = list.filter(
        (v) =>
          v.capacity.cocktail >= filters.minCapacity ||
          v.capacity.seatedBanquet >= filters.minCapacity
      );
    }

    if (filters.maxBudget < 10000) {
      list = list.filter((v) => v.pricing.startingPrice <= filters.maxBudget);
    }

    if (filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase();
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q) ||
          v.location.city.toLowerCase().includes(q) ||
          v.aesthetic.toLowerCase().includes(q)
      );
    }

    // Sorting
    if (filters.sortBy === 'price-asc') {
      list.sort((a, b) => a.pricing.startingPrice - b.pricing.startingPrice);
    } else if (filters.sortBy === 'price-desc') {
      list.sort((a, b) => b.pricing.startingPrice - a.pricing.startingPrice);
    } else if (filters.sortBy === 'capacity-desc') {
      list.sort((a, b) => b.capacity.seatedBanquet - a.capacity.seatedBanquet);
    } else if (filters.sortBy === 'rating-desc') {
      list.sort((a, b) => b.rating - a.rating);
    }

    return list;
  }, [venues, filters, activeTab, favorites]);

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  const handleResetFilters = () => {
    setFilters({
      eventType: 'all',
      location: 'all',
      minCapacity: 0,
      maxBudget: 10000,
      searchQuery: '',
      selectedLayout: 'all',
      sortBy: 'recommended',
    });
    setAiMatchedVenueIds([]);
  };

  const handleQuickAiPrompt = (promptText: string) => {
    setAiInitialPrompt(promptText);
    setIsAiMatcherOpen(true);
  };

  const handleBookingConfirmed = (newBooking: WalkthroughBooking) => {
    setBookings((prev) => [newBooking, ...prev]);
  };

  return (
    <div className="min-h-screen bg-[#0d0f12] text-gray-100 flex flex-col font-sans selection:bg-[#d4af37] selection:text-black">
      {/* Top Navigation */}
      <Navbar
        onOpenAiMatcher={() => {
          setAiInitialPrompt('');
          setIsAiMatcherOpen(true);
        }}
        onOpenBookings={() => setIsBookingsDrawerOpen(true)}
        onBackToHome={() => setSelectedVenue(null)}
        bookings={bookings}
        activeView={selectedVenue ? 'detail' : 'landing'}
      />

      {/* Main View Router */}
      <main className="flex-1">
        {selectedVenue ? (
          /* Dedicated Venue Detail & Video Page */
          <VenueDetailView
            venue={selectedVenue}
            onBack={() => setSelectedVenue(null)}
            onBookWalkthrough={(venue) => setBookingVenue(venue)}
            isFavorited={favorites.includes(selectedVenue.id)}
            onToggleFavorite={handleToggleFavorite}
          />
        ) : (
          /* Landing & Search Page */
          <div className="space-y-10">
            {/* Hero Banner with Search & Filter Bar */}
            <HeroSection
              filters={filters}
              onFilterChange={handleFilterChange}
              onResetFilters={handleResetFilters}
              onQuickAiPrompt={handleQuickAiPrompt}
              totalVenuesCount={filteredVenues.length}
            />

            {/* Venues Grid Directory Section */}
            <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 space-y-6">
              {/* Directory Subheader */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#232836] pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab('all')}
                      className={`text-sm font-bold pb-1 transition-colors relative ${
                        activeTab === 'all'
                          ? 'text-white'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      All Venues ({filteredVenues.length})
                      {activeTab === 'all' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d4af37]" />
                      )}
                    </button>

                    <button
                      onClick={() => setActiveTab('favorites')}
                      className={`text-sm font-bold pb-1 transition-colors relative flex items-center gap-1.5 ${
                        activeTab === 'favorites'
                          ? 'text-white'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      <Heart className="w-3.5 h-3.5 text-rose-400 fill-current" />
                      <span>Saved ({favorites.length})</span>
                      {activeTab === 'favorites' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#d4af37]" />
                      )}
                    </button>
                  </div>
                </div>

                {/* AI Concierge Trigger Banner */}
                <div
                  onClick={() => setIsAiMatcherOpen(true)}
                  className="cursor-pointer px-4 py-2 rounded-xl bg-gradient-to-r from-[#292212] via-[#1d180d] to-[#161a22] border border-[#d4af37]/40 hover:border-[#d4af37] transition-all flex items-center gap-2.5 text-xs text-[#fae29c] shadow-md shadow-[#d4af37]/10"
                >
                  <Sparkles className="w-4 h-4 text-[#e5c064] shrink-0" />
                  <span>Looking for specific acoustics or styling? <strong>Ask AI Matcher</strong></span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#e5c064]" />
                </div>
              </div>

              {/* Venue Cards Grid */}
              {filteredVenues.length === 0 ? (
                <div className="py-20 text-center space-y-4 bg-[#141822] rounded-2xl border border-[#262c3b] max-w-xl mx-auto p-8">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-[#1c2230] border border-[#2f394c] flex items-center justify-center text-gray-400">
                    <Filter className="w-6 h-6 text-gray-500" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">No Matching Venues Found</h3>
                    <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                      Try expanding your capacity slider, adjusting the city filter, or reset your search parameters.
                    </p>
                  </div>
                  <button
                    onClick={handleResetFilters}
                    className="px-4 py-2 bg-[#d4af37] text-black font-semibold text-xs rounded-xl hover:brightness-110"
                  >
                    Reset All Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                  {filteredVenues.map((venue) => (
                    <VenueCard
                      key={venue.id}
                      venue={venue}
                      onSelectVenue={(v) => setSelectedVenue(v)}
                      onBookWalkthrough={(v) => setBookingVenue(v)}
                      isFavorited={favorites.includes(venue.id)}
                      onToggleFavorite={handleToggleFavorite}
                      isAiMatched={aiMatchedVenueIds.includes(venue.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {/* AI Venue Matcher Modal */}
      <AiVenueMatcher
        isOpen={isAiMatcherOpen}
        onClose={() => setIsAiMatcherOpen(false)}
        venues={venues}
        initialPrompt={aiInitialPrompt}
        onSelectVenue={(venue) => {
          setSelectedVenue(venue);
          setAiMatchedVenueIds([venue.id]);
        }}
      />

      {/* Book a Live Walkthrough Modal */}
      {bookingVenue && (
        <BookWalkthroughModal
          venue={bookingVenue}
          isOpen={true}
          onClose={() => setBookingVenue(null)}
          onBookingConfirmed={handleBookingConfirmed}
          onOpenLiveSimulator={(booking) => {
            setBookingVenue(null);
            setActiveLiveSimulatorBooking(booking);
          }}
        />
      )}

      {/* Booked Tours Slide-Over Drawer */}
      <BookedToursDrawer
        isOpen={isBookingsDrawerOpen}
        onClose={() => setIsBookingsDrawerOpen(false)}
        bookings={bookings}
        onOpenLiveSimulator={(booking) => {
          setIsBookingsDrawerOpen(false);
          setActiveLiveSimulatorBooking(booking);
        }}
      />

      {/* Live Video Walkthrough Call Simulator Modal */}
      {activeLiveSimulatorBooking && (
        <LiveMeetingSimulatorModal
          booking={activeLiveSimulatorBooking}
          isOpen={true}
          onClose={() => setActiveLiveSimulatorBooking(null)}
        />
      )}

      {/* Luxury Footer */}
      <footer className="border-t border-[#232731] bg-[#090b0e] py-12 text-gray-400 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <span className="text-base font-bold text-white font-serif-luxury tracking-tight">
                Venue<span className="text-[#e5c064]">Stream</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#d4af37]/20 text-[#fae29c] font-semibold">
                4K Virtual Tours
              </span>
            </div>
            <p className="text-[11px] text-gray-500">
              The premier virtual walkthrough & booking network for weddings, corporate galas & luxury events.
            </p>
          </div>

          <div className="flex items-center gap-6 text-gray-400">
            <button onClick={() => setSelectedVenue(null)} className="hover:text-white transition-colors">
              Directory
            </button>
            <button onClick={() => setIsAiMatcherOpen(true)} className="hover:text-white transition-colors">
              AI Matcher
            </button>
            <button onClick={() => setIsBookingsDrawerOpen(true)} className="hover:text-white transition-colors">
              My Walkthroughs
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

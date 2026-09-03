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
import { LiveMeetingSimulatorModal } from './components/LiveMeetingSimulatorModal';
import { VenueBookingModal } from './components/VenueBookingModal';
import { DepositPaymentModal } from './components/DepositPaymentModal';
import { CustomerEventPlannerModal } from './components/CustomerEventPlannerModal';
import { CustomerDashboard } from './components/CustomerDashboard';
import { MyEventsDrawer } from './components/MyEventsDrawer';
import { VenueOwnerDashboard } from './components/VenueOwnerDashboard';
import { PlatformAdminDashboard } from './components/PlatformAdminDashboard';
import { PlatformAdminSettingsModal } from './components/PlatformAdminSettingsModal';
import { VenueOnboardingModal } from './components/onboarding/VenueOnboardingModal';
import { Venue, FilterState, WalkthroughBooking, VenueBooking, MarketplaceConfig, BusinessOrganisation } from './types';
import { DEFAULT_MARKETPLACE_CONFIG } from './config/marketplaceConfig';
import { VENUES } from './data/venues';
import { Sparkles, Building2, Video, Calendar, ShieldCheck, Heart, Filter, ArrowRight, LayoutDashboard, Sliders } from 'lucide-react';

export default function App() {
  const [venues, setVenues] = useState<Venue[]>(VENUES);
  const [organisations, setOrganisations] = useState<BusinessOrganisation[]>([]);
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [currentView, setCurrentView] = useState<'customer_discovery' | 'my_events' | 'venue_portal' | 'platform_admin'>('customer_discovery');

  // Modals & Drawers
  const [isAiMatcherOpen, setIsAiMatcherOpen] = useState(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState('');
  const [aiMatchedVenueIds, setAiMatchedVenueIds] = useState<string[]>([]);
  const [walkthroughBookingVenue, setWalkthroughBookingVenue] = useState<Venue | null>(null);
  const [requestBookingVenue, setRequestBookingVenue] = useState<Venue | null>(null);
  const [requestBookingPreselectedLayout, setRequestBookingPreselectedLayout] = useState<string | undefined>(undefined);
  const [requestBookingSpaceId, setRequestBookingSpaceId] = useState<string | undefined>(undefined);
  const [requestBookingLayoutId, setRequestBookingLayoutId] = useState<string | undefined>(undefined);
  const [isEventsHubOpen, setIsEventsHubOpen] = useState(false);
  const [activeLiveSimulatorBooking, setActiveLiveSimulatorBooking] = useState<WalkthroughBooking | null>(null);
  const [isAdminSettingsOpen, setIsAdminSettingsOpen] = useState(false);

  // Supply-side Onboarding Modal State
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [editingOrganisationId, setEditingOrganisationId] = useState<string | undefined>(undefined);

  // Marketplace Modals
  const [depositPaymentBooking, setDepositPaymentBooking] = useState<VenueBooking | null>(null);
  const [plannerBooking, setPlannerBooking] = useState<VenueBooking | null>(null);

  // Marketplace State
  const [marketplaceConfig, setMarketplaceConfig] = useState<MarketplaceConfig>(DEFAULT_MARKETPLACE_CONFIG);

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
  const [walkthroughBookings, setWalkthroughBookings] = useState<WalkthroughBooking[]>([]);
  const [venueBookings, setVenueBookings] = useState<VenueBooking[]>([]);

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

  // Fetch initial venues, walkthroughs, venue bookings, organisations, and marketplace config from backend API
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [venuesRes, walkthroughsRes, venueBookingsRes, configRes, orgsRes] = await Promise.all([
          fetch('/api/venues?includeDrafts=true'),
          fetch('/api/walkthroughs'),
          fetch('/api/venue-bookings'),
          fetch('/api/marketplace/config'),
          fetch('/api/organisations'),
        ]);

        if (venuesRes.ok) {
          const data = await venuesRes.json();
          if (data.venues && data.venues.length > 0) {
            setVenues(data.venues);
          }
        }

        if (walkthroughsRes.ok) {
          const data = await walkthroughsRes.json();
          if (data.bookings) {
            setWalkthroughBookings(data.bookings);
          }
        }

        if (venueBookingsRes.ok) {
          const data = await venueBookingsRes.json();
          if (data.bookings) {
            setVenueBookings(data.bookings);
          }
        }

        if (configRes.ok) {
          const data = await configRes.json();
          if (data.config) {
            setMarketplaceConfig(data.config);
          }
        }

        if (orgsRes.ok) {
          const data = await orgsRes.json();
          if (data.organisations) {
            setOrganisations(data.organisations);
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

  // Customer-facing published catalogue (drafts are strictly excluded)
  const publishedVenues = useMemo(() => {
    return venues.filter((v) => !v.status || v.status === 'published');
  }, [venues]);

  // Filter and sort customer published venues
  const filteredVenues = useMemo(() => {
    let list = [...publishedVenues];

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
          (v.location.state && v.location.state.toLowerCase().includes(loc)) ||
          (v.location.region && v.location.region.toLowerCase().includes(loc)) ||
          (v.location.country && v.location.country.toLowerCase().includes(loc))
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
  }, [publishedVenues, filters, activeTab, favorites]);

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

  const handleWalkthroughConfirmed = (newBooking: WalkthroughBooking) => {
    setWalkthroughBookings((prev) => [newBooking, ...prev]);
  };

  const handleVenueBookingSubmitted = (newBooking: VenueBooking) => {
    setVenueBookings((prev) => [newBooking, ...prev]);
  };

  const handleUpdateBookingStatus = async (
    bookingId: string,
    newStatus: VenueBooking['status']
  ): Promise<{ success: boolean; error?: string; booking?: VenueBooking }> => {
    try {
      const response = await fetch(`/api/venue-bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const errorMsg = data.error || `Failed to update status to ${newStatus}`;
        console.error('Server rejected booking status transition:', errorMsg);
        return { success: false, error: errorMsg };
      }

      const updatedRecord: VenueBooking =
        data.booking || {
          ...venueBookings.find((b) => b.id === bookingId)!,
          status: newStatus,
        };

      setVenueBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? updatedRecord : b))
      );

      return { success: true, booking: updatedRecord };
    } catch (err: any) {
      const errorMsg = err?.message || 'Network error updating booking status';
      console.error('Failed to sync booking status with server:', err);
      return { success: false, error: errorMsg };
    }
  };

  const handleSaveAdminConfig = async (updatedConfig: MarketplaceConfig) => {
    setMarketplaceConfig(updatedConfig);
    try {
      await fetch('/api/marketplace/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedConfig),
      });
    } catch (err) {
      console.error('Failed to sync marketplace config with server:', err);
    }
  };

  const handleUpdateBookingRecord = (updatedBooking: VenueBooking) => {
    setVenueBookings((prev) =>
      prev.map((b) => (b.id === updatedBooking.id ? updatedBooking : b))
    );
    if (depositPaymentBooking?.id === updatedBooking.id) {
      setDepositPaymentBooking(updatedBooking);
    }
    if (plannerBooking?.id === updatedBooking.id) {
      setPlannerBooking(updatedBooking);
    }
  };

  const handleOpenOnboardingModal = (venueToEdit?: Venue | null, orgId?: string) => {
    setEditingVenue(venueToEdit || null);
    setEditingOrganisationId(orgId);
    setIsOnboardingModalOpen(true);
  };

  const handleVenueCreatedOrUpdated = (venue: Venue, org: BusinessOrganisation) => {
    // Update local venues state
    setVenues((prev) => {
      const idx = prev.findIndex((v) => v.id === venue.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = venue;
        return next;
      }
      return [venue, ...prev];
    });

    // Update local organisations state
    setOrganisations((prev) => {
      const idx = prev.findIndex((o) => o.id === org.id);
      if (idx !== -1) {
        const next = [...prev];
        next[idx] = org;
        return next;
      }
      return [org, ...prev];
    });

    // Switch to venue portal to view the newly added/updated venue
    setCurrentView('venue_portal');
  };

  const handleToggleVenuePublishStatus = async (venueId: string, currentStatus: 'draft' | 'published') => {
    const nextStatus = currentStatus === 'draft' ? 'published' : 'draft';
    try {
      const res = await fetch(`/api/venues/${venueId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.venue) {
          setVenues((prev) => prev.map((v) => (v.id === venueId ? data.venue : v)));
        }
      }
    } catch (err) {
      console.error('Failed to toggle publish status on server:', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F1EA] text-[#26343D] flex flex-col font-sans selection:bg-[#A86445] selection:text-white">
      {/* Top Navigation */}
      <Navbar
        onOpenAiMatcher={() => {
          setAiInitialPrompt('');
          setIsAiMatcherOpen(true);
        }}
        onOpenEventsHub={() => {
          setSelectedVenue(null);
          setCurrentView('my_events');
        }}
        onBackToHome={() => {
          setSelectedVenue(null);
          setCurrentView('customer_discovery');
        }}
        onSelectRole={(role) => {
          setSelectedVenue(null);
          setCurrentView(role);
        }}
        onOpenOnboardingModal={() => handleOpenOnboardingModal()}
        walkthroughBookings={walkthroughBookings}
        venueBookings={venueBookings}
        savedCount={favorites.length}
        activeView={
          currentView === 'venue_portal'
            ? 'venue_portal'
            : currentView === 'platform_admin'
            ? 'platform_admin'
            : currentView === 'my_events'
            ? 'my_events'
            : selectedVenue
            ? 'detail'
            : 'landing'
        }
      />

      {/* Main View Router */}
      <main className="flex-1">
        {currentView === 'platform_admin' ? (
          /* Platform Admin Governance & Rule Controls */
          <PlatformAdminDashboard
            venues={venues}
            venueBookings={venueBookings}
            marketplaceConfig={marketplaceConfig}
            onSaveConfig={handleSaveAdminConfig}
            onUpdateBookingStatus={handleUpdateBookingStatus}
            onSwitchRole={(role) => {
              setSelectedVenue(null);
              setCurrentView(role === 'venue_owner' ? 'venue_portal' : 'customer_discovery');
            }}
          />
        ) : currentView === 'venue_portal' ? (
          /* Venue Owner Marketplace Portal */
          <VenueOwnerDashboard
            venues={venues}
            organisations={organisations}
            venueBookings={venueBookings}
            walkthroughBookings={walkthroughBookings}
            marketplaceConfig={marketplaceConfig}
            onUpdateBookingStatus={handleUpdateBookingStatus}
            onOpenLiveSimulator={(booking) => setActiveLiveSimulatorBooking(booking)}
            onInspectVenue={(venue) => {
              setSelectedVenue(venue);
              setCurrentView('customer_discovery');
            }}
            onSwitchToCustomerView={() => setCurrentView('customer_discovery')}
            onOpenAdminSettings={() => setIsAdminSettingsOpen(true)}
            onOpenOnboardingModal={handleOpenOnboardingModal}
            onToggleVenuePublishStatus={handleToggleVenuePublishStatus}
          />
        ) : currentView === 'my_events' ? (
          /* Dedicated Full-Page Customer Dashboard */
          <CustomerDashboard
            venueBookings={venueBookings}
            walkthroughBookings={walkthroughBookings}
            venues={venues}
            favorites={favorites}
            onOpenDepositModal={(booking) => setDepositPaymentBooking(booking)}
            onOpenEventPlanner={(booking) => setPlannerBooking(booking)}
            onOpenLiveSimulator={(booking) => setActiveLiveSimulatorBooking(booking)}
            onExploreVenue={(venueId) => {
              const v = venues.find((x) => x.id === venueId);
              if (v) {
                setSelectedVenue(v);
                setCurrentView('customer_discovery');
              }
            }}
            onBrowseVenues={() => {
              setSelectedVenue(null);
              setCurrentView('customer_discovery');
            }}
            onOpenAiMatcher={() => {
              setAiInitialPrompt('');
              setIsAiMatcherOpen(true);
            }}
            onRequestToBookVenue={(venue) => {
              setRequestBookingVenue(venue);
              setRequestBookingPreselectedLayout(undefined);
              setRequestBookingSpaceId(undefined);
              setRequestBookingLayoutId(undefined);
            }}
            onToggleFavorite={handleToggleFavorite}
          />
        ) : selectedVenue ? (
          /* Dedicated Venue Detail & Video Page */
          <VenueDetailView
            venue={selectedVenue}
            onBack={() => setSelectedVenue(null)}
            onBookWalkthrough={(venue) => setWalkthroughBookingVenue(venue)}
            onRequestToBook={(venue, preselectedLayout, preselectedSpaceId, preselectedLayoutId) => {
              setRequestBookingVenue(venue);
              setRequestBookingPreselectedLayout(preselectedLayout);
              setRequestBookingSpaceId(preselectedSpaceId);
              setRequestBookingLayoutId(preselectedLayoutId);
            }}
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#DDD8CF] pb-4">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setActiveTab('all')}
                      className={`text-sm font-bold pb-1 transition-colors relative ${
                        activeTab === 'all'
                          ? 'text-[#26343D]'
                          : 'text-[#66737A] hover:text-[#26343D]'
                      }`}
                    >
                      All Venues ({filteredVenues.length})
                      {activeTab === 'all' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#A86445]" />
                      )}
                    </button>

                    <button
                      onClick={() => setActiveTab('favorites')}
                      className={`text-sm font-bold pb-1 transition-colors relative flex items-center gap-1.5 ${
                        activeTab === 'favorites'
                          ? 'text-[#26343D]'
                          : 'text-[#66737A] hover:text-[#26343D]'
                      }`}
                    >
                      <Heart className="w-3.5 h-3.5 text-rose-500 fill-current" />
                      <span>Saved ({favorites.length})</span>
                      {activeTab === 'favorites' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#A86445]" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Intelligent Search Prompt Banner */}
                <div
                  onClick={() => setIsAiMatcherOpen(true)}
                  className="cursor-pointer px-3.5 py-2 rounded-xl bg-white border border-[#DDD8CF] hover:border-[#26343D] transition-all flex items-center gap-2.5 text-xs text-[#26343D] shadow-xs"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#A86445]" />
                  <span className="text-[#66737A]">Looking for specific floor plans or capacity? <strong className="text-[#26343D] font-semibold underline underline-offset-2">Ask Intelligent Matcher</strong></span>
                  <ArrowRight className="w-3.5 h-3.5 text-[#66737A]" />
                </div>
              </div>

              {/* Venue Cards Grid */}
              {filteredVenues.length === 0 ? (
                <div className="py-20 text-center space-y-4 bg-white rounded-2xl border border-[#DDD8CF] max-w-xl mx-auto p-8 shadow-xs">
                  <div className="w-14 h-14 mx-auto rounded-2xl bg-[#F4F1EA] border border-[#DDD8CF] flex items-center justify-center text-[#A86445]">
                    <Filter className="w-6 h-6 text-[#A86445]" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-[#26343D]">No Matching Venues Found</h3>
                    <p className="text-xs text-[#66737A] mt-1 max-w-sm mx-auto leading-relaxed">
                      Try expanding your capacity slider, adjusting the location filter, or reset your search parameters.
                    </p>
                  </div>
                  <button
                    onClick={handleResetFilters}
                    className="px-4 py-2 bg-[#26343D] text-white font-semibold text-xs rounded-xl hover:bg-[#1E2930] shadow-xs"
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
                      onBookWalkthrough={(v) => setWalkthroughBookingVenue(v)}
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
        venues={publishedVenues}
        initialPrompt={aiInitialPrompt}
        onSelectVenue={(venue) => {
          setSelectedVenue(venue);
          setAiMatchedVenueIds([venue.id]);
        }}
      />

      {/* Book a Live Walkthrough Modal */}
      {walkthroughBookingVenue && (
        <BookWalkthroughModal
          venue={walkthroughBookingVenue}
          isOpen={true}
          onClose={() => setWalkthroughBookingVenue(null)}
          onBookingConfirmed={handleWalkthroughConfirmed}
          onOpenLiveSimulator={(booking) => {
            setWalkthroughBookingVenue(null);
            setActiveLiveSimulatorBooking(booking);
          }}
        />
      )}

      {/* Venue Marketplace Booking Modal (Request to Book) */}
      {requestBookingVenue && (
        <VenueBookingModal
          venue={requestBookingVenue}
          isOpen={true}
          preselectedLayout={requestBookingPreselectedLayout}
          preselectedSpaceId={requestBookingSpaceId}
          preselectedLayoutId={requestBookingLayoutId}
          onClose={() => {
            setRequestBookingVenue(null);
            setRequestBookingPreselectedLayout(undefined);
            setRequestBookingSpaceId(undefined);
            setRequestBookingLayoutId(undefined);
          }}
          onBookingSubmitted={handleVenueBookingSubmitted}
          onViewInMyEvents={() => {
            setSelectedVenue(null);
            setCurrentView('my_events');
          }}
          marketplaceConfig={marketplaceConfig}
        />
      )}

      {/* Customer Events & Walkthroughs Hub Drawer */}
      <MyEventsDrawer
        isOpen={isEventsHubOpen}
        onClose={() => setIsEventsHubOpen(false)}
        venueBookings={venueBookings}
        walkthroughBookings={walkthroughBookings}
        onOpenLiveSimulator={(booking) => {
          setIsEventsHubOpen(false);
          setActiveLiveSimulatorBooking(booking);
        }}
        onOpenDepositModal={(booking) => {
          setIsEventsHubOpen(false);
          setDepositPaymentBooking(booking);
        }}
        onOpenEventPlanner={(booking) => {
          setIsEventsHubOpen(false);
          setPlannerBooking(booking);
        }}
        onExploreVenue={(venueId) => {
          const v = venues.find((x) => x.id === venueId);
          if (v) {
            setSelectedVenue(v);
            setCurrentView('customer_discovery');
          }
        }}
        venues={venues}
      />

      {/* Simulated Deposit Payment Modal */}
      {depositPaymentBooking && (
        <DepositPaymentModal
          booking={depositPaymentBooking}
          isOpen={true}
          onClose={() => setDepositPaymentBooking(null)}
          onPaymentCompleted={handleUpdateBookingRecord}
          onOpenPlanner={(booking) => {
            setDepositPaymentBooking(null);
            setPlannerBooking(booking);
          }}
        />
      )}

      {/* Customer Event Planner Modal */}
      {plannerBooking && (
        <CustomerEventPlannerModal
          booking={plannerBooking}
          isOpen={true}
          onClose={() => setPlannerBooking(null)}
          onUpdateBooking={handleUpdateBookingRecord}
          onOpenDepositModal={(booking) => {
            setPlannerBooking(null);
            setDepositPaymentBooking(booking);
          }}
          onExploreWalkthrough={(venueId) => {
            const v = venues.find((x) => x.id === venueId);
            if (v) {
              setSelectedVenue(v);
              setCurrentView('customer_discovery');
            }
          }}
          marketplaceConfig={marketplaceConfig}
          venue={venues.find((v) => v.id === plannerBooking.venueId)}
          venues={venues}
        />
      )}

      {/* Live Video Walkthrough Call Simulator Modal */}
      {activeLiveSimulatorBooking && (
        <LiveMeetingSimulatorModal
          booking={activeLiveSimulatorBooking}
          isOpen={true}
          onClose={() => setActiveLiveSimulatorBooking(null)}
          venues={venues}
        />
      )}

      {/* Platform Admin Commercial Settings Modal */}
      <PlatformAdminSettingsModal
        isOpen={isAdminSettingsOpen}
        onClose={() => setIsAdminSettingsOpen(false)}
        currentConfig={marketplaceConfig}
        onSaveConfig={handleSaveAdminConfig}
      />

      {/* Venue Host Onboarding & Inventory Modal */}
      <VenueOnboardingModal
        isOpen={isOnboardingModalOpen}
        onClose={() => {
          setIsOnboardingModalOpen(false);
          setEditingVenue(null);
          setEditingOrganisationId(undefined);
        }}
        onVenueCreatedOrUpdated={handleVenueCreatedOrUpdated}
        existingOrganisations={organisations}
        initialVenue={editingVenue}
        initialOrganisationId={editingOrganisationId}
      />

      {/* Editorial Footer */}
      <footer className="border-t border-[#DDD8CF] bg-[#F4F1EA] py-12 text-[#66737A] text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="space-y-1 text-center sm:text-left">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <span className="text-base font-bold text-[#26343D] tracking-tight">
                Venue<span className="text-[#A86445]">Stream</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white text-[#66737A] border border-[#DDD8CF] font-medium">
                Marketplace Prototype
              </span>
            </div>
            <p className="text-[11px] text-[#66737A]">
              Two-sided virtual inspection and venue booking marketplace for business meetings, conferences, private dining, training, and events.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-[#66737A]">
            <button
              onClick={() => {
                setSelectedVenue(null);
                setCurrentView('customer_discovery');
              }}
              className={`transition-colors ${currentView === 'customer_discovery' ? 'font-bold text-[#26343D]' : 'hover:text-[#26343D]'}`}
            >
              Customer Directory
            </button>
            <button onClick={() => setIsAiMatcherOpen(true)} className="hover:text-[#26343D] transition-colors">
              Smart Match
            </button>
            <button
              id="footer-my-events-btn"
              onClick={() => {
                setSelectedVenue(null);
                setCurrentView('my_events');
              }}
              className={`transition-colors ${currentView === 'my_events' ? 'font-bold text-[#26343D]' : 'hover:text-[#26343D]'}`}
            >
              My Events ({venueBookings.length + walkthroughBookings.length})
            </button>
            <button
              onClick={() => {
                setSelectedVenue(null);
                setCurrentView('venue_portal');
              }}
              className={`font-semibold transition-colors ${currentView === 'venue_portal' ? 'text-[#26343D] underline underline-offset-4' : 'text-[#A86445] hover:text-[#8F5439]'}`}
            >
              Venue Host Portal
            </button>
            <button
              id="footer-admin-rules-btn"
              onClick={() => {
                setSelectedVenue(null);
                setCurrentView('platform_admin');
              }}
              className={`inline-flex items-center gap-1 text-[11px] border px-2.5 py-1 rounded-lg transition-colors shadow-2xs ${
                currentView === 'platform_admin'
                  ? 'bg-[#A86445] text-white border-[#A86445]'
                  : 'bg-white text-[#66737A] hover:text-[#26343D] border-[#DDD8CF]'
              }`}
            >
              <Sliders className="w-3 h-3" />
              <span>Platform Admin</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}


import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Sparkles,
  Users,
  MapPin,
  Calendar,
  Clock,
  Car,
  Utensils,
  Wine,
  ShieldCheck,
  CheckCircle2,
  Compass,
  Layers,
  Star,
  Music,
  Share2,
  Heart,
  ChevronRight,
  Info,
  Maximize,
  Video,
  ImageIcon,
  Maximize2,
  User,
} from 'lucide-react';
import { Venue, WalkthroughClip } from '../types';
import { formatCurrency } from '../utils/formatters';
import {
  getVenueSpaces,
  getVenueLayouts,
  getWalkthroughForLayout,
  hasGenuineFloorPlan,
  hasGenuine360Media,
} from '../utils/venueConfigurationHelpers';

interface VenueDetailViewProps {
  venue: Venue;
  onBack: () => void;
  onBookWalkthrough: (venue: Venue) => void;
  onRequestToBook: (venue: Venue, preselectedLayout?: string, preselectedSpaceId?: string, preselectedLayoutId?: string) => void;
  isFavorited: boolean;
  onToggleFavorite: (venueId: string) => void;
}

export const VenueDetailView: React.FC<VenueDetailViewProps> = ({
  venue,
  onBack,
  onBookWalkthrough,
  onRequestToBook,
  isFavorited,
  onToggleFavorite,
}) => {
  const hasRecordedWalkthrough = Boolean(
    Array.isArray(venue.walkthroughClips) && venue.walkthroughClips.length > 0
  );

  const spaces = getVenueSpaces(venue);
  const allLayouts = getVenueLayouts(venue);

  const [selectedSpaceId, setSelectedSpaceId] = useState<string>(spaces[0]?.id || '');
  const activeSpace = spaces.find((s) => s.id === selectedSpaceId) || spaces[0];
  const activeLayouts = activeSpace?.layouts || [];

  // Default selected layout: choose one with a walkthrough if available, or first layout
  const [selectedLayoutId, setSelectedLayoutId] = useState<string>(() => {
    const layoutWithClip = activeLayouts.find((l) =>
      Boolean(getWalkthroughForLayout(venue, l.id, activeSpace?.id, l.layoutType))
    );
    return layoutWithClip?.id || activeLayouts[0]?.id || '';
  });

  const activeLayout = activeLayouts.find((l) => l.id === selectedLayoutId) || activeLayouts[0];

  const activeClip: WalkthroughClip | undefined = activeLayout
    ? getWalkthroughForLayout(venue, activeLayout.id, activeSpace?.id, activeLayout.layoutType)
    : venue.walkthroughClips?.[0];

  const hasClipForActiveLayout = Boolean(activeClip);
  const hasGenuineFloor = hasGenuineFloorPlan(venue, activeLayout, activeSpace?.id);
  const hasGenuine360 = hasGenuine360Media(venue, activeLayout, activeSpace?.id);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [ambientAudioOn, setAmbientAudioOn] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'video' | 'floorplan' | '360' | 'gallery'>(() => {
    return hasClipForActiveLayout ? 'video' : 'gallery';
  });
  const [selectedCameraAngle, setSelectedCameraAngle] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedGalleryImage, setSelectedGalleryImage] = useState<string>(
    venue.heroImage || (venue.galleryImages && venue.galleryImages[0]) || ''
  );

  const handleRequestBooking = () => {
    const preselected =
      activeSpace && activeLayout
        ? `${activeSpace.name} — ${activeLayout.title || `${activeLayout.layoutType} Setup`}`
        : activeClip?.title || undefined;
    onRequestToBook(venue, preselected, activeSpace?.id, activeLayout?.id);
  };

  const handleSelectLayout = (layoutId: string) => {
    setSelectedLayoutId(layoutId);
    const targetLayout = activeLayouts.find((l) => l.id === layoutId);
    if (targetLayout) {
      const clip = getWalkthroughForLayout(venue, targetLayout.id, activeSpace?.id, targetLayout.layoutType);
      if (clip) {
        setViewMode('video');
        setIsPlaying(true);
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play().catch(() => {});
        }
      } else {
        setViewMode('gallery');
      }
    }
  };

  const handleSelectSpace = (spaceId: string) => {
    setSelectedSpaceId(spaceId);
    const targetSpace = spaces.find((s) => s.id === spaceId);
    if (targetSpace && targetSpace.layouts && targetSpace.layouts.length > 0) {
      const firstLayout = targetSpace.layouts[0];
      setSelectedLayoutId(firstLayout.id);
      const clip = getWalkthroughForLayout(venue, firstLayout.id, targetSpace.id, firstLayout.layoutType);
      if (clip) {
        setViewMode('video');
        setIsPlaying(true);
        if (videoRef.current) {
          videoRef.current.currentTime = 0;
          videoRef.current.play().catch(() => {});
        }
      } else {
        setViewMode('gallery');
      }
    }
  };

  // Pricing calculator state
  const [calcGuests, setCalcGuests] = useState<number>(120);
  const [calcEventType, setCalcEventType] = useState<'weekend-peak' | 'weekday' | 'off-season'>('weekend-peak');

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (activeClip && activeClip.cameraAngles && activeClip.cameraAngles.length > 0) {
      setSelectedCameraAngle(activeClip.cameraAngles[0]);
    }
  }, [venue.id]);

  useEffect(() => {
    if (activeClip) {
      setSelectedCameraAngle(activeClip.cameraAngles?.[0] || '');
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        if (isPlaying) {
          videoRef.current.play().catch(() => {});
        }
      }
    }
  }, [activeClip?.id]);

  // Sync video timeline
  const handleTimeUpdate = () => {
    if (videoRef.current && activeClip) {
      setCurrentTime(videoRef.current.currentTime);
      setDuration(videoRef.current.duration || activeClip.durationSec);
    }
  };

  const handleSeek = (newTimeSec: number) => {
    if (videoRef.current && activeClip) {
      videoRef.current.currentTime = newTimeSec;
      setCurrentTime(newTimeSec);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const currency = venue.pricing?.currency || 'GBP';

  // Pricing calculation
  const getCalculatedPrice = () => {
    let base = venue.pricing?.startingPrice || 0;
    if (calcEventType === 'weekend-peak') {
      base = Math.round(base * (venue.pricing?.peakSeasonMultiplier || 1.25));
    } else if (calcEventType === 'off-season') {
      base = Math.round(base * 0.85);
    }
    const cleaning = venue.pricing?.cleaningFee || 0;
    const estFoodDrink = calcGuests * 95;
    return {
      venueRental: base,
      cleaningFee: cleaning,
      estimatedHospitality: estFoodDrink,
      totalEstimated: base + cleaning + estFoodDrink,
    };
  };

  const calcPricing = getCalculatedPrice();

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const galleryImages = [
    ...(venue.heroImage ? [venue.heroImage] : []),
    ...(venue.galleryImages || []),
  ].filter((img, idx, self) => self.indexOf(img) === idx);

  const derivedSeated =
    venue.capacity?.seatedBanquet ||
    (venue.spaces?.reduce((max, s) => Math.max(max, s.seatedCapacity || 0), 0)) ||
    0;
  const derivedCocktail =
    venue.capacity?.cocktail ||
    (venue.spaces?.reduce((max, s) => Math.max(max, s.standingCapacity || s.maxCapacity || 0), 0)) ||
    0;

  const hasReviews = Boolean(venue.reviewCount && venue.reviewCount > 0 && venue.rating && venue.rating > 0);
  const hasLiveTours = Boolean(venue.availableSlots && venue.availableSlots.length > 0);

  return (
    <div className="min-h-screen bg-[#F4F1EA] text-[#26343D] pb-20">
      {/* Top Header Bar */}
      <div className="border-b border-[#DDD8CF] bg-[#F4F1EA]/95 backdrop-blur-lg sticky top-20 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              id="back-to-venues-btn"
              onClick={onBack}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white text-xs font-semibold text-[#26343D] hover:bg-[#F4F1EA] border border-[#DDD8CF] shadow-xs transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-[#66737A]" />
              <span>Back to Directory</span>
            </button>
            <div className="hidden sm:block h-4 w-[1px] bg-[#DDD8CF]" />
            <div className="hidden sm:flex items-center gap-2 text-xs text-[#66737A]">
              <span>{venue.location.city}</span>
              <ChevronRight className="w-3 h-3 text-[#94A3B8]" />
              <span className="text-[#26343D] font-medium truncate max-w-[200px]">{venue.name}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="share-venue-btn"
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-[#DDD8CF] text-xs text-[#66737A] hover:text-[#26343D] shadow-xs transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{copiedLink ? 'Link Copied!' : 'Share'}</span>
            </button>

            <button
              id="detail-fav-btn"
              onClick={() => onToggleFavorite(venue.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs shadow-xs transition-colors ${
                isFavorited
                  ? 'bg-rose-50 border-rose-300 text-rose-600'
                  : 'bg-white border-[#DDD8CF] text-[#66737A] hover:text-[#26343D]'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${isFavorited ? 'fill-current text-rose-500' : ''}`} />
              <span className="hidden sm:inline">{isFavorited ? 'Saved' : 'Save'}</span>
            </button>

            {hasLiveTours && (
              <button
                id="detail-top-tour-btn"
                onClick={() => onBookWalkthrough(venue)}
                className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white border border-[#DDD8CF] text-[#26343D] hover:bg-[#F4F1EA] font-semibold text-xs shadow-xs transition-all"
              >
                <Video className="w-3.5 h-3.5 text-[#A86445]" />
                <span>Live Tour</span>
              </button>
            )}

            <button
              id="detail-top-book-btn"
              onClick={handleRequestBooking}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#A86445] text-white font-semibold text-xs shadow-sm hover:bg-[#8F5439] active:scale-95 transition-all"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Request to Book</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">
        {/* Title and Key Badges */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-[#F3E7DF] text-[#A86445] border border-[#A86445]/25 rounded-full">
              {venue.aesthetic || 'Event Space'}
            </span>
            {hasRecordedWalkthrough && (
              <span className="flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                <Video className="w-3.5 h-3.5 text-emerald-600" />
                Recorded Walkthrough Available
              </span>
            )}
            {allLayouts.length > 0 && (
              <span className="px-3 py-1 text-xs font-semibold text-[#26343D] bg-white border border-[#DDD8CF] rounded-full shadow-2xs">
                {spaces.length > 0 ? `${spaces.length} ${spaces.length === 1 ? 'Space' : 'Spaces'} · ` : ''}
                {allLayouts.length} {allLayouts.length === 1 ? 'Configuration' : 'Configurations'}
              </span>
            )}
            {hasLiveTours && (
              <span className="flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
                <Video className="w-3 h-3 text-blue-600" />
                Live Host Tours Available
              </span>
            )}
            {hasReviews ? (
              <div className="flex items-center gap-1 text-xs text-[#26343D] font-semibold px-2.5 py-1 bg-white border border-[#DDD8CF] rounded-full shadow-xs">
                <Star className="w-3.5 h-3.5 fill-current text-amber-400" />
                <span>{venue.rating.toFixed(2)}</span>
                <span className="text-[#66737A]">({venue.reviewCount} reviews)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs text-[#66737A] px-2.5 py-1 bg-white border border-[#DDD8CF] rounded-full shadow-xs">
                <span>No reviews yet</span>
              </div>
            )}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold text-[#26343D] tracking-tight">
                {venue.name}
              </h1>
              <p className="text-sm text-[#66737A] flex items-center gap-1.5 mt-1">
                <MapPin className="w-4 h-4 text-[#A86445] shrink-0" />
                <span>
                  {venue.location?.address ? `${venue.location.address}, ` : ''}
                  {venue.location?.neighborhood ? `${venue.location.neighborhood}, ` : ''}
                  {venue.location?.city || ''}{venue.location?.state || venue.location?.country ? `, ${venue.location?.state || venue.location?.country}` : ''} {venue.location?.zipCode || venue.location?.postalCode || ''}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-4 bg-white border border-[#DDD8CF] p-3.5 rounded-xl shadow-sm">
              <div className="text-right">
                <span className="text-[10px] uppercase font-semibold text-[#66737A] block">Starting Rate</span>
                <div className="text-xl font-bold text-[#26343D]">
                  {formatCurrency(venue.pricing?.startingPrice || 0, currency)}
                  <span className="text-xs font-normal text-[#66737A]"> /{venue.pricing?.priceUnit?.replace('per ', '') || 'day'}</span>
                </div>
              </div>
              <div className="h-8 w-[1px] bg-[#DDD8CF]" />
              <div>
                <span className="text-[10px] uppercase font-semibold text-[#66737A] block">Capacity</span>
                <span className="text-sm font-semibold text-[#26343D]">
                  {derivedSeated > 0 && derivedCocktail > 0
                    ? `${derivedSeated} seated / ${derivedCocktail} cocktail`
                    : derivedCocktail > 0
                    ? `Max ${derivedCocktail} guests`
                    : derivedSeated > 0
                    ? `${derivedSeated} seated`
                    : 'Capacity on Request'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid: Left Media & Details / Right Specs & Booking Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column */}
          <div className="lg:col-span-8 space-y-6">
            {/* About This Venue */}
            {venue.description && venue.description.trim() && (
              <div className="bg-white border border-[#DDD8CF] rounded-2xl p-6 space-y-3 shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#A86445]" />
                  About This Venue
                </h3>
                <p className="text-sm text-[#66737A] leading-relaxed whitespace-pre-line">
                  {venue.description}
                </p>
              </div>
            )}
            {/* Space & Layout Configuration Selector */}
            {activeLayouts.length > 0 && (
              <div className="bg-white border border-[#DDD8CF] rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-[#A86445]" />
                      <span>Explore Configurations {spaces.length === 1 ? `(${activeSpace?.name})` : ''}</span>
                    </span>
                    <p className="text-[11px] text-[#66737A]">
                      Select a room setup to inspect walkthrough footage, capacities, and layout options.
                    </p>
                  </div>

                  {/* Media View Mode Toggle */}
                  <div className="flex items-center bg-[#F4F1EA] p-1 rounded-xl border border-[#DDD8CF] gap-1 self-start sm:self-auto">
                    {hasClipForActiveLayout && (
                      <button
                        onClick={() => setViewMode('video')}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                          viewMode === 'video'
                            ? 'bg-[#A86445] text-white font-semibold shadow-xs'
                            : 'text-[#66737A] hover:text-[#26343D]'
                        }`}
                      >
                        Video Tour
                      </button>
                    )}
                    <button
                      onClick={() => setViewMode('gallery')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        viewMode === 'gallery'
                          ? 'bg-[#A86445] text-white font-semibold shadow-xs'
                          : 'text-[#66737A] hover:text-[#26343D]'
                      }`}
                    >
                      Photo Gallery
                    </button>
                    {hasGenuineFloor && (
                      <button
                        onClick={() => setViewMode('floorplan')}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                          viewMode === 'floorplan'
                            ? 'bg-[#A86445] text-white font-semibold shadow-xs'
                            : 'text-[#66737A] hover:text-[#26343D]'
                        }`}
                      >
                        Floor Plan
                      </button>
                    )}
                    {hasGenuine360 && (
                      <button
                        onClick={() => setViewMode('360')}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                          viewMode === '360'
                            ? 'bg-[#A86445] text-white font-semibold shadow-xs'
                            : 'text-[#66737A] hover:text-[#26343D]'
                        }`}
                      >
                        360° View
                      </button>
                    )}
                  </div>
                </div>

                {/* Multi-space tabs if venue has > 1 space */}
                {spaces.length > 1 && (
                  <div className="pt-1 flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-[#DDD8CF]/60">
                    <span className="text-[11px] font-semibold text-[#66737A] mr-1 shrink-0">Space:</span>
                    {spaces.map((sp) => {
                      const isSpaceActive = sp.id === (activeSpace?.id || selectedSpaceId);
                      const configCount = sp.layouts?.length || 0;
                      return (
                        <button
                          key={sp.id}
                          onClick={() => handleSelectSpace(sp.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                            isSpaceActive
                              ? 'bg-[#26343D] text-white shadow-xs'
                              : 'bg-[#F4F1EA] text-[#66737A] hover:text-[#26343D] border border-[#DDD8CF]'
                          }`}
                        >
                          <span>{sp.name}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                              isSpaceActive ? 'bg-white/20 text-white' : 'bg-stone-200 text-[#66737A]'
                            }`}
                          >
                            {configCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Configuration Cards for Active Space */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {activeLayouts.map((layout) => {
                    const isSelected = layout.id === activeLayout?.id;
                    const clip = getWalkthroughForLayout(venue, layout.id, activeSpace?.id, layout.layoutType);
                    const hasClip = Boolean(clip);

                    return (
                      <button
                        key={layout.id}
                        id={`config-select-${layout.id}`}
                        onClick={() => handleSelectLayout(layout.id)}
                        className={`p-3.5 rounded-xl text-left border transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-[#F3E7DF] border-[#A86445] ring-1 ring-[#A86445] shadow-xs'
                            : 'bg-[#F4F1EA] border-[#DDD8CF] hover:border-[#A86445]/60 hover:bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-xs font-bold text-[#26343D] leading-tight">
                            {layout.title || `${layout.layoutType} Setup`}
                          </span>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-[#A86445] shrink-0 mt-0.5 animate-pulse" />
                          )}
                        </div>

                        <div className="mt-3 flex items-center justify-between text-[11px] gap-2">
                          <span className="text-[#66737A]">Max {layout.capacity} guests</span>
                          {hasClip ? (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1 shrink-0">
                              <Video className="w-2.5 h-2.5 text-emerald-600" />
                              Walkthrough
                            </span>
                          ) : (
                            <span className="text-[10px] text-[#66737A] bg-white px-2 py-0.5 rounded border border-[#DDD8CF] shrink-0">
                              No walkthrough
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Informative Banner when Selected Configuration has no Walkthrough */}
            {!hasClipForActiveLayout && (
              <div className="bg-white border border-[#DDD8CF] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-[#F4F1EA] text-[#66737A] shrink-0 mt-0.5">
                    <Video className="w-5 h-5 text-[#A86445]" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-[#26343D]">
                      Recorded walkthrough not yet available for {activeLayout?.title || 'this setup'}
                    </h4>
                    <p className="text-xs text-[#66737A] mt-0.5 leading-relaxed">
                      Explore photography below, or book a live 1-on-1 virtual walkthrough with the host to inspect this layout.
                    </p>
                  </div>
                </div>

                {hasLiveTours && (
                  <button
                    id="no-walkthrough-live-btn"
                    onClick={() => onBookWalkthrough(venue)}
                    className="shrink-0 px-4 py-2 rounded-xl bg-[#26343D] text-white hover:bg-[#1E2930] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Video className="w-3.5 h-3.5 text-stone-300" />
                    <span>Book Live Walkthrough</span>
                  </button>
                )}
              </div>
            )}

            {/* Main Visual Media Display Container */}
            <div className="relative rounded-2xl overflow-hidden bg-black border border-[#DDD8CF] shadow-xl group">
              {hasClipForActiveLayout && activeClip && viewMode === 'video' ? (
                <>
                  <video
                    ref={videoRef}
                    src={activeClip.videoUrl}
                    poster={activeClip.thumbnail}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => setIsPlaying(false)}
                    playsInline
                    loop
                    className="w-full aspect-[16/9] object-cover bg-black cursor-pointer"
                    onClick={togglePlay}
                  />

                  {/* Video Overlays */}
                  <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 via-black/30 to-transparent flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md bg-[#A86445] text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-lg">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        Recorded Walkthrough
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md text-white text-xs font-semibold border border-white/20">
                        {activeClip.title}
                      </span>
                    </div>

                    {/* Camera Angle Selector */}
                    {activeClip.cameraAngles && activeClip.cameraAngles.length > 0 && (
                      <div className="pointer-events-auto flex items-center gap-1 bg-black/70 backdrop-blur-md p-1 rounded-lg border border-white/10 text-xs">
                        <Compass className="w-3.5 h-3.5 text-[#A86445] ml-1.5" />
                        <select
                          value={selectedCameraAngle}
                          onChange={(e) => setSelectedCameraAngle(e.target.value)}
                          className="bg-transparent text-white text-xs px-2 py-0.5 rounded focus:outline-none cursor-pointer"
                        >
                          {activeClip.cameraAngles.map((angle) => (
                            <option key={angle} value={angle} className="bg-stone-900 text-white">
                              Angle: {angle}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Big Center Play/Pause button when paused */}
                  {!isPlaying && (
                    <div
                      onClick={togglePlay}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer"
                    >
                      <div className="w-18 h-18 rounded-full bg-[#A86445] text-white flex items-center justify-center shadow-2xl transform hover:scale-105 transition-transform">
                        <Play className="w-8 h-8 fill-current ml-1" />
                      </div>
                    </div>
                  )}

                  {/* Bottom Video Controls Bar */}
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent space-y-2">
                    {/* Scrubbable Progress Bar with Milestone Markers */}
                    <div className="relative group/timeline py-2 cursor-pointer">
                      <div
                        className="h-1.5 w-full bg-white/25 rounded-full overflow-hidden relative"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pos = (e.clientX - rect.left) / rect.width;
                          handleSeek(pos * (duration || activeClip.durationSec));
                        }}
                      >
                        <div
                          className="h-full bg-[#A86445] rounded-full transition-all duration-100"
                          style={{
                            width: `${((currentTime || 0) / (duration || activeClip.durationSec || 1)) * 100}%`,
                          }}
                        />
                      </div>

                      {/* Milestone Dots */}
                      {activeClip.milestones?.map((m) => {
                        const pct = (m.timeSec / (activeClip.durationSec || 80)) * 100;
                        return (
                          <button
                            key={m.timeSec}
                            onClick={() => handleSeek(m.timeSec)}
                            title={`${m.label}: ${m.description}`}
                            style={{ left: `${pct}%` }}
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-[#A86445] border-2 border-white hover:scale-150 transition-transform shadow-xs"
                          />
                        );
                      })}
                    </div>

                    {/* Controls Row */}
                    <div className="flex items-center justify-between text-xs text-white">
                      <div className="flex items-center gap-3">
                        <button
                          id="video-play-pause-btn"
                          onClick={togglePlay}
                          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
                        </button>

                        <button
                          id="video-mute-btn"
                          onClick={toggleMute}
                          className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
                        >
                          {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                        </button>

                        <span className="text-stone-200 font-mono">
                          {formatTime(currentTime)} / {formatTime(duration || activeClip.durationSec)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          id="ambient-audio-toggle-btn"
                          onClick={() => setAmbientAudioOn(!ambientAudioOn)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                            ambientAudioOn
                              ? 'bg-[#A86445] text-white font-semibold'
                              : 'bg-white/15 text-stone-200 hover:text-white'
                          }`}
                          title="Toggle ambient background audio"
                        >
                          <Music className="w-3 h-3" />
                          <span>{ambientAudioOn ? 'Ambience ON' : 'Venue Ambience'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              ) : hasGenuineFloor && viewMode === 'floorplan' ? (
                /* Genuine Floor Plan Media View */
                <div className="w-full aspect-[16/9] bg-stone-900 p-4 flex flex-col justify-between relative overflow-hidden">
                  <div className="flex items-center justify-between pb-2 border-b border-white/10 text-white text-xs">
                    <span className="font-semibold">Floor Plan • {activeLayout?.title || activeSpace?.name}</span>
                    {activeSpace?.squareFeet && (
                      <span className="text-stone-400">{activeSpace.squareFeet.toLocaleString()} sq ft</span>
                    )}
                  </div>
                  <div className="flex-1 flex items-center justify-center p-2">
                    <img
                      src={activeLayout?.floorPlanUrl || activeSpace?.floorPlanUrl}
                      alt="Floor Plan"
                      className="max-h-full max-w-full object-contain rounded-lg"
                    />
                  </div>
                </div>
              ) : hasGenuine360 && viewMode === '360' ? (
                /* Genuine 360 View */
                <div className="w-full aspect-[16/9] bg-stone-900 relative flex items-center justify-center overflow-hidden">
                  <img
                    src={activeLayout?.threeSixtyUrl}
                    alt="360 View"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
                  <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white text-xs">
                    <span className="font-semibold bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10">
                      360° Panorama • {activeLayout?.title}
                    </span>
                  </div>
                </div>
              ) : (
                /* Photo Gallery View */
                galleryImages.length > 0 ? (
                  <div className="relative w-full aspect-[16/9] bg-stone-900 overflow-hidden flex items-center justify-center">
                    <img
                      src={selectedGalleryImage || galleryImages[0]}
                      alt={venue.name}
                      className="w-full h-full object-cover transition-all duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white text-xs">
                      <span className="font-semibold bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 truncate max-w-md">
                        {venue.name} • {activeSpace ? `${activeSpace.name} — ` : ''}{activeLayout?.title || venue.aesthetic || 'Space Photo'}
                      </span>
                      {hasLiveTours ? (
                        <button
                          onClick={() => onBookWalkthrough(venue)}
                          className="px-3.5 py-1.5 rounded-lg bg-[#A86445] text-white font-semibold text-xs shadow-md hover:bg-[#8F5439] flex items-center gap-1.5 transition-all shrink-0"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Live Tour with Host</span>
                        </button>
                      ) : (
                        <span className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10 text-stone-300 text-[11px] italic shrink-0">
                          Live tour availability has not been added yet.
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Architectural Neutral Placeholder */
                  <div className="relative w-full aspect-[16/9] bg-[#EAE5DC] flex flex-col items-center justify-center p-8 text-center">
                    <div className="w-14 h-14 rounded-2xl bg-[#DDD8CF] flex items-center justify-center text-[#A86445] mb-3 shadow-xs">
                      <ImageIcon className="w-7 h-7" />
                    </div>
                    <h4 className="text-base font-bold text-[#26343D]">{venue.name}</h4>
                    <p className="text-xs text-[#66737A] max-w-sm mt-1 leading-relaxed">
                      Venue photos not added yet. Complete space dimensions, capacity setups, and hire rates are listed below.
                    </p>
                    <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs">
                      <span className="font-semibold bg-black/60 text-white backdrop-blur-md px-3 py-1 rounded-lg border border-white/10">
                        {venue.name} • {venue.aesthetic || 'Event Space'}
                      </span>
                      {hasLiveTours && (
                        <button
                          onClick={() => onBookWalkthrough(venue)}
                          className="px-3.5 py-1.5 rounded-lg bg-[#A86445] text-white font-semibold text-xs shadow-md hover:bg-[#8F5439] flex items-center gap-1.5 transition-all"
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>Live Tour with Host</span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* Layout Milestones & Setup Highlights (Only if walkthrough exists for active layout) */}
            {hasClipForActiveLayout && activeClip && (
              <div className="bg-white border border-[#DDD8CF] rounded-2xl p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#A86445]" />
                    Walkthrough Key Checkpoints & Layout Highlights
                  </h3>
                  <span className="text-xs text-[#66737A] font-medium">Click checkpoint to jump in video</span>
                </div>

                {/* Milestones grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {activeClip.milestones?.map((milestone) => (
                    <button
                      key={milestone.timeSec}
                      onClick={() => {
                        setViewMode('video');
                        handleSeek(milestone.timeSec);
                      }}
                      className="p-3.5 rounded-xl bg-[#F4F1EA] border border-[#DDD8CF] text-left hover:border-[#A86445] hover:bg-white transition-all group shadow-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-[#A86445] group-hover:text-[#26343D] transition-colors">
                          {milestone.label}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-[#DDD8CF] text-[#66737A]">
                          {formatTime(milestone.timeSec)}
                        </span>
                      </div>
                      <p className="text-xs text-[#66737A] leading-relaxed">{milestone.description}</p>
                    </button>
                  ))}
                </div>

                {/* Setup Highlights Chips */}
                {activeClip.setupHighlights && activeClip.setupHighlights.length > 0 && (
                  <div className="pt-2 border-t border-[#DDD8CF] flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-[#66737A] font-semibold">Included in this setup:</span>
                    {activeClip.setupHighlights.map((hl, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded-md bg-[#F4F1EA] text-[#66737A] border border-[#DDD8CF]"
                      >
                        ✓ {hl}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Spaces & Configurations Breakdown (Complementary structural summary) */}
            {spaces.length > 0 && (
              <div id="spaces-configurations-section" className="bg-white border border-[#DDD8CF] rounded-2xl p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#A86445]" />
                    Spaces & Configurations ({spaces.length})
                  </h3>
                  <span className="text-xs text-[#66737A]">Available for hire</span>
                </div>

                <div className="space-y-4">
                  {spaces.map((space) => {
                    const areaText = (space.squareFeet && space.squareFeet > 0)
                      ? `${space.squareFeet.toLocaleString()} sq ft`
                      : (space.squareMeters && space.squareMeters > 0)
                      ? `${space.squareMeters.toLocaleString()} m²`
                      : null;
                    const standing = space.standingCapacity || space.maxCapacity || 0;
                    const seated = space.seatedCapacity || 0;
                    const theatre = space.theatreCapacity || 0;
                    const spaceLayouts = space.layouts || [];

                    return (
                      <div
                        key={space.id}
                        className="p-5 rounded-2xl bg-[#F4F1EA] border border-[#DDD8CF] space-y-4"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#DDD8CF]/60 pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-[#26343D]">{space.name}</h4>
                              {space.floorLocation && (
                                <span className="text-[10px] text-[#66737A] bg-white px-2 py-0.5 rounded border border-[#DDD8CF]">
                                  {space.floorLocation}
                                </span>
                              )}
                            </div>
                            {space.description && (
                              <p className="text-xs text-[#66737A] mt-1 leading-relaxed">
                                {space.description}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {standing > 0 && (
                              <span className="text-xs text-[#26343D] font-semibold bg-white px-2.5 py-1 rounded-lg border border-[#DDD8CF]">
                                Max {standing} guests
                              </span>
                            )}
                            {areaText && (
                              <span className="text-xs text-[#66737A] font-semibold px-2.5 py-1 bg-white rounded-lg border border-[#DDD8CF]">
                                {areaText}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Configurations List */}
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold uppercase tracking-wider text-[#66737A] block">
                            {spaceLayouts.length} {spaceLayouts.length === 1 ? 'Configuration' : 'Configurations'}:
                          </span>

                          {spaceLayouts.length === 0 ? (
                            <p className="text-xs text-[#66737A]">Standard room layout.</p>
                          ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                              {spaceLayouts.map((layout) => {
                                const clip = getWalkthroughForLayout(venue, layout.id, space.id, layout.layoutType);
                                const isCurrent = space.id === activeSpace?.id && layout.id === activeLayout?.id;

                                return (
                                  <div
                                    key={layout.id}
                                    onClick={() => {
                                      handleSelectSpace(space.id);
                                      handleSelectLayout(layout.id);
                                      window.scrollTo({ top: 380, behavior: 'smooth' });
                                    }}
                                    className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                                      isCurrent
                                        ? 'bg-[#F3E7DF] border-[#A86445] ring-1 ring-[#A86445]'
                                        : 'bg-white border-[#DDD8CF] hover:border-[#A86445]/60 hover:shadow-xs'
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-1">
                                      <span className="text-xs font-bold text-[#26343D]">
                                        {layout.title || `${layout.layoutType} Setup`}
                                      </span>
                                      {isCurrent && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#A86445] mt-1 shrink-0" />
                                      )}
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-[11px] gap-2">
                                      <span className="text-[#66737A]">{layout.capacity} guests</span>
                                      {clip ? (
                                        <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1 shrink-0">
                                          <Video className="w-2.5 h-2.5 text-emerald-600" />
                                          Walkthrough
                                        </span>
                                      ) : (
                                        <span className="text-[10px] text-[#66737A] bg-[#F4F1EA] px-1.5 py-0.5 rounded border border-[#DDD8CF] shrink-0">
                                          No walkthrough
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* Room dimensions / capacities footer */}
                        <div className="pt-2 border-t border-[#DDD8CF]/60 flex items-center gap-4 text-[11px] text-[#66737A] flex-wrap">
                          {standing > 0 && <span>Standing: <strong className="text-[#26343D]">{standing}</strong></span>}
                          {seated > 0 && <span>Seated: <strong className="text-[#26343D]">{seated}</strong></span>}
                          {theatre > 0 && <span>Theatre: <strong className="text-[#26343D]">{theatre}</strong></span>}
                          {Boolean(space.ceilingHeightFt && space.ceilingHeightFt > 0) && (
                            <span>Ceiling: <strong className="text-[#26343D]">{space.ceilingHeightFt} ft</strong></span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Photo Gallery Grid */}
            {galleryImages.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-2">
                    <ImageIcon className="w-4 h-4 text-[#A86445]" />
                    High-Resolution Gallery ({galleryImages.length} Perspectives)
                  </h3>
                  <span className="text-xs text-[#66737A]">Click to inspect photo</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {galleryImages.map((img, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        setSelectedGalleryImage(img);
                        if (!hasRecordedWalkthrough) {
                          window.scrollTo({ top: 180, behavior: 'smooth' });
                        }
                      }}
                      className={`aspect-[4/3] rounded-xl overflow-hidden border bg-stone-900 group relative cursor-pointer shadow-xs transition-all ${
                        selectedGalleryImage === img
                          ? 'ring-2 ring-[#A86445] border-[#A86445]'
                          : 'border-[#DDD8CF] hover:border-[#A86445]/60'
                      }`}
                    >
                      <img
                        src={img}
                        alt={`${venue.name} perspective ${idx + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                      <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Maximize className="w-5 h-5 text-white" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comprehensive Amenities Checklist */}
            <div className="bg-white border border-[#DDD8CF] rounded-2xl p-6 space-y-4 shadow-sm">
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#26343D]">
                Venue Amenities & Facilities Included
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {venue.amenities?.map((amenity, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F4F1EA] border border-[#DDD8CF]"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#A86445] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-semibold text-[#26343D] block">{amenity.name}</span>
                      <span className="text-[10px] text-[#66737A] uppercase tracking-wider">{amenity.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Host Info, Specs, Dynamic Pricing Calculator & Booking Widget */}
          <div className="lg:col-span-4 space-y-6">
            {/* Host Card */}
            <div className="bg-white border border-[#DDD8CF] rounded-2xl p-6 space-y-4 shadow-sm">
              <div className="flex items-center gap-3">
                {venue.host?.avatar ? (
                  <img
                    src={venue.host.avatar}
                    alt={venue.host.name || 'Host'}
                    className="w-13 h-13 rounded-full object-cover border-2 border-[#A86445] shadow-xs"
                  />
                ) : (
                  <div className="w-13 h-13 rounded-full bg-[#F4F1EA] border-2 border-[#DDD8CF] flex items-center justify-center text-[#66737A] shadow-xs font-bold text-sm">
                    {venue.host?.name ? venue.host.name.charAt(0).toUpperCase() : <User className="w-5 h-5" />}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-bold text-[#26343D]">{venue.host?.name || venue.businessName || 'Venue Management'}</h4>
                  </div>
                  {venue.host?.title && (
                    <p className="text-xs text-[#66737A]">{venue.host.title}</p>
                  )}
                  {venue.host?.rating && venue.host.rating > 0 && venue.host?.totalToursConducted && venue.host.totalToursConducted > 0 ? (
                    <div className="flex items-center gap-1 text-[11px] text-[#26343D] font-semibold mt-0.5">
                      <Star className="w-3 h-3 fill-current text-amber-400" />
                      <span>{venue.host.rating.toFixed(2)} Rating</span>
                      <span className="text-[#66737A]">• {venue.host.totalToursConducted} Tours Led</span>
                    </div>
                  ) : (
                    <span className="text-[11px] text-[#66737A] block mt-0.5">Venue Host</span>
                  )}
                </div>
              </div>

              {venue.host?.bio && (
                <p className="text-xs text-[#66737A] italic bg-[#F4F1EA] p-3 rounded-xl border border-[#DDD8CF] leading-relaxed">
                  "{venue.host.bio}"
                </p>
              )}

              {(venue.host?.responseTime || (venue.host?.languages && venue.host.languages.length > 0)) && (
                <div className="grid grid-cols-2 gap-2 text-[11px] text-[#66737A] pt-1">
                  {venue.host.responseTime && (
                    <div className="p-2.5 rounded-lg bg-[#F4F1EA] border border-[#DDD8CF]">
                      <span className="text-[#66737A] block text-[10px]">Response Time</span>
                      <span className="font-semibold text-emerald-600">{venue.host.responseTime}</span>
                    </div>
                  )}
                  {venue.host.languages && venue.host.languages.length > 0 && (
                    <div className="p-2.5 rounded-lg bg-[#F4F1EA] border border-[#DDD8CF]">
                      <span className="text-[#66737A] block text-[10px]">Languages</span>
                      <span className="font-semibold text-[#26343D]">{venue.host.languages.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Primary Call to Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  id="sidebar-request-to-book-btn"
                  onClick={handleRequestBooking}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#A86445] text-white font-semibold text-sm shadow-sm hover:bg-[#8F5439] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Request to Book Space</span>
                </button>

                {venue.availableSlots && venue.availableSlots.length > 0 ? (
                  <button
                    id="sidebar-book-live-tour-btn"
                    onClick={() => onBookWalkthrough(venue)}
                    className="w-full py-2.5 px-4 rounded-xl bg-white border border-[#DDD8CF] text-[#26343D] font-semibold text-xs hover:bg-[#F4F1EA] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xs"
                  >
                    <Video className="w-3.5 h-3.5 text-[#A86445]" />
                    <span>Schedule Live Video Tour</span>
                  </button>
                ) : (
                  <div className="w-full py-2.5 px-3 rounded-xl bg-[#F4F1EA] border border-[#DDD8CF] text-[#66737A] text-[11px] text-center italic">
                    Live tour availability has not been added yet.
                  </div>
                )}
              </div>
            </div>

            {/* Real-Time Venue Policies & Specs */}
            <div className="bg-white border border-[#DDD8CF] rounded-2xl p-6 space-y-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#26343D] border-b border-[#DDD8CF] pb-2 flex items-center gap-2">
                <Info className="w-4 h-4 text-[#A86445]" />
                Operating Specifications & Rules
              </h3>

              <div className="space-y-3.5 text-xs">
                {venue.specs?.curfew && (
                  <div className="flex items-start gap-2.5">
                    <Clock className="w-4 h-4 text-[#A86445] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-[#26343D] block">Curfew & Sound Limits</span>
                      <p className="text-[#66737A] text-[11px]">{venue.specs.curfew}</p>
                    </div>
                  </div>
                )}

                {venue.specs?.parking && (
                  <div className="flex items-start gap-2.5">
                    <Car className="w-4 h-4 text-[#A86445] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-[#26343D] block">Parking & Valet</span>
                      <p className="text-[#66737A] text-[11px]">{venue.specs.parking}</p>
                    </div>
                  </div>
                )}

                {venue.specs?.cateringPolicy && (
                  <div className="flex items-start gap-2.5">
                    <Utensils className="w-4 h-4 text-[#A86445] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-[#26343D] block">Catering Policy</span>
                      <p className="text-[#66737A] text-[11px]">{venue.specs.cateringPolicy}</p>
                    </div>
                  </div>
                )}

                {venue.specs?.alcoholPolicy && (
                  <div className="flex items-start gap-2.5">
                    <Wine className="w-4 h-4 text-[#A86445] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-[#26343D] block">Bar & Alcohol Logistics</span>
                      <p className="text-[#66737A] text-[11px]">{venue.specs.alcoholPolicy}</p>
                    </div>
                  </div>
                )}

                {venue.specs?.powerSupply && (
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-[#A86445] shrink-0 mt-0.5" />
                    <div>
                      <span className="font-semibold text-[#26343D] block">Dedicated Power Supply</span>
                      <p className="text-[#66737A] text-[11px]">{venue.specs.powerSupply}</p>
                    </div>
                  </div>
                )}

                {!venue.specs?.curfew && !venue.specs?.parking && !venue.specs?.cateringPolicy && !venue.specs?.alcoholPolicy && !venue.specs?.powerSupply && (
                  <p className="text-[#66737A] text-xs italic">
                    Standard commercial event guidelines apply. Specific policies confirmed during walkthrough.
                  </p>
                )}
              </div>
            </div>

            {/* Estimated Event Investment Calculator */}
            <div className="bg-white border border-[#DDD8CF] rounded-2xl p-6 space-y-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#26343D] border-b border-[#DDD8CF] pb-2 flex items-center justify-between">
                <span>Budget & Package Estimator</span>
                <span className="text-[#A86445] font-mono text-[11px] font-semibold">Instant Estimate</span>
              </h3>

              {/* Guest Count Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-[#66737A]">
                  <span>Guest Count:</span>
                  <span className="font-bold text-[#A86445]">{calcGuests} Guests</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max={Math.max(venue.capacity.cocktail, 100)}
                  step="10"
                  value={calcGuests}
                  onChange={(e) => setCalcGuests(Number(e.target.value))}
                  className="w-full h-1.5 bg-[#DDD8CF] rounded-lg appearance-none cursor-pointer accent-[#A86445]"
                />
              </div>

              {/* Date Season selector */}
              <div className="space-y-1.5">
                <label className="block text-xs text-[#66737A]">Target Season & Timing</label>
                <select
                  value={calcEventType}
                  onChange={(e) => setCalcEventType(e.target.value as any)}
                  className="w-full bg-[#F4F1EA] text-[#26343D] text-xs p-2.5 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#A86445]"
                >
                  <option value="weekend-peak">Weekend Peak Season (Fri/Sat)</option>
                  <option value="weekday">Weekday Rate (Mon-Thu)</option>
                  <option value="off-season">Off-Peak Season Special Rate</option>
                </select>
              </div>

              {/* Cost Breakdown */}
              <div className="bg-[#F4F1EA] rounded-xl p-3.5 space-y-2 text-xs border border-[#DDD8CF]">
                <div className="flex items-center justify-between text-[#66737A]">
                  <span>Venue Rental:</span>
                  <span className="font-medium text-[#26343D]">{formatCurrency(calcPricing.venueRental, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-[#66737A]">
                  <span>Cleaning & Prep:</span>
                  <span className="font-medium text-[#26343D]">{formatCurrency(calcPricing.cleaningFee, currency)}</span>
                </div>
                <div className="flex items-center justify-between text-[#66737A]">
                  <span>Est. Catering / Bar Base:</span>
                  <span className="font-medium text-[#26343D]">{formatCurrency(calcPricing.estimatedHospitality, currency)}</span>
                </div>
                <div className="pt-2 border-t border-[#DDD8CF] flex items-center justify-between font-bold text-sm text-[#26343D]">
                  <span>Estimated Total:</span>
                  <span className="text-[#A86445]">{formatCurrency(calcPricing.totalEstimated, currency)}</span>
                </div>
              </div>

              <p className="text-[10px] text-[#66737A] text-center">
                *Official proposals are confirmed after live walkthrough consultation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

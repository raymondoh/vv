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
} from 'lucide-react';
import { Venue, WalkthroughClip } from '../types';
import { formatCurrency } from '../utils/formatters';

interface VenueDetailViewProps {
  venue: Venue;
  onBack: () => void;
  onBookWalkthrough: (venue: Venue) => void;
  onRequestToBook: (venue: Venue) => void;
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

  const [selectedClipId, setSelectedClipId] = useState<string>(
    hasRecordedWalkthrough ? venue.walkthroughClips[0]?.id : ''
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [ambientAudioOn, setAmbientAudioOn] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'video' | 'floorplan' | '360' | 'gallery'>(
    hasRecordedWalkthrough ? 'video' : 'gallery'
  );
  const [selectedCameraAngle, setSelectedCameraAngle] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [selectedGalleryImage, setSelectedGalleryImage] = useState<string>(
    venue.heroImage || (venue.galleryImages && venue.galleryImages[0]) || ''
  );

  // Pricing calculator state
  const [calcGuests, setCalcGuests] = useState<number>(120);
  const [calcEventType, setCalcEventType] = useState<'weekend-peak' | 'weekday' | 'off-season'>('weekend-peak');

  const videoRef = useRef<HTMLVideoElement>(null);

  const activeClip: WalkthroughClip | undefined = hasRecordedWalkthrough
    ? venue.walkthroughClips.find((c) => c.id === selectedClipId) || venue.walkthroughClips[0]
    : undefined;

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
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  }, [selectedClipId]);

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

            <button
              id="detail-top-tour-btn"
              onClick={() => onBookWalkthrough(venue)}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-white border border-[#DDD8CF] text-[#26343D] hover:bg-[#F4F1EA] font-semibold text-xs shadow-xs transition-all"
            >
              <Video className="w-3.5 h-3.5 text-[#A86445]" />
              <span>Live Tour</span>
            </button>

            <button
              id="detail-top-book-btn"
              onClick={() => onRequestToBook(venue)}
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
              {venue.aesthetic}
            </span>
            {hasRecordedWalkthrough && (
              <span className="flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Recorded Walkthrough Available
              </span>
            )}
            <span className="flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
              <Video className="w-3 h-3 text-blue-600" />
              Live Host Tours Available
            </span>
            <div className="flex items-center gap-1 text-xs text-[#26343D] font-semibold px-2.5 py-1 bg-white border border-[#DDD8CF] rounded-full shadow-xs">
              <Star className="w-3.5 h-3.5 fill-current text-amber-400" />
              <span>{(venue.rating || 5.0).toFixed(2)}</span>
              <span className="text-[#66737A]">({venue.reviewCount || 0} reviews)</span>
            </div>
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
                  {venue.capacity?.seatedBanquet || 0} seated / {venue.capacity?.cocktail || 0} cocktail
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid: Left Media & Details / Right Specs & Booking Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column */}
          <div className="lg:col-span-8 space-y-6">
            {/* View Mode & Layout Switcher Bar (Only if walkthrough exists) */}
            {hasRecordedWalkthrough && activeClip ? (
              <div className="bg-white border border-[#DDD8CF] rounded-2xl p-3 sm:p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-1.5 px-1">
                    <Layers className="w-3.5 h-3.5 text-[#A86445]" />
                    Select Layout Setup:
                  </span>

                  {/* View Mode Toggle */}
                  <div className="flex items-center bg-[#F4F1EA] p-1 rounded-xl border border-[#DDD8CF]">
                    <button
                      onClick={() => setViewMode('video')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        viewMode === 'video'
                          ? 'bg-[#A86445] text-white font-semibold shadow-xs'
                          : 'text-[#66737A] hover:text-[#26343D]'
                      }`}
                    >
                      4K Video Tour
                    </button>
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
                    <button
                      onClick={() => setViewMode('360')}
                      className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                        viewMode === '360'
                          ? 'bg-[#A86445] text-white font-semibold shadow-xs'
                          : 'text-[#66737A] hover:text-[#26343D]'
                      }`}
                    >
                      360° Panorama
                    </button>
                  </div>
                </div>

                {/* Layout Category Tabs */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {venue.walkthroughClips.map((clip) => {
                    const isSelected = clip.id === selectedClipId;
                    return (
                      <button
                        key={clip.id}
                        id={`clip-tab-${clip.id}`}
                        onClick={() => {
                          setSelectedClipId(clip.id);
                          setViewMode('video');
                        }}
                        className={`relative p-3 rounded-xl text-left border transition-all flex flex-col justify-between ${
                          isSelected
                            ? 'bg-[#F3E7DF] border-[#A86445] ring-1 ring-[#A86445]'
                            : 'bg-[#F4F1EA] border-[#DDD8CF] hover:border-[#A86445]/60'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-[#26343D] truncate">
                            {clip.title}
                          </span>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-[#A86445] animate-ping" />
                          )}
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[11px] text-[#66737A]">
                          <span>Max {clip.maxCapacityForLayout} guests</span>
                          <span className="text-[#A86445] font-semibold">{formatTime(clip.durationSec)}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Informational Banner for Zero Walkthroughs */
              <div className="bg-white border border-[#DDD8CF] rounded-2xl p-4 sm:p-5 flex items-start justify-between gap-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-[#F3E7DF] text-[#A86445] shrink-0 mt-0.5">
                    <Info className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#26343D]">
                      Recorded walkthrough not added yet
                    </h3>
                    <p className="text-xs text-[#66737A] mt-0.5 leading-relaxed">
                      Host {venue.host?.name || 'the coordinator'} hasn't uploaded a pre-recorded 4K walkthrough video for this listing yet. You can explore high-resolution space photography below, or schedule a 1-on-1 live video walkthrough.
                    </p>
                  </div>
                </div>

                <button
                  id="zero-walkthrough-live-btn"
                  onClick={() => onBookWalkthrough(venue)}
                  className="shrink-0 px-3.5 py-2 rounded-xl bg-[#26343D] text-white hover:bg-[#1E2930] text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
                >
                  <Video className="w-3.5 h-3.5 text-stone-300" />
                  <span>Book Live Tour</span>
                </button>
              </div>
            )}

            {/* Main Visual Media Display Container */}
            <div className="relative rounded-2xl overflow-hidden bg-black border border-[#DDD8CF] shadow-xl group">
              {hasRecordedWalkthrough && activeClip && viewMode === 'video' ? (
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
                        4K Ultra-HD Walkthrough
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
              ) : hasRecordedWalkthrough && activeClip && viewMode === 'floorplan' ? (
                /* Floor Plan Blueprint View */
                <div className="w-full aspect-[16/9] bg-[#1F2B33] p-6 flex flex-col justify-between relative overflow-hidden border border-[#2B3942]">
                  <div className="flex items-center justify-between border-b border-[#2B3942] pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                        Architectural Layout Diagram • {activeClip.title}
                      </h4>
                      <p className="text-xs text-stone-300">Total usable floor area: {(venue.specs?.squareFootage || 0).toLocaleString()} sq. ft.</p>
                    </div>
                    <span className="px-3 py-1 rounded bg-[#A86445]/20 text-[#D89B7F] font-mono text-xs border border-[#A86445]/40">
                      SCALE: 1/8" = 1'-0"
                    </span>
                  </div>

                  <div className="my-auto py-6 grid grid-cols-3 gap-4 text-center font-mono">
                    <div className="p-4 rounded-lg bg-[#27353F] border border-dashed border-[#3D505D] space-y-1">
                      <span className="text-xs text-amber-200 block font-bold">ZONE A: RECEPTION</span>
                      <p className="text-[11px] text-stone-300">Welcome bar & coat check</p>
                      <span className="text-[10px] text-stone-400">1,800 sq ft</span>
                    </div>

                    <div className="p-4 rounded-lg bg-[#2D3E49] border border-[#A86445] space-y-1 shadow-lg shadow-[#A86445]/10">
                      <span className="text-xs text-[#D89B7F] block font-bold">ZONE B: MAIN SPACE</span>
                      <p className="text-[11px] text-stone-200">Main hall & flexible seating</p>
                      <span className="text-[10px] text-[#D89B7F]">4,800 sq ft (Cap: {activeClip.maxCapacityForLayout})</span>
                    </div>

                    <div className="p-4 rounded-lg bg-[#27353F] border border-dashed border-[#3D505D] space-y-1">
                      <span className="text-xs text-emerald-300 block font-bold">ZONE C: BACKSTAGE & PREP</span>
                      <p className="text-[11px] text-stone-300">Commercial kitchen & green room</p>
                      <span className="text-[10px] text-stone-400">1,900 sq ft</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-stone-300 pt-3 border-t border-[#2B3942]">
                    <span>Ceiling Clearance: {venue.specs?.ceilingHeightFt || 0} ft</span>
                    <span>Restrooms: {venue.specs?.restroomCount || 0} Dedicated</span>
                    <span>Emergency Exits: 4 Calibrated</span>
                  </div>
                </div>
              ) : hasRecordedWalkthrough && activeClip && viewMode === '360' ? (
                /* 360 Panorama Interactive Simulation View */
                <div className="w-full aspect-[16/9] relative bg-black flex items-center justify-center overflow-hidden">
                  <img
                    src={venue.heroImage}
                    alt="360 Tour"
                    className="w-full h-full object-cover scale-125 filter brightness-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/60" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <div className="w-16 h-16 rounded-full bg-[#A86445]/30 border border-[#A86445] flex items-center justify-center text-white">
                      <Compass className="w-8 h-8" />
                    </div>
                    <h4 className="text-lg font-bold text-white tracking-tight">Interactive 360° Spatial Mode</h4>
                    <p className="text-xs text-stone-200 max-w-md">
                      Drag to look around or schedule a live video walkthrough with host {venue.host.name} to control the pan-tilt-zoom cameras in real time.
                    </p>
                    <button
                      onClick={() => onBookWalkthrough(venue)}
                      className="px-4 py-2 bg-[#A86445] text-white font-semibold text-xs rounded-xl hover:bg-[#8F5439] shadow-sm transition-all"
                    >
                      Request Live Camera Control Tour
                    </button>
                  </div>
                </div>
              ) : (
                /* Hero Gallery Media View for Zero-Walkthrough or Standard Gallery View */
                <div className="relative w-full aspect-[16/9] bg-stone-900 overflow-hidden flex items-center justify-center">
                  <img
                    src={selectedGalleryImage || venue.heroImage}
                    alt={venue.name}
                    className="w-full h-full object-cover transition-all duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
                  <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-white text-xs">
                    <span className="font-semibold bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg border border-white/10">
                      {venue.name} • {venue.aesthetic} Space
                    </span>
                    <button
                      onClick={() => onBookWalkthrough(venue)}
                      className="px-3.5 py-1.5 rounded-lg bg-[#A86445] text-white font-semibold text-xs shadow-md hover:bg-[#8F5439] flex items-center gap-1.5 transition-all"
                    >
                      <Video className="w-3.5 h-3.5" />
                      <span>Live Tour with Host</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Layout Milestones & Setup Highlights (Only if walkthrough exists) */}
            {hasRecordedWalkthrough && activeClip && (
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

            {/* Configured Spaces Breakdown (If venue has configured spaces) */}
            {venue.spaces && venue.spaces.length > 0 && (
              <div className="bg-white border border-[#DDD8CF] rounded-2xl p-6 space-y-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#26343D] flex items-center gap-2">
                    <Layers className="w-4 h-4 text-[#A86445]" />
                    Configured Spaces & Layout Areas ({venue.spaces.length})
                  </h3>
                  <span className="text-xs text-[#66737A]">Available for hire</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {venue.spaces.map((space) => (
                    <div
                      key={space.id}
                      className="p-4 rounded-xl bg-[#F4F1EA] border border-[#DDD8CF] space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-[#26343D]">{space.name}</h4>
                        {space.squareFootage && (
                          <span className="text-[10px] font-semibold text-[#66737A] px-2 py-0.5 bg-white rounded border border-[#DDD8CF]">
                            {space.squareFootage.toLocaleString()} sq ft
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#66737A] leading-relaxed line-clamp-2">
                        {space.description}
                      </p>
                      <div className="pt-2 border-t border-[#DDD8CF]/60 flex items-center justify-between text-[11px] text-[#66737A]">
                        <span>Capacity: <strong>{space.capacity?.cocktail || venue.capacity.cocktail}</strong> cocktail</span>
                        <span><strong>{space.capacity?.seatedBanquet || venue.capacity.seatedBanquet}</strong> seated</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Photo Gallery Grid */}
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
                <img
                  src={venue.host.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80'}
                  alt={venue.host.name}
                  className="w-13 h-13 rounded-full object-cover border-2 border-[#A86445] shadow-xs"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-bold text-[#26343D]">{venue.host.name}</h4>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online now" />
                  </div>
                  <p className="text-xs text-[#66737A]">{venue.host.title}</p>
                  <div className="flex items-center gap-1 text-[11px] text-[#26343D] font-semibold mt-0.5">
                    <Star className="w-3 h-3 fill-current text-amber-400" />
                    <span>{(venue.host.rating || 5.0).toFixed(2)} Rating</span>
                    <span className="text-[#66737A]">• {venue.host.totalToursConducted || 0} Tours Led</span>
                  </div>
                </div>
              </div>

              {venue.host.bio && (
                <p className="text-xs text-[#66737A] italic bg-[#F4F1EA] p-3 rounded-xl border border-[#DDD8CF] leading-relaxed">
                  "{venue.host.bio}"
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 text-[11px] text-[#66737A] pt-1">
                <div className="p-2.5 rounded-lg bg-[#F4F1EA] border border-[#DDD8CF]">
                  <span className="text-[#66737A] block text-[10px]">Response Time</span>
                  <span className="font-semibold text-emerald-600">{venue.host.responseTime || '< 2 hours'}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-[#F4F1EA] border border-[#DDD8CF]">
                  <span className="text-[#66737A] block text-[10px]">Languages</span>
                  <span className="font-semibold text-[#26343D]">{venue.host.languages?.join(', ') || 'English'}</span>
                </div>
              </div>

              {/* Primary Call to Action Buttons */}
              <div className="space-y-2 pt-1">
                <button
                  id="sidebar-request-to-book-btn"
                  onClick={() => onRequestToBook(venue)}
                  className="w-full py-3.5 px-4 rounded-xl bg-[#A86445] text-white font-semibold text-sm shadow-sm hover:bg-[#8F5439] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Request to Book Space</span>
                </button>

                <button
                  id="sidebar-book-live-tour-btn"
                  onClick={() => onBookWalkthrough(venue)}
                  className="w-full py-2.5 px-4 rounded-xl bg-white border border-[#DDD8CF] text-[#26343D] font-semibold text-xs hover:bg-[#F4F1EA] active:scale-95 transition-all flex items-center justify-center gap-2 shadow-xs"
                >
                  <Video className="w-3.5 h-3.5 text-[#A86445]" />
                  <span>Schedule Live Video Tour</span>
                </button>
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

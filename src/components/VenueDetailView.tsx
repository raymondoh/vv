import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  RotateCcw,
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
  PhoneCall,
  Star,
  Music,
  Share2,
  Heart,
  ChevronRight,
  Info,
  Maximize,
} from 'lucide-react';
import { Venue, WalkthroughClip, LayoutCategory } from '../types';

interface VenueDetailViewProps {
  venue: Venue;
  onBack: () => void;
  onBookWalkthrough: (venue: Venue) => void;
  isFavorited: boolean;
  onToggleFavorite: (venueId: string) => void;
}

export const VenueDetailView: React.FC<VenueDetailViewProps> = ({
  venue,
  onBack,
  onBookWalkthrough,
  isFavorited,
  onToggleFavorite,
}) => {
  const [selectedClipId, setSelectedClipId] = useState<string>(
    venue.walkthroughClips[0]?.id || ''
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [ambientAudioOn, setAmbientAudioOn] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [viewMode, setViewMode] = useState<'video' | 'floorplan' | '360'>('video');
  const [selectedCameraAngle, setSelectedCameraAngle] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  // Pricing calculator state
  const [calcGuests, setCalcGuests] = useState<number>(120);
  const [calcEventType, setCalcEventType] = useState<'weekend-peak' | 'weekday' | 'off-season'>('weekend-peak');

  const videoRef = useRef<HTMLVideoElement>(null);
  const ambientAudioRef = useRef<HTMLAudioElement | null>(null);

  const activeClip: WalkthroughClip =
    venue.walkthroughClips.find((c) => c.id === selectedClipId) ||
    venue.walkthroughClips[0];

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (activeClip && activeClip.cameraAngles.length > 0) {
      setSelectedCameraAngle(activeClip.cameraAngles[0]);
    }
  }, [venue.id]);

  useEffect(() => {
    if (activeClip) {
      setSelectedCameraAngle(activeClip.cameraAngles[0] || '');
      if (videoRef.current) {
        videoRef.current.currentTime = 0;
        videoRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  }, [selectedClipId]);

  // Sync video timeline
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
      setDuration(videoRef.current.duration || activeClip.durationSec);
    }
  };

  const handleSeek = (newTimeSec: number) => {
    if (videoRef.current) {
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

  // Pricing calculation
  const getCalculatedPrice = () => {
    let base = venue.pricing.startingPrice;
    if (calcEventType === 'weekend-peak') {
      base = Math.round(base * (venue.pricing.peakSeasonMultiplier || 1.25));
    } else if (calcEventType === 'off-season') {
      base = Math.round(base * 0.85);
    }
    const cleaning = venue.pricing.cleaningFee;
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

  return (
    <div className="min-h-screen bg-[#0d0f12] text-gray-100 pb-20">
      {/* Top Header Bar */}
      <div className="border-b border-[#232731] bg-[#11141b]/95 backdrop-blur-lg sticky top-20 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              id="back-to-venues-btn"
              onClick={onBack}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#191e28] text-xs font-semibold text-gray-300 hover:text-white hover:bg-[#222938] border border-[#2a3242] transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Directory</span>
            </button>
            <div className="hidden sm:block h-4 w-[1px] bg-gray-700" />
            <div className="hidden sm:flex items-center gap-2 text-xs text-gray-400">
              <span>{venue.location.city}</span>
              <ChevronRight className="w-3 h-3" />
              <span className="text-white font-medium truncate max-w-[200px]">{venue.name}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              id="share-venue-btn"
              onClick={handleShare}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#191e28] border border-[#2a3242] text-xs text-gray-300 hover:text-white transition-colors"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{copiedLink ? 'Link Copied!' : 'Share'}</span>
            </button>

            <button
              id="detail-fav-btn"
              onClick={() => onToggleFavorite(venue.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
                isFavorited
                  ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                  : 'bg-[#191e28] border-[#2a3242] text-gray-300 hover:text-white'
              }`}
            >
              <Heart className={`w-3.5 h-3.5 ${isFavorited ? 'fill-current text-rose-400' : ''}`} />
              <span className="hidden sm:inline">{isFavorited ? 'Saved' : 'Save'}</span>
            </button>

            <button
              id="detail-top-book-btn"
              onClick={() => onBookWalkthrough(venue)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-[#d4af37] to-[#b38622] text-black font-bold text-xs shadow-md shadow-[#d4af37]/20 hover:brightness-110 active:scale-95 transition-all"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Book Walkthrough</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-8">
        {/* Title and Key Badges */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-[#d4af37]/15 text-[#fae29c] border border-[#d4af37]/40 rounded-full">
              {venue.aesthetic}
            </span>
            <span className="flex items-center gap-1 px-3 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              Live Walkthroughs Available
            </span>
            <div className="flex items-center gap-1 text-xs text-amber-400 font-semibold px-2.5 py-1 bg-[#1a1f2c] border border-[#2b3342] rounded-full">
              <Star className="w-3.5 h-3.5 fill-current" />
              <span>{venue.rating.toFixed(2)}</span>
              <span className="text-gray-400">({venue.reviewCount} verified reviews)</span>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-4xl font-bold text-white font-serif-luxury tracking-tight">
                {venue.name}
              </h1>
              <p className="text-sm text-gray-400 flex items-center gap-1.5 mt-1">
                <MapPin className="w-4 h-4 text-amber-500 shrink-0" />
                <span>{venue.location.address}, {venue.location.neighborhood}, {venue.location.city}, {venue.location.state} {venue.location.zipCode}</span>
              </p>
            </div>

            <div className="flex items-center gap-4 bg-[#141822] border border-[#242b3a] p-3 rounded-xl">
              <div className="text-right">
                <span className="text-[10px] uppercase font-semibold text-gray-400 block">Starting Rate</span>
                <div className="text-xl font-bold text-[#fae29c]">
                  ${venue.pricing.startingPrice.toLocaleString()}
                  <span className="text-xs font-normal text-gray-400"> /day</span>
                </div>
              </div>
              <div className="h-8 w-[1px] bg-gray-700" />
              <div>
                <span className="text-[10px] uppercase font-semibold text-gray-400 block">Max Guests</span>
                <span className="text-sm font-semibold text-white">
                  {venue.capacity.seatedBanquet} seated / {venue.capacity.cocktail} cocktail
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid: Left Video Player Area / Right Specs & Booking Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Video Walkthrough Studio */}
          <div className="lg:col-span-8 space-y-6">
            {/* View Mode & Layout Switcher Bar */}
            <div className="bg-[#141822] border border-[#252c3c] rounded-2xl p-2 sm:p-3 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-300 flex items-center gap-1.5 px-2">
                  <Layers className="w-3.5 h-3.5 text-[#d4af37]" />
                  Select Layout Setup:
                </span>

                {/* View Mode Toggle (Video vs Blueprint Floorplan) */}
                <div className="flex items-center bg-[#0d1017] p-1 rounded-xl border border-[#222836]">
                  <button
                    onClick={() => setViewMode('video')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      viewMode === 'video'
                        ? 'bg-[#d4af37] text-black font-semibold shadow'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    4K Video Tour
                  </button>
                  <button
                    onClick={() => setViewMode('floorplan')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      viewMode === 'floorplan'
                        ? 'bg-[#d4af37] text-black font-semibold shadow'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    Floor Plan
                  </button>
                  <button
                    onClick={() => setViewMode('360')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      viewMode === '360'
                        ? 'bg-[#d4af37] text-black font-semibold shadow'
                        : 'text-gray-400 hover:text-white'
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
                          ? 'bg-gradient-to-br from-[#241e12] to-[#171922] border-[#d4af37] ring-1 ring-[#d4af37]'
                          : 'bg-[#181d28] border-[#293142] hover:border-gray-500 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white truncate">
                          {clip.title}
                        </span>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-[#d4af37] animate-ping" />
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-gray-400">
                        <span>Max {clip.maxCapacityForLayout} guests</span>
                        <span className="text-[#fae29c] font-medium">{formatTime(clip.durationSec)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Video Player Display Container */}
            <div className="relative rounded-2xl overflow-hidden bg-black border border-[#2a3243] shadow-2xl group">
              {viewMode === 'video' && (
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
                  {/* Top Bar inside video */}
                  <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 via-black/30 to-transparent flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-md bg-red-600/90 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-lg">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        4K Ultra-HD Walkthrough
                      </span>
                      <span className="px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md text-[#fae29c] text-xs font-semibold border border-amber-500/30">
                        {activeClip.title}
                      </span>
                    </div>

                    {/* Camera Angle Selector */}
                    <div className="pointer-events-auto flex items-center gap-1 bg-black/70 backdrop-blur-md p-1 rounded-lg border border-white/10 text-xs">
                      <Compass className="w-3.5 h-3.5 text-[#d4af37] ml-1.5" />
                      <select
                        value={selectedCameraAngle}
                        onChange={(e) => setSelectedCameraAngle(e.target.value)}
                        className="bg-transparent text-gray-200 text-xs px-2 py-0.5 rounded focus:outline-none cursor-pointer"
                      >
                        {activeClip.cameraAngles.map((angle) => (
                          <option key={angle} value={angle} className="bg-[#161a22] text-white">
                            Angle: {angle}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Big Center Play/Pause button when paused */}
                  {!isPlaying && (
                    <div
                      onClick={togglePlay}
                      className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer"
                    >
                      <div className="w-20 h-20 rounded-full bg-[#d4af37]/90 text-black flex items-center justify-center shadow-2xl shadow-[#d4af37]/40 transform hover:scale-110 transition-transform">
                        <Play className="w-8 h-8 fill-current ml-1" />
                      </div>
                    </div>
                  )}

                  {/* Bottom Video Controls Bar */}
                  <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 via-black/50 to-transparent space-y-2">
                    {/* Scrubbable Progress Bar with Milestone Markers */}
                    <div className="relative group/timeline py-2 cursor-pointer">
                      <div
                        className="h-1.5 w-full bg-white/20 rounded-full overflow-hidden relative"
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const pos = (e.clientX - rect.left) / rect.width;
                          handleSeek(pos * (duration || activeClip.durationSec));
                        }}
                      >
                        <div
                          className="h-full bg-gradient-to-r from-[#d4af37] to-[#fae29c] rounded-full transition-all duration-100"
                          style={{
                            width: `${((currentTime || 0) / (duration || activeClip.durationSec || 1)) * 100}%`,
                          }}
                        />
                      </div>

                      {/* Milestone Dots */}
                      {activeClip.milestones.map((m) => {
                        const pct = (m.timeSec / (activeClip.durationSec || 80)) * 100;
                        return (
                          <button
                            key={m.timeSec}
                            onClick={() => handleSeek(m.timeSec)}
                            title={`${m.label}: ${m.description}`}
                            style={{ left: `${pct}%` }}
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-amber-300 border-2 border-black hover:scale-150 transition-transform"
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

                        <span className="text-gray-300 font-mono">
                          {formatTime(currentTime)} / {formatTime(duration || activeClip.durationSec)}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Ambient Lounge Sound Synthesizer toggle */}
                        <button
                          id="ambient-audio-toggle-btn"
                          onClick={() => setAmbientAudioOn(!ambientAudioOn)}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                            ambientAudioOn
                              ? 'bg-[#d4af37] text-black font-semibold'
                              : 'bg-white/10 text-gray-300 hover:text-white'
                          }`}
                          title="Toggle ambient jazz cocktail background audio"
                        >
                          <Music className="w-3 h-3" />
                          <span>{ambientAudioOn ? 'Ambient Audio ON' : 'Add Venue Ambience'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Floor Plan Blueprint View */}
              {viewMode === 'floorplan' && (
                <div className="w-full aspect-[16/9] bg-[#0d121c] p-6 flex flex-col justify-between relative overflow-hidden border border-[#2a3854]">
                  <div className="flex items-center justify-between border-b border-[#1f2b42] pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-white font-mono uppercase tracking-wider">
                        Architectural Layout Diagram • {activeClip.title}
                      </h4>
                      <p className="text-xs text-gray-400">Total usable floor area: {venue.specs.squareFootage.toLocaleString()} sq. ft.</p>
                    </div>
                    <span className="px-3 py-1 rounded bg-[#d4af37]/20 text-[#fae29c] font-mono text-xs border border-[#d4af37]/40">
                      SCALE: 1/8" = 1'-0"
                    </span>
                  </div>

                  {/* Simulated Blueprint Graphic */}
                  <div className="my-auto py-6 grid grid-cols-3 gap-4 text-center font-mono">
                    <div className="p-4 rounded-lg bg-[#141b29] border border-dashed border-[#34466d] space-y-1">
                      <span className="text-xs text-amber-400 block font-bold">ZONE A: RECEPTION</span>
                      <p className="text-[11px] text-gray-400">Welcome bar & coat check</p>
                      <span className="text-[10px] text-gray-500">1,800 sq ft</span>
                    </div>

                    <div className="p-4 rounded-lg bg-[#1b2438] border border-[#d4af37] space-y-1 shadow-lg shadow-[#d4af37]/10">
                      <span className="text-xs text-[#fae29c] block font-bold">ZONE B: MAIN BALLROOM</span>
                      <p className="text-[11px] text-gray-300">Dining tables & oak dance floor</p>
                      <span className="text-[10px] text-[#fae29c]">4,800 sq ft (Cap: {activeClip.maxCapacityForLayout})</span>
                    </div>

                    <div className="p-4 rounded-lg bg-[#141b29] border border-dashed border-[#34466d] space-y-1">
                      <span className="text-xs text-emerald-400 block font-bold">ZONE C: BACKSTAGE & PREP</span>
                      <p className="text-[11px] text-gray-400">Commercial kitchen & green room</p>
                      <span className="text-[10px] text-gray-500">1,900 sq ft</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-400 pt-3 border-t border-[#1f2b42]">
                    <span>Ceiling Clearance: {venue.specs.ceilingHeightFt} ft</span>
                    <span>Restrooms: {venue.specs.restroomCount} Dedicated</span>
                    <span>Emergency Exits: 4 Calibrated</span>
                  </div>
                </div>
              )}

              {/* 360 Panorama Interactive Simulation View */}
              {viewMode === '360' && (
                <div className="w-full aspect-[16/9] relative bg-black flex items-center justify-center overflow-hidden">
                  <img
                    src={venue.heroImage}
                    alt="360 Tour"
                    className="w-full h-full object-cover scale-125 animate-pulse-glow filter brightness-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-black/60" />
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <div className="w-16 h-16 rounded-full bg-[#d4af37]/30 border border-[#d4af37] flex items-center justify-center text-[#fae29c] animate-bounce">
                      <Compass className="w-8 h-8" />
                    </div>
                    <h4 className="text-lg font-bold text-white font-serif-luxury">Interactive 360° Spatial Mode</h4>
                    <p className="text-xs text-gray-300 max-w-md">
                      Drag to look around or schedule a live video walkthrough with host {venue.host.name} to control the pan-tilt-zoom cameras in real time.
                    </p>
                    <button
                      onClick={() => onBookWalkthrough(venue)}
                      className="px-4 py-2 bg-[#d4af37] text-black font-bold text-xs rounded-xl hover:shadow-lg shadow-[#d4af37]/20"
                    >
                      Request Live Camera Control Tour
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Layout Milestones & Setup Highlights */}
            <div className="bg-[#141822] border border-[#252c3c] rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wider text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#d4af37]" />
                  Walkthrough Key Checkpoints & Layout Highlights
                </h3>
                <span className="text-xs text-gray-400 font-medium">Click checkpoint to jump in video</span>
              </div>

              {/* Milestones grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {activeClip.milestones.map((milestone) => (
                  <button
                    key={milestone.timeSec}
                    onClick={() => {
                      setViewMode('video');
                      handleSeek(milestone.timeSec);
                    }}
                    className="p-3 rounded-xl bg-[#1a1f2c] border border-[#2b3342] text-left hover:border-[#d4af37]/60 hover:bg-[#202738] transition-all group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-[#fae29c] group-hover:text-white transition-colors">
                        {milestone.label}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#10131a] text-gray-400">
                        {formatTime(milestone.timeSec)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed">{milestone.description}</p>
                  </button>
                ))}
              </div>

              {/* Setup Highlights Chips */}
              <div className="pt-2 border-t border-[#232836] flex items-center gap-2 flex-wrap text-xs">
                <span className="text-gray-400 font-semibold">Included in this setup:</span>
                {activeClip.setupHighlights.map((hl, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-md bg-[#1d2331] text-gray-200 border border-[#2e374a]"
                  >
                    ✓ {hl}
                  </span>
                ))}
              </div>
            </div>

            {/* Photo Gallery Grid */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                High-Resolution Gallery ({venue.galleryImages.length} Perspectives)
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {venue.galleryImages.map((img, idx) => (
                  <div
                    key={idx}
                    className="aspect-[4/3] rounded-xl overflow-hidden border border-[#242c3c] bg-black group relative cursor-pointer"
                  >
                    <img
                      src={img}
                      alt={`${venue.name} perspective ${idx + 1}`}
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Maximize className="w-5 h-5 text-white" />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Comprehensive Amenities Checklist */}
            <div className="bg-[#141822] border border-[#252c3c] rounded-2xl p-6 space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-white">
                Venue Amenities & Facilities Included
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {venue.amenities.map((amenity, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#191e2a] border border-[#262f3f]"
                  >
                    <CheckCircle2 className="w-4 h-4 text-[#d4af37] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-semibold text-white block">{amenity.name}</span>
                      <span className="text-[10px] text-gray-400 uppercase tracking-wider">{amenity.category}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Real-Time Specs, Dynamic Pricing Calculator & Booking Widget */}
          <div className="lg:col-span-4 space-y-6">
            {/* Host Card */}
            <div className="bg-[#141822] border border-[#283042] rounded-2xl p-5 space-y-4 shadow-xl">
              <div className="flex items-center gap-3">
                <img
                  src={venue.host.avatar}
                  alt={venue.host.name}
                  className="w-13 h-13 rounded-full object-cover border-2 border-[#d4af37] shadow-md shadow-[#d4af37]/20"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <h4 className="text-sm font-bold text-white">{venue.host.name}</h4>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" title="Online now" />
                  </div>
                  <p className="text-xs text-gray-400">{venue.host.title}</p>
                  <div className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold mt-0.5">
                    <Star className="w-3 h-3 fill-current" />
                    <span>{venue.host.rating.toFixed(2)} Rating</span>
                    <span className="text-gray-500">• {venue.host.totalToursConducted} Tours Led</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-gray-300 italic bg-[#181d28] p-3 rounded-xl border border-[#273042] leading-relaxed">
                "{venue.host.bio}"
              </p>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-300 pt-1">
                <div className="p-2 rounded-lg bg-[#191e2b] border border-[#262f40]">
                  <span className="text-gray-400 block text-[10px]">Response Time</span>
                  <span className="font-semibold text-emerald-400">{venue.host.responseTime}</span>
                </div>
                <div className="p-2 rounded-lg bg-[#191e2b] border border-[#262f40]">
                  <span className="text-gray-400 block text-[10px]">Languages</span>
                  <span className="font-semibold text-white">{venue.host.languages.join(', ')}</span>
                </div>
              </div>

              {/* Primary Call to Action Button */}
              <button
                id="sidebar-book-live-tour-btn"
                onClick={() => onBookWalkthrough(venue)}
                className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#d4af37] via-[#e5c064] to-[#b38622] text-black font-bold text-sm shadow-xl shadow-[#d4af37]/20 hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                <Calendar className="w-4 h-4" />
                <span>Book Live Video Walkthrough</span>
              </button>
            </div>

            {/* Real-Time Venue Policies & Specs */}
            <div className="bg-[#141822] border border-[#283042] rounded-2xl p-5 space-y-4 shadow-xl">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-[#252c3c] pb-2 flex items-center gap-2">
                <Info className="w-4 h-4 text-[#d4af37]" />
                Operating Specifications & Rules
              </h3>

              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <Clock className="w-4 h-4 text-[#d4af37] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-gray-200 block">Curfew & Sound Limits</span>
                    <p className="text-gray-400 text-[11px]">{venue.specs.curfew}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Car className="w-4 h-4 text-[#d4af37] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-gray-200 block">Parking & Valet</span>
                    <p className="text-gray-400 text-[11px]">{venue.specs.parking}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Utensils className="w-4 h-4 text-[#d4af37] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-gray-200 block">Catering Policy</span>
                    <p className="text-gray-400 text-[11px]">{venue.specs.cateringPolicy}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <Wine className="w-4 h-4 text-[#d4af37] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-gray-200 block">Bar & Alcohol Logistics</span>
                    <p className="text-gray-400 text-[11px]">{venue.specs.alcoholPolicy}</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#d4af37] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold text-gray-200 block">Dedicated Power Supply</span>
                    <p className="text-gray-400 text-[11px]">{venue.specs.powerSupply}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Estimated Event Investment Calculator */}
            <div className="bg-[#141822] border border-[#283042] rounded-2xl p-5 space-y-4 shadow-xl">
              <h3 className="text-xs font-bold uppercase tracking-wider text-white border-b border-[#252c3c] pb-2 flex items-center justify-between">
                <span>Budget & Package Estimator</span>
                <span className="text-[#fae29c] font-mono text-[11px]">Instant Estimate</span>
              </h3>

              {/* Guest Count Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs text-gray-300">
                  <span>Guest Count:</span>
                  <span className="font-bold text-[#fae29c]">{calcGuests} Guests</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max={venue.capacity.cocktail}
                  step="10"
                  value={calcGuests}
                  onChange={(e) => setCalcGuests(Number(e.target.value))}
                  className="w-full h-1.5 bg-[#252c3c] rounded-lg appearance-none cursor-pointer accent-[#d4af37]"
                />
              </div>

              {/* Date Season selector */}
              <div className="space-y-1.5">
                <label className="block text-xs text-gray-300">Target Season & Timing</label>
                <select
                  value={calcEventType}
                  onChange={(e) => setCalcEventType(e.target.value as any)}
                  className="w-full bg-[#181e2b] text-white text-xs p-2.5 rounded-xl border border-[#2b3547] focus:outline-none focus:border-[#d4af37]"
                >
                  <option value="weekend-peak">Weekend Peak Season (Fri/Sat)</option>
                  <option value="weekday">Weekday Corporate Rate (Mon-Thu)</option>
                  <option value="off-season">Off-Peak Season Special Rate</option>
                </select>
              </div>

              {/* Cost Breakdown */}
              <div className="bg-[#181e2b] rounded-xl p-3.5 space-y-2 text-xs border border-[#263042]">
                <div className="flex items-center justify-between text-gray-300">
                  <span>Venue Rental:</span>
                  <span>${calcPricing.venueRental.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-gray-300">
                  <span>Cleaning & Prep:</span>
                  <span>${calcPricing.cleaningFee.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between text-gray-300">
                  <span>Est. Catering / Bar Base:</span>
                  <span>${calcPricing.estimatedHospitality.toLocaleString()}</span>
                </div>
                <div className="pt-2 border-t border-[#263042] flex items-center justify-between font-bold text-sm text-white">
                  <span>Estimated Total:</span>
                  <span className="text-[#fae29c]">${calcPricing.totalEstimated.toLocaleString()}</span>
                </div>
              </div>

              <p className="text-[10px] text-gray-500 text-center">
                *Official proposals are confirmed after live walkthrough consultation.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

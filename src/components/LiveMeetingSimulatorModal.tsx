import React, { useState } from 'react';
import {
  X,
  Mic,
  MicOff,
  Video as VideoIcon,
  VideoOff,
  PhoneOff,
  MessageSquare,
  Sparkles,
  Share2,
  Users,
  Send,
  Layers,
  Compass,
} from 'lucide-react';
import { WalkthroughBooking, Venue } from '../types';
import { VENUES } from '../data/venues';

interface LiveMeetingSimulatorModalProps {
  booking: WalkthroughBooking;
  isOpen: boolean;
  onClose: () => void;
}

export const LiveMeetingSimulatorModal: React.FC<LiveMeetingSimulatorModalProps> = ({
  booking,
  isOpen,
  onClose,
}) => {
  const [micActive, setMicActive] = useState(true);
  const [videoActive, setVideoActive] = useState(true);
  const [activeLayout, setActiveLayout] = useState<'banquet' | 'cocktail' | 'theater'>('banquet');
  const [messages, setMessages] = useState<Array<{ sender: string; text: string; time: string }>>([
    {
      sender: booking.hostName,
      text: `Hello ${booking.clientName}! Welcome to your live walkthrough for ${booking.venueName}. I have the 3D space open for your ${booking.eventType} vision. Feel free to ask me to switch camera angles or highlight specific catering zones!`,
      time: 'Just now',
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');

  if (!isOpen) return null;

  const currentVenue = VENUES.find((v) => v.id === booking.venueId) || VENUES[0];

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userText = inputMessage;
    const newMsg = {
      sender: booking.clientName || 'You',
      text: userText,
      time: 'Just now',
    };

    setMessages((prev) => [...prev, newMsg]);
    setInputMessage('');

    // Host simulated reply after 1s
    setTimeout(() => {
      let hostReply = `Great question regarding ${userText.toLowerCase().includes('catering') ? 'the prep kitchen' : 'the layout'}! I am rotating the live feed now to show you that exact vantage point.`;
      if (userText.toLowerCase().includes('cocktail') || userText.toLowerCase().includes('bar')) {
        setActiveLayout('cocktail');
        hostReply = 'Switching our shared live view to the Cocktail Hour high-top lounge arrangement!';
      } else if (userText.toLowerCase().includes('banquet') || userText.toLowerCase().includes('table')) {
        setActiveLayout('banquet');
        hostReply = 'Switching to the Banquet gala seated view with floral chandelier rigging!';
      }

      setMessages((prev) => [
        ...prev,
        {
          sender: booking.hostName,
          text: hostReply,
          time: 'Just now',
        },
      ]);
    }, 1100);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-md">
      <div className="relative w-full max-w-5xl bg-[#F4F1EA] border border-[#DDD8CF] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[90vh]">
        {/* Call Top Header */}
        <div className="px-5 py-3.5 bg-[#F4F1EA] border-b border-[#DDD8CF] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#26343D] font-serif-luxury">
                  Live Walkthrough • {booking.venueName}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#F3E7DF] text-[#A86445] border border-[#A86445]/30 font-mono font-bold">
                  ROOM: {booking.meetingCode}
                </span>
              </div>
              <p className="text-xs text-[#66737A]">Host: {booking.hostName} (Director of Private Events)</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex text-xs text-[#66737A] px-3 py-1 bg-white rounded-lg border border-[#DDD8CF]">
              4K Spatial Stream Active (60 FPS)
            </span>
            <button
              onClick={onClose}
              className="p-1.5 text-[#66737A] hover:text-[#26343D] rounded-lg hover:bg-rose-50 hover:text-rose-600 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Call Body: Stream Area + Chat Panel */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden bg-black">
          {/* Main Video Stream Area (8 cols) */}
          <div className="lg:col-span-8 relative bg-black flex flex-col justify-between overflow-hidden">
            {/* Main Stage Video Feed */}
            <div className="relative w-full h-full">
              <img
                src={currentVenue.heroImage}
                alt="Live Video Walkthrough Feed"
                className="w-full h-full object-cover filter brightness-95"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30" />

              {/* Host Picture-in-Picture Webcam */}
              <div className="absolute top-4 left-4 w-36 sm:w-44 aspect-[4/3] rounded-xl overflow-hidden border-2 border-[#A86445] shadow-2xl bg-black">
                <img
                  src={currentVenue.host.avatar}
                  alt={booking.hostName}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-1.5 left-1.5 right-1.5 px-2 py-0.5 bg-black/75 backdrop-blur-md rounded text-[10px] text-white flex items-center justify-between">
                  <span className="truncate">{booking.hostName} (Host)</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
              </div>

              {/* Live Switcher Overlay inside call */}
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 bg-black/80 backdrop-blur-md p-1.5 rounded-xl border border-white/20 text-xs">
                  <span className="text-[11px] text-gray-300 font-semibold px-2">Live Setup:</span>
                  <button
                    onClick={() => setActiveLayout('banquet')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      activeLayout === 'banquet' ? 'bg-[#A86445] text-white font-bold' : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    Banquet
                  </button>
                  <button
                    onClick={() => setActiveLayout('cocktail')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                      activeLayout === 'cocktail' ? 'bg-[#A86445] text-white font-bold' : 'text-gray-300 hover:text-white'
                    }`}
                  >
                    Cocktail Lounge
                  </button>
                </div>

                <div className="px-3 py-1.5 bg-black/80 backdrop-blur-md rounded-xl border border-white/20 text-xs text-[#F4F1EA] font-mono">
                  <span>LIVE PTZ CAM 01 • FOYER NORTH</span>
                </div>
              </div>
            </div>
          </div>

          {/* Chat & Questions Side Panel (4 cols) */}
          <div className="lg:col-span-4 bg-[#F4F1EA] border-l border-[#DDD8CF] flex flex-col justify-between">
            <div className="p-3.5 border-b border-[#DDD8CF] bg-white flex items-center justify-between text-xs text-[#26343D]">
              <span className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-[#A86445]">
                <MessageSquare className="w-3.5 h-3.5" />
                Live Host Consultation Chat
              </span>
              <span className="text-[#66737A] text-[11px]">2 In Room</span>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-xl text-xs space-y-1 ${
                    msg.sender === booking.hostName
                      ? 'bg-white border border-[#DDD8CF] text-[#26343D] shadow-xs'
                      : 'bg-[#F3E7DF] border border-[#A86445]/40 text-[#26343D] ml-4 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-semibold">
                    <span className="text-[#A86445]">
                      {msg.sender}
                    </span>
                    <span className="text-[#66737A]">{msg.time}</span>
                  </div>
                  <p className="leading-relaxed text-[11px] text-[#66737A]">{msg.text}</p>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-[#DDD8CF] bg-white">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Ask host a question (e.g. 'Can we see the presentation screen?')..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="flex-1 bg-[#F4F1EA] text-[#26343D] text-xs px-3 py-2 rounded-xl border border-[#DDD8CF] focus:bg-white focus:outline-none focus:border-[#A86445] placeholder:text-[#66737A]/70"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim()}
                  className="p-2 bg-[#A86445] text-white rounded-xl hover:bg-[#8F5439] disabled:opacity-50 transition-all shadow-xs"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Bottom Call Controls Dock */}
        <div className="px-6 py-3.5 bg-[#F4F1EA] border-t border-[#DDD8CF] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMicActive(!micActive)}
              className={`p-2.5 sm:px-4 sm:py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all border ${
                micActive
                  ? 'bg-white border-[#DDD8CF] text-[#26343D] hover:bg-[#F4F1EA] shadow-xs'
                  : 'bg-rose-600 border-rose-700 text-white shadow-xs'
              }`}
            >
              {micActive ? <Mic className="w-4 h-4 text-[#A86445]" /> : <MicOff className="w-4 h-4" />}
              <span className="hidden sm:inline">{micActive ? 'Mute Mic' : 'Unmute'}</span>
            </button>

            <button
              onClick={() => setVideoActive(!videoActive)}
              className={`p-2.5 sm:px-4 sm:py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all border ${
                videoActive
                  ? 'bg-white border-[#DDD8CF] text-[#26343D] hover:bg-[#F4F1EA] shadow-xs'
                  : 'bg-rose-600 border-rose-700 text-white shadow-xs'
              }`}
            >
              {videoActive ? <VideoIcon className="w-4 h-4 text-[#A86445]" /> : <VideoOff className="w-4 h-4" />}
              <span className="hidden sm:inline">{videoActive ? 'Stop Video' : 'Start Video'}</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-2 shadow-xs transition-all"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Leave Walkthrough</span>
          </button>
        </div>
      </div>
    </div>
  );
};

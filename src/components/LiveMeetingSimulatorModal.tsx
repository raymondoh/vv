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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/90 backdrop-blur-md">
      <div className="relative w-full max-w-5xl bg-[#0e1117] border border-[#262c3b] rounded-2xl shadow-2xl overflow-hidden flex flex-col h-[90vh]">
        {/* Call Top Header */}
        <div className="px-5 py-3.5 bg-[#141822] border-b border-[#232836] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white font-serif-luxury">
                  Live Walkthrough • {booking.venueName}
                </h3>
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                  ROOM: {booking.meetingCode}
                </span>
              </div>
              <p className="text-xs text-gray-400">Host: {booking.hostName} (Director of Private Events)</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-flex text-xs text-gray-400 px-3 py-1 bg-[#1c2230] rounded-lg border border-[#283144]">
              4K Spatial Stream Active (60 FPS)
            </span>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-rose-950/40 hover:text-rose-300"
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
              <div className="absolute top-4 left-4 w-36 sm:w-44 aspect-[4/3] rounded-xl overflow-hidden border-2 border-[#d4af37] shadow-2xl bg-[#141822]">
                <img
                  src={currentVenue.host.avatar}
                  alt={booking.hostName}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-1.5 left-1.5 right-1.5 px-2 py-0.5 bg-black/70 backdrop-blur-md rounded text-[10px] text-white flex items-center justify-between">
                  <span className="truncate">{booking.hostName} (Host)</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
              </div>

              {/* Live Switcher Overlay inside call */}
              <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-1.5 bg-black/80 backdrop-blur-md p-1.5 rounded-xl border border-white/10 text-xs">
                  <span className="text-[11px] text-gray-400 font-semibold px-2">Live Setup:</span>
                  <button
                    onClick={() => setActiveLayout('banquet')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      activeLayout === 'banquet' ? 'bg-[#d4af37] text-black' : 'text-gray-300'
                    }`}
                  >
                    Banquet
                  </button>
                  <button
                    onClick={() => setActiveLayout('cocktail')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      activeLayout === 'cocktail' ? 'bg-[#d4af37] text-black' : 'text-gray-300'
                    }`}
                  >
                    Cocktail Lounge
                  </button>
                </div>

                <div className="px-3 py-1.5 bg-black/80 backdrop-blur-md rounded-xl border border-white/10 text-xs text-[#fae29c] font-mono">
                  <span>LIVE PTZ CAM 01 • FOYER NORTH</span>
                </div>
              </div>
            </div>
          </div>

          {/* Chat & Questions Side Panel (4 cols) */}
          <div className="lg:col-span-4 bg-[#11151e] border-l border-[#232938] flex flex-col justify-between">
            <div className="p-3.5 border-b border-[#212635] flex items-center justify-between text-xs text-gray-300">
              <span className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-[#fae29c]">
                <MessageSquare className="w-3.5 h-3.5" />
                Live Host Consultation Chat
              </span>
              <span className="text-gray-500">2 In Room</span>
            </div>

            {/* Chat Messages */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={`p-3 rounded-xl text-xs space-y-1 ${
                    msg.sender === booking.hostName
                      ? 'bg-[#181d28] border border-[#273042] text-gray-200'
                      : 'bg-gradient-to-r from-[#292212] to-[#1f190e] border border-[#d4af37]/40 text-[#fae29c] ml-4'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-semibold">
                    <span className={msg.sender === booking.hostName ? 'text-amber-400' : 'text-[#f3d98b]'}>
                      {msg.sender}
                    </span>
                    <span className="text-gray-500">{msg.time}</span>
                  </div>
                  <p className="leading-relaxed text-[11px]">{msg.text}</p>
                </div>
              ))}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="p-3 border-t border-[#212635] bg-[#141822]">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Ask host a question (e.g. 'Can we see the bridal suite?')..."
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  className="flex-1 bg-[#1a1f2b] text-white text-xs px-3 py-2 rounded-xl border border-[#293243] focus:outline-none focus:border-[#d4af37]"
                />
                <button
                  type="submit"
                  disabled={!inputMessage.trim()}
                  className="p-2 bg-[#d4af37] text-black rounded-xl hover:brightness-110 disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Bottom Call Controls Dock */}
        <div className="px-6 py-3.5 bg-[#141822] border-t border-[#232836] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMicActive(!micActive)}
              className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                micActive ? 'bg-[#1e2432] text-white hover:bg-[#272f40]' : 'bg-rose-600 text-white'
              }`}
            >
              {micActive ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
              <span className="hidden sm:inline">{micActive ? 'Mute Mic' : 'Unmute'}</span>
            </button>

            <button
              onClick={() => setVideoActive(!videoActive)}
              className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                videoActive ? 'bg-[#1e2432] text-white hover:bg-[#272f40]' : 'bg-rose-600 text-white'
              }`}
            >
              {videoActive ? <VideoIcon className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
              <span className="hidden sm:inline">{videoActive ? 'Stop Video' : 'Start Video'}</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-600/30 transition-all"
          >
            <PhoneOff className="w-4 h-4" />
            <span>Leave Walkthrough</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// The one place the app imports icons from.
//
// Two sets live behind this door and call sites cannot tell them apart:
//
//   HOUSE (41) — Urganize's own marks, drawn in the Adinkra/Kuba voice of
//   the brand's textile reference. See ./house.tsx for the four rules that
//   decide what belongs, and for the two directions that were drawn, tested at
//   real icon size, and rejected on evidence.
//
//   PASSTHROUGH (59) — still lucide, re-exported unchanged. The long tail:
//   admin tables, rare settings rows, one-off empty states. Drawing all
//   98 would mean hand-cutting 68 marks for surfaces almost nobody opens,
//   several of which lucide already draws better than we would.
//
// They do not clash, because globals.css pulls every lucide glyph to the house
// stroke weight (lucide ships stroke-width as an ATTRIBUTE and CSS beats
// presentation attributes, so one rule reaches all of them). The long tail
// therefore reads as the same family without being redrawn.
//
// WHY A SHIM RATHER THAN EDITING EVERY CALL SITE. 98 distinct icons are
// imported across ~130 files, most files mixing covered and uncovered names.
// Routing everything through one module means a call site only ever changes
// its import PATH — no import splitting, no per-file judgement about which set
// a name belongs to, and no way to get that judgement wrong.
//
// House icons are forwardRef components with lucide's exact prop shape, so the
// two sets are interchangeable in a typed array, prop or map — see the note on
// icon() in ./house.tsx for the build failure that made that necessary.
//
// ADDING AN ICON: if it is already here, import it. If it is new to the app,
// add it to the passthrough list below — icons-registry.test.ts fails the build
// if any name imported from this module is not exported by it. To promote one
// to the house set, draw it in house.tsx and delete it from the passthrough
// list; the export name stays the same, so no call site changes.

export type { LucideIcon, LucideProps } from 'lucide-react';

/* House marks — drawn here. */
export {
  AlertCircle, AlertTriangle, ArrowLeft, BellRing,
  CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronRight, ClipboardList, Copy, Download,
  ExternalLink, Inbox, ListMusic, Loader2,
  Lock, Mail, MessageCircle, Music,
  Plus, Radio, RefreshCw, RotateCcw,
  Search, Sparkles, Trash2, Upload,
  Users, X,
  // The design pass (2026-10-04): the seven areas, you, credits and notes.
  Disc3, Handshake, Headphones, Home, Menu, Ticket,
  NotebookPen, Spotlight, UserCircle, UserCircle2, Wallet2,
} from './house';

/* Long tail — lucide, unchanged. */
export {
  // The usage dashboard (2026-10-07): people using Urganize over time.
  Activity,
  AlignLeft, Archive, ArrowDown, ArrowRight,
  ArrowUp, BadgeDollarSign, Bug, Building2,
  CalendarClock, CalendarPlus, Camera, ChartNoAxesGantt,
  CheckCircle, ChevronLeft, ChevronUp, CircleDot,
  CornerDownLeft, FileText, Flag,
  FolderOpen,
  // The admin scoreboard (2026-10-02): the company's numbers at a glance.
  Gauge,
  Gift, Globe,
  // Shows (2026-09-25): the drag handle on a set row, and tap-to-call on a
  // promoter's number.
  GripVertical, History, PanelRight,
  Image, ImageIcon, ImageOff, Info,
  // Share to socials (2026-09-23). A brand mark is exactly what lucide draws
  // better than we would, and it is the one glyph people look for on a
  // button that sends a post to Instagram.
  Instagram,
  KeyRound, Layers, LayoutDashboard, LayoutGrid,
  Link2, ListChecks, LockOpen, LogOut,
  MapPin, Maximize2, Mic,
  Minimize2, MonitorDown, MoreHorizontal,
  Newspaper, PanelLeftClose, PanelLeftOpen,
  // Brand colors (2026-09-24): the share sheet's link to Settings.
  Palette,
  PartyPopper, Pencil, Phone, PiggyBank, Pin,
  Plug, Rocket, Send, Share,
  Share2, ShieldCheck, Slash, Smartphone,
  Smile, Square, ThumbsDown, ThumbsUp, TrendingUp,
  Undo2, UserPlus,
  // Read-aloud on UrgAns replies.
  Volume2,
  // Talk to UrgAns (2026-10-11): the Talk button, mute, hang up, captions.
  AudioWaveform, Captions, MicOff, PhoneOff,
} from 'lucide-react';

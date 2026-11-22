/**
 * Plain shadcn (lucide) icons for Urganize Music (#1364).
 *
 * The rest of the app imports from `@/components/icons`, where house marks
 * replace many lucide names. The music side was approved with the stock
 * shadcn set instead (docs/mocks/music-v2), so it imports from here. Lives in
 * the icons folder because `lib/icons-registry.test.ts` allows `lucide-react`
 * imports only inside it. The stroke weight still comes from the shared
 * `.lucide` rule in globals.css, so these match the app's line weight.
 */
export {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Headphones,
  Heart,
  LayoutDashboard,
  Loader2,
  LogIn,
  LogOut,
  Pause,
  Play,
  Radio,
  Search,
  SkipBack,
  SkipForward,
  SunMoon,
  Upload,
  UserPlus,
  UserRoundCog,
  X,
} from 'lucide-react';

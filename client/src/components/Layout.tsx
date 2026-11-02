import clsx from "clsx";
import {
  Bell,
  CalendarDays,
  ChartColumn,
  ChefHat,
  History,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Package,
  Plus,
  ScrollText,
  Settings,
  ShoppingCart,
  Sun,
  Trophy,
  Trash2,
  X,
} from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "../context/auth";
import { useUnread } from "../lib/hooks";
import { LevelChip } from "./Celebrate";
import { useHousehold } from "./HouseholdPanel";
import { LanguageSelect } from "./LanguageSelect";
import { ItemFormModal, type ItemPrefill } from "./ItemForm";
import { Logo } from "./Logo";
import { Button, IconButton } from "./ui";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/pantry", label: "Pantry", icon: Package },
  { to: "/calendar", label: "Expiry calendar", icon: CalendarDays },
  { to: "/shopping", label: "Shopping list", icon: ShoppingCart },
  { to: "/recipes", label: "Recipes", icon: ChefHat },
  { to: "/rewards", label: "Rewards", icon: Trophy },
  { to: "/history", label: "Used & wasted", icon: History },
  { to: "/analytics", label: "Analytics", icon: ChartColumn },
];
const NAV_2 = [
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/activity", label: "Activity log", icon: ScrollText },
  { to: "/trash", label: "Trash", icon: Trash2 },
  { to: "/settings", label: "Settings", icon: Settings },
];

// Lets any page open the shared "Add item" form (e.g. from the dashboard or a barcode result)
const AddItemContext = createContext<(prefill?: ItemPrefill) => void>(() => undefined);
export const useAddItem = () => useContext(AddItemContext);

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("sp-theme", next ? "dark" : "light");
    } catch {
      /* storage blocked: theme still applies for this visit */
    }
    setDark(next);
  };
  return { dark, toggle };
}

function NavItems({ unread, onNavigate }: { unread: number; onNavigate?: () => void }) {
  const link = (n: (typeof NAV)[number]) => (
    <NavLink
      key={n.to}
      to={n.to}
      end={n.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        clsx(
          "group flex items-center gap-3 rounded-lg px-3 py-2 text-[15px] font-medium transition-colors",
          isActive ? "bg-basil-soft text-bay font-semibold" : "text-ink-2 hover:bg-oat hover:text-ink",
        )
      }
    >
      <n.icon className="size-[18px] shrink-0" aria-hidden />
      <span className="flex-1">{n.label}</span>
      {n.to === "/notifications" && unread > 0 && (
        <span className="num rounded-full bg-chilli px-1.5 text-xs font-bold text-white" aria-label={`${unread} unread`}>
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </NavLink>
  );
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.map(link)}
      <div className="my-3 h-px bg-line" />
      {NAV_2.map(link)}
    </nav>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();
  const unread = useUnread().data ?? 0;
  const [drawer, setDrawer] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [prefill, setPrefill] = useState<ItemPrefill | undefined>();
  const location = useLocation();

  useEffect(() => setDrawer(false), [location.pathname]);

  const openAdd = useCallback((p?: ItemPrefill) => {
    setPrefill(p);
    setAddOpen(true);
  }, []);

  return (
    <AddItemContext.Provider value={openAdd}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>
      <div className="flex min-h-screen">
        {/* Sidebar — desktop */}
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface px-4 py-5 lg:flex">
          <Link to="/" className="mb-6 px-2">
            <Logo />
          </Link>
          <div className="flex-1 overflow-y-auto">
            <NavItems unread={unread} />
          </div>
        </aside>

        {/* Drawer — mobile & tablet */}
        {drawer && (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-[rgba(20,28,23,.45)]" onClick={() => setDrawer(false)} />
            <div className="sheet-in absolute inset-y-0 left-0 flex w-72 flex-col bg-surface px-4 py-5">
              <div className="mb-6 flex items-center justify-between px-2">
                <Logo />
                <IconButton icon={X} label="Close menu" onClick={() => setDrawer(false)} />
              </div>
              <div className="flex-1 overflow-y-auto">
                <NavItems unread={unread} onNavigate={() => setDrawer(false)} />
              </div>
              <LanguageSelect className="mt-4 flex sm:hidden" />
            </div>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-oat/90 px-4 backdrop-blur sm:px-6">
            <IconButton icon={Menu} label="Open menu" className="lg:hidden" onClick={() => setDrawer(true)} />
            <Link to="/" className="lg:hidden">
              <span className="font-display text-lg font-[750] whitespace-nowrap">Smart Pantry</span>
            </Link>
            <div className="flex-1" />
            <span className="hidden sm:block">
              <Button icon={Plus} onClick={() => openAdd()}>
                Add item
              </Button>
            </span>
            <span className="sm:hidden">
              <IconButton icon={Plus} label="Add item" onClick={() => openAdd()} className="bg-basil text-white hover:bg-basil-hover hover:text-white" />
            </span>
            <LanguageSelect className="hidden sm:inline-flex" />
            <LevelChip />
            <Link to="/notifications" className="relative inline-flex size-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface hover:text-ink" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <Bell className="size-[18px]" aria-hidden />
              {unread > 0 && <span className="absolute top-1.5 right-1.5 size-2.5 rounded-full border-2 border-oat bg-chilli" />}
            </Link>
            <IconButton icon={dark ? Sun : Moon} label={dark ? "Use light theme" : "Use dark theme"} onClick={toggle} />
            <div className="ml-1 hidden items-center gap-2 border-l border-line pl-3 md:flex">
              <div className="flex size-8 items-center justify-center rounded-full bg-bay text-sm font-bold text-oat" aria-hidden>
                {user?.name.slice(0, 1).toUpperCase()}
              </div>
              <span className="max-w-32 truncate text-sm font-medium">{user?.name}</span>
            </div>
            <IconButton icon={LogOut} label="Sign out" onClick={() => void logout()} />
          </header>

          <main id="main" className="mx-auto w-full max-w-[1240px] flex-1 px-4 py-6 sm:px-6 lg:py-8">
            <SharedPantryBanner />
            <Outlet />
          </main>
        </div>
      </div>
      <ItemFormModal open={addOpen} onClose={() => setAddOpen(false)} prefill={prefill} />
    </AddItemContext.Provider>
  );
}

/** Members always see whose pantry they're working in, and viewers know why buttons won't save. */
function SharedPantryBanner() {
  const q = useHousehold();
  const h = q.data?.household;
  if (!h || q.data?.role === "OWNER") return null;
  const viewer = q.data?.role === "VIEWER";
  return (
    <div role="note" className={clsx("mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 text-sm", viewer ? "border-line bg-slate-soft" : "border-basil/25 bg-basil-soft")}>
      <span className="font-semibold">
        {h.name}: {h.owner.name}'s pantry
      </span>
      <span className="text-ink-2">{viewer ? "You can view everything but can't make changes." : "Changes you make are shared with everyone in the household."}</span>
      <Link to="/settings?tab=household" className="ml-auto font-semibold text-basil hover:underline">
        Family sharing
      </Link>
    </div>
  );
}

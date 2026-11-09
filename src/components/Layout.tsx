import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Building2,
  ChevronRight,
  ClipboardPen,
  Factory,
  LayoutDashboard,
  LayoutGrid,
  ListChecks,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import { DEV_SNAPSHOT, useBoard, type Company } from "../lib/board";
import { cn } from "../lib/utils";
import { Button, Spinner } from "./ui";

/**
 * The frame, after Malaya OBS: a floating navy sidebar with foldable groups,
 * a content card with a breadcrumb trail, an account menu, and on a phone a
 * nav pill along the bottom with More for the rest.
 */

interface Tab {
  to: string;
  label: string;
  icon: LucideIcon;
}

const COMPANY_ICONS: LucideIcon[] = [Factory, Building2, Truck];
const PILL = ["/", "/entry", "/scorecard"];
const COLLAPSE_KEY = "mainframe:sidebar-collapsed";
const GROUPS_KEY = "mainframe:nav-folded";

export function companyIcon(companies: Company[] | undefined, id: string) {
  const i = companies?.findIndex((c) => c.id === id) ?? 0;
  return COMPANY_ICONS[Math.max(0, i) % COMPANY_ICONS.length];
}

function useNav(): { label: string; tabs: Tab[] }[] {
  const { data } = useBoard();
  return [
    { label: "Overview", tabs: [{ to: "/", label: "KPI board", icon: LayoutDashboard }] },
    {
      label: "Businesses",
      tabs: (data?.companies ?? []).map((c, i) => ({
        to: `/c/${c.slug}`,
        label: c.name,
        icon: COMPANY_ICONS[i % COMPANY_ICONS.length],
      })),
    },
    {
      label: "Data",
      tabs: [
        { to: "/entry", label: "Enter results", icon: ClipboardPen },
        { to: "/scorecard", label: "Scorecard", icon: ListChecks },
      ],
    },
  ];
}

function isActive(to: string, pathname: string) {
  const path = pathname.replace(/\/$/, "") || "/";
  return to === "/" ? path === "/" : path === to || path.startsWith(`${to}/`);
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="KPI board">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-white ring-1 ring-ice/15">
        <img src="/nam-mark.png" alt="" className="size-8 object-contain" />
      </span>
      {!compact && (
        <span className="min-w-0 leading-tight">
          <span className="block font-display text-[15px] tracking-[0.18em] text-ice">NAM GROUP</span>
          <span className="block truncate text-[10px] tracking-[0.1em] text-ice/60 uppercase">Mainframe</span>
        </span>
      )}
    </Link>
  );
}

function NavList({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const nav = useNav();
  const [folded, setFolded] = useState<string[]>([]);
  useEffect(() => {
    try {
      setFolded(JSON.parse(localStorage.getItem(GROUPS_KEY) ?? "[]") as string[]);
    } catch {
      /* storage blocked */
    }
  }, []);
  const toggle = (label: string) =>
    setFolded((cur) => {
      const next = cur.includes(label) ? cur.filter((l) => l !== label) : [...cur, label];
      try {
        localStorage.setItem(GROUPS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  return (
    <nav className={cn("no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto pb-6", collapsed ? "px-2" : "px-3")}>
      {nav.map((group, gi) => {
        const hasActive = group.tabs.some((t) => isActive(t.to, pathname));
        const isFolded = !collapsed && folded.includes(group.label) && !hasActive;
        return (
          <div key={group.label} className={gi > 0 ? (collapsed ? "mt-2" : "mt-5") : ""}>
            {collapsed ? (
              gi > 0 && <div className="mx-auto mb-2 h-px w-5 bg-navy-soft" />
            ) : (
              <button
                type="button"
                onClick={() => toggle(group.label)}
                aria-expanded={!isFolded}
                className="flex w-full cursor-pointer items-center gap-1.5 rounded-lg px-3 pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-ice/45 uppercase transition-colors hover:text-ice/70"
              >
                <ChevronRight className={cn("size-3 shrink-0 transition-transform", !isFolded && "rotate-90")} />
                {group.label}
              </button>
            )}
            {!isFolded && (
              <div className="flex flex-col gap-1">
                {group.tabs.map(({ to, label, icon: Icon }) => {
                  const active = isActive(to, pathname);
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      end={to === "/"}
                      onClick={onNavigate}
                      title={collapsed ? label : undefined}
                      aria-label={collapsed ? label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center rounded-xl text-[15px] transition-colors",
                        collapsed ? "mx-auto size-10 justify-center" : "gap-3 px-3 py-2.5",
                        active ? "bg-navy-soft text-ice shadow-level-2" : "text-ice/75 hover:bg-navy-soft hover:text-ice",
                      )}
                    >
                      <Icon className={cn("size-[18px] shrink-0", active ? "opacity-100" : "opacity-80")} />
                      {!collapsed && <span className="truncate">{label}</span>}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function AccountMenu({ email, role, onSignOut }: { email: string; role: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  const item = "flex w-full cursor-pointer items-center gap-2.5 px-4 py-2.5 text-left text-sm text-ink hover:bg-mist-100";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Account menu"
        aria-expanded={open}
        className="grid size-9 cursor-pointer place-items-center rounded-full bg-brand-700 text-sm font-semibold text-mist-50 ring-2 ring-white transition-shadow hover:shadow-level-2"
      >
        {email.charAt(0).toUpperCase() || "?"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute top-full right-0 z-50 mt-2 w-64 overflow-hidden rounded-2xl border border-mist-200 bg-white py-1.5 shadow-level-4">
            <div className="border-b border-mist-200 px-4 pt-2 pb-3">
              <p className="truncate text-sm font-medium text-ink">Signed in</p>
              <p className="truncate text-xs text-ink-muted">{email}</p>
              <span className="mt-2 inline-flex rounded-full border border-brand-700/30 px-2 py-0.5 text-[11px] font-medium text-brand-700 capitalize">
                {role}
              </span>
            </div>
            <button type="button" onClick={onSignOut} className={item}>
              <LogOut className="size-4 text-ink-muted" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/** Today's date and the time in Manila, ticking each half minute. */
function LiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);
  const fmt = new Intl.DateTimeFormat("en-PH", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" });
  return <span className="hidden text-sm whitespace-nowrap text-ink-muted tabular-nums xl:inline">{fmt.format(now)}</span>;
}

export default function Layout() {
  const { session, role, loading, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const nav = useNav();

  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage blocked; keep the default */
    }
  }, []);

  function toggle() {
    setCollapsed((v) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !v;
    });
  }

  if (!DEV_SNAPSHOT) {
    if (loading) return <Spinner className="min-h-screen" />;
    if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    if (!role) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-mist-100 p-4">
          <div className="max-w-sm rounded-3xl bg-white p-8 text-center shadow-level-3">
            <img src="/nam-mark.png" alt="" className="mx-auto size-16 object-contain" />
            <h1 className="mt-4 font-display text-2xl font-medium">No access yet</h1>
            <p className="mt-2 text-sm text-ink-muted">
              {session.user.email} is signed in but isn't on the members list. Ask the owner to add this email.
            </p>
            <Button variant="secondary" className="mt-5" onClick={() => void signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      );
    }
  }

  const email = DEV_SNAPSHOT ? "preview@local" : (session?.user.email ?? "");
  const path = location.pathname.replace(/\/$/, "") || "/";
  const allTabs = nav.flatMap((g) => g.tabs);
  const tab = [...allTabs].sort((a, b) => b.to.length - a.to.length).find((t) => isActive(t.to, path));

  return (
    <div className="min-h-screen bg-mist-100 [--mobile-nav-space:calc(5.75rem+env(safe-area-inset-bottom))] lg:[--mobile-nav-space:0px]">
      {/* Desktop sidebar: a floating navy card. */}
      <aside
        className={cn(
          "fixed inset-y-3 left-3 z-40 hidden flex-col overflow-hidden rounded-2xl bg-navy shadow-level-2 transition-[width] duration-200 lg:flex",
          collapsed ? "w-[64px]" : "w-[248px]",
        )}
      >
        <div className={cn("flex", collapsed ? "flex-col items-center gap-2 pt-4 pb-3" : "items-center justify-between gap-2 px-4 pt-5 pb-5")}>
          <Wordmark compact={collapsed} />
          <button
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            title={collapsed ? "Expand" : "Collapse"}
            className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg text-ice/60 hover:bg-navy-soft hover:text-ice"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>
        <NavList collapsed={collapsed} />
        {!collapsed && (
          <div className="mx-3 mb-3 rounded-xl border border-navy-soft p-3 text-[12px] leading-snug text-ice/60">
            <span className="block font-medium text-ice/85">2027 KPI scorecard</span>
            Nine categories, weights total 100.
          </div>
        )}
      </aside>

      {/* Phone drawer, opened from More on the nav pill. */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy/45 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <aside className="relative flex h-full w-[272px] flex-col bg-navy">
            <div className="flex items-center justify-between px-4 pt-5 pb-5">
              <Wordmark />
              <button onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-ice/70 hover:bg-navy-soft" aria-label="Close menu">
                <X className="size-5" />
              </button>
            </div>
            <NavList onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className={cn("transition-[padding] duration-200 lg:py-3 lg:pr-3", collapsed ? "lg:pl-[88px]" : "lg:pl-[272px]")}>
        <div className="flex min-h-screen flex-col lg:h-[calc(100vh-1.5rem)] lg:min-h-0 lg:overflow-hidden lg:rounded-2xl lg:bg-white lg:shadow-level-2">
          <header className="sticky top-0 z-30 border-b border-mist-200/80 bg-white/85 backdrop-blur-xl lg:static">
            <div className="flex items-center gap-3 px-4 py-2.5 sm:px-6">
              <img src="/nam-mark.png" alt="" className="size-8 object-contain lg:hidden" />
              <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
                <ol className="flex min-w-0 items-center gap-1.5 text-[15px]">
                  <li className="hidden text-ink-muted sm:block">NAM Group</li>
                  {tab && (
                    <li className="flex min-w-0 items-center gap-1.5">
                      <ChevronRight className="hidden size-3.5 shrink-0 text-ink-muted/60 sm:block" />
                      <Link to={tab.to} className="truncate font-medium text-ink hover:underline">
                        {tab.label}
                      </Link>
                    </li>
                  )}
                </ol>
              </nav>
              {DEV_SNAPSHOT && (
                <span className="rounded-full bg-watch-50 px-2.5 py-1 text-[11px] font-medium text-watch ring-1 ring-watch/30 ring-inset">
                  Local preview data
                </span>
              )}
              <LiveClock />
              <AccountMenu email={email} role={DEV_SNAPSHOT ? "owner" : (role ?? "")} onSignOut={() => void signOut()} />
            </div>
          </header>
          <main className="relative min-h-0 flex-1 bg-white lg:overflow-y-auto">
            <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 pb-[calc(var(--mobile-nav-space)+1.5rem)] sm:px-6 sm:pt-8 lg:pb-8">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {/* Phone nav pill: the three places you go most, and More for the rest. */}
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:hidden">
        <nav
          aria-label="Main sections"
          className="relative flex items-stretch gap-0.5 rounded-full border border-mist-200 bg-white/90 p-1.5 shadow-level-3 backdrop-blur-xl"
        >
          {PILL.map((to) => {
            const t = allTabs.find((x) => x.to === to);
            if (!t) return null;
            const on = isActive(to, path);
            return (
              <Link
                key={to}
                to={to}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition-colors",
                  on ? "bg-mist-100 text-brand-700" : "text-ink-muted",
                )}
              >
                <t.icon className="size-[22px]" strokeWidth={on ? 2.2 : 1.8} />
                <span className="max-w-full truncate px-1">{to === "/" ? "Board" : to === "/entry" ? "Enter" : t.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className={cn(
              "relative flex min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium",
              !PILL.some((to) => isActive(to, path)) ? "bg-mist-100 text-brand-700" : "text-ink-muted",
            )}
          >
            <LayoutGrid className="size-[22px]" strokeWidth={1.8} />
            <span>More</span>
          </button>
        </nav>
      </div>
    </div>
  );
}

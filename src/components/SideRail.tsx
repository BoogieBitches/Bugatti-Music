"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Home,
  Music,
  TrendingUp,
  Grid3x3,
  Crown,
  Upload as UploadIcon,
  LayoutDashboard,
  Shield,
  LogIn,
  ChevronRight,
} from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

interface RailItem {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  exact?: boolean;
}

export function SideRail({
  locale,
  dict,
  isAuthed,
  isAdmin,
}: {
  locale: Locale;
  dict: Dictionary;
  isAuthed: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lp = `/${locale}`;
  const [expanded, setExpanded] = useState(false);

  interface CatalogMatch {
    sort?: string | null;
    view?: string | null;
  }

  const main: (RailItem & { match?: CatalogMatch })[] = [
    { href: lp, label: dict.nav.home, icon: Home, exact: true },
    {
      href: `${lp}/catalog`,
      label: dict.nav.catalog,
      icon: Music,
      match: { sort: null, view: null },
    },
    {
      href: `${lp}#trending`,
      label: dict.nav.trending,
      icon: TrendingUp,
    },
    {
      href: `${lp}#genres`,
      label: dict.nav.genres,
      icon: Grid3x3,
    },
    { href: `${lp}/pricing`, label: dict.nav.pricing, icon: Crown },
  ];

  const userItems: RailItem[] = isAuthed
    ? [
        { href: `${lp}/upload`, label: dict.nav.upload, icon: UploadIcon },
        {
          href: `${lp}/dashboard`,
          label: dict.nav.dashboard,
          icon: LayoutDashboard,
        },
      ]
    : [{ href: `${lp}/login`, label: dict.nav.login, icon: LogIn }];

  const adminItems: RailItem[] = isAdmin
    ? [{ href: `${lp}/admin`, label: dict.nav.admin, icon: Shield }]
    : [];

  const isActive = (item: RailItem & { match?: CatalogMatch }) => {
    // Anchor-only links (e.g. "/ru#trending") are never shown as the active
    // section — they're scroll shortcuts, not standalone routes.
    if (item.href.includes("#")) return false;
    const cleanHref = item.href.split("?")[0];
    if (item.exact) return pathname === cleanHref;
    const pathMatches =
      pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
    if (!pathMatches) return false;
    if (!item.match) return true;
    // Catalog variants share the same path; disambiguate by query params.
    for (const [key, expected] of Object.entries(item.match)) {
      const actual = searchParams.get(key);
      if (expected === null) {
        if (actual !== null) return false;
      } else if (actual !== expected) {
        return false;
      }
    }
    return true;
  };

  return (
    <aside
      className="fixed left-0 top-0 z-40 hidden md:flex flex-col h-screen transition-[width] duration-300 ease-out bg-[rgba(12,8,28,0.94)] backdrop-blur-xl border-r border-[rgba(122,85,255,0.12)] overflow-visible"
      style={{ width: expanded ? 224 : 56 }}
      aria-label={dict.nav.primaryNav}
    >
      {/* Toggle chevron — sits on the rail's right edge */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? dict.nav.collapseNav : dict.nav.expandNav}
        aria-expanded={expanded}
        className="absolute -right-3 top-[64px] z-10 flex items-center justify-center w-6 h-6 rounded-full bg-[rgba(20,22,28,0.96)] border border-white/10 text-white/70 hover:text-white hover:bg-[var(--accent)] hover:border-[var(--accent)] transition-colors shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
      >
        <ChevronRight
          className="w-4 h-4 transition-transform duration-300"
          style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {/* Brand */}
      <Link
        href={lp}
        className="flex items-center gap-3 h-20 px-3 shrink-0 border-b border-white/[0.04] overflow-hidden"
      >
        <span className="relative inline-block w-9 h-9 rounded-lg overflow-hidden ring-1 ring-white/10 shrink-0">
          <Image
            src="/bugatti-logo.png"
            alt="Bugatti Sound"
            fill
            sizes="36px"
            className="object-contain"
            priority
          />
        </span>
        <span
          className="bs-fire-glow leading-none text-[18px] tracking-[0.01em] whitespace-nowrap transition-opacity duration-200"
          style={{ opacity: expanded ? 1 : 0 }}
          data-text="Bugatti Sound"
        >
          <span className="bs-fire">Bugatti Sound</span>
        </span>
      </Link>

      {/* Main nav */}
      <nav className="flex-1 px-2 py-4 flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
        {main.map((item) => (
          <RailLink
            key={item.href}
            item={item}
            active={isActive(item)}
            expanded={expanded}
          />
        ))}

        <div className="my-2 h-px bg-white/[0.05]" />

        {userItems.map((item) => (
          <RailLink
            key={item.href}
            item={item}
            active={isActive(item)}
            expanded={expanded}
          />
        ))}

        {adminItems.length > 0 && (
          <>
            <div className="my-2 h-px bg-white/[0.05]" />
            {adminItems.map((item) => (
              <RailLink
                key={item.href}
                item={item}
                active={isActive(item)}
                expanded={expanded}
              />
            ))}
          </>
        )}
      </nav>

      {/* Footer label */}
      <div className="px-4 py-3 border-t border-white/[0.04] text-[10px] font-bold tracking-[0.3em] text-white/30 whitespace-nowrap overflow-hidden">
        <span
          className="inline-block transition-opacity duration-200"
          style={{ opacity: expanded ? 0.85 : 0.3 }}
        >
          v1
        </span>
      </div>
    </aside>
  );
}

function RailLink({
  item,
  active,
  expanded,
}: {
  item: RailItem;
  active: boolean;
  expanded: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={expanded ? undefined : item.label}
      className={`relative flex items-center gap-3 h-10 rounded-lg pl-[12px] pr-2 text-[14px] font-semibold transition-colors ${
        active
          ? "text-white bg-[rgba(122,85,255,0.14)]"
          : "text-[rgba(220,210,255,0.7)] hover:text-white hover:bg-[rgba(122,85,255,0.10)]"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute -left-[8px] top-2 bottom-2 w-[3px] rounded-r-full"
          style={{
            background:
              "linear-gradient(180deg, var(--accent), var(--accent-2))",
            boxShadow: "0 0 14px rgba(122,85,255,0.7)",
          }}
        />
      )}
      <Icon
        className="w-[18px] h-[18px] shrink-0"
        style={{ color: active ? "var(--accent-2)" : undefined }}
      />
      <span
        className="whitespace-nowrap transition-opacity duration-200"
        style={{ opacity: expanded ? 1 : 0 }}
      >
        {item.label}
      </span>
    </Link>
  );
}

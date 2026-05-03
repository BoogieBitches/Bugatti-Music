"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import type { Dictionary } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";

interface RailItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
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
  const lp = `/${locale}`;
  const [expanded, setExpanded] = useState(false);

  const main: RailItem[] = [
    { href: lp, label: dict.nav.home, icon: Home, exact: true },
    { href: `${lp}/catalog`, label: dict.nav.catalog, icon: Music },
    {
      href: `${lp}/catalog?sort=popular`,
      label: dict.nav.trending,
      icon: TrendingUp,
    },
    { href: `${lp}/catalog?view=genres`, label: dict.nav.genres, icon: Grid3x3 },
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

  const isActive = (item: RailItem) => {
    const cleanHref = item.href.split("?")[0];
    if (item.exact) return pathname === cleanHref;
    return pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
  };

  return (
    <aside
      className="fixed left-0 top-0 z-40 hidden md:flex flex-col h-screen transition-[width] duration-300 ease-out bg-[rgba(8,9,12,0.94)] backdrop-blur-xl border-r border-white/[0.06] overflow-hidden"
      style={{ width: expanded ? 224 : 72 }}
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
      aria-label="Primary navigation"
    >
      {/* Brand */}
      <Link
        href={lp}
        className="flex items-center gap-3 h-20 px-4 shrink-0 border-b border-white/[0.04]"
      >
        <span className="relative inline-block w-10 h-10 rounded-lg overflow-hidden ring-1 ring-white/10 shrink-0">
          <Image
            src="/bugatti-logo.png"
            alt="Bugatti Sound"
            fill
            sizes="40px"
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
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto overflow-x-hidden">
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
      className={`relative flex items-center gap-3 h-11 rounded-lg pl-[14px] pr-3 text-[14px] font-semibold transition-colors ${
        active
          ? "text-white bg-white/[0.06]"
          : "text-white/55 hover:text-white hover:bg-white/[0.04]"
      }`}
    >
      {active && (
        <span
          aria-hidden
          className="absolute -left-[10px] top-2 bottom-2 w-[3px] rounded-r-full"
          style={{
            background:
              "linear-gradient(180deg, var(--accent), var(--accent-2))",
            boxShadow: "0 0 12px rgba(255,122,0,0.55)",
          }}
        />
      )}
      <Icon className="w-[18px] h-[18px] shrink-0" />
      <span
        className="whitespace-nowrap transition-opacity duration-200"
        style={{ opacity: expanded ? 1 : 0 }}
      >
        {item.label}
      </span>
    </Link>
  );
}

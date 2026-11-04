import type { ReactNode } from "react";
import { MobileTabBar } from "./MobileTabBar";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

/** Sidebar + sticky top bar + content column + mobile tab bar. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to content
      </a>

      <Sidebar />

      <div className="md:pl-16 lg:pl-[232px]">
        <TopBar />
        <main
          id="main"
          className="mx-auto w-full max-w-[1180px] px-4 pb-28 pt-6 sm:px-6 md:pb-12 lg:px-8 lg:pt-8"
        >
          {children}
        </main>
      </div>

      <MobileTabBar />
    </div>
  );
}

import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

/**
 * Dashboard chrome: a persistent top nav so authenticated pages are no longer
 * dead-ends. Provides the EPS home link, a "New request" action and the Clerk
 * user menu (sign out, manage account) on every /dashboard route.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200">
        <nav className="mx-auto flex w-full max-w-5xl items-center justify-between px-8 py-4">
          <Link href="/dashboard" className="text-lg font-bold tracking-tight">
            EPS
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/new"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              ＋ New request
            </Link>
            <UserButton afterSignOutUrl="/" />
          </div>
        </nav>
      </header>
      {children}
    </div>
  );
}

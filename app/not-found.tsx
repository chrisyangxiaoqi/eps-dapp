import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold">404 - Page Not Found</h1>
      <p className="text-foreground/70">
        The page you are looking for does not exist.
      </p>
      <Link
        href="/"
        className="rounded-md border border-foreground/20 px-4 py-2 font-medium transition-colors hover:bg-foreground/10"
      >
        Back to home
      </Link>
    </main>
  );
}

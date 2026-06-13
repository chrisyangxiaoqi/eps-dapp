"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-4xl font-bold">Something went wrong</h1>
      <p className="text-foreground/70">
        An unexpected error occurred. Please try again.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md border border-foreground/20 px-4 py-2 font-medium transition-colors hover:bg-foreground/10"
      >
        Try again
      </button>
    </main>
  );
}

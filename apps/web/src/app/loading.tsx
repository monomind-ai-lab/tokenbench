export default function AppLoading() {
  return (
    <main aria-busy="true" aria-label="Loading TokenBench evidence" className="px-5 py-16 sm:px-8 sm:py-24 lg:px-10">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-3 w-32 rounded-full bg-muted" />
        <div className="mt-7 h-12 max-w-2xl rounded-xl bg-muted sm:h-16" />
        <div className="mt-4 h-5 max-w-xl rounded-lg bg-muted/80" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div className="h-44 rounded-2xl border border-border bg-card" key={index} />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading published model and cost evidence.</span>
    </main>
  );
}

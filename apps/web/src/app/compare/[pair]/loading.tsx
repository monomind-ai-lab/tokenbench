export default function RouteEvidencePairLoading() {
  return (
    <main aria-busy="true" aria-label="Loading pair evidence" className="px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="mt-8 h-12 max-w-3xl rounded bg-muted sm:h-16" />
        <div className="mt-5 h-5 max-w-2xl rounded bg-muted" />
        <div className="mt-10 grid gap-4 lg:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => <div className="h-72 rounded-2xl border border-border bg-card" key={index} />)}
        </div>
        <div className="mt-12 h-80 rounded-2xl border border-border bg-card" />
      </div>
    </main>
  );
}

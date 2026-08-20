export default function RouteEvidenceModelLoading() {
  return (
    <main aria-busy="true" aria-label="Loading model evidence" className="px-4 py-14 sm:px-6 sm:py-20">
      <div className="mx-auto max-w-7xl animate-pulse">
        <div className="h-3 w-24 rounded bg-muted" />
        <div className="mt-8 h-12 max-w-xl rounded bg-muted sm:h-16" />
        <div className="mt-5 h-5 max-w-2xl rounded bg-muted" />
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => <div className="h-28 bg-card" key={index} />)}
        </div>
        <div className="mt-12 h-72 rounded-2xl border border-border bg-card" />
      </div>
    </main>
  );
}

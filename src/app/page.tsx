export default function HomePage() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-navy/10 px-6 py-6 sm:px-12">
        <div className="mx-auto max-w-6xl text-xl font-extrabold tracking-tight text-navy">
          VV<span className="text-clay">.</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-24 sm:px-12 sm:py-32">
        <p className="mb-6 text-xs font-bold tracking-[0.2em] text-clay uppercase">
          A closer look at your next venue
        </p>
        <h1 className="max-w-3xl text-5xl leading-[1.1] font-semibold text-navy sm:text-7xl">
          Find a space.<br />Imagine the possibilities.
        </h1>
        <p className="mt-8 max-w-xl text-lg leading-8 text-slate/75">
          Discover venues, explore the details, and decide what is worth visiting in person.
        </p>
        <div className="mt-14 max-w-xl border-l-2 border-terracotta pl-5">
          <p className="text-sm leading-6 text-slate/75">
            A new venue discovery experience is taking shape. More to come.
          </p>
        </div>
      </main>
    </div>
  );
}

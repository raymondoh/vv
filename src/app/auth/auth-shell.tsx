import Link from 'next/link';

export function AuthShell({ title, children }: { title: string; children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-lg px-6 py-12 sm:py-20">
    <Link href="/" className="font-semibold text-clay">← VV home</Link>
    <h1 className="mt-10 mb-8 text-4xl font-semibold text-navy">{title}</h1>
    <div className="space-y-6">{children}</div>
  </main>;
}

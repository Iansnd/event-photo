import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center gap-4 p-8">
      <Link
        href="/checkin"
        className="px-6 py-3 border border-white/40 text-white hover:bg-white hover:text-black transition-colors"
      >
        Check-in
      </Link>
      <Link
        href="/booth"
        className="px-6 py-3 border border-white/40 text-white hover:bg-white hover:text-black transition-colors"
      >
        Booth
      </Link>
    </main>
  );
}

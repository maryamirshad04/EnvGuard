import Link from 'next/link';

export default function Navbar() {
  return (
    <header className="border-b border-line">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-2 font-mono text-lg tracking-tight text-paper">
  <img 
    src="/lock.svg" 
    alt="Envguard icon" 
    className="inline-block h-5 w-5 text-signal align-middle" 
  /> 
  <span className="align-middle">envguard</span>
</Link>
        <div className="hidden items-center gap-8 text-sm text-mist md:flex">
          <a href="#how-it-works" className="hover:text-paper">How it works</a>
          <a href="#features" className="hover:text-paper">Features</a>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="text-sm text-mist hover:text-paper">
            Log in
          </Link>
          <Link
            href="/signup"
            className="rounded-sm bg-signal px-4 py-2 text-sm font-medium text-ink hover:bg-signal/90"
          >
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}

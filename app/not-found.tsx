import Link from "next/link";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-8">
      <div className="text-center">
        {/* Retro 404 display */}
        <div className="inline-block rounded-2xl border-2 border-t4-black bg-t4-black px-8 py-4 shadow-retro">
          <span className="font-mono text-6xl font-bold text-t4-cream">404</span>
        </div>
        
        <h1 className="mt-8 text-2xl font-bold text-foreground">
          Page Not Found
        </h1>
        <p className="mt-2 font-mono text-sm text-t4-grey-300">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        
        <Link
          href="/"
          className="mt-8 inline-flex items-center gap-2 rounded-xl border-2 border-border bg-card px-5 py-2.5 font-semibold text-foreground shadow-retro-sm transition-all hover-lift"
        >
          <Home className="h-4 w-4" strokeWidth={1.5} />
          Back to Dashboard
        </Link>
      </div>
      
      {/* Footer */}
      <p className="mt-16 font-mono text-xs uppercase tracking-widest text-t4-grey-200">
        MoonDesk by Tek4All
      </p>
    </div>
  );
}

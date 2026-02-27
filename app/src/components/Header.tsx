import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { ModeToggle } from './mode-toggle';
import { Github } from 'lucide-react';
import { Button } from './ui/button';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="container flex h-16 items-center mx-auto px-4 max-w-5xl justify-between">

        <div className="flex items-center gap-2 cursor-pointer" onClick={() => {
          window.history.pushState({}, '', window.location.pathname);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}>
          {/* Logo — matches favicon gradient */}
          <div className="h-8 w-8 rounded-lg bg-[#11131a] flex items-center justify-center shadow-sm shrink-0">
            <svg viewBox="0 0 32 32" width="20" height="20" aria-hidden="true">
              <defs>
                <linearGradient id="vgrad" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#60a5fa" />
                  <stop offset="100%" stopColor="#34d399" />
                </linearGradient>
              </defs>
              <text
                x="16" y="26"
                fontFamily="'SF Pro Display','Inter','Helvetica Neue',Arial,sans-serif"
                fontSize="28"
                fontWeight="800"
                textAnchor="middle"
                fill="url(#vgrad)"
              >V</text>
            </svg>
          </div>
          <span className="font-semibold text-lg tracking-tight hidden sm:inline-block">Vesting Vault</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          <Button variant="outline" size="sm" className="hidden sm:flex gap-2 rounded-full h-10 px-4 bg-background/50 backdrop-blur" asChild>
            <a href="https://github.com/ItsSVK/vesting" target="_blank" rel="noreferrer">
              <Github className="w-4 h-4" />
              <span>Star on GitHub</span>
            </a>
          </Button>
          <ModeToggle />
          <WalletMultiButton className="bg-primary! text-primary-foreground! hover:bg-primary/90! transition-colors! rounded-full! px-4 sm:px-6! h-10! font-medium! text-sm sm:text-base!" />
        </div>
      </div>
    </header>
  );
}

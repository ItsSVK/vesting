import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="container flex h-16 items-center mx-auto px-4 max-w-5xl justify-between">
        <div className="flex items-center gap-2">
          {/* A simple Apple-like minimal logo/icon */}
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-sm">
            V
          </div>
          <span className="font-semibold text-lg tracking-tight hidden sm:inline-block">Vesting Vault</span>
        </div>
        <div className="flex items-center gap-4">
          <WalletMultiButton className="bg-primary! text-primary-foreground! hover:bg-primary/90! transition-colors! rounded-full! px-6! h-10! font-medium!" />
        </div>
      </div>
    </header>
  );
}

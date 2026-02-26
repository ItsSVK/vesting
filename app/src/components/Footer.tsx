import { Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="w-full py-6 border-t border-border bg-background/95 backdrop-blur-sm">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <span className="text-sm">Crafted with care by</span>
          <Heart className="w-4 h-4 text-primary fill-primary animate-pulse" />
          <a
            href="https://x.com/ShouvikMohanta"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-foreground hover:text-primary transition-colors duration-200"
          >
            Shouvik Mohanta
          </a>
        </div>
      </div>
    </footer>
  );
}

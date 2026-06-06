import { Switch, Route, Router as WouterRouter, Link, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import Dashboard from "@/pages/Dashboard";
import CashBook from "@/pages/CashBook";
import Parties from "@/pages/Parties";
import PartyDetail from "@/pages/PartyDetail";
import Production from "@/pages/Production";
import Stock from "@/pages/Stock";
import BalanceSheet from "@/pages/BalanceSheet";
import PnL from "@/pages/PnL";
import ImageUpload from "@/pages/ImageUpload";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const navItems = [
  { href: "/", label: "ড্যাশবোর্ড", icon: "🏠" },
  { href: "/cash", label: "লেন-দেন খাতা", icon: "💰" },
  { href: "/parties", label: "নামে হিসাব", icon: "👥" },
  { href: "/production", label: "উৎপাদন", icon: "🏭" },
  { href: "/stock", label: "মজুদ", icon: "📦" },
  { href: "/balance-sheet", label: "ব্যালেন্স শিট", icon: "📊" },
  { href: "/pnl", label: "লাভ-ক্ষতি", icon: "📈" },
  { href: "/image-upload", label: "ছবি আপলোড", icon: "📷" },
];

function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-sidebar border-r border-sidebar-border flex flex-col z-50">
      <Link href="/" className="block px-4 py-3 border-b border-sidebar-border hover:opacity-80 transition-opacity">
        <img src="/logo.png" alt="দোয়েল মার্ক তাল মিসরি" className="h-20 w-auto mx-auto block" />
        <p className="text-xs text-center text-muted-foreground mt-1">ফ্যাক্টরি ম্যানেজমেন্ট</p>
      </Link>
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors min-h-[48px]",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t border-sidebar-border">
        <p className="text-xs text-muted-foreground">নারায়ণগঞ্জ, বাংলাদেশ</p>
      </div>
    </aside>
  );
}

function MobileNav() {
  const [location] = useLocation();
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border z-50 md:hidden">
      <div className="flex">
        {navItems.map((item) => {
          const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <span className="text-lg">{item.icon}</span>
              <span className="leading-none">{item.label.split(" ")[0]}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="ml-0 md:ml-60 pb-20 md:pb-0 min-h-screen">
        {children}
      </main>
      <MobileNav />
    </div>
  );
}

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/cash" component={CashBook} />
        <Route path="/parties" component={Parties} />
        <Route path="/parties/:id" component={PartyDetail} />
        <Route path="/production" component={Production} />
        <Route path="/stock" component={Stock} />
        <Route path="/balance-sheet" component={BalanceSheet} />
        <Route path="/pnl" component={PnL} />
        <Route path="/image-upload" component={ImageUpload} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

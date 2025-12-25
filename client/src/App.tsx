import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import WebBedsTracker from "./pages/WebBedsTracker";
import Home from "./pages/Home";
import PriceManager from "./pages/PriceManager";
import Dashboard from "./pages/Dashboard";

function Router() {
  return (
    <Switch>
      <Route path="" component={WebBedsTracker} />
      <Route path="/legacy-home" component={Home} />
      <Route path="/price-manager" component={PriceManager} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

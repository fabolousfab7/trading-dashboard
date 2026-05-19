import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/layout/Layout";
import Home from "@/pages/Home";
import Analytics from "@/pages/Analytics";
import Ibkr from "@/pages/Ibkr";
import Pea from "@/pages/Pea";
import Crypto from "@/pages/Crypto";
import CryptoShared from "@/pages/CryptoShared";
import Compta from "@/pages/Compta";
import Kraken from "@/pages/Kraken";
import Fhf from "@/pages/Fhf";
import SettingsConnexions from "@/pages/SettingsConnexions";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/fhf" component={Fhf} />
        <Route path="/ibkr" component={Ibkr} />
        <Route path="/kraken" component={Kraken} />
        <Route path="/crypto" component={Crypto} />
        <Route path="/crypto-shared" component={CryptoShared} />
        <Route path="/pea" component={Pea} />
        <Route path="/compta" component={Compta} />
        <Route path="/settings/connexions" component={SettingsConnexions} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200} skipDelayDuration={true}>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

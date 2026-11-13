import { Component, ReactNode } from "react";
import { Layout } from "./components/Layout";
import { EmptyState } from "./components/ui";
import { Link, usePath } from "./lib/router";
import Overview from "./pages/Overview";
import SafetyMonitor from "./pages/SafetyMonitor";
import FogBenchmark from "./pages/FogBenchmark";
import VisibilityRecovery from "./pages/VisibilityRecovery";
import RiskAnalytics from "./pages/RiskAnalytics";
import Architecture from "./pages/Architecture";
import About from "./pages/About";

const ROUTES: Record<string, () => JSX.Element> = {
  "/": Overview, "/monitor": SafetyMonitor, "/fog-benchmark": FogBenchmark,
  "/recovery": VisibilityRecovery, "/risk-analytics": RiskAnalytics,
  "/architecture": Architecture, "/about": About,
};

class Boundary extends Component<{ children: ReactNode; resetKey: string }, { err: Error | null; key: string }> {
  state = { err: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(err: Error) { return { err }; }
  static getDerivedStateFromProps(p: { resetKey: string }, s: { key: string }) { return p.resetKey !== s.key ? { err: null, key: p.resetKey } : null; }
  render() {
    return this.state.err
      ? <EmptyState title="This page hit an unexpected error" message={this.state.err.message} hint="Try another page or reload." />
      : this.props.children;
  }
}

export default function App() {
  const path = usePath();
  const Page = ROUTES[path];
  return (
    <Layout>
      <Boundary resetKey={path}>
        {Page ? <Page /> : (
          <EmptyState title="Page not found" message={`There is no page at ${path}.`}
            hint={<Link to="/" className="text-brand-400 underline">Back to the overview</Link>} />
        )}
      </Boundary>
    </Layout>
  );
}

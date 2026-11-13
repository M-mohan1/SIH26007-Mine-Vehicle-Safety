import { AnchorHTMLAttributes, MouseEvent, ReactNode, useSyncExternalStore } from "react";

// Tiny History-API router: 7 static pages do not need a routing library.
const EVT = "app:navigate";

function subscribe(cb: () => void) {
  window.addEventListener("popstate", cb);
  window.addEventListener(EVT, cb);
  return () => { window.removeEventListener("popstate", cb); window.removeEventListener(EVT, cb); };
}
const getPath = () => window.location.pathname.replace(/\/+$/, "") || "/";

export function usePath(): string {
  return useSyncExternalStore(subscribe, getPath, () => "/");
}

export function navigate(to: string) {
  if (to === getPath()) return;
  window.history.pushState({}, "", to);
  window.dispatchEvent(new Event(EVT));
  window.scrollTo(0, 0);
}

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className"> {
  to: string; className?: string | ((active: boolean) => string); children: ReactNode;
}
export function Link({ to, className, children, onClick, ...rest }: LinkProps) {
  const path = usePath();
  const active = path === to;
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return (
    <a href={to} onClick={handle} aria-current={active ? "page" : undefined}
       className={typeof className === "function" ? className(active) : className} {...rest}>
      {children}
    </a>
  );
}

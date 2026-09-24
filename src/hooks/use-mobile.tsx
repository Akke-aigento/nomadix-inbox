import * as React from "react";

// Eén breekpunt voor de hele app (md in Tailwind). De oude tweede hook in
// InboxPage stond op 1024 en begon op `false`, waardoor de desktoplayout
// even opflitste op een telefoon; daarom lezen we matchMedia meteen uit.
export const MOBILE_BREAKPOINT = 768;

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function read(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean>(read);

  React.useEffect(() => {
    const mql = window.matchMedia(QUERY);
    const onChange = (e: MediaQueryListEvent | MediaQueryList) => setIsMobile(e.matches);
    onChange(mql);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

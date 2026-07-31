"use client";

import { useEffect, useState } from "react";

/** Mobile 2×10 = 20, tablet+ 4×10 = 40 */
export function usePageLimit() {
  const [limit, setLimit] = useState(20);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setLimit(mq.matches ? 40 : 20);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  return limit;
}

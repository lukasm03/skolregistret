import { useEffect, useRef, useState } from "react";
import { PerPageControl } from "skolregistret-ui";

function Demo({ openOnMount }: { openOnMount?: boolean }) {
  const [perPage, setPerPage] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (openOnMount) ref.current?.querySelector("button")?.click();
  }, [openOnMount]);
  return (
    // PerPageControl opens its list upward (bottom-[calc(100%+4px)]) — top
    // padding gives the panel room so it doesn't clip against the card edge.
    <div ref={ref} className="flex justify-end pt-[180px]">
      <PerPageControl perPage={perPage} onChange={setPerPage} />
    </div>
  );
}

export const Closed = () => <Demo />;

export const Open = () => <Demo openOnMount />;

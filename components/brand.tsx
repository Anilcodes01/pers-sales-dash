import Link from "next/link";
import { Layers2 } from "lucide-react";
export function Brand() {
  return (
    <Link href="/" className="brand" aria-label="Collective home">
      <span className="brand-symbol">
        <Layers2 size={19} />
      </span>
      <span className="brand-name">Collective<span className="brand-period">.</span></span>
    </Link>
  );
}

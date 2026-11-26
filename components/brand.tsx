import Link from "next/link";
import { Layers2 } from "lucide-react";
export function Brand() {
  return (
    <Link href="/" className="brand">
      <span className="brand-symbol">
        <Layers2 size={19} />
      </span>
      Collective<span className="brand-period">.</span>
    </Link>
  );
}

import type { ClientStatus, AdStatus, CreativeStatus } from "../lib/types";
import { statusColor } from "../lib/utils";

export default function StatusPill({
  status,
}: {
  status: ClientStatus | AdStatus | CreativeStatus;
}) {
  const { bg, text } = statusColor(status);
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 500,
        background: bg,
        color: text,
        textTransform: "capitalize",
      }}
    >
      {status}
    </span>
  );
}

// Browser tab icon for the standalone Proofer surface (/proofer and its
// children). Next generates a favicon from this route-segment file, overriding
// the site-wide app/icon.jpg so Proofer reads as its own product in the tab.
// The mark mirrors the "P" logo in ProoferNav: a rounded mint tile with a bold
// teal "P".
import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#b8e3d8",
          color: "#1f6b5c",
          fontSize: 24,
          fontWeight: 800,
          borderRadius: 7,
        }}
      >
        P
      </div>
    ),
    size
  );
}

import { ImageResponse } from "next/og";

export const runtime = "edge";
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
          background: "#1a1a1a",
          borderRadius: "6px",
        }}
      >
        <div
          style={{
            width: "20px",
            height: "20px",
            borderRadius: "50%",
            background: "#f5f5f4",
            boxShadow: "inset 6px -2px 0 0 #1a1a1a",
          }}
        />
      </div>
    ),
    { ...size }
  );
}
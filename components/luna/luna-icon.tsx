/**
 * Luna Icon — Crescent Moon + Animated Twinkle Star
 *
 * Moon: static crescent.
 * Star: 4-point twinkle with CSS animation (scale + opacity pulse).
 * Animation class defined in globals.css (luna-twinkle keyframes).
 */

interface LunaIconProps {
  className?: string;
  size?: number;
  style?: React.CSSProperties;
  /** Disable the twinkle animation (e.g. inside drawer header) */
  static?: boolean;
}

export function LunaIcon({
  className,
  size = 24,
  style,
  static: isStatic = false,
}: LunaIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {/* Crescent moon */}
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
      {/* 4-point twinkle star — animated */}
      <g
        className={isStatic ? undefined : "luna-twinkle"}
        style={{ transformOrigin: "18px 5px" }}
      >
        <path d="M18 2l.7 2.3L21 5l-2.3.7L18 8l-.7-2.3L15 5l2.3-.7z" />
      </g>
    </svg>
  );
}
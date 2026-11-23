import type { HouseStyle } from "../shared/houses";
export function HouseThumb({ style }: { style: HouseStyle }) {
  const tall = style === "merchant",
    stone = style === "hearthstone",
    river = style === "riverside",
    garden = style === "garden";
  return (
    <svg viewBox="0 0 100 76" aria-hidden="true">
      <ellipse cx="51" cy="68" rx="42" ry="5" fill="#dce1d1" />
      <path
        d={tall ? "M23 29H76V65H23Z" : "M17 35H82V65H17Z"}
        fill={
          stone ? "#b6b5a6" : river ? "#a4b29a" : garden ? "#d2b994" : "#dfcbaa"
        }
        stroke="#8a7d64"
        strokeWidth="1"
      />
      {stone ? (
        <path d="M12 36L31 14H68L88 36Z" fill="#60717b" />
      ) : river ? (
        <path
          d="M10 36L21 19L47 9L76 19L89 36L75 31L66 19L47 14L29 21L22 34Z"
          fill="#8b6250"
        />
      ) : (
        <path
          d={tall ? "M16 30L49 5L84 30Z" : "M9 36L48 10L90 36Z"}
          fill={garden ? "#687d6b" : "#a76c54"}
        />
      )}
      <path
        d={
          tall
            ? "M25 28V65M73 28V65M24 44H74M49 28V44"
            : "M20 36V65M79 36V65M20 46H79"
        }
        stroke="#6b5843"
        strokeWidth={stone ? "0" : "2.5"}
      />
      {stone && (
        <path
          d="M18 43H81M18 51H81M18 59H81M30 36V43M50 43V51M65 51V59M35 59V65"
          stroke="#929183"
          strokeWidth="1"
        />
      )}
      {river && (
        <path d="M19 40H79M19 46H79M19 52H79M19 58H79" stroke="#7c9278" />
      )}
      <path
        d="M44 66V51Q51 43 58 51V66"
        fill="#67523e"
        stroke="#d6c39c"
        strokeWidth="2"
      />
      {[29, 69].map((x) => (
        <g key={x}>
          <rect
            x={x - 5}
            y={tall ? 33 : 45}
            width="10"
            height="12"
            fill="#eacb87"
            stroke="#75614b"
            strokeWidth="2"
          />
          <path
            d={`M${x} ${tall ? 33 : 45}V${tall ? 45 : 57}`}
            stroke="#75614b"
          />
        </g>
      ))}
      {tall && (
        <g>
          <rect
            x="54"
            y="48"
            width="18"
            height="12"
            fill="#e8ca88"
            stroke="#75614b"
            strokeWidth="2"
          />
          <path d="M51 48L63 40L77 48Z" fill="#9b6951" />
        </g>
      )}
      {!stone && !tall && !river && !garden && (
        <g>
          <path d="M34 49L50 38L65 49Z" fill="#a76c54" />
          <path d="M37 49V66M63 49V66" stroke="#6b5843" strokeWidth="2" />
        </g>
      )}
      {river && (
        <g>
          <path d="M12 46H87L82 42H17Z" fill="#8b6250" />
          <path
            d="M16 46V67M83 46V67M18 60H39M63 60H82"
            stroke="#69563f"
            strokeWidth="2"
          />
        </g>
      )}
      {garden && (
        <g>
          <path
            d="M63 52L87 49V66H63Z"
            fill="#b9cbb8"
            stroke="#75614b"
            strokeWidth="2"
          />
          <path d="M73 52V66M65 60H86" stroke="#75614b" />
          <path d="M24 67H38M65 68H79" stroke="#6b8c59" strokeWidth="4" />
          <circle cx="29" cy="65" r="2" fill="#bc7d90" />
          <circle cx="72" cy="66" r="2" fill="#d1ab61" />
        </g>
      )}
      <path d="M69 18V7H76V24" fill="#a59683" stroke="#7d776b" />
      <path d="M67 7H78" stroke="#706a60" strokeWidth="3" />
    </svg>
  );
}

// Hero illustration from ReUI empty-state-3: three stacked cubes on a faint
// grid, drawn in currentColor so it follows the theme.
const GRID_X = [40, 110, 180];
const GRID_Y = [25, 70, 115];

const CUBES = [
  {
    center: [89, 82],
    edge: 0.18,
    outline: 0.28,
    points: "89,58 110,70 110,94 89,106 68,94 68,70",
  },
  {
    center: [110, 70],
    edge: 0.25,
    outline: 0.38,
    points: "110,46 131,58 131,82 110,94 89,82 89,58",
  },
  {
    center: [131, 58],
    edge: 0.35,
    outline: 0.5,
    points: "131,34 152,46 152,70 131,82 110,70 110,46",
  },
] as const;

const HALF_WIDTH = 21;
const HALF_HEIGHT = 12;
const HEIGHT = 24;

export function ProjectsEmptyIllustration() {
  return (
    <div aria-hidden="true" className="relative isolate h-32 w-[13.5rem]">
      <svg className="h-full w-full" fill="none" viewBox="0 0 220 140">
        <title>Projects</title>
        {GRID_X.map((x) => (
          <line
            key={`x-${x}`}
            stroke="currentColor"
            strokeOpacity="0.05"
            strokeWidth="0.5"
            x1={x}
            x2={x}
            y1="0"
            y2="140"
          />
        ))}
        {GRID_Y.map((y) => (
          <line
            key={`y-${y}`}
            stroke="currentColor"
            strokeOpacity="0.05"
            strokeWidth="0.5"
            x1="0"
            x2="220"
            y1={y}
            y2={y}
          />
        ))}
        {CUBES.map(({ center: [cx, cy], edge, outline, points }) => (
          <g key={points}>
            <polygon
              fill="none"
              points={points}
              stroke="currentColor"
              strokeLinejoin="round"
              strokeOpacity={outline}
              strokeWidth="0.75"
            />
            <line
              stroke="currentColor"
              strokeOpacity={edge}
              strokeWidth="0.5"
              x1={cx}
              x2={cx - HALF_WIDTH}
              y1={cy}
              y2={cy - HALF_HEIGHT}
            />
            <line
              stroke="currentColor"
              strokeOpacity={edge}
              strokeWidth="0.5"
              x1={cx}
              x2={cx + HALF_WIDTH}
              y1={cy}
              y2={cy - HALF_HEIGHT}
            />
            <line
              stroke="currentColor"
              strokeOpacity={edge}
              strokeWidth="0.5"
              x1={cx}
              x2={cx}
              y1={cy}
              y2={cy + HEIGHT}
            />
          </g>
        ))}
        <path
          d="M148 22 L155 26 L148 30 L141 26 Z"
          fill="none"
          stroke="currentColor"
          strokeDasharray="2 2"
          strokeOpacity="0.18"
          strokeWidth="0.5"
        />
        <circle cx="40" cy="70" fill="currentColor" opacity="0.1" r="1.5" />
        <circle cx="180" cy="70" fill="currentColor" opacity="0.1" r="1.5" />
        <circle cx="110" cy="25" fill="currentColor" opacity="0.07" r="1.5" />
      </svg>
    </div>
  );
}

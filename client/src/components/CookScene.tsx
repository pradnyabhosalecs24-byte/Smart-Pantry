import type { CookAction } from "../lib/types";

/**
 * Animated illustration of a cooking action, drawn in SVG and animated with CSS
 * (see the "Cook-along scenes" block in index.css). Works offline, follows the theme,
 * and becomes a still picture when the user prefers reduced motion.
 */

export const ACTION_LABEL: Record<CookAction, string> = {
  wash: "Wash",
  chop: "Chop",
  grate: "Grate",
  boil: "Boil",
  fry: "Fry",
  temper: "Temper",
  simmer: "Simmer",
  mix: "Mix",
  mash: "Mash",
  knead: "Knead",
  roll: "Shape & roll",
  bake: "Bake",
  blend: "Blend",
  soak: "Soak",
  steam: "Cook covered",
  rest: "Rest",
  serve: "Serve",
};

const C = {
  metal: "var(--slate)",
  metalLight: "var(--slate-soft)",
  food: "var(--turmeric-bar)",
  green: "var(--basil)",
  red: "var(--chilli)",
  water: "#5aa9e6",
  wood: "#b98454",
  woodDark: "#8f6138",
  dough: "#efd9a7",
  steam: "var(--ink-3)",
  line: "var(--line-strong)",
};

function Flame({ small = false }: { small?: boolean }) {
  return (
    <g className={small ? "cs-flame cs-flame-sm" : "cs-flame"}>
      <rect x="110" y="178" width="100" height="6" rx="3" fill={C.line} />
      {[130, 150, 170, 190].map((x, i) => (
        <path key={x} d={`M${x} 178 q-7 -10 0 -${small ? 12 : 20} q7 10 0 ${small ? 12 : 20}`} fill={i % 2 ? C.food : C.red} style={{ animationDelay: `${i * 0.12}s` }} className="cs-lick" />
      ))}
    </g>
  );
}

function Steam({ x = 160, y = 70, n = 3 }: { x?: number; y?: number; n?: number }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <path
          key={i}
          d={`M${x - 24 + i * 24} ${y} q-8 -10 0 -20 q8 -10 0 -20`}
          stroke={C.steam}
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          className="cs-steam"
          style={{ animationDelay: `${i * 0.5}s` }}
        />
      ))}
    </g>
  );
}

function Pot({ lid = false }: { lid?: boolean }) {
  return (
    <g>
      <rect x="95" y="95" width="130" height="78" rx="12" fill={C.metal} />
      <rect x="80" y="104" width="18" height="8" rx="4" fill={C.metal} />
      <rect x="222" y="104" width="18" height="8" rx="4" fill={C.metal} />
      {lid ? (
        <g className="cs-lid">
          <path d="M90 95 q70 -26 140 0 z" fill={C.metal} />
          <rect x="152" y="76" width="16" height="8" rx="4" fill={C.metal} />
        </g>
      ) : (
        <ellipse cx="160" cy="97" rx="62" ry="8" fill={C.water} opacity="0.85" />
      )}
    </g>
  );
}

function Bowl({ fill = C.food }: { fill?: string }) {
  return (
    <g>
      <ellipse cx="160" cy="118" rx="70" ry="12" fill={fill} />
      <path d="M90 118 q70 80 140 0 z" fill={C.metal} />
      <ellipse cx="160" cy="118" rx="70" ry="12" fill="none" stroke={C.metal} strokeWidth="4" />
    </g>
  );
}

function Board() {
  return <rect x="60" y="150" width="200" height="22" rx="8" fill={C.wood} />;
}

function Scene({ action }: { action: CookAction }) {
  switch (action) {
    case "boil":
    case "simmer": {
      const many = action === "boil";
      return (
        <>
          <Steam y={78} n={many ? 3 : 2} />
          <Pot />
          {Array.from({ length: many ? 6 : 3 }, (_, i) => (
            <circle key={i} cx={115 + i * (many ? 18 : 35)} cy={140} r={many ? 6 : 4} fill="#fff" opacity="0.8" className={many ? "cs-bubble" : "cs-bubble cs-slow"} style={{ animationDelay: `${i * 0.27}s` }} />
          ))}
          <Flame small={!many} />
        </>
      );
    }
    case "steam":
      return (
        <>
          <Steam y={70} n={3} />
          <Pot lid />
          <Flame small />
        </>
      );
    case "fry":
      return (
        <>
          <g className="cs-shake">
            <ellipse cx="160" cy="150" rx="78" ry="16" fill={C.metal} />
            <ellipse cx="160" cy="146" rx="66" ry="10" fill={C.food} opacity="0.35" />
            <rect x="236" y="144" width="66" height="9" rx="4.5" fill={C.woodDark} />
            {[120, 145, 170, 195].map((x, i) => (
              <rect key={x} x={x} y={132} width="18" height="12" rx="4" fill={i % 2 ? C.food : C.green} className="cs-hop" style={{ animationDelay: `${i * 0.18}s` }} />
            ))}
          </g>
          <Flame />
        </>
      );
    case "temper":
      return (
        <>
          <path d="M100 135 q60 50 120 0 z" fill={C.metal} />
          <ellipse cx="160" cy="135" rx="60" ry="9" fill={C.food} opacity="0.45" />
          {Array.from({ length: 9 }, (_, i) => (
            <circle key={i} cx={118 + i * 10} cy={132} r="3.2" fill={i % 3 ? "#3d2a1a" : C.green} className="cs-pop" style={{ animationDelay: `${(i * 0.17) % 1}s` }} />
          ))}
          <Flame small />
        </>
      );
    case "chop":
      return (
        <>
          <Board />
          <circle cx="110" cy="134" r="18" fill={C.red} />
          <path d="M110 116 q4 -8 10 -6" stroke={C.green} strokeWidth="4" fill="none" strokeLinecap="round" />
          {[150, 168, 186, 204].map((x, i) => (
            <rect key={x} x={x} y={138} width="10" height="12" rx="3" fill={C.red} opacity={0.9 - i * 0.12} />
          ))}
          <g className="cs-chop">
            <rect x="212" y="78" width="12" height="38" rx="5" fill={C.woodDark} />
            <path d="M206 116 h24 l-4 34 q-10 6 -20 0 z" fill={C.metalLight} stroke={C.metal} strokeWidth="2" />
          </g>
        </>
      );
    case "grate":
      return (
        <>
          <path d="M130 60 h60 l14 110 h-88 z" fill={C.metalLight} stroke={C.metal} strokeWidth="3" />
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x={142 + (i % 3) * 14} y={78 + Math.floor(i / 3) * 20} width="8" height="4" rx="2" fill={C.metal} />
          ))}
          <rect x="150" y="40" width="34" height="40" rx="8" fill={C.food} className="cs-grate" />
          {[120, 205, 128, 198].map((x, i) => (
            <rect key={i} x={x} y={150} width="4" height="12" rx="2" fill={C.food} className="cs-fall" style={{ animationDelay: `${i * 0.3}s` }} />
          ))}
        </>
      );
    case "mix":
      return (
        <>
          <Bowl />
          <g className="cs-stir">
            <rect x="196" y="40" width="9" height="80" rx="4.5" fill={C.woodDark} transform="rotate(20 200 80)" />
          </g>
          <path d="M130 118 q30 -10 60 0" stroke="#fff" strokeOpacity="0.6" strokeWidth="3" fill="none" className="cs-swirl" />
        </>
      );
    case "mash":
      return (
        <>
          <Bowl fill={C.dough} />
          <g className="cs-press">
            <rect x="155" y="34" width="10" height="70" rx="5" fill={C.woodDark} />
            <rect x="132" y="102" width="56" height="9" rx="4" fill={C.metal} />
          </g>
        </>
      );
    case "knead":
      return (
        <>
          <Board />
          <ellipse cx="160" cy="138" rx="56" ry="18" fill={C.dough} className="cs-squish" />
          <g className="cs-press">
            <ellipse cx="140" cy="112" rx="18" ry="11" fill="#d9a77c" />
            <ellipse cx="180" cy="112" rx="18" ry="11" fill="#d9a77c" />
          </g>
        </>
      );
    case "roll":
      return (
        <>
          <Board />
          <ellipse cx="160" cy="145" rx="72" ry="8" fill={C.dough} />
          <g className="cs-roll">
            <rect x="110" y="122" width="100" height="16" rx="8" fill={C.wood} />
            <rect x="92" y="126" width="20" height="8" rx="4" fill={C.woodDark} />
            <rect x="208" y="126" width="20" height="8" rx="4" fill={C.woodDark} />
          </g>
        </>
      );
    case "bake":
      return (
        <>
          <rect x="85" y="50" width="150" height="125" rx="12" fill={C.metal} />
          <rect x="102" y="80" width="116" height="78" rx="8" fill="#2b1d12" />
          <rect x="102" y="80" width="116" height="78" rx="8" fill={C.food} className="cs-glow" />
          <rect x="125" y="128" width="70" height="14" rx="5" fill={C.wood} />
          {[110, 130, 150].map((x) => (
            <circle key={x} cx={x} cy="64" r="5" fill={C.metalLight} />
          ))}
        </>
      );
    case "blend":
      return (
        <>
          <path d="M125 40 h70 l-10 100 h-50 z" fill={C.metalLight} stroke={C.metal} strokeWidth="3" opacity="0.95" />
          <path d="M131 80 h58 l-6 60 h-46 z" fill={C.food} opacity="0.7" />
          <g className="cs-spin" style={{ transformOrigin: "160px 110px" }}>
            <path d="M160 110 q16 -16 26 0 q-16 16 -26 0 q-16 -16 -26 0 q16 16 26 0" fill="#fff" opacity="0.75" />
          </g>
          <rect x="120" y="140" width="80" height="34" rx="8" fill={C.metal} />
          <circle cx="160" cy="157" r="7" fill={C.green} />
        </>
      );
    case "soak":
      return (
        <>
          <Bowl fill={C.water} />
          {[0, 1, 2].map((i) => (
            <ellipse key={i} cx="160" cy="118" rx="20" ry="4" fill="none" stroke="#fff" strokeWidth="2" className="cs-ripple" style={{ animationDelay: `${i * 0.7}s` }} />
          ))}
          {[135, 150, 170, 185].map((x) => (
            <ellipse key={x} cx={x} cy={128} rx="5" ry="3" fill={C.dough} />
          ))}
        </>
      );
    case "rest":
      return (
        <>
          <circle cx="160" cy="110" r="62" fill={C.metalLight} stroke={C.metal} strokeWidth="5" />
          {Array.from({ length: 12 }, (_, i) => (
            <rect key={i} x="158" y="54" width="4" height="9" rx="2" fill={C.metal} transform={`rotate(${i * 30} 160 110)`} />
          ))}
          <rect x="157" y="76" width="6" height="36" rx="3" fill={C.green} className="cs-spin cs-slow" style={{ transformOrigin: "160px 110px" }} />
          <rect x="157" y="92" width="6" height="20" rx="3" fill={C.metal} />
          <circle cx="160" cy="110" r="6" fill={C.metal} />
        </>
      );
    case "wash":
      return (
        <>
          <path d="M120 40 h60 v14 h-20 v18 h-20 v-18 h-20 z" fill={C.metal} />
          {[0, 1, 2, 3].map((i) => (
            <path key={i} d="M150 78 q4 8 0 12 q-4 -4 0 -12" fill={C.water} className="cs-drop" style={{ animationDelay: `${i * 0.25}s` }} transform={`translate(${(i % 2) * 8} 0)`} />
          ))}
          <path d="M100 135 q60 60 120 0 z" fill={C.metal} />
          <circle cx="140" cy="128" r="14" fill={C.red} />
          <circle cx="170" cy="126" r="13" fill={C.green} />
          <circle cx="190" cy="131" r="10" fill={C.food} />
        </>
      );
    case "serve":
    default:
      return (
        <>
          <Steam y={96} n={3} />
          <ellipse cx="160" cy="150" rx="92" ry="18" fill={C.metalLight} stroke={C.line} strokeWidth="2" />
          <path d="M108 146 q52 -60 104 0 z" fill={C.food} />
          <circle cx="140" cy="128" r="4" fill={C.green} />
          <circle cx="170" cy="122" r="4" fill={C.green} />
          <circle cx="186" cy="134" r="4" fill={C.red} />
          {[70, 250, 92].map((x, i) => (
            <path key={x} d={`M${x} ${60 + i * 20} l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z`} fill={C.food} className="cs-twinkle" style={{ animationDelay: `${i * 0.4}s` }} />
          ))}
        </>
      );
  }
}

export function CookScene({ action, className = "", label = true }: { action: CookAction; className?: string; label?: boolean }) {
  return (
    <figure className={`relative ${className}`}>
      <svg viewBox="0 0 320 200" className="h-full w-full" role="img" aria-label={`Animation: ${ACTION_LABEL[action]}`}>
        <Scene action={action} />
      </svg>
      {label && (
        <figcaption className="absolute top-3 left-3 rounded-full bg-surface/90 px-3 py-1 text-sm font-semibold text-bay shadow-sm">{ACTION_LABEL[action]}</figcaption>
      )}
    </figure>
  );
}

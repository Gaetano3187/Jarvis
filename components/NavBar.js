function NeonLightningLogo() {
  return (
    <svg className="jarvis-neon" viewBox="0 0 1100 260" preserveAspectRatio="xMidYMid meet" aria-label="Logo JARVIS fulmini realistici">
      <defs>
        {/* --- NUVOLE/NEBBIA --- */}
        <filter id="clouds" x="-20%" y="-40%" width="140%" height="200%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="7" result="n">
            <animate attributeName="baseFrequency" dur="10s" values="0.008;0.016;0.012;0.01;0.008" repeatCount="indefinite"/>
          </feTurbulence>
          <feColorMatrix type="matrix" values="
            0 0 0 0 0.08
            0 0 0 0 0.16
            0 0 0 0 0.26
            0 0 0 0.35 0" />
          <feGaussianBlur stdDeviation="18"/>
        </filter>

        {/* --- GLOW ESTERNO + BLOOM --- */}
        <filter id="bloom" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="3" result="a"/>
          <feGaussianBlur stdDeviation="12" in="SourceGraphic" result="b"/>
          <feMerge>
            <feMergeNode in="b"/>
            <feMergeNode in="a"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        {/* --- DISTORSIONE ELETTRICA --- */}
        <filter id="shock" x="-20%" y="-40%" width="140%" height="220%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="1" seed="3" result="n">
            <animate attributeName="seed" dur="0.18s" values="3;6;9;12;3" repeatCount="indefinite"/>
          </feTurbulence>
          <feDisplacementMap in="SourceGraphic" in2="n" scale="2.5"/>
        </filter>

        {/* --- GRADIENTE NEON --- */}
        <linearGradient id="neon" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%"  stopColor="#9ae6ff"/>
          <stop offset="50%" stopColor="#67b7ff"/>
          <stop offset="100%" stopColor="#33d0ff"/>
        </linearGradient>

        {/* --- MASCHERA TESTO --- */}
        <mask id="maskText">
          <rect width="100%" height="100%" fill="black"/>
          <text x="50%" y="50%" dy="28" textAnchor="middle"
            fontFamily="Orbitron, system-ui, sans-serif" fontWeight="900" fontSize="150"
            fill="white" style={{letterSpacing:'14px'}}>JARVIS</text>
        </mask>

        <style>{`
          .core   { stroke:#ffffff; stroke-width:3.6; stroke-linecap:round; filter:url(#bloom); }
          .halo   { stroke:url(#neon); stroke-width:10; opacity:.75; filter:url(#bloom); }
          .branch { stroke:#b9eeff; stroke-width:2; opacity:.9; filter:url(#bloom); }
          .spark  { stroke:#e6faff; stroke-width:1.2; opacity:.9; }
          .neonStroke { fill:transparent; stroke:url(#neon); stroke-width:8; filter:url(#bloom); }
          .neonFill   { fill:url(#neon); opacity:.15; filter:url(#bloom); }
        `}</style>
      </defs>

      {/* BACKPLATE con nuvole leggere */}
      <g filter="url(#clouds)">
        <rect x="0" y="0" width="1100" height="260" fill="black" opacity="0"/>
      </g>

      {/* Testo neon (contorno + riempimento debole) deformato leggermente */}
      <g filter="url(#shock)">
        <text x="50%" y="50%" dy="28" textAnchor="middle"
          fontFamily="Orbitron, system-ui, sans-serif" fontWeight="900" fontSize="150"
          className="neonStroke" style={{letterSpacing:'14px'}}>JARVIS</text>
      </g>
      <text x="50%" y="50%" dy="28" textAnchor="middle"
        fontFamily="Orbitron, system-ui, sans-serif" fontWeight="900" fontSize="150"
        className="neonFill" style={{letterSpacing:'14px'}}>JARVIS</text>

      {/* Fulmini PRINCIPALI dentro le lettere */}
      <g mask="url(#maskText)">
        {/* Ogni fulmine è doppio: alone + nucleo */}
        <g>
          <polyline className="halo" points="
            70,150 120,110 170,140 230,90 300,120 360,80 430,125 520,90 590,130 660,100 740,135 820,95 900,125 980,100"/>
          <polyline className="core" points="
            70,150 120,110 170,140 230,90 300,120 360,80 430,125 520,90 590,130 660,100 740,135 820,95 900,125 980,100">
            <animate attributeName="stroke-dasharray" dur="0.22s" values="0 1600;1600 1600;0 1600" repeatCount="indefinite"/>
            <animate attributeName="opacity" dur="0.22s" values="0;1;0" repeatCount="indefinite"/>
          </polyline>
        </g>

        {/* Secondo fulmine sfasato */}
        <g>
          <polyline className="halo" points="
            90,90 150,130 210,100 280,140 350,95 420,135 500,85 580,130 660,90 740,125 820,85 900,120 980,80"/>
          <polyline className="core" points="
            90,90 150,130 210,100 280,140 350,95 420,135 500,85 580,130 660,90 740,125 820,85 900,120 980,80">
            <animate attributeName="stroke-dasharray" dur="0.26s" values="0 1600;1600 1600;0 1600" repeatCount="indefinite" begin=".08s"/>
            <animate attributeName="opacity" dur="0.26s" values="0;1;0" repeatCount="indefinite" begin=".08s"/>
          </polyline>
        </g>

        {/* Ramificazioni (branching) */}
        <g>
          <polyline className="branch" points="300,120 280,70 265,60">
            <animate attributeName="opacity" dur="0.35s" values="0;1;0" repeatCount="indefinite" begin=".05s"/>
          </polyline>
          <polyline className="branch" points="520,90 545,60 560,46">
            <animate attributeName="opacity" dur="0.32s" values="0;1;0" repeatCount="indefinite" begin=".12s"/>
          </polyline>
          <polyline className="branch" points="740,135 760,170 774,186">
            <animate attributeName="opacity" dur="0.3s" values="0;1;0" repeatCount="indefinite" begin=".2s"/>
          </polyline>
        </g>

        {/* Scintille */}
        <g>
          <line className="spark" x1="160" y1="105" x2="148" y2="90">
            <animate attributeName="opacity" dur="0.18s" values="0;1;0" repeatCount="indefinite"/>
          </line>
          <line className="spark" x1="610" y1="92" x2="628" y2="76">
            <animate attributeName="opacity" dur="0.22s" values="0;1;0" repeatCount="indefinite" begin=".06s"/>
          </line>
          <line className="spark" x1="860" y1="140" x2="875" y2="160">
            <animate attributeName="opacity" dur="0.2s" values="0;1;0" repeatCount="indefinite" begin=".12s"/>
          </line>
        </g>
      </g>

      {/* Flash globali (colpo di luce) */}
      <rect x="0" y="0" width="1100" height="260" fill="#b8ecff" opacity="0">
        <animate attributeName="opacity" dur="1.6s" values="0;0;0.35;0" keyTimes="0;.55;.56;1" repeatCount="indefinite"/>
      </rect>
    </svg>
  );
}

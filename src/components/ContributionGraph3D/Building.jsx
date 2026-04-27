/**
 * Building.jsx
 *
 * Origin (0,0) = TOP vertex of the rhombus top-face.
 * The shaft grows DOWNWARD from the rhombus.
 *
 * Rhombus corners (local coords):
 *   T = (0,      0)         ← origin / top vertex
 *   L = (-TW/2,  TH/2)     ← left vertex
 *   B = (0,      TH)        ← bottom vertex
 *   R = (+TW/2,  TH/2)     ← right vertex
 *
 * Shaft bottom edges (H px below rhombus):
 *   LB = (-TW/2,  TH/2 + H)
 *   BB = (0,      TH   + H)
 *   RB = (+TW/2,  TH/2 + H)
 *
 * Face geometry:
 *   Left  face: L → B → BB → LB   (parallelogram)
 *   Right face: R → B → BB → RB   (parallelogram)
 *   Top   face: T → R → B  → L    (rhombus)
 *
 * Window placement (isometric-correct):
 *   Left face runs from x = Lx (= -TW/2) to x = Bx (= 0)  → width = TW/2
 *   Right face runs from x = Bx (= 0)    to x = Rx (= TW/2) → width = TW/2
 *   Windows are horizontally centred within each face column.
 */

import { useMemo } from "react";
import { adjustBrightness } from "../../utils/colorUtils";
import { TILE_W, TILE_H, MIN_BUILD_H, BUILD_UNIT } from "../../constants/graph";

export function Building({ cell, maxCount, theme, hovered }) {
  const { count, date } = cell;
  const empty = count === 0;

  // Absolute height: sqrt(count) * BUILD_UNIT — uncapped, so a 400-commit day
  // really towers over a 100-commit one. The IsometricGrid expands its
  // viewBox padding to fit the tallest building.
  const H = empty ? MIN_BUILD_H : Math.max(4, Math.sqrt(count) * BUILD_UNIT);

  // Colour level still uses linear count/maxCount so the legend's 5 buckets
  // are calibrated to this user's range.
  const colourRatio = empty ? 0 : count / Math.max(maxCount, 1);

  const TW = TILE_W, TH = TILE_H;

  // Colours
  const level    = empty ? 0 : Math.min(4, Math.ceil(colourRatio * 4));
  const base     = theme.levels[level];
  const colTop   = hovered ? adjustBrightness(base, 65)  : adjustBrightness(base, 35);
  const colLeft  = hovered ? adjustBrightness(base, 15)  : base;
  const colRight = hovered ? adjustBrightness(base, -8)  : adjustBrightness(base, -35);
  const colEdge  = adjustBrightness(base, -55);

  // Geometry
  const Tx = 0,        Ty = 0;
  const Lx = -TW / 2,  Ly = TH / 2;
  const Bx = 0,        By = TH;
  const Rx =  TW / 2,  Ry = TH / 2;
  const LBy = Ly + H,  BBy = By + H,  RBy = Ry + H;

  // Windows —————————————————————————————————————————————————————————————
  // Floor height: minimum 8 px so windows aren't crushed
  const seed   = date ? parseInt(date.replace(/-/g, ""), 10) : 0;
  const floors = empty || H < 14 ? 0 : Math.max(1, Math.floor(H / 9));

  // Window size: small, fixed — scale with tile, not building height
  const wW = Math.max(1.5, TW * 0.13);   // ~1.5 px wide
  const wH = Math.max(1.5, TH * 0.55);   // ~1.5 px tall

  const windows = useMemo(() => {
    if (floors === 0) return [];
    const ws = [];
    for (let f = 0; f < floors; f++) {
      // LEFT face — 2 windows per floor, horizontally centred
      ws.push({ f, face: "L", col: 0, lit: ((seed * (f + 1) * 3 + 1) % 7) > 2 });
      ws.push({ f, face: "L", col: 1, lit: ((seed * (f + 1) * 5 + 2) % 7) > 2 });
      // RIGHT face — 2 windows per floor
      ws.push({ f, face: "R", col: 0, lit: ((seed * (f + 1) * 7 + 3) % 7) > 2 });
      ws.push({ f, face: "R", col: 1, lit: ((seed * (f + 1) * 11+ 4) % 7) > 2 });
    }
    return ws;
  }, [date, floors, seed]);

  const glow = hovered
    ? `drop-shadow(0 0 4px ${theme.glow}) drop-shadow(0 0 10px ${theme.glow}50)`
    : "none";

  return (
    <g style={{ filter: glow, transition: "filter 0.12s", cursor: "pointer" }}>

      {/* Right face — draw first (further from viewer) */}
      <polygon
        points={`${Rx},${Ry} ${Bx},${By} ${Bx},${BBy} ${Rx},${RBy}`}
        fill={colRight} stroke={colEdge} strokeWidth={0.4}
      />

      {/* Left face */}
      <polygon
        points={`${Lx},${Ly} ${Bx},${By} ${Bx},${BBy} ${Lx},${LBy}`}
        fill={colLeft} stroke={colEdge} strokeWidth={0.4}
      />

      {/* Top rhombus face */}
      <polygon
        points={`${Tx},${Ty} ${Rx},${Ry} ${Bx},${By} ${Lx},${Ly}`}
        fill={colTop} stroke={colEdge} strokeWidth={0.4}
      />

      {/* Roof highlight line */}
      {!empty && (
        <polyline
          points={`${Lx},${Ly} ${Tx},${Ty} ${Rx},${Ry}`}
          fill="none"
          stroke={adjustBrightness(base, 90)}
          strokeWidth={0.55}
          opacity={0.5}
        />
      )}

      {/* LEFT-face windows — sheared to match the face's isometric slope.
          Face top edge runs from L(Lx, Ly) → B(Bx, By); slope = +TH/TW (= +0.5).
          Each window is a parallelogram with vertical left/right edges and
          slanted top/bottom edges parallel to the face top edge. */}
      {windows.map(({ f, face, col, lit }) => {
        if (face !== "L") return null;
        const fH    = H / floors;
        const colW  = (TW / 2) / 2;                              // 2 cols per face
        const u     = col * colW + (colW - wW) / 2;              // face-local x from Lx
        const v     = H - (f + 1) * fH + fH * 0.28;              // face-local y from top edge
        const slope = TH / TW;                                   // +0.5 for 2:1 iso
        const x0 = Lx + u,        y0 = Ly + slope * u + v;
        const x1 = Lx + u + wW,   y1 = Ly + slope * (u + wW) + v;
        return (
          <polygon key={`lw${f}c${col}`}
            points={`${x0},${y0} ${x1},${y1} ${x1},${y1 + wH} ${x0},${y0 + wH}`}
            fill={lit ? theme.winLit : theme.winDark}
            opacity={lit ? (hovered ? 1 : 0.88) : 0.18}
          />
        );
      })}

      {/* RIGHT-face windows — slope = −TH/TW (face top edge runs B → R, sloping up). */}
      {windows.map(({ f, face, col, lit }) => {
        if (face !== "R") return null;
        const fH    = H / floors;
        const colW  = (TW / 2) / 2;
        const u     = col * colW + (colW - wW) / 2;              // face-local x from Bx
        const v     = H - (f + 1) * fH + fH * 0.28;
        const slope = -TH / TW;                                  // −0.5
        const x0 = Bx + u,        y0 = By + slope * u + v;
        const x1 = Bx + u + wW,   y1 = By + slope * (u + wW) + v;
        return (
          <polygon key={`rw${f}c${col}`}
            points={`${x0},${y0} ${x1},${y1} ${x1},${y1 + wH} ${x0},${y0 + wH}`}
            fill={lit ? theme.winLit : theme.winDark}
            opacity={lit ? 0.62 : 0.13}
          />
        );
      })}

      {/* Antenna — only tall buildings */}
      {H > 36 && !empty && (
        <>
          <line
            x1={Tx} y1={Ty - 10} x2={Tx} y2={Ty}
            stroke={adjustBrightness(base, 55)} strokeWidth={0.7}
          />
          <circle cx={Tx} cy={Ty - 10} r={1.2}
            fill={hovered ? theme.accent : adjustBrightness(base, 80)}
            style={{ filter: hovered ? `drop-shadow(0 0 3px ${theme.accent})` : "none" }}
          />
        </>
      )}

      {/* Hover ring on top face */}
      {hovered && (
        <polygon
          points={`${Tx},${Ty} ${Rx},${Ry} ${Bx},${By} ${Lx},${Ly}`}
          fill="none" stroke={theme.accent} strokeWidth={1.2} opacity={0.95}
        />
      )}
    </g>
  );
}

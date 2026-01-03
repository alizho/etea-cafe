import { useEffect, useMemo, useRef, useState } from "react";
import { keyOf, type Pos } from "./engine/types";
import {
  clearPath,
  initGame,
  stepSimulation,
  tryAppendPath,
} from "./engine/game";
import type { GameState } from "./engine/game";
import { buildLevel } from "./levels/loader";
import { getDailyLevelData } from "./levels/daily";

function inBounds(levelW: number, levelH: number, p: Pos) {
  return p.x >= 0 && p.x < levelW && p.y >= 0 && p.y < levelH;
}

export default function App() {
  const level = useMemo(() => buildLevel(getDailyLevelData()), []);
  const [state, setState] = useState<GameState>(() => initGame(level));
  const [isDrawing, setIsDrawing] = useState(false);

  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (state.status !== "running") {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    timerRef.current = window.setInterval(() => {
      setState((s) => stepSimulation(s));
    }, 250);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [state.status]);

  const servedList = useMemo(() => {
    const entries = Object.entries(state.served).map(
      ([k, v]) => `${k}:${v ? "✅" : "❌"}`
    );
    return entries.join("  ");
  }, [state.served]);

  const ordersList = useMemo(() => {
    const entries = Object.entries(state.level.orders);
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([customerId, drinks]) => {
      const label = drinks.length ? drinks.join(" + ") : "(none)";
      return `${customerId} → ${label}`;
    });
  }, [state.level.orders]);

  function tileEmoji(p: Pos) {
    const k = keyOf(p);

    if (state.level.walls.has(k)) return "⬛";

    if (state.glorboPos.x === p.x && state.glorboPos.y === p.y) return "👽";

    const station = state.level.drinkStations[k];
    if (station === "D1") return "🍵1";
    if (station === "D2") return "🍵2";

    const cust = state.level.customers[k];
    if (cust) return `🧍${cust}`;

    const onPath = state.path.some((q) => q.x === p.x && q.y === p.y);
    if (onPath) return "🟦";

    return "⬜";
  }

  function handlePointerDown(p: Pos) {
    if (state.status !== "idle") return;
    const last = state.path[state.path.length - 1] ?? state.level.start;
    if (p.x !== last.x || p.y !== last.y) return;
    setIsDrawing(true);
  }

  function handlePointerEnter(p: Pos) {
    if (!isDrawing) return;
    if (state.status !== "idle") return;
    if (!inBounds(state.level.width, state.level.height, p)) return;
    setState((s) => tryAppendPath(s, p));
  }

  function stopDrawing() {
    setIsDrawing(false);
  }

  function run() {
    if (state.status !== "idle") return;
    setState((s) => ({ ...s, status: "running", message: "Running..." }));
  }

  const pathLabel = useMemo(() => {
    return state.path.map((p) => `(${p.x},${p.y})`).join(" → ");
  }, [state.path]);

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
        boxSizing: "border-box",
      }}
    >
      <div style={{ display: "flex", gap: 24 }}>
        <div
          onPointerUp={stopDrawing}
          onPointerLeave={stopDrawing}
          style={{ userSelect: "none" }}
        >
          <div style={{ marginBottom: 8, textAlign: "left" }}>
            <div>steps: {state.stepsTaken}</div>
            <div>{state.message}</div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${state.level.width}, 36px)`,
              gap: 2,
            }}
          >
            {Array.from({ length: state.level.height }).map((_, y) =>
              Array.from({ length: state.level.width }).map((__, x) => {
                const p = { x, y };
                return (
                  <div
                    key={`${x},${y}`}
                    onPointerDown={() => handlePointerDown(p)}
                    onPointerEnter={() => handlePointerEnter(p)}
                    style={{
                      width: 36,
                      height: 36,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      border: "1px solid currentColor",
                      fontSize: 14,
                    }}
                  >
                    {tileEmoji(p)}
                  </div>
                );
              })
            )}
          </div>

          <div
            style={{
              marginTop: 8,
              maxWidth: state.level.width * 40,
              whiteSpace: "normal",
              overflowWrap: "anywhere",
              textAlign: "left",
            }}
          >
            ur path: {pathLabel}
          </div>
        </div>

        <div style={{ minWidth: 260, textAlign: "left" }}>
          <h3 style={{ marginTop: 0 }}>orders</h3>
          <ul>
            {ordersList.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>

          <div style={{ marginTop: 8 }}>
            <div>in hand: {state.inventory.join(", ") || "(empty)"}</div>
            <div>served: {servedList}</div>
          </div>

          <h3>controls</h3>
          <button onClick={run} disabled={state.status !== "idle"}>
            run
          </button>{" "}
          <button
            onClick={() => setState((s) => clearPath(s))}
            disabled={state.status === "running"}
          >
            retry
          </button>{" "}
        </div>
      </div>
    </div>
  );
}

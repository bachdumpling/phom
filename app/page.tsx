"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";

type Player = {
  id: string;
  name: string;
};

type PlacementKey = "first" | "second" | "third" | "fourth";

type Transfer = {
  id: string;
  from: string;
  to: string;
  points: number;
};

type Game = {
  id: string;
  u: boolean;
  placements: Record<PlacementKey, string>;
  anChot: Transfer[];
  chay: Transfer[];
};

type Session = {
  id: string;
  name: string;
  players: Player[];
  games: Game[];
  currentGameIndex: number;
  createdAt: number;
};

type Screen = "home" | "session" | "summary";

const STORAGE_KEY = "phom_sessions_v1";

const DROP_CHAY_ID = "drop-chay";
const placementDropId = (key: PlacementKey) => `placement-${key}`;

const parseDropTarget = (
  id: string
): { type: "placement"; key: PlacementKey } | { type: "chay" } | null => {
  if (id === DROP_CHAY_ID) {
    return { type: "chay" };
  }
  if (id.startsWith("placement-")) {
    const key = id.replace("placement-", "") as PlacementKey;
    if (["first", "second", "third", "fourth"].includes(key)) {
      return { type: "placement", key };
    }
  }
  return null;
};

const makeId = () =>
  typeof crypto !== "undefined"
    ? crypto.randomUUID()
    : `id_${Math.random().toString(36).slice(2, 10)}`;

const createPlayers = (names?: string[]): Player[] =>
  ["p1", "p2", "p3", "p4"].map((id, index) => ({
    id,
    name: names?.[index]?.trim() || `Người chơi ${index + 1}`
  }));

const createGame = (): Game => ({
  id: makeId(),
  u: false,
  placements: {
    first: "",
    second: "",
    third: "",
    fourth: ""
  },
  anChot: [],
  chay: []
});

const createSession = (index: number, names?: string[]): Session => ({
  id: makeId(),
  name: `Phiên ${String(index).padStart(2, "0")}`,
  players: createPlayers(names),
  games: [createGame()],
  currentGameIndex: 0,
  createdAt: Date.now()
});

const formatSigned = (value: number) => (value > 0 ? `+${value}` : `${value}`);

const getDistinctPlayer = (players: Player[], exclude: string) =>
  players.find((player) => player.id !== exclude)?.id ?? exclude;

const createTransfer = (players: Player[], game: Game): Transfer => {
  const winner = game.placements.first || players[0].id;
  const fromCandidate = game.placements.fourth || players[3]?.id || players[0].id;
  const from = fromCandidate;
  const to = from === winner ? getDistinctPlayer(players, from) : winner;

  return {
    id: makeId(),
    from,
    to,
    points: 4
  };
};

const computeGamePoints = (game: Game, players: Player[]) => {
  const points: Record<string, number> = Object.fromEntries(
    players.map((player) => [player.id, 0])
  );
  const warnings: string[] = [];

  const applyTransfer = (transfer: Transfer) => {
    if (!transfer.from || !transfer.to || transfer.from === transfer.to) {
      warnings.push("Chuyển điểm chưa hợp lệ");
      return;
    }
    points[transfer.from] -= transfer.points;
    points[transfer.to] += transfer.points;
  };

  if (game.u) {
    const winner = game.placements.first;
    if (!winner) {
      warnings.push("Chưa chọn người Ù");
    } else {
      players.forEach((player) => {
        points[player.id] = player.id === winner ? 15 : -5;
      });
    }
  } else {
    const winner = game.placements.first;
    const chaySet = new Set(game.chay.map((transfer) => transfer.from).filter(Boolean));
    const hasChay = chaySet.size > 0;

    if (hasChay) {
      if (!winner) {
        warnings.push("Cần chọn người thắng để tính cháy");
      } else if (chaySet.has(winner)) {
        warnings.push("Người thắng không thể bị cháy");
      } else {
        chaySet.forEach((playerId) => {
          if (playerId === winner) {
            return;
          }
          points[playerId] -= 4;
          points[winner] += 4;
        });

        const second = game.placements.second;
        const third = game.placements.third;

        if (second && !chaySet.has(second) && second !== winner) {
          points[second] -= 1;
          points[winner] += 1;
        }
        if (third && !chaySet.has(third) && third !== winner && third !== second) {
          points[third] -= 2;
          points[winner] += 2;
        }

        const nonChay = players.map((player) => player.id).filter((id) => !chaySet.has(id));
        if (nonChay.length >= 2 && (!second || second === winner || chaySet.has(second))) {
          warnings.push("Thiếu người về nhì");
        }
        if (
          nonChay.length >= 3 &&
          (!third || third === winner || third === second || chaySet.has(third))
        ) {
          warnings.push("Thiếu người về ba");
        }
      }
    } else {
      const picks = [
        game.placements.first,
        game.placements.second,
        game.placements.third,
        game.placements.fourth
      ];
      const unique = new Set(picks.filter(Boolean));
      if (unique.size !== 4) {
        warnings.push("Chưa đủ xếp hạng 1-4");
      } else {
        points[game.placements.first] += 6;
        points[game.placements.second] -= 1;
        points[game.placements.third] -= 2;
        points[game.placements.fourth] -= 3;
      }
    }
  }

  game.anChot.forEach(applyTransfer);

  const total = Object.values(points).reduce((sum, value) => sum + value, 0);

  return { points, total, warnings };
};

const DraggableChip = ({
  label,
  dragId,
  playerId,
  onRemove
}: {
  label: string;
  dragId: string;
  playerId: string;
  onRemove?: () => void;
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: dragId,
    data: { playerId }
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, touchAction: "none" }}
      {...listeners}
      {...attributes}
      className={`chip cursor-grab select-none active:cursor-grabbing ${
        isDragging ? "opacity-60" : ""
      }`}
    >
      {label}
      {onRemove ? (
        <button
          className="text-[10px] uppercase tracking-[0.2em] text-muted"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
        >
          ×
        </button>
      ) : null}
    </div>
  );
};

const DropZone = ({
  id,
  disabled,
  className,
  children
}: {
  id: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) => {
  const { isOver, setNodeRef } = useDroppable({ id, disabled });

  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "border-ink bg-white" : ""}`}
    >
      {children}
    </div>
  );
};

const TrashButton = ({
  onClick,
  label,
  disabled
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
}) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className={`flex h-8 w-8 items-center justify-center rounded-md text-ink transition ${
      disabled ? "opacity-40" : "hover:bg-black/5 active:scale-90"
    }`}
  >
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16" />
      <path d="M9 7V5h6v2" />
      <path d="M6.5 7l1 12h9l1-12" />
      <path d="M10 11v5" />
      <path d="M14 11v5" />
    </svg>
  </button>
);

const getTopStat = (players: Player[], counts: Record<string, number>) => {
  const max = Math.max(0, ...Object.values(counts));
  if (max === 0) {
    return { names: ["Chưa có"], count: 0 };
  }
  const ids = Object.keys(counts).filter((id) => counts[id] === max);
  const names = ids
    .map((id) => players.find((player) => player.id === id)?.name)
    .filter(Boolean) as string[];
  return { names, count: max };
};

export default function Home() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [screen, setScreen] = useState<Screen>("home");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeDragPlayerId, setActiveDragPlayerId] = useState<string | null>(null);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editNames, setEditNames] = useState<string[]>(["", "", "", ""]);
  const [newSessionNames, setNewSessionNames] = useState<string[]>(["", "", "", ""]);
  const [hydrated, setHydrated] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        setHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as {
        sessions?: Session[];
        activeSessionId?: string | null;
        screen?: Screen;
      };
      if (parsed.sessions && Array.isArray(parsed.sessions)) {
        setSessions(parsed.sessions);
      }
      if (typeof parsed.activeSessionId !== "undefined") {
        setActiveSessionId(parsed.activeSessionId);
      }
      if (parsed.screen) {
        setScreen(parsed.screen);
      }
    } catch {
      // ignore corrupted storage
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }
    if (activeSessionId && !sessions.find((session) => session.id === activeSessionId)) {
      setActiveSessionId(null);
      setScreen("home");
    }
  }, [activeSessionId, hydrated, sessions, screen]);

  useEffect(() => {
    if (!hydrated || typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ sessions, activeSessionId, screen })
      );
    } catch {
      // ignore storage errors
    }
  }, [activeSessionId, hydrated, screen, sessions]);

  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;

  const updateSession = (id: string, updater: (session: Session) => Session) => {
    setSessions((prev) => prev.map((session) => (session.id === id ? updater(session) : session)));
  };

  const createNewSession = () => {
    const nextIndex = sessions.length + 1;
    const session = createSession(nextIndex, newSessionNames);
    setSessions((prev) => [...prev, session]);
    setNewSessionNames(["", "", "", ""]);
    setActiveSessionId(session.id);
    setScreen("session");
  };

  const openSession = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setScreen("session");
  };

  const startEditSession = (session: Session) => {
    setEditingSessionId(session.id);
    setEditNames(session.players.map((player) => player.name));
  };

  const saveEditSession = (sessionId: string) => {
    updateSession(sessionId, (session) => ({
      ...session,
      players: session.players.map((player, index) => ({
        ...player,
        name: editNames[index]?.trim() || player.name
      }))
    }));
    setEditingSessionId(null);
  };

  const cancelEditSession = () => {
    setEditingSessionId(null);
  };

  const currentGame = activeSession
    ? activeSession.games[activeSession.currentGameIndex]
    : undefined;

  const gameSummaries = useMemo(() => {
    if (!activeSession) {
      return [] as ReturnType<typeof computeGamePoints>[];
    }
    return activeSession.games.map((game) => computeGamePoints(game, activeSession.players));
  }, [activeSession]);

  const currentSummary = currentGame
    ? gameSummaries[activeSession?.currentGameIndex ?? 0]
    : undefined;

  const sessionTotals = useMemo(() => {
    if (!activeSession) {
      return {} as Record<string, number>;
    }
    const totals: Record<string, number> = Object.fromEntries(
      activeSession.players.map((player) => [player.id, 0])
    );
    gameSummaries.forEach((summary) => {
      activeSession.players.forEach((player) => {
        totals[player.id] += summary.points[player.id] ?? 0;
      });
    });
    return totals;
  }, [activeSession, gameSummaries]);

  const sessionBalance = Object.values(sessionTotals).reduce((sum, value) => sum + value, 0);

  const funStats = useMemo(() => {
    if (!activeSession) {
      return {
        mostChay: { names: ["Chưa có"], count: 0 },
        mostAnChot: { names: ["Chưa có"], count: 0 }
      };
    }
    const chayCounts: Record<string, number> = Object.fromEntries(
      activeSession.players.map((player) => [player.id, 0])
    );
    const anChotCounts: Record<string, number> = Object.fromEntries(
      activeSession.players.map((player) => [player.id, 0])
    );

    activeSession.games.forEach((game) => {
      game.chay.forEach((transfer) => {
        if (transfer.from) {
          chayCounts[transfer.from] = (chayCounts[transfer.from] ?? 0) + 1;
        }
      });
      game.anChot.forEach((transfer) => {
        if (transfer.from) {
          anChotCounts[transfer.from] = (anChotCounts[transfer.from] ?? 0) + 1;
        }
      });
    });

    return {
      mostChay: getTopStat(activeSession.players, chayCounts),
      mostAnChot: getTopStat(activeSession.players, anChotCounts)
    };
  }, [activeSession]);

  const canGoPrev = activeSession ? activeSession.currentGameIndex > 0 : false;
  const canGoNext = activeSession
    ? activeSession.currentGameIndex < activeSession.games.length - 1
    : false;

  const updateGame = (gameId: string, updater: (game: Game) => Game) => {
    if (!activeSession) {
      return;
    }
    updateSession(activeSession.id, (session) => ({
      ...session,
      games: session.games.map((game) => (game.id === gameId ? updater(game) : game))
    }));
  };

  const addGame = () => {
    if (!activeSession) {
      return;
    }
    updateSession(activeSession.id, (session) => {
      const games = [...session.games, createGame()];
      return {
        ...session,
        games,
        currentGameIndex: games.length - 1
      };
    });
  };

  const removeGame = (gameId: string) => {
    if (!activeSession) {
      return;
    }
    updateSession(activeSession.id, (session) => {
      if (session.games.length === 1) {
        return session;
      }
      const removedIndex = session.games.findIndex((game) => game.id === gameId);
      const nextGames = session.games.filter((game) => game.id !== gameId);
      let nextIndex = session.currentGameIndex;
      if (removedIndex !== -1) {
        if (nextIndex > removedIndex) {
          nextIndex -= 1;
        } else if (nextIndex === removedIndex) {
          nextIndex = Math.max(0, nextIndex - 1);
        }
      }
      nextIndex = Math.min(nextIndex, nextGames.length - 1);
      return {
        ...session,
        games: nextGames,
        currentGameIndex: nextIndex
      };
    });
  };

  const handleDropPlacement = (game: Game, key: PlacementKey, playerId: string) => {
    if (!activeSession) {
      return;
    }
    updateGame(game.id, (current) => {
      const placements = { ...current.placements, [key]: playerId };
      (Object.keys(placements) as PlacementKey[]).forEach((placementKey) => {
        if (placementKey !== key && placements[placementKey] === playerId) {
          placements[placementKey] = "";
        }
      });
      const chay = current.chay.filter((item) => item.from !== playerId);
      const updatedChay =
        key === "first" ? chay.map((item) => ({ ...item, to: playerId })) : chay;

      return { ...current, placements, chay: updatedChay };
    });
  };

  const handleDropChay = (game: Game, playerId: string) => {
    if (!activeSession || game.u || playerId === game.placements.first) {
      return;
    }
    updateGame(game.id, (current) => {
      if (current.chay.some((item) => item.from === playerId)) {
        return current;
      }
      const placements = { ...current.placements };
      (Object.keys(placements) as PlacementKey[]).forEach((placementKey) => {
        if (placementKey !== "first" && placements[placementKey] === playerId) {
          placements[placementKey] = "";
        }
      });
      const nextChay = [
        ...current.chay,
        { id: makeId(), from: playerId, to: current.placements.first, points: 4 }
      ];
      return { ...current, placements, chay: nextChay };
    });
  };

  const clearPlacement = (game: Game, key: PlacementKey) => {
    updateGame(game.id, (current) => ({
      ...current,
      placements: { ...current.placements, [key]: "" }
    }));
  };

  const removeChayPlayer = (game: Game, playerId: string) => {
    updateGame(game.id, (current) => ({
      ...current,
      chay: current.chay.filter((item) => item.from !== playerId)
    }));
  };

  const handleDragStartEvent = (event: DragStartEvent) => {
    const playerId = String(event.active.data.current?.playerId ?? event.active.id);
    setActiveDragPlayerId(playerId);
  };

  const handleDragEndEvent = (event: DragEndEvent) => {
    setActiveDragPlayerId(null);
    const { active, over } = event;
    if (!over || !currentGame) {
      return;
    }
    const target = parseDropTarget(String(over.id));
    if (!target) {
      return;
    }
    const playerId = String(active.data.current?.playerId ?? active.id);
    if (target.type === "placement") {
      handleDropPlacement(currentGame, target.key, playerId);
    }
    if (target.type === "chay") {
      handleDropChay(currentGame, playerId);
    }
  };

  const handleDragCancelEvent = () => {
    setActiveDragPlayerId(null);
  };

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-3 pb-20 pt-10">
        <header className="space-y-3">
          {screen === "home" ? (
            <>
              <div className="flex items-center gap-3">
                <span className="pill">PHỎM</span>
              </div>
              <h1 className="text-4xl font-semibold uppercase tracking-tight">Phiên</h1>
            </>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                {activeSession ? (
                  <p className="text-xs uppercase tracking-[0.35em] text-muted">
                    {activeSession.name}
                  </p>
                ) : null}
                <h1 className="text-3xl font-semibold uppercase tracking-tight">
                  {screen === "session"
                    ? `Ván ${activeSession ? activeSession.currentGameIndex + 1 : ""}`
                    : "Tổng kết"}
                </h1>
              </div>
              <button
                className="flex h-10 w-10 items-center justify-center rounded-full border border-stroke bg-white text-sm font-semibold"
                onClick={() => setMenuOpen(true)}
                aria-label="Mở menu"
              >
                ≡
              </button>
            </div>
          )}
        </header>

        {screen === "home" ? (
          <>
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">
                  Phiên đang chơi
                </h2>
                <span className="text-xs text-muted">{sessions.length} phiên</span>
              </div>

              {sessions.length === 0 ? (
                <div className="card p-5 text-sm text-muted">
                  Chưa có phiên nào. Tạo phiên mới để bắt đầu.
                </div>
              ) : null}

              {sessions.map((session) => {
                const isEditing = editingSessionId === session.id;
                return (
                  <div key={session.id} className="card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs uppercase tracking-[0.35em] text-muted">
                          {session.name}
                        </p>
                        <p className="text-sm text-muted">{session.games.length} ván</p>
                      </div>
                      <button
                        className="ghost"
                        onClick={() =>
                          isEditing ? cancelEditSession() : startEditSession(session)
                        }
                      >
                        {isEditing ? "Hủy" : "Sửa tên"}
                      </button>
                    </div>

                    {isEditing ? (
                      <div className="grid grid-cols-2 gap-3">
                        {editNames.map((name, index) => (
                          <label
                            key={`${session.id}-edit-${index}`}
                            className="space-y-2 text-xs uppercase tracking-[0.2em]"
                          >
                            <span className="text-muted">P{index + 1}</span>
                            <input
                              className="control"
                              value={name}
                              onChange={(event) =>
                                setEditNames((prev) =>
                                  prev.map((value, idx) =>
                                    idx === index ? event.target.value : value
                                  )
                                )
                              }
                            />
                          </label>
                        ))}
                        <button
                          className="card col-span-2 px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em]"
                          onClick={() => saveEditSession(session.id)}
                        >
                          Lưu thay đổi
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {session.players.map((player) => (
                          <span key={player.id} className="chip">
                            {player.name}
                          </span>
                        ))}
                      </div>
                    )}

                    {!isEditing ? (
                      <button
                        className="card px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em]"
                        onClick={() => openSession(session.id)}
                      >
                        Vào phiên
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </section>

            <section className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">
                  Tạo phiên mới
                </h2>
                <span className="text-xs text-muted">4 người</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {newSessionNames.map((name, index) => (
                  <label
                    key={`new-${index}`}
                    className="space-y-2 text-xs uppercase tracking-[0.2em]"
                  >
                    <span className="text-muted">P{index + 1}</span>
                    <input
                      className="control"
                      value={name}
                      onChange={(event) =>
                        setNewSessionNames((prev) =>
                          prev.map((value, idx) =>
                            idx === index ? event.target.value : value
                          )
                        )
                      }
                    />
                  </label>
                ))}
              </div>
              <button
                className="card px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em]"
                onClick={createNewSession}
              >
                Bắt đầu phiên
              </button>
            </section>
          </>
        ) : null}

        {screen === "session" && activeSession && currentGame ? (
          <DndContext
            sensors={sensors}
            onDragStart={handleDragStartEvent}
            onDragEnd={handleDragEndEvent}
            onDragCancel={handleDragCancelEvent}
          >
            <section className="card p-5 space-y-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold">Kết quả</h3>
                <div className="flex items-center gap-2">
                  <label className="pill gap-2 text-[10px] font-semibold uppercase tracking-[0.2em]">
                    <span>Ù</span>
                    <input
                      type="checkbox"
                      checked={currentGame.u}
                      onChange={(event) =>
                        updateGame(currentGame.id, (current) => ({
                          ...current,
                          u: event.target.checked,
                          chay: event.target.checked ? [] : current.chay
                        }))
                      }
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                  </label>
                  <TrashButton
                    label="Xóa ván"
                    onClick={() => removeGame(currentGame.id)}
                    disabled={activeSession.games.length === 1}
                  />
                </div>
              </div>

              {currentGame.u ? (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Người Ù</p>
                  <div className="relative">
                    <select
                      className="control appearance-none pr-10"
                      value={currentGame.placements.first}
                      onChange={(event) =>
                        updateGame(currentGame.id, (current) => ({
                          ...current,
                          placements: {
                            ...current.placements,
                            first: event.target.value
                          }
                        }))
                      }
                    >
                      {activeSession.players.map((player) => (
                        <option key={player.id} value={player.id}>
                          {player.name}
                        </option>
                      ))}
                    </select>
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                  <p className="text-xs text-muted">Ù: thắng +15, còn lại -5</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Người chơi</p>
                    <div className="flex flex-wrap gap-2">
                      {activeSession.players.map((player) => (
                        <DraggableChip
                          key={player.id}
                          dragId={`pool-${player.id}`}
                          playerId={player.id}
                          label={player.name}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted">Xếp hạng</p>
                    <div className="flex flex-col gap-3">
                      {(
                        [
                          { key: "first", label: "1" },
                          { key: "second", label: "2" },
                          { key: "third", label: "3" },
                          { key: "fourth", label: "4" }
                        ] as { key: PlacementKey; label: string }[]
                      ).map(({ key, label }) => {
                        const assignedId = currentGame.placements[key];
                        const assignedPlayer = activeSession.players.find(
                          (player) => player.id === assignedId
                        );

                        return (
                          <DropZone
                            key={key}
                            id={placementDropId(key)}
                            className="min-h-[72px] rounded-2xl border border-dashed border-stroke bg-white/70 p-3"
                          >
                            <div className="text-[10px] uppercase tracking-[0.2em] text-muted">
                              {label}
                            </div>
                            {assignedPlayer ? (
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <DraggableChip
                                  dragId={`placement-${key}-${assignedPlayer.id}`}
                                  playerId={assignedPlayer.id}
                                  label={assignedPlayer.name}
                                />
                                <TrashButton
                                  label="Xóa vị trí"
                                  onClick={() => clearPlacement(currentGame, key)}
                                />
                              </div>
                            ) : null}
                          </DropZone>
                        );
                      })}

                      <DropZone
                        id={DROP_CHAY_ID}
                        disabled={currentGame.u}
                        className="min-h-[72px] rounded-2xl border border-dashed border-stroke bg-white/70 p-3"
                      >
                        <div className="text-[10px] uppercase tracking-[0.2em] text-muted">
                          Cháy
                        </div>
                        {currentGame.chay.length === 0 ? (
                          <div className="mt-2 h-4" aria-hidden="true" />
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {currentGame.chay.map((transfer) => {
                              const chayPlayer = activeSession.players.find(
                                (player) => player.id === transfer.from
                              );
                              if (!chayPlayer) {
                                return null;
                              }

                              return (
                                <DraggableChip
                                  key={transfer.id}
                                  dragId={`chay-${chayPlayer.id}`}
                                  playerId={chayPlayer.id}
                                  label={chayPlayer.name}
                                  onRemove={() => removeChayPlayer(currentGame, chayPlayer.id)}
                                />
                              );
                            })}
                          </div>
                        )}
                      </DropZone>
                    </div>
                    {!currentGame.placements.first ? (
                      <p className="text-xs text-accent">
                        Cần chọn người thắng (1) để tính cháy.
                      </p>
                    ) : null}
                  </div>
                </div>
              )}

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Ăn chốt</p>
                  <button
                    className="ghost inline-flex h-8 w-8 items-center justify-center px-0 py-0 text-base leading-none tracking-normal"
                    onClick={() =>
                      updateGame(currentGame.id, (current) => ({
                        ...current,
                        anChot: [...current.anChot, createTransfer(activeSession.players, current)]
                      }))
                    }
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                </div>
                {currentGame.anChot.length === 0 ? null : (
                  <div className="space-y-3">
                    {currentGame.anChot.map((transfer) => (
                      <div key={transfer.id} className="rounded-2xl border border-stroke p-3">
                        <div className="grid grid-cols-2 gap-2">
                          <label className="space-y-2 text-[10px] uppercase tracking-[0.2em]">
                            <span className="text-muted">Người bị chốt</span>
                            <div className="relative">
                              <select
                                className="control appearance-none pr-10 text-[10px] font-semibold"
                                value={transfer.from}
                                onChange={(event) =>
                                  updateGame(currentGame.id, (current) => ({
                                    ...current,
                                    anChot: current.anChot.map((item) =>
                                      item.id === transfer.id
                                        ? { ...item, from: event.target.value }
                                        : item
                                    )
                                  }))
                                }
                              >
                                {activeSession.players.map((player) => (
                                  <option key={player.id} value={player.id}>
                                    {player.name}
                                  </option>
                                ))}
                              </select>
                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="m6 9 6 6 6-6" />
                              </svg>
                            </div>
                          </label>
                          <label className="space-y-2 text-[10px] uppercase tracking-[0.2em]">
                            <span className="text-muted">Người ăn</span>
                            <div className="relative">
                              <select
                                className="control appearance-none pr-10 text-[10px] font-semibold"
                                value={transfer.to}
                                onChange={(event) =>
                                  updateGame(currentGame.id, (current) => ({
                                    ...current,
                                    anChot: current.anChot.map((item) =>
                                      item.id === transfer.id
                                        ? { ...item, to: event.target.value }
                                        : item
                                    )
                                  }))
                                }
                              >
                                {activeSession.players.map((player) => (
                                  <option key={player.id} value={player.id}>
                                    {player.name}
                                  </option>
                                ))}
                              </select>
                              <svg
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                                className="pointer-events-none absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 text-muted"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="m6 9 6 6 6-6" />
                              </svg>
                            </div>
                          </label>
                        </div>
                        <div className="mt-2 flex justify-end text-xs">
                          <TrashButton
                            label="Xóa ăn chốt"
                            onClick={() =>
                              updateGame(currentGame.id, (current) => ({
                                ...current,
                                anChot: current.anChot.filter((item) => item.id !== transfer.id)
                              }))
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">Tổng ván</p>
                  {currentSummary?.total ? (
                    <span className="pill text-accent">
                      {`Lệch ${formatSigned(currentSummary?.total ?? 0)}`}
                    </span>
                  ) : null}
                </div>
                {currentSummary?.warnings.length ? (
                  <p className="text-xs text-accent">
                    {currentSummary.warnings.join(" · ")}
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  {activeSession.players.map((player) => {
                    const value = currentSummary?.points[player.id] ?? 0;
                    const tone =
                      value > 0 ? "text-accent" : value < 0 ? "text-ink" : "text-muted";
                    return (
                      <div
                        key={player.id}
                        className="rounded-2xl border border-stroke bg-white/80 px-3 py-3"
                      >
                        <div className="text-[10px] uppercase tracking-[0.2em] text-muted">
                          {player.name}
                        </div>
                        <div className={`text-2xl font-semibold ${tone}`}>
                          {formatSigned(value)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <DragOverlay>
              {activeDragPlayerId ? (
                <div className="chip bg-ink text-white">
                  {activeSession.players.find((player) => player.id === activeDragPlayerId)
                    ?.name ?? "Người chơi"}
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        ) : null}

        {screen === "summary" && activeSession ? (
          <>
            <section className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">
                  Tổng phiên
                </h2>
                {sessionBalance ? (
                  <span className="pill text-accent">
                    {`Lệch ${formatSigned(sessionBalance)}`}
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3">
                {activeSession.players.map((player) => {
                  const value = sessionTotals[player.id] ?? 0;
                  const tone =
                    value > 0 ? "text-accent" : value < 0 ? "text-ink" : "text-muted";

                  return (
                    <div
                      key={player.id}
                      className="rounded-2xl border border-stroke bg-white/80 px-3 py-3"
                    >
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted">
                        {player.name}
                      </div>
                      <div className={`text-2xl font-semibold ${tone}`}>
                        {formatSigned(value)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">
                  Thống kê vui
                </h2>
                <span className="text-xs text-muted">{activeSession.games.length} ván</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-stroke bg-white/80 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted">
                    Cháy nhiều nhất
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {funStats.mostChay.names.join(", ")}
                  </div>
                  <div className="text-xs text-muted">{funStats.mostChay.count} lần</div>
                </div>
                <div className="rounded-2xl border border-stroke bg-white/80 px-3 py-3">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted">
                    Bị ăn chốt nhiều nhất
                  </div>
                  <div className="mt-1 text-lg font-semibold">
                    {funStats.mostAnChot.names.join(", ")}
                  </div>
                  <div className="text-xs text-muted">{funStats.mostAnChot.count} lần</div>
                </div>
              </div>
            </section>

            <button
              className="card px-4 py-3 text-xs font-semibold uppercase tracking-[0.2em]"
              onClick={() => {
                if (
                  typeof window !== "undefined" &&
                  !window.confirm("Làm lại phiên? Kết quả hiện tại sẽ bị xóa.")
                ) {
                  return;
                }
                updateSession(activeSession.id, (session) => ({
                  ...session,
                  games: [createGame()],
                  currentGameIndex: 0
                }));
                setScreen("session");
              }}
            >
              Làm lại phiên
            </button>
          </>
        ) : null}
      </main>

      {screen === "session" && activeSession ? (
        <footer className="fixed bottom-0 left-0 right-0 border-t border-stroke bg-[var(--bg)]/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-md items-center gap-3 px-5 py-3">
            <button
              className={`flex h-11 w-11 items-center justify-center rounded-full border border-stroke text-lg ${
                canGoPrev ? "text-ink" : "text-muted"
              }`}
              onClick={() =>
                updateSession(activeSession.id, (session) => ({
                  ...session,
                  currentGameIndex: Math.max(0, session.currentGameIndex - 1)
                }))
              }
              disabled={!canGoPrev}
              aria-label="Ván trước"
            >
              ←
            </button>
            <div className="flex-1 text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted">
              Ván {activeSession.currentGameIndex + 1}/{activeSession.games.length}
            </div>
            <button
              className="flex h-11 w-11 items-center justify-center rounded-full border border-stroke text-lg text-ink"
              onClick={() => {
                if (canGoNext) {
                  updateSession(activeSession.id, (session) => ({
                    ...session,
                    currentGameIndex: Math.min(
                      session.games.length - 1,
                      session.currentGameIndex + 1
                    )
                  }));
                } else {
                  addGame();
                }
              }}
              aria-label={canGoNext ? "Ván sau" : "Thêm ván mới"}
            >
              {canGoNext ? "→" : "+"}
            </button>
          </div>
        </footer>
      ) : null}

      {screen !== "home" ? (
        <div
          className={`fixed inset-0 z-40 transition-opacity duration-200 ${
            menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
          <div
            className={`absolute right-5 top-16 w-64 rounded-3xl border border-stroke bg-white p-4 shadow-lg transition-all duration-200 ${
              menuOpen ? "translate-y-0 scale-100" : "-translate-y-2 scale-95"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.35em] text-muted">
                Menu
              </span>
              <button
                className="text-xs font-semibold uppercase tracking-[0.2em] text-muted"
                onClick={() => setMenuOpen(false)}
              >
                Đóng
              </button>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button
                className="rounded-2xl border border-stroke px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.2em] text-ink"
                onClick={() => {
                  setScreen("home");
                  setMenuOpen(false);
                }}
              >
                Trang chủ
              </button>
              <button
                className={`rounded-2xl border border-stroke px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.2em] ${
                  screen === "session" ? "bg-ink text-white" : "text-ink"
                }`}
                onClick={() => {
                  setScreen("session");
                  setMenuOpen(false);
                }}
              >
                Phiên hiện tại
              </button>
              <button
                className={`rounded-2xl border border-stroke px-4 py-3 text-left text-sm font-semibold uppercase tracking-[0.2em] ${
                  screen === "summary" ? "bg-ink text-white" : "text-ink"
                }`}
                onClick={() => {
                  setScreen("summary");
                  setMenuOpen(false);
                }}
                disabled={!activeSession}
              >
                Tổng kết
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

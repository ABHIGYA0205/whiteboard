"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowRight, ArrowUpRight, Clock3, FileUp, GitFork, LayoutGrid, Link2, Moon, Plus, StickyNote, Sun, Workflow, X
} from "lucide-react";
import { BoardLoadingScreen } from "@/components/Common/BoardLoadingScreen";
import { CanvasFlowLogo } from "@/components/Common/CanvasFlowLogo";
import { createBoard } from "@/lib/api";
import { readBoardSnapshot } from "@/lib/boardSnapshot";
import { readRecentBoards, removeRecentBoard, rememberRecentBoard, type RecentBoard } from "@/lib/recentBoards";
import { BOARD_TEMPLATES } from "@/lib/templates";
import { DEFAULT_BOARD_TITLE } from "@shared/types";
import { useBoardStore } from "@/store/boardStore";
import styles from "./home.module.css";

const starters = [
  { id: "kanban", name: "Kanban board", detail: "Track work from ready to done.", icon: LayoutGrid },
  { id: "flowchart", name: "Process flow", detail: "Map steps and decisions.", icon: Workflow },
  { id: "retro", name: "Sprint retro", detail: "Reflect on the last sprint.", icon: StickyNote },
  { id: "mindmap", name: "Mind map", detail: "Explore a central idea.", icon: GitFork }
];

function TemplatePreview({ id }: { id: string }) {
  return (
    <span className={styles.templatePreview} data-preview={id} aria-hidden="true">
      <span /><span /><span /><span /><span /><span />
    </span>
  );
}

export default function HomePage() {
  const router = useRouter();
  const theme = useBoardStore((state) => state.theme);
  const setTheme = useBoardStore((state) => state.setTheme);
  const [isNavigating, startTransition] = useTransition();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentBoard[]>([]);
  const createRequest = useRef<AbortController | null>(null);
  const createTrigger = useRef<HTMLElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileButton = useRef<HTMLButtonElement>(null);
  const isOpening = isCreating || isNavigating;

  useEffect(() => {
    const refresh = () => setRecent(readRecentBoards());
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("pageshow", refresh);
    return () => {
      createRequest.current?.abort();
      createRequest.current = null;
      window.removeEventListener("storage", refresh);
      window.removeEventListener("pageshow", refresh);
    };
  }, []);

  useEffect(() => {
    if (error && !isOpening) createTrigger.current?.focus();
  }, [error, isOpening]);

  async function openNewBoard(trigger: HTMLElement | null, starter?: (typeof starters)[number], file?: File) {
    if (createRequest.current || isNavigating) return;
    const request = new AbortController();
    createRequest.current = request;
    createTrigger.current = trigger;
    setError(null);
    setIsCreating(true);
    const timeout = window.setTimeout(() => request.abort(), 30_000);

    try {
      const template = starter && BOARD_TEMPLATES.find(({ id }) => id === starter.id);
      const initial = file ? await readBoardSnapshot(file) : template && starter
        ? { title: starter.name, elements: template.generate(120, 130) }
        : undefined;
      const board = await createBoard(request.signal, initial);
      if (!request.signal.aborted) {
        rememberRecentBoard(board.id, board.title ?? DEFAULT_BOARD_TITLE);
        startTransition(() => router.push(`/board/${encodeURIComponent(board.id)}`));
      }
    } catch (failure) {
      if (createRequest.current === request) {
        setError(file && failure instanceof Error && !request.signal.aborted
          ? failure.message
          : "Could not create a board. Try again in a moment.");
      }
    } finally {
      window.clearTimeout(timeout);
      if (createRequest.current === request) {
        createRequest.current = null;
        setIsCreating(false);
      }
    }
  }

  function navigateToBoard(path: string) {
    setError(null);
    startTransition(() => router.push(path));
  }

  function openBoardLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = String(new FormData(event.currentTarget).get("boardLink") ?? "").trim();
    try {
      const current = new URL(window.location.origin);
      const url = new URL(value, current);
      const loopback = ["localhost", "127.0.0.1", "[::1]"];
      const sameServer = url.origin === current.origin || (
        url.protocol === current.protocol && url.port === current.port &&
        loopback.includes(url.hostname) && loopback.includes(current.hostname)
      );
      if (!sameServer || url.username || url.password || !/^\/board\/[a-zA-Z\d_-]+\/?$/.test(url.pathname)) {
        throw new Error();
      }
      setInviteError(null);
      navigateToBoard(url.pathname.replace(/\/$/, "") + url.search);
    } catch {
      setInviteError("Paste a board or invite link from this Canvas Flow site.");
    }
  }

  return (
    <main className={styles.home} data-workspace-home>
      <div className={styles.page} inert={isOpening}>
        <header className={styles.header}>
          <div className={styles.headerInner}>
            <Link href="/" className={styles.brand}><CanvasFlowLogo size={30} /> Canvas Flow</Link>
            <nav aria-label="Workspace">
              <a href="#recent">Recent</a>
              <a href="#templates">Templates</a>
            </nav>
            <button className={styles.themeButton} type="button"
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>
        </header>

        <div className={styles.container}>
          <section className={styles.intro} aria-labelledby="home-title">
            <div className={styles.heroArt} aria-hidden="true">
              <Image src="/workspace-ribbon.webp" alt="" fill unoptimized preload sizes="(max-width: 740px) 100vw, 65vw" />
            </div>
            <div className={styles.heroCopy}>
              <h1 id="home-title">Where ideas<br /><em>take shape.</em></h1>
              <p>Sketch, plan, and think together on a shared whiteboard.</p>
              <button id="hero-create-board-btn" type="button" className={styles.primary} disabled={isOpening}
                onClick={(event) => void openNewBoard(event.currentTarget)}>
                <Plus size={18} /> Create New Board
              </button>
            </div>
          </section>

          {error && <p className={styles.notice} role="alert">{error}</p>}

          <section id="templates" className={styles.templates} aria-labelledby="templates-title" tabIndex={-1}>
            <div className={styles.sectionHeader}>
              <h2 id="templates-title">Start with a template</h2>
            </div>
            <div className={styles.templateGrid}>
              {starters.map((starter) => (
                <button className={styles.template} key={starter.id} disabled={isOpening}
                  onClick={(event) => void openNewBoard(event.currentTarget, starter)}>
                  <TemplatePreview id={starter.id} />
                  <span className={styles.templateInfo}>
                    <span className={styles.templateName}><starter.icon size={17} strokeWidth={1.8} />
                      <strong>{starter.name}</strong><ArrowUpRight size={15} className={styles.templateArrow} />
                    </span>
                    <span className={styles.templateDetail}>{starter.detail}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <div className={styles.boardGrid}>
            <section id="recent" className={styles.panel} aria-labelledby="recent-title" tabIndex={-1}>
              <div className={styles.sectionHeader}>
                <h2 id="recent-title">Recent boards</h2>
                <button ref={fileButton} type="button" className={styles.secondary} disabled={isOpening}
                  onClick={() => fileInput.current?.click()}>
                  <FileUp size={17} /> Import JSON
                </button>
                <input hidden ref={fileInput} type="file" accept=".json,application/json" aria-label="Import board snapshot"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void openNewBoard(fileButton.current, undefined, file);
                  }} />
              </div>
              {recent.length ? (
                <ul className={styles.recentList}>
                  {recent.map((board) => {
                    const path = `/board/${encodeURIComponent(board.id)}`;
                    return (
                      <li key={board.id} className={styles.recentItem}>
                        <Link
                          href={path}
                          className={styles.recentLink}
                          onNavigate={(event: { preventDefault: () => void }) => {
                            event.preventDefault();
                            navigateToBoard(path);
                          }}
                        >
                          <span className={styles.recentIcon}><LayoutGrid size={18} /></span>
                          <span className={styles.recentTitle}>{board.title}</span>
                          <ArrowUpRight className={styles.recentArrow} size={16} />
                        </Link>
                        <button className={styles.removeButton} type="button" onClick={() => setRecent(removeRecentBoard(board.id))}
                          aria-label={`Remove ${board.title} from recent boards`} title="Remove from recent boards"><X size={17} /></button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className={styles.empty}>
                  <span className={styles.recentIcon}><Clock3 size={19} /></span>
                  <div><strong>No recent boards yet</strong><p>Boards you open appear here on this browser.</p></div>
                </div>
              )}
            </section>

            <section className={styles.panel} aria-labelledby="open-board-title">
              <div className={styles.sectionHeader}>
                <h2 id="open-board-title"><Link2 size={19} /> Open a board link</h2>
              </div>
              <form className={styles.invite} onSubmit={openBoardLink}>
                <label htmlFor="board-link">Canvas Flow link</label>
                <input id="board-link" name="boardLink" placeholder="Paste a board or invite link" required
                  inputMode="url" autoComplete="off" spellCheck={false}
                  aria-invalid={Boolean(inviteError)} aria-describedby={inviteError ? "board-link-error" : undefined}
                  onChange={() => setInviteError(null)} />
                {inviteError && <p id="board-link-error" role="alert">{inviteError}</p>}
                <button className={styles.secondary} type="submit">Open board <ArrowRight size={17} /></button>
              </form>
            </section>
          </div>
        </div>
      </div>
      {isOpening && <BoardLoadingScreen />}
    </main>
  );
}

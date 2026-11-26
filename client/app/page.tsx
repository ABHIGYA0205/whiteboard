"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, Clock3, FileUp, GitFork, LayoutGrid, Link2,
  MousePointer2, Plus, StickyNote, Workflow, X
} from "lucide-react";
import { BoardLoadingScreen } from "@/components/Common/BoardLoadingScreen";
import { CanvasFlowLogo } from "@/components/Common/CanvasFlowLogo";
import { createBoard } from "@/lib/api";
import { readBoardSnapshot } from "@/lib/boardSnapshot";
import { readRecentBoards, removeRecentBoard, rememberRecentBoard, type RecentBoard } from "@/lib/recentBoards";
import { BOARD_TEMPLATES } from "@/lib/templates";
import { DEFAULT_BOARD_TITLE } from "@shared/types";
import styles from "./home.module.css";

const starters = [
  { id: "kanban", name: "Kanban board", detail: "Track work from ready to done.", icon: LayoutGrid },
  { id: "flowchart", name: "Process flow", detail: "Map steps, decisions, and handoffs.", icon: Workflow },
  { id: "retro", name: "Sprint retro", detail: "Discuss what worked and what to change.", icon: StickyNote },
  { id: "mindmap", name: "Mind map", detail: "Connect ideas around a central topic.", icon: GitFork }
];

function BoardPreview() {
  return (
    <figure className={styles.preview} role="img" aria-label="Example sprint planning board with three columns, sticky notes, and collaborator cursors">
      <div className={styles.previewTop}>
        <span><LayoutGrid size={14} /> Sprint planning</span>
        <div className={styles.previewPeople}><span>AK</span><span>JM</span></div>
      </div>
      <div className={styles.previewCanvas}>
        <div className={styles.previewGrid}>
          <div className={styles.previewLane}>
            <strong><i /> To do</strong>
            <div className={styles.blueNote}>Map the signup flow</div>
            <div className={styles.blueNote}>Review mobile layouts</div>
          </div>
          <div className={styles.previewLane}>
            <strong><i /> In progress</strong>
            <div className={styles.yellowNote}>Build the first prototype</div>
          </div>
          <div className={styles.previewLane}>
            <strong><i /> Done</strong>
            <div className={styles.greenNote}>Define launch goals</div>
          </div>
        </div>
        <div className={styles.cursorA}><MousePointer2 size={17} fill="currentColor" /><span>Alex</span></div>
        <div className={styles.cursorB}><MousePointer2 size={17} fill="currentColor" /><span>Jamie</span></div>
      </div>
    </figure>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [isNavigating, startTransition] = useTransition();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentBoard[]>([]);
  const createRequest = useRef<AbortController | null>(null);
  const createTrigger = useRef<HTMLElement | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileButton = useRef<HTMLButtonElement>(null);
  const inviteDialog = useRef<HTMLDialogElement>(null);
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

  function openBoardLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get("boardLink");
    try {
      const url = new URL(String(value).trim(), window.location.origin);
      if (url.origin !== window.location.origin || !/^\/board\/[a-zA-Z\d_-]+\/?$/.test(url.pathname)) {
        throw new Error();
      }
      const path = url.pathname.replace(/\/$/, "") + url.search;
      inviteDialog.current?.close();
      startTransition(() => router.push(path));
    } catch {
      setInviteError("Enter a board link from this Canvas Flow site.");
    }
  }

  return (
    <main className={styles.home}>
      <div inert={isOpening} className={styles.container}>
        <header className={styles.header}>
          <Link href="/" className={styles.brand}><CanvasFlowLogo size={30} /> Canvas Flow</Link>
          <nav aria-label="Workspace">
            <a className={styles.navLink} href="#recent">Recent boards</a>
            <a className={styles.navLink} href="#templates">Templates</a>
            <button className={styles.linkButton} onClick={() => {
              setInviteError(null);
              inviteDialog.current?.showModal();
            }}><Link2 size={17} /> Open board link</button>
          </nav>
        </header>

        <section className={styles.hero} aria-labelledby="home-title">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>The collaborative whiteboard</p>
            <h1 id="home-title">A shared canvas<br className={styles.desktopBreak} /> for <em>big ideas.</em></h1>
            <p className={styles.summary}>Sketch a plan, map a workflow, or run a team session. Share one link and work together live.</p>
            <div className={styles.heroActions}>
              <button id="hero-create-board-btn" className={styles.primary} disabled={isOpening}
                onClick={(event) => void openNewBoard(event.currentTarget)}>
                <Plus size={19} /> Create New Board
              </button>
              <a href="#templates" className={styles.secondary}>Browse templates <ArrowDown size={15} /></a>
            </div>
            <p className={styles.note}>No account needed to start a board.</p>
          </div>
          <BoardPreview />
        </section>

        {error && <p className={styles.error} role="alert">{error}</p>}

        <section id="recent" className={styles.section} aria-labelledby="recent-title">
          <div className={styles.sectionHeader}>
            <div><h2 id="recent-title">Recent boards</h2><p>Boards you’ve opened in this browser.</p></div>
            <button ref={fileButton} type="button" className={styles.linkButton} disabled={isOpening}
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
              {recent.map((board) => (
                <li key={board.id} className={styles.recentItem}>
                  <Link href={`/board/${encodeURIComponent(board.id)}`} className={styles.recentLink} prefetch={false}>
                    <span className={styles.recentIcon}><LayoutGrid size={20} /></span>
                    <span className={styles.recentTitle}>{board.title}</span>
                    <ArrowUpRight className={styles.recentArrow} size={16} />
                  </Link>
                  <button className={styles.removeButton} type="button" onClick={() => setRecent(removeRecentBoard(board.id))}
                    aria-label={`Remove ${board.title} from recent boards`} title="Remove from recent boards"><X size={17} /></button>
                </li>
              ))}
            </ul>
          ) : (
            <div className={styles.empty}><span><Clock3 size={19} /></span>
              <p>Create a board or open an invite to find it here next time.</p></div>
          )}
        </section>

        <section id="templates" className={styles.section} aria-labelledby="templates-title">
          <div className={styles.sectionHeader}>
            <div><h2 id="templates-title">Start with a template</h2><p>Open a ready-to-edit board for your next session.</p></div>
          </div>
          <div className={styles.templateGrid}>
            {starters.map((starter) => (
              <button className={styles.template} data-template={starter.id} key={starter.id} disabled={isOpening}
                onClick={(event) => void openNewBoard(event.currentTarget, starter)}>
                <span className={styles.templateIcon}><starter.icon size={22} strokeWidth={1.8} /></span>
                <strong>{starter.name}</strong>
                <span className={styles.templateDetail}>{starter.detail}</span>
                <ArrowRight className={styles.templateArrow} size={16} />
              </button>
            ))}
          </div>
        </section>

        <footer className={styles.footer}><CanvasFlowLogo size={22} /> Canvas Flow</footer>

        <dialog ref={inviteDialog} className={styles.dialog} aria-labelledby="invite-title">
          <form onSubmit={openBoardLink}>
            <button className={styles.dialogClose} type="button" aria-label="Close" onClick={() => inviteDialog.current?.close()}><X size={20} /></button>
            <h2 id="invite-title">Open a board link</h2>
            <label htmlFor="board-link">Canvas Flow link</label>
            <input autoFocus id="board-link" name="boardLink" placeholder="Paste a board or invite link" required
              autoComplete="off" spellCheck={false} onChange={() => setInviteError(null)} />
            {inviteError && <p role="alert" className={styles.dialogError}>{inviteError}</p>}
            <button className={styles.primary} type="submit">Open board <ArrowRight size={17} /></button>
          </form>
        </dialog>
      </div>
      {isOpening && <BoardLoadingScreen />}
    </main>
  );
}

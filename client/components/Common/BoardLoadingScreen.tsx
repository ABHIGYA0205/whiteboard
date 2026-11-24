import Link from "next/link";
import styles from "./BoardLoadingScreen.module.css";

type Props = {
  error?: string;
  onRetry?: () => void;
};

export function BoardLoadingScreen({ error, onRetry }: Props) {
  return (
    <section className={styles.screen}>
      <div className={styles.content}>
        <div className={styles.canvas} data-animated={!error} aria-hidden="true">
          <div className={styles.rail}>
            <i /><i /><i />
          </div>
          <div className={styles.art}>
            <span className={styles.connector} />
            <span className={styles.note} />
            <span className={styles.result} />
            <span className={styles.cursor} />
          </div>
        </div>
        {error ? (
          <>
            <h1 role="alert">{error}</h1>
            <div className={styles.actions}>
              <button type="button" onClick={onRetry}>Try again</button>
              <Link href="/">Back to home</Link>
            </div>
          </>
        ) : (
          <div role="status" aria-atomic="true">
            <h1>Opening your board</h1>
            <div className={styles.progress} aria-hidden="true" />
          </div>
        )}
      </div>
    </section>
  );
}

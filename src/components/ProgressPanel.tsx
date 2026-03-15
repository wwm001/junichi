interface ProgressPanelProps {
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number;
  dueCount: number;
  reviewedCount: number;
  totalItems: number;
  onResetProgress: () => void;
  hasProgress: boolean;
  resetStatusMessage: string | null;
}

export function ProgressPanel({
  totalAnswered,
  totalCorrect,
  accuracy,
  dueCount,
  reviewedCount,
  totalItems,
  onResetProgress,
  hasProgress,
  resetStatusMessage
}: ProgressPanelProps): JSX.Element {
  return (
    <section className="card progress-panel">
      <div className="progress-header">
        <div>
          <p className="section-label">学習状況</p>
          <h2>進捗</h2>
        </div>

        <div className="progress-actions">
          <p className="progress-summary">{reviewedCount} / {totalItems} 語に学習履歴あり</p>
          <button type="button" className="ghost-button" onClick={onResetProgress} disabled={!hasProgress}>
            学習履歴をリセット
          </button>
        </div>
      </div>

      {resetStatusMessage && (
        <p className="note note-success" aria-live="polite">
          {resetStatusMessage}
        </p>
      )}

      <div className="stats-grid">
        <article className="stat-card">
          <p className="stat-label">回答数</p>
          <p className="stat-value">{totalAnswered}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">正解数</p>
          <p className="stat-value">{totalCorrect}</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">正答率</p>
          <p className="stat-value">{accuracy}%</p>
        </article>
        <article className="stat-card">
          <p className="stat-label">今すぐ復習</p>
          <p className="stat-value">{dueCount}語</p>
        </article>
      </div>
    </section>
  );
}

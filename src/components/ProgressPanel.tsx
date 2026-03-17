interface ProgressPanelProps {
  totalAnswered: number;
  totalCorrect: number;
  accuracy: number;
  dueCount: number;
}

export function ProgressPanel({ totalAnswered, totalCorrect, accuracy, dueCount }: ProgressPanelProps): JSX.Element {
  return (
    <section className="card progress-panel">
      <h2>Progress</h2>
      <ul>
        <li>回答数: {totalAnswered}</li>
        <li>正解数: {totalCorrect}</li>
        <li>正答率: {accuracy}%</li>
        <li>今すぐ復習できる単語: {dueCount}</li>
      </ul>
    </section>
  );
}

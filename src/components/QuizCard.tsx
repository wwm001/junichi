import type { QuizQuestion, ReviewRating } from '../domain/types';

type AnswerStatus = 'idle' | 'correct' | 'wrong';

interface QuizCardProps {
  question: QuizQuestion;
  onChoice: (choice: string) => void;
  selectedChoice: string | null;
  showResult: boolean;
  onSpeak: () => void;
  speechAvailable: boolean;
  speechReady: boolean;
  speechPlaying: boolean;
  speechStatusMessage: string | null;
  voiceDebugLabel: string | null;
  answerStatus: AnswerStatus;
  onRate: (rating: ReviewRating) => void;
}

const reviewLabels: Record<ReviewRating, string> = {
  again: 'Again｜もう一度',
  hard: 'Hard｜難しい',
  good: 'Good｜良い',
  easy: 'Easy｜簡単'
};

export function QuizCard({
  question,
  onChoice,
  selectedChoice,
  showResult,
  onSpeak,
  speechAvailable,
  speechReady,
  speechPlaying,
  speechStatusMessage,
  voiceDebugLabel,
  answerStatus,
  onRate
}: QuizCardProps): JSX.Element {
  const speakButtonLabel = speechPlaying ? '🔊 再生中…' : '🔊 単語を再生';

  return (
    <section className="card quiz-card">
      <header className="card-header">
        <div>
          <p className="section-label">問題</p>
          <h2>語彙オーディオクイズ</h2>
        </div>
        <button
          className={`speak-button${!speechAvailable ? ' is-unavailable' : ''}${speechPlaying ? ' is-playing' : ''}`}
          onClick={onSpeak}
          type="button"
          aria-live="polite"
        >
          {speakButtonLabel}
        </button>
      </header>

      <p className="question-guide">音声を聞いて、最も近い意味を1つ選んでください。</p>

      {!speechAvailable && (
        <p className="note" aria-live="polite">
          このブラウザでは音声再生が制限される場合があります。音声学習には Chrome の利用を推奨します。
        </p>
      )}

      {speechAvailable && !speechReady && !speechStatusMessage && !speechPlaying && (
        <p className="note" aria-live="polite">
          初回タップ時に音声を初期化します。反応しない場合は、もう一度「単語を再生」を押してください。
        </p>
      )}

      {speechAvailable && speechReady && !speechStatusMessage && !speechPlaying && (
        <p className="note note-info" aria-live="polite">
          聞き直したい時は、何度でも「単語を再生」を押せます。
        </p>
      )}

      {speechPlaying && (
        <p className="note note-success" aria-live="polite">
          音声を再生しています。聞き取り後に選択肢をタップしてください。
        </p>
      )}

      {speechStatusMessage && (
        <p className="note note-error" aria-live="polite">
          {speechStatusMessage}
        </p>
      )}

      {voiceDebugLabel && <p className="note note-debug">DEV voice: {voiceDebugLabel}</p>}

      <div className="choices" role="list" aria-label="意味の選択肢">
        {question.choices.map((choice) => {
          const isCorrect = choice === question.item.meaningJa;
          const isSelected = selectedChoice === choice;

          const className = showResult
            ? isCorrect
              ? 'choice correct'
              : isSelected
                ? 'choice wrong'
                : 'choice'
            : 'choice';

          return (
            <button
              key={choice}
              type="button"
              className={className}
              onClick={() => onChoice(choice)}
              disabled={showResult}
            >
              {choice}
            </button>
          );
        })}
      </div>

      {showResult && (
        <div className="answer-panel" data-status={answerStatus}>
          <p className="answer-heading">{answerStatus === 'correct' ? '正解です' : '不正解です'}</p>
          <p className="answer-detail">
            正解: <strong>{question.item.meaningJa}</strong>
          </p>
          <p className="answer-subdetail">復習の感覚に近いボタンを選んで次へ進みます。</p>
        </div>
      )}

      {showResult && (
        <div className="review-buttons">
          <p>復習評価</p>
          <div className="review-grid">
            {(Object.keys(reviewLabels) as ReviewRating[]).map((rating) => (
              <button key={rating} type="button" onClick={() => onRate(rating)}>
                {reviewLabels[rating]}
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

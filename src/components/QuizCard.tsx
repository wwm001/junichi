import type { QuizQuestion, ReviewRating } from '../domain/types';

interface QuizCardProps {
  question: QuizQuestion;
  onChoice: (choice: string) => void;
  selectedChoice: string | null;
  showResult: boolean;
  onSpeak: () => void;
  speechAvailable: boolean;
  speechReady: boolean;
  speechStatusMessage: string | null;
  voiceDebugLabel: string | null;
  onRate: (rating: ReviewRating) => void;
}

export function QuizCard({
  question,
  onChoice,
  selectedChoice,
  showResult,
  onSpeak,
  speechAvailable,
  speechReady,
  speechStatusMessage,
  voiceDebugLabel,
  onRate
}: QuizCardProps): JSX.Element {
  return (
    <section className="card">
      <header className="card-header">
        <h2>Vocabulary Audio Quiz</h2>
        <button className="speak-button" onClick={onSpeak} type="button" disabled={!speechAvailable}>
          🔊 単語を再生
        </button>
      </header>

      <p className="word">{question.item.word}</p>

      {!speechAvailable && <p className="note">このブラウザでは音声再生が利用できません。</p>}

      {speechAvailable && !speechReady && !speechStatusMessage && (
        <p className="note">初回タップ時に音声を初期化します。反応しない場合はもう一度タップしてください。</p>
      )}

      {speechStatusMessage && <p className="note note-error">{speechStatusMessage}</p>}

      {voiceDebugLabel && <p className="note note-debug">DEV voice: {voiceDebugLabel}</p>}

      <div className="choices">
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
        <div className="review-buttons">
          <p>復習評価を選んで次へ進む:</p>
          <div className="review-grid">
            <button type="button" onClick={() => onRate('again')}>
              again
            </button>
            <button type="button" onClick={() => onRate('hard')}>
              hard
            </button>
            <button type="button" onClick={() => onRate('good')}>
              good
            </button>
            <button type="button" onClick={() => onRate('easy')}>
              easy
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

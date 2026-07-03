import { useEffect, useState } from "react";
import { apiClient } from "../../shared/api/api-client";

const ratings = [
  { label: "Again", value: "again" },
  { label: "Hard", value: "hard" },
  { label: "Good", value: "good" },
  { label: "Easy", value: "easy" },
] as const;

export function ReviewPage() {
  const [cards, setCards] = useState<Array<any>>([]);

  useEffect(() => {
    void apiClient.getTodayCards().then(setCards);
  }, []);

  const currentCard = cards[0];

  const submit = async (rating: (typeof ratings)[number]["value"]) => {
    if (!currentCard) {
      return;
    }
    await apiClient.submitReview(currentCard.id, rating);
    setCards((current) => current.slice(1));
  };

  return (
    <main className="page stack">
      <h1>今日复习</h1>
      {!currentCard ? (
        <p>今天没有待复习卡片，先去导入一些内容吧。</p>
      ) : (
        <article className="card stack">
          <h2>{currentCard.concept?.title ?? currentCard.conceptTitle ?? "待复习知识点"}</h2>
          <p>{currentCard.question}</p>
          <details>
            <summary>查看答案</summary>
            <p>{currentCard.answer}</p>
          </details>
          <div className="actions">
            {ratings.map((item) => (
              <button key={item.value} onClick={() => void submit(item.value)} type="button">
                {item.label}
              </button>
            ))}
          </div>
        </article>
      )}
    </main>
  );
}

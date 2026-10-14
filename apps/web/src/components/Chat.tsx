import { FormEvent, useState } from "react";

const API_URL = (import.meta.env.VITE_API_URL ?? "http://localhost:3001").replace(/\/+$/, "");
const SUGGESTED_QUESTIONS = ["What does useState return?", "When does useEffect run?", "How do I initialize state with a function?"];

interface Source { readonly reference: number; readonly title: string; readonly section: string; readonly url: string; readonly score: number; readonly excerpt: string; }
interface Exchange { readonly id: number; readonly question: string; readonly answer: string; readonly sources: readonly Source[]; }

function Chat() {
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<readonly Exchange[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submitQuestion(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion || isLoading) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: trimmedQuestion }),
      });
      const payload = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) throw new Error(errorFromResponse(payload) ?? "The assistant could not answer right now.");

      const chatResponse = parseChatResponse(payload);
      setExchanges((current) => [...current, { id: Date.now(), question: trimmedQuestion, answer: chatResponse.answer, sources: chatResponse.sources }]);
      setQuestion("");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "The assistant could not answer right now.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="chat" aria-label="React documentation chat">
      {exchanges.length === 0 ? (
        <div className="chat__empty">
          <span className="chat__eyebrow">Grounded in your local index</span>
          <h2>Ask about React</h2>
          <p>Answers are generated from the indexed React reference and include their source sections.</p>
          <div className="chat__suggestions" aria-label="Suggested questions">
            {SUGGESTED_QUESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => setQuestion(suggestion)}>{suggestion}</button>)}
          </div>
        </div>
      ) : (
        <div className="chat__history" aria-live="polite">
          {exchanges.map((exchange) => (
            <article className="exchange" key={exchange.id}>
              <div className="exchange__question"><span>You asked</span><p>{exchange.question}</p></div>
              <div className="answer-card">
                <div className="answer-card__header">
                  <div><span className="answer-card__icon" aria-hidden="true">✦</span><span>RAG answer</span></div>
                  <span className="answer-card__grounded">Grounded response</span>
                </div>
                <p className="answer-card__body">{exchange.answer}</p>
              </div>
              {exchange.sources.length > 0 && <section className="sources" aria-label="Retrieved reference sources">
                <div className="sources__heading"><div><span>Evidence</span><h3>Reference sources</h3></div><p>{exchange.sources.length} retrieved chunk{exchange.sources.length === 1 ? "" : "s"}</p></div>
                <div className="sources__grid">
                  {exchange.sources.map((source) => <article className="source-card" key={`${exchange.id}-${source.reference}`}>
                    <div className="source-card__meta"><span className="source-card__reference">{String(source.reference).padStart(2, "0")}</span><span>{Math.round(source.score * 100)}% match</span></div>
                    <p className="source-card__section">{source.section}</p>
                    <h4>{source.title}</h4>
                    <p className="source-card__excerpt">{source.excerpt}</p>
                    <a className="source-card__link" href={source.url} target="_blank" rel="noreferrer">Open React Docs <span aria-hidden="true">↗</span></a>
                  </article>)}
                </div>
              </section>}
            </article>
          ))}
        </div>
      )}
      {isLoading && <div className="chat__loading" role="status">Searching the React docs and writing an answer…</div>}
      {error && <p className="chat__error" role="alert">{error}</p>}
      <form className="chat__form" onSubmit={submitQuestion}>
        <label className="sr-only" htmlFor="question">Ask a React documentation question</label>
        <textarea id="question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question about React…" rows={3} maxLength={2000} disabled={isLoading} />
        <div className="chat__form-footer"><span>Answers use only indexed documentation.</span><button type="submit" disabled={!question.trim() || isLoading}>{isLoading ? "Thinking…" : "Ask"}</button></div>
      </form>
    </section>
  );
}

function parseChatResponse(payload: unknown): { answer: string; sources: Source[] } {
  if (!isRecord(payload) || typeof payload.answer !== "string" || !Array.isArray(payload.sources)) throw new Error("The API returned an unexpected response.");
  const sources = payload.sources.flatMap((source) => (isSource(source) ? [source] : []));
  return { answer: payload.answer, sources };
}

function errorFromResponse(payload: unknown): string | undefined { return isRecord(payload) && typeof payload.error === "string" ? payload.error : undefined; }
function isSource(value: unknown): value is Source { return isRecord(value) && typeof value.reference === "number" && typeof value.title === "string" && typeof value.section === "string" && typeof value.url === "string" && typeof value.score === "number" && typeof value.excerpt === "string"; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }

export default Chat;

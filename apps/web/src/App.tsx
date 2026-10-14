import Chat from "./components/Chat";

function App() {
  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="app-header__brand">React Docs · RAG POC</p>
          <h1>Find answers in the React reference.</h1>
          <p className="app-header__intro">Ask a question. The assistant retrieves the best matching React documentation and shows the evidence used for every answer.</p>
        </div>
      </header>
      <Chat />
    </main>
  );
}

export default App;

import Investigator from './components/Investigator';

export default function Page() {
  return (
    <main className="shell">
      <header className="masthead">
        <p className="eyebrow">LLM Side Panel · investigation agent</p>
        <h1>Investigate, don’t guess.</h1>
        <p className="lede">
          Every sentence that survives citation validation points at a retrieved source. Whatever the agent cannot
          establish is returned as a gap, not smoothed over in prose.
        </p>
      </header>
      <Investigator />
      <footer className="foot">
        Evidence contract: id · url · fetched_at · sha256 · source_tool · extractor_version · text. Citations are
        checked against that graph; nothing else reaches the model.
      </footer>
    </main>
  );
}

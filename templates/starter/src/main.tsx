import React from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import './styles.css';
import { project } from './project';

const templateCopy = {
  saas: {
    eyebrow: 'A clearer way to work',
    title: 'Turn scattered work into steady momentum.',
    lede: 'One considered workspace for the decisions, signals, and next steps that move your team forward.',
  },
  portfolio: {
    eyebrow: 'Independent creative practice',
    title: 'Ideas made useful, tactile, and memorable.',
    lede: 'Selected identity and digital work for people shaping thoughtful products, places, and culture.',
  },
  dashboard: {
    eyebrow: 'Your operating picture',
    title: 'See the work that needs your attention.',
    lede: 'A calm command center for tracking progress, resolving blockers, and keeping the team aligned.',
  },
} as const;

function App() {
  const copy = templateCopy[project.template];
  return (
    <main>
      <nav>
        <a className="brand" href="#">{project.name}</a>
        <div className="nav-links">
          <a href="#work">Work</a>
          <a href="#about">About</a>
        </div>
        <button className="text-button">Let’s talk <ArrowUpRight size={16} /></button>
      </nav>

      <section className="hero" id="work">
        <div className="eyebrow"><Sparkles size={14} /> {copy.eyebrow}</div>
        <h1>{copy.title}</h1>
        <p className="lede">{copy.lede}</p>
        <button className="primary">See selected work <ArrowUpRight size={17} /></button>
      </section>

      <section className="project-grid" aria-label="Selected work">
        <article className="project card-a"><span>01 / Product</span><h2>Atmos</h2><p>Climate intelligence for everyday decisions.</p></article>
        <article className="project card-b"><span>02 / Identity</span><h2>Field Notes</h2><p>A warmer home for independent publishing.</p></article>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<App />);

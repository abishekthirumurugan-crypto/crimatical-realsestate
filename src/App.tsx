import { useEffect } from 'react';

import SiteHeader from './components/SiteHeader';
import { useScrollProgress } from './hooks/useScrollProgress';
import { useCardFocus } from './hooks/useCardFocus';
import SiteFooter from './components/SiteFooter';
import FloatingActions from './components/FloatingActions';
import EnquiryDialog from './components/EnquiryDialog';
import { RouterProvider, useRoute } from './lib/router';
import { COMPANY, findPost } from './content/site';

import Home from './pages/Home';
import Details from './pages/Details';
import About from './pages/About';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import Contact from './pages/Contact';
import NotFound from './pages/NotFound';

import './styles/tokens.css';
import './styles/base.css';
import './styles/chrome.css';
import './styles/film.css';
import './styles/sections.css';
import './styles/pages.css';
import './styles/actions.css';
import './styles/elevation.css';
import './styles/motion.css';
// Last, so the raised-card state can outrank the hover states the two files
// above give the same cards. See the note at the top of focus.css.
import './styles/focus.css';

const BLOG_PREFIX = '/blog/';
const PROJECT_TITLE = `${COMPANY.name} Block A`;

/** The page for a route, plus the title that goes with it. */
function resolve(route: string): { element: React.ReactElement; title: string } {
  if (route === '/') {
    return {
      element: <Home />,
      title: `${COMPANY.name} — Block A, Plot 7, Perungudi`,
    };
  }
  if (route === '/details') {
    return { element: <Details />, title: `${PROJECT_TITLE} — the project` };
  }
  if (route === '/about') {
    return { element: <About />, title: `About us — ${COMPANY.name}` };
  }
  if (route === '/blog') {
    return { element: <Blog />, title: `Journal — ${COMPANY.name}` };
  }
  if (route.startsWith(BLOG_PREFIX)) {
    const slug = route.slice(BLOG_PREFIX.length);
    const post = findPost(slug);
    return {
      element: <BlogPost slug={slug} />,
      title: post ? `${post.title} — ${COMPANY.name}` : `Not found — ${COMPANY.name}`,
    };
  }
  if (route === '/contact') {
    return { element: <Contact />, title: `Contact us — ${COMPANY.name}` };
  }
  return { element: <NotFound />, title: `Not found — ${COMPANY.name}` };
}

function Routes() {
  const route = useRoute();
  const { element, title } = resolve(route);

  // Without a server rendering per-route <title>, the tab would keep saying
  // whatever index.html said on every page. Browser history entries use it too.
  useEffect(() => {
    document.title = title;
  }, [title]);

  return element;
}

/**
 * Everything outside the routed page.
 *
 * Inside `RouterProvider` rather than wrapping it, because the scroll-progress
 * rule has to know whether this is the film route to skip its own work there.
 */
function Shell() {
  const route = useRoute();
  const isFilm = route === '/' || route === '/index.html';

  useScrollProgress(!isFilm);
  // Hover a grid card and it rises to the centre of the screen. One delegated
  // listener for every card on the site rather than a handler per card.
  useCardFocus();

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {/* The dimmer behind a raised card. Rendered once and always, because it
          transitions its opacity — mounting it on demand would have nothing to
          transition from. */}
      <div className="card-focus-scrim" aria-hidden="true" />
      <SiteHeader />
      {/* Fills with how far down the document you are. Hidden on the home page,
          where the film already measures the same scroll. See motion.css. */}
      <div className="scroll-rule" aria-hidden="true" />
      <main id="main">
        <Routes />
      </main>
      <SiteFooter />
      <FloatingActions />
      {/* Mounted once for the whole site. It is an empty `<dialog>` until
          something calls `openEnquiry()`, and the Sell.Do script is not
          fetched until the first time it opens. */}
      <EnquiryDialog />
    </>
  );
}

export default function App() {
  return (
    <RouterProvider>
      <Shell />
    </RouterProvider>
  );
}

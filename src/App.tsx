import { NavLink, Route, Routes, Link } from 'react-router-dom';
import { useAuth } from './auth';
import { MyStatusBar } from './components';
import { missingConfig } from './lib/supabase';
import { AccountPage } from './pages/AccountPage';
import { CourtPage } from './pages/CourtPage';
import { CourtsPage } from './pages/CourtsPage';
import { CrewPage } from './pages/CrewPage';
import { CrewsPage } from './pages/CrewsPage';
import { JoinPage } from './pages/JoinPage';
import { LoginPage } from './pages/LoginPage';

function Header() {
  const { userId, profile } = useAuth();
  return (
    <header className="topbar">
      <Link to="/" className="wordmark" aria-label="Runback home">
        <span className="ball" aria-hidden="true" />
        runback
      </Link>
      <nav className="nav" aria-label="Main">
        <NavLink to="/" end>
          Courts
        </NavLink>
        <NavLink to="/crews">Crews</NavLink>
        {userId ? (
          <NavLink to="/me" className="nav-me">
            {profile?.display_name?.split(' ')[0] ?? 'You'}
          </NavLink>
        ) : (
          <NavLink to="/login">Sign in</NavLink>
        )}
      </nav>
    </header>
  );
}

export function App() {
  if (missingConfig) {
    return (
      <main className="section narrow">
        <h1 className="page-title">Runback isn't set up yet</h1>
        <p>
          The site is missing its database settings. Add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (see <code>.env.example</code>) and rebuild.
        </p>
      </main>
    );
  }

  return (
    <div className="app">
      <Header />
      <MyStatusBar />
      <main id="main">
        <Routes>
          <Route path="/" element={<CourtsPage />} />
          <Route path="/court/:slug" element={<CourtPage />} />
          <Route path="/crews" element={<CrewsPage />} />
          <Route path="/crew/:id" element={<CrewPage />} />
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/me" element={<AccountPage />} />
          <Route
            path="*"
            element={
              <section className="section narrow">
                <h1 className="page-title">Page not found</h1>
                <p>
                  <Link to="/">See courts</Link>
                </p>
              </section>
            }
          />
        </Routes>
      </main>
      <footer className="footer">Built in Tucson for people who show up.</footer>
    </div>
  );
}

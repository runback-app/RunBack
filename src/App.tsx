import { ResetPasswordPage } from './ResetPasswordPage';
import { Notifications } from './Notifications';
import { RunPage } from './RunTools';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import { useAuth } from './auth';
import { cleanPageUrl } from './lib/analytics';
import { PrivacyPage } from './pages/PrivacyPage';
import { TermsPage } from './pages/TermsPage';
import { Avatar, CourtIcon, CrewIcon, FriendsIcon, MyStatusBar, YouIcon } from './components';
import { missingConfig } from './lib/supabase';
import { CourtPage } from './pages/CourtPage';
import { CourtsPage } from './pages/CourtsPage';
import { CrewPage } from './pages/CrewPage';
import { CrewsPage } from './pages/CrewsPage';
import { JoinPage } from './pages/JoinPage';
import { LoginPage } from './pages/LoginPage';
import { AccountRecoveryPage } from './pages/AccountRecoveryPage';
import { PlayerPage } from './pages/PlayerPage';
import { ProfilePage } from './pages/ProfilePage';
import { FriendsPage } from './pages/FriendsPage';
import { AddFriendPage } from './pages/AddFriendPage';
import { OfflineScreen } from './Offline';

function Header() {
  const { userId, profile } = useAuth();
  return (
    <header className="topbar">
      <Link to="/" className="wordmark" aria-label="RunBack home">
        <img className="brand-mark" src="/favicon.svg" width="36" height="36" alt="" />
        <span>Run<span className="wordmark-accent">Back</span></span>
      </Link>
      <nav className="nav" aria-label="Main">
        <NavLink to="/" end>
          Courts
        </NavLink>
        <NavLink to="/crews">Crews</NavLink>{userId&&<NavLink to="/friends">Friends</NavLink>}{userId&&<NavLink to="/updates">Updates</NavLink>}
        {userId ? (
          <NavLink to="/me" className="nav-me" aria-label="Your profile">
            <Avatar name={profile?.display_name} url={profile?.avatar_url} size={32} seed={userId} />
          </NavLink>
        ) : (
          <NavLink to="/login">Sign in</NavLink>
        )}
      </nav>
    </header>
  );
}

/** Phone-style tab bar, only shown on small screens. */
function TabBar() {
  const { userId } = useAuth();
  return (
    <nav className="tabbar" aria-label="Tabs">
      <NavLink to="/" end>
        <CourtIcon />
        <span>Courts</span>
      </NavLink>
      <NavLink to="/crews">
        <CrewIcon />
        <span>Crews</span>
      </NavLink>
      {userId && (
        <NavLink to="/friends">
          <FriendsIcon />
          <span>Friends</span>
        </NavLink>
      )}
      <NavLink to={userId ? '/me' : '/login'}>
        <YouIcon />
        <span>{userId ? 'You' : 'Sign in'}</span>
      </NavLink>
    </nav>
  );
}

export function App() {
  if (missingConfig) {
    return (
      <main className="page narrow">
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
          <Route path="/updates" element={<Notifications/>}/><Route path="/run/:id" element={<RunPage/>}/><Route path="/crew/:id" element={<CrewPage />} />
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="/player/:id" element={<PlayerPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage/>}/><Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-email" element={<AccountRecoveryPage />} />
          <Route path="/me" element={<ProfilePage />} />
          <Route path="/friends" element={<FriendsPage />} />
          <Route path="/add/:username" element={<AddFriendPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route
            path="*"
            element={
              <section className="page narrow">
                <h1 className="page-title">Page not found</h1>
                <p>
                  <Link to="/">See courts</Link>
                </p>
              </section>
            }
          />
        </Routes>
      </main>
      <footer className="footer">
        <span>Built in Tucson for people who show up.</span>
        <span className="footer-links">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy#contact">Send feedback</Link>
        </span>
      </footer>
      <TabBar />
      <OfflineScreen />
      <Analytics beforeSend={(event) => ({ ...event, url: cleanPageUrl(event.url) })} />
    </div>
  );
}

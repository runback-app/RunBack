import { Link } from 'react-router-dom';

/** Bump when the terms change in a way players should agree to again. */
export const TERMS_VERSION = '2026-11-10';

export function TermsPage() {
  return (
    <article className="page narrow prose">
      <h1 className="page-title">Terms of use</h1>
      <p className="muted">Last updated November 10, 2026</p>
      <p>
        Runback helps people find pickup basketball runs in Tucson. By making an account or using the app, you agree
        to these terms. They're short on purpose. Please read them.
      </p>

      <h2>Who can use Runback</h2>
      <ul>
        <li>You need to be 13 or older.</li>
        <li>One account per person. Keep your password to yourself. You're responsible for what happens on your account.</li>
        <li>Your name must not pretend to be someone else.</li>
      </ul>

      <h2>No tolerance for abuse</h2>
      <p>
        Runback has zero tolerance for objectionable content or abusive players. Anywhere in the app (court chat, crew
        chat, names, bios, photos), you can't post:
      </p>
      <ul>
        <li>Slurs, hate, or attacks on anyone for their race, religion, gender, sexuality, disability, or where they're from</li>
        <li>Threats, harassment, bullying, or telling anyone to hurt themselves</li>
        <li>Sexual content or nudity</li>
        <li>Anything illegal, including selling drugs or weapons</li>
        <li>Spam, scams, or ads</li>
        <li>Someone else's private info, like their address or phone number</li>
      </ul>
      <p>
        Regular trash talk and cussing are fine. Making someone feel unsafe isn't.
      </p>

      <h2>Reporting and blocking</h2>
      <ul>
        <li>Tap any chat message to report it. Tap Block on a message or player card to stop seeing that player.</li>
        <li>
          The Runback team reviews reports within 24 hours. We remove content that breaks these rules, and we remove
          players who post it. Serious cases may lose their account right away, without warning.
        </li>
        <li>A filter blocks slurs and threats automatically, but it won't catch everything. Please report what it misses.</li>
      </ul>

      <h2>Playing safe</h2>
      <ul>
        <li>
          Runback shows who's checked in, but we don't run the courts, check who people are, or supervise games. Play at
          your own risk.
        </li>
        <li>Meeting people from the app happens at public courts. Use the same common sense you would at any pickup run.</li>
        <li>Court hours and player counts can be wrong. Check-ins are only as accurate as the people making them.</li>
      </ul>

      <h2>Your stuff</h2>
      <ul>
        <li>
          What you post is yours. You let Runback show it in the app so it works (for example, showing your message in a
          court chat).
        </li>
        <li>
          See <Link to="/privacy">Privacy</Link> for what we collect and how long we keep it. You can delete your account
          any time from your profile page.
        </li>
      </ul>

      <h2>The app itself</h2>
      <ul>
        <li>Runback is free. It's provided as is, and it might go down, change, or lose features.</li>
        <li>Don't try to break, overload, or get around the app's limits, or scrape other players' info.</li>
        <li>We may update these terms. If it's a big change, we'll ask you to agree again.</li>
      </ul>

      <h2>Questions</h2>
      <p>
        Reach us through the <Link to="/privacy#contact">feedback form</Link>.
      </p>
    </article>
  );
}

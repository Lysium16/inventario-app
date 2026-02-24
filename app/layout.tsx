import "./globals.css";
import TopNav from "./components/TopNav";
import Topbar from './components/Topbar';

export const metadata = {
  title: "Domobags | Magazzino",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // activePath lo ricaviamo lato client nelle pagine; qui mettiamo una topbar â€œneutraâ€.
  // Le pagine passano activePath con un wrapper semplice.
  return (
    <html lang="it">
      <body>
      <Topbar />
{children}
      </body>
    </html>
  );
}
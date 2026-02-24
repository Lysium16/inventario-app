import "./globals.css";
import TopNav from "./components/TopNav";

export const metadata = {
  title: "Domobags | Magazzino",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // activePath lo ricaviamo lato client nelle pagine; qui mettiamo una topbar “neutra”.
  // Le pagine passano activePath con un wrapper semplice.
  return (
    <html lang="it">
      <body>
        {children}
      </body>
    </html>
  );
}
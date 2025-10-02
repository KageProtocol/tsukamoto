import "./globals.css";
import { ToastStack } from "./components/ToastStack";
import { ErrorBoundary } from "./components/ErrorBoundary";

export const metadata = {
  title: "Tsukamoto OTC",
  description: "Private OTC Desk on Aztec",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <ToastStack />
      </body>
    </html>
  );
}

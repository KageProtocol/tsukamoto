import "./globals.css";
import { ToastStack } from "./components/ToastStack";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { WalletProvider } from "@/lib/wallet-provider";

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
        <WalletProvider>
          <ErrorBoundary>
            {children}
          </ErrorBoundary>
          <ToastStack />
        </WalletProvider>
      </body>
    </html>
  );
}

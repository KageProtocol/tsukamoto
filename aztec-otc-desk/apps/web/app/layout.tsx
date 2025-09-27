import "./globals.css";
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
      <body>{children}</body>
    </html>
  );
}

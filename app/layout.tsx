import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sixth College LSA / RMA Scheduler",
  description: "Book a conflict-free LSA or RMA appointment for your suite.",
  icons: {
    icon: [{ url: "/favicon-cat.png", type: "image/png" }],
    apple: "/favicon-cat.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

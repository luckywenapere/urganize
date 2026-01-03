import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Urganize - Music Release Management",
  description: "The opinionated operating system for music careers. Stop the chaos, ship your releases.",
  keywords: ["music", "release", "management", "artist", "manager", "promotion"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* Load Inter font */}
        <link 
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body className="bg-bg-base text-content-primary antialiased">
        {children}
        
        {/* Keyboard navigation hint - Linear style */}
        <div className="keyboard-hint">
          <kbd className="kbd">⌘</kbd>
          <kbd className="kbd">K</kbd>
          <span>Quick actions</span>
        </div>
      </body>
    </html>
  );
}

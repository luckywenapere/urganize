'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/lib/auth-store';
import type { Metadata } from "next";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const checkAuth = useAuthStore((state) => state.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body className="bg-bg-base text-content-primary antialiased">
        {children}
        <div className="keyboard-hint">
          <kbd className="kbd">⌘</kbd>
          <kbd className="kbd">K</kbd>
          <span>Quick actions</span>
        </div>
      </body>
    </html>
  );
}
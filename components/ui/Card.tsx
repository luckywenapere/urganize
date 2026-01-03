import React from 'react';
import { clsx } from 'clsx';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export const Card: React.FC<CardProps> = ({ children, className, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-slate-900/50 border border-slate-800 rounded-2xl p-6',
        'backdrop-blur-sm',
        onClick && 'cursor-pointer hover:border-slate-700 transition-all duration-200',
        className
      )}
    >
      {children}
    </div>
  );
};

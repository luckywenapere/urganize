'use client';

import React from 'react';
import Image from 'next/image';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
  variant?: 'default' | 'square';
}

const sizes = {
  sm: { height: 20, width: 80 },
  md: { height: 24, width: 96 },
  lg: { height: 32, width: 128 },
  xl: { height: 40, width: 160 },
};

const squareSizes = {
  sm: 20,
  md: 24,
  lg: 32,
  xl: 40,
};

export const Logo: React.FC<LogoProps> = ({ 
  size = 'md', 
  showText = true,
  className = '',
  variant = 'default',
}) => {
  const dimensions = sizes[size];
  const squareSize = squareSizes[size];

  // If showText is false or variant is square, show the square icon
  if (!showText || variant === 'square') {
    return (
      <div className={`flex items-center ${className}`}>
        <Image 
          src="/images/urganize-logo-square.png"
          alt="Urganize"
          width={squareSize}
          height={squareSize}
          className="flex-shrink-0 object-contain"
          priority
        />
      </div>
    );
  }

  // Full logo with text
  return (
    <div className={`flex items-center ${className}`}>
      <Image 
        src="/images/urganize-logo.png"
        alt="Urganize"
        width={dimensions.width}
        height={dimensions.height}
        className="flex-shrink-0 object-contain"
        priority
      />
    </div>
  );
};

// Icon-only variant (square logo)
export const LogoIcon: React.FC<{ size?: number; className?: string }> = ({ 
  size = 24, 
  className = '' 
}) => {
  return (
    <Image 
      src="/images/urganize-logo-square.png"
      alt="Urganize"
      width={size}
      height={size}
      className={`object-contain ${className}`}
      priority
    />
  );
};

export default Logo;

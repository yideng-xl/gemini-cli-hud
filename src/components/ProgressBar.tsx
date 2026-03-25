import React from 'react';
import { Text } from 'ink';

interface ProgressBarProps {
  progress: number;
  width: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, width }) => {
  const filledWidth = Math.max(0, Math.min(width, Math.round(progress * width)));
  const emptyWidth = width - filledWidth;
  
  return (
    <Text>
      {'#'.repeat(filledWidth)}
      {'-'.repeat(emptyWidth)}
    </Text>
  );
};

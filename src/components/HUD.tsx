import React from 'react';
import { Box, Text } from 'ink';
import { ProgressBar } from './ProgressBar.js';
import { HUDState } from '../interceptor.js';

interface HUDProps {
  state: HUDState;
  model: string;
  workspace: string;
}

export const HUD: React.FC<HUDProps> = ({ state, model, workspace }) => {
  const progress = state.tokens.total > 0 ? state.tokens.used / state.tokens.total : 0;
  
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Box justifyContent="space-between">
        <Text bold color="green">{model}</Text>
        <Text color="gray">{workspace}</Text>
      </Box>
      
      <Box marginTop={1}>
        <Text>Context: </Text>
        <ProgressBar progress={progress} width={20} />
        <Text> {Math.round(progress * 100)}% ({state.tokens.used}/{state.tokens.total})</Text>
      </Box>
      
      <Box marginTop={0}>
        <Text>Tools: </Text>
        {Array.from(state.tools.entries()).map(([name, count]) => (
          <Text key={name} color="yellow"> {name} x{count}</Text>
        ))}
      </Box>
    </Box>
  );
};

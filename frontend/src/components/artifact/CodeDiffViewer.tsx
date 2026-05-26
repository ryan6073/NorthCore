import React from 'react';
import ReactDiffViewer, { DiffMethod } from 'react-diff-viewer-continued';

interface CodeDiffViewerProps {
  oldValue: string;
  newValue: string;
  splitView?: boolean;
}

const CodeDiffViewer: React.FC<CodeDiffViewerProps> = ({ oldValue, newValue, splitView = true }) => {
  return (
    <div className="w-full h-full overflow-auto bg-slate-950 border border-slate-800 rounded-xl text-[11px] font-mono leading-relaxed">
      <ReactDiffViewer
        oldValue={oldValue}
        newValue={newValue}
        splitView={splitView}
        compareMethod={DiffMethod.WORDS}
        useDarkTheme={true}
        styles={{
          variables: {
            dark: {
              diffViewerBackground: '#090d16',
              diffViewerColor: '#f8fafc',
              addedBackground: '#064e3b',
              addedColor: '#34d399',
              removedBackground: '#7f1d1d',
              removedColor: '#f87171',
              wordAddedBackground: '#047857',
              wordRemovedBackground: '#b91c1c',
            }
          },
          line: {
            fontSize: '11px',
            lineHeight: '1.6',
          }
        }}
      />
    </div>
  );
};

export default CodeDiffViewer;

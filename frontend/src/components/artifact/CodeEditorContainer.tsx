import React, { useRef, useEffect, useState } from 'react';

interface CodeEditorContainerProps {
  initialValue: string;
  onChange: (value: string) => void;
}

const CodeEditorContainer: React.FC<CodeEditorContainerProps> = ({ initialValue, onChange }) => {
  const [value, setValue] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  // Sync state with prop if changed from outside
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  // Sync scroll between textarea and line number container
  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setValue(val);
    onChange(val);
  };

  // Generate line numbers
  const lines = value.split('\n');
  const totalLines = Math.max(lines.length, 1);

  return (
    <div className="relative flex flex-1 h-full min-h-0 w-full bg-slate-950 font-mono text-xs overflow-hidden border border-slate-800 rounded-b-xl">
      {/* Line Numbers Column */}
      <div 
        ref={lineNumbersRef}
        className="w-12 select-none text-slate-500 bg-slate-900/60 border-r border-slate-800/80 text-right pr-3.5 py-4 overflow-hidden flex flex-col gap-0.5"
      >
        {Array.from({ length: totalLines }).map((_, idx) => (
          <div key={idx} className="h-5 leading-5 font-mono">
            {idx + 1}
          </div>
        ))}
      </div>

      {/* Code Textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleTextareaChange}
        onScroll={handleScroll}
        spellCheck={false}
        className="flex-1 bg-transparent text-slate-100 p-4 pl-3 outline-none resize-none font-mono text-xs leading-5 whitespace-pre overflow-auto h-full w-full"
        style={{
          tabSize: 2,
          lineHeight: '1.25rem', // Match leading-5 of line numbers (1.25rem = 20px)
        }}
      />
    </div>
  );
};

export default CodeEditorContainer;

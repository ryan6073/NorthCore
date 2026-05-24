import React from 'react';
import { Message, Agent as AgentType } from '@/types';
import { User, Bot, Sparkles } from 'lucide-react';
import CodeBlock from './CodeBlock';
import TaskPlanCard from './TaskPlanCard';
import ArtifactMessage from './ArtifactMessage';

interface MessageBubbleProps {
  message: Message;
  agents: AgentType[];
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, agents }) => {
  const isUser = message.role === 'user';
  const isOrchestrator = message.role === 'orchestrator';
  const agentInfo = !isUser && message.senderName 
    ? agents.find(a => a.name === message.senderName) 
    : null;

  const renderContent = () => {
    if (message.type === 'code') {
      return <CodeBlock code={message.content} language={message.language} />;
    }
    if (message.type === 'task-plan') {
      return <TaskPlanCard content={message.content} />;
    }
    if (message.type === 'artifact') {
      return <ArtifactMessage content={message.content} />;
    }
    return <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>;
  };

  if (isOrchestrator) {
    return (
      <div className="flex gap-3.5 mb-4 w-full max-w-3xl animate-fade-in">
        <div className="w-9 h-9 rounded-lg bg-indigo-100 border border-indigo-200 flex-shrink-0 overflow-hidden flex items-center justify-center shadow-sm">
          <Sparkles className="w-4 h-4 text-indigo-600" />
        </div>
        <div className="flex-1 flex flex-col min-w-0">
          <div className="text-[11px] font-bold text-indigo-600 mb-1 ml-1 flex items-center gap-1.5">
            <span>Orchestrator</span>
            <span className="text-[9px] px-1 bg-indigo-100 text-indigo-700 rounded font-normal scale-90 origin-left">智能调度</span>
          </div>
          <div className="bg-[#f5f5fc] border border-indigo-100 px-4 py-3 rounded-xl rounded-tl-none w-full shadow-sm text-lark-text-primary">
            {renderContent()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-3.5 mb-4 w-full ${isUser ? 'flex-row-reverse' : ''} animate-fade-in`}>
      {/* Avatar */}
      <div className={`w-9 h-9 flex-shrink-0 overflow-hidden flex items-center justify-center shadow-sm ${
        isUser ? 'rounded-full bg-lark-primary' : 'rounded-lg bg-white border border-lark-border'
      }`}>
        {isUser ? (
          <User className="w-4 h-4 text-white" />
        ) : agentInfo ? (
          <img
            src={agentInfo.avatar}
            alt={message.senderName}
            className="w-full h-full object-cover"
          />
        ) : (
          <Bot className="w-4 h-4 text-lark-text-secondary" />
        )}
      </div>

      {/* Bubble Container */}
      <div className={`flex-1 ${isUser ? 'items-end' : 'items-start'} flex flex-col min-w-0 max-w-[75%]`}>
        {!isUser && message.senderName && (
          <div className="text-[11px] text-lark-text-secondary mb-1 ml-1 font-medium">
            {message.senderName}
          </div>
        )}
        {message.type === 'code' || message.type === 'task-plan' || message.type === 'artifact' ? (
          <div className="w-full">
            {renderContent()}
          </div>
        ) : (
          <div className={`px-4 py-2.5 rounded-xl text-sm leading-relaxed shadow-sm ${
            isUser 
              ? 'bg-[#deebff] text-lark-text-primary rounded-tr-none border border-[#c3dbff]' 
              : 'bg-white border border-lark-border text-lark-text-primary rounded-tl-none'
          }`}>
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MessageBubble;

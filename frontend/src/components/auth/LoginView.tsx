import React, { useState } from 'react';
import { useAgentHubStore } from '@/store/useAgentHubStore';
import { Sparkles, User, Mail, ShieldAlert, Lock, Eye, EyeOff } from 'lucide-react';

const PRESET_AVATARS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&h=150&q=80', // Female Tech
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80', // Male Tech
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&h=150&q=80', // Female Developer
  'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&h=150&q=80', // Male Developer
  'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=150&h=150&q=80', // Tech Executive
  'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&h=150&q=80', // Product Specialist
];

const GUEST_NAMES = [
  '阿尔法极客', '图灵传人', '比特骑士', '云海冲浪者', '硅谷猎手', '未来架构师'
];

export const LoginView: React.FC = () => {
  const login = useAgentHubStore(state => state.login);
  const register = useAgentHubStore(state => state.register);
  const loginAsGuest = useAgentHubStore(state => state.loginAsGuest);
  
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState(PRESET_AVATARS[0]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!email.trim() || !email.includes('@')) {
      setError('请输入有效的电子邮箱');
      return;
    }
    if (!password) {
      setError('请输入密码');
      return;
    }
    if (password.length < 6) {
      setError('密码长度至少为 6 位');
      return;
    }

    if (isRegister && !name.trim()) {
      setError('请输入昵称/姓名');
      return;
    }

    setLoading(true);

    try {
      if (isRegister) {
        const res = await register(name.trim(), email.trim(), password, selectedAvatar);
        if (!res.success) {
          setError(res.message);
          setLoading(false);
        }
      } else {
        const res = await login(email.trim(), password);
        if (!res.success) {
          setError(res.message);
          setLoading(false);
        }
      }
    } catch (err) {
      setError('连接失败，请重试');
      setLoading(false);
    }
  };

  const handleQuickLogin = () => {
    setLoading(true);
    setTimeout(() => {
      const randomName = GUEST_NAMES[Math.floor(Math.random() * GUEST_NAMES.length)];
      const randomEmail = `${Math.floor(Math.random() * 100000)}@northcore.ai`;
      const randomAvatar = PRESET_AVATARS[Math.floor(Math.random() * PRESET_AVATARS.length)];
      loginAsGuest(randomName, randomEmail, randomAvatar);
      setLoading(false);
    }, 800);
  };

  return (
    <div className="w-screen h-screen bg-slate-950 flex items-center justify-center relative overflow-hidden font-sans">
      {/* Dynamic Floating Ambient Circles */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] rounded-full bg-violet-850/20 blur-[120px] pointer-events-none animate-pulse duration-[6s]" />
      <div className="absolute bottom-[-15%] right-[-10%] w-[55%] h-[55%] rounded-full bg-blue-900/20 blur-[130px] pointer-events-none animate-pulse duration-[8s]" />
      <div className="absolute top-[30%] right-[20%] w-[35%] h-[35%] rounded-full bg-emerald-950/15 blur-[100px] pointer-events-none" />

      {/* Login Card */}
      <div className="w-full max-w-md mx-4 bg-slate-900/65 backdrop-blur-xl border border-slate-800 p-8 rounded-3xl shadow-2xl flex flex-col items-center relative z-10 transition-all duration-300">
        
        {/* Glowing border highlight */}
        <div className="absolute inset-0 rounded-3xl border border-white/5 pointer-events-none" />
        
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 bg-gradient-to-tr from-violet-600 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg shadow-violet-500/20 mb-3 animate-bounce-subtle">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight" style={{ fontFamily: 'Outfit, sans-serif' }}>
            欢迎来到 AgentHub
          </h2>
          <p className="text-slate-400 text-xs mt-1 text-center">
            多智能体开发与任务协作平台，即刻登录开启您的 AI 工作流
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="w-full bg-slate-950/80 p-1 rounded-xl border border-slate-800/80 flex mb-5">
          <button
            type="button"
            onClick={() => {
              setIsRegister(false);
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              !isRegister
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            账号登录
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegister(true);
              setError(null);
            }}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              isRegister
                ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            注册新账号
          </button>
        </div>

        {error && (
          <div className="w-full bg-red-950/40 border border-red-800/60 rounded-xl p-3 mb-5 flex items-center gap-2 text-xs text-red-200 animate-shake">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="w-full space-y-4">
          
          {/* Register-only Avatar selector */}
          {isRegister && (
            <div className="space-y-2 animate-fade-in">
              <label className="text-xs font-semibold text-slate-300">选择个性头像</label>
              <div className="flex items-center gap-2.5 overflow-x-auto py-1 justify-between">
                {PRESET_AVATARS.map((avatar, idx) => {
                  const isSelected = selectedAvatar === avatar;
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedAvatar(avatar)}
                      className={`w-11 h-11 rounded-full overflow-hidden border-2 transition-all flex-shrink-0 relative ${
                        isSelected
                          ? 'border-violet-500 scale-110 shadow-lg shadow-violet-500/30'
                          : 'border-slate-800 hover:border-slate-600 hover:scale-105'
                      }`}
                    >
                      <img src={avatar} alt="avatar option" className="w-full h-full object-cover" />
                      {isSelected && (
                        <div className="absolute inset-0 bg-violet-600/10 flex items-center justify-center" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Register-only User Name input */}
          {isRegister && (
            <div className="space-y-1.5 animate-fade-in">
              <label className="text-xs font-semibold text-slate-300">昵称 / 姓名</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：比特骑士"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 outline-none transition-all"
                  required
                />
              </div>
            </div>
          )}

          {/* Email input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">电子邮箱</label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="yourname@domain.com"
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 outline-none transition-all"
                required
              />
            </div>
          </div>

          {/* Password input */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-semibold text-slate-300">密码</label>
              {!isRegister && (
                <span className="text-[10px] text-slate-500 hover:text-slate-400 cursor-pointer">
                  提示: 默认管理员为 admin@northcore.ai / admin123
                </span>
              )}
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={isRegister ? '至少 6 位密码' : '请输入密码'}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl py-3 pl-10 pr-10 text-sm text-white placeholder:text-slate-500 focus:border-violet-500 focus:ring-1 focus:ring-violet-500/20 outline-none transition-all"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white py-3 rounded-xl text-sm font-semibold shadow-lg shadow-violet-500/10 hover:shadow-violet-500/20 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{isRegister ? '正在创建账户...' : '正在验证凭证...'}</span>
                </>
              ) : (
                <span>{isRegister ? '注册账号并登录' : '立即登录'}</span>
              )}
            </button>

            <div className="flex items-center my-4">
              <div className="flex-1 border-t border-slate-800/80" />
              <span className="px-3 text-[10px] text-slate-500 uppercase tracking-widest font-medium">或者</span>
              <div className="flex-1 border-t border-slate-800/80" />
            </div>

            <button
              type="button"
              disabled={loading}
              onClick={handleQuickLogin}
              className="w-full bg-slate-800/60 hover:bg-slate-850/80 border border-slate-700/60 text-slate-200 py-3 rounded-xl text-sm font-semibold active:scale-[0.98] transition-all flex items-center justify-center"
            >
              <span>✨ 一键访客体验</span>
            </button>
          </div>
        </form>

        {/* Footer info */}
        <p className="text-[10px] text-slate-600 mt-6 text-center select-none">
          测试版本 V3.5.0 © 2026 NorthCore Group. 保留所有权利.
        </p>
      </div>
    </div>
  );
};

import { WebSearchResult, WebSearchMetadata } from '@/types';

const mockWebSearchResults: Record<string, WebSearchResult[]> = {
  'react 版本': [
    {
      title: 'React 官方博客 - 发布 React 19.2.1',
      body: 'React 团队很高兴地宣布 React 19.2.1 现已发布。这是一个包含重要性能优化和 bug 修复的稳定更新。本次更新重点改进了 Concurrent Mode 下的渲染性能...',
      href: 'https://react.dev/blog/2026/05/28/react-19-2-1'
    },
    {
      title: 'React Releases - GitHub 标签页',
      body: '最新的 React 发布版本：v19.2.1 (2026-05-28), v19.2.0 (2026-05-15)...',
      href: 'https://github.com/facebook/react/releases'
    },
    {
      title: 'React 19 新特性完全指南 - 掘金',
      body: 'React 19 带来了诸多革命性改进，包括原生支持 use 钩子、新的异步渲染模式、自动批处理优化等...',
      href: 'https://juejin.cn/post/react-19-features-guide'
    }
  ],
  '2026 技术趋势': [
    {
      title: '2026 年大前端技术趋势深度解析 - 知乎',
      body: '2026 年最值得关注的技术趋势包括：React 19 生态全面普及，AI 辅助编程成为生产环境标配，边缘计算与 WebAssembly 深度结合...',
      href: 'https://zhihu.com/xxx/2026-frontend-trends'
    },
    {
      title: '2026 全球 AI 开发者大会核心要点',
      body: '生成式 AI 应用框架迎来新一轮爆发，多模态 Agent 协作成为主流开发范式...',
      href: 'https://ai-dev-conference-2026.example.com/keynotes'
    },
    {
      title: 'WebAssembly 2026 生态报告',
      body: 'Wasm 在浏览器中的性能已接近原生，云原生 Wasm 运行时广泛应用...',
      href: 'https://webassembly.org/2026-report'
    },
    {
      title: 'TypeScript 6.0 预览版发布公告',
      body: 'Microsoft 发布 TypeScript 6.0 预览版，带来类型系统重大升级、性能提升 30%...',
      href: 'https://devblogs.microsoft.com/typescript/typescript-6-0-announcement'
    }
  ],
  '天气': [
    {
      title: '上海今日天气预报 - 中国天气网',
      body: '上海 2026年6月1日天气：多云转晴，气温22-30℃，东风3-4级，空气质量良，PM2.5指数45...',
      href: 'https://weather.com/weather/shanghai'
    },
    {
      title: '全国主要城市天气预报 - 中央气象台',
      body: '北京：晴，18-28℃；广州：雷阵雨，25-32℃；深圳：多云，26-31℃...',
      href: 'https://nmc.cn/forecast'
    }
  ],
  'github trending': [
    {
      title: 'GitHub Trending - 今日热门开源项目',
      body: 'Top 1: agent-hub - 多智能体协作框架，12.5k stars；Top 2: react-19-examples - React 19 示例集合，8.3k stars...',
      href: 'https://github.com/trending'
    },
    {
      title: '2026 年 6 月最火的 AI 开源项目 - Medium',
      body: '本月涌现多个令人惊艳的 AI 开源项目，包括可直接在浏览器运行的本地大模型推理引擎...',
      href: 'https://medium.com/top-ai-open-source-projects-june-2026'
    }
  ],
  '默认搜索': [
    {
      title: '通用搜索结果 1',
      body: '这是一条通用的模拟搜索结果，展示联网搜索的基本形态...',
      href: 'https://example.com/search-1'
    },
    {
      title: '通用搜索结果 2',
      body: '第二条模拟搜索结果，用于展示多结果展示样式...',
      href: 'https://example.com/search-2'
    },
    {
      title: '通用搜索结果 3',
      body: '第三条模拟搜索结果，包含更多详细信息...',
      href: 'https://example.com/search-3'
    }
  ]
};

export const createMockWebSearchMetadata = (
  query: string,
  mode: 'auto' | 'force' | 'off' = 'auto'
): WebSearchMetadata => {
  const matchedKey = Object.keys(mockWebSearchResults).find(key => 
    query.toLowerCase().includes(key.toLowerCase())
  );
  
  const results = matchedKey 
    ? mockWebSearchResults[matchedKey] 
    : mockWebSearchResults['默认搜索'];
  
  const shouldSearch = mode !== 'off' && (
    mode === 'force' || 
    query.includes('版本') || 
    query.includes('最新') || 
    query.includes('今天') || 
    query.includes('天气') || 
    query.includes('2026') ||
    query.includes('github')
  );
  
  const decisionReason = shouldSearch
    ? (mode === 'force' 
        ? '用户指定强制联网模式，因此执行联网搜索' 
        : '问题涉及实时/动态信息，无法仅凭静态训练知识准确回答，智能决策执行联网搜索')
    : '问题属于静态知识范畴，联网模式允许但判断不需要搜索，直接使用大模型内置知识回答';

  return {
    shouldSearch,
    decisionReason,
    mode,
    used: shouldSearch,
    provider: 'ddgs',
    query,
    cacheHit: false,
    results: shouldSearch ? results : [],
    error: null
  };
};

export const webSearchTestScenarios = {
  scenario1_auto_decision_perform_search: (): WebSearchMetadata => {
    return createMockWebSearchMetadata('2026年6月 React 最新版本', 'auto');
  },

  scenario2_auto_decision_no_search: (): WebSearchMetadata => {
    return {
      shouldSearch: false,
      decisionReason: '问题是"解释什么是 React Hooks"，属于 React 基础概念的静态知识，无需联网即可准确回答',
      mode: 'auto',
      used: false,
      provider: 'ddgs',
      query: '解释什么是 React Hooks',
      cacheHit: false,
      results: [],
      error: null
    };
  },

  scenario3_force_search: (): WebSearchMetadata => {
    return createMockWebSearchMetadata('2026 技术趋势', 'force');
  },

  scenario4_off_mode: (): WebSearchMetadata => {
    return {
      shouldSearch: false,
      decisionReason: '用户明确指定联网模式为 off，完全禁止联网操作',
      mode: 'off',
      used: false,
      provider: 'ddgs',
      query: '任何搜索词',
      cacheHit: false,
      results: [],
      error: null
    };
  },

  scenario5_search_error: (): WebSearchMetadata => {
    return {
      shouldSearch: true,
      decisionReason: '问题属于实时信息，需要联网，但搜索过程发生错误',
      mode: 'auto',
      used: true,
      provider: 'ddgs',
      query: '某个特殊关键词',
      cacheHit: false,
      results: [],
      error: '网络连接超时，搜索引擎服务暂时不可用，请稍后重试'
    };
  },

  scenario6_cache_hit: (): WebSearchMetadata => {
    const meta = createMockWebSearchMetadata('react 版本', 'auto');
    meta.cacheHit = true;
    meta.decisionReason = '检测到该搜索关键词近期已有缓存结果，直接复用缓存返回，无需再次发起实际联网请求';
    return meta;
  }
};

export default {
  mockWebSearchResults,
  createMockWebSearchMetadata,
  webSearchTestScenarios
};

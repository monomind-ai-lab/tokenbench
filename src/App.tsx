import React, { useState, useEffect, useMemo } from 'react';
import { OpenRouterModel, PROVIDERS, LANGUAGES } from './types';

export default function App() {
  const [models, setModels] = useState<OpenRouterModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProviderId, setSelectedProviderId] = useState(PROVIDERS[0].id);
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [modelRatios, setModelRatios] = useState<Record<string, number>>({});
  const [inputOutputRatio, setInputOutputRatio] = useState<number>(50); // 50 means 50% input, 50% output
  const [targetUsageMillions, setTargetUsageMillions] = useState<number>(20); // Default 20M tokens target
  const [planCost, setPlanCost] = useState<number>(20);

  const [currentLang, setCurrentLang] = useState(() => {
    const cookies = document.cookie.split('; ');
    const googtransCookie = cookies.find(row => row.startsWith('googtrans='));
    if (googtransCookie) {
      const parts = googtransCookie.split('=')[1]?.split('/');
      if (parts && parts.length >= 3) {
        return parts[2];
      }
    }
    return 'en';
  });

  const handleLanguageChange = (langCode: string) => {
    setCurrentLang(langCode);
    const host = window.location.hostname;
    document.cookie = `googtrans=/en/${langCode}; path=/;`;
    document.cookie = `googtrans=/en/${langCode}; path=/; domain=${host};`;
    if (host.includes('.')) {
      document.cookie = `googtrans=/en/${langCode}; path=/; domain=.${host};`;
    }

    const selectElem = document.querySelector('.goog-te-combo') as HTMLSelectElement;
    if (selectElem) {
      selectElem.value = langCode;
      selectElem.dispatchEvent(new Event('change'));
    } else {
      window.location.reload();
    }
  };

  useEffect(() => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', 'https://openrouter.ai/api/v1/models');
    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          const apiModels: OpenRouterModel[] = Array.isArray(data.data) ? data.data : [];
          
          // Add models with correct provider IDs & market pricing
          const mockModels: OpenRouterModel[] = [
            // Opencode Go models (https://opencode.ai/zen/go/v1/models)
            { id: 'opencode-go/minimax-m3', name: 'MiniMax M3', pricing: { prompt: '0.0000008', completion: '0.0000024' }, context_length: 128000 },
            { id: 'opencode-go/minimax-m2.7', name: 'MiniMax M2.7', pricing: { prompt: '0.0000005', completion: '0.0000015' }, context_length: 128000 },
            { id: 'opencode-go/minimax-m2.5', name: 'MiniMax M2.5', pricing: { prompt: '0.0000003', completion: '0.000001' }, context_length: 128000 },
            { id: 'opencode-go/kimi-k3', name: 'Kimi K3', pricing: { prompt: '0.0000012', completion: '0.0000036' }, context_length: 128000 },
            { id: 'opencode-go/kimi-k2.7-code', name: 'Kimi K2.7 Code', pricing: { prompt: '0.000001', completion: '0.000003' }, context_length: 128000 },
            { id: 'opencode-go/kimi-k2.6', name: 'Kimi K2.6', pricing: { prompt: '0.0000008', completion: '0.0000024' }, context_length: 128000 },
            { id: 'opencode-go/kimi-k2.5', name: 'Kimi K2.5', pricing: { prompt: '0.0000005', completion: '0.0000015' }, context_length: 128000 },
            { id: 'opencode-go/glm-5.2', name: 'GLM-5.2', pricing: { prompt: '0.000001', completion: '0.000002' }, context_length: 128000 },
            { id: 'opencode-go/glm-5.1', name: 'GLM-5.1', pricing: { prompt: '0.000001', completion: '0.000002' }, context_length: 128000 },
            { id: 'opencode-go/glm-5', name: 'GLM-5', pricing: { prompt: '0.0000008', completion: '0.0000016' }, context_length: 128000 },
            { id: 'opencode-go/deepseek-v4-pro', name: 'DeepSeek V4 Pro', pricing: { prompt: '0.0000005', completion: '0.000002' }, context_length: 128000 },
            { id: 'opencode-go/deepseek-v4-flash', name: 'DeepSeek V4 Flash', pricing: { prompt: '0.0000001', completion: '0.0000003' }, context_length: 128000 },
            { id: 'opencode-go/qwen3.7-max', name: 'Qwen3.7 Max', pricing: { prompt: '0.0000016', completion: '0.0000064' }, context_length: 128000 },
            { id: 'opencode-go/qwen3.7-plus', name: 'Qwen3.7 Plus', pricing: { prompt: '0.0000008', completion: '0.0000024' }, context_length: 128000 },
            { id: 'opencode-go/qwen3.6-plus', name: 'Qwen3.6 Plus', pricing: { prompt: '0.0000005', completion: '0.0000015' }, context_length: 128000 },
            { id: 'opencode-go/qwen3.5-plus', name: 'Qwen3.5 Plus', pricing: { prompt: '0.0000003', completion: '0.0000009' }, context_length: 128000 },
            { id: 'opencode-go/mimo-v2-pro', name: 'MiMo-V2-Pro', pricing: { prompt: '0.000001', completion: '0.000003' }, context_length: 128000 },
            { id: 'opencode-go/mimo-v2-omni', name: 'MiMo-V2-Omni', pricing: { prompt: '0.0000008', completion: '0.0000024' }, context_length: 128000 },
            { id: 'opencode-go/mimo-v2.5-pro', name: 'MiMo-V2.5-Pro', pricing: { prompt: '0.000001', completion: '0.000003' }, context_length: 128000 },
            { id: 'opencode-go/mimo-v2.5', name: 'MiMo-V2.5', pricing: { prompt: '0.0000006', completion: '0.0000018' }, context_length: 128000 },
            { id: 'opencode-go/hy3', name: 'Hy3', pricing: { prompt: '0.000001', completion: '0.000003' }, context_length: 128000 },
            { id: 'opencode-go/hy3-preview', name: 'Hy3-Preview', pricing: { prompt: '0.0000008', completion: '0.0000024' }, context_length: 128000 },
            { id: 'opencode-go/gpt-5.6-luna', name: 'GPT 5.6 Luna', pricing: { prompt: '0.0000025', completion: '0.000010' }, context_length: 128000 },
            { id: 'opencode-go/grok-4.5', name: 'Grok 4.5', pricing: { prompt: '0.000003', completion: '0.000012' }, context_length: 128000 },

            // Native provider standalone models
            { id: 'x-ai/grok-4.5', name: 'Grok 4.5', pricing: { prompt: '0.000003', completion: '0.000012' }, context_length: 128000 },
            { id: 'openai/gpt-5.6-luna', name: 'GPT 5.6 Luna', pricing: { prompt: '0.0000025', completion: '0.000010' }, context_length: 128000 },
            { id: 'zhipu/glm-5.2', name: 'GLM-5.2', pricing: { prompt: '0.000001', completion: '0.000002' }, context_length: 128000 },
            { id: 'zhipu/glm-5.1', name: 'GLM-5.1', pricing: { prompt: '0.000001', completion: '0.000002' }, context_length: 128000 },
            { id: 'moonshotai/kimi-k3', name: 'Kimi K3', pricing: { prompt: '0.0000012', completion: '0.0000036' }, context_length: 128000 },
            { id: 'moonshotai/kimi-k2.7-code', name: 'Kimi K2.7 Code', pricing: { prompt: '0.000001', completion: '0.000003' }, context_length: 128000 },
            { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6', pricing: { prompt: '0.0000008', completion: '0.0000024' }, context_length: 128000 },
            { id: 'mimo/mimo-v2.5-pro', name: 'MiMo-V2.5-Pro', pricing: { prompt: '0.000001', completion: '0.000003' }, context_length: 128000 },
            { id: 'mimo/mimo-v2.5', name: 'MiMo-V2.5', pricing: { prompt: '0.0000006', completion: '0.0000018' }, context_length: 128000 },
            { id: 'qwen/qwen3.7-max', name: 'Qwen3.7 Max', pricing: { prompt: '0.0000016', completion: '0.0000064' }, context_length: 128000 },
            { id: 'qwen/qwen3.7-plus', name: 'Qwen3.7 Plus', pricing: { prompt: '0.0000008', completion: '0.0000024' }, context_length: 128000 },
            { id: 'qwen/qwen3.6-plus', name: 'Qwen3.6 Plus', pricing: { prompt: '0.0000005', completion: '0.0000015' }, context_length: 128000 },
            { id: 'minimax/minimax-m3', name: 'MiniMax M3', pricing: { prompt: '0.0000008', completion: '0.0000024' }, context_length: 128000 },
            { id: 'minimax/minimax-m2.7', name: 'MiniMax M2.7', pricing: { prompt: '0.0000005', completion: '0.0000015' }, context_length: 128000 },
            { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', pricing: { prompt: '0.0000005', completion: '0.000002' }, context_length: 128000 },
            { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', pricing: { prompt: '0.0000001', completion: '0.0000003' }, context_length: 128000 },
            { id: 'tencent/hy3', name: 'Hy3', pricing: { prompt: '0.000001', completion: '0.000003' }, context_length: 128000 },
            // Z.AI models
            { id: 'zhipu/glm-5', name: 'GLM-5', pricing: { prompt: '0.0000008', completion: '0.0000016' }, context_length: 128000 },
            { id: 'zhipu/glm-4.7', name: 'GLM-4.7', pricing: { prompt: '0.0000006', completion: '0.0000012' }, context_length: 128000 },
            { id: 'zhipu/glm-5-turbo', name: 'GLM-5-Turbo', pricing: { prompt: '0.0000005', completion: '0.000001' }, context_length: 128000 },
            { id: 'zhipu/glm-4.5-air', name: 'GLM-4.5-Air', pricing: { prompt: '0.0000002', completion: '0.0000006' }, context_length: 128000 },
            { id: 'zhipu/glm-4.7-flash', name: 'GLM-4.7-Flash', pricing: { prompt: '0.0000001', completion: '0.0000001' }, context_length: 128000 },
            { id: 'zhipu/glm-asr-2512', name: 'GLM-ASR-2512', pricing: { prompt: '0.0000005', completion: '0.0000005' }, context_length: 128000 },
          ];

          const modelMap = new Map<string, OpenRouterModel>();
          apiModels.forEach(m => {
            if (m && m.id) modelMap.set(m.id, m);
          });
          mockModels.forEach(m => {
            if (m && m.id) modelMap.set(m.id, m);
          });

          // Fetch live Opencode Go models from https://opencode.ai/zen/go/v1/models
          fetch('https://opencode.ai/zen/go/v1/models')
            .then(res => res.json())
            .then(goData => {
              if (goData && Array.isArray(goData.data)) {
                goData.data.forEach((gm: { id: string }) => {
                  if (gm && gm.id) {
                    const fullId = `opencode-go/${gm.id}`;
                    if (!modelMap.has(fullId)) {
                      modelMap.set(fullId, {
                        id: fullId,
                        name: gm.id,
                        pricing: { prompt: '0.000001', completion: '0.000003' },
                        context_length: 128000
                      });
                    }
                  }
                });
                setModels(Array.from(modelMap.values()));
              }
            })
            .catch(() => {
              // Silently fallback to mockModels if offline or CORS blocked
            });

          setModels(Array.from(modelMap.values()));
          setLoading(false);
        } catch (e) {
          console.error("Failed to parse models:", e);
          setLoading(false);
        }
      } else {
        console.error("Failed to fetch models, status:", xhr.status);
        setLoading(false);
      }
    };
    xhr.onerror = (err) => {
      console.error("Failed to fetch models:", err);
      setLoading(false);
    };
    xhr.send();
  }, []);

  const selectedProvider = PROVIDERS.find(p => p.id === selectedProviderId) || PROVIDERS[0];
  const selectedPlan = selectedProvider.plans.find(p => p.cost === planCost) || selectedProvider.plans[0];

  // Update target usage dynamically when selected plan changes
  useEffect(() => {
    if (selectedPlan?.maxTokensPerMonth) {
      setTargetUsageMillions(selectedPlan.maxTokensPerMonth);
    }
  }, [selectedPlan]);

  const providerModels = useMemo(() => {
    const filtered = models.filter(m => m.id.startsWith(selectedProvider.prefix));
    const seen = new Set<string>();
    return filtered.filter(m => {
      if (!m || !m.id || seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [models, selectedProvider]);

  // When provider changes, select the first 3 models by default (or all if < 3)
  useEffect(() => {
    if (providerModels.length > 0) {
      const initialModels = providerModels.slice(0, 3).map(m => m.id);
      setSelectedModelIds(initialModels);
      
      const ratios: Record<string, number> = {};
      const share = Math.floor(100 / initialModels.length);
      initialModels.forEach((id, index) => {
        ratios[id] = index === initialModels.length - 1 ? 100 - (share * (initialModels.length - 1)) : share;
      });
      setModelRatios(ratios);
      if (selectedProvider.plans && selectedProvider.plans.length > 0) {
        setPlanCost(selectedProvider.plans[0].cost);
      } else {
        setPlanCost(0);
      }
    }
  }, [selectedProvider, providerModels]);

  const handleModelToggle = (modelId: string) => {
    setSelectedModelIds(prev => {
      let next = [...prev];
      if (next.includes(modelId)) {
        next = next.filter(id => id !== modelId);
      } else {
        next.push(modelId);
      }
      
      // Redistribute ratios
      const newRatios: Record<string, number> = {};
      if (next.length > 0) {
        const share = Math.floor(100 / next.length);
        next.forEach((id, index) => {
          newRatios[id] = index === next.length - 1 ? 100 - (share * (next.length - 1)) : share;
        });
      }
      setModelRatios(newRatios);
      return next;
    });
  };

  const handleRatioChange = (modelId: string, value: number) => {
    setModelRatios(prev => {
      const next = { ...prev };
      next[modelId] = value;
      // In a real app we'd auto-balance others to sum to 100, but for simplicity
      // let's just let user do it or naively adjust. 
      // Let's implement a naive auto-balance of the *other* models.
      const otherIds = selectedModelIds.filter(id => id !== modelId);
      if (otherIds.length > 0) {
        const remaining = Math.max(0, 100 - value);
        let currentOtherSum = 0;
        otherIds.forEach(id => currentOtherSum += prev[id] || 0);
        
        otherIds.forEach((id, index) => {
          if (currentOtherSum === 0) {
             next[id] = remaining / otherIds.length;
          } else {
             const proportion = (prev[id] || 0) / currentOtherSum;
             next[id] = Math.round(remaining * proportion);
          }
        });
      }
      return next;
    });
  };

  // Calculations
  const calculations = useMemo(() => {
    let totalWeightedCostPer1M = 0;

    selectedModelIds.forEach(modelId => {
      const model = models.find(m => m.id === modelId);
      if (model) {
        const inputCost = parseFloat(model.pricing.prompt) * 1_000_000;
        const outputCost = parseFloat(model.pricing.completion) * 1_000_000;
        const modelCost = (inputCost * (inputOutputRatio / 100)) + (outputCost * ((100 - inputOutputRatio) / 100));
        
        const ratio = (modelRatios[modelId] || 0) / 100;
        totalWeightedCostPer1M += (modelCost * ratio);
      }
    });

    const breakevenTokens = totalWeightedCostPer1M > 0 ? planCost / totalWeightedCostPer1M : 0;
    const apiEquivalentValue = totalWeightedCostPer1M * targetUsageMillions;
    const planMaxOutValue = selectedPlan?.maxTokensPerMonth ? totalWeightedCostPer1M * selectedPlan.maxTokensPerMonth : null;

    return {
      totalWeightedCostPer1M,
      breakevenTokens,
      apiEquivalentValue,
      planMaxOutValue
    };
  }, [selectedModelIds, models, modelRatios, inputOutputRatio, planCost, targetUsageMillions, selectedPlan]);

  const formatNumber = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  };

  const getModelShortName = (id: string) => {
    const parts = id.split('/');
    return parts[parts.length - 1].toUpperCase().replace(/-/g, ' ');
  };

  return (
    <div className="min-h-screen flex flex-col font-sans">
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden lg:overflow-visible">
        {/* Left Sidebar */}
        <aside className="w-full lg:w-96 lg:border-r-3 border-neo-primary flex flex-col bg-neo-bg lg:overflow-y-auto">
          <div className="p-4 md:p-8 border-b-3 border-neo-primary">
             <h1 className="font-display font-bold text-3xl tracking-tight uppercase mb-4">MonoMind AI Lab</h1>
             <h2 className="font-display font-bold text-3xl md:text-4xl uppercase tracking-tighter">LLM Plan Values</h2>
          </div>

          <div className="p-4 md:p-8 border-b-3 border-neo-primary">
            <h3 className="font-bold uppercase flex items-center gap-2 mb-4">
              <span className="w-4 h-4 inline-block border-2 border-neo-primary"></span>
              Provider Selection
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {PROVIDERS.map(p => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProviderId(p.id)}
                  className={`neo-border py-3 px-2 font-bold uppercase text-sm cursor-pointer transition-transform active:translate-y-1 ${selectedProviderId === p.id ? 'bg-neo-yellow neo-shadow' : 'bg-neo-bg neo-shadow-sm hover:bg-gray-100'}`}
                >
                  <span className="notranslate" translate="no">{p.name}</span>
                </button>
              ))}
            </div>
            
            <div className="mt-6 relative">
              <label className="font-bold uppercase text-xs mb-2 block">Monthly Plan</label>
              <select 
                value={planCost}
                onChange={(e) => setPlanCost(Number(e.target.value))}
                className="w-full bg-transparent border-b-3 border-neo-primary outline-none font-display text-lg py-2 cursor-pointer appearance-none pr-8 relative z-10"
              >
                {selectedProvider.plans?.map(plan => (
                  <option key={plan.name} value={plan.cost}>
                    {plan.name} (${plan.cost}/mo)
                  </option>
                ))}
              </select>
              <div className="absolute right-2 bottom-3 pointer-events-none text-neo-primary">
                 <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="square" strokeLinejoin="miter">
                    <path d="M6 9l6 6 6-6"/>
                 </svg>
              </div>
            </div>
          </div>

          <div className="p-4 md:p-8 border-b-3 border-neo-primary">
            <h3 className="font-bold uppercase flex items-center gap-2 mb-4">
              <span className="w-4 h-4 inline-block border-2 border-neo-primary"></span>
              Model Selection
            </h3>
            {loading ? (
              <div className="font-bold animate-pulse">Loading models...</div>
            ) : (
              <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
                {providerModels.map(m => (
                  <label key={m.id} className="flex items-center gap-3 p-3 neo-border bg-white cursor-pointer hover:bg-gray-50">
                    <input 
                      type="checkbox" 
                      className="w-5 h-5 accent-neo-primary cursor-pointer"
                      checked={selectedModelIds.includes(m.id)}
                      onChange={() => handleModelToggle(m.id)}
                    />
                    <span className="font-bold text-sm uppercase truncate notranslate" translate="no">{getModelShortName(m.id)}</span>
                  </label>
                ))}
                {providerModels.length === 0 && (
                  <div className="text-sm font-semibold text-gray-500">No models found for <span className="notranslate" translate="no">{selectedProvider.name}</span>.</div>
                )}
              </div>
            )}
          </div>

          <div className="p-4 md:p-8 border-b-3 border-neo-primary flex-1">
             <h3 className="font-bold uppercase flex items-center gap-2 mb-6">
              <span className="w-4 h-4 inline-block border-2 rounded-full border-neo-primary"></span>
              Estimated Model Mix
            </h3>
            
            {selectedModelIds.length === 0 && (
               <div className="text-sm font-semibold text-gray-500">Select models to set mix.</div>
            )}

            <div className="space-y-6">
              {selectedModelIds.map(id => (
                <div key={id}>
                  <div className="flex justify-between text-xs font-bold uppercase mb-2">
                    <span className="notranslate" translate="no">{getModelShortName(id)}</span>
                    <span>{Math.round(modelRatios[id] || 0)}%</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" max="100" 
                    value={modelRatios[id] || 0}
                    onChange={(e) => handleRatioChange(id, parseInt(e.target.value))}
                    className="w-full appearance-none h-3 bg-neo-primary rounded-none cursor-pointer"
                    style={{
                       background: `linear-gradient(to right, var(--color-neo-yellow) ${modelRatios[id] || 0}%, var(--color-neo-primary) ${modelRatios[id] || 0}%)`
                    }}
                  />
                </div>
              ))}
            </div>
            
            <div className="mt-12 pt-8 border-t-3 border-neo-primary">
              <div className="flex justify-between text-xs font-bold uppercase mb-4">
                <span className="flex items-center gap-2"><span className="w-3 h-3 inline-block bg-neo-primary rounded-full"></span> Input</span>
                <span>{inputOutputRatio}%</span>
              </div>
              <input 
                type="range" 
                min="0" max="100" 
                value={inputOutputRatio}
                onChange={(e) => setInputOutputRatio(parseInt(e.target.value))}
                className="w-full appearance-none h-3 bg-neo-primary rounded-none cursor-pointer"
                style={{
                    background: `linear-gradient(to right, var(--color-neo-yellow) ${inputOutputRatio}%, var(--color-neo-primary) ${inputOutputRatio}%)`
                }}
              />
              <div className="flex justify-between text-xs font-bold uppercase mt-4">
                 <span>Output</span>
                 <span>{100 - inputOutputRatio}%</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 lg:overflow-y-auto bg-neo-bg">
          <div className="p-4 md:p-8 lg:p-12 max-w-6xl mx-auto">
            {/* Top Right Language Selector */}
            <div className="flex justify-end mb-6">
              <div className="flex items-center gap-2 neo-border bg-white px-3 py-2 neo-shadow-sm hover:neo-shadow transition-all">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="square" strokeLinejoin="miter" className="text-neo-primary">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
                <span className="font-bold text-xs uppercase tracking-wider hidden sm:inline">Language:</span>
                <select
                  value={currentLang}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  className="bg-transparent font-bold text-xs sm:text-sm uppercase outline-none cursor-pointer pr-1"
                >
                  {LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name} ({lang.native})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Top Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-12 mb-8 lg:mb-12">
              {/* API Equivalent Value Card */}
              <div className="neo-border bg-neo-yellow p-6 lg:p-8 neo-shadow relative flex flex-col justify-between min-h-[280px] lg:min-h-[320px]">
                <div>
                  <div className="flex flex-col sm:flex-row justify-between items-start mb-6 gap-3">
                    <h3 className="font-bold text-xl uppercase tracking-wider">{planCost > 0 ? "API Equivalent Value" : "Target Usage Retail Cost"}</h3>
                    <span className="bg-neo-primary text-neo-bg text-xs font-bold px-3 py-1 uppercase">Efficiency Metric</span>
                  </div>
                  <div className="font-display font-bold text-5xl sm:text-6xl lg:text-7xl tracking-tighter flex items-baseline gap-2">
                    ${calculations.apiEquivalentValue.toFixed(2)} <span className="text-xl sm:text-2xl font-sans font-bold tracking-normal">/ mo</span>
                  </div>
                </div>
                
                <div className="mt-8 relative z-10">
                  <p className="font-medium text-lg mb-4 max-w-md">
                    Expected retail cost of this target usage volume based on current <span className="notranslate" translate="no">{selectedProvider.name}</span> API market pricing.
                  </p>
                  
                  {planCost > 0 && calculations.planMaxOutValue !== null && (
                    <div className="mb-4 inline-block bg-white px-3 py-2 border-2 border-neo-primary text-sm font-bold shadow-[2px_2px_0px_rgba(0,0,0,1)]">
                      Max-Out Value (at {selectedPlan?.maxTokensPerMonth}M limit): <span className="text-neo-primary">${calculations.planMaxOutValue.toFixed(2)}/mo</span>
                    </div>
                  )}

                  <div className="mt-4">
                    <label className="font-bold text-sm uppercase block mb-2">Target Monthly Usage (Millions of Tokens)</label>
                    <input 
                      type="range" 
                      min="1" 
                      max={Math.max(100, Math.ceil((selectedPlan?.maxTokensPerMonth || 100) * 2))} 
                      step="1"
                      value={targetUsageMillions}
                      onChange={(e) => setTargetUsageMillions(Number(e.target.value))}
                      className="w-full appearance-none h-3 bg-neo-primary rounded-none cursor-pointer"
                    />
                    <div className="text-right font-bold mt-1">{targetUsageMillions}M Tokens</div>
                  </div>
                </div>
              </div>

              {/* Breakeven Point Card */}
              <div className="neo-border bg-neo-red p-6 lg:p-8 neo-shadow relative flex flex-col justify-between text-neo-bg min-h-[280px] lg:min-h-[320px]">
                <div className="absolute top-0 right-0 p-8 pt-9 text-neo-primary font-bold text-sm">
                   {/* Background pattern or subtle text could go here */}
                </div>
                <div>
                  <div className="flex flex-col sm:flex-row justify-between items-start mb-6 gap-3">
                    <h3 className="font-bold text-xl uppercase tracking-wider text-neo-primary">Breakeven Point</h3>
                    <span className="bg-neo-primary text-neo-bg text-xs font-bold px-3 py-1 uppercase border-2 border-neo-primary">Target Usage</span>
                  </div>
                  <div className="font-display font-bold text-5xl sm:text-6xl lg:text-7xl tracking-tighter flex flex-wrap items-baseline gap-2 text-white">
                    {planCost > 0 ? (
                      <>
                        {formatNumber(calculations.breakevenTokens * 1000000)} <span className="text-xl sm:text-2xl font-sans font-bold tracking-normal text-neo-primary">Tokens</span>
                      </>
                    ) : (
                      <span className="text-4xl sm:text-5xl lg:text-6xl text-neo-primary">Pay-As-You-Go</span>
                    )}
                  </div>
                </div>
                
                <div className="mt-8 z-10 text-neo-bg">
                  <p className="font-medium text-lg mb-6 max-w-md text-white">
                    {planCost > 0 
                      ? "The exact monthly usage volume where your subscription cost breaks even against pay-as-you-go API rates."
                      : "Choose a plan below to calculate the breakeven point for your selected subscription."}
                  </p>
                  <div className="flex gap-2">
                    <div className="w-4 h-4 bg-neo-yellow neo-shadow-sm"></div>
                    <div className="w-4 h-4 bg-neo-yellow opacity-75"></div>
                    <div className="w-4 h-4 bg-neo-yellow opacity-50"></div>
                  </div>
                </div>
              </div>
            </div>

            {/* Subscription Plans Section */}
            <div className="mb-8 lg:mb-12">
              <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4 mb-6">
                <div>
                  <h2 className="font-display font-bold text-3xl md:text-4xl uppercase tracking-tight mb-2">
                    <span className="notranslate" translate="no">{selectedProvider.name}</span> Plans
                  </h2>
                  <p className="text-base md:text-lg font-medium text-gray-700">
                    Available subscription tiers. Click a plan to evaluate its breakeven metrics.
                  </p>
                </div>
                {selectedProvider.url && (
                  <a 
                    href={selectedProvider.url.startsWith('http') ? selectedProvider.url : `https://${selectedProvider.url}`}
                    target="_blank"
                    rel="noreferrer"
                    className="neo-border bg-neo-yellow text-neo-primary font-bold text-xs sm:text-sm px-4 py-2.5 uppercase tracking-wider neo-shadow hover:translate-y-[-2px] transition-transform inline-flex items-center gap-2 self-start sm:self-auto"
                  >
                    <span>Pricing Page</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {selectedProvider.plans.map((plan) => {
                  const isSelected = selectedPlan?.name === plan.name && planCost === plan.cost;
                  return (
                    <div
                      key={plan.name}
                      onClick={() => setPlanCost(plan.cost)}
                      className={`neo-border p-5 cursor-pointer transition-all ${
                        isSelected 
                          ? 'bg-neo-yellow neo-shadow ring-2 ring-neo-primary font-bold' 
                          : 'bg-white neo-shadow-sm hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex justify-between items-center mb-3">
                        <span className="font-bold uppercase text-base notranslate" translate="no">{plan.name}</span>
                        {isSelected && (
                          <span className="bg-neo-primary text-neo-bg text-xs font-bold px-2.5 py-1 uppercase tracking-wider">
                            Selected
                          </span>
                        )}
                      </div>
                      <div className="font-display font-bold text-4xl mb-1">
                        {plan.cost === 0 ? 'Free' : `$${plan.cost}`}
                        {plan.cost > 0 && <span className="text-sm font-sans font-bold text-gray-700"> / mo</span>}
                      </div>
                      {plan.maxTokensPerMonth ? (
                        <div className="text-xs font-bold text-gray-600 mt-2">
                          Capacity: ~{plan.maxTokensPerMonth}M Tokens / mo
                        </div>
                      ) : (
                        <div className="text-xs font-medium text-gray-500 mt-2">
                          Standard usage limits
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Table Section */}
            <div className="mb-6 flex flex-col sm:flex-row justify-between sm:items-end gap-4">
              <div>
                <h2 className="font-display font-bold text-3xl md:text-4xl uppercase tracking-tight mb-2">
                  <span className="notranslate" translate="no">OpenRouter</span> API Prices
                </h2>
                <p className="text-base md:text-lg font-medium text-gray-700">
                  Live market rates for <span className="underline decoration-3 decoration-neo-red font-bold text-neo-primary notranslate" translate="no">{selectedProvider.name}</span> models.
                </p>
              </div>
              <a 
                href="https://openrouter.ai/models"
                target="_blank"
                rel="noreferrer"
                className="neo-border bg-neo-yellow text-neo-primary font-bold text-xs sm:text-sm px-4 py-2.5 uppercase tracking-wider neo-shadow hover:translate-y-[-2px] transition-transform inline-flex items-center gap-2 self-start sm:self-auto"
              >
                <span><span className="notranslate" translate="no">OpenRouter</span> Pricing Page</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="square">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>

            <div className="neo-border bg-white overflow-x-auto neo-shadow">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-neo-primary text-neo-bg font-bold uppercase text-sm tracking-wider">
                    <th className="p-4 border-r-3 border-neo-primary">Model Identifier</th>
                    <th className="p-4 border-r-3 border-neo-primary">Input / 1M</th>
                    <th className="p-4 border-r-3 border-neo-primary">Output / 1M</th>
                    <th className="p-4">Context</th>
                  </tr>
                </thead>
                <tbody className="font-medium">
                  {providerModels.map(model => (
                    <tr key={model.id} className="border-b-3 border-neo-primary hover:bg-gray-50 transition-colors">
                      <td className="p-4 border-r-3 border-neo-primary flex items-center gap-3 font-bold">
                         <div className={`w-3 h-3 ${selectedModelIds.includes(model.id) ? 'bg-neo-blue' : 'bg-gray-300'}`}></div>
                         <span className="notranslate" translate="no">{model.id}</span>
                      </td>
                      <td className="p-4 border-r-3 border-neo-primary text-lg">
                        ${(parseFloat(model.pricing.prompt) * 1_000_000).toFixed(2)}
                      </td>
                      <td className="p-4 border-r-3 border-neo-primary text-lg">
                        ${(parseFloat(model.pricing.completion) * 1_000_000).toFixed(2)}
                      </td>
                      <td className="p-4 text-lg font-bold">
                        {formatNumber(model.context_length)}
                      </td>
                    </tr>
                  ))}
                  {providerModels.length === 0 && !loading && (
                    <tr>
                       <td colSpan={4} className="p-8 text-center text-gray-500 font-bold uppercase">No models found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-neo-primary text-neo-bg px-4 md:px-8 py-6 flex flex-col sm:flex-row justify-between items-center gap-4 text-xs md:text-sm font-bold uppercase tracking-widest z-10">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-neo-bg flex items-center justify-center">
             <div className="w-1 h-1 bg-neo-bg rounded-full"></div>
          </div>
          <a href="https://monomind.one" target="_blank" rel="noreferrer" className="hover:text-neo-yellow transition-colors">
            MonoMind AI Lab
          </a>
        </div>
        <div className="text-center sm:text-left">
          © 2026 MonoMind AI Lab.
        </div>
        <div className="flex gap-4 md:gap-8">
          <a href="https://monomind.one" target="_blank" rel="noreferrer" className="hover:text-neo-yellow transition-colors">Visit Monomind.one</a>
        </div>
      </footer>
    </div>
  );
}


window.TB_MODELS=[
{id:'claude-3-5-sonnet',name:'Claude 3.5 Sonnet',provider:'Anthropic',color:'#c27d60',access:'Proprietary',cost:6,inputPrice:3,outputPrice:15,cacheRead:.3,cacheWrite:3.75,maxOutput:'8k',ttft:.42,tps:82,context:'200k',released:'2024-06-20',lifecycle:'Current',sunset:null,modalities:'Text · Vision',agentic:92,coding:94,reasoning:90,math:88,multimodal:89,throughput:82},
{id:'deepseek-v3',name:'DeepSeek V3',provider:'DeepSeek',color:'#2563eb',access:'Open weights',cost:.48,inputPrice:.27,outputPrice:1.1,cacheRead:.07,cacheWrite:null,maxOutput:'8k',ttft:.55,tps:65,context:'128k',released:'2025-12-26',lifecycle:'Current',sunset:null,modalities:'Text',agentic:87,coding:92,reasoning:89,math:89,multimodal:75,throughput:65},
{id:'deepseek-r1',name:'DeepSeek R1',provider:'DeepSeek',color:'#2563eb',access:'Open weights',cost:1.0,inputPrice:.55,outputPrice:2.19,cacheRead:.14,cacheWrite:null,maxOutput:'16k',ttft:.95,tps:48,context:'128k',released:'2026-01-20',lifecycle:'Current',sunset:null,modalities:'Text',agentic:89,coding:95,reasoning:96,math:97,multimodal:72,throughput:48},
{id:'gpt-4o',name:'GPT-4o',provider:'OpenAI',color:'#404040',access:'Proprietary',cost:4.38,inputPrice:2.5,outputPrice:10,cacheRead:1.25,cacheWrite:null,maxOutput:'16k',ttft:.38,tps:105,context:'128k',released:'2024-05-13',lifecycle:'Current',sunset:null,modalities:'Text · Vision · Audio',agentic:89,coding:90,reasoning:89,math:88,multimodal:92,throughput:105},
{id:'gemini-1-5-pro',name:'Gemini 1.5 Pro',provider:'Google',color:'#10b981',access:'Proprietary',cost:2.19,inputPrice:1.25,outputPrice:5,cacheRead:.31,cacheWrite:null,maxOutput:'8k',ttft:.62,tps:78,context:'2m',released:'2024-02-15',lifecycle:'Current',sunset:'Not reported',modalities:'Text · Vision · Audio',agentic:85,coding:87,reasoning:88,math:86,multimodal:93,throughput:78},
{id:'llama-3-3-70b',name:'Llama 3.3 70B',provider:'Meta',color:'#0284c7',access:'Open weights',cost:.36,inputPrice:.3,outputPrice:.4,cacheRead:null,cacheWrite:null,maxOutput:'8k',ttft:.31,tps:110,context:'128k',released:'2024-12-06',lifecycle:'Current',sunset:null,modalities:'Text',agentic:81,coding:84,reasoning:84,math:81,multimodal:50,throughput:110}
];

window.TB_LIFECYCLE=[
{id:'gpt-4-turbo',name:'GPT-4 Turbo',provider:'OpenAI',status:'Retirement scheduled',announced:'2026-06-15',sunset:'2026-09-30',replacementId:'gpt-4o',replacement:'GPT-4o',costDelta:'75% lower fixture cost',speedDelta:'2.8× faster fixture speed',source:'Provider retirement notice · staging fixture',observed:'2026-08-15'},
{id:'claude-3-opus',name:'Claude 3 Opus',provider:'Anthropic',status:'Retirement scheduled',announced:'2026-08-08',sunset:'2026-11-15',replacementId:'claude-3-5-sonnet',replacement:'Claude 3.5 Sonnet',costDelta:'80% lower fixture cost',speedDelta:'2.5× faster fixture speed',source:'Provider retirement notice · staging fixture',observed:'2026-08-15'}
];

window.TB_RELEASES=[
{id:'deepseek-r1',name:'DeepSeek R1',date:'2026-01-20',summary:'Reasoning milestone with open weights.',source:'Release record · staging fixture'},
{id:'deepseek-v3',name:'DeepSeek V3',date:'2025-12-26',summary:'Mixture-of-experts release used in the proof dataset.',source:'Release record · staging fixture'},
{id:'gpt-4o',name:'GPT-4o',date:'2024-05-13',summary:'Multimodal replacement target in the retirement sample.',source:'Release record · staging fixture'}
];

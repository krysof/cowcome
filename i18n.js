import zhHans from './locales/zh-Hans.json';
import zhHant from './locales/zh-Hant.json';
import yue from './locales/yue-Hant-HK.json';
import en from './locales/en.json';
import ja from './locales/ja.json';
import ko from './locales/ko.json';

export const LANGUAGE_STORAGE_KEY='niulai-language';
export const locales={
  'en':{nativeName:'English',htmlLang:'en',messages:en},
  'ja':{nativeName:'日本語',htmlLang:'ja',messages:ja},
  'zh-Hans':{nativeName:'简体中文',htmlLang:'zh-Hans',messages:zhHans},
  'zh-Hant':{nativeName:'繁體中文',htmlLang:'zh-Hant',messages:zhHant},
  'yue-Hant-HK':{nativeName:'粵語',htmlLang:'yue-Hant-HK',messages:yue},
  'ko':{nativeName:'한국어',htmlLang:'ko',messages:ko}
};
export const languageOrder=['en','ja','yue-Hant-HK','zh-Hant','zh-Hans','ko'];
const fallback='zh-Hans';
export function matchLocale(languages=navigator.languages?.length?navigator.languages:[navigator.language]){
  for(const raw of languages||[]){const tag=String(raw||'').replace('_','-'),low=tag.toLowerCase();if(low==='en'||low.startsWith('en-'))return'en';if(low==='ja'||low.startsWith('ja-'))return'ja';if(low==='ko'||low.startsWith('ko-'))return'ko';if(low.startsWith('yue'))return'yue-Hant-HK';if(low.startsWith('zh')){if(/hant|tw|hk|mo/.test(low))return'zh-Hant';if(/hans|cn|sg/.test(low))return'zh-Hans';return fallback;}}
  return fallback;
}
export function getLanguageChoice(){let saved;try{saved=localStorage.getItem(LANGUAGE_STORAGE_KEY);}catch{}return saved==='auto'||locales[saved]?saved:'auto';}
export function getResolvedLocale(choice=getLanguageChoice()){return choice==='auto'?matchLocale():locales[choice]?choice:fallback;}
let choice=getLanguageChoice(),locale=getResolvedLocale(choice);
export function t(key,params={}){const template=locales[locale]?.messages[key]??locales[fallback].messages[key]??'';return String(template).replace(/\{(\w+)\}/g,(_,name)=>params[name]??'');}
export function translateDOM(root=document){document.documentElement.lang=locales[locale].htmlLang;document.documentElement.style.setProperty('--title-cry',`"${t('title.cry')}"`);document.title=t('meta.title');root.querySelectorAll('[data-i18n]').forEach(el=>el.textContent=t(el.dataset.i18n));root.querySelectorAll('[data-i18n-html]').forEach(el=>el.innerHTML=t(el.dataset.i18nHtml));root.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));root.querySelectorAll('[data-i18n-alt]').forEach(el=>el.setAttribute('alt',t(el.dataset.i18nAlt)));}
export function setLanguage(next){choice=next==='auto'||locales[next]?next:'auto';try{localStorage.setItem(LANGUAGE_STORAGE_KEY,choice);}catch{}locale=getResolvedLocale(choice);translateDOM();dispatchEvent(new CustomEvent('niulai:languagechange',{detail:{choice,locale}}));}
export function currentLanguage(){return{choice,locale};}
export function initI18n(){translateDOM();return currentLanguage();}
addEventListener('languagechange',()=>{if(choice==='auto')setLanguage('auto');});

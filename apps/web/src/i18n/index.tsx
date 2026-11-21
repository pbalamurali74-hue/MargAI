import React, { createContext, useContext, useMemo } from 'react';
import hi from './locales/hi.json';
import ta from './locales/ta.json';
import te from './locales/te.json';
import kn from './locales/kn.json';
import mr from './locales/mr.json';
import bn from './locales/bn.json';
export const UI_LANGUAGES = [
  {code:'en',nativeName:'English'}, {code:'hi',nativeName:'हिन्दी'}, {code:'ta',nativeName:'தமிழ்'},
  {code:'te',nativeName:'తెలుగు'}, {code:'kn',nativeName:'ಕನ್ನಡ'}, {code:'mr',nativeName:'मराठी'}, {code:'bn',nativeName:'বাংলা'},
] as const;
export type UiLanguage = typeof UI_LANGUAGES[number]['code'];
type Params = Record<string,string|number>;
export type Translate = (source:string,params?:Params)=>string;
const translations:Record<string,Record<string,string>> = {hi,ta,te,kn,mr,bn};
export const isUiLanguage = (value:string):value is UiLanguage => UI_LANGUAGES.some(item=>item.code===value);
export function translate(language:string,source:string,params?:Params):string {
  const translated = language==='en' ? source : translations[language]?.[source] || source;
  return params ? translated.replace(/\{(\w+)\}/g,(match,key)=>Object.hasOwn(params,key)?String(params[key]):match) : translated;
}
const I18nContext=createContext<{language:string;t:Translate}>({language:'en',t:source=>source});
export function I18nProvider({language,children}:{language:string;children:React.ReactNode}){
  const value=useMemo(()=>({language,t:(source:string,params?:Params)=>translate(language,source,params)}),[language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
export const useI18n=()=>useContext(I18nContext);

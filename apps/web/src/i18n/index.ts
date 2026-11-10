import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import zh from "./zh-CN.json";

const LANG_KEY = "quantlab_lang";

export function getSavedLang(): "en" | "zh-CN" {
  const v = localStorage.getItem(LANG_KEY);
  return v === "zh-CN" ? "zh-CN" : "en";
}

export function setSavedLang(lang: "en" | "zh-CN") {
  localStorage.setItem(LANG_KEY, lang);
  document.documentElement.lang = lang === "zh-CN" ? "zh-CN" : "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "zh-CN": { translation: zh },
  },
  lng: getSavedLang(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

setSavedLang(getSavedLang());

export default i18n;

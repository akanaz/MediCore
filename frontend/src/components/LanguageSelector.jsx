import React from "react";
import { useTranslation } from "react-i18next";

const LanguageSelector = ({ selectedLanguage, onLanguageChange }) => {
  const { i18n } = useTranslation();

  const languages = [
    { code: "en", nativeName: "English", flag: "🇬🇧" },
    { code: "hi", nativeName: "हिंदी", flag: "🇮🇳" },
    { code: "te", nativeName: "తెలుగు", flag: "🇮🇳" },
    { code: "ta", nativeName: "தமிழ்", flag: "🇮🇳" },
    { code: "kn", nativeName: "ಕನ್ನಡ", flag: "🇮🇳" },
    { code: "ml", nativeName: "മലയാളം", flag: "🇮🇳" },
  ];

  const handleChange = (code) => {
    i18n.changeLanguage(code);
    onLanguageChange(code);
  };

  return (
    <div className="language-selector">
      <span className="language-label">🌐</span>
      <select
        className="language-dropdown"
        value={selectedLanguage}
        onChange={(e) => handleChange(e.target.value)}
        aria-label="Select language"
        title="Select your language for both text and voice"
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.flag} {lang.nativeName}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LanguageSelector;

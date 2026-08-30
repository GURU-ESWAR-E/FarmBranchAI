/**
 * FarmBranch Multilingual & i18n Engine
 * Supports: en (English), hi (Hindi), ta (Tamil), mr (Marathi), te (Telugu)
 */

const FB_I18N = {
  currentLang: 'en',
  translations: {},

  async init() {
    try {
      const response = await fetch('/static/data/translations.json');
      this.translations = await response.json();
    } catch (e) {
      console.error('Failed to load translations:', e);
      this.translations = {};
    }

    const savedLang = localStorage.getItem('fb_lang');
    if (!savedLang) {
      // First-time visit: Display forced language selector modal
      this.showFirstTimeModal();
    } else {
      this.setLanguage(savedLang, false);
    }

    this.setupDropdownListener();
  },

  setLanguage(langCode, save = true) {
    if (!this.translations[langCode]) {
      langCode = 'en';
    }
    this.currentLang = langCode;
    if (save) {
      localStorage.setItem('fb_lang', langCode);
    }

    // Update document title and elements
    this.applyTranslations();
    this.updateDropdownUI(langCode);
  },

  t(key, defaultVal = '') {
    if (this.translations[this.currentLang] && this.translations[this.currentLang][key]) {
      return this.translations[this.currentLang][key];
    }
    if (this.translations['en'] && this.translations['en'][key]) {
      return this.translations['en'][key];
    }
    return defaultVal || key;
  },

  applyTranslations() {
    const dict = this.translations[this.currentLang] || this.translations['en'] || {};

    // Translate text content
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (dict[key]) {
        el.textContent = dict[key];
      }
    });

    // Translate HTML content (for badges/icons with markup)
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      if (dict[key]) {
        el.innerHTML = dict[key];
      }
    });

    // Translate placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (dict[key]) {
        el.setAttribute('placeholder', dict[key]);
      }
    });

    // Translate title attributes
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      if (dict[key]) {
        el.setAttribute('title', dict[key]);
      }
    });
  },

  showFirstTimeModal() {
    const modal = document.getElementById('firstTimeLangModal');
    if (modal) {
      modal.classList.add('active');
    }
  },

  closeFirstTimeModal() {
    const modal = document.getElementById('firstTimeLangModal');
    if (modal) {
      modal.classList.remove('active');
    }
  },

  saveFirstTimeSelection(selectedLang) {
    this.setLanguage(selectedLang, true);
    this.closeFirstTimeModal();
  },

  setupDropdownListener() {
    const toggleBtn = document.getElementById('langDropdownBtn');
    const menu = document.getElementById('langDropdownMenu');

    if (toggleBtn && menu) {
      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('show');
      });

      document.addEventListener('click', () => {
        menu.classList.remove('show');
      });

      menu.querySelectorAll('.lang-option').forEach(opt => {
        opt.addEventListener('click', () => {
          const lang = opt.getAttribute('data-lang');
          if (lang) {
            this.setLanguage(lang, true);
          }
          menu.classList.remove('show');
        });
      });
    }
  },

  updateDropdownUI(langCode) {
    const label = document.getElementById('currentLangLabel');
    const langNames = {
      en: 'English',
      hi: 'हिन्दी',
      ta: 'தமிழ்',
      mr: 'मराठी',
      te: 'తెలుగు'
    };
    if (label) {
      label.textContent = langNames[langCode] || 'English';
    }

    document.querySelectorAll('.lang-option').forEach(opt => {
      if (opt.getAttribute('data-lang') === langCode) {
        opt.classList.add('selected');
      } else {
        opt.classList.remove('selected');
      }
    });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  FB_I18N.init();
});

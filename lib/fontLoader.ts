// ─────────────────────────────────────────────────
// Font Loader for Multilingual PDF Generation
// Maps language codes to Unicode font files (Noto Sans family)
// and loads them into jsPDF via VFS.
//
// Bundled fonts: Arabic, Devanagari, Bengali, Tamil, Telugu, Thai,
//                Latin+Cyrillic+Greek, Hebrew  (~1.5MB total)
// CJK fonts:     Fetched from CDN on first use (5-10MB each)
// ─────────────────────────────────────────────────

import jsPDF from 'jspdf'
import fs from 'fs'
import path from 'path'

// ── Language → Script Mapping ────────────────────

const LANG_TO_SCRIPT: Record<string, string> = {
  // Latin-based (helvetica works fine)
  'en': 'latin', 'es': 'latin', 'fr': 'latin', 'de': 'latin',
  'pt': 'latin', 'it': 'latin', 'nl': 'latin', 'pl': 'latin',
  'ro': 'latin', 'cs': 'latin', 'vi': 'latin', 'ms': 'latin',
  'id': 'latin', 'sw': 'latin', 'tr': 'latin', 'sv': 'latin',
  'da': 'latin', 'no': 'latin', 'fi': 'latin', 'hu': 'latin',
  'sk': 'latin', 'hr': 'latin', 'sl': 'latin', 'et': 'latin',
  'lv': 'latin', 'lt': 'latin', 'ca': 'latin', 'eu': 'latin',
  'gl': 'latin', 'af': 'latin', 'sq': 'latin', 'mt': 'latin',
  'cy': 'latin', 'ga': 'latin', 'tl': 'latin', 'ht': 'latin',

  // Arabic script (RTL)
  'ar': 'arabic', 'ur': 'arabic', 'fa': 'arabic', 'ps': 'arabic',
  'ku': 'arabic', 'sd': 'arabic',

  // Devanagari
  'hi': 'devanagari', 'mr': 'devanagari', 'ne': 'devanagari',
  'sa': 'devanagari',

  // Bengali
  'bn': 'bengali', 'as': 'bengali',

  // Tamil
  'ta': 'tamil',

  // Telugu
  'te': 'telugu',

  // Thai
  'th': 'thai',

  // CJK
  'zh': 'cjk-sc',
  'ja': 'cjk-jp',
  'ko': 'cjk-kr',

  // Cyrillic
  'ru': 'cyrillic', 'uk': 'cyrillic', 'bg': 'cyrillic',
  'sr': 'cyrillic', 'mk': 'cyrillic', 'be': 'cyrillic',
  'kk': 'cyrillic', 'mn': 'cyrillic',

  // Greek
  'el': 'greek',

  // Hebrew (RTL)
  'he': 'hebrew', 'yi': 'hebrew',
}

// ── Font Info ────────────────────────────────────

interface FontInfo {
  fileName: string
  fontName: string
  source: 'bundled' | 'cdn'
  cdnUrl?: string
  rtl: boolean
}

const SCRIPT_FONTS: Record<string, FontInfo> = {
  'latin': {
    fileName: '',
    fontName: 'helvetica',
    source: 'bundled',
    rtl: false,
  },
  'arabic': {
    fileName: 'NotoSansArabic-Regular.ttf',
    fontName: 'NotoSansArabic',
    source: 'bundled',
    rtl: true,
  },
  'devanagari': {
    fileName: 'NotoSansDevanagari-Regular.ttf',
    fontName: 'NotoSansDevanagari',
    source: 'bundled',
    rtl: false,
  },
  'bengali': {
    fileName: 'NotoSansBengali-Regular.ttf',
    fontName: 'NotoSansBengali',
    source: 'bundled',
    rtl: false,
  },
  'tamil': {
    fileName: 'NotoSansTamil-Regular.ttf',
    fontName: 'NotoSansTamil',
    source: 'bundled',
    rtl: false,
  },
  'telugu': {
    fileName: 'NotoSansTelugu-Regular.ttf',
    fontName: 'NotoSansTelugu',
    source: 'bundled',
    rtl: false,
  },
  'thai': {
    fileName: 'NotoSansThai-Regular.ttf',
    fontName: 'NotoSansThai',
    source: 'bundled',
    rtl: false,
  },
  'cyrillic': {
    fileName: 'NotoSans-Regular.ttf',
    fontName: 'NotoSans',
    source: 'bundled',
    rtl: false,
  },
  'greek': {
    fileName: 'NotoSans-Regular.ttf',
    fontName: 'NotoSans',
    source: 'bundled',
    rtl: false,
  },
  'hebrew': {
    fileName: 'NotoSansHebrew-Regular.ttf',
    fontName: 'NotoSansHebrew',
    source: 'bundled',
    rtl: true,
  },
  'cjk-sc': {
    fileName: 'NotoSansSC-Regular.otf',
    fontName: 'NotoSansSC',
    source: 'cdn',
    cdnUrl: 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/SimplifiedChinese/NotoSansSC-Regular.otf',
    rtl: false,
  },
  'cjk-jp': {
    fileName: 'NotoSansJP-Regular.otf',
    fontName: 'NotoSansJP',
    source: 'cdn',
    cdnUrl: 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/Japanese/NotoSansJP-Regular.otf',
    rtl: false,
  },
  'cjk-kr': {
    fileName: 'NotoSansKR-Regular.otf',
    fontName: 'NotoSansKR',
    source: 'cdn',
    cdnUrl: 'https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@main/Sans/OTF/Korean/NotoSansKR-Regular.otf',
    rtl: false,
  },
}

// ── In-Memory Font Cache ─────────────────────────

const fontCache = new Map<string, string>() // script → base64 font data

// ── Public API ───────────────────────────────────

export function getScriptForLanguage(langCode: string): string {
  return LANG_TO_SCRIPT[langCode] || 'latin'
}

export function isRtlLanguage(langCode: string): boolean {
  const script = getScriptForLanguage(langCode)
  return SCRIPT_FONTS[script]?.rtl ?? false
}

export function needsCustomFont(langCode: string): boolean {
  const script = getScriptForLanguage(langCode)
  return script !== 'latin'
}

/**
 * Load and register the appropriate Unicode font into a jsPDF instance.
 * Returns the font name to use with pdf.setFont().
 * For Latin-script languages, returns 'helvetica' (no extra loading needed).
 */
export async function loadFontForLanguage(
  pdf: jsPDF,
  langCode: string
): Promise<string> {
  const script = getScriptForLanguage(langCode)
  const fontInfo = SCRIPT_FONTS[script]

  if (!fontInfo || script === 'latin') {
    return 'helvetica'
  }

  // Check cache
  let fontBase64 = fontCache.get(script)

  if (!fontBase64) {
    if (fontInfo.source === 'bundled') {
      // Read from local fonts directory
      const fontPath = path.join(process.cwd(), 'public', 'fonts', fontInfo.fileName)
      try {
        const fontBuffer = fs.readFileSync(fontPath)
        fontBase64 = fontBuffer.toString('base64')
        console.log(`[FontLoader] Loaded bundled font: ${fontInfo.fileName} (${(fontBuffer.length / 1024).toFixed(0)}KB)`)
      } catch (err) {
        console.error(`[FontLoader] Failed to read bundled font ${fontInfo.fileName}:`, err)
        return 'helvetica'
      }
    } else if (fontInfo.source === 'cdn' && fontInfo.cdnUrl) {
      // Fetch from CDN (CJK fonts)
      console.log(`[FontLoader] Fetching CJK font from CDN: ${fontInfo.fontName}...`)
      try {
        const response = await fetch(fontInfo.cdnUrl)
        if (!response.ok) {
          throw new Error(`CDN fetch failed: ${response.status}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        fontBase64 = Buffer.from(arrayBuffer).toString('base64')
        console.log(`[FontLoader] Fetched CJK font: ${fontInfo.fontName} (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(1)}MB)`)
      } catch (err) {
        console.error(`[FontLoader] Failed to fetch CJK font ${fontInfo.fontName}:`, err)
        return 'helvetica'
      }
    } else {
      console.warn(`[FontLoader] No font source for script "${script}", falling back to helvetica`)
      return 'helvetica'
    }

    // Cache it
    fontCache.set(script, fontBase64)
  }

  // Register font in jsPDF via VFS
  pdf.addFileToVFS(fontInfo.fileName, fontBase64)
  pdf.addFont(fontInfo.fileName, fontInfo.fontName, 'normal')

  return fontInfo.fontName
}

// ── RTL Text Preprocessing ──────────────────────

/**
 * Preprocess text for PDF rendering in RTL languages.
 * For Arabic script: reshapes connected letters, then reverses for jsPDF's LTR renderer.
 * For Hebrew: reverses character order.
 * For LTR languages: returns text unchanged.
 */
export function preprocessTextForPdf(text: string, langCode: string): string {
  if (!isRtlLanguage(langCode)) return text

  const script = getScriptForLanguage(langCode)

  if (script === 'arabic') {
    try {
      // arabic-reshaper connects Arabic letters properly
      const { convertArabic } = require('arabic-reshaper')
      const reshaped = convertArabic(text)
      // Reverse for jsPDF's LTR rendering engine
      // Process line by line to preserve line structure
      return reshaped
        .split('\n')
        .map((line: string) => line.split('').reverse().join(''))
        .join('\n')
    } catch (err) {
      console.error('[FontLoader] Arabic reshaping failed, using raw text:', err)
      return text
    }
  }

  if (script === 'hebrew') {
    // Hebrew doesn't need reshaping but needs character reversal for jsPDF
    return text
      .split('\n')
      .map(line => line.split('').reverse().join(''))
      .join('\n')
  }

  return text
}

// ── Whisper Language Name → ISO Code ─────────────

/**
 * Map Whisper's full language names to ISO 639-1 codes.
 * Whisper returns language names like "english", "arabic", "chinese", etc.
 */
export const WHISPER_LANG_TO_CODE: Record<string, string> = {
  'english': 'en', 'spanish': 'es', 'french': 'fr', 'german': 'de',
  'italian': 'it', 'portuguese': 'pt', 'dutch': 'nl', 'russian': 'ru',
  'chinese': 'zh', 'japanese': 'ja', 'korean': 'ko',
  'arabic': 'ar', 'hindi': 'hi', 'urdu': 'ur', 'persian': 'fa',
  'bengali': 'bn', 'tamil': 'ta', 'telugu': 'te', 'thai': 'th',
  'turkish': 'tr', 'polish': 'pl', 'ukrainian': 'uk', 'greek': 'el',
  'hebrew': 'he', 'romanian': 'ro', 'czech': 'cs', 'hungarian': 'hu',
  'swedish': 'sv', 'danish': 'da', 'norwegian': 'no', 'finnish': 'fi',
  'indonesian': 'id', 'malay': 'ms', 'vietnamese': 'vi', 'swahili': 'sw',
  'afrikaans': 'af', 'catalan': 'ca', 'croatian': 'hr', 'slovak': 'sk',
  'slovenian': 'sl', 'serbian': 'sr', 'bulgarian': 'bg', 'macedonian': 'mk',
  'latvian': 'lv', 'lithuanian': 'lt', 'estonian': 'et', 'maltese': 'mt',
  'welsh': 'cy', 'irish': 'ga', 'tagalog': 'tl', 'nepali': 'ne',
  'marathi': 'mr', 'punjabi': 'pa', 'gujarati': 'gu', 'kannada': 'kn',
  'malayalam': 'ml', 'sinhala': 'si', 'burmese': 'my', 'khmer': 'km',
  'lao': 'lo', 'tibetan': 'bo', 'pashto': 'ps', 'kurdish': 'ku',
  'azerbaijani': 'az', 'uzbek': 'uz', 'kazakh': 'kk', 'mongolian': 'mn',
  'haitian creole': 'ht', 'yiddish': 'yi', 'somali': 'so', 'amharic': 'am',
}

/**
 * Get the display name for a language code.
 * Used in the story generation prompt.
 */
export function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    'ar': 'Arabic', 'hi': 'Hindi', 'ur': 'Urdu', 'fa': 'Persian',
    'zh': 'Chinese (Simplified)', 'ja': 'Japanese', 'ko': 'Korean',
    'es': 'Spanish', 'fr': 'French', 'de': 'German', 'pt': 'Portuguese',
    'it': 'Italian', 'nl': 'Dutch', 'ru': 'Russian', 'uk': 'Ukrainian',
    'pl': 'Polish', 'cs': 'Czech', 'hu': 'Hungarian', 'ro': 'Romanian',
    'sv': 'Swedish', 'da': 'Danish', 'no': 'Norwegian', 'fi': 'Finnish',
    'el': 'Greek', 'he': 'Hebrew', 'tr': 'Turkish',
    'bn': 'Bengali', 'ta': 'Tamil', 'te': 'Telugu', 'th': 'Thai',
    'id': 'Indonesian', 'ms': 'Malay', 'vi': 'Vietnamese', 'sw': 'Swahili',
    'mr': 'Marathi', 'ne': 'Nepali', 'pa': 'Punjabi', 'gu': 'Gujarati',
    'kn': 'Kannada', 'ml': 'Malayalam', 'si': 'Sinhala', 'my': 'Burmese',
    'af': 'Afrikaans', 'sq': 'Albanian', 'hr': 'Croatian', 'sk': 'Slovak',
    'bg': 'Bulgarian', 'sr': 'Serbian', 'mk': 'Macedonian',
  }
  return names[code] || 'the detected language'
}

export const DEFAULT_TEMPLATE_ID = 'lucent-standard-salon';

export const SITE_TEMPLATES = [
  {
    id: 'lucent-standard-salon',
    name: 'LUCENT Standard Salon',
    shortName: 'LUCENT',
    active: true,
    category: 'standard',
    target: '幅広い美容室・初回制作・王道構成を求める店舗',
    colorMood: '白黒ベース・上品・信頼感',
    layout: '写真、スタッフ、メニュー、口コミ、アクセスを標準的に見せる王道型',
    salesPoint: 'まず失敗しにくい標準サイトとして提案しやすい。',
    demoPath: '',
    tags: ['王道', '上品', '標準構成'],
    replaceableFields: ['salonName', 'heroCopy', 'menus', 'staff', 'reviews', 'address', 'phone', 'hours', 'reservationUrl'],
  },
  {
    id: 'aura-editorial-salon',
    name: 'AURA Editorial Salon',
    shortName: 'AURA',
    active: true,
    category: 'editorial',
    target: '世界観や写真の質で選ばれたいサロン',
    colorMood: '余白・写真主役・編集感',
    layout: '固定サイドレール、ギャラリー、日記、カレンダーで雰囲気を伝える編集型',
    salesPoint: 'ブランドの空気感を重視する店舗に提案しやすい。',
    demoPath: '',
    tags: ['編集型', '写真重視', '世界観'],
    replaceableFields: ['salonName', 'gallery', 'diary', 'calendar', 'address', 'phone', 'hours', 'reservationUrl'],
  },
  {
    id: 'airy-clean-salon',
    name: 'AIRY Clean Salon',
    shortName: 'AIRY',
    active: true,
    category: 'lp',
    target: '明るさ、清潔感、説明量を重視するサロン',
    colorMood: '白基調・清潔・明るい',
    layout: '料金、Before / After、口コミ、予約、FAQまで整理して見せるロングLP型',
    salesPoint: '情報をしっかり読みたい来店前ユーザーに向いている。',
    demoPath: '',
    tags: ['清潔感', 'LP', '情報整理'],
    replaceableFields: ['salonName', 'beforeAfter', 'menus', 'reviews', 'faq', 'address', 'phone', 'hours', 'reservationUrl'],
  },
  {
    id: 'color-pop-salon',
    name: 'COLOR POP Salon',
    shortName: 'COLOR POP',
    active: true,
    category: 'pop',
    target: 'ハイトーン、ブリーチ、若年層、SNS導線を強めたいサロン',
    colorMood: '鮮やか・個性的・勢い',
    layout: '強いCTAとSNS導線で個性を出すポップ型',
    salesPoint: '他店と違う印象を一瞬で出したい店舗に向いている。',
    demoPath: '',
    tags: ['ポップ', 'SNS', 'ハイトーン'],
    replaceableFields: ['salonName', 'colorMenu', 'snsUrl', 'gallery', 'address', 'phone', 'hours', 'reservationUrl'],
  },
  {
    id: 'refined-minimal-salon',
    name: 'REFINED Minimal Salon',
    shortName: 'REFINED',
    active: true,
    category: 'premium',
    target: '高単価、髪質改善、大人女性向けの落ち着いたサロン',
    colorMood: 'トープ・上質・ミニマル',
    layout: '端正な料金表と落ち着いた予約導線で見せる高単価型',
    salesPoint: '価格より品質で選ばれたいサロンに提案しやすい。',
    demoPath: '',
    tags: ['高単価', '髪質改善', 'ミニマル'],
    replaceableFields: ['salonName', 'treatmentMenu', 'priceTable', 'staff', 'address', 'phone', 'hours', 'reservationUrl'],
  },
  {
    id: 'calm-journey-salon',
    name: 'CALM Journey Salon',
    shortName: 'CALM',
    active: true,
    category: 'consultation',
    target: '初めての美容室選びに慎重な30〜60代、家族利用、メンズ、白髪・頭皮・似合わせ相談層',
    colorMood: 'ウォームグリーン・クリーム・テラコッタ・安心感',
    layout: '来店前の不安を、相談ステップ、悩み別メニュー、FAQ、アクセスで順番に解消する導線型',
    salesPoint: '新規予約前の迷いを減らし、相談予約につなげやすい。営業デモでも既存5案と第一印象が被らない。',
    demoPath: '/templates/salon/calm-journey/',
    previewImage: '',
    tags: ['初めての方へ', '相談導線', '家族利用', '白髪相談', 'メンズ対応'],
    replaceableFields: ['salonName', 'heroCopy', 'consultationMessage', 'menus', 'staff', 'reviews', 'address', 'phone', 'hours', 'reservationUrl', 'lineUrl', 'mapUrl'],
    files: [
      'templates/salon/calm-journey/index.html',
      'templates/salon/calm-journey/css/style.css',
      'templates/salon/calm-journey/js/main.js',
    ],
  },
];

export const ACTIVE_TEMPLATE_IDS = SITE_TEMPLATES.filter((template) => template.active).map((template) => template.id);

export function getTemplateById(id) {
  return SITE_TEMPLATES.find((template) => template.id === id) || null;
}

export function getActiveTemplates() {
  return SITE_TEMPLATES.filter((template) => template.active);
}

export function isActiveTemplateId(id) {
  return ACTIVE_TEMPLATE_IDS.includes(id);
}

if (typeof window !== 'undefined') {
  window.SiteVibeTemplates = {
    DEFAULT_TEMPLATE_ID,
    SITE_TEMPLATES,
    ACTIVE_TEMPLATE_IDS,
    getTemplateById,
    getActiveTemplates,
    isActiveTemplateId,
  };
}

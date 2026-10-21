// editor-access-check: Serafima
/* Единственное место настройки контактов, цен и новых фотографий.
   Файлы фотографий и дипломов размещайте в site/assets/.
   Порядок элементов certificates — порядок документов на странице. */
window.SITE_CONFIG = {
  reviewMode: true,
  prices: {onlineRub: '4 000 ₽', onlineEur: '40 €', offlineRub: '4 600 ₽'},
  telegram: 'https://t.me/Serafima99',
  whatsapp: 'https://wa.me/79213774041',
  phone: '+79213774041',
  phoneDisplay: '+7 921 377-40-41',
  email: 'dem.serafima@yandex.com',
  instagram: 'https://www.instagram.com/sdjomina/',
  heroPhoto: 'assets/serafima-hero.jpg',
  aboutPhoto: 'assets/serafima-about.jpg',
  certificates: [
    {src: 'assets/diploma-01.jpg', previewSrcset: 'assets/diploma-01-480.webp 480w, assets/diploma-01-960.webp 960w', width: 1447, height: 1029, alt: 'Диплом магистра психологии — НИУ ВШЭ, 2024'},
    {src: 'assets/diploma-02.jpg', previewSrcset: 'assets/diploma-02-480.webp 480w, assets/diploma-02-960.webp 960w', width: 1054, height: 1492, alt: 'Сертификат GLE International, 2024'},
    {src: 'assets/diploma-03.jpg', previewSrcset: 'assets/diploma-03-480.webp 480w, assets/diploma-03-960.webp 960w', width: 1403, height: 998, alt: 'Основы психиатрии для психологов — МГУ, 2024'},
    {src: 'assets/diploma-04.jpg', previewSrcset: 'assets/diploma-04-480.webp 480w, assets/diploma-04-960.webp 960w', width: 1534, height: 1079, alt: 'Клиническая психология — МИП, 2026'}
  ]
};

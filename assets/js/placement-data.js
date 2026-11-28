/* ==========================================================================
   Gestion budget — catalogue du simulateur de placement (page Placement)
   ETF (source justETF, sauf mention) et actions (source companiesmarketcap),
   relevés le 28 nov. 2026. Rendement moyen estimé :
   - ETF : moyenne annualisée (géométrique) tirée du rendement cumulé publié ;
   - actions : moyenne géométrique des variations annuelles 2021-2025, en
     dollars, hors dividendes.
   META : pays et secteur des sociétés citées dans les top 10, pour
   l'exposition de l'Aperçu quand le fonds ne publie pas sa répartition.
   ========================================================================== */
'use strict';

(function (root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  if (root) root.PlacementData = data;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const SEEN = '28 nov. 2026';
  const JUSTETF = (isin) => `https://www.justetf.com/fr/etf-profile.html?isin=${isin}`;
  const CMC = (slug) => `https://companiesmarketcap.com/${slug}/stock-price-history/`;

  const META = {
    Nvidia: ['États-Unis', 'Technologie'], Apple: ['États-Unis', 'Technologie'], Alphabet: ['États-Unis', 'Communication'],
    Microsoft: ['États-Unis', 'Technologie'], 'Micron technology': ['États-Unis', 'Technologie'], AMD: ['États-Unis', 'Technologie'],
    Amazon: ['États-Unis', 'Consommation discrétionnaire'], Meta: ['États-Unis', 'Communication'],
    Tesla: ['États-Unis', 'Consommation discrétionnaire'], SpaceX: ['États-Unis', 'Industrie'], Broadcom: ['États-Unis', 'Technologie'],
    'Eli Lilly': ['États-Unis', 'Soins de santé'], Intel: ['États-Unis', 'Technologie'], 'Johnson & Johnson': ['États-Unis', 'Soins de santé'],
    'Lam Research': ['États-Unis', 'Technologie'], Cisco: ['États-Unis', 'Technologie'], ExxonMobil: ['États-Unis', 'Énergie'],
    'Applied Materials': ['États-Unis', 'Technologie'], Caterpillar: ['États-Unis', 'Industrie'], CAF: ['Espagne', 'Industrie'],
    Keller: ['Royaume-Uni', 'Industrie'], 'Royal BAM': ['Pays-Bas', 'Industrie'], Danieli: ['Italie', 'Industrie'],
    'Dassault Aviation': ['France', 'Industrie'], Capgemini: ['France', 'Technologie'], Metlen: ['Grèce', 'Industrie'],
    Strabag: ['Autriche', 'Industrie'], 'ASR Nederland': ['Pays-Bas', 'Finance'], 'Motor Oil': ['Grèce', 'Énergie'],
    ASML: ['Pays-Bas', 'Technologie'], Roche: ['Suisse', 'Soins de santé'], HSBC: ['Royaume-Uni', 'Finance'],
    Shell: ['Royaume-Uni', 'Énergie'], Novartis: ['Suisse', 'Soins de santé'], Nestlé: ['Suisse', 'Consommation de base'],
    AstraZeneca: ['Royaume-Uni', 'Soins de santé'], SAP: ['Allemagne', 'Technologie'], Siemens: ['Allemagne', 'Industrie'],
    TotalEnergies: ['France', 'Énergie'], TSMC: ['Taïwan', 'Technologie'], 'Texas Instruments': ['États-Unis', 'Technologie'],
    'Banco Santander': ['Espagne', 'Finance'], 'Royal Bank of Canada': ['Canada', 'Finance'], BHP: ['Australie', 'Matériaux'],
    'Berkshire Hathaway': ['États-Unis', 'Finance']
  };

  const NDX_TOP = [['Nvidia', 8.30], ['Apple', 7.33], ['Microsoft', 5.88], ['Micron technology', 4.67], ['Amazon', 4.53], ['AMD', 3.47], ['Alphabet A', 3.26], ['Alphabet C', 3.02], ['Tesla', 2.82], ['Broadcom', 2.72]];
  const NDX_COUNTRIES = [['États-Unis', 94.43], ['Royaume-Uni', 1.67], ['Pays-Bas', 1.40], ['Canada', 1.01], ['Autres', 1.49]];
  const NDX_SECTORS = [['Technologie', 66.56], ['Biens de consommation non cycliques', 11.95], ['Soins de santé', 4.10], ['Biens de consommation cycliques', 3.29], ['Autres', 14.10]];

  const ETFS = [
    { id: 'sp500', name: 'S&P 500', ticker: 'SPYL.DE', isin: 'IE000XZSV718', logo: 'S&P', color: '#D7263D', desc: 'Les grandes entreprises américaines du S&P 500.', perf: 18.2, period: 'Moyenne annualisée sur 3 ans (fonds lancé le 31 oct. 2023)', ter: 0.03, aum: '17 931 M€', fund: 'State Street SPDR S&P 500 UCITS ETF (Acc)', compDate: '30 oct. 2026', top10: [['Apple', 7.70], ['Nvidia', 7.59], ['Microsoft', 5.94], ['Amazon', 3.61], ['Alphabet A', 2.51], ['Broadcom', 2.38], ['Meta', 2.08], ['Alphabet C', 2.02], ['Eli Lilly', 1.74], ['Tesla', 1.72]], countries: [['États-Unis', 97.42], ['Irlande', 1.22], ['Autres', 1.36]], sectors: [['Technologie', 44.07], ['Finance', 13.51], ['Soins de santé', 10.08], ['Biens de consommation non cycliques', 9.10], ['Autres', 23.24]], rest: 'États-Unis' },
    { id: 'sp500ew', name: 'S&P 500 équipondéré', ticker: 'XDEW.DE', isin: 'IE00BLNMYC90', logo: 'S&P', color: '#B51F33', desc: 'Les entreprises du S&P 500 avec un poids égal au rééquilibrage.', perf: 8.8, period: 'Moyenne annualisée sur 5 ans', ter: 0.15, aum: '11 766 M€', fund: 'Xtrackers S&P 500 Equal Weight UCITS ETF 1C', compDate: '31 août 2026', top10: [['Moderna', 0.56], ['Veeva Systems', 0.32], ['Zebra Technologies', 0.31], ['DoorDash', 0.29], ['Charles River Labs', 0.29], ['Expedia', 0.28], ['Salesforce', 0.28], ['Workday', 0.28], ['Airbnb', 0.28], ['Global Payments', 0.28]], countries: [['États-Unis', 95.44], ['Irlande', 2.06], ['Autres', 2.50]], sectors: [['Finance', 20.88], ['Technologie', 15.31], ['Industrie', 13.61], ['Soins de santé', 12.87], ['Autres', 37.33]], rest: 'États-Unis' },
    { id: 'ndx', name: 'Nasdaq', ticker: 'UST.PA', isin: 'LU1829221024', logo: 'N', color: '#1F7AE0', desc: 'Les grandes entreprises non financières cotées au Nasdaq.', perf: 15.1, period: 'Moyenne annualisée sur 5 ans', ter: 0.22, aum: '6 460 M€', fund: 'Amundi Core Nasdaq-100 Swap UCITS ETF Acc', compDate: '26 août 2026', top10: NDX_TOP, countries: NDX_COUNTRIES, sectors: NDX_SECTORS, rest: 'États-Unis' },
    { id: 'ndx2', badge: 'ETF · ×2', name: 'Nasdaq ×2', ticker: 'LQQ.PA', isin: 'FR0010342592', logo: 'N×2', color: '#0E9AA7', desc: 'Le Nasdaq-100 avec un levier ×2 réinitialisé chaque jour.', perf: 18.4, period: 'Moyenne annualisée sur 5 ans', ter: 0.60, aum: '1 310 M€', fund: 'Amundi Nasdaq-100 Daily (2x) Leveraged UCITS ETF', compDate: '26 août 2026', compNote: 'Composition non publiée (fonds à swap) : proxy Nasdaq-100 de l’ETF UST, hors levier', method: 'Levier quotidien : risque d’érosion en marché sans tendance.', top10: NDX_TOP, countries: NDX_COUNTRIES, sectors: NDX_SECTORS, rest: 'États-Unis' },
    { id: 'r2k', name: 'Russell 2000', ticker: 'V3SA.DE', isin: 'IE000LRGEN55', logo: 'R2K', color: '#A4161A', desc: 'Les petites capitalisations américaines du Russell 2000.', perf: -3.67, perfUnit: 'depuis le lancement', period: 'Fonds lancé le 7 juil. 2026 : pas encore de rendement annualisé', ter: 0.20, aum: '2 M€', fund: 'Vanguard Russell 2000 U.S. Small-Cap UCITS ETF USD Dist', compDate: '31 oct. 2026', top10: [['Glaukos', 0.46], ['BrightSpring Health', 0.38], ['JFrog', 0.35], ['Twist Bioscience', 0.34], ['Moog', 0.34], ['UMB Financial', 0.33], ['ViaSat', 0.33], ['SM Energy', 0.33], ['Brinker International', 0.31], ['Ryman Hospitality', 0.30]], countries: [['États-Unis', 95.12], ['Bermudes', 1.86], ['Autres', 3.02]], sectors: [['Finance', 26.35], ['Soins de santé', 20.89], ['Technologie', 12.11], ['Industrie', 9.79], ['Autres', 30.86]], rest: 'États-Unis' },
    { id: 'mom', name: 'USA Momentum', ticker: 'IUMO.L', isin: 'IE00BD1F4N50', logo: 'MOM', color: '#3A56D4', desc: 'Des actions américaines sélectionnées pour leur dynamique boursière.', perf: 13.2, period: 'Moyenne annualisée sur 5 ans', ter: 0.20, aum: '594 M€', fund: 'iShares Edge MSCI USA Momentum Factor UCITS ETF', compDate: '31 août 2026', top10: [['Micron technology', 5.17], ['AMD', 5.10], ['Intel', 4.30], ['Johnson & Johnson', 4.00], ['Cisco', 3.59], ['Lam Research', 3.43], ['ExxonMobil', 3.36], ['Caterpillar', 3.18], ['Applied Materials', 3.03], ['Alphabet A', 2.77]], countries: [['États-Unis', 95.55], ['Singapour', 2.65], ['Autres', 1.80]], sectors: [['Technologie', 52.53], ['Industrie', 13.48], ['Énergie', 9.14], ['Soins de santé', 8.58], ['Autres', 16.27]], rest: 'États-Unis' },
    { id: 'stoxx600', name: 'Europe 600', ticker: 'MEUD.PA', isin: 'LU0908500753', logo: '600', color: '#1D3C9E', desc: 'Les entreprises européennes de l’indice STOXX Europe 600.', perf: 9.2, period: 'Moyenne annualisée sur 5 ans', ter: 0.07, aum: '21 468 M€', fund: 'Amundi Core Stoxx Europe 600 UCITS ETF Acc', compDate: '25 août 2026', top10: [['ASML', 4.29], ['HSBC', 2.24], ['Roche', 2.06], ['Novartis', 1.92], ['AstraZeneca', 1.66], ['Shell', 1.63], ['Nestlé', 1.62], ['Siemens', 1.54], ['SAP', 1.38], ['Banco Santander', 1.36]], countries: [['Royaume-Uni', 21.66], ['Suisse', 14.78], ['France', 13.85], ['Allemagne', 13.04], ['Autres', 36.67]], sectors: [['Finance', 26.84], ['Industrie', 17.07], ['Soins de santé', 11.86], ['Technologie', 9.55], ['Autres', 34.68]], rest: null },
    { id: 'eumid', name: 'Europe Mid', ticker: 'IEMID.PA', isin: 'LU3195985372', logo: 'EM', color: '#5B7553', desc: 'Gestion active de moyennes entreprises européennes, selon une approche Quality Value.', perf: 14.81, perfUnit: 'depuis le lancement', period: 'Part ETF lancée le 11 déc. 2025 : pas encore de rendement annualisé', ter: 1.56, aum: '17 M€', fund: 'Independance AM Europe Mid UCITS ETF E (C)', method: 'Gestion active · frais de surperformance 10 % (Indépendance AM)', compDate: '30 sept. 2026', compNote: 'Composition non publiée par justETF : relevé de la vidéo', top10: [['CAF', 4.5], ['Keller', 3.7], ['Royal BAM', 3.5], ['Danieli', 3.4], ['Dassault Aviation', 3.2], ['Capgemini', 2.8], ['Metlen', 2.8], ['Strabag', 2.6], ['ASR Nederland', 2.5], ['Motor Oil', 2.5]], src2: 'Indépendance AM', url2: 'https://www.independance-am.com/nos-fonds/independance-europe-mid/', rest: null },
    { id: 'world', name: 'MSCI World', ticker: 'SC0J.DE', isin: 'IE00B60SX394', logo: 'W', color: '#2B8A6E', desc: 'Les grandes et moyennes entreprises des marchés développés.', perf: 12.0, period: 'Moyenne annualisée sur 5 ans', ter: 0.05, aum: '9 333 M€', fund: 'Invesco MSCI World UCITS ETF Acc', compDate: '31 août 2026', top10: [['Nvidia', 5.50], ['Apple', 5.05], ['Microsoft', 3.88], ['Amazon', 2.73], ['Alphabet A', 2.16], ['Broadcom', 1.81], ['Alphabet C', 1.70], ['Meta', 1.36], ['Micron technology', 1.17], ['Tesla', 1.14]], countries: [['États-Unis', 70.00], ['Japon', 5.76], ['Royaume-Uni', 3.65], ['Canada', 3.37], ['Autres', 17.22]], sectors: [['Technologie', 35.54], ['Finance', 17.90], ['Industrie', 9.51], ['Soins de santé', 8.96], ['Autres', 28.09]], rest: null },
    { id: 'worldxus', name: 'World ex-USA', ticker: 'EXUS.DE', isin: 'IE0006WW1TQ4', logo: 'W−US', color: '#3C9D84', desc: 'Les marchés développés, hors États-Unis.', perf: 13.4, period: 'Moyenne annualisée depuis le lancement (6 mars 2024)', ter: 0.15, aum: '7 084 M€', fund: 'Xtrackers MSCI World ex USA UCITS ETF 1C', compDate: '31 août 2026', top10: [['ASML', 2.63], ['HSBC', 1.40], ['Roche', 1.22], ['Royal Bank of Canada', 1.11], ['Novartis', 1.09], ['Shell', 0.99], ['Nestlé', 0.98], ['Siemens', 0.98], ['AstraZeneca', 0.96], ['BHP', 0.96]], countries: [['Japon', 20.57], ['Canada', 12.15], ['Royaume-Uni', 12.07], ['Suisse', 8.67], ['Autres', 46.54]], sectors: [['Finance', 29.99], ['Industrie', 14.93], ['Technologie', 11.82], ['Soins de santé', 8.59], ['Autres', 34.67]], rest: null },
    { id: 'em', name: 'Marchés émergents', ticker: 'IS3N.DE', isin: 'IE00BKM4GZ66', logo: 'EM', color: '#4C8C6A', desc: 'Grandes, moyennes et petites entreprises des marchés émergents.', perf: 6.43, period: 'Moyenne annualisée sur 5 ans, au 26 nov. 2026', ter: 0.18, aum: '35,32 Md€', fund: 'iShares Core MSCI EM IMI UCITS ETF (Acc)', compDate: '', compNote: 'Poids individuels non publiés par la source · top 10 : 30,67 %', topNames: ['TSMC', 'Samsung Electronics', 'SK hynix', 'Tencent', 'Alibaba', 'MediaTek', 'China Construction Bank', 'HDFC Bank', 'ICICI Bank', 'Reliance Industries'], top10: [], src: 'extraETF', url: 'https://extraetf.com/fr/etf-profile/IE00BKM4GZ66', rest: null },
    { id: 'semi', name: 'Semi-conducteurs', ticker: 'VVSM.DE', isin: 'IE00BMC38736', logo: 'SEMI', color: '#2C5BA8', desc: 'Les entreprises de la chaîne des semi-conducteurs.', perf: 31.6, period: 'Moyenne annualisée sur 5 ans', ter: 0.35, aum: '7 424 M€', fund: 'VanEck Semiconductor UCITS ETF', compDate: '31 août 2026', top10: [['Nvidia', 11.31], ['Micron technology', 11.04], ['AMD', 10.69], ['TSMC', 10.44], ['Broadcom', 10.22], ['ASML', 9.99], ['Intel', 6.05], ['Lam Research', 5.14], ['Applied Materials', 5.08], ['Texas Instruments', 3.32]], countries: [['États-Unis', 78.39], ['Pays-Bas', 10.60], ['Taïwan', 10.44], ['Autres', 0.57]], sectors: [['Technologie', 100]], rest: null }
  ].map((e) => ({ type: 'ETF', approx: true, src: 'justETF', url: JUSTETF(e.isin), ...e }));

  /** Action détenue en direct : [id, nom, ticker, isin, logo, activité, rendement, secteur, pays, capitalisation, années, slug, société (META)]. */
  const stock = ([ticker, name, isin, logo, activity, perf, sector, country, cap, years, slug, company, extra = {}]) => ({
    id: `st-${ticker}`, type: 'Action', name, ticker, isin, logo, color: '#2A3570',
    desc: `Une action détenue en direct · ${activity}.`, perf, approx: true,
    perfLabel: 'Rendement moyen estimé · USD, hors dividendes', period: 'Moyenne annualisée 2021-2025',
    facts: [['Secteur', sector], ['Pays', country], ['Capitalisation', cap]], years,
    top10: [[company, 100, country, sector]], src: 'companiesmarketcap', url: CMC(slug), rest: null, ...extra
  });
  const STOCKS = [
    ['AAPL', 'Apple', 'US0378331005', 'AAPL', 'Électronique grand public', 18.4, 'Technologie', 'États-Unis', '5 210 Md$', [[2021, 38.06], [2022, -28.2], [2023, 54.8], [2024, 35.56], [2025, 11.88], [2026, 31.88]], 'apple', 'Apple'],
    ['MSFT', 'Microsoft', 'US5949181045', 'MSFT', 'Cloud & plateformes', 18.9, 'Technologie', 'États-Unis', '3 636 Md$', [[2021, 55.79], [2022, -27.69], [2023, 58.35], [2024, 14.5], [2025, 16.17], [2026, 1.3]], 'microsoft', 'Microsoft'],
    ['NVDA', 'NVIDIA Corporation', 'US67066G1040', 'NVDA', 'Puces IA', 70.0, 'Technologie', 'États-Unis', '3 633 Md$', [[2021, 124.48], [2022, -51.44], [2023, 246.1], [2024, 178.87], [2025, 34.88], [2026, -19.31]], 'nvidia', 'Nvidia'],
    ['GOOGL', 'Alphabet', 'US02079K3059', 'GOOG', 'Publicité numérique · États-Unis', 29.5, 'Communication', 'États-Unis', '3 349 Md$', [[2021, 67.43], [2022, -38.84], [2023, 57.11], [2024, 36.95], [2025, 65.0], [2026, -13.18]], 'alphabet-google', 'Alphabet'],
    ['AMZN', 'Amazon.com, Inc.', 'US0231351067', 'AMZN', 'Cloud & plateformes', 7.0, 'Consommation discrétionnaire', 'États-Unis', '2 747 Md$', [[2021, 4.64], [2022, -50.71], [2023, 77.04], [2024, 46.33], [2025, 4.81], [2026, 5.9]], 'amazon', 'Amazon'],
    ['SPCX', 'SpaceX', '', 'SPCX', 'Lanceurs spatiaux et internet par satellite', -5.6, 'Industrie', 'États-Unis', '1 730 Md$', [[2026, -5.6]], 'spacex', 'SpaceX',
      { perfUnit: 'en 2026', period: 'Introduite en bourse en 2026 : pas encore de moyenne sur plusieurs années' }],
    ['TSM', 'TSMC', 'US8740391003', 'TSM', 'Fonderie', 22.6, 'Technologie', 'Taïwan', '1 832 Md$', [[2021, 9.43], [2022, -40.92], [2023, 43.21], [2024, 97.27], [2025, 51.89], [2026, 16.27]], 'tsmc', 'TSMC'],
    ['AVGO', 'Broadcom', 'US11135F1012', 'AVGO', 'Puces IA', 56.5, 'Technologie', 'États-Unis', '1 490 Md$', [[2021, 61.13], [2022, -13.0], [2023, 106.27], [2024, 116.48], [2025, 50.0], [2026, -9.75]], 'broadcom', 'Broadcom'],
    ['META', 'Meta Platforms', 'US30303M1027', 'META', 'Publicité numérique', 18.8, 'Communication', 'États-Unis', '1 607 Md$', [[2021, 25.07], [2022, -64.45], [2023, 183.76], [2024, 69.73], [2025, 10.34], [2026, -4.72]], 'meta-platforms', 'Meta'],
    ['TSLA', 'Tesla', 'US88160R1014', 'TSLA', 'Véhicules électriques et énergie', 14.6, 'Consommation discrétionnaire', 'États-Unis', '1 581 Md$', [[2021, 44.81], [2022, -69.2], [2023, 129.86], [2024, 62.56], [2025, 18.57], [2026, -11.06]], 'tesla', 'Tesla'],
    ['LLY', 'Eli Lilly', 'US5324571083', 'LLY', 'Laboratoire pharmaceutique', 46.7, 'Soins de santé', 'États-Unis', '1 241 Md$', [[2021, 69.43], [2022, 36.47], [2023, 61.28], [2024, 31.21], [2025, 38.95], [2026, 29.55]], 'eli-lilly', 'Eli Lilly'],
    ['BRK-B', 'Berkshire Hathaway · B', 'US0846707026', 'BRK-', 'Holding de Warren Buffett', 16.6, 'Finance', 'États-Unis', '1 233 Md$', [[2021, 30.88], [2022, 2.7], [2023, 15.09], [2024, 25.06], [2025, 11.43], [2026, 15.25]], 'berkshire-hathaway', 'Berkshire Hathaway']
  ].map(stock);

  /* Produits de la page Produits financiers (produitFinance.html) absents
     du catalogue ci-dessus : même ISIN ou même indice déjà présent (Apple,
     Microsoft, Nvidia, Amazon, Alphabet, Tesla, MSCI World, S&P 500,
     Nasdaq 100, MSCI EM IMI) = pas de doublon. Données relevées le
     28 nov. 2026 (seen) sur justETF (ETF, obligations, crypto ; composition
     datée par compDate) et companiesmarketcap (actions), même méthode que
     ci-dessus. */
  const SEEN_MORE = '28 nov. 2026';
  const MORE_STOCKS = [
    ['MC', 'LVMH', 'FR0000121014', 'MC', 'lvmh', 'Groupe français de luxe (Louis Vuitton, Dior, Moët & Chandon…), coté au CAC 40.', 5.2, 'Consommation discrétionnaire', 'France', '215 Md$',
      [[2021, 32.65], [2022, -11.21], [2023, 10.96], [2024, -15.57], [2025, 16.95], [2026, -41.96]]],
    ['TTE', 'TotalEnergies', 'FR0000120271', 'TTE', 'totalenergies', 'Groupe énergétique français (pétrole, gaz, électricité, renouvelables), coté au CAC 40 et connu pour son dividende.', 14.3, 'Énergie', 'France', '188 Md$',
      [[2021, 24.59], [2022, 30.58], [2023, 15.37], [2024, -14.95], [2025, 22.27], [2026, 31.20]]],
    ['DIS', 'Disney', 'US2546871060', 'DIS', 'walt-disney', 'Groupe américain de divertissement : studios (Pixar, Marvel, Star Wars), parcs à thème et Disney+.', -8.9, 'Communication', 'États-Unis', '217 Md$',
      [[2021, -12.83], [2022, -44.58], [2023, 1.81], [2024, 23.87], [2025, 3.10], [2026, 11.84]]]
  ].map(([ticker, name, isin, logo, slug, desc, perf, sector, country, cap, years]) => ({
    id: `st-${ticker}`, type: 'Action', name, ticker, isin, logo, color: '#2A3570', desc, perf, approx: true,
    perfLabel: 'Rendement moyen estimé · USD, hors dividendes', period: 'Moyenne annualisée 2021-2025',
    facts: [['Secteur', sector], ['Pays', country], ['Capitalisation', cap]], years,
    top10: [[name, 100, country, sector]], src: 'companiesmarketcap', url: CMC(slug), rest: null, seen: SEEN_MORE
  }));

  /** Crypto (ETN adossé à la cryptomonnaie) : une seule « position ». */
  const crypto = (coin) => ({ top10: [[coin, 100, null, 'Crypto-actifs']], sectors: [['Crypto-actifs', 100]], compTitle: 'Composition', compNote: 'Adossé à de vrais jetons conservés : pas de panier de sociétés' });
  const MORE_ETFS = [
    { id: 'ftseaw', name: 'FTSE All-World', ticker: 'VWCE', isin: 'IE00BK5BQT80', logo: 'AW', color: '#8A1C2B', fund: 'Vanguard FTSE All-World UCITS ETF (USD) Accumulating', desc: 'Pays développés et émergents, plus de 3 500 entreprises. Dividendes réinvestis.',
      perf: 10.25, period: 'Moyenne annualisée sur 5 ans', ter: 0.14, aum: '57 049 M€', compDate: '31 oct. 2026',
      top10: [['Apple', 4.74], ['Nvidia', 4.55], ['Microsoft', 3.69], ['Amazon', 2.22], ['TSMC', 1.68], ['Alphabet A', 1.58], ['Broadcom', 1.44], ['Meta', 1.29], ['Alphabet C', 1.23], ['Tesla', 1.11]],
      countries: [['États-Unis', 60.35], ['Japon', 5.87], ['Royaume-Uni', 3.28], ['Taïwan', 3.28], ['Autres', 27.22]],
      sectors: [['Technologie', 35.26], ['Finance', 18.19], ['Soins de santé', 8.85], ['Industrie', 8.73], ['Autres', 28.97]] },
    { id: 'btc', name: 'Bitcoin', ticker: 'IB1T', isin: 'XS2940466316', logo: 'BTC', color: '#B86E00', fund: 'iShares Bitcoin ETP', desc: 'Suit le cours du bitcoin, adossé à de vrais bitcoins conservés. Très volatil.',
      perf: -26.84, perfUnit: 'depuis le lancement', period: 'Lancé le 18 mars 2025 : pas encore de rendement annualisé', ter: 0.15, aum: '1 115 M€', ...crypto('Bitcoin (BTC)') },
    { id: 'eth', name: 'Ethereum', ticker: 'WETH', isin: 'GB00BJYDH394', logo: 'ETH', color: '#4B5AA8', fund: 'WisdomTree Physical Ethereum', desc: 'Suit le cours de l’ether, adossé à de vrais ethers conservés. Très volatil.',
      perf: -15.84, period: 'Moyenne annualisée sur 5 ans', ter: 0.35, aum: '143 M€', ...crypto('Ethereum (ETH)') },
    { id: 'sol', name: 'Solana', ticker: 'SOLW', isin: 'GB00BNGJ9G01', logo: 'SOL', color: '#7A3FB5', fund: 'WisdomTree Physical Solana', desc: 'Suit le cours du SOL, adossé à de vrais SOL conservés. Très volatil.',
      perf: 13.80, period: 'Moyenne annualisée sur 3 ans (lancé le 18 mars 2022)', ter: 0.50, aum: '31 M€', ...crypto('Solana (SOL)') },
    { id: 'xrp', name: 'XRP', ticker: 'WXRP', isin: 'GB00BRXHQ425', logo: 'XRP', color: '#33424F', fund: 'WisdomTree Physical XRP', desc: 'Suit le cours du XRP, adossé à de vrais XRP conservés. Très volatil.',
      perf: -35.72, perfUnit: 'depuis le lancement', period: 'Lancé le 18 nov. 2024 : pas encore de rendement annualisé', ter: 0.50, aum: '45 M€', ...crypto('XRP') }
  ].map((e) => ({ type: 'ETF', ...e }));

  const OAT = 'France';
  const BONDS = [
    { id: 'ob-eurgov', name: 'Obligations d’États zone euro', ticker: 'EUNH', isin: 'IE00B4WXJJ64', logo: 'EUR', fund: 'iShares Core Euro Government Bond UCITS ETF (Dist)', desc: 'Panier d’obligations d’États de la zone euro, toutes échéances confondues. Verse ses coupons deux fois par an.',
      perf: -2.76, ter: 0.07, aum: '5 694 M€', compDate: '30 oct. 2026',
      top10: [['OAT 2,50 % mai 2030', 0.88, OAT], ['OAT 3,50 % nov. 2033', 0.83, OAT], ['OAT 2,75 % févr. 2029', 0.81, OAT], ['OAT 1,50 % mai 2031', 0.79, OAT], ['OAT 0,75 % mai 2028', 0.77, OAT], ['OAT 2,75 % févr. 2030', 0.77, OAT], ['OAT 2,70 % févr. 2031', 0.75, OAT], ['OAT 0,50 % mai 2029', 0.72, OAT], ['OAT 2 % nov. 2032', 0.70, OAT], ['OAT 3,50 % nov. 2035', 0.68, OAT]],
      countries: [['France', 23.06], ['Italie', 21.25], ['Allemagne', 19.62], ['Espagne', 14.17], ['Autres', 21.90]],
      sectors: [['Souverain', 99.29], ['Non corporatif', 0.19], ['Autres', 0.63]] },
    { id: 'ob-eurgov-x', name: 'Obligations d’États zone euro (Xtrackers)', ticker: 'XGLE', isin: 'LU0290355717', logo: 'EUR', fund: 'Xtrackers II Eurozone Government Bond UCITS ETF 1C', desc: 'Obligations d’États de la zone euro notées « investment grade » (France, Italie, Allemagne, Espagne…). Coupons réinvestis.',
      perf: -2.77, ter: 0.07, aum: '2 359 M€', compDate: '29 oct. 2026',
      top10: [['OAT 2,50 % mai 2030', 0.85, OAT], ['OAT 1,50 % mai 2031', 0.80, OAT], ['OAT 0,75 % mai 2028', 0.79, OAT], ['OAT 2,75 % févr. 2029', 0.79, OAT], ['OAT 2,75 % oct. 2027', 0.76, OAT], ['OAT 3,50 % nov. 2033', 0.75, OAT], ['OAT 2,70 % févr. 2031', 0.75, OAT], ['OAT 2,75 % févr. 2030', 0.74, OAT], ['OAT 0,75 % nov. 2028', 0.72, OAT], ['OAT 0,50 % mai 2029', 0.69, OAT]],
      countries: [['France', 23.53], ['Italie', 21.34], ['Allemagne', 19.59], ['Espagne', 14.15], ['Autres', 21.39]],
      sectors: [['Souverain', 99.65], ['Autres', 0.35]] },
    { id: 'ob-eurcorp', name: 'Obligations d’entreprises en euros', ticker: 'EUN5', isin: 'IE00B3F81R35', logo: 'CORP', fund: 'iShares Core EUR Corporate Bond UCITS ETF (Dist)', desc: 'Obligations d’entreprises de bonne qualité émises en euros (industrie, services, finance). Verse ses coupons deux fois par an.',
      perf: 0.07, ter: 0.09, aum: '10 854 M€', compDate: '30 oct. 2026',
      top10: [['Liquidités', 0.19], ['AB InBev 2016-2028', 0.09], ['JPMorgan Chase 2022-2030', 0.09], ['3,7 % mars 2035', 0.09], ['AB InBev 2016-2036', 0.08], ['3,35 % mars 2032', 0.08], ['4,05 % mars 2039', 0.07], ['Subordonnée juin 2056', 0.07], ['BP Capital Markets perpétuelle', 0.07], ['Taux variable nov. 2031', 0.07]],
      compNote: 'Plus de 3 000 obligations : le top 10 pèse moins de 1 %',
      countries: [['France', 18.19], ['États-Unis', 18.15], ['Allemagne', 11.79], ['Royaume-Uni', 9.18], ['Autres', 42.69]],
      sectors: [['Finance', 43.99], ['Industrie', 7.65], ['Services aux collectivités', 7.52], ['Biens de consommation non cycliques', 7.36], ['Autres', 33.48]] },
    { id: 'ob-ust710', name: 'Bons du Trésor US 7-10 ans', ticker: 'SXRM', isin: 'IE00B3VWN518', logo: 'UST', fund: 'iShares USD Treasury Bond 7-10yr UCITS ETF (Acc)', desc: 'Obligations de l’État américain à échéance de 7 à 10 ans. Coupons réinvestis ; exposé au dollar.',
      perf: -0.47, ter: 0.07, aum: '4 978 M€', compDate: '30 oct. 2026', rest: 'États-Unis',
      top10: [['Trésor US 4,625 % févr. 2035', 8.81], ['Trésor US 4,25 % nov. 2034', 8.73], ['Trésor US 4,25 % mai 2035', 8.72], ['Trésor US 4,25 % août 2035', 8.56], ['Trésor US 4 % nov. 2035', 8.46], ['Trésor US 4,375 % mai 2036', 8.46], ['Trésor US 4,125 % févr. 2036', 8.37], ['Trésor US 4,5 % nov. 2033', 8.18], ['Trésor US 3,875 % août 2034', 8.18], ['Trésor US 4 % févr. 2034', 7.71]],
      countries: [['États-Unis', 92.43], ['Autres', 7.57]],
      sectors: [['Souverain', 92.43], ['Non corporatif', 0.01], ['Autres', 7.56]] },
    { id: 'ob-ust20', name: 'Bons du Trésor US 20 ans et plus', ticker: 'IS04', isin: 'IE00BSKRJZ44', logo: 'UST', fund: 'iShares USD Treasury Bond 20+yr UCITS ETF USD (Dist)', desc: 'Obligations de l’État américain à plus de 20 ans : plus sensibles aux variations des taux. Coupons distribués ; exposé au dollar.',
      perf: -7.61, ter: 0.07, aum: '1 162 M€', compDate: '30 oct. 2026', rest: 'États-Unis',
      top10: [['Trésor US 5 % mai 2056', 4.12], ['Trésor US 4,75 % mai 2055', 4.01], ['Trésor US 4,75 % août 2055', 3.96], ['Trésor US 4,625 % nov. 2055', 3.93], ['Trésor US 4,75 % févr. 2056', 3.91], ['Trésor US 4,625 % mai 2054', 3.89], ['Trésor US 4,625 % févr. 2055', 3.87], ['Trésor US 4,75 % nov. 2053', 3.84], ['Trésor US 4,5 % nov. 2054', 3.80], ['Trésor US (US912810UW61)', 3.78]],
      countries: [['États-Unis', 96.02], ['Autres', 3.98]],
      sectors: [['Souverain', 96.02], ['Non corporatif', 0.01], ['Autres', 3.97]] },
    { id: 'ob-eurgov13', name: 'Obligations d’États zone euro 1-3 ans', ticker: 'IBCA', isin: 'IE00B14X4Q57', logo: '1-3', fund: 'iShares Euro Government Bond 1-3yr UCITS ETF (Dist)', desc: 'Obligations d’États de la zone euro à courte échéance (1 à 3 ans), peu sensibles aux variations des taux.',
      perf: 0.98, ter: 0.10, aum: '1 750 M€', compDate: '30 oct. 2026',
      top10: [['OAT 2,40 % sept. 2028', 15.25, OAT], ['France 2,4 % sept. 2029', 10.38, OAT], ['2,5 % juin 2028', 7.30], ['2,7 % sept. 2028', 7.25], ['2,4 % mai 2028', 7.17], ['2,1 % mars 2028', 7.13], ['2,35 % mars 2029', 6.86], ['2 % déc. 2027', 6.84], ['2,2 % févr. 2028', 5.98], ['2,4 % mars 2029', 5.50]],
      countries: [['Allemagne', 32.19], ['Italie', 26.13], ['France', 25.64], ['Espagne', 14.03], ['Autres', 2.01]],
      sectors: [['Souverain', 97.98], ['Non corporatif', 0.09], ['Autres', 1.95]] },
    { id: 'ob-globagg', name: 'Obligations mondiales', ticker: 'EUNA', isin: 'IE00BDBRDM35', logo: 'AGG', fund: 'iShares Core Global Aggregate Bond UCITS ETF EUR Hedged (Acc)', desc: 'Obligations de bonne qualité du monde entier (États et entreprises), couvertes contre le risque de change en euro.',
      perf: -1.52, ter: 0.10, aum: '2 792 M€', compDate: '30 oct. 2026',
      top10: [['Liquidités', 1.96], ['Chine 1,61 % févr. 2035', 0.98, 'Chine'], ['Chine 1,49 % déc. 2031', 0.50, 'Chine'], ['Chine 1,45 % févr. 2028', 0.46, 'Chine'], ['Chine 2,68 % mai 2030', 0.36, 'Chine'], ['Chine 2,28 % mars 2031', 0.36, 'Chine'], ['Chine 2,52 % août 2033', 0.31, 'Chine'], ['Chine 3,19 % avr. 2053', 0.27, 'Chine'], ['Chine 2,62 % avr. 2028', 0.26, 'Chine'], ['Chine 2,35 % févr. 2034', 0.23, 'Chine']],
      compNote: 'Plus de 19 000 obligations : le top 10 pèse moins de 6 %',
      countries: [['États-Unis', 28.12], ['Chine', 11.34], ['Japon', 8.08], ['France', 4.68], ['Autres', 47.78]],
      sectors: [['Souverain', 54.20], ['Finance', 17.93], ['Municipal', 2.06], ['Autres', 25.81]] },
    { id: 'ob-eurhy', name: 'Obligations d’entreprises haut rendement', ticker: 'EUNW', isin: 'IE00B66F4759', logo: 'HY', fund: 'iShares EUR High Yield Corporate Bond UCITS ETF EUR (Dist)', desc: 'Obligations d’entreprises « haut rendement » en euros : coupons plus élevés en échange d’un risque de défaut plus fort.',
      perf: 2.57, ter: 0.50, aum: '5 589 M€', compDate: '30 oct. 2026',
      top10: [['Liquidités', 1.93], ['8,5 % juil. 2032', 0.45], ['XS3489941826', 0.45], ['5,375 % avr. 2031', 0.41], ['Grifols 2021-2028', 0.40], ['Taux variable janv. 2033', 0.40], ['7 % juin 2030', 0.38], ['7,75 % août 2031', 0.38], ['6,5 % juin 2033', 0.37], ['5,625 % avr. 2032', 0.37]],
      compNote: '661 obligations : le top 10 pèse moins de 6 %',
      countries: [['France', 18.50], ['Italie', 15.42], ['États-Unis', 10.79], ['Allemagne', 10.34], ['Autres', 44.95]],
      sectors: [['Finance', 14.51], ['Biens de consommation cycliques', 12.89], ['Télécommunications', 12.17], ['Industrie', 10.87], ['Autres', 49.56]] },
    { id: 'ob-emusd', name: 'Obligations d’États émergents', ticker: 'IUS7', isin: 'IE00B2NPKV68', logo: 'EM', fund: 'iShares J.P. Morgan USD Emerging Markets Bond UCITS ETF (Dist)', desc: 'Obligations d’États de pays émergents émises en dollars. Rendement plus élevé, mais risque plus important.',
      perf: 2.41, ter: 0.45, aum: '3 275 M€', compDate: '30 oct. 2026',
      top10: [['Argentine 2020-2035', 1.06, 'Argentine'], ['Équateur 2020-2035', 0.76, 'Équateur'], ['Argentine 2020-2030', 0.64, 'Argentine'], ['Argentine 2020-2038', 0.62, 'Argentine'], ['Coupon zéro juil. 2035', 0.57], ['5,1 % juin 2050', 0.53], ['5,5 % août 2030', 0.52], ['Argentine 2020-2041', 0.51, 'Argentine'], ['Oman 2018-2048', 0.43, 'Oman'], ['Coupon zéro févr. 2032', 0.42]],
      compNote: '613 obligations : le top 10 pèse environ 6 %',
      countries: [['Arabie saoudite', 6.26], ['Mexique', 6.19], ['Turquie', 4.79], ['Indonésie', 4.30], ['Autres', 78.46]],
      sectors: [['Souverain', 85.63], ['Énergie', 5.41], ['Finance', 4.14], ['Matériaux', 1.65], ['Autres', 3.17]] }
  ].map((b) => ({ type: 'Obligation', badge: 'ETF obligataire', color: '#6B5B2E', compTitle: '10 premières obligations', period: 'Moyenne annualisée sur 5 ans', ...b }));
  const MORE = [...MORE_ETFS, ...BONDS].map((e) => ({
    approx: true, compDate: '', rest: null, src: 'justETF', url: JUSTETF(e.isin), seen: SEEN_MORE, ...e
  }));

  /* ETF de la page Produits financiers dont l'indice est déjà au catalogue
     sous un autre fonds : fiche affichée sur cette page seulement (pas de
     doublon dans le simulateur). Relevés sur justETF le 28 nov. 2026. */
  const PAGE_ONLY = [
    { id: 'pf-iwda', name: 'MSCI World (iShares)', ticker: 'EUNL', isin: 'IE00B4L5Y983', fund: 'iShares Core MSCI World UCITS ETF USD (Acc)', desc: 'Environ 1 250 grandes entreprises de 23 pays développés en un seul produit. Dividendes réinvestis.',
      perf: 10.66, ter: 0.20, aum: '126 141 M€',
      top10: [['Apple', 5.62], ['Nvidia', 5.23], ['Microsoft', 4.09], ['Amazon', 2.59], ['Alphabet A', 1.82], ['Broadcom', 1.64], ['Meta', 1.50], ['Alphabet C', 1.45], ['Tesla', 1.27], ['Eli Lilly', 1.26]],
      countries: [['États-Unis', 70.50], ['Japon', 5.70], ['Royaume-Uni', 3.72], ['Canada', 3.40], ['Autres', 16.68]],
      sectors: [['Technologie', 34.92], ['Finance', 17.62], ['Soins de santé', 9.90], ['Industrie', 9.12], ['Autres', 28.44]] },
    { id: 'pf-cspx', name: 'S&P 500 (iShares)', ticker: 'SXR8', isin: 'IE00B5BMR087', fund: 'iShares Core S&P 500 UCITS ETF USD (Acc)', desc: 'Les 500 plus grandes entreprises américaines. Dividendes réinvestis.',
      perf: 11.60, ter: 0.07, aum: '135 557 M€',
      top10: [['Apple', 7.70], ['Nvidia', 7.58], ['Microsoft', 5.93], ['Amazon', 3.61], ['Alphabet A', 2.51], ['Broadcom', 2.37], ['Meta', 2.08], ['Alphabet C', 2.02], ['Eli Lilly', 1.74], ['Tesla', 1.72]],
      countries: [['États-Unis', 97.33], ['Irlande', 1.21], ['Autres', 1.46]],
      sectors: [['Technologie', 44.04], ['Finance', 13.48], ['Soins de santé', 10.07], ['Biens de consommation non cycliques', 9.09], ['Autres', 23.32]] },
    { id: 'pf-cndx', name: 'Nasdaq 100 (iShares)', ticker: 'SXRV', isin: 'IE00B53SZB19', fund: 'iShares Nasdaq 100 UCITS ETF (Acc)', desc: 'Les 100 plus grandes entreprises non financières du Nasdaq, très orientées technologie. Dividendes réinvestis.',
      perf: 11.70, ter: 0.30, aum: '25 100 M€',
      top10: [['Apple', 8.18], ['Nvidia', 8.02], ['Microsoft', 6.30], ['Micron technology', 4.49], ['Amazon', 4.21], ['AMD', 3.70], ['Tesla', 3.42], ['Meta', 2.98], ['Walmart', 2.70], ['Alphabet A', 2.67]],
      countries: [['États-Unis', 94.64], ['Royaume-Uni', 1.69], ['Pays-Bas', 1.30], ['Canada', 1.06], ['Autres', 1.31]],
      sectors: [['Technologie', 64.52], ['Biens de consommation non cycliques', 11.93], ['Soins de santé', 4.81], ['Biens de consommation cycliques', 3.86], ['Autres', 14.88]] }
  ].map((e) => ({ type: 'ETF', approx: true, period: 'Moyenne annualisée sur 5 ans', compDate: '30 oct. 2026', rest: null, src: 'justETF', url: JUSTETF(e.isin), seen: SEEN_MORE, ...e }));
  const CATALOG = [...ETFS, ...STOCKS, ...MORE_STOCKS, ...MORE];
  /** Fiche d'un produit par ISIN (catalogue puis fiches propres à la page Produits financiers). */
  const byIsin = (isin) => [...CATALOG, ...PAGE_ONLY].find((p) => p.isin === isin);

  return { SEEN, META, CATALOG, byIsin };
});

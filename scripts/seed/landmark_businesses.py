#!/usr/bin/env python3
"""Launch seed: one location note at each of 52 well-known businesses in 33 cities (45 abroad, 7 in Istanbul).
Writes scripts/seed/landmark-businesses.json for admin/scripts/seed-notes.mjs (--seed landmark-businesses).
See docs/release/LAUNCH_SEED.md.

  python3 scripts/seed/landmark_businesses.py          # validate + write
  python3 scripts/seed/landmark_businesses.py --check  # validate + file up to date

Business notes are facts, never reviews: founding year, history and documented anecdotes, with the
business name (and its street where known) in the text. No taste, price, service or recommendation,
no notifications, and nothing about the tragedies some of these places lived through. Every note
carries its source. Some notes are deliberately casual (lowercase, chatty); the facts stay exact. `coord: approx` marks an entrance placed from the address: check it on the admin
map before applying.
"""
import json
import os
import re
import sys
from dataclasses import dataclass
from typing import Optional, Tuple

from world_capitals import MAX_TEXT, MIN_SPACING_M, NOTE_RADIUS_M, TYPES, URL, distance, style_problems

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'landmark-businesses.json')
CAPITAL_SEEDS = os.path.join(HERE, 'world-capitals.json')
BATCH = 'landmark-businesses-2026-10'
AUTHOR_HANDLE = 'loci.guide'
W = 'https://en.wikipedia.org/wiki/'

# A note about a business must never read as a customer review (FTC rule, EU Omnibus, UK DMCC, TR 28/B).
REVIEW_WORDS = re.compile(
    r'\b(best|delicious|tasty|yummy|cheap|expensive|overpriced|pricey|must[- ]try|worth|amazing|recommend\w*|'
    r'friendly staff|rude|service|lezzetli|nefis|en iyi|ucuz|pahal\w*|mutlaka|tavsiye|harika)\b', re.I)


@dataclass
class Business:
    id: str
    city: str
    country: str
    place: str
    lat: float
    lng: float
    coord: str  # 'wikipedia' / 'marker' (published coordinates) or 'approx' (placed from the address)
    type: str
    lang: str
    text: str
    source: str
    note: Optional[str] = None  # research remark for reviewers; not published

    @property
    def point(self) -> Tuple[float, float]:
        return self.lat, self.lng


B = Business
BUSINESSES = [
    # London
    B('london-b1', 'London', 'GB', 'Fortnum & Mason', 51.50866, -0.13851, 'approx', 'history', 'en',
      "fortnum & mason has been at 181 piccadilly since 1707. wait for the hour: the two founders on the clock above the door bow to each other. they also claim they invented the scotch egg, back in 1738",
      W + 'Fortnum_%26_Mason'),
    B('london-b2', 'London', 'GB', 'Hatchards', 51.50898, -0.13951, 'approx', 'history', 'en',
      "Hatchards has been selling books on Piccadilly since 1797, the oldest bookshop in the UK by its own count. Oscar Wilde used to sign books at the table they now call 'Oscar's table'.",
      W + 'Hatchards'),
    # Paris
    B('paris-b1', 'Paris', 'FR', "Fouquet's", 48.87139, 2.30139, 'wikipedia', 'history', 'en',
      "Fouquet's opened in 1899 and has been a listed historic monument since 1990. Every year after the César film awards, this is where the dinner happens.",
      W + 'Fouquet%27s'),
    B('paris-b2', 'Paris', 'FR', 'Le Procope', 48.85305, 2.3389, 'approx', 'history', 'en',
      "Le Procope. A café opened here in 1686, Voltaire and Rousseau came by, Franklin and Jefferson met here. (Small print: the old café closed in 1872, today's restaurant is from 1957.)",
      W + 'Le_Procope'),
    # Madrid
    B('madrid-b1', 'Madrid', 'ES', 'Sobrino de Botín', 40.41417, -3.70806, 'wikipedia', 'comic', 'en',
      "Botín, Calle de Cuchilleros 17. Guinness says it's the oldest restaurant in the world and the fire in its oven never goes out. Historians still argue about the founding date. The oven doesn't care.",
      W + 'Sobrino_de_Bot%C3%ADn'),
    B('madrid-b2', 'Madrid', 'ES', 'Chocolatería San Ginés', 40.41691, -3.70664, 'approx', 'history', 'en',
      "San Ginés has been doing chocolate con churros since 1894. Galdós and Valle-Inclán both wrote it into their books, so technically your churro dunking is literary.",
      W + 'Chocolater%C3%ADa_San_Gin%C3%A9s'),
    # Rome
    B('rome-b1', 'Rome', 'IT', "Babington's", 41.90602, 12.48238, 'wikipedia', 'history', 'en',
      "Babington's: two young Englishwomen opened this tea room in 1893 with £100 of savings. The English sign stayed up right through the Second World War.",
      W + 'Babington%27s_tea_room',
      note="Antico Caffè Greco was left out: it closed on 8 October 2025."),
    # Vienna
    B('vienna-b1', 'Vienna', 'AT', 'Café Central', 48.21028, 16.36528, 'wikipedia', 'history', 'en',
      "Café Central, here since 1876. In January 1913 Freud, Tito and Stalin were all customers. Chess players called the upstairs room 'the chess school'.",
      W + 'Caf%C3%A9_Central'),
    B('vienna-b2', 'Vienna', 'AT', 'Demel', 48.20855, 16.36712, 'approx', 'comic', 'en',
      "Demel, court confectioner to the Habsburgs from 1874. In 1954 Hotel Sacher took them to court over the 'Original Sacher-Torte'. Since 1963 Demel's cake wears an 'Eduard-Sacher-Torte' seal. Cake drama.",
      W + 'Demel'),
    # Prague
    B('prague-b1', 'Prague', 'CZ', 'U Fleků', 50.07889, 14.41722, 'wikipedia', 'history', 'en',
      "U Fleků has been brewing here since 1499. The dark 13° lager is made on site and you can't get it anywhere else. There's room for 1,200 people, so you'll find a seat.",
      W + 'U_Flek%C5%AF'),
    B('prague-b2', 'Prague', 'CZ', 'Café Louvre', 50.08197, 14.4186, 'approx', 'history', 'en',
      "café louvre opened in 1902. kafka, einstein and karel čapek all came here. no pressure, but you're in good company",
      "https://www.cafelouvre.cz/en/History"),
    # Budapest
    B('budapest-b1', 'Budapest', 'HU', 'Gerbeaud', 47.49642, 19.05032, 'approx', 'history', 'en',
      "Henrik Kugler started this business in 1858 and moved here in 1870, when the square was still Gizella tér. In 1884 he brought in a confectioner from Geneva called Emil Gerbeaud. Guess whose name is on the door now.",
      W + 'Caf%C3%A9_Gerbeaud'),
    B('budapest-b2', 'Budapest', 'HU', 'New York Café', 47.49842, 19.07059, 'approx', 'comic', 'en',
      "New York Café opened in 1894. Legend says writers threw the front door key into the Danube on opening night so it could never close. If you find it, hand it in.",
      "https://edition.cnn.com/travel/article/budapest-new-york-cafe"),
    # Lisbon
    B('lisbon-b1', 'Lisbon', 'PT', 'Livraria Bertrand', 38.7106389, -9.1411389, 'wikipedia', 'history', 'en',
      "Livraria Bertrand has been selling books here since 1732. Guinness calls it the oldest bookstore in the world that's still open.",
      W + 'Livraria_Bertrand'),
    B('lisbon-b2', 'Lisbon', 'PT', 'A Brasileira', 38.7107, -9.14226, 'approx', 'comic', 'en',
      "a brasileira opened on 19 november 1905. the bronze guy at the table outside is fernando pessoa (1988). same terrace seat for decades and he's never ordered a thing",
      W + 'A_Brasileira'),
    # Athens
    B('athens-b1', 'Athens', 'GR', 'Brettos', 37.97176, 23.73128, 'approx', 'history', 'en',
      "Brettos in Plaka, Athens' oldest distillery, opened by Michail Brettos in 1909. Their ouzo and liqueur recipes go back to Smyrna. The wall of coloured bottles hits you first.",
      "https://www.theculturetrip.com/europe/greece/articles/why-you-should-visit-athens-oldest-distillery-brettos"),
    # Berlin
    B('berlin-b1', 'Berlin', 'DE', 'KaDeWe', 52.50156, 13.34133, 'approx', 'useful', 'en',
      "KaDeWe opened on 27 March 1907 and is said to be Europe's second-biggest department store after Harrods. Over 60,000 m² of shop floor, so maybe pick a floor and stick to it.",
      W + 'Kaufhaus_des_Westens'),
    B('berlin-b2', 'Berlin', 'DE', "Konnopke's Imbiss", 52.54056, 13.4125, 'approx', 'history', 'en',
      "max konnopke started selling sausages in 1930 and opened this stand in 1960. people call it berlin's oldest imbiss",
      "https://www.visitberlin.de/en/konnopke"),
    # Brussels
    B('brussels-b1', 'Brussels', 'BE', 'Neuhaus', 50.84757, 4.35472, 'approx', 'history', 'en',
      "Neuhaus started right here in the galleries in 1857 as a pharmacy. In 1912 Jean Neuhaus came up with the praline, and in 1915 he and his wife Louise Agostini designed the ballotin box.",
      W + 'Neuhaus_(chocolatier)'),
    B('brussels-b2', 'Brussels', 'BE', 'Delirium Café', 50.8484083, 4.3539333, 'wikipedia', 'comic', 'en',
      "Delirium Café got into Guinness in January 2004 with 2,004 beer brands on the list. Reading the menu is an activity in itself.",
      W + 'Delirium_Caf%C3%A9'),
    # Amsterdam
    B('amsterdam-b1', 'Amsterdam', 'NL', 'Café Hoppe', 52.3684, 4.88977, 'approx', 'useful', 'en',
      "café hoppe, open since 1670. no. 18 is the 'standing hoppe', you drink on your feet and chat with whoever's next to you",
      "https://www.amsterdamnow.com/en/going-out-entertainment/cafe-hoppe-on-the-spui-brown-pub-with-350-years-of-history/"),
    # Copenhagen
    B('copenhagen-b1', 'Copenhagen', 'DK', 'Tivoli Gardens', 55.67361, 12.56833, 'wikipedia', 'history', 'en',
      "Tivoli opened on 15 August 1843, the second-oldest amusement park still running anywhere. The wooden coaster from 1914 still has someone riding along working the brakes.",
      W + 'Tivoli_Gardens'),
    # Stockholm
    B('stockholm-b1', 'Stockholm', 'SE', 'Den Gyldene Freden', 59.32335, 18.07337, 'approx', 'history', 'en',
      "Den Gyldene Freden opened in 1722 and the street around it has barely changed since. It got famous through Carl Michael Bellman's songs.",
      W + 'Den_Gyldene_Freden'),
    # Dublin
    B('dublin-b1', 'Dublin', 'IE', "Bewley's", 53.34142, -6.25988, 'approx', 'history', 'en',
      "Bewley's has been on Grafton Street since 1927. Look for the six Harry Clarke stained glass windows. The courts ruled in 2024, and again in 2026, that they belong to the building and can't be sold.",
      W + 'Bewley%27s'),
    B('dublin-b2', 'Dublin', 'IE', 'The Brazen Head', 53.34484, -6.27622, 'approx', 'comic', 'en',
      "The Brazen Head says it goes back to 1198. James Joyce mentions it in Ulysses. That's a lot of stories for one pub.",
      "https://www.dublinguide.ie/places/the-brazen-head/"),
    # Warsaw
    B('warsaw-b1', 'Warsaw', 'PL', 'E. Wedel', 52.23394, 21.01428, 'approx', 'history', 'en',
      "Karl Ernst Wedel started his chocolate company in 1851 and moved the main factory to this street, Szpitalna, in 1894. Ptasie Mleczko is still the big one.",
      W + 'E._Wedel'),
    # Belgrade
    B('belgrade-b1', 'Belgrade', 'RS', '? (Znak pitanja)', 44.81822, 20.4527, 'approx', 'comic', 'en',
      "This kafana is literally called '?'. In 1892 the owner wanted to call it 'By the Cathedral Church', the church said no, so he hung a question mark on the door. It never changed. The building's from 1823.",
      W + '%3F_(bistro)'),
    # Cairo
    B('cairo-b1', 'Cairo', 'EG', 'El Fishawy', 30.04785, 31.2617, 'approx', 'history', 'en',
      "El Fishawy opened in 1797 and it's open 24 hours a day. Naguib Mahfouz was one of the writers who used to come here.",
      W + 'El_Fishawy'),
    # Nairobi
    B('nairobi-b1', 'Nairobi', 'KE', 'Thorn Tree Café, Stanley Hotel', -1.28388, 36.82222, 'approx', 'talking', 'en',
      "Thorn Tree Café at the Stanley (1902). Travellers used to pin notes for each other on the thorns of an acacia here and people still leave messages. Today's tree is from 1997. Kinda what you're doing now, huh",
      W + 'Stanley_Hotel,_Nairobi'),
    # Tokyo
    B('tokyo-b1', 'Tokyo', 'JP', 'Shibuya 109', 35.65956, 139.69873, 'approx', 'useful', 'en',
      "Shibuya 109 opened in April 1979. The name's a pun: 10 is 'tō' and 9 is 'kyū', so Tōkyū. It also happened to match the 10 a.m. to 9 p.m. opening hours.",
      W + 'Shibuya_109'),
    # Taipei
    B('taipei-b1', 'Taipei', 'TW', 'Din Tai Fung (Xinyi Road)', 25.03344, 121.52984, 'approx', 'history', 'en',
      "Din Tai Fung started on Xinyi Road in 1958 selling cooking oil. Around 1970 half the shop switched to xiaolongbao (18 folds each), and by 1972 it was a full restaurant.",
      W + 'Din_Tai_Fung'),
    # Bangkok
    B('bangkok-b1', 'Bangkok', 'TH', 'Jay Fai', 13.75249, 100.50493, 'approx', 'history', 'en',
      "jay fai, 327 maha chai road. one chef, ski goggles on, doing the wok herself. michelin star in the very first bangkok guide. the crab omelette is the famous one",
      W + 'Jay_Fai'),
    # Singapore
    B('singapore-b1', 'Singapore', 'SG', 'Raffles Hotel', 1.29489, 103.85448, 'wikipedia', 'comic', 'en',
      "Raffles opened in 1887. The Singapore Sling was invented in its Long Bar by bartender Ngiam Tong Boon, and dropping peanut shells on the floor there is a tradition. Yes, on purpose.",
      W + 'Raffles_Hotel'),
    # New Delhi
    B('delhi-b1', 'New Delhi', 'IN', 'Indian Coffee House, Connaught Place', 28.6339, 77.21729, 'approx', 'history', 'en',
      "Indian Coffee House. In the 1950s the Coffee Board wanted to close its cafés, so the workers formed co-operatives and kept them running. Delhi's started on 27 December 1957.",
      W + 'Indian_Coffee_House'),
    # Hanoi
    B('hanoi-b1', 'Hanoi', 'VN', 'Café Giảng', 21.03398, 105.85365, 'approx', 'history', 'en',
      "café giảng is where egg coffee started, late 1940s. milk was hard to find so nguyễn giảng used egg yolk instead. that's how his son tells it anyway",
      W + 'Egg_coffee'),
    # Jakarta
    B('jakarta-b1', 'Jakarta', 'ID', 'Café Batavia', -6.13444, 106.81278, 'wikipedia', 'history', 'en',
      "Café Batavia's building dates from around the 1830s, the second oldest on Fatahillah Square after the old City Hall. Inside, the walls are full of photos of 1930s stars and royals.",
      W + 'Cafe_Batavia'),
    # Mexico City
    B('mexico-b1', 'Mexico City', 'MX', 'Casa de los Azulejos (Sanborns)', 19.43399, -99.14045, 'approx', 'history', 'en',
      "Casa de los Azulejos. In 1737 a countess had the whole palace covered in Puebla tiles. Sanborns moved in by 1918, and Orozco painted the 'Omniscience' mural inside in 1925.",
      W + 'Casa_de_los_Azulejos'),
    B('mexico-b2', 'Mexico City', 'MX', 'Café de Tacuba', 19.4357, -99.13763, 'marker', 'history', 'en',
      "café de tacuba was founded in 1912 by dionisio mollinedo. one of the oldest restaurants in mexico",
      "https://www.hmdb.org/m.asp?m=125292"),
    # Buenos Aires
    B('buenos-aires-b1', 'Buenos Aires', 'AR', 'Café Tortoni', -34.6087, -58.37875, 'approx', 'history', 'en',
      "Café Tortoni, since 1858. Borges had a regular table here (his wax figure is still sitting at it), and Gardel and Einstein both came through.",
      W + 'Caf%C3%A9_Tortoni'),
    B('buenos-aires-b2', 'Buenos Aires', 'AR', 'El Ateneo Grand Splendid', -34.59611, -58.39417, 'wikipedia', 'aesthetic', 'en',
      "This was a theatre in 1919. Since 2000 it's been a bookshop. The café sits on the old stage and people read in the theatre boxes.",
      W + 'El_Ateneo_Grand_Splendid'),
    # Bogotá
    B('bogota-b1', 'Bogotá', 'CO', 'La Puerta Falsa', 4.59777, -74.07524, 'approx', 'history', 'en',
      "La Puerta Falsa opened on 16 July 1816, right next to the cathedral. Colombia's oldest restaurant still running, famous for tamales and chocolate with cheese.",
      "https://larepublica.pe/mundo/2026/06/08/el-antiguo-restaurante-de-america-latina-deleita-con-tamales-y-chocolate-con-queso-desde-1816-y-habria-encantado-a-simon-bolivar-569064"),
    # Seoul
    B('seoul-b1', 'Seoul', 'KR', 'Myeongdong Kyoja', 37.5625, 126.9856, 'approx', 'history', 'en',
      "myeongdong kyoja opened in 1966 as jangsujang and got its current name in 1978. four dishes on the menu, michelin guide seoul since 2017",
      "https://www.tastekoreanfood.com/eatout/myeongdong-kyoja-seouls-michelin-kalguksu-since-1966"),
    # Ottawa
    B('ottawa-b1', 'Ottawa', 'CA', 'BeaverTails, ByWard Market', 45.42814, -75.69155, 'approx', 'history', 'en',
      "The first BeaverTails stand opened right here in the ByWard Market in 1980. Barack Obama stopped for one in February 2009, so naturally there's now an 'Obama Tail'.",
      W + 'BeaverTails'),
    # Washington, D.C.
    B('washington-b1', 'Washington, D.C.', 'US', 'Old Ebbitt Grill', 38.89784, -77.03328, 'approx', 'history', 'en',
      "Old Ebbitt Grill goes back to 1856 and calls itself Washington's oldest bar. Presidents Grant and Andrew Johnson ate here a lot.",
      W + 'Old_Ebbitt_Grill'),
    B('washington-b2', 'Washington, D.C.', 'US', "Ben's Chili Bowl", 38.9172, -77.0289, 'wikipedia', 'history', 'en',
      "Ben's Chili Bowl opened on 22 August 1958. In 1968 it stayed open past curfew and fed police, firefighters and activists alike.",
      W + 'Ben%27s_Chili_Bowl'),
    # Istanbul
    B('istanbul-b1', 'Istanbul', 'TR', 'Ali Muhiddin Hacı Bekir', 41.01559, 28.975, 'approx', 'history', 'tr',
      "Hacı Bekir Efendi Kastamonu Araç'tan gelip 1777'de Bahçekapı'da küçük bir dükkân açmış. Lokum İngilizcede 'Turkish delight' diye bilinir oldu, Hacı Bekir 1873 Viyana fuarında gümüş madalya almış.",
      "https://hacibekir.com/history"),
    B('istanbul-b2', 'Istanbul', 'TR', 'Kurukahveci Mehmet Efendi', 41.01653, 28.96985, 'approx', 'history', 'tr',
      "Kurukahveci Mehmet Efendi 1871'de kahveyi kavurup öğütüp paketleyerek satmaya başlamış, o zamanlar çoğu yerde çiğ çekirdek satılırmış. Dükkân 1932, mimarı Zühtü Başar. Kuyruk mu? O da gelenek.",
      "https://old.guiding-architects.net/art-deco-coffee-break-istanbul/"),
    B('istanbul-b3', 'Istanbul', 'TR', 'Pandeli', 41.01682, 28.97095, 'approx', 'useful', 'tr',
      "Pandeli Mısır Çarşısı girişinin hemen üstünde, 1660 tarihli binada, hikâyesi 1901'e uzanıyor. Mavi çiniler, girişte Audrey Hepburn fotoğrafı. Kapıyı kaçırmak çok kolay, dik taş merdiveni ara.",
      "https://www.milliyet.com.tr/yazarlar/aylin-oney-tan/pandelinin-mavi-cinileri-6620373"),
    B('istanbul-b4', 'Istanbul', 'TR', 'Vefa Bozacısı', 41.01562, 28.95893, 'approx', 'history', 'tr',
      "Vefa Bozacısı 1876'dan beri burada. Vitrinde Atatürk'ün boza içtiği bardak duruyor, mermer eşik ve ahşap tezgâh da eskisi gibi.",
      "https://istanbuleats.com/2009/10/vefa-boza-strange-brew/print/"),
    B('istanbul-b5', 'Istanbul', 'TR', 'Hacı Abdullah', 41.03528, 28.98028, 'wikipedia', 'history', 'tr',
      "Hacı Abdullah 1888'de Karaköy iskelesinde açılmış, ruhsatını II. Abdülhamid vermiş. Türkiye'nin resmi kayıtlı ilk lokantası sayılıyor. Kompostoları meşhur, 15-20 çeşit.",
      W + 'Hac%C4%B1_Abdullah_Restaurant'),
    B('istanbul-b6', 'Istanbul', 'TR', 'Pera Palace', 41.03157, 28.97424, 'approx', 'history', 'tr',
      "Pera Palace 1895'te Orient Express yolcuları için açılmış, İstanbul'un ilk elektrikli asansörü de buradaymış. Agatha Christie'nin odası hâlâ anı odası olarak duruyor.",
      W + 'Pera_Palace_Hotel'),
    B('istanbul-b7', 'Istanbul', 'TR', 'Baylan, Kadıköy', 40.98925, 29.02582, 'approx', 'comic', 'tr',
      "baylan 1923'te beyoğlu'nda 'loryan' adıyla açılmış, 1934'te baylan olmuş, kadıköy dükkânı 1961'den. kup griye'yi harry lenas, türklerin karamele düşkünlüğü yüzünden yaratmış. haklıymış",
      "https://www.mybeautifulistanbul.com/2019/07/03/baylan-the-oldest-surviving-pastry-shop-in-istanbul/"),
]


def nearby_seed_ids(business, items, capital_points):
    other_businesses = [item.id for item in items if item is not business
                        and distance(business.point, item.point) < MIN_SPACING_M]
    capitals = [name for name, point in capital_points if distance(business.point, point) < MIN_SPACING_M]
    return other_businesses + capitals


def business_item_problems(b):
    problems = []
    if len(b.text) > MAX_TEXT:
        problems.append(f'{b.id}: {len(b.text)} characters (limit {MAX_TEXT})')
    if URL.search(b.text):
        problems.append(f'{b.id}: looks like a link')
    if REVIEW_WORDS.search(b.text):
        problems.append(f'{b.id}: reads like a review ({REVIEW_WORDS.search(b.text).group(0)})')
    if b.type not in TYPES:
        problems.append(f'{b.id}: unknown type {b.type}')
    if b.coord not in ('wikipedia', 'marker', 'approx'):
        problems.append(f'{b.id}: unknown coord {b.coord}')
    if not b.source.startswith('https://'):
        problems.append(f'{b.id}: needs a source')
    if not (-90 <= b.lat <= 90 and -180 <= b.lng <= 180):
        problems.append(f'{b.id}: bad coordinates')
    return problems


def business_problems(items, capital_points):
    problems = []
    for b in items:
        problems += business_item_problems(b)
        near = nearby_seed_ids(b, items, capital_points)
        if near:
            problems.append(f'{b.id}: closer than {MIN_SPACING_M} m to {", ".join(near)}')
    ids = [b.id for b in items]
    if len(ids) != len(set(ids)):
        problems.append('duplicate ids')
    return problems


def build():
    with open(CAPITAL_SEEDS, encoding='utf-8') as f:
        capital_points = [(i['id'], (i['lat'], i['lng'])) for i in json.load(f)['items']]
    items = [{'id': b.id, 'kind': 'note', 'type': b.type, 'lang': b.lang, 'text': b.text, 'lat': b.lat, 'lng': b.lng,
              'radius_m': NOTE_RADIUS_M, 'notify': False, 'source': b.source, 'city': b.city, 'country': b.country,
              'place': b.place, 'coord': b.coord} for b in BUSINESSES]
    problems = business_problems(BUSINESSES, capital_points) + style_problems(items)
    return {'batch': BATCH, 'author_handle': AUTHOR_HANDLE, 'items': items}, problems


def main():
    data, problems = build()
    if problems:
        print('\n'.join(problems), file=sys.stderr)
        sys.exit(1)
    text = json.dumps(data, ensure_ascii=False, indent=1) + '\n'
    if '--check' in sys.argv:
        with open(OUT, encoding='utf-8') as f:
            if f.read() != text:
                print('landmark-businesses.json is out of date: run python3 scripts/seed/landmark_businesses.py', file=sys.stderr)
                sys.exit(1)
    else:
        with open(OUT, 'w', encoding='utf-8') as f:
            f.write(text)
    approx = sum(1 for i in data['items'] if i['coord'] == 'approx')
    cities = len({i['city'] for i in data['items']})
    print(f"{len(data['items'])} business notes in {cities} cities; {approx} placed from the address (approx)")


if __name__ == '__main__':
    main()

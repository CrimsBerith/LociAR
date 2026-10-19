#!/usr/bin/env python3
"""Launch seed: one location note at each of 52 well-known businesses in 33 cities (45 abroad, 7 in Istanbul).
Writes scripts/seed/landmark-businesses.json for admin/scripts/seed-notes.mjs (--seed landmark-businesses).
See docs/release/LAUNCH_SEED.md.

  python3 scripts/seed/landmark_businesses.py          # validate + write
  python3 scripts/seed/landmark_businesses.py --check  # validate + file up to date

Business notes are facts, never reviews: founding year, history and documented anecdotes, with the
business name (and its street where known) in the text. No taste, price, service or recommendation,
no notifications, and nothing about the tragedies some of these places lived through. Every note
carries its source. `coord: approx` marks an entrance placed from the address: check it on the admin
map before applying.
"""
import json
import os
import re
import sys
from dataclasses import dataclass
from typing import Optional, Tuple

from world_capitals import MAX_TEXT, MIN_SPACING_M, NOTE_RADIUS_M, TYPES, URL, distance

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
      "Fortnum & Mason, 181 Piccadilly, since 1707. On the hour, look up: above the door the founders, four feet tall, "
      "bow to each other. The shop also claims to have invented the Scotch egg in 1738.", W + 'Fortnum_%26_Mason'),
    B('london-b2', 'London', 'GB', 'Hatchards', 51.50898, -0.13951, 'approx', 'history', 'en',
      "Hatchards has sold books on Piccadilly since 1797 and calls itself the oldest bookshop in the UK. Oscar Wilde "
      "signed books at the ground-floor table now known as 'Oscar's table'.", W + 'Hatchards'),
    # Paris
    B('paris-b1', 'Paris', 'FR', "Fouquet's", 48.87139, 2.30139, 'wikipedia', 'history', 'en',
      "Fouquet's, 99 Champs-Élysées, founded in 1899 and a listed historic monument since 1990. Every year the dinner "
      "after France's César film awards is held here. Red carpet optional.", W + 'Fouquet%27s'),
    B('paris-b2', 'Paris', 'FR', 'Le Procope', 48.85305, 2.33890, 'approx', 'history', 'en',
      "Le Procope, 13 rue de l'Ancienne Comédie. A café opened here in 1686; Voltaire and Rousseau came, and Franklin "
      "and Jefferson met in it. The old café closed in 1872, today's restaurant opened in 1957.", W + 'Le_Procope'),
    # Madrid
    B('madrid-b1', 'Madrid', 'ES', 'Sobrino de Botín', 40.41417, -3.70806, 'wikipedia', 'history', 'en',
      "Botín, Calle de Cuchilleros 17. Guinness lists it as the world's oldest restaurant, and the flame in its oven "
      "is never allowed to go out. Historians still argue about the founding date; the oven doesn't care.",
      W + 'Sobrino_de_Bot%C3%ADn'),
    B('madrid-b2', 'Madrid', 'ES', 'Chocolatería San Ginés', 40.41691, -3.70664, 'approx', 'history', 'en',
      "Chocolatería San Ginés, Pasadizo de San Ginés 5, has served chocolate con churros since 1894. Galdós and "
      "Valle-Inclán both put it in their books.", W + 'Chocolater%C3%ADa_San_Gin%C3%A9s'),
    # Rome
    B('rome-b1', 'Rome', 'IT', "Babington's", 41.90602, 12.48238, 'wikipedia', 'history', 'en',
      "Babington's, Piazza di Spagna 23. Two young Englishwomen opened this tea room in 1893 with 100 pounds of "
      "savings. Its English-language sign stayed up through the Second World War.", W + 'Babington%27s_tea_room',
      note="Antico Caffè Greco was left out: it closed on 8 October 2025."),
    # Vienna
    B('vienna-b1', 'Vienna', 'AT', 'Café Central', 48.21028, 16.36528, 'wikipedia', 'history', 'en',
      "Café Central, Herrengasse 14, since 1876. In January 1913 Freud, Tito and Stalin were all customers here. Chess "
      "players called the first floor 'the chess school'.", W + 'Caf%C3%A9_Central'),
    B('vienna-b2', 'Vienna', 'AT', 'Demel', 48.20855, 16.36712, 'approx', 'history', 'en',
      "Demel, Kohlmarkt 14, confectioner to the Habsburg court from 1874. In 1954 Hotel Sacher sued it over the "
      "'Original Sacher-Torte'; since 1963 Demel's cake carries an 'Eduard-Sacher-Torte' seal. Cake diplomacy.",
      W + 'Demel'),
    # Prague
    B('prague-b1', 'Prague', 'CZ', 'U Fleků', 50.07889, 14.41722, 'wikipedia', 'history', 'en',
      "U Fleků, Křemencova 11, brewing since 1499 and called Prague's oldest brewery. Its dark 13° lager is brewed "
      "on site and sold nowhere else; the halls seat 1,200.", W + 'U_Flek%C5%AF'),
    B('prague-b2', 'Prague', 'CZ', 'Café Louvre', 50.08197, 14.41860, 'approx', 'history', 'en',
      "Café Louvre, Národní 22, opened in 1902. Franz Kafka, Albert Einstein and Karel Čapek are on its list of "
      "guests.", 'https://www.cafelouvre.cz/en/History'),
    # Budapest
    B('budapest-b1', 'Budapest', 'HU', 'Gerbeaud', 47.49642, 19.05032, 'approx', 'history', 'en',
      "Gerbeaud, Vörösmarty tér 7. Henrik Kugler started the business in 1858 and moved here in 1870, when the square "
      "was Gizella tér. In 1884 he invited a confectioner from Geneva, Emil Gerbeaud. The name stuck.",
      W + 'Caf%C3%A9_Gerbeaud'),
    B('budapest-b2', 'Budapest', 'HU', 'New York Café', 47.49842, 19.07059, 'approx', 'comic', 'en',
      "New York Café, Erzsébet körút 9–11, opened in 1894 in the New York Life Insurance building. Legend says writers "
      "threw its front-door key into the Danube so it could never close. The key is still missing.",
      'https://edition.cnn.com/travel/article/budapest-new-york-cafe'),
    # Lisbon
    B('lisbon-b1', 'Lisbon', 'PT', 'Livraria Bertrand', 38.7106389, -9.1411389, 'wikipedia', 'history', 'en',
      "Livraria Bertrand, Rua Garrett 73–75, has sold books since 1732. Guinness World Records calls it the oldest "
      "operating bookstore in the world.", W + 'Livraria_Bertrand'),
    B('lisbon-b2', 'Lisbon', 'PT', 'A Brasileira', 38.71070, -9.14226, 'approx', 'comic', 'en',
      "A Brasileira, Rua Garrett 120, opened on 19 November 1905. The bronze Fernando Pessoa outside (Lagoa Henriques, "
      "1988) has had the same terrace seat ever since and has never once ordered.", W + 'A_Brasileira'),
    # Athens
    B('athens-b1', 'Athens', 'GR', 'Brettos', 37.97176, 23.73128, 'approx', 'history', 'en',
      "Brettos in Plaka, founded by Michail Brettos in 1909, is Athens' oldest distillery. Its own ouzo and liqueurs "
      "follow recipes traced back to Smyrna; the wall of coloured bottles greets you first.",
      'https://www.theculturetrip.com/europe/greece/articles/why-you-should-visit-athens-oldest-distillery-brettos'),
    # Berlin
    B('berlin-b1', 'Berlin', 'DE', 'KaDeWe', 52.50156, 13.34133, 'approx', 'useful', 'en',
      "KaDeWe opened on 27 March 1907 and is called Europe's second-largest department store after Harrods, with over "
      "60,000 m² of shop floor. Pace yourself.", W + 'Kaufhaus_des_Westens'),
    B('berlin-b2', 'Berlin', 'DE', "Konnopke's Imbiss", 52.54056, 13.41250, 'approx', 'history', 'en',
      "Konnopke's Imbiss, Schönhauser Allee 44b. Max Konnopke started selling sausages in 1930 and opened this stand in "
      "1960; it is known as Berlin's oldest imbiss.", 'https://www.visitberlin.de/en/konnopke'),
    # Brussels
    B('brussels-b1', 'Brussels', 'BE', 'Neuhaus', 50.84757, 4.35472, 'approx', 'history', 'en',
      "Neuhaus began in these royal galleries in 1857 as an apothecary. In 1912 Jean Neuhaus invented the praline, and "
      "in 1915 he and his wife Louise Agostini created the ballotin box.", W + 'Neuhaus_(chocolatier)'),
    B('brussels-b2', 'Brussels', 'BE', 'Delirium Café', 50.8484083, 4.3539333, 'wikipedia', 'comic', 'en',
      "Delirium Café, Impasse de la Fidélité. In January 2004 Guinness recorded 2,004 beer brands on its list, a world "
      "record. Reading the menu counts as a hobby.", W + 'Delirium_Caf%C3%A9'),
    # Amsterdam
    B('amsterdam-b1', 'Amsterdam', 'NL', 'Café Hoppe', 52.36840, 4.88977, 'approx', 'useful', 'en',
      "Café Hoppe, Spui 18–20, open since 1670. Number 18 is the 'standing Hoppe': you drink on your feet and talk to "
      "whoever is next to you.",
      'https://www.amsterdamnow.com/en/going-out-entertainment/cafe-hoppe-on-the-spui-brown-pub-with-350-years-of-history/'),
    # Copenhagen
    B('copenhagen-b1', 'Copenhagen', 'DK', 'Tivoli Gardens', 55.67361, 12.56833, 'wikipedia', 'history', 'en',
      "Tivoli opened on 15 August 1843, the world's second-oldest operating amusement park. Its wooden coaster from "
      "1914 still carries an operator who brakes so it doesn't go too fast.", W + 'Tivoli_Gardens'),
    # Stockholm
    B('stockholm-b1', 'Stockholm', 'SE', 'Den Gyldene Freden', 59.32335, 18.07337, 'approx', 'history', 'en',
      "Den Gyldene Freden in Gamla stan opened in 1722, and the street around it has hardly changed since. Its early "
      "fame came from the songs of Carl Michael Bellman.", W + 'Den_Gyldene_Freden'),
    # Dublin
    B('dublin-b1', 'Dublin', 'IE', "Bewley's", 53.34142, -6.25988, 'approx', 'history', 'en',
      "Bewley's has been on Grafton Street since 1927. Its six Harry Clarke stained-glass windows belong to the "
      "building: the courts ruled in 2024, and again in 2026, that they cannot be sold off.", W + 'Bewley%27s'),
    B('dublin-b2', 'Dublin', 'IE', 'The Brazen Head', 53.34484, -6.27622, 'approx', 'comic', 'en',
      "The Brazen Head, 20 Lower Bridge Street, says it dates back to 1198. James Joyce mentions it in Ulysses. The walls "
      "know more stories than the menu.", 'https://www.dublinguide.ie/places/the-brazen-head/'),
    # Warsaw
    B('warsaw-b1', 'Warsaw', 'PL', 'E. Wedel', 52.23394, 21.01428, 'approx', 'history', 'en',
      "Karl Ernst Wedel founded his chocolate company in 1851, and in 1894 it moved its main factory to this street, "
      "Szpitalna. Ptasie Mleczko is still its flagship product.", W + 'E._Wedel'),
    # Belgrade
    B('belgrade-b1', 'Belgrade', 'RS', '? (Znak pitanja)', 44.81822, 20.45270, 'approx', 'comic', 'en',
      "This kafana is called '?'. In 1892 the owner wanted to name it 'By the Cathedral Church'; the church objected, so "
      "he hung a question mark on the door. It stuck. The building dates from 1823.", W + '%3F_(bistro)'),
    # Cairo
    B('cairo-b1', 'Cairo', 'EG', 'El Fishawy', 30.04785, 31.26170, 'approx', 'history', 'en',
      "El Fishawy, in Khan el-Khalili, opened in 1797 and is open 24 hours a day. Naguib Mahfouz was among the writers "
      "who came here.", W + 'El_Fishawy'),
    # Nairobi
    B('nairobi-b1', 'Nairobi', 'KE', 'Thorn Tree Café, Stanley Hotel', -1.28388, 36.82222, 'approx', 'talking', 'en',
      "Thorn Tree Café, Stanley Hotel (1902). Travellers pinned notes for each other to the thorns of an acacia here, "
      "and people still leave messages. Today's tree dates from 1997. You're doing the digital version.",
      W + 'Stanley_Hotel,_Nairobi'),
    # Tokyo
    B('tokyo-b1', 'Tokyo', 'JP', 'Shibuya 109', 35.65956, 139.69873, 'approx', 'useful', 'en',
      "Shibuya 109 opened in April 1979. The name is a pun: 10 is 'tō' and 9 is 'kyū', as in Tōkyū, and the numbers "
      "also matched its 10 a.m. to 9 p.m. hours.", W + 'Shibuya_109'),
    # Taipei
    B('taipei-b1', 'Taipei', 'TW', 'Din Tai Fung (Xinyi Road)', 25.03344, 121.52984, 'approx', 'history', 'en',
      "Din Tai Fung started on Xinyi Road in 1958 selling cooking oil. Around 1970 half the shop switched to "
      "xiaolongbao, folded 18 times each; by 1972 it was a full restaurant.", W + 'Din_Tai_Fung'),
    # Bangkok
    B('bangkok-b1', 'Bangkok', 'TH', 'Jay Fai', 13.75249, 100.50493, 'approx', 'history', 'en',
      "Jay Fai, 327 Maha Chai Road: one chef at the wok, ski goggles on. The kitchen earned a Michelin star in the "
      "first Bangkok guide, and the crab omelette is the famous dish.", W + 'Jay_Fai'),
    # Singapore
    B('singapore-b1', 'Singapore', 'SG', 'Raffles Hotel', 1.29489, 103.85448, 'wikipedia', 'comic', 'en',
      "Raffles Hotel opened in 1887. In its Long Bar, bartender Ngiam Tong Boon invented the Singapore Sling, and "
      "guests drop peanut shells on the floor on purpose.", W + 'Raffles_Hotel'),
    # New Delhi
    B('delhi-b1', 'New Delhi', 'IN', 'Indian Coffee House, Connaught Place', 28.63390, 77.21729, 'approx', 'history', 'en',
      "Indian Coffee House, Connaught Place. When the Coffee Board planned to close its cafés in the 1950s, the workers "
      "formed co-operatives and kept them running; Delhi's dates from 27 December 1957.",
      W + 'Indian_Coffee_House'),
    # Hanoi
    B('hanoi-b1', 'Hanoi', 'VN', 'Café Giảng', 21.03398, 105.85365, 'approx', 'history', 'en',
      "Café Giảng: egg coffee was born here in the late 1940s. Milk was scarce, so Nguyễn Giảng whisked in egg yolk "
      "instead, as his son tells it.", W + 'Egg_coffee'),
    # Jakarta
    B('jakarta-b1', 'Jakarta', 'ID', 'Café Batavia', -6.13444, 106.81278, 'wikipedia', 'history', 'en',
      "Café Batavia's building, from around the 1830s, is the second-oldest on Fatahillah Square after the old City "
      "Hall. Photos of 1930s celebrities and royalty line the main hall.", W + 'Cafe_Batavia'),
    # Mexico City
    B('mexico-b1', 'Mexico City', 'MX', 'Casa de los Azulejos (Sanborns)', 19.43399, -99.14045, 'approx', 'history', 'en',
      "Casa de los Azulejos: in 1737 a countess had this palace covered in Puebla tiles. Sanborns moved in by 1918, and "
      "Orozco painted the mural 'Omniscience' inside in 1925.", W + 'Casa_de_los_Azulejos'),
    B('mexico-b2', 'Mexico City', 'MX', 'Café de Tacuba', 19.43570, -99.13763, 'marker', 'history', 'en',
      "Café de Tacuba, on Calle de Tacuba, was founded in 1912 by Dionisio Mollinedo and is one of Mexico's oldest "
      "restaurants.", 'https://www.hmdb.org/m.asp?m=125292'),
    # Buenos Aires
    B('buenos-aires-b1', 'Buenos Aires', 'AR', 'Café Tortoni', -34.60870, -58.37875, 'approx', 'history', 'en',
      "Café Tortoni, Avenida de Mayo 825, since 1858. Borges had a regular table (his wax figure still sits there), and "
      "Gardel and Einstein are among its famous guests.", W + 'Caf%C3%A9_Tortoni'),
    B('buenos-aires-b2', 'Buenos Aires', 'AR', 'El Ateneo Grand Splendid', -34.59611, -58.39417, 'wikipedia', 'aesthetic', 'en',
      "El Ateneo Grand Splendid opened as a theatre in 1919 and became a bookshop in 2000. The café sits on the old "
      "stage, and readers sit in the theatre boxes.", W + 'El_Ateneo_Grand_Splendid'),
    # Bogotá
    B('bogota-b1', 'Bogotá', 'CO', 'La Puerta Falsa', 4.59777, -74.07524, 'approx', 'history', 'en',
      "La Puerta Falsa, beside the cathedral off Plaza de Bolívar, opened on 16 July 1816: Colombia's oldest "
      "restaurant in continuous operation, known for tamales and chocolate with cheese.",
      'https://larepublica.pe/mundo/2026/06/08/el-antiguo-restaurante-de-america-latina-deleita-con-tamales-y-chocolate-con-queso-desde-1816-y-habria-encantado-a-simon-bolivar-569064'),
    # Seoul
    B('seoul-b1', 'Seoul', 'KR', 'Myeongdong Kyoja', 37.56250, 126.98560, 'approx', 'history', 'en',
      "Myeongdong Kyoja opened in 1966 as Jangsujang and took its current name in 1978. The menu is four dishes long, "
      "and the Michelin Guide Seoul has listed it since 2017.",
      'https://www.tastekoreanfood.com/eatout/myeongdong-kyoja-seouls-michelin-kalguksu-since-1966'),
    # Ottawa
    B('ottawa-b1', 'Ottawa', 'CA', 'BeaverTails, ByWard Market', 45.42814, -75.69155, 'approx', 'history', 'en',
      "BeaverTails opened its first stand here in the ByWard Market in 1980. In February 2009 Barack Obama stopped for "
      "one, and the 'Obama Tail' was named after the visit.", W + 'BeaverTails'),
    # Washington
    B('washington-b1', 'Washington, D.C.', 'US', 'Old Ebbitt Grill', 38.89784, -77.03328, 'approx', 'history', 'en',
      "Old Ebbitt Grill, 675 15th Street NW, traces itself to 1856 and calls itself Washington's oldest bar. Presidents "
      "Grant and Andrew Johnson dined here often.", W + 'Old_Ebbitt_Grill'),
    B('washington-b2', 'Washington, D.C.', 'US', "Ben's Chili Bowl", 38.9172, -77.0289, 'wikipedia', 'history', 'en',
      "Ben's Chili Bowl, 1213 U Street, opened on 22 August 1958. In 1968 it stayed open past curfew and fed police, "
      "firefighters and activists alike.", W + 'Ben%27s_Chili_Bowl'),
    # Istanbul (Turkish)
    B('istanbul-b1', 'Istanbul', 'TR', 'Ali Muhiddin Hacı Bekir', 41.01559, 28.97500, 'approx', 'history', 'tr',
      "Hacı Bekir Efendi, Kastamonu Araç'tan gelip 1777'de Bahçekapı'da küçük bir dükkân açtı. Lokum İngilizcede "
      "'Turkish delight' diye tanındı; 1873 Viyana fuarında gümüş madalya aldı.", 'https://hacibekir.com/history'),
    B('istanbul-b2', 'Istanbul', 'TR', 'Kurukahveci Mehmet Efendi', 41.01653, 28.96985, 'approx', 'history', 'tr',
      "Kurukahveci Mehmet Efendi 1871'de kahveyi kavurup öğütüp paketleyerek satmaya başladı; o yıllarda çoğu yerde çiğ "
      "çekirdek satılırdı. Art Deco dükkân 1932, mimarı Zühtü Başar. Kuyruk da gelenek.",
      'https://old.guiding-architects.net/art-deco-coffee-break-istanbul/'),
    B('istanbul-b3', 'Istanbul', 'TR', 'Pandeli', 41.01682, 28.97095, 'approx', 'useful', 'tr',
      "Pandeli Mısır Çarşısı girişinin üst katında, 1660 tarihli binada; hikâyesi 1901'de başlar. Mavi çinili duvarlar, "
      "girişte Audrey Hepburn fotoğrafı. Kapıyı kaçırmak kolay: dik taş merdiveni ara.",
      'https://www.milliyet.com.tr/yazarlar/aylin-oney-tan/pandelinin-mavi-cinileri-6620373'),
    B('istanbul-b4', 'Istanbul', 'TR', 'Vefa Bozacısı', 41.01562, 28.95893, 'approx', 'history', 'tr',
      "Vefa Bozacısı 1876'dan beri burada. Vitrinde Atatürk'ün boza içtiği bardak duruyor. Mermer eşik ve ahşap tezgâh "
      "da eskisi gibi.", 'https://istanbuleats.com/2009/10/vefa-boza-strange-brew/print/'),
    B('istanbul-b5', 'Istanbul', 'TR', 'Hacı Abdullah', 41.03528, 28.98028, 'wikipedia', 'history', 'tr',
      "Hacı Abdullah 1888'de Karaköy iskelesinde açıldı; ruhsatını II. Abdülhamid verdi ve Türkiye'nin resmi kayıtlı "
      "ilk lokantası sayılır. 15–20 çeşit kompostosuyla bilinir.", W + 'Hac%C4%B1_Abdullah_Restaurant'),
    B('istanbul-b6', 'Istanbul', 'TR', 'Pera Palace', 41.03157, 28.97424, 'approx', 'history', 'tr',
      "Pera Palace 1895'te Orient Express yolcuları için açıldı ve İstanbul'un ilk elektrikli asansörü buradaydı. Agatha "
      "Christie'nin odası anı odası olarak korunuyor.", W + 'Pera_Palace_Hotel'),
    B('istanbul-b7', 'Istanbul', 'TR', 'Baylan, Kadıköy', 40.98925, 29.02582, 'approx', 'history', 'tr',
      "Baylan 1923'te Beyoğlu'nda Loryan adıyla doğdu, 1934'te Baylan oldu, Kadıköy dükkânı 1961'de açıldı. Kup Griye'yi "
      "Harry Lenas yarattı; karamele düşkünlüğümüz için.",
      'https://www.mybeautifulistanbul.com/2019/07/03/baylan-the-oldest-surviving-pastry-shop-in-istanbul/'),
]


def business_problems(items, capital_points):
    problems = []
    for b in items:
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
        near = [o.id for o in items if o is not b and distance(b.point, o.point) < MIN_SPACING_M]
        near += [c for c, p in capital_points if distance(b.point, p) < MIN_SPACING_M]
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
    return {'batch': BATCH, 'author_handle': AUTHOR_HANDLE, 'items': items}, business_problems(BUSINESSES, capital_points)


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
